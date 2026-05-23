# NOTES

Everything notable about how this implementation was built: technology choices,
the exact card composition, every rules edge-case decision, and known
limitations. Where the official rules are genuinely ambiguous, the most widely
documented community convention was used and is listed here.

---

## Technology choices

| Area | Choice | Why |
|---|---|---|
| Language / runtime | **Node.js (22)** | Required by the brief; bundles cleanly into a single executable. |
| Web server | **Node built-in `http`** | Zero extra dependencies; serves the small static client and upgrades to WebSocket. |
| Real-time transport | **`ws`** (WebSocket) | Instant push of authoritative state to every client; minimal, well-supported, bundles fine. |
| Console QR / address | **`qrcode-terminal`** | Pure-JS QR rendering in the host's console window; no native modules. |
| Client | **Vanilla HTML/CSS/JS, no framework, no build step** | Keeps the artifact simple and easy to bundle; mobile-first; nothing to compile. |
| Single .exe | **`@yao-pkg/pkg`** | Maintained fork of `pkg` that supports Node 20/22 and **cross-compiles** to `node22-win-x64` from any OS. Embeds the Node runtime + the `public/` assets into one file. |
| Android APK | **`nodejs-mobile` (Node ~18) embedded in a bare Android/Kotlin app** | Runs the **same `src/`** unchanged on a real Node runtime on the phone. No engine rewrite, single authoritative server, no extra install for players. See the dedicated section below. |
| Persistence | **Single JSON file** (beside the .exe, or in the app's private files dir on Android via `MOPOPOLY_DATA_DIR`) | Survives accidental restarts; trivially inspectable; no database to install. |

### Why pkg and not Node's built-in SEA
The brief allows either `pkg` or Node's Single Executable Application feature.
`@yao-pkg/pkg` was chosen because it **cross-compiles a Windows .exe from
Linux/macOS** (so the GitHub Actions build can run on cheap `ubuntu-latest`
runners), and it bundles static assets via a simple `pkg.assets` glob. Node's
SEA currently needs to run on Windows to produce a Windows binary and has a more
manual asset-injection story.

### Networking model
- The server binds to `0.0.0.0:47800` so any device on the LAN can reach it by
  the laptop's IP. The port is fixed (override with the `PORT` env var).
- The host console prints **all candidate LAN IPv4 addresses** (private ranges
  first) plus a QR code for the best guess, because a laptop often has several
  interfaces (Ethernet, WiFi, hotspot).
- Players are pure browser clients. Identity is a **per-player session token**
  (a UUID) stored in the browser's `localStorage`, sent on (re)connection. This
  is what makes seats survive refreshes, sleep, and network switches.
- The server is fully **authoritative**: clients only ever send *intents*
  (e.g. "play Sly Deal on seat 2's Pacific Avenue"). All deck, shuffling, and
  rule logic is server-side, and **hidden information (other players' hands) is
  never sent to clients that shouldn't see it** — opponents are sent only a
  hand *count*. This is verified by an automated test.

---

## Hosting target #2: Android APK (nodejs-mobile)

The Android host is **additive** — the Windows `.exe` path is unchanged. The
goal: a non-technical person installs **one APK** on a personal phone, taps the
icon, and the phone becomes the LAN game server (handy when the only computer is
a locked-down work laptop that won't run unsigned executables or accept firewall
prompts). Players still join from any phone browser.

### Why nodejs-mobile, and how `src/` is reused
- The project has **no native Node dependencies** (`ws` is pure JS; its optional
  native accelerators are omitted on mobile), which is exactly what makes
  embedding a Node runtime on Android feasible.
- [`nodejs-mobile`](https://github.com/nodejs-mobile/nodejs-mobile) (the
  maintained community fork) ships a prebuilt `libnode.so`. We use a **bare
  Android/Kotlin project** (under `android/`) rather than the Cordova/React
  Native plugins, because we need precise control over a **foreground service**,
  the Android-14 `foregroundServiceType`, the runtime notification permission,
  and the WebView lifecycle — things the plugins don't give for free.
- **`src/` stays the single source of truth.** `scripts/prepare-node-project.sh`
  copies `src/` + `public/` into the app's `assets/nodejs-project/` at build
  time (a git-ignored artifact) and installs only `ws`. A thin
  `android/node-template/mobile-main.js` sets `MOPOPOLY_DATA_DIR` from an argv
  passed by the native layer, then `require('./src/server.js')`. The engine,
  protocol, persistence, and client are **byte-for-byte the same** as the exe.
- **Node version:** nodejs-mobile targets **Node ~18** (pinned to `18.20.4` in
  the workflow). The exe uses Node 22. `src/` is kept compatible with both — it
  avoids Node 20+/22-only APIs; `crypto.randomUUID()`, `os.networkInterfaces()`,
  and `ws@8` all work on Node 18. (`npm test` runs on the repo's Node and guards
  the shared logic.)

### Code changes that make `src/` work on both targets
1. **`src/persistence.js`** now prefers `MOPOPOLY_DATA_DIR` when set (the app's
   writable files dir on Android), then `process.pkg` (beside the exe), then cwd.
2. **`src/server.js`** gained:
   - `GET /api/hostinfo` → `{ ips, port }` (reuses `lanAddresses()`),
   - a host screen at `GET /host` (`public/host.html` + `host.js`) that fetches
     `/api/hostinfo` and renders a **client-side QR** with a vendored, single-file
     **`qrcode-generator`** (MIT, `public/vendor/qrcode.js`) — no network call,
   - a **guarded `qrcode-terminal` require** and a **TTY-guarded** console host
     screen: the fancy console QR box only prints in a real terminal (the exe's
     console window). With no TTY or no module (the embedded runtime) it prints a
     single marker line instead and never crashes. The exe's console output is
     unchanged. (The `/host` screen is also bundled into the exe, as a bonus.)

### Android wrapper specifics (`android/`)
- **Embedding:** `NodeBridge` (`System.loadLibrary("node")` then `"native-lib"`)
  exposes `startNodeWithArguments`. The JNI glue in `cpp/native-lib.cpp` builds a
  contiguous argv buffer, redirects Node's stdout/stderr to **logcat**, and calls
  `node::Start` — modeled on the official nodejs-mobile native-gradle sample.
- **Foreground service** (`NodeService`): starts the server on a background
  thread and shows an ongoing notification ("Mopopoly Deal is hosting — tap to
  open"). Declared `foregroundServiceType="specialUse"` (with the required
  `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` justification) — the honest fit for a
  sideloaded app whose job is *hosting a local server*, which is neither
  `dataSync` nor `mediaPlayback`. Permissions: `INTERNET`,
  `ACCESS_NETWORK_STATE`, `FOREGROUND_SERVICE`,
  `FOREGROUND_SERVICE_SPECIAL_USE`, `POST_NOTIFICATIONS` (Android 13+ runtime
  prompt), `WAKE_LOCK`.
- **WebView UX** (`MainActivity`): once `/api/hostinfo` responds, the WebView
  loads `http://127.0.0.1:47800/host`, so the host phone shows the QR/IP **and**
  can play as a seated client (the player client derives its WebSocket URL from
  `location.host`, so `127.0.0.1` works for the host while other phones use the
  LAN IP). `domStorageEnabled = true` so `localStorage` keeps the session token —
  this is what makes the **host phone's own reconnection** work.
- **Data dir:** the app's `filesDir` is passed to Node as `argv[2]` →
  `MOPOPOLY_DATA_DIR`, so the save file lives in app-private storage and an
  in-progress game survives closing/reopening the app.
- **ABIs / minSdk:** `arm64-v8a` + `armeabi-v7a`; `minSdk 24`, `targetSdk 34`.
- **Stopping:** a "Stop hosting" notification action stops the service and ends
  the process. nodejs-mobile can only start Node **once per process lifetime**,
  so a clean stop/restart of the server requires ending the process; the saved
  game resumes on next launch.

### Battery, Doze, and "keep it awake"
- The foreground service + a held `PARTIAL_WAKE_LOCK` keep the server responding
  while the screen is off, and keep Android from killing the process under normal
  conditions. **Doze**/app-standby can still throttle networking if the phone is
  left **unplugged and motionless**, and some vendors (Xiaomi, Huawei, Samsung,
  OnePlus…) run aggressive battery managers that may pause background apps.
- Guidance (documented in the README): **keep the app open, the phone awake, and
  plugged in** for longer sessions. This is the Android analogue of "keep the
  black console window open" on Windows.

### APK size & install friction (analogous to the exe's SmartScreen)
- **Size:** ~**40–70 MB** with both ABIs (~**30–45 MB** if built for `arm64-v8a`
  only), because it embeds the Node runtime — the direct counterpart to the
  ~55–90 MB exe.
- **Unknown-sources + Play Protect:** sideloading requires enabling **"Install
  unknown apps"** for the installing app and tapping through a **Google Play
  Protect** "unscanned/unsafe app" warning. This is **unavoidable** without
  publishing to the Play Store (out of scope: needs a paid developer account and
  review). It's the one-time Android equivalent of the Windows
  **SmartScreen/Firewall** prompts, and is documented tap-by-tap in the README.
- **iOS is out of scope:** distributing an iOS app needs the App Store / a paid
  Apple developer account and signing. iPhones can still **play** as browser
  clients, and can host via the Windows exe on a laptop.

### Unchanged from the exe
Full 110-card deck, every rule and edge-case decision below, the
authoritative-server + hidden-info model, per-player token reconnection, the
single-JSON-file save, and "one game at a time per running host" all apply
identically on Android.

---

## Exact deck composition (110 cards)

Defined in [`src/game/cards.js`](src/game/cards.js) and asserted by the test
suite. Total: **110 cards.**

**Money — 20 cards:** `$1M ×6, $2M ×5, $3M ×3, $4M ×3, $5M ×2, $10M ×1`.

**Properties — 28 cards** (with set size / rent ladder / bank value):

| Color | Cards | Set size | Rent ladder | Bank value |
|---|---|---|---|---|
| Brown | 2 | 2 | 1, 2 | $1M |
| Light Blue | 3 | 3 | 1, 2, 3 | $1M |
| Pink | 3 | 3 | 1, 2, 4 | $2M |
| Orange | 3 | 3 | 1, 3, 5 | $2M |
| Red | 3 | 3 | 2, 3, 6 | $3M |
| Yellow | 3 | 3 | 2, 4, 6 | $3M |
| Green | 3 | 3 | 2, 4, 7 | $4M |
| Dark Blue | 2 | 2 | 3, 8 | $4M |
| Railroad | 4 | 4 | 1, 2, 3, 4 | $2M |
| Utility | 2 | 2 | 1, 2 | $2M |

**Property wildcards — 11 cards:**
`Pink/Orange ×2`, `Red/Yellow ×2`, `Light Blue/Brown ×1`,
`Light Blue/Railroad ×1`, `Dark Blue/Green ×1`, `Green/Railroad ×1`,
`Railroad/Utility ×1`, **rainbow (any-color) ×2**. The two rainbow wilds have
**no rent value of their own and no bank value**.

**Rent cards — 13 cards:** two-color rents `Brown/Light Blue ×2`,
`Pink/Orange ×2`, `Red/Yellow ×2`, `Green/Dark Blue ×2`, `Railroad/Utility ×2`,
plus **any-color wild rent ×3**.

**Action cards — 38 cards:** `Pass Go ×12`, `Just Say No ×3`, `Sly Deal ×3`,
`Forced Deal ×4`, `Debt Collector ×3`, `It's My Birthday ×3`, `Deal Breaker ×2`,
`Double The Rent ×2`, `House ×3`, `Hotel ×3`.

### The 110-vs-108 reconciliation (a documented decision)
Published descriptions of the deck **disagree**: depending on the source you'll
see the total quoted as **106, 108, or 110** cards, with the action-card counts
varying most. Using the most commonly cited counts for the *interesting* action
cards (Deal Breaker 2, Just Say No 3, Sly Deal 3, Forced Deal 4, Debt Collector
3, Birthday 3, Double The Rent 2, House 3, Hotel 3) and Pass Go ×10 yields
**108**. To honour the brief's "full 110-card deck" requirement, the two extra
cards were added to **Pass Go** (the generic "draw two" filler and the most
numerous action card, whose count is the most variably reported), making it
**×12**. Every other count matches the standard game. This affects gameplay only
trivially (slightly more Pass Go cards) and keeps the deck at exactly 110.

---

## Rules implemented

- **Turn structure:** draw **2** at the start of your turn, or **5** if you
  start your turn with an empty hand. Up to **3 plays** per turn: place a
  property, bank a card as money, or play an action. **7-card hand limit**
  enforced at end of turn (discard the excess; the client prompts you).
- **Property cards cannot be banked as money**; money/action/rent cards can.
- **Win condition:** **3 complete sets of different colors.**
- **Rent ladders** per color, with **House (+$3)** and **Hotel (+$4)** bonuses
  applied only while the set is complete. Houses require a complete set; hotels
  require a house already present.
- **Rent cards:** a **two-color** rent charges **every** opponent for one of its
  two colors (your choice); the **any-color wild** rent charges **one** opponent
  for any one color you own.
- **Double The Rent** stacks: it is played together with a rent card and costs
  **one extra play each**, so a rent + two Double The Rent = 3 plays and ×4 rent.
  The client only offers as many as your remaining plays allow.
- **Just Say No** cancels an action targeted at you; a **counter-Just Say No**
  re-enables it, and so on (a back-and-forth duel resolved by parity). It does
  **not** consume one of your 3 plays — it's a reaction.
- **Deal Breaker** steals a whole complete set (with its buildings).
  **Sly Deal** steals one single property (not from a complete set).
  **Forced Deal** swaps one of your singles for one of theirs (neither from a
  complete set). **Debt Collector** ($5M from one player). **It's My Birthday**
  ($2M from everyone). **Pass Go** (draw 2). All can be **banked as money**
  instead of played.
- **Payments:** you choose which assets (bank money and/or property cards) to
  hand over. **No change is given** — if you can't reach the amount exactly you
  may overpay, and if your whole worth is less than the debt you hand over
  **everything**. The client enforces "enough or everything".
- **Wildcards** count toward a set's size and therefore its rent. The **rainbow
  wild contributes no rent of its own** but does count as a set member.
  Wildcards can be **freely re-assigned** between colors on your own turn (a free
  action, matching the official "rearrange on your turn" allowance).
- **Deck exhaustion:** when the draw pile runs out, the discard pile is reshuffled
  into a new draw pile.

---

## Edge-case decisions (where sources are ambiguous or silent)

1. **Deck total = 110**, with the two extra cards assigned to Pass Go — see the
   reconciliation note above.
2. **Receiving a property** (via payment, Sly/Forced Deal, or Deal Breaker)
   **auto-places** it into the most sensible color for the recipient (the color
   where they already have the most progress). Because wildcards can be freely
   re-assigned on your own turn, the recipient can immediately move it where they
   want on their next turn. This avoids an extra "where do you want this?" prompt
   for the receiver on someone else's turn.
3. **A complete set made *only* of rainbow (any-color) wild cards does not count
   toward winning.** A real property or two-color wild is required. This prevents
   a degenerate all-rainbow "set". (Two-color wilds count normally.)
4. **Houses/Hotels** are restricted to complete **non-Railroad / non-Utility**
   sets (the official cards depict houses/hotels, which those two sets don't
   use). If a built-on set later loses a card and becomes incomplete, the
   building **stays attached** but contributes **no bonus** until the set is
   complete again, and it can still be taken with the set via Deal Breaker. If a
   set is emptied entirely, any building falls back into the owner's **bank** as
   money.
5. **Buildings are not selectable as standalone payment** (you pay with money +
   properties). They can still be **banked as money from your hand** (House $3M,
   Hotel $4M) and stolen with their set. This matches common digital
   implementations; see Limitations.
6. **Disconnected players never deadlock the game.** If an action targets a
   disconnected player, their "Just Say No?" prompt **auto-allows** (they don't
   block it), and any payment they owe is **auto-paid greedily** on their behalf
   (largest bank cards first, then properties; everything if they can't cover
   it). If it becomes a disconnected player's **whole turn**, the game **pauses**
   and the **host** gets a **Skip** button — their seat, cards, and turn order
   are preserved either way.
7. **No automatic full-set rent doubling.** The brief mentions "full-set rent
   doubling where applicable," but standard Monopoly Deal has **no** rule that
   doubles a complete set's rent automatically — the rent ladder's top value
   *is* the full-set rent, and the only multiplier is the **Double The Rent**
   action card (fully implemented). Automatic set-doubling is a house rule, so it
   was intentionally **not** implemented to stay faithful.
8. **The "host" is the first player to join** (seat 0). They get Start Game /
   Skip / Play Again controls. The connection board is the laptop's console
   window (address + QR) and/or the **`/host` screen** (address + client-side QR,
   shown automatically in the Android app's WebView and also reachable in any
   browser). Anyone who can't get a seat (game in progress or table full) is
   dropped into a **read-only spectator** view automatically.
9. **Just Say No** is normally consumed via the response prompt. It can also be
   banked as money like any other action card.

---

## Known limitations

- **Windows SmartScreen + Firewall prompts are unavoidable** for an unsigned
  app that opens a network port. They are one-time and are explained
  button-by-button in the README. Code-signing (which would remove the
  SmartScreen warning) requires a paid certificate and is out of scope.
- **The .exe is unsigned** and ~55–90 MB because it embeds the Node runtime.
  This is expected for `pkg`-style single executables.
- **The APK is sideloaded** (Play Protect + "install unknown apps" friction) and
  ~40–70 MB because it embeds Node. Release builds without a configured keystore
  fall back to the debug signing key (installable, but not upgradeable in place).
  Publishing to the Play Store (which would remove the friction) is out of scope.
- **Android hosts need the phone kept awake/plugged in**; Doze and vendor battery
  managers can otherwise throttle or pause a backgrounded server. **iOS hosting is
  out of scope** (App Store / paid developer account required); iPhones can still
  play as clients.
- **Buildings can't be handed over as standalone payment** (decision #5).
- **Wild placement on receipt is automatic** rather than prompted (decision #2);
  the receiver re-assigns on their turn if they disagree with the auto-choice.
- **Mobile-first UI:** it works on desktop browsers but is laid out for phones.
- **Same-LAN requirement:** the game has no relay/cloud server (by design — it's
  a local LAN party host), so all devices must share a network or hotspot.
  Networks with client isolation require the hotspot fallback (documented).
- **One game at a time** per running executable.

---

## Tests

- `test/engine.test.js` — 23 unit tests over the rules engine: deck composition
  (counts per color, 110 total, unique ids, money sum), turn/play limits,
  banking restrictions, rent math with house/hotel, Debt Collector + payment,
  "pay enough or everything", Just Say No duel (incl. counter-JSN), Sly Deal
  restrictions, Double The Rent stacking, win condition, the all-rainbow-set
  rule, hand-limit discard, and disconnect auto-resolution.
- `test/integration.test.js` — boots the real server and drives it over
  WebSocket: lobby → start → play → end turn, **verifies hands are not leaked to
  other clients**, and verifies **reconnection restores the exact seat and
  hand**.

Run everything with `npm test`. (The browser UI was additionally smoke-tested
with Playwright during development.)
