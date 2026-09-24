// src/core/exportPrint.js — печатная версия постера «Мой участок» (ревизия 2.189)
// 2.189: предпросмотр в модалке: в шапке рядом «🖨 Печать выбранных листов» и «✕ Закрыть»
//        (дублирующая нижняя кнопка «Выйти» убрана); выход также по клику на фон и Esc
// 2.188: сворачиваемые листы (<details>): в печать идут ТОЛЬКО раскрытые; каждый раскрытый — с новой страницы
// 2.187: группировка задач ПО МЕСЯЦАМ; 4-й лист «Журнал объектов» (последние 5 заметок)
// 2.184: краткие коды объектов внутри (Д1/К2/Т1/Г3); постройки — полное имя + иконка si-house
// 2.172: полные имена в таблицах, иконки культур/фаз, спрайты инлайнятся в печатный документ
import { PHASE_META } from './phaseMachine.js';
import { getCropIconId } from '../ui/ux.js';
import { plantingRef, estimateCount, estimateYieldKg } from './planting.js';

const TYPE_META = {
  building:   { label:'Постройка',  fill:'#F9E8D4', stroke:'#D9B48F' },
  greenhouse: { label:'Теплица',    fill:'#DCF2E0', stroke:'#9CCFA8' },
  bed:        { label:'Грядка',     fill:'#E5F7CF', stroke:'#B0D37E' },
  tree:       { label:'Дерево',     fill:'#D9F0EC', stroke:'#96C9C1' },
  bush:       { label:'Кустарник',  fill:'#FDECCB', stroke:'#E2BE88' }
};
const DIR_NAME = { N:'Север', S:'Юг', E:'Восток', W:'Запад', NE:'Северо-восток', NW:'Северо-запад', SE:'Юго-восток', SW:'Юго-запад' };
const PHASE_ICON = {
  seed:'si-seed', seedling:'si-shoots', planting:'si-planting',
  vegetative:'si-growth', flowering:'si-flowering', fruiting:'si-fruiting', senescence:'si-wilting'
};
const NOTE_LABEL = {
  watering:'Полив', fertilizing:'Подкормка', pruning:'Обрезка', treatment:'Обработка',
  harvest:'Сбор', house:'Постройка', other:'Другое', planting:'Посадка', phase:'Фаза'
};
const NOTE_ICON = {
  watering:'si-water', fertilizing:'si-fertilize', pruning:'si-prune', treatment:'si-warning',
  harvest:'si-basket', house:'si-house', other:'si-leaf', planting:'si-planting', phase:'si-growth'
};

function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function trunc(s, maxChars){ s=String(s||''); return s.length>maxChars ? s.slice(0, Math.max(1,maxChars-1))+'…' : s; }
function toDateStr(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; }
function fmtDateLong(iso){
  const MON=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const p=String(iso).split('-');
  return `${parseInt(p[2],10)} ${MON[parseInt(p[1],10)-1]} ${p[0]}`;
}
function fmtDateShort(iso){
  const p=String(iso||'').split('-');
  if (p.length < 3) return String(iso||'');
  return `${p[2]}.${p[1]}.${p[0]}`;
}
function monthName(mk){
  const NOM=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  return NOM[parseInt(mk.slice(5,7),10)-1] + ' ' + mk.slice(0,4);
}

/* ---------- полное имя объекта для колонок таблиц ---------- */
function resolveObjName(scheme, t){
  if (t.bed_name) return t.bed_name;
  const bid = t.bed_id;
  if (bid == null) return '—';
  const s = String(bid);
  const m = s.match(/^(\d+)(?:-gh|:)(\d+)$/);
  if (m){
    const o = scheme.objects.find(o => String(o.id) === m[1]);
    return o ? `${o.name}, грядка ${(+m[2]) + 1}` : s;
  }
  const o = scheme.objects.find(o => String(o.id) === s);
  if (o) return (t.bed_index != null && o.type === 'greenhouse') ? `${o.name}, грядка ${t.bed_index + 1}` : o.name;
  return s;
}

