package com.shoptabouffe.app.ui.screens.profile

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BugReport
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material.icons.outlined.Logout
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.NotificationsOff
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.material.icons.outlined.VerifiedUser
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.shoptabouffe.app.BuildConfig
import com.shoptabouffe.app.MainViewModel
import com.shoptabouffe.app.core.Api
import com.shoptabouffe.app.core.ApiResult
import com.shoptabouffe.app.core.Config
import com.shoptabouffe.app.core.SocketManager
import com.shoptabouffe.app.core.models.AccountInfo
import com.shoptabouffe.app.core.models.CodeBody
import com.shoptabouffe.app.core.models.Identity
import com.shoptabouffe.app.core.models.TwoFactorEnableResponse
import com.shoptabouffe.app.core.models.TwoFactorStartResponse
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
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    val socketConnected by SocketManager.connected.collectAsStateWithLifecycle()
    val updateState by vm.update.collectAsStateWithLifecycle()
    val updateNotice by vm.updateNotice.collectAsStateWithLifecycle()
    val account by vm.account.collectAsStateWithLifecycle()
    val accountBusy by vm.accountBusy.collectAsStateWithLifecycle()
    val accountNotice by vm.accountNotice.collectAsStateWithLifecycle()
    val pendingEmail by vm.pendingEmail.collectAsStateWithLifecycle()
    val needsUpgrade by vm.needsUpgrade.collectAsStateWithLifecycle()
    val upgradeActive = needsUpgrade != null

    LaunchedEffect(Unit) { vm.loadAccount() }

    var showAccountDialog by remember { mutableStateOf(false) }

    // Un ancien compte « demo » doit d'abord finaliser son upgrade : la gestion
    // du compte reste inaccessible tant que ce formulaire obligatoire est actif.
    LaunchedEffect(upgradeActive) {
        if (upgradeActive) showAccountDialog = false
    }

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

    LaunchedEffect(accountNotice) {
        accountNotice?.let {
            snackbar.showSnackbar(it)
            vm.consumeAccountNotice()
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
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

                item { SectionHeader(title = "Mon compte") }

                item {
                    OutlinedButton(
                        onClick = { showAccountDialog = true },
                        enabled = !upgradeActive,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("Gérer le compte") }
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
                    SettingsCard(isSupplier = user.isSupplier)
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
                                onClick = {
                                    val intent = Intent(
                                        Intent.ACTION_VIEW,
                                        Uri.parse("https://github.com/tear360/ShopTaBouffe/issues/new"),
                                    )
                                    context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                                },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Icon(
                                    Icons.Outlined.BugReport,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp),
                                )
                                Spacer(Modifier.width(8.dp))
                                Text("Signaler un problème")
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

    if (showAccountDialog) {
        AlertDialog(
            onDismissRequest = { if (!accountBusy && !upgradeActive) showAccountDialog = false },
            title = { Text("Mon compte") },
            text = {
                AccountCard(
                    account = account,
                    busy = accountBusy || upgradeActive,
                    pendingEmail = pendingEmail,
                    onSave = { email, phone -> vm.patchAccount(email, phone) },
                    onVerifyCode = { code -> vm.verifyEmailCode(code) },
                    onResendCode = { vm.resendEmailCode() },
                    onLink = { provider -> vm.linkAccount(provider, context) },
                    onUnlink = vm::unlinkAccount,
                    onChangePassword = { current, next, done -> vm.changePassword(current, next, done) },
                    onStartTwoFactor = { done -> vm.startTwoFactor(done) },
                    onEnableTwoFactor = { code, done -> vm.enableTwoFactor(code, done) },
                    onDisableTwoFactor = { code, password, done ->
                        vm.disableTwoFactor(code, password, done)
                    },
                    onDelete = { password, confirm ->
                        showAccountDialog = false
                        vm.deleteAccount(password, confirm)
                    },
                )
            },
            confirmButton = {
                TextButton(onClick = { showAccountDialog = false }) { Text("Fermer") }
            },
        )
    }
}

/* --------------------------------------------------------------- compte */

/** Décode le QR `data:image/png;base64,...` renvoyé par /account/2fa/start. */
private fun decodeQrBitmap(dataUrl: String?): ImageBitmap? {
    if (dataUrl.isNullOrBlank()) return null
    val base64 = dataUrl.substringAfter("base64,", dataUrl).trim()
    return try {
        val bytes = Base64.decode(base64, Base64.DEFAULT)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
    } catch (_: IllegalArgumentException) {
        null
    }
}

/**
 * Carte « Mon compte » découpée en quatre catégories : une seule est visible
 * à la fois. Le contenu est scrollable et sans largeur fixe.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AccountCard(
    account: AccountInfo?,
    busy: Boolean,
    pendingEmail: String? = null,
    onSave: (String, String) -> Unit,
    onVerifyCode: (String) -> Unit,
    onResendCode: () -> Unit,
    onLink: (String) -> Unit,
    onUnlink: (String) -> Unit,
    onChangePassword: (String, String, (Boolean) -> Unit) -> Unit,
    onStartTwoFactor: ((ApiResult<TwoFactorStartResponse>) -> Unit) -> Unit,
    onEnableTwoFactor: (String, (ApiResult<TwoFactorEnableResponse>) -> Unit) -> Unit,
    onDisableTwoFactor: (String, String?, (ApiResult<TwoFactorEnableResponse>) -> Unit) -> Unit,
    onDelete: (String?, String?) -> Unit,
) {
    var email by remember(account?.email) { mutableStateOf(account?.email.orEmpty()) }
    var phone by remember(account?.phone) { mutableStateOf(account?.phone.orEmpty()) }
    var verifyCode by rememberSaveable { mutableStateOf("") }
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var confirmDelete by remember { mutableStateOf(false) }

    var currentPassword by rememberSaveable { mutableStateOf("") }
    var newPassword by rememberSaveable { mutableStateOf("") }
    var confirmPassword by rememberSaveable { mutableStateOf("") }

    var twoFactorSetup by remember { mutableStateOf<TwoFactorStartResponse?>(null) }
    var recoveryCodes by remember { mutableStateOf<List<String>>(emptyList()) }
    var enableCode by rememberSaveable { mutableStateOf("") }
    var disableCode by rememberSaveable { mutableStateOf("") }
    var disablePassword by rememberSaveable { mutableStateOf("") }

    var deletePassword by rememberSaveable { mutableStateOf("") }
    var deleteConfirm by rememberSaveable { mutableStateOf("") }

    val qrBitmap = remember(twoFactorSetup?.qrDataUrl) { decodeQrBitmap(twoFactorSetup?.qrDataUrl) }

    LaunchedEffect(account?.twoFactorEnabled) {
        if (account?.twoFactorEnabled == true) {
            twoFactorSetup = null
            enableCode = ""
        }
    }

    Surface(
        shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 1.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (account == null) {
                Text(
                    "Chargement des informations du compte…",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                val categories = listOf("Informations", "Sécurité", "Connexions", "Danger")
                ScrollableTabRow(
                    selectedTabIndex = tab.coerceIn(categories.indices),
                    edgePadding = 0.dp,
                    modifier = Modifier.fillMaxWidth(),
                    tabs = {
                        categories.forEachIndexed { index, label ->
                            Tab(
                                selected = tab == index,
                                onClick = { tab = index },
                                text = {
                                    Text(
                                        label,
                                        style = MaterialTheme.typography.labelMedium,
                                        maxLines = 1,
                                    )
                                },
                            )
                        }
                    },
                )

                when (tab.coerceIn(categories.indices)) {
                    // --------------------------------------------- Informations
                    0 -> {
                        Text(
                            "Connexion : ${Config.providerLabel(account.provider ?: "inconnu")}",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Text(
                            "Mot de passe : ${if (account.hasPassword) "configuré" else "aucun"}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        OutlinedTextField(
                            value = email,
                            onValueChange = { email = it.take(180) },
                            label = { Text("Email (facultatif)") },
                            singleLine = true,
                            shape = RoundedCornerShape(14.dp),
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Email,
                                imeAction = ImeAction.Next,
                            ),
                            modifier = Modifier.fillMaxWidth(),
                        )
                        OutlinedTextField(
                            value = phone,
                            onValueChange = { phone = it.take(30) },
                            label = { Text("Téléphone") },
                            singleLine = true,
                            shape = RoundedCornerShape(14.dp),
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Phone,
                                imeAction = ImeAction.Done,
                            ),
                            modifier = Modifier.fillMaxWidth(),
                        )
                        PrimaryButton(
                            text = "Enregistrer les coordonnées",
                            onClick = { onSave(email, phone) },
                            enabled = !busy,
                            loading = busy,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        if (!pendingEmail.isNullOrBlank()) {
                            InfoBanner(
                                "Un code à 6 chiffres a été envoyé à $pendingEmail. " +
                                    "Votre adresse actuelle reste inchangée jusqu’à validation."
                            )
                            OutlinedTextField(
                                value = verifyCode,
                                onValueChange = { value -> verifyCode = value.filter { it.isDigit() }.take(6) },
                                label = { Text("Code de vérification") },
                                singleLine = true,
                                shape = RoundedCornerShape(14.dp),
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.Number,
                                    imeAction = ImeAction.Done,
                                ),
                                modifier = Modifier.fillMaxWidth(),
                            )
                            PrimaryButton(
                                text = "Vérifier le code",
                                onClick = { onVerifyCode(verifyCode) },
                                enabled = !busy && verifyCode.length == 6,
                                loading = busy,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            OutlinedButton(
                                onClick = onResendCode,
                                enabled = !busy,
                                modifier = Modifier.fillMaxWidth(),
                            ) { Text("Renvoyer le code") }
                        }
                    }

                    // ------------------------------------------------ Sécurité
                    1 -> {
                        Text("Changer le mot de passe", style = MaterialTheme.typography.titleSmall)
                        if (account.hasPassword) {
                            OutlinedTextField(
                                value = currentPassword,
                                onValueChange = { currentPassword = it.take(128) },
                                label = { Text("Mot de passe actuel") },
                                singleLine = true,
                                visualTransformation = PasswordVisualTransformation(),
                                shape = RoundedCornerShape(14.dp),
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.Password,
                                    imeAction = ImeAction.Next,
                                ),
                                modifier = Modifier.fillMaxWidth(),
                            )
                            OutlinedTextField(
                                value = newPassword,
                                onValueChange = { newPassword = it.take(128) },
                                label = { Text("Nouveau mot de passe") },
                                placeholder = { Text("6 caractères minimum") },
                                singleLine = true,
                                visualTransformation = PasswordVisualTransformation(),
                                shape = RoundedCornerShape(14.dp),
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.Password,
                                    imeAction = ImeAction.Next,
                                ),
                                modifier = Modifier.fillMaxWidth(),
                            )
                            OutlinedTextField(
                                value = confirmPassword,
                                onValueChange = { confirmPassword = it.take(128) },
                                label = { Text("Confirmer le nouveau mot de passe") },
                                singleLine = true,
                                visualTransformation = PasswordVisualTransformation(),
                                shape = RoundedCornerShape(14.dp),
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.Password,
                                    imeAction = ImeAction.Done,
                                ),
                                modifier = Modifier.fillMaxWidth(),
                            )
                            PrimaryButton(
                                text = "Changer le mot de passe",
                                onClick = {
                                    onChangePassword(currentPassword, newPassword) { success ->
                                        if (success) {
                                            currentPassword = ""
                                            newPassword = ""
                                            confirmPassword = ""
                                        }
                                    }
                                },
                                enabled = !busy && currentPassword.isNotEmpty() &&
                                    newPassword.length >= 6 && newPassword == confirmPassword,
                                loading = busy,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        } else {
                            Text(
                                "Ce compte n'a pas de mot de passe : utilisez une connexion " +
                                    "GitHub ou Google pour vous identifier.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }

                        HorizontalDivider()

                        Text("Double authentification", style = MaterialTheme.typography.titleSmall)
                        Text(
                            "État : ${if (account.twoFactorEnabled) "activée" else "désactivée"}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        if (account.twoFactorEnabled) {
                            Text(
                                "Saisissez un code de votre application" +
                                    (if (account.hasPassword) " et votre mot de passe" else "") +
                                    " pour désactiver la double authentification.",
                                style = MaterialTheme.typography.bodySmall,
                            )
                            OutlinedTextField(
                                value = disableCode,
                                onValueChange = { value ->
                                    disableCode = value.filter { c -> c.isDigit() }.take(6)
                                },
                                label = { Text("Code de sécurité") },
                                singleLine = true,
                                shape = RoundedCornerShape(14.dp),
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.Number,
                                    imeAction = ImeAction.Next,
                                ),
                                modifier = Modifier.fillMaxWidth(),
                            )
                            if (account.hasPassword) {
                                OutlinedTextField(
                                    value = disablePassword,
                                    onValueChange = { disablePassword = it.take(128) },
                                    label = { Text("Mot de passe") },
                                    singleLine = true,
                                    visualTransformation = PasswordVisualTransformation(),
                                    shape = RoundedCornerShape(14.dp),
                                    keyboardOptions = KeyboardOptions(
                                        keyboardType = KeyboardType.Password,
                                        imeAction = ImeAction.Done,
                                    ),
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                            OutlinedButton(
                                onClick = {
                                    onDisableTwoFactor(
                                        disableCode,
                                        disablePassword.takeIf { account.hasPassword },
                                    ) { result ->
                                        if (result is ApiResult.Success) {
                                            disableCode = ""
                                            disablePassword = ""
                                        }
                                    }
                                },
                                enabled = !busy && disableCode.length == 6 &&
                                    (!account.hasPassword || disablePassword.isNotEmpty()),
                                modifier = Modifier.fillMaxWidth(),
                            ) { Text("Désactiver la double authentification") }
                        } else {
                            val setup = twoFactorSetup
                            if (setup == null) {
                                OutlinedButton(
                                    onClick = {
                                        onStartTwoFactor { result ->
                                            if (result is ApiResult.Success) {
                                                recoveryCodes = emptyList()
                                                twoFactorSetup = result.data
                                            }
                                        }
                                    },
                                    enabled = !busy,
                                    modifier = Modifier.fillMaxWidth(),
                                ) { Text("Configurer la double authentification") }
                                Text(
                                    "Un QR code et un secret vous seront affichés pour " +
                                        "configurer votre application d'authentification.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            } else {
                                if (qrBitmap != null) {
                                    Image(
                                        bitmap = qrBitmap,
                                        contentDescription = "QR code de configuration",
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .heightIn(max = 220.dp),
                                    )
                                } else {
                                    Text(
                                        "QR code indisponible : saisissez le secret ci-dessous.",
                                        style = MaterialTheme.typography.bodySmall,
                                    )
                                }
                                Text(
                                    "Secret (saisie manuelle) :",
                                    style = MaterialTheme.typography.labelSmall,
                                )
                                SelectionContainer {
                                    Text(
                                        setup.secret.orEmpty(),
                                        style = MaterialTheme.typography.bodySmall,
                                    )
                                }
                                OutlinedTextField(
                                    value = enableCode,
                                    onValueChange = { value ->
                                        enableCode = value.filter { c -> c.isDigit() }.take(6)
                                    },
                                    label = { Text("Code de sécurité") },
                                    singleLine = true,
                                    shape = RoundedCornerShape(14.dp),
                                    keyboardOptions = KeyboardOptions(
                                        keyboardType = KeyboardType.Number,
                                        imeAction = ImeAction.Done,
                                    ),
                                    modifier = Modifier.fillMaxWidth(),
                                )
                                FlowRow(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    PrimaryButton(
                                        text = "Activer",
                                        onClick = {
                                            onEnableTwoFactor(enableCode) { result ->
                                                if (result is ApiResult.Success) {
                                                    recoveryCodes = result.data.recoveryCodes
                                                    twoFactorSetup = null
                                                    enableCode = ""
                                                }
                                            }
                                        },
                                        enabled = !busy && enableCode.length == 6,
                                        loading = busy,
                                    )
                                    OutlinedButton(
                                        onClick = {
                                            twoFactorSetup = null
                                            enableCode = ""
                                        },
                                        enabled = !busy,
                                    ) { Text("Annuler") }
                                }
                            }

                            if (recoveryCodes.isNotEmpty()) {
                                HorizontalDivider()
                                Text(
                                    "Codes de récupération",
                                    style = MaterialTheme.typography.titleSmall,
                                )
                                Text(
                                    "Conservez ces codes : ils ne seront affichés qu'une seule fois.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                SelectionContainer {
                                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                        recoveryCodes.forEach { code ->
                                            Text(code, style = MaterialTheme.typography.bodyMedium)
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // --------------------------------------------- Connexions
                    2 -> {
                        Text("Identités liées", style = MaterialTheme.typography.titleSmall)
                        if (account.identities.isEmpty()) {
                            Text(
                                "Aucune identité liée pour le moment.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        account.identities.forEach { identity ->
                            IdentityRow(identity = identity, busy = busy, onUnlink = onUnlink)
                        }

                        val linkable = listOf("github", "google").filterNot { provider ->
                            account.identities.any { it.provider == provider }
                        }
                        if (linkable.isNotEmpty()) {
                            FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                linkable.forEach { provider ->
                                    OutlinedButton(
                                        onClick = { onLink(provider) },
                                        enabled = !busy,
                                    ) { Text("Lier ${Config.providerLabel(provider)}") }
                                }
                            }
                        }
                    }

                    // ------------------------------------------------- Danger
                    else -> {
                        Text("Supprimer mon compte", style = MaterialTheme.typography.titleSmall)
                        if (account.hasPassword) {
                            OutlinedTextField(
                                value = deletePassword,
                                onValueChange = { deletePassword = it.take(128) },
                                label = { Text("Mot de passe") },
                                singleLine = true,
                                visualTransformation = PasswordVisualTransformation(),
                                shape = RoundedCornerShape(14.dp),
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.Password,
                                    imeAction = ImeAction.Done,
                                ),
                                modifier = Modifier.fillMaxWidth(),
                            )
                        } else {
                            Text(
                                "Saisissez exactement SUPPRIMER pour confirmer la suppression.",
                                style = MaterialTheme.typography.bodySmall,
                            )
                            OutlinedTextField(
                                value = deleteConfirm,
                                onValueChange = { deleteConfirm = it.take(32) },
                                label = { Text("Confirmation") },
                                singleLine = true,
                                shape = RoundedCornerShape(14.dp),
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                        OutlinedButton(
                            onClick = { confirmDelete = true },
                            enabled = !busy && if (account.hasPassword) {
                                deletePassword.isNotEmpty()
                            } else {
                                deleteConfirm == "SUPPRIMER"
                            },
                            colors = ButtonDefaults.outlinedButtonColors(
                                contentColor = MaterialTheme.colorScheme.error,
                            ),
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text("Supprimer mon compte") }
                        Text(
                            "Le journal financier du serveur est conservé après la suppression.",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { if (!busy) confirmDelete = false },
            title = { Text("Supprimer définitivement le compte ?") },
            text = {
                Text(
                    "Votre profil, vos commandes et vos conversations seront supprimés. " +
                        "Cette action est irréversible ; le journal financier reste conservé sur le serveur.",
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmDelete = false
                        if (account?.hasPassword == true) {
                            onDelete(deletePassword, null)
                        } else {
                            onDelete(null, deleteConfirm)
                        }
                    },
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error,
                    ),
                ) { Text("Supprimer") }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = false }) { Text("Annuler") }
            },
        )
    }
}

@Composable
private fun IdentityRow(
    identity: Identity,
    busy: Boolean,
    onUnlink: (String) -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(Config.providerLabel(identity.provider), style = MaterialTheme.typography.bodyMedium)
            Text(
                identity.email ?: "—",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (identity.provider == "github" || identity.provider == "google") {
            TextButton(
                onClick = { onUnlink(identity.provider) },
                enabled = !busy,
                colors = ButtonDefaults.textButtonColors(
                    contentColor = MaterialTheme.colorScheme.error,
                ),
            ) { Text("Dissocier") }
        }
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
private fun SettingsCard(isSupplier: Boolean) {
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

    val permissionMissing = ((isSupplier && newOrders) || orderStatus) && !Notifier.canNotify(context)

    Surface(
        shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 1.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // « Nouvelles commandes » ne concerne que le fournisseur (le vendeur reçoit les commandes).
            if (isSupplier) {
                SettingsSwitch(
                    icon = { Icon(Icons.Outlined.Notifications, null, tint = MaterialTheme.colorScheme.primary) },
                    title = "Nouvelles commandes",
                    description = "Prévenez-moi dès qu’un client passe commande",
                    checked = newOrders,
                    onCheckedChange = { toggle(it, Notifier::setNewOrdersEnabled) },
                )
                HorizontalDivider(modifier = Modifier.padding(vertical = 6.dp))
            }
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
