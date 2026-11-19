import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// URL du backend. Modifiable via -Pdelivro.apiUrl=https://mon-serveur.com
// ou via `delivro.apiUrl=...` dans local.properties (priorité au -P).
val localProps = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}
val apiProperty: String = (findProperty("delivro.apiUrl") as? String)
    ?: localProps.getProperty("delivro.apiUrl", "")
    .takeIf { it.isNotBlank() }
    ?: "http://10.0.2.2:3000"
val apiUrl: String = apiProperty.trim().trimEnd('/') + "/"

// Signature release (non versionnée) : android/keystore.properties, voir docs/GUIDE.md.
// Sans ce fichier, `assembleRelease` produit un APK non signé (ininstallable).
val keystoreProps = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}
fun signingProp(key: String, env: String): String? =
    keystoreProps.getProperty(key)?.takeIf { it.isNotBlank() } ?: System.getenv(env)?.takeIf { it.isNotBlank() }

android {
    namespace = "com.shoptabouffe.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.shoptabouffe.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 9
        versionName = "1.0.8"

        buildConfigField("String", "BASE_URL", "\"$apiUrl\"")
        vectorDrawables.useSupportLibrary = true
    }

    signingConfigs {
        create("release") {
            storeFile = rootProject.file(
                keystoreProps.getProperty("storeFile") ?: "keystore/shoptabouffe.keystore",
            )
            storePassword = signingProp("storePassword", "STB_STORE_PASSWORD")
            keyAlias = keystoreProps.getProperty("keyAlias") ?: "shoptabouffe"
            keyPassword = signingProp("keyPassword", "STB_KEY_PASSWORD")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // APK signé (mise à jour par-dessus l'installé possible) si les credentials sont là.
            if (signingProp("storePassword", "STB_STORE_PASSWORD") != null) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)

    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.activity:activity-compose:1.11.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.4")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.4")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
    implementation("androidx.navigation:navigation-compose:2.8.5")
    implementation("androidx.browser:browser:1.8.0")

    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    debugImplementation("androidx.compose.ui:ui-tooling")

    implementation("io.coil-kt:coil-compose:2.7.0")

    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    implementation("io.socket:socket.io-client:2.1.1") {
        exclude(group = "org.json", module = "json")
    }

    testImplementation("junit:junit:4.13.2")
}
