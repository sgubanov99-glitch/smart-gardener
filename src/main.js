// src/main.js — точка входа ревизии 2.137. Связывает слои каркаса.
// 2.137: убран собственный canvas-zoom (проба/кнопки/pinch) — масштабирование отдано нативному
//        pinch-zoom браузера: значки фаз масштабируются вместе с объектом и не выходят за пределы;
//        .obj-tiny уплотняет значки фаз (видны всегда), сверхомальные (<20px) -> угловая метка
// 2.136: удалена внедрённая надстройка «Урожая» — урожай полностью родной в schemeView
// 2.135: хуки (бейджи) сняты с пути рендера — rAF-планировщик scheduleSchemeHooks
// 2.132: Схема на мобильном — bottom-sheet настроек объекта, умные бейджи фаз
// 2.131: десктоп — родной Обзор homeView с отметкой выполнения; мобильные строки Обзора с чекбоксами
// 2.130: силовая нормализация ширины Обзора на мобильном (CSS)
// 2.129: пустая схема — подсказки и навигация в Обзоре; нормализация контейнеров блоков
// 2.128: блоки «Посаженные культуры» и «Задачи на 7 дней» перестраиваются из данных схемы
// 2.126: MutationObserver на #screen-plants-body — цыплёнок не пропадает при смене фильтров
// 2.125: фиксатор абсолютных путей картинок (в подпапке Pages «/assets/…» = 404)
// 2.121: карточка растения открывается надёжно (симуляция клика по карточке каталога)
// 2.119: ПК-режим с пилюлей возврата «📱 Мобильная версия»; resetViewOffset() перед листами
// 2.118: FAB/undo только на Схеме; переключатель «Мобильная версия»
// 2.117: мобильный каркас — ☰-меню-лист, лист добавления, FAB, плавающие undo/redo
// 2.116: глобальный сброс мобильного масштаба после завершения ввода
// 2.110: удалён мёртвый блок «Мой календарь»
// 2.101: Книга отзывов и предложений (guestbookView)
// 2.100: авто-подсказки погоды и прогноза (reminders.js)
// 2.95: undo/redo схемы — снапшот-история (history.js), кнопки и Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z
// 2.89: режимы погоды (WEATHER_MODES), тост при смене режима, погода в самопроверке
// 2.88: автозапуск обучения, пока не пройдено до конца
// 2.86: обучение — слайды Садовода и Цыпы
// 2.85: параметр planting проброшен в календарь и обзор
import { createScheme, nextUniqueName } from './domain/scheme.js';
import { buildCalendar, generateTasks } from './core/calendar.js';
import { advancePhase, PHASE_META } from './core/phaseMachine.js';
import { loadCompatibility } from './core/compatibility.js';
import { loadPlants } from './domain/plant.js';
import { StorageService } from './storage/storage.js';
import { createBot } from './bot/bot.js';
import { SchemeView } from './ui/schemeView.js';
import { createCalendarView } from './ui/calendarView.js';
import { createPlantsView } from './ui/plantsView.js';
import { createChatView } from './ui/chatView.js';
import { createHomeView } from './ui/homeView.js';
import { createIsoView } from './ui/isoView.js';
import { createAnalyticsView } from './ui/analyticsView.js';
import { createTsypa } from './ui/tsypa.js';
import { createTutorialView } from './ui/tutorialView.js';
import { createGuestbookView } from './ui/guestbookView.js';
import { exportPosterPNG } from './core/exportPoster.js';
import { createHistory } from './core/history.js';
import { createReminders } from './core/reminders.js';
import { WEATHER_MODES } from './core/weather.js';
import { APP_VERSION, CHANGELOG } from './core/changelog.js';

/* --- утилита: глубокая обрезка пробелов --- */
function deepTrim(v){
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) return v.map(deepTrim);
  if (v && typeof v === 'object') {
    const r = {};
    for (const [k, val] of Object.entries(v)) r[k.trim()] = deepTrim(val);
    return r;
  }
  return v;
}

/* --- безопасная привязка --- */
function on(id, fn, ev){
  const el = document.getElementById(id);
  if (el) el.addEventListener(ev || 'click', fn);
  else console.warn('main.js: нет элемента #' + id);
  return el;
}

/* --- экранирование для вставки имён в HTML --- */
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }

/* --- toast-уведомления --- */
function showToast(msg){
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tm);
  t._tm = setTimeout(()=>t.classList.remove('show'), 2400);
}

/* --- 2.116: сброс мобильного масштаба после завершения ввода --- */
function resetMobileZoom(){
  try {
    const vv = window.visualViewport;
    if (vv && vv.scale <= 1.01) return; // масштаб не увеличен — не трогаем
    const m = document.querySelector('meta[name="viewport"]');
    if (!m) return;
    const old = m.getAttribute('content') || '';
    if (/maximum-scale=1(\D|$)/.test(old)) return;
    m.setAttribute('content', old + ', maximum-scale=1');
    setTimeout(()=>{ m.setAttribute('content', old); }, 150);
  } catch(e){}
}

/* 2.119: сброс горизонтального смещения и масштаба перед полноэкранными листами */
function resetViewOffset(){
  try {
    if (window.scrollX !== 0) window.scrollTo(0, window.scrollY);
    resetMobileZoom();
  } catch(e){}
}

function isFormEl(el){
  if (!el || !el.tagName) return false;
  const t = el.tagName.toLowerCase();
  return t==='input' || t==='textarea' || t==='select';
}
// фокус ушёл с поля и не перешёл на другое поле — возвращаем масштаб к 1:1
document.addEventListener('focusout', (e)=>{
  if (!isFormEl(e.target)) return;
  setTimeout(()=>{ if (!isFormEl(document.activeElement)) resetMobileZoom(); }, 250);
});
// значение установлено (change) — возвращаем масштаб, даже если фокус ещё на поле
document.addEventListener('change', (e)=>{
  if (!isFormEl(e.target)) return;
  setTimeout(resetMobileZoom, 300);
});
// клавиатура закрылась / вьюпорт изменился при увеличенном масштабе и без фокуса в поле
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', ()=>{
    if (!isFormEl(document.activeElement)) resetMobileZoom();
  });
}

