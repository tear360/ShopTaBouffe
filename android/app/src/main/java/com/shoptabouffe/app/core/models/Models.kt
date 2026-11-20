package com.shoptabouffe.app.core.models

import com.google.gson.annotations.SerializedName

data class User(
    val id: Long = 0,
    val provider: String? = null,
    val name: String = "",
    val email: String? = null,
    val phone: String? = null,
    @SerializedName("avatarUrl") val avatarUrl: String? = null,
    val role: String = "customer",
    val createdAt: String? = null,
) {
    val isSupplier: Boolean get() = role == "supplier"
}

/** GET /api/account : profil enrichi (téléphone, mot de passe, identités liées). */
data class AccountInfo(
    val id: Long = 0,
    val provider: String? = null,
    val name: String = "",
    val email: String? = null,
    val phone: String? = null,
    @SerializedName("avatarUrl") val avatarUrl: String? = null,
    val role: String = "customer",
    val createdAt: String? = null,
    val hasPassword: Boolean = false,
    @SerializedName("twoFactorEnabled") val twoFactorEnabled: Boolean = false,
    val identities: List<Identity> = emptyList(),
) {
    fun toUser(): User = User(
        id = id,
        provider = provider,
        name = name,
        email = email,
        phone = phone,
        avatarUrl = avatarUrl,
        role = role,
        createdAt = createdAt,
    )
}

data class Identity(
    val provider: String = "",
    val providerId: String? = null,
    val email: String? = null,
    @SerializedName("avatarUrl") val avatarUrl: String? = null,
    val createdAt: String? = null,
)

/** PATCH /api/account : "" permet d'effacer un champ (le serveur le convertit en null). */
data class AccountPatch(val email: String? = null, val phone: String? = null)

data class AccountLinkBody(val provider: String, val target: String = "app")

data class LinkResponse(val url: String? = null)

data class DeleteResponse(val ok: Boolean = false)

/** Corps de DELETE /api/account : mot de passe OU confirmation « SUPPRIMER ». */
data class DeleteAccountBody(val password: String? = null, val confirm: String? = null)

/** Réponse générique { ok: true } (mot de passe oublié, reset). */
data class OkResponse(val ok: Boolean = false)

data class AuthResponse(
    val token: String? = null,
    val user: User? = null,
    @SerializedName("twoFactorRequired") val twoFactorRequired: Boolean = false,
    @SerializedName("challengeToken") val challengeToken: String? = null,
)

/** POST /api/auth/2fa/verify — un seul des deux codes est envoyé (Gson omet les null). */
data class TwoFactorVerifyBody(
    val challengeToken: String,
    val code: String? = null,
    val recoveryCode: String? = null,
)

data class ForgotPasswordBody(val email: String)

/** POST /api/account/password — la réponse contient le NOUVEAU JWT à persister. */
data class PasswordChangeBody(val currentPassword: String, val newPassword: String)

data class PasswordChangeResponse(val ok: Boolean = false, val token: String? = null)

/** POST /api/account/2fa/start — secret en attente + QR au format data URL PNG. */
data class TwoFactorStartResponse(
    val secret: String? = null,
    @SerializedName("otpauthUrl") val otpauthUrl: String? = null,
    @SerializedName("qrDataUrl") val qrDataUrl: String? = null,
)

data class TwoFactorCodeBody(val code: String)

/** Réponse de enable (codes de récupération) et de disable ({ enabled: false }). */
data class TwoFactorEnableResponse(
    val enabled: Boolean = false,
    @SerializedName("recoveryCodes") val recoveryCodes: List<String> = emptyList(),
)

/** POST /api/account/2fa/disable — mot de passe obligatoire si le compte en a un. */
data class TwoFactorDisableBody(val code: String, val password: String? = null)

data class Product(
    val id: Long = 0,
    val name: String = "",
    val description: String? = null,
    val priceCents: Int = 0,
    val costCents: Int = 0,
    val category: String = "",
    @SerializedName("imageUrl") val imageUrl: String? = null,
    val available: Boolean = true,
    val createdAt: String? = null,
    val kind: String = "product",
    val items: List<FormuleItem> = emptyList(),
) {
    val isFormule: Boolean get() = kind == "formule"
}

/** Composition d'une formule : le nom est fourni par GET /products et /formules. */
data class FormuleItem(
    val productId: Long = 0,
    val qty: Int = 1,
    val name: String? = null,
)

/** Ligne envoyée au serveur : seul le couple productId/qty est utile. */
data class CreateFormuleLine(val productId: Long, val qty: Int)

