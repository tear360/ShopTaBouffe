package com.shoptabouffe.app.core

import android.util.Log
import io.socket.client.Ack
import io.socket.client.IO
import io.socket.client.Socket
import io.socket.emitter.Emitter
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CopyOnWriteArraySet
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject

/**
 * Pont Socket.IO : connexion unique, rooms rejouées à chaque reconnexion,
 * et bus d'événements découplé des écrans (les ViewModels s'abonnent/Se désabonnent).
 */
object SocketManager {

    private const val TAG = "ShopTaBouffe"

    /** Événements temps réel du contrat (docs/API.md §6). */
    private val EVENTS = listOf(
        "message:new",
        "order:new",
        "order:updated",
        "product:changed",
    )

    private val handlers = CopyOnWriteArrayList<Pair<String, (JSONObject?) -> Unit>>()
    private val joinedConversations = CopyOnWriteArraySet<Long>()
    private var watchingOrders = false

    private val _connected = MutableStateFlow(false)
    val connected: StateFlow<Boolean> = _connected.asStateFlow()

    @Volatile
    private var socket: Socket? = null

    @Volatile
    private var boundToken: String? = null

    /** Abonne un handler ; retourne la fonction de désabonnement. */
    fun on(event: String, handler: (JSONObject?) -> Unit): () -> Unit {
        val entry = event to handler
        handlers.add(entry)
        return { handlers.remove(entry) }
    }

    fun connect() {
        val token = Session.current?.token ?: return
        val existing = socket
        if (existing != null && boundToken == token) {
            if (!_connected.value) existing.connect()
            return
        }

        existing?.let {
            it.off()
            it.disconnect()
        }
        _connected.value = false
        boundToken = token

        val options = IO.Options().apply {
            reconnection = true
            auth = mapOf("token" to token)
        }

        val created = IO.socket(Config.HOST, options)

        created.on(Socket.EVENT_CONNECT) {
            Log.i(TAG, "connecté à ${Config.HOST}")
            _connected.value = true
            joinedConversations.forEach { id -> emitJoin(created, id) }
            if (watchingOrders) emitWatchOrders(created)
        }
        created.on(Socket.EVENT_DISCONNECT) {
            Log.i(TAG, "déconnecté")
            _connected.value = false
        }
        created.on(Socket.EVENT_CONNECT_ERROR) { args ->
            _connected.value = false
            Log.w(TAG, "erreur de connexion : ${args.firstOrNull()}")
        }

        EVENTS.forEach { event ->
            created.on(event) { args ->
                val payload = args.firstOrNull() as? JSONObject
                dispatch(event, payload)
            }
        }

        socket = created
        created.connect()
    }

    /** Suivre une conversation (room `conv:<id>`, re-émise après reconnexion). */
    fun joinConversation(conversationId: Long) {
        if (conversationId <= 0) return
        joinedConversations.add(conversationId)
        socket?.let { emitJoin(it, conversationId) }
    }

    /** Supplier : rejoindre la room des commandes entrantes. */
    fun watchOrders() {
        watchingOrders = true
        socket?.let { emitWatchOrders(it) }
    }

    fun disconnect() {
        joinedConversations.clear()
        watchingOrders = false
        _connected.value = false
        boundToken = null
        socket?.let {
            it.off()
            it.disconnect()
        }
        socket = null
    }

    private fun emitJoin(target: Socket, conversationId: Long) {
        val payload = JSONObject().put("conversationId", conversationId)
        target.emit("conversation:join", payload, AckListener("conversation:$conversationId"))
    }

    private fun emitWatchOrders(target: Socket) {
        target.emit("watch:orders", AckListener("watch:orders"))
    }

    private fun dispatch(event: String, payload: JSONObject?) {
        handlers.forEach { (name, handler) ->
            if (name == event) {
                try {
                    handler(payload)
                } catch (e: Exception) {
                    Log.e(TAG, "handler $event a échoué", e)
                }
            }
        }
    }

    /** Ack vide : le serveur peut répondre `joined`/`error`, on n'en a pas besoin ici. */
    private class AckListener(private val label: String) : Ack {
        override fun call(vararg args: Any?) {
            Log.d(TAG, "ack $label -> ${args.joinToString()}")
        }
    }
}
