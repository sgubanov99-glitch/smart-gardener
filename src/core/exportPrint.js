// src/core/exportPrint.js — печатная версия постера «Мой участок» (ревизия 2.171)
// 2.171: таблица «Задачи сезона» — строка заголовков в каждом месяце (Дата/Задача/Культура/Объект);
//        последний столбец печатает ПОЛНОЕ имя объекта вместо кода bed_id («2-gh0» → «Теплица 1, грядка 1»);
//        чекбокс печатает «✓», если задача отмечена выполненной в приложении
// 2.170: буклет A4: стр.1 шапка + векторная схема + посаженные культуры; стр.2 задачи по месяцам
//        с бумажными чекбоксами; стр.3 урожай с пустой колонкой «Факт»; футер с датой и версией
import { PHASE_META } from './phaseMachine.js';
import { plantingRef, estimateCount, estimateYieldKg } from './planting.js';

const TYPE_META = {
  building:   { label:'Постройка',  fill:'#F9E8D4', stroke:'#D9B48F' },
  greenhouse: { label:'Теплица',    fill:'#DCF2E0', stroke:'#9CCFA8' },
  bed:        { label:'Грядка',     fill:'#E5F7CF', stroke:'#B0D37E' },
  tree:       { label:'Дерево',     fill:'#D9F0EC', stroke:'#96C9C1' },
  bush:       { label:'Кустарник',  fill:'#FDECCB', stroke:'#E2BE88' }
};
const DIR_NAME = { N:'Север', S:'Юг', E:'Восток', W:'Запад', NE:'Северо-восток', NW:'Северо-запад', SE:'Юго-восток', SW:'Юго-запад' };
const PLANT_EMOJI = {
  'томат':'🍅','огурец':'🥒','перец':'🫑','капуста':'🥬','редис':'🌶',
  'морковь':'🥕','свёкла':'🟣','лук':'🧅','чеснок':'🧄','картофель':'🥔',
  'клубника':'🍓','земляника садовая':'🍓','укроп':'🌿','петрушка':'🌿',
  'салат':'🥬','шпинат':'🥬','тыква':'🎃','кабачок':'🥒','патиссон':'🎃',
  'дыня':'🍈','арбуз':'🍉','баклажан':'🍆','горох':'🫛','фасоль':'🫘',
  'репа':'🍠','рукола':'🌿','щавель':'🍃','кинза':'🌿'
};

function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function norm(s){ return String(s||'').trim().toLowerCase(); }
function toDateStr(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; }
function fmtDateLong(iso){
  const MON=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const p=String(iso).split('-');
  return `${parseInt(p[2],10)} ${MON[parseInt(p[1],10)-1]} ${p[0]}`;
}
function monthName(mk){
  const NOM=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  return NOM[parseInt(mk.slice(5,7),10)-1] + ' ' + mk.slice(0,4);
}
function emojiFor(c){ return PLANT_EMOJI[norm(c)] || '🌿'; }
function phaseDataFor(phases, culture){
  if(!phases||!culture) return null;
  if(phases[culture]) return phases[culture];
  const n=norm(culture);
  const k=Object.keys(phases).find(kk=>norm(kk)===n);
  return k?phases[k]:null;
}

/* ---------- 2.171: код bed_id → полное имя объекта ----------
   «5»      → объект с id 5, напр. «Грядка 3»
   «2-gh0»  → объект с id 2 (теплица), грядка индекс 0 → «Теплица 1, грядка 1» */
function objectNameForBedId(scheme, bedId){
  if (bedId == null || bedId === '') return '—';
  const s = String(bedId);
  const m = s.match(/^(\d+)-gh(\d+)$/i);
  if (m) {
    const obj = (scheme.objects||[]).find(o => o.id === +m[1]);
    if (obj) return `${obj.name}, грядка ${+m[2] + 1}`;
    return s;
  }
  const num = parseInt(s, 10);
  const obj = (scheme.objects||[]).find(o => o.id === num || String(o.id) === s);
  return obj ? obj.name : s;
}

