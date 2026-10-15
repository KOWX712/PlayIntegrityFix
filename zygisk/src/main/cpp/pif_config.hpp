#pragma once

#include <string>
#include <string_view>
#include <unordered_map>

namespace pif {
    struct Config {
        std::unordered_map<std::string, std::string> propMap;
        bool spoofBuild = true;
        bool spoofProps = true;
        bool spoofProvider = false;
        bool spoofSignature = false;
        bool debug = false;
        std::string deviceInitialSdkInt = "32";
        std::string securityPatch;
        std::string buildId;
        bool spoofVendingSdk = false;
        bool spoofVendingBuild = false;

        [[nodiscard]] bool needsDex() const {
            return spoofProvider || spoofSignature;
        }
    };

    [[nodiscard]] Config parseConfig(std::string_view content);
    [[nodiscard]] bool writeConfig(int fd, const Config &config);
    [[nodiscard]] bool readConfig(int fd, Config &config);
}
