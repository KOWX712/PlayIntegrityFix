@file:Suppress("UnstableApiUsage")

plugins {
    alias(libs.plugins.android.library)
}

android {
    namespace = "es.chiteroman.inject"
    compileSdk = 36
    ndkVersion = "29.0.14206865"
    buildToolsVersion = "36.1.0"

    buildFeatures {
        prefab = true
    }

    packaging {
        jniLibs {
            excludes += "**/libdobby.so"
        }
        resources {
            excludes += "**"
        }
    }

    defaultConfig {
        minSdk = 26

        externalNativeBuild {
            cmake {
                abiFilters(
                    "arm64-v8a",
                    "armeabi-v7a"
                )

                arguments(
                    "-DCMAKE_BUILD_TYPE=Release",
                    "-DANDROID_STL=none",
                    "-DCMAKE_JOB_POOLS=compile=${Runtime.getRuntime().availableProcessors()}",
                    "-DCMAKE_INTERPROCEDURAL_OPTIMIZATION=ON",
                    "-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON"
                )

                val commonFlags = setOf(
                    "-fno-exceptions",
                    "-fno-rtti",
                    "-fvisibility=hidden",
                    "-fvisibility-inlines-hidden",
                    "-ffunction-sections",
                    "-fdata-sections",
                    "-w"
                )

                cFlags += "-std=c23"
                cFlags += commonFlags

                cppFlags += "-std=c++26"
                cppFlags += commonFlags
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro"
            )
        }
    }

    externalNativeBuild {
        cmake {
            path("src/main/cpp/CMakeLists.txt")
            version = "3.30.5+"
        }
    }
    compileSdkMinor = 1
}

dependencies {
    implementation(libs.cxx)
}

afterEvaluate {
    tasks.named("assembleRelease") {
        finalizedBy(
            rootProject.tasks["copyInjectFiles"],
            rootProject.tasks["zip"]
        )
    }
}
