// src/main.js — точка входа (ревизия 3.16.1)
// 3.16.1: хотфикс геймификации — отметки задач в КАЛЕНДАРЕ учитываются в серии и цели дня
//        (делегированный change-слушатель только для геймификации, без записи в completedTasks —
//        владельцем данных там остаётся calendarView, нет double toggle); процент прогресса
//        освежается отложенным рендером карточки (scheduleGamifyRefresh)
// 3.16: геймификация (Этап 3, часть 1): карточка «Прогресс сезона» сверху Обзора (процент и бар
//      выполненных задач по сегодня), чипы «Серия N дн. · рекорд» и «Сегодня k/3»; серия продлевается
//      днём с ≥1 отметкой и сбрасывается при пропуске; цель дня 3 задачи — тост+вибро+celebrate один раз;
//      данные в scheme.progress (файл плана, автосохранение, undo); миграция старых планов ensureProgress()
// 3.14: мобильные правки: правый стек FAB без перекрытий (body.on-scheme); пауза 10с повторного показа
//      диалоговой подсказки Цыпы на том же объекте демо после её закрытия (demoHintSuppressed)
// 3.13: подписи FAB (одноразовые баблы + long-press aria-label)
// 3.12: анимации появления/удаления объектов + вибро-отклик (тумблер «Вибро-отклик», sg-haptics);
//      sg-object-deleted → history.commit; sg-drag-invalid → вибро-ошибка
// 3.11: Цыпа по запросу: тихий режим для новых (tsypa-silent), пузырь по клику ~10с, тумблер «Авто-подсказки»
// 3.10: Статистика: Собака на Обзоре; дубль имени удалён из Аналитики; стикеры ниже подвкладок
// 3.9: навигация 6→4 (Обзор+Аналитика=«Статистика»), Чат=FAB; deep-link home/analytics→stats
// 3.8: демо: диалоговая Цыпа у выделенного объекта; приглушение невыделенных; scheme.demoMode
// 3.7: тёплое приветствие; одноразовые подсказки вне демо; диагностика planting
// 3.6: первый вход: Приветствие → Обучение → Демо-участок; data/demo-scheme.json + нормализация фаз
// 3.5: меню/лист сверху; 3.4/3.3: меню кликает скрытые рабочие кнопки; 3.1: упрощённый первый экран
// 2.189: авто-заметки кроме полива; 2.182: opExtra только расчёт; 2.176: автосохранение; 2.175: PWA
import { createScheme, nextUniqueName } from './domain/scheme.js';
import { buildCalendar, generateTasks } from './core/calendar.js';
import { advancePhase, PHASE_META, PHASE_ORDER } from './core/phaseMachine.js';
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
import { exportPrint } from './core/exportPrint.js';
import { createHistory } from './core/history.js';
import { createReminders } from './core/reminders.js';
import { WEATHER_MODES } from './core/weather.js';
import { APP_VERSION, CHANGELOG } from './core/changelog.js';
import { swapEmojiInTextNodes } from './ui/icons.js';
import { plantingRef } from './core/planting.js';
import { DAILY_GOAL, ensureProgress, touchStreak, dailyGoalState, addDailyDone, seasonProgress } from './core/gamification.js';   // 3.16

/* --- утилиты --- */
function deepTrim(v){
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) return v.map(deepTrim);
  if (v && typeof v === 'object') { const r = {}; for (const [k, val] of Object.entries(v)) r[k.trim()] = deepTrim(val); return r; }
  return v;
}
function on(id, fn, ev){
  const el = document.getElementById(id);
  if (el) el.addEventListener(ev || 'click', fn); else console.warn('main.js: нет элемента #' + id);
  return el;
}
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
function showToast(msg){
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._tm); t._tm = setTimeout(()=>t.classList.remove('show'), 2400);
}
function resetMobileZoom(){
  try {
    const vv = window.visualViewport; if (vv && vv.scale <= 1.01) return;
    const m = document.querySelector('meta[name="viewport"]'); if (!m) return;
    const old = m.getAttribute('content') || '';
    if (/maximum-scale=1(\D|$)/.test(old)) return;
    m.setAttribute('content', old + ', maximum-scale=1');
    setTimeout(()=>{ m.setAttribute('content', old); }, 150);
  } catch(e){}
}
function resetViewOffset(){ try { if (window.scrollX !== 0) window.scrollTo(0, window.scrollY); resetMobileZoom(); } catch(e){} }
function isFormEl(el){ if (!el || !el.tagName) return false; const t = el.tagName.toLowerCase(); return t==='input'||t==='textarea'||t==='select'; }
document.addEventListener('focusout', (e)=>{ if (!isFormEl(e.target)) return; setTimeout(()=>{ if (!isFormEl(document.activeElement)) resetMobileZoom(); }, 250); });
document.addEventListener('change', (e)=>{ if (!isFormEl(e.target)) return; setTimeout(resetMobileZoom, 300); });
if (window.visualViewport) window.visualViewport.addEventListener('resize', ()=>{ if (!isFormEl(document.activeElement)) resetMobileZoom(); });

/* --- 2.173: пересчёт nextId --- */
function recalcNextId(){
  scheme.nextId = scheme.objects.reduce((m,o)=>Math.max(m, o.id||0), 0) + 1;
}

/* --- ПК-режим / мобильная версия --- */
const mobileModeToggle = document.getElementById('mobileModeToggle');
function isTouch(){ return (navigator.maxTouchPoints || 0) > 0; }
function mobileModeWanted(){ try { return localStorage.getItem('sg-mobile-mode') !== '0'; } catch(e){ return true; } }
function applyMobileMode(){
  const wantMobile = mobileModeWanted();
  if (!wantMobile && isTouch()) {
    document.documentElement.classList.add('fd');
    const m = document.querySelector('meta[name="viewport"]');
    if (m) m.setAttribute('content', 'width=1024, user-scalable=yes');
  }
  if (mobileModeToggle) mobileModeToggle.checked = wantMobile;
  if (wantMobile && isTouch() && window.matchMedia && !window.matchMedia('(max-width:900px)').matches) {
    setTimeout(()=>showToast('Отключите «Версию для ПК» в меню браузера (⋮) один раз'), 1200);
  }
}
if (mobileModeToggle) mobileModeToggle.addEventListener('change', ()=>{ try { localStorage.setItem('sg-mobile-mode', mobileModeToggle.checked ? '1' : '0'); } catch(e){} location.reload(); });
on('fdExit', function(){ try { localStorage.setItem('sg-mobile-mode','1'); } catch(e){} location.reload(); });
applyMobileMode();

/* --- домен и данные --- */
const scheme = createScheme();
scheme.completedTasks = scheme.completedTasks || {};
ensureProgress(scheme);   // 3.16: миграция/гарантия структуры progress
const plants = deepTrim(await loadPlants());
const compat = await loadCompatibility();
let phases = {};
try { const res = await fetch('data/phases.json'); if (res.ok) phases = deepTrim(await res.json()); } catch(e){ console.warn('phases.json не загрузился', e); }
let planting = {};
try { const pres = await fetch('data/planting.json'); if (pres.ok) planting = deepTrim(await res.json()); } catch(e){ console.warn('planting.json не загрузился', e); }
if (!planting || !Object.keys(planting).length) console.warn('main.js: planting.json пуст или не загружен — расчёт урожая будет недоступен');
// 3.7: видимая диагностика причины «пропавшего урожая»
setTimeout(()=>{ if (!planting || !Object.keys(planting).length) showToast('Внимание: справочник схем посадки не загрузился — оценка урожая недоступна'); }, 1500);
let tutorialSlides = [];
try { const tres = await fetch('data/tutorial.json'); if (tres.ok) tutorialSlides = await tres.json(); } catch(e){ console.warn('tutorial.json не загрузился', e); }
try { const iconsRes = await fetch('assets/icons.svg'); if (iconsRes.ok){ const t = await iconsRes.text(); if (t) document.body.insertAdjacentHTML('afterbegin', t); } } catch(e){ console.warn('icons.svg не загрузился', e); }
try { const siteRes = await fetch('assets/smart-gardener.svg'); if (siteRes.ok){ const t = await siteRes.text(); if (t) document.body.insertAdjacentHTML('afterbegin', t); } } catch(e){ console.warn('smart-gardener.svg не загрузился', e); }

/* --- сервисы и представления --- */
const storage = new StorageService();
const schemeView = new SchemeView({ scheme, plants, phases, nextUniqueName, compat, planting });
const calendarView = createCalendarView({
  scheme, phases, plants, planting, buildCalendar,
  onChange: function(){ calendarView.render(); },
  onWeatherChange: function(modeId){ const m = WEATHER_MODES.find(x=>x.id===modeId); showToast(m ? `Погода: ${m.label}. ${m.hint}` : 'Погода обновлена'); if (window.__tsypa) window.__tsypa.refresh(); },
  onNotify: function(msg){ showToast(msg); }
});
schemeView.onPhaseChange = function(){ calendarView.render(); };
const bot = createBot({
  scheme, plants, phases, compat, generateTasks,
  onAdvancePhase: function(bedId, bedIndex, newPhase){ schemeView.advancePhaseForBed(bedId, bedIndex, newPhase); },
  onStateChanged: function(){ schemeView.render(); calendarView.render(); if (window.__tsypa) window.__tsypa.refresh(); }
});
const chatView = createChatView({ bot });
const plantsView = createPlantsView({ plants, compat, onAddToScheme: function(plantName, plantType){ schemeView.addNewObjectForPlant(plantName, plantType); showScreen('screen-scheme'); } });
schemeView.onOpenPlantCard = function(plantName){
  showScreen('screen-plants');
  setTimeout(()=>{ if (plantsView.openPlantCard) plantsView.openPlantCard(plantName); }, 80);
};
const homeView = createHomeView({ scheme, phases, plants, planting, buildCalendar, onSelectObject: function(objId){ showScreen('screen-scheme'); schemeView.selectAndShow(objId); }, onGoToCalendar: function(){ showScreen('screen-calendar'); } });
const analyticsView = createAnalyticsView({ scheme, plants, phases, compat, buildCalendar, planting });

