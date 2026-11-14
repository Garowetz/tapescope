# Tape Scope Review

A free video review tool for minor hockey coaches. Watch the game once, clip the
moments worth talking about, trim them, and show them to the team.

**Open it here: https://garowetz.github.io/tapescope/**

Nothing is installed and there are no accounts. Tape Scope plays YouTube video
inside the page, and everything you make stays in your browser and in files you
keep. This site and repo hold code only: no games, rosters or player names.

## The workflow: Clip it, Trim, Present

### 1. Clip it (while watching the game)

1. Paste the game's YouTube link and press **Start clipping**.
2. Name the game in the box at the top (for example "vs Guelph - Nov 15").
3. Optional: open the **menu** (the three dots) and choose **Load roster** to
   pick your team file (see below).
4. Play the game. Right after something happens, good or bad, press:
   - **Clip it** (key **C**) to save the moment with no tag
   - **Good** (key **G**)
   - **Fix** (key **F**)

Each press saves a clip from 30 seconds before to 10 seconds after that moment.
Don't worry about exact timing; you fix that in the next step. **Undo** removes
the last clip. Pressing Good or Fix straight after Clip it tags that clip rather
than making a second one. **Clip length** in the menu changes the before/after
window for new clips.

Other keys: **Space** plays and pauses, **Left / Right arrows** jump 5 seconds.

If you peek at a clip mid-game, the Clip screen shows **Back to where I was** so
you can pick the game up again.

### 2. Trim (afterward)

Switch to **Trim**, or tap any clip in the list or on the coloured game strip.

- **Prev / Replay / Next** (keys **P / R / N**) step through the clips. Each one
  plays from its start to its end and then pauses.
- Tap **Start** or **End** to choose which end you are adjusting.
- **Set start here / Set end here** uses the spot the video is paused at.
- The **-5s -1s +1s +5s** buttons nudge that end. You can also tap the time and
  type one, like `12:34` or `1234`.
- The bar above shows the clip; the white line is where you pressed Clip it.
  Tap or drag the bar to move around inside the clip.
- Add a **title**, **talking points**, a **category** (Good, Fix, Teach) and the
  **players** involved.
- The **three dots** beside the clip number hold Move earlier, Move later,
  **Reset to default window** and Delete. A deleted clip can be undone for a few
  seconds.
- **¼× / ½× / 1×** change the playback speed.

### 3. Present (to the team)

A full-screen presentation mode for a TV or iPad is the next thing being built.
For now, open the game on the laptop or iPad connected to the TV and use Trim:
**Prev / Replay / Next** and the slow-motion buttons do the job.

Tips for the session: keep it to 6-10 clips, lead with good ones, ask "what do you
see?" before explaining, and end on a positive clip.

## Saving and sharing

- **Autosave.** Your work is saved in this browser as you go, so a closed tab
  doesn't lose it. It is only on that one device and browser.
- **Save game file** (in the menu) downloads a game file (`something.tapescope.json`). This is the
  reliable copy. Keep it in the coaches' shared folder.
- **Open game file** loads a game file back in, on any device.
- **Share link** makes one link that carries the whole game. By default it leaves
  the roster out and shows jersey numbers only. Tick **Include player names** only
  when sending to coaches. Very long links can get cut off by some texting and
  email apps; if a link won't open, send the game file instead.

## The team file (roster)

A small spreadsheet saved as CSV, edited in Google Sheets or Excel:

```text
number,name,position
7,Sam,F
12,Alex,D
```

Load it when you start a game and its roster is copied into that game. If the
lineup changes, press **Update roster** and pick the file again. Without a roster
you can still add players to a clip by jersey number.

## Privacy

- Game files and team files contain kids' names. Keep them in a folder only the
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
| `js/roster.js` | Team file parsing (CSV or JSON) |
| `js/players/youtube.js` | YouTube player adapter. A local-file adapter exposes the same methods |
| `js/storage/local.js`, `file.js`, `link.js` | Storage adapters: autosave, game file, share link |
| `js/app.js` | UI wiring |
| `js/vendor/lz-string.min.js` | [lz-string](https://github.com/pieroxy/lz-string) 1.5.0 (MIT), compresses share links |
| `fonts/` | [Barlow Condensed](https://github.com/jpt/barlow) (SIL Open Font License), self-hosted |

The clip end is enforced by a 200 ms time check in `app.js`, not by YouTube's
`endSeconds`, which stops applying after any seek.
