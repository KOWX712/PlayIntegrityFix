#include "zygisk.hpp"
#include "checksum.h"
#include "pif_config.hpp"
#include "property_virtualizer.hpp"

#include <algorithm>
#include <android/log.h>
#include <jni.h>
#include <string>
#include <string_view>
#include <sys/socket.h>
#include <sys/system_properties.h>
#include <sys/time.h>
#include <unistd.h>
#include <fcntl.h>
#include <vector>
#include <cstdio>

#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, "PIF", __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, "PIF", __VA_ARGS__)

#define DEX_PATH "/data/adb/modules/playintegrityfix/classes.dex"
#define MODULE_PROP "/data/adb/modules/playintegrityfix/module.prop"
#define DEFAULT_PIF "/data/adb/modules/playintegrityfix/pif.prop"
#define CUSTOM_PIF "/data/adb/pif.prop"

#define VENDING_PACKAGE "com.android.vending"
#define DROIDGUARD_PACKAGE "com.google.android.gms.unstable"

namespace {

constexpr uint8_t COMMAND_LOAD_PAYLOAD = 1;
constexpr int PAYLOAD_TIMEOUT_MS = 5000;

JNIEnv *gEnv = nullptr;
pif::Config gConfig;
std::vector<uint8_t> gDexBytes;


ssize_t xread(int fd, void *buffer, size_t countToRead) {
    ssize_t totalRead = 0;
    char *currentBuf = static_cast<char *>(buffer);
    size_t remainingBytes = countToRead;

    while (remainingBytes > 0) {
        const ssize_t ret = TEMP_FAILURE_RETRY(read(fd, currentBuf, remainingBytes));
        if (ret < 0) {
            return -1;
        }
        if (ret == 0) {
            break;
        }

        currentBuf += ret;
        totalRead += ret;
        remainingBytes -= ret;
    }

    return totalRead;
}

ssize_t xwrite(int fd, const void *buffer, size_t countToWrite) {
    ssize_t totalWritten = 0;
    const char *currentBuf = static_cast<const char *>(buffer);
    size_t remainingBytes = countToWrite;

    while (remainingBytes > 0) {
        const ssize_t ret = TEMP_FAILURE_RETRY(write(fd, currentBuf, remainingBytes));
        if (ret < 0) {
            return -1;
        }
        if (ret == 0) {
            break;
        }

        currentBuf += ret;
        totalWritten += ret;
        remainingBytes -= ret;
    }

    return totalWritten;
}

bool readExact(int fd, void *buffer, size_t size) {
    return xread(fd, buffer, size) == static_cast<ssize_t>(size);
}

bool writeExact(int fd, const void *buffer, size_t size) {
    return xwrite(fd, buffer, size) == static_cast<ssize_t>(size);
}

void applySocketTimeout(int fd) {
    const timeval timeout{
            .tv_sec = PAYLOAD_TIMEOUT_MS / 1000,
            .tv_usec = static_cast<suseconds_t>((PAYLOAD_TIMEOUT_MS % 1000) * 1000),
    };

    setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
    setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
}

bool readFileBytes(const char *path, std::vector<uint8_t> &out) {
    out.clear();

    const int file = open(path, O_RDONLY | O_CLOEXEC);
    if (file < 0) {
        return false;
    }

    std::vector<uint8_t> buffer(4096);
    ssize_t bytes = 0;
    while ((bytes = TEMP_FAILURE_RETRY(read(file, buffer.data(), buffer.size()))) > 0) {
        out.insert(out.end(), buffer.begin(), buffer.begin() + bytes);
    }

    close(file);
    return bytes == 0 && !out.empty();
}

bool loadPropBytes(std::vector<uint8_t> &out) {
    if (readFileBytes(CUSTOM_PIF, out)) {
        return true;
    }
    return readFileBytes(DEFAULT_PIF, out);
}

bool writeVector(int fd, const std::vector<uint8_t> &buffer) {
    const uint32_t size = static_cast<uint32_t>(buffer.size());
    if (!writeExact(fd, &size, sizeof(size))) {
        return false;
    }
    return size == 0 || writeExact(fd, buffer.data(), size);
}

bool readVector(int fd, std::vector<uint8_t> &buffer) {
    uint32_t size = 0;
    if (!readExact(fd, &size, sizeof(size))) {
        return false;
    }

    buffer.resize(size);
    return size == 0 || readExact(fd, buffer.data(), size);
}

uint32_t crc32(const uint8_t *data, size_t len) {
    uint32_t crc = 0xFFFFFFFF;
    for (size_t i = 0; i < len; ++i) {
        crc ^= data[i];
        for (int j = 0; j < 8; ++j) {
            crc = (crc >> 1) ^ (0xEDB88320U & (-(crc & 1)));
        }
    }
    return ~crc;
}

bool verifyModule(const char *path, const char *expectedHex) {
    const bool update = access("/data/adb/modules/playintegrityfix/update", F_OK) == 0;
    if (update) {
        return true;
    }

    const int fd = open(path, O_RDWR);
    if (fd < 0) {
        return false;
    }

    std::vector<uint8_t> buf;
    uint8_t tmp[512];
    ssize_t n = 0;
    while ((n = read(fd, tmp, sizeof(tmp))) > 0) {
        buf.insert(buf.end(), tmp, tmp + n);
    }
    if (buf.empty()) {
        close(fd);
        return false;
    }

    const uint32_t crc = crc32(buf.data(), buf.size());
    uint32_t expectedCrc = 0;
    sscanf(expectedHex, "%x", &expectedCrc);

    if (crc == expectedCrc) {
        close(fd);
        return true;
    }

    LOGD("[COMPANION] module tampered!");

    lseek(fd, 0, SEEK_SET);
    std::vector<std::string> lines;
    const std::string fileStr(buf.begin(), buf.end());
    size_t pos = 0;
    while (pos < fileStr.size()) {
        const size_t next = fileStr.find('\n', pos);
        std::string line = fileStr.substr(pos, next - pos + 1);
        if (line.rfind("description=", 0) == 0) {
            line = "description=❌ This module has been tampered, please install from official source.\n";
        }
        lines.push_back(line);
        if (next == std::string::npos) {
            break;
        }
        pos = next + 1;
    }

    if (ftruncate(fd, 0) != 0) {
        close(fd);
        return false;
    }

    lseek(fd, 0, SEEK_SET);
    for (const auto &line : lines) {
        if (write(fd, line.c_str(), line.size()) != static_cast<ssize_t>(line.size())) {
            close(fd);
            return false;
        }
    }

    close(fd);
    return false;
}

std::string propMapToJson() {
    std::string json = "{";
    bool first = true;
    for (const auto &[key, value] : gConfig.propMap) {
        if (!first) {
            json += ",";
        }
        first = false;
        json += "\"" + key + "\":\"" + value + "\"";
    }
    json += "}";
    return json;
}

void doSpoofVending() {
    constexpr int requestSdk = 32;

    jclass buildVersionClass = gEnv->FindClass("android/os/Build$VERSION");
    if (buildVersionClass == nullptr) {
        LOGE("Build.VERSION class not found");
        gEnv->ExceptionClear();
        return;
    }

    jfieldID sdkIntFieldId = gEnv->GetStaticFieldID(buildVersionClass, "SDK_INT", "I");
    if (sdkIntFieldId == nullptr) {
        LOGE("SDK_INT field not found");
        gEnv->ExceptionClear();
        gEnv->DeleteLocalRef(buildVersionClass);
        return;
    }

    const int oldValue = gEnv->GetStaticIntField(buildVersionClass, sdkIntFieldId);
    const int targetSdk = std::min(oldValue, requestSdk);
    if (oldValue == targetSdk) {
        gEnv->DeleteLocalRef(buildVersionClass);
        return;
    }

    gEnv->SetStaticIntField(buildVersionClass, sdkIntFieldId, targetSdk);
    if (gEnv->ExceptionCheck()) {
        gEnv->ExceptionDescribe();
        gEnv->ExceptionClear();
        LOGE("SDK_INT field not accessible (JNI Exception)");
    } else {
        LOGD("[SDK_INT]: %d -> %d", oldValue, targetSdk);
    }

    gEnv->DeleteLocalRef(buildVersionClass);
}

void updateBuildFields() {
    jclass buildClass = gEnv->FindClass("android/os/Build");
    jclass versionClass = gEnv->FindClass("android/os/Build$VERSION");
    if (buildClass == nullptr || versionClass == nullptr) {
        gEnv->ExceptionClear();
        return;
    }

    for (const auto &[key, value] : gConfig.propMap) {
        jclass targetClass = buildClass;
        jfieldID fieldId = gEnv->GetStaticFieldID(buildClass, key.c_str(), "Ljava/lang/String;");
        if (gEnv->ExceptionCheck()) {
            gEnv->ExceptionClear();
            fieldId = gEnv->GetStaticFieldID(versionClass, key.c_str(), "Ljava/lang/String;");
            targetClass = versionClass;
            if (gEnv->ExceptionCheck()) {
                gEnv->ExceptionClear();
                continue;
            }
        }

        jstring jValue = gEnv->NewStringUTF(value.c_str());
        gEnv->SetStaticObjectField(targetClass, fieldId, jValue);
        if (gEnv->ExceptionCheck()) {
            gEnv->ExceptionClear();
            gEnv->DeleteLocalRef(jValue);
            continue;
        }

        LOGD("Set '%s' to '%s'", key.c_str(), value.c_str());
        gEnv->DeleteLocalRef(jValue);
    }

    gEnv->DeleteLocalRef(versionClass);
    gEnv->DeleteLocalRef(buildClass);
}

void injectDex() {
    if (gDexBytes.empty()) {
        LOGD("[INJECT] No dex payload available");
        return;
    }

    jclass classLoaderClass = gEnv->FindClass("java/lang/ClassLoader");
    jmethodID getSystemClassLoader = gEnv->GetStaticMethodID(
            classLoaderClass, "getSystemClassLoader", "()Ljava/lang/ClassLoader;");
    jobject systemClassLoader = gEnv->CallStaticObjectMethod(classLoaderClass, getSystemClassLoader);
    if (gEnv->ExceptionCheck()) {
        gEnv->ExceptionDescribe();
        gEnv->ExceptionClear();
        return;
    }

    jobject dexBuffer = gEnv->NewDirectByteBuffer(gDexBytes.data(), static_cast<jlong>(gDexBytes.size()));
    jclass inMemoryClassLoaderClass = gEnv->FindClass("dalvik/system/InMemoryDexClassLoader");
    jmethodID inMemoryClassLoaderInit = gEnv->GetMethodID(
            inMemoryClassLoaderClass, "<init>", "(Ljava/nio/ByteBuffer;Ljava/lang/ClassLoader;)V");
    jobject dexClassLoader = gEnv->NewObject(
            inMemoryClassLoaderClass, inMemoryClassLoaderInit, dexBuffer, systemClassLoader);
    if (gEnv->ExceptionCheck()) {
        gEnv->ExceptionDescribe();
        gEnv->ExceptionClear();
        return;
    }

    jmethodID loadClass = gEnv->GetMethodID(
            classLoaderClass, "loadClass", "(Ljava/lang/String;)Ljava/lang/Class;");
    jstring entryClassName = gEnv->NewStringUTF("es.chiteroman.playintegrityfix.EntryPoint");
    jobject entryClassObject = gEnv->CallObjectMethod(dexClassLoader, loadClass, entryClassName);
    if (gEnv->ExceptionCheck()) {
        gEnv->ExceptionDescribe();
        gEnv->ExceptionClear();
        return;
    }

    jclass entryPointClass = static_cast<jclass>(entryClassObject);
    jmethodID entryInit = gEnv->GetStaticMethodID(entryPointClass, "init", "(Ljava/lang/String;ZZZ)V");
    const std::string json = propMapToJson();
    jstring jsonString = gEnv->NewStringUTF(json.c_str());
    gEnv->CallStaticVoidMethod(entryPointClass, entryInit, jsonString, gConfig.spoofProvider,
                               gConfig.spoofSignature, gConfig.spoofBuild);
    if (gEnv->ExceptionCheck()) {
        gEnv->ExceptionDescribe();
        gEnv->ExceptionClear();
    }

    gEnv->DeleteLocalRef(jsonString);
    gEnv->DeleteLocalRef(entryClassObject);
    gEnv->DeleteLocalRef(entryClassName);
    gEnv->DeleteLocalRef(dexClassLoader);
    gEnv->DeleteLocalRef(inMemoryClassLoaderClass);
    gEnv->DeleteLocalRef(dexBuffer);
    gEnv->DeleteLocalRef(systemClassLoader);
    gEnv->DeleteLocalRef(classLoaderClass);
}

bool requestPayload(int fd) {
    if (fd < 0) {
        return false;
    }

    applySocketTimeout(fd);

    bool ok = writeExact(fd, &COMMAND_LOAD_PAYLOAD, sizeof(COMMAND_LOAD_PAYLOAD));
    bool companionOk = false;
    ok = ok && readExact(fd, &companionOk, sizeof(companionOk));
    if (!ok || !companionOk) {
        close(fd);
        return false;
    }

    ok = readConfig(fd, gConfig);
    if (ok && gConfig.needsDex()) {
        ok = readVector(fd, gDexBytes);
    } else {
        gDexBytes.clear();
    }

    close(fd);
    if (!ok) {
        gDexBytes.clear();
        gConfig = {};
        return false;
    }
    return true;
}

void companion(int fd) {
    applySocketTimeout(fd);

    bool ok = verifyModule(MODULE_PROP, MODULE_PROP_CHECKSUM_HEX);
    uint8_t command = 0;
    ok = ok && readExact(fd, &command, sizeof(command));
    ok = ok && command == COMMAND_LOAD_PAYLOAD;

    std::vector<uint8_t> propBytes;
    std::vector<uint8_t> dexBytes;
    pif::Config config;

    if (ok) {
        ok = loadPropBytes(propBytes);
    }
    if (ok) {
        const std::string_view propView(reinterpret_cast<const char *>(propBytes.data()), propBytes.size());
        config = pif::parseConfig(propView);
    }
    if (ok && config.needsDex()) {
        ok = readFileBytes(DEX_PATH, dexBytes);
    }

    writeExact(fd, &ok, sizeof(ok));
    if (!ok) {
        return;
    }

    ok = writeConfig(fd, config);
    if (ok && config.needsDex()) {
        ok = writeVector(fd, dexBytes);
    }

    if (!ok) {
        LOGE("[COMPANION] failed to send payload");
    }
}

}

