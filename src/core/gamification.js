// src/core/gamification.js — геймификация: чистые функции (ревизия 3.16)
// 3.16: прогресс сезона (выполнено/всего задач по сегодня), серия дней (streak), дневная цель (3 задачи).
//      Данные: scheme.progress = { streak:{last,count,best}, daily:{date,done,met}, achievements:{} }.
//      Функции идемпотентны и без побочных эффектов вне переданных объектов; DOM не трогают.
export const DAILY_GOAL = 3;

function addDaysISO(iso, n){
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const p = (x)=>String(x).padStart(2,'0');
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
}

/* Миграция/гарантия структуры: старые планы без progress получают дефолт */
export function ensureProgress(scheme){
  if (!scheme || typeof scheme !== 'object') return null;
  if (!scheme.progress || typeof scheme.progress !== 'object'){
    scheme.progress = { streak:{ last:'', count:0, best:0 }, daily:{ date:'', done:0, met:'' }, achievements:{} };
  }
  const p = scheme.progress;
  if (!p.streak || typeof p.streak !== 'object') p.streak = { last:'', count:0, best:0 };
  if (!p.daily  || typeof p.daily  !== 'object') p.daily  = { date:'', done:0, met:'' };
  if (!p.achievements || typeof p.achievements !== 'object') p.achievements = {};
  p.streak.count = Number(p.streak.count) || 0;
  p.streak.best  = Number(p.streak.best)  || 0;
  p.daily.done   = Number(p.daily.done)   || 0;
  return p;
}

/* Серия: день с ≥1 отмеченной задачей продлевает серию; пропуск сбрасывает к 1.
   Повторный вызов в тот же день ничего не меняет (идемпотентно). */
export function touchStreak(progress, today){
  const st = progress.streak;
  if (st.last === today) return false;
  st.count = (st.last === addDaysISO(today, -1)) ? st.count + 1 : 1;
  st.last = today;
  if (st.count > st.best) st.best = st.count;
  return true;
}

/* Состояние дневной цели на сегодня */
export function dailyGoalState(progress, today){
  const dl = progress.daily;
  const done = (dl.date === today) ? Math.min(dl.done, DAILY_GOAL) : 0;
  return { done, goal: DAILY_GOAL, met: dl.met === today };
}

/* Прибавить выполненные задачи дня; вернуть true в момент достижения цели (один раз в день) */
export function addDailyDone(progress, today, n){
  const dl = progress.daily;
  if (dl.date !== today){ dl.date = today; dl.done = 0; }
  dl.done += (n || 1);
  const metNow = (dl.done >= DAILY_GOAL && dl.met !== today);
  if (metNow) dl.met = today;
  return metNow;
}

/* Прогресс сезона: задачи с date <= today из byDay; done — по completedTasks (ключ date|bed_id|name) */
export function seasonProgress(byDay, completedTasks, today){
  let total = 0, done = 0;
  const cm = completedTasks || {};
  Object.keys(byDay || {}).forEach(d=>{
    if (d > today) return;
    (byDay[d] || []).forEach(t=>{
      total++;
      const key = t.date + '|' + t.bed_id + '|' + t.name;
      if (cm[key]) done++;
    });
  });
  const pct = total ? Math.round(done * 100 / total) : 0;
  return { total, done, pct };
}