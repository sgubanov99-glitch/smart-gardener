// src/ui/tsypa.js — Цыпа, проактивный маскот-агроном (ревизия 2.118, выверенная копия)
// 2.118: на мобильном пул позиций [2,3,5] — исключены правый-низ (там FAB «+»)
//        и правая середина (там плавающие ↩/↪): Цыпа не перекрывается и нажимается
// 2.117: мобильный режим (matchMedia max-width:900px): аватар 44px (CSS), пузырь скрыт
//        (.tsypa-quiet) и показывается только по тапу на 6 секунд; позиции — углы;
//        видимость управляется из меню (localStorage sg-tsypa-hidden, display в main.js)
// 2.113: относительный путь assets/chick_full.svg
// 2.108: позиции классами pos-0..pos-5, без transition/keyframes; cooldown клика 600 мс + try/catch
// 2.106/2.107: 6 позиций, зеркало слева, z-index 35
import { WEATHER_MODES, weatherMode, isRainExcused } from '../core/weather.js';

const TIPS_FALLBACK = [
  'Привет! Я Цыпа. Подскажу, что важно на участке. Нажми на меня!',
  'Не знаешь, с чего начать? Открой «🎓 Обучение» в шапке!',
  'Пока всё спокойно. Так держать! 🌟',
  'Загляни в Календарь — вдруг созрело что-то важное? 🗓',
  'Не забудь записать урожай — так интереснее следить за успехами! 🧺'
];

const MONTH_TIPS = [
  'Январь: планируем сезон и проверяем семена. 🌱',
  'Февраль: пора сеять перец и баклажаны на рассаду. 🌶',
  'Март: сеем томаты на рассаду, готовим грунт. 🍅',
  'Апрель: сеем в грунт редис, морковь, зелень; сажаем деревья. 🌳',
  'Май: высаживаем рассаду, сажаем картофель и кабачки. 🥔',
  'Июнь: полив, подкормки, пасынкуем томаты. 💧',
  'Июль: собираем первые огурцы и ягоды, полив обильный. 🍓',
  'Август: массовый сбор, теплицы проветриваем вечером. 🧺',
  'Сентябрь: сажаем озимый чеснок, убираем поздние овощи. 🧄',
  'Октябрь: последний сбор, укрываем многолетники на зиму. 🍂',
  'Ноябрь: сезон закрыт — укрываем посадки и планируем. ❄',
  'Декабрь: отдыхаем и мечтаем о новом урожае! 🎄'
];

const CELEBRATIONS = [
  'Есть! Грядка довольна! 🌱',
  'Отмечено! Урожай стал ближе! 🧺',
  'Цыпа видела — всё сделано честно! 🐤',
  'Так держать! Сезон будет щедрым! 🌞',
  'Плюс один шаг к большому урожаю! 🍅'
];

const MONTHS_LOW = ['январ','феврал','март','апрел','ма','июн','июл','август','сентябр','октябр','ноябр','декабр'];
const ROTATE_MS = 12000;
const CELEBRATE_MS = 6000;
const HOP_COOLDOWN_MS = 600;
const QUIET_MS = 6000;

const MQ_MOBILE = (typeof window !== 'undefined' && window.matchMedia) ? window.matchMedia('(max-width:900px)') : null;

function isMobile() {
  return !!(MQ_MOBILE && MQ_MOBILE.matches);
}

function posPool() {
  // 2.118: на мобильном исключены правый-низ (FAB «+») и правая середина (↩/↪)
  return isMobile() ? [2, 3, 5] : [0, 1, 2, 3, 4, 5];
}

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + dd;
}

function addDaysISO(iso, n) {
  const dt = new Date(iso + 'T00:00:00');
  dt.setDate(dt.getDate() + n);
  return toDateStr(dt);
}

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

