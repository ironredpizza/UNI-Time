// sync.js — MQTT-based real-time sync for UNI Time
// Uses a free public MQTT broker (no account required).

const MQTT_BROKER = 'wss://broker.hivemq.com:8884/mqtt';

let mqttClient = null;
let isApplyingRemote = false;
let _lastStatus = 'off';
let _lastPeers = 0;
let _heartbeatTimer = null;
let _knownPeers = new Map(); // clientId -> lastSeen timestamp
let _mqttLib = null;
let _loadPromise = null;

function hashPhrase(phrase) {
  let h = 0;
  for (let i = 0; i < phrase.length; i++) {
    h = ((h << 5) - h) + phrase.charCodeAt(i);
    h |= 0;
  }
  return 'uni-' + Math.abs(h).toString(36);
}

function getApp() {
  return window.UniApp || null;
}

async function ensureMqtt() {
  if (_mqttLib) return _mqttLib;
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    const mod = await import('https://esm.sh/mqtt/dist/mqtt.esm.js');
    _mqttLib = mod.default || mod;
    return _mqttLib;
  })();
  return _loadPromise;
}

function publishHeartbeat(topic, clientId) {
  if (!mqttClient || !mqttClient.connected) return;
  mqttClient.publish(topic, JSON.stringify({ clientId, t: Date.now() }), { qos: 0 });
}

function updatePeerCount() {
  const now = Date.now();
  for (const [id, lastSeen] of _knownPeers) {
    if (now - lastSeen > 45000) _knownPeers.delete(id);
  }
  _lastPeers = _knownPeers.size;
  window.dispatchEvent(new CustomEvent('yjs-status', {
    detail: { status: _lastStatus, peers: _lastPeers }
  }));
}

function publishState(topic, state) {
  if (!mqttClient || !mqttClient.connected) return;
  mqttClient.publish(topic, JSON.stringify(state), { qos: 0 });
}

function computeMergedState(remoteState) {
  const app = getApp();
  if (!app || !app.state) return null;

  const localState = app.state;
  const mergedGoals = [];

  const localGoalsMap = new Map((localState.goals || []).map(g => [g.name, g]));
  const remoteGoalsMap = new Map((remoteState.goals || []).map(g => [g.name, g]));
  const allNames = new Set([...localGoalsMap.keys(), ...remoteGoalsMap.keys()]);

  for (const name of allNames) {
    const local = localGoalsMap.get(name);
    const remote = remoteGoalsMap.get(name);
    if (!local) {
      mergedGoals.push(remote);
    } else if (!remote) {
      mergedGoals.push(local);
    } else {
      const localTime = new Date(local.lastModified || 0).getTime();
      const remoteTime = new Date(remote.lastModified || 0).getTime();
      mergedGoals.push(remoteTime > localTime ? remote : local);
    }
  }

  // Preserve original order where possible
  const localOrder = new Map((localState.goals || []).map((g, i) => [g.name, i]));
  mergedGoals.sort((a, b) => {
    const ai = localOrder.get(a.name) ?? 9999;
    const bi = localOrder.get(b.name) ?? 9999;
    return ai - bi;
  });

  const mergedSettings = remoteState.settings || localState.settings;

  const mergedDailyLog = { ...localState.dailyLog };
  if (remoteState.dailyLog) {
    for (const [date, hours] of Object.entries(remoteState.dailyLog)) {
      mergedDailyLog[date] = Math.max(mergedDailyLog[date] || 0, hours);
    }
  }

  return {
    goals: mergedGoals,
    settings: mergedSettings,
    dailyLog: mergedDailyLog
  };
}

function applyRemoteUpdate(merged) {
  isApplyingRemote = true;
  window.dispatchEvent(new CustomEvent('yjs-remote-update', {
    detail: merged
  }));
  requestAnimationFrame(() => {
    isApplyingRemote = false;
  });
}

