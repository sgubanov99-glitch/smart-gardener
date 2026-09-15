// src/ui/homeView.js — экран «Обзор» (ревизия 2.89)
// 2.89: погода в buildCalendar; бейдж «🌧 можно пропустить» на задачах окна дождей
// 2.85: параметр planting (возраст плодоношения многолетников в календаре)
// 2.82: задачи деревьев и кустарников — в «Задачах на ближайшие 7 дней»
// 2.56: SVG-иконки культур в списке посаженных (фолбэк на эмодзи)
// 2.49: даты задач через единый fmtDateRu
// 2.44: статусы задач из scheme.completedTasks
import { PHASE_META } from '../core/phaseMachine.js';
import { screenHintHTML, emptyStateHTML, fmtDateRu, cropIconHTML } from './ux.js';
import { isRainExcused } from '../core/weather.js';

const PLANT_EMOJI = {
  'томат':'🍅','огурец':'🥒','перец':'🫑','капуста':'🥬','редис':'🌶',
  'морковь':'🥕','свёкла':'🟣','лук':'🧅','чеснок':'🧄','картофель':'🥔',
  'клубника':'🍓','земляника садовая':'🍓','укроп':'🌿','петрушка':'🌿',
  'салат':'🥬','шпинат':'🥬','тыква':'🎃','кабачок':'🥒','патиссон':'🎃',
  'дыня':'🍈','арбуз':'🍉','баклажан':'🍆','горох':'🫛','фасоль':'🫘',
  'репа':'🍠','рукола':'🌿','щавель':'🍃','кинза':'🌿'
};
function plantEmoji(name){ const n=(name||'').toLowerCase().trim(); return PLANT_EMOJI[n]||'🌿'; }
function toDateStr(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; }

