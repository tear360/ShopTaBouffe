package com.shoptabouffe.app.ui.screens.cart

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.shoptabouffe.app.core.Api
import com.shoptabouffe.app.core.ApiResult
import com.shoptabouffe.app.core.Cart
import com.shoptabouffe.app.core.models.CreateOrderBody
import com.shoptabouffe.app.core.models.CreateOrderLine
import com.shoptabouffe.app.core.toPrice
import com.shoptabouffe.app.ui.components.CartEmptyIcon
import com.shoptabouffe.app.ui.components.ShopTaBouffeTopBar
import com.shoptabouffe.app.ui.components.EmptyState
import com.shoptabouffe.app.ui.components.PrimaryButton
import com.shoptabouffe.app.ui.components.ProductImage
import com.shoptabouffe.app.ui.components.QuantitySelector
import kotlinx.coroutines.launch

@Composable
fun CartScreen(onOrderCreated: (Long) -> Unit) {
    val lines by Cart.lines.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    var address by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("") }
    var note by rememberSaveable { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val totalCents = lines.sumOf { it.lineTotalCents }
    val count = lines.sumOf { it.qty }
    val addressValid = address.trim().length >= 3
    val phoneValid = phone.trim().filter { it.isLetterOrDigit() }.length >= 6
    val canSend = lines.isNotEmpty() && addressValid && phoneValid && !sending

    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            ShopTaBouffeTopBar(
                title = "Panier",
                subtitle = if (lines.isEmpty()) "Aucun article"
                else "$count article(s) · ${totalCents.toPrice()}",
            )

            if (lines.isEmpty()) {
                EmptyState(
                    icon = CartEmptyIcon,
                    title = "Votre panier est vide",
                    message = "Parcourez la boutique et ajoutez vos produits préférés.",
                )
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 32.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.weight(1f),
                ) {
                    items(lines, key = { it.product.id }) { line ->
                        Surface(
                            shape = RoundedCornerShape(18.dp),
                            color = MaterialTheme.colorScheme.surface,
                            shadowElevation = 1.dp,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                ProductImage(
                                    url = line.product.imageUrl,
                                    contentDescription = line.product.name,
                                    modifier = Modifier.size(58.dp),
                                    cornerRadius = 14.dp,
                                )
                                Spacer(Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        line.product.name,
                                        style = MaterialTheme.typography.titleSmall,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    Text(
                                        "${line.product.priceCents.toPrice()} / unité",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                    Text(
                                        line.lineTotalCents.toPrice(),
                                        style = MaterialTheme.typography.titleSmall,
                                        color = MaterialTheme.colorScheme.primary,
                                    )
                                }
                                QuantitySelector(
                                    qty = line.qty,
                                    onDecrease = { Cart.setQty(line.product.id, line.qty - 1) },
                                    onIncrease = { Cart.add(line.product, 1) },
                                )
                                IconButton(onClick = { Cart.remove(line.product.id) }) {
                                    Icon(
                                        Icons.Outlined.Delete,
                                        contentDescription = "Retirer ${line.product.name}",
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                    }

                    item {
                        Surface(
                            shape = RoundedCornerShape(18.dp),
                            color = MaterialTheme.colorScheme.surface,
                            shadowElevation = 1.dp,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Row(
                                modifier = Modifier.padding(16.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text("Total", style = MaterialTheme.typography.titleMedium)
                                    Text(
                                        "Prix calculé par le serveur",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                Text(
                                    totalCents.toPrice(),
                                    style = MaterialTheme.typography.headlineSmall,
                                    color = MaterialTheme.colorScheme.primary,
                                )
                            }
                        }
                    }

                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            OutlinedTextField(
                                value = address,
                                onValueChange = { address = it.take(200) },
                                label = { Text("Adresse de livraison") },
                                leadingIcon = { Icon(Icons.Outlined.LocationOn, contentDescription = null) },
                                singleLine = true,
                                isError = address.isNotEmpty() && !addressValid,
                                shape = RoundedCornerShape(16.dp),
                                keyboardOptions = KeyboardOptions(
                                    capitalization = KeyboardCapitalization.Sentences,
                                    imeAction = ImeAction.Next,
                                ),
                                modifier = Modifier.fillMaxWidth(),
                            )

                            OutlinedTextField(
                                value = phone,
                                onValueChange = { phone = it.take(30) },
                                label = { Text("Téléphone") },
                                leadingIcon = { Icon(Icons.Outlined.Phone, contentDescription = null) },
                                singleLine = true,
                                isError = phone.isNotEmpty() && !phoneValid,
                                shape = RoundedCornerShape(16.dp),
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.Phone,
                                    imeAction = ImeAction.Next,
                                ),
                                modifier = Modifier.fillMaxWidth(),
                            )

                            OutlinedTextField(
                                value = note,
                                onValueChange = { note = it.take(500) },
                                label = { Text("Note pour le fournisseur (facultatif)") },
                                minLines = 2,
                                maxLines = 4,
                                shape = RoundedCornerShape(16.dp),
                                keyboardOptions = KeyboardOptions(
                                    capitalization = KeyboardCapitalization.Sentences,
                                    imeAction = ImeAction.Default,
                                ),
                                modifier = Modifier.fillMaxWidth(),
                            )

                            error?.let {
                                Text(
                                    it,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.error,
                                )
                            }

                            PrimaryButton(
                                text = "Envoyer la commande · ${totalCents.toPrice()}",
                                onClick = {
                                    scope.launch {
                                        sending = true
                                        error = null
                                        val body = CreateOrderBody(
                                            items = Cart.lines.value.map {
                                                CreateOrderLine(it.product.id, it.qty)
                                            },
                                            address = address.trim(),
                                            phone = phone.trim(),
                                            note = note.trim().ifBlank { null },
                                        )
                                        when (val result = Api.call { Api.service.createOrder(body) }) {
                                            is ApiResult.Success -> {
                                                Cart.clear()
                                                onOrderCreated(result.data.id)
                                            }

                                            is ApiResult.Failure -> {
                                                error = result.message
                                                sending = false
                                                snackbar.showSnackbar(result.message)
                                            }
                                        }
                                    }
                                },
                                enabled = canSend,
                                loading = sending,
                                modifier = Modifier.fillMaxWidth(),
                            )

                            if (!addressValid || !phoneValid) {
                                Text(
                                    "Renseignez une adresse (3 caractères min.) et un téléphone valide.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
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
    }
}
