package ie.oghmanotes.websession

import android.webkit.CookieManager
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume

private const val SESSION_MAX_AGE_SECONDS = 30L * 24L * 60L * 60L

internal object WebSessionCookie {
  private val allowedOrigins = setOf(
    "https://oghmanotes.ie",
    "https://dev.oghmanotes.ie",
  )
  private val sessionPattern = Regex("^session=[A-Za-z0-9_.-]+$")

  fun value(origin: String, cookie: String): String {
    if (origin !in allowedOrigins) {
      throw WebSessionException("The WebView origin is not allowed")
    }
    if (!sessionPattern.matches(cookie)) {
      throw WebSessionException("The session cookie is invalid")
    }
    return "$cookie; Path=/; Max-Age=$SESSION_MAX_AGE_SECONDS; HttpOnly; Secure; SameSite=Strict"
  }
}

internal class WebSessionException(message: String) : CodedException(message)

class OghmaWebSessionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("OghmaWebSession")

    AsyncFunction("installSession") Coroutine { origin: String, cookie: String ->
      val cookieValue = WebSessionCookie.value(origin, cookie)
      withContext(Dispatchers.Main) {
        val manager = CookieManager.getInstance()
        manager.setAcceptCookie(true)
        val accepted = suspendCancellableCoroutine { continuation ->
          manager.setCookie(origin, cookieValue) { result ->
            if (continuation.isActive) continuation.resume(result)
          }
        }
        if (!accepted) throw WebSessionException("Android rejected the session cookie")
        manager.flush()
      }
    }
  }
}
