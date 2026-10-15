#include "property_virtualizer.hpp"

#include <android/log.h>
#include <climits>
#include <fcntl.h>
#include <linux/futex.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/sysmacros.h>
#include <sys/system_properties.h>
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
    unsigned devMajor = 0;
    unsigned devMinor = 0;
    uint64_t inode = 0;
    char permLetter = 's';
    int fd = -1;
    bool replaced = false;
};

struct Override {
    Mapping *mapping = nullptr;
    uintptr_t offset = 0;
    std::string name;
    std::string value;
    bool wasLong = false;
    uintptr_t longOffset = 0;
    size_t longLen = 0;
};

struct State {
    const Config &config;
    std::vector<Mapping> mappings;
    std::vector<Override> overrides;
};

#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, "PIF", __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, "PIF", __VA_ARGS__)

struct MapsLine {
    uintptr_t start = 0;
    uintptr_t end = 0;
    uint64_t offset = 0;
    uint64_t inode = 0;
    char permissions[5] = {};
    unsigned devMajor = 0;
    unsigned devMinor = 0;
    std::string path;
};

bool parseMapsLine(const char *line, MapsLine &out) {
    unsigned long start = 0;
    unsigned long end = 0;
    unsigned long long offset = 0;
    unsigned long long inode = 0;
    char permissions[5] = {};
    char device[32] = {};
    char path[256] = {};
    if (sscanf(line, "%lx-%lx %4s %llx %31s %llu %255[^\n]", &start, &end, permissions, &offset,
               device, &inode, path) != 7) {
        return false;
    }

    std::string pathname(path);
    const size_t first = pathname.find_first_not_of(' ');
    if (first == std::string::npos) {
        return false;
    }
    pathname.erase(0, first);

    unsigned devMajor = 0;
    unsigned devMinor = 0;
    if (sscanf(device, "%x:%x", &devMajor, &devMinor) != 2) {
        return false;
    }

    out.start = start;
    out.end = end;
    out.offset = offset;
    out.inode = inode;
    memcpy(out.permissions, permissions, sizeof(out.permissions));
    out.devMajor = devMajor;
    out.devMinor = devMinor;
    out.path = std::move(pathname);
    return true;
}

int protFromPermissions(const char *permissions) {
    int prot = 0;
    if (permissions[0] == 'r') prot |= PROT_READ;
    if (permissions[1] == 'w') prot |= PROT_WRITE;
    if (permissions[2] == 'x') prot |= PROT_EXEC;
    return prot;
}

