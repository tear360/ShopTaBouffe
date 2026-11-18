package com.shoptabouffe.app.core

import com.shoptabouffe.app.BuildConfig

object Config {
    /** Racine du backend, avec "/" final : http://10.0.2.2:3000/ */
    const val BASE_URL: String = BuildConfig.BASE_URL

    /** Base des routes REST, avec "/" final : http://10.0.2.2:3000/api/ */
    val API_URL: String = BASE_URL + "api/"

    /** URL sans "/" final (utilisée par Socket.IO). */
    val HOST: String = BASE_URL.trimEnd('/')

    /** Construit une URL d'API : api("products") → http://host/api/products */
    fun api(path: String): String = API_URL + path.trimStart('/')

    /** Ordre d'affichage sur la page de connexion : Google, puis GitHub. */
    val PROVIDERS = listOf("google", "github")

    /**
     * Catégories par défaut (repli si la table `categories` du serveur est
     * indisponible) : on ne tape plus un nom de catégorie à chaque fois.
     */
    val CATEGORIES = listOf(
        "Pizza",
        "Burger",
        "Sushi",
        "Dessert",
        "Boisson",
        "Sandwich",
        "Salade",
        "Snack",
        "Plat",
        "Épicerie",
    )

    fun providerLabel(provider: String): String = when (provider) {
        "github" -> "GitHub"
        "google" -> "Google"
        "demo" -> "Invité"
        else -> provider.replaceFirstChar { it.uppercase() }
    }
}
