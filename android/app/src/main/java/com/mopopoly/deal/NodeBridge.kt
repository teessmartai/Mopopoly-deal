package com.mopopoly.deal

/**
 * Loads the native libraries and exposes the single entry point that starts the
 * embedded Node.js runtime. Node can only be started once per process lifetime
 * (a nodejs-mobile limitation), so [started] guards against a second launch.
 */
object NodeBridge {
    init {
        // libnode.so must load before native-lib.so, which depends on it.
        System.loadLibrary("node")
        System.loadLibrary("native-lib")
    }

    /** Calls node::Start with the given argv. Blocks until Node exits. */
    external fun startNodeWithArguments(arguments: Array<String>): Int

    @Volatile
    var started: Boolean = false
}
