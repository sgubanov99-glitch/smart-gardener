// src/core/calendar.js — генерация задач по фазам (ревизия 2.89)
// 2.89: погодные советные задачи (добавочные, базовые не трогаем) — параметр weather
// 2.85: возраст плодоношения многолетников — до первого плодоношения нет «Сбора урожая»
//       и «Обработки перед цветением», вместо них «Формирующая обрезка молодого растения»;
//       параметр planting проброшен в buildCalendar
// 2.81: задачи многолетников — только после даты посадки; задача «Посадка саженца»
// 2.33: сезонное окно Подмосковья 01.04–31.10; многолетники по реальным месяцам;
//       для посадок ранее текущего года фаза посадки игнорируется
import { PHASE_ORDER } from './phaseMachine.js';
import { plantingRef, perennialBearsIn } from './planting.js';
import { weatherAdvisoryTasks } from './weather.js';

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + dd;
}
function addDays(iso, n) {
  const dt = new Date(iso + 'T00:00:00');
  dt.setDate(dt.getDate() + n);
  return toDateStr(dt);
}
function deepTrim(v) {
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) return v.map(deepTrim);
  if (v && typeof v === 'object') {
    const r = {};
    const keys = Object.keys(v);
    for (let i = 0; i < keys.length; i++) {
      r[keys[i].trim()] = deepTrim(v[keys[i]]);
    }
    return r;
  }
  return v;
}
function toInt(v, def) {
  const n = parseInt(String(v).trim(), 10);
  if (isNaN(n)) return (def === undefined ? 0 : def);
  return n;
}
function parseFrequency(f) {
  if (!f) return null;
  const m = String(f).trim().match(/(\d+)/);
  if (!m) return null;
  return parseInt(m[1], 10);
}
function seasonBounds(today) {
  const y = today.slice(0, 4);
  return { seasonStart: y + '-04-01', seasonEnd: y + '-10-31' };
}
function inSeason(date, s) {
  return date >= s.seasonStart && date <= s.seasonEnd;
}
function mkDate(year, mm, dd) {
  return year + '-' + String(mm).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
}
const MONTHS_RU = [
  ['январ', 1], ['феврал', 2], ['март', 3], ['апрел', 4], ['ма', 5], ['июн', 6],
  ['июл', 7], ['август', 8], ['сентябр', 9], ['октябр', 10], ['ноябр', 11], ['декабр', 12]
];
function firstMonth(timing, def) {
  const s = String(timing || '').toLowerCase();
  for (let i = 0; i < MONTHS_RU.length; i++) {
    if (s.indexOf(MONTHS_RU[i][0]) !== -1) return MONTHS_RU[i][1];
  }
  return (def === undefined ? 8 : def);
}
function pushTask(out, bed, phaseKey, task, date, today) {
  out.push({
    bed_id: bed.id,
    crop: (bed.crop || bed.culture || ''),
    phase: phaseKey,
    name: task.name,
    date: date,
    category: task.category,
    priority: task.priority,
    done: false,
    overdue: date < today
  });
}
function phaseTasks(bed, phaseKey, phase, start, end, today, s, out) {
  const tasks = phase.tasks || [];
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const td = addDays(start, toInt(task.offset_days, 0));
    const freq = parseFrequency(task.frequency);
    if (!task.frequency || !freq) {
      if (td <= end && inSeason(td, s)) pushTask(out, bed, phaseKey, task, td, today);
    } else {
      let d = td;
      while (d <= end) {
        if (inSeason(d, s)) pushTask(out, bed, phaseKey, task, d, today);
        d = addDays(d, freq);
      }
    }
  }
}