/* --- 2.118/2.119: переключатель «Мобильная версия» / ПК-режим --- */
const mobileModeToggle = document.getElementById('mobileModeToggle');
function isTouch(){ return (navigator.maxTouchPoints || 0) > 0; }
function mobileModeWanted(){ try { return localStorage.getItem('sg-mobile-mode') !== '0'; } catch(e){ return true; } }
function applyMobileMode(){
  const wantMobile = mobileModeWanted();
  if (!wantMobile && isTouch()) {
    document.documentElement.classList.add('fd'); // для пилюли возврата
    const m = document.querySelector('meta[name="viewport"]');
    if (m) m.setAttribute('content', 'width=1024, user-scalable=yes');
  }
  if (mobileModeToggle) mobileModeToggle.checked = wantMobile;
  // 2.119: браузерная «Версия для ПК» перекрывает наш мобильный режим — подсказываем один раз
  if (wantMobile && isTouch() && window.matchMedia && !window.matchMedia('(max-width:900px)').matches) {
    setTimeout(()=>showToast('Отключите «Версию для ПК» в меню браузера (⋮) один раз'), 1200);
  }
}
if (mobileModeToggle) mobileModeToggle.addEventListener('change', ()=>{
  try { localStorage.setItem('sg-mobile-mode', mobileModeToggle.checked ? '1' : '0'); } catch(e){}
  location.reload();
});
on('fdExit', function(){
  try { localStorage.setItem('sg-mobile-mode','1'); } catch(e){}
  location.reload();
});
applyMobileMode();

/* --- домен --- */
const scheme = createScheme();
scheme.completedTasks = scheme.completedTasks || {};

/* --- данные --- */
const plants = deepTrim(await loadPlants());
const compat = await loadCompatibility();
let phases = {};
try {
  const res = await fetch('data/phases.json');
  if (res.ok) phases = deepTrim(await res.json());
} catch (e) { console.warn('phases.json не загрузился', e); }

let planting = {};
try {
  const pres = await fetch('data/planting.json');
  if (pres.ok) planting = deepTrim(await pres.json());
} catch (e) { console.warn('planting.json не загрузился', e); }

/* --- 2.86: слайды обучения --- */
let tutorialSlides = [];
try {
  const tres = await fetch('data/tutorial.json');
  if (tres.ok) tutorialSlides = await tres.json();
} catch (e) { console.warn('tutorial.json не загрузился', e); }

/* --- инлайним SVG-спрайт иконок --- */
try {
  const iconsRes = await fetch('assets/icons.svg');
  if (iconsRes.ok) {
    const iconsTxt = await iconsRes.text();
    if (iconsTxt) document.body.insertAdjacentHTML('afterbegin', iconsTxt);
  }
} catch (e) { console.warn('icons.svg не загрузился', e); }

/* --- сервисы --- */
const storage = new StorageService();

/* --- UI: схема --- */
const schemeView = new SchemeView({ scheme, plants, phases, nextUniqueName, compat, planting });

/* --- календарь по фазам (2.91: с погодой и уведомлениями) --- */
const calendarView = createCalendarView({
  scheme, phases, plants, planting, buildCalendar,
  onChange: function(){ calendarView.render(); },
  onWeatherChange: function(modeId){
    const m = WEATHER_MODES.find(x=>x.id===modeId);
    showToast(m ? `Погода: ${m.label}. ${m.hint}` : 'Погода обновлена');
    if (window.__tsypa) window.__tsypa.refresh();
  },
  onNotify: function(msg){ showToast(msg); }
});
schemeView.onPhaseChange = function(){ calendarView.render(); };

/* --- бот --- */
const bot = createBot({
  scheme: scheme,
  plants: plants,
  phases: phases,
  compat: compat,
  generateTasks: generateTasks,
  onAdvancePhase: function(bedId, bedIndex, newPhase){ schemeView.advancePhaseForBed(bedId, bedIndex, newPhase); },
  onStateChanged: function(){ schemeView.render(); calendarView.render(); if (window.__tsypa) window.__tsypa.refresh(); }
});
const chatView = createChatView({ bot: bot });

/* --- каталог растений --- */
const plantsView = createPlantsView({
  plants: plants,
  compat: compat,
  onAddToScheme: function(plantName, plantType){
    schemeView.addNewObjectForPlant(plantName, plantType);
    showScreen('screen-scheme');
  }
});
schemeView.onOpenPlantCard = function(plantName){
  // 2.121: надёжное открытие карточки растения — симулируем клик по карточке каталога
  // (тот же путь, которым карточка открывается вручную в «Каталоге»)
  var norm = function(s){ return (s || '').toLowerCase().trim(); };
  function forceShowOverlays(){
    var ovs = document.querySelectorAll('.plant-detail-overlay');
    ovs.forEach(function(ov){
      if (ov.parentElement !== document.body) document.body.appendChild(ov);
      ov.classList.remove('hidden');
      ov.style.display = '';
    });
    return ovs.length;
  }
  function clickCatalogCard(name){
    var cards = Array.from(document.querySelectorAll('.plant-card'));
    var target = cards.find(function(c){
      var n = c.querySelector('.plant-name');
      return n && norm(n.textContent) === norm(name);
    });
    if (!target) target = cards.find(function(c){ return norm(c.textContent).indexOf(norm(name)) !== -1; });
    if (target) {
      (target.querySelector('.plant-detail-btn') || target).click();
      return true;
    }
    return false;
  }
  try { plantsView.render(); fixRelativeImages(document); } catch(e){}  // гарантируем DOM каталога + относительные пути
  var clicked = clickCatalogCard(plantName);
  if (!clicked && typeof plantsView.openPlantCard === 'function') {
    try { plantsView.openPlantCard(plantName); } catch(e){}
  }
  var found = forceShowOverlays();                  // оверлей мог создаться внутри скрытого экрана
  if (!found) {
    // последний резерв: открываем каталог и кликаем карточку там
    showScreen('screen-plants');
    try { plantsView.render(); fixRelativeImages(document); } catch(e){}
    clickCatalogCard(plantName);
    forceShowOverlays();
  }
  fixRelativeImages(document);
  resetViewOffset();
};

