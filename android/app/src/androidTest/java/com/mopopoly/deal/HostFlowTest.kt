package com.mopopoly.deal

import android.Manifest
import android.os.Build
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.web.assertion.WebViewAssertions.webMatches
import androidx.test.espresso.web.sugar.Web.onWebView
import androidx.test.espresso.web.webdriver.DriverAtoms.findElement
import androidx.test.espresso.web.webdriver.DriverAtoms.getText
import androidx.test.espresso.web.webdriver.Locator
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.rule.GrantPermissionRule
import org.hamcrest.Matchers.containsString
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.net.HttpURLConnection
import java.net.URL

/**
 * On-emulator end-to-end check of the parts that can't be unit-tested:
 *   1. The native libs load and node::Start boots the embedded server.
 *   2. The foreground service serves HTTP on 127.0.0.1:47800.
 *   3. The WebView loads /host and host.js renders the join URL + QR.
 *
 * Instrumentation runs inside the app process, so localhost reaches the server.
 */
@RunWith(AndroidJUnit4::class)
class HostFlowTest {

    // Pre-grant so the runtime notification prompt (API 33+) can't steal focus
    // from the WebView during the test.
    @get:Rule
    val permission: GrantPermissionRule =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
            GrantPermissionRule.grant(Manifest.permission.POST_NOTIFICATIONS)
        else
            GrantPermissionRule.grant()

    private val base = "http://127.0.0.1:${NodeService.PORT}"

    @Test
    fun server_starts_and_host_screen_renders() {
        ActivityScenario.launch(MainActivity::class.java).use {
            // 1. Embedded Node server comes up (native libs + node::Start + HTTP).
            val info = waitForHostInfo(120_000)
            assertTrue("hostinfo should report a port, got: $info", info.contains("\"port\""))

            // 2. The host page is actually served.
            val hostHtml = httpGet("$base/host")
            assertTrue("host page should be served", hostHtml.contains("MOPOPOLY"))

            // 3. The WebView loaded /host and host.js rendered the join URL.
            //    (Same code path that draws the QR right after.)
            assertWebEventually(30_000) {
                onWebView()
                    .withElement(findElement(Locator.ID, "url"))
                    .check(webMatches(getText(), containsString("http://")))
            }

            // 4. The client-side QR <svg> was injected into #qr. findElement
            //    throws if the selector matches nothing; the terminal check
            //    forces evaluation (Espresso-Web is otherwise lazy).
            assertWebEventually(15_000) {
                onWebView()
                    .withElement(findElement(Locator.CSS_SELECTOR, "#qr svg"))
                    .check(webMatches(getText(), containsString("")))
            }
        }
    }

    private fun waitForHostInfo(timeoutMs: Long): String {
        val deadline = System.currentTimeMillis() + timeoutMs
        var last = ""
        while (System.currentTimeMillis() < deadline) {
            try {
                last = httpGet("$base/api/hostinfo")
                if (last.contains("\"port\"")) return last
            } catch (e: Exception) {
                // server not up yet
            }
            Thread.sleep(1000)
        }
        throw AssertionError("Node server did not answer $base/api/hostinfo in ${timeoutMs}ms (last: '$last')")
    }

    private fun assertWebEventually(timeoutMs: Long, block: () -> Unit) {
        val deadline = System.currentTimeMillis() + timeoutMs
        var lastErr: Throwable? = null
        while (System.currentTimeMillis() < deadline) {
            try {
                block()
                return
            } catch (t: Throwable) {
                lastErr = t
                Thread.sleep(1000)
            }
        }
        throw AssertionError("WebView condition not met in ${timeoutMs}ms", lastErr)
    }

    private fun httpGet(url: String): String {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 2000
        conn.readTimeout = 2000
        return try {
            conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }
}
