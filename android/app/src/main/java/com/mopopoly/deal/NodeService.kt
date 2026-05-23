package com.mopopoly.deal

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import java.io.File

/**
 * Foreground service that hosts the game. It keeps the embedded Node server
 * alive while the screen is off, shows a persistent notification, and exposes a
 * "Stop hosting" action.
 */
class NodeService : Service() {

    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopEverything()
            return START_NOT_STICKY
        }
        // Must call startForeground promptly after startForegroundService().
        startForeground(NOTIF_ID, buildNotification())
        acquireWakeLock()
        startNodeIfNeeded()
        return START_STICKY
    }

    private fun startNodeIfNeeded() {
        if (NodeBridge.started) return
        NodeBridge.started = true
        Thread({
            try {
                NodeProject.installIfNeeded(this)
                val nodeDir = File(filesDir, NodeProject.ASSET_ROOT)
                val main = File(nodeDir, "mobile-main.js").absolutePath
                // argv: ["node", <script>, <writable data dir>]. mobile-main.js
                // reads argv[2] into MOPOPOLY_DATA_DIR so the save file lands in
                // app-private storage.
                NodeBridge.startNodeWithArguments(
                    arrayOf("node", main, filesDir.absolutePath)
                )
                Log.w(TAG, "Node runtime exited.")
            } catch (t: Throwable) {
                Log.e(TAG, "Node failed to start", t)
            }
        }, "node-main").start()
    }

    private fun buildNotification(): Notification {
        val openPi = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val stopPi = PendingIntent.getService(
            this, 1,
            Intent(this, NodeService::class.java).apply { action = ACTION_STOP },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            Notification.Builder(this, CHANNEL_ID)
        else
            @Suppress("DEPRECATION") Notification.Builder(this)

        return builder
            .setContentTitle("Mopopoly Deal is hosting")
            .setContentText("Tap to open the host screen and QR code.")
            .setSmallIcon(R.drawable.ic_stat_host)
            .setOngoing(true)
            .setContentIntent(openPi)
            .addAction(Notification.Action.Builder(null, "Stop hosting", stopPi).build())
            .build()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(
                CHANNEL_ID, "Game hosting", NotificationManager.IMPORTANCE_LOW
            )
            ch.description = "Keeps the Mopopoly Deal server running while you play."
            getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
        }
    }

    private fun acquireWakeLock() {
        if (wakeLock != null) return
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "mopopoly:host").apply {
            setReferenceCounted(false)
            acquire()
        }
    }

    private fun stopEverything() {
        runCatching { wakeLock?.release() }
        wakeLock = null
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N)
            stopForeground(STOP_FOREGROUND_REMOVE)
        else
            @Suppress("DEPRECATION") stopForeground(true)
        stopSelf()
        // nodejs-mobile cannot cleanly stop/restart Node within a single process,
        // so fully stopping (and freeing the port) requires ending the process.
        // The game is already saved to disk and resumes on relaunch.
        android.os.Process.killProcess(android.os.Process.myPid())
    }

    override fun onDestroy() {
        runCatching { wakeLock?.release() }
        super.onDestroy()
    }

    companion object {
        const val CHANNEL_ID = "mopopoly_host"
        const val NOTIF_ID = 1
        const val ACTION_STOP = "com.mopopoly.deal.STOP"
        const val PORT = 47800
        private const val TAG = "MopopolyService"
    }
}