using namespace zygisk;

class PlayIntegrityFix : public ModuleBase {
public:
    void onLoad(Api *api_, JNIEnv *env_) override {
        api = api_;
        env = env_;
    }

    void preAppSpecialize(AppSpecializeArgs *args) override {
        payloadLoaded = false;
        isGmsUnstable = false;
        isVending = false;
        gConfig = {};
        gDexBytes.clear();

        if (!args) {
            api->setOption(DLCLOSE_MODULE_LIBRARY);
            return;
        }

        if (access("/data/adb/pif_script_only", F_OK) == 0) {
            api->setOption(DLCLOSE_MODULE_LIBRARY);
            return;
        }

        std::string dir;
        std::string name;

        const char *rawDir = env->GetStringUTFChars(args->app_data_dir, nullptr);
        if (rawDir) {
            dir = rawDir;
            env->ReleaseStringUTFChars(args->app_data_dir, rawDir);
        }

        const char *rawName = env->GetStringUTFChars(args->nice_name, nullptr);
        if (rawName) {
            name = rawName;
            env->ReleaseStringUTFChars(args->nice_name, rawName);
        }

        const std::string_view appDir(dir);
        const bool isGms = appDir.ends_with("/com.google.android.gms") || appDir.ends_with("/com.android.vending");
        if (!isGms) {
            api->setOption(DLCLOSE_MODULE_LIBRARY);
            return;
        }

        api->setOption(FORCE_DENYLIST_UNMOUNT);

        const std::string_view niceName(name);
        isGmsUnstable = niceName == DROIDGUARD_PACKAGE;
        isVending = niceName == VENDING_PACKAGE;
        if (!isGmsUnstable && !isVending) {
            api->setOption(DLCLOSE_MODULE_LIBRARY);
            return;
        }

        payloadLoaded = requestPayload(api->connectCompanion());
        if (!payloadLoaded) {
            api->setOption(DLCLOSE_MODULE_LIBRARY);
            return;
        }

        if (isGmsUnstable && gConfig.spoofProps && !pif::property_virtualizer::install(gConfig)) {
            LOGE("[PROP-VIRT] unavailable; property spoofing disabled for this process");
        }
    }

    void postAppSpecialize(const AppSpecializeArgs *args) override {
        if (!payloadLoaded) {
            return;
        }

        gEnv = env;

        if (isGmsUnstable) {
            if (gConfig.spoofBuild) {
                updateBuildFields();
            }

            if (gConfig.needsDex()) {
                injectDex();
            } else {
                LOGD("[INJECT] Dex payload skipped because spoofProvider and spoofSignature are false");
            }

        } else if (isVending) {
            if (gConfig.spoofVendingBuild) {
                updateBuildFields();
            } else if (gConfig.spoofVendingSdk) {
                doSpoofVending();
            }
        }
    }

    void preServerSpecialize(ServerSpecializeArgs *args) override {
        api->setOption(DLCLOSE_MODULE_LIBRARY);
    }

private:
    Api *api = nullptr;
    JNIEnv *env = nullptr;
    bool payloadLoaded = false;
    bool isGmsUnstable = false;
    bool isVending = false;
};

REGISTER_ZYGISK_MODULE(PlayIntegrityFix)
REGISTER_ZYGISK_COMPANION(companion)
