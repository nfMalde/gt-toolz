# GT Toolz Alpha für den Mac

Danke, dass du die Alpha von GT Toolz testest! GT Toolz ist ein Toolkit für Gran Turismo 7: Es liest die offizielle Telemetrie deiner PS5 im Heimnetz. Coach und Boxencrew sagen dir per Stimme Bremspunkte, Kurven und Rundenzeiten an, und Overlays zeigen deine Werte im Stream.

Diese Mac-Alpha kommt ohne Installer: Der Ordner enthält die fertige App, gestartet wird sie mit Electron. Electron lädt das Startskript beim ersten Start einmal herunter und prüft es. Du musst nichts installieren.

## Was du brauchst

- einen Mac mit **macOS 13 Ventura oder neuer** (Apple-Chip oder Intel);
- beim ersten Start **Internet** (etwa 100 MB);
- eine **PS5 mit Gran Turismo 7** im selben Netzwerk wie der Mac (WLAN oder Kabel);
- **Kopfhörer oder einen Ohrhörer am Mac**: Der Coach spricht über den Mac, der Spielsound bleibt am Fernseher.

## 1. Auspacken

Das ZIP doppelklicken. Den Ordner `GT-Toolz-…-mac` an einen festen Platz legen, z. B. in deinen Benutzerordner. In den Papierkorb darf er nicht, die App läuft aus diesem Ordner.

## 2. Starten

**Das erste Mal über das Terminal.** Per Doppelklick lässt macOS ein heruntergeladenes Skript ohne Apple-Signatur nicht laufen und nennt es „beschädigt“. Es ist nicht beschädigt; über das Terminal startet es ohne Umweg:

1. **Terminal** öffnen: Cmd+Leertaste, „Terminal“ tippen, Enter.
2. `sh ` eintippen, mit einem Leerzeichen dahinter.
3. **`Start GT Toolz.command`** aus dem Ordner ins Terminal-Fenster ziehen und **Enter** drücken.

Wichtig ist das `sh` davor. Mit `./Start…` oder per Doppelklick blockiert macOS das Skript beim ersten Mal („bad interpreter: Operation not permitted“ bzw. „beschädigt“).

Oder so: `xattr -dr com.apple.quarantine ` eintippen (mit Leerzeichen am Ende), den Ordner `GT-Toolz-…-mac` ins Terminal-Fenster ziehen, Enter. Das nimmt die Download-Markierung vom Ordner, danach startet ein Doppelklick auf `Start GT Toolz.command`.

- **Beim ersten Mal** lädt es Electron passend zu deinem Mac (etwa 100 MB, dauert ein paar Minuten) und prüft die Datei. Danach geht GT Toolz auf.
- **Ab dann reicht ein Doppelklick** auf `Start GT Toolz.command`: Beim ersten Start nimmt das Skript die Download-Markierung von seinem Ordner. Die App startet sofort, ohne Internet.
- Das Terminal-Fenster bleibt offen, solange GT Toolz läuft. Schließt du die App, kannst du es zumachen.

**Kommt „… ist beschädigt und sollte in den Papierkorb gelegt werden“:** auf **„Abbrechen“** bzw. **„Fertig“** klicken, *nicht* auf „In den Papierkorb legen“, und wie oben über das Terminal starten.

Im Dock heißt die App während der Alpha **„Electron“**, mit dem Maldö-Maskottchen als Symbol. Das ist so richtig.

## 3. Erlauben, wenn macOS fragt

- **Lokales Netzwerk** (macOS 15 und neuer): **Erlauben**. Nur so findet GT Toolz deine PS5. Weil die App aus dem Terminal startet, fragt macOS eventuell für „Terminal“ oder „Electron“. Später änderbar unter Datenschutz & Sicherheit → Lokales Netzwerk.
- **Eingehende Verbindungen** (falls die Firewall an ist): **Erlauben**. Über diesen Weg kommt die Telemetrie der PS5 an.
- **Mikrofon**: Danach fragt GT Toolz nur, wenn du unter „Aufnahmen“ deine eigene Stimme aufnimmst.

## 4. Einrichten

Die Einrichtung führt dich durch alles:

1. **Sprache** wählen.
2. **PS5 finden** lassen; in Gran Turismo 7 einfach fahren oder eine Wiederholung laufen lassen.
3. **Stimme** wählen:
   - Die macOS-Stimmen funktionieren sofort.
   - Natürlicher klingen die neuronalen Offline-Stimmen; sie werden erst nach deiner Bestätigung geladen.
   - Bessere macOS-Stimmen („Premium“) bekommst du unter Systemeinstellungen → Bedienungshilfen → Gesprochene Inhalte → Systemstimme → Stimmen verwalten.
4. **Deinen Namen** eintragen, wenn der Coach dich ansprechen soll.
5. Eine **Referenzrunde** lernen.
6. **Kalibrieren**: wichtig, damit das „jetzt“ genau am Bremspunkt kommt.

## 5. Fehler melden

So schickst du ein Protokoll mit:

1. In GT Toolz **Einstellungen → Diagnose** öffnen.
2. Bei „**Protokoll für ein GitHub-Issue**“ auf **Speichern** klicken. Die Datei landet in „Downloads“.
3. Schick die Datei mit einer kurzen Beschreibung an Maldö (so wie abgesprochen).

Das Protokoll ist anonym: Es enthält keine Namen, IP-Adressen oder Ordnerpfade. Geht es um das Timing der Ansagen, schalte vorher „**Ausführliches Protokoll**“ ein und fahre die Stelle noch einmal. Hängt schon der Start, schick bitte, was im Terminal-Fenster steht.

## 6. Gut zu wissen

- **Netzwerk:** GT Toolz spricht nur mit deiner PS5 im Heimnetz. Ins Internet geht es nur, wenn du selbst Stimmen herunterlädst, und beim ersten Start einmal für Electron. Es gibt kein Konto und keine Werbung.
- **Du streamst?** Unter „Browser-Quellen“ links stellst du Overlays für OBS zusammen: Gas und Bremse, Reifen, Tempo, Gang und Runden, als eine Browser-Quelle.
- **Deine Daten** (Einstellungen, Referenzen, Aufnahmen) liegen in `~/Library/Application Support/GT Toolz`. Eine spätere Version mit Installer übernimmt sie.
- **Entfernen:** den Ordner `GT-Toolz-…-mac` löschen (Electron liegt darin, im Unterordner `runtime`); wenn du auch die Daten löschen willst, den Ordner oben.

Viel Spaß beim Fahren!
