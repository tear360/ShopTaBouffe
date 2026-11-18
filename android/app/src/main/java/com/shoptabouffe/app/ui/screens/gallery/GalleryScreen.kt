package com.shoptabouffe.app.ui.screens.gallery

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.ShoppingCart
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.shoptabouffe.app.core.Cart
import com.shoptabouffe.app.core.models.Product
import com.shoptabouffe.app.core.toPrice
import com.shoptabouffe.app.ui.components.EmptyState
import com.shoptabouffe.app.ui.components.ErrorState
import com.shoptabouffe.app.ui.components.LoadingBox
import com.shoptabouffe.app.ui.components.PrimaryButton
import com.shoptabouffe.app.ui.components.ProductImage
import com.shoptabouffe.app.ui.components.QuantitySelector
import com.shoptabouffe.app.ui.components.statusColor
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GalleryScreen(
    isSupplier: Boolean,
) {
    val vm: GalleryViewModel = viewModel()
    val state by vm.state.collectAsStateWithLifecycle()
    val cartLines by Cart.lines.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedTextField(
                    value = state.search,
                    onValueChange = vm::setSearch,
                    placeholder = { Text("Rechercher un produit…") },
                    leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = null) },
                    singleLine = true,
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = { vm.load(refreshing = true) }) {
                    Icon(Icons.Outlined.Refresh, contentDescription = "Rafraîchir")
                }
            }

            if (state.categories.isNotEmpty()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    FilterChip(
                        selected = state.category == null,
                        onClick = { vm.setCategory(null) },
                        label = { Text("Tout") },
                    )
                    state.categories.forEach { category ->
                        FilterChip(
                            selected = state.category == category,
                            onClick = { vm.setCategory(category) },
                            label = { Text(category) },
                        )
                    }
                }
                Spacer(Modifier.height(4.dp))
            }

            when {
                state.loading -> LoadingBox("Chargement des produits…")

                state.error != null && state.products.isEmpty() -> ErrorState(
                    message = state.error ?: "Erreur",
                    onRetry = { vm.load() },
                )

                state.visible.isEmpty() -> EmptyState(
                    icon = Icons.Outlined.Search,
                    title = "Aucun produit",
                    message = if (state.search.isNotBlank()) {
                        "Aucun résultat pour « ${state.search} »."
                    } else {
                        "Le catalogue est vide pour le moment."
                    },
                )

                else -> LazyVerticalGrid(
                    columns = GridCells.Adaptive(minSize = 158.dp),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                ) {
                    items(state.visible, key = { it.id }) { product ->
                        ProductCard(
                            product = product,
                            isSupplier = isSupplier,
                            qtyInCart = cartLines.firstOrNull { it.product.id == product.id }?.qty ?: 0,
                            onClick = { vm.openSheet(product) },
                            onAdd = {
                                Cart.add(product, 1)
                                scope.launch { snackbar.showSnackbar("${product.name} ajouté au panier") }
                            },
                            onIncrease = { Cart.add(product, 1) },
                            onDecrease = {
                                val current = Cart.qtyOf(product.id)
                                Cart.setQty(product.id, current - 1)
                            },
                        )
                    }
                }
            }
        }

        SnackbarHost(
            hostState = snackbar,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(16.dp),
        )

        state.sheetProduct?.let { product ->
            ProductSheet(
                product = product,
                isSupplier = isSupplier,
                onClose = vm::closeSheet,
                onAdd = { qty ->
                    Cart.add(product, qty)
                    vm.closeSheet()
                    scope.launch { snackbar.showSnackbar("$qty × ${product.name} ajouté au panier") }
                },
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProductSheet(
    product: Product,
    isSupplier: Boolean,
    onClose: () -> Unit,
    onAdd: (Int) -> Unit,
) {
    var qty by rememberSaveable(product.id) { mutableIntStateOf(1) }

    ModalBottomSheet(onDismissRequest = onClose) {
        Column(modifier = Modifier.padding(bottom = 28.dp)) {
            ProductImage(
                url = product.imageUrl,
                contentDescription = product.name,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(190.dp)
                    .padding(horizontal = 16.dp),
                cornerRadius = 20.dp,
            )

            Spacer(Modifier.height(16.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    product.name,
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.weight(1f),
                )
                if (!product.available) {
                    Surface(
                        color = statusColor("refused").copy(alpha = 0.14f),
                        shape = RoundedCornerShape(50),
                    ) {
                        Text(
                            "Indisponible",
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                            style = MaterialTheme.typography.labelMedium,
                            color = statusColor("refused"),
                        )
                    }
                }
            }

            Spacer(Modifier.height(4.dp))
            Text(
                product.category,
                modifier = Modifier.padding(horizontal = 16.dp),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
            )

            if (!product.description.isNullOrBlank()) {
                Spacer(Modifier.height(12.dp))
                Text(
                    product.description,
                    modifier = Modifier.padding(horizontal = 16.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(Modifier.height(20.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    product.priceCents.toPrice(),
                    style = MaterialTheme.typography.headlineSmall,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.weight(1f),
                )
                if (product.available && !isSupplier) {
                    QuantitySelector(
                        qty = qty,
                        onDecrease = { if (qty > 1) qty-- },
                        onIncrease = { if (qty < 99) qty++ },
                    )
                }
            }

            if (product.available && !isSupplier) {
                Spacer(Modifier.height(16.dp))
                PrimaryButton(
                    text = "Ajouter au panier · ${(product.priceCents * qty).toPrice()}",
                    onClick = { onAdd(qty) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProductCard(
    product: Product,
    isSupplier: Boolean,
    qtyInCart: Int,
    onClick: () -> Unit,
    onAdd: () -> Unit,
    onIncrease: () -> Unit,
    onDecrease: () -> Unit,
) {
    Card(
        onClick = onClick,
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column {
            Box {
                ProductImage(
                    url = product.imageUrl,
                    contentDescription = product.name,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(118.dp),
                    cornerRadius = 0.dp,
                )
                if (!product.available) {
                    Surface(
                        color = MaterialTheme.colorScheme.error,
                        shape = RoundedCornerShape(bottomEnd = 12.dp),
                        modifier = Modifier.align(Alignment.TopStart),
                    ) {
                        Text(
                            "Indisponible",
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onError,
                        )
                    }
                }
            }

            Column(modifier = Modifier.padding(12.dp)) {
                Text(
                    product.name,
                    style = MaterialTheme.typography.titleSmall,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.heightIn(max = 44.dp),
                )
                Text(
                    product.category,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        product.priceCents.toPrice(),
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.weight(1f),
                    )
                    when {
                        // Un vendeur ne passe pas commande : plus de bouton + sur ses produits.
                        !product.available -> {
                            Text(
                                "—",
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.outline,
                            )
                        }

                        isSupplier -> Unit

                        qtyInCart > 0 -> QuantitySelector(
                            qty = qtyInCart,
                            onDecrease = onDecrease,
                            onIncrease = onIncrease,
                        )

                        else -> Box(
                            modifier = Modifier
                                .size(34.dp)
                                .background(MaterialTheme.colorScheme.primary, CircleShape)
                                .clickable(onClick = onAdd),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                Icons.Filled.Add,
                                contentDescription = "Ajouter ${product.name} au panier",
                                tint = MaterialTheme.colorScheme.onPrimary,
                                modifier = Modifier.size(20.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}
