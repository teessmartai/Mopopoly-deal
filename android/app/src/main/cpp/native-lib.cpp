// JNI bridge that boots an embedded Node.js (nodejs-mobile) runtime inside the
// Android app process. Modeled on the official nodejs-mobile "native-gradle"
// sample: it builds a contiguous argv buffer, redirects Node's stdout/stderr to
// logcat, and calls node::Start on the calling thread.

#include <jni.h>
#include <cstdlib>
#include <cstring>
#include <unistd.h>
#include <pthread.h>
#include <android/log.h>

#include "node.h"

#define APPNAME "MopopolyNode"

// --- stdout / stderr -> logcat -------------------------------------------------
static int pipe_stdout[2];
static int pipe_stderr[2];
static pthread_t thread_stdout;
static pthread_t thread_stderr;

static void *thread_stdout_func(void *) {
    ssize_t n;
    char buf[2048];
    while ((n = read(pipe_stdout[0], buf, sizeof(buf) - 1)) > 0) {
        if (buf[n - 1] == '\n') --n;
        buf[n] = 0;
        __android_log_write(ANDROID_LOG_INFO, APPNAME, buf);
    }
    return nullptr;
}

static void *thread_stderr_func(void *) {
    ssize_t n;
    char buf[2048];
    while ((n = read(pipe_stderr[0], buf, sizeof(buf) - 1)) > 0) {
        if (buf[n - 1] == '\n') --n;
        buf[n] = 0;
        __android_log_write(ANDROID_LOG_ERROR, APPNAME, buf);
    }
    return nullptr;
}

static int start_redirecting_stdout_stderr() {
    setvbuf(stdout, nullptr, _IOLBF, 0);
    if (pipe(pipe_stdout) != 0) return -1;
    dup2(pipe_stdout[1], STDOUT_FILENO);

    setvbuf(stderr, nullptr, _IONBF, 0);
    if (pipe(pipe_stderr) != 0) return -1;
    dup2(pipe_stderr[1], STDERR_FILENO);

    if (pthread_create(&thread_stdout, nullptr, thread_stdout_func, nullptr) != 0) return -1;
    pthread_detach(thread_stdout);
    if (pthread_create(&thread_stderr, nullptr, thread_stderr_func, nullptr) != 0) return -1;
    pthread_detach(thread_stderr);
    return 0;
}

extern "C" JNIEXPORT jint JNICALL
Java_com_mopopoly_deal_NodeBridge_startNodeWithArguments(
        JNIEnv *env, jobject /*thiz*/, jobjectArray arguments) {

    const jsize argc = env->GetArrayLength(arguments);

    // libuv requires the argv strings to live in one contiguous buffer.
    int total_len = 0;
    for (jsize i = 0; i < argc; i++) {
        auto s = (jstring) env->GetObjectArrayElement(arguments, i);
        const char *str = env->GetStringUTFChars(s, nullptr);
        total_len += (int) strlen(str) + 1;
        env->ReleaseStringUTFChars(s, str);
        env->DeleteLocalRef(s);
    }

    char *args_buffer = (char *) calloc((size_t) total_len, sizeof(char));
    char **argv = (char **) calloc((size_t) argc, sizeof(char *));

    int cursor = 0;
    for (jsize i = 0; i < argc; i++) {
        auto s = (jstring) env->GetObjectArrayElement(arguments, i);
        const char *str = env->GetStringUTFChars(s, nullptr);
        argv[i] = args_buffer + cursor;
        strcpy(argv[i], str);
        cursor += (int) strlen(str) + 1;
        env->ReleaseStringUTFChars(s, str);
        env->DeleteLocalRef(s);
    }

    start_redirecting_stdout_stderr();

    int result = node::Start(argc, argv);

    free(args_buffer);
    free(argv);
    return (jint) result;
}
