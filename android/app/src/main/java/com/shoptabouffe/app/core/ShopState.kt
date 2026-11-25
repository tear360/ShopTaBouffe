package com.shoptabouffe.app.core

import com.google.gson.Gson
import com.shoptabouffe.app.core.models.CloseShopBody
import com.shoptabouffe.app.core.models.ShopStatus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Statut global de la boutique, exposé en StateFlow comme [Cart] pour le panier.
 *
 * Source de vérité : GET /api/shop/status, POST /shop/close, POST /shop/open et
 * l'événement Socket.IO `shop:changed`. Le rafraîchissement au retour au premier
 * plan et à la réouverture est déclenché par le wrapper d'écran.
 */
object ShopState {

    private val _status = MutableStateFlow(ShopStatus())
    val status: StateFlow<ShopStatus> = _status.asStateFlow()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val gson = Gson()

    /** Chargement silencieux (public endpoint), sans bloquer l'UI. */
    fun refresh() {
        scope.launch {
            when (val result = Api.call { Api.service.shopStatus() }) {
                is ApiResult.Success -> apply(result.data)
                is ApiResult.Failure -> Unit
            }
        }
    }

    suspend fun close(reopensAt: String): ApiResult<ShopStatus> =
        mutate { Api.service.closeShop(CloseShopBody(reopensAt)) }

    suspend fun open(): ApiResult<ShopStatus> =
        mutate { Api.service.openShop() }

    private suspend fun mutate(call: suspend () -> ShopStatus): ApiResult<ShopStatus> {
        val result = Api.call(call)
        if (result is ApiResult.Success) apply(result.data)
        return result
    }

    fun apply(value: ShopStatus) {
        _status.value = value
    }

    /** Payload Socket.IO `shop:changed` : même forme que la réponse HTTP. */
    fun onSocketPayload(payload: JSONObject?) {
        if (payload == null) {
            refresh()
            return
        }
        val parsed = try {
            gson.fromJson(payload.toString(), ShopStatus::class.java)
        } catch (_: Exception) {
            null
        }
        if (parsed == null) refresh() else apply(parsed)
    }

    /**
     * Temps restant avant réouverture. L'horloge serveur compense un éventuel
     * décalage de l'horloge du téléphone ; le compte à rebours reste local.
     */
    fun remainingMillis(status: ShopStatus): Long {
        val target = status.reopensAt.isoToEpochMillis() ?: return 0L
        val localNow = System.currentTimeMillis()
        val serverNow = status.now.isoToEpochMillis()
        val skew = if (serverNow != null) serverNow - localNow else 0L
        return target - (localNow + skew)
    }
}
