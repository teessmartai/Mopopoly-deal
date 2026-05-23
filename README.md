# Mopopoly Deal

A faithful, original digital version of the card game *Monopoly Deal*. Everyone
plays from the web browser on their **phones** — no app to install, nothing to
set up. You host the game in one of two ways:

- on a **Windows laptop**, by double-clicking one file (the steps below), or
- on a **personal Android phone**, by installing one app — handy when your only
  computer is a locked-down work laptop. See
  **[Host on an Android phone](#host-on-an-android-phone)**.

This guide is written for someone who has **never used a terminal**. If you can
double-click a file (or install a phone app) and read a screen, you can run this.

---

## What you need

- One **Windows laptop** (this runs the game). It does **not** need anything
  installed — no Node.js, no programming tools.
- Everyone's **phones** (2 to 5 players).
- A way for all the phones and the laptop to be **on the same network**. Two
  options, both supported:
  1. The **same WiFi** (home WiFi, plane WiFi, café WiFi, etc.).
  2. A **phone hotspot** that everyone joins (use this if the WiFi blocks
     devices from talking to each other — more on this below).

---

## Step 1 — Get the game file (`MopopolyDeal.exe`)

You need one file: **`MopopolyDeal.exe`**. Get it from the project's GitHub page:

1. Open the repository on **GitHub** in any browser.
2. Click the **"Actions"** tab near the top.
3. In the list on the left, click **"Build Windows EXE"**.
4. Click the most recent successful run (it has a green check ✓). If you want a
   fresh one, click **"Run workflow"** first and wait a few minutes.
5. Scroll to the bottom to **"Artifacts"** and download **"MopopolyDeal-windows"**.
   It downloads as a `.zip` file.
6. **Unzip it** (right-click the downloaded file → *Extract All*). Inside is
   **`MopopolyDeal.exe`**. Put it somewhere easy, like your Desktop.

> The file is fairly large (around 55–90 MB). That's normal — it has everything
> the game needs built inside it, so you don't have to install anything.

---

## Step 2 — Start the game

**Double-click `MopopolyDeal.exe`.** A black window (the "console") opens and
shows you:

- A web address like `http://192.168.1.23:47800`
- A **QR code** you can scan with a phone camera

**Keep this black window open** the whole time you play. Closing it stops the
game. (Your game is saved automatically, so if it closes by accident, just
re-open the file — see "If something goes wrong" below.)

### You will see two Windows pop-ups the first time. This is normal.

**1) "Windows protected your PC" (blue box, SmartScreen).**
This appears because the file isn't from a big registered company — not because
anything is wrong. To run it:

- Click the small **"More info"** link.
- Then click the **"Run anyway"** button that appears.

**2) "Windows Defender Firewall" — *Allow access?***
This appears because the game needs to let phones on your network reach the
laptop. To allow it:

- Make sure **"Private networks"** is ticked.
- Click **"Allow access"**.

If you accidentally clicked "Cancel" on the firewall box, close the game window
and double-click the file again to get the prompt back.

---

## Step 3 — Players join from their phones

Each player does **one** of these:

- **Scan the QR code** shown in the black window with their phone camera, then
  tap the link, **or**
- Open their phone's browser and type the web address shown (for example
  `http://192.168.1.23:47800`).

Then they **type a name** and tap **Join Game**.

- The **first person to join is the "host"** for the game and gets the **Start
  Game** button.
- Once **2 to 5 players** have joined, the host taps **Start Game**.

The laptop's black window keeps showing the address/QR the whole time, so
latecomers can still join before the game starts.

---

## Step 4 — Play

The game enforces all the rules for you. On your turn you draw cards
automatically, then tap cards in your hand to play them (as property, into your
bank, or as an action). The screen tells you whose turn it is, how many plays
you have left, and prompts you when you need to respond (for example, to pay
rent or to play a "Just Say No"). First player with **3 complete property sets
of different colors wins**.

---

## Switching networks mid-game (important and handy)

Some WiFi networks (often **plane WiFi, hotels, and cafés**) use "client
isolation," which **blocks phones from reaching the laptop** even though
everyone is on the same WiFi. If players can't load the page, switch to a
**phone hotspot**:

1. On one phone (or the laptop's owner's phone), turn on the **Personal
   Hotspot**.
2. Connect the **laptop** and **all the players' phones** to that hotspot's
   WiFi.
3. The black window's address may change. Read the **new** address/QR from the
   window (you might need to restart the game file so it shows the new address —
   your game is saved and will resume).
4. Players re-open the page (or scan the new QR).

