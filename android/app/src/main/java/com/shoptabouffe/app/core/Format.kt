package com.shoptabouffe.app.core

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** 950 → "9,50 €" */
fun Int.toPrice(): String {
    val euros = this / 100
    val cents = Math.abs(this % 100)
    return String.format(Locale.FRANCE, "%d,%02d €", euros, cents)
}

/** 950 → "9,50" (champ de saisie prix fournisseur). */
fun Int.toPriceInput(): String {
    val euros = this / 100
    val cents = Math.abs(this % 100)
    return String.format(Locale.FRANCE, "%d,%02d", euros, cents)
}

/** "9,50" → 950 centimes. Retourne null si la saisie est invalide. */
fun String.eurosToCents(): Int? {
    val cleaned = trim().replace(",", ".").replace("€", "").trim()
    if (cleaned.isEmpty()) return null
    val parts = cleaned.split(".")
    val euros = parts[0].toIntOrNull() ?: return null
    val cents = when {
        parts.size == 1 -> 0
        else -> (parts[1] + "00").take(2).toIntOrNull() ?: return null
    }
    if (euros < 0) return null
    return euros * 100 + cents
}

/** "2026-11-15T14:32:07.000Z" → "15/11 14:32" (best effort, pas de java.time pour minSdk 24). */
fun String?.toShortDateTime(): String {
    if (this.isNullOrBlank()) return "—"
    return try {
        val isoInput = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.FRANCE)
        val isoOutput = SimpleDateFormat("dd/MM HH:mm", Locale.FRANCE)
        isoOutput.format(isoInput.parse(this.substringBefore(".").take(19)) ?: return "—")
    } catch (_: Exception) {
        take(16).replace('T', ' ')
    }
}

/** Variante avec nom de mois. */
fun String?.toDayMonth(): String {
    if (this.isNullOrBlank()) return "—"
    return try {
        val isoInput = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.FRANCE)
        val isoDay = SimpleDateFormat("dd MMM", Locale.FRANCE)
        isoDay.format(isoInput.parse(this.substringBefore(".").take(19)) ?: return "—")
    } catch (_: Exception) {
        take(10)
    }
}

/** Date courante formatée pour l'UI (debug / journal). */
fun nowClock(): String =
    SimpleDateFormat("HH:mm:ss", Locale.FRANCE).format(Date())

val ORDER_STATUSES = listOf("pending", "accepted", "preparing", "delivering", "delivered", "refused")

fun String.statusLabel(): String = when (this) {
    "pending" -> "En attente"
    "accepted" -> "Acceptée"
    "preparing" -> "En préparation"
    "delivering" -> "En livraison"
    "delivered" -> "Livrée"
    "refused" -> "Refusée"
    else -> this
}
