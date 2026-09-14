#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v java >/dev/null || { echo 'Install JDK 17 and set JAVA_HOME/PATH first.' >&2; exit 1; }
: "${ANDROID_HOME:?Set ANDROID_HOME to your Android SDK directory}"

# Preserve this private signing identity between alpha releases so Android can
# install updates over the existing app. Never put it in the repository.
signing_dir="${OGHMA_ANDROID_SIGNING_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/oghmanotes-mobile}"
mkdir -p "$signing_dir"
chmod 700 "$signing_dir"
export OGHMA_ANDROID_KEYSTORE="$signing_dir/alpha.keystore"
export OGHMA_ANDROID_PASSWORD_FILE="$signing_dir/password"
python3 - <<'PY'
import os, pathlib, secrets, subprocess
key = pathlib.Path(os.environ['OGHMA_ANDROID_KEYSTORE'])
password = pathlib.Path(os.environ['OGHMA_ANDROID_PASSWORD_FILE'])
if not key.exists():
    if password.exists():
        raise SystemExit('Signing directory is incomplete. Restore the matching keystore before continuing.')
    fd = os.open(password, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as file:
        file.write(secrets.token_urlsafe(48))
    subprocess.run(['keytool', '-genkeypair', '-keystore', str(key), '-storepass:file', str(password), '-keypass:file', str(password), '-alias', 'oghma-alpha', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000', '-dname', 'CN=OghmaNotes Android Alpha'], check=True)
    key.chmod(0o600)
elif not password.exists():
    raise SystemExit('Signing password is missing. Restore it before continuing.')
PY
export OGHMA_ANDROID_KEY_PASSWORD
OGHMA_ANDROID_KEY_PASSWORD="$(cat "$OGHMA_ANDROID_PASSWORD_FILE")"
trap 'unset OGHMA_ANDROID_KEY_PASSWORD' EXIT
npm run typecheck
npm run test
CI=1 npm exec -- expo prebuild --platform android --no-install
cd android
export NODE_ENV=production
./gradlew assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
cd ..
mkdir -p dist
cp android/app/build/outputs/apk/release/app-release.apk dist/oghmanotes-alpha.apk
echo 'APK ready: apps/mobile/dist/oghmanotes-alpha.apk'
