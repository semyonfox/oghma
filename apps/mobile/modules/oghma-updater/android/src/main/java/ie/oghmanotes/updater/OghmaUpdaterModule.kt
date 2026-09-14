package ie.oghmanotes.updater

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.content.pm.Signature
import android.net.Uri
import android.os.Build
import android.os.StatFs
import android.provider.Settings
import androidx.core.content.FileProvider
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.types.OptimizedRecord
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.HttpsURLConnection
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private const val UPDATE_URL =
  "https://oghmanotes.ie/downloads/oghmanotes-alpha.apk"
private const val DOWNLOAD_PROGRESS_EVENT = "downloadProgress"
private const val UPDATE_DIRECTORY = "oghma-updater"
private const val TEMP_FILE_NAME = "update-download.tmp"
private const val VERIFIED_FILE_NAME = "verified-update.apk"
private const val APK_MIME_TYPE = "application/vnd.android.package-archive"
private const val CONNECT_TIMEOUT_MS = 15_000
private const val READ_TIMEOUT_MS = 30_000
private const val PROGRESS_INTERVAL_MS = 200L
private const val MAX_APK_BYTES = 250L * 1024L * 1024L
private const val FREE_SPACE_BUFFER_BYTES = 8L * 1024L * 1024L

@OptimizedRecord
class UpdateDownloadRecord : Record {
  @Field
  var versionCode: Long = 0

  @Field
  var bytes: Long = 0

  @Field
  var sha256: String = ""
}

private data class TrustedUpdate(
  val versionCode: Long,
  val bytes: Long,
  val sha256: String,
  val file: File,
)

private class UpdaterException(message: String, cause: Throwable? = null) :
  CodedException(message, cause)

class OghmaUpdaterModule : Module() {
  private val downloadActive = AtomicBoolean(false)
  private val fileOperationActive = AtomicBoolean(false)
  private val cancelRequested = AtomicBoolean(false)
  private val stateLock = Any()

  @Volatile
  private var currentConnection: HttpsURLConnection? = null

  @Volatile
  private var currentInput: InputStream? = null

  @Volatile
  private var destroyed = false

  private var trustedUpdate: TrustedUpdate? = null
  private var installerReadActive = false
  private var cachedUpdateDirectory: File? = null

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val updateDirectory: File
    get() = cachedUpdateDirectory
      ?: File(context.cacheDir, UPDATE_DIRECTORY).also { cachedUpdateDirectory = it }

