// src/ui/analyticsView.js — экран «Аналитика» (ревизия 2.89)
// 2.89: погода — поливы в окно дождей не считаются просрочкой; календарь вызывается с weather
// 2.85: возраст плодоношения многолетников; строка «Молодые, плодоношение позже»
// 2.82: «Урожай» не учитывает культуры без урожая в текущем году
// 2.67: имя участка в шапке + легенда фаз в Гантте; 2.64: блок «Урожай»; 2.62: KPI, недели, Гантт, риски
import { PHASE_ORDER, PHASE_META } from '../core/phaseMachine.js';
import { pairResult, familyOf } from '../core/compatibility.js';
import { screenHintHTML, emptyStateHTML, fmtNum, cropIconHTML } from './ux.js';
import { plantingRef, estimateCount, estimateYieldKg, firstFruitYear } from '../core/planting.js';
import { isRainExcused } from '../core/weather.js';

const CAT_META = {
  planting:    { label:'Посадка',     color:'#8A9B6E' },
  watering:    { label:'Полив',       color:'#7E93B8' },
  fertilizing: { label:'Подкормка',   color:'#E8A05C' },
  care:        { label:'Уход',        color:'#B9C79B' },
  protection:  { label:'Защита',      color:'#8E77A0' },
  harvest:     { label:'Сбор урожая', color:'#D97E6A' }
};
const CAT_ORDER = ['planting','watering','fertilizing','care','protection','harvest'];
const MONTHS_SHORT = ['апр','май','июн','июл','авг','сен','окт'];
const ZONE_LABEL = { full_sun:'солнечная зона', partial_shade:'лёгкая полутень', full_shade:'тень' };

