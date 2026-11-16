package com.shoptabouffe.app.core

import android.content.Context
import com.shoptabouffe.app.core.models.User
import kotlinx.coroutines.flow.MutableStateFlow

/**
 * Session utilisateur : token JWT + profil, persistés dans SharedPreferences.
 * Singleton initialisé par [com.shoptabouffe.app.ShopTaBouffeApp].
 */
class Session private constructor(context: Context) {

    private val prefs = context.applicationContext
        .getSharedPreferences("shoptabouffe_session", Context.MODE_PRIVATE)

    /** Profil courant, null tant que le token n'est pas résolu. */
    val user = MutableStateFlow<User?>(null)

    var token: String? = prefs.getString(KEY_TOKEN, null)
        private set

    val isLoggedIn: Boolean get() = token != null

    fun saveToken(newToken: String) {
        prefs.edit().putString(KEY_TOKEN, newToken).apply()
        token = newToken
        user.value = null
    }

    fun setUser(newUser: User?) {
        user.value = newUser
    }

    fun logout() {
        prefs.edit().remove(KEY_TOKEN).apply()
        token = null
        user.value = null
    }

    companion object {
        private const val KEY_TOKEN = "token"

        @Volatile
        private var instance: Session? = null

        fun init(context: Context) {
            if (instance == null) synchronized(this) {
                if (instance == null) {
                    instance = Session(context.applicationContext)
                }
            }
        }

        fun get(context: Context): Session {
            instance?.let { return it }
            init(context)
            return instance!!
        }

        /** Pour les utilitaires sans Context (intercepteur HTTP, Socket.IO). */
        val current: Session? get() = instance
    }
}
