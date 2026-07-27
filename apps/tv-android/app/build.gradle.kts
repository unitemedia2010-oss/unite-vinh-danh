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

fun configValue(name: String, defaultValue: String = ""): String =
    providers.gradleProperty(name).orNull
        ?: localProperties.getProperty(name)
        ?: System.getenv(name)
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
        versionCode = 2
        versionName = "0.2.0-mvp"

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
        buildConfigField(
            "String",
            "DEMO_VIDEO_URL",
            quotedBuildConfig(
                configValue(
                    "VINHDANH_DEMO_VIDEO_URL",
                    "https://media.w3.org/2010/05/video/movie_300.mp4"
                )
            )
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
