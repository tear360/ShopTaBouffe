package com.shoptabouffe.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.shoptabouffe.app.MainViewModel
import com.shoptabouffe.app.core.Config
import com.shoptabouffe.app.core.Updater
import com.shoptabouffe.app.core.models.User
import com.shoptabouffe.app.ui.components.ErrorState
import com.shoptabouffe.app.ui.screens.login.LoginScreen
import com.shoptabouffe.app.ui.shell.MainScaffold
import com.shoptabouffe.app.ui.theme.AppBackgroundGradient
import com.shoptabouffe.app.ui.theme.Orange

/** Racine de l'UI : bascule entre chargement, connexion et application. */
@Composable
fun AppRoot(vm: MainViewModel) {
    val state by vm.auth.collectAsStateWithLifecycle()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(AppBackgroundGradient),
    ) {
        when (val s = state) {
            MainViewModel.AuthState.Loading -> SplashScreen()

            MainViewModel.AuthState.LoggedOut -> LoginScreen(vm)

            is MainViewModel.AuthState.Failed -> Column(
                modifier = Modifier.fillMaxSize().padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                ErrorState(message = s.message, onRetry = vm::resolveSession)
                Spacer(Modifier.height(8.dp))
                Text(
                    "Serveur : ${Config.HOST}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            is MainViewModel.AuthState.LoggedIn -> MainScaffold(user = s.user, vm = vm)
        }

        // Anciens comptes « par nom » : formulaire obligatoire, non fermable.
        val needsUpgrade by vm.needsUpgrade.collectAsStateWithLifecycle()
        if (needsUpgrade != null) {
            // Rien d'autre ne doit être visible ou cliquable (mise à jour incluse).
            UpgradeRequiredDialog(vm, needsUpgrade!!)
        } else {
            UpdateDialog(vm)
        }
    }
}

/**
 * Finalisation obligatoire d'un ancien compte invité.
 * Le nom est repris tel quel (lecture seule) ; seuls le nom d'utilisateur et le
 * mot de passe sont à choisir. Aucune donnée n'est supprimée : l'upgrade garde
 * le même identifiant côté serveur.
 */
@Composable
private fun UpgradeRequiredDialog(vm: MainViewModel, user: User) {
    val busy by vm.busy.collectAsStateWithLifecycle()
    val notice by vm.updateNotice.collectAsStateWithLifecycle()

    var username by remember(user.id) { mutableStateOf("") }
    var password by remember(user.id) { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = { /* volontairement non fermable */ },
        title = { Text("Finalisez votre compte") },
        text = {
            androidx.compose.foundation.layout.Column {
                Text(
                    "Vos commandes et vos données sont conservées. Choisissez un nom " +
                        "d'utilisateur et un mot de passe pour garder accès à votre compte.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(
                    Modifier.height(12.dp)
                )
                OutlinedTextField(
                    value = user.name,
                    onValueChange = {},
                    label = { Text("Votre nom") },
                    readOnly = true,
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(
                    Modifier.height(10.dp)
                )
                OutlinedTextField(
                    value = username,
                    onValueChange = { username = it.take(32) },
                    label = { Text("Nom d'utilisateur") },
                    placeholder = { Text("Ex. lea") },
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Ascii,
                        imeAction = ImeAction.Next,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(
                    Modifier.height(10.dp)
                )
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it.take(128) },
                    label = { Text("Mot de passe") },
                    placeholder = { Text("6 caractères minimum") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    shape = RoundedCornerShape(14.dp),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Done,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )
                if (!notice.isNullOrBlank()) {
                    Spacer(
                        Modifier.height(10.dp)
                    )
                    Text(
                        notice!!,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { vm.upgradeAccount(user.name, username, password) },
                enabled = !busy && username.isNotBlank() && password.length >= 6,
            ) {
                Text(if (busy) "Enregistrement…" else "Enregistrer")
            }
        },
    )
}

/**
 * Dialogue d'auto mise à jour : proposé dès qu'une release plus récente est détectée
 * sur GitHub, puis propose d'installer l'APK téléchargé.
 */
@Composable
private fun UpdateDialog(vm: MainViewModel) {
    val state by vm.update.collectAsStateWithLifecycle()
    val context = LocalContext.current

    when (val s = state) {
        is MainViewModel.UpdateState.Available -> AlertDialog(
            onDismissRequest = { vm.dismissUpdate() },
            title = { Text("Mise à jour ${s.update.version} disponible") },
            text = {
                Text(
                    if (s.update.notes.isNotBlank()) s.update.notes
                    else "Une nouvelle version de ShopTaBouffe est prête à être installée.",
                    style = MaterialTheme.typography.bodyMedium,
                )
            },
            confirmButton = {
                TextButton(onClick = { vm.downloadUpdate(context) }) { Text("Télécharger") }
            },
            dismissButton = {
                TextButton(onClick = { vm.dismissUpdate() }) { Text("Plus tard") }
            },
        )

        MainViewModel.UpdateState.Downloading -> AlertDialog(
            onDismissRequest = { },
            title = { Text("Téléchargement…") },
            text = { Text("Récupération de la nouvelle version depuis GitHub.") },
            confirmButton = { },
        )

        is MainViewModel.UpdateState.Ready -> {
            val canInstall = Updater.canInstall(context)
            AlertDialog(
                onDismissRequest = { },
                title = { Text("Prêt à installer") },
                text = {
                    Text(
                        if (canInstall) {
                            "La version ${s.ready.version} a été téléchargée. " +
                                "L’installateur va s’ouvrir pour terminer la mise à jour."
                        } else {
                            "Autorisez l’installation d’apps inconnues pour ShopTaBouffe, " +
                                "puis relancez l’installation."
                        },
                        style = MaterialTheme.typography.bodyMedium,
                    )
                },
                confirmButton = {
                    TextButton(onClick = { vm.installUpdate(context) }) {
                        Text(if (canInstall) "Installer" else "Autoriser")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { vm.dismissUpdate() }) { Text("Plus tard") }
                },
            )
        }

        else -> Unit
    }
}

@Composable
private fun SplashScreen() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text("ShopTaBouffe", style = MaterialTheme.typography.headlineLarge, color = Orange)
    }
}
