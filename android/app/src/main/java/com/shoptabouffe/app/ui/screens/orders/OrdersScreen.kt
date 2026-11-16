package com.shoptabouffe.app.ui.screens.orders

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.shoptabouffe.app.core.models.Order
import com.shoptabouffe.app.core.toPrice
import com.shoptabouffe.app.core.toShortDateTime
import com.shoptabouffe.app.ui.components.ShopTaBouffeTopBar
import com.shoptabouffe.app.ui.components.EmptyState
import com.shoptabouffe.app.ui.components.ErrorState
import com.shoptabouffe.app.ui.components.LoadingBox
import com.shoptabouffe.app.ui.components.OrdersIcon
import com.shoptabouffe.app.ui.components.StatusChip

private val FILTERS = listOf(
    "all" to "Toutes",
    "pending" to "En attente",
    "active" to "En cours",
    "done" to "Terminées",
)

@Composable
fun OrdersScreen(onOpenOrder: (Long) -> Unit) {
    val vm: OrdersViewModel = viewModel()
    val state by vm.state.collectAsStateWithLifecycle()

    Column(modifier = Modifier.fillMaxSize()) {
        ShopTaBouffeTopBar(
            title = "Mes commandes",
            subtitle = "${state.visible.size} commande(s)",
            actions = {
                IconButton(onClick = { vm.load(refreshing = true) }) {
                    Icon(Icons.Outlined.Refresh, contentDescription = "Rafraîchir")
                }
            },
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FILTERS.forEach { (value, label) ->
                FilterChip(
                    selected = state.filter == value,
                    onClick = { vm.setFilter(value) },
                    label = { Text(label) },
                )
            }
        }

        when {
            state.loading -> LoadingBox("Chargement de vos commandes…")

            state.error != null && state.orders.isEmpty() -> ErrorState(
                message = state.error ?: "Erreur",
                onRetry = { vm.load() },
            )

            state.visible.isEmpty() -> EmptyState(
                icon = OrdersIcon,
                title = "Aucune commande",
                message = "Passez votre première commande depuis la boutique.",
            )

            else -> LazyColumn(
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.weight(1f),
            ) {
                items(state.visible, key = { it.id }) { order ->
                    OrderCard(order = order, onClick = { onOpenOrder(order.id) })
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderCard(order: Order, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 1.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Commande #${order.id}",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f),
                )
                StatusChip(order.status)
            }

            Text(
                order.createdAt.toShortDateTime(),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Spacer(Modifier.height(10.dp))
            Text(
                order.items.joinToString(", ") { "${it.qty}× ${it.name}" }
                    .ifBlank { "Aucun article" },
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )

            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "${order.itemCount} article(s)",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    order.totalCents.toPrice(),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}