/* ---------- сбор данных ---------- */
function collectPrintData(scheme, plants, phases, planting, buildCalendar){
  const today = toDateStr(new Date());
  let byDay = {};
  try { byDay = buildCalendar(scheme.objects, phases, true, plants, planting, scheme.weather) || {}; } catch(e){}
  const entries = [];
  scheme.objects.forEach(o=>{
    if (o.type==='greenhouse'){
      (o.greenhouseBedCultures||[]).forEach((c,i)=>{
        if(!c) return;
        entries.push({
          culture:c, objName:`${o.name}, грядка ${i+1}`,
          phase:(((o.greenhouseBedPhases||[])[i])||{}).phase||null,
          plantingDate:(o.greenhouseBedPlantingDates||[])[i]||null,
          planted:(o.greenhouseBedPlantedCounts||[])[i] ?? null,
          actual:(o.greenhouseBedYields||[])[i] ?? null,
          kind:'greenhouseBed',
          areaM2:Math.max(0.5,(o.w*o.l)/(o.greenhouseBedCount||1)*0.6)
        });
      });
    } else if (o.culture && ['bed','tree','bush'].includes(o.type)){
      entries.push({
        culture:o.culture, objName:o.name, phase:o.phase||null,
        plantingDate:o.plantingDate||null,
        planted:o.planted_count ?? null,
        actual:o.actual_yield_kg ?? null,
        kind:(o.type==='bed'?'bed':'perennial'),
        wM:o.w, lM:o.l
      });
    }
  });
  const store = scheme.completedTasks || {};
  const tasksByMonth = new Map();
  Object.keys(byDay).sort().forEach(d=>{
    (byDay[d]||[]).forEach(t=>{
      const mk = d.slice(0,7);
      if (!tasksByMonth.has(mk)) tasksByMonth.set(mk, []);
      tasksByMonth.get(mk).push(Object.assign({ date:d, done: !!store[`${d}|${t.bed_id}|${t.name}`] }, t));
    });
  });
  const byCulture = new Map();
  let estTotal=0, actTotal=0, actCount=0;
  entries.forEach(e=>{
    const ref = plantingRef(planting, e.culture);
    let count = e.planted;
    if (count==null && ref){ const est=estimateCount(ref, {kind:e.kind, wM:e.wM, lM:e.lM, areaM2:e.areaM2}); count = est?est.count:null; }
    const estKg = (ref && count!=null) ? estimateYieldKg(ref, count) : null;
    if (estKg!=null) estTotal+=estKg;
    if (e.actual!=null){ actTotal+=e.actual; actCount++; }
    const agg = byCulture.get(e.culture) || {count:0, est:0, act:0, hasAct:false};
    if (count!=null) agg.count+=count;
    if (estKg!=null) agg.est=Math.round((agg.est+estKg)*10)/10;
    if (e.actual!=null){ agg.act=Math.round((agg.act+e.actual)*10)/10; agg.hasAct=true; }
    byCulture.set(e.culture, agg);
  });
  const harvestRows = [...byCulture.entries()].map(([culture,a])=>Object.assign({culture},a)).sort((a,b)=>b.est-a.est);
  const notesByObj = [];
  scheme.objects.forEach(o=>{
    const notes = (o.notes||[]).slice().sort((a,b)=>(a.date||'').localeCompare(b.date||'') || ((a.id||0)-(b.id||0)));
    if (!notes.length) return;
    notesByObj.push({ name:o.name, typeLabel:(TYPE_META[o.type]||TYPE_META.bed).label, notes: notes.slice(-5) });
  });
  return { today, entries, tasksByMonth, harvestRows, notesByObj, estTotal:Math.round(estTotal), actTotal:Math.round(actTotal*10)/10, actCount };
}

