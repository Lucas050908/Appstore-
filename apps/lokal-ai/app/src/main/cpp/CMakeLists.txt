cmake_minimum_required(VERSION 3.22.1)
project(lokalai C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# llama.cpp hentes af workflowet til ../../../../llama.cpp (fast commit, se build.yml)
set(LLAMA_SRC ${CMAKE_CURRENT_LIST_DIR}/../../../../llama.cpp)

set(GGML_CPU_KLEIDIAI ON  CACHE BOOL "" FORCE)
set(GGML_OPENMP       ON  CACHE BOOL "" FORCE)
add_subdirectory(${LLAMA_SRC} build-llama)

add_library(lokalai SHARED lokalai.cpp)
target_compile_definitions(lokalai PRIVATE GGML_BACKEND_DL)
target_include_directories(lokalai PRIVATE
    ${LLAMA_SRC}/include ${LLAMA_SRC}/common ${LLAMA_SRC}/ggml/include)
target_link_libraries(lokalai llama llama-common android log)
