package com.shoptabouffe.app

import android.app.Application
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.shoptabouffe.app.core.Api
import com.shoptabouffe.app.core.ApiResult
import com.shoptabouffe.app.core.models.AuthResponse
import com.shoptabouffe.app.core.Cart
import com.shoptabouffe.app.core.Config
import com.shoptabouffe.app.core.Session
import com.shoptabouffe.app.core.SocketManager
import com.shoptabouffe.app.core.Updater
import com.shoptabouffe.app.core.models.CredentialsBody
import com.shoptabouffe.app.core.models.RegisterBody
import com.shoptabouffe.app.core.models.User
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** État global de l'application (authentification + messages de bas d'écran). */
class MainViewModel(app: Application) : AndroidViewModel(app) {

    sealed interface AuthState {
        data object Loading : AuthState
        data object LoggedOut : AuthState
        data class LoggedIn(val user: User) : AuthState
        data class Failed(val message: String) : AuthState
    }

    private val session = Session.get(app)

    private val _auth = MutableStateFlow<AuthState>(AuthState.Loading)
    val auth: StateFlow<AuthState> = _auth.asStateFlow()

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    /** Message destiné à l'écran de connexion (erreur OAuth…). */
    private val _loginNotice = MutableStateFlow<String?>(null)
    val loginNotice: StateFlow<String?> = _loginNotice.asStateFlow()

    /**
     * Ancien compte « par nom » encore connecté : on ne le supprime pas, on
     * affiche un écran obligatoire de finalisation (username + mot de passe).
     * Le nom du compte est repris tel quel par l'UI.
     */
    private val _needsUpgrade = MutableStateFlow<User?>(null)
    val needsUpgrade: StateFlow<User?> = _needsUpgrade.asStateFlow()

    /* ------------------------------------------------------- mise à jour */

    sealed interface UpdateState {
        data object Idle : UpdateState
        data object Checking : UpdateState
        data class Available(val update: Updater.Available) : UpdateState
        data object Downloading : UpdateState
        data class Ready(val ready: Updater.Ready) : UpdateState
        data object UpToDate : UpdateState
        data class Failed(val message: String) : UpdateState
    }

    private val _update = MutableStateFlow<UpdateState>(UpdateState.Idle)
    val update: StateFlow<UpdateState> = _update.asStateFlow()

    /** Message à afficher suite à une vérification manuelle (Profil → Mise à jour). */
    private val _updateNotice = MutableStateFlow<String?>(null)
    val updateNotice: StateFlow<String?> = _updateNotice.asStateFlow()

    init {
        resolveSession()
        checkForUpdate()
    }

    /* ------------------------------------------------------------ session */

    /** Charge le profil à partir du token stocké (ou rend LoggedOut). */
    fun resolveSession() {
        val token = session.token
        if (token == null) {
            _needsUpgrade.value = null
            _auth.value = AuthState.LoggedOut
            return
        }
        _auth.value = AuthState.Loading
        viewModelScope.launch {
            when (val result = Api.call { Api.service.me() }) {
                is ApiResult.Success -> {
                    session.setUser(result.data)
                    _needsUpgrade.value =
                        if (result.data.provider == "demo") result.data else null
                    _auth.value = AuthState.LoggedIn(result.data)
                    SocketManager.connect()
                    if (result.data.isSupplier) SocketManager.watchOrders()
                }

                is ApiResult.Failure -> {
                    if (result.code == 401) {
                        session.logout()
                        SocketManager.disconnect()
                        _needsUpgrade.value = null
                        _auth.value = AuthState.LoggedOut
                        _loginNotice.value = "Votre session a expiré, reconnectez-vous."
                    } else {
                        _auth.value = AuthState.Failed(result.message)
                    }
                }
            }
        }
    }