/* --- Обзор: пересборка блоков --- */
function todayISO(){ const d=new Date(); const p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }
function addDaysISO2(iso,n){ const d=new Date(iso+'T00:00:00'); d.setDate(d.getDate()+n); const p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }
function taskKeyOf(t){ return t.date + '|' + t.bed_id + '|' + t.name; }
function rowPlanted(culture, objName, phase, objId){
  const pm = (phase && PHASE_META[phase]) || null;
  return '<div class="hm-row"><div class="hm-line">' + esc(culture) + ' · ' + esc(objName) + '</div>' +
    '<div class="hm-line hm-phase">' + (pm ? (pm.label) : 'фаза не указана') + '</div>' +
    '<button type="button" class="btn hm-btn" data-obj-id="' + objId + '">На схему</button></div>';
}
function plantedRowsHTML(){
  const rows = [];
  (scheme.objects||[]).forEach(o=>{
    if (o.type==='greenhouse') (o.greenhouseBedCultures||[]).forEach((c,i)=>{ if (c){ const ph=((o.greenhouseBedPhases||[])[i]||{}).phase; rows.push(rowPlanted(c, o.name+', грядка '+(i+1), ph, o.id)); } });
    else if (o.culture && ['bed','tree','bush'].includes(o.type)) rows.push(rowPlanted(o.culture, o.name, o.phase, o.id));
  });
  if (!rows.length) return '<div class="hm-line" style="color:var(--ink-soft)">Пока ничего не посажено — добавьте культуры на «Схеме».</div>';
  return rows.join('');
}
function tasksRowsHTML(){
  const today = todayISO(); const horizon = addDaysISO2(today, 7);
  let byDay = {};
  try { byDay = buildCalendar(scheme.objects, phases, true, plants, planting, scheme.weather) || {}; } catch(e){}
  const rows = [];
  Object.keys(byDay).sort().forEach(d=>{
    if (d < today || d > horizon) return;
    (byDay[d]||[]).forEach(t=>{
      const key = taskKeyOf(t); const done = !!(scheme.completedTasks||{})[key];
      rows.push('<div class="hm-row' + (done?' hm-done':'') + '"><label class="hm-line hm-check"><input type="checkbox" data-task-key="' + esc(key) + '"' + (done?' checked':'') + ' /><span class="hm-task-text">' + esc(t.name||'') + (t.crop ? ' · '+esc(t.crop) : '') + ' · ' + d.slice(8,10)+'.'+d.slice(5,7) + '</span></label><button type="button" class="btn hm-btn" data-go-cal="1">К календарю</button></div>');
    });
  });
  if (!rows.length) return '<div class="hm-line" style="color:var(--ink-soft)">Задач на ближайшие 7 дней нет.</div>';
  return rows.join('');
}
function findBlock(root, re){
  const titleEl = Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,b,strong')).find(el => el.children.length === 0 && re.test((el.textContent||'').trim()));
  if (!titleEl) return null;
  let n = titleEl;
  for (let i=0;i<6 && n;i++){ n = n.parentElement; if (!n) break; if (n !== titleEl && (n.querySelector('button') || n.querySelector('ul,ol'))) return { container:n, titleEl }; }
  return { container: titleEl.parentElement, titleEl };
}
function restyleHomeBlocks(){
  const root = document.getElementById('screen-home-body'); if (!root) return;
  [ [/Посаженные культуры/i, plantedRowsHTML()], [/Задачи на ближайшие/i, tasksRowsHTML()] ].forEach(function(pair){
    const b = findBlock(root, pair[0]); if (!b) return;
    const c = b.container; c.removeAttribute('style'); c.classList.add('hm-block');
    b.titleEl.classList.add('hm-title'); b.titleEl.style.display='block'; b.titleEl.style.width='100%'; b.titleEl.style.whiteSpace='normal';
    const box = document.createElement('div'); box.className='hm-box'; box.innerHTML = pair[1];
    c.innerHTML=''; c.appendChild(b.titleEl); c.appendChild(box);
  });
}
function emptyHomeHTML(){
  return '<div class="empty-state"><div class="empty-state-icon"><svg class="ic-site" style="width:44px;height:44px"><use href="#si-house"/></svg></div><div class="empty-state-title">Участок пока пуст</div><div class="empty-state-text">Добавьте грядки, теплицы, деревья и кустарники на «Схеме» — и здесь появится обзор сезона.</div><button type="button" class="btn btn-olive empty-state-action" data-goto="screen-scheme">Перейти к Схеме</button><button type="button" class="btn empty-state-action" data-goto="screen-plants">Открыть Каталог растений</button><button type="button" class="btn empty-state-action" data-goto="screen-calendar">Посмотреть Календарь</button></div>';
}
function renderHomeBody(){
  updateStatsHead();
  const body = document.getElementById('screen-home-body');
  const isMob = window.matchMedia && window.matchMedia('(max-width:900px)').matches;
  if (!(scheme.objects||[]).length) { if (body) body.innerHTML = emptyHomeHTML(); return; }
  homeView.render();
  if (isMob) restyleHomeBlocks();
  if (body) body.insertAdjacentHTML('afterbegin', gamifyCardHTML());   // 3.16: карточка сверху Обзора
}
/* --- 3.16/3.16.1: геймификация — карточка «Прогресс сезона», серия, цель дня --- */
function gamifyCardHTML(){
  const today = todayISO();
  let byDay = {};
  try { byDay = buildCalendar(scheme.objects, phases, true, plants, planting, scheme.weather) || {}; } catch(e){}
  const sp = seasonProgress(byDay, scheme.completedTasks || {}, today);
  const pr = ensureProgress(scheme);
  const dg = dailyGoalState(pr, today);
  return '<div class="gam-card">' +
    '<div class="gam-head"><span class="gam-title">Прогресс сезона</span><span class="gam-pct">' + sp.pct + '%</span></div>' +
    '<div class="an-progress gam-bar"><i style="width:' + sp.pct + '%"></i></div>' +
    '<div class="gam-sub">выполнено ' + sp.done + ' из ' + sp.total + ' задач сезона (по сегодня)</div>' +
    '<div class="gam-chips">' +
      '<span class="gam-chip" title="Дней подряд с выполненными задачами"><svg class="ic-site"><use href="#si-calendar"/></svg>Серия: ' + pr.streak.count + ' дн. · рекорд ' + pr.streak.best + '</span>' +
      '<span class="gam-chip' + (dg.met ? ' gam-chip-met' : '') + '" title="Цель дня: ' + dg.goal + ' задачи"><svg class="ic-site"><use href="#si-sprout"/></svg>Сегодня: ' + dg.done + '/' + dg.goal + ' задач</span>' +
    '</div></div>';
}
let gamifyRefreshRaf = 0;
function scheduleGamifyRefresh(){
  if (gamifyRefreshRaf) return;
  gamifyRefreshRaf = requestAnimationFrame(()=>{
    gamifyRefreshRaf = 0;
    const active = document.querySelector('.screen.active');
    if (active && active.id === 'screen-stats' && statsTab === 'overview') renderHomeBody();
  });
}
function gamifyTouch(n){
  const pr = ensureProgress(scheme);
  const today = todayISO();
  touchStreak(pr, today);
  const metNow = addDailyDone(pr, today, n);
  if (metNow){
    showToast('Цель дня выполнена ✓');
    vibrate([10,30,10]);
    if (window.__tsypa && window.__tsypa.celebrate) window.__tsypa.celebrate();
  }
  scheduleGamifyRefresh();   // 3.16.1: карточка освежится, если Обзор открыт
}
/* --- 3.16.2: геймификация реагирует на ЛЮБУЮ отметку задачи, включая Календарь.
       Причина бага 3.16.1: calendarView при отметке синхронно перерисовывает список и
       ОТЦЕПЛЯЕТ чекбокс до того, как change дойдёт до document — closest() возвращал null.
       composedPath() — снимок цепочки узлов в момент dispatch, перерисовка ему не мешает.
       Данные в completedTasks здесь НЕ трогаем (ими владеет calendarView). --- */
