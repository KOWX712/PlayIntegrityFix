#pragma once

#include "pif_config.hpp"

namespace pif::property_virtualizer {

// Patches configured property overrides directly into this process's property
// area mappings: each affected area is re-mapped MAP_FIXED as a private mapping
// of its genuine /dev/__properties__ file, so the VMA keeps its original
// pathname, device and inode while only the patched pages become private
// (process-local, minimal dirty-page footprint). Returns false and restores
// every mapping on any validation or verification failure.
[[nodiscard]] bool install(const Config &config);

}
