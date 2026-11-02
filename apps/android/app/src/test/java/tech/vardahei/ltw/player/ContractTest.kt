package tech.vardahei.ltw.player

import java.io.File
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The bridge's contract as the shared case table (`apps/native-shim/cases.json`, ADR 0070 §9):
 * the same cases the web client's and the Swift package's tests read.
 */
class ContractTest {
    private val cases = JSONObject(File(System.getProperty("ltw.cases")!!).readText())
    private val token = cases.getString("token")

    private fun JSONArray.objects(): List<JSONObject> = (0 until length()).map(::getJSONObject)

    private fun withToken(text: String) = text.replace("TOKEN", token)

    private fun expected(case: JSONObject, key: String): String? =
        if (case.isNull(key)) null else case.getString(key)

    @Test
    fun typedServersBecomeOrigins() {
        for (case in cases.getJSONArray("origins").objects()) {
            val input = withToken(case.getString("input"))
            assertEquals("debug: $input", expected(case, "debug"), Origins.normalize(input, debug = true))
            assertEquals("release: $input", expected(case, "release"), Origins.normalize(input, debug = false))
        }
    }

    @Test
    fun scannedCodesOpenSwitchOrAreRefused() {
        for (case in cases.getJSONArray("scans").objects()) {
            val text = withToken(case.getString("text"))
            val builds = when (case.getString("build")) {
                "debug" -> listOf(true)
                "release" -> listOf(false)
                else -> listOf(true, false)
            }
            for (debug in builds) {
                val link = Origins.classify(text, case.getString("current"), debug)
                val want = when (case.getString("outcome")) {
                    "open" -> Origins.Link.Open(withToken(case.getString("url")))
                    "switch" -> Origins.Link.Switch(case.getString("origin"), withToken(case.getString("url")))
                    else -> Origins.Link.Reject
                }
                assertEquals("$text (debug=$debug)", want, link)
            }
        }
    }

    @Test
    fun pageMessagesAreParsedStrictly() {
        for (case in cases.getJSONArray("pageMessages").objects()) {
            val json = case.getString("json")
            val parsed = PageMessage.parse(json)
            if (case.getBoolean("valid")) {
                assert(parsed != null) { "should be read: $json" }
            } else {
                assertNull("should be ignored: $json", parsed)
            }
        }
    }

    @Test
    fun theGameViewStaysOnItsServer() {
        val current = "https://ltw.vardahei.tech"
        assertEquals(Origins.Navigation.INSIDE, Origins.navigation("https://ltw.vardahei.tech/table", current, false))
        assertEquals(Origins.Navigation.OUTSIDE, Origins.navigation("https://creativecommons.org/licenses/by/4.0/", current, false))
        assertEquals(Origins.Navigation.OUTSIDE, Origins.navigation("http://ltw.vardahei.tech/", current, false))
        assertEquals(Origins.Navigation.REFUSE, Origins.navigation("intent://scan/#Intent;scheme=zxing;end", current, false))
        assertEquals(Origins.Navigation.REFUSE, Origins.navigation("javascript:alert(1)", current, false))
        assertEquals(Origins.Navigation.REFUSE, Origins.navigation("file:///data/data/x", current, false))
    }
}