document.addEventListener('change', (e)=>{
  const t = e.target;
  if (!t || t.type !== 'checkbox') return;
  const path = (typeof e.composedPath === 'function') ? e.composedPath() : [];
  const inHome = path.some(n => n && n.id === 'screen-home-body') || !!t.closest('#screen-home-body');
  if (inHome) return;   // Обзор: учтён основным change-обработчиком (свой gamifyTouch) — защита от двойного счёта
  const inCal = path.some(n => n && n.id === 'screen-calendar-body') || !!t.closest('#screen-calendar-body');
  if (inCal && t.checked) gamifyTouch(1);   // Календарь (список и месяц): серия + цель дня
});
/* --- 3.9: шапка и подвкладки экрана «Статистика» --- */
function updateStatsHead(){
  const hpn = document.getElementById('homePlotName');
  if (!hpn) return;
  const pn = (scheme.plotName||'').trim();
  hpn.innerHTML = pn ? '<svg class="ic-site" style="width:24px;height:24px"><use href="#si-house"/></svg> Участок «'+esc(pn)+'»' : '';
  hpn.style.display = pn ? '' : 'none';
}
/* --- 3.10: Аналитика без дубля имени участка --- */
function stripAnalyticsDupName(){
  const body = document.getElementById('screen-analytics-body');
  if (!body) return;
  let dup = body.querySelector('.an-plot-name');
  if (!dup){
    const pn = (scheme.plotName||'').trim();
    if (pn){
      const els = body.querySelectorAll('div,span,h2,h3,b,strong');
      for (const el of els){
        if (el.children.length) continue;
        const t = (el.textContent||'').trim();
        if (t === pn || t === 'Участок «'+pn+'»'){ dup = el; break; }
      }
    }
  }
  if (dup && body.contains(dup)) dup.remove();
}
function renderAnalytics(){ analyticsView.render(); stripAnalyticsDupName(); }
let statsTab = 'overview';
function setStatsTab(tab){
  statsTab = (tab === 'analytics') ? 'analytics' : 'overview';
  document.querySelectorAll('.stats-tab').forEach(b=>b.classList.toggle('active', b.dataset.stats === statsTab));
  const ov = document.getElementById('statsOverview');
  const an = document.getElementById('statsAnalytics');
  if (ov) ov.classList.toggle('hidden', statsTab !== 'overview');
  if (an) an.classList.toggle('hidden', statsTab !== 'analytics');
  renderStatsCurrent();
}
function renderStatsCurrent(){ if (statsTab === 'analytics') renderAnalytics(); else renderHomeBody(); }
document.addEventListener('click', (e)=>{ const t=e.target.closest('.stats-tab'); if (t) setStatsTab(t.dataset.stats); });
on('chatFab', function(){ showScreen('screen-chat'); });

/* --- undo/redo --- */
function refreshAfterHistory(){
  schemeView.render(); calendarView.render();
  const active = document.querySelector('.screen.active');
  if (active && active.id==='screen-stats') renderStatsCurrent();
  if (window.__tsypa) window.__tsypa.refresh();
}
function applySchemeState(parsed){
  Object.keys(scheme).forEach(k=>{ delete scheme[k]; });
  Object.assign(scheme, parsed);
  scheme.completedTasks = scheme.completedTasks || {};
  ensureProgress(scheme);   // 3.16
  recalcNextId();
  refreshAfterHistory();
}
const history = createHistory({ getState: ()=>scheme, applyState: applySchemeState, limit: 60 });
function updateHistoryButtons(){ const u=document.getElementById('undoBtn'), r=document.getElementById('redoBtn'); if (u) u.disabled=!history.canUndo(); if (r) r.disabled=!history.canRedo(); }
history.onStacksChange(updateHistoryButtons);
document.addEventListener('click', ()=>history.commit());
document.addEventListener('change', ()=>history.commit());
document.addEventListener('pointerup', ()=>history.commit());
let __ict = null; document.addEventListener('input', ()=>{ clearTimeout(__ict); __ict = setTimeout(()=>history.commit(), 500); });
updateHistoryButtons();

/* --- 2.176: АВТОСОХРАНЕНИЕ --- */
const AUTOSAVE_KEY = 'sg-autosave';
const AUTOSAVE_DEBOUNCE = 5000;
let autosaveTimer = null;
let autosaveDirty = false;
function autosaveNow(){
  if (!autosaveDirty) return;
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ at: Date.now(), scheme }));
    autosaveDirty = false;
  } catch(e){}
}
function scheduleAutosave(){
  autosaveDirty = true;
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(autosaveNow, AUTOSAVE_DEBOUNCE);
}
document.addEventListener('visibilitychange', ()=>{ if (document.visibilityState === 'hidden') autosaveNow(); });
window.addEventListener('pagehide', autosaveNow);
window.addEventListener('beforeunload', autosaveNow);
const _historyCommit = history.commit.bind(history);
history.commit = function(){ const r = _historyCommit(); scheduleAutosave(); return r; };
function applyScheme(s){
  Object.keys(scheme).forEach(k=>{ delete scheme[k]; });
  Object.assign(scheme, s);
  scheme.completedTasks = scheme.completedTasks || {};
  ensureProgress(scheme);   // 3.16
  recalcNextId();
  const set=(id,v)=>{ const el=document.getElementById(id); if (el) el.value=v; };
  set('plotW',scheme.widthM); set('plotL',scheme.lengthM); set('gridStep',String(scheme.gridStepM)); set('sunDir',scheme.sunDir||'S'); set('plotNameInput',scheme.plotName||'');
  schemeView.render(); calendarView.render();
  if (window.__tsypa) window.__tsypa.refresh();
  if (typeof updateCompass === 'function') updateCompass();
  history.commit();
}
function tryRestoreAutosave(){
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    const s = data && data.scheme;
    if (!s || !Array.isArray(s.objects) || !s.objects.length) return;
    if (scheme.objects.length) return;
    applyScheme(s);
    showToast('Восстановлено автосохранение (доступно отменить)');
  } catch(e){}
}
on('restoreAutosaveBtn', function(){
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) { showToast('Нет автосохранения'); return; }
    const data = JSON.parse(raw);
    const s = data && data.scheme;
    if (!s || !Array.isArray(s.objects)) { showToast('Автосохранение повреждено'); return; }
    if (!confirm('Восстановить автосохранение? Текущее состояние будет заменено.')) return;
    applyScheme(s);
    showToast('Автосохранение восстановлено');
  } catch(e){ showToast('Не удалось прочитать автосохранение'); }
});

/* --- авто-подсказки и Цыпа --- */
const reminders = createReminders({ scheme, notify: m=>showToast(m), refreshTsypa: ()=>{ if (window.__tsypa) window.__tsypa.refresh(); } });
const tsypa = createTsypa({ scheme, phases, plants, buildCalendar, getReminders: ()=>reminders.list() });
window.__tsypa = tsypa; reminders.start();