/* --- обзор (2.85: с planting) --- */
const homeView = createHomeView({
  scheme: scheme,
  phases: phases,
  plants: plants,
  planting: planting,
  buildCalendar: buildCalendar,
  onSelectObject: function(objId){ showScreen('screen-scheme'); schemeView.selectAndShow(objId); },
  onGoToCalendar: function(){ showScreen('screen-calendar'); }
});

/* --- аналитика --- */
const analyticsView = createAnalyticsView({ scheme: scheme, plants: plants, phases: phases, compat: compat, buildCalendar: buildCalendar, planting: planting });

/* --- 2.128/2.129/2.131: Обзор — блоки «Посаженные культуры» и «Задачи на 7 дней» --- */
function todayISO(){ const d=new Date(); const p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }
function addDaysISO2(iso,n){ const d=new Date(iso+'T00:00:00'); d.setDate(d.getDate()+n); const p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }
/* 2.131: тот же ключ задачи, что используется в Календаре */
function taskKeyOf(t){ return t.date + '|' + t.bed_id + '|' + t.name; }

function rowPlanted(culture, objName, phase, objId){
  const pm = (phase && PHASE_META[phase]) || null;
  return '<div class="hm-row">' +
    '<div class="hm-line">' + esc(culture) + ' · ' + esc(objName) + '</div>' +
    '<div class="hm-line hm-phase">' + (pm ? ((pm.icon||'') + ' ' + (pm.label||phase)) : (phase ? esc(String(phase)) : 'фаза не указана')) + '</div>' +
    '<button type="button" class="btn hm-btn" data-obj-id="' + objId + '">На схему</button>' +
    '</div>';
}
function plantedRowsHTML(){
  const rows = [];
  (scheme.objects||[]).forEach(o=>{
    if (o.type==='greenhouse') {
      (o.greenhouseBedCultures||[]).forEach((c,i)=>{
        if (!c) return;
        const ph = ((o.greenhouseBedPhases||[])[i]||{}).phase;
        rows.push(rowPlanted(c, o.name + ', грядка ' + (i+1), ph, o.id));
      });
    } else if (o.culture && ['bed','tree','bush'].includes(o.type)) {
      rows.push(rowPlanted(o.culture, o.name, o.phase, o.id));
    }
  });
  if (!rows.length) return '<div class="hm-line" style="color:var(--ink-soft)">Пока ничего не посажено — добавьте культуры на «Схеме».</div>';
  return rows.join('');
}
/* 2.131: строки задач с чекбоксом выполнения, синхронным с Календарём */
function tasksRowsHTML(){
  const today = todayISO();
  const horizon = addDaysISO2(today, 7);
  let byDay = {};
  try { byDay = buildCalendar(scheme.objects, phases, true, plants, planting, scheme.weather) || {}; } catch(e){}
  const rows = [];
  Object.keys(byDay).sort().forEach(d=>{
    if (d < today || d > horizon) return;
    (byDay[d]||[]).forEach(t=>{
      const key = taskKeyOf(t);
      const done = !!(scheme.completedTasks||{})[key];
      rows.push('<div class="hm-row' + (done ? ' hm-done' : '') + '">' +
        '<label class="hm-line hm-check">' +
          '<input type="checkbox" data-task-key="' + esc(key) + '"' + (done ? ' checked' : '') + ' />' +
          '<span class="hm-task-text">' + esc(t.name||'') + (t.crop ? ' · ' + esc(t.crop) : '') + ' · ' + d.slice(8,10) + '.' + d.slice(5,7) + '</span>' +
        '</label>' +
        '<button type="button" class="btn hm-btn" data-go-cal="1">К календарю</button>' +
        '</div>');
    });
  });
  if (!rows.length) return '<div class="hm-line" style="color:var(--ink-soft)">Задач на ближайшие 7 дней нет.</div>';
  return rows.join('');
}
/* ищем блок по заголовку независимо от классов разметки homeView */
function findBlock(root, re){
  const titleEl = Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,b,strong'))
    .find(el => el.children.length === 0 && re.test((el.textContent||'').trim()));
  if (!titleEl) return null;
  let n = titleEl;
  for (let i=0;i<6 && n;i++){
    n = n.parentElement;
    if (!n) break;
    if (n !== titleEl && (n.querySelector('button') || n.querySelector('ul,ol'))) return { container:n, titleEl };
  }
  return { container: titleEl.parentElement, titleEl };
}
function restyleHomeBlocks(){
  const root = document.getElementById('screen-home-body');
  if (!root) return;
  [ [/Посаженные культуры/i, plantedRowsHTML()],
    [/Задачи на ближайшие/i, tasksRowsHTML()] ].forEach(function(pair){
    const b = findBlock(root, pair[0]);
    if (!b) return;
    const c = b.container;
    // 2.129: нормализуем контейнер блока напрямую (он может быть вне .an-section
    // и иметь inline-стили ширины/flex, распирающие экран)
    c.removeAttribute('style');
    c.classList.add('hm-block');
    b.titleEl.classList.add('hm-title');
    b.titleEl.style.display = 'block';
    b.titleEl.style.width = '100%';
    b.titleEl.style.whiteSpace = 'normal';
    const box = document.createElement('div');
    box.className = 'hm-box';
    box.innerHTML = pair[1];
    c.innerHTML = '';
    c.appendChild(b.titleEl);
    c.appendChild(box);
  });
}

