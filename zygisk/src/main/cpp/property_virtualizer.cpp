#include "property_virtualizer.hpp"

#include <android/log.h>
#include <linux/memfd.h>
#include <sys/mman.h>
#include <sys/system_properties.h>
#include <sys/syscall.h>
#include <unistd.h>

#include <algorithm>
#include <cerrno>
#include <cinttypes>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <string_view>
#include <vector>

namespace pif::property_virtualizer {
namespace {

constexpr std::string_view kPropertyDirectory = "/dev/__properties__/";
constexpr uint32_t kPropertyAreaMagic = 0x504f5250;
constexpr uint32_t kLongPropertyFlag = 1U << 16;

struct PropertyAreaHeader {
    uint32_t bytesUsed;
    uint32_t serial;
    uint32_t magic;
    uint32_t version;
    uint32_t reserved[28];
};

struct InlinePropertyInfo {
    uint32_t serial;
    char value[PROP_VALUE_MAX];
};

static_assert(sizeof(PropertyAreaHeader) == 128);
static_assert(sizeof(InlinePropertyInfo) == 4 + PROP_VALUE_MAX);

struct Mapping {
    uintptr_t start = 0;
    uintptr_t end = 0;
    int prot = 0;
    uint64_t offset = 0;
    std::string path;
    int originalFd = -1;
    int replacementFd = -1;
    void *replacementImage = MAP_FAILED;
    bool replaced = false;
};

struct Override {
    Mapping *mapping = nullptr;
    uintptr_t offset = 0;
    std::string name;
    std::string value;
};

struct State {
    const Config &config;
    std::vector<Mapping> mappings;
    std::vector<Override> overrides;
    bool enumerationFailed = false;
};

#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, "PIF", __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, "PIF", __VA_ARGS__)

bool parseMappings(std::vector<Mapping> &mappings, const Config &config) {
    FILE *maps = fopen("/proc/self/maps", "r");
    if (maps == nullptr) {
        LOGE("[PROP-VIRT] cannot open /proc/self/maps: %s", strerror(errno));
        return false;
    }

    char line[512];
    while (fgets(line, sizeof(line), maps) != nullptr) {
        unsigned long start = 0;
        unsigned long end = 0;
        unsigned long long offset = 0;
        unsigned long long inode = 0;
        char permissions[5] = {};
        char device[32] = {};
        char path[256] = {};
        const int fields = sscanf(line, "%lx-%lx %4s %llx %31s %llu %255[^\n]", &start, &end,
                                  permissions, &offset, device, &inode, path);
        // Property areas are file-backed mappings and must have a pathname.
        if (fields != 7) {
            continue;
        }

        std::string pathname(path);
        const size_t first = pathname.find_first_not_of(' ');
        if (first == std::string::npos) {
            continue;
        }
        pathname.erase(0, first);
        if (!pathname.starts_with(kPropertyDirectory)) {
            continue;
        }

        int prot = 0;
        if (permissions[0] == 'r') prot |= PROT_READ;
        if (permissions[1] == 'w') prot |= PROT_WRITE;
        if (permissions[2] == 'x') prot |= PROT_EXEC;
        if ((prot & PROT_READ) == 0 || start >= end || offset != 0) {
            continue;
        }

        auto *header = reinterpret_cast<const PropertyAreaHeader *>(start);
        const size_t length = end - start;
        if (length < sizeof(*header) || header->magic != kPropertyAreaMagic ||
            header->bytesUsed < sizeof(*header) || header->bytesUsed > length) {
            continue;
        }

        mappings.push_back({
                .start = start,
                .end = end,
                .prot = prot,
                .offset = offset,
                .path = std::move(pathname),
        });
    }

    fclose(maps);
    if (mappings.empty()) {
        LOGE("[PROP-VIRT] no valid property areas found");
        return false;
    }
    return true;
}

Mapping *mappingFor(State &state, const prop_info *info) {
    const uintptr_t address = reinterpret_cast<uintptr_t>(info);
    for (auto &mapping : state.mappings) {
        if (address >= mapping.start && address + sizeof(InlinePropertyInfo) <= mapping.end) {
            return &mapping;
        }
    }
    return nullptr;
}

const char *overrideFor(const Config &config, std::string_view name) {
    if (name == "init.svc.adbd") return "stopped";
    if (name == "sys.usb.state") return "mtp";
    if (name.ends_with("api_level") && !config.deviceInitialSdkInt.empty()) {
        return config.deviceInitialSdkInt.c_str();
    }
    if (name.ends_with(".security_patch") && !config.securityPatch.empty()) {
        return config.securityPatch.c_str();
    }
    if (name.ends_with(".build.id") && !config.buildId.empty()) {
        return config.buildId.c_str();
    }
    return nullptr;
}

void enumerateProperty(void *cookie, const char *name, const char *value, uint32_t serial) {
    auto *state = static_cast<State *>(cookie);
    if (name == nullptr) {
        state->enumerationFailed = true;
        return;
    }

    const char *replacement = overrideFor(state->config, name);
    if (replacement == nullptr) {
        return;
    }
    if (strlen(replacement) >= PROP_VALUE_MAX) {
        LOGE("[PROP-VIRT] %s override exceeds PROP_VALUE_MAX", name);
        state->enumerationFailed = true;
        return;
    }

    const prop_info *info = __system_property_find(name);
    Mapping *mapping = info == nullptr ? nullptr : mappingFor(*state, info);
    if (mapping == nullptr) {
        LOGE("[PROP-VIRT] %s has no validated owning area", name);
        state->enumerationFailed = true;
        return;
    }

    if (serial & kLongPropertyFlag) {
        LOGE("[PROP-VIRT] %s uses long-property encoding; refusing remap", name);
        state->enumerationFailed = true;
        return;
    }
    state->overrides.push_back({.mapping = mapping,
                                .offset = reinterpret_cast<uintptr_t>(info) - mapping->start,
                                .name = name,
                                .value = replacement});
}

void enumerateCallback(const prop_info *info, void *cookie) {
    if (info == nullptr) {
        static_cast<State *>(cookie)->enumerationFailed = true;
        return;
    }
    __system_property_read_callback(info, enumerateProperty, cookie);
}

bool prepareMapping(Mapping &mapping) {
    const size_t length = mapping.end - mapping.start;
    mapping.originalFd = static_cast<int>(syscall(SYS_memfd_create, "jit-cache", MFD_CLOEXEC));
    mapping.replacementFd = static_cast<int>(syscall(SYS_memfd_create, "jit-cache", MFD_CLOEXEC));
    if (mapping.originalFd < 0 || mapping.replacementFd < 0 ||
        ftruncate(mapping.originalFd, static_cast<off_t>(length)) != 0 ||
        ftruncate(mapping.replacementFd, static_cast<off_t>(length)) != 0) {
        LOGE("[PROP-VIRT] cannot create private image for %s: %s", mapping.path.c_str(), strerror(errno));
        return false;
    }

    void *originalImage = mmap(nullptr, length, PROT_READ | PROT_WRITE, MAP_SHARED, mapping.originalFd, 0);
    if (originalImage == MAP_FAILED) {
        LOGE("[PROP-VIRT] cannot snapshot %s: %s", mapping.path.c_str(), strerror(errno));
        return false;
    }
    memcpy(originalImage, reinterpret_cast<const void *>(mapping.start), length);
    munmap(originalImage, length);

    mapping.replacementImage = mmap(nullptr, length, PROT_READ | PROT_WRITE, MAP_SHARED, mapping.replacementFd, 0);
    if (mapping.replacementImage == MAP_FAILED) {
        LOGE("[PROP-VIRT] cannot map private image for %s: %s", mapping.path.c_str(), strerror(errno));
        return false;
    }
    void *snapshot = mmap(nullptr, length, PROT_READ, MAP_SHARED, mapping.originalFd, 0);
    if (snapshot == MAP_FAILED) {
        LOGE("[PROP-VIRT] cannot read snapshot for %s: %s", mapping.path.c_str(), strerror(errno));
        return false;
    }
    memcpy(mapping.replacementImage, snapshot, length);
    munmap(snapshot, length);
    return true;
}

bool applyOverride(Mapping &mapping, const Override &override, const Config &config) {
    const uintptr_t offset = override.offset;
    const size_t length = mapping.end - mapping.start;
    if (offset + sizeof(InlinePropertyInfo) > length) {
        return false;
    }

    auto *info = reinterpret_cast<InlinePropertyInfo *>(static_cast<uint8_t *>(mapping.replacementImage) + offset);
    const uint32_t oldSerial = info->serial;
    // Bionic sets bit 0 while modifying a property, then increments it again
    // when publishing. A published serial must therefore have bit 0 clear.
    const uint32_t version = ((oldSerial | 1U) + 1) & (0x00ffffffU & ~kLongPropertyFlag);
    memset(info->value, 0, sizeof(info->value));
    memcpy(info->value, override.value.c_str(), override.value.size());
    info->serial = (static_cast<uint32_t>(override.value.size()) << 24) | version;
    return true;
}

void cleanup(std::vector<Mapping> &mappings) {
    for (auto &mapping : mappings) {
        if (mapping.replacementImage != MAP_FAILED) {
            munmap(mapping.replacementImage, mapping.end - mapping.start);
        }
        if (mapping.replacementFd >= 0) close(mapping.replacementFd);
        if (mapping.originalFd >= 0) close(mapping.originalFd);
    }
}

void rollback(std::vector<Mapping> &mappings, const Config &config) {
    for (auto &mapping : mappings) {
        if (!mapping.replaced) continue;
        void *restored = mmap(reinterpret_cast<void *>(mapping.start), mapping.end - mapping.start, mapping.prot,
                              MAP_FIXED | MAP_SHARED, mapping.originalFd, 0);
        if (config.debug) LOGD("[PROP-VIRT] rollback %s %s", mapping.path.c_str(),
                                restored == MAP_FAILED ? "failed" : "ok");
    }
}

} // namespace

bool install(const Config &config) {
    State state{.config = config};
    if (!parseMappings(state.mappings, config)) {
        return false;
    }
    if (__system_property_foreach(enumerateCallback, &state) != 0 || state.enumerationFailed) {
        LOGE("[PROP-VIRT] property enumeration failed");
        return false;
    }
    if (state.overrides.empty()) {
        LOGE("[PROP-VIRT] no configured property rules matched");
        return false;
    }

    std::vector<Mapping *> affected;
    for (const auto &override : state.overrides) {
        Mapping *mapping = override.mapping;
        if (mapping == nullptr) {
            cleanup(state.mappings);
            return false;
        }
        if (std::find(affected.begin(), affected.end(), mapping) == affected.end()) {
            affected.push_back(mapping);
        }
    }
    for (Mapping *mapping : affected) {
        if (!prepareMapping(*mapping)) {
            cleanup(state.mappings);
            return false;
        }
    }
    for (const auto &override : state.overrides) {
        if (override.mapping == nullptr || !applyOverride(*override.mapping, override, config)) {
            LOGE("[PROP-VIRT] cannot patch %s", override.name.c_str());
            cleanup(state.mappings);
            return false;
        }
    }

    for (Mapping *mapping : affected) {
        void *replaced = mmap(reinterpret_cast<void *>(mapping->start), mapping->end - mapping->start, mapping->prot,
                              MAP_FIXED | MAP_SHARED, mapping->replacementFd, 0);
        if (replaced == MAP_FAILED) {
            LOGE("[PROP-VIRT] remap failed for %s: %s", mapping->path.c_str(), strerror(errno));
            rollback(state.mappings, config);
            cleanup(state.mappings);
            return false;
        }
        mapping->replaced = true;
    }

    for (const auto &override : state.overrides) {
        char value[PROP_VALUE_MAX] = {};
        const prop_info *info = __system_property_find(override.name.c_str());
        const int valueLength = __system_property_get(override.name.c_str(), value);
        auto *expected = reinterpret_cast<const InlinePropertyInfo *>(override.mapping->start + override.offset);
        if (info == nullptr || valueLength < 0 || override.value != value) {
            LOGE("[PROP-VIRT] verification failed for %s expected=%p resolved=%p expected=%s actual=%s length=%d",
                 override.name.c_str(), expected, info, expected->value, value, valueLength);
            rollback(state.mappings, config);
            cleanup(state.mappings);
            return false;
        }
    }

    cleanup(state.mappings);
    if (config.debug) LOGD("[PROP-VIRT] installed %zu overrides across %zu areas", state.overrides.size(), affected.size());
    return true;
}

} // namespace pif::property_virtualizer
