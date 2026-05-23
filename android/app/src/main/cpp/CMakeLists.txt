cmake_minimum_required(VERSION 3.22.1)
project(mopopolynode)

# Prebuilt Node.js for Mobile library, downloaded into app/libnode by the
# build script / CI (see scripts/prepare-node-project.sh and android.yml).
#   app/libnode/bin/<abi>/libnode.so
#   app/libnode/include/node/*.h
set(LIBNODE_ROOT "${CMAKE_SOURCE_DIR}/../../../libnode")

add_library(libnode SHARED IMPORTED)
set_target_properties(libnode PROPERTIES
    IMPORTED_LOCATION "${LIBNODE_ROOT}/bin/${ANDROID_ABI}/libnode.so")

add_library(native-lib SHARED native-lib.cpp)

target_include_directories(native-lib PRIVATE "${LIBNODE_ROOT}/include/node")

find_library(log-lib log)

target_link_libraries(native-lib libnode ${log-lib})