/** Corps complet utilisé pour POST et PATCH /api/formules. */
data class CreateFormuleBody(
    val name: String,
    val description: String?,
    val priceCents: Int,
    val category: String,
    @SerializedName("imageUrl") val imageUrl: String?,
    val available: Boolean,
    val items: List<CreateFormuleLine>,
)

data class FormulesResponse(val formules: List<Product> = emptyList())

data class OrderItem(
    val productId: Long = 0,
    val name: String = "",
    val priceCents: Int = 0,
    val qty: Int = 1,
) {
    val lineTotalCents: Int get() = priceCents * qty
}

data class Order(
    val id: Long = 0,
    val status: String = "pending",
    val totalCents: Int = 0,
    val address: String? = null,
    val phone: String? = null,
    val note: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val items: List<OrderItem> = emptyList(),
    val customer: User? = null,
) {
    val itemCount: Int get() = items.sumOf { it.qty }
}

data class Conversation(
    val id: Long = 0,
    val customer: User? = null,
    val lastMessage: Message? = null,
    val unreadCount: Int = 0,
    val updatedAt: String? = null,
)

data class Message(
    val id: Long = 0,
    val conversationId: Long = 0,
    val senderId: Long = 0,
    val senderName: String? = null,
    val body: String = "",
    val createdAt: String? = null,
    val readAt: String? = null,
)

data class ProductsResponse(val products: List<Product> = emptyList())
data class OrdersResponse(val orders: List<Order> = emptyList())
data class MessagesResponse(val messages: List<Message> = emptyList())
data class ConversationsResponse(val conversations: List<Conversation> = emptyList())

data class ErrorBody(val error: String? = null)

data class HealthResponse(val ok: Boolean = false, val version: String? = null)

/** Corps d'une création de commande. */
data class CreateOrderBody(
    val items: List<CreateOrderLine>,
    val address: String,
    val phone: String,
    val note: String? = null,
)

data class CreateOrderLine(val productId: Long, val qty: Int)

data class CreateProductBody(
    val name: String,
    val description: String?,
    val priceCents: Int,
    val costCents: Int,
    val category: String,
    val imageUrl: String?,
    val available: Boolean,
)

/* ---------------------------------------------------------- catégories --- */

data class Category(
    val id: Long = 0,
    val name: String = "",
    val createdAt: String? = null,
    val productsCount: Int = 0,
)

data class CategoriesResponse(val categories: List<Category> = emptyList())

data class CategoryBody(val name: String)

/* ----------------------------------------------------------- finances --- */

data class Period(val from: String? = null, val to: String? = null)

/** GET /api/finances/summary — revenus, coûts, marges, dépenses, résultat net. */
data class FinanceSummary(
    val period: Period? = null,
    val revenueCents: Int = 0,
    val costCents: Int = 0,
    val grossMarginCents: Int = 0,
    val expensesCents: Int = 0,
    val netCents: Int = 0,
    val orders: Int = 0,
    val units: Int = 0,
    val expenseCount: Int = 0,
)

data class SaleItem(
    val productId: Long? = null,
    val name: String = "",
    val priceCents: Int = 0,
    val costCents: Int = 0,
    val qty: Int = 1,
)

data class Sale(
    val id: Long = 0,
    val orderId: Long = 0,
    val totalCents: Int = 0,
    val deliveredAt: String? = null,
    val items: List<SaleItem> = emptyList(),
)

data class SalesResponse(val sales: List<Sale> = emptyList())

data class FinanceProduct(
    val productId: Long? = null,
    val name: String = "",
    val units: Int = 0,
    val revenueCents: Int = 0,
    val costCents: Int = 0,
    val marginCents: Int = 0,
)

data class FinanceProductsResponse(val products: List<FinanceProduct> = emptyList())

data class Expense(
    val id: Long = 0,
    val label: String = "",
    val amountCents: Int = 0,
    val date: String? = null,
    val createdAt: String? = null,
)

data class ExpensesResponse(val expenses: List<Expense> = emptyList())

data class CreateExpenseBody(
    val label: String,
    val amountCents: Int,
    val date: String? = null,
)

data class StatusBody(val status: String)

data class CodeBody(val code: String)

/** Connexion par nom d'utilisateur + mot de passe. */
data class CredentialsBody(val username: String, val password: String)

/** Inscription / upgrade de compte (nom, utilisateur, mot de passe). */
data class RegisterBody(val name: String, val username: String, val password: String)

/** Réponse de POST /api/uploads/product-image. */
data class UploadResponse(val url: String? = null)

data class MessageBody(val body: String)