function toDateStr(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; }
function addDaysISO(iso, n){ const dt=new Date(`${iso}T00:00:00`); dt.setDate(dt.getDate()+n); return toDateStr(dt); }
function daysBetween(a, b){ return Math.round((new Date(b) - new Date(a)) / 86400000); }
function fmtDM(iso){ if(!iso) return ''; const p=String(iso).split('-'); return `${p[2]}.${p[1]}`; }
function esc(s){ return String(s).replace(/"/g,'&quot;'); }

export function createAnalyticsView({ scheme, plants, phases, compat, buildCalendar, planting }) {
  const root = document.getElementById('screen-analytics-body');

  function taskKey(t){ return `${t.date}|${t.bed_id}|${t.name}`; }
  function isDone(t){ return !!((scheme.completedTasks||{})[taskKey(t)]); }
  function plantByName(name){
    const n = String(name||'').trim().toLowerCase();
    return (plants||[]).find(p => String(p.name||'').trim().toLowerCase() === n);
  }
  function phaseDataFor(culture){
    if(!phases || !culture) return null;
    if(phases[culture]) return phases[culture];
    const n = String(culture).trim().toLowerCase();
    const k = Object.keys(phases).find(k => String(k).trim().toLowerCase() === n);
    return k ? phases[k] : null;
  }
  function rectGap(A,B){
    const dx = Math.max(0, Math.max(A.x, B.x) - Math.min(A.x+A.w, B.x+B.w));
    const dy = Math.max(0, Math.max(A.y, B.y) - Math.min(A.y+A.l, B.y+B.l));
    return Math.sqrt(dx*dx+dy*dy);
  }

  /* ---------- световые зоны ---------- */
  function sunShadeDir(){
    const map={ N:[0,1], S:[0,-1], E:[-1,0], W:[1,0], NE:[-1,1], SW:[1,-1], NW:[1,1], SE:[-1,-1] };
    return map[scheme.sunDir||'S']||map.S;
  }
  function shadeRects(){
    const dir=sunShadeDir(), dx=dir[0], dy=dir[1], rects=[];
    scheme.objects.forEach(c=>{
      const h=c.height_m||0; if(h<=0) return;
      const L=h*0.9;
      if(c.type==='building'){
        let x=c.x,y=c.y,w=c.w,l=c.l;
        if(dx>0) w+=L; else if(dx<0){x-=L;w+=L;}
        if(dy>0) l+=L; else if(dy<0){y-=L;l+=L;}
        rects.push({x,y,w,l});
      } else if(c.type==='tree'||c.type==='bush'){
        if(dx>0) rects.push({x:c.x+c.w,y:c.y,w:L,l:c.l});
        else if(dx<0) rects.push({x:c.x-L,y:c.y,w:L,l:c.l});
        if(dy>0) rects.push({x:c.x,y:c.y+c.l,w:c.w,l:L});
        else if(dy<0) rects.push({x:c.x,y:c.y-L,w:c.w,l:L});
      }
    });
    return rects;
  }
  function lightZoneFor(obj){
    const rects=shadeRects(), step=0.5; let total=0, shaded=0;
    for(let py=obj.y+step/2; py<obj.y+obj.l; py+=step)
      for(let px=obj.x+step/2; px<obj.x+obj.w; px+=step){
        total++;
        if(rects.some(r=>px>=r.x&&px<=r.x+r.w&&py>=r.y&&py<=r.y+r.l)) shaded++;
      }
    if(!total) return 'full_sun';
    const f=shaded/total;
    return f<0.25?'full_sun':(f<=0.6?'partial_shade':'full_shade');
  }

  /* ---------- список «объект + культура» ---------- */
  function cultureEntries(){
    const out=[];
    scheme.objects.forEach(o=>{
      if(o.type==='greenhouse'){
        const n = o.greenhouseBedCount || 1;
        const areaEach = Math.max(0.5, (o.w*o.l)/n*0.6);
        (o.greenhouseBedCultures||[]).forEach((c,i)=>{
          if(!c) return;
          const pc = (o.greenhouseBedPlantedCounts||[])[i];
          const ay = (o.greenhouseBedYields||[])[i];
          out.push({ objName:`${o.name}, грядка ${i+1}`, culture:c, kind:'greenhouseBed', areaM2:areaEach,
            plantingDate:(o.greenhouseBedPlantingDates||[])[i]||null,
            planted:(pc===undefined?null:pc), actual:(ay===undefined?null:ay) });
        });
      } else if(o.culture && (o.type==='bed'||o.type==='tree'||o.type==='bush')){
        out.push({ objName:o.name, culture:o.culture, obj:o,
          kind:(o.type==='tree'||o.type==='bush')?'perennial':'bed',
          wM:o.w, lM:o.l, plantingDate:o.plantingDate||null,
          planted:(o.planted_count===undefined?null:o.planted_count),
          actual:(o.actual_yield_kg===undefined?null:o.actual_yield_kg) });
      }
    });
    return out;
  }

  /* ---------- 2.85: исключение культур без урожая в текущем году (с возрастом многолетников) ---------- */
  function bearsThisYear(e){
    const pd = e.plantingDate;
    if (!pd) return true; // дата посадки неизвестна — не исключаем
    const year = new Date().getFullYear();
    const plantYear = parseInt(String(pd).slice(0,4), 10);
    // многолетники — возраст плодоношения по first_fruit_year из справочника посадки
    if (e.kind === 'perennial') {
      const ref = plantingRef(planting, e.culture);
      return (year - plantYear + 1) >= firstFruitYear(ref);
    }
    // однолетники: плодоношение должно начаться до конца сезона (31.10)
    const cd = phaseDataFor(e.culture);
    if (!cd) return true;
    const order = PHASE_ORDER.filter(ph => cd[ph]);
    let days = 0, fruitingOffset = null;
    for (const ph of order) {
      if (ph === 'fruiting') { fruitingOffset = days; break; }
      days += parseInt(cd[ph].duration_days, 10) || 0;
    }
    if (fruitingOffset == null) return true; // фазы плодоношения нет — не исключаем
    return addDaysISO(pd, fruitingOffset) <= `${year}-10-31`;
  }

  /* ---------- БЛОК 1: Пульс сезона (KPI) ---------- */
  function kpiHTML(today, seasonStart, seasonEnd, allTasks){
    const total = scheme.widthM * scheme.lengthM;
    const occupied = scheme.objects.reduce((s,o)=>s + o.w*o.l, 0);
    const occPct = Math.min(100, Math.round(occupied/total*100));
    const entries = cultureEntries();
    const cultures = [...new Set(entries.map(e=>e.culture))];
    const g = { 'овощи':0, 'зелень':0, 'ягоды':0, 'деревья':0, 'кустарники':0 };
    cultures.forEach(c=>{
      const p = plantByName(c);
      const t = String((p && p.type) || 'овощ').toLowerCase();
      if(t.includes('дерево')) g['деревья']++;
      else if(t.includes('кустарник')) g['кустарники']++;
      else if(t.includes('ягода')) g['ягоды']++;
      else if(t.includes('зелень')) g['зелень']++;
      else g['овощи']++;
    });
    const groupsStr = Object.keys(g).filter(k=>g[k]).map(k=>`${k} ${g[k]}`).join(' · ') || '—';
    const done = allTasks.filter(isDone).length;
    const donePct = allTasks.length ? Math.round(done/allTasks.length*100) : 0;
    // 2.89: поливы в окно дождей не считаются просрочкой
    const overdue = allTasks.filter(t=>t.date<today && !isDone(t) && !isRainExcused(scheme, t, today)).length;
    const daysLeft = Math.max(0, daysBetween(today, seasonEnd));
    const seasonPct = Math.max(0, Math.min(100, Math.round(daysBetween(seasonStart, today) / daysBetween(seasonStart, seasonEnd) * 100)));
    return `<div class="an-section">
      <h3>📈 Пульс сезона</h3>
      <div class="an-kpi-grid">
        <div class="an-kpi"><div class="an-kpi-value">${occPct}%</div><div class="an-kpi-label">участка занято</div><div class="an-kpi-sub">${fmtNum(occupied)} из ${fmtNum(total)} м² · свободно ${fmtNum(Math.max(0,total-occupied))} м²</div><div class="an-progress"><i style="width:${occPct}%"></i></div></div>
        <div class="an-kpi"><div class="an-kpi-value">${cultures.length}</div><div class="an-kpi-label">культур посажено</div><div class="an-kpi-sub">${groupsStr}</div></div>
        <div class="an-kpi"><div class="an-kpi-value">${donePct}%</div><div class="an-kpi-label">задач выполнено</div><div class="an-kpi-sub">${done} из ${allTasks.length} · просрочено: ${overdue}</div><div class="an-progress"><i style="width:${donePct}%"></i></div></div>
        <div class="an-kpi"><div class="an-kpi-value">${daysLeft}</div><div class="an-kpi-label">дней до конца сезона</div><div class="an-kpi-sub">сезон пройден на ${seasonPct}%</div><div class="an-progress"><i style="width:${seasonPct}%"></i></div></div>
      </div>
    </div>`;
  }

  /* ---------- БЛОК 2: Загруженность по неделям ---------- */
  function weeksHTML(today, seasonStart, allTasks){
    const seasonEndTmp = addDaysISO(seasonStart, 213);
    const weekCount = Math.ceil((daysBetween(seasonStart, seasonEndTmp)+1)/7);
    const buckets = Array.from({length:weekCount}, ()=>({}));
    allTasks.forEach(t=>{
      const idx = Math.floor(daysBetween(seasonStart, t.date)/7);
      if(idx<0 || idx>=weekCount) return;
      const b = buckets[idx];
      b[t.category] = (b[t.category]||0)+1;
    });
    const totals = buckets.map(b=>CAT_ORDER.reduce((s,c)=>s+(b[c]||0),0));
    const max = Math.max(1, ...totals);
    const curIdx = Math.floor(daysBetween(seasonStart, today)/7);
    const peak = Math.max(...totals);
    const peakIdx = totals.indexOf(peak);
    const bars = buckets.map((b,i)=>{
      const segs = CAT_ORDER.filter(c=>b[c]).map(c=>`<span style="flex:${b[c]} 0 0;background:${CAT_META[c].color}" title="${CAT_META[c].label}: ${b[c]}"></span>`).join('');
      const h = totals[i] ? Math.max(4, Math.round(totals[i]/max*100)) : 0;
      const ws = addDaysISO(seasonStart, i*7);
      const cls = `an-week${(i===peakIdx && totals[i])?' peak':''}${i===curIdx?' now':''}`;
      return `<div class="${cls}" style="height:${h}%" title="неделя с ${fmtDM(ws)}: ${totals[i]} задач">${segs}</div>`;
    }).join('');
    const legend = CAT_ORDER.map(c=>`<span><i style="background:${CAT_META[c].color}"></i>${CAT_META[c].label}</span>`).join('');
    return `<div class="an-section">
      <h3>📅 Загруженность по неделям</h3>
      <div class="an-weeks">${bars}</div>
      <div class="an-weeks-axis">${MONTHS_SHORT.map(m=>`<span>${m}</span>`).join('')}</div>
      <div class="an-legend">${legend}</div>
      <div class="an-kpi-sub" style="margin-top:8px">Пиковая неделя: ${peak||0} задач · на этой неделе: ${totals[curIdx]||0} задач</div>
    </div>`;
  }

  /* ---------- БЛОК 3: Гантт фаз ---------- */
  function monthAxis(seasonStart, year, seasonLen){
    return [['апр',4],['май',5],['июн',6],['июл',7],['авг',8],['сен',9],['окт',10]].map(([label,m])=>{
      const d = `${year}-${String(m).padStart(2,'0')}-01`;
      const left = Math.max(0, daysBetween(seasonStart, d)/seasonLen*100);
      return `<span style="left:${left.toFixed(2)}%">${label}</span>`;
    }).join('');
  }
  function ganttHTML(today, year, seasonStart, seasonLen, seasonEnd){
    const rows = [];
    const usedPhases = new Set();
    cultureEntries().forEach(e=>{
      const cd = phaseDataFor(e.culture);
      if(!cd) return;
      let order = PHASE_ORDER.filter(ph=>cd[ph]);
      let start;
      const pd = e.plantingDate;
      if(pd && pd.slice(0,4) < year){
        order = order.filter(ph=>!['seed','seedling','planting'].includes(ph));
        start = seasonStart;
      } else if(pd && pd >= seasonStart && pd <= seasonEnd){
        start = pd;
      } else {
        start = seasonStart;
      }
      if(!order.length) return;
      let cur = start;
      const segs = [];
      for(const ph of order){
        const dur = parseInt(cd[ph].duration_days,10) || 0;
        const end = addDaysISO(cur, dur);
        const s1 = cur < seasonStart ? seasonStart : cur;
        const e1 = end > seasonEnd ? seasonEnd : end;
        if(e1 > s1){
          usedPhases.add(ph);
          const left = daysBetween(seasonStart, s1)/seasonLen*100;
          const width = Math.max(1, daysBetween(s1, e1)/seasonLen*100);
          const meta = PHASE_META[ph] || {};
          segs.push(`<span class="an-gantt-seg" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%;background:${meta.color||'#ccc'}" title="${esc(meta.label||ph)}: ${fmtDM(s1)}–${fmtDM(e1)}"></span>`);
        }
        cur = end;
        if(cur > seasonEnd) break;
      }
      if(!segs.length) return;
      const icon = cropIconHTML(e.culture, 16);
      rows.push(`<div class="an-gantt-row">
        <div class="an-gantt-label" title="${esc(e.objName)}: ${esc(e.culture)}">${icon||''} ${esc(e.objName)} · ${esc(e.culture)}</div>
        <div class="an-gantt-track">${segs.join('')}</div>
      </div>`);
    });
    if(!rows.length) return '';
    const shown = rows.slice(0,14);
    const more = rows.length>14 ? `<div class="an-kpi-sub" style="margin-top:6px">…и ещё ${rows.length-14} культур(ы)</div>` : '';
    const p = Math.max(0, Math.min(1, daysBetween(seasonStart, today)/seasonLen));
    const axis = monthAxis(seasonStart, year, seasonLen);
    const phaseLegend = PHASE_ORDER.filter(ph=>usedPhases.has(ph)).map(ph=>{
      const meta = PHASE_META[ph] || {};
      return `<span title="${esc(meta.label||ph)}"><i style="background:${meta.color||'#ccc'}"></i>${meta.icon||''} ${esc(meta.label||ph)}</span>`;
    }).join('');
    return `<div class="an-section">
      <h3>🌱 Фазы по культурам (апрель–октябрь)</h3>
      <div class="an-gantt">
        <div class="an-gantt-today" style="left:calc(200px + (100% - 200px)*${p.toFixed(4)})" title="сегодня"></div>
        ${shown.join('')}
        ${more}
        <div class="an-gantt-axis"><div></div><div class="an-gantt-months">${axis}</div></div>
      </div>
      ${phaseLegend ? `<div class="an-legend" style="margin-top:12px">${phaseLegend}</div>` : ''}
      <div class="an-kpi-sub" style="margin-top:6px">Красная вертикальная линия — сегодня. Цвет сегмента = фаза развития (см. легенду).</div>
    </div>`;
  }

  /* ---------- БЛОК 4: Урожай (2.85: с возрастом плодоношения) ---------- */
  function harvestHTML(){
    const entries = cultureEntries().filter(e => bearsThisYear(e));
    // 2.85: молодые многолетники — плодоношение позже
    const youngSet = new Map();
    cultureEntries().forEach(e=>{
      if (e.kind !== 'perennial' || !e.plantingDate) return;
      const plantYear = parseInt(String(e.plantingDate).slice(0,4),10);
      if (!isFinite(plantYear)) return;
      const ref = plantingRef(planting, e.culture);
      const firstYear = plantYear + firstFruitYear(ref) - 1;
      if (firstYear > new Date().getFullYear()) youngSet.set(`${e.culture}|${firstYear}`, `${e.culture} (с ${firstYear})`);
    });
    const youngList = [...youngSet.values()];
    const youngRow = youngList.length ? `<div class="an-kpi-sub">🌱 Молодые, плодоношение позже: ${youngList.join(', ')}.</div>` : '';
    if(!entries.length){
      if(youngList.length){
        return `<div class="an-section"><h3>🧺 Урожай</h3>${youngRow}</div>`;
      }
      return '';
    }
    const byCulture = new Map();
    let totalEst = 0, totalAct = 0, totalArea = 0, actEntries = 0, refEntries = 0;
    entries.forEach(e=>{
      const ref = plantingRef(planting, e.culture);
      const area = e.areaM2 != null ? e.areaM2 : ((e.wM||0)*(e.lM||0));
      totalArea += area;
      let count = e.planted;
      if(count == null && ref){ const est = estimateCount(ref, e); count = est ? est.count : null; }
      const estKg = (ref && count != null) ? estimateYieldKg(ref, count) : null;
      if(ref) refEntries++;
      if(estKg != null) totalEst += estKg;
      if(e.actual != null){ totalAct += e.actual; actEntries++; }
      const agg = byCulture.get(e.culture) || { count:0, est:0, act:0, hasAct:false };
      if(count != null) agg.count += count;
      if(estKg != null) agg.est = Math.round((agg.est + estKg)*10)/10;
      if(e.actual != null){ agg.act = Math.round((agg.act + e.actual)*10)/10; agg.hasAct = true; }
      byCulture.set(e.culture, agg);
    });
    if(!refEntries && !actEntries){
      return `<div class="an-section"><h3>🧺 Урожай</h3><div class="an-risk ok">Справочник схем посадки (data/planting.json) не загружен и фактический урожай ещё не записан.</div>${youngRow}</div>`;
    }
    const rowsHtml = [...byCulture.entries()]
      .sort((a,b)=> b[1].est - a[1].est)
      .map(([culture,agg])=>{
        const icon = cropIconHTML(culture, 16);
        const dev = (agg.hasAct && agg.est > 0) ? Math.round(agg.act/agg.est*100) : null;
        const devColor = dev == null ? 'var(--ink-soft)' : (dev >= 90 ? '#2F7D32' : dev >= 60 ? '#E8A05C' : '#C0392B');
        return `<tr style="border-bottom:1px solid rgba(63,62,58,.08)">
          <td style="padding:7px 8px">${icon||''} ${esc(culture)}</td>
          <td style="padding:7px 8px;text-align:center">${agg.count || '—'}</td>
          <td style="padding:7px 8px;text-align:center">${agg.est ? '≈ ' + agg.est : '—'}</td>
          <td style="padding:7px 8px;text-align:center;font-weight:${agg.hasAct?700:400}">${agg.hasAct ? agg.act : '—'}</td>
          <td style="padding:7px 8px;text-align:center;color:${devColor};font-weight:700">${dev == null ? '—' : dev + '%'}</td>
        </tr>`;
      }).join('');
    const perM2 = (totalAct > 0 && totalArea > 0) ? (totalAct/totalArea).toFixed(2) : null;
    return `<div class="an-section">
      <h3>🧺 Урожай</h3>
      <div style="background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow-s);padding:10px 12px;overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr style="border-bottom:2px solid rgba(63,62,58,.12)">
            <th style="text-align:left;padding:7px 8px;font-size:12px;color:var(--ink-soft)">Культура</th>
            <th style="padding:7px 8px;font-size:12px;color:var(--ink-soft)">Растений</th>
            <th style="padding:7px 8px;font-size:12px;color:var(--ink-soft)">Оценка, кг</th>
            <th style="padding:7px 8px;font-size:12px;color:var(--ink-soft)">Факт, кг</th>
            <th style="padding:7px 8px;font-size:12px;color:var(--ink-soft)">Отклонение</th>
          </tr>
          ${rowsHtml}
        </table>
      </div>
      <div class="an-kpi-sub" style="margin-top:8px">Всего по оценке: ≈ ${Math.round(totalEst)} кг · записано факта: ${Math.round(totalAct*10)/10} кг (${actEntries} записей)${perM2 ? ` · урожайность ${perM2} кг/м²` : ''}</div>
      <div class="an-kpi-sub">Фактический урожай записывается в настройках объекта на схеме (поле «Фактический урожай, кг») по окончании плодоношения.</div>
      <div class="an-kpi-sub">Не учитываются культуры, которые не дадут урожай в этом году: саженцы до возраста плодоношения и поздние посадки однолетников.</div>
      ${youngRow}
    </div>`;
  }

  /* ---------- БЛОК 5: Риски и проблемы ---------- */
  function risksHTML(today, allTasks){
    const risks = [];
    const beds = scheme.objects.filter(o=>o.type==='bed' && o.culture);
    for(let i=0;i<beds.length;i++) for(let j=i+1;j<beds.length;j++){
      if(rectGap(beds[i],beds[j])<=1.5 && pairResult(compat, beds[i].culture, beds[j].culture)==='bad')
        risks.push(`⚠ «${beds[i].culture}» и «${beds[j].culture}» рядом (${beds[i].name}, ${beds[j].name}) — плохая совместимость`);
    }
    scheme.objects.filter(o=>o.type==='greenhouse').forEach(o=>{
      const cs=(o.greenhouseBedCultures||[]).filter(Boolean);
      for(let i=0;i<cs.length;i++) for(let j=i+1;j<cs.length;j++){
        if(pairResult(compat, cs[i], cs[j])==='bad')
          risks.push(`⚠ «${cs[i]}» и «${cs[j]}» в «${o.name}» — плохая совместимость`);
      }
    });
    scheme.objects.forEach(o=>{
      if(!['bed','tree','bush'].includes(o.type) || !o.culture) return;
      const plant = plantByName(o.culture);
      if(!plant || !Array.isArray(plant.light_requirements) || !plant.light_requirements.length) return;
      const zone = lightZoneFor(o);
      const reqs = plant.light_requirements.map(r=>String(r).trim());
      if(!reqs.includes(zone)){
        const short = { full_sun:'солнце', partial_shade:'полутень', full_shade:'тень' };
        risks.push(`🌥 «${o.culture}» (${o.name}): требует ${reqs.map(r=>short[r]||r).join('/')}, фактически — ${ZONE_LABEL[zone]||zone}`);
      }
    });
    const year = new Date().getFullYear();
    scheme.objects.forEach(o=>{
      if(o.type!=='bed' || !o.culture) return;
      const fam = familyOf(compat, o.culture); if(!fam) return;
      const prev = (o.history||[]).filter(h=>h.year<year).sort((a,b)=>b.year-a.year)[0];
      if(prev && familyOf(compat, prev.culture)===fam)
        risks.push(`🔄 «${o.name}»: ${o.culture} после ${prev.culture} (${prev.year}) — та же семья ${fam}`);
    });
    // 2.89: просрочка без «можно пропустить»
    const overdue = allTasks.filter(t=>t.date<today && !isDone(t) && !isRainExcused(scheme, t, today));
    if(overdue.length) risks.push(`⏰ Просроченных задач: ${overdue.length} — загляните в «Календарь»`);
    return `<div class="an-section">
      <h3>⚠️ Риски и проблемы</h3>
      <div class="an-risks">
        ${ risks.length ? risks.map(r=>`<div class="an-risk">${esc(r)}</div>`).join('') : '<div class="an-risk ok">🎉 Проблем не найдено: совместимость, свет и севооборот в порядке.</div>' }
      </div>
    </div>`;
  }

  /* ---------- рендер ---------- */
  function render(){
    if(!root) return;
    if(!scheme.objects.length){
      root.innerHTML = screenHintHTML('Сводные показатели сезона: загруженность, фазы культур, урожай и риски по данным схемы.') +
        emptyStateHTML({ icon:'📊', title:'Пока нечего анализировать', text:'Добавьте объекты и культуры на схему — здесь появятся показатели сезона, загруженность по неделям, фазы культур, урожай и риски.' });
      return;
    }
    const today = toDateStr(new Date());
    const year = today.slice(0,4);
    const seasonStart = `${year}-04-01`, seasonEnd = `${year}-10-31`;
    const seasonLen = Math.max(1, daysBetween(seasonStart, seasonEnd));
    // 2.89: погода передаётся в календарь (советные задачи)
    const byDay = buildCalendar(scheme.objects, phases, true, plants, planting, scheme.weather) || {};
    const allTasks = [];
    Object.keys(byDay).forEach(d=>{ byDay[d].forEach(t=>allTasks.push(t)); });

    const plotName = (scheme.plotName || '').trim();
    const plotBanner = plotName
      ? `<div class="an-plot-name">🏡 Участок «${esc(plotName)}»</div>`
      : '';

    root.innerHTML =
      plotBanner +
      screenHintHTML('Сводные показатели сезона: занято/свободно, выполнение задач, фазы культур, урожай и риски. После изменения схемы переключитесь на другой экран и вернитесь для обновления.') +
      kpiHTML(today, seasonStart, seasonEnd, allTasks) +
      weeksHTML(today, seasonStart, allTasks) +
      ganttHTML(today, year, seasonStart, seasonLen, seasonEnd) +
      harvestHTML() +
      risksHTML(today, allTasks);
  }

  return { render };
}