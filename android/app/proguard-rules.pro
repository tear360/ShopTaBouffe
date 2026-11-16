# Retrofit / Gson : les DTO sont référencés par réflexion.
-keepattributes Signature, *Annotation*
-keep class com.delivro.app.core.models.** { *; }
-keep class com.google.gson.reflect.TypeToken
-keep class * extends com.google.gson.reflect.TypeToken

# Socket.IO
-dontwarn io.socket.**
-keep class io.socket.** { *; }
