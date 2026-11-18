package com.shoptabouffe.app.ui.screens.admin

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.shoptabouffe.app.core.Api
import com.shoptabouffe.app.core.ApiResult
import com.shoptabouffe.app.core.SocketManager
import com.shoptabouffe.app.core.models.Conversation
import com.shoptabouffe.app.core.models.CreateProductBody
import com.shoptabouffe.app.core.models.Order
import com.shoptabouffe.app.core.models.Product
import com.shoptabouffe.app.core.models.StatusBody
import com.shoptabouffe.app.core.statusLabel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AdminState(
    val loading: Boolean = true,
    val error: String? = null,
    val tab: Int = 0,
    val orders: List<Order> = emptyList(),
    val products: List<Product> = emptyList(),
    val conversations: List<Conversation> = emptyList(),
    val statusFilter: String = "all",
    val busy: Boolean = false,
    val notice: String? = null,
    val editingProduct: Product? = null,
    val showProductDialog: Boolean = false,
    val confirmDelete: Product? = null,
) {
    val pendingCount: Int get() = orders.count { it.status == "pending" }

    val visibleOrders: List<Order>
        get() = orders.filter { order ->
            when (statusFilter) {
                "pending" -> order.status == "pending"
                "active" -> order.status in listOf("accepted", "preparing", "delivering")
                "done" -> order.status in listOf("delivered", "refused")
                else -> true
            }
        }

    val unreadTotal: Int get() = conversations.sumOf { it.unreadCount }
}

/** Espace fournisseur : commandes entrantes, catalogue, conversations clients. */
class AdminViewModel(app: Application) : AndroidViewModel(app) {

    private val _state = MutableStateFlow(AdminState())
    val state: StateFlow<AdminState> = _state.asStateFlow()

    private var unsubscribes: List<() -> Unit> = emptyList()

    init {
        loadAll()
        unsubscribes = listOfNotNull(
            SocketManager.on("order:new") { loadOrders(refreshing = true) },
            SocketManager.on("order:updated") { loadOrders(refreshing = true) },
            SocketManager.on("order:deleted") { loadOrders(refreshing = true) },
            SocketManager.on("product:changed") { loadProducts() },
            SocketManager.on("message:new") { loadConversations() },
            SocketManager.on("conversation:deleted") { loadConversations() },
        )
    }

    fun loadAll() {
        loadOrders()
        loadProducts()
        loadConversations()
    }

    fun loadOrders(refreshing: Boolean = false) {
        viewModelScope.launch {
            when (val result = Api.call { Api.service.allOrders() }) {
                is ApiResult.Success -> _state.update {
                    it.copy(
                        loading = false,
                        error = null,
                        orders = result.data.orders,
                    )
                }

                is ApiResult.Failure -> _state.update {
                    it.copy(loading = false, error = it.error ?: result.message)
                }
            }
            if (refreshing) _state.update { it.copy(busy = false) }
        }
    }

    fun loadProducts() {
        viewModelScope.launch {
            when (val result = Api.call { Api.service.products(available = null) }) {
                is ApiResult.Success -> _state.update { it.copy(products = result.data.products, error = null) }
                is ApiResult.Failure -> _state.update { it.copy(error = it.error ?: result.message) }
            }
        }
    }

    fun loadConversations() {
        viewModelScope.launch {
            when (val result = Api.call { Api.service.conversations() }) {
                is ApiResult.Success -> _state.update {
                    it.copy(conversations = result.data.conversations)
                }

                is ApiResult.Failure -> Unit
            }
        }
    }

    fun setTab(value: Int) = _state.update { it.copy(tab = value) }

    fun setStatusFilter(value: String) = _state.update { it.copy(statusFilter = value) }

    /* --------------------------------------------------------- commandes */

    fun updateStatus(orderId: Long, status: String) {
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            when (val result = Api.call { Api.service.updateOrderStatus(orderId, StatusBody(status)) }) {
                is ApiResult.Success -> {
                    _state.update { state ->
                        state.copy(
                            busy = false,
                            notice = "Commande #$orderId → ${status.statusLabel()}",
                            orders = state.orders.map { if (it.id == orderId) result.data else it },
                        )
                    }
                    loadOrders(refreshing = true)
                }

                is ApiResult.Failure -> _state.update {
                    it.copy(busy = false, notice = result.message)
                }
            }
        }
    }

    /** Conversation rattachée au client d'une commande (sinon 1er échange disponible). */
    fun chatFor(customerId: Long?, onReady: (Long) -> Unit) {
        val conversations = _state.value.conversations
        val match = conversations.firstOrNull { it.customer?.id == customerId }
        if (match != null) {
            onReady(match.id)
            return
        }
        viewModelScope.launch {
            when (val result = Api.call { Api.service.conversations() }) {
                is ApiResult.Success -> {
                    _state.update { it.copy(conversations = result.data.conversations) }
                    val found = result.data.conversations.firstOrNull { it.customer?.id == customerId }
                    if (found != null) onReady(found.id)
                    else _state.update { it.copy(notice = "Aucune conversation avec ce client.") }
                }

                is ApiResult.Failure -> _state.update { it.copy(notice = result.message) }
            }
        }
    }

    /* --------------------------------------------------------- produits */

    fun openProductDialog(product: Product?) = _state.update {
        it.copy(showProductDialog = true, editingProduct = product)
    }

    fun closeProductDialog() = _state.update {
        it.copy(showProductDialog = false, editingProduct = null)
    }

    fun askDelete(product: Product) = _state.update { it.copy(confirmDelete = product) }

    fun cancelDelete() = _state.update { it.copy(confirmDelete = null) }

    fun saveProduct(body: CreateProductBody) {
        val existing = _state.value.editingProduct
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            val result = if (existing == null) {
                Api.call { Api.service.createProduct(body) }
            } else {
                Api.call { Api.service.updateProduct(existing.id, body) }
            }
            when (result) {
                is ApiResult.Success -> {
                    _state.update {
                        it.copy(
                            busy = false,
                            showProductDialog = false,
                            editingProduct = null,
                            notice = if (existing == null) "Produit ajouté." else "Produit modifié.",
                        )
                    }
                    loadProducts()
                }

                is ApiResult.Failure -> _state.update {
                    it.copy(busy = false, notice = result.message)
                }
            }
        }
    }

    fun deleteProduct(product: Product) {
        _state.update { it.copy(busy = true, confirmDelete = null) }
        viewModelScope.launch {
            when (val result = Api.call { Api.service.deleteProduct(product.id) }) {
                is ApiResult.Success -> {
                    _state.update {
                        it.copy(busy = false, notice = "« ${product.name} » supprimé.")
                    }
                    loadProducts()
                }

                is ApiResult.Failure -> _state.update { it.copy(busy = false, notice = result.message) }
            }
        }
    }

    fun consumeNotice() = _state.update { it.copy(notice = null) }

    override fun onCleared() {
        unsubscribes.forEach { it.invoke() }
        super.onCleared()
    }
}
