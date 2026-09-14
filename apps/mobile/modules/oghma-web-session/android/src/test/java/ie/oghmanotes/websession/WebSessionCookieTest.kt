package ie.oghmanotes.websession

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class WebSessionCookieTest {
  @Test
  fun acceptsOnlyTheProductionAndDevelopmentOrigins() {
    val cookie = "session=header.payload_signature"
    val expected = "$cookie; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict"
    assertEquals(expected, WebSessionCookie.value("https://oghmanotes.ie", cookie))
    assertEquals(expected, WebSessionCookie.value("https://dev.oghmanotes.ie", cookie))

    for (origin in listOf(
      "http://oghmanotes.ie",
      "https://evil.example",
      "https://oghmanotes.ie.evil.example",
      "https://oghmanotes.ie/path",
    )) {
      assertThrows(WebSessionException::class.java) {
        WebSessionCookie.value(origin, cookie)
      }
    }
  }

  @Test
  fun rejectsCookieAttributesAndOtherCookieNames() {
    for (cookie in listOf(
      "other=value",
      "session=value; Domain=evil.example",
      "session=value\nother=value",
      "session=",
    )) {
      assertThrows(WebSessionException::class.java) {
        WebSessionCookie.value("https://oghmanotes.ie", cookie)
      }
    }
  }
}
