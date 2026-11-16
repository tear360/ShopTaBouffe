package com.shoptabouffe.app.ui.screens.profile

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Cloud
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material.icons.outlined.Logout
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.NotificationsOff
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.material.icons.outlined.VerifiedUser
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.shoptabouffe.app.BuildConfig
import com.shoptabouffe.app.MainViewModel
import com.shoptabouffe.app.core.Api
import com.shoptabouffe.app.core.ApiResult
import com.shoptabouffe.app.core.Config
import com.shoptabouffe.app.core.SocketManager
import com.shoptabouffe.app.core.models.CodeBody
import com.shoptabouffe.app.core.models.User
import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import com.shoptabouffe.app.core.Notifier
import com.shoptabouffe.app.ui.components.Avatar
import com.shoptabouffe.app.ui.components.ShopTaBouffeTopBar
import com.shoptabouffe.app.ui.components.InfoBanner
import com.shoptabouffe.app.ui.components.PrimaryButton
import com.shoptabouffe.app.ui.components.SectionHeader
import kotlinx.coroutines.launch

@Composable
fun ProfileScreen(user: User, vm: MainViewModel) {
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    val socketConnected by SocketManager.connected.collectAsStateWithLifecycle()
    val updateState by vm.update.collectAsStateWithLifecycle()
    val updateNotice by vm.updateNotice.collectAsStateWithLifecycle()

    var code by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var success by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(success) {
        success?.let {
            snackbar.showSnackbar(it)
            success = null
        }
    }

    LaunchedEffect(updateNotice) {
        updateNotice?.let {
            snackbar.showSnackbar(it)
            vm.consumeUpdateNotice()
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            ShopTaBouffeTopBar(title = "Mon profil")

            LazyColumn(
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 32.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.weight(1f),
            ) {
                item {
                    Surface(
                        shape = RoundedCornerShape(20.dp),
                        color = MaterialTheme.colorScheme.surface,
                        shadowElevation = 1.dp,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(20.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Avatar(user.avatarUrl, 84.dp)
                            Spacer(Modifier.height(12.dp))
                            Text(
                                user.name,
                                style = MaterialTheme.typography.titleLarge,
                            )
                            if (!user.email.isNullOrBlank()) {
                                Text(
                                    user.email,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Spacer(Modifier.height(14.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Tag(
                                    text = Config.providerLabel(user.provider ?: "inconnu"),
                                    icon = { Icon(Icons.Outlined.Code, null, Modifier.size(14.dp)) },
                                )
                                Tag(
                                    text = if (user.isSupplier) "Fournisseur" else "Client",
                                    icon = {
                                        Icon(
                                            Icons.Outlined.VerifiedUser,
                                            null,
                                            Modifier.size(14.dp),
                                            tint = if (user.isSupplier) MaterialTheme.colorScheme.primary
                                            else MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    },
                                )
                            }
                        }
                    }
                }

                item { SectionHeader(title = "Espace fournisseur") }

                item {
                    Surface(
                        shape = RoundedCornerShape(20.dp),
                        color = MaterialTheme.colorScheme.surface,
                        shadowElevation = 1.dp,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            if (user.isSupplier) {
                                InfoBanner(
                                    "Vous gérez les commandes et discutez avec vos clients " +
                                        "depuis l'onglet Fournisseur."
                                )
                                Spacer(Modifier.height(14.dp))
                                OutlinedButton(
                                    onClick = {
                                        scope.launch {
                                            busy = true
                                            when (val result = Api.call { Api.service.exitSupplierRole() }) {
                                                is ApiResult.Success -> {
                                                    vm.updateUser(result.data)
                                                    success = "Mode fournisseur désactivé."
                                                }

                                                is ApiResult.Failure -> error = result.message
                                            }
                                            busy = false
                                        }
                                    },
                                    enabled = !busy,
                                    modifier = Modifier.fillMaxWidth(),
                                ) { Text("Désactiver le mode fournisseur") }
                            } else {
                                Text(
                                    "Entrez le code fourni par le fournisseur pour gérer le " +
                                        "catalogue, les commandes et les conversations.",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Spacer(Modifier.height(14.dp))
                                OutlinedTextField(
                                    value = code,
                                    onValueChange = { code = it.take(64) },
                                    label = { Text("Code fournisseur") },
                                    singleLine = true,
                                    shape = RoundedCornerShape(14.dp),
                                    isError = error != null,
                                    keyboardOptions = KeyboardOptions(
                                        capitalization = KeyboardCapitalization.Characters,
                                        imeAction = ImeAction.Done,
                                    ),
                                    modifier = Modifier.fillMaxWidth(),
                                )
                                if (error != null) {
                                    Spacer(Modifier.height(8.dp))
                                    Text(
                                        error ?: "",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.error,
                                    )
                                }
                                Spacer(Modifier.height(14.dp))
                                PrimaryButton(
                                    text = "Activer le mode fournisseur",
                                    onClick = {
                                        scope.launch {
                                            busy = true
                                            error = null
                                            when (
                                                val result = Api.call {
                                                    Api.service.enterSupplierCode(CodeBody(code.trim()))
                                                }
                                            ) {
                                                is ApiResult.Success -> {
                                                    vm.updateUser(result.data)
                                                    code = ""
                                                    success = "Bienvenue dans votre espace fournisseur !"
                                                }

                                                is ApiResult.Failure -> error = result.message
                                            }
                                            busy = false
                                        }
                                    },
                                    enabled = code.isNotBlank() && !busy,
                                    loading = busy,
                                    icon = Icons.Outlined.Storefront,
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                        }
                    }
                }

                item { SectionHeader(title = "Paramètres") }

                item {
                    SettingsCard()
                }

                item { SectionHeader(title = "Application") }

                item {
                    Surface(
                        shape = RoundedCornerShape(20.dp),
                        color = MaterialTheme.colorScheme.surface,
                        shadowElevation = 1.dp,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            InfoLine(
                                icon = { Icon(Icons.Outlined.Cloud, null, tint = MaterialTheme.colorScheme.primary) },
                                label = "Serveur",
                                value = Config.HOST,
                            )
                            Spacer(Modifier.height(12.dp))
                            InfoLine(
                                icon = { Icon(Icons.Outlined.Code, null, tint = MaterialTheme.colorScheme.primary) },
                                label = "Temps réel",
                                value = if (socketConnected) "Connecté" else "Hors ligne",
                            )
                            Spacer(Modifier.height(12.dp))
                            InfoLine(
                                icon = {
                                    Icon(
                                        Icons.Outlined.Refresh,
                                        null,
                                        tint = MaterialTheme.colorScheme.primary,
                                    )
                                },
                                label = "Version",
                                value = "v${BuildConfig.VERSION_NAME}",
                            )
                            Spacer(Modifier.height(12.dp))
                            OutlinedButton(
                                onClick = { vm.checkForUpdateInteractive() },
                                enabled = updateState !is MainViewModel.UpdateState.Checking &&
                                    updateState !is MainViewModel.UpdateState.Downloading,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text(
                                    when (updateState) {
                                        is MainViewModel.UpdateState.Checking -> "Vérification…"
                                        is MainViewModel.UpdateState.Downloading -> "Téléchargement…"
                                        else -> "Vérifier les mises à jour"
                                    },
                                )
                            }
                            Spacer(Modifier.height(12.dp))
                            OutlinedButton(
                                onClick = { vm.logout() },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Icon(
                                    Icons.Outlined.Logout,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp),
                                    tint = MaterialTheme.colorScheme.error,
                                )
                                Spacer(Modifier.width(8.dp))
                                Text(
                                    "Se déconnecter",
                                    color = MaterialTheme.colorScheme.error,
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

@Composable
private fun Tag(text: String, icon: @Composable () -> Unit) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(50),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            icon()
            Spacer(Modifier.width(6.dp))
            Text(text, style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun InfoLine(icon: @Composable () -> Unit, label: String, value: String) {
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

/* ------------------------------------------------------------- paramètres */

/** Carte « Paramètres » : interrupteurs de notifications (persistés par [Notifier]). */
@Composable
private fun SettingsCard() {
    val context = LocalContext.current
    val newOrders by Notifier.newOrders.collectAsStateWithLifecycle()
    val orderStatus by Notifier.orderStatus.collectAsStateWithLifecycle()

    val permissionLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }

    /** Passe l'interrupteur à ON et redemande la permission Android 13+ si nécessaire. */
    fun toggle(enabled: Boolean, set: (Boolean) -> Unit) {
        set(enabled)
        if (enabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            !Notifier.canNotify(context)
        ) {
            permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    val permissionMissing = (newOrders || orderStatus) && !Notifier.canNotify(context)

    Surface(
        shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 1.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            SettingsSwitch(
                icon = { Icon(Icons.Outlined.Notifications, null, tint = MaterialTheme.colorScheme.primary) },
                title = "Nouvelles commandes",
                description = "Prévenez-moi dès qu’un client passe commande",
                checked = newOrders,
                onCheckedChange = { toggle(it, Notifier::setNewOrdersEnabled) },
            )
            HorizontalDivider(modifier = Modifier.padding(vertical = 6.dp))
            SettingsSwitch(
                icon = {
                    Icon(
                        Icons.Outlined.NotificationsOff,
                        null,
                        tint = MaterialTheme.colorScheme.primary,
                    )
                },
                title = "Suivi de mes commandes",
                description = "Prévenez-moi quand le statut de ma commande évolue",
                checked = orderStatus,
                onCheckedChange = { toggle(it, Notifier::setOrderStatusEnabled) },
            )

            if (permissionMissing) {
                Spacer(Modifier.height(10.dp))
                Text(
                    "Les notifications sont bloquées pour ShopTaBouffe : " +
                        "autorisez-les pour être prévenu des commandes.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
                TextButton(
                    onClick = {
                        val intent = Intent(
                            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.fromParts("package", context.packageName, null),
                        )
                        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    },
                    modifier = Modifier.padding(start = 0.dp),
                ) { Text("Ouvrir les réglages de l’app") }
            }
        }
    }
}

@Composable
private fun SettingsSwitch(
    icon: @Composable () -> Unit,
    title: String,
    description: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Box(modifier = Modifier.size(34.dp), contentAlignment = Alignment.Center) { icon() }
        Spacer(Modifier.width(8.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            Text(
                description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.width(8.dp))
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}
