'use strict';

// ===== Утилиты =====
function $(id) { return document.getElementById(id); }

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(`screen${name}`).classList.add('active');
}

function showError(id, msg) {
  const el = $(id);
  el.textContent = msg;
  el.classList.add('visible');
}

function hideError(id) {
  $(id).classList.remove('visible');
}

function timeAgo(ms) {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return 'только что';
  if (sec < 3600) return `${Math.floor(sec/60)} мин назад`;
  if (sec < 86400) return `${Math.floor(sec/3600)} ч назад`;
  return `${Math.floor(sec/86400)} д назад`;
}

function sendBg(msg) {
  return chrome.runtime.sendMessage(msg);
}

// ===== Отображение текущего трека =====
function updateNowPlaying(track, playing) {
  const np = $('nowPlaying');
  if (track && playing) {
    $('npTitle').textContent = track.title || '—';
    $('npArtist').textContent = track.artist || '—';
    np.classList.add('visible');
  } else {
    np.classList.remove('visible');
  }
}

// ===== Лог скроблов =====
function renderLog(log) {
  const list = $('logList');
  const empty = $('logEmpty');
  const count = $('logCount');

  count.textContent = log.length;

  if (!log || log.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = log.map(entry => `
    <li class="log-item">
      <div class="log-status ${entry.status === 'ok' ? 'ok' : 'error'}"></div>
      <div class="log-track">
        <div class="log-track-name">${escHtml(entry.title || '—')}</div>
        <div class="log-track-artist">${escHtml(entry.artist || '—')}</div>
      </div>
      <div class="log-time">${timeAgo(entry.time)}</div>
    </li>
  `).join('');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ===== Опрос текущего трека =====
function pollCurrentTrack() {
  chrome.tabs.query({ url: ['https://music.yandex.ru/*', 'https://music.yandex.com/*', 'https://music.yandex.kz/*', 'https://music.yandex.by/*', 'https://music.yandex.uz/*'] }, (tabs) => {
    if (tabs.length === 0) return;
    chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_CURRENT_TRACK' }, (resp) => {
      if (chrome.runtime.lastError || !resp) return;
      updateNowPlaying(resp.track, resp.playing);
    });
  });
}

// ===== Инициализация =====
async function init() {
  const status = await sendBg({ type: 'GET_STATUS' });

  if (!status.authenticated) {
    // Если есть pendingToken — показываем экран ожидания авторизации
    if (status.pendingToken) {
      showScreen('Auth');
      $('toggleWrap').style.display = 'none';
      return;
    }
    showScreen('Setup');
    $('toggleWrap').style.display = 'none';
    return;
  }

  // Авторизован — главный экран
  showScreen('Main');
  $('toggleWrap').style.display = 'flex';
  $('enableToggle').checked = status.enabled !== false;

  const name = status.username || 'Unknown';
  $('userName').textContent = name;
  $('userAvatar').textContent = name[0].toUpperCase();

  renderLog(status.scrobbleLog || []);

  // Опрашиваем текущий трек
  pollCurrentTrack();
  setInterval(pollCurrentTrack, 3000);
}

// ===== События =====

// Шаг 1: получить токен
$('btnGetToken').addEventListener('click', async () => {
  hideError('setupError');
  $('btnGetToken').disabled = true;
  $('btnGetToken').textContent = 'Подключаемся...';

  try {
    const result = await sendBg({ type: 'AUTH_GET_TOKEN' });
    if (result.error) throw new Error(result.error);
    chrome.tabs.create({ url: result.authUrl });
    showScreen('Auth');
  } catch (e) {
    showError('setupError', `Ошибка: ${e.message}`);
  } finally {
    $('btnGetToken').disabled = false;
    $('btnGetToken').textContent = 'Войти через Last.fm →';
  }
});

// Шаг 2: получить сессию
$('btnGetSession').addEventListener('click', async () => {
  hideError('authError');
  $('btnGetSession').disabled = true;
  $('btnGetSession').textContent = 'Проверяем...';

  try {
    const result = await sendBg({ type: 'AUTH_GET_SESSION' });
    if (result.error) throw new Error(result.error);
    await init();
  } catch (e) {
    showError('authError', `Ошибка авторизации: ${e.message}. Убедитесь, что разрешили доступ на Last.fm.`);
  } finally {
    $('btnGetSession').disabled = false;
    $('btnGetSession').textContent = 'Я разрешил доступ ✓';
  }
});

$('btnBackToSetup').addEventListener('click', () => showScreen('Setup'));

// Включение/выключение
$('enableToggle').addEventListener('change', (e) => {
  sendBg({ type: 'SET_ENABLED', enabled: e.target.checked });
});

// Выход
$('btnLogout').addEventListener('click', async () => {
  if (confirm('Выйти из Last.fm аккаунта?')) {
    await sendBg({ type: 'LOGOUT' });
    $('nowPlaying').classList.remove('visible');
    showScreen('Setup');
    $('toggleWrap').style.display = 'none';
  }
});

// Обновляем лог каждые 10 секунд
setInterval(async () => {
  const status = await sendBg({ type: 'GET_STATUS' });
  if (status.authenticated) renderLog(status.scrobbleLog || []);
}, 10000);

// Запуск
init();
