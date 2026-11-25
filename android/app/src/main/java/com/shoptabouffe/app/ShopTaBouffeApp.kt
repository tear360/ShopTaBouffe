package com.shoptabouffe.app

import android.app.Application
import com.shoptabouffe.app.core.Notifier
import com.shoptabouffe.app.core.Session
import com.shoptabouffe.app.core.ShopState
import com.shoptabouffe.app.core.SocketManager

class ShopTaBouffeApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Session.init(this)
        Notifier.init(this)

        // Notifications : abonnées une fois pour toutes, indépendamment des écrans ouverts
        // (les ViewModels se désabonnent quand l'utilisateur quitte un écran, pas nous).
        SocketManager.on("order:new") { payload -> Notifier.onSocketEvent("order:new", payload) }
        SocketManager.on("order:updated") { payload -> Notifier.onSocketEvent("order:updated", payload) }

        // Fermeture temporaire : abonnement global, actif avant même l'ouverture d'un écran.
        SocketManager.on("shop:changed") { payload -> ShopState.onSocketPayload(payload) }
    }

    override fun onTerminate() {
        SocketManager.disconnect()
        super.onTerminate()
    }
}
