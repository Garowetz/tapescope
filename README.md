# Tape Scope Review

A free video review tool for minor hockey coaches. Watch the game once, clip the
moments worth talking about, trim them, and show them to the team.

**Open it here: https://garowetz.github.io/tapescope/**

Nothing is installed and there are no accounts. Tape Scope plays YouTube video
inside the page, and everything you make stays in your browser and in files you
keep. This site and repo hold code only: no games, rosters or player names.

## The workflow: Clip it, Trim, Present

### 1. Clip it (while watching the game)

1. Paste the game's YouTube link at the top and press **Load**.
2. Give the game a title (for example "vs Guelph - Nov 15").
3. Optional: press **Load roster** and pick your team file (see below).
4. Play the game. Right after something happens, good or bad, press:
   - **Clip it** (key **C**) to save the moment with no tag
   - **Clip: Good** (key **G**)
   - **Clip: Fix** (key **F**)

Each press saves a clip from 30 seconds before to 10 seconds after that moment.
Don't worry about exact timing; you fix that in the next step. **Undo last clip**
removes an accidental press. **Settings** changes the before/after window for new
clips.

Other keys: **Space** plays and pauses, **Left / Right arrows** jump 5 seconds.

### 2. Trim (afterward)

Switch to the **Trim** tab, or tap any clip in the list.

- **Prev / Replay / Next** step through the clips. Each one plays from its start
  to its end and then pauses.
- **Set start here / Set end here** use the spot the video is at right now.
- The **-5 -1 +1 +5** buttons nudge the start or end by seconds. You can also type
  a time like `12:34` or `1:02:15`.
- **Reset to default window** puts the clip back to its original before/after
  window. The moment you first pressed Clip it is always kept, so a clip can be
  re-trimmed any time.
- Add a **title**, a **category** (Good, Needs work, Teaching point), the
  **players** involved and your **talking points**.
- **Move up / Move down** reorder the clips. **Delete** removes one.
- **0.25x / 0.5x / 1x** change the playback speed.

### 3. Present (to the team)

A full-screen presentation mode for a TV or iPad is the next thing being built.
For now, open the game on the laptop connected to the TV and use the Trim tab:
**Prev / Replay / Next** and the slow-motion buttons do the job.

Tips for the session: keep it to 6-10 clips, lead with good ones, ask "what do you
see?" before explaining, and end on a positive clip.

## Saving and sharing

- **Autosave.** Your work is saved in this browser as you go, so a closed tab
  doesn't lose it. It is only on that one device and browser.
- **Save game** downloads a game file (`something.tapescope.json`). This is the
  reliable copy. Keep it in the coaches' shared folder.
- **Open game** loads a game file back in, on any device.
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

The clip end is enforced by a 200 ms time check in `app.js`, not by YouTube's
`endSeconds`, which stops applying after any seek.
