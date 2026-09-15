// src/core/weather.js — ручные режимы погоды + прогноз + название места (ревизия 2.114)
// 2.114: цепочки запасных источников на случай блокировок сети:
//        прогноз: Open-Meteo → met.no; город→координаты: Open-Meteo → photon.komoot.io;
//        координаты→город: BigDataCloud → Nominatim (OpenStreetMap)
// 2.93: fetchCoordsByPlace() — координаты по названию населённого пункта
// 2.92: fetchPlaceName() — обратное геокодирование координат в населённый пункт
// 2.91: fetchWeatherForecast() — 7-дневный прогноз; suggestModeFromForecast()
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

/* ---------- прогноз: основной Open-Meteo ---------- */
async function fetchOpenMeteo(lat, lon){
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

/* ---------- 2.114: прогноз запасной — met.no (без ключа, CORS открыт) ---------- */
async function fetchMetNo(lat, lon){
  const url = 'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=' + encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lon);
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  const ts = (j.properties && j.properties.timeseries) || [];
  if (!ts.length) throw new Error('нет данных timeseries');
  const byDate = {};
  ts.forEach(e=>{
    const d = String(e.time).slice(0,10);
    const b = byDate[d] || (byDate[d] = { tmin: Infinity, tmax: -Infinity, pr: 0 });
    const t = e.data && e.data.instant && e.data.instant.details && e.data.instant.details.air_temperature;
    if (typeof t === 'number') { if (t < b.tmin) b.tmin = t; if (t > b.tmax) b.tmax = t; }
    const h = new Date(e.time).getUTCHours();
    const p6 = e.data && e.data.next_6_hours && e.data.next_6_hours.details && e.data.next_6_hours.details.precipitation_amount;
    if (typeof p6 === 'number' && h % 6 === 0) b.pr += p6; // суммируем без двойного учёта
  });
  const dates = Object.keys(byDate).sort().slice(0,7);
  if (!dates.length) throw new Error('нет данных за дни');
  return {
    temperature_2m_min: dates.map(d => byDate[d].tmin === Infinity ? null : byDate[d].tmin),
    temperature_2m_max: dates.map(d => byDate[d].tmax === -Infinity ? null : byDate[d].tmax),
    precipitation_sum:  dates.map(d => Math.round(byDate[d].pr*10)/10)
  };
}

/* ---------- прогноз: основной + запасной ---------- */
export async function fetchWeatherForecast(lat, lon){
  try {
    return await fetchOpenMeteo(lat, lon);
  } catch(e){
    console.warn('Open-Meteo недоступен, пробую met.no:', e);
  }
  return await fetchMetNo(lat, lon); // ошибка met.no уйдёт наверх — там штатный тост
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

/* ---------- координаты по названию: основной Open-Meteo, запасной photon ---------- */
export async function fetchCoordsByPlace(name){
  try {
    const url = 'https://geocoding-api.open-meteo.com/v1/search'
      + '?name=' + encodeURIComponent(name) + '&count=1&language=ru&format=json';
    const res = await fetch(url);
    if (res.ok) {
      const j = await res.json();
      const r = (j.results || [])[0];
      if (r && isFinite(r.latitude) && isFinite(r.longitude)) {
        return { lat: Math.round(r.latitude*100)/100, lon: Math.round(r.longitude*100)/100, placeName: r.name || name };
      }
    }
  } catch(e){
    console.warn('Open-Meteo geocoding недоступен, пробую photon:', e);
  }
  const url2 = 'https://photon.komoot.io/api/?q=' + encodeURIComponent(name) + '&lang=ru&limit=1';
  const res2 = await fetch(url2);
  if (!res2.ok) throw new Error('HTTP ' + res2.status);
  const j2 = await res2.json();
  const f = (j2.features || [])[0];
  if (!f || !f.geometry || !f.geometry.coordinates) return null;
  const lon = f.geometry.coordinates[0], lat = f.geometry.coordinates[1];
  const pn = (f.properties && (f.properties.name || f.properties.city)) || name;
  return { lat: Math.round(lat*100)/100, lon: Math.round(lon*100)/100, placeName: pn };
}

/* ---------- название по координатам: основной BigDataCloud, запасной Nominatim ---------- */
export async function fetchPlaceName(lat, lon){
  try {
    const url = 'https://api.bigdatacloud.net/data/reverse-geocode-client'
      + '?latitude=' + encodeURIComponent(lat)
      + '&longitude=' + encodeURIComponent(lon)
      + '&localityLanguage=ru';
    const res = await fetch(url);
    if (res.ok) {
      const j = await res.json();
      const city = j.city || j.locality || '';
      const region = j.principalSubdivision || '';
      const country = j.countryName || '';
      let name = city;
      if (region && region !== city) name = name ? name + ', ' + region : region;
      if (!name) name = country;
      if (name) return name;
    }
  } catch(e){
    console.warn('BigDataCloud недоступен, пробую Nominatim:', e);
  }
  const url2 = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2'
    + '&lat=' + encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lon) + '&accept-language=ru';
  const res2 = await fetch(url2);
  if (!res2.ok) throw new Error('HTTP ' + res2.status);
  const j2 = await res2.json();
  const a = j2.address || {};
  const name = a.city || a.town || a.village || a.municipality || a.county || a.state || '';
  return name || null;
}