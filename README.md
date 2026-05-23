# Mopopoly Deal

A faithful, original digital version of the card game *Monopoly Deal* that you
host on a **Windows laptop** by double-clicking one file. Everyone else plays
from the web browser on their **phones** — no app to install, nothing to set up.

This guide is written for someone who has **never used a terminal**. If you can
double-click a file and read your laptop's screen, you can run this.

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

Technology choices, the exact card composition, every rules edge-case decision,
and known limitations are documented in **[NOTES.md](NOTES.md)**.