/* ---------- сбор данных ---------- */
function collectPrintData(scheme, plants, phases, planting, buildCalendar){
  const today = toDateStr(new Date());
  const wm = (scheme.weather && scheme.weather.mode) || 'normal';
  let byDay = {};
  try { byDay = buildCalendar(scheme.objects, phases, true, plants, planting, scheme.weather) || {}; } catch(e){}

  const entries = [];
  (scheme.objects||[]).forEach(o=>{
    if (o.type==='greenhouse'){
      (o.greenhouseBedCultures||[]).forEach((c,i)=>{
        if(!c) return;
        entries.push({
          culture:c, objName:`${o.name}, грядка ${i+1}`,
          phase:(((o.greenhouseBedPhases||[])[i])||{}).phase||null,
          plantingDate:(o.greenhouseBedPlantingDates||[])[i]||null,
          planted:(o.greenhouseBedPlantedCounts||[])[i] ?? null,
          actual:(o.greenhouseBedYields||[])[i] ?? null,
          kind:'greenhouseBed', wM:o.w, lM:o.l
        });
      });
    } else if (o.culture && ['bed','tree','bush'].includes(o.type)){
      entries.push({
        culture:o.culture, objName:o.name, phase:o.phase||null,
        plantingDate:o.plantingDate||null,
        planted:o.planted_count ?? null,
        actual:o.actual_yield_kg ?? null,
        kind:(o.type==='bed'?'bed':'perennial'), wM:o.w, lM:o.l
      });
    }
  });

  // 2.171: задачи по месяцам + флаг выполненности + полное имя объекта
  const store = scheme.completedTasks || {};
  const tasksByMonth = new Map();
  Object.keys(byDay).sort().forEach(d=>{
    (byDay[d]||[]).forEach(t=>{
      const mk = d.slice(0,7);
      if (!tasksByMonth.has(mk)) tasksByMonth.set(mk, []);
      tasksByMonth.get(mk).push(Object.assign({
        date: d,
        done: !!store[`${d}|${t.bed_id}|${t.name}`],
        objName: objectNameForBedId(scheme, t.bed_id)
      }, t));
    });
  });

  const byCulture = new Map();
  let estTotal = 0, actTotal = 0;
  entries.forEach(e=>{
    const ref = plantingRef(planting, e.culture);
    let count = e.planted;
    if (count == null && ref) { const est = estimateCount(ref, e); count = est ? est.count : null; }
    const estKg = (ref && count != null) ? estimateYieldKg(ref, count) : null;
    if (estKg != null) estTotal += estKg;
    if (e.actual != null) actTotal += e.actual;
    const agg = byCulture.get(e.culture) || { count:0, est:0, act:null };
    if (count != null) agg.count += count;
    if (estKg != null) agg.est = Math.round((agg.est + estKg) * 10) / 10;
    if (e.actual != null) agg.act = Math.round(((agg.act || 0) + e.actual) * 10) / 10;
    byCulture.set(e.culture, agg);
  });
  const harvestRows = [...byCulture.entries()].map(([culture,a])=>Object.assign({culture},a)).sort((a,b)=>b.est-a.est);

  return {
    today,
    weatherMode: wm,
    entries, tasksByMonth, harvestRows,
    estTotal: Math.round(estTotal),
    actTotal: Math.round(actTotal * 10) / 10
  };
}

