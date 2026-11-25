package com.shoptabouffe.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.shoptabouffe.app.MainViewModel
import com.shoptabouffe.app.core.Session
import com.shoptabouffe.app.core.ShopState
import com.shoptabouffe.app.core.models.ShopStatus
import com.shoptabouffe.app.core.toLocalDateTimeLabel
import com.shoptabouffe.app.ui.screens.admin.AdminScreen
import com.shoptabouffe.app.ui.screens.profile.ProfileScreen
import com.shoptabouffe.app.ui.theme.AppBackgroundGradient
import com.shoptabouffe.app.ui.theme.GlassBorder
import com.shoptabouffe.app.ui.theme.GlassSurfaceStrong
import com.shoptabouffe.app.ui.theme.Orange
import com.shoptabouffe.app.ui.theme.TextMuted
import kotlinx.coroutines.delay

/** Accent demandé pour l'écran de fermeture (Theme.kt reste inchangé). */
private val ClosedAccent = Color(0xFFFF9A4D)

/**
 * Wrapper bloquant partagé.
 *
 * MainScaffold ne devant pas être modifié, ce sont les écrans concernés qui
 * l'appellent. Les écrans autorisés (profil, administration fournisseur) sont
 * rendus localement : la navigation par onglets reste inchangée.
 */
@Composable
fun ShopClosedGate(content: @Composable () -> Unit) {
    val status by ShopState.status.collectAsStateWithLifecycle()
    val userState = Session.current?.user?.collectAsStateWithLifecycle()
    val user = userState?.value

    if (!status.closed) {
        content()
        return
    }

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        ShopState.refresh()
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) ShopState.refresh()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    var showProfile by remember { mutableStateOf(false) }
    var showAdmin by remember { mutableStateOf(false) }

    when {
        showProfile && user != null -> {
            val mainVm: MainViewModel = viewModel()
            AuthorizedScreenFrame(onBack = { showProfile = false }) {
                ProfileScreen(user = user, vm = mainVm)
            }
        }

        showAdmin -> AuthorizedScreenFrame(onBack = { showAdmin = false }) {
            AdminScreen(onOpenChat = {})
        }

        else -> ShopClosedScreen(
            status = status,
            isSupplier = user?.isSupplier == true,
            onOpenProfile = { showProfile = true },
            onOpenAdmin = { showAdmin = true },
        )
    }
}

/** Cadre des écrans autorisés, avec un retour vers le message de fermeture. */
@Composable
private fun AuthorizedScreenFrame(
    onBack: () -> Unit,
    content: @Composable () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Row(modifier = Modifier.padding(horizontal = 12.dp, vertical = 2.dp)) {
            TextButton(onClick = onBack) { Text("Retour à la boutique fermée") }
        }
        Box(modifier = Modifier.weight(1f)) { content() }
    }
}

/** Écran unique affiché quand la boutique est fermée (aucun emoji). */
@Composable
private fun ShopClosedScreen(
    status: ShopStatus,
    isSupplier: Boolean,
    onOpenProfile: () -> Unit,
    onOpenAdmin: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(AppBackgroundGradient),
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            color = GlassSurfaceStrong,
            border = BorderStroke(1.dp, GlassBorder),
            shape = androidx.compose.foundation.shape.RoundedCornerShape(28.dp),
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
        ) {
            Column(
                modifier = Modifier.padding(horizontal = 24.dp, vertical = 32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = "Boutique fermée",
                    style = MaterialTheme.typography.headlineSmall,
                    color = ClosedAccent,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(14.dp))
                Text(
                    text = "La boutique est temporairement fermée.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextMuted,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(28.dp))

                Countdown(status = status)

                status.reopensAt?.let {
                    Spacer(Modifier.height(10.dp))
                    Text(
                        text = "Réouverture prévue le ${it.toLocalDateTimeLabel()}",
                        style = MaterialTheme.typography.bodySmall,
                        color = TextMuted,
                        textAlign = TextAlign.Center,
                    )
                }

                Spacer(Modifier.height(30.dp))
                OutlinedButton(
                    onClick = onOpenProfile,
                    shape = androidx.compose.foundation.shape.RoundedCornerShape(50),
                ) { Text("Mon profil") }

                if (isSupplier) {
                    Spacer(Modifier.height(10.dp))
                    OutlinedButton(
                        onClick = onOpenAdmin,
                        shape = androidx.compose.foundation.shape.RoundedCornerShape(50),
                    ) { Text("Administration") }
                }
            }
        }
    }
}

/** Compte à rebours live, rafraîchi chaque seconde puis à l'heure d'ouverture. */
@Composable
private fun Countdown(status: ShopStatus) {
    val reopensAt = status.reopensAt
    var remaining by remember(reopensAt) {
        mutableLongStateOf(ShopState.remainingMillis(status))
    }

    LaunchedEffect(reopensAt, status.now) {
        while (true) {
            val left = ShopState.remainingMillis(status)
            remaining = left
            if (left <= 0L) {
                ShopState.refresh()
                break
            }
            delay(1000L)
        }
    }

    Text(
        text = if (reopensAt == null) {
            "Réouverture dès que le fournisseur rouvre la boutique."
        } else {
            "Réouverture dans ${formatCountdown(remaining)}"
        },
        style = MaterialTheme.typography.titleMedium,
        color = Orange,
        textAlign = TextAlign.Center,
    )
}

/** "2 j 3 h 12 min" (avec secondes pour la dernière minute). */
internal fun formatCountdown(millis: Long): String {
    val totalSeconds = (millis / 1000L).coerceAtLeast(0L)
    val days = totalSeconds / 86400L
    val hours = (totalSeconds % 86400L) / 3600L
    val minutes = (totalSeconds % 3600L) / 60L
    val seconds = totalSeconds % 60L

    val parts = mutableListOf<String>()
    if (days > 0L) parts.add("$days j")
    if (hours > 0L) parts.add("$hours h")
    if (minutes > 0L) parts.add("$minutes min")
    if (parts.isEmpty() || (days == 0L && hours == 0L)) parts.add("$seconds s")
    return parts.joinToString(" ")
}
