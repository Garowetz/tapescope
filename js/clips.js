// All clip-timing rules live here: default window, clamping, trimming, time text.
// Nothing else in the app should do arithmetic on clip times.

export const BEFORE_OPTIONS = [15, 30, 60];
export const AFTER_OPTIONS = [10, 20, 30];
export const DEFAULT_SETTINGS = { before: 30, after: 10 };
export const NUDGE_STEPS = [-5, -1, 1, 5];
export const MIN_LENGTH = 1; // seconds; a clip can never be shorter than this
export const END_PREVIEW = 3; // seconds replayed before the end after an end change

export const CATEGORIES = [
  { id: '', label: 'Untagged' },
  { id: 'good', label: 'Good' },
  { id: 'needs-work', label: 'Needs work' },
  { id: 'teaching', label: 'Teaching point' },
];

export function categoryLabel(id) {
  const c = CATEGORIES.find((x) => x.id === id);
  return c ? c.label : 'Untagged';
}

export function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS };
  if (raw && Number.isFinite(+raw.before) && +raw.before >= 0) s.before = +raw.before;
  if (raw && Number.isFinite(+raw.after) && +raw.after >= 0) s.after = +raw.after;
  return s;
}

// duration <= 0 means "unknown" (not loaded yet, or a live stream): no upper bound.
export function clampWindow(start, end, duration) {
  const max = duration > 0 ? Math.floor(duration) : Infinity;
  let s = Math.round(start);
  let e = Math.round(end);
  s = Math.max(0, Math.min(s, max - MIN_LENGTH));
  e = Math.min(max, Math.max(e, s + MIN_LENGTH));
  return [s, e];
}

function clampMark(t, duration) {
  const max = duration > 0 ? Math.floor(duration) : Infinity;
  return Math.max(0, Math.min(Math.round(t), max));
}

let counter = 0;
function newId() {
  counter += 1;
  return 'c' + Date.now().toString(36) + counter.toString(36);
}

export function createClip(markTime, settings, duration, category = '') {
  const mark = clampMark(markTime, duration);
  const [start, end] = clampWindow(mark - settings.before, mark + settings.after, duration);
  return {
    id: newId(),
    mark,
    start,
    end,
    title: '',
    category,
    players: [],
    notes: '',
    drawings: [],
  };
}

export function resetWindow(clip, settings, duration) {
  [clip.start, clip.end] = clampWindow(clip.mark - settings.before, clip.mark + settings.after, duration);
}

// Moving one edge never moves the other: the edge stops MIN_LENGTH short of it.
export function setStart(clip, t, duration) {
  const s = Math.min(Math.round(t), clip.end - MIN_LENGTH);
  [clip.start, clip.end] = clampWindow(s, clip.end, duration);
}

export function setEnd(clip, t, duration) {
  const e = Math.max(Math.round(t), clip.start + MIN_LENGTH);
  [clip.start, clip.end] = clampWindow(clip.start, e, duration);
}

export function formatTime(seconds) {
  const t = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// Accepts "754", "12:34" or "1:02:15". Returns seconds, or null if it can't be read.
export function parseTime(text) {
  const parts = String(text).trim().split(':');
  if (parts.length < 1 || parts.length > 3) return null;
  let total = 0;
  for (const p of parts) {
    if (!/^\d+(\.\d+)?$/.test(p.trim())) return null;
    total = total * 60 + parseFloat(p);
  }
  return total;
}
