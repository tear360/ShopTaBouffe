package com.shoptabouffe.app

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.SideEffect
import androidx.core.view.WindowCompat
import com.shoptabouffe.app.ui.AppRoot
import com.shoptabouffe.app.ui.theme.ShopTaBouffeTheme

class MainActivity : ComponentActivity() {

    private val vm: MainViewModel by viewModels()

    /** Android 13+ : autorisation d'afficher les notifications de commande. */
    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* voir Profil → Paramètres */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handleDeepLink(intent)
        requestNotificationPermission()
        setContent {
            val dark = isSystemInDarkTheme()
            SideEffect {
                val controller = WindowCompat.getInsetsController(window, window.decorView)
                controller.isAppearanceLightStatusBars = !dark
                controller.isAppearanceLightNavigationBars = !dark
            }
            ShopTaBouffeTheme(darkTheme = dark) {
                AppRoot(vm)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDeepLink(intent)
    }

    private fun handleDeepLink(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme == "shoptabouffe" && data.host == "auth") {
            vm.onAuthRedirect(data)
        }
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}
