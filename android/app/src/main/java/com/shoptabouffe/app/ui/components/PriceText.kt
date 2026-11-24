package com.shoptabouffe.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import com.shoptabouffe.app.core.toPrice

/** Orange fluo du prix remisé (halo compris). */
internal val DiscountPriceColor = Color(0xFFFF9A4D)

private val OriginalPriceColor = Color(0xFF9BA3B2)
private val StrikeColor = Color(0xFFEF6C33)

/**
 * Affiche le prix d'un produit ou d'une formule.
 *
 * Avec une remise active : ancien prix gris barré (double barré, trait orange
 * dessiné par-dessus) puis nouveau prix orange fluo avec halo. Sans remise,
 * le prix normal est affiché avec le style fourni.
 */
@Composable
internal fun DiscountedPriceText(
    priceCents: Int,
    discountPriceCents: Int? = null,
    modifier: Modifier = Modifier,
    style: TextStyle = MaterialTheme.typography.bodyMedium,
) {
    val reducedPrice = discountPriceCents?.takeIf { it > 0 && it < priceCents }
    if (reducedPrice == null) {
        Text(text = priceCents.toPrice(), style = style, modifier = modifier)
        return
    }

    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                text = priceCents.toPrice(),
                style = style.copy(
                    color = OriginalPriceColor,
                    textDecoration = TextDecoration.LineThrough,
                ),
            )
            // Trait orange superposé au texte barré (aucun Painter impliqué).
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(2.dp)
                    .background(StrikeColor),
            )
        }
        Spacer(Modifier.width(6.dp))
        Text(
            text = reducedPrice.toPrice(),
            style = style.copy(
                color = DiscountPriceColor,
                fontWeight = FontWeight.Bold,
                shadow = Shadow(color = DiscountPriceColor, blurRadius = 12f),
            ),
        )
    }
}
