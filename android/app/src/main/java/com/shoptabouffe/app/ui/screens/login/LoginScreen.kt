package com.shoptabouffe.app.ui.screens.login

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.shoptabouffe.app.MainViewModel
import com.shoptabouffe.app.core.Config
import com.shoptabouffe.app.ui.components.PrimaryButton
import com.shoptabouffe.app.ui.theme.Orange
import com.shoptabouffe.app.ui.theme.TextMuted

private data class Brand(
    val background: Color,
    val foreground: Color,
    val icon: ImageVector,
    val iconTint: Color,
)

private fun brandOf(provider: String): Brand = when (provider) {
    // Boutons clairs aux deux : lisibles quel que soit le fond.
    "github" -> Brand(Color(0xFFF6F8FA), Color(0xFF24292F), Icons.Filled.Code, Color(0xFF24292F))
    else -> Brand(Color.White, Color(0xFF1F1A17), Icons.Filled.Language, Color(0xFF4285F4))
}

/** 0 = Se connecter, 1 = S'inscrire. La connexion par nom a été supprimée. */
private val TAB_LABELS = listOf("Se connecter", "S'inscrire")

@Composable
fun LoginScreen(vm: MainViewModel) {
    val context = LocalContext.current
    val notice by vm.loginNotice.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()

    var mode by rememberSaveable { mutableIntStateOf(0) }
    var name by rememberSaveable { mutableStateOf("") }
    var username by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(72.dp))

        Box(
            modifier = Modifier
                .size(88.dp)
                .background(Orange, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                "S",
                style = MaterialTheme.typography.headlineMedium,
                color = Color.White,
                fontWeight = FontWeight.Black,
            )
        }

        Spacer(Modifier.height(20.dp))
        Text("ShopTaBouffe", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(6.dp))
        Text(
            "Vos produits préférés, livrés chez vous.\nConnectez-vous pour commander.",
            style = MaterialTheme.typography.bodyMedium,
            color = TextMuted,
            textAlign = TextAlign.Center,
        )

        Spacer(Modifier.height(28.dp))

        notice?.let { message ->
            Surface(
                color = MaterialTheme.colorScheme.errorContainer,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier.padding(14.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Icon(
                        Icons.Outlined.Info,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onErrorContainer,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(Modifier.width(10.dp))
                    Text(
                        message,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                    )
                }
            }
            Spacer(Modifier.height(16.dp))
        }

        // --- Onglets ---
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            TAB_LABELS.forEachIndexed { index, label ->
                LoginTab(
                    label = label,
                    selected = mode == index,
                    onClick = { mode = index },
                    modifier = Modifier.weight(1f),
                )
            }
        }

        Spacer(Modifier.height(18.dp))

        when (mode) {
            // ---------------- Inscription ----------------
            1 -> {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it.take(80) },
                    label = { Text("Votre nom") },
                    placeholder = { Text("Ex. Léa") },
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    keyboardOptions = KeyboardOptions(
                        capitalization = KeyboardCapitalization.Words,
                        imeAction = ImeAction.Next,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))
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
                Spacer(Modifier.height(12.dp))
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
                Spacer(Modifier.height(16.dp))
                PrimaryButton(
                    text = "Créer mon compte",
                    onClick = { vm.registerAccount(name, username, password) },
                    enabled = !busy && name.isNotBlank() &&
                        username.isNotBlank() && password.length >= 6,
                    loading = busy,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            // ---------------- Connexion ----------------
            else -> {
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
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it.take(128) },
                    label = { Text("Mot de passe") },
                    placeholder = { Text("••••••") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    shape = RoundedCornerShape(14.dp),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Done,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(16.dp))
                PrimaryButton(
                    text = "Se connecter",
                    onClick = { vm.login(username, password) },
                    enabled = !busy && username.isNotBlank() && password.isNotEmpty(),
                    loading = busy,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        Spacer(Modifier.height(28.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            HorizontalLine()
            Text(
                " ou continuer avec ",
                style = MaterialTheme.typography.bodySmall,
                color = TextMuted,
            )
            HorizontalLine()
        }
        Spacer(Modifier.height(14.dp))

        Config.PROVIDERS.forEach { provider ->
            OAuthButton(provider = provider) { vm.startOAuth(provider, context) }
            Spacer(Modifier.height(14.dp))
        }

        Spacer(Modifier.height(14.dp))
        Text(
            "Serveur : ${Config.HOST}",
            style = MaterialTheme.typography.labelSmall,
            color = TextMuted.copy(alpha = 0.75f),
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(32.dp))
    }
}

@Composable
private fun LoginTab(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (selected) {
        Button(
            onClick = onClick,
            modifier = modifier.height(42.dp),
            contentPadding = PaddingValues(horizontal = 4.dp),
            shape = RoundedCornerShape(12.dp),
        ) {
            Text(
                label,
                style = MaterialTheme.typography.labelMedium,
                maxLines = 1,
                color = Color.White,
            )
        }
    } else {
        OutlinedButton(
            onClick = onClick,
            modifier = modifier.height(42.dp),
            contentPadding = PaddingValues(horizontal = 4.dp),
            shape = RoundedCornerShape(12.dp),
        ) {
            Text(
                label,
                style = MaterialTheme.typography.labelMedium,
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun OAuthButton(provider: String, onClick: () -> Unit) {
    val brand = brandOf(provider)
    Button(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .height(54.dp),
        shape = RoundedCornerShape(16.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = brand.background,
            contentColor = brand.foreground,
        ),
        elevation = ButtonDefaults.buttonElevation(
            defaultElevation = 2.dp,
            pressedElevation = 1.dp,
            disabledElevation = 0.dp,
        ),
        border = BorderStroke(
            1.dp,
            if (provider == "google") Color(0xFFDADCE0) else Color(0xFFD0D7DE),
        ),
    ) {
        Box(
            modifier = Modifier
                .size(26.dp)
                .background(Color(0x0F000000), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = brand.icon,
                contentDescription = null,
                tint = brand.iconTint,
                modifier = Modifier.size(16.dp),
            )
        }
        Spacer(Modifier.width(12.dp))
        Text(
            "Continuer avec ${Config.providerLabel(provider)}",
            style = MaterialTheme.typography.titleSmall,
        )
    }
}

@Composable
private fun RowScope.HorizontalLine() {
    Box(
        modifier = Modifier
            .weight(1f)
            .height(1.dp)
            .background(MaterialTheme.colorScheme.outline)
    )
}
