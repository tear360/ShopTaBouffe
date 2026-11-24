package com.shoptabouffe.app.ui.screens.admin

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.MarkChatRead
import androidx.compose.material.icons.outlined.ShoppingBag
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch
import com.shoptabouffe.app.core.Api
import com.shoptabouffe.app.core.ApiResult
import com.shoptabouffe.app.core.Config
import com.shoptabouffe.app.core.models.Category
import com.shoptabouffe.app.core.models.Conversation
import com.shoptabouffe.app.core.models.CreateFormuleBody
import com.shoptabouffe.app.core.models.CreateFormuleLine
import com.shoptabouffe.app.core.models.CreateProductBody
import com.shoptabouffe.app.core.models.Order
import com.shoptabouffe.app.core.models.Product
import com.shoptabouffe.app.core.statusLabel
import com.shoptabouffe.app.core.toPrice
import com.shoptabouffe.app.core.toPriceInput
import com.shoptabouffe.app.core.toShortDateTime
import com.shoptabouffe.app.core.eurosToCents
import com.shoptabouffe.app.ui.components.Avatar
import com.shoptabouffe.app.ui.components.DiscountPriceColor
import com.shoptabouffe.app.ui.components.DiscountedPriceText
import com.shoptabouffe.app.ui.components.EmptyState
import com.shoptabouffe.app.ui.components.ErrorState
import com.shoptabouffe.app.ui.components.LoadingBox
import com.shoptabouffe.app.ui.components.ProductImage
import com.shoptabouffe.app.ui.components.StatusChip
import com.shoptabouffe.app.ui.components.statusColor

private val ORDER_FILTERS = listOf(
    "all" to "Toutes",
    "pending" to "Nouvelles",
    "active" to "En cours",
    "done" to "Terminées",
)

@Composable
fun AdminScreen(onOpenChat: (Long) -> Unit) {
    val vm: AdminViewModel = viewModel()
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
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TabRow(selectedTabIndex = state.tab, modifier = Modifier.weight(1f)) {
                    Tab(
                        selected = state.tab == 0,
                        onClick = { vm.setTab(0) },
                        text = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("Commandes")
                                if (state.pendingCount > 0) {
                                    Spacer(Modifier.width(6.dp))
                                    Badge { Text(state.pendingCount.toString()) }
                                }
                            }
                        },
                    )
                    Tab(
                        selected = state.tab == 1,
                        onClick = { vm.setTab(1) },
                        text = { Text("Produits") },
                    )
                    Tab(
                        selected = state.tab == 2,
                        onClick = { vm.setTab(2) },
                        text = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("Messages")
                                if (state.unreadTotal > 0) {
                                    Spacer(Modifier.width(6.dp))
                                    Badge { Text(state.unreadTotal.toString()) }
                                }
                            }
                        },
                    )
                }
            }

            when (state.tab) {
                0 -> OrdersTab(state = state, vm = vm, onChat = onOpenChat)
                1 -> ProductsTab(state = state, vm = vm)
                else -> ConversationsTab(state = state, onOpen = onOpenChat)
            }
        }

        SnackbarHost(
            hostState = snackbar,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(16.dp),
        )

        if (state.showCreateDialog) {
            CreateChoiceDialog(
                onProduct = {
                    vm.closeCreateDialog()
                    vm.openProductDialog(null)
                },
                onFormule = {
                    vm.closeCreateDialog()
                    vm.openFormuleDialog(null)
                },
                onCategory = {
                    vm.closeCreateDialog()
                    vm.openCategoriesDialog()
                },
                onDismiss = vm::closeCreateDialog,
            )
        }

        if (state.showProductDialog) {
            ProductDialog(
                product = state.editingProduct,
                categories = state.categories.map { it.name },
                saving = state.busy,
                onCancel = vm::closeProductDialog,
                onSave = { body -> vm.saveProduct(body) },
            )
        }

        if (state.showFormuleDialog) {
            FormuleDialog(
                formule = state.editingFormule,
                products = state.formuleProducts,
                categories = state.categories.map { it.name },
                saving = state.busy,
                onCancel = vm::closeFormuleDialog,
                onSave = { body -> vm.saveFormule(body) },
            )
        }

        if (state.showCategoriesDialog) {
            CategoriesDialog(
                categories = state.categories,
                saving = state.busy,
                onClose = vm::closeCategoriesDialog,
                onCreate = vm::createCategory,
                onRename = vm::renameCategory,
                onDelete = vm::deleteCategory,
            )
        }

        state.discountProduct?.let { product ->
            DiscountDialog(
                product = product,
                price = state.discountPrice,
                hours = state.discountHours,
                error = state.discountError,
                saving = state.busy,
                onPriceChange = vm::setDiscountPrice,
                onHoursChange = vm::setDiscountHours,
                onApply = vm::setDiscount,
                onClear = vm::clearDiscount,
                onClose = vm::closeDiscountDialog,
            )
        }

        state.confirmDelete?.let { product ->
            AlertDialog(
                onDismissRequest = vm::cancelDelete,
                title = {
                    Text(
                        if (product.isFormule) "Supprimer cette formule ?"
                        else "Supprimer ce produit ?",
                    )
                },
                text = {
                    Text(
                        if (product.isFormule) {
                            "« ${product.name} » disparaîtra de la boutique. Les commandes déjà passées conservent la formule."
                        } else {
                            "« ${product.name} » disparaîtra de la boutique. Les commandes déjà passées le conservent."
                        },
                    )
                },
                confirmButton = {
                    TextButton(
                        onClick = { vm.deleteProduct(product) },
                        colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                    ) { Text("Supprimer") }
                },
                dismissButton = {
                    TextButton(onClick = vm::cancelDelete) { Text("Annuler") }
                },
            )
        }
    }
}

