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

    val PROVIDERS = listOf("discord", "github", "google")

    fun providerLabel(provider: String): String = when (provider) {
        "discord" -> "Discord"
        "github" -> "GitHub"
        "google" -> "Google"
        "demo" -> "Démo"
        else -> provider.replaceFirstChar { it.uppercase() }
    }
}
