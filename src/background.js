// ===== Background Service Worker =====
// Обрабатывает авторизацию и взаимодействие с Last.fm API

'use strict';

const LASTFM_API_URL = 'https://ws.audioscrobbler.com/2.0/';
const LASTFM_API_KEY = 'fd4031814b8517b9525a9f3d43150b55';
const LASTFM_API_SECRET = 'a3fe183853e9c3138d9208d15d74002f';

// ===== MD5 (нужен для подписи запросов Last.fm) =====
function md5(str) {
  function safeAdd(x, y) {
    const lsw = (x & 0xffff) + (y & 0xffff);
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xffff);
  }
  function bitRotateLeft(num, cnt) {
    return (num << cnt) | (num >>> (32 - cnt));
  }
  function md5cmn(q, a, b, x, s, t) {
    return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  }
  function md5ff(a, b, c, d, x, s, t) { return md5cmn((b & c) | (~b & d), a, b, x, s, t); }
  function md5gg(a, b, c, d, x, s, t) { return md5cmn((b & d) | (c & ~d), a, b, x, s, t); }
  function md5hh(a, b, c, d, x, s, t) { return md5cmn(b ^ c ^ d, a, b, x, s, t); }
  function md5ii(a, b, c, d, x, s, t) { return md5cmn(c ^ (b | ~d), a, b, x, s, t); }

  function md5blks(s) {
    const md5blksize = 64;
    const md5blks = [];
    for (let i = 0; i < md5blksize * Math.ceil(s.length / md5blksize); i += 4) {
      md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
    }
    md5blks[s.length >> 2] |= 0x80 << (s.length % 4 * 8);
    md5blks[(((s.length + 8) >> 6) << 4) + 14] = s.length * 8;
    return md5blks;
  }

  str = unescape(encodeURIComponent(str));
  const blks = md5blks(str);
  let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;

  for (let i = 0; i < blks.length; i += 16) {
    const olda = a, oldb = b, oldc = c, oldd = d;
    a = md5ff(a,b,c,d,blks[i+0],7,-680876936); d=md5ff(d,a,b,c,blks[i+1],12,-389564586); c=md5ff(c,d,a,b,blks[i+2],17,606105819); b=md5ff(b,c,d,a,blks[i+3],22,-1044525330);
    a = md5ff(a,b,c,d,blks[i+4],7,-176418897); d=md5ff(d,a,b,c,blks[i+5],12,1200080426); c=md5ff(c,d,a,b,blks[i+6],17,-1473231341); b=md5ff(b,c,d,a,blks[i+7],22,-45705983);
    a = md5ff(a,b,c,d,blks[i+8],7,1770035416); d=md5ff(d,a,b,c,blks[i+9],12,-1958414417); c=md5ff(c,d,a,b,blks[i+10],17,-42063); b=md5ff(b,c,d,a,blks[i+11],22,-1990404162);
    a = md5ff(a,b,c,d,blks[i+12],7,1804603682); d=md5ff(d,a,b,c,blks[i+13],12,-40341101); c=md5ff(c,d,a,b,blks[i+14],17,-1502002290); b=md5ff(b,c,d,a,blks[i+15],22,1236535329);
    a = md5gg(a,b,c,d,blks[i+1],5,-165796510); d=md5gg(d,a,b,c,blks[i+6],9,-1069501632); c=md5gg(c,d,a,b,blks[i+11],14,643717713); b=md5gg(b,c,d,a,blks[i+0],20,-373897302);
    a = md5gg(a,b,c,d,blks[i+5],5,-701558691); d=md5gg(d,a,b,c,blks[i+10],9,38016083); c=md5gg(c,d,a,b,blks[i+15],14,-660478335); b=md5gg(b,c,d,a,blks[i+4],20,-405537848);
    a = md5gg(a,b,c,d,blks[i+9],5,568446438); d=md5gg(d,a,b,c,blks[i+14],9,-1019803690); c=md5gg(c,d,a,b,blks[i+3],14,-187363961); b=md5gg(b,c,d,a,blks[i+8],20,1163531501);
    a = md5gg(a,b,c,d,blks[i+13],5,-1444681467); d=md5gg(d,a,b,c,blks[i+2],9,-51403784); c=md5gg(c,d,a,b,blks[i+7],14,1735328473); b=md5gg(b,c,d,a,blks[i+12],20,-1926607734);
    a = md5hh(a,b,c,d,blks[i+5],4,-378558); d=md5hh(d,a,b,c,blks[i+8],11,-2022574463); c=md5hh(c,d,a,b,blks[i+11],16,1839030562); b=md5hh(b,c,d,a,blks[i+14],23,-35309556);
    a = md5hh(a,b,c,d,blks[i+1],4,-1530992060); d=md5hh(d,a,b,c,blks[i+4],11,1272893353); c=md5hh(c,d,a,b,blks[i+7],16,-155497632); b=md5hh(b,c,d,a,blks[i+10],23,-1094730640);
    a = md5hh(a,b,c,d,blks[i+13],4,681279174); d=md5hh(d,a,b,c,blks[i+0],11,-358537222); c=md5hh(c,d,a,b,blks[i+3],16,-722521979); b=md5hh(b,c,d,a,blks[i+6],23,76029189);
    a = md5hh(a,b,c,d,blks[i+9],4,-640364487); d=md5hh(d,a,b,c,blks[i+12],11,-421815835); c=md5hh(c,d,a,b,blks[i+15],16,530742520); b=md5hh(b,c,d,a,blks[i+2],23,-995338651);
    a = md5ii(a,b,c,d,blks[i+0],6,-198630844); d=md5ii(d,a,b,c,blks[i+7],10,1126891415); c=md5ii(c,d,a,b,blks[i+14],15,-1416354905); b=md5ii(b,c,d,a,blks[i+5],21,-57434055);
    a = md5ii(a,b,c,d,blks[i+12],6,1700485571); d=md5ii(d,a,b,c,blks[i+3],10,-1894986606); c=md5ii(c,d,a,b,blks[i+10],15,-1051523); b=md5ii(b,c,d,a,blks[i+1],21,-2054922799);
    a = md5ii(a,b,c,d,blks[i+8],6,1873313359); d=md5ii(d,a,b,c,blks[i+15],10,-30611744); c=md5ii(c,d,a,b,blks[i+6],15,-1560198380); b=md5ii(b,c,d,a,blks[i+13],21,1309151649);
    a = md5ii(a,b,c,d,blks[i+4],6,-145523070); d=md5ii(d,a,b,c,blks[i+11],10,-1120210379); c=md5ii(c,d,a,b,blks[i+2],15,718787259); b=md5ii(b,c,d,a,blks[i+9],21,-343485551);
    a=safeAdd(a,olda); b=safeAdd(b,oldb); c=safeAdd(c,oldc); d=safeAdd(d,oldd);
  }

  const hex = [];
  const hexChars = '0123456789abcdef';
  for (const n of [a, b, c, d]) {
    for (let i = 0; i < 4; i++) {
      const byte = (n >> (i * 8)) & 0xff;
      hex.push(hexChars[(byte >> 4) & 0xf] + hexChars[byte & 0xf]);
    }
  }
  return hex.join('');
}

