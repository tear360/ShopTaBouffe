package com.shoptabouffe.app.ui.screens.orders

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.shoptabouffe.app.core.Api
import com.shoptabouffe.app.core.ApiResult
import com.shoptabouffe.app.core.SocketManager
import com.shoptabouffe.app.core.models.Order
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class OrdersState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: String? = null,
    val orders: List<Order> = emptyList(),
    val filter: String = "all",
) {
    val visible: List<Order>
        get() = orders.filter { order ->
            when (filter) {
                "pending" -> order.status == "pending"
                "active" -> order.status in listOf("accepted", "preparing", "delivering")
                "done" -> order.status in listOf("delivered", "refused")
                else -> true
            }
        }
}

/** Liste des commandes du client connecté (mise à jour en temps réel). */
class OrdersViewModel(app: Application) : AndroidViewModel(app) {

    private val _state = MutableStateFlow(OrdersState())
    val state: StateFlow<OrdersState> = _state.asStateFlow()

    private var unsubscribeUpdated: (() -> Unit)? = null

    init {
        load()
        unsubscribeUpdated = SocketManager.on("order:updated") { load(refreshing = true) }
    }

    fun load(refreshing: Boolean = false) {
        if (refreshing) _state.update { it.copy(refreshing = true) }
        else if (_state.value.orders.isEmpty()) _state.update { it.copy(loading = true) }

        viewModelScope.launch {
            when (val result = Api.call { Api.service.myOrders() }) {
                is ApiResult.Success -> _state.update {
                    it.copy(
                        loading = false,
                        refreshing = false,
                        error = null,
                        orders = result.data.orders,
                    )
                }

                is ApiResult.Failure -> _state.update {
                    it.copy(loading = false, refreshing = false, error = result.message)
                }
            }
        }
    }

    fun setFilter(value: String) = _state.update { it.copy(filter = value) }

    override fun onCleared() {
        unsubscribeUpdated?.invoke()
        super.onCleared()
    }
}