/* --- 2.129: пустая схема — Обзор с подсказками и навигацией в принятом стиле --- */
function emptyHomeHTML(){
  return '<div class="empty-state">' +
    '<div class="empty-state-icon">🏡</div>' +
    '<div class="empty-state-title">Участок пока пуст</div>' +
    '<div class="empty-state-text">Добавьте грядки, теплицы, деревья и кустарники на «Схеме» — и здесь появится обзор сезона: посаженные культуры, задачи на неделю, прогноз урожая и подсказки Цыпы.</div>' +
    '<button type="button" class="btn btn-olive empty-state-action" data-goto="screen-scheme">🏠 Перейти к Схеме</button>' +
    '<button type="button" class="btn empty-state-action" data-goto="screen-plants">🌱 Открыть Каталог растений</button>' +
    '<button type="button" class="btn empty-state-action" data-goto="screen-calendar">🗓 Посмотреть Календарь</button>' +
    '</div>';
}
/* 2.131: десктоп — родной Обзор homeView без изменений; мобильный — перестройка строк */
function renderHomeBody(){
  const body = document.getElementById('screen-home-body');
  const isMob = window.matchMedia && window.matchMedia('(max-width:900px)').matches;
  if (!(scheme.objects||[]).length) {
    if (body) body.innerHTML = emptyHomeHTML();
    return;
  }
  homeView.render();                // десктоп: родной Обзор с отметкой выполнения
  if (isMob) restyleHomeBlocks();   // мобильный: строки по ширине экрана + чекбоксы
}

/* --- 2.95: undo/redo схемы --- */
function refreshAfterHistory(){
  schemeView.render();
  calendarView.render();
  const active = document.querySelector('.screen.active');
  if (active) {
    if (active.id === 'screen-home') renderHomeBody();   // 2.131
    if (active.id === 'screen-analytics') analyticsView.render();
  }
  if (window.__tsypa) window.__tsypa.refresh();
}
function applySchemeState(parsed){
  Object.keys(scheme).forEach(k=>{ delete scheme[k]; });
  Object.assign(scheme, parsed);
  scheme.completedTasks = scheme.completedTasks || {};
  refreshAfterHistory();
}
const history = createHistory({ getState: ()=>scheme, applyState: applySchemeState, limit: 60 });
function updateHistoryButtons(){
  const u = document.getElementById('undoBtn'), r = document.getElementById('redoBtn');
  if (u) u.disabled = !history.canUndo();
  if (r) r.disabled = !history.canRedo();
}
history.onStacksChange(updateHistoryButtons);
// фиксация состояния после потенциально изменяющих взаимодействий
document.addEventListener('click', ()=>history.commit());
document.addEventListener('change', ()=>history.commit());
document.addEventListener('pointerup', ()=>history.commit());
let __inputCommitTimer = null;
document.addEventListener('input', ()=>{ clearTimeout(__inputCommitTimer); __inputCommitTimer = setTimeout(()=>history.commit(), 500); });
updateHistoryButtons();

/* --- 2.100: авто-подсказки (погода, прогноз, истечение режима) --- */
const reminders = createReminders({
  scheme,
  notify: function(msg){ showToast(msg); },
  refreshTsypa: function(){ if (window.__tsypa) window.__tsypa.refresh(); }
});

/* --- Цыпа — маскот-агроном (2.100: с авто-подсказками) --- */
const tsypa = createTsypa({ scheme, phases, plants, buildCalendar, getReminders: ()=>reminders.list() });
window.__tsypa = tsypa;
reminders.start();

/* --- 2.86: Обучение (слайды Садовода и Цыпы) --- */
const tutorialView = createTutorialView({ slides: tutorialSlides });
on('tutorialBtn', function(){
  if (!tutorialSlides.length) { showToast('Обучение не загрузилось — проверьте data/tutorial.json'); return; }
  tutorialView.open(0);
});

/* --- 2.101: Книга отзывов и предложений --- */
const guestbookView = createGuestbookView({
  overlay: document.getElementById('guestbookOverlay'),
  panel: document.getElementById('gbPanel'),
  getDiagnostics: function(){
    return `версия ${APP_VERSION}; объектов: ${scheme.objects.length}; культур: ${scheme.objects.filter(o=>o.culture).length}; браузер: ${navigator.userAgent}`;
  },
  notify: function(msg){ showToast(msg); }
});
on('guestbookBtn', function(){ guestbookView.open(); });
on('gbClose', function(){ guestbookView.close(); });

/* --- 2.121: на мобильном не грузим тяжёлый gb.png; на десктопе подключаем фоном --- */
const gbBg = document.getElementById('guestbookBg');
function applyGbBg(){
  if (!gbBg) return;
  const isMob = window.matchMedia && window.matchMedia('(max-width:900px)').matches;
  if (isMob) { gbBg.removeAttribute('src'); }
  else if (!gbBg.getAttribute('src')) { gbBg.setAttribute('src', 'gb.png'); }
}
applyGbBg();

