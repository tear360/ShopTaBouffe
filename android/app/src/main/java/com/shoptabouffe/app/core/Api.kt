package com.shoptabouffe.app.core

import com.shoptabouffe.app.core.models.AuthResponse
import com.shoptabouffe.app.core.models.CategoriesResponse
import com.shoptabouffe.app.core.models.Category
import com.shoptabouffe.app.core.models.CategoryBody
import com.shoptabouffe.app.core.models.CodeBody
import com.shoptabouffe.app.core.models.ConversationsResponse
import com.shoptabouffe.app.core.models.CreateExpenseBody
import com.shoptabouffe.app.core.models.CredentialsBody
import com.shoptabouffe.app.core.models.CreateOrderBody
import com.shoptabouffe.app.core.models.CreateProductBody
import com.shoptabouffe.app.core.models.ErrorBody
import com.shoptabouffe.app.core.models.Expense
import com.shoptabouffe.app.core.models.ExpensesResponse
import com.shoptabouffe.app.core.models.FinanceProductsResponse
import com.shoptabouffe.app.core.models.FinanceSummary
import com.shoptabouffe.app.core.models.HealthResponse
import com.shoptabouffe.app.core.models.Message
import com.shoptabouffe.app.core.models.MessageBody
import com.shoptabouffe.app.core.models.MessagesResponse
import com.shoptabouffe.app.core.models.NameBody
import com.shoptabouffe.app.core.models.Order
import com.shoptabouffe.app.core.models.OrdersResponse
import com.shoptabouffe.app.core.models.Product
import com.shoptabouffe.app.core.models.ProductsResponse
import com.shoptabouffe.app.core.models.RegisterBody
import com.shoptabouffe.app.core.models.SalesResponse
import com.shoptabouffe.app.core.models.StatusBody
import com.shoptabouffe.app.core.models.UploadResponse
import com.shoptabouffe.app.core.models.User
import com.google.gson.GsonBuilder
import com.google.gson.JsonSyntaxException
import android.content.Context
import android.net.Uri
import java.io.IOException
import java.util.concurrent.TimeUnit
import okhttp3.Interceptor
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.RequestBody
import okhttp3.logging.HttpLoggingInterceptor
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okio.BufferedSink
import retrofit2.HttpException
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

/** Résultat d'un appel API : jamais d'exception exposée à l'UI. */
sealed interface ApiResult<out T> {
    data class Success<T>(val data: T) : ApiResult<T>
    data class Failure(val message: String, val code: Int = 0) : ApiResult<Nothing>
}

interface ShopTaBouffeApi {

    @GET("health")
    suspend fun health(): HealthResponse

    // --- auth -------------------------------------------------------------
    @POST("auth/demo")
    suspend fun demoLogin(@Body body: NameBody): AuthResponse

    @POST("auth/login")
    suspend fun login(@Body body: CredentialsBody): AuthResponse

    @POST("auth/register")
    suspend fun register(@Body body: RegisterBody): AuthResponse

    /** Upgrade d'un compte démo (par nom) vers un compte complet, données conservées. */
    @POST("auth/upgrade")
    suspend fun upgradeAccount(@Body body: RegisterBody): AuthResponse

    @GET("auth/me")
    suspend fun me(): User

    // --- fournisseur ------------------------------------------------------
    @POST("admin/enter")
    suspend fun enterSupplierCode(@Body body: CodeBody): User

    @POST("admin/logout-role")
    suspend fun exitSupplierRole(): User

    // --- produits ---------------------------------------------------------
    @GET("products")
    suspend fun products(
        @Query("search") search: String? = null,
        @Query("category") category: String? = null,
        @Query("available") available: Int? = null,
    ): ProductsResponse

    @GET("products/{id}")
    suspend fun product(@Path("id") id: Long): Product

    @POST("products")
    suspend fun createProduct(@Body body: CreateProductBody): Product

    @PATCH("products/{id}")
    suspend fun updateProduct(@Path("id") id: Long, @Body body: CreateProductBody): Product

    @DELETE("products/{id}")
    suspend fun deleteProduct(@Path("id") id: Long)

    // --- catégories -------------------------------------------------------
    @GET("categories")
    suspend fun categories(): CategoriesResponse

    @POST("categories")
    suspend fun createCategory(@Body body: CategoryBody): Category

    @PATCH("categories/{id}")
    suspend fun updateCategory(@Path("id") id: Long, @Body body: CategoryBody): Category

    @DELETE("categories/{id}")
    suspend fun deleteCategory(@Path("id") id: Long)

    /** Photo de produit depuis la galerie (multipart, champ « image »). */
    @Multipart
    @POST("uploads/product-image")
    suspend fun uploadProductImage(@Part image: MultipartBody.Part): UploadResponse

    // --- commandes --------------------------------------------------------
    @POST("orders")
    suspend fun createOrder(@Body body: CreateOrderBody): Order

    @GET("orders/mine")
    suspend fun myOrders(): OrdersResponse