You can **switch back and forth** during a game. For example, a player can hop
off the hotspot to use plane WiFi for browsing, then come back — the game
**remembers their seat, cards, bank, and turn**. They just re-open the page on
the right network.

### How reconnecting works for players

Each player's phone quietly remembers who they are. So if a phone **sleeps**,
the **browser refreshes**, or they **change networks**, they simply re-open the
page and they're **back in their exact spot** — same hand, same properties, same
place in the turn order. While someone is away, the game waits for them or, if
it's their turn and they're gone, the **host** sees a **"Skip"** button.

---

## If something goes wrong

- **A phone can't load the page.** Make sure that phone is on the **same
  network** as the laptop. If you're on shared WiFi that blocks devices, switch
  to a **phone hotspot** (see above). Double-check they typed the address
  exactly, including the `:47800` part.
- **The black window closed / laptop restarted.** Just **double-click
  `MopopolyDeal.exe` again.** The game is saved automatically right next to the
  file (a file called `mopopoly-save.json`), so your in-progress game comes
  back. Players just re-open the page.
- **"Port already in use" message.** The game is probably already running in
  another window. Close the other black window and try again.
- **You want a totally fresh game.** Close the window, delete the
  `mopopoly-save.json` file that sits next to `MopopolyDeal.exe`, and start it
  again. (Or just finish the current game — the host gets a **Play Again**
  button at the end that keeps the same players.)

---

## Host on an Android phone

Instead of a Windows laptop, you can host the whole game on a **personal Android
phone**. Players still join from their own phone browsers exactly as above —
nothing changes for them. This is the best option if your only computer is a
**locked-down work laptop** that won't let you run downloaded programs.

You only need **one** Android phone to be the host. It can also play.

### Step 1 — Get the game app (`MopopolyDeal.apk`)

1. Open the repository on **GitHub** in any browser.
2. Click the **"Actions"** tab near the top.
3. In the list on the left, click **"Build Android APK"**.
4. Click the most recent successful run (green check ✓). To get a fresh one,
   click **"Run workflow"** first and wait a few minutes.
5. Scroll to **"Artifacts"** and download **"MopopolyDeal-android"**. It arrives
   as a `.zip`.
6. On the Android phone, **unzip it** (most file managers do this with a tap).
   Inside is **`MopopolyDeal.apk`**.

> The file is fairly large (around 40–70 MB). That's normal — it has a complete
> copy of the game's engine built inside it, so nothing else needs installing.

### Step 2 — Install the app (one-time friction, fully expected)

Because this app doesn't come from the Google Play Store, Android shows a couple
of warnings the first time. **This is normal for any app installed outside the
Play Store** — it does not mean anything is wrong. (It's the Android equivalent
of the Windows SmartScreen prompt above.)

1. **Tap the `MopopolyDeal.apk` file** to install it.
2. Android may say *"For your security, your phone isn't allowed to install
   unknown apps from this source."* Tap **Settings**, then turn on
   **"Allow from this source"** for the app you're installing from (your file
   manager or browser). Go **back** and continue.
3. You'll likely see a **Google Play Protect** box: *"Unsafe app blocked"* or
   *"…wasn't scanned…"*. Tap **"More details"** (or **"Install anyway"**), then
   **Install anyway**. (Play Protect flags apps it hasn't seen before; it isn't
   a virus warning.)
4. When it finishes, tap **Open**.

If you can't find an "Install anyway" option, tap **More details** first — it
appears after that.

### Step 3 — Start hosting

