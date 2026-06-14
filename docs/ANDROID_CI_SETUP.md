# Android-Release-Pipeline: Einmaliges Setup

Dieser Leitfaden deckt die **manuellen Einrichtungsschritte** für
`.github/workflows/android-release.yml` ab. Danach wird bei jedem Push auf
`main`, der Dateien unter `client/**` ändert, automatisch eine signierte
Release-APK gebaut und nach
`/data/coolify/applications/ghost-list-android/ghostlist.apk` kopiert (= das
Verzeichnis, das die Landing-Page unter `/downloads/ghostlist.apk` ausliefert).

Der Build läuft auf einem **self-hosted GitHub-Actions-Runner auf
red-queen-zulu** (deinem Coolify-Server) – gehostete GitHub-Runner können die
private IP des Servers nicht erreichen.

## 1. Build-Abhängigkeiten auf red-queen-zulu installieren

```bash
# Node.js 24
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs

# JDK 21 (für Gradle / Android Gradle Plugin)
sudo apt-get install -y openjdk-21-jdk

# Android SDK cmdline-tools
sudo mkdir -p /opt/android-sdk/cmdline-tools
cd /tmp
curl -fsSL -o cmdline-tools.zip \
  https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
sudo unzip -q cmdline-tools.zip -d /opt/android-sdk/cmdline-tools
sudo mv /opt/android-sdk/cmdline-tools/cmdline-tools /opt/android-sdk/cmdline-tools/latest

# SDK-Pfade exportieren (z.B. in /etc/profile.d/android-sdk.sh)
echo 'export ANDROID_SDK_ROOT=/opt/android-sdk
export ANDROID_HOME=/opt/android-sdk
export PATH=$PATH:/opt/android-sdk/cmdline-tools/latest/bin:/opt/android-sdk/platform-tools' \
  | sudo tee /etc/profile.d/android-sdk.sh
source /etc/profile.d/android-sdk.sh

# Benötigte Plattform + Build-Tools installieren (Lizenzen akzeptieren)
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
```

> compileSdk/targetSdk = 35, siehe `client/android/variables.gradle`. Falls
> dort mal erhöht wird, hier die passende `platforms;android-XX` /
> `build-tools;XX.0.0` nachinstallieren.

## 2. GitHub-Actions Self-hosted Runner registrieren

1. Im Repo `SAB9900/ghostlist`: **Settings → Actions → Runners → New
   self-hosted runner** → Betriebssystem **Linux**, Architektur **x64**.
2. GitHub zeigt dir einen Token + Befehle an. Auf red-queen-zulu als `sab`
   ausführen (Pfad/Token aus dem GitHub-UI übernehmen):
   ```bash
   mkdir ~/actions-runner && cd ~/actions-runner
   curl -o actions-runner-linux-x64.tar.gz -L <URL aus GitHub-UI>
   tar xzf actions-runner-linux-x64.tar.gz
   ./config.sh --url https://github.com/SAB9900/ghostlist --token <TOKEN aus GitHub-UI>
   ```
3. Als Dienst installieren, damit er nach Reboot automatisch läuft:
   ```bash
   sudo ./svc.sh install sab
   sudo ./svc.sh start
   ```
4. Prüfen: Der Runner muss in GitHub unter **Settings → Actions → Runners**
   als "Idle" auftauchen (Label `self-hosted` ist Standard, passt zu
   `runs-on: self-hosted` im Workflow).

### Berechtigungen für den Deploy-Schritt

`/data/coolify` selbst ist `drwx------` (root:coolify) – der Runner-User
`sab` kann da grundsätzlich nicht hineinschreiben, egal welche Rechte der
`ghost-list-android`-Unterordner hat. Statt `/data/coolify` zu öffnen, gibt
es ein schmales root-Skript per `sudo`, das nur genau diese eine Kopieraktion
erlaubt:

```bash
sudo tee /usr/local/bin/deploy-ghostlist-apk.sh > /dev/null <<'EOF'
#!/bin/bash
set -euo pipefail
cp "$1" /data/coolify/applications/ghost-list-android/ghostlist.apk
EOF
sudo chmod 755 /usr/local/bin/deploy-ghostlist-apk.sh

echo "sab ALL=(root) NOPASSWD: /usr/local/bin/deploy-ghostlist-apk.sh" | sudo tee /etc/sudoers.d/ghostlist-android-deploy
sudo chmod 440 /etc/sudoers.d/ghostlist-android-deploy
sudo visudo -c
```

Der Workflow ruft dann `sudo /usr/local/bin/deploy-ghostlist-apk.sh <pfad-zur-apk>`
auf.

## 3. GitHub Secrets anlegen

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Wert |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Base64-kodierter Inhalt von `client/android/app/ghostlist-release.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | `Bindestrich1!` (Store- und Key-Passwort sind identisch, Alias ist fix `ghostlist`) |

Base64 erzeugen (lokal auf deinem Mac, dann den Inhalt in die Zwischenablage
kopieren):

```bash
base64 -i client/android/app/ghostlist-release.keystore | pbcopy
```

## 4. Sicherheitshinweis

Das Repo ist **öffentlich**. Self-hosted Runner auf öffentlichen Repos sind
riskant, wenn sie auf `pull_request` o.ä. reagieren – jeder könnte per PR
Code auf deinem Server ausführen. Der Workflow ist deshalb bewusst auf
`push: branches: [main]` beschränkt (erfordert Schreibzugriff). **Niemals**
`pull_request` oder `workflow_dispatch` zu `android-release.yml` hinzufügen,
ohne das noch einmal zu durchdenken.

## 5. Testen

```bash
# kleine, harmlose Änderung unter client/ committen und pushen
git commit --allow-empty -m "test: trigger android release pipeline"
git push origin main
```

Danach im Repo unter **Actions** den Lauf von "Android Release" beobachten.
Nach erfolgreichem Lauf sollte
`https://www.ghost-list.com/downloads/ghostlist.apk` die neue APK ausliefern
(Dateigröße/Datum im Container prüfen, siehe `docker exec ... ls -la
/usr/share/nginx/downloads/`).
