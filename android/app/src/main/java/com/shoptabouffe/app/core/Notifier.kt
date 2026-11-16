package com.shoptabouffe.app.core

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.gson.Gson
import com.shoptabouffe.app.R
import com.shoptabouffe.app.core.models.Order
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject

/**
 * Notifications locales de l'app, pilotées par les événements temps réel :
 *
 *  - **Nouvelles commandes** (fournisseur) : event `order:new`, émis uniquement dans la
 *    room `admin`, donc reçu uniquement par les comptes fournisseur.
 *  - **Suivi de mes commandes** (client) : event `order:updated` portant `mine=true`
 *    (émission dans la room `user:<id>`), seulement si le statut a réellement changé.
 *
 * Les deux interrupteurs sont persistés dans les SharedPreferences et exposés en StateFlow
 * pour que l'écran Profil (Paramètres) les affiche instantanément.
 */
object Notifier {

    private const val CHANNEL_ID = "commandes"
    private const val PREFS = "shoptabouffe_settings"
    private const val KEY_NEW_ORDERS = "notify_new_orders"
    private const val KEY_ORDER_STATUS = "notify_order_status"

    private val gson = Gson()
    private var appContext: Context? = null
    private var nextId = 1000

    private val _newOrders = MutableStateFlow(true)
    /** Interrupteur « Nouvelles commandes » (fournisseur). */
    val newOrders: StateFlow<Boolean> = _newOrders.asStateFlow()

    private val _orderStatus = MutableStateFlow(true)
    /** Interrupteur « Suivi de mes commandes » (client). */
    val orderStatus: StateFlow<Boolean> = _orderStatus.asStateFlow()

    fun init(context: Context) {
        val ctx = context.applicationContext
        appContext = ctx
        val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        _newOrders.value = prefs.getBoolean(KEY_NEW_ORDERS, true)
        _orderStatus.value = prefs.getBoolean(KEY_ORDER_STATUS, true)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Commandes",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Nouvelles commandes reçues et suivi des commandes"
                setShowBadge(true)
            }
            ctx.getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
        }
    }

    fun setNewOrdersEnabled(enabled: Boolean) = persist(KEY_NEW_ORDERS, enabled, _newOrders)

    fun setOrderStatusEnabled(enabled: Boolean) = persist(KEY_ORDER_STATUS, enabled, _orderStatus)

    private fun persist(key: String, value: Boolean, flow: MutableStateFlow<Boolean>) {
        flow.value = value
        appContext
            ?.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            ?.edit()
            ?.putBoolean(key, value)
            ?.apply()
    }

    /** Permission Android 13+ accordée (et notifications non désactivées globalement). */
    fun canNotify(context: Context): Boolean {
        val granted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        return granted && NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    /**
     * Point d'entrée unique branché sur le bus Socket.IO ([com.shoptabouffe.app.ShopTaBouffeApp]).
     * Aucune notification si l'événement ne concerne pas l'utilisateur ou si l'interrupteur est OFF.
     */
    fun onSocketEvent(event: String, payload: JSONObject?) {
        val ctx = appContext ?: return
        if (payload == null) return
        when (event) {
            "order:new" -> onNewOrder(ctx, payload)
            "order:updated" -> onOrderUpdated(ctx, payload)
        }
    }

    /** Nouvelle commande : uniquement si l'interrupteur fournisseur est activé. */
    private fun onNewOrder(ctx: Context, payload: JSONObject) {
        if (!_newOrders.value || !canNotify(ctx)) return
        val order = parse(payload) ?: return
        val count = order.itemCount
        val summary = "$count article" + (if (count > 1) "s" else "") + " · " + order.totalCents.toPrice()
        val customer = order.customer?.name
        val text = if (customer.isNullOrBlank()) summary else "De $customer — $summary"
        val items = order.items.joinToString("\n") { "• ${it.qty} × ${it.name}" }
        notify(
            ctx,
            title = "Nouvelle commande #${order.id}",
            text = text,
            bigText = listOf(text, items).filter { it.isNotBlank() }.joinToString("\n"),
        )
    }

    /**
     * Évolution de statut : uniquement pour MES commandes (`mine=true`), et seulement
     * si le statut diffère de la dernière valeur connue (la première observation pose une
     * base de comparaison sans notifier, sinon la création de commande déclencherait une notif).
     */
    private fun onOrderUpdated(ctx: Context, payload: JSONObject) {
        if (!payload.optBoolean("mine", false)) return
        if (!_orderStatus.value || !canNotify(ctx)) return
        val order = parse(payload) ?: return
        val statuses = readStatuses()
        val previous = statuses[order.id]
        statuses[order.id] = order.status
        writeStatuses(statuses)
        if (previous == null || previous == order.status) return
        notify(
            ctx,
            title = "Commande #${order.id}",
            text = "Statut : ${order.status.statusLabel()}",
            bigText = "Votre commande #${order.id} est maintenant « ${order.status.statusLabel()} ».",
        )
    }

    private fun parse(payload: JSONObject): Order? = try {
        gson.fromJson(payload.toString(), Order::class.java)
    } catch (_: Exception) {
        null
    }

    private fun notify(ctx: Context, title: String, text: String, bigText: String) {
        if (!canNotify(ctx)) return
        val notification = NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(ContextCompat.getColor(ctx, R.color.primary))
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(bigText))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_EVENT)
            .setAutoCancel(true)
            .build()
        try {
            NotificationManagerCompat.from(ctx).notify(nextId++, notification)
        } catch (_: SecurityException) {
            // permission révoquée entre-temps : rien à faire
        }
    }

    /** Derniers statuts connus de MES commandes : "12:pending,13:paid". */
    private fun readStatuses(): MutableMap<Long, String> {
        val raw = appContext
            ?.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            ?.getString("my_order_statuses", "")
            .orEmpty()
        val statuses = mutableMapOf<Long, String>()
        for (chunk in raw.split(',')) {
            if (chunk.isBlank()) continue
            val parts = chunk.split(':')
            val id = parts.getOrNull(0)?.toLongOrNull() ?: continue
            val status = parts.getOrNull(1) ?: continue
            statuses[id] = status
        }
        return statuses
    }

    private fun writeStatuses(statuses: Map<Long, String>) {
        val raw = statuses.entries.joinToString(",") { "${it.key}:${it.value}" }
        appContext
            ?.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            ?.edit()
            ?.putString("my_order_statuses", raw)
            ?.apply()
    }
}
