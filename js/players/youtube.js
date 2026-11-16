// YouTube player adapter.
//
// Player adapter interface (a local-file adapter must expose the same):
//   load(id, startSeconds)  cue a video
//   play() / pause()
//   seek(seconds)
//   getTime() -> seconds      getDuration() -> seconds, 0 if unknown
//   setRate(rate)           getRates() -> speeds this video allows
//   setMuted(bool) / isMuted()
//   isReady() / isPlaying()
//   onTime(cb)   cb(seconds) about every 200 ms while a video is loaded
//   onError(cb)  cb(message)
//
// Clip end enforcement is NOT done here. The app watches onTime and pauses at the
// clip end itself, because YouTube's endSeconds stops applying after any seekTo.

const TICK_MS = 200;

// Returns { id, t } or null. Handles watch?v=, youtu.be/, /live/, /embed/, /shorts/
// and links carrying t= or start=.
export function parseYouTubeUrl(input) {
  const text = String(input || '').trim();
  if (!text) return null;
  if (/^[\w-]{11}$/.test(text)) return { id: text, t: 0 };

  let url;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : 'https://' + text);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let id = null;
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1];
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch') id = url.searchParams.get('v');
    else if (['live', 'embed', 'shorts', 'v'].includes(parts[0])) id = parts[1];
  }
  if (!id || !/^[\w-]{11}$/.test(id)) return null;

  const raw = url.searchParams.get('t') || url.searchParams.get('start') || '';
  return { id, t: parseStartParam(raw) };
}

// A still from the video, for game cards.
export function thumbnailUrl(id) {
  return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/mqdefault.jpg`;
}

// "123", "123s", "2m3s", "1h2m3s"
function parseStartParam(raw) {
  if (!raw) return 0;
  if (/^\d+s?$/.test(raw)) return parseInt(raw, 10);
  const m = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m) return 0;
  return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
}

let apiPromise = null;
function loadApi() {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) return resolve(window.YT);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (previous) previous();
      resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
  });
  return apiPromise;
}

const ERRORS = {
  2: 'That video link is not valid.',
  5: 'This video cannot be played in the browser.',
  100: 'Video not found. If it is Private, ask the owner to make it Unlisted.',
  101: 'The owner has turned off embedding for this video. Ask them to turn on "Allow embedding".',
  150: 'The owner has turned off embedding for this video. Ask them to turn on "Allow embedding".',
};

export function createYouTubePlayer(mount) {
  let yt = null;
  let ready = false;
  let creating = false;
  let pending = null;
  let loaded = false;
  const timeListeners = new Set();
  const errorListeners = new Set();

  setInterval(() => {
    if (!ready || !loaded) return;
    const t = api.getTime();
    timeListeners.forEach((cb) => cb(t));
  }, TICK_MS);

  function cue({ id, startSeconds }) {
    yt.cueVideoById({ videoId: id, startSeconds: Math.max(0, Math.floor(startSeconds || 0)) });
    loaded = true;
  }

  const api = {
    async load(id, startSeconds = 0) {
      pending = { id, startSeconds };
      if (ready) return cue(pending);
      if (creating) return;
      creating = true;
      const YT = await loadApi();
      const el = document.createElement('div');
      mount.replaceChildren(el);
      yt = new YT.Player(el, {
        width: '100%',
        height: '100%',
        playerVars: { playsinline: 1, rel: 0 },
        events: {
          onReady: () => {
            ready = true;
            cue(pending);
          },
          onError: (e) => {
            const msg = ERRORS[e.data] || 'The video could not be loaded.';
            errorListeners.forEach((cb) => cb(msg));
          },
        },
      });
    },
    play() { if (ready) yt.playVideo(); },
    pause() { if (ready) yt.pauseVideo(); },
    seek(seconds) { if (ready) yt.seekTo(Math.max(0, seconds), true); },
    getTime() { return ready && yt.getCurrentTime ? yt.getCurrentTime() || 0 : 0; },
    getDuration() { return ready && yt.getDuration ? yt.getDuration() || 0 : 0; },
    setRate(rate) { if (ready) yt.setPlaybackRate(rate); },
    getRates() { return ready && yt.getAvailablePlaybackRates ? yt.getAvailablePlaybackRates() || [] : []; },
    // iPads and iPhones have no volume slider in the YouTube player (iOS only lets
    // the hardware buttons set the volume), so the app offers its own mute button.
    setMuted(on) { if (ready) { if (on) yt.mute(); else yt.unMute(); } },
    isMuted() { return ready && yt.isMuted ? yt.isMuted() : false; },
    isReady() { return ready && loaded; },
    isPlaying() {
      if (!ready) return false;
      const s = yt.getPlayerState();
      return s === 1 || s === 3; // playing or buffering
    },
    onTime(cb) { timeListeners.add(cb); },
    onError(cb) { errorListeners.add(cb); },
  };
  return api;
}
