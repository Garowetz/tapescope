# tapescope

Tape Scope Review ("tapescope" for short): a static site for minor hockey video
review. Coaches clip moments from a YouTube game video, trim them, and present
them to the team. Never call it "Film Room"; that was the working name.

- Live site: https://garowetz.github.io/tapescope/ (GitHub Pages, `main` branch root)
- Repo: GitHub `Garowetz/tapescope`, **public**
- `PLAN.md` (local only, gitignored) has the full plan, phases and reasoning.
  Read it before starting a new phase.

## Hard rules

- The repo is public and holds code only. Never commit game files, rosters,
  player names, or names of real people. `PLAN.md` names real people, which is
  why it is gitignored. Test rosters use made-up names and live outside the repo.
- Plain HTML/CSS/JS, no build step, no framework. Pages serves the files as-is.
- The UI never talks to YouTube directly: only through the player adapter
  (`js/players/`). Saved games only go through storage adapters (`js/storage/`).
- All clip-timing rules stay in `js/clips.js`, driven by settings, never hard-coded.
- Game files carry `schemaVersion`. Any format change must keep old files opening
  (`normalizeGame` in `js/game.js`).

## Design

- Dark theme by default, plus Light and System (Settings > Appearance). Colours are
  tokens on `:root`; the light set is under `:root[data-theme="light"]` and repeated
  for `system` in a `prefers-color-scheme` block. Keep both copies in step. An inline
  script in `index.html` applies the saved theme before paint. One accent (ice
  blue), category colours green / orange / lavender.
  Barlow Condensed (self-hosted in `fonts/`) for headings, numbers and labels;
  system font for body text.
- Tabs are **Review** (watch and clip, `data-tab="clip"`), **Clips A** (edit,
  `data-tab="trim"`) and **Clips B** (`data-tab="trimb"`, a video-editor style
  trim timeline being A/B tested against A). Both Clips tabs render into `#tab-trim`;
  `state.editTab` remembers the last one. When the owner picks one, delete the other.
- The team roster page (`js/team.js`) lays the roster out as 2 G, 3 D pairs, 3
  forward lines, plus extras (`SLOTS` in `js/roster.js`). The roster keeps lineup
  order (it is not sorted); sort by number only where it is displayed as a list.
  It is saved to the current game and to `tapescope.team` in localStorage.
- Every dialog gets an X (added in `app.js`), and `showModal` is wrapped so the
  phone Back button closes the top pop-up, page or presentation instead of leaving.
- The video must never scroll off screen at any size: sticky on phone and tablet,
  a window-height layout on desktop, pinned left on a phone held sideways.
- Presentation mode (`js/present.js`) is always dark (`.force-dark`). It never
  moves the YouTube iframe (that reloads it); it pins `.player-wrap` over `#pv-stage`.
- Four layouts in `css/styles.css`: phone portrait (video pinned on top), phone
  landscape, tablet (one column), desktop (side rail). Check all four after any
  UI change. Touch targets stay at 44px or more.
- Secondary actions live in the three-dot menus, not on the main screens. The
  owner rejected an earlier version for having too many buttons on mobile.
- Category ids are `good`, `needs-work`, `teaching`; the labels shown are Good,
  Fix, Teach.

## Status

Phase 1 (clip, trim, save/share) and Phase 2 (presentation mode) are built, plus
coach names on clips (`clip.by`, Settings > Your name, `tapescope.coach`) and merging
another coach's game file. Next in `PLAN.md` is Phase 3, drawing on a paused clip;
the owner also wants real shared team accounts (Firebase was suggested) later.

## Releasing

Every file link carries `?v=N` (in `index.html` and every relative `import`), so a
browser never mixes old and new modules after a deploy (GitHub Pages caches for
10 minutes, and a mix breaks the app at load). Bump N everywhere on each release:

```bash
grep -rl "?v=8" index.html js | xargs sed -i 's/?v=8/?v=9/g'
```

## Running and testing

- Serve locally: `python -m http.server 8123` (launch config "tapescope" in
  `.claude/launch.json`). ES modules don't load from `file://`.
- A public embeddable test video: YouTube ID `aqz-KE-bpKQ`.
- The pure modules (`clips.js`, `roster.js`, `game.js`, URL parsing) import
  cleanly into Node for quick assertions. There is no test suite in the repo yet.
