package com.shoptabouffe.app.ui.screens.finances

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.ShoppingBag
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.shoptabouffe.app.core.toPrice
import com.shoptabouffe.app.core.eurosToCents
import com.shoptabouffe.app.core.toShortDateTime
import com.shoptabouffe.app.ui.components.EmptyState
import com.shoptabouffe.app.ui.components.ErrorState
import com.shoptabouffe.app.ui.components.LoadingBox
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

@Composable
fun FinancesScreen() {
    val vm: FinancesViewModel = viewModel()
    val state by vm.state.collectAsStateWithLifecycle()

    var showExpenseDialog by remember { mutableStateOf(false) }
    var deletingExpense by remember { mutableStateOf<com.shoptabouffe.app.core.models.Expense?>(null) }

    LaunchedEffect(state.notice) {
        state.notice?.let { vm.consumeNotice() }
    }

    if (showExpenseDialog) {
        ExpenseDialog(
            busy = state.busy,
            onDismiss = { showExpenseDialog = false },
            onSave = { label, cents, date ->
                vm.addExpense(label, cents, date)
                showExpenseDialog = false
            },
        )
    }

    deletingExpense?.let { exp ->
        AlertDialog(
            onDismissRequest = { deletingExpense = null },
            title = { Text("Supprimer cette dépense ?") },
            text = { Text("« ${exp.label} » (${exp.amountCents.toPrice()}) sera retirée du résultat.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        vm.deleteExpense(exp)
                        deletingExpense = null
                    },
                    colors = androidx.compose.material3.ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error,
                    ),
                ) { Text("Supprimer") }
            },
            dismissButton = {
                TextButton(onClick = { deletingExpense = null }) { Text("Annuler") }
            },
        )
    }

    Column(modifier = Modifier.fillMaxSize()) {
        // Période
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            PeriodChip(label = "7 jours", selected = isPeriod(state.from, state.to, 7)) {
                val (from, to) = periodRange(7)
                vm.setPeriod(from, to)
            }
            PeriodChip(label = "30 jours", selected = isPeriod(state.from, state.to, 30)) {
                val (from, to) = periodRange(30)
                vm.setPeriod(from, to)
            }
            PeriodChip(label = "Tout", selected = state.from == null && state.to == null) {
                vm.clearPeriod()
            }
        }

        when {
            state.loading && state.summary == null -> LoadingBox("Chargement des finances…")

            state.error != null && state.summary == null -> ErrorState(
                message = state.error ?: "Erreur",
                onRetry = { vm.load() },
            )

            else -> LazyColumn(
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                // Résumé
                item {
                    SummaryGrid(state.summary)
                }

                // Revenus par produit
                item {
                    SectionTitle("Revenus par produit")
                }
                if (state.products.isEmpty()) {
                    item {
                        EmptyState(
                            icon = Icons.Outlined.Info,
                            title = "Aucune vente encore",
                            message = "Les ventes livrées apparaîtront ici avec la marge par produit.",
                        )
                    }
                } else {
                    items(state.products, key = { "${it.productId ?: 0L}|${it.name}" }) { p ->
                        ProductRevenueRow(p)
                    }
                }

                // Ventes récentes
                item {
                    SectionTitle("Ventes récentes")
                }
                if (state.sales.isEmpty()) {
                    item {
                        EmptyState(
                            icon = Icons.AutoMirrored.Outlined.ReceiptLong,
                            title = "Aucune vente",
                            message = "Le journal est écrit à chaque livraison et conservé (il survit à la purge de 2 h).",
                        )
                    }
                } else {
                    items(state.sales, key = { it.id }) { sale ->
                        SaleRow(sale)
                    }
                }

                // Dépenses
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        SectionTitle("Dépenses")
                        Spacer(Modifier.weight(1f))
                        IconButton(onClick = { showExpenseDialog = true }) {
                            Icon(Icons.Outlined.Add, contentDescription = "Ajouter une dépense")
                        }
                    }
                }
                if (state.expenses.isEmpty()) {
                    item {
                        EmptyState(
                            icon = Icons.Outlined.AccountBalanceWallet,
                            title = "Aucune dépense",
                            message = "Ajoutez vos charges pour calculer le résultat net.",
                        )
                    }
                } else {
                    items(state.expenses, key = { it.id }) { exp ->
                        ExpenseRow(exp) { deletingExpense = exp }
                    }
                }
            }
        }
    }
}

@Composable
private fun PeriodChip(label: String, selected: Boolean, onClick: () -> Unit) {
    FilterChip(selected = selected, onClick = onClick, label = { Text(label) })
}