/* =========================================================== commandes === */

@Composable
private fun OrdersTab(state: AdminState, vm: AdminViewModel, onChat: (Long) -> Unit) {
    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            ORDER_FILTERS.forEach { (value, label) ->
                FilterChip(
                    selected = state.statusFilter == value,
                    onClick = { vm.setStatusFilter(value) },
                    label = { Text(label) },
                )
            }
        }

        when {
            state.loading && state.orders.isEmpty() -> LoadingBox("Chargement des commandes…")

            state.error != null && state.orders.isEmpty() -> ErrorState(
                message = state.error ?: "Erreur",
                onRetry = { vm.loadOrders() },
            )

            state.visibleOrders.isEmpty() -> EmptyState(
                icon = Icons.Outlined.ShoppingBag,
                title = "Aucune commande ici",
                message = "Les nouvelles commandes apparaîtront en temps réel.",
            )

            else -> LazyColumn(
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.weight(1f),
            ) {
                items(state.visibleOrders, key = { it.id }) { order ->
                    AdminOrderCard(
                        order = order,
                        busy = state.busy,
                        onStatus = { vm.updateStatus(order.id, it) },
                        onChat = { vm.chatFor(order.customer?.id, onChat) },
                    )
                }
            }
        }
    }
}

@Composable
private fun AdminOrderCard(
    order: Order,
    busy: Boolean,
    onStatus: (String) -> Unit,
    onChat: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 1.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "#${order.id}",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    order.createdAt.toShortDateTime(),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.width(10.dp))
                StatusChip(order.status)
            }

            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar(order.customer?.avatarUrl, 36.dp)
                Spacer(Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        order.customer?.name ?: "Client",
                        style = MaterialTheme.typography.titleSmall,
                    )
                    Text(
                        order.phone ?: "—",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            Spacer(Modifier.height(10.dp))
            Text(
                order.address ?: "—",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )

            Spacer(Modifier.height(10.dp))
            Text(
                order.items.joinToString(", ") { "${it.qty}× ${it.name}" },
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )

            if (!order.note.isNullOrBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    "Note : ${order.note}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    order.totalCents.toPrice(),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = onChat) {
                    Icon(
                        Icons.AutoMirrored.Outlined.Chat,
                        contentDescription = "Discuter avec ${order.customer?.name ?: "le client"}",
                        tint = MaterialTheme.colorScheme.primary,
                    )
                }
            }

            when (order.status) {
                "pending" -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(
                        onClick = { onStatus("accepted") },
                        enabled = !busy,
                        modifier = Modifier.weight(1f),
                    ) { Text("Accepter") }
                    OutlinedButton(
                        onClick = { onStatus("refused") },
                        enabled = !busy,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = MaterialTheme.colorScheme.error,
                        ),
                    ) { Text("Refuser") }
                }

                "accepted" -> Button(
                    onClick = { onStatus("preparing") },
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Passer en préparation") }

                "preparing" -> Button(
                    onClick = { onStatus("delivering") },
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Partie en livraison") }

                "delivering" -> Button(
                    onClick = { onStatus("delivered") },
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Marquer comme livrée") }

                else -> Text(
                    order.status.statusLabel(),
                    style = MaterialTheme.typography.bodyMedium,
                    color = statusColor(order.status),
                )
            }
        }
    }
}