  override fun definition() = ModuleDefinition {
    Name("OghmaUpdater")

    Events(DOWNLOAD_PROGRESS_EVENT)

    OnCreate {
      destroyed = false
      cancelRequested.set(false)
      cachedUpdateDirectory = File(context.cacheDir, UPDATE_DIRECTORY)
      synchronized(stateLock) {
        trustedUpdate = null
        installerReadActive = false
      }
      cleanDirectory()
    }

    Function("getInstalledVersion") {
      val info = getInstalledPackageInfo(includeSignatures = false)
      mapOf(
        "version" to (info.versionName ?: ""),
        "versionCode" to packageVersionCode(info),
      )
    }

    AsyncFunction("downloadUpdate") Coroutine { requested: UpdateDownloadRecord ->
      withContext(Dispatchers.IO) {
        downloadUpdate(requested)
      }
    }

    Function("cancelDownload") {
      cancelDownload()
    }

    Function("canInstallPackages") {
      canInstallPackages()
    }

    AsyncFunction("openInstallPermissionSettings") {
      openInstallPermissionSettings()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("installUpdate") Coroutine { ->
      installUpdate()
    }

    Function("discardUpdate") {
      discardUpdate()
    }

    OnDestroy {
      destroyed = true
      cancelDownload()
      val directory = cachedUpdateDirectory
      if (directory != null) {
        deleteQuietly(File(directory, TEMP_FILE_NAME))
      }
      synchronized(stateLock) {
        if (!installerReadActive && !fileOperationActive.get() && directory != null) {
          deleteQuietly(File(directory, VERIFIED_FILE_NAME))
        }
        trustedUpdate = null
      }
    }
  }

  private fun downloadUpdate(requested: UpdateDownloadRecord) {
    val expected = validateRequestedUpdate(requested)
    synchronized(stateLock) {
      if (installerReadActive) {
        throw UpdaterException("The installer is using the update file")
      }
      if (!downloadActive.compareAndSet(false, true)) {
        throw UpdaterException("A download is already running")
      }
      if (!fileOperationActive.compareAndSet(false, true)) {
        downloadActive.set(false)
        throw UpdaterException("The update file is busy")
      }
      cancelRequested.set(false)
    }

    val directory = updateDirectory
    val temporaryFile = File(directory, TEMP_FILE_NAME)
    val verifiedFile = File(directory, VERIFIED_FILE_NAME)
    var completed = false

    try {
      if (destroyed) {
        throw UpdaterException("The updater is unavailable")
      }

      val existing = synchronized(stateLock) { trustedUpdate }
      if (existing != null && existing.matches(expected)) {
        emitProgress(existing.bytes, existing.bytes, "verifying")
        validateTrustedApk(existing)
        completed = true
        return
      }

      synchronized(stateLock) {
        trustedUpdate = null
      }
      directory.mkdirsOrThrow()
      deleteQuietly(temporaryFile)
      deleteQuietly(verifiedFile)
      checkDiskSpace(directory, expected.bytes)

      val digest = MessageDigest.getInstance("SHA-256")
      val receivedBytes = streamDownload(temporaryFile, expected.bytes, digest)
      checkCancelled()
      emitProgress(receivedBytes, expected.bytes, "verifying")

      if (receivedBytes != expected.bytes) {
        throw UpdaterException("Downloaded file size does not match")
      }
      val actualSha256 = digest.digest().toHex()
      if (!actualSha256.equals(expected.sha256, ignoreCase = true)) {
        throw UpdaterException("Downloaded file checksum does not match")
      }

      validateApk(temporaryFile, expected.versionCode)
      if (!temporaryFile.renameTo(verifiedFile)) {
        throw UpdaterException("Could not save the verified update")
      }

      val trusted = expected.copy(file = verifiedFile)
      synchronized(stateLock) {
        trustedUpdate = trusted
      }
      completed = true
    } catch (error: UpdaterException) {
      throw error
    } catch (error: IOException) {
      if (cancelRequested.get() || destroyed) {
        throw UpdaterException("Download cancelled", error)
      }
      throw UpdaterException("Download failed", error)
    } catch (error: SecurityException) {
      throw UpdaterException("Update validation failed", error)
    } catch (error: Exception) {
      throw UpdaterException("Update validation failed", error)
    } finally {
      currentInput = null
      currentConnection?.disconnect()
      currentConnection = null
      deleteQuietly(temporaryFile)
      if (!completed) {
        deleteQuietly(verifiedFile)
        synchronized(stateLock) {
          trustedUpdate = null
        }
      }
      cancelRequested.set(false)
      fileOperationActive.set(false)
      downloadActive.set(false)
    }
  }

  private fun streamDownload(
    destination: File,
    expectedBytes: Long,
    digest: MessageDigest,
  ): Long {
    val connection = (URL(UPDATE_URL).openConnection() as HttpsURLConnection).apply {
      instanceFollowRedirects = false
      connectTimeout = CONNECT_TIMEOUT_MS
      readTimeout = READ_TIMEOUT_MS
      useCaches = false
      requestMethod = "GET"
      setRequestProperty("Accept-Encoding", "identity")
    }
    currentConnection = connection

    try {
      connection.connect()
      checkCancelled()
      val status = connection.responseCode
      if (status in 300..399) {
        throw UpdaterException("Update download was redirected")
      }
      if (status != HttpURLConnection.HTTP_OK) {
        throw UpdaterException("Update download failed")
      }

      val contentLength = connection.contentLengthLong
      if (contentLength > MAX_APK_BYTES) {
        throw UpdaterException("Update file is too large")
      }
      if (contentLength >= 0 && contentLength != expectedBytes) {
        throw UpdaterException("Update file size does not match")
      }

      val input = BufferedInputStream(connection.inputStream)
      currentInput = input
      FileOutputStream(destination).use { fileOutput ->
        BufferedOutputStream(fileOutput).use { output ->
          input.use {
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE * 4)
            var received = 0L
            var lastProgressAt = 0L
            emitProgress(0, expectedBytes, "downloading")

            while (true) {
              checkCancelled()
              val read = input.read(buffer)
              if (read < 0) {
                break
              }
              if (read == 0) {
                continue
              }
              received += read
              if (received > expectedBytes || received > MAX_APK_BYTES) {
                throw UpdaterException("Update file is too large")
              }
              output.write(buffer, 0, read)
              digest.update(buffer, 0, read)

              val now = android.os.SystemClock.elapsedRealtime()
              if (now - lastProgressAt >= PROGRESS_INTERVAL_MS) {
                emitProgress(received, expectedBytes, "downloading")
                lastProgressAt = now
              }
            }
          }
          output.flush()
          fileOutput.fd.sync()
        }
      }
      emitProgress(destination.length(), expectedBytes, "downloading")
      return destination.length()
    } finally {
      currentInput = null
      connection.disconnect()
      currentConnection = null
    }
  }

