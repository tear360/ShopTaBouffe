package com.shoptabouffe.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/* --------------------------------------------------------------- marque */

val Orange = Color(0xFFEF6C33)
val OrangeDark = Color(0xFFD9531B)
val OrangeContainer = Color(0xFF3A2317)
val OnOrangeContainer = Color(0xFFFFC9A8)
val Green = Color(0xFF34D399)
val Red = Color(0xFFFF6B6B)
val Amber = Color(0xFFFFC24B)

/* ----------------------------------------------------- fond & surfaces */

val Background = Color(0xFF0B0C11)
val SurfaceWhite = Color(0xFF16181F)
val SurfaceGrey = Color(0xFF1F222B)
val TextDark = Color(0xFFF3F4F8)
val TextMuted = Color(0xFF9BA3B2)

/* --------------------------------------------------------------- verre */

val GlassSurface = Color(0x12FFFFFF) /* panneau translucide (7 %) */
val GlassSurfaceStrong = Color(0x1FFFFFFF) /* panneau plus marqué (12 %) */
val GlassBorder = Color(0x26FFFFFF) /* bordure fine (15 %) */
val GlassBorderSoft = Color(0x14FFFFFF) /* bordure très douce (8 %) */

/* ----------------------------------------------------------- dégradés */

val AppBackgroundGradient: Brush = Brush.verticalGradient(
    listOf(Color(0xFF171420), Color(0xFF0D0E14), Color(0xFF0A0B0F)),
)

val AccentGradient: Brush = Brush.horizontalGradient(
    listOf(Color(0xFFFFA25C), Orange, OrangeDark),
)

val AccentGradientVertical: Brush = Brush.verticalGradient(
    listOf(Color(0xFFFF9A4D), Orange, OrangeDark),
)

/* ------------------------------------------------------- scheme sombre */

private val DarkColors = darkColorScheme(
    primary = Color(0xFFFFB48A),
    onPrimary = Color(0xFF3A1608),
    primaryContainer = OrangeContainer,
    onPrimaryContainer = OnOrangeContainer,
    secondary = Color(0xFF7BDBB4),
    onSecondary = Color(0xFF053A27),
    secondaryContainer = Color(0xFF12352A),
    onSecondaryContainer = Color(0xFF9FE8CD),
    background = Background,
    onBackground = TextDark,
    surface = SurfaceWhite,
    onSurface = TextDark,
    surfaceVariant = SurfaceGrey,
    onSurfaceVariant = TextMuted,
    outline = Color(0x3DFFFFFF),
    outlineVariant = GlassBorderSoft,
    error = Color(0xFFFFB4AB),
    onError = Color(0xFF690005),
    errorContainer = Color(0xFF4A1512),
    onErrorContainer = Color(0xFFFFB4AB),
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

/** Thème de l'app : toujours sombre, style « liquid glass ». */
@Composable
fun ShopTaBouffeTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColors,
        typography = ShopTaBouffeTypography,
        content = content,
    )
}
