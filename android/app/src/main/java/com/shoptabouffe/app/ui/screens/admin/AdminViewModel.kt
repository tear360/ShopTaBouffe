package com.shoptabouffe.app.ui.screens.admin

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.shoptabouffe.app.core.Api
import com.shoptabouffe.app.core.ApiResult
import com.shoptabouffe.app.core.Cart
import com.shoptabouffe.app.core.ShopState
import com.shoptabouffe.app.core.SocketManager
import com.shoptabouffe.app.core.isoToEpochMillis
import com.shoptabouffe.app.core.localDateTimeToIso
import com.shoptabouffe.app.core.models.Conversation
import com.shoptabouffe.app.core.models.Category
import com.shoptabouffe.app.core.models.CategoryBody
import com.shoptabouffe.app.core.models.CreateFormuleBody
import com.shoptabouffe.app.core.models.CreateFormuleLine
import com.shoptabouffe.app.core.models.CreateProductBody
import com.shoptabouffe.app.core.models.Order
import com.shoptabouffe.app.core.models.Product
import com.shoptabouffe.app.core.models.SetDiscountBody
import com.shoptabouffe.app.core.models.ShopStatus
import com.shoptabouffe.app.core.models.StatusBody
import com.shoptabouffe.app.core.eurosToCents
import com.shoptabouffe.app.core.toLocalDateTimeLabel
import com.shoptabouffe.app.core.statusLabel
import com.shoptabouffe.app.core.toPrice
import com.shoptabouffe.app.core.toPriceInput
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AdminState(
    val loading: Boolean = true,
    val error: String? = null,
    val tab: Int = 0,
    val orders: List<Order> = emptyList(),
    val products: List<Product> = emptyList(),
    /** Produits simples (non-formule) disponibles comme ingrédients d'une formule. */
    val formuleProducts: List<Product> = emptyList(),
    val conversations: List<Conversation> = emptyList(),
    val categories: List<Category> = emptyList(),
    val statusFilter: String = "all",
    val busy: Boolean = false,
    val notice: String? = null,
    val editingProduct: Product? = null,
    val showProductDialog: Boolean = false,
    val showCreateDialog: Boolean = false,
    val showFormuleDialog: Boolean = false,
    val editingFormule: Product? = null,
    val showCategoriesDialog: Boolean = false,
    val confirmDelete: Product? = null,
    /** Dialogue de remise temporaire (produit ou formule). */
    val discountProduct: Product? = null,
    val discountPrice: String = "",
    val discountHours: String = "24",
    val discountError: String? = null,
    /** Statut global de la boutique, répliqué ici pour l'onglet « Boutique ». */
    val shopStatus: ShopStatus = ShopStatus(),
    val shopReopenAt: String = "",
    val shopBusy: Boolean = false,
    val shopError: String? = null,
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
        loadCategories()
        unsubscribes = listOfNotNull(
            SocketManager.on("order:new") { loadOrders(refreshing = true) },
            SocketManager.on("order:updated") { loadOrders(refreshing = true) },
            SocketManager.on("order:deleted") { loadOrders(refreshing = true) },
            SocketManager.on("product:changed") { loadProducts() },
            SocketManager.on("message:new") { loadConversations() },
            SocketManager.on("conversation:deleted") { loadConversations() },
            SocketManager.on("categories:changed") { loadCategories() },
        )
        viewModelScope.launch {
            ShopState.status.collect { status -> _state.update { it.copy(shopStatus = status) } }
        }
        ShopState.refresh()
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
                is ApiResult.Success -> _state.update {
                    it.copy(
                        products = result.data.products,
                        formuleProducts = result.data.products.filter { p -> !p.isFormule && p.available },
                        error = null,
                    )
                }

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

    /* ----------------------------------------------------------- boutique */

    fun setShopReopenAt(value: String) = _state.update {
        it.copy(shopReopenAt = value, shopError = null)
    }

    /** POST /shop/close — saisie locale « AAAA-MM-JJ HH:mm », convertie en ISO UTC. */
    fun closeShop() {
        val iso = _state.value.shopReopenAt.localDateTimeToIso()
        val instant = iso.isoToEpochMillis()
        val error = when {
            iso == null -> "Saisissez une date/heure au format AAAA-MM-JJ HH:mm."
            instant == null -> "Cette date/heure est invalide."
            instant <= System.currentTimeMillis() -> "La réouverture doit être dans le futur."
            else -> null
        }
        if (error != null) {
            _state.update { it.copy(shopError = error) }
            return
        }
        val reopensAt = iso ?: return
        _state.update { it.copy(shopBusy = true, shopError = null) }
        viewModelScope.launch {
            when (val result = ShopState.close(reopensAt)) {
                is ApiResult.Success -> {
                    _state.update {
                        it.copy(
                            shopBusy = false,
                            shopError = null,
                            notice = "Boutique fermée jusqu'au ${reopensAt.toLocalDateTimeLabel()}.",
                        )
                    }
                    ShopState.refresh()
                }

                is ApiResult.Failure -> _state.update {
                    it.copy(shopBusy = false, shopError = result.message, notice = result.message)
                }
            }
        }
    }

    /** POST /shop/open — réouverture immédiate. */
    fun openShop() {
        _state.update { it.copy(shopBusy = true, shopError = null) }
        viewModelScope.launch {
            when (val result = ShopState.open()) {
                is ApiResult.Success -> {
                    _state.update {
                        it.copy(shopBusy = false, shopError = null, notice = "Boutique rouverte.")
                    }
                    ShopState.refresh()
                }

                is ApiResult.Failure -> _state.update {
                    it.copy(shopBusy = false, shopError = result.message, notice = result.message)
                }
            }
        }
    }

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

    fun openCreateDialog() = _state.update { it.copy(showCreateDialog = true) }

    fun closeCreateDialog() = _state.update { it.copy(showCreateDialog = false) }

    fun openProductDialog(product: Product?) = _state.update {
        it.copy(showProductDialog = true, editingProduct = product)
    }

    fun closeProductDialog() = _state.update {
        it.copy(showProductDialog = false, editingProduct = null)
    }

    fun openFormuleDialog(formule: Product?) = _state.update {
        it.copy(showFormuleDialog = true, editingFormule = formule)
    }

    fun closeFormuleDialog() = _state.update {
        it.copy(showFormuleDialog = false, editingFormule = null)
    }

    /** Ouvre le bon formulaire selon le type de la fiche (produit ou formule). */
    fun openEditor(item: Product) {
        if (item.isFormule) openFormuleDialog(item) else openProductDialog(item)
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

    /** Le coût d'une formule est calculé serveur : on n'envoie que sa composition. */
    fun saveFormule(body: CreateFormuleBody) {
        val existing = _state.value.editingFormule
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            val result = if (existing == null) {
                Api.call { Api.service.createFormule(body) }
            } else {
                Api.call { Api.service.updateFormule(existing.id, body) }
            }
            when (result) {
                is ApiResult.Success -> {
                    _state.update {
                        it.copy(
                            busy = false,
                            showFormuleDialog = false,
                            editingFormule = null,
                            notice = if (existing == null) "Formule ajoutée." else "Formule modifiée.",
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

    /** Bascule de disponibilité : PATCH /products ou /formules selon le type. */
    fun setAvailability(product: Product, available: Boolean) {
        if (product.isFormule) {
            saveFormule(formuleBody(product, available))
        } else {
            saveProduct(
                CreateProductBody(
                    name = product.name,
                    description = product.description,
                    priceCents = product.priceCents,
                    costCents = product.costCents,
                    category = product.category,
                    imageUrl = product.imageUrl,
                    available = available,
                ),
            )
        }
    }

    private fun formuleBody(product: Product, available: Boolean = product.available) =
        CreateFormuleBody(
            name = product.name,
            description = product.description,
            priceCents = product.priceCents,
            category = product.category,
            imageUrl = product.imageUrl,
            available = available,
            items = product.items.map { CreateFormuleLine(it.productId, it.qty) },
        )

    /* ------------------------------------------------- remise temporaire */

    fun openDiscountDialog(product: Product) = _state.update {
        it.copy(
            discountProduct = product,
            discountPrice = (product.discountPriceCents ?: (product.priceCents * 0.9).toInt())
                .toPriceInput(),
            discountHours = "24",
            discountError = null,
        )
    }

    fun setDiscountPrice(value: String) = _state.update {
        it.copy(discountPrice = value, discountError = null)
    }

    fun setDiscountHours(value: String) = _state.update {
        it.copy(discountHours = value, discountError = null)
    }

    fun closeDiscountDialog() = _state.update {
        it.copy(discountProduct = null, discountError = null)
    }

    /** POST /products/{id}/discount — validation locale avant appel réseau. */
    fun setDiscount() {
        val current = _state.value
        val product = current.discountProduct ?: return
        val parsedPrice = current.discountPrice.eurosToCents()
        val parsedHours = current.discountHours.trim().toIntOrNull()
        val error = when {
            parsedPrice == null -> "Saisissez un prix remisé valide."
            parsedPrice <= 0 || parsedPrice >= product.priceCents ->
                "Le prix remisé doit être > 0 et inférieur à ${product.priceCents.toPrice()}."
            parsedHours == null || parsedHours !in 1..168 ->
                "La durée doit être comprise entre 1 et 168 heures."
            else -> null
        }
        if (error != null) {
            _state.update { it.copy(discountError = error) }
            return
        }
        val priceCents = parsedPrice ?: return
        val hours = parsedHours ?: return

        _state.update { it.copy(busy = true, discountError = null) }
        viewModelScope.launch {
            when (
                val result = Api.call {
                    Api.service.setDiscount(product.id, SetDiscountBody(priceCents, hours))
                }
            ) {
                is ApiResult.Success -> {
                    Cart.sync(result.data)
                    _state.update {
                        it.copy(
                            busy = false,
                            discountProduct = null,
                            discountError = null,
                            notice = "Remise appliquée à « ${product.name} » · $hours h.",
                        )
                    }
                    loadProducts()
                }

                is ApiResult.Failure -> _state.update {
                    it.copy(busy = false, discountError = result.message)
                }
            }
        }
    }

    /** DELETE /products/{id}/discount — retire la remise active. */
    fun clearDiscount() {
        val product = _state.value.discountProduct ?: return
        _state.update { it.copy(busy = true, discountError = null) }
        viewModelScope.launch {
            when (val result = Api.call { Api.service.clearDiscount(product.id) }) {
                is ApiResult.Success -> {
                    Cart.sync(result.data)
                    _state.update {
                        it.copy(
                            busy = false,
                            discountProduct = null,
                            discountError = null,
                            notice = "Remise retirée de « ${product.name} ».",
                        )
                    }
                    loadProducts()
                }

                is ApiResult.Failure -> _state.update {
                    it.copy(busy = false, discountError = result.message)
                }
            }
        }
    }

    fun deleteProduct(product: Product) {
        _state.update { it.copy(busy = true, confirmDelete = null) }
        viewModelScope.launch {
            val result = if (product.isFormule) {
                Api.call { Api.service.deleteFormule(product.id) }
            } else {
                Api.call { Api.service.deleteProduct(product.id) }
            }
            when (result) {
                is ApiResult.Success -> {
                    _state.update {
                        it.copy(
                            busy = false,
                            notice = if (product.isFormule) {
                                "Formule « ${product.name} » supprimée."
                            } else {
                                "« ${product.name} » supprimé."
                            },
                        )
                    }
                    loadProducts()
                }

                is ApiResult.Failure -> _state.update { it.copy(busy = false, notice = result.message) }
            }
        }
    }

    fun consumeNotice() = _state.update { it.copy(notice = null) }

    /* --------------------------------------------------------- catégories */

    fun loadCategories() {
        viewModelScope.launch {
            when (val result = Api.call { Api.service.categories() }) {
                is ApiResult.Success -> _state.update {
                    it.copy(categories = result.data.categories)
                }

                is ApiResult.Failure -> Unit
            }
        }
    }

    fun openCategoriesDialog() = _state.update { it.copy(showCategoriesDialog = true) }

    fun closeCategoriesDialog() = _state.update { it.copy(showCategoriesDialog = false) }

    fun createCategory(name: String) {
        viewModelScope.launch {
            when (val result = Api.call { Api.service.createCategory(CategoryBody(name.trim())) }) {
                is ApiResult.Success -> {
                    _state.update { it.copy(notice = "Catégorie « ${result.data.name} » ajoutée.") }
                    loadCategories()
                }

                is ApiResult.Failure -> _state.update { it.copy(notice = result.message) }
            }
        }
    }

    fun renameCategory(id: Long, name: String) {
        viewModelScope.launch {
            when (val result = Api.call { Api.service.updateCategory(id, CategoryBody(name.trim())) }) {
                is ApiResult.Success -> {
                    _state.update { it.copy(notice = "Catégorie renommée en « ${result.data.name} ».") }
                    loadCategories()
                    loadProducts()
                }

                is ApiResult.Failure -> _state.update { it.copy(notice = result.message) }
            }
        }
    }

    fun deleteCategory(category: Category) {
        viewModelScope.launch {
            when (val result = Api.call { Api.service.deleteCategory(category.id) }) {
                is ApiResult.Success -> {
                    _state.update { it.copy(notice = "Catégorie « ${category.name} » supprimée.") }
                    loadCategories()
                }

                is ApiResult.Failure -> _state.update { it.copy(notice = result.message) }
            }
        }
    }

    override fun onCleared() {
        unsubscribes.forEach { it.invoke() }
        super.onCleared()
    }
}
