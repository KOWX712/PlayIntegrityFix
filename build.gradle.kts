// Top-level build file where you can add configuration options common to all sub-projects/modules.
plugins {
    alias(libs.plugins.android.application) apply false
}

tasks.register("copyZygiskFiles") {
    description = "Copy Zygisk Files"
    val moduleFolder = project.rootDir.resolve("module")
    val zygiskModule = project.project(":zygisk")
    val zygiskBuildDir = zygiskModule.layout.buildDirectory
    val classesJar = zygiskBuildDir.file("intermediates/dex/release/minifyReleaseWithR8/classes.dex")
    val zygiskSoDir = zygiskBuildDir.file("intermediates/stripped_native_libs/release/stripReleaseDebugSymbols/out/lib")

    inputs.dir(zygiskSoDir)
    inputs.file(classesJar)
    outputs.dir(moduleFolder)

    doLast {
        classesJar.get().asFile.copyTo(moduleFolder.resolve("classes.dex"), overwrite = true)
        moduleFolder.resolve("inject").deleteRecursively()
        zygiskSoDir.get().asFile.walk()
            .filter { it.isFile && it.name == "libzygisk.so" }
            .forEach { soFile ->
                val abiFolder = soFile.parentFile.name
                val destination = moduleFolder.resolve("zygisk/$abiFolder.so")
                soFile.copyTo(destination, overwrite = true)
            }
    }
}

tasks.register<Zip>("zip") {
    description = "Zip Module"
    dependsOn("copyZygiskFiles")

    archiveFileName.set("PlayIntegrityFix.zip")
    destinationDirectory.set(project.rootDir.resolve("out"))

    from(project.rootDir.resolve("module"))
}
