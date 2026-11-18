package com.shoptabouffe.app.ui.screens.orders

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Notes
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.shoptabouffe.app.core.models.Order
import com.shoptabouffe.app.core.models.OrderItem
import com.shoptabouffe.app.core.statusLabel
import com.shoptabouffe.app.core.toPrice
import com.shoptabouffe.app.core.toShortDateTime
import com.shoptabouffe.app.ui.components.CardSurface
import com.shoptabouffe.app.ui.components.ShopTaBouffeTopBar
import com.shoptabouffe.app.ui.components.ErrorState
import com.shoptabouffe.app.ui.components.LoadingBox
import com.shoptabouffe.app.ui.components.PrimaryButton
import com.shoptabouffe.app.ui.components.SectionHeader
import com.shoptabouffe.app.ui.components.StatusChip
import com.shoptabouffe.app.ui.theme.Green
import com.shoptabouffe.app.ui.theme.Red

private val STEPS = listOf(
    "pending" to "Commande envoyée",
    "accepted" to "Acceptée par le fournisseur",
    "preparing" to "En préparation",
    "delivering" to "En livraison",
    "delivered" to "Livrée",
)

@Composable
fun OrderDetailScreen(
    orderId: Long,
    canChat: Boolean = true,
    onBack: () -> Unit,
    onOpenChat: (Long) -> Unit,
) {
    val vm: OrderDetailViewModel = viewModel()
    LaunchedEffect(orderId) { vm.load(orderId) }

    val state by vm.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(state.notice) {
        state.notice?.let {
            snackbar.showSnackbar(it)
            vm.consumeNotice()
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            ShopTaBouffeTopBar(
                title = "Commande #$orderId",
                subtitle = state.order?.createdAt?.toShortDateTime(),
                navigation = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Retour")
                    }
                },
            )

            val currentOrder = state.order
            when {
                state.loading -> LoadingBox("Chargement de la commande…")

                currentOrder != null -> OrderContent(
                    order = currentOrder,
                    canChat = canChat,
                    conversationLoading = state.conversationLoading,
                    onOpenChat = { vm.openConversation(onOpenChat) },
                )

                state.error != null -> ErrorState(
                    message = state.error ?: "Erreur",
                    onRetry = { vm.load(orderId, force = true) },
                )

                else -> ErrorState(message = "Commande introuvable.") {
                    vm.load(orderId, force = true)
                }
            }
        }

        SnackbarHost(
            hostState = snackbar,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(16.dp),
        )
    }
}

@Composable
private fun OrderContent(
    order: Order,
    canChat: Boolean,
    conversationLoading: Boolean,
    onOpenChat: () -> Unit,
) {
    LazyColumn(
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        item {
            CardSurface {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            order.status.statusLabel(),
                            style = MaterialTheme.typography.titleLarge,
                            modifier = Modifier.weight(1f),
                        )
                        StatusChip(order.status)
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "Passée le ${order.createdAt.toShortDateTime()} · ${order.itemCount} article(s)",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(12.dp))
                    Text(
                        order.totalCents.toPrice(),
                        style = MaterialTheme.typography.headlineSmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
        }

        item {
            CardSurface {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Suivi", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(14.dp))
                    Timeline(currentStatus = order.status)
                }
            }
        }

        item {
            SectionHeader(title = "Articles")
        }

        items(order.items.size) { index ->
            OrderLineItem(order.items[index])
        }

        item {
            CardSurface {
                Row(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Total", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                    Text(
                        order.totalCents.toPrice(),
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
        }

        item {
            SectionHeader(title = "Livraison")
        }

        item {
            CardSurface {
                Column(modifier = Modifier.padding(16.dp)) {
                    DetailRow(icon = { Icon(Icons.Outlined.Home, null, tint = MaterialTheme.colorScheme.primary) },
                        label = "Adresse",
                        value = order.address ?: "—")
                    Spacer(Modifier.height(12.dp))
                    DetailRow(icon = { Icon(Icons.Outlined.Phone, null, tint = MaterialTheme.colorScheme.primary) },
                        label = "Téléphone",
                        value = order.phone ?: "—")
                    if (!order.note.isNullOrBlank()) {
                        Spacer(Modifier.height(12.dp))
                        DetailRow(
                            icon = { Icon(Icons.Outlined.Notes, null, tint = MaterialTheme.colorScheme.primary) },
                            label = "Note",
                            value = order.note,
                        )
                    }
                }
            }
        }

        if (canChat) {
            item {
                PrimaryButton(
                    text = "Discuter avec le fournisseur",
                    onClick = onOpenChat,
                    loading = conversationLoading,
                    icon = Icons.AutoMirrored.Outlined.Chat,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun DetailRow(icon: @Composable () -> Unit, label: String, value: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(modifier = Modifier.size(34.dp), contentAlignment = Alignment.Center) { icon() }
        Spacer(Modifier.width(8.dp))
        Column {
            Text(
                label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(value, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun OrderLineItem(item: OrderItem) {
    CardSurface {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "${item.qty}×",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.width(40.dp),
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(item.name, style = MaterialTheme.typography.bodyLarge)
                Text(
                    "${item.priceCents.toPrice()} / unité",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                item.lineTotalCents.toPrice(),
                style = MaterialTheme.typography.titleSmall,
            )
        }
    }
}

@Composable
private fun Timeline(currentStatus: String) {
    val refused = currentStatus == "refused"
    val currentIndex = if (refused) -1 else STEPS.indexOfFirst { it.first == currentStatus }

    if (refused) {
        Surface(
            color = Red.copy(alpha = 0.12f),
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                "Commande refusée par le fournisseur.",
                modifier = Modifier.padding(14.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = Red,
            )
        }
        Spacer(Modifier.height(8.dp))
    }

    STEPS.forEachIndexed { index, (_, label) ->
        val done = index < currentIndex
        val current = index == currentIndex
        val lineColor = when {
            done -> Green
            current -> MaterialTheme.colorScheme.primary
            else -> MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)
        }

        Row(verticalAlignment = Alignment.Top) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    modifier = Modifier
                        .size(24.dp)
                        .background(lineColor, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    when {
                        done -> Icon(
                            Icons.Filled.Check,
                            contentDescription = null,
                            tint = androidx.compose.ui.graphics.Color.White,
                            modifier = Modifier.size(15.dp),
                        )

                        current -> Box(
                            modifier = Modifier
                                .size(9.dp)
                                .background(androidx.compose.ui.graphics.Color.White, CircleShape)
                        )

                        else -> Box(
                            modifier = Modifier
                                .size(9.dp)
                                .background(
                                    MaterialTheme.colorScheme.surface,
                                    CircleShape
                                )
                        )
                    }
                }
                if (index != STEPS.lastIndex) {
                    Box(
                        modifier = Modifier
                            .width(2.dp)
                            .height(26.dp)
                            .background(lineColor)
                    )
                }
            }
            Spacer(Modifier.width(14.dp))
            Column(modifier = Modifier.padding(top = 2.dp)) {
                Text(
                    label,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = if (current) FontWeight.SemiBold else FontWeight.Normal,
                    color = if (index <= currentIndex || (refused && false)) {
                        MaterialTheme.colorScheme.onSurface
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f)
                    },
                )
            }
        }
    }
}
