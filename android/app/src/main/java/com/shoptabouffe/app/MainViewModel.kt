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
import com.shoptabouffe.app.core.models.AccountInfo
import com.shoptabouffe.app.core.models.AccountLinkBody
import com.shoptabouffe.app.core.models.AccountPatch
import com.shoptabouffe.app.core.models.AuthResponse
import com.shoptabouffe.app.core.models.DeleteAccountBody
import com.shoptabouffe.app.core.models.ForgotPasswordBody
import com.shoptabouffe.app.core.models.OkResponse
import com.shoptabouffe.app.core.models.PasswordChangeBody
import com.shoptabouffe.app.core.models.PasswordChangeResponse
import com.shoptabouffe.app.core.models.TwoFactorCodeBody
import com.shoptabouffe.app.core.models.TwoFactorDisableBody
import com.shoptabouffe.app.core.models.TwoFactorEnableResponse
import com.shoptabouffe.app.core.models.TwoFactorStartResponse
import com.shoptabouffe.app.core.models.TwoFactorVerifyBody
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

    /** Défi 2FA renvoyé par POST /auth/login (connexion par mot de passe uniquement). */
    private val _twoFactorChallenge = MutableStateFlow<String?>(null)
    val twoFactorChallenge: StateFlow<String?> = _twoFactorChallenge.asStateFlow()

    /** Erreur du dialogue 2FA, distincte du bandeau de connexion. */
    private val _twoFactorNotice = MutableStateFlow<String?>(null)
    val twoFactorNotice: StateFlow<String?> = _twoFactorNotice.asStateFlow()

    sealed interface ForgotPasswordState {
        data object Idle : ForgotPasswordState
        data object Sending : ForgotPasswordState
        data object Sent : ForgotPasswordState
        data class Failed(val message: String) : ForgotPasswordState
    }

    /** Dialogue « Mot de passe oublié ? » : toujours la même confirmation. */
    private val _forgotPasswordState = MutableStateFlow<ForgotPasswordState>(ForgotPasswordState.Idle)
    val forgotPasswordState: StateFlow<ForgotPasswordState> = _forgotPasswordState.asStateFlow()

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

    /* ------------------------------------------------------------ compte */

    /** Profil enrichi (email, téléphone, identités liées) chargé par l'écran Profil. */
    private val _account = MutableStateFlow<AccountInfo?>(null)
    val account: StateFlow<AccountInfo?> = _account.asStateFlow()

    private val _accountBusy = MutableStateFlow(false)
    val accountBusy: StateFlow<Boolean> = _accountBusy.asStateFlow()

    /** Confirmations et erreurs des actions de gestion du compte. */
    private val _accountNotice = MutableStateFlow<String?>(null)
    val accountNotice: StateFlow<String?> = _accountNotice.asStateFlow()

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
        val linked = uri.getQueryParameter("linked")
        when {
            // Retour d'une liaison de compte : pas de nouveau token, on recharge
            // simplement le profil enrichi pour afficher la nouvelle identité.
            !linked.isNullOrBlank() -> {
                _accountNotice.value = "Compte ${Config.providerLabel(linked)} lié."
                loadAccount()
            }

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
        if (!openInBrowser(context, Config.api("auth/start?provider=$provider"))) {
            _loginNotice.value = "Impossible d'ouvrir le navigateur."
        }
    }

    /** Ouvre une URL dans un Custom Tab, avec repli sur le navigateur système. */
    private fun openInBrowser(context: Context, url: String): Boolean {
        val customTabs = CustomTabsIntent.Builder().setShowTitle(true).build()
        customTabs.intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (runCatching { customTabs.launchUrl(context, Uri.parse(url)) }.isSuccess) return true
        return runCatching {
            context.startActivity(
                Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }.isSuccess
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
        _twoFactorNotice.value = null
        _twoFactorChallenge.value = null
        _busy.value = true
        viewModelScope.launch {
            when (val result = Api.call { Api.service.login(CredentialsBody(username, password)) }) {
                is ApiResult.Success -> {
                    val response = result.data
                    when {
                        // 2FA uniquement sur la connexion par mot de passe (jamais OAuth).
                        response.twoFactorRequired && !response.challengeToken.isNullOrBlank() -> {
                            _twoFactorChallenge.value = response.challengeToken
                        }
                        response.twoFactorRequired ->
                            _loginNotice.value = "Le serveur n'a pas renvoyé de défi de sécurité."
                        else -> applyAuth(response, "Le serveur n'a pas renvoyé de jeton.")
                    }
                }
                is ApiResult.Failure -> _loginNotice.value = result.message
            }
            _busy.value = false
        }
    }

    /** Étape 2 d'une connexion protégée : code TOTP ou code de récupération. */
    fun verifyTwoFactor(challengeToken: String, code: String? = null, recoveryCode: String? = null) {
        val totp = code?.trim().orEmpty()
        val recovery = recoveryCode?.trim().orEmpty()
        if (totp.isEmpty() && recovery.isEmpty()) {
            _twoFactorNotice.value = "Saisissez un code de sécurité ou un code de récupération."
            return
        }
        _twoFactorNotice.value = null
        _busy.value = true
        viewModelScope.launch {
            when (
                val result = Api.call {
                    Api.service.verifyTwoFactor(
                        TwoFactorVerifyBody(
                            challengeToken = challengeToken,
                            code = totp.ifBlank { null },
                            recoveryCode = recovery.ifBlank { null },
                        ),
                    )
                }
            ) {
                is ApiResult.Success -> applyAuth(result.data, "Le serveur n'a pas renvoyé de jeton.")
                is ApiResult.Failure -> _twoFactorNotice.value = result.message
            }
            _busy.value = false
        }
    }

    fun cancelTwoFactor() {
        _twoFactorChallenge.value = null
        _twoFactorNotice.value = null
    }

    /** Ouvre le dialogue « Mot de passe oublié ? » à l'état initial. */
    fun resetForgotPassword() {
        _forgotPasswordState.value = ForgotPasswordState.Idle
    }

    /** POST /auth/forgot-password — toujours une confirmation neutre, sans énumération. */
    fun forgotPassword(rawEmail: String) {
        val email = rawEmail.trim()
        if (email.isEmpty()) {
            _forgotPasswordState.value = ForgotPasswordState.Failed("Saisissez votre adresse e-mail.")
            return
        }
        _forgotPasswordState.value = ForgotPasswordState.Sending
        viewModelScope.launch {
            _forgotPasswordState.value = when (
                val result = Api.call { Api.service.forgotPassword(ForgotPasswordBody(email)) }
            ) {
                is ApiResult.Success -> ForgotPasswordState.Sent
                is ApiResult.Failure -> ForgotPasswordState.Failed(result.message)
            }
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
            _twoFactorChallenge.value = null
            _twoFactorNotice.value = null
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

    /** Charge GET /api/account (téléphone, identités, mot de passe). */
    fun loadAccount() {
        _accountBusy.value = true
        viewModelScope.launch {
            when (val result = Api.call { Api.service.account() }) {
                is ApiResult.Success -> {
                    _account.value = result.data
                    updateUser(result.data.toUser())
                }

                is ApiResult.Failure -> _accountNotice.value = result.message
            }
            _accountBusy.value = false
        }
    }

    /** PATCH /api/account — une chaîne vide efface le champ côté serveur. */
    fun patchAccount(email: String, phone: String) {
        _accountBusy.value = true
        viewModelScope.launch {
            when (
                val result = Api.call {
                    Api.service.updateAccount(AccountPatch(email.trim(), phone.trim()))
                }
            ) {
                is ApiResult.Success -> {
                    _account.value = result.data
                    updateUser(result.data.toUser())
                    _accountNotice.value = "Compte mis à jour."
                }

                is ApiResult.Failure -> _accountNotice.value = result.message
            }
            _accountBusy.value = false
        }
    }

    /**
     * POST /api/account/password — le serveur révoque tous les anciens jetons.
     * Le nouveau JWT doit remplacer immédiatement le token stocké, sinon
     * l'utilisateur est déconnecté à la prochaine requête.
     */
    fun changePassword(
        currentPassword: String,
        newPassword: String,
        onDone: ((Boolean) -> Unit)? = null,
    ) {
        if (currentPassword.isEmpty() || newPassword.length < 6) {
            _accountNotice.value = "Mot de passe actuel requis et nouveau mot de passe (6 min.)."
            onDone?.invoke(false)
            return
        }
        _accountBusy.value = true
        viewModelScope.launch {
            var success = false
            when (
                val result = Api.call {
                    Api.service.changePassword(PasswordChangeBody(currentPassword, newPassword))
                }
            ) {
                is ApiResult.Success -> {
                    val token = result.data.token
                    if (token.isNullOrBlank()) {
                        _accountNotice.value = "Le serveur n'a pas renvoyé de nouveau jeton, reconnectez-vous."
                    } else {
                        session.saveToken(token)
                        refreshUser()
                        _accountNotice.value = "Mot de passe modifié."
                        success = true
                    }
                }
                is ApiResult.Failure -> _accountNotice.value = result.message
            }
            _accountBusy.value = false
            onDone?.invoke(success)
        }
    }

    /** POST /api/account/2fa/start : secret en attente + QR (non actif tant que enable). */
    fun startTwoFactor(onResult: (ApiResult<TwoFactorStartResponse>) -> Unit) {
        _accountBusy.value = true
        viewModelScope.launch {
            val result = Api.call { Api.service.startTwoFactor() }
            if (result is ApiResult.Failure) _accountNotice.value = result.message
            _accountBusy.value = false
            onResult(result)
        }
    }

    /** POST /api/account/2fa/enable : renvoie les 8 codes de récupération à afficher une fois. */
    fun enableTwoFactor(code: String, onResult: (ApiResult<TwoFactorEnableResponse>) -> Unit) {
        val totp = code.trim()
        if (totp.length != 6) {
            _accountNotice.value = "Saisissez le code à 6 chiffres de votre application."
            onResult(ApiResult.Failure(_accountNotice.value.orEmpty()))
            return
        }
        _accountBusy.value = true
        viewModelScope.launch {
            val result = Api.call { Api.service.enableTwoFactor(TwoFactorCodeBody(totp)) }
            when (result) {
                is ApiResult.Success -> {
                    _account.value = _account.value?.copy(twoFactorEnabled = true)
                    _accountNotice.value = "Double authentification activée."
                }
                is ApiResult.Failure -> _accountNotice.value = result.message
            }
            _accountBusy.value = false
            onResult(result)
        }
    }

    /** POST /api/account/2fa/disable : mot de passe requis si le compte en possède un. */
    fun disableTwoFactor(
        code: String,
        password: String?,
        onResult: (ApiResult<TwoFactorEnableResponse>) -> Unit,
    ) {
        val totp = code.trim()
        if (totp.length != 6) {
            _accountNotice.value = "Saisissez le code à 6 chiffres de votre application."
            onResult(ApiResult.Failure(_accountNotice.value.orEmpty()))
            return
        }
        _accountBusy.value = true
        viewModelScope.launch {
            val result = Api.call {
                Api.service.disableTwoFactor(TwoFactorDisableBody(totp, password?.takeIf { it.isNotBlank() }))
            }
            when (result) {
                is ApiResult.Success -> {
                    _account.value = _account.value?.copy(twoFactorEnabled = false)
                    _accountNotice.value = "Double authentification désactivée."
                }
                is ApiResult.Failure -> _accountNotice.value = result.message
            }
            _accountBusy.value = false
            onResult(result)
        }
    }

    /** Lance le parcours OAuth de liaison, le retour se fait en deep link « linked ». */
    fun linkAccount(provider: String, context: Context) {
        _accountBusy.value = true
        viewModelScope.launch {
            when (val result = Api.call { Api.service.linkAccount(AccountLinkBody(provider, "app")) }) {
                is ApiResult.Success -> {
                    val url = result.data.url
                    if (url.isNullOrBlank() || !openInBrowser(context, url)) {
                        _accountNotice.value = "Impossible d'ouvrir le navigateur."
                    }
                }

                is ApiResult.Failure -> _accountNotice.value = result.message
            }
            _accountBusy.value = false
        }
    }

    /** Supprime une identité liée (le serveur refuse de laisser le compte sans accès). */
    fun unlinkAccount(provider: String) {
        _accountBusy.value = true
        viewModelScope.launch {
            when (val result = Api.call { Api.service.unlinkAccount(provider) }) {
                is ApiResult.Success -> {
                    _account.value = result.data
                    updateUser(result.data.toUser())
                    _accountNotice.value = "Compte ${Config.providerLabel(provider)} dissocié."
                }

                is ApiResult.Failure -> _accountNotice.value = result.message
            }
            _accountBusy.value = false
        }
    }

    /**
     * Suppression définitive : mot de passe si le compte en a un, sinon la
     * confirmation exacte « SUPPRIMER ». Les données financières restent serveur.
     */
    fun deleteAccount(password: String? = null, confirm: String? = null) {
        val hasPassword = _account.value?.hasPassword == true
        if (hasPassword && password.isNullOrEmpty()) {
            _accountNotice.value = "Saisissez votre mot de passe pour supprimer le compte."
            return
        }
        if (!hasPassword && confirm != "SUPPRIMER") {
            _accountNotice.value = "Saisissez SUPPRIMER pour confirmer."
            return
        }
        _accountBusy.value = true
        viewModelScope.launch {
            when (
                val result = Api.call {
                    Api.service.deleteAccount(
                        DeleteAccountBody(
                            password = password?.takeIf { hasPassword },
                            confirm = confirm?.takeIf { !hasPassword },
                        ),
                    )
                }
            ) {
                is ApiResult.Success -> {
                    SocketManager.disconnect()
                    session.logout()
                    Cart.clear()
                    _account.value = null
                    _needsUpgrade.value = null
                    _accountNotice.value = null
                    _loginNotice.value = "Votre compte a été supprimé."
                    _auth.value = AuthState.LoggedOut
                }

                is ApiResult.Failure -> _accountNotice.value = result.message
            }
            _accountBusy.value = false
        }
    }

    fun consumeAccountNotice() {
        _accountNotice.value = null
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
        _account.value = null
        _needsUpgrade.value = null
        _loginNotice.value = null
        _auth.value = AuthState.LoggedOut
    }
}