/* --- 3.7/3.8: подсказки Цыпы (одноразовые вне демо) и диалоговая Цыпа демо --- */
function tsypaSay(text, ms){
  const el = document.getElementById('tsypa');
  if (!el) { showToast(text); return; }
  const b = el.querySelector('.tsypa-bubble');
  if (b) b.textContent = text;
  el.classList.remove('tsypa-quiet');
  el.style.display = '';
  clearTimeout(el._sayT);
  el._sayT = setTimeout(()=>{ if (window.__tsypa && window.__tsypa.refresh) window.__tsypa.refresh(); }, ms || 9000);
}
function objHintText(d){
  if (d.type === 'building') return 'Цыпа подсказывает: у постройки вручную заполни Название и Высоту (высота нужна для расчёта теней). Остальное — по желанию!';
  if (d.type === 'greenhouse') return 'Цыпа подсказывает: у теплицы вручную выбери культуры по грядкам и даты посадки. Фазы, задачи и оценку урожая я посчитаю сама!';
  return 'Цыпа подсказывает: вручную — Название, Культуру и Дату посадки; «Посажено растений» и «Фактический урожай» — твои записи по сезону. Фазы, задачи, оценку урожая и авто-заметки приложение сформирует само!';
}
const DEMO_HINTS = {
  building: (o)=>`Это Постройка «${o.name}». Вручную Вы можете изменить Название, размеры (длину, ширину, высоту) и ориентацию объекта на схеме. Высота объекта влияет на размер тени — это важно учесть при посадке растений. Также Вы можете добавлять Заметки в Журнал объекта.`,
  greenhouse: (o)=>`Это Теплица «${o.name}». Вручную задайте количество грядок (1–4), Культуру и Дату посадки для каждой грядки, размеры и ориентацию — по ним приложение построит фазовый календарь и рассчитает оценку урожая. Фазы, задачи и авто-заметки формируются самим приложением; Ваши записи — в Журнале объекта.`,
  bed: (o)=>`Это Грядка «${o.name}». Вручную укажите Культуру, Дату посадки, размеры и ориентацию — по ним приложение построит фазы и задачи календаря. Поля «Посажено растений» и «Фактический урожай» заполняйте по сезону: они уточняют прогноз и аналитику урожая. Заметки и авто-записи — в Журнале объекта.`,
  tree: (o)=>`Это Дерево «${o.name}». Вручную укажите Культуру и Дату посадки: по возрасту приложение определит год первого плодоношения и не будет давать лишних задач и прогнозов молодому саженцу. Размеры и высоту можно менять — высота влияет на тень. Заметки — в Журнале объекта.`,
  bush: (o)=>`Это Кустарник «${o.name}». Вручную укажите Культуру и Дату посадки: возраст учитывается в задачах и оценке урожая. Размеры можно менять; Заметки и авто-записи — в Журнале объекта.`
};
let demoHintObjId = null;
const demoHintSuppressed = new Map();   // 3.14: id объекта → время закрытия подсказки
function demoHintShow(obj){
  // 3.14: после закрытия подсказки на том же объекте — пауза 10 секунд (не мешает перетаскиванию)
  const sup = demoHintSuppressed.get(obj.id);
  if (sup && Date.now() - sup < 10000) return;
  const el = document.getElementById('demoTsypa');
  const bubble = document.getElementById('demoTsypaBubble');
  if (!el || !bubble) return;
  demoHintObjId = obj.id;
  bubble.textContent = (DEMO_HINTS[obj.type] || DEMO_HINTS.bed)(obj);
  el.classList.remove('hidden');
  const box = document.getElementById('plotBox');
  if (box) box.classList.add('demo-focus');
  demoHintPlace(obj.id);
}
function demoHintPlace(id){
  const el = document.getElementById('demoTsypa');
  const objEl = document.querySelector('#plot .obj[data-id="' + id + '"]');
  if (!el || el.classList.contains('hidden') || !objEl) return;
  const r = objEl.getBoundingClientRect();
  const ew = el.offsetWidth || 260, eh = el.offsetHeight || 110;
  let left = r.right + 12, flip = false;
  if (left + ew > window.innerWidth - 8) { left = r.left - ew - 12; flip = true; }
  if (left < 8) left = Math.max(8, Math.min(window.innerWidth - ew - 8, r.left));
  let top = r.top + r.height / 2 - eh / 2;
  top = Math.max(70, Math.min(window.innerHeight - eh - 90, top));
  el.style.left = left + 'px'; el.style.top = top + 'px';
  el.classList.toggle('flip', flip);
}
function demoHintSync(){
  if (demoHintObjId == null) return;
  const obj = scheme.objects.find(o=>o.id===demoHintObjId);
  if (!obj || !scheme.demoMode || isoOn || schemeView.selectedObjId !== demoHintObjId) { demoHintHide(); return; }
  demoHintPlace(demoHintObjId);
}
function demoHintHide(){
  if (demoHintObjId == null) return;
  demoHintSuppressed.set(demoHintObjId, Date.now());   // 3.14: фиксируем момент закрытия
  demoHintObjId = null;
  const el = document.getElementById('demoTsypa');
  if (el) el.classList.add('hidden');
  const box = document.getElementById('plotBox');
  if (box) box.classList.remove('demo-focus');
}
(function initObjectHints(){
  let seen = new Set();
  try { seen = new Set(JSON.parse(localStorage.getItem('sg-obj-hint-seen') || '[]')); } catch(e){}
  window.addEventListener('sg-object-hint', (e)=>{
    const d = e.detail || {};
    if (d.id == null) return;
    if (scheme.demoMode) { const obj = scheme.objects.find(o=>o.id===d.id); if (obj) demoHintShow(obj); return; }
    if (seen.has(d.id)) return;
    seen.add(d.id);
    try { localStorage.setItem('sg-obj-hint-seen', JSON.stringify(Array.from(seen))); } catch(e){}
    tsypaSay(objHintText(d), 10000);
  });
})();
(function bindDemoTsypa(){
  const el = document.getElementById('demoTsypa');
  if (el) el.addEventListener('click', ()=> demoHintHide());
  window.addEventListener('sg-object-deselect', ()=> demoHintHide());
  const wrap = document.getElementById('plotWrap');
  let raf = 0;
  const repost = ()=>{ if (raf) return; raf = requestAnimationFrame(()=>{ raf = 0; demoHintSync(); }); };
  if (wrap) wrap.addEventListener('scroll', repost, { passive:true });
  window.addEventListener('resize', repost);
})();

/* --- 3.11: Цыпа по запросу (тихий режим + пузырь по клику) --- */
const tsypaAutoToggle = document.getElementById('tsypaAutoToggle');
function tsypaAutoWanted(){
  let v = null;
  try { v = localStorage.getItem('sg-tsypa-auto'); } catch(e){}
  if (v === null){
    const legacy = ['sg-tutorial-seen','sg-autosave','sg-hints-seen','sg-welcome-seen'].some(k=>{ try { return !!localStorage.getItem(k); } catch(e){ return false; } });
    v = legacy ? '1' : '0';
    try { localStorage.setItem('sg-tsypa-auto', v); } catch(e){}
  }
  return v === '1';
}
let tsypaSilentTimer = 0;
function applyTsypaMode(){
  const el = document.getElementById('tsypa');
  if (!el) return;
  const auto = tsypaAutoWanted();
  el.classList.toggle('tsypa-silent', !auto);
  if (tsypaAutoToggle) tsypaAutoToggle.checked = auto;
}
if (tsypaAutoToggle) tsypaAutoToggle.addEventListener('change', ()=>{
  try { localStorage.setItem('sg-tsypa-auto', tsypaAutoToggle.checked ? '1' : '0'); } catch(e){}
  clearTimeout(tsypaSilentTimer);
  applyTsypaMode();
  showToast(tsypaAutoToggle.checked ? 'Авто-подсказки Цыпы: включены' : 'Авто-подсказки Цыпы: выключены (подсказка по клику)');
});
applyTsypaMode();
(function bindTsypaOnDemand(){
  const el = document.getElementById('tsypa');
  if (!el) return;
  el.addEventListener('click', ()=>{
    if (tsypaAutoWanted()) return;
    if (!(window.matchMedia && window.matchMedia('(min-width:901px)').matches)) return;
    el.classList.remove('tsypa-silent');
    if (window.__tsypa && window.__tsypa.refresh) window.__tsypa.refresh();
    clearTimeout(tsypaSilentTimer);
    tsypaSilentTimer = setTimeout(()=>{ applyTsypaMode(); }, 10000);
  });
})();

/* --- 3.12: вибро-отклик (только тач, тумблер в меню; звука нет осознанно) --- */
function hapticsWanted(){ try { return localStorage.getItem('sg-haptics') !== '0'; } catch(e){ return true; } }
function vibrate(pattern){
  if (!hapticsWanted() || !isTouch()) return;
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch(e){}
}
const hapticsToggle = document.getElementById('hapticsToggle');
if (hapticsToggle) {
  hapticsToggle.checked = hapticsWanted();
  hapticsToggle.addEventListener('change', ()=>{
    try { localStorage.setItem('sg-haptics', hapticsToggle.checked ? '1' : '0'); } catch(e){}
    if (hapticsToggle.checked) vibrate(15);
    showToast(hapticsToggle.checked ? 'Вибро-отклик: включён' : 'Вибро-отклик: выключен');
  });
}
window.addEventListener('sg-object-deleted', ()=>{ vibrate([20,40,20]); history.commit(); });   // undo не теряет удаление
window.addEventListener('sg-drag-invalid', ()=> vibrate(40));

/* --- 3.13: подписи FAB — одноразовые баблы при первом входе + long-press тултип --- */
(function fabTips(){
  function showFabTip(btn, text, ms){
    if (!btn) return null;
    const old = document.querySelector('.fab-tip'); if (old) old.remove();
    const tip = document.createElement('div');
    tip.className = 'fab-tip'; tip.textContent = text;
    document.body.appendChild(tip);
    const r = btn.getBoundingClientRect();
    tip.style.left = (r.left + r.width / 2) + 'px';
    tip.style.top = (r.top - 8) + 'px';
    if (ms) setTimeout(()=>tip.remove(), ms);
    return tip;
  }
  let seen = false; try { seen = localStorage.getItem('sg-fab-tips-seen') === '1'; } catch(e){}
  if (!seen){
    setTimeout(()=>{
      showFabTip(document.getElementById('addFab'), 'Добавить объект на участок', 2600);
      setTimeout(()=>showFabTip(document.getElementById('chatFab'), 'Чат с садоводом: посадка словами', 2600), 2800);
      setTimeout(()=>{ try { localStorage.setItem('sg-fab-tips-seen','1'); } catch(e){} }, 5600);
    }, 1200);
  }
  // long-press ≥450 мс: подпись из aria-label (тач-устройства)
  ['#addFab','#chatFab','#undoFab','#redoFab'].forEach(sel=>{
    const btn = document.querySelector(sel); if (!btn) return;
    let t = 0, tip = null;
    btn.addEventListener('touchstart', ()=>{ t = setTimeout(()=>{ tip = showFabTip(btn, btn.getAttribute('aria-label') || '', 0); }, 450); }, { passive:true });
    const clear = ()=>{ clearTimeout(t); if (tip){ setTimeout(()=>tip.remove(), 900); tip = null; } };
    btn.addEventListener('touchend', clear);
    btn.addEventListener('touchcancel', clear);
    btn.addEventListener('touchmove', ()=>{ clearTimeout(t); }, { passive:true });
  });
})();

