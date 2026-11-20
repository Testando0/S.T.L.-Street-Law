#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
BUILD_TOOLS="$ANDROID_HOME/build-tools/34.0.0"
PLATFORM="$ANDROID_HOME/platforms/android-34/android.jar"
KEYSTORE="$ROOT/output/rio-livre.keystore"
STOREPASS="${RIO_KEYSTORE_PASS:-rio-livre-2026}"

export PATH="$HOME/.nix-profile/bin:$ANDROID_HOME/platform-tools:$BUILD_TOOLS:$PATH"

if [ -z "${RIO_SERVER_URL:-}" ]; then
  echo "RIO_SERVER_URL não definido. Informe a URL publicada do servidor para o APK conectar online." >&2
  exit 1
fi

if ! command -v javac >/dev/null 2>&1; then
  echo "javac não encontrado. Rode: nix profile install nixpkgs#jdk17" >&2
  exit 1
fi
if [ ! -f "$PLATFORM" ]; then
  echo "Android SDK 34 não encontrado em $ANDROID_HOME" >&2
  exit 1
fi

pnpm --filter @workspace/rio-livre run build
node "$ROOT/prepare-assets.mjs"

rm -rf "$ROOT/build"
mkdir -p "$ROOT/build/gen" "$ROOT/build/classes" "$ROOT/build/dex" "$ROOT/output"

"$BUILD_TOOLS/aapt2" compile --dir "$ROOT/res" -o "$ROOT/build/res.zip"
"$BUILD_TOOLS/aapt2" link \
  -o "$ROOT/build/base.apk" \
  -I "$PLATFORM" \
  --manifest "$ROOT/AndroidManifest.xml" \
  -A "$ROOT/assets" \
  --java "$ROOT/build/gen" \
  "$ROOT/build/res.zip" \
  --auto-add-overlay

javac -source 8 -target 8 -encoding UTF-8 \
  -classpath "$PLATFORM" \
  -d "$ROOT/build/classes" \
  $(find "$ROOT/src" "$ROOT/build/gen" -name '*.java')

jar cf "$ROOT/build/classes.jar" -C "$ROOT/build/classes" .
"$BUILD_TOOLS/d8" --lib "$PLATFORM" --min-api 24 --output "$ROOT/build/dex" "$ROOT/build/classes.jar"

cp "$ROOT/build/base.apk" "$ROOT/build/unsigned.apk"
(
  cd "$ROOT/build/dex"
  zip -q "$ROOT/build/unsigned.apk" classes.dex
)
"$BUILD_TOOLS/zipalign" -f 4 "$ROOT/build/unsigned.apk" "$ROOT/build/aligned.apk"

if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -v \
    -keystore "$KEYSTORE" \
    -storepass "$STOREPASS" \
    -keypass "$STOREPASS" \
    -alias riolivre \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -dname "CN=Rio Livre, OU=Games, O=Rio Livre, L=Rio de Janeiro, ST=RJ, C=BR" >/dev/null 2>&1
fi

"$BUILD_TOOLS/apksigner" sign \
  --ks "$KEYSTORE" \
  --ks-key-alias riolivre \
  --ks-pass "pass:$STOREPASS" \
  --key-pass "pass:$STOREPASS" \
  --out "$ROOT/output/rio-livre.apk" \
  "$ROOT/build/aligned.apk"

"$BUILD_TOOLS/apksigner" verify --print-certs "$ROOT/output/rio-livre.apk" >/dev/null
mkdir -p "$ROOT/../api-server/apk"
cp "$ROOT/output/rio-livre.apk" "$ROOT/../api-server/apk/rio-livre.apk"

ls -lh "$ROOT/output/rio-livre.apk" "$ROOT/../api-server/apk/rio-livre.apk"
sha256sum "$ROOT/output/rio-livre.apk"
