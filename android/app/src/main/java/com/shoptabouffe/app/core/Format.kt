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
    val millis = isoToEpochMillis() ?: return take(16).replace('T', ' ')
    return SimpleDateFormat("dd/MM HH:mm", Locale.FRANCE).format(Date(millis))
}

/** Variante avec nom de mois. */
fun String?.toDayMonth(): String {
    if (this.isNullOrBlank()) return "—"
    val millis = isoToEpochMillis() ?: return take(10)
    return SimpleDateFormat("dd MMM", Locale.FRANCE).format(Date(millis))
}

/** "2026-11-26 14:30" (ou avec "T") → ISO UTC "2026-11-26T13:30:00Z". */
fun String.localDateTimeToIso(): String? {
    val text = trim().replace('T', ' ')
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

/** Parse `AAAA-MM-JJTHH:mm:ss` (sans fuseau, donc UTC) en millisecondes. */
private fun parseUtcIso(text: String): Long? {
    val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
        isLenient = false
    }
    return try {
        parser.parse(text)?.time
    } catch (_: Exception) {
        null
    }
}

/**
 * ISO 8601 → millisecondes depuis l'époque.
 * Accepte `...Z`, les fractions de seconde et les offsets `±HH:mm`.
 * Le `Z` doit être retiré avant le parse : le motif n'inclut pas de fuseau,
 * sinon `localDateTimeToIso()` produisait une date toujours « invalide ».
 */
fun String?.isoToEpochMillis(): Long? {
    if (this.isNullOrBlank()) return null
    var text = trim().replace(' ', 'T')
    val dot = text.indexOf('.')
    if (dot >= 0) text = text.substring(0, dot)
    if (text.endsWith("Z", ignoreCase = true)) {
        text = text.dropLast(1)
    } else if (text.length >= 6) {
        val offset = text.takeLast(6)
        if (offset[0] == '+' || offset[0] == '-') {
            val base = parseUtcIso(text.dropLast(6)) ?: return null
            val hours = offset.substring(1, 3).toIntOrNull() ?: return null
            val minutes = offset.substring(4, 6).toIntOrNull() ?: return null
            val delta = (hours * 60 + minutes) * 60_000L
            return if (offset[0] == '+') base - delta else base + delta
        }
    }
    return parseUtcIso(text)
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