/* --- 2.125: фикс абсолютных путей картинок (в подпапке Pages «/assets/…» = 404) --- */
function fixRelativeImages(root){
  (root || document).querySelectorAll('img[src^="/"]').forEach(function(im){
    im.setAttribute('src', im.getAttribute('src').replace(/^\//, ''));
  });
}
fixRelativeImages(document);

/* --- 2.126: цыплёнок не пропадает при смене фильтров: фиксим пути после каждой перерисовки каталога --- */
const plantsBody = document.getElementById('screen-plants-body');
if (plantsBody && window.MutationObserver) {
  const plantsMo = new MutationObserver(()=>{ fixRelativeImages(plantsBody); });
  plantsMo.observe(plantsBody, { childList:true, subtree:true });
}

/* --- 2.117: мобильный каркас: меню-лист, лист добавления, FAB, плавающие undo/redo --- */
const mMenuSheet = document.getElementById('mMenuSheet');
const mAddSheet = document.getElementById('mAddSheet');
function mCloseSheets(){
  if (mMenuSheet) mMenuSheet.classList.add('hidden');
  if (mAddSheet) mAddSheet.classList.add('hidden');
}
on('menuBtn', function(){ if (mMenuSheet) mMenuSheet.classList.remove('hidden'); });
on('mMenuClose', mCloseSheets);
on('mAddClose', mCloseSheets);
if (mMenuSheet) mMenuSheet.addEventListener('click', (e)=>{ if (e.target === mMenuSheet) mCloseSheets(); });
if (mAddSheet) mAddSheet.addEventListener('click', (e)=>{ if (e.target === mAddSheet) mCloseSheets(); });
if (mMenuSheet) mMenuSheet.addEventListener('click', (e)=>{
  const item = e.target.closest('[data-mact]');
  if (!item) return;
  mCloseSheets();
  const target = document.getElementById(item.dataset.mact);
  if (target) setTimeout(()=>target.click(), 60); // переиспользуем десктопные обработчики
});
// Цыпа: переключатель видимости с запоминанием
const tsypaToggle = document.getElementById('tsypaToggle');
function applyTsypaVisibility(){
  const elTs = document.getElementById('tsypa');
  if (!elTs) return;
  let hiddenTs = false;
  try { hiddenTs = localStorage.getItem('sg-tsypa-hidden') === '1'; } catch(e){}
  elTs.style.display = hiddenTs ? 'none' : '';
  if (tsypaToggle) tsypaToggle.checked = !hiddenTs;
}
if (tsypaToggle) tsypaToggle.addEventListener('change', ()=>{
  try { localStorage.setItem('sg-tsypa-hidden', tsypaToggle.checked ? '0' : '1'); } catch(e){}
  applyTsypaVisibility();
});
applyTsypaVisibility();
const mVer = document.getElementById('mVersion'); if (mVer) mVer.textContent = APP_VERSION;
// FAB: лист добавления -> клик по настоящей кнопке палитры
on('addFab', function(){ if (mAddSheet) mAddSheet.classList.remove('hidden'); });
if (mAddSheet) mAddSheet.addEventListener('click', (e)=>{
  const b = e.target.closest('[data-addfab]');
  if (!b) return;
  mCloseSheets();
  const real = document.querySelector('.palette-left [data-add="' + b.dataset.addfab + '"]');
  if (real) setTimeout(()=>real.click(), 60);
});
// плавающие undo/redo дублируют десктопные кнопки
on('undoFab', function(){ const u = document.getElementById('undoBtn'); if (u) u.click(); });
on('redoFab', function(){ const r = document.getElementById('redoBtn'); if (r) r.click(); });
function syncFabs(){
  const uf = document.getElementById('undoFab'), rf = document.getElementById('redoFab');
  if (uf) uf.disabled = !history.canUndo();
  if (rf) rf.disabled = !history.canRedo();
}
history.onStacksChange(syncFabs);
syncFabs();

/* --- поощрение за закрытие задачи --- */
const ENCOURAGEMENTS = [
  'Так держать! Ты молодец! 🌟',
  'Отличная работа! Так и дальше! 💪',
  'Здорово! Участок скажет спасибо! 🌱',
  'Молодец! Ещё одна задача закрыта! ✅',
  'Супер! Цыпа гордится тобой! 🐤',
  'Прекрасно! Урожай будет что надо! 🧺',
  'Есть! Такими темпами весь участок в порядке! 🎉'
];
window.addEventListener('sg-task-done', () => {
  showToast(ENCOURAGEMENTS[Math.floor(Math.random()*ENCOURAGEMENTS.length)]);
  if (window.__tsypa && window.__tsypa.celebrate) window.__tsypa.celebrate();
});

/* --- массовое отметание просроченных задач --- */
window.addEventListener('sg-tasks-bulk-done', (e) => {
  const n = (e.detail && e.detail.count) || 0;
  showToast(`Отмечено выполненными: ${n} просроченных задач ✓`);
  if (window.__tsypa) window.__tsypa.refresh();
});

/* --- псевдо-3D --- */
let isoOn = false;
const isoView = createIsoView({ scheme: scheme, plants: plants, onSelect: function(id){ schemeView.selectAndShow(id); } });
const _schemeRender = schemeView.render.bind(schemeView);
schemeView.render = function(){ _schemeRender(); if (isoOn) isoView.render(); };  // 2.135: минимальная обёртка, хуки вне пути рендера

const isoBtn = document.getElementById('isoBtn');
const plotWrap = document.getElementById('plotWrap');
const isoWrap = document.getElementById('isoWrap');
function setIsoLabel(){ if (isoBtn) isoBtn.textContent = isoOn ? '2D' : '3D'; }
setIsoLabel();
if (isoBtn) isoBtn.addEventListener('click', function(){
  isoOn = !isoOn;
  if (plotWrap) plotWrap.classList.toggle('hidden', isoOn);
  if (isoWrap) isoWrap.classList.toggle('hidden', !isoOn);
  setIsoLabel();
  if (isoOn) isoView.render();
});

/* --- 2.132/2.137: Схема на мобильном: bottom-sheet настроек, умные бейджи фаз --- */
const isMobileNow = () => window.matchMedia && window.matchMedia('(max-width:900px)').matches;

/* bottom-sheet: шапка с кнопкой закрытия внутри панели настроек объекта */
(function injectOpsHead(){
  const panel = document.getElementById('objPanel');
  if (!panel || panel.querySelector('.ops-head')) return;
  const head = document.createElement('div');
  head.className = 'ops-head';
  head.innerHTML = '<span>Настройки объекта</span><button type="button" id="opClose" aria-label="Закрыть настройки">✕</button>';
  panel.prepend(head);
  head.addEventListener('click', (e)=>{
    if (e.target.closest('#opClose')) panel.classList.add('hidden');
  });
})();

/* 2.137: маленькие объекты -> уплотнённые значки фаз (видны всегда);
   сверхомальные (<20px) -> угловая метка вместо значков */
function fixBadges(){
  const box = document.getElementById('plotBox');
  if (!box) return;
  box.querySelectorAll('.obj').forEach(o=>{
    const w = o.offsetWidth, h = o.offsetHeight;
    const ultra = (w < 20 || h < 20);
    const tiny = !ultra && (w < 34 || h < 34);
    o.classList.toggle('obj-tiny', tiny);
    o.classList.toggle('obj-ultra', ultra);
  });
}

/* 2.135/2.136/2.137: хуки (бейджи) выполняются через rAF-планировщик, запускаемый
   только действиями пользователя (клик/pointerup/смена экрана), НЕ из рендера —
   добавление объекта не может зависнуть; зум убран, остаются бейджи */
let schemeHooksRaf = 0;
function scheduleSchemeHooks(){
  if (schemeHooksRaf) return;
  schemeHooksRaf = requestAnimationFrame(()=>{
    schemeHooksRaf = 0;
    try { fixBadges(); } catch(e){ console.warn('scheme hooks:', e); }
  });
}
document.addEventListener('click', scheduleSchemeHooks);
document.addEventListener('pointerup', scheduleSchemeHooks);

/* --- экспорт постера --- */
on('exportBtn', async function(){
  const btn = document.getElementById('exportBtn');
  try {
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Рисуем постер…'; }
    showToast('Готовим постер…');
    await exportPosterPNG({ scheme, plants, phases, planting, compat, buildCalendar });
    showToast('Постер сохранён ✓');
  } catch (e) {
    console.error('exportPosterPNG:', e);
    showToast('Не удалось собрать постер');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🖼 Постер PNG'; }
  }
});

/* --- 2.95: кнопки undo/redo и горячие клавиши --- */
on('undoBtn', function(){ if (history.undo()) showToast('Отменено ↩'); });
on('redoBtn', function(){ if (history.redo()) showToast('Повторено ↪'); });
document.addEventListener('keydown', function(e){
  const tag = ((e.target && e.target.tagName) || '').toLowerCase();
  if (tag==='input' || tag==='textarea' || tag==='select') return; // в полях ввода работает родной undo
  if ((e.ctrlKey||e.metaKey) && !e.altKey && (e.key==='z' || e.key==='Z' || e.key==='я' || e.key==='Я')) {
    if (e.shiftKey) { if (history.redo()) showToast('Повторено ↪'); }
    else if (history.undo()) showToast('Отменено ↩');
    e.preventDefault();
  } else if ((e.ctrlKey||e.metaKey) && !e.altKey && (e.key==='y' || e.key==='Y')) {
    if (history.redo()) showToast('Повторено ↪');
    e.preventDefault();
  }
});

// 2.119: перед открытием полноэкранных листов сбрасываем сдвиг/масштаб (лечит «половинки»)
document.addEventListener('click', function(e){
  if (e.target.closest('#historyBtn,#tutorialBtn,#guestbookBtn,#advisorBtn,[data-mact],.obj-chip,.btn-card,.gh-plant-card,.obj')) resetViewOffset();
}, true);

/* --- навигация --- */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function(s){ s.classList.toggle('active', s.id === id); });
  document.querySelectorAll('.nav-btn').forEach(function(b){ b.classList.toggle('active', b.dataset.goto === id); });
  if (id === 'screen-scheme') {
    schemeView.render();
    scheduleSchemeHooks();   // 2.137: бейджи после смены экрана
  }
  if (id === 'screen-calendar') calendarView.render();
  if (id === 'screen-chat') chatView.render();
  if (id === 'screen-plants') { plantsView.render(); fixRelativeImages(document); }  // 2.125: цыплёнок на карточках виден
  if (id === 'screen-analytics') analyticsView.render();
  if (id === 'screen-home') {
    renderHomeBody();   // 2.131: десктоп — родной Обзор, мобильный — перестроенные строки
    const hpn = document.getElementById('homePlotName');
    if (hpn) {
      const pn = (scheme.plotName || '').trim();
      hpn.innerHTML = pn ? '🏡 Участок «' + esc(pn) + '»' : '';
      hpn.style.display = pn ? '' : 'none';
    }
  }
  if (window.__tsypa) window.__tsypa.refresh();
  // 2.118: FAB «+» и плавающие undo/redo — только на листе «Схема»
  const fab = document.getElementById('addFab');
  const ur = document.getElementById('mUndoRedo');
  const onlyScheme = (id === 'screen-scheme');
  if (fab) fab.style.display = onlyScheme ? '' : 'none';
  if (ur) ur.style.display = onlyScheme ? '' : 'none';
  // 2.119: сброс горизонтального сдвига/масштаба при смене экрана
  resetViewOffset();
}
document.addEventListener('click', function(e){
  const g = e.target.closest('[data-goto]');
  if (g) showScreen(g.dataset.goto);
});

