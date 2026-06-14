# Push-Benachrichtigungen: Firebase-Setup & Verifikation

Dieser Leitfaden deckt die verbleibenden **manuellen Schritte** ab, die nur im
Firebase-Konsolen-UI bzw. lokal mit Xcode/Android Studio/.NET ausgeführt werden
können. Die gesamte Code-Integration (Server, Web-Client, iOS-Client,
Android-Client) ist bereits erledigt.

Firebase-Projekt: **ghostlist-ff00f**

## 1. Server: Firebase Admin Service-Account-Key

1. Firebase Console → Projekteinstellungen → Karteikarte **Dienstkonten**.
2. **Neuen privaten Schlüssel generieren** klicken → JSON-Datei wird heruntergeladen.
3. Den **gesamten Inhalt** dieser JSON-Datei als einzeiligen String in die
   Umgebungsvariable `FCM_CREDENTIALS_JSON` eintragen (z. B. in eurer `.env`,
   abgeleitet aus `.env.example`).
4. **Wichtig:** Diese Datei niemals committen – sie gehört nur in `.env` /
   die Secrets eures Deploy-Systems (Coolify etc.).

## 2. Web: VAPID-Key für Web-Push

1. Firebase Console → Projekteinstellungen → Karteikarte **Cloud Messaging**.
2. Abschnitt **Web-Push-Zertifikate** → falls noch kein Schlüsselpaar existiert,
   **Schlüsselpaar generieren** klicken.
3. Den angezeigten Key (beginnt meist mit `B...`, ca. 88 Zeichen) kopieren.
4. Eintragen in:
   - `client/src/environments/environment.ts` → `firebase.vapidKey`
   - `client/src/environments/environment.prod.ts` → `firebase.vapidKey`

Ohne diesen Key bleibt Web-Push deaktiviert (siehe Log-Warnung
`[Push] No VAPID key configured`).

## 3. iOS: App in Firebase registrieren + GoogleService-Info.plist

1. Firebase Console → Projektübersicht → **App hinzufügen** → iOS (Apple-Symbol).
2. Bundle-ID exakt: `com.norica-informatics.ghostlist`
3. App-Spitzname optional, App-Store-ID kann leer bleiben.
4. **GoogleService-Info.plist herunterladen**.
5. Datei nach `client/ios/App/App/GoogleService-Info.plist` kopieren
   (gleiches Verzeichnis wie `AppDelegate.swift` / `Info.plist`).
6. In Xcode: Datei zum Target **App** hinzufügen (Drag & Drop ins Projektnavigator,
   "Copy items if needed" + Target-Membership "App" aktivieren), falls Xcode
   sie nicht automatisch aufnimmt.

> Die `AppDelegate.swift` ruft `FirebaseApp.configure()` nur auf, wenn diese
> Datei vorhanden ist – ohne sie startet die App weiterhin normal, aber ohne
> Push-Funktionalität.

## 4. iOS: APNs Auth Key (.p8) hochladen

Damit Firebase Push-Nachrichten über Apple zustellen kann:

1. Apple Developer Portal → **Certificates, Identifiers & Profiles** → **Keys**.
2. Neuen Key erstellen mit aktiviertem **Apple Push Notifications service (APNs)**.
3. `.p8`-Datei herunterladen (nur einmal möglich!), dazu **Key ID** und
   **Team ID** notieren.
4. Firebase Console → Projekteinstellungen → **Cloud Messaging** → Abschnitt
   **Apple-App-Konfiguration** → **APNs-Authentifizierungsschlüssel hochladen**.
5. `.p8`-Datei, Key ID und Team ID eintragen.

## 5. iOS: Capacitor-Sync & Pods

Lokal (macOS mit Xcode):

```bash
cd client
npm install
npx cap sync ios
cd ios/App
pod install
```

`pod install` zieht jetzt zusätzlich `FirebaseMessaging` (siehe `Podfile`).

## 6. aps-environment (Release)

`client/ios/App/App/App.entitlements` steht aktuell auf `development`. Für
**Release/TestFlight/App-Store-Builds** muss dieser Wert vor dem Signieren mit
einem Distribution-Profil auf `production` gesetzt werden. Für lokale
Debug-Builds bitte `development` belassen, sonst funktionieren Push-Tests mit
dem Entwicklungs-APNs-Zertifikat nicht mehr.

## 7. Android: App in Firebase registrieren + google-services.json

1. Firebase Console → Projektübersicht → **App hinzufügen** → Android.
2. Android-Paketname exakt: `com.norica_informatics.ghostlist` (Unterstrich,
   siehe `client/android/app/build.gradle` → `applicationId` bzw.
   `client/capacitor.config.ts` → `appId`). **Achtung:** weicht bewusst von
   der iOS-Bundle-ID `com.norica-informatics.ghostlist` (Bindestrich) ab –
   Android-Package-Namen dürfen keine Bindestriche enthalten.