// ===== Last.fm API =====
class LastFmAPI {
  constructor(apiKey, apiSecret, sessionKey) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.sessionKey = sessionKey;
  }

  sign(params) {
    const sorted = Object.keys(params).sort();
    let str = '';
    for (const key of sorted) {
      str += key + params[key];
    }
    str += this.apiSecret;
    return md5(str);
  }

  async call(method, params = {}, post = false) {
    const allParams = {
      method,
      api_key: this.apiKey,
      ...params,
    };

    if (this.sessionKey) {
      allParams.sk = this.sessionKey;
    }

    allParams.api_sig = this.sign(allParams);
    allParams.format = 'json';

    const safeJson = async (resp) => {
      const text = await resp.text();
      try {
        return JSON.parse(text);
      } catch (e) {
        console.warn('[BG] Last.fm вернул не JSON:', text.slice(0, 100));
        return { error: 'invalid_response', message: text.slice(0, 100) };
      }
    };

    if (post) {
      const body = new URLSearchParams(allParams);
      const resp = await fetch(LASTFM_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      return safeJson(resp);
    } else {
      const url = new URL(LASTFM_API_URL);
      for (const [k, v] of Object.entries(allParams)) {
        url.searchParams.set(k, v);
      }
      const resp = await fetch(url.toString());
      return safeJson(resp);
    }
  }

  async getToken() {
    const data = await this.call('auth.getToken');
    return data.token;
  }

  async getSession(token) {
    const data = await this.call('auth.getSession', { token });
    if (data.session) {
      return data.session;
    }
    throw new Error(data.message || 'Auth error');
  }

  async updateNowPlaying(track) {
    return this.call('track.updateNowPlaying', {
      artist: track.artist,
      track: track.title,
      duration: track.duration || '',
    }, true);
  }

  async scrobble(track) {
    return this.call('track.scrobble', {
      artist: track.artist,
      track: track.title,
      timestamp: track.timestamp,
      duration: track.duration || '',
    }, true);
  }

  async getRecentTracks(username, limit = 10) {
    return this.call('user.getRecentTracks', { user: username, limit });
  }
}