/* ---------- схема (SVG): имя/код ВНУТРИ объекта внизу + иконки ---------- */
function schemeSVG(scheme){
  const W=scheme.widthM, L=scheme.lengthM, S=10;
  const p=[];
  p.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W*S} ${L*S}" class="scheme-img" role="img" aria-label="Схема участка">`);
  p.push(`<rect x="0" y="0" width="${W*S}" height="${L*S}" fill="#FFFFFF" stroke="#8A9B6E" stroke-width="1.2"/>`);
  for(let i=1;i<W;i++) p.push(`<line x1="${i*S}" y1="0" x2="${i*S}" y2="${L*S}" stroke="#E4EFC9" stroke-width="0.35"/>`);
  for(let j=1;j<L;j++) p.push(`<line x1="0" y1="${j*S}" x2="${W*S}" y2="${j*S}" stroke="#E4EFC9" stroke-width="0.35"/>`);
  const fsName=3, fsPh=2.6, fsObj=2.4;
  const SHORT_LETTER = { bed:'Г', tree:'Д', bush:'К', greenhouse:'Т', building:'П' };
  const shortCode = (o) => {
    const letter = SHORT_LETTER[o.type] || 'О';
    const m = String(o.name||'').match(/(\d+)\s*$/);
    return letter + (m ? m[1] : String(o.id));
  };
  const objLabel = (o, w) => {
    const maxChars = Math.max(3, Math.floor(w / (fsObj * 0.62)));
    if (o.type === 'building') return esc(trunc(o.name || '', maxChars));
    if (o.name && o.name.length <= maxChars) return esc(o.name);
    return esc(shortCode(o));
  };
  (scheme.objects||[]).forEach(o=>{
    const meta = TYPE_META[o.type] || TYPE_META.bed;
    const x=o.x*S, y=o.y*S, w=o.w*S, l=o.l*S;
    p.push(`<rect x="${x}" y="${y}" width="${w}" height="${l}" rx="1.5" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="0.8"/>`);
    const cx=x+w/2, cy=y+l/2, m=Math.min(w,l);
    const maxName=Math.max(4, Math.floor(w/(fsName*0.62)));
    const maxPh=Math.max(4, Math.floor(w/(fsPh*0.62)));
    if(o.type==='building'){
      const is=m*0.6;
      p.push(`<use href="#si-house" x="${(cx-is/2).toFixed(1)}" y="${(cy-is/2-1).toFixed(1)}" width="${is.toFixed(1)}" height="${is.toFixed(1)}"/>`);
      p.push(`<text x="${cx}" y="${y+l-1.0}" text-anchor="middle" font-size="${fsObj}" fill="#3F3E3A">${objLabel(o,w)}</text>`);
    } else if(o.type==='greenhouse'){
      const beds=(o.greenhouseBedCultures||[]);
      const icons=beds.filter(Boolean).slice(0,4);
      const n=icons.length||1;
      icons.forEach((c,i)=>{
        const id=getCropIconId(c);
        const bw=w/n, bx=x+bw*i+bw/2, is=m*0.4;
        if(id) p.push(`<use href="#${id}" x="${(bx-is/2).toFixed(1)}" y="${(cy-is/2).toFixed(1)}" width="${is.toFixed(1)}" height="${is.toFixed(1)}"/>`);
      });
      p.push(`<text x="${cx}" y="${y+l-1.0}" text-anchor="middle" font-size="${fsObj}" fill="#3F3E3A">${objLabel(o,w)}</text>`);
      const phs=beds.map((c,i)=>{ const bp=(o.greenhouseBedPhases||[])[i]; const pm=bp&&bp.phase&&PHASE_META[bp.phase]; return pm?pm.label:null; }).filter(Boolean);
      if(phs.length) p.push(`<text x="${cx}" y="${y+l+3.5}" text-anchor="middle" font-size="${fsPh}" fill="#6B6A64">${esc(trunc(phs.join(', '),maxPh))}</text>`);
    } else if(o.culture){
      const id=getCropIconId(o.culture);
      const is=m*0.5;
      if(id) p.push(`<use href="#${id}" x="${(cx-is/2).toFixed(1)}" y="${(cy-is/2-1).toFixed(1)}" width="${is.toFixed(1)}" height="${is.toFixed(1)}"/>`);
      const pm=o.phase&&PHASE_META[o.phase];
      if(pm && PHASE_ICON[o.phase]) p.push(`<use href="#${PHASE_ICON[o.phase]}" x="${(x+w-4.2).toFixed(1)}" y="${(y+0.8).toFixed(1)}" width="3.4" height="3.4"/>`);
      p.push(`<text x="${cx}" y="${y+l-1.0}" text-anchor="middle" font-size="${fsObj}" fill="#3F3E3A">${objLabel(o,w)}</text>`);
      p.push(`<text x="${cx}" y="${y+l+3.5}" text-anchor="middle" font-size="${fsName}" fill="#3F3E3A">${esc(trunc(o.culture,maxName))}</text>`);
      if(pm) p.push(`<text x="${cx}" y="${y+l+6.5}" text-anchor="middle" font-size="${fsPh}" fill="#6B6A64">${esc(trunc(pm.label,maxPh))}</text>`);
    } else {
      p.push(`<text x="${cx}" y="${y+l-1.0}" text-anchor="middle" font-size="${fsObj}" fill="#3F3E3A">${objLabel(o,w)}</text>`);
    }
  });
  p.push(`<text x="${W*S-2}" y="6" text-anchor="end" font-size="5" fill="#8A7A5A">солнце: ${esc(DIR_NAME[scheme.sunDir||'S']||'Юг')}</text>`);
  p.push('</svg>');
  return p.join('');
}

