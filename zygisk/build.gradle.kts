@file:Suppress("UnstableApiUsage")

import java.util.zip.CRC32

plugins {
    alias(libs.plugins.android.application)
}

tasks.register("generateModulePropChecksum") {
    description = "Generate Module Checksum"
    val propFile = project.rootDir.resolve("module/module.prop")
    val checksumHeader = project.projectDir.resolve("src/main/cpp/checksum.h")

    doLast {
        val bytes = propFile.readBytes()
        val crc = CRC32()
        crc.update(bytes)
        val checksum = crc.value
        val hex = checksum.toString(16)
        checksumHeader.writeText("""
            #pragma once
            #define MODULE_PROP_CHECKSUM_HEX "$hex"
        """.trimIndent())
    }
}

tasks.named("preBuild") {
    dependsOn("generateModulePropChecksum")
}

android {
    namespace = "es.chiteroman.playintegrityfix"
    compileSdk = 37
    ndkVersion = "29.0.14206865"
    buildToolsVersion = "37.0.0"

    buildFeatures {
        prefab = true
    }

    packaging {
        resources {
            excludes += "**"
        }
    }

    defaultConfig {
        minSdk = 26
        multiDexEnabled = false

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
            isShrinkResources = true
            multiDexEnabled = false
            proguardFiles += file("proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    externalNativeBuild {
        cmake {
            path("src/main/cpp/CMakeLists.txt")
            version = "3.30.5+"
        }
    }
    compileSdkMinor = 2
}

dependencies {
    implementation(libs.cxx)
    implementation(libs.hiddenapibypass)
}

afterEvaluate {
    tasks.named("assembleRelease") {
        finalizedBy(
            rootProject.tasks["copyZygiskFiles"],
            rootProject.tasks["zip"]
        )
    }
}