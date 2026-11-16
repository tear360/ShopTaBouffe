package com.shoptabouffe.app.ui.screens.gallery

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.shoptabouffe.app.core.Api
import com.shoptabouffe.app.core.ApiResult
import com.shoptabouffe.app.core.Session
import com.shoptabouffe.app.core.SocketManager
import com.shoptabouffe.app.core.models.Product
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class GalleryState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val products: List<Product> = emptyList(),
    val error: String? = null,
    val search: String = "",
    val category: String? = null,
    val sheetProduct: Product? = null,
) {
    val categories: List<String>
        get() = products.map { it.category }.distinct().sorted()

    val visible: List<Product>
        get() = products.filter { product ->
            (category == null || product.category == category) &&
                (search.isBlank() ||
                    product.name.contains(search, ignoreCase = true) ||
                    product.description.orEmpty().contains(search, ignoreCase = true))
        }
}

class GalleryViewModel(app: Application) : AndroidViewModel(app) {

    /** Le fournisseur voit aussi les produits discontinués. */
    private val showAllProducts: Boolean =
        Session.current?.user?.value?.isSupplier == true

    private val _state = MutableStateFlow(GalleryState())
    val state: StateFlow<GalleryState> = _state.asStateFlow()

    private var unsubscribe: (() -> Unit)? = null

    init {
        load()
        unsubscribe = SocketManager.on("product:changed") { load(refreshing = true) }
    }

    fun load(refreshing: Boolean = false) {
        if (refreshing) {
            _state.update { it.copy(refreshing = true) }
        } else if (_state.value.products.isEmpty()) {
            _state.update { it.copy(loading = true) }
        }

        viewModelScope.launch {
            when (val result = Api.call { Api.service.products(available = if (showAllProducts) null else 1) }) {
                is ApiResult.Success -> {
                    val current = _state.value
                    val products = result.data.products
                    val keptCategory = current.category?.let { c ->
                        if (products.any { it.category == c }) c else null
                    }
                    _state.value = current.copy(
                        loading = false,
                        refreshing = false,
                        error = null,
                        products = products,
                        category = keptCategory,
                    )
                }

                is ApiResult.Failure -> _state.update {
                    it.copy(loading = false, refreshing = false, error = result.message)
                }
            }
        }
    }

    fun setSearch(value: String) = _state.update { it.copy(search = value) }

    fun setCategory(value: String?) = _state.update { it.copy(category = value) }

    fun openSheet(product: Product) = _state.update { it.copy(sheetProduct = product) }

    fun closeSheet() = _state.update { it.copy(sheetProduct = null) }

    override fun onCleared() {
        unsubscribe?.invoke()
        super.onCleared()
    }
}
