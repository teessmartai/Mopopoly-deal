package com.mopopoly.deal

import android.content.Context
import android.os.Build
import android.util.Log
import java.io.File
import java.io.FileOutputStream

/**
 * The embedded Node project ships inside the APK under assets/nodejs-project,
 * but Node has to require its files from a real, writable filesystem path. On
 * first launch (and after an app update) we copy the asset tree into the app's
 * private files directory.
 */
object NodeProject {
    private const val TAG = "MopopolyNodeProject"
    const val ASSET_ROOT = "nodejs-project"

    @Synchronized
    fun installIfNeeded(ctx: Context) {
        val dest = File(ctx.filesDir, ASSET_ROOT)
        val marker = File(dest, ".installed_version")
        val version = currentVersion(ctx).toString()
        if (marker.exists() && runCatching { marker.readText() }.getOrNull() == version) {
            return
        }
        Log.i(TAG, "Installing embedded Node project (v$version)…")
        if (dest.exists()) dest.deleteRecursively()
        copyTree(ctx, ASSET_ROOT, dest)
        marker.writeText(version)
        Log.i(TAG, "Embedded Node project ready at ${dest.absolutePath}")
    }

    private fun currentVersion(ctx: Context): Long {
        val pi = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) pi.longVersionCode
        else @Suppress("DEPRECATION") pi.versionCode.toLong()
    }

    private fun copyTree(ctx: Context, assetPath: String, outFile: File) {
        val am = ctx.assets
        val children = runCatching { am.list(assetPath) }.getOrNull()
        if (children != null && children.isNotEmpty()) {
            outFile.mkdirs()
            for (child in children) {
                copyTree(ctx, "$assetPath/$child", File(outFile, child))
            }
        } else {
            // Either a file or an empty directory. Try to open it as a file.
            try {
                am.open(assetPath).use { input ->
                    outFile.parentFile?.mkdirs()
                    FileOutputStream(outFile).use { out -> input.copyTo(out) }
                }
            } catch (e: Exception) {
                outFile.mkdirs()
            }
        }
    }
}
