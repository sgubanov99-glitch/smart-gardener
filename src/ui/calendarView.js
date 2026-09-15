// src/ui/calendarView.js — экран «Календарь» (ревизия 2.110)
// 2.110: флаг scheme.geo.confirmed ставится при геолокации / вводе города / прогнозе /
//        правке координат — reminders по нему решает, показывать ли подсказку «Укажи город»
// 2.93: поле «Населённый пункт» с двусторонним геокодингом; кнопка геолокации 📍; прогноз 🌐
// 2.89: переключатель погоды; поливы в дожди — «можно пропустить»; советные задачи
// 2.85: параметр planting проброшен в buildCalendar
// 2.80: кнопка «Отметить все просроченные» видна всегда
import { screenHintHTML, emptyStateHTML, fmtDateRu } from './ux.js';
import { WEATHER_MODES, weatherMode, setWeatherMode, isRainExcused,
         fetchWeatherForecast, suggestModeFromForecast, forecastSummary,
         fetchPlaceName, fetchCoordsByPlace } from '../core/weather.js';

const CAT_COLOR = { planting:'#8A9B6E', watering:'#7E93B8', fertilizing:'#E8A05C', care:'#B9C79B', protection:'#8E77A0', harvest:'#D97E6A' };
const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const GEO_INPUT_STYLE = 'width:74px;border:1px solid rgba(63,62,58,.14);border-radius:8px;padding:4px 6px;font:600 12px Manrope,sans-serif;color:var(--ink)';
const GEO_PLACE_STYLE = 'width:150px;border:1px solid rgba(63,62,58,.14);border-radius:8px;padding:4px 8px;font:600 12px Manrope,sans-serif;color:var(--ink)';

function toDateStr(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; }
function addDaysISO(iso,n){ const dt=new Date(`${iso}T00:00:00`); dt.setDate(dt.getDate()+n); return toDateStr(dt); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }

