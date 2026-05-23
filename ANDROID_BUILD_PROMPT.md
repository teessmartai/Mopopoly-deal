# Build Prompt: Turn the existing "Mopopoly Deal" LAN game into a one-click Android APK host

You are extending an **existing, working Node.js project** (a faithful digital
Monopoly Deal for LAN play). Today it runs as a Windows `.exe` that a host
double-clicks; players join from phone browsers over the local network. Your job
is to add a **second host target: a one-click Android APK** so the game can be
hosted on a personal Android phone (over its WiFi hotspot), with players still
joining from any phone browser. **Keep the existing Windows `.exe` path fully
working** — the Android target is additive.

This solves a real problem: the host's only computer is a locked-down work
laptop that can't run unsigned executables or accept firewall prompts. Hosting
on a personal Android phone via hotspot sidesteps all of that.

---

## 1. Understand what already exists (don't rebuild it)

The repo is a plain Node.js app with **no native dependencies** (this is what
makes embedding Node on Android feasible). Read these files; reuse them as-is
unless this prompt says to change them.

```
package.json            scripts: start, test, build:win (pkg). deps: ws,
                        qrcode-terminal. devDep: @yao-pkg/pkg. main/bin = src/server.js
src/game/cards.js       Full 110-card deck definitions + helpers (pure data/logic)
src/game/engine.js      Authoritative game engine: class Game, all rules, state machine
src/persistence.js      save/load/clear of the game state to a JSON file
src/server.js           HTTP static server + WebSocket server; console QR/IP host display
public/index.html       Player web client (mobile-first, vanilla JS, no build step)
public/styles.css       Player client styles
public/app.js           Player client logic (WebSocket, rendering, prompts)
public/favicon.svg
.github/workflows/build.yml   Builds the Windows .exe and uploads it as an artifact
test/engine.test.js     23 rule-engine unit tests (no external services)
test/integration.test.js  Boots the server, drives it over WebSocket
NOTES.md, README.md
```

### Key architecture facts you must preserve

- **Authoritative server.** All game logic, the deck, shuffling, and rule
  enforcement live in `src/game/engine.js` on the server. Clients send only
  *intents*; the server pushes state. **Hidden info (other players' hands) is
  never sent to other clients** — `publicState(forSeat)` returns only a
  `handCount` for opponents and the full `yourHand` only for `forSeat`. Do not
  weaken this.
- **The server binds `0.0.0.0` on a fixed port** (`process.env.PORT || 47800`).
  Other devices reach it at the host's LAN IP. Keep this.
- **Per-player session token** (UUID) stored in the browser's `localStorage`
  under key `mopopoly_token`. Reconnection works by the client sending
  `{type:'resume', token}`; this restores the exact seat/hand/turn. Keep this.

### WebSocket protocol (already implemented — do not change)

Client → server:
- `{ type: 'join', name }` — create a player in the lobby; replies `welcome`.
- `{ type: 'resume', token }` — reconnect an existing player; replies `welcome` or `need_join`.
- `{ type: 'action', action, ...params }` — a game intent (e.g. `play_money`, `play_rent`, `respond_jsn`, `submit_payment`, `discard`, `end_turn`, `start_game`, `skip_player`, `play_again`). Seat is taken from the authenticated socket, never the payload.
- `{ type: 'ping' }`.

Server → client:
- `{ type: 'welcome', token, seat }`
- `{ type: 'need_join', reason }`  (`reason` ∈ `null | 'in_progress' | 'full'`)
- `{ type: 'state', state }`  (per-connection redacted view from `publicState`)
- `{ type: 'error', message }`
- `{ type: 'pong' }`

### State shape (for reference; produced by `engine.publicState(seat)`)

```
{ phase:'lobby'|'playing'|'finished', version, yourSeat, yourHand:[card],
  players:[{ seat, name, connected, isHost, handCount, bank:[card], bankValue,
             sets:{ color:{ cards:[card], house, hotel, complete, size, rent } },
             completeSets, isWinner }],
  turn:{ seat, playsRemaining }, deckCount, discardCount, discardTop,
  pending: null | { kind:'jsn'|'payment'|'discard', ..., yourMove },
  paused, winnerSeat, log:[{text,ts}], maxPlayers, minPlayers }
```

---

## 2. Goal

A non-technical person installs **one APK** on a personal Android phone. They
tap the app icon; it **starts the game server on the phone** and shows a **host
screen with the LAN IP, port, and a scannable QR code**. Other players open that
URL / scan the QR in their phone browsers (no install) and play exactly as they
do today. The host phone itself can also play (its WebView is just another
client). Everything else — full ruleset, reconnection, persistence — works as it
already does.

---

## 3. Recommended technical approach

Embed a real Node.js runtime in the Android app using
**[`nodejs-mobile`](https://github.com/nodejs-mobile/nodejs-mobile)** (the
maintained community fork) — most easily via the **`nodejs-mobile-cordova`** or
**`nodejs-mobile-react-native`** plugin, or a bare Android project linking
`libnode.so`. Because the project is pure JS, `src/` and `public/` run on the
embedded Node **almost unchanged**.

You may choose a different approach if you can justify it, but it must:
(a) reuse `src/game/engine.js` unchanged, (b) keep the authoritative-server +
hidden-info model, and (c) not require the players to install anything. **Do not
rewrite the engine in Kotlin/Java** — that throws away tested logic. **Do not
move to a browser-only WebRTC P2P model** — it breaks the single-authoritative-
server design.

Pick the embedding shape that gives the simplest reliable build. Recommended:
**Apache Cordova + `nodejs-mobile-cordova`**, with the Node project being a copy
of `src/` (+ `public/`) so `src/` stays the single source of truth.

---

## 4. Required changes to the existing code (keep the exe working)

Make these changes so the **same `src/`** works for both the `.exe` and Android.

### 4.1 `src/persistence.js` — writable path on Android
`process.pkg` (set under the pkg/exe build) won't exist on Android. Add a third
case: when running under nodejs-mobile, write the save file to an app-writable
directory provided by the native layer.

- Accept a writable directory via an environment variable, e.g.
  `MOPOPOLY_DATA_DIR`, and prefer it when set:
  `base = process.env.MOPOPOLY_DATA_DIR || (process.pkg ? dirname(execPath) : cwd())`.
- The Android native layer passes the app's files directory into Node (via the
  nodejs-mobile channel or an argument/env). Document how.

