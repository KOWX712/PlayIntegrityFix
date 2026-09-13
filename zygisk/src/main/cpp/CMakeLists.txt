cmake_minimum_required(VERSION 3.30.5)

project("zygisk")

link_libraries(log)

find_package(cxx REQUIRED CONFIG)

link_libraries(cxx::cxx)

add_library(zygisk SHARED zygisk.cpp pif_config.cpp property_virtualizer.cpp local_cxa_atexit_finalize_impl/atexit.cpp)
