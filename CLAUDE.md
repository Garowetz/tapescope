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
- Tabs are **Review** (watch and clip, `data-tab="clip"`) and **Clips** (edit,
  `data-tab="trim"`). The internal ids kept the old names; the labels are what the
  owner chose.
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

Phase 1 (clip, trim, save/share) and Phase 2 (presentation mode) are built. Next in
`PLAN.md` is Phase 3, drawing on a paused clip.

## Running and testing

- Serve locally: `python -m http.server 8123` (launch config "tapescope" in
  `.claude/launch.json`). ES modules don't load from `file://`.
- A public embeddable test video: YouTube ID `aqz-KE-bpKQ`.
- The pure modules (`clips.js`, `roster.js`, `game.js`, URL parsing) import
  cleanly into Node for quick assertions. There is no test suite in the repo yet.
