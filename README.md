# Tape Scope Review

A free video review tool for minor hockey coaches. Watch the game once, clip the
moments worth talking about, trim them, and show them to the team.

**Open it here: https://garowetz.github.io/tapescope/**

Nothing is installed. Tape Scope plays YouTube video inside the page. On your
own, everything you make stays in your browser and in files you keep; a team the
site owner sets up can share its games between coaches (see Team games). This site and repo hold code only: no games, rosters or player names.

## The workflow: Review, Clips, Present

### 1. Review (while watching the game)

The **Review** tab is where you watch the game and mark moments.

1. Paste the game's YouTube link and press **Start clipping**.
2. Name the game in the box at the top (for example "vs Guelph - Nov 15").
3. Optional: open the **menu** (the three dots) and choose **Team roster** to
   type in your players or import your team file (see below).
4. Play the game. Right after something happens, good or bad, press **Clip it**
   (key **C**).

Each press saves a clip from 30 seconds before to 10 seconds after that moment.
Don't worry about exact timing or tagging; you do that on the Clips tab.
**Undo** removes the last clip. **Settings** in the menu changes the before/after
window for new clips.

Other keys: **Space** plays and pauses, **Left / Right arrows** jump 5 seconds.

Under the video: play, back and forward 5 seconds, **mute** (an iPad's YouTube
player has no volume slider, so use this or the iPad's buttons), and the speed:
**¼× ½× 1× 1½× 2×**. Speed up through the quiet parts; Clip it works the same at
any speed. On a phone the speeds sit behind one button that shows the current speed.

If you peek at a clip mid-game, the Review tab shows **Back to where I was** so
you can pick the game up again.

Your clips are listed under **Clip it**, with a coloured strip of the whole game
(under the video on an iPad held sideways or a computer).

**All clips** opens every clip in the game as a card. Filter by category, player,
position or coach, and sort by game time, category or player number. Tap a card to
work on that clip. **Present these** presents just the clips showing, in that
order. **Use this order** makes a sort the game's order everywhere (**Undo** puts it
back), and the arrows on each card move it earlier or later in the list.

### 2. Clips (afterward)

Switch to the **Clips** tab, or tap any clip in the list or on the game strip.
The top of the tab picks the clip: the **arrows** step through them (keys **P / N**)
and the box between them lists every clip by number and title. **Replay** (key **R**)
plays the clip again.

The clip is the blue stretch on a timeline that also shows some video either side.

- The start and end times sit on the timeline, above the clip's two handles.
  Tap a time to type a new one, like `12:34` or `1234`.
- Drag a handle to move that end; the video shows the frame under your finger.
- Tap anywhere else on the timeline to watch from there, even past the end.
- Start buttons are on the left (**-5s +5s -1s +1s** and **Set start here**), end
  buttons on the right. Left-hand buttons move earlier, right-hand ones later.
- Add a **title**, **talking points**, a **category** (Good, Fix, Teach) and the
  **players** involved.
- The **three dots** hold Move earlier, Move later, **Reset to default window**
  and Delete. A deleted clip can be undone for a few seconds.

### 3. Present (to the team)

Connect the laptop or iPad to the TV and press **Present** at the top. The
screen goes full size and shows one clip at a time: the video, the clip's number
and title, and its category, players and talking points. The talking points go
beside the video or in a strip under it, whichever leaves the bigger picture (a TV
usually gets them beside, an iPad under).

- **Prev / Replay / Next** step through the clips. Each clip plays from its start
  to its end, then pauses so you can talk about it.
- The big round button plays and pauses. **¼× / ½× / 1×** set the speed.
- Tap or drag the thin bar above the buttons to move within the clip.
- **Play all** runs every clip in order with a short pause between them.
- **All clips** jumps straight to any clip.
- **Display** turns the talking-points panel off (video only) and switches player
  names off, so only jersey numbers show.
- **Done** goes back to editing, on the clip you finished on.

Keys: **Left / Right arrows** or **Page Up / Page Down** (what most presentation
clickers send) for previous and next, **Space** to play or pause, **R** to replay,
**Home / End** for the first and last clip, **Esc** to finish.

Presentation mode stays dark even in the light theme, because it is meant for a TV.

Tips for the session: keep it to 6-10 clips, lead with good ones, ask "what do you
see?" before explaining, and end on a positive clip.

## Settings

**Settings** in the menu has **Your name** (shown on the clips you make),
**Appearance** (Dark, Light, or System to follow your device; Dark is the default)
and the clip length for new clips.

## Team games (shared between coaches)

If the site's owner set up your team, you'll get a **team link** and a **team
password**. Open the link, type the password once, and add your name. From then on:

- The **team home** shows every game the team has as a card, newest first, with
  its clip count, the Good / Fix / Teach split and who clipped it. **Review** or
  **Present** opens a game; the last card, **Add game**, asks for a name and the
  YouTube link. **Roster** is at the top. The team's name in the top bar comes
  back here from any game.
- The address shows the team and the game you're in, so reloading or bookmarking
  it comes back to the same game.