1. **Open the "Mopopoly Deal" app.** The first time, allow the **notification**
   permission if it asks (it's used for the "is hosting" notice).
2. The app shows a **host screen** with:
   - a big web address like `http://192.168.1.23:47800`, and
   - a **QR code** players can scan.
3. A notification appears: **"Mopopoly Deal is hosting."** This keeps the game
   running even if the screen turns off. **Leave the app open** and the phone
   **awake**; **plug it in** for longer sessions.

To take a seat and play on the host phone too, tap **"Play on this phone too"**.

### Step 4 — Players join (same as on a laptop)

Every other player either **scans the QR code** with their phone camera, or
types the **web address** into their phone browser, then enters a name and taps
**Join Game**. Once 2–5 players are in, the **first player to join** taps
**Start Game**. (Rules of play are identical — see **Step 4** above.)

### Use a hotspot if players can't connect

All phones must be on the **same network**. The simplest reliable setup is the
host phone's own **Personal Hotspot**:

1. On the **host phone**, turn on the **Personal Hotspot**.
2. Have **every player's phone** join that hotspot's WiFi.
3. The address on the host screen updates automatically — players scan/type the
   address shown there.

This also sidesteps café/hotel/work WiFi that blocks phones from reaching each
other ("client isolation").

### Stopping, and if something goes wrong

- **Stop hosting:** pull down the notification and tap **"Stop hosting"** (this
  closes the server). Your game is saved.
- **App closed / phone restarted:** just **re-open the app** — the in-progress
  game is restored from a save file in the app's private storage, and players
  re-open their page to land back in their exact seat.
- **A phone can't load the page:** make sure it's on the **same WiFi/hotspot** as
  the host phone, and that the address (including the `:47800`) was typed exactly.
- **Host phone went to sleep and players got stuck:** keep the host phone awake
  and plugged in; aggressive battery savers on some phones can pause background
  apps (see [NOTES.md](NOTES.md) → battery/Doze).

> **iPhone hosts are not supported** (iOS app distribution requires the App
> Store / a paid developer account). iPhones can still **play** as clients in any
> browser, and can host via the Windows option on a laptop.

---

## For developers

- **Run from source:** `npm install` then `npm start`, then open the printed
  address. (Requires Node.js 18+.)
- **Run the tests:** `npm test` (game-rules unit tests + a WebSocket
  integration test).
- **Build the Windows .exe yourself (one command):**

  ```
  npm install
  npm run build:win
  ```

  The exe appears at `dist/MopopolyDeal.exe`. This cross-compiles from any OS
  (Windows/macOS/Linux) using [`@yao-pkg/pkg`](https://github.com/yao-pkg/pkg),
  which bundles the Node.js runtime into the binary so the host installs
  nothing.

- **Automated build (no local tools needed):** the GitHub Actions workflow at
  `.github/workflows/build.yml` builds the exe and uploads it as a downloadable
  artifact on every push, on manual "Run workflow", and attaches it to a Release
  for tagged builds. See Step 1 above.

### Building the Android APK

The Android host embeds a real Node.js runtime via
[`nodejs-mobile`](https://github.com/nodejs-mobile/nodejs-mobile) and runs the
**same `src/`** as the exe (copied into the app at build time, so `src/` stays
the single source of truth). The native wrapper lives in `android/`.

- **Automated build (no local tools needed):** the GitHub Actions workflow at
  `.github/workflows/android.yml` runs the tests, builds the APK, and uploads it
  as the **"MopopolyDeal-android"** artifact (on push, manual "Run workflow", and
  attached to a Release for tags). This is the recommended way to get an APK —
  see **[Host on an Android phone → Step 1](#step-1--get-the-game-app-mopopolydealapk)**.

- **Build locally from a clean checkout.** Requirements: **JDK 17**, the
  **Android SDK** with **NDK 26.1.10909125** and **CMake 3.22.1**, and **Node 18+**.
  Set `ANDROID_HOME` (or create `android/local.properties` with `sdk.dir=...`).

  ```bash
  npm ci

  # 1. Download the nodejs-mobile prebuilt core library (Node ~18) and place it
  #    at android/app/libnode (bin/<abi>/libnode.so + include/node/).
  V=18.20.4
  curl -fL "https://github.com/nodejs-mobile/nodejs-mobile/releases/download/v$V/nodejs-mobile-v$V-android.zip" -o /tmp/nm.zip
  mkdir -p /tmp/nm android/app/libnode
  unzip -q /tmp/nm.zip -d /tmp/nm
  cp -R /tmp/nm/bin android/app/libnode/bin
  cp -R /tmp/nm/include android/app/libnode/include

  # 2. Assemble the embedded Node project from src/ + public/.
  bash scripts/prepare-node-project.sh

  # 3. Build the APK.
  cd android
  ./gradlew assembleRelease     # or: assembleDebug
  ```

  The APK appears at `android/app/build/outputs/apk/release/app-release.apk`.

- **Signing.** Without a keystore, the **release** build falls back to the
  **debug** signing key — installable, fine for testing, but Android treats it
  as a different app from a properly-signed one (no in-place upgrade). To produce
  a **release-signed** APK, generate a keystore once:

  ```bash
  keytool -genkeypair -v -keystore mopopoly-release.jks \
    -keyalg RSA -keysize 2048 -validity 10000 -alias mopopoly
  ```

  Then create `android/keystore.properties` (git-ignored):

  ```
  storeFile=/absolute/path/to/mopopoly-release.jks
  storePassword=...
  keyAlias=mopopoly
  keyPassword=...
  ```

  For CI, store the keystore (base64) and passwords as the repository secrets
  `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
  `ANDROID_KEY_PASSWORD`; the workflow wires them up automatically and otherwise
  builds a debug-signed APK.

Technology choices, the exact card composition, every rules edge-case decision,
and known limitations are documented in **[NOTES.md](NOTES.md)**.