### 4.2 `src/server.js` — host screen instead of console QR
A phone has no console, so `qrcode-terminal` output is useless there. Keep the
console output for the `.exe`, but make it **not required**:

- Add an HTTP endpoint `GET /api/hostinfo` returning `{ ips: [...], port }` using
  the existing `lanAddresses()` logic (`os.networkInterfaces()` works on
  nodejs-mobile).
- Add a **host screen** served at `GET /host` (new file `public/host.html` + a
  small script) that fetches `/api/hostinfo`, displays the best URL + the full
  list, and renders a **QR code client-side**. Vendor a tiny pure-JS QR library
  into `public/` (e.g. a single-file `qrcode` browser build) — do not call any
  network service to generate the QR.
- Guard the `qrcode-terminal` require/console block so it's skipped gracefully
  when there's no TTY (so it can't crash the embedded runtime). Keep it for the
  exe.
- Keep the WebSocket server, static serving, and all protocol logic unchanged.

### 4.3 Node version compatibility
nodejs-mobile ships an older Node (~18). The exe uses Node 22. Keep `src/`
compatible with **both** (it already is — avoid Node 20+/22-only APIs). Verify
`ws@8`, `crypto.randomUUID()`, and `os.networkInterfaces()` behave on the
nodejs-mobile Node version you target.

### 4.4 Keep `npm test` green
The engine and integration tests must still pass unchanged. If you add a flag or
env branch, default behavior (and the exe) must be unaffected.

---

## 5. New Android wrapper (the real work)

Create an Android app project (put it under `android/` or a Cordova project dir;
keep `src/` as the source of truth and copy/symlink it into the Node project at
build time).

Requirements:

- **Boots the Node server** by starting `src/server.js` (or a thin
  `mobile-main.js` that sets `MOPOPOLY_DATA_DIR` then `require('./server.js')`)
  on the embedded runtime when the app launches.