/* --- обучение, книга отзывов --- */
const tutorialView = createTutorialView({ slides: tutorialSlides });
on('tutorialBtn', function(){ if (!tutorialSlides.length){ showToast('Обучение не загрузилось — проверьте data/tutorial.json'); return; } tutorialView.open(0); });
const guestbookView = createGuestbookView({ overlay: document.getElementById('guestbookOverlay'), panel: document.getElementById('gbPanel'), getDiagnostics: ()=>`версия ${APP_VERSION}; объектов: ${scheme.objects.length}; культур: ${scheme.objects.filter(o=>o.culture).length}; браузер: ${navigator.userAgent}`, notify: m=>showToast(m) });
on('guestbookBtn', function(){ guestbookView.open(); });
on('gbClose', function(){ guestbookView.close(); });
const gbBg = document.getElementById('guestbookBg');
function applyGbBg(){ if (!gbBg) return; const isMob = window.matchMedia && window.matchMedia('(max-width:900px)').matches; if (isMob) gbBg.removeAttribute('src'); else if (!gbBg.getAttribute('src')) gbBg.setAttribute('src','gb.png'); }
applyGbBg();
function fixRelativeImages(root){ (root||document).querySelectorAll('img[src^="/"]').forEach(im=>im.setAttribute('src', im.getAttribute('src').replace(/^\//,''))); }
fixRelativeImages(document);
const plantsBody = document.getElementById('screen-plants-body');
if (plantsBody && window.MutationObserver) new MutationObserver(()=>fixRelativeImages(plantsBody)).observe(plantsBody, { childList:true, subtree:true });

/* --- мобильный каркас --- */
const mMenuSheet = document.getElementById('mMenuSheet');
const mAddSheet = document.getElementById('mAddSheet');
function mCloseSheets(){ if (mMenuSheet) mMenuSheet.classList.add('hidden'); if (mAddSheet) mAddSheet.classList.add('hidden'); }
on('menuBtn', function(){
  if (mMenuSheet) {
    mMenuSheet.classList.remove('hidden');
    const p = mMenuSheet.querySelector('.m-sheet-panel');
    if (p) p.scrollTop = 0;
  }
});
on('mMenuClose', mCloseSheets); on('mAddClose', mCloseSheets);
if (mMenuSheet) mMenuSheet.addEventListener('click', (e)=>{ if (e.target===mMenuSheet) mCloseSheets(); });
if (mAddSheet) mAddSheet.addEventListener('click', (e)=>{ if (e.target===mAddSheet) mCloseSheets(); });
if (mMenuSheet) mMenuSheet.addEventListener('click', (e)=>{ const item=e.target.closest('[data-mact]'); if (!item) return; mCloseSheets(); const t=document.getElementById(item.dataset.mact); if (t) setTimeout(()=>t.click(), 60); });
const tsypaToggle = document.getElementById('tsypaToggle');
function applyTsypaVisibility(){ const el=document.getElementById('tsypa'); if (!el) return; let hidden=false; try { hidden = localStorage.getItem('sg-tsypa-hidden')==='1'; } catch(e){} el.style.display = hidden ? 'none' : ''; if (tsypaToggle) tsypaToggle.checked = !hidden; }
if (tsypaToggle) tsypaToggle.addEventListener('change', ()=>{ try { localStorage.setItem('sg-tsypa-hidden', tsypaToggle.checked?'0':'1'); } catch(e){} applyTsypaVisibility(); });
applyTsypaVisibility();
const mVer = document.getElementById('mVersion'); if (mVer) mVer.textContent = APP_VERSION;
on('addFab', function(){
  if (mAddSheet) {
    mAddSheet.classList.remove('hidden');
    const p = mAddSheet.querySelector('.m-sheet-panel');
    if (p) p.scrollTop = 0;
  }
});
if (mAddSheet) mAddSheet.addEventListener('click', (e)=>{ const b=e.target.closest('[data-addfab]'); if (!b) return; mCloseSheets(); const real=document.querySelector('.palette-left [data-add="'+b.dataset.addfab+'"]'); if (real) setTimeout(()=>real.click(), 60); });
on('undoFab', function(){ const u=document.getElementById('undoBtn'); if (u) u.click(); });
on('redoFab', function(){ const r=document.getElementById('redoBtn'); if (r) r.click(); });
function syncFabs(){ const uf=document.getElementById('undoFab'), rf=document.getElementById('redoFab'); if (uf) uf.disabled=!history.canUndo(); if (rf) rf.disabled=!history.canRedo(); }
history.onStacksChange(syncFabs); syncFabs();

/* --- поощрения --- */
const ENCOURAGEMENTS = ['Так держать! Ты молодец! 🌟','Отличная работа! Так и дальше! 💪','Здорово! Участок скажет спасибо! 🌱','Молодец! Ещё одна задача закрыта! ✅','Супер! Цыпа гордится тобой! 🐤','Прекрасно! Урожай будет что надо! 🧺','Есть! Такими темпами весь участок в порядке! 🎉'];
window.addEventListener('sg-task-done', ()=>{ vibrate([10,30,10]); showToast(ENCOURAGEMENTS[Math.floor(Math.random()*ENCOURAGEMENTS.length)]); if (window.__tsypa && window.__tsypa.celebrate) window.__tsypa.celebrate(); });   // 3.12
window.addEventListener('sg-tasks-bulk-done', (e)=>{ const n=(e.detail&&e.detail.count)||0; gamifyTouch(n); showToast(`Отмечено выполненными: ${n} просроченных задач ✓`); if (window.__tsypa) window.__tsypa.refresh(); });   // 3.16

/* --- 3D и обёртка рендера --- */
let isoOn = false;
const isoView = createIsoView({ scheme, plants, onSelect: id=>schemeView.selectAndShow(id) });
const _schemeRender = schemeView.render.bind(schemeView);
schemeView.render = function(){ _schemeRender(); if (isoOn) isoView.render(); fixBadges(); demoHintSync(); };
const isoBtn = document.getElementById('isoBtn');
const plotWrap = document.getElementById('plotWrap');
const isoWrap = document.getElementById('isoWrap');
function setIsoLabel(){ if (isoBtn) isoBtn.textContent = isoOn ? '2D' : '3D'; }
setIsoLabel();
if (isoBtn) isoBtn.addEventListener('click', function(){ isoOn=!isoOn; if (plotWrap) plotWrap.classList.toggle('hidden', isoOn); if (isoWrap) isoWrap.classList.toggle('hidden', !isoOn); setIsoLabel(); if (isoOn) isoView.render(); });

/* --- bottom-sheet заголовок настроек --- */
(function injectOpsHead(){
  const panel = document.getElementById('objPanel'); if (!panel || panel.querySelector('.ops-head')) return;
  const head = document.createElement('div'); head.className='ops-head';
  head.innerHTML = '<span>Настройки объекта</span><button type="button" id="opClose" aria-label="Закрыть настройки">✕</button>';
  panel.prepend(head);
  head.addEventListener('click', (e)=>{ if (e.target.closest('#opClose')) { if (typeof schemeView.closePanel==='function') schemeView.closePanel(); else panel.classList.add('hidden'); } });
})();
function fixBadges(){
  const box = document.getElementById('plotBox'); if (!box) return;
  box.querySelectorAll('.obj').forEach(o=>{ const w=o.offsetWidth, h=o.offsetHeight; const ultra=(w<20||h<20); const tiny=!ultra&&(w<34||h<34); o.classList.toggle('obj-tiny', tiny); o.classList.toggle('obj-ultra', ultra); });
}
let schemeHooksRaf = 0;
function scheduleSchemeHooks(){ if (schemeHooksRaf) return; schemeHooksRaf = requestAnimationFrame(()=>{ schemeHooksRaf=0; try { fixBadges(); } catch(e){} }); }
document.addEventListener('click', scheduleSchemeHooks);
document.addEventListener('pointerup', scheduleSchemeHooks);

/* --- защита теплицы + 3.12 вибро на создание объекта --- */
(function guardGreenhouse(){
  const _add = schemeView.addObject.bind(schemeView);
  schemeView.addObject = function(type){
    const obj=_add(type);
    if (obj) {
      vibrate(15);   // 3.12
      if (type==='greenhouse'){
        if (!obj.greenhouseBedCount) obj.greenhouseBedCount=1;
        if (!Array.isArray(obj.greenhouseBedCultures)) obj.greenhouseBedCultures=[null];
        if (!Array.isArray(obj.greenhouseBedPlantingDates)) obj.greenhouseBedPlantingDates=[null];
        if (!Array.isArray(obj.greenhouseBedPhases)) obj.greenhouseBedPhases=[null];
      }
    }
    return obj;
  };
})();

/* --- перерисовка панели при изменениях (2.182: только поля расчёта) --- */
const opExtraEl = document.getElementById('opExtra');
if (opExtraEl) opExtraEl.addEventListener('change', (e)=>{
  const id = e.target && e.target.id;
  const cls = e.target && e.target.className;
  const isEstimate = (id === 'opPlantedCount' || id === 'opActualYield' || cls === 'opGhPlanted' || cls === 'opGhYield');
  if (!isEstimate) return;
  setTimeout(()=>{ try { schemeView.render(); } catch(e){} scheduleSchemeHooks(); }, 0);
});

/* --- постер PNG --- */
on('exportBtn', async function(){
  const btn = document.getElementById('exportBtn');
  try { if (btn) { btn.disabled = true; btn.textContent = 'Рисуем постер…'; } showToast('Готовим постер…'); await exportPosterPNG({ scheme, plants, phases, planting, compat, buildCalendar }); showToast('Постер сохранён ✓'); }
  catch(e){ console.error('exportPosterPNG:', e); showToast('Не удалось собрать постер'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Постер PNG'; } }
});
/* --- печать --- */
on('printBtn', async function(){
  try { showToast('Готовлю печатную версию…'); await exportPrint({ scheme, plants, phases, planting, compat, buildCalendar, appVersion: APP_VERSION }); }
  catch(e){ console.error('exportPrint:', e); showToast('Не удалось подготовить печать'); }
});

/* --- undo/redo клавиши и кнопки (3.12: +вибро) --- */
on('undoBtn', function(){ if (history.undo()) { showToast('Отменено ↩'); vibrate(10); } });
on('redoBtn', function(){ if (history.redo()) { showToast('Повторено ↪'); vibrate(10); } });
document.addEventListener('keydown', function(e){
  const tag=((e.target&&e.target.tagName)||'').toLowerCase();
  if (tag==='input'||tag==='textarea'||tag==='select') return;
  if ((e.ctrlKey||e.metaKey) && !e.altKey && (e.key==='z'||e.key==='Z'||e.key==='я'||e.key==='Я')) { if (e.shiftKey){ if (history.redo()) showToast('Повторено ↪'); } else if (history.undo()) showToast('Отменено ↩'); e.preventDefault(); }
  else if ((e.ctrlKey||e.metaKey) && !e.altKey && (e.key==='y'||e.key==='Y')) { if (history.redo()) showToast('Повторено ↪'); e.preventDefault(); }
});
document.addEventListener('click', function(e){ if (e.target.closest('#historyBtn,#tutorialBtn,#guestbookBtn,#advisorBtn,#advisorBtnMob,[data-mact],.obj-chip,.btn-card,.gh-plant-card,.obj')) resetViewOffset(); }, true);

/* --- навигация --- */
function showScreen(id){
  if (id !== 'screen-scheme') demoHintHide();
  document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('active', s.id===id));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.goto===id));
  document.body.classList.toggle('on-scheme', id==='screen-scheme');   // 3.14: стек FAB на Схеме
  if (id==='screen-scheme'){ schemeView.render(); scheduleSchemeHooks(); }
  if (id==='screen-calendar') calendarView.render();
  if (id==='screen-chat') chatView.render();
  if (id==='screen-plants'){ plantsView.render(); fixRelativeImages(document); }
  if (id==='screen-stats'){ updateStatsHead(); renderStatsCurrent(); }
  if (window.__tsypa) window.__tsypa.refresh();
  const fab=document.getElementById('addFab'), ur=document.getElementById('mUndoRedo');
  const only = (id==='screen-scheme');
  if (fab) fab.style.display = only ? '' : 'none';
  if (ur) ur.style.display = only ? '' : 'none';
  if (isFormEl(document.activeElement)) document.activeElement.blur();
  const resetScroll = ()=>{
    try { window.scrollTo({ top:0, left:0, behavior:'auto' }); } catch(e){ window.scrollTo(0,0); }
    const se = document.scrollingElement || document.documentElement;
    if (se){ se.scrollTop = 0; se.scrollLeft = 0; }
    const act = document.getElementById(id);
    if (act){
      act.scrollTop = 0;
      act.querySelectorAll('*').forEach(el=>{ if (el.scrollTop) el.scrollTop = 0; });
    }
  };
  resetScroll();
  requestAnimationFrame(resetScroll);
  setTimeout(resetScroll, 80);
  resetViewOffset();
}
document.addEventListener('click', function(e){ const g=e.target.closest('[data-goto]'); if (g) showScreen(g.dataset.goto); });
document.addEventListener('click', function(e){
  const objBtn=e.target.closest('button[data-obj-id]');
  if (objBtn){ showScreen('screen-scheme'); schemeView.selectAndShow(parseInt(objBtn.dataset.objId,10)); return; }
  const calBtn=e.target.closest('button[data-go-cal]');
  if (calBtn){ showScreen('screen-calendar'); return; }
});
document.addEventListener('change', function(e){
  const cb=e.target.closest('#screen-home-body input[data-task-key]');
  if (!cb) return;
  const key=cb.dataset.taskKey;
  if (!scheme.completedTasks) scheme.completedTasks={};
  if (cb.checked){ scheme.completedTasks[key]={ at: todayISO() }; gamifyTouch(1); window.dispatchEvent(new CustomEvent('sg-task-done',{detail:{}})); } else delete scheme.completedTasks[key];   // 3.16
  calendarView.render(); renderHomeBody(); if (statsTab==='analytics') renderAnalytics(); if (window.__tsypa) window.__tsypa.refresh();
});

/* --- кнопки шапки --- */
on('saveBtn', function(){ storage.save(scheme); const pn=(scheme.plotName||'').trim(); showToast(pn ? 'План «'+pn+'» сохранён ✓' : 'План сохранён ✓'); });
on('loadBtn', function(){
  storage.load(scheme, function(){
    recalcNextId();
    ensureProgress(scheme);   // 3.16
    const set=(id,v)=>{ const el=document.getElementById(id); if (el) el.value=v; };
    set('plotW',scheme.widthM); set('plotL',scheme.lengthM); set('gridStep',String(scheme.gridStepM)); set('sunDir',scheme.sunDir||'S'); set('plotNameInput',scheme.plotName||'');
    schemeView.render(); calendarView.render();
    if (window.__tsypa) window.__tsypa.refresh();
    if (typeof updateCompass === 'function') updateCompass();
    showToast('План загружен ✓');
    history.commit();
  });
});
on('gridStep', function(){ const el=document.getElementById('gridStep'); scheme.gridStepM = Number(el&&el.value)||0.5; schemeView.render(); }, 'change');
on('resetBtn', function(){ if (!confirm('Очистить схему участка?')) return; scheme.objects=[]; scheme.plotName=''; scheme.demoMode=false; const pn=document.getElementById('plotNameInput'); if (pn) pn.value=''; scheme.nextId=1; schemeView.render(); showToast('Схема очищена ✓'); });

/* --- модалка настроек схемы --- */
const ssOverlay = document.getElementById('schemeSettingsOverlay');
on('schemeSettingsBtn', function(){
  if (ssOverlay) ssOverlay.classList.remove('hidden');
  updateCompass();
  if (schemeView && schemeView._syncSettingsUI) schemeView._syncSettingsUI();
});
on('schemeSettingsClose', function(){ if (ssOverlay) ssOverlay.classList.add('hidden'); });
if (ssOverlay) ssOverlay.addEventListener('pointerdown', (e)=>{ if (e.target === ssOverlay) ssOverlay.classList.add('hidden'); });
document.querySelectorAll('.ss-preset').forEach(b=>b.addEventListener('click', ()=>{
  const [w,l] = String(b.dataset.preset||'12,8').split(',').map(Number);
  const pw=document.getElementById('plotW'), pl=document.getElementById('plotL');
  if (pw){ pw.value=w; pw.dispatchEvent(new Event('change')); }
  if (pl){ pl.value=l; pl.dispatchEvent(new Event('change')); }
}));
const SUN_NAMES = { N:'Север', S:'Юг', E:'Восток', W:'Запад', NE:'С-В', NW:'С-З', SE:'Ю-В', SW:'Ю-З' };
function updateCompass(){
  const sel=document.getElementById('sunDir'), c=document.getElementById('sunCompass');
  if (!sel || !c) return;
  c.querySelectorAll('[data-sun]').forEach(b=>b.classList.toggle('active', b.dataset.sun===sel.value));
  const center=c.querySelector('.ss-compass-center');
  if (center) center.textContent = SUN_NAMES[sel.value] || 'Юг';
}
const sunCompass = document.getElementById('sunCompass');
if (sunCompass) sunCompass.addEventListener('click', (e)=>{
  const b=e.target.closest('[data-sun]'); if (!b) return;
  const sel=document.getElementById('sunDir'); if (!sel) return;
  sel.value=b.dataset.sun; sel.dispatchEvent(new Event('change'));
  updateCompass();
});
updateCompass();

/* --- Советчик --- */
on('advisorBtn', function(){
  const bubble = document.getElementById('tipBubble'); if (!bubble) return;
  if (!bubble.classList.contains('hidden')) { bubble.classList.add('hidden'); return; }
  const MONTHS_LOW=['январ','феврал','март','апрел','ма','июн','июл','август','сентябр','октябр','ноябр','декабр'];
  const MONTHS_NOM=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const SEASON_ADVICE={0:'Сезон закрыт: отдыхаем и планируем схемы участка. Ждём Вас в апреле!',1:'Сезон закрыт: перебираем семена и точим инструмент. Ждём Вас в апреле!',2:'Сезон закрыт: готовим рассадные ёмкости и грунт. Ждём Вас в апреле!',3:'Апрель: прогреваем грядки, сеем холодостойкие и высаживаем рассаду под плёнку; не спешим с теплолюбивыми.',4:'Май: после угрозы заморозков высаживаем рассаду в грунт и теплицу, мульчируем и ставим дуги для зелени.',5:'Июнь: полив утром/вечером, подкормки азотом, пасынкуем томаты и прореживаем всходы.',6:'Июль: полив участился, теплицу проветриваем днём; собираем первые овощи и ягоды.',7:'Август: полив стабильный, вечером проветриваем теплицу; массовый сбор и закладка компоста.',8:'Полив к сентябрю сокращаем: томатам хватит одного раза в 4–5 дней, а зелени хватит дождей. Теплицу вечером проветривайте — от конденсата берётся фитофтора.',9:'Октябрь: последний сбор, уборка ботвы и мойка теплицы; укрываем многолетники перед заморозками.',10:'Сезон закрыт: убираем ботву и моем теплицу. Ждём Вас в апреле!',11:'Сезон закрыт: укрываем многолетники и планируем посадки. Ждём Вас в апреле!'};
  function groupByType(list){
    const g = { 'Овощи':[], 'Зелень':[], 'Ягоды':[], 'Деревья':[], 'Кустарники':[] };
    list.forEach(p => {
      const t = String((p && p.type) || 'овощ').toLowerCase();
      if (t.includes('дерево')) g['Деревья'].push(p.name);
      else if (t.includes('кустарник')) g['Кустарники'].push(p.name);
      else if (t.includes('ягода')) g['Ягоды'].push(p.name);
      else if (t.includes('зелень')) g['Зелень'].push(p.name);
      else g['Овощи'].push(p.name);
    });
    return Object.keys(g).filter(k => g[k].length).map(k => `<div class="m-row"><b>${k}:</b> ${g[k].join(', ')}</div>`).join('');
  }
  function siteIconSafe(id){ return `<svg class="ic-site" aria-hidden="true"><use href="#${id}"></use></svg>`; }
  const now=new Date(); const m=MONTHS_LOW[now.getMonth()];
  const sowP=plants.filter(p=>((p.sowing_timing||p.sowing)||'').toLowerCase().includes(m));
  const harP=plants.filter(p=>((p.harvest_timing||p.harvest)||'').toLowerCase().includes(m));
  const wm=(scheme.weather && scheme.weather.mode) || 'normal';
  const wIcon={normal:'si-sun',drought:'si-drought',rain:'si-rain',cold:'si-cold'}[wm]||'si-sun';
  const body = (!sowP.length && !harP.length)
    ? '<div class="m-row">В этом месяце в открытом грунте обычно не сажают и не собирают — загляните в «Календарь», там актуальные задачи по фазам.</div>'
    : '<b>Сейчас можно посадить:</b><br>' + groupByType(sowP) +
      '<b>Пора собирать:</b><br>' + groupByType(harP);
  bubble.innerHTML =
    '<button type="button" class="tip-close" id="tipClose" aria-label="Закрыть">✕</button>'+
    '<strong style="font-family:\'Neucha\';font-size:19px;display:inline-flex;align-items:center;gap:6px"><img src="assets/chick.svg" alt="" style="width:28px;height:28px" />Советчик · '+MONTHS_NOM[now.getMonth()].toLowerCase()+'</strong>'+
    '<div class="tip-season"><b>Совет сезона</b> '+siteIconSafe(wIcon)+' '+(SEASON_ADVICE[now.getMonth()]||'')+'</div>'+
    '<span class="tip-count">посадить сейчас: '+sowP.length+' · собрать: '+harP.length+'</span><br><br>'+
    body+'В засуху — полив и мульча! '+siteIconSafe('si-water');
  const tc=bubble.querySelector('#tipClose');
  if (tc) tc.addEventListener('click', (e)=>{ e.stopPropagation(); bubble.classList.add('hidden'); });
  bubble.classList.remove('hidden');
  fixRelativeImages(bubble);
});
on('advisorBtnMob', function(){ const a=document.getElementById('advisorBtn'); if (a) a.click(); });
document.addEventListener('pointerdown', function(e){ const b=document.getElementById('tipBubble'); if (b && !b.classList.contains('hidden') && !e.target.closest('#tipBubble') && !e.target.closest('#advisorBtn') && !e.target.closest('#advisorBtnMob')) b.classList.add('hidden'); });

/* --- история ревизий --- */
on('historyBtn', function(){
  const modal=document.getElementById('historyModal'); if (!modal) return;
  let html = '<div class="modal-head"><h2>История ревизий</h2><button type="button" class="m-close" id="historyClose">✕</button></div><p class="m-row">Текущая версия: <b>v'+APP_VERSION+'</b></p>';
  html += CHANGELOG.map(e=>{ const notes=(e.notes||[]).filter(Boolean).map(n=>'<li>'+n+'</li>').join(''); return '<div class="history-item"><div class="history-head">v'+e.v+' · '+e.date+' — <b>'+e.title+'</b></div><ul>'+notes+'</ul></div>'; }).join('');
  modal.innerHTML = html;
  const ov=document.getElementById('historyOverlay'); if (ov) ov.classList.remove('hidden');
  const hc=modal.querySelector('#historyClose'); if (hc) hc.addEventListener('click', ()=>{ const o=document.getElementById('historyOverlay'); if (o) o.classList.add('hidden'); });
});
on('historyOverlay', function(e){ if (e.target===document.getElementById('historyOverlay')) document.getElementById('historyOverlay').classList.add('hidden'); }, 'pointerdown');
on('closeHintBtn', function(){ const h=document.getElementById('hintBar'); if (h) h.remove(); try { localStorage.setItem('sg-hints-seen','1'); } catch(e){} });
try { if (localStorage.getItem('sg-hints-seen')==='1') { const h=document.getElementById('hintBar'); if (h) h.classList.add('hidden'); } } catch(e){}
const av=document.getElementById('appVersion'); if (av) av.textContent='v'+APP_VERSION;

/* --- самопроверка --- */
window.__sgSelfTest = function(){
  const report=[]; const push=(n,ok,i)=>report.push({check:n,result:ok?'PASS':'FAIL',info:i||''});
  push('plants loaded', Array.isArray(plants)&&plants.length>0, (plants.length||0)+' items');
  push('phases loaded', !!phases&&Object.keys(phases).length>0, Object.keys(phases||{}).length+' cultures');
  push('compat loaded', !!compat&&Array.isArray(compat.good)&&Array.isArray(compat.bad), '');
  push('planting loaded', !!planting&&Object.keys(planting).length>0, Object.keys(planting||{}).length+' cultures');
  const firstCulture = (scheme.objects.find(o=>o.culture)||{}).culture || Object.keys(planting||{})[0] || '';
  push('planting ref works', !!planting && Object.keys(planting).length>0 && !!plantingRef(planting, firstCulture), 'ref for: '+firstCulture);
  push('schemeView has planting', !!schemeView.planting && Object.keys(schemeView.planting).length>0, Object.keys(schemeView.planting||{}).length+' keys');
  push('tutorial loaded', Array.isArray(tutorialSlides)&&tutorialSlides.length>0, (tutorialSlides.length||0)+' slides');
  push('scheme bounds', scheme.widthM>=4&&scheme.widthM<=60&&scheme.lengthM>=4&&scheme.lengthM<=60, scheme.widthM+'×'+scheme.lengthM);
  const inB = scheme.objects.every(o=>o.x>=-0.001&&o.y>=-0.001&&o.x+o.w<=scheme.widthM+0.001&&o.y+o.l<=scheme.lengthM+0.001);
  push('objects within bounds', inB, scheme.objects.length+' objects');
  push('completedTasks is object', !!scheme.completedTasks&&typeof scheme.completedTasks==='object', Object.keys(scheme.completedTasks||{}).length+' marks');
  let calOk=true, calDays=0;
  try { const beds=scheme.objects.filter(o=>(o.type==='bed'&&o.culture)||(o.type==='greenhouse'&&(o.greenhouseBedCultures||[]).some(Boolean))||((o.type==='tree'||o.type==='bush')&&o.culture)); const bd=buildCalendar(beds,phases,true,plants,planting,scheme.weather); calDays=Object.keys(bd).length; } catch(e){ calOk=false; console.error(e); }
  push('calendar builds', calOk, calDays+' days with tasks');
  push('nextId consistent', scheme.nextId === scheme.objects.reduce((m,o)=>Math.max(m,o.id||0),0)+1, 'nextId='+scheme.nextId);
  push('autosave wired', typeof scheduleAutosave==='function' && !!localStorage, 'localStorage sg-autosave');
  const prG = ensureProgress(scheme);   // 3.16
  push('progress shape', !!prG && typeof prG.streak.count==='number' && typeof prG.daily.done==='number' && prG.streak.count>=0, 'streak '+prG.streak.count+', daily '+prG.daily.done);
  console.table(report); return report;
};
console.info('Умный садовод: самопроверка — __sgSelfTest()');

/* --- 2.189: авто-заметки из выполненных задач (полив — только вручную) --- */
function autoNoteFromTask(key){
  const parts = String(key||'').split('|');
  if (parts.length < 3) return;
  const bid = parts[1];
  const name = parts.slice(2).join('|');
  const low = name.toLowerCase();
  if (low.includes('полив')) return;
  let type;
  if (low.includes('подкорм')) type = 'fertilizing';
  else if (low.includes('обработ') || low.includes('опрыск')) type = 'treatment';
  else if (low.includes('обрез') || low.includes('пасын')) type = 'pruning';
  else if (low.includes('сбор') || low.includes('урожай')) type = 'harvest';
  else if (low.includes('посев') || low.includes('посадк') || low.includes('высад') || low.includes('рассад')) type = 'planting';
  else type = 'other';
  const m = String(bid).match(/^(\d+)(?:-gh|:)(\d+)$/);
  let objId, suffix = '';
  if (m){ objId = Number(m[1]); suffix = ` (грядка ${+m[2]+1})`; }
  else objId = Number(bid);
  if (!Number.isFinite(objId)) return;
  if (!scheme.objects.some(o => o.id === objId)) return;
  schemeView.addNote(objId, type, `${name}${suffix}`);
}
document.addEventListener('change', function(e){
  const cb = e.target.closest('input[data-task-key]');
  if (!cb || !cb.checked) return;
  autoNoteFromTask(cb.dataset.taskKey);
});
let __bulkSnapshot = null;
document.addEventListener('click', function(e){
  const btn = e.target.closest('button');
  if (!btn) return;
  if ((btn.textContent||'').includes('Отметить задачи')) {
    __bulkSnapshot = new Set(Object.keys(scheme.completedTasks||{}));
  }
}, true);
window.addEventListener('sg-tasks-bulk-done', function(){
  if (!__bulkSnapshot) return;
  const snap = __bulkSnapshot; __bulkSnapshot = null;
  Object.keys(scheme.completedTasks||{}).forEach(key=>{
    if (!snap.has(key)) autoNoteFromTask(key);
  });
});

/* --- 3.6: первый вход: Приветствие → Обучение → Демо-участок --- */
function lsGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
function lsSet(k,v){ try { localStorage.setItem(k,v); } catch(e){} }
function startOnboarding(){
  if (!lsGet('sg-welcome-seen')) { showWelcome(); return; }
  if (!lsGet('sg-tutorial-seen') && tutorialSlides.length) { openTutorialThenDemo(); return; }
  demoStep();
}
function showWelcome(){
  const ov = document.getElementById('welcomeOverlay');
  if (!ov) { demoStep(); return; }
  ov.classList.remove('hidden');
  const start = ov.querySelector('#welcomeStart');
  const skip = ov.querySelector('#welcomeSkip');
  if (start) start.addEventListener('click', ()=>{
    lsSet('sg-welcome-seen','1'); ov.classList.add('hidden');
    if (!lsGet('sg-tutorial-seen') && tutorialSlides.length) openTutorialThenDemo();
    else demoStep();
  }, { once:true });
  if (skip) skip.addEventListener('click', ()=>{
    lsSet('sg-welcome-seen','1'); lsSet('sg-tutorial-seen','1'); ov.classList.add('hidden');
    demoStep();
  }, { once:true });
}
function openTutorialThenDemo(){
  const ov = document.getElementById('tutorialOverlay');
  let fired = false;
  const finish = ()=>{ if (fired) return; fired = true; setTimeout(demoStep, 50); };
  if (ov && window.MutationObserver){
    const mo = new MutationObserver(()=>{ if (ov.classList.contains('hidden')) { mo.disconnect(); finish(); } });
    mo.observe(ov, { attributes:true, attributeFilter:['class'] });
  }
  if (!tutorialSlides.length) { finish(); return; }
  tutorialView.open(0);
}
function demoStep(){
  if (lsGet('sg-demo-seen')) return;
  lsSet('sg-demo-seen','1');
  if (scheme.objects.length) return;
  loadDemo(false);
}
/* --- 3.6/3.8: демо-участок + флаг демо-режима --- */
function normalizeDemo(demo){
  (demo.objects||[]).forEach(o=>{
    if (o.type === 'greenhouse'){
      (o.greenhouseBedCultures||[]).forEach((c,i)=>{
        if (!c) return;
        const cp = schemeView._phaseDataFor(c);
        if (cp && !(o.greenhouseBedPhases||[])[i]){
          const first = PHASE_ORDER.find(ph=>cp[ph]);
          if (first){ const pd = (o.greenhouseBedPlantingDates||[])[i] || todayISO(); (o.greenhouseBedPhases = o.greenhouseBedPhases||[])[i] = { phase:first, phase_started:pd, phase_history:[{phase:first, started:pd, ended:null}] }; }
        }
      });
    } else if (o.culture && ['bed','tree','bush'].includes(o.type)){
      const cp = schemeView._phaseDataFor(o.culture);
      if (cp && !o.phase){
        const first = schemeView._initialPhaseFor(o, cp);
        if (first){ o.phase = first; o.phase_started = o.plantingDate || todayISO(); o.phase_history = [{phase:first, started:o.phase_started, ended:null}]; }
      }
    }
  });
}
async function loadDemo(replace){
  try {
    const res = await fetch('data/demo-scheme.json');
    if (!res.ok) throw new Error('demo fetch ' + res.status);
    const demo = deepTrim(await res.json());
    if (!demo || !Array.isArray(demo.objects) || !demo.objects.length) throw new Error('demo empty');
    if (replace && !confirm('Загрузить демо-участок поверх текущего плана?')) return;
    normalizeDemo(demo);
    applyScheme(demo);
    scheme.demoMode = true;
    showToast('Загружен демо-участок — осмотритесь!');
    vibrate([10,30,10]);   // 3.12
  } catch(e){ console.warn('demo:', e); showToast('Не удалось загрузить демо-участок'); }
}
on('loadDemoBtn', function(){ loadDemo(true); });
document.addEventListener('click', (e)=>{ if (e.target.closest('#objList [data-load-demo]')) loadDemo(false); });

/* --- 2.175: PWA-полировка --- */
let deferredInstall = null;
const installBtn = document.getElementById('installAppBtn');
const offlineBadge = document.getElementById('offlineBadge');
function updateInstallUI(){ if (installBtn) installBtn.style.display = deferredInstall ? '' : 'none'; }
window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); deferredInstall = e; updateInstallUI(); });
window.addEventListener('appinstalled', ()=>{ deferredInstall = null; updateInstallUI(); showToast('Приложение установлено ✓'); });
if (installBtn) installBtn.addEventListener('click', async ()=>{
  mCloseSheets();
  if (deferredInstall){
    deferredInstall.prompt();
    const r = await deferredInstall.userChoice;
    deferredInstall = null; updateInstallUI();
    if (r && r.outcome === 'accepted') showToast('Устанавливаем…');
  } else {
    const ios = /iphone|ipad/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    showToast(ios ? 'iOS: Поделиться → «На экран «Домой»»' : 'Браузер пока не предлагает установку — откройте по HTTPS и повторите позже');
  }
});
updateInstallUI();
function setOfflineBadge(offline){ if (offlineBadge) offlineBadge.classList.toggle('hidden', !offline); }
setOfflineBadge(!navigator.onLine);
window.addEventListener('offline', ()=>{ setOfflineBadge(true); showToast('Нет сети — приложение работает офлайн'); });
window.addEventListener('online', ()=>{ setOfflineBadge(false); showToast('Снова в сети'); });
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async ()=>{
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      reg.addEventListener('updatefound', ()=>{
        const nw = reg.installing; if (!nw) return;
        nw.addEventListener('statechange', ()=>{
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            if (confirm('Доступна новая версия приложения. Обновить сейчас?')) {
              navigator.serviceWorker.controller.postMessage('SKIP_WAITING');
            }
          }
        });
      });
      navigator.serviceWorker.addEventListener('controllerchange', ()=> location.reload());
      setInterval(()=>{ reg.update(); }, 60*60*1000);
    } catch(e){ console.warn('SW register:', e); }
  });
}

