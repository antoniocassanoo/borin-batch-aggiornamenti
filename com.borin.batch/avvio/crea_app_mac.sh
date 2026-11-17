#!/bin/bash
# BORIN Batch · crea «BORIN Batch.app»: un doppio clic apre Photoshop con il pannello BORIN Batch già aperto.
# La lanciano l'installatore e il pannello (Info › «Aprire BORIN Batch come un'app»).
# L'app è piccola: scrive il segnale «apri-pannello» nella cartella dei dati e apre Photoshop. Il resto lo fa
# l'estensione invisibile «com.borin.batch.avvio», che parte con Photoshop e apre il pannello quando vede il segnale.
# Uso: bash crea_app_mac.sh [cartella]   (predefinita: /Applications se si può scrivere, altrimenti ~/Applications)
# Stampa il percorso dell'app creata. Non chiede password.
set -eu
QUI="$(cd "$(dirname "$0")" && pwd)"
DEST_DIR="${1:-}"
if [ -z "$DEST_DIR" ]; then
  if [ -w /Applications ]; then DEST_DIR=/Applications; else DEST_DIR="$HOME/Applications"; fi
fi
mkdir -p "$DEST_DIR"
APP="$DEST_DIR/BORIN Batch.app"
VERSIONE="$(sed -n 's/.*ExtensionBundleVersion="\([^"]*\)".*/\1/p' "$QUI/../CSXS/manifest.xml" | head -n 1)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
NUOVA="$TMP/BORIN Batch.app"
mkdir -p "$NUOVA/Contents/MacOS" "$NUOVA/Contents/Resources"
cp "$QUI/BORIN Batch.icns" "$NUOVA/Contents/Resources/icona.icns"
cat > "$NUOVA/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleName</key><string>BORIN Batch</string>
	<key>CFBundleDisplayName</key><string>BORIN Batch</string>
	<key>CFBundleIdentifier</key><string>local.borin.batch.apri</string>
	<key>CFBundleExecutable</key><string>BORIN Batch</string>
	<key>CFBundleIconFile</key><string>icona</string>
	<key>CFBundlePackageType</key><string>APPL</string>
	<key>CFBundleShortVersionString</key><string>${VERSIONE:-8}</string>
	<key>CFBundleVersion</key><string>${VERSIONE:-8}</string>
	<key>LSMinimumSystemVersion</key><string>10.13</string>
	<key>LSUIElement</key><true/>
</dict>
</plist>
PLIST
cat > "$NUOVA/Contents/MacOS/BORIN Batch" <<'APRI'
#!/bin/bash
# BORIN Batch: apre Photoshop con il pannello BORIN Batch. Creata da com.borin.batch/avvio/crea_app_mac.sh.
DATI="$HOME/Library/Application Support/BORIN/Batch Photoshop"
mkdir -p "$DATI"
date +%s > "$DATI/apri-pannello"
# Photoshop già aperto: in primo piano. Altrimenti il più recente fra quelli installati (2022 e successivi).
if /usr/bin/pgrep -q -f "Adobe Photoshop 20[0-9][0-9].app/Contents/MacOS/Adobe Photoshop"; then
  /usr/bin/open -b com.adobe.Photoshop && exit 0
fi
PS=""
for d in /Applications/Adobe\ Photoshop\ 20*/Adobe\ Photoshop\ 20*.app; do [ -d "$d" ] && PS="$d"; done
if [ -n "$PS" ]; then /usr/bin/open "$PS" && exit 0; fi
/usr/bin/open -b com.adobe.Photoshop 2>/dev/null && exit 0
rm -f "$DATI/apri-pannello"
/usr/bin/osascript -e 'display alert "Photoshop non trovato" message "BORIN Batch si apre dentro Photoshop 2022 o successivo: installalo da Adobe Creative Cloud."' >/dev/null 2>&1
exit 1
APRI
chmod 755 "$NUOVA/Contents/MacOS/BORIN Batch"
rm -rf "$APP"
mv "$NUOVA" "$APP"
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true
touch "$APP"
LSR=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
[ -x "$LSR" ] && "$LSR" -f "$APP" >/dev/null 2>&1 || true
echo "$APP"