export function createHomeView({ scheme, phases, plants, planting, buildCalendar, onSelectObject, onGoToCalendar }) {
  const root = document.getElementById('screen-home-body');

  function store(){ if(!scheme.completedTasks) scheme.completedTasks = {}; return scheme.completedTasks; }
  function taskKey(t){ return `${t.date}|${t.bed_id}|${t.name}`; }
  function taskState(t){
    if (store()[taskKey(t)]) return 'manual';
    if (t.date < toDateStr(new Date())) return 'auto';
    return 'open';
  }
  function statusIcon(st){
    if (st==='manual') return '<span style="color:#2F7D32;font-weight:700" title="вы отметили выполненной">✓</span>';
    if (st==='auto') return '<span style="color:#9E9E9E;font-weight:700" title="выполнено автоматически">✓</span>';
    return '<span style="color:#9E9E9E" title="не выполнена">☐</span>';
  }
  function collectCrops(){
    const crops=[];
    scheme.objects.forEach(o=>{
      if(o.type==='bed' && o.culture) crops.push({objId:o.id,name:o.culture,phase:o.phase,where:o.name});
      else if(o.type==='greenhouse')(o.greenhouseBedCultures||[]).forEach((c,i)=>{ if(c){ const bp=(o.greenhouseBedPhases||[])[i]; crops.push({objId:o.id,name:c,phase:bp?bp.phase:null,where:`${o.name}, грядка ${i+1}`}); } });
      else if((o.type==='tree'||o.type==='bush') && o.culture) crops.push({objId:o.id,name:o.culture,phase:o.phase,where:o.name});
    });
    return crops;
  }
  function upcomingTasks(){
    // 2.82: деревья и кустарники тоже учитываются
    const beds = scheme.objects.filter(o=>
      (o.type==='bed'&&o.culture) ||
      (o.type==='greenhouse'&&(o.greenhouseBedCultures||[]).some(Boolean)) ||
      ((o.type==='tree'||o.type==='bush')&&o.culture)
    );
    // 2.85/2.89: planting и weather передаются в календарь
    const byDay = buildCalendar(beds, phases, false, plants || [], planting, scheme.weather);
    const today = toDateStr(new Date());
    const in7 = new Date(); in7.setDate(in7.getDate()+7);
    const in7s = toDateStr(in7);
    const tasks=[];
    Object.keys(byDay).sort().forEach(date=>{ if(date>=today && date<=in7s) byDay[date].forEach(t=>tasks.push(t)); });
    return tasks.slice(0,8);
  }

  if (root) {
    root.addEventListener('click', (e) => {
      const objBtn = e.target.closest('button[data-obj-id]');
      if (objBtn) { if (onSelectObject) onSelectObject(parseInt(objBtn.dataset.objId, 10)); return; }
      const calBtn = e.target.closest('button[data-go-cal]');
      if (calBtn) { if (onGoToCalendar) onGoToCalendar(); return; }
    });
  }

  function render(){
    if(!root) return;
    const crops = collectCrops();
    const tasks = upcomingTasks();
    const today = toDateStr(new Date());
    const cropsHtml = crops.length ? crops.map(c=>{
      const pm = c.phase && PHASE_META[c.phase] ? PHASE_META[c.phase] : null;
      const badge = pm ? `<span style="display:inline-flex;align-items:center;gap:4px;background:${pm.color};color:#fff;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:700">${pm.icon} ${pm.label}</span>` : '<span style="color:var(--ink-soft);font-size:12px">фаза не задана</span>';
      const icon = cropIconHTML(c.name, 28);
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#fff;border-radius:10px;box-shadow:var(--shadow-s)">
        <span style="font-size:28px;display:flex;align-items:center">${icon || plantEmoji(c.name)}</span>
        <div style="flex:1"><div style="font-weight:700">${c.name}</div><div style="font-size:12px;color:var(--ink-soft)">${c.where}</div></div>
        ${badge}
        <button type="button" class="btn btn-olive" data-obj-id="${c.objId}" style="padding:6px 12px;font-size:12px">На схему</button>
      </div>`;
    }).join('') : emptyStateHTML({ icon:'🌱', title:'Культуры ещё не посажены', text:'Добавьте грядку, дерево или кустарник на схеме и выберите культуру — они появятся здесь.' });
    const tasksHtml = tasks.length ? tasks.map(t=>{
      const st = taskState(t);
      // 2.89: полив в окно дождей — «можно пропустить»
      const excused = st==='open' && isRainExcused(scheme, t, today);
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#fff;border-radius:10px;box-shadow:var(--shadow-s);${excused?'opacity:.65;':''}">
        ${statusIcon(st)}
        <div style="flex:1"><div style="font-weight:600">${t.name}${excused?' <span style="background:#7E93B8;color:#fff;border-radius:999px;padding:1px 7px;font-size:10px;font-weight:700">🌧 можно пропустить</span>':''}</div><div style="font-size:12px;color:var(--ink-soft)">${t.crop} · ${fmtDateRu(t.date, false)}</div></div>
        <button type="button" class="btn btn-olive" data-go-cal style="padding:6px 12px;font-size:12px">🗓 К календарю</button>
      </div>`;
    }).join('') : emptyStateHTML({ icon:'🗓', title:'На ближайшую неделю задач нет', text:'Задачи появятся, когда у культур будут фазы и даты посадки.' });
    root.innerHTML =
      screenHintHTML('Нажмите «На схему», чтобы открыть настройки культуры, или «К календарю», чтобы увидеть её задачи.') +
      `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px">
        <div style="background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow-s);padding:16px;text-align:center"><div style="font-size:28px;font-weight:800;color:var(--olive-dark)">${scheme.objects.length}</div><div style="font-size:13px;color:var(--ink-soft)">объектов на схеме</div></div>
        <div style="background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow-s);padding:16px;text-align:center"><div style="font-size:28px;font-weight:800;color:var(--olive-dark)">${crops.length}</div><div style="font-size:13px;color:var(--ink-soft)">культур посажено</div></div>
        <div style="background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow-s);padding:16px;text-align:center"><div style="font-size:28px;font-weight:800;color:var(--olive-dark)">${tasks.length}</div><div style="font-size:13px;color:var(--ink-soft)">задач на неделю</div></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px">
        <div><h3 style="font-family:'Neucha',cursive;font-size:22px;margin:0 0 12px">🌱 Посаженные культуры</h3><div style="display:flex;flex-direction:column;gap:8px">${cropsHtml}</div></div>
        <div><h3 style="font-family:'Neucha',cursive;font-size:22px;margin:0 0 12px">🗓 Задачи на ближайшие 7 дней</h3><div style="display:flex;flex-direction:column;gap:8px">${tasksHtml}</div></div>
      </div>`;
  }

  return { render };
}