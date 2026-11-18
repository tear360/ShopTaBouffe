package com.shoptabouffe.app.ui.screens.orders

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.shoptabouffe.app.core.Api
import com.shoptabouffe.app.core.ApiResult
import com.shoptabouffe.app.core.SocketManager
import com.shoptabouffe.app.core.models.Conversation
import com.shoptabouffe.app.core.models.Order
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class OrderDetailState(
    val loading: Boolean = true,
    val error: String? = null,
    val order: Order? = null,
    val conversationLoading: Boolean = false,
    val notice: String? = null,
)

class OrderDetailViewModel(app: Application) : AndroidViewModel(app) {

    private val _state = MutableStateFlow(OrderDetailState())
    val state: StateFlow<OrderDetailState> = _state.asStateFlow()

    private var loadedId: Long? = null
    private var unsubscribe: (() -> Unit)? = null
    private var unsubscribeDeleted: (() -> Unit)? = null

    fun load(orderId: Long, force: Boolean = false) {
        if (loadedId == orderId && _state.value.order != null && !force) return
        loadedId = orderId

        if (unsubscribe == null) {
            unsubscribe = SocketManager.on("order:updated") { payload ->
                val id = payload?.optLong("id", -1L) ?: -1L
                if (id == loadedId) refresh()
            }
            // Commande purgée après 2 h (terminée) : on l'affiche plus comme disponible.
            unsubscribeDeleted = SocketManager.on("order:deleted") { payload ->
                val id = payload?.optLong("id", -1L) ?: -1L
                if (id == loadedId) {
                    _state.value = _state.value.copy(
                        loading = false,
                        order = null,
                        error = "Commande expirée : elle est supprimée automatiquement 2 h après sa livraison.",
                    )
                }
            }
        }

        viewModelScope.launch {
            when (val result = Api.call { Api.service.order(orderId) }) {
                is ApiResult.Success -> _state.value = _state.value.copy(
                    loading = false,
                    error = null,
                    order = result.data,
                )

                is ApiResult.Failure -> _state.value = _state.value.copy(
                    loading = false,
                    error = result.message,
                )
            }
        }
    }

    /** Rechargement silencieux (socket ou action fournisseur). */
    fun refresh() {
        val id = loadedId ?: return
        viewModelScope.launch {
            when (val result = Api.call { Api.service.order(id) }) {
                is ApiResult.Success -> _state.value = _state.value.copy(order = result.data, error = null)
                else -> Unit
            }
        }
    }

    /** Récupère la conversation du client avec le fournisseur (créée à la volée côté serveur). */
    fun openConversation(onReady: (Long) -> Unit) {
        _state.value = _state.value.copy(conversationLoading = true)
        viewModelScope.launch {
            when (val result = Api.call { Api.service.conversations() }) {
                is ApiResult.Success -> {
                    val conversation: Conversation? = result.data.conversations.firstOrNull()
                    if (conversation == null) {
                        _state.value = _state.value.copy(
                            conversationLoading = false,
                            notice = "Aucune conversation disponible.",
                        )
                    } else {
                        _state.value = _state.value.copy(conversationLoading = false)
                        onReady(conversation.id)
                    }
                }

                is ApiResult.Failure -> _state.value = _state.value.copy(
                    conversationLoading = false,
                    notice = result.message,
                )
            }
        }
    }

    fun consumeNotice() {
        _state.value = _state.value.copy(notice = null)
    }

    override fun onCleared() {
        unsubscribe?.invoke()
        unsubscribeDeleted?.invoke()
        super.onCleared()
    }
}
