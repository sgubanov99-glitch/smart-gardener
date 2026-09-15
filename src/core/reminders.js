// src/core/reminders.js — авто-подсказки погоды и прогноза (ревизия 2.110)
// 2.110: разовая за сеанс подсказка «Укажи свой город» — если scheme.geo.confirmed !== true
// 2.100: тихая проверка прогноза раз в день (Open-Meteo) с кэшем в localStorage;
//        подсказки: режим истёк, режим истекает сегодня/завтра, прогноз предлагает другой режим
import { WEATHER_MODES, weatherMode, weatherWindow,
         fetchWeatherForecast, suggestModeFromForecast, forecastSummary } from './weather.js';

const CHECK_EVERY_MS = 10 * 60 * 1000;   // перепроверка состояния каждые 10 минут
const FC_KEY_CHECK = 'sg-fc-check';      // дата последней проверки прогноза
const FC_KEY_SUGGEST = 'sg-fc-suggest';  // { date, mode, summary }

let geoTipShownThisSession = false; // 2.110: подсказка про город — один раз за сеанс

function todayStr(){ const d=new Date(); const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; }
function daysBetween(a,b){ return Math.round((new Date(b) - new Date(a)) / 86400000); }

export function createReminders({ scheme, notify, refreshTsypa }) {
  let forecastSuggestion = null; // { mode, summary } на сегодня
  const shownIds = new Set();    // уже показанные тостом за сеанс
  let timer = null;

  function loadStoredSuggestion(){
    try {
      const raw = localStorage.getItem(FC_KEY_SUGGEST);
      if (!raw) return null;
      const j = JSON.parse(raw);
      if (j && j.date === todayStr() && j.mode) return { mode: j.mode, summary: j.summary || '' };
    } catch(e){}
    return null;
  }

  /* тихая проверка прогноза не чаще раза в день */
  async function checkForecastOncePerDay(){
    const today = todayStr();
    try {
      if (localStorage.getItem(FC_KEY_CHECK) === today) { forecastSuggestion = loadStoredSuggestion(); return; }
    } catch(e){}
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const geo = scheme.geo;
    if (!geo || !isFinite(geo.lat) || !isFinite(geo.lon)) return;
    try {
      const daily = await fetchWeatherForecast(geo.lat, geo.lon);
      const mode = suggestModeFromForecast(daily);
      const summary = forecastSummary(daily);
      forecastSuggestion = { mode: mode, summary: summary };
      try {
        localStorage.setItem(FC_KEY_CHECK, today);
        localStorage.setItem(FC_KEY_SUGGEST, JSON.stringify({ date: today, mode: mode, summary: summary }));
      } catch(e){}
    } catch(e){ /* тихо: нет сети или сервис недоступен */ }
  }

  /* актуальные подсказки (по приоритету) */
  function list(){
    const today = todayStr();
    const out = [];
    const mode = weatherMode(scheme);
    const w = weatherWindow(scheme, today);
    const meta = WEATHER_MODES.find(m=>m.id===mode);

    // 1) режим истёк
    if (mode !== 'normal' && !w && meta) {
      out.push({ id:'wx-expired', priority:1, text:`${meta.icon} Режим «${meta.label}» истёк. Обнови погоду или переключи на «Обычная».` });
    }
    // 2) режим истекает сегодня/завтра
    if (mode !== 'normal' && w && meta) {
      const left = daysBetween(today, w.to);
      if (left === 0) out.push({ id:'wx-today', priority:2, text:`${meta.icon} Режим «${meta.label}» действует до сегодня — после обнови погоду.` });
      else if (left === 1) out.push({ id:'wx-tomorrow', priority:2, text:`${meta.icon} Режим «${meta.label}» действует до завтра — пора обновлять.` });
    }
    // 2.110: разовая за сеанс подсказка — если местоположение ещё не подтверждено
    const geo = scheme.geo;
    if (!geoTipShownThisSession && (!geo || !geo.confirmed)) {
      out.push({ id:'geo-tip', priority:3, text:'📍 Укажи свой город в панели погоды — и я буду подсказывать по реальному прогнозу!' });
      geoTipShownThisSession = true;
    }
    // 3) прогноз предлагает другой режим
    if (forecastSuggestion) {
      const sm = WEATHER_MODES.find(m=>m.id===forecastSuggestion.mode);
      if (sm && forecastSuggestion.mode !== mode) {
        if (forecastSuggestion.mode === 'normal') {
          out.push({ id:'fc-normal', priority:4, text:`🌤 Прогноз: аномалий впереди нет. Можно переключить погоду на «Обычная».` });
        } else {
          out.push({ id:'fc-' + forecastSuggestion.mode, priority:4, text:`${sm.icon} Прогноз предлагает режим «${sm.label}». ${forecastSuggestion.summary}` });
        }
      }
    }
    return out.sort((a,b)=>a.priority-b.priority);
  }

  /* показать новые подсказки тостом + обновить Цыпу */
  function evaluate(toastNew){
    const rems = list();
    if (toastNew) {
      const fresh = rems.find(r=>!shownIds.has(r.id));
      if (fresh) { shownIds.add(fresh.id); if (notify) notify(fresh.text); }
    }
    if (refreshTsypa) refreshTsypa();
    return rems;
  }

  async function start(){
    await checkForecastOncePerDay();
    setTimeout(()=>evaluate(true), 1500); // не мешаем обучению и первому рендеру
    timer = setInterval(()=>{ evaluate(true); }, CHECK_EVERY_MS);
  }
  function stop(){ if (timer) { clearInterval(timer); timer = null; } }

  return { start, stop, list, evaluate };
}