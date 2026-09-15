// src/ui/tsypa.js — Цыпа, проактивный маскот-агроном (ревизия 2.113)
// 2.113: относительный путь assets/chick_full.svg (для подпапки GitHub Pages)
// 2.108: позиции только классами pos-0..pos-5, без transition/keyframes на контейнере;
//        клик-защита по времени (600 мс) + try/catch вокруг обработчика
// 2.107: z-index 35 (ниже шапки и меню), позиции отодвинуты от панелей
// 2.106: 6 позиций экрана; клик — новая подсказка + перемещение; слева рисунок зеркалится
// 2.100: авто-подсказки через getReminders(); 2.75: авторотация, приоритеты, celebrate()
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
const HOP_COOLDOWN_MS = 600; // 2.108: клик-защита по времени

function toDateStr(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; }
function addDaysISO(iso, n){ const dt=new Date(`${iso}T00:00:00`); dt.setDate(dt.getDate()+n); return toDateStr(dt); }
function norm(s){ return String(s||'').trim().toLowerCase(); }

export function createTsypa({ scheme, phases, plants, buildCalendar, getReminders }) {
  let el = document.getElementById('tsypa');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tsypa';
    el.innerHTML = `<div class="tsypa-bubble" id="tsypaBubble"></div>
      <div class="tsypa-avatar"><img src="assets/chick_full.svg" alt="Цыпа" /></div>`;
    document.body.appendChild(el);
  }
  const bubble = el.querySelector('#tsypaBubble');

  /* ---------- позиции на экране (6 точек, классами pos-0..pos-5) ---------- */
  const POS_COUNT = 6;
  let posIdx = Math.floor(Math.random()*POS_COUNT);
  let lastHopAt = 0;

  function applyPosition(){
    for (let i=0;i<POS_COUNT;i++) el.classList.toggle('pos-'+i, i===posIdx);
    const leftSide = (posIdx===3 || posIdx===4 || posIdx===5);
    el.classList.toggle('pos-left', leftSide); // пузырь к краю
    el.classList.toggle('flip', leftSide);     // рисунок зеркально у левого края
  }
  // гарантированная смена позиции без циклов и без анимационных механизмов
  function hop(){
    posIdx = (posIdx + 1 + Math.floor(Math.random()*(POS_COUNT-1))) % POS_COUNT;
    applyPosition();
  }

  let tips = [];
  let idx = 0;
  let rotateTimer = null;
  let celebrateTimer = null;
  let celebrating = false;

  /* ---------- помощники по данным ---------- */
  function sowNowPlants(){
    const m = MONTHS_LOW[new Date().getMonth()];
    return (plants||[]).filter(p => ((p.sowing_timing || p.sowing) || '').toLowerCase().includes(m));
  }
  function plantedCultures(){
    const set = new Set();
    (scheme.objects||[]).forEach(o=>{
      if (o.culture) set.add(norm(o.culture));
      (o.greenhouseBedCultures||[]).forEach(c=>{ if(c) set.add(norm(c)); });
    });
    return set;
  }

  /* ---------- подсказки по приоритетам ---------- */
  function computeTips(){
    const found = [];
    const today = toDateStr(new Date());
    const planted = plantedCultures();
    let byDay = {};
    try { byDay = buildCalendar(scheme.objects, phases, true, plants, null, scheme.weather) || {}; } catch(e){}

    // 1) просроченные и невыполненные задачи
    let overdueCount = 0, overdueExample = null;
    Object.keys(byDay).forEach(date=>{
      if (date >= today) return;
      byDay[date].forEach(t=>{
        const key = `${t.date}|${t.bed_id}|${t.name}`;
        if (isRainExcused(scheme, t, today)) return; // дожди — не просрочка
        if (!(scheme.completedTasks || {})[key]) { overdueCount++; if (!overdueExample) overdueExample = t; }
      });
    });
    if (overdueCount > 0 && overdueExample) {
      found.push(`⏰ Просрочена задача «${overdueExample.name}» (${overdueExample.crop}). Всего таких: ${overdueCount}. Давай нагонять!`);
    }

    // 2.100: авто-подсказки (истёкший режим, прогноз предлагает другой)
    if (getReminders) {
      (getReminders() || []).forEach(r => found.push(r.text));
    }

    // 2) подсказка о текущем режиме погоды
    const wm = weatherMode(scheme);
    if (wm !== 'normal') {
      const m = WEATHER_MODES.find(x=>x.id===wm);
      if (m) found.push(`${m.icon} ${m.hint}`);
    }

    // 3) культуры в фазе плодоношения — пора собирать
    const fruiting = [];
    (scheme.objects||[]).forEach(o=>{
      if (o.type === 'greenhouse') {
        (o.greenhouseBedPhases||[]).forEach((bp,i)=>{
          const c = (o.greenhouseBedCultures||[])[i];
          if (bp && bp.phase === 'fruiting' && c) fruiting.push(`🧺 «${c}» в теплице поспевает — пора собирать!`);
        });
      } else if (o.phase === 'fruiting' && o.culture) {
        fruiting.push(`🧺 «${o.culture}» (${o.name}) поспевает — пора собирать урожай!`);
      }
    });
    fruiting.slice(0,3).forEach(t=>found.push(t));

    // 4) сбор урожая в ближайшие 7 дней
    const horizon = addDaysISO(today, 7);
    const soon = new Set();
    Object.keys(byDay).forEach(date=>{
      if (date < today || date > horizon) return;
      byDay[date].forEach(t=>{ if (t.category === 'harvest' && t.crop) soon.add(t.crop); });
    });
    [...soon].slice(0,3).forEach(crop=>found.push(`🗓 В ближайшие 7 дней — сбор: «${crop}». Готовим корзинки!`));

    // 5) сезонные посадки: что сажают в этом месяце и ещё не посажено
    const sowable = sowNowPlants().filter(p => !planted.has(norm(p.name)));
    if (sowable.length) {
      const names = sowable.slice(0,3).map(p=>p.name).join(', ');
      found.push(`🌱 Сейчас сажают: ${names}${sowable.length>3 ? ' и др.' : ''}. Загляни в Каталог!`);
    }

    // 6) сезон культуры закончился, а урожай не записан
    (scheme.objects||[]).forEach(o=>{
      if (o.type !== 'greenhouse' && o.phase === 'senescence' && o.culture && o.actual_yield_kg == null) {
        found.push(`📝 Сезон «${o.culture}» закончился, а урожай не записан. Запиши в настройках объекта!`);
      }
    });

    // 7) совет месяца
    const monthTip = MONTH_TIPS[new Date().getMonth()];
    if (monthTip) found.push(monthTip);

    tips = found.length ? found : TIPS_FALLBACK;
  }

  function render(){
    if (!bubble) return;
    bubble.textContent = tips[idx % tips.length] || TIPS_FALLBACK[0];
  }

  function refresh(){
    computeTips();
    idx = 0;
    render();
    startRotation();
  }

  /* ---------- авторотация ---------- */
  function startRotation(){
    stopRotation();
    rotateTimer = setInterval(()=>{
      if (celebrating || document.hidden) return;
      idx++;
      render();
    }, ROTATE_MS);
  }
  function stopRotation(){
    if (rotateTimer) { clearInterval(rotateTimer); rotateTimer = null; }
  }

  /* ---------- поздравление при отметке задачи ---------- */
  function celebrate(){
    celebrating = true;
    if (celebrateTimer) clearTimeout(celebrateTimer);
    if (bubble) bubble.textContent = CELEBRATIONS[Math.floor(Math.random()*CELEBRATIONS.length)];
    celebrateTimer = setTimeout(()=>{
      celebrating = false;
      computeTips();
      idx = 0;
      render();
    }, CELEBRATE_MS);
  }

  /* ---------- взаимодействия (2.108: cooldown + try/catch) ---------- */
  el.addEventListener('click', ()=>{
    try {
      const now = Date.now();
      if (celebrating || now - lastHopAt < HOP_COOLDOWN_MS) return;
      lastHopAt = now;
      idx++;
      render();
      hop();
      startRotation();
    } catch(e){ console.warn('tsypa click:', e); }
  });
  el.addEventListener('mouseenter', stopRotation);
  el.addEventListener('mouseleave', ()=>{ if (!celebrating) startRotation(); });

  applyPosition(); // случайная стартовая позиция + зеркало при левом крае
  refresh();
  return { refresh, celebrate };
}