  private suspend fun installUpdate() {
    if (destroyed) throw UpdaterException("The updater is unavailable")
    if (!fileOperationActive.compareAndSet(false, true)) {
      throw UpdaterException("The update file is busy")
    }

    try {
      if (!canInstallPackages()) {
        throw UpdaterException("Install permission is required")
      }
      val trusted = synchronized(stateLock) { trustedUpdate }
        ?: throw UpdaterException("No verified update is ready")

      withContext(Dispatchers.IO) {
        validateTrustedApk(trusted)
      }
      if (destroyed) throw UpdaterException("The updater is unavailable")

      val uri = FileProvider.getUriForFile(
        context,
        "${context.packageName}.oghma-updater.fileprovider",
        trusted.file,
      )
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, APK_MIME_TYPE)
        clipData = ClipData.newRawUri("OghmaNotes update", uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      withContext(Dispatchers.Main) {
        appContext.throwingActivity.startActivity(intent)
      }
      synchronized(stateLock) {
        installerReadActive = true
      }
    } catch (error: UpdaterException) {
      throw error
    } catch (error: Exception) {
      throw UpdaterException("Could not open the package installer", error)
    } finally {
      fileOperationActive.set(false)
    }
  }

  private fun validateTrustedApk(trusted: TrustedUpdate) {
    if (!trusted.file.isFile || trusted.file.length() != trusted.bytes) {
      discardInvalidTrustedUpdate(trusted.file)
      throw UpdaterException("The verified update is no longer valid")
    }

    val actualSha256 = FileInputStream(trusted.file).use { input ->
      val digest = MessageDigest.getInstance("SHA-256")
      val buffer = ByteArray(DEFAULT_BUFFER_SIZE * 4)
      while (true) {
        val read = input.read(buffer)
        if (read < 0) {
          break
        }
        digest.update(buffer, 0, read)
      }
      digest.digest().toHex()
    }
    if (!actualSha256.equals(trusted.sha256, ignoreCase = true)) {
      discardInvalidTrustedUpdate(trusted.file)
      throw UpdaterException("The verified update is no longer valid")
    }
    validateApk(trusted.file, trusted.versionCode)
  }

  private fun validateApk(file: File, expectedVersionCode: Long) {
    val archiveInfo = getArchivePackageInfo(file)
      ?: throw UpdaterException("Downloaded file is not a valid APK")
    val installedInfo = getInstalledPackageInfo(includeSignatures = true)

    if (archiveInfo.packageName != context.packageName) {
      throw UpdaterException("Update package name does not match")
    }
    val archiveVersionCode = packageVersionCode(archiveInfo)
    if (archiveVersionCode != expectedVersionCode) {
      throw UpdaterException("Update version does not match")
    }
    if (archiveVersionCode <= packageVersionCode(installedInfo)) {
      throw UpdaterException("Update version is not newer")
    }

    val archiveSigners = currentSignerDigests(archiveInfo)
    val installedSigners = currentSignerDigests(installedInfo)
    if (archiveSigners.isEmpty() || archiveSigners != installedSigners) {
      throw UpdaterException("Update signing certificate does not match")
    }
  }

