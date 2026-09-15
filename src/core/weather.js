// src/core/weather.js — ручные режимы погоды + прогноз + название места (ревизия 2.93)
// 2.93: fetchCoordsByPlace() — координаты по названию населённого пункта (геокодер Open-Meteo)
// 2.92: fetchPlaceName() — обратное геокодирование координат в населённый пункт (BigDataCloud)
// 2.91: fetchWeatherForecast() — 7-дневный прогноз Open-Meteo; suggestModeFromForecast()
// 2.90: теплицы в засуху/дожди — по обычной схеме; в холод — «закрыть двери и форточки»;
//       деревья и кустарники в холод — по обычной схеме
// 2.89: режимы «Обычная / Засуха / Дожди / Холод», окно действия 7 дней; советные задачи
function toDateStr(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; }
function addDaysISO(iso,n){ const dt=new Date(`${iso}T00:00:00`); dt.setDate(dt.getDate()+n); return toDateStr(dt); }

export const WEATHER_MODES = [
  { id:'normal',  icon:'☀️', label:'Обычная',  hint:'Погода обычная — календарь работает как всегда.' },
  { id:'drought', icon:'🔥', label:'Засуха',   hint:'Засуха: добавила дополнительные поливы открытому грунту на неделю.' },
  { id:'rain',    icon:'🌧️', label:'Дожди',   hint:'Дожди: поливы открытого грунта на этой неделе можно пропустить.' },
  { id:'cold',    icon:'❄️', label:'Холод',    hint:'Холод: напомнила укрыть растения и закрыть теплицу.' }
];

export function weatherMode(scheme){ return (scheme && scheme.weather && scheme.weather.mode) || 'normal'; }
export function weatherUpdatedAt(scheme){ return (scheme && scheme.weather && scheme.weather.updatedAt) || null; }
export function setWeatherMode(scheme, mode){
  scheme.weather = { mode: mode, updatedAt: toDateStr(new Date()) };
}

export function weatherWindow(scheme, today){
  const mode = weatherMode(scheme);
  if (mode === 'normal') return null;
  const start = weatherUpdatedAt(scheme) || today;
  const from = start > today ? start : today;
  const to = addDaysISO(start, 6);
  if (to < from) return null;
  return { mode: mode, from: from, to: to };
}

export function isRainExcused(scheme, task, today){
  const w = weatherWindow(scheme, today);
  if (!w || w.mode !== 'rain') return false;
  if (task.category !== 'watering') return false;
  if (task.date < w.from || task.date > w.to) return false;
  const obj = (scheme.objects||[]).find(o => o.id === task.bed_id);
  if (obj && obj.type === 'greenhouse') return false; // под крышу дождь не попадает
  return true;
}

export function weatherAdvisoryTasks(beds, scheme, today){
  const w = weatherWindow(scheme, today);
  if (!w || w.mode === 'rain') return [];
  const step = w.mode === 'drought' ? 2 : 3;
  const out = [];
  (beds||[]).forEach(bed=>{
    const isGh = bed.type === 'greenhouse';
    const isPeren = bed.type === 'tree' || bed.type === 'bush';
    let name = null, category = null;
    if (w.mode === 'drought') {
      if (isGh) return;
      name = 'Дополнительный полив (засуха)';
      category = 'watering';
    } else { // cold
      if (isPeren) return;
      name = isGh ? 'Закрыть все двери и форточки теплицы' : 'Холод: укройте растения';
      category = 'care';
    }
    const crop = bed.crop || bed.culture || (bed.greenhouseBedCultures||[]).filter(Boolean).join(', ');
    if (!crop) return;
    for (let d = w.from; d <= w.to; d = addDaysISO(d, step)) {
      out.push({ bed_id: bed.id, crop: crop, phase: null, name: name, date: d, category: category, priority: 'medium', done: false, overdue: false });
    }
  });
  return out;
}

/* ---------- прогноз Open-Meteo (бесплатно, без ключа) ---------- */
export async function fetchWeatherForecast(lat, lon){
  const url = 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=' + encodeURIComponent(lat)
    + '&longitude=' + encodeURIComponent(lon)
    + '&daily=precipitation_sum,temperature_2m_max,temperature_2m_min'
    + '&forecast_days=7&timezone=auto';
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const json = await res.json();
  if (!json || !json.daily) throw new Error('нет данных daily');
  return json.daily;
}

export function suggestModeFromForecast(daily){
  const tmin = (daily.temperature_2m_min || []).filter(v => v != null && isFinite(v));
  const tmax = (daily.temperature_2m_max || []).filter(v => v != null && isFinite(v));
  const pr = (daily.precipitation_sum || []).map(v => Number(v) || 0);
  if (tmin.some(t => t <= 2)) return 'cold';
  const sum = pr.reduce((a,b)=>a+b, 0);
  const rainyDays = pr.filter(p => p >= 3).length;
  if (sum >= 20 || rainyDays >= 3) return 'rain';
  if (sum <= 3 && tmax.some(t => t >= 24)) return 'drought';
  return 'normal';
}

export function forecastSummary(daily){
  const tmin = (daily.temperature_2m_min || []).filter(v => v != null && isFinite(v));
  const tmax = (daily.temperature_2m_max || []).filter(v => v != null && isFinite(v));
  const pr = (daily.precipitation_sum || []).map(v => Number(v) || 0);
  const sum = pr.reduce((a,b)=>a+b, 0);
  const lo = tmin.length ? Math.round(Math.min(...tmin)) : null;
  const hi = tmax.length ? Math.round(Math.max(...tmax)) : null;
  const t = (lo != null && hi != null) ? `, температура ${lo}…${hi}°C` : '';
  return `Прогноз на 7 дней: осадки ${Math.round(sum)} мм${t}`;
}

/* ---------- населённый пункт по координатам (бесплатно, без ключа) ---------- */
export async function fetchPlaceName(lat, lon){
  const url = 'https://api.bigdatacloud.net/data/reverse-geocode-client'
    + '?latitude=' + encodeURIComponent(lat)
    + '&longitude=' + encodeURIComponent(lon)
    + '&localityLanguage=ru';
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  const city = j.city || j.locality || '';
  const region = j.principalSubdivision || '';
  const country = j.countryName || '';
  let name = city;
  if (region && region !== city) name = name ? name + ', ' + region : region;
  if (!name) name = country;
  return name || null;
}

/* ---------- координаты по названию населённого пункта (геокодер Open-Meteo) ---------- */
export async function fetchCoordsByPlace(name){
  const url = 'https://geocoding-api.open-meteo.com/v1/search'
    + '?name=' + encodeURIComponent(name)
    + '&count=1&language=ru&format=json';
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  const r = (j.results || [])[0];
  if (!r || !isFinite(r.latitude) || !isFinite(r.longitude)) return null;
  return { lat: Math.round(r.latitude*100)/100, lon: Math.round(r.longitude*100)/100, placeName: r.name || name };
}