package com.shoptabouffe.app.ui.screens.chat

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.shoptabouffe.app.core.Api
import com.shoptabouffe.app.core.ApiResult
import com.shoptabouffe.app.core.SocketManager
import com.shoptabouffe.app.core.models.Conversation
import com.shoptabouffe.app.core.models.Message
import com.shoptabouffe.app.core.models.MessageBody
import com.google.gson.Gson
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ChatState(
    val loading: Boolean = true,
    val error: String? = null,
    val conversation: Conversation? = null,
    val messages: List<Message> = emptyList(),
    val sending: Boolean = false,
)

class ChatViewModel(app: Application) : AndroidViewModel(app) {

    private val gson = Gson()

    private val _state = MutableStateFlow(ChatState())
    val state: StateFlow<ChatState> = _state.asStateFlow()

    private var conversationId: Long? = null
    private var unsubscribe: (() -> Unit)? = null
    private var unsubscribeDeleted: (() -> Unit)? = null

    fun open(id: Long) {
        if (conversationId == id && _state.value.conversation != null) return
        conversationId = id

        if (unsubscribe == null) {
            unsubscribe = SocketManager.on("message:new") { payload ->
                val incoming = payload?.toString()?.let {
                    runCatching { gson.fromJson(it, Message::class.java) }.getOrNull()
                } ?: return@on
                if (incoming.conversationId != conversationId) return@on

                val known = _state.value.messages.any { it.id == incoming.id }
                if (!known) {
                    val current = _state.value
                    _state.value = current.copy(messages = current.messages + incoming)
                    // l'utilisateur est sur l'écran : on accuse réception
                    markRead()
                }
            }
            // Fil supprimé (commande terminée purgée après 2 h) : on le signale à l'utilisateur.
            unsubscribeDeleted = SocketManager.on("conversation:deleted") { payload ->
                val id = payload?.optLong("conversationId", -1L) ?: -1L
                if (id == conversationId) {
                    _state.value = _state.value.copy(
                        loading = false,
                        error = "Cette discussion a été supprimée (commande terminée).",
                    )
                }
            }
        }

        SocketManager.joinConversation(id)
        load()
    }

    fun load() {
        val id = conversationId ?: return
        viewModelScope.launch {
            when (val result = Api.call { Api.service.messages(id) }) {
                is ApiResult.Success -> {
                    val conversationResult = Api.call { Api.service.conversations() }
                    val conversation = (conversationResult as? ApiResult.Success)
                        ?.data?.conversations?.firstOrNull { it.id == id }
                    _state.value = _state.value.copy(
                        loading = false,
                        error = null,
                        messages = result.data.messages,
                        conversation = conversation,
                    )
                    markRead()
                }

                is ApiResult.Failure -> _state.value = _state.value.copy(
                    loading = false,
                    error = result.message,
                )
            }
        }
    }

    fun send(body: String) {
        val id = conversationId ?: return
        val text = body.trim()
        if (text.isEmpty() || _state.value.sending) return

        _state.value = _state.value.copy(sending = true)
        viewModelScope.launch {
            when (val result = Api.call { Api.service.sendMessage(id, MessageBody(text)) }) {
                is ApiResult.Success -> {
                    val current = _state.value
                    val exists = current.messages.any { it.id == result.data.id }
                    _state.value = current.copy(
                        sending = false,
                        messages = if (exists) current.messages else current.messages + result.data,
                    )
                }

                is ApiResult.Failure -> _state.value = _state.value.copy(
                    sending = false,
                    error = result.message,
                )
            }
        }
    }

    fun markRead() {
        val id = conversationId ?: return
        viewModelScope.launch {
            Api.call { Api.service.markRead(id) }
        }
    }

    fun consumeError() {
        _state.value = _state.value.copy(error = null)
    }

    override fun onCleared() {
        unsubscribe?.invoke()
        unsubscribeDeleted?.invoke()
        super.onCleared()
    }
}
