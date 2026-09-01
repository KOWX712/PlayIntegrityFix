#pragma once

#include "pif_config.hpp"

namespace pif::property_virtualizer {

// Installs a private, per-process copy of each property area that contains a
// configured override. Returns false without changing mappings on validation failure.
[[nodiscard]] bool install(const Config &config);

}