  private fun getArchivePackageInfo(file: File): PackageInfo? {
    val flags = signatureFlags()
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.packageManager.getPackageArchiveInfo(
        file.absolutePath,
        PackageManager.PackageInfoFlags.of(flags.toLong()),
      )
    } else {
      @Suppress("DEPRECATION")
      context.packageManager.getPackageArchiveInfo(file.absolutePath, flags)
    }
  }

  private fun getInstalledPackageInfo(includeSignatures: Boolean): PackageInfo {
    val flags = if (includeSignatures) signatureFlags() else 0
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context.packageManager.getPackageInfo(
          context.packageName,
          PackageManager.PackageInfoFlags.of(flags.toLong()),
        )
      } else {
        @Suppress("DEPRECATION")
        context.packageManager.getPackageInfo(context.packageName, flags)
      }
    } catch (error: PackageManager.NameNotFoundException) {
      throw UpdaterException("Could not read the installed app version", error)
    }
  }

  private fun signatureFlags(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      PackageManager.GET_SIGNING_CERTIFICATES
    } else {
      @Suppress("DEPRECATION")
      PackageManager.GET_SIGNATURES
    }

  private fun currentSignerDigests(info: PackageInfo): Set<String> {
    val signatures: Array<Signature> =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        info.signingInfo?.apkContentsSigners ?: emptyArray()
      } else {
        @Suppress("DEPRECATION")
        info.signatures ?: emptyArray()
      }
    return signatures.mapTo(mutableSetOf()) { signature ->
      MessageDigest.getInstance("SHA-256").digest(signature.toByteArray()).toHex()
    }
  }

  private fun packageVersionCode(info: PackageInfo): Long =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      info.longVersionCode
    } else {
      @Suppress("DEPRECATION")
      info.versionCode.toLong()
    }

  private fun validateRequestedUpdate(requested: UpdateDownloadRecord): TrustedUpdate {
    if (requested.versionCode <= 0) {
      throw UpdaterException("Invalid update version")
    }
    if (requested.bytes <= 0 || requested.bytes > MAX_APK_BYTES) {
      throw UpdaterException("Invalid update file size")
    }
    val normalizedSha256 = requested.sha256.lowercase(Locale.ROOT)
    if (!normalizedSha256.matches(Regex("^[0-9a-f]{64}$"))) {
      throw UpdaterException("Invalid update checksum")
    }
    if (requested.versionCode <= packageVersionCode(getInstalledPackageInfo(false))) {
      throw UpdaterException("Update version is not newer")
    }
    return TrustedUpdate(
      versionCode = requested.versionCode,
      bytes = requested.bytes,
      sha256 = normalizedSha256,
      file = File(updateDirectory, VERIFIED_FILE_NAME),
    )
  }

  private fun TrustedUpdate.matches(other: TrustedUpdate): Boolean =
    versionCode == other.versionCode && bytes == other.bytes && sha256 == other.sha256

  private fun checkDiskSpace(directory: File, expectedBytes: Long) {
    val availableBytes = StatFs(directory.absolutePath).availableBytes
    if (availableBytes < expectedBytes + FREE_SPACE_BUFFER_BYTES) {
      throw UpdaterException("Not enough storage for the update")
    }
  }

  private fun checkCancelled() {
    if (cancelRequested.get() || destroyed || Thread.currentThread().isInterrupted) {
      throw UpdaterException("Download cancelled")
    }
  }

  private fun cancelDownload() {
    synchronized(stateLock) {
      if (!downloadActive.get()) {
        return
      }
      cancelRequested.set(true)
    }
    try {
      currentInput?.close()
    } catch (_: IOException) {
      // Closing the stream is only used to interrupt the blocking read.
    }
    currentConnection?.disconnect()
  }

  private fun canInstallPackages(): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.packageManager.canRequestPackageInstalls()
    } else {
      @Suppress("DEPRECATION")
      Settings.Secure.getInt(
        context.contentResolver,
        Settings.Secure.INSTALL_NON_MARKET_APPS,
        0,
      ) == 1
    }

  private fun openInstallPermissionSettings() {
    val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Intent(
        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
        Uri.parse("package:${context.packageName}"),
      )
    } else {
      Intent(Settings.ACTION_SECURITY_SETTINGS)
    }
    try {
      appContext.throwingActivity.startActivity(intent)
    } catch (error: Exception) {
      throw UpdaterException("Could not open install settings", error)
    }
  }

  private fun discardUpdate() {
    if (!fileOperationActive.compareAndSet(false, true)) {
      throw UpdaterException("The update file is busy")
    }
    try {
      synchronized(stateLock) {
        if (installerReadActive) {
          throw UpdaterException("The installer is using the update file")
        }
        trustedUpdate = null
        deleteQuietly(File(updateDirectory, VERIFIED_FILE_NAME))
        deleteQuietly(File(updateDirectory, TEMP_FILE_NAME))
      }
    } finally {
      fileOperationActive.set(false)
    }
  }

  private fun discardInvalidTrustedUpdate(file: File) {
    var canDelete = false
    synchronized(stateLock) {
      trustedUpdate = null
      canDelete = !installerReadActive
    }
    if (canDelete) {
      deleteQuietly(file)
    }
  }

  private fun emitProgress(receivedBytes: Long, totalBytes: Long, stage: String) {
    if (destroyed) {
      return
    }
    sendEvent(
      DOWNLOAD_PROGRESS_EVENT,
      mapOf(
        "receivedBytes" to receivedBytes,
        "totalBytes" to totalBytes,
        "stage" to stage,
      ),
    )
  }

  private fun File.mkdirsOrThrow() {
    if ((!exists() && !mkdirs()) || !isDirectory) {
      throw UpdaterException("Could not create update storage")
    }
  }

  private fun cleanDirectory() {
    val directory = updateDirectory
    if (!directory.exists()) {
      return
    }
    directory.listFiles()?.forEach(::deleteQuietly)
  }

  private fun deleteQuietly(file: File) {
    if (file.exists()) {
      file.delete()
    }
  }

  private fun ByteArray.toHex(): String = joinToString(separator = "") { byte ->
    "%02x".format(Locale.ROOT, byte.toInt() and 0xff)
  }
}
