// src/core/gamification.js — геймификация: чистые функции (ревизия 3.19)
// 3.19: задания дня: ensureChallenges/markChallenge (сброс по дате, метка met, счётчик challengesMet);
//      13-е достижение «Пять идеальных дней» (challengesMet >= 5)
// 3.17: достижения (бейджи): ACHIEVEMENTS + checkAchievements; счётчики counters {saves,prints,advisor}, daily.metCount
// 3.16: прогресс сезона, серия дней (streak), дневная цель (3 задачи); scheme.progress миграция
export const DAILY_GOAL = 3;

function addDaysISO(iso, n){
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const p = (x)=>String(x).padStart(2,'0');
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
}

export function ensureProgress(scheme){
  if (!scheme || typeof scheme !== 'object') return null;
  if (!scheme.progress || typeof scheme.progress !== 'object'){
    scheme.progress = { streak:{ last:'', count:0, best:0 }, daily:{ date:'', done:0, met:'', metCount:0 }, achievements:{}, counters:{ saves:0, prints:0, advisor:0 }, challengesMet:0 };
  }
  const p = scheme.progress;
  if (!p.streak || typeof p.streak !== 'object') p.streak = { last:'', count:0, best:0 };
  if (!p.daily  || typeof p.daily  !== 'object') p.daily  = { date:'', done:0, met:'', metCount:0 };
  if (!p.achievements || typeof p.achievements !== 'object') p.achievements = {};
  if (!p.counters || typeof p.counters !== 'object') p.counters = { saves:0, prints:0, advisor:0 };
  p.streak.count = Number(p.streak.count) || 0;
  p.streak.best  = Number(p.streak.best)  || 0;
  p.daily.done   = Number(p.daily.done)   || 0;
  p.daily.metCount = Number(p.daily.metCount) || 0;
  p.counters.saves = Number(p.counters.saves) || 0;
  p.counters.prints = Number(p.counters.prints) || 0;
  p.counters.advisor = Number(p.counters.advisor) || 0;
  p.challengesMet = Number(p.challengesMet) || 0;   // 3.19
  return p;
}

export function touchStreak(progress, today){
  const st = progress.streak;
  if (st.last === today) return false;
  st.count = (st.last === addDaysISO(today, -1)) ? st.count + 1 : 1;
  st.last = today;
  if (st.count > st.best) st.best = st.count;
  return true;
}

export function dailyGoalState(progress, today){
  const dl = progress.daily;
  const done = (dl.date === today) ? Math.min(dl.done, DAILY_GOAL) : 0;
  return { done, goal: DAILY_GOAL, met: dl.met === today };
}

export function addDailyDone(progress, today, n){
  const dl = progress.daily;
  if (dl.date !== today){ dl.date = today; dl.done = 0; }
  dl.done += (n || 1);
  const metNow = (dl.done >= DAILY_GOAL && dl.met !== today);
  if (metNow){ dl.met = today; dl.metCount = (Number(dl.metCount)||0) + 1; }
  return metNow;
}

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

/* --- 3.19: задания дня (сброс каждое утро, метки не снимаются) --- */
export function ensureChallenges(progress, today){
  if (!progress.challenges || typeof progress.challenges !== 'object' || progress.challenges.date !== today){
    progress.challenges = { date: today, tasks:false, note:false, visitCal:false, visitStats:false, met:false };
  }
  return progress.challenges;
}
export function markChallenge(progress, today, key){
  const ch = ensureChallenges(progress, today);
  if (ch[key]) return false;
  ch[key] = true;
  const metNow = !ch.met && ch.tasks && ch.note && ch.visitCal && ch.visitStats;
  if (metNow){ ch.met = true; progress.challengesMet = (Number(progress.challengesMet)||0) + 1; }
  return metNow;
}

/* --- 3.17/3.19: достижения --- */
export const ACHIEVEMENTS = [
  { id:'first-bed',     title:'Первая грядка',  desc:'Добавьте объект с культурой на схему', icon:'si-bed',      sticker:'stickers/ach-first-bed.png',     test:(c)=> c.culturedObjects >= 1 },
  { id:'first-harvest', title:'Первый урожай',  desc:'Запишите фактический урожай любого объекта', icon:'si-basket', sticker:'stickers/ach-first-harvest.png', test:(c)=> c.hasHarvest },
  { id:'dream-garden',  title:'Сад мечты',      desc:'8 и более объектов на схеме', icon:'si-map',      sticker:'stickers/ach-dream-garden.png',  test:(c)=> c.totalObjects >= 8 },
  { id:'tidy-notes',    title:'Аккуратист',     desc:'10 заметок в журналах объектов', icon:'si-history',  sticker:'stickers/ach-tidy-notes.png',    test:(c)=> c.notesCount >= 10 },
  { id:'streak-7',      title:'Серия 7 дней',   desc:'Серия дней с задачами — 7 подряд', icon:'si-calendar', sticker:'stickers/ach-streak-7.png',      test:(c)=> c.streakBest >= 7 },
  { id:'daily-goal',    title:'Цель дня ×5',    desc:'Выполните цель дня (3 задачи) 5 раз', icon:'si-sprout',  sticker:'stickers/ach-daily-goal.png',    test:(c)=> c.metCount >= 5 },
  { id:'perfect-days',  title:'Пять идеальных дней', desc:'Выполните все три задания дня 5 раз', icon:'si-sun', sticker:'stickers/ach-perfect-days.png', test:(c)=> (c.challengesMet||0) >= 5 },   // 3.19
  { id:'full-season',   title:'Полный сезон',   desc:'Прогресс сезона ≥90% в сентябре и позже', icon:'si-fruiting', sticker:'stickers/ach-full-season.png', test:(c)=> c.seasonPct >= 90 && c.month >= 9 },
  { id:'printer',       title:'Печатник',       desc:'Печать или постер PNG — 1 раз', icon:'si-print',    sticker:'stickers/ach-printer.png',       test:(c)=> c.counters.prints >= 1 },
  { id:'demo-master',   title:'Демо-мастер',    desc:'Пройдите Обучение и Демо-участок', icon:'si-tutorial', sticker:'stickers/ach-demo-master.png',   test:(c)=> c.tutorialSeen && c.demoSeen },
  { id:'advisor',       title:'Советчик',       desc:'Откройте Советчик 3 раза', icon:'si-chick',    sticker:'stickers/ach-advisor.png',       test:(c)=> c.counters.advisor >= 3 },
  { id:'collector',     title:'Коллекционер',   desc:'5 культур из разных семейств', icon:'si-leaf',     sticker:'stickers/ach-collector.png',     test:(c)=> c.familiesCount >= 5 },
  { id:'keeper',        title:'Хранитель',      desc:'Сохраните план в файл 3 раза', icon:'si-save',     sticker:'stickers/ach-keeper.png',        test:(c)=> c.counters.saves >= 3 }
];

export function checkAchievements(progress, ctx){
  const unlocked = [];
  ACHIEVEMENTS.forEach(a=>{
    if (progress.achievements[a.id]) return;
    let ok = false;
    try { ok = !!a.test(ctx); } catch(e){ ok = false; }
    if (ok){ progress.achievements[a.id] = ctx.today; unlocked.push(a); }
  });
  return unlocked;
}