package com.shoptabouffe.app.core

import com.shoptabouffe.app.core.models.Product
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

data class CartLine(
    val product: Product,
    val qty: Int,
) {
    /** Prix normal, conservé pour afficher l'ancien prix barré. */
    val originalPriceCents: Int get() = product.priceCents

    /** Prix effectivement payé (remise temporaire incluse). */
    val effectivePriceCents: Int get() = product.discountPriceCents ?: product.priceCents

    val lineTotalCents: Int get() = effectivePriceCents * qty
}

/** Panier local (mémoire de processus), exposé en StateFlow pour toute l'UI. */
object Cart {

    private val _lines = MutableStateFlow<List<CartLine>>(emptyList())
    val lines: StateFlow<List<CartLine>> = _lines.asStateFlow()

    val totalCents: Int get() = _lines.value.sumOf { it.lineTotalCents }
    val count: Int get() = _lines.value.sumOf { it.qty }

    fun qtyOf(productId: Long): Int = _lines.value.firstOrNull { it.product.id == productId }?.qty ?: 0

    fun add(product: Product, qty: Int = 1) {
        if (qty <= 0) return
        _lines.update { current ->
            val existing = current.firstOrNull { it.product.id == product.id }
            when {
                existing == null -> current + CartLine(product, qty.coerceAtMost(99))
                else -> current.map {
                    if (it.product.id == product.id) {
                        it.copy(qty = (it.qty + qty).coerceAtMost(99))
                    } else it
                }
            }
        }
    }

    fun setQty(productId: Long, qty: Int) {
        _lines.update { current ->
            if (qty <= 0) current.filterNot { it.product.id == productId }
            else current.map {
                if (it.product.id == productId) it.copy(qty = qty.coerceAtMost(99)) else it
            }
        }
    }

    /** Remplace le produit (utile après un rafraîchissement de la galerie). */
    fun sync(product: Product) = sync(listOf(product))

    /**
     * Rafraîchit les lignes à partir des produits rechargés : le prix effectif
     * suit ainsi l'apparition, la modification ou l'expiration d'une remise.
     */
    fun sync(products: List<Product>) {
        if (products.isEmpty()) return
        val byId = products.associateBy { it.id }
        _lines.update { current ->
            current.map { line -> byId[line.product.id]?.let { line.copy(product = it) } ?: line }
        }
    }

    fun remove(productId: Long) = setQty(productId, 0)

    fun clear() {
        _lines.value = emptyList()
    }
}