export function createTsypa({ scheme, phases, plants, buildCalendar, getReminders }) {
  let el = document.getElementById('tsypa');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tsypa';
    el.innerHTML = '<div class="tsypa-bubble" id="tsypaBubble"></div>' +
      '<div class="tsypa-avatar"><img src="assets/chick_full.svg" alt="Цыпа" /></div>';
    document.body.appendChild(el);
  }
  const bubble = el.querySelector('#tsypaBubble');

  let pool = posPool();
  let posIdx = pool[Math.floor(Math.random() * pool.length)];
  let lastHopAt = 0;
  let quietTimer = null;

  function applyPosition() {
    for (let i = 0; i < 6; i++) el.classList.toggle('pos-' + i, i === posIdx);
    const leftSide = (posIdx === 3 || posIdx === 4 || posIdx === 5);
    el.classList.toggle('pos-left', leftSide);
    el.classList.toggle('flip', leftSide);
  }

  function hop() {
    pool = posPool();
    let next = posIdx;
    let guard = 0;
    while (next === posIdx && guard < 12) {
      next = pool[Math.floor(Math.random() * pool.length)];
      guard++;
    }
    if (next === posIdx) next = pool[(pool.indexOf(posIdx) + 1) % pool.length];
    posIdx = next;
    applyPosition();
  }

  function setQuiet(on) {
    el.classList.toggle('tsypa-quiet', on);
  }

  function showBubbleBriefly() {
    setQuiet(false);
    if (quietTimer) clearTimeout(quietTimer);
    quietTimer = setTimeout(function () { setQuiet(true); }, QUIET_MS);
  }

  if (isMobile()) setQuiet(true);

  let tips = [];
  let idx = 0;
  let rotateTimer = null;
  let celebrateTimer = null;
  let celebrating = false;

  function sowNowPlants() {
    const m = MONTHS_LOW[new Date().getMonth()];
    return (plants || []).filter(function (p) {
      return ((p.sowing_timing || p.sowing) || '').toLowerCase().includes(m);
    });
  }

  function plantedCultures() {
    const set = new Set();
    (scheme.objects || []).forEach(function (o) {
      if (o.culture) set.add(norm(o.culture));
      (o.greenhouseBedCultures || []).forEach(function (c) { if (c) set.add(norm(c)); });
    });
    return set;
  }

  function computeTips() {
    const found = [];
    const today = toDateStr(new Date());
    const planted = plantedCultures();
    let byDay = {};
    try { byDay = buildCalendar(scheme.objects, phases, true, plants, null, scheme.weather) || {}; } catch (e) { }

    let overdueCount = 0;
    let overdueExample = null;
    Object.keys(byDay).forEach(function (date) {
      if (date >= today) return;
      byDay[date].forEach(function (t) {
        const key = t.date + '|' + t.bed_id + '|' + t.name;
        if (isRainExcused(scheme, t, today)) return;
        if (!(scheme.completedTasks || {})[key]) {
          overdueCount++;
          if (!overdueExample) overdueExample = t;
        }
      });
    });
    if (overdueCount > 0 && overdueExample) {
      found.push('⏰ Просрочена задача «' + overdueExample.name + '» (' + overdueExample.crop + '). Всего таких: ' + overdueCount + '. Давай нагонять!');
    }

    if (getReminders) {
      (getReminders() || []).forEach(function (r) { found.push(r.text); });
    }

    const wm = weatherMode(scheme);
    if (wm !== 'normal') {
      const m = WEATHER_MODES.find(function (x) { return x.id === wm; });
      if (m) found.push(m.icon + ' ' + m.hint);
    }

    const fruiting = [];
    (scheme.objects || []).forEach(function (o) {
      if (o.type === 'greenhouse') {
        (o.greenhouseBedPhases || []).forEach(function (bp, i) {
          const c = (o.greenhouseBedCultures || [])[i];
          if (bp && bp.phase === 'fruiting' && c) fruiting.push('🧺 «' + c + '» в теплице поспевает — пора собирать!');
        });
      } else if (o.phase === 'fruiting' && o.culture) {
        fruiting.push('🧺 «' + o.culture + '» (' + o.name + ') поспевает — пора собирать урожай!');
      }
    });
    fruiting.slice(0, 3).forEach(function (t) { found.push(t); });

    const horizon = addDaysISO(today, 7);
    const soon = new Set();
    Object.keys(byDay).forEach(function (date) {
      if (date < today || date > horizon) return;
      byDay[date].forEach(function (t) {
        if (t.category === 'harvest' && t.crop) soon.add(t.crop);
      });
    });
    Array.from(soon).slice(0, 3).forEach(function (crop) {
      found.push('🗓 В ближайшие 7 дней — сбор: «' + crop + '». Готовим корзинки!');
    });

    const sowable = sowNowPlants().filter(function (p) { return !planted.has(norm(p.name)); });
    if (sowable.length) {
      const names = sowable.slice(0, 3).map(function (p) { return p.name; }).join(', ');
      found.push('🌱 Сейчас сажают: ' + names + (sowable.length > 3 ? ' и др.' : '') + '. Загляни в Каталог!');
    }

    (scheme.objects || []).forEach(function (o) {
      if (o.type !== 'greenhouse' && o.phase === 'senescence' && o.culture && o.actual_yield_kg == null) {
        found.push('📝 Сезон «' + o.culture + '» закончился, а урожай не записан. Запиши в настройках объекта!');
      }
    });

    const monthTip = MONTH_TIPS[new Date().getMonth()];
    if (monthTip) found.push(monthTip);

    tips = found.length ? found : TIPS_FALLBACK;
  }

  function render() {
    if (!bubble) return;
    bubble.textContent = tips[idx % tips.length] || TIPS_FALLBACK[0];
  }

  function startRotation() {
    stopRotation();
    rotateTimer = setInterval(function () {
      if (celebrating || document.hidden) return;
      idx++;
      render();
    }, ROTATE_MS);
  }

  function stopRotation() {
    if (rotateTimer) { clearInterval(rotateTimer); rotateTimer = null; }
  }

  function refresh() {
    computeTips();
    idx = 0;
    render();
    startRotation();
  }

  function celebrate() {
    celebrating = true;
    if (celebrateTimer) clearTimeout(celebrateTimer);
    if (bubble) {
      bubble.textContent = CELEBRATIONS[Math.floor(Math.random() * CELEBRATIONS.length)];
      if (isMobile()) showBubbleBriefly();
    }
    celebrateTimer = setTimeout(function () {
      celebrating = false;
      computeTips();
      idx = 0;
      render();
    }, CELEBRATE_MS);
  }

  el.addEventListener('click', function () {
    try {
      const now = Date.now();
      if (celebrating || now - lastHopAt < HOP_COOLDOWN_MS) return;
      lastHopAt = now;
      idx++;
      render();
      hop();
      if (isMobile()) showBubbleBriefly();
      startRotation();
    } catch (e) {
      console.warn('tsypa click:', e);
    }
  });
  el.addEventListener('mouseenter', stopRotation);
  el.addEventListener('mouseleave', function () { if (!celebrating) startRotation(); });

  applyPosition();
  refresh();
  return { refresh: refresh, celebrate: celebrate };
}