// sync.js — Yjs + WebRTC P2P sync for UNI Time
// Uses dynamic imports so this file can remain a regular (non-module) script.

const P2P_SIGNALLING = [
  'wss://signaling.yjs.dev',
  'wss://y-webrtc-signaling-eu.herokuapp.com',
  'wss://y-webrtc-signaling-us.herokuapp.com'
];

let _Y = null;
let _WebrtcProvider = null;
let _loaded = null;
let ydoc = null;
let provider = null;
let isApplyingRemote = false;
let _lastP2PStatus = 'off';
let _lastPeerCount = 0;

function ensureLibs() {
  if (_loaded) return _loaded;
  _loaded = (async () => {
    const Y = await import('https://esm.sh/yjs@13.6.21');
    const yw = await import('https://esm.sh/y-webrtc@10.3.0?deps=yjs@13.6.21,lib0@0.2.99');
    _Y = Y;
    _WebrtcProvider = yw.WebrtcProvider;
  })();
  return _loaded;
}

function hashPhrase(phrase) {
  let h = 0;
  for (let i = 0; i < phrase.length; i++) {
    h = ((h << 5) - h) + phrase.charCodeAt(i);
    h |= 0;
  }
  return 'uni-time-' + Math.abs(h).toString(36);
}

function getApp() {
  return window.UniApp || null;
}

function readStateFromYjs() {
  if (!ydoc) return null;
  const ygoals = ydoc.getMap('goals');
  const ysettings = ydoc.getMap('settings');
  const ydailyLog = ydoc.getMap('dailyLog');

  const goals = [];
  ygoals.forEach((yg, name) => {
    const subtasksRaw = yg.get('subtasks');
    goals.push({
      cat: yg.get('cat'),
      name: name,
      est: yg.get('est'),
      done: yg.get('done'),
      pinned: !!yg.get('pinned'),
      subtasks: subtasksRaw ? JSON.parse(subtasksRaw) : [],
      createdAt: yg.get('createdAt'),
      lastModified: yg.get('lastModified')
    });
  });

  const settings = {};
  ysettings.forEach((v, k) => { settings[k] = v; });

  const dailyLog = {};
  ydailyLog.forEach((v, k) => { dailyLog[k] = v; });

  return { goals, settings, dailyLog };
}

function setupObservers() {
  const ygoals = ydoc.getMap('goals');
  const ysettings = ydoc.getMap('settings');
  const ydailyLog = ydoc.getMap('dailyLog');

  function onRemoteChange() {
    if (isApplyingRemote) return;
    const merged = readStateFromYjs();
    if (!merged) return;
    window.dispatchEvent(new CustomEvent('yjs-remote-update', {
      detail: merged
    }));
  }

  ygoals.observe(onRemoteChange);
  ysettings.observe(onRemoteChange);
  ydailyLog.observe(onRemoteChange);

  // Status events from provider
  provider.on('synced', (event) => {
    const allPeers = provider ? provider.awareness.getStates().size : 0;
    const peers = Math.max(0, allPeers - 1); // exclude self
    const status = event.synced ? 'connected' : 'connecting';
    _lastP2PStatus = status;
    _lastPeerCount = peers;
    window.dispatchEvent(new CustomEvent('yjs-status', {
      detail: { status, peers }
    }));
  });

  // Fire initial status
  _lastP2PStatus = 'connecting';
  _lastPeerCount = 0;
  window.dispatchEvent(new CustomEvent('yjs-status', {
    detail: { status: 'connecting', peers: 0 }
  }));
}

async function _connect(phrase) {
  await ensureLibs();

  // Tear down any previous connection
  if (provider) { provider.destroy(); provider = null; }
  if (ydoc) { ydoc.destroy(); ydoc = null; }

  const roomId = hashPhrase(phrase);
  ydoc = new _Y.Doc();
  provider = new _WebrtcProvider(roomId, ydoc, {
    signaling: P2P_SIGNALLING,
    maxConns: 20 + Math.floor(Math.random() * 15),
    filterBcConns: true,
    peerOpts: {}
  });

  setupObservers();
}

async function initSync() {
  const phrase = localStorage.getItem('uni_p2p_phrase');
  if (!phrase) {
    window.dispatchEvent(new CustomEvent('yjs-status', {
      detail: { status: 'off', peers: 0 }
    }));
    return { status: 'off' };
  }
  await _connect(phrase);
  return { status: 'connecting', phrase };
}

function pushState(state) {
  if (!ydoc || !_Y) return;
  isApplyingRemote = true;

  try {
    ydoc.transact(() => {
      const ygoals = ydoc.getMap('goals');
      const ysettings = ydoc.getMap('settings');
      const ydailyLog = ydoc.getMap('dailyLog');

      // Goals
      const currentNames = new Set((state.goals || []).map(g => g.name));
      (state.goals || []).forEach(g => {
        let yg = ygoals.get(g.name);
        if (!yg) {
          yg = new _Y.Map();
          ygoals.set(g.name, yg);
        }
        yg.set('cat', g.cat);
        yg.set('est', g.est);
        yg.set('done', g.done);
        yg.set('pinned', !!g.pinned);
        yg.set('subtasks', JSON.stringify(g.subtasks || []));
        yg.set('createdAt', g.createdAt || new Date().toISOString());
        yg.set('lastModified', g.lastModified || new Date().toISOString());
      });
      ygoals.forEach((yg, name) => {
        if (!currentNames.has(name)) ygoals.delete(name);
      });

      // Settings
      Object.entries(state.settings || {}).forEach(([k, v]) => ysettings.set(k, v));

      // Daily log
      const logKeys = Object.keys(state.dailyLog || {});
      ydailyLog.forEach((v, k) => {
        if (!logKeys.includes(k)) ydailyLog.delete(k);
      });
      Object.entries(state.dailyLog || {}).forEach(([k, v]) => ydailyLog.set(k, v));
    });
  } catch (e) {
    console.error('Yjs pushState error:', e);
  }

  // Reset flag asynchronously so observe callbacks from remote don't get blocked
  setTimeout(() => {
    isApplyingRemote = false;
  }, 0);
}

async function createRoom(phrase) {
  if (!phrase || typeof phrase !== 'string') return;
  localStorage.setItem('uni_p2p_phrase', phrase);
  await _connect(phrase);
  // Creator pushes their local state so joiners receive it
  const app = getApp();
  if (app && app.state) {
    pushState(app.state);
  }
  return { status: 'connecting', phrase };
}

async function joinRoom(phrase) {
  if (!phrase || typeof phrase !== 'string') return;
  localStorage.setItem('uni_p2p_phrase', phrase);
  await _connect(phrase);
  // Joiner does NOT push local state — waits for remote data via observer
  return { status: 'connecting', phrase };
}

function leaveRoom() {
  if (provider) { provider.destroy(); provider = null; }
  if (ydoc) { ydoc.destroy(); ydoc = null; }
  localStorage.removeItem('uni_p2p_phrase');
  _lastP2PStatus = 'off';
  _lastPeerCount = 0;
  window.dispatchEvent(new CustomEvent('yjs-status', {
    detail: { status: 'off', peers: 0 }
  }));
}

function getPhrase() {
  return localStorage.getItem('uni_p2p_phrase');
}

function getStatus() {
  if (!provider || !ydoc) return { status: 'off', peers: 0 };
  return { status: _lastP2PStatus, peers: _lastPeerCount };
}

window.YjsSync = {
  init: initSync,
  pushState,
  createRoom,
  joinRoom,
  leaveRoom,
  getPhrase,
  getStatus,
  hashPhrase
};