bool parseMappings(std::vector<Mapping> &mappings, const Config &config) {
    FILE *maps = fopen("/proc/self/maps", "r");
    if (maps == nullptr) {
        LOGE("[PROP-VIRT] cannot open /proc/self/maps: %s", strerror(errno));
        return false;
    }

    char line[512];
    while (fgets(line, sizeof(line), maps) != nullptr) {
        MapsLine entry = {};
        if (!parseMapsLine(line, entry) || !entry.path.starts_with(kPropertyDirectory)) {
            continue;
        }

        const int prot = protFromPermissions(entry.permissions);
        if ((prot & PROT_READ) == 0 || entry.start >= entry.end || entry.offset != 0) {
            continue;
        }

        auto *header = reinterpret_cast<const PropertyAreaHeader *>(entry.start);
        const size_t length = entry.end - entry.start;
        if (length < sizeof(*header) || header->magic != kPropertyAreaMagic ||
            header->bytesUsed < sizeof(*header) || header->bytesUsed > length) {
            continue;
        }

        mappings.push_back({
                .start = entry.start,
                .end = entry.end,
                .prot = prot,
                .offset = entry.offset,
                .path = std::move(entry.path),
                .devMajor = entry.devMajor,
                .devMinor = entry.devMinor,
                .inode = entry.inode,
                .permLetter = entry.permissions[3],
        });
    }

    fclose(maps);
    if (mappings.empty()) {
        LOGE("[PROP-VIRT] no valid property areas found");
        return false;
    }
    if (config.debug) {
        LOGD("[PROP-VIRT] parsed %zu property area mappings", mappings.size());
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

const char *mapValue(const Config &config, std::string_view key) {
    const auto it = config.propMap.find(std::string(key));
    if (it == config.propMap.end() || it->second.empty()) {
        return nullptr;
    }
    return it->second.c_str();
}

const char *overrideFor(const Config &config, std::string_view name) {
    if (name == "init.svc.adbd") return "stopped";
    if (name == "sys.usb.state") return "mtp";
    if (name == "ro.build.fingerprint") {
        return mapValue(config, "FINGERPRINT");
    }
    if (name == "ro.build.id") {
        if (!config.buildId.empty()) return config.buildId.c_str();
        return mapValue(config, "ID");
    }
    if (name == "ro.product.device") {
        return mapValue(config, "DEVICE");
    }
    if (name == "ro.product.name") {
        return mapValue(config, "PRODUCT");
    }
    if (name == "ro.product.brand") {
        return mapValue(config, "BRAND");
    }
    if (name == "ro.product.model") {
        return mapValue(config, "MODEL");
    }
    if (name == "ro.build.version.security_patch") {
        return config.securityPatch.empty() ? nullptr : config.securityPatch.c_str();
    }
    if (name == "ro.board.first_api_level") return "32";
    if (name == "ro.product.first_api_level") {
        return config.deviceInitialSdkInt.empty() ? nullptr : config.deviceInitialSdkInt.c_str();
    }
    return nullptr;
}

void enumerateProperty(void *cookie, const char *name, const char *value, uint32_t serial) {
    auto *state = static_cast<State *>(cookie);
    if (name == nullptr) {
        return;
    }

    const char *replacement = overrideFor(state->config, name);
    if (replacement == nullptr) {
        return;
    }
    if (strlen(replacement) >= PROP_VALUE_MAX) {
        LOGE("[PROP-VIRT] %s override exceeds PROP_VALUE_MAX; skipping", name);
        return;
    }

    const prop_info *info = __system_property_find(name);
    if (info == nullptr) {
        LOGE("[PROP-VIRT] %s not found; skipping", name);
        return;
    }
    Mapping *mapping = mappingFor(*state, info);
    if (mapping == nullptr) {
        LOGE("[PROP-VIRT] %s has no validated owning area; skipping", name);
        return;
    }

    Override entry{.mapping = mapping,
                   .offset = reinterpret_cast<uintptr_t>(info) - mapping->start,
                   .name = name,
                   .value = replacement};
    if ((serial & kLongPropertyFlag) != 0) {
        LOGE("[PROP-VIRT] %s is long-encoded; demoting to inline", name);
        const uintptr_t infoAddr = reinterpret_cast<uintptr_t>(info);
        const uintptr_t valueAddr = reinterpret_cast<uintptr_t>(value);
        if (valueAddr >= infoAddr + sizeof(InlinePropertyInfo)) {
            entry.wasLong = true;
            entry.longOffset = valueAddr - infoAddr;
            entry.longLen = strlen(value);
        }
    }
    state->overrides.push_back(std::move(entry));
}

void enumerateCallback(const prop_info *info, void *cookie) {
    if (info == nullptr) {
        return;
    }
    __system_property_read_callback(info, enumerateProperty, cookie);
}

// bionic opens property areas lazily on first access (ContextNode::CheckAccessAndOpen),
// so a warm-up pass forces every accessible area open BEFORE parseMappings snapshots
// /proc/self/maps. Without this, areas first opened during the real enumeration were
// missing from state.mappings and every property from them failed validation.
void warmupCallback(const prop_info *, void *) {}

bool preflightOpen(Mapping &mapping) {
    mapping.fd = open(mapping.path.c_str(), O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
    if (mapping.fd < 0) {
        LOGE("[PROP-VIRT] cannot open %s: %s", mapping.path.c_str(), strerror(errno));
        return false;
    }

    struct stat st = {};
    if (fstat(mapping.fd, &st) != 0) {
        LOGE("[PROP-VIRT] cannot stat %s: %s", mapping.path.c_str(), strerror(errno));
        return false;
    }
    if (major(st.st_dev) != mapping.devMajor || minor(st.st_dev) != mapping.devMinor ||
        static_cast<uint64_t>(st.st_ino) != mapping.inode) {
        LOGE("[PROP-VIRT] %s identity mismatch dev=%u:%u ino=%" PRIu64 " (mapped %u:%u ino=%" PRIu64 ")",
             mapping.path.c_str(), major(st.st_dev), minor(st.st_dev),
             static_cast<uint64_t>(st.st_ino), mapping.devMajor, mapping.devMinor, mapping.inode);
        return false;
    }

    PropertyAreaHeader header = {};
    const size_t length = mapping.end - mapping.start;
    const ssize_t read = pread(mapping.fd, &header, sizeof(header), 0);
    if (read != static_cast<ssize_t>(sizeof(header)) || header.magic != kPropertyAreaMagic ||
        header.bytesUsed < sizeof(header) || header.bytesUsed > length) {
        LOGE("[PROP-VIRT] %s failed area header revalidation", mapping.path.c_str());
        return false;
    }
    return true;
}

bool remapPrivate(Mapping &mapping) {
    const size_t length = mapping.end - mapping.start;
    mapping.replaced = true;
    void *remapped = mmap(reinterpret_cast<void *>(mapping.start), length,
                          PROT_READ | PROT_WRITE, MAP_FIXED | MAP_PRIVATE, mapping.fd, 0);
    if (remapped == MAP_FAILED) {
        LOGE("[PROP-VIRT] private remap failed for %s: %s", mapping.path.c_str(), strerror(errno));
        return false;
    }
    return true;
}

bool applyOverride(const Mapping &mapping, const Override &override) {
    const size_t length = mapping.end - mapping.start;
    if (override.offset + sizeof(InlinePropertyInfo) > length) {
        return false;
    }

    auto *info = reinterpret_cast<InlinePropertyInfo *>(mapping.start + override.offset);

    if (override.wasLong) {
        const size_t residueStart = override.offset + override.longOffset;
        if (residueStart < override.offset || override.longLen >= length ||
            residueStart + override.longLen + 1 > length) {
            return false;
        }
        memset(reinterpret_cast<void *>(mapping.start + residueStart), 0,
               override.longLen + 1);
    }

    const uint32_t len = static_cast<uint32_t>(override.value.size());
    const uint32_t oldSerial = __atomic_load_n(&info->serial, __ATOMIC_RELAXED);
    const uint32_t serialDirty = oldSerial | 1U;
    __atomic_store_n(&info->serial, serialDirty, __ATOMIC_RELAXED);
    memset(info->value, 0, sizeof(info->value));
    memcpy(info->value, override.value.c_str(), len + 1);

    __atomic_thread_fence(__ATOMIC_RELEASE);

    constexpr uint32_t kCounterMask = 0x00ffffffU & ~kLongPropertyFlag;
    const uint32_t lenFlags = (len << 24) & 0xff000000U;
    const uint32_t visible = lenFlags | ((serialDirty + 1U) & kCounterMask);
    __atomic_store_n(&info->serial, visible, __ATOMIC_RELAXED);
    syscall(SYS_futex, &info->serial, FUTEX_WAKE, INT_MAX, nullptr, nullptr, 0);

    __atomic_thread_fence(__ATOMIC_RELEASE);
    const uint32_t hidden = lenFlags | ((serialDirty & ~1U) & kCounterMask);
    __atomic_store_n(&info->serial, hidden, __ATOMIC_RELAXED);
    return true;
}

bool verifyMappingsIdentity(const std::vector<Mapping *> &affected) {
    FILE *maps = fopen("/proc/self/maps", "r");
    if (maps == nullptr) {
        LOGE("[PROP-VIRT] cannot reopen /proc/self/maps: %s", strerror(errno));
        return false;
    }

    std::vector<Mapping *> pending = affected;
    bool ok = true;
    char line[512];
    while (!pending.empty() && fgets(line, sizeof(line), maps) != nullptr) {
        MapsLine entry = {};
        if (!parseMapsLine(line, entry)) {
            continue;
        }
        auto it = std::find_if(pending.begin(), pending.end(),
                               [&](const Mapping *m) { return m->start == entry.start; });
        if (it == pending.end()) {
            continue;
        }
        const Mapping &mapping = **it;
        pending.erase(it);

        const char access[4] = {
                (mapping.prot & PROT_READ) != 0 ? 'r' : '-',
                (mapping.prot & PROT_WRITE) != 0 ? 'w' : '-',
                (mapping.prot & PROT_EXEC) != 0 ? 'x' : '-',
                '\0',
        };

        const bool match = entry.end == mapping.end && entry.offset == 0 &&
                           entry.devMajor == mapping.devMajor && entry.devMinor == mapping.devMinor &&
                           entry.inode == mapping.inode && entry.path == mapping.path &&
                           entry.permissions[3] == 'p' &&
                           strncmp(entry.permissions, access, 3) == 0;
        if (!match) {
            LOGE("[PROP-VIRT] identity check failed for %s: got %s dev=%u:%u ino=%" PRIu64
                 " path=%s (expected dev=%02x:%02x ino=%" PRIu64 ")",
                 mapping.path.c_str(), entry.permissions, entry.devMajor, entry.devMinor,
                 entry.inode, entry.path.c_str(), mapping.devMajor, mapping.devMinor,
                 mapping.inode);
            ok = false;
        }
    }
    fclose(maps);

    for (const Mapping *mapping : pending) {
        LOGE("[PROP-VIRT] VMA at start=%p for %s vanished from /proc/self/maps",
             reinterpret_cast<void *>(mapping->start), mapping->path.c_str());
        ok = false;
    }
    return ok;
}

void cleanup(std::vector<Mapping> &mappings) {
    for (auto &mapping : mappings) {
        if (mapping.fd >= 0) {
            close(mapping.fd);
            mapping.fd = -1;
        }
    }
}

void rollback(std::vector<Mapping> &mappings, const Config &config) {
    for (auto &mapping : mappings) {
        if (!mapping.replaced || mapping.fd < 0) continue;
        const int flags = MAP_FIXED | (mapping.permLetter == 's' ? MAP_SHARED : MAP_PRIVATE);
        void *restored = mmap(reinterpret_cast<void *>(mapping.start), mapping.end - mapping.start,
                              mapping.prot, flags, mapping.fd, 0);
        if (config.debug) LOGD("[PROP-VIRT] rollback %s %s", mapping.path.c_str(),
                                restored == MAP_FAILED ? "failed" : "ok");
        if (restored != MAP_FAILED) {
            mapping.replaced = false;
        }
    }
}

} // namespace

bool install(const Config &config) {
    State state{.config = config};
    __system_property_foreach(warmupCallback, nullptr);
    if (!parseMappings(state.mappings, config)) {
        return false;
    }
    if (__system_property_foreach(enumerateCallback, &state) != 0) {
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
        if (!preflightOpen(*mapping)) {
            cleanup(state.mappings);
            return false;
        }
    }

    for (Mapping *mapping : affected) {
        if (!remapPrivate(*mapping)) {
            rollback(state.mappings, config);
            cleanup(state.mappings);
            return false;
        }
    }

    for (const auto &override : state.overrides) {
        if (override.mapping == nullptr || !applyOverride(*override.mapping, override)) {
            LOGE("[PROP-VIRT] cannot patch %s", override.name.c_str());
            rollback(state.mappings, config);
            cleanup(state.mappings);
            return false;
        }
    }

    for (Mapping *mapping : affected) {
        if (mprotect(reinterpret_cast<void *>(mapping->start), mapping->end - mapping->start,
                     mapping->prot) != 0) {
            LOGE("[PROP-VIRT] cannot restore protections on %s: %s", mapping->path.c_str(),
                 strerror(errno));
            rollback(state.mappings, config);
            cleanup(state.mappings);
            return false;
        }
    }

    for (const auto &override : state.overrides) {
        char value[PROP_VALUE_MAX] = {};
        const prop_info *info = __system_property_find(override.name.c_str());
        const int valueLength = __system_property_get(override.name.c_str(), value);
        auto *expected = reinterpret_cast<const InlinePropertyInfo *>(override.mapping->start +
                                                                      override.offset);
        if (reinterpret_cast<const prop_info *>(expected) != info || valueLength < 0 ||
            override.value != value || expected->value != override.value) {
            LOGE("[PROP-VIRT] verification failed for %s expected=%p resolved=%p expected=%s actual=%s length=%d",
                 override.name.c_str(), expected, info, expected->value, value, valueLength);
            rollback(state.mappings, config);
            cleanup(state.mappings);
            return false;
        }
    }
    if (!verifyMappingsIdentity(affected)) {
        rollback(state.mappings, config);
        cleanup(state.mappings);
        return false;
    }

    cleanup(state.mappings);
    if (config.debug) LOGD("[PROP-VIRT] installed %zu overrides across %zu areas", state.overrides.size(), affected.size());
    return true;
}

} // namespace pif::property_virtualizer