export function createCalendarView({ scheme, phases, plants, planting, buildCalendar, onChange, onWeatherChange, onNotify }) {
  const root = document.getElementById('screen-calendar-body');
  let mode = 'list';
  const base = new Date(); base.setDate(1);
  let viewMonth = base.getMonth(), viewYear = base.getFullYear();
  let openDate = null;

  function notify(msg){ if (onNotify) onNotify(msg); else alert(msg); }
  function store(){ if(!scheme.completedTasks) scheme.completedTasks = {}; return scheme.completedTasks; }
  function taskKey(t){ return `${t.date}|${t.bed_id}|${t.name}`; }
  function isDone(t){ return !!store()[taskKey(t)]; }
  function toggleDone(t){
    const s = store(), k = taskKey(t);
    if (s[k]) delete s[k]; else s[k] = { at: toDateStr(new Date()) };
    if (s[k]) window.dispatchEvent(new CustomEvent('sg-task-done', { detail:{ task:t } }));
    if (onChange) onChange();
  }

  function bedsForCalendar(){
    return scheme.objects.filter(o =>
      (o.type==='bed'&&o.culture) ||
      (o.type==='greenhouse'&&(o.greenhouseBedCultures||[]).some(Boolean)) ||
      ((o.type==='tree'||o.type==='bush')&&o.culture)
    );
  }
  function allTasks(){
    const byDay = buildCalendar(bedsForCalendar(), phases, true, plants || [], planting, scheme.weather) || {};
    const out = [];
    Object.keys(byDay).forEach(d => byDay[d].forEach(t => out.push(t)));
    return out;
  }

  /* ---------- массовое отметание просроченных ---------- */
  function countOverdue(){
    const today = toDateStr(new Date());
    return allTasks().filter(t => t.date < today && !isDone(t) && !isRainExcused(scheme, t, today)).length;
  }
  function markAllOverdue(){
    const today = toDateStr(new Date());
    let n = 0;
    allTasks().forEach(t => {
      if (t.date < today && !isDone(t) && !isRainExcused(scheme, t, today)) { store()[taskKey(t)] = { at: today, bulk:true }; n++; }
    });
    if (n > 0) {
      window.dispatchEvent(new CustomEvent('sg-tasks-bulk-done', { detail:{ count:n } }));
      if (onChange) onChange();
    }
  }
  function bulkButtonHTML(){
    const n = countOverdue();
    if (!n) return `<button type="button" class="btn" disabled style="margin-top:14px;width:100%;opacity:.55;cursor:default">Просроченных задач нет ✓</button>`;
    return `<button type="button" class="btn btn-olive" data-bulk-done style="margin-top:14px;width:100%">✓ Отметить все просроченные выполненными (${n})</button>`;
  }

  /* ---------- погодная панель (2.93: населённый пункт + координаты) ---------- */
  function weatherBarHTML(){
    const cur = weatherMode(scheme);
    const curMode = WEATHER_MODES.find(m=>m.id===cur);
    const geo = scheme.geo || { lat: 55.75, lon: 37.62, placeName: 'Москва' };
    return `<div class="wx-bar">
        <span class="wx-title">🌦 Погода:</span>
        ${WEATHER_MODES.map(m=>`<button type="button" class="wx-btn ${cur===m.id?'active':''}" data-wx="${m.id}">${m.icon} ${m.label}</button>`).join('')}
        <span style="margin-left:auto;display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap">
          <input data-wx-place type="text" value="${esc(geo.placeName || '')}" placeholder="Населённый пункт" title="Населённый пункт для координат: введите название и нажмите Enter — координаты обновятся" style="${GEO_PLACE_STYLE}" />
          <input data-wx-lat type="number" step="0.01" min="-90" max="90" value="${geo.lat}" title="Широта" style="${GEO_INPUT_STYLE}" />
          <input data-wx-lon type="number" step="0.01" min="-180" max="180" value="${geo.lon}" title="Долгота" style="${GEO_INPUT_STYLE}" />
          <button type="button" class="wx-btn" data-wx-geo title="Определить моё местоположение">📍</button>
          <button type="button" class="wx-btn" data-wx-forecast title="Прогноз на 7 дней и рекомендация режима">🌐 Прогноз</button>
        </span>
      </div>
      ${curMode && cur!=='normal' ? `<div class="wx-hint">${curMode.icon} ${curMode.hint} Окно действия — 7 дней с момента включения.</div>` : ''}`;
  }

  /* ---------- геолокация и прогноз ---------- */
  function useGeolocation(){
    if (!navigator.geolocation) { notify('Геолокация недоступна — введите координаты вручную.'); return; }
    navigator.geolocation.getCurrentPosition(
      pos=>{
        scheme.geo = { lat: Math.round(pos.coords.latitude*100)/100, lon: Math.round(pos.coords.longitude*100)/100, placeName: null };
        scheme.geo.confirmed = true; // 2.110: пользователь подтвердил местоположение
        placeRequestedGuard();
        notify(`Координаты установлены: ${scheme.geo.lat}, ${scheme.geo.lon}`);
        render();
        resolvePlace();
      },
      ()=>notify('Не удалось определить местоположение — введите координаты вручную.')
    );
  }
  function fetchAndSuggest(){
    const latInput = root.querySelector('[data-wx-lat]');
    const lonInput = root.querySelector('[data-wx-lon]');
    const lat = parseFloat(latInput && latInput.value);
    const lon = parseFloat(lonInput && lonInput.value);
    if (!isFinite(lat) || !isFinite(lon)) { notify('Введите координаты: широту и долготу.'); return; }
    scheme.geo = { lat: lat, lon: lon, placeName: (scheme.geo && scheme.geo.placeName) || null };
    scheme.geo.confirmed = true; // 2.110: пользователь подтвердил местоположение
    resolvePlace(); // обновить название места для новых координат
    notify('Запрашиваю прогноз…');
    fetchWeatherForecast(lat, lon).then(daily=>{
      const modeId = suggestModeFromForecast(daily);
      const m = WEATHER_MODES.find(x=>x.id===modeId);
      const ok = confirm(`${forecastSummary(daily)}.\nРекомендую режим: ${m.icon} ${m.label}.\nУстановить этот режим погоды?`);
      if (ok) {
        setWeatherMode(scheme, modeId);
        if (onWeatherChange) onWeatherChange(modeId);
        render();
      }
    }).catch(err=>{
      console.warn('Прогноз не загрузился:', err);
      notify('Прогноз не загрузился (нет интернета?). Режимы погоды доступны вручную.');
    });
  }
  // 2.110: название места обновляется фоново (без блокировок)
  let placeTimer = null;
  function placeRequestedGuard(){ if (placeTimer) clearTimeout(placeTimer); }
  function resolvePlace(){
    const geo = scheme.geo;
    if (!geo || !isFinite(geo.lat) || !isFinite(geo.lon)) return;
    if (placeTimer) clearTimeout(placeTimer);
    placeTimer = setTimeout(()=>{
      fetchPlaceName(geo.lat, geo.lon).then(name=>{
        if (name && scheme.geo && scheme.geo.lat === geo.lat && scheme.geo.lon === geo.lon) {
          scheme.geo.placeName = name;
          render();
        }
      }).catch(()=>{});
    }, 250);
  }

  /* ---------- легенда ---------- */
  function legendHTML(){
    return `<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;font-size:12px;color:var(--ink-soft);margin-top:14px">
      <span><span style="color:#2F7D32;font-weight:700">✓</span> — выполнено</span>
      <span><span style="color:#9E9E9E">☐</span> — не выполнено</span>
      <span>🌧 — можно пропустить (дожди)</span>
    </div>`;
  }

  /* ---------- строка задачи ---------- */
  function taskRowHTML(t){
    const done = isDone(t);
    const today = toDateStr(new Date());
    const excused = !done && isRainExcused(scheme, t, today);
    const overdue = (!done && !excused && t.date < today);
    const st = done ? 'manual' : (t.date < today ? 'auto' : 'open');
    const icon = done ? '<span style="color:#2F7D32;font-weight:700" title="вы отметили выполненной">✓</span>'
      : st==='auto' ? '<span style="color:#9E9E9E;font-weight:700" title="дата прошла">✓</span>'
      : '<span style="color:#9E9E9E" title="не выполнена">☐</span>';
    const badge = overdue ? '<span style="background:var(--rose-dark);color:#fff;border-radius:999px;padding:1px 7px;font-size:10px;font-weight:700">просрочено</span>'
      : (excused ? '<span style="background:#7E93B8;color:#fff;border-radius:999px;padding:1px 7px;font-size:10px;font-weight:700">🌧 можно пропустить</span>' : '');
    return `<div style="display:flex;align-items:center;gap:10px;padding:7px 10px;background:#fff;border-radius:10px;box-shadow:var(--shadow-s);${excused?'opacity:.65;':''}">
      <label style="display:flex;align-items:center;gap:9px;flex:1;cursor:pointer">
        <input type="checkbox" data-task-key="${taskKey(t).replace(/"/g,'&quot;')}" ${done?'checked':''} />
        ${icon}
        <span style="font-weight:600;${done?'text-decoration:line-through;color:var(--ink-soft)':''}">${t.name}</span>
        <span style="font-size:12px;color:var(--ink-soft)">${t.crop ? t.crop + ' · ' : ''}${fmtDateRu(t.date, false)}</span>
        ${badge}
      </label>
    </div>`;
  }

  /* ---------- режим «Список» ---------- */
  function renderList(){
    const today = toDateStr(new Date());
    const end = addDaysISO(today, 21);
    const byDay = buildCalendar(bedsForCalendar(), phases, true, plants || [], planting, scheme.weather) || {};
    const dates = Object.keys(byDay).filter(d => d>=today && d<=end).sort();
    const body = dates.length ? dates.map(date=>{
      const isToday = date===today;
      return `<div style="margin-bottom:12px">
        <div style="font-weight:700;font-size:14px;color:var(--olive-dark);margin-bottom:6px">${fmtDateRu(date)}${isToday?' · сегодня':''}</div>
        <div style="display:flex;flex-direction:column;gap:6px">${byDay[date].map(taskRowHTML).join('')}</div>
      </div>`;
    }).join('') : emptyStateHTML({ icon:'🗓', title:'На ближайшие 3 недели задач нет', text:'Задачи появятся, когда у культур будут фазы и даты посадки.' });
    return weatherBarHTML() +
      screenHintHTML('Отметьте задачу галочкой — Цыпа вас похвалит 🐤. Кнопка внизу отметит сразу все просроченные задачи.') +
      `<div class="cal-mode-toggle">
        <button type="button" class="cal-mode-btn active" data-cal-mode="list">📋 Список (21 день)</button>
        <button type="button" class="cal-mode-btn" data-cal-mode="month">🗓 Месяц</button>
      </div>` + body + bulkButtonHTML() + legendHTML();
  }

  /* ---------- режим «Месяц» ---------- */
  function monthDays(){
    const first = new Date(viewYear, viewMonth, 1);
    const startDow = (first.getDay()+6)%7;
    const dim = new Date(viewYear, viewMonth+1, 0).getDate();
    const cells = [];
    for(let i=0;i<startDow;i++) cells.push(null);
    for(let d=1;d<=dim;d++) cells.push(toDateStr(new Date(viewYear, viewMonth, d)));
    return cells;
  }
  function renderMonth(){
    const byDay = buildCalendar(bedsForCalendar(), phases, true, plants || [], planting, scheme.weather) || {};
    const today = toDateStr(new Date());
    const cells = monthDays().map(date=>{
      if(!date) return '<div style="min-height:64px"></div>';
      const dayTasks = byDay[date]||[];
      const isOpen = openDate===date;
      const dots = dayTasks.slice(0,4).map(t=>`<span style="width:8px;height:8px;border-radius:50%;background:${CAT_COLOR[t.category]||'#999'};${isDone(t)?'opacity:.35':''}"></span>`).join('');
      return `<div data-cal-date="${date}" style="min-height:64px;border:1px solid rgba(63,62,58,.12);border-radius:8px;padding:5px;cursor:pointer;background:${isOpen?'rgba(138,155,110,.18)':'#fff'};${date===today?'outline:2px solid var(--rose-dark);':''}">
        <div style="font-weight:700;font-size:13px">${parseInt(date.slice(8),10)}</div>
        <div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:3px">${dots}${dayTasks.length>4?`<span style="font-size:10px;color:var(--ink-soft)">+${dayTasks.length-4}</span>`:''}</div>
      </div>`;
    }).join('');
    const detail = openDate ? `<div style="margin-top:12px">
        <div style="font-weight:700;color:var(--olive-dark);margin-bottom:6px">${fmtDateRu(openDate)}</div>
        <div style="display:flex;flex-direction:column;gap:6px">${(byDay[openDate]||[]).map(taskRowHTML).join('') || '<div style="color:var(--ink-soft)">Задач нет.</div>'}</div>
      </div>` : '';
    return weatherBarHTML() +
      screenHintHTML('Кликните по дню, чтобы раскрыть его задачи. Кнопка внизу отметит сразу все просроченные задачи.') +
      `<div class="cal-mode-toggle">
        <button type="button" class="cal-mode-btn" data-cal-mode="list">📋 Список (21 день)</button>
        <button type="button" class="cal-mode-btn active" data-cal-mode="month">🗓 Месяц</button>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <button type="button" class="btn" data-cal-nav="-1" style="padding:6px 12px">‹</button>
        <div style="font-family:'Neucha',cursive;font-size:22px;color:var(--olive-dark)">${MONTH_NAMES[viewMonth]} ${viewYear}</div>
        <button type="button" class="btn" data-cal-nav="1" style="padding:6px 12px">›</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:4px">
        ${['пн','вт','ср','чт','пт','сб','вс'].map(w=>`<div style="text-align:center;font:700 11px Manrope,sans-serif;color:var(--ink-soft);padding:4px 0">${w}</div>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">${cells}</div>
      ${detail}` + bulkButtonHTML() + legendHTML();
  }

  function render(){
    if(!root) return;
    root.innerHTML = mode==='list' ? renderList() : renderMonth();
  }

  /* ---------- события ---------- */
  if (root) {
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-wx-geo]')) { useGeolocation(); return; }
      if (e.target.closest('[data-wx-forecast]')) { fetchAndSuggest(); return; }
      const wxBtn = e.target.closest('[data-wx]');
      if (wxBtn) {
        setWeatherMode(scheme, wxBtn.dataset.wx);
        if (onWeatherChange) onWeatherChange(weatherMode(scheme));
        render();
        return;
      }
      const modeBtn = e.target.closest('[data-cal-mode]');
      if (modeBtn) { mode = modeBtn.dataset.calMode; openDate = null; render(); return; }
      const bulkBtn = e.target.closest('[data-bulk-done]');
      if (bulkBtn) { markAllOverdue(); return; }
      const nav = e.target.closest('[data-cal-nav]');
      if (nav) {
        viewMonth += parseInt(nav.dataset.calNav,10);
        if (viewMonth < 0) { viewMonth = 11; viewYear--; }
        if (viewMonth > 11) { viewMonth = 0; viewYear++; }
        openDate = null; render(); return;
      }
      const cell = e.target.closest('[data-cal-date]');
      if (cell) { openDate = (openDate===cell.dataset.calDate) ? null : cell.dataset.calDate; render(); return; }
    });
    root.addEventListener('change', (e) => {
      // 2.93/2.110: смена населённого пункта → обновление координат + флаг confirmed
      if (e.target.matches('[data-wx-place]')) {
        const name = (e.target.value || '').trim();
        const cur = scheme.geo || { lat: 55.75, lon: 37.62, placeName: 'Москва' };
        if (!name) {
          scheme.geo = { lat: cur.lat, lon: cur.lon, placeName: null };
          scheme.geo.confirmed = true; // 2.110
          resolvePlace();
          return;
        }
        if (cur.placeName === name) return;
        fetchCoordsByPlace(name).then(r=>{
          if (r) {
            scheme.geo = { lat: r.lat, lon: r.lon, placeName: r.placeName };
            scheme.geo.confirmed = true; // 2.110
            notify(`Координаты обновлены: ${r.lat}, ${r.lon}`);
            render();
          } else {
            notify('Не нашёл такой населённый пункт — уточню название по текущим координатам.');
            scheme.geo = { lat: cur.lat, lon: cur.lon, placeName: null };
            scheme.geo.confirmed = true; // 2.110
            resolvePlace();
          }
        }).catch(()=>{
          notify('Нет интернета: название обновится по координатам, либо введите координаты вручную.');
        });
        return;
      }
      // 2.93/2.110: сохранение координат + флаг confirmed + фоновое уточнение названия
      if (e.target.matches('[data-wx-lat],[data-wx-lon]')) {
        const lat = parseFloat((root.querySelector('[data-wx-lat]')||{}).value);
        const lon = parseFloat((root.querySelector('[data-wx-lon]')||{}).value);
        scheme.geo = { lat: isFinite(lat)?lat:55.75, lon: isFinite(lon)?lon:37.62, placeName: null };
        scheme.geo.confirmed = true; // 2.110
        resolvePlace();
        return;
      }
      if (!e.target.matches('input[type="checkbox"][data-task-key]')) return;
      const key = e.target.dataset.taskKey;
      const t = allTasks().find(x => taskKey(x)===key);
      if (t) toggleDone(t); else if (onChange) onChange();
    });
  }

  return { render };
}