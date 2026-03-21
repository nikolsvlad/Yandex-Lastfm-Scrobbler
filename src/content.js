// ===== Яндекс Музыка → Last.fm Content Script =====
// Отслеживает текущий трек и отправляет данные в background

(function () {
  'use strict';

  let currentTrack = null;
  let trackStartTime = null;
  let scrobbleTimer = null;
  let nowPlayingTimer = null;
  let observer = null;

  // Селекторы для поиска элементов плеера Яндекс Музыки
  const SELECTORS = {
    // Название трека
    trackTitle: [
      '[class*="Meta_title__"]',
      '[class*="Meta_title_"]',
      '[class*="PlayerBarTitle"]',
      '[class*="TrackTitle"]',
      '.track__title',
      '.d-track__title',
      '[data-test="track-title"]',
    ],
    // Исполнитель
    trackArtist: [
      '[class*="Meta_artistCaption"]',
      '[class*="Meta_artist"]',
      '[class*="PlayerBarArtists"]',
      '[class*="TrackArtists"]',
      '.track__artists',
      '.d-track__artists',
      '[data-test="track-artists"]',
    ],
    // Кнопка play/pause
    playButton: [
      '[class*="BaseSonataControls"]',
      '[class*="SonataControls"]',
      '[class*="PlayerControls__play"]',
      '[class*="play-pause"]',
      'button[class*="Play"]',
      '[aria-label*="пауз"]',
      '[aria-label*="pause"]',
      '[aria-label*="play"]',
      '[aria-label*="воспр"]',
    ],
    // Текущее время
    currentTime: [
      '[class*="CurrentTime"]',
      '[class*="Progress__current"]',
      '.progress__time-current',
    ],
    // Длительность
    duration: [
      '[class*="TotalTime"]',
      '[class*="Duration"]',
      '[class*="Progress__left"]',
      '.progress__time-left',
    ],
  };

  // Корневой элемент плеера — ищем только внутри него
  function getPlayerBar() {
    return document.querySelector('[class*="PlayerBar_root"], [class*="PlayerBarDesktop"]');
  }

  function querySelector(selectors) {
    const player = getPlayerBar();
    for (const sel of selectors) {
      try {
        // Сначала ищем внутри плеера
        if (player) {
          const el = player.querySelector(sel);
          if (el) return el;
        }
        // Fallback — по всей странице
        const el = document.querySelector(sel);
        if (el) return el;
      } catch (e) {}
    }
    return null;
  }

  function getTextContent(selectors) {
    const player = getPlayerBar();
    for (const sel of selectors) {
      try {
        if (player) {
          const el = player.querySelector(sel);
          if (el) return el.textContent.trim();
        }
      } catch (e) {}
    }
    // Fallback
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) return el.textContent.trim();
      } catch (e) {}
    }
    return null;
  }

  function isPlaying() {
    // 1. Самый надёжный способ — проверить audio элемент
    const audios = document.querySelectorAll('audio');
    for (const audio of audios) {
      if (!audio.paused && !audio.ended && audio.currentTime > 0) {
        return true;
      }
    }

    // 2. Проверяем кнопку паузы (если она видна — значит играет)
    const pauseSelectors = [
      '[class*="PlayerBar"] [aria-label*="пауз"]',
      '[class*="PlayerBar"] [aria-label*="Pause"]',
      '[class*="SonataControls"] [aria-label*="пауз"]',
      '[class*="SonataControls"] [aria-label*="Pause"]',
    ];
    for (const sel of pauseSelectors) {
      try {
        if (document.querySelector(sel)) return true;
      } catch(e) {}
    }

    // 3. Ищем SVG/иконку паузы внутри плеера
    const playerBar = document.querySelector('[class*="PlayerBar_root"]');
    if (playerBar) {
      const btns = playerBar.querySelectorAll('button');
      for (const btn of btns) {
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        if (label.includes('пауз') || label.includes('pause')) return true;
      }
    }

    return false;
  }

  function parseTime(str) {
    if (!str) return 0;
    const parts = str.replace(/[^0-9:]/g, '').split(':');
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }
    return 0;
  }

  function getCurrentTrackInfo() {
    const title = getTextContent(SELECTORS.trackTitle);
    const artist = getTextContent(SELECTORS.trackArtist);

    if (!title || !artist) return null;

    // Чистим текст исполнителя (может содержать несколько через запятую)
    const cleanArtist = artist.split(',')[0].trim();

    let duration = 0;

    // Способ 1: берём длительность из audio элемента (самый надёжный)
    const audios = document.querySelectorAll('audio');
    for (const audio of audios) {
      if (audio.duration && !isNaN(audio.duration) && audio.duration > 0) {
        duration = Math.round(audio.duration);
        break;
      }
    }

    // Способ 2: из прогресс-бара — ищем span с классом Timecode_root_end (длительность)
    if (!duration) {
      const endEl = document.querySelector('[class*="Timecode_root_end"]');
      if (endEl) {
        const t = endEl.textContent.trim();
        if (t.match(/^\d+:\d+$/)) duration = parseTime(t);
      }
    }

    // Способ 3: длительность треков из списка по названию
    if (!duration) {
      const allTimes = [];
      document.querySelectorAll('[class*="CommonControlsBar_item"] span').forEach(el => {
        if (el.textContent.trim().match(/^\d+:\d+$/)) {
          allTimes.push({ el, t: parseTime(el.textContent.trim()) });
        }
      });
      // Ищем трек по названию рядом с временем
      for (const { el, t } of allTimes) {
        const row = el.closest('[class*="CommonControlsBar_item"]');
        if (row && row.textContent.includes(title)) {
          duration = t;
          break;
        }
      }
    }

    return {
      title: title.replace(/\s+/g, ' ').trim(),
      artist: cleanArtist.replace(/\s+/g, ' ').trim(),
      duration: duration || 0,
      timestamp: Math.floor(Date.now() / 1000),
    };
  }

  function tracksEqual(a, b) {
    if (!a || !b) return false;
    return a.title === b.title && a.artist === b.artist;
  }

  function sendToBackground(type, data) {
    try {
      chrome.runtime.sendMessage({ type, ...data }).catch((err) => {
        // Если контекст инвалидирован — останавливаем все таймеры
        if (err?.message?.includes('Extension context invalidated')) {
          stopAll();
        }
      });
    } catch (e) {
      if (e?.message?.includes('Extension context invalidated')) {
        stopAll();
      }
    }
  }

  function stopAll() {
    console.log('[Scrobbler] Контекст расширения устарел, останавливаемся. Перезагрузите страницу.');
    if (scrobbleTimer) clearTimeout(scrobbleTimer);
    if (observer) observer.disconnect();
  }

  function getDuration() {
    // Из прогресс-бара — ищем span с классом Timecode_root_end
    const endEl = document.querySelector('[class*="Timecode_root_end"]');
    if (endEl) {
      const t = endEl.textContent.trim();
      if (t.match(/^\d+:\d+$/)) return parseTime(t);
    }
    // Из audio элемента
    const audios = document.querySelectorAll('audio');
    for (const audio of audios) {
      if (audio.duration && !isNaN(audio.duration) && audio.duration > 0) {
        return Math.round(audio.duration);
      }
    }
    return 0;
  }

  function onTrackChanged(track) {
    console.log('[Scrobbler] Новый трек:', track.artist, '—', track.title);

    // Отправляем "now playing"
    sendToBackground('NOW_PLAYING', { track });

    if (scrobbleTimer) clearTimeout(scrobbleTimer);

    // Ждём появления длительности до 5 секунд, затем запускаем скроблинг
    let attempts = 0;
    const waitForDuration = setInterval(() => {
      attempts++;
      const dur = getDuration();
      if (dur > 0 || attempts >= 10) {
        clearInterval(waitForDuration);
        if (dur > 0) track.duration = dur;

        const scrobbleDelay = track.duration > 0
          ? Math.min(track.duration * 1000 / 2, 4 * 60 * 1000)
          : 2 * 60 * 1000;

        console.log(`[Scrobbler] Скроблинг через ${Math.round(scrobbleDelay / 1000)}с (длительность: ${track.duration}с)`);

        scrobbleTimer = setTimeout(() => {
          if (isPlaying() && tracksEqual(currentTrack, track)) {
            console.log('[Scrobbler] Отправляем скробл:', track.artist, '—', track.title);
            chrome.runtime.sendMessage({ type: 'SCROBBLE', track }).then(resp => {
              console.log('[Scrobbler] Ответ на скробл:', JSON.stringify(resp));
            }).catch(err => {
              console.error('[Scrobbler] Ошибка отправки скробла:', err);
            });
          } else {
            console.log('[Scrobbler] Скробл отменён (трек сменился или пауза)');
          }
        }, scrobbleDelay);
      }
    }, 500); // проверяем каждые 500мс
  }

  function checkPlayer() {
    const playing = isPlaying();
    const track = getCurrentTrackInfo();

    // Отладка каждые ~10 секунд
    if (Math.floor(Date.now() / 10000) !== checkPlayer._lastLog) {
      checkPlayer._lastLog = Math.floor(Date.now() / 10000);
      console.log('[Scrobbler] Статус:', playing ? 'играет' : 'пауза', '| Трек:', track?.title, '|', track?.artist);
    }

    if (!playing) return;
    if (!track || !track.title || !track.artist) return;

    if (!tracksEqual(currentTrack, track)) {
      currentTrack = track;
      trackStartTime = Date.now();
      onTrackChanged(track);
    }
  }
  checkPlayer._lastLog = 0;

  function init() {
    console.log('[Scrobbler] Яндекс Музыка → Last.fm инициализирован');

    // Основной цикл проверки каждые 2 секунды
    setInterval(checkPlayer, 2000);

    // MutationObserver для быстрого реагирования на смену трека
    observer = new MutationObserver(() => {
      checkPlayer();
    });

    // Ждём появления плеера и начинаем наблюдение
    const waitForPlayer = setInterval(() => {
      const playerArea = document.querySelector(
        '.player-controls, [class*="PlayerControls"], [class*="player-bar"], .PlayerBar, [class*="PlayerBar"]'
      );
      if (playerArea) {
        clearInterval(waitForPlayer);
        observer.observe(playerArea, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
        });
        console.log('[Scrobbler] Наблюдение за плеером запущено');
      }
    }, 1000);

    // Слушаем события audio элемента
    document.addEventListener('play', (e) => {
      if (e.target.tagName === 'AUDIO') {
        setTimeout(checkPlayer, 500);
      }
    }, true);

    document.addEventListener('timeupdate', (e) => {
      if (e.target.tagName === 'AUDIO') {
        checkPlayer();
      }
    }, true);
  }

  // Ждём загрузки страницы
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 1000);
  }

  // Сообщаем popup о статусе
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'GET_CURRENT_TRACK') {
      sendResponse({
        track: currentTrack,
        playing: isPlaying(),
      });
    }
  });

})();
