cmake_minimum_required(VERSION 3.10)
project(dappily_translator)

set(WHISPER_DIR ${CMAKE_CURRENT_SOURCE_DIR}/whisper.cpp)

# Disable stuff we don't need
set(WHISPER_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)

# Let whisper's own CMake handle everything
add_subdirectory(${WHISPER_DIR} whisper_build)

# Our JNI bridge library
add_library(dappily_native SHARED native-lib.cpp)

target_include_directories(dappily_native PRIVATE
    ${WHISPER_DIR}/include
    ${WHISPER_DIR}/ggml/include
)

find_library(log-lib log)

target_link_libraries(dappily_native whisper ${log-lib} android)
