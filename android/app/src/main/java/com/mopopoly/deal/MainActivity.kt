package com.mopopoly.deal

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import android.webkit.WebViewClient
import java.net.HttpURLConnection
import java.net.URL

/**
 * Launches the host foreground service and shows the host screen (LAN URL + QR)
 * in a WebView once the embedded server is listening. The WebView loads from
 * 127.0.0.1 so this phone can also play as a seated player; the player client
 * derives its WebSocket URL from location.host, so localhost works here while
 * other phones use the LAN address shown in the QR.
 */
class MainActivity : Activity() {

    private lateinit var webView: WebView
    private val handler = Handler(Looper.getMainLooper())
    private val baseUrl = "http://127.0.0.1:${NodeService.PORT}"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        requestNotificationPermissionIfNeeded()
        startHostService()

        webView = WebView(this)
        setContentView(webView)
        configureWebView()
        webView.loadDataWithBaseURL(null, LOADING_HTML, "text/html", "utf-8", null)

        waitForServerThenLoad(0)
    }

    private fun configureWebView() {
        val s = webView.settings
        s.javaScriptEnabled = true
        // localStorage is where the player client keeps its session token, which
        // is what makes reconnection (same seat/hand) work.
        s.domStorageEnabled = true
        s.mediaPlaybackRequiresUserGesture = false
        // Keep navigation inside the WebView.
        webView.webViewClient = WebViewClient()
    }

    private fun waitForServerThenLoad(attempt: Int) {
        Thread {
            val up = isServerUp()
            handler.post {
                if (up) {
                    webView.loadUrl("$baseUrl/host")
                } else if (attempt < MAX_WAIT_ATTEMPTS) {
                    handler.postDelayed({ waitForServerThenLoad(attempt + 1) }, 500)
                } else {
                    // Give up waiting and try anyway; the host page retries too.
                    webView.loadUrl("$baseUrl/host")
                }
            }
        }.start()
    }

    private fun isServerUp(): Boolean = try {
        val conn = URL("$baseUrl/api/hostinfo").openConnection() as HttpURLConnection
        conn.connectTimeout = 800
        conn.readTimeout = 800
        val ok = conn.responseCode in 200..299
        conn.disconnect()
        ok
    } catch (e: Exception) {
        false
    }

    private fun startHostService() {
        val intent = Intent(this, NodeService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent)
        else startService(intent)
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 100)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack()
        else super.onBackPressed()
    }

    companion object {
        private const val MAX_WAIT_ATTEMPTS = 120 // ~60s
        private const val LOADING_HTML =
            "<!doctype html><html><head><meta name='viewport' " +
            "content='width=device-width,initial-scale=1'>" +
            "<style>html,body{height:100%;margin:0;background:#0d3b2e;color:#eafff5;" +
            "font-family:sans-serif;display:flex;align-items:center;justify-content:center;" +
            "text-align:center}div{padding:24px}h1{color:#ffd34d;letter-spacing:1px}" +
            "</style></head><body><div><h1>MOPOPOLY DEAL</h1>" +
            "<p>Starting the game server on this phone…</p></div></body></html>"
    }
}