/* годовая проекция для однолетних (цепочка фаз от посадки) */
export function generateYearTasks(bed, cropData) {
  const cd = deepTrim(cropData);
  const phasesObj = cd.phases || cd;
  let order = PHASE_ORDER.filter(function (ph) { return !!phasesObj[ph]; });
  if (order.length === 0) return generateGenericTasks(bed, true);
  const today = toDateStr(new Date());
  const s = seasonBounds(today);
  const pd = bed.plantingDate || null;
  const plantedBeforeYear = !!pd && pd.slice(0, 4) < today.slice(0, 4);
  if (plantedBeforeYear) {
    order = order.filter(function (ph) {
      return ph !== 'seed' && ph !== 'seedling' && ph !== 'planting';
    });
    if (order.length === 0) return [];
  }
  let start;
  if (plantedBeforeYear) {
    start = s.seasonStart;
  } else if (pd) {
    start = (pd < s.seasonStart) ? s.seasonStart : pd;
  } else {
    const ps = bed.phase_started || today;
    start = (ps < s.seasonStart) ? s.seasonStart : ps;
  }
  if (start > s.seasonEnd) return [];
  const out = [];
  let cur = start;
  for (let i = 0; i < order.length; i++) {
    const ph = order[i];
    const phase = phasesObj[ph];
    const end = addDays(cur, toInt(phase.duration_days, 0));
    phaseTasks(bed, ph, phase, cur, end, today, s, out);
    cur = end;
    if (cur > s.seasonEnd) break;
  }
  return out;
}

/* многолетники по реальным месяцам (из harvest_timing) */
export function generatePerennialYearTasks(bed, plant, planting) {
  const today = toDateStr(new Date());
  const s = seasonBounds(today);
  const y = today.slice(0, 4);
  const hm = firstMonth(plant && plant.harvest_timing, 8);
  const fm = Math.max(4, hm - 1);
  // 2.81: задачи только после даты посадки
  const pd = bed.plantingDate || null;
  const notBefore = (pd && pd.slice(0, 4) >= y) ? pd : null;
  // 2.85: плодоносит ли растение в этом году (возраст по first_fruit_year из справочника)
  const bears = pd ? perennialBearsIn(Number(y), pd, planting ? plantingRef(planting, bed.crop || bed.culture) : null) : true;
  const out = [];
  function push(name, date, category, priority) {
    if (notBefore && date < notBefore) return;
    if (inSeason(date, s)) {
      out.push({ bed_id: bed.id, crop: (bed.crop || bed.culture || ''), phase: null, name: name, date: date, category: category, priority: priority, done: false, overdue: date < today });
    }
  }
  // 2.81: для новой посадки — задача «Посадка саженца» в день посадки
  if (pd && pd.slice(0, 4) === y && pd >= today) push('Посадка саженца', pd, 'planting', 'high');
  push('Весенняя подкормка', mkDate(y, 4, 15), 'fertilizing', 'medium');
  let d = mkDate(y, 4, 1);
  const dEnd = mkDate(y, 5, 31);
  while (d <= dEnd) { push('Полив в засуху', d, 'watering', 'medium'); d = addDays(d, 7); }
  if (bears) {
    push('Обработка перед цветением', mkDate(y, fm, 20), 'protection', 'medium');
    let h = mkDate(y, hm, 1);
    const hEnd = mkDate(y, hm, 28);
    while (h <= hEnd) { push('Сбор урожая', h, 'harvest', 'high'); h = addDays(h, 3); }
  } else {
    // 2.85: молодое растение — формировка кроны вместо обработки и сбора
    push('Формирующая обрезка молодого растения', mkDate(y, 4, 20), 'care', 'medium');
  }
  push('Санитарная обрезка', mkDate(y, 10, 10), 'care', 'medium');
  push('Побелка/укрытие на зиму', mkDate(y, 10, 20), 'care', 'medium');
  return out;
}

/* базовый график (фолбэк для культур без фаз) */
export function generateGenericTasks(bed, fullRange) {
  const today = toDateStr(new Date());
  const s = seasonBounds(today);
  let start = bed.phase_started || bed.plantingDate || today;
  if (start < s.seasonStart) start = s.seasonStart;
  if (start > s.seasonEnd) return [];
  const horizon = addDays(start, 120);
  const end = fullRange ? horizon : (horizon < today ? today : horizon);
  const out = [];
  function push(name, date, category, priority) {
    if (inSeason(date, s)) {
      out.push({ bed_id: bed.id, crop: (bed.crop || bed.culture || ''), phase: null, name: name, date: date, category: category, priority: priority, done: false, overdue: date < today });
    }
  }
  push('Посадка/посев', start, 'planting', 'high');
  let d = addDays(start, 3);
  while (d <= end) { push('Полив', d, 'watering', 'medium'); d = addDays(d, 3); }
  let f = addDays(start, 14);
  while (f <= end) { push('Подкормка', f, 'fertilizing', 'medium'); f = addDays(f, 14); }
  push('Сбор урожая', horizon, 'harvest', 'high');
  return out;
}