    /** Reçu du deep link shoptabouffe://auth?... */
    fun onAuthRedirect(uri: Uri) {
        val token = uri.getQueryParameter("token")
        val error = uri.getQueryParameter("error")
        when {
            !token.isNullOrBlank() -> {
                SocketManager.disconnect()
                session.saveToken(token)
                _loginNotice.value = null
                resolveSession()
            }

            !error.isNullOrBlank() -> {
                _loginNotice.value = errorDescription(error)
                _auth.value = AuthState.LoggedOut
            }

            else -> {
                _loginNotice.value = "Réponse du fournisseur incomplète."
                _auth.value = AuthState.LoggedOut
            }
        }
    }

    private fun errorDescription(code: String): String = when (code) {
        "not_configured" ->
            "Connexion non configurée : ajoutez les clés OAuth de ce fournisseur sur le serveur " +
                "(voir docs/OAUTH_SETUP.md)."
        "state_mismatch" -> "La session OAuth n'est pas valide, réessayez."
        "missing_code" -> "Le fournisseur n'a pas renvoyé d'autorisation."
        "provider_error" -> "Le fournisseur a refusé la connexion."
        else -> "Échec de la connexion ($code)."
    }

    /* -------------------------------------------------------------- login */

    /** Ouvre le parcours OAuth dans un Custom Tab (le retour se fait en deep link). */
    fun startOAuth(provider: String, context: Context) {
        _loginNotice.value = null
        val url = Config.api("auth/start?provider=$provider")
        val customTabs = CustomTabsIntent.Builder().setShowTitle(true).build()
        customTabs.intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val opened = runCatching { customTabs.launchUrl(context, Uri.parse(url)) }.isSuccess
        if (!opened) {
            runCatching {
                context.startActivity(
                    Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            }.onFailure {
                _loginNotice.value = "Impossible d'ouvrir le navigateur."
            }
        }
    }

    fun consumeLoginNotice() {
        _loginNotice.value = null
    }

    /** Connexion par nom d'utilisateur + mot de passe. */
    fun login(rawUsername: String, password: String) {
        val username = rawUsername.trim()
        if (username.isEmpty() || password.isEmpty()) {
            _loginNotice.value = "Nom d'utilisateur et mot de passe requis."
            return
        }
        _loginNotice.value = null
        _busy.value = true
        viewModelScope.launch {
            when (val result = Api.call { Api.service.login(CredentialsBody(username, password)) }) {
                is ApiResult.Success -> applyAuth(result.data, "Le serveur n'a pas renvoyé de jeton.")
                is ApiResult.Failure -> _loginNotice.value = result.message
            }
            _busy.value = false
        }
    }

    /** Inscription : nom + utilisateur + mot de passe. */
    fun registerAccount(name: String, rawUsername: String, password: String) {
        val username = rawUsername.trim()
        if (name.isBlank() || username.isEmpty() || password.length < 6) {
            _loginNotice.value = "Nom, utilisateur (3 caractères min.) et mot de passe (6 min.) requis."
            return
        }
        _loginNotice.value = null
        _busy.value = true
        viewModelScope.launch {
            when (
                val result =
                    Api.call { Api.service.register(RegisterBody(name.trim(), username, password)) }
            ) {
                is ApiResult.Success -> applyAuth(result.data, "Le serveur n'a pas renvoyé de jeton.")
                is ApiResult.Failure -> _loginNotice.value = result.message
            }
            _busy.value = false
        }
    }

    /**
     * Upgrade d'un compte invité (créé par nom) vers un compte complet.
     * Toutes les données existantes sont conservées côté serveur.
     */
    fun upgradeAccount(name: String, rawUsername: String, password: String) {
        val username = rawUsername.trim()
        if (name.isBlank() || username.isEmpty() || password.length < 6) {
            _updateNotice.value = "Nom, utilisateur (3 caractères min.) et mot de passe (6 min.) requis."
            return
        }
        _updateNotice.value = null
        _busy.value = true
        viewModelScope.launch {
            when (
                val result =
                    Api.call { Api.service.upgradeAccount(RegisterBody(name.trim(), username, password)) }
            ) {
                is ApiResult.Success -> {
                    result.data.token?.let { token ->
                        session.saveToken(token)
                        _auth.value = AuthState.Loading
                        resolveSession()
                    } ?: run {
                        _updateNotice.value = "Le serveur n'a pas renvoyé de jeton."
                    }
                }

                is ApiResult.Failure -> _updateNotice.value = result.message
            }
            _busy.value = false
        }
    }

    private fun applyAuth(response: AuthResponse, missingMessage: String) {
        response.token?.let { token ->
            SocketManager.disconnect()
            session.saveToken(token)
            _auth.value = AuthState.Loading
            resolveSession()
        } ?: run {
            _loginNotice.value = missingMessage
        }
    }

    /* --------------------------------------------------------- mise à jour */

    /** Vérifie GitHub Releases ; silencieux, ne déclenche aucune UI de feedback. */
    fun checkForUpdate() {
        if (_update.value is UpdateState.Checking ||
            _update.value is UpdateState.Downloading ||
            _update.value is UpdateState.Ready
        ) return
        _update.value = UpdateState.Checking
        viewModelScope.launch {
            when (val result = Updater.check()) {
                is ApiResult.Success -> _update.value = if (result.data == null) {
                    UpdateState.UpToDate
                } else {
                    UpdateState.Available(result.data)
                }

                is ApiResult.Failure -> _update.value = UpdateState.Failed(result.message)
            }
        }
    }

    /** Vérification déclenchée par l'utilisateur : publie un message dans le profil. */
    fun checkForUpdateInteractive() {
        checkForUpdate()
        viewModelScope.launch {
            // laisse le temps à checkForUpdate() de poser l'état
            kotlinx.coroutines.delay(150)
            _updateNotice.value = when (val s = _update.value) {
                is UpdateState.Available -> "Mise à jour ${s.update.version} disponible."
                UpdateState.UpToDate -> "Vous êtes à jour (v${BuildConfig.VERSION_NAME})."
                is UpdateState.Failed -> s.message
                else -> null
            }
        }
    }

    fun consumeUpdateNotice() {
        _updateNotice.value = null
    }

    /** Télécharge l'APK de la dernière release. */
    fun downloadUpdate(context: Context) {
        val available = (_update.value as? UpdateState.Available)?.update ?: return
        _update.value = UpdateState.Downloading
        viewModelScope.launch {
            when (val result = Updater.download(context, available)) {
                is ApiResult.Success -> _update.value = UpdateState.Ready(result.data)
                is ApiResult.Failure -> _update.value = UpdateState.Failed(result.message)
            }
        }
    }

    /** Ouvre l'installateur sur l'APK téléchargé (demande d'abord le droit si nécessaire). */
    fun installUpdate(context: Context) {
        val ready = (_update.value as? UpdateState.Ready)?.ready ?: return
        if (!Updater.canInstall(context)) {
            Updater.requestInstallPermission(context)
            return
        }
        if (!Updater.install(context, ready.file)) {
            _update.value = UpdateState.Failed("Impossible d’ouvrir l’installateur.")
        }
    }

    /** Referme le dialogue de mise à jour (l'utilisateur fera « Plus tard »). */
    fun dismissUpdate() {
        _update.value = UpdateState.Idle
    }

    /* --------------------------------------------------------- compte/ui */

    /** Appelé après une mutation de profil (code fournisseur, etc.). */
    fun updateUser(user: User) {
        session.setUser(user)
        _auth.value = AuthState.LoggedIn(user)
        if (user.isSupplier) SocketManager.watchOrders()
    }

    fun refreshUser(onDone: ((ApiResult<User>) -> Unit)? = null) {
        viewModelScope.launch {
            val result = Api.call { Api.service.me() }
            if (result is ApiResult.Success) updateUser(result.data)
            onDone?.invoke(result)
        }
    }

    fun logout() {
        // Un ancien compte invité ne doit pas pouvoir se déconnecter avant
        // d'avoir choisi ses identifiants : il ne pourrait plus se reconnecter.
        if (_needsUpgrade.value != null) {
            _updateNotice.value = "Finalisez votre compte avant de vous déconnecter."
            return
        }
        SocketManager.disconnect()
        session.logout()
        Cart.clear()
        _needsUpgrade.value = null
        _loginNotice.value = null
        _auth.value = AuthState.LoggedOut
    }
}
