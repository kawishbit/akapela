#!/usr/bin/env bash
# Builds the ffmpeg and ffprobe the Apple Silicon installer ships, from source,
# into desktop/vendor/darwin-arm64/.
#
# Built rather than downloaded because nobody publishes one that works: every
# static arm64 macOS build checked (evermeet.cx is x64-only; martin-riedl.de and
# osxexperts.net both leave librubberband out) lacks the rubberband filter, and
# Rubber Band is this app's only pitch and tempo engine (ADR 0004). An ffmpeg
# without it would not fail — it would silently render every Mix with no
# Adjustments. See ticket 05 of `.scratch/desktop-app/`.
#
# Same trust model as the downloaded pins in binaries.json: every source
# tarball is pinned by SHA-256 and a mismatch stops the build. The external
# libraries are only the two this app asks for, both linked statically —
# librubberband (the `rubberband` filter) and LAME (`libmp3lame`, the MP3 export
# of a Mix). Everything else ffmpeg needs to decode an upload or a YouTube
# download is built into ffmpeg itself.
#
# Run by `pnpm fetch-binaries` on an Apple Silicon Mac. Needs Xcode's command
# line tools, plus meson, ninja, and pkg-config on PATH (build tools only;
# nothing from them is linked).
set -euo pipefail

FFMPEG_VERSION=9.0.1
FFMPEG_SHA256=cf38e0e28c7e5605942c4a77755349b0145804a397af37eb1fb4c77cb237f635
RUBBERBAND_VERSION=4.0.0
RUBBERBAND_SHA256=af050313ee63bc18b35b2e064e5dce05b276aaf6d1aa2b8a82ced1fe2f8028e9
LAME_VERSION=3.100
LAME_SHA256=ddfe36cab873794038ae2c1210557ad34857a4b6bdc515785d1da9e175b1da1e

if [ "$(uname -s)" != Darwin ] || [ "$(uname -m)" != arm64 ]; then
  echo "build-ffmpeg-darwin-arm64.sh builds natively and has to run on an Apple Silicon Mac (this is $(uname -s) $(uname -m))." >&2
  exit 1
fi
for tool in meson ninja pkg-config clang; do
  command -v "$tool" >/dev/null || { echo "missing $tool on PATH" >&2; exit 1; }
done

desktop_root="$(cd "$(dirname "$0")/.." && pwd)"
out_dir="$desktop_root/vendor/darwin-arm64"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
prefix="$work/prefix"
jobs="$(sysctl -n hw.ncpu)"

# Electron 44 itself needs macOS 12, so nothing is gained by targeting older.
export MACOSX_DEPLOYMENT_TARGET=12.0
export PKG_CONFIG_PATH="$prefix/lib/pkgconfig"
export CC=clang CXX=clang++

fetch() {
  local url=$1 file=$2 expected=$3
  curl -fsSL --retry 3 -o "$work/$file" "$url"
  local actual
  actual="$(shasum -a 256 "$work/$file" | cut -d' ' -f1)"
  if [ "$actual" != "$expected" ]; then
    echo "$file does not match its pinned checksum" >&2
    echo "  expected $expected" >&2
    echo "  got      $actual" >&2
    exit 1
  fi
  echo "  $file: checksum ok"
}

echo "fetching sources"
fetch "https://ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.xz" ffmpeg.tar.xz "$FFMPEG_SHA256"
fetch "https://breakfastquay.com/files/releases/rubberband-$RUBBERBAND_VERSION.tar.bz2" rubberband.tar.bz2 "$RUBBERBAND_SHA256"
fetch "https://downloads.sourceforge.net/project/lame/lame/$LAME_VERSION/lame-$LAME_VERSION.tar.gz" lame.tar.gz "$LAME_SHA256"

echo "building rubberband $RUBBERBAND_VERSION"
tar -xjf "$work/rubberband.tar.bz2" -C "$work"
(
  cd "$work/rubberband-$RUBBERBAND_VERSION"
  # vDSP is Apple's Accelerate framework, part of macOS itself.
  meson setup build --prefix="$prefix" --libdir=lib --buildtype=release \
    -Ddefault_library=static -Dfft=vdsp -Dresampler=builtin \
    -Djni=disabled -Dladspa=disabled -Dlv2=disabled -Dvamp=disabled \
    -Dcmdline=disabled -Dtests=disabled
  ninja -C build -j "$jobs"
  ninja -C build install
)

