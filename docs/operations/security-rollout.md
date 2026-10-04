# Security rollout

Status: working-tree patch, not deployed. Last reviewed: 2026-10-04.

## Database and sessions

Release the web app and worker with migrations 072–075 through the existing
[migration deployment path](../../infra/HOMELAB.md). The migrations were exercised
on disposable PostgreSQL; they have not run against either deployment.
Migration 072 adds the account session version. Existing sessions without that
version require a new sign-in. Password recovery increments it atomically;
custom cookies, Auth.js cookies, mobile grants and pending tool approvals all
check the current version. Deactivation also clears the calendar capability.

Migration 075 adds a unique index on the trimmed, lowercase email without
rewriting mailbox spelling. Auth, recovery and registration use that same
comparison. Before release, count normalized email collisions without returning
addresses:

```sql
SELECT COUNT(*) FROM (
  SELECT lower(btrim(email)) FROM app.login
  GROUP BY lower(btrim(email)) HAVING COUNT(*) > 1
) collisions;
```

Resolve any collisions explicitly before applying the index. No accounts
are merged automatically. Login remains reachable with revoked cookies, and
`/api/auth/me` expires invalid auth cookies.
If Auth.js masks a callback database outage as a missing session, the shared
resolver checks database availability before rejecting it; outages return a
service error without expiring cookies.

Email verification now requires the mailbox owner to choose a password. It
replaces the unverified registrant's password, clears recovery tokens and bumps
the session version atomically, so resending verification cannot preserve a
pre-registrant's credentials.

## Vault retention

Uploads reserve their exact signed byte length before a URL is issued. There is
one current staging key per account and a shared 20 GiB budget.
Each account can have at most 100 outstanding staging keys, including retired
keys whose signed upload or deletion is still pending.
The PUT signature binds Content-Length, Content-Type and expected-size metadata;
import start checks the stored object length against the reservation. URLs expire
in 15 minutes; reservations stay for at least two hours and while jobs remain
queued or processing. A cancelled job can lose its source before its worker has
finished the current entry; that job then fails its read without publishing.
Failed PUT/signing retries reuse an unclaimed key with matching filename
and size. A subsequent import or changed upload retires its predecessor while
retaining the old key's byte accounting until cleanup; retries cannot escape
the shared budget. The worker retries expired-artifact deletion every five minutes. A failed
delete retains its reservation. Completed export archives last 24 hours; a new
export removes its predecessor before reserving another copy.
Storage deletion while holding an artifact lock has a 30-second cancellation
deadline; a timeout retains its reservation for retry. One account can reserve
the shared budget using two different 10 GiB keys without uploading the files.
The hold is renewable through repeated presigning, subject to the upload rate
limit; one account can keep staging unavailable indefinitely. Object bytes stay
bounded, but this remaining availability risk requires an operator capacity or
admission-policy decision.

Before release, confirm the object gateway rejects altered signed headers with
synthetic objects in an isolated bucket. Configure a storage lifecycle rule for
the `vault-uploads/` and `exports/` prefixes beneath the configured storage
prefix, plus aborting incomplete multipart uploads. Use an expiry long enough
for legitimate queued imports; worker cleanup remains the primary path. This
storage rule is a crash and late-upload backstop, not a replacement for quotas.
The operator must also bound gateway upload duration below the two-hour
reservation grace period. A request accepted before URL expiry must not finish
after its reservation is reclaimed.

Migration 073 retains recent known exports until their original 24-hour expiry
and journals already expired archives into the durable cleanup queue. Clear
Vault journals exact staging/archive keys and immutable import-job prefixes at
its clear boundary, so deferred retries preserve newer imports and exports.
Upload keys queued by a clear are retired under the quota lock and cannot be
reissued by a later signing retry; their bytes remain accounted until expiry.
Older uploads that never created a job cannot be
reconstructed from database records. Inventory those two storage prefixes,
match active jobs and reservations, and review an age-filtered deletion manifest
before deleting legacy objects. Do not apply a blanket bucket purge. Confirm
storage deletion and multipart cleanup on the actual gateway before treating
legacy storage exposure as operationally resolved.

ZIP processing caps each inflated entry at 250 MiB, temporary staging at
512 MiB, pending entries at 512, total entries at 50,000 and total inflated
bytes at 20 GiB. Files that are not imported still count toward those limits.
Oversized archives fail with cleanup; split them into smaller imports. Before
release, test a slow consumer against the isolated gateway to confirm its
idle timeout permits the worker's source backpressure.

Converter responses are capped at 128 MiB before parsing, Markdown at 16 MiB,
each decoded image at 10 MiB, aggregate decoded images at 96 MiB and metadata
at 2 MiB. These limits apply to direct and asynchronous conversion paths before
storage writes.

## Android association

The new native build declares an auto-verified HTTPS intent filter for
`https://oghmanotes.ie/auth/mobile/callback`, package `ie.oghmanotes.alpha`.
The server publishes `/.well-known/assetlinks.json` only when
`ANDROID_APP_LINK_SHA256_FINGERPRINTS` contains valid public certificate SHA-256
fingerprints (comma-separated, colon-delimited). It must identify the certificate
that signs the distributed APK, not a new or debug certificate.

The public APK examined during release coordination had SHA-256
`e3b775002c3840b60a94b1125d4e2ce019c5652073ea7f4cd8c9eb7ffa0ffe55`
and certificate fingerprint
`61:59:04:24:09:37:B7:B1:F2:E6:D4:B5:6A:0C:67:DB:B0:A8:62:FB:7C:87:20:B5:69:04:F8:88:5E:D5:5D:3D`.
Compare that public fingerprint with the trusted release certificate before
setting the association. No private signing material is needed for the server.

The native target is 0.1.6 / versionCode 7, with an app-version runtime boundary
so this handoff cannot ship as an OTA update to old 0.1.5 binaries.

Ship the updated signed APK and serve the association over HTTPS without a
redirect. On a test Android device with that APK, reverify the package links,
confirm `oghmanotes.ie` is verified, and check that the same-origin browser
callback actually opens the app after approval. Then exercise a complete provider sign-in,
cold resume, expired grant and competing-app callback. Only then set the
operator attestation `ANDROID_APP_LINKS_VERIFIED=true`. Authorization and
redemption return 503 until both this attestation and fingerprints are present;
email/password WebView sign-in remains available. Legacy custom-scheme grants
cannot be redeemed in the new Redis namespace. An OTA JavaScript update cannot
install the native intent filter.

[Android verification instructions](https://developer.android.com/training/app-links/verify-applinks)
and [Expo App Links configuration](https://docs.expo.dev/linking/android-app-links/)
describe the association and native rebuild requirements.

## Tool approvals

Note/planning writes and hosted Canvas mutations create stored proposals rather
than executing during model generation. The owner reviews the canonical payload
at `/chat/actions/:id` or through the chat confirmation card. An approval can
claim a proposal once and cannot replace its arguments. Canvas proposals show
the stored origin and bind the connection identity; changing the domain or token
requires a new proposal. Proposals expire after
15 minutes, are capped at 30 per account and are revoked by session-version
changes. A failed or interrupted external write is not automatically retried;
check Canvas or the destination before requesting a replacement action.