/* --- делегирование кнопок «Обзора» --- */
document.addEventListener('click', function(e){
  const objBtn = e.target.closest('button[data-obj-id]');
  if (objBtn) { showScreen('screen-scheme'); schemeView.selectAndShow(parseInt(objBtn.dataset.objId, 10)); return; }
  const calBtn = e.target.closest('button[data-go-cal]');
  if (calBtn) { showScreen('screen-calendar'); return; }
});

/* --- 2.131: отметка выполнения задачи в Обзоре — синхронно с Календарём в обе стороны --- */
document.addEventListener('change', function(e){
  const cb = e.target.closest('#screen-home-body input[data-task-key]');
  if (!cb) return;
  const key = cb.getAttribute('data-task-key');
  if (!scheme.completedTasks) scheme.completedTasks = {};
  if (cb.checked) {
    scheme.completedTasks[key] = { at: todayISO() };
    window.dispatchEvent(new CustomEvent('sg-task-done', { detail:{} })); // поощрение Цыпы
  } else {
    delete scheme.completedTasks[key];
  }
  calendarView.render();          // Календарь сразу видит отметку
  renderHomeBody();               // Обзор перерисовывает строки с актуальными галочками
  if (window.__tsypa) window.__tsypa.refresh();
});

/* --- кнопки шапки (с toast) --- */
on('saveBtn', function(){
  storage.save(scheme);
  const pn = (scheme.plotName || '').trim();
  showToast(pn ? 'План «' + pn + '» сохранён ✓' : 'План сохранён ✓');
});
on('loadBtn', function(){
  storage.load(scheme, function(){
    const setVal = function(id, val){ const el = document.getElementById(id); if (el) el.value = val; };
    setVal('plotW', scheme.widthM);
    setVal('plotL', scheme.lengthM);
    setVal('gridStep', String(scheme.gridStepM));
    setVal('sunDir', scheme.sunDir || 'S');
    setVal('plotNameInput', scheme.plotName || '');
    schemeView.render();
    calendarView.render();
    if (window.__tsypa) window.__tsypa.refresh();
    showToast('План загружен ✓');
    history.commit(); // 2.95: загрузка файла асинхронная — фиксируем вручную
  });
});
on('gridStep', function(){
  const el = document.getElementById('gridStep');
  scheme.gridStepM = Number(el && el.value) || 0.5;
  schemeView.render();
}, 'change');
on('resetBtn', function(){
  if (!confirm('Очистить схему участка?')) return;
  scheme.objects = [];
  scheme.plotName = '';
  const pn = document.getElementById('plotNameInput');
  if (pn) pn.value = '';
  schemeView.render();
  showToast('Схема очищена ✓');
});

