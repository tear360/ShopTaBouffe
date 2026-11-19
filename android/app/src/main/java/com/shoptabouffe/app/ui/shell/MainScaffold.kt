package com.shoptabouffe.app.ui.shell

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.Dashboard
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.ShoppingCart
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.shoptabouffe.app.MainViewModel
import com.shoptabouffe.app.core.Cart
import com.shoptabouffe.app.core.models.User
import com.shoptabouffe.app.ui.screens.admin.AdminScreen
import com.shoptabouffe.app.ui.screens.cart.CartScreen
import com.shoptabouffe.app.ui.screens.chat.ChatScreen
import com.shoptabouffe.app.ui.screens.finances.FinancesScreen
import com.shoptabouffe.app.ui.screens.gallery.GalleryScreen
import com.shoptabouffe.app.ui.screens.orders.OrderDetailScreen
import com.shoptabouffe.app.ui.screens.orders.OrdersScreen
import com.shoptabouffe.app.ui.screens.profile.ProfileScreen
import com.shoptabouffe.app.ui.theme.GlassBorder
import com.shoptabouffe.app.ui.theme.GlassSurface
import com.shoptabouffe.app.ui.theme.Orange
import com.shoptabouffe.app.ui.theme.TextMuted

object Routes {
    const val GALLERY = "gallery"
    const val CART = "cart"
    const val ORDERS = "orders"
    const val PROFILE = "profile"
    const val ADMIN = "admin"
    const val FINANCES = "finances"
    const val ORDER = "order/{orderId}"
    const val CHAT = "chat/{conversationId}"

    fun order(id: Long) = "order/$id"
    fun chat(id: Long) = "chat/$id"
}

private data class TabSpec(
    val route: String,
    val label: String,
    val icon: ImageVector,
)

@Composable
fun MainScaffold(user: User, vm: MainViewModel) {
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route

    val cartLines by Cart.lines.collectAsStateWithLifecycle()
    val cartCount = cartLines.sumOf { it.qty }

    // Un vendeur ne commande pas : Panier et Commandes sont masqués côté client.
    val tabs = remember(user.isSupplier) {
        listOfNotNull(
            TabSpec(Routes.GALLERY, "Boutique", Icons.Outlined.Storefront),
            if (!user.isSupplier) TabSpec(Routes.CART, "Panier", Icons.Outlined.ShoppingCart) else null,
            if (!user.isSupplier) {
                TabSpec(Routes.ORDERS, "Commandes", Icons.AutoMirrored.Outlined.ReceiptLong)
            } else null,
            if (user.isSupplier) {
                TabSpec(Routes.ADMIN, "Produits", Icons.Outlined.Dashboard)
            } else null,
            if (user.isSupplier) {
                TabSpec(Routes.FINANCES, "Finances", Icons.Outlined.AccountBalanceWallet)
            } else null,
            TabSpec(Routes.PROFILE, "Profil", Icons.Outlined.Person),
        )
    }

    val showBottomBar = currentRoute != null && tabs.any { it.route == currentRoute }

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                Surface(
                    color = GlassSurface,
                    border = BorderStroke(1.dp, GlassBorder),
                    shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
                    shadowElevation = 16.dp,
                ) {
                    NavigationBar(
                        containerColor = Color.Transparent,
                        tonalElevation = 0.dp,
                    ) {
                        tabs.forEach { tab ->
                            NavigationBarItem(
                                selected = currentRoute == tab.route,
                                onClick = {
                                    nav.navigate(tab.route) {
                                        popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = Orange,
                                    selectedTextColor = Orange,
                                    unselectedIconColor = TextMuted,
                                    unselectedTextColor = TextMuted,
                                    indicatorColor = Orange.copy(alpha = 0.16f),
                                ),
                                icon = {
                                    val icon: @Composable () -> Unit = {
                                        Icon(tab.icon, contentDescription = tab.label)
                                    }
                                    if (tab.route == Routes.CART && cartCount > 0) {
                                        BadgedBox(badge = { Badge { Text(cartCount.toString()) } }) { icon() }
                                    } else {
                                        icon()
                                    }
                                },
                                label = { Text(tab.label) },
                            )
                        }
                    }
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = nav,
            startDestination = Routes.GALLERY,
            modifier = Modifier.padding(padding),
        ) {
            composable(Routes.GALLERY) {
                GalleryScreen(
                    isSupplier = user.isSupplier,
                )
            }

            composable(Routes.CART) {
                CartScreen(
                    onOrderCreated = { orderId ->
                        nav.navigate(Routes.order(orderId)) {
                            popUpTo(Routes.CART) { inclusive = true }
                        }
                    },
                )
            }

            composable(Routes.ORDERS) {
                OrdersScreen(onOpenOrder = { nav.navigate(Routes.order(it)) })
            }

            composable(
                route = Routes.ORDER,
                arguments = listOf(navArgument("orderId") { type = NavType.LongType }),
            ) { entry ->
                val orderId = entry.arguments?.getLong("orderId") ?: return@composable
                OrderDetailScreen(
                    orderId = orderId,
                    canChat = true,
                    onBack = { nav.popBackStack() },
                    onOpenChat = { nav.navigate(Routes.chat(it)) },
                )
            }

            composable(
                route = Routes.CHAT,
                arguments = listOf(navArgument("conversationId") { type = NavType.LongType }),
            ) { entry ->
                val conversationId = entry.arguments?.getLong("conversationId") ?: return@composable
                ChatScreen(
                    conversationId = conversationId,
                    isSupplier = user.isSupplier,
                    onBack = { nav.popBackStack() },
                )
            }

            composable(Routes.ADMIN) {
                AdminScreen(onOpenChat = { nav.navigate(Routes.chat(it)) })
            }

            composable(Routes.FINANCES) {
                FinancesScreen()
            }

            composable(Routes.PROFILE) {
                ProfileScreen(user = user, vm = vm)
            }
        }
    }
}