async function _connect(phrase, isCreator) {
  const mqtt = await ensureMqtt();

  if (mqttClient) {
    mqttClient.end();
    mqttClient = null;
  }
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }
  _knownPeers.clear();

  const roomId = hashPhrase(phrase);
  const topic = `uni-time/${roomId}`;
  const heartbeatTopic = `uni-time/${roomId}/hb`;
  const clientId = `uni-${Math.random().toString(36).substr(2, 8)}`;

  mqttClient = mqtt.connect(MQTT_BROKER, {
    clientId,
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
  });

  mqttClient.on('connect', () => {
    mqttClient.subscribe(topic);
    mqttClient.subscribe(heartbeatTopic);

    publishHeartbeat(heartbeatTopic, clientId);
    _heartbeatTimer = setInterval(() => publishHeartbeat(heartbeatTopic, clientId), 15000);

    if (isCreator) {
      const app = getApp();
      if (app && app.state) {
        publishState(topic, app.state);
      }
    }

    _lastStatus = 'connected';
    updatePeerCount();
  });

  mqttClient.on('message', (rcvTopic, payload) => {
    if (rcvTopic === heartbeatTopic) {
      try {
        const data = JSON.parse(payload.toString());
        if (data.clientId && data.clientId !== clientId) {
          _knownPeers.set(data.clientId, Date.now());
          updatePeerCount();
        }
      } catch (e) {}
      return;
    }

    if (rcvTopic !== topic) return;
    if (isApplyingRemote) return;

    try {
      const remoteState = JSON.parse(payload.toString());
      const merged = computeMergedState(remoteState);
      if (merged) applyRemoteUpdate(merged);
    } catch (e) {
      console.error('Failed to parse remote state:', e);
    }
  });

  mqttClient.on('error', (err) => {
    console.error('MQTT error:', err);
    _lastStatus = 'error';
    window.dispatchEvent(new CustomEvent('yjs-status', {
      detail: { status: 'error', peers: _lastPeers }
    }));
  });

  mqttClient.on('close', () => {
    _lastStatus = 'connecting';
    if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
    window.dispatchEvent(new CustomEvent('yjs-status', {
      detail: { status: 'connecting', peers: 0 }
    }));
  });

  _lastStatus = 'connecting';
  window.dispatchEvent(new CustomEvent('yjs-status', {
    detail: { status: 'connecting', peers: 0 }
  }));
}

function initSync() {
  const phrase = localStorage.getItem('uni_p2p_phrase');
  if (!phrase) {
    window.dispatchEvent(new CustomEvent('yjs-status', {
      detail: { status: 'off', peers: 0 }
    }));
    return { status: 'off' };
  }
  _connect(phrase, false);
  return { status: 'connecting', phrase };
}

function pushState(state) {
  if (isApplyingRemote) return;
  const phrase = localStorage.getItem('uni_p2p_phrase');
  if (!phrase || !mqttClient) return;
  const roomId = hashPhrase(phrase);
  const topic = `uni-time/${roomId}`;
  publishState(topic, state);
}

async function createRoom(phrase) {
  if (!phrase || typeof phrase !== 'string') return;
  localStorage.setItem('uni_p2p_phrase', phrase);
  await _connect(phrase, true);
  return { status: 'connecting', phrase };
}

async function joinRoom(phrase) {
  if (!phrase || typeof phrase !== 'string') return;
  localStorage.setItem('uni_p2p_phrase', phrase);
  await _connect(phrase, false);
  return { status: 'connecting', phrase };
}

function leaveRoom() {
  if (mqttClient) { mqttClient.end(); mqttClient = null; }
  if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
  _knownPeers.clear();
  localStorage.removeItem('uni_p2p_phrase');
  _lastStatus = 'off';
  _lastPeers = 0;
  window.dispatchEvent(new CustomEvent('yjs-status', {
    detail: { status: 'off', peers: 0 }
  }));
}

function getPhrase() {
  return localStorage.getItem('uni_p2p_phrase');
}

function getStatus() {
  return { status: _lastStatus, peers: _lastPeers };
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