echo "building lame $LAME_VERSION"
tar -xzf "$work/lame.tar.gz" -C "$work"
(
  cd "$work/lame-$LAME_VERSION"
  # LAME's 2017 config.guess predates arm64 macOS; naming the triple skips it.
  ./configure --prefix="$prefix" --build=aarch64-apple-darwin --host=aarch64-apple-darwin \
    --disable-shared --enable-static --disable-frontend --disable-decoder --disable-dependency-tracking
  make -j "$jobs"
  make install
)

echo "building ffmpeg $FFMPEG_VERSION"
tar -xJf "$work/ffmpeg.tar.xz" -C "$work"
(
  cd "$work/ffmpeg-$FFMPEG_VERSION"
  # ffmpeg links librubberband with a hardcoded -lstdc++, which Apple's
  # toolchain stopped shipping years ago. libc++ is the macOS C++ runtime.
  perl -pi -e 's/rubberband_new -lstdc\+\+/rubberband_new -lc++/; s/librubberband_extralibs "-lstdc\+\+"/librubberband_extralibs "-lc++"/' configure
  grep -q 'rubberband_new -lc++ && append librubberband_extralibs "-lc++"' configure \
    || { echo "could not patch ffmpeg's configure for libc++" >&2; exit 1; }

  # --disable-autodetect keeps ffmpeg from quietly linking whatever the build
  # machine happens to have (a Homebrew lzma, say) as a dylib that won't exist
  # on a singer's Mac. zlib and bzlib are back on explicitly: they're part of
  # macOS, and some containers' compressed headers need them.
  ./configure --prefix="$prefix" --arch=arm64 --cc=clang --cxx=clang++ \
    --enable-gpl --enable-version3 \
    --disable-autodetect --enable-zlib --enable-bzlib \
    --enable-librubberband --enable-libmp3lame \
    --disable-shared --enable-static --pkg-config-flags=--static \
    --extra-cflags="-I$prefix/include" --extra-ldflags="-L$prefix/lib" \
    --extra-libs="-lc++ -framework Accelerate" \
    --disable-ffplay --disable-doc --disable-debug
  make -j "$jobs"
)

build="$work/ffmpeg-$FFMPEG_VERSION"
ffmpeg="$build/ffmpeg"
ffprobe="$build/ffprobe"

echo "checking what was built"
for binary in "$ffmpeg" "$ffprobe"; do
  [ "$(lipo -archs "$binary")" = arm64 ] || { echo "$binary is not arm64-only: $(lipo -archs "$binary")" >&2; exit 1; }
  # Only macOS's own libraries and frameworks. Anything else is a dylib the
  # singer's machine doesn't have.
  foreign="$(otool -L "$binary" | tail -n +2 | awk '{print $1}' | grep -v -e '^/usr/lib/' -e '^/System/Library/' || true)"
  if [ -n "$foreign" ]; then
    echo "$binary links libraries outside macOS itself:" >&2
    echo "$foreign" >&2
    exit 1
  fi
done
"$ffmpeg" -hide_banner -filters | grep -qw rubberband || { echo "ffmpeg has no rubberband filter" >&2; exit 1; }
"$ffmpeg" -hide_banner -encoders | grep -qw libmp3lame || { echo "ffmpeg has no libmp3lame encoder" >&2; exit 1; }
# A real pitch shift through Rubber Band into an MP3, the shape of every Mix.
"$ffmpeg" -hide_banner -loglevel error -nostdin -f lavfi -i sine=frequency=440:duration=1 \
  -af rubberband=pitch=1.1892 -c:a libmp3lame -b:a 128k -f mp3 "$work/check.mp3"
"$ffprobe" -hide_banner -loglevel error -show_entries format=duration -of csv=p=0 "$work/check.mp3" | grep -q . \
  || { echo "ffprobe could not read back what ffmpeg wrote" >&2; exit 1; }

mkdir -p "$out_dir"
install -m 0755 "$ffmpeg" "$out_dir/ffmpeg"
install -m 0755 "$ffprobe" "$out_dir/ffprobe"
echo "built ffmpeg $FFMPEG_VERSION with rubberband $RUBBERBAND_VERSION and lame $LAME_VERSION into $out_dir"