/* ============================================================ produits === */

@Composable
private fun ProductsTab(state: AdminState, vm: AdminViewModel) {
    Box(modifier = Modifier.fillMaxSize()) {
        if (state.products.isEmpty() && !state.loading) {
            EmptyState(
                icon = Icons.Outlined.Inventory2,
                title = "Aucun produit",
                message = "Ajoutez votre premier produit pour le proposer en livraison.",
            )
        } else {
            LazyColumn(
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 96.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                items(state.products, key = { it.id }) { product ->
                    ProductRow(
                        product = product,
                        busy = state.busy,
                        onEdit = { vm.openEditor(product) },
                        onDelete = { vm.askDelete(product) },
                        onToggleAvailability = { available ->
                            vm.setAvailability(product, available)
                        },
                        onDiscount = { vm.openDiscountDialog(product) },
                    )
                }
            }
        }

        // Un seul point d'entrée : produit, formule ou catégorie.
        OutlinedButton(
            onClick = vm::openCreateDialog,
            shape = RoundedCornerShape(50),
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(16.dp),
        ) {
            Icon(Icons.Outlined.Add, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text("Créer")
        }
    }
}

@Composable
private fun ProductRow(
    product: Product,
    busy: Boolean,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onToggleAvailability: (Boolean) -> Unit,
    onDiscount: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 1.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ProductImage(
                url = product.imageUrl,
                contentDescription = product.name,
                modifier = Modifier.size(54.dp),
                cornerRadius = 12.dp,
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    product.name,
                    style = MaterialTheme.typography.titleSmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "${if (product.isFormule) "Formule · " else ""}${product.category} · ",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    DiscountedPriceText(
                        priceCents = product.priceCents,
                        discountPriceCents = product.discountPriceCents,
                        style = MaterialTheme.typography.bodySmall.copy(
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        ),
                    )
                }
                if (product.isFormule && product.items.isNotEmpty()) {
                    Text(
                        product.items.joinToString(", ") { "${it.qty}× ${it.name ?: it.productId}" },
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (!product.available) {
                    Text(
                        "Indisponible",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                if (product.discountPriceCents != null) {
                    Text(
                        "Remise active · ${product.discountUntil.toShortDateTime()}",
                        style = MaterialTheme.typography.labelSmall,
                        color = DiscountPriceColor,
                    )
                }
                TextButton(
                    onClick = onDiscount,
                    enabled = !busy,
                    modifier = Modifier.height(28.dp),
                ) { Text("Remise") }
            }
            Switch(
                checked = product.available,
                onCheckedChange = onToggleAvailability,
            )
            IconButton(onClick = onEdit) {
                Icon(Icons.Outlined.Edit, contentDescription = "Modifier ${product.name}")
            }
            IconButton(onClick = onDelete) {
                Icon(
                    Icons.Outlined.Delete,
                    contentDescription = "Supprimer ${product.name}",
                    tint = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

/** Remise temporaire sur un produit ou une formule (1..168 heures). */
@Composable
private fun DiscountDialog(
    product: Product,
    price: String,
    hours: String,
    error: String?,
    saving: Boolean,
    onPriceChange: (String) -> Unit,
    onHoursChange: (String) -> Unit,
    onApply: () -> Unit,
    onClear: () -> Unit,
    onClose: () -> Unit,
) {
    val priceCents = price.eurosToCents()
    val duration = hours.trim().toIntOrNull()
    val priceValid = priceCents != null && priceCents > 0 && priceCents < product.priceCents
    val hoursValid = duration != null && duration in 1..168

    AlertDialog(
        onDismissRequest = { if (!saving) onClose() },
        title = {
            Text(if (product.isFormule) "Remise sur la formule" else "Remise sur le produit")
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    "${product.name} · prix normal ${product.priceCents.toPrice()}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                OutlinedTextField(
                    value = price,
                    onValueChange = { onPriceChange(it.take(12)) },
                    label = { Text("Prix remisé (€)") },
                    supportingText = {
                        Text(
                            if (priceValid) {
                                priceCents?.let { "Nouveau prix : ${it.toPrice()}" }.orEmpty()
                            } else {
                                "Entre 0 et ${product.priceCents.toPrice()}"
                            },
                        )
                    },
                    isError = price.isNotBlank() && !priceValid,
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = hours,
                    onValueChange = { onHoursChange(it.filter { c -> c.isDigit() }.take(3)) },
                    label = { Text("Durée (heures)") },
                    supportingText = { Text("De 1 à 168 heures (7 jours)") },
                    isError = hours.isNotBlank() && !hoursValid,
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
                error?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onApply, enabled = priceValid && hoursValid && !saving) {
                Text(if (saving) "Envoi…" else "Appliquer")
            }
        },
        dismissButton = {
            Row {
                TextButton(
                    onClick = onClear,
                    enabled = !saving,
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error,
                    ),
                ) { Text("Retirer la remise") }
                TextButton(onClick = onClose, enabled = !saving) { Text("Fermer") }
            }
        },
    )
}

/* ======================================================== conversations === */

@Composable
private fun ConversationsTab(state: AdminState, onOpen: (Long) -> Unit) {
    when {
        state.conversations.isEmpty() -> EmptyState(
            icon = Icons.Outlined.MarkChatRead,
            title = "Aucune conversation",
            message = "Dès qu'un client vous écrira, la discussion s'affichera ici.",
        )

        else -> LazyColumn(
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            items(state.conversations, key = { it.id }) { conversation ->
                ConversationRow(conversation = conversation, onClick = { onOpen(conversation.id) })
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ConversationRow(conversation: Conversation, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 1.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Avatar(conversation.customer?.avatarUrl, 46.dp)
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    conversation.customer?.name ?: "Client",
                    style = MaterialTheme.typography.titleSmall,
                )
                Text(
                    conversation.lastMessage?.body?.ifBlank { "Nouvelle conversation" }
                        ?: "Nouvelle conversation",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    (conversation.lastMessage?.createdAt ?: conversation.updatedAt).toShortDateTime(),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.outline,
                )
            }
            if (conversation.unreadCount > 0) {
                Badge { Text(conversation.unreadCount.toString()) }
            }
        }
    }
}

/* ======================================================== catégories ==== */

/**
 * Gestion des catégories côté fournisseur : ajout, renommage en cascade
 * (les produits suivent), suppression protégée (409 si encore utilisée).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CategoriesDialog(
    categories: List<Category>,
    saving: Boolean,
    onClose: () -> Unit,
    onCreate: (String) -> Unit,
    onRename: (Long, String) -> Unit,
    onDelete: (Category) -> Unit,
) {
    var newCategory by remember { mutableStateOf("") }
    var editingId by remember { mutableStateOf<Long?>(null) }
    var editName by remember { mutableStateOf("") }
    var confirmingDelete by remember { mutableStateOf<Category?>(null) }

    AlertDialog(
        onDismissRequest = { if (!saving) onClose() },
        title = { Text("Gérer les catégories") },
        text = {
            Column(
                modifier = Modifier
                    .verticalScroll(rememberScrollState())
                    .padding(top = 4.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = newCategory,
                        onValueChange = { newCategory = it.take(60) },
                        label = { Text("Nouvelle catégorie") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(Modifier.width(8.dp))
                    TextButton(
                        onClick = {
                            onCreate(newCategory.trim())
                            newCategory = ""
                        },
                        enabled = newCategory.isNotBlank() && !saving,
                    ) { Text("Ajouter") }
                }

                if (categories.isEmpty()) {
                    Text(
                        "Aucune catégorie pour l’instant.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                categories.forEach { category ->
                    if (editingId == category.id) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            OutlinedTextField(
                                value = editName,
                                onValueChange = { editName = it.take(60) },
                                label = { Text("Nouveau nom") },
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                            )
                            Spacer(Modifier.width(6.dp))
                            IconButton(
                                onClick = {
                                    val trimmed = editName.trim()
                                    if (trimmed.isNotBlank() && trimmed != category.name) {
                                        onRename(category.id, trimmed)
                                    }
                                    editingId = null
                                },
                                enabled = editName.isNotBlank() && !saving,
                            ) {
                                Icon(Icons.Outlined.Check, contentDescription = "Valider")
                            }
                        }
                    } else {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                category.name,
                                style = MaterialTheme.typography.bodyMedium,
                                modifier = Modifier.weight(1f),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                "${category.productsCount} produit(s)",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            IconButton(onClick = {
                                editingId = category.id
                                editName = category.name
                            }) {
                                Icon(
                                    Icons.Outlined.Edit,
                                    contentDescription = "Renommer ${category.name}",
                                )
                            }
                            IconButton(onClick = { confirmingDelete = category }) {
                                Icon(
                                    Icons.Outlined.Delete,
                                    contentDescription = "Supprimer ${category.name}",
                                    tint = MaterialTheme.colorScheme.error,
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onClose) { Text("Fermer") }
        },
    )

    confirmingDelete?.let { category ->
        AlertDialog(
            onDismissRequest = { if (!saving) confirmingDelete = null },
            title = { Text("Supprimer « ${category.name} » ?") },
            text = {
                Text(
                    if (category.productsCount > 0) {
                        "Cette catégorie est utilisée par ${category.productsCount} produit(s) : " +
                            "le serveur refusera la suppression tant qu’il en reste."
                    } else {
                        "Elle disparaîtra de la liste des catégories."
                    },
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        onDelete(category)
                        confirmingDelete = null
                    },
                    enabled = !saving,
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error,
                    ),
                ) { Text("Supprimer") }
            },
            dismissButton = {
                TextButton(onClick = { confirmingDelete = null }) { Text("Annuler") }
            },
        )
    }
}

/* ======================================================== choix de création */

@Composable
private fun CreateChoiceDialog(
    onProduct: () -> Unit,
    onFormule: () -> Unit,
    onCategory: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Créer") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                TextButton(onClick = onProduct, modifier = Modifier.fillMaxWidth()) {
                    Text("Produit", modifier = Modifier.fillMaxWidth())
                }
                TextButton(onClick = onFormule, modifier = Modifier.fillMaxWidth()) {
                    Text("Formule", modifier = Modifier.fillMaxWidth())
                }
                TextButton(onClick = onCategory, modifier = Modifier.fillMaxWidth()) {
                    Text("Catégorie", modifier = Modifier.fillMaxWidth())
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Annuler") }
        },
    )
}

/* ================================================================ formules */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FormuleDialog(
    formule: Product?,
    products: List<Product>,
    categories: List<String>,
    saving: Boolean,
    onCancel: () -> Unit,
    onSave: (CreateFormuleBody) -> Unit,
) {
    val formuleKey = formule?.id ?: 0L
    var name by remember(formuleKey) { mutableStateOf(formule?.name.orEmpty()) }
    var description by remember(formuleKey) { mutableStateOf(formule?.description.orEmpty()) }
    var category by remember(formuleKey) { mutableStateOf(formule?.category.orEmpty()) }
    var price by remember(formuleKey) {
        mutableStateOf(formule?.priceCents?.toPriceInput().orEmpty())
    }
    var imageUrl by remember(formuleKey) { mutableStateOf(formule?.imageUrl.orEmpty()) }
    var available by remember(formuleKey) { mutableStateOf(formule?.available ?: true) }
    val selected = remember(formuleKey) {
        mutableStateMapOf<Long, Int>().apply {
            formule?.items?.forEach { item -> put(item.productId, item.qty) }
        }
    }

    val catNames = remember(categories, formuleKey) {
        val existing = formule?.category.orEmpty()
        val base = categories.ifEmpty { Config.CATEGORIES }
        (base + if (existing.isNotBlank() && existing !in base) listOf(existing) else emptyList())
    }

    val priceCents = price.eurosToCents()
    val estimatedCost = products.sumOf { product ->
        product.costCents * (selected[product.id] ?: 0)
    }
    val valid = name.isNotBlank() && category.isNotBlank() && priceCents != null &&
        selected.isNotEmpty()

    AlertDialog(
        onDismissRequest = { if (!saving) onCancel() },
        title = { Text(if (formule == null) "Nouvelle formule" else "Modifier la formule") },
        text = {
            Column(
                modifier = Modifier
                    .verticalScroll(rememberScrollState())
                    .padding(top = 4.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it.take(120) },
                    label = { Text("Nom *") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it.take(2000) },
                    label = { Text("Description") },
                    minLines = 2,
                    maxLines = 4,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text("Catégorie *", style = MaterialTheme.typography.labelLarge)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    catNames.forEach { cat ->
                        FilterChip(
                            selected = category == cat,
                            onClick = { category = cat },
                            label = { Text(cat) },
                        )
                    }
                }
                OutlinedTextField(
                    value = price,
                    onValueChange = { price = it.take(12) },
                    label = { Text("Prix de vente (€) *") },
                    isError = price.isNotBlank() && priceCents == null,
                    supportingText = {
                        Text(if (priceCents != null) "${priceCents.toPrice()}" else "Ex : 12,50")
                    },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                )
                PhotoField(
                    imageUrl = imageUrl,
                    enabled = !saving,
                    onImageUrlChange = { imageUrl = it },
                )
                Text("Composition *", style = MaterialTheme.typography.labelLarge)
                if (products.isEmpty()) {
                    Text(
                        "Ajoutez d'abord des produits simples : une formule ne peut pas contenir une autre formule.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                products.forEach { candidate ->
                    val qty = selected[candidate.id]
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Checkbox(
                            checked = qty != null,
                            enabled = !saving,
                            onCheckedChange = { checked ->
                                if (checked) selected[candidate.id] = 1
                                else selected.remove(candidate.id)
                            },
                        )
                        Spacer(Modifier.width(4.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                candidate.name,
                                style = MaterialTheme.typography.bodyMedium,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                candidate.priceCents.toPrice(),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        if (qty != null) {
                            TextButton(
                                onClick = {
                                    if (qty <= 1) selected.remove(candidate.id)
                                    else selected[candidate.id] = qty - 1
                                },
                                enabled = !saving,
                            ) { Text("-") }
                            Text(qty.toString(), style = MaterialTheme.typography.titleSmall)
                            TextButton(
                                onClick = { if (qty < 99) selected[candidate.id] = qty + 1 },
                                enabled = !saving && qty < 99,
                            ) { Text("+") }
                        }
                    }
                }
                Text(
                    "Coût indicatif : ${estimatedCost.toPrice()} · calculé par le serveur à l'enregistrement.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Disponible à la vente", style = MaterialTheme.typography.bodyLarge)
                        Text(
                            "Masquer pour une rupture de stock",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Switch(checked = available, onCheckedChange = { available = it })
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val cents = priceCents ?: return@TextButton
                    onSave(
                        CreateFormuleBody(
                            name = name.trim(),
                            description = description.trim().ifBlank { null },
                            priceCents = cents,
                            category = category.trim(),
                            imageUrl = imageUrl.trim().ifBlank { null },
                            available = available,
                            items = selected.map { CreateFormuleLine(it.key, it.value) }
                                .sortedBy { it.productId },
                        ),
                    )
                },
                enabled = valid && !saving,
            ) { Text(if (saving) "Envoi…" else "Enregistrer") }
        },
        dismissButton = {
            TextButton(onClick = onCancel, enabled = !saving) { Text("Annuler") }
        },
    )
}

/* ============================================================ formulaire === */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProductDialog(
    product: Product?,
    categories: List<String>,
    saving: Boolean,
    onCancel: () -> Unit,
    onSave: (CreateProductBody) -> Unit,
) {
    var name by remember(product?.id) { mutableStateOf(product?.name.orEmpty()) }
    var description by remember(product?.id) { mutableStateOf(product?.description.orEmpty()) }
    var category by remember(product?.id) { mutableStateOf(product?.category.orEmpty()) }
    var price by remember(product?.id) {
        mutableStateOf(product?.priceCents?.toPriceInput().orEmpty())
    }
    var cost by remember(product?.id) {
        mutableStateOf(product?.costCents?.toPriceInput().orEmpty())
    }
    var imageUrl by remember(product?.id) { mutableStateOf(product?.imageUrl.orEmpty()) }
    var available by remember(product?.id) { mutableStateOf(product?.available ?: true) }

    // Catégories serveur (repli sur la liste par défaut) + celle du produit si elle n'y figure plus.
    val catNames = remember(categories, product?.id) {
        val existing = product?.category.orEmpty()
        val base = categories.ifEmpty { Config.CATEGORIES }
        (base + if (existing.isNotBlank() && existing !in base) listOf(existing) else emptyList())
    }

    val priceCents = price.eurosToCents()
    val costCents = cost.eurosToCents() ?: 0
    val valid = name.isNotBlank() && category.isNotBlank() && priceCents != null

    AlertDialog(
        onDismissRequest = { if (!saving) onCancel() },
        title = { Text(if (product == null) "Nouveau produit" else "Modifier le produit") },
        text = {
            Column(
                modifier = Modifier
                    .verticalScroll(rememberScrollState())
                    .padding(top = 4.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it.take(120) },
                    label = { Text("Nom *") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it.take(2000) },
                    label = { Text("Description") },
                    minLines = 2,
                    maxLines = 4,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text("Catégorie *", style = MaterialTheme.typography.labelLarge)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    catNames.forEach { cat ->
                        FilterChip(
                            selected = category == cat,
                            onClick = { category = cat },
                            label = { Text(cat) },
                        )
                    }
                }
                OutlinedTextField(
                    value = price,
                    onValueChange = { price = it.take(12) },
                    label = { Text("Prix de vente (€) *") },
                    isError = price.isNotBlank() && priceCents == null,
                    supportingText = {
                        Text(if (priceCents != null) "${priceCents.toPrice()}" else "Ex : 9,50")
                    },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = cost,
                    onValueChange = { cost = it.take(12) },
                    label = { Text("Prix de revient (€)") },
                    supportingText = {
                        Text(
                            if (costCents > 0) "${costCents.toPrice()} · marge ${((priceCents ?: 0) - costCents).toPrice()}"
                            else "Sert au calcul de la marge",
                        )
                    },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                )
                PhotoField(
                    imageUrl = imageUrl,
                    enabled = !saving,
                    onImageUrlChange = { imageUrl = it },
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Disponible à la vente", style = MaterialTheme.typography.bodyLarge)
                        Text(
                            "Masquer pour une rupture de stock",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Switch(checked = available, onCheckedChange = { available = it })
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val cents = priceCents ?: return@TextButton
                    onSave(
                        CreateProductBody(
                            name = name.trim(),
                            description = description.trim().ifBlank { null },
                            priceCents = cents,
                            costCents = costCents,
                            category = category.trim(),
                            imageUrl = imageUrl.trim().ifBlank { null },
                            available = available,
                        )
                    )
                },
                enabled = valid && !saving,
            ) { Text(if (saving) "Envoi…" else "Enregistrer") }
        },
        dismissButton = {
            TextButton(onClick = onCancel, enabled = !saving) { Text("Annuler") }
        },
    )
}

/**
 * Photo du produit : aperçu + choix dans la galerie du téléphone.
 * L'image est envoyée au serveur (POST /api/uploads/product-image) qui renvoie son URL.
 */
@Composable
private fun PhotoField(
    imageUrl: String,
    enabled: Boolean,
    onImageUrlChange: (String) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var uploading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val picker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) {
            scope.launch {
                uploading = true
                error = null
                when (val result = Api.uploadProductImage(context, uri)) {
                    is ApiResult.Success -> onImageUrlChange(result.data)
                    is ApiResult.Failure -> error = result.message
                }
                uploading = false
            }
        }
    }

    Column(
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            "Photo",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            ProductImage(
                url = imageUrl.ifBlank { null },
                contentDescription = "Photo du produit",
                modifier = Modifier.size(64.dp),
                cornerRadius = 12.dp,
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    when {
                        uploading -> "Envoi de la photo au serveur…"
                        imageUrl.isBlank() -> "Aucune photo pour l’instant"
                        else -> "Photo enregistrée"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (uploading) {
                    Spacer(Modifier.height(6.dp))
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                }
                if (error != null) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        error ?: "",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(
                onClick = {
                    picker.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                    )
                },
                enabled = enabled && !uploading,
            ) {
                Icon(Icons.Outlined.Image, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text(if (imageUrl.isBlank()) "Choisir une photo" else "Changer la photo")
            }
            if (imageUrl.isNotBlank()) {
                TextButton(
                    onClick = {
                        onImageUrlChange("")
                        error = null
                    },
                    enabled = enabled && !uploading,
                ) { Text("Retirer") }
            }
        }
    }
}