/* ---------- векторная схема (SVG) ---------- */
function schemeSVG(scheme){
  const W = scheme.widthM, L = scheme.lengthM, S = 10; // 1 м = 10 единиц
  const p = [];
  p.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W*S} ${L*S}" class="scheme-img" role="img" aria-label="Схема участка">`);
  p.push(`<rect x="0" y="0" width="${W*S}" height="${L*S}" fill="#FFFFFF" stroke="#8A9B6E" stroke-width="1.2"/>`);
  for (let i=1;i<W;i++) p.push(`<line x1="${i*S}" y1="0" x2="${i*S}" y2="${L*S}" stroke="#E4EFC9" stroke-width="0.35"/>`);
  for (let j=1;j<L;j++) p.push(`<line x1="0" y1="${j*S}" x2="${W*S}" y2="${j*S}" stroke="#E4EFC9" stroke-width="0.35"/>`);
  (scheme.objects||[]).forEach(o=>{
    const meta = TYPE_META[o.type] || TYPE_META.bed;
    const x=o.x*S, y=o.y*S, w=o.w*S, l=o.l*S;
    p.push(`<rect x="${x}" y="${y}" width="${w}" height="${l}" rx="1.5" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="0.8"/>`);
    const cx=x+w/2, cy=y+l/2, m=Math.min(w,l);
    if (o.type==='greenhouse'){
      const cs=(o.greenhouseBedCultures||[]).filter(Boolean);
      p.push(`<text x="${cx}" y="${cy-1}" text-anchor="middle" font-size="4" fill="#3F3E3A">${esc(o.name)}</text>`);
      if (cs.length) p.push(`<text x="${cx}" y="${cy+4}" text-anchor="middle" font-size="3.2" fill="#6B6A64">${esc(cs.join(', '))}</text>`);
    } else if (o.culture){
      p.push(`<text x="${cx}" y="${cy+1}" text-anchor="middle" font-size="${m*0.5}">${emojiFor(o.culture)}</text>`);
      p.push(`<text x="${cx}" y="${cy+m*0.55}" text-anchor="middle" font-size="3" fill="#3F3E3A">${esc(o.culture)}</text>`);
      const pm = o.phase && PHASE_META[o.phase];
      if (pm) p.push(`<text x="${cx}" y="${y+l-1.2}" text-anchor="middle" font-size="2.6" fill="#6B6A64">${esc(pm.label)}</text>`);
    } else {
      p.push(`<text x="${cx}" y="${cy+1.4}" text-anchor="middle" font-size="3.4" fill="#6B6A64">${esc(o.name)}</text>`);
    }
  });
  p.push(`<text x="${W*S-2}" y="6" text-anchor="end" font-size="5" fill="#8A7A5A">☀ ${esc(DIR_NAME[scheme.sunDir||'S']||'Юг')}</text>`);
  p.push('</svg>');
  return p.join('');
}