/* --- Советчик --- */
const MONTHS_LOW = ['январ','феврал','март','апрел','ма','июн','июл','август','сентябр','октябр','ноябр','декабр'];
const MONTHS_NOM = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const SEASON_ADVICE = {
  0:'Сезон закрыт: отдыхаем и планируем схемы участка. Ждём Вас в апреле!',
  1:'Сезон закрыт: перебираем семена и точим инструмент. Ждём Вас в апреле!',
  2:'Сезон закрыт: готовим рассадные ёмкости и грунт. Ждём Вас в апреле!',
  3:'Апрель: прогреваем грядки, сеем холодостойкие и высаживаем рассаду под плёнку; не спешим с теплолюбивыми.',
  4:'Май: после угрозы заморозков высаживаем рассаду в грунт и теплицу, мульчируем и ставим дуги для зелени.',
  5:'Июнь: полив утром/вечером, подкормки азотом, пасынкуем томаты и прореживаем всходы.',
  6:'Июль: полив участился, теплицу проветриваем днём; собираем первые овощи и ягоды.',
  7:'Август: полив стабильный, вечером проветриваем теплицу; массовый сбор и закладка компоста.',
  8:'Полив к сентябрю сокращаем: томатам хватит одного раза в 4–5 дней, а зелени хватит дождей. Теплицу вечером проветривайте — от конденсата берётся фитофтора.',
  9:'Октябрь: последний сбор, уборка ботвы и мойка теплицы; укрываем многолетники перед заморозками.',
  10:'Сезон закрыт: убираем ботву и моем теплицу. Ждём Вас в апреле!',
  11:'Сезон закрыт: укрываем многолетники и планируем посадки. Ждём Вас в апреле!'
};
function groupByType(list) {
  const groups = { 'дерево': [], 'кустарник': [], 'овощ': [], 'зелень': [], 'ягода': [] };
  const labels = { 'дерево': '🌳 Деревья', 'кустарник': '🌿 Кустарники', 'овощ': '🥕 Овощи', 'зелень': '🌱 Зелень', 'ягода': '🍓 Ягоды' };
  list.forEach(function(p){
    const t = (p.type || '').toLowerCase();
    for (const k of Object.keys(groups)) {
      if (t.includes(k)) { groups[k].push(p.name); return; }
    }
  });
  return Object.keys(groups).filter(function(k){ return groups[k].length; })
    .map(function(k){ return '<div class="tip-group"><b>' + labels[k] + ':</b> ' + groups[k].join(', ') + '</div>'; }).join('');
}
on('advisorBtn', function(){
  const bubble = document.getElementById('tipBubble');
  if (!bubble) return;
  if (!bubble.classList.contains('hidden')) { bubble.classList.add('hidden'); return; }
  const now = new Date();
  const m = MONTHS_LOW[now.getMonth()];
  const sowP = plants.filter(function(p){ return ((p.sowing_timing || p.sowing) || '').toLowerCase().includes(m); });
  const harP = plants.filter(function(p){ return ((p.harvest_timing || p.harvest) || '').toLowerCase().includes(m); });

  let body;
  if(!sowP.length && !harP.length){
    body = '<div class="m-row">В этом месяце в открытом грунте обычно не сажают и не собирают — загляните в «Календарь», там актуальные задачи по фазам.</div>';
  } else {
    body = '<b>Сейчас можно посадить:</b>' + (sowP.length ? groupByType(sowP) : '—') + '<br>' +
           '<b>Пора собирать:</b>' + (harP.length ? groupByType(harP) : '—') + '<br>';
  }

  bubble.innerHTML =
    '<button type="button" class="tip-close" id="tipClose" aria-label="Закрыть">✕</button>' +
    '<strong style="font-family:\'Neucha\';font-size:19px;display:inline-flex;align-items:center;gap:6px"><img src="assets/chick.svg" alt="" style="width:28px;height:28px" />Советчик · ' + MONTHS_NOM[now.getMonth()].toLowerCase() + '</strong>' +
    '<div class="tip-season"><b>Совет сезона</b>' + (SEASON_ADVICE[now.getMonth()] || '') + '</div>' +
    '<span class="tip-count">посадить сейчас: ' + sowP.length + ' · собрать: ' + harP.length + '</span><br><br>' +
    body +
    'В засуху — полив и мульча! 🌿';
  const tc = bubble.querySelector('#tipClose');
  if (tc) tc.addEventListener('click', function(e){ e.stopPropagation(); bubble.classList.add('hidden'); });
  bubble.classList.remove('hidden');
  fixRelativeImages(bubble); // 2.125: относительные пути в пузыре Советчика
});
document.addEventListener('pointerdown', function(e){
  const bubble = document.getElementById('tipBubble');
  if (bubble && !bubble.classList.contains('hidden') && !e.target.closest('#tipBubble') && !e.target.closest('#advisorBtn')) {
    bubble.classList.add('hidden');
  }
});

