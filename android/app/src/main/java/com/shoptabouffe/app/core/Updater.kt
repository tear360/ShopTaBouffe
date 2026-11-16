package com.shoptabouffe.app.core

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.google.gson.Gson
import com.shoptabouffe.app.BuildConfig
import java.io.File
import java.io.FileOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import retrofit2.HttpException

/**
 * Auto mise à jour depuis GitHub Releases.
 *
 * 1. `check()` interroge `GET https://api.github.com/repos/<owner>/<repo>/releases/latest`
 *    et compare le tag (`v1.2.0`) à [BuildConfig.VERSION_NAME] → `null` si à jour.
 * 2. `download()` récupère l'asset `.apk` dans `filesDir/updates/update.apk`.
 * 3. `install()` lance l'installateur système sur ce fichier (FileProvider).
 *
 * Le repo est public : aucun jeton n'est nécessaire.
 */
object Updater {

    /** Compte + dépôt GitHub public contenant les releases (APK). */
    const val OWNER: String = "tear360"
    const val REPO: String = "ShopTaBouffe"

    /** URL de l'API de la dernière release. */
    val RELEASES_URL: String get() = "https://api.github.com/repos/$OWNER/$REPO/releases/latest"

    private val gson = Gson()

    private val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
            .readTimeout(60, java.util.concurrent.TimeUnit.SECONDS)
            .build()
    }

    /** Dernière release, ou `null` si l'app est déjà à jour. */
    data class Available(
        val version: String,
        val notes: String,
        val apkUrl: String,
        val apkName: String,
    )

    /** Téléchargement terminé : fichier prêt à être installé. */
    data class Ready(val file: File, val version: String)

    /* ------------------------------------------------------------ vérification */

    /** Interroge GitHub. Retourne `Success(null)` quand aucune mise à jour n'est disponible. */
    suspend fun check(): ApiResult<Available?> = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url(RELEASES_URL)
                .header("Accept", "application/vnd.github+json")
                .header("User-Agent", "ShopTaBouffe/${BuildConfig.VERSION_NAME}")
                .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    return@withContext ApiResult.Failure(
                        when (response.code) {
                            403, 429 -> "GitHub limite les requêtes, réessayez plus tard."
                            404 -> "Aucune release trouvée pour $REPO."
                            else -> "GitHub a répondu ${response.code}."
                        },
                        response.code,
                    )
                }
                val body = response.body?.string()
                    ?: return@withContext ApiResult.Failure("Réponse GitHub vide.")
                val json = gson.fromJson(body, com.google.gson.JsonObject::class.java)
                val tag = json.get("tag_name")?.asString.orEmpty().removePrefix("v")
                if (tag.isBlank() || !isNewer(tag, BuildConfig.VERSION_NAME)) {
                    return@withContext ApiResult.Success(null)
                }
                val assets = json.getAsJsonArray("assets")
                val apk = assets
                    ?.mapNotNull { it.asJsonObject }
                    ?.firstOrNull { it.get("name")?.asString?.endsWith(".apk") == true }
                    ?: return@withContext ApiResult.Failure("La release $tag ne contient pas d’APK.")
                ApiResult.Success(
                    Available(
                        version = tag,
                        notes = json.get("body")?.asString.orEmpty().trim(),
                        apkUrl = apk.get("browser_download_url")?.asString.orEmpty(),
                        apkName = apk.get("name")?.asString ?: "update.apk",
                    ),
                )
            }
        } catch (e: HttpException) {
            ApiResult.Failure("GitHub indisponible (${e.code()}).", e.code())
        } catch (e: Exception) {
            ApiResult.Failure("Impossible de contacter GitHub : ${e.message ?: "erreur réseau"}", 0)
        }
    }

    /** "1.2.0" > "1.10.0" ? Comparaison segment par segment. */
    fun isNewer(candidate: String, current: String): Boolean {
        val a = candidate.split('.').mapNotNull { it.toIntOrNull() }
        val b = current.split('.').mapNotNull { it.toIntOrNull() }
        if (a.isEmpty() || b.isEmpty()) return false
        for (i in 0 until maxOf(a.size, b.size)) {
            val left = a.getOrElse(i) { 0 }
            val right = b.getOrElse(i) { 0 }
            if (left != right) return left > right
        }
        return false
    }

    /* ------------------------------------------------------------- téléchargement */

    /** Télécharge l'APK dans le stockage interne (fichier remplacé à chaque fois). */
    suspend fun download(context: Context, update: Available): ApiResult<Ready> =
        withContext(Dispatchers.IO) {
            try {
                val dir = File(context.filesDir, "updates").apply { mkdirs() }
                val target = File(dir, "update.apk")
                val request = Request.Builder()
                    .url(update.apkUrl)
                    .header("User-Agent", "ShopTaBouffe/${BuildConfig.VERSION_NAME}")
                    .build()
                client.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        return@withContext ApiResult.Failure(
                            "Téléchargement impossible (HTTP ${response.code}).",
                            response.code,
                        )
                    }
                    val source = response.body?.byteStream()
                        ?: return@withContext ApiResult.Failure("Fichier vide.")
                    FileOutputStream(target).use { out ->
                        source.use { it.copyTo(out) }
                    }
                }
                if (!target.exists() || target.length() < 1024) {
                    target.delete()
                    return@withContext ApiResult.Failure("Le téléchargement est incomplet.")
                }
                ApiResult.Success(Ready(target, update.version))
            } catch (e: Exception) {
                ApiResult.Failure("Téléchargement échoué : ${e.message ?: "erreur réseau"}", 0)
            }
        }

    /* --------------------------------------------------------------- installation */

    /** L'app a-t-elle le droit d'installer des APK (Android 8+) ? */
    fun canInstall(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
            context.packageManager.canRequestPackageInstalls()

    /** Ouvre les réglages « installer des apps inconnues » pour cet app. */
    fun requestInstallPermission(context: Context) {
        val intent = Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:${context.packageName}"),
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { context.startActivity(intent) }
    }

    /** Lance l'installateur système sur l'APK téléchargé. */
    fun install(context: Context, file: File): Boolean {
        if (!file.exists()) return false
        return try {
            val uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                file,
            )
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            true
        } catch (_: Exception) {
            false
        }
    }
}
