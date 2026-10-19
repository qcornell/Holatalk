cmake_minimum_required(VERSION 3.10)
project(dappily_translator)

# ===== FORCE OPTIMIZATIONS (even in debug builds) =====
# -ffast-math enables aggressive FP optimizations BUT it includes -ffinite-math-only
# which breaks whisper.cpp's vectorized expf() in silu/softmax (see PR #7154)
# So we re-enable non-finite math explicitly after -ffast-math
set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -O3 -DNDEBUG -ffast-math -fno-finite-math-only")
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O3 -DNDEBUG -ffast-math -fno-finite-math-only")

# ARM NEON is automatic on arm64, but explicitly enable for 32-bit
if(CMAKE_ANDROID_ARCH_ABI STREQUAL "armeabi-v7a")
    set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -mfpu=neon")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -mfpu=neon")
endif()

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
find_library(android-lib android)

target_link_libraries(dappily_native whisper ${log-lib} ${android-lib})