/* ---------- HTML печатного буклета ---------- */
function buildDocHTML(scheme, D, svg, appVersion){
  const title = esc((scheme.plotName||'').trim() || 'Мой участок');
  const legend = Object.values(TYPE_META).map(m=>`<span class="lg"><i style="background:${m.fill};border:1px solid ${m.stroke}"></i>${m.label}</span>`).join('');

  const plantedTable = D.entries.length
    ? `<table><thead><tr><th>Культура</th><th>Объект</th><th>Фаза</th><th>Дата посадки</th></tr></thead><tbody>` +
      D.entries.map(e=>{
        const pm = e.phase && PHASE_META[e.phase];
        return `<tr><td>${emojiFor(e.culture)} ${esc(e.culture)}</td><td>${esc(e.objName)}</td><td>${pm?esc(pm.label):'—'}</td><td>${e.plantingDate?esc(e.plantingDate):'—'}</td></tr>`;
      }).join('') + `</tbody></table>`
    : `<p class="note">Культуры пока не посажены.</p>`;

  // 2.171: заголовки колонок в каждой месячной таблице + полное имя объекта + «✓» в чекбоксе
  let tasksHTML = '';
  if (D.tasksByMonth.size) {
    [...D.tasksByMonth.entries()].forEach(([mk, tasks])=>{
      tasksHTML += `<div class="section"><h3>${esc(monthName(mk))}</h3>` +
        `<table><thead><tr><th class="cbcell">✓</th><th class="d">Дата</th><th>Задача</th><th>Культура</th><th>Объект</th></tr></thead><tbody>` +
        tasks.map(t=>{
          return `<tr>` +
            `<td class="cbcell"><span class="cb">${t.done ? '✓' : ''}</span></td>` +
            `<td class="d">${esc(t.date.slice(8,10))}.${esc(t.date.slice(5,7))}</td>` +
            `<td>${esc(t.name||'')}</td>` +
            `<td>${esc(t.crop||'')}</td>` +
            `<td>${esc(t.objName||'—')}</td>` +
            `</tr>`;
        }).join('') +
        `</tbody></table></div>`;
    });
  } else {
    tasksHTML = `<p class="note">Задач на сезон пока нет — добавьте культуры.</p>`;
  }

  const harvestTable = D.harvestRows.length
    ? `<table><thead><tr><th>Культура</th><th>Растений</th><th>Прогноз, кг</th><th>Факт, кг (заполнить рукой)</th></tr></thead><tbody>` +
      D.harvestRows.map(r=>`<tr><td>${emojiFor(r.culture)} ${esc(r.culture)}</td><td>${r.count||'—'}</td><td>${r.est?('≈ '+r.est):'—'}</td><td class="write">${r.act!=null?r.act:''}</td></tr>`).join('') +
      `<tr class="total"><td colspan="2">Итого</td><td>≈ ${D.estTotal} кг</td><td class="write">${D.actTotal||''}</td></tr></tbody></table>`
    : `<p class="note">Добавьте культуры и запишите урожай — здесь появится сводка.</p>`;

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8" /><title>Печать — ${title}</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing:border-box; }
  body { font:12px/1.45 'Manrope', Arial, sans-serif; color:#222; margin:0; }
  h1 { font:26px 'Neucha', cursive; margin:0 0 2mm; color:#5E7247; }
  h2 { font:18px 'Neucha', cursive; margin:0 0 3mm; color:#5E7247; }
  h3 { font:14px 'Manrope', sans-serif; margin:0 0 2mm; color:#3F3E3A; }
  .meta { font-size:11px; color:#6B6A64; margin-bottom:4mm; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .section { page-break-inside: avoid; margin-bottom:5mm; }
  table { width:100%; border-collapse:collapse; font-size:10.5px; }
  th, td { border:1px solid #999; padding:1.4mm 2mm; text-align:left; vertical-align:top; }
  th { background:#EEE; }
  td.d { white-space:nowrap; width:12mm; }
  th.cbcell, td.cbcell { width:8mm; text-align:center; }
  .cb { display:inline-block; width:4mm; height:4mm; border:1.2px solid #333; font-size:3.4mm; line-height:4mm; text-align:center; }
  td.write { min-height:7mm; background:#FCFCF8; }
  tr.total td { font-weight:700; background:#F4F1E6; }
  .scheme-img { width:100%; height:auto; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
  .lg { display:inline-flex; align-items:center; gap:1.5mm; margin-right:4mm; font-size:10px; color:#6B6A64; }
  .lg i { width:4mm; height:4mm; display:inline-block; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
  .note { color:#6B6A64; font-size:11px; }
  .footer { margin-top:6mm; font-size:10px; color:#8A7A5A; }
  @media print { .no-print { display:none !important; } }
</style></head><body>
<div class="page">
  <h1>🌱 ${title}</h1>
  <div class="meta">${esc(scheme.widthM)} × ${esc(scheme.lengthM)} м · ${esc(fmtDateLong(D.today))} · план и дневник сезона</div>
  <div class="section">${svg}</div>
  <div class="section">${legend}</div>
  <div class="section"><h2>Посаженные культуры</h2>${plantedTable}</div>
</div>
<div class="page">
  <h2>Задачи сезона (отмечайте галочкой на бумаге)</h2>
  ${tasksHTML}
</div>
<div class="page">
  <h2>Урожай: прогноз и факт</h2>
  <div class="section">${harvestTable}</div>
  <p class="note">Прогноз не учитывает культуры, которые не дадут урожай в этом году (молодые посадки и поздние посевы).</p>
  <div class="footer">Создано в приложении «Умный садовод» · ${esc(fmtDateLong(D.today))} · ${esc(appVersion||'')}</div>
</div>
</body></html>`;
}

/* ---------- главный вход ---------- */
export async function exportPrint({ scheme, plants, phases, planting, compat, buildCalendar, appVersion }){
  const D = collectPrintData(scheme, plants, phases, planting, buildCalendar);
  const svg = schemeSVG(scheme);
  const html = buildDocHTML(scheme, D, svg, appVersion);

  let frame = document.getElementById('printFrame');
  if (!frame) {
    frame = document.createElement('iframe');
    frame.id = 'printFrame';
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(frame);
  }
  await new Promise(res => {
    frame.onload = () => res();
    frame.srcdoc = html;
    setTimeout(res, 800); // страховка, если onload не сработает
  });
  const win = frame.contentWindow;
  if (!win) throw new Error('нет окна печати');
  win.focus();
  win.print();
}