// ===== Состояние =====
let api = null;
let settings = {};
let scrobbleLog = [];
const MAX_LOG = 50;

async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['apiKey', 'apiSecret', 'sessionKey', 'username', 'scrobbleLog', 'enabled'], (data) => {
      settings = data;
      scrobbleLog = data.scrobbleLog || [];
      if (data.apiKey && data.apiSecret && data.sessionKey) {
        api = new LastFmAPI(data.apiKey, data.apiSecret, data.sessionKey);
      }
      resolve(settings);
    });
  });
}

function saveSettings(updates) {
  return new Promise((resolve) => {
    chrome.storage.local.set(updates, resolve);
  });
}

function addToLog(entry) {
  scrobbleLog.unshift({ ...entry, time: Date.now() });
  if (scrobbleLog.length > MAX_LOG) scrobbleLog = scrobbleLog.slice(0, MAX_LOG);
  chrome.storage.local.set({ scrobbleLog });
}

// ===== Обработка сообщений =====
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse).catch((err) => {
    sendResponse({ error: err.message });
  });
  return true; // async
});

async function handleMessage(msg, sender) {
  await loadSettings();

  switch (msg.type) {
    case 'NOW_PLAYING': {
      if (!api || settings.enabled === false) return { ok: false };
      try {
        await api.updateNowPlaying(msg.track);
        console.log('[BG] Now playing:', msg.track.artist, '—', msg.track.title);
        return { ok: true };
      } catch (e) {
        console.error('[BG] Now playing error:', e);
        return { ok: false, error: e.message };
      }
    }

    case 'SCROBBLE': {
      if (!api || settings.enabled === false) return { ok: false };
      try {
        const result = await api.scrobble(msg.track);
        if (result.scrobbles?.['@attr']?.accepted === '1' || result.scrobbles?.['@attr']?.accepted === 1) {
          addToLog({ ...msg.track, status: 'ok' });
          console.log('[BG] Scrobbled:', msg.track.artist, '—', msg.track.title);
          return { ok: true };
        } else {
          const errMsg = result.message || JSON.stringify(result);
          addToLog({ ...msg.track, status: 'error', error: errMsg });
          return { ok: false, error: errMsg };
        }
      } catch (e) {
        addToLog({ ...msg.track, status: 'error', error: e.message });
        return { ok: false, error: e.message };
      }
    }

    case 'AUTH_GET_TOKEN': {
      const tempApi = new LastFmAPI(LASTFM_API_KEY, LASTFM_API_SECRET, null);
      const token = await tempApi.getToken();
      await saveSettings({ pendingToken: token, apiKey: LASTFM_API_KEY, apiSecret: LASTFM_API_SECRET });
      api = tempApi;
      const authUrl = `https://www.last.fm/api/auth/?api_key=${LASTFM_API_KEY}&token=${token}`;
      return { token, authUrl };
    }

    case 'AUTH_GET_SESSION': {
      // Читаем напрямую из storage, не из кэша
      const fresh = await new Promise(r => chrome.storage.local.get(
        ['pendingToken', 'apiKey', 'apiSecret'], r
      ));
      if (!fresh.pendingToken) return { error: 'Нет токена' };
      if (!fresh.apiKey || !fresh.apiSecret) return { error: 'Нет ключей API' };
      const tempApi = new LastFmAPI(fresh.apiKey, fresh.apiSecret, null);
      const session = await tempApi.getSession(fresh.pendingToken);
      await saveSettings({
        sessionKey: session.key,
        username: session.name,
        pendingToken: null,
      });
      api = new LastFmAPI(fresh.apiKey, fresh.apiSecret, session.key);
      return { ok: true, username: session.name };
    }

    case 'GET_STATUS': {
      // Читаем напрямую из storage для актуальных данных
      const freshStatus = await new Promise(r => chrome.storage.local.get(
        ['sessionKey', 'username', 'pendingToken', 'enabled'], r
      ));
      return {
        authenticated: !!(freshStatus.sessionKey),
        pendingToken: !!(freshStatus.pendingToken),
        username: freshStatus.username || null,
        enabled: freshStatus.enabled !== false,
        scrobbleLog: scrobbleLog.slice(0, 20),
      };
    }

    case 'SET_ENABLED': {
      await saveSettings({ enabled: msg.enabled });
      return { ok: true };
    }

    case 'LOGOUT': {
      await saveSettings({ sessionKey: null, username: null, pendingToken: null });
      api = null;
      return { ok: true };
    }

    default:
      return { error: 'Unknown message type' };
  }
}

// Загружаем настройки при старте
loadSettings().then(() => {
  console.log('[BG] Scrobbler background ready. Authenticated:', !!settings.sessionKey);
});
