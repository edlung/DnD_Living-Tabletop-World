import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
}

/** The page's shim both shells inject (docs/adr/0070-native-apps.md §2, §8), as an asset. */
abstract class CopyShim : DefaultTask() {
    @get:InputFile
    abstract val shim: RegularFileProperty

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @TaskAction
    fun copy() {
        val out = outputDir.get().asFile
        out.mkdirs()
        shim.get().asFile.copyTo(out.resolve("ltw-native.js"), overwrite = true)
    }
}

val copyShim = tasks.register<CopyShim>("copyShim") {
    shim.set(layout.projectDirectory.file("../../native-shim/ltw-native.js"))
}

// A release key stays outside the repository: keystore.properties (ignored) names it.
val keystore = rootProject.file("keystore.properties")

android {
    namespace = "tech.vardahei.ltw.player"
    compileSdk = 37

    defaultConfig {
        applicationId = "tech.vardahei.ltw.player"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
        buildConfigField("String", "DEFAULT_SERVER", "\"https://ltw.vardahei.tech\"")
    }

    signingConfigs {
        if (keystore.exists()) {
            create("release") {
                val properties = Properties().apply { keystore.inputStream().use { load(it) } }
                storeFile = file(properties.getProperty("storeFile"))
                storePassword = properties.getProperty("storePassword")
                keyAlias = properties.getProperty("keyAlias")
                keyPassword = properties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests.all {
            val cases = file("../../native-shim/cases.json")
            it.inputs.file(cases)
            it.systemProperty("ltw.cases", cases.absolutePath)
        }
    }

    lint {
        abortOnError = true
        checkReleaseBuilds = true
    }
}

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(copyShim, CopyShim::outputDir)
    }
}

dependencies {
    implementation(libs.androidx.activity)
    implementation(libs.androidx.browser)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)
    implementation(libs.androidx.core)
    implementation(libs.androidx.splashscreen)
    implementation(libs.androidx.webkit)
    implementation(libs.zxing.core)
    testImplementation(libs.junit)
    testImplementation(libs.json)
}
