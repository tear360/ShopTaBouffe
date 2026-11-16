package com.shoptabouffe.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.shoptabouffe.app.MainViewModel
import com.shoptabouffe.app.core.Config
import com.shoptabouffe.app.core.Updater
import com.shoptabouffe.app.ui.components.ErrorState
import com.shoptabouffe.app.ui.screens.login.LoginScreen
import com.shoptabouffe.app.ui.shell.MainScaffold
import com.shoptabouffe.app.ui.theme.Orange

/** Racine de l'UI : bascule entre chargement, connexion et application. */
@Composable
fun AppRoot(vm: MainViewModel) {
    val state by vm.auth.collectAsStateWithLifecycle()

    Box(modifier = Modifier.fillMaxSize()) {
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

        UpdateDialog(vm)
    }
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
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("ShopTaBouffe", style = MaterialTheme.typography.headlineLarge, color = Orange)
            Spacer(Modifier.height(4.dp))
            Text(
                "La livraison, en un geste",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