/* --- 2.178/3.9: shortcuts и share-target (home/analytics → stats) --- */
(function handleLaunchParams(){
  try {
    const url = new URL(location.href);
    const pageRaw = url.searchParams.get('page');
    const page = (pageRaw === 'home' || pageRaw === 'analytics') ? 'stats' : pageRaw;
    if (page && ['scheme','plants','calendar','chat','stats'].includes(page)) {
      setTimeout(()=>{ showScreen('screen-'+page); if (page==='stats') setStatsTab(pageRaw === 'analytics' ? 'analytics' : 'overview'); }, 0);
      url.searchParams.delete('page');
      window.history.replaceState(null, '', url.toString());
    }
    const sharedText = url.searchParams.get('text') || url.searchParams.get('title');
    const sharedUrl  = url.searchParams.get('url');
    if (sharedText || sharedUrl) {
      const preview = String(sharedText || sharedUrl).slice(0, 80);
      setTimeout(()=>showToast('Получено из «Поделиться»: ' + preview), 800);
      ['text','title','url'].forEach(k=>url.searchParams.delete(k));
      window.history.replaceState(null, '', url.toString());
    }
  } catch(e){}
})();
if ('launchQueue' in window) {
  window.launchQueue.setConsumer(async (params) => {
    if (!params.files || !params.files.length) return;
    try {
      const file = await params.files[0].getFile();
      const text = await file.text();
      const data = JSON.parse(text);
      const s = (data && data.scheme) ? data.scheme : data;
      if (!s || !Array.isArray(s.objects)) { showToast('Файл не похож на план участка'); return; }
      if (confirm('Импортировать полученный план участка? Текущее состояние будет заменено.')) {
        applyScheme(s);
        showToast('План импортирован из «Поделиться» ✓');
      }
    } catch(e){ showToast('Не удалось прочитать общий файл'); }
  });
}

/* --- первичный рендер и онбординг --- */
schemeView.render();
tryRestoreAutosave();
startOnboarding();   // 3.6: Приветствие → Обучение → Демо-участок
document.body.classList.toggle('on-scheme', true);   // 3.14: стартовый экран — Схема

/* --- 2.168: рантайм-замена эмодзи на знаки спрайта --- */
let swapRaf = 0;
function scheduleSwap(){
  if (swapRaf) return;
  swapRaf = requestAnimationFrame(()=>{ swapRaf = 0; try { swapEmojiInTextNodes(document.body); } catch(e){} });
}
if (window.MutationObserver){
  const mo = new MutationObserver(scheduleSwap);
  mo.observe(document.body, { childList:true, subtree:true });
}
scheduleSwap();