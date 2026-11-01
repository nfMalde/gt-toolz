#!/bin/sh
# GT Toolz alpha for macOS without an installer: starts the app folder with Electron @ELECTRON_VERSION@.
# Nothing to install (the user, 2026-10-28: no Node.js for the testers). The first start fetches Electron once from
# its GitHub release with curl and checks it against the SHA-256 written in here at build time, from checksums.json
# in Electron's signed npm package; ditto unpacks it. curl, shasum and ditto come with macOS. Later starts need no
# internet. Run it with "sh" in Terminal: macOS calls a downloaded script without an Apple signature "damaged" when
# it is double-clicked (README.md). English only (the user, 2026-10-28).

cd "$(dirname "$0")" || exit 1
VERSION="@ELECTRON_VERSION@"
# Apple silicon also when this shell runs under Rosetta.
if [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = "1" ]; then
  ARCH="arm64"
  SHA256="@SHA256_ARM64@"
else
  ARCH="x64"
  SHA256="@SHA256_X64@"
fi
RUNTIME="runtime/electron-$VERSION-$ARCH"
ELECTRON="$RUNTIME/Electron.app/Contents/MacOS/Electron"

fail() {
  echo "$1"
  rm -rf "$RUNTIME.part" "$ZIP"
  echo "Please send Maldö what this window shows."
  exit 1
}

if [ ! -x "$ELECTRON" ]; then
  echo "First start: fetching Electron once (about 100 MB) ..."
  mkdir -p runtime || exit 1
  ZIP="runtime/electron-v$VERSION-darwin-$ARCH.zip"
  URL="https://github.com/electron/electron/releases/download/v$VERSION/electron-v$VERSION-darwin-$ARCH.zip"
  curl --fail --location --proto '=https' --proto-redir '=https' --retry 2 --progress-bar --output "$ZIP" "$URL" \
    || fail "Download failed. Is the Mac online?"
  [ "$(shasum -a 256 "$ZIP" | cut -d ' ' -f 1)" = "$SHA256" ] \
    || fail "The downloaded file is not the expected one (checksum)."
  # Unpacked beside it, then moved into place in one step: a broken first start leaves nothing half done.
  rm -rf "$RUNTIME.part"
  mkdir -p "$RUNTIME.part" && ditto -x -k "$ZIP" "$RUNTIME.part" || fail "Electron could not be unpacked."
  rm -f "$ZIP"
  rm -rf "$RUNTIME"
  mv "$RUNTIME.part" "$RUNTIME" || fail "Electron could not be put in place."
  # The tester started this folder on purpose: without the download flag on it, a double-click works next time.
  echo "Removing the download flag from this folder, so a double-click on the start script works next time."
  xattr -dr com.apple.quarantine . 2>/dev/null || true
fi

exec "$ELECTRON" app
