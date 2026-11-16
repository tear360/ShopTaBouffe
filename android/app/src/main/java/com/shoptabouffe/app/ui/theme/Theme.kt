package com.shoptabouffe.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

val Orange = Color(0xFFEF6C33)
val OrangeDark = Color(0xFFD9531B)
val OrangeContainer = Color(0xFFFFE3D3)
val OnOrangeContainer = Color(0xFF7A2E0B)
val Green = Color(0xFF1FA971)
val Red = Color(0xFFD64545)
val Amber = Color(0xFFF2A93B)
val Background = Color(0xFFFDF9F6)
val SurfaceWhite = Color(0xFFFFFFFF)
val SurfaceGrey = Color(0xFFF4EEE9)
val TextDark = Color(0xFF1F1A17)
val TextMuted = Color(0xFF7A6F68)

private val LightColors = lightColorScheme(
    primary = Orange,
    onPrimary = Color.White,
    primaryContainer = OrangeContainer,
    onPrimaryContainer = OnOrangeContainer,
    secondary = Green,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFD6F5E7),
    onSecondaryContainer = Color(0xFF0B5038),
    background = Background,
    onBackground = TextDark,
    surface = SurfaceWhite,
    onSurface = TextDark,
    surfaceVariant = SurfaceGrey,
    onSurfaceVariant = TextMuted,
    outline = Color(0xFFE2DAD3),
    error = Red,
    onError = Color.White,
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFFFB694),
    onPrimary = Color(0xFF5A2100),
    primaryContainer = Color(0xFF7A3A15),
    onPrimaryContainer = Color(0xFFFFDBC9),
    secondary = Color(0xFF7BDBB4),
    onSecondary = Color(0xFF053A27),
    background = Color(0xFF201A17),
    onBackground = Color(0xFFF1E5DE),
    surface = Color(0xFF292220),
    onSurface = Color(0xFFF1E5DE),
    surfaceVariant = Color(0xFF3A3230),
    onSurfaceVariant = Color(0xFFCFC2BC),
    error = Color(0xFFFFB4AB),
    onError = Color(0xFF690005),
)

private val ShopTaBouffeTypography = Typography().run {
    copy(
        headlineSmall = headlineSmall.copy(fontWeight = FontWeight.Bold),
        titleLarge = titleLarge.copy(fontWeight = FontWeight.Bold),
        titleMedium = titleMedium.copy(fontWeight = FontWeight.SemiBold),
        titleSmall = titleSmall.copy(fontWeight = FontWeight.SemiBold),
        labelLarge = labelLarge.copy(fontWeight = FontWeight.SemiBold, letterSpacing = 0.2.sp),
    )
}

@Composable
fun ShopTaBouffeTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = ShopTaBouffeTypography,
        content = content,
    )
}