    @GET("orders/{id}")
    suspend fun order(@Path("id") id: Long): Order

    @GET("orders")
    suspend fun allOrders(@Query("status") status: String? = null): OrdersResponse

    @PATCH("orders/{id}")
    suspend fun updateOrderStatus(@Path("id") id: Long, @Body body: StatusBody): Order

    // --- chat -------------------------------------------------------------
    @GET("conversations")
    suspend fun conversations(): ConversationsResponse

    @GET("conversations/{id}/messages")
    suspend fun messages(
        @Path("id") id: Long,
        @Query("before") before: Long? = null,
        @Query("limit") limit: Int? = null,
    ): MessagesResponse

    @POST("conversations/{id}/messages")
    suspend fun sendMessage(@Path("id") id: Long, @Body body: MessageBody): Message

    @POST("conversations/{id}/read")
    suspend fun markRead(@Path("id") id: Long)

    // --- finances (fournisseur) ------------------------------------------
    @GET("finances/summary")
    suspend fun financeSummary(
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
    ): FinanceSummary

    @GET("finances/sales")
    suspend fun financeSales(
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
        @Query("limit") limit: Int? = null,
    ): SalesResponse

    @GET("finances/products")
    suspend fun financeProducts(
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
    ): FinanceProductsResponse

    @GET("finances/expenses")
    suspend fun expenses(): ExpensesResponse

    @POST("finances/expenses")
    suspend fun createExpense(@Body body: CreateExpenseBody): Expense

    @DELETE("finances/expenses/{id}")
    suspend fun deleteExpense(@Path("id") id: Long)
}

object Api {

    private val gson = GsonBuilder().setLenient().create()

    private val logging = HttpLoggingInterceptor().apply {
        level = if (com.shoptabouffe.app.BuildConfig.DEBUG) {
            HttpLoggingInterceptor.Level.BASIC
        } else {
            HttpLoggingInterceptor.Level.NONE
        }
        redactHeader("Authorization")
    }

    private val authInterceptor = Interceptor { chain ->
        val builder = chain.request().newBuilder()
        Session.current?.token?.let { builder.header("Authorization", "Bearer $it") }
        chain.proceed(builder.build())
    }

    private val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .addInterceptor(logging)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    val service: ShopTaBouffeApi by lazy {
        Retrofit.Builder()
            .baseUrl(Config.API_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()
            .create(ShopTaBouffeApi::class.java)
    }

    /** Exécute un appel réseau et convertit toute exception en [ApiResult.Failure]. */
    suspend fun <T> call(block: suspend () -> T): ApiResult<T> = try {
        ApiResult.Success(block())
    } catch (e: HttpException) {
        ApiResult.Failure(messageFor(e), e.code())
    } catch (e: IOException) {
        ApiResult.Failure("Erreur : vérifiez votre connexion à Internet", 0)
    } catch (e: JsonSyntaxException) {
        ApiResult.Failure("Réponse invalide du serveur.", 0)
    } catch (e: Exception) {
        if (e is kotlinx.coroutines.CancellationException) throw e
        ApiResult.Failure(e.message ?: "Erreur inattendue.", 0)
    }

    /**
     * Envoie une photo choisie dans la galerie vers /api/uploads/product-image.
     * Retourne l'URL publique de l'image déposée sur le serveur.
     */
    suspend fun uploadProductImage(context: Context, uri: Uri): ApiResult<String> = call {
        val resolver = context.applicationContext.contentResolver
        val mime = resolver.getType(uri) ?: "image/*"
        val bytes = try {
            resolver.openInputStream(uri)?.use { it.readBytes() }
                ?: throw IllegalStateException("Impossible de lire cette image.")
        } catch (e: IOException) {
            throw IllegalStateException("Impossible de lire cette image.")
        }
        val body = object : RequestBody() {
            override fun contentType() = mime.toMediaTypeOrNull()
            override fun contentLength(): Long = bytes.size.toLong()
            override fun writeTo(sink: BufferedSink) {
                sink.write(bytes)
            }
        }
        val part = MultipartBody.Part.createFormData("image", "photo.jpg", body)
        service.uploadProductImage(part).url
            ?: throw IllegalStateException("Réponse invalide du serveur.")
    }

    private fun messageFor(e: HttpException): String {
        val body = try {
            e.response()?.errorBody()?.string()
        } catch (_: Exception) {
            null
        }
        val apiMessage = body?.let {
            try {
                gson.fromJson(it, ErrorBody::class.java)?.error
            } catch (_: Exception) {
                null
            }
        }
        return apiMessage ?: when (e.code()) {
            401 -> "Session expirée, reconnectez-vous."
            403 -> "Accès refusé."
            404 -> "Ressource introuvable."
            409 -> "Opération impossible en l'état."
            429 -> "Trop de tentatives, réessayez dans un instant."
            502, 503, 504 -> "Erreur : vérifiez votre connexion à Internet"
            else -> "Erreur ${e.code()}."
        }
    }
}