/* --- История ревизий --- */
on('historyBtn', function(){
  const modal=document.getElementById('historyModal');
  if(!modal) return;
  let html = '<div class="modal-head"><h2>🕘 История ревизий</h2><button type="button" class="m-close" id="historyClose">✕</button></div>' +
             '<p class="m-row">Текущая версия: <b>v'+APP_VERSION+'</b></p>';
  html += CHANGELOG.map(function(e){
    const notes=(e.notes||[]).filter(Boolean).map(function(n){ return '<li>'+n+'</li>'; }).join('');
    return '<div class="history-item"><div class="history-head">v'+e.v+' · '+e.date+' — <b>'+e.title+'</b></div><ul>'+notes+'</ul></div>';
  }).join('');
  modal.innerHTML = html;
  const ov=document.getElementById('historyOverlay'); if(ov) ov.classList.remove('hidden');
  const hc=modal.querySelector('#historyClose');
  if(hc) hc.addEventListener('click', function(){ const o=document.getElementById('historyOverlay'); if(o) o.classList.add('hidden'); });
});
on('historyOverlay', function(e){ if(e.target===document.getElementById('historyOverlay')) document.getElementById('historyOverlay').classList.add('hidden'); }, 'pointerdown');

/* --- подсказки «4 шага» --- */
on('closeHintBtn', function(){ const h=document.getElementById('hintBar'); if(h) h.remove(); });

const av=document.getElementById('appVersion'); if(av) av.textContent='v'+APP_VERSION;

/* --- самопроверка --- */
window.__sgSelfTest = function(){
  const report = [];
  const push = (name, ok, info) => report.push({ check:name, result: ok?'PASS':'FAIL', info: info||'' });
  push('plants loaded', Array.isArray(plants) && plants.length>0, (plants.length||0)+' items');
  push('phases loaded', !!phases && Object.keys(phases).length>0, Object.keys(phases||{}).length+' cultures');
  push('compat loaded', !!compat && Array.isArray(compat.good) && Array.isArray(compat.bad), '');
  push('planting loaded', !!planting && Object.keys(planting).length>0, Object.keys(planting||{}).length+' cultures');
  push('tutorial loaded', Array.isArray(tutorialSlides) && tutorialSlides.length>0, (tutorialSlides.length||0)+' slides');
  push('scheme bounds', scheme.widthM>=4 && scheme.widthM<=60 && scheme.lengthM>=4 && scheme.lengthM<=60, scheme.widthM+'×'+scheme.lengthM);
  const inBounds = scheme.objects.every(o => o.x>=-0.001 && o.y>=-0.001 && o.x+o.w<=scheme.widthM+0.001 && o.y+o.l<=scheme.lengthM+0.001);
  push('objects within bounds', inBounds, scheme.objects.length+' objects');
  push('completedTasks is object', !!scheme.completedTasks && typeof scheme.completedTasks==='object', Object.keys(scheme.completedTasks||{}).length+' marks');
  let calOk=true, calDays=0;
  try {
    const beds = scheme.objects.filter(o => (o.type==='bed'&&o.culture)||(o.type==='greenhouse'&&(o.greenhouseBedCultures||[]).some(Boolean))||((o.type==='tree'||o.type==='bush')&&o.culture));
    const bd = buildCalendar(beds, phases, true, plants, planting, scheme.weather);
    calDays = Object.keys(bd).length;
  } catch(e){ calOk=false; console.error(e); }
  push('calendar builds', calOk, calDays+' days with tasks');
  console.table(report);
  return report;
};
console.info('Умный садовод: самопроверка доступна в консоли — __sgSelfTest()');

/* --- первичный рендер --- */
schemeView.render();

/* --- 2.88: автозапуск обучения при первом визите (пока не пройдено до конца) --- */
try {
  if (!localStorage.getItem('sg-tutorial-seen') && tutorialSlides.length) {
    setTimeout(function(){ tutorialView.open(0); }, 600);
  }
} catch(e){}