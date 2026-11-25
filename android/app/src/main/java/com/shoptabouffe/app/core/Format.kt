package com.shoptabouffe.app.core

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

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

/** "2026-11-26 14:30" (heure locale) → ISO UTC "2026-11-26T13:30:00Z". */
fun String.localDateTimeToIso(): String? {
    val text = trim()
    if (!text.matches(Regex("^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}$"))) return null
    val parser = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.FRANCE).apply { isLenient = false }
    val date = try {
        parser.parse(text)
    } catch (_: Exception) {
        null
    } ?: return null
    val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }
    return formatter.format(date)
}

/** ISO 8601 (fraction de seconde tolérée) → millisecondes depuis l'époque. */
fun String?.isoToEpochMillis(): Long? {
    if (this.isNullOrBlank()) return null
    val text = substringBefore(".").take(19)
    val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
        isLenient = false
    }
    return try {
        parser.parse(text)?.time
    } catch (_: Exception) {
        null
    }
}

/** ISO UTC → heure locale "dd/MM HH:mm" (repli sur la conversion simple). */
fun String?.toLocalDateTimeLabel(): String {
    val millis = isoToEpochMillis() ?: return toShortDateTime()
    return SimpleDateFormat("dd/MM HH:mm", Locale.FRANCE).format(Date(millis))
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
