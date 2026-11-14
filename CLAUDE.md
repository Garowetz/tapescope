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

## Status

Phase 1 (Clip it, Trim, save/share) is built. Next is Phase 2, presentation mode.

## Running and testing

- Serve locally: `python -m http.server 8123` (launch config "tapescope" in
  `.claude/launch.json`). ES modules don't load from `file://`.
- A public embeddable test video: YouTube ID `aqz-KE-bpKQ`.
- The pure modules (`clips.js`, `roster.js`, `game.js`, URL parsing) import
  cleanly into Node for quick assertions. There is no test suite in the repo yet.