- Everything you do saves for the whole team as you go. When another coach adds or
  changes a clip, you see it within a second or two. Two coaches can work on the
  same game at once; if you both edit the same clip, the last change wins.
- It keeps working without a connection and sends your changes when you're back.
- The team roster is shared too.
- The plain site address remembers your team on that device. **Sign out of the
  team** in the menu forgets it (do that on a shared computer).
- The game you had in this browser before signing in is still there after you sign
  out, and the team home's menu offers to add it to the team.

## Saving and sharing

- **Autosave.** Your work is saved in this browser as you go, so a closed tab
  doesn't lose it. It is only on that one device and browser.
- **Save game file** (in the menu) downloads a game file (`something.tapescope.json`). This is the
  reliable copy. Keep it in the coaches' shared folder.
- **Open game file** loads a game file back in, on any device.
- **Add clips from another coach** merges another coach's game file for the same
  video into yours. Their clips go after yours, with their name on them (if they
  set it in Settings). Clips you both already have are skipped, so merging the
  same file twice does nothing. **Undo** on the message takes it back.
- **Share link** makes one link that carries the whole game. By default it leaves
  the roster out and shows jersey numbers only. Tick **Include player names** only
  when sending to coaches. Very long links can get cut off by some texting and
  email apps; if a link won't open, send the game file instead.

## The team roster

Open the **menu** and choose **Team roster**. The page has spots for a full team:
2 goalies, 3 defence pairs (LD, RD) and 3 forward lines (LW, C, RW), plus
**Extra players** for spares and call-ups. Type each player's name, and their
jersey number if you know it; leave the rest empty.

- It saves as you type, in this browser, and every new game starts with it.
- **Export** downloads it as `team-roster.csv`. **Import** loads a file back, on
  any device or browser.
- A player without a number can still be tagged on clips, by name. Add the
  number later and their clips keep the tag. The page warns about a repeated number.

The file is a plain spreadsheet you can also edit in Google Sheets or Excel:

```text
number,name,position
30,Sam,G
4,Alex,LD
9,Jordan,C
```

Positions are G, LD, RD, LW, C, RW. D and F also work for "either side"; those
players go in the first free defence or forward spot.

## What's saved, and where

Everything is kept in this browser on this device (its local storage, not
cookies): the game you're working on, the team roster, and your settings. Close
the tab and come back, and it's all there.

A different browser, a different device, or a private window starts empty. To
move your work, use **Save game file** and **Export** on the roster page, then
open them on the other device. Safari may also clear a site's stored data if you
don't visit it for about a week, so keep the files as your real copy.

## Privacy

- Game files and roster files contain kids' names. Keep them in a folder only the
  coaches can open. Never post them publicly.
- Anyone who gets a share link can read the clip titles and talking points, so
  keep them coach-appropriate.
- Share links are never uploaded anywhere: the game is packed into the link itself.

## If the video won't play

Ask whoever posted it to set the video to **Unlisted** (not Private) and leave
**Allow embedding** turned on. Test with one game early in the season.

If the C / G / F keys stop responding, click anywhere on the page outside the video.

## For developers

Plain HTML, CSS and JavaScript with no build step. GitHub Pages serves the `main`
branch as-is.

To run it locally, serve the folder (ES modules don't load from `file://`):

```bash
python -m http.server 8123
```

| File | What it does |
| --- | --- |
| `js/clips.js` | Every clip-timing rule: default window, clamping, trimming, time text |
| `js/game.js` | The game object and `schemaVersion` upgrades |
| `js/roster.js` | Roster layout (lineup spots), file parsing and export |
| `js/team.js` | The team roster page |
| `js/clips-page.js` | All clips as cards, with filters, sorting and Present these |
| `js/team-home.js` | The team home: the team's games as cards, and Add game |
| `js/players/youtube.js` | YouTube player adapter. A local-file adapter exposes the same methods |
| `js/storage/local.js`, `file.js`, `link.js` | Storage adapters: autosave, game file, share link |
| `js/storage/team.js`, `firebase.js` | Team games: the interface the app uses, and its Firebase backend (the only file that imports Firebase) |
| `js/team-sync.js` | Keeps the game on screen and the team's copy in step |
| `admin.html`, `js/admin.js` | Owner-only page to create teams and set their passwords |
| `firestore.rules` | Who can read and write what. Tests: `npm --prefix tools/rules-test test` (needs Java 21) |
| `js/app.js` | UI wiring and settings |
| `js/present.js` | Presentation mode. Pins the existing player over the presentation screen rather than moving it, because moving a YouTube iframe reloads it |
| `js/vendor/lz-string.min.js` | [lz-string](https://github.com/pieroxy/lz-string) 1.5.0 (MIT), compresses share links |
| `fonts/` | [Barlow Condensed](https://github.com/jpt/barlow) (SIL Open Font License), self-hosted |

The clip end is enforced by a 200 ms time check in `app.js`, not by YouTube's
`endSeconds`, which stops applying after any seek.