/* ---------- предпросмотр печати со сворачиваемыми листами ---------- */
function buildPreviewHTML(scheme, D, spriteText, appVersion){
  const title = esc((scheme.plotName||'').trim() || 'Мой участок');
  const legend = Object.values(TYPE_META).map(m=>`<span class="lg"><i style="background:${m.fill};border:1px solid ${m.stroke}"></i>${m.label}</span>`).join('');
  const plantedTable = D.entries.length
    ? `<table><thead><tr><th>Культура</th><th>Объект</th><th>Фаза</th><th>Дата посадки</th></tr></thead><tbody>` +
      D.entries.map(e=>{
        const pm=e.phase&&PHASE_META[e.phase];
        return `<tr><td>${esc(e.culture)}</td><td>${esc(e.objName)}</td><td>${pm?esc(pm.label):'—'}</td><td>${e.plantingDate?esc(e.plantingDate):'—'}</td></tr>`;
      }).join('') +
      `</tbody></table>`
    : `<p class="note">Культуры пока не посажены.</p>`;
  let tasksHTML = '';
  if (D.tasksByMonth.size){
    [...D.tasksByMonth.entries()].forEach(([mk, tasks])=>{
      tasksHTML += `<div class="section"><h3>${monthName(mk)}</h3>` +
        `<table><thead><tr><th class="cbcell">✓</th><th class="d">Дата</th><th>Задача</th><th>Культура</th><th>Объект</th></tr></thead><tbody>` +
        tasks.map(t=>`<tr><td class="cbcell">${t.done?'✓':''}</td><td class="d">${esc(t.date.slice(8,10))}.${esc(t.date.slice(5,7))}</td><td>${esc(t.name||'')}</td><td>${esc(t.crop||'')}</td><td>${esc(resolveObjName(scheme,t))}</td></tr>`).join('') +
        `</tbody></table></div>`;
    });
  } else tasksHTML = `<p class="note">Задач на сезон пока нет — добавьте культуры.</p>`;
  const harvestTable = D.harvestRows.length
    ? `<table><thead><tr><th>Культура</th><th>Растений</th><th>Прогноз, кг</th><th>Факт, кг (заполнить рукой)</th></tr></thead><tbody>` +
      D.harvestRows.map(r=>`<tr><td>${esc(r.culture)}</td><td>${r.count||'—'}</td><td>${r.est?('≈ '+r.est):'—'}</td><td class="write">${r.act!=null?r.act:''}</td></tr>`).join('') +
      `<tr class="total"><td colspan="2">Итого</td><td>≈ ${D.estTotal} кг</td><td class="write">${D.actTotal||''}</td></tr></tbody></table>`
    : `<p class="note">Добавьте культуры и запишите урожай — здесь появится сводка.</p>`;
  const notesHTML = D.notesByObj.length
    ? D.notesByObj.map(s =>
        `<div class="section"><h3>${esc(s.name)} · ${esc(s.typeLabel)}</h3>` +
        `<table><thead><tr><th class="d">Дата</th><th style="width:24mm">Тип</th><th>Заметка</th></tr></thead><tbody>` +
        s.notes.map(n =>
          `<tr><td class="d">${esc(fmtDateShort(n.date))}</td>` +
          `<td><svg class="ni"><use href="#${NOTE_ICON[n.type]||NOTE_ICON.other}"/></svg> ${esc(NOTE_LABEL[n.type]||NOTE_LABEL.other)}</td>` +
          `<td>${esc(n.text)}</td></tr>`
        ).join('') +
        `</tbody></table></div>`
      ).join('')
    : `<p class="note">Заметок пока нет — добавьте их в настройках объекта на «Схеме».</p>`;

  const sec = (id, label, body) =>
    `<details class="psec" open id="${id}"><summary>${label}</summary><div class="psec-body">${body}</div></details>`;

  const sheet1 =
    `<h1>${title}</h1>` +
    `<div class="meta">${esc(scheme.widthM)} × ${esc(scheme.lengthM)} м · ${esc(fmtDateLong(D.today))} · план и дневник сезона</div>` +
    `<div class="section">${schemeSVG(scheme)}</div>` +
    `<div class="section">${legend}</div>` +
    `<div class="section"><h2>Посаженные культуры</h2>${plantedTable}</div>`;
  const sheet2 = `<h2>Задачи сезона (отмечайте галочкой на бумаге)</h2>${tasksHTML}`;
  const sheet3 = `<h2>Урожай: прогноз и факт</h2><div class="section">${harvestTable}</div>` +
    `<p class="note">Прогноз не учитывает культуры, которые не дадут урожай в этом году (молодые посадки и поздние посевы).</p>`;
  const sheet4 = `<h2>Журнал объектов</h2>${notesHTML}` +
    `<div class="footer">Создано в приложении «Умный садовод» · ${esc(fmtDateLong(D.today))} · ${esc(appVersion||'')}</div>`;

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8" /><title>Печать — ${title}</title>
<style>
@page { size: A4 portrait; margin: 10mm; }
* { box-sizing:border-box; }
body { font:12px/1.45 'Manrope', Arial, sans-serif; color:#222; margin:0; }
h1 { font:26px 'Neucha', cursive; margin:0 0 2mm; color:#5E7247; }
h2 { font:18px 'Neucha', cursive; margin:0 0 3mm; color:#5E7247; }
h3 { font:14px 'Manrope', sans-serif; margin:0 0 2mm; color:#3F3E3A; }
.meta { font-size:11px; color:#6B6A64; margin-bottom:4mm; }
.section { page-break-inside: avoid; margin-bottom:5mm; }
table { width:100%; border-collapse:collapse; font-size:10.5px; }
th, td { border:1px solid #999; padding:1.4mm 2mm; text-align:left; vertical-align:top; }
th { background:#EEE; }
td.d { white-space:nowrap; width:12mm; }
th.cbcell, td.cbcell { width:8mm; text-align:center; }
td.write { min-height:7mm; background:#FCFCF8; }
tr.total td { font-weight:700; background:#F4F1E6; }
.scheme-img { width:100%; height:auto; }
.lg { display:inline-flex; align-items:center; gap:1.5mm; margin-right:4mm; font-size:10px; color:#6B6A64; }
.lg i { width:4mm; height:4mm; display:inline-block; }
.ni { width:3.5mm; height:3.5mm; vertical-align:-1mm; }
.note { color:#6B6A64; font-size:11px; }
.footer { margin-top:6mm; font-size:10px; color:#8A7A5A; }
.pv-hint { font:600 12px 'Manrope',sans-serif; color:#6B6A64; margin:0 0 4mm; }
.psec { border:1px solid #ccc; border-radius:8px; margin:0 0 6mm; }
.psec > summary { cursor:pointer; font:700 14px 'Manrope',sans-serif; padding:8px 10px; background:#EEE; border-radius:8px; }
.psec-body { padding:8px 4px; }
@media print {
  .pv-hint { display:none; }
  .psec > summary { display:none; }
  .psec { border:none; margin:0; }
  .psec-body { padding:0; }
  .psec:not([open]) { display:none; }
  .psec[open] { page-break-before: always; }
  .psec[open].no-break { page-break-before: auto; }
}
</style></head><body>
<div hidden>${spriteText || ''}</div>
<div class="pv-hint">Сверните ненужные листы — они не попадут в печать. Раскрытые листы печатаются каждый со своей страницы.</div>
${sec('sec-scheme', 'Лист 1 — Схема и посаженные культуры', sheet1)}
${sec('sec-tasks',  'Лист 2 — Задачи сезона (по месяцам)', sheet2)}
${sec('sec-harvest','Лист 3 — Урожай: прогноз и факт', sheet3)}
${sec('sec-notes',  'Лист 4 — Журнал объектов', sheet4)}
</body></html>`;
}

/* ---------- главный вход: предпросмотр в модалке + печать выбранных листов ---------- */
export async function exportPrint({ scheme, plants, phases, planting, compat, buildCalendar, appVersion }){
  const D = collectPrintData(scheme, plants, phases, planting, buildCalendar);
  let spriteText = '';
  try { const r1 = await fetch('assets/smart-gardener.svg'); if (r1.ok) spriteText += await r1.text(); } catch(e){}
  try { const r2 = await fetch('assets/icons.svg'); if (r2.ok) spriteText += await r2.text(); } catch(e){}
  const html = buildPreviewHTML(scheme, D, spriteText, appVersion);

  let overlay = document.getElementById('printPreviewOverlay');
  if (!overlay){
    overlay = document.createElement('div');
    overlay.id = 'printPreviewOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:95;background:rgba(40,35,25,.5);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:16px;';
    overlay.innerHTML =
      `<div style="display:flex;flex-direction:column;gap:10px;width:min(1000px,96vw);height:90vh;">` +
        `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">` +
          `<b style="font:700 16px 'Manrope',sans-serif;color:#fff;">Предпросмотр печати</b>` +
          `<span style="flex:1"></span>` +
          `<button type="button" id="pvPrint" style="border:none;border-radius:10px;padding:10px 16px;background:#8A9B6E;color:#fff;font:700 14px 'Manrope',sans-serif;cursor:pointer;">🖨 Печать выбранных листов</button>` +
          `<button type="button" id="pvClose" style="border:none;border-radius:10px;padding:10px 14px;background:#fff;color:#3F3E3A;font:700 14px 'Manrope',sans-serif;cursor:pointer;">✕ Закрыть</button>` +
        `</div>` +
        `<iframe id="pvFrame" style="flex:1;width:100%;border:none;border-radius:12px;background:#fff;"></iframe>` +
      `</div>`;
    document.body.appendChild(overlay);
    const closePreview = ()=> overlay.classList.add('hidden');
    overlay.querySelector('#pvClose').addEventListener('click', closePreview);
    overlay.addEventListener('click', (e)=>{ if (e.target === overlay) closePreview(); });
    document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closePreview(); });
    overlay.querySelector('#pvPrint').addEventListener('click', ()=>{
      const frame = overlay.querySelector('#pvFrame');
      const doc = frame.contentDocument;
      const opens = Array.from(doc.querySelectorAll('details.psec[open]'));
      opens.forEach((d,i)=> d.classList.toggle('no-break', i===0));
      frame.contentWindow.focus();
      frame.contentWindow.print();
    });
  }
  const frame = overlay.querySelector('#pvFrame');
  frame.srcdoc = html;
  overlay.classList.remove('hidden');
}