- **Foreground service + persistent notification** so Android does not kill the
  server when the screen sleeps (long-running network server requirement).
  - Android 13+ (`POST_NOTIFICATIONS`) runtime permission for the notification.
  - Android 14+ requires a declared `foregroundServiceType` (use an appropriate
    type, e.g. `specialUse` or `dataSync`, and justify it).
  - Notification text like "Mopopoly Deal is hosting — tap to open" that brings
    the host screen forward.
- **Manifest permissions**: `INTERNET`, `ACCESS_NETWORK_STATE`,
  `FOREGROUND_SERVICE`, `POST_NOTIFICATIONS`, plus the foreground-service-type
  permission if required by your target API.
- **WebView UX**: once the server reports listening, navigate the app's WebView
  to `http://127.0.0.1:<PORT>/host` so the host phone shows the QR/IP **and** can
  play as a seated player. (The player client uses `location.host` for its
  WebSocket URL, so loading from `127.0.0.1` works for the host; other phones use
  the LAN IP.)
- **Pass the writable data dir** (app `filesDir`) into Node so persistence works
  (`MOPOPOLY_DATA_DIR`).
- **Lifecycle**: server keeps running while the app/service is alive; a clear way
  to stop it (notification action or an in-app "Stop hosting" button).
- **ABIs**: target at least `arm64-v8a` (cover modern phones; add `armeabi-v7a`
  if cheap). `minSdkVersion` per nodejs-mobile's requirement (≈24+).

---

## 6. Build & distribution

- **Local build instructions** (exact, copy-pasteable): how to produce a signed
  APK from a clean checkout, including any keystore step.
- **Signing**: produce a release APK signed with a generated keystore (for CI,
  read the keystore + passwords from repository secrets). A debug-signed APK is
  acceptable as a fallback for testing — but document the difference.
- **Automated build (no local tools needed)**: add a **GitHub Actions workflow**
  (`.github/workflows/android.yml`) that installs the Android SDK + the
  Cordova/Gradle toolchain, runs `npm test`, builds the APK, and **uploads it as
  a downloadable artifact** with a short `retention-days` (e.g. 5). Mirror the
  style of the existing `build.yml`. Do not break or remove the existing
  Windows-exe workflow.

---

## 7. Deliverables

1. The code changes in §4 (exe still builds and `npm test` still passes).
2. The Android wrapper in §5 producing an installable APK.
3. Local build instructions **and** the automated GitHub Actions APK build (§6).
4. **Update `README.md`** with a non-technical "Host on an Android phone" section:
   how to install the APK (enabling "Install unknown apps" for the browser/file
   manager), the **Play Protect "unsafe app" warning** they'll see and what to
   tap, how to start it, where the QR/address appears, how to use a **hotspot**,
   and that the host phone should stay on with the app open.
5. **Update `NOTES.md`** with: the nodejs-mobile choice and its Node version, the
   foreground-service/battery/Doze behavior, APK size expectation (~30–60 MB,
   embeds Node), the Play-Protect/unknown-sources friction (analogous to the
   exe's SmartScreen), iOS being out of scope, and any rule/limitation unchanged
   from the exe.

---

## 8. Constraints & honesty (state these plainly, don't hide them)

- **Installing the APK has unavoidable one-time friction**: enabling "Install
  unknown apps" and a Google Play Protect warning, unless published to the Play
  Store (out of scope; requires a developer account + review). Document the exact
  taps, like the README already does for Windows SmartScreen/Firewall.
- **Same-LAN requirement** stays: all devices share WiFi or a hotspot; no cloud
  relay. Hotspot is the fallback for client-isolated WiFi.
- **Battery/Doze**: the host phone must keep the app/service running; advise
  keeping it plugged in for long sessions.
- Make **no assumptions about the host's technical ability**.

---

## 9. How to verify before declaring done

- `npm test` passes (engine + integration), proving the shared `src/` still
  works for the exe path.
- `npm run build:win` still produces `dist/MopopolyDeal.exe`.
- The APK installs on a real device or emulator, the host screen shows a correct
  LAN URL + QR, a second phone's browser can join via that URL, a full game can
  be played, and a player can disconnect (e.g. toggle WiFi) and **resume their
  exact seat/hand** by reopening the page.
- Closing and reopening the app recovers an in-progress game from the save file.
- If you cannot run an Android emulator in your environment, say so explicitly,
  rely on the existing engine/integration tests for game-logic correctness, and
  document the manual device steps you could not execute.