@Composable
private fun SummaryGrid(s: com.shoptabouffe.app.core.models.FinanceSummary?) {
    if (s == null) return
    val cards = listOf(
        "Revenus" to (s.revenueCents.toPrice() to "${s.orders} commande(s) livrée(s)"),
        "Coûts d'achat" to (s.costCents.toPrice() to "${s.units} unité(s) vendue(s)"),
        "Marge brute" to (s.grossMarginCents.toPrice() to "Revenus − coûts"),
        "Dépenses" to (s.expensesCents.toPrice() to "${s.expenseCount} ligne(s)"),
        "Résultat net" to (s.netCents.toPrice() to "Marge − dépenses"),
    )
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        cards.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { (label, valueSub) ->
                    SummaryCard(
                        label = label,
                        value = valueSub.first,
                        sub = valueSub.second,
                        highlight = label == "Résultat net",
                        modifier = Modifier.weight(1f),
                    )
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun SummaryCard(
    label: String,
    value: String,
    sub: String,
    highlight: Boolean,
    modifier: Modifier = Modifier,
) {
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = if (highlight) MaterialTheme.colorScheme.primaryContainer
        else MaterialTheme.colorScheme.surface,
        shadowElevation = 1.dp,
        modifier = modifier,
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(
                label.uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                value,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = if (highlight) MaterialTheme.colorScheme.primary
                else MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                sub,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(top = 6.dp, bottom = 2.dp),
    )
}

@Composable
private fun ProductRevenueRow(p: com.shoptabouffe.app.core.models.FinanceProduct) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 1.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                p.name,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text("${p.units}×", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.width(8.dp))
            Text(p.revenueCents.toPrice(), style = MaterialTheme.typography.labelSmall)
            Spacer(Modifier.width(8.dp))
            Text(
                p.marginCents.toPrice(),
                style = MaterialTheme.typography.labelSmall,
                color = if (p.marginCents < 0) MaterialTheme.colorScheme.error else Color(0xFF2E7D32),
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
private fun SaleRow(sale: com.shoptabouffe.app.core.models.Sale) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 1.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Commande #${sale.orderId}",
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    sale.totalCents.toPrice(),
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            Text(
                (sale.items ?: emptyList()).joinToString(", ") { "${it.qty}× ${it.name}" },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                sale.deliveredAt.toShortDateTime(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.outline,
            )
        }
    }
}

@Composable
private fun ExpenseRow(exp: com.shoptabouffe.app.core.models.Expense, onDelete: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 1.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(exp.label, style = MaterialTheme.typography.bodyMedium)
                Text(
                    exp.date ?: "—",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                exp.amountCents.toPrice(),
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.error,
            )
            Spacer(Modifier.width(4.dp))
            IconButton(onClick = onDelete) {
                Icon(
                    Icons.Outlined.Delete,
                    contentDescription = "Supprimer ${exp.label}",
                    tint = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

@Composable
private fun ExpenseDialog(
    busy: Boolean,
    onDismiss: () -> Unit,
    onSave: (String, Int, String?) -> Unit,
) {
    var label by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }
    var date by remember { mutableStateOf(todayIso()) }
    val cents = amount.eurosToCents()

    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text("Nouvelle dépense") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = label,
                    onValueChange = { label = it.take(120) },
                    label = { Text("Libellé *") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = amount,
                    onValueChange = { amount = it.take(12) },
                    label = { Text("Montant (€) *") },
                    isError = amount.isNotBlank() && cents == null,
                    supportingText = {
                        Text(if (cents != null) "${cents.toPrice()}" else "Ex : 12,50")
                    },
                    singleLine = true,
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                        keyboardType = androidx.compose.ui.text.input.KeyboardType.Decimal,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = date,
                    onValueChange = { date = it.take(10) },
                    label = { Text("Date (AAAA-MM-JJ)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onSave(label.trim(), cents ?: 0, date.trim().ifBlank { null }) },
                enabled = label.isNotBlank() && cents != null && !busy,
            ) { Text(if (busy) "Envoi…" else "Ajouter") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !busy) { Text("Annuler") }
        },
    )
}

private fun todayIso(): String {
    val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.FRANCE)
    return sdf.format(Calendar.getInstance().time)
}

private fun periodRange(days: Int): Pair<String, String> {
    val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.FRANCE)
    val cal = Calendar.getInstance()
    val to = sdf.format(cal.time)
    cal.add(Calendar.DAY_OF_YEAR, -(days - 1))
    val from = sdf.format(cal.time)
    return from to to
}

private fun isPeriod(from: String?, to: String?, days: Int): Boolean {
    if (from == null || to == null) return false
    val (f, t) = periodRange(days)
    return from == f && to == t
}