3. App-Spitzname optional, SHA-1 kann zunächst leer bleiben (nur für
   Dynamic Links/App Links nötig).
4. **google-services.json herunterladen**.
5. Datei nach `client/android/app/google-services.json` kopieren
   (gleiches Verzeichnis wie `build.gradle` der App).

> `client/android/app/build.gradle` wendet das `google-services`-Plugin nur
> an, wenn diese Datei vorhanden ist – ohne sie baut die App weiterhin normal,
> aber ohne Push-Funktionalität.

**Wichtig:** Diese Datei niemals committen (enthält projektspezifische, aber
öffentlich lesbare Firebase-Keys – analog zu `GoogleService-Info.plist` gilt
hier dieselbe Vorsicht wie bei allen Secrets/Config-Dateien außerhalb von Git).

## 8. Android: Capacitor-Sync & Gradle

Lokal (mit Android Studio / Android SDK):

```bash
cd client
npm install
npx cap sync android
```

`cap sync` registriert `@capacitor/push-notifications` in
`android/capacitor.settings.gradle` und `android/app/capacitor.build.gradle`
(diese Dateien wurden hier bereits manuell ergänzt, `cap sync` sollte sie
unverändert lassen bzw. nur weitere fehlende Plugins nachziehen).

**Aufräumen (einmalig, manuell):** `applicationId`/`namespace` wurden von
`com.norica.ghostlist` auf `com.norica_informatics.ghostlist` umgestellt
(`build.gradle`, `strings.xml`, `capacitor.config.json`, `MainActivity.java`
nach `java/com/norica_informatics/ghostlist/` verschoben). Die alte Datei
`android/app/src/main/java/com/norica/ghostlist/MainActivity.java` (samt
leerem `com/norica`-Ordner) konnte aus diesem Sandbox-Filesystem nicht
gelöscht werden – bitte lokal löschen, bevor ihr baut.

Danach in Android Studio öffnen (`client/android`) und bauen, oder:

```bash
cd android
./gradlew assembleDebug
```

### Was bereits enthalten ist

- `AndroidManifest.xml`: Berechtigung `android.permission.POST_NOTIFICATIONS`
  (Android 13+) sowie FCM-Default-Icon/-Farbe (`ic_stat_notification` /
  `notification_color`).
- `push-notification.service.ts`: `initialize()` registriert jetzt auch auf
  Android über `@capacitor/push-notifications` (gleicher Code-Pfad wie iOS).
- Server (`FcmNotificationService`) sendet bereits `AndroidConfig`-Payloads –
  keine weiteren Server-Änderungen nötig.

## 9. Verifikation (Task #10)

Folgendes bitte lokal ausführen, da das Sandbox-Environment kein .NET SDK /
keinen iOS-Toolchain hat:

**Server:**
```bash
cd server   # bzw. das Verzeichnis mit der .csproj
dotnet build
dotnet ef database update   # prüft, dass die DeviceSubscription-Migration greift
dotnet test
```

**Web-Client:**
```bash
cd client
npm install
npm run build
```
Prüfen, dass `firebase` als Abhängigkeit aufgelöst wird und der Build ohne
TypeScript-Fehler durchläuft (insbesondere `push-notification.service.ts`,
`hub.service.ts`, `with-known-lists.feature.ts`).

**iOS:**
```bash
cd client/ios/App
pod install
open App.xcworkspace
```
In Xcode bauen (⌘B). Erwartete Warnung/Fehler nur, falls
`GoogleService-Info.plist` noch fehlt (siehe Schritt 3) – die App startet
trotzdem, Push bleibt dann inaktiv.

**Android:**
```bash
cd client
npx cap sync android
cd android
./gradlew assembleDebug
```
Erwartete Warnung/Fehler nur, falls `google-services.json` noch fehlt
(siehe Schritt 7) – die App baut trotzdem, Push bleibt dann inaktiv. Beim
ersten Start auf einem Gerät mit Android 13+ fragt die App per
`PushNotifications.requestPermissions()` die Benachrichtigungs-Berechtigung ab.

**End-to-End-Test (nach allen Schritten):**
1. App auf echtem Gerät (Push funktioniert auf Android-Emulatoren mit
   Google-Play-Image i. d. R., bei iOS nicht im Simulator) bzw. im Browser
   öffnen, Benachrichtigungs-Berechtigung erteilen.
2. Liste öffnen → in den Listen-Einstellungen prüfen, dass die neue Sektion
   "Benachrichtigungen" mit den beiden Schaltern (Chat-Nachrichten /
   Listenänderungen) angezeigt wird und Werte speichert.
3. Mit einem zweiten Gerät/Browser eine Nachricht senden bzw. ein Item
   togglen, während das erste Gerät die App **geschlossen/im Hintergrund**
   hat → Push sollte ankommen.
4. Mit geöffneter App/aktiver Liste denselben Vorgang wiederholen → **keine**
   Push-Benachrichtigung (Suppression über Presence/Foreground-Status).