/* задачи текущей фазы (для бота / превью) */
export function generateTasks(bed, cropData, fullRange) {
  if (!bed || !cropData) return [];
  const cd = deepTrim(cropData);
  const phasesObj = cd.phases || cd;
  const phaseKey = String(bed.phase || '').trim();
  const phase = phasesObj[phaseKey];
  if (!phase) return [];
  const start = bed.phase_started || bed.plantingDate;
  if (!start) return [];
  const today = toDateStr(new Date());
  const endDate = addDays(start, toInt(phase.duration_days, 0));
  const effectiveEnd = fullRange ? endDate : (endDate < today ? today : endDate);
  const s = seasonBounds(today);
  const out = [];
  phaseTasks(bed, phaseKey, phase, start, effectiveEnd, today, s, out);
  return out;
}

export function buildCalendar(beds, cropsDB, fullRange, plants, planting, weather) {
  const db = deepTrim(cropsDB || {});
  const plantList = deepTrim(plants || []);
  const byDay = {};
  function push(t) {
    if (!byDay[t.date]) byDay[t.date] = [];
    byDay[t.date].push(t);
  }
  function findPlant(name) {
    const lower = String(name).trim().toLowerCase();
    for (let i = 0; i < plantList.length; i++) {
      if (String(plantList[i].name).trim().toLowerCase() === lower) return plantList[i];
    }
    return null;
  }
  function findKey(lower) {
    const keys = Object.keys(db);
    for (let i = 0; i < keys.length; i++) {
      if (keys[i].trim().toLowerCase() === lower) return db[keys[i]];
    }
    return null;
  }
  function route(bed, cropName) {
    const plant = findPlant(cropName);
    const isPerennial = !!plant && /дерево|кустарник/.test(plant.type);
    if (isPerennial) return generatePerennialYearTasks(bed, plant, planting);
    const cropData = findKey(String(cropName).trim().toLowerCase());
    if (cropData) return generateYearTasks(bed, cropData);
    return generateGenericTasks(bed, fullRange);
  }
  for (let b = 0; b < beds.length; b++) {
    const bed = beds[b];
    if (bed.type === 'greenhouse') {
      const cultures = bed.greenhouseBedCultures || [];
      for (let i = 0; i < cultures.length; i++) {
        const c = cultures[i];
        if (!c) continue;
        const bp = (bed.greenhouseBedPhases || [])[i];
        const vb = {
          id: bed.id + '-gh' + i,
          crop: c,
          type: 'bed',
          phase: bp ? bp.phase : null,
          phase_started: bp ? bp.phase_started : null,
          plantingDate: (bed.greenhouseBedPlantingDates || [])[i]
        };
        const tasks = route(vb, c);
        for (let t = 0; t < tasks.length; t++) push(tasks[t]);
      }
    } else {
      const cropName = bed.crop || bed.culture;
      if (!cropName) continue;
      const tasks = route(bed, cropName);
      for (let t = 0; t < tasks.length; t++) push(tasks[t]);
    }
  }
  // 2.89: погодные советные задачи (добавочные — базовые и отметки не трогаем)
  weatherAdvisoryTasks(beds, { weather: weather }, toDateStr(new Date())).forEach(push);
  const prioOrder = { high: 0, medium: 1, low: 2 };
  const dates = Object.keys(byDay).sort();
  for (let i = 0; i < dates.length; i++) {
    byDay[dates[i]].sort(function (a, b2) {
      const pa = (prioOrder[a.priority] === undefined ? 1 : prioOrder[a.priority]);
      const pb = (prioOrder[b2.priority] === undefined ? 1 : prioOrder[b2.priority]);
      return pa - pb;
    });
  }
  return byDay;
}