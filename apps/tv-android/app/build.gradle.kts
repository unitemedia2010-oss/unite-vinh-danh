import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.isFile) {
        file.inputStream().use(::load)
    }
}

val webEnvironment = mutableMapOf<String, String>().apply {
    val file = rootProject.file("../web-control/.env.local")
    if (file.isFile) {
        file.forEachLine(Charsets.UTF_8) { rawLine ->
            val line = rawLine.trim()
            if (line.isEmpty() || line.startsWith("#")) return@forEachLine
            val separator = line.indexOf('=')
            if (separator <= 0) return@forEachLine
            val key = line.substring(0, separator).trim()
            val value = line.substring(separator + 1).trim().removeSurrounding("\"").removeSurrounding("'")
            put(key, value)
        }
    }
}

fun configValue(name: String, defaultValue: String = ""): String =
    providers.gradleProperty(name).orNull
        ?: localProperties.getProperty(name)
        ?: System.getenv(name)
        ?: when (name) {
            "VINHDANH_SUPABASE_URL" -> webEnvironment["VITE_SUPABASE_URL"]
            "VINHDANH_SUPABASE_ANON_KEY" -> webEnvironment["VITE_SUPABASE_ANON_KEY"]
            else -> null
        }
        ?: defaultValue

fun quotedBuildConfig(value: String): String =
    "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

android {
    namespace = "vn.unite.vinhdanh.tv"
    compileSdk = 36

    defaultConfig {
        applicationId = "vn.unite.vinhdanh.tv"
        minSdk = 23
        targetSdk = 36
        versionCode = 3
        versionName = "0.2.1-internal"

        buildConfigField(
            "String",
            "SUPABASE_URL",
            quotedBuildConfig(configValue("VINHDANH_SUPABASE_URL"))
        )
        buildConfigField(
            "String",
            "SUPABASE_ANON_KEY",
            quotedBuildConfig(configValue("VINHDANH_SUPABASE_ANON_KEY"))
        )
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    val media3Version = "1.10.1"
    implementation("androidx.media3:media3-exoplayer:$media3Version")
    implementation("androidx.media3:media3-ui:$media3Version")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
