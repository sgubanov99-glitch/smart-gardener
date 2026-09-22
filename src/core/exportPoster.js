// src/core/exportPoster.js — постер «Мой участок» (ревизия 2.113)
// 2.113: относительные пути assets/chick_full.svg и assets/logo.svg (для подпапки GitHub Pages)
// 2.106: иконки культур на крыше теплицы (до 4 грядок)
// 2.105: знак бренда в шапке постера (вместо солнца, с фолбэком)
// 2.89: просрочка без «можно пропустить» (isRainExcused)
// 2.85: «Урожай» учитывает возраст плодоношения многолетников (first_fruit_year)
// 2.84: Гантт шире (780 px, подписи 210 px), Цыпа компактнее (324 px) со случайной фразой
// 2.83: новая раскладка — Гантт под планом, Цыпа справа, недели и урожай внизу
// 2.82: «Урожай» не учитывает культуры без урожая в текущем году
// 2.78: убран блок «Риски»; 2.77: постер A4, 3D-план, SVG-иконки, Цыпа с облачком
import { PHASE_ORDER, PHASE_META } from './phaseMachine.js';
import { plantingRef, estimateCount, estimateYieldKg, firstFruitYear } from './planting.js';
import { isRainExcused } from './weather.js';
import { cropIconHTML } from '../ui/ux.js';

const PW = 1240, PH = 1754;

const CAT_META = {
  planting:{label:'Посадка',color:'#8A9B6E'},
  watering:{label:'Полив',color:'#7E93B8'},
  fertilizing:{label:'Подкормка',color:'#E8A05C'},
  care:{label:'Уход',color:'#B9C79B'},
  protection:{label:'Защита',color:'#8E77A0'},
  harvest:{label:'Сбор урожая',color:'#D97E6A'}
};
const CAT_ORDER = ['planting','watering','fertilizing','care','protection','harvest'];
const TYPE_TOP  = { building:'#F9E8D4', greenhouse:'#DCF2E0', bed:'#E5F7CF', tree:'#D9F0EC', bush:'#FDECCB' };
const TYPE_SIDE = { building:'#D9B48F', greenhouse:'#9CCFA8', bed:'#B0D37E', tree:'#96C9C1', bush:'#E2BE88' };
const DIR_NAME = { N:'Север', S:'Юг', E:'Восток', W:'Запад', NE:'Северо-восток', NW:'Северо-запад', SE:'Юго-восток', SW:'Юго-запад' };
const PLANT_EMOJI = {
  'томат':'🍅','огурец':'🥒','перец':'🫑','капуста':'🥬','редис':'🌶',
  'морковь':'🥕','свёкла':'🟣','лук':'🧅','чеснок':'🧄','картофель':'🥔',
  'клубника':'🍓','земляника садовая':'🍓','укроп':'🌿','петрушка':'🌿',
  'салат':'🥬','шпинат':'🥬','тыква':'🎃','кабачок':'🥒','патиссон':'🎃',
  'дыня':'🍈','арбуз':'🍉','баклажан':'🍆','горох':'🫛','фасоль':'🫘',
  'репа':'🍠','рукола':'🌿','щавель':'🍃','кинза':'🌿'
};
// 2.84: фразы Цыпы для постера (случайная при каждом экспорте)
const POSTER_PHRASES = [
  'Это твой участок — здесь всё растёт с любовью!',
  'Твой сад — твоя гордость! Здесь всё по-хозяйски',
  'Каждый росток на своём месте — и это твоя заслуга!',
  'Хороший план — богатый урожай! Так держать!',
  'Здесь живёт забота — и она обязательно зацветёт!',
  'Участок мечты растёт по твоему плану!'
];

/* ---------- утилиты ---------- */
function toDateStr(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; }
function addDaysISO(iso,n){ const dt=new Date(`${iso}T00:00:00`); dt.setDate(dt.getDate()+n); return toDateStr(dt); }
function daysBetween(a,b){ return Math.round((new Date(b)-new Date(a))/86400000); }
function norm(s){ return String(s||'').trim().toLowerCase(); }
function fmtDM(iso){ const p=String(iso).split('-'); return `${p[2]}.${p[1]}`; }
function fmtDateLong(iso){
  const MON=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const p=String(iso).split('-');
  return `${parseInt(p[2],10)} ${MON[parseInt(p[1],10)-1]} ${p[0]}`;
}
function darken(hex,f){
  const n=parseInt(hex.slice(1),16);
  const r=Math.round(((n>>16)&255)*(1-f)), g=Math.round(((n>>8)&255)*(1-f)), b=Math.round((n&255)*(1-f));
  return `rgb(${r},${g},${b})`;
}
function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}
function poly(ctx,pts,fill,stroke){
  ctx.beginPath();
  pts.forEach((p,i)=> i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));
  ctx.closePath();
  if(fill){ ctx.fillStyle=fill; ctx.fill(); }
  if(stroke){ ctx.strokeStyle=stroke; ctx.lineWidth=1; ctx.stroke(); }
}
function clipText(ctx,text,maxW){
  if(ctx.measureText(text).width<=maxW) return text;
  let t=text;
  while(t.length>1 && ctx.measureText(t+'…').width>maxW) t=t.slice(0,-1);
  return t+'…';
}
function wrapText(ctx,text,maxW){
  const words=String(text).split(' ');
  const lines=[]; let line='';
  words.forEach(w=>{
    const cand=line?line+' '+w:w;
    if(ctx.measureText(cand).width>maxW && line){ lines.push(line); line=w; }
    else line=cand;
  });
  if(line) lines.push(line);
  return lines;
}

/* ---------- сбор данных ---------- */
function phaseDataFor(phases, culture){
  if(!phases||!culture) return null;
  if(phases[culture]) return phases[culture];
  const n=norm(culture);
  const k=Object.keys(phases).find(kk=>norm(kk)===n);
  return k?phases[k]:null;
}

function collectData(scheme, plants, phases, planting, buildCalendar){
  const D = {};
  const today = toDateStr(new Date());
  D.today = today;
  D.year = today.slice(0,4);
  D.seasonStart = `${D.year}-04-01`;
  D.seasonEnd = `${D.year}-10-31`;
  D.seasonLen = Math.max(1, daysBetween(D.seasonStart, D.seasonEnd));

  let byDay = {};
  try { byDay = buildCalendar(scheme.objects, phases, true, plants, planting, scheme.weather) || {}; } catch(e){}
  const all = [];
  Object.keys(byDay).forEach(d => byDay[d].forEach(t => all.push(t)));
  const store = scheme.completedTasks || {};
  const key = t => `${t.date}|${t.bed_id}|${t.name}`;

  const totalArea = scheme.widthM * scheme.lengthM;
  const occupied = scheme.objects.reduce((s,o)=>s+o.w*o.l,0);
  D.occPct = Math.min(100, Math.round(occupied/totalArea*100));
  D.freeArea = Math.max(0, Math.round((totalArea-occupied)*10)/10);

  const entries = [];
  scheme.objects.forEach(o=>{
    if(o.type==='greenhouse'){
      const n=o.greenhouseBedCount||1, area=Math.max(0.5,(o.w*o.l)/n*0.6);
      (o.greenhouseBedCultures||[]).forEach((c,i)=>{
        if(!c) return;
        const pc=(o.greenhouseBedPlantedCounts||[])[i], ay=(o.greenhouseBedYields||[])[i];
        entries.push({ objName:`${o.name}, грядка ${i+1}`, culture:c, kind:'greenhouseBed', areaM2:area,
          plantingDate:(o.greenhouseBedPlantingDates||[])[i]||null,
          planted:(pc===undefined?null:pc), actual:(ay===undefined?null:ay),
          phase:(((o.greenhouseBedPhases||[])[i])||{}).phase||null });
      });
    } else if(o.culture && ['bed','tree','bush'].includes(o.type)){
      entries.push({ objName:o.name, culture:o.culture, obj:o, kind:(o.type==='bed'?'bed':'perennial'),
        wM:o.w, lM:o.l, plantingDate:o.plantingDate||null,
        planted:(o.planted_count===undefined?null:o.planted_count),
        actual:(o.actual_yield_kg===undefined?null:o.actual_yield_kg),
        phase:o.phase||null });
    }
  });
  D.entries = entries;
  D.cultures = [...new Set(entries.map(e=>e.culture))];

  D.doneTasks = all.filter(t=>store[key(t)]).length;
  D.totalTasks = all.length;
  D.donePct = all.length ? Math.round(D.doneTasks/all.length*100) : 0;
  // 2.89: поливы в окно дождей не считаются просрочкой
  D.overdue = all.filter(t=>t.date<today && !store[key(t)] && !isRainExcused(scheme, t, today)).length;
  D.daysLeft = Math.max(0, daysBetween(today, D.seasonEnd));
  D.seasonPct = Math.max(0, Math.min(100, Math.round(daysBetween(D.seasonStart,today)/D.seasonLen*100)));

  const weekCount = Math.ceil((daysBetween(D.seasonStart, D.seasonEnd)+1)/7);
  const weeks = Array.from({length:weekCount},()=>({}));
  all.forEach(t=>{ const i=Math.floor(daysBetween(D.seasonStart,t.date)/7); if(i>=0&&i<weekCount){ weeks[i][t.category]=(weeks[i][t.category]||0)+1; } });
  D.weeks = weeks;
  D.weekTotals = weeks.map(b=>CAT_ORDER.reduce((s,c)=>s+(b[c]||0),0));
  D.weekPeak = Math.max(0, ...D.weekTotals);
  D.weekPeakIdx = D.weekTotals.indexOf(D.weekPeak);
  D.weekNow = D.weekTotals[Math.floor(daysBetween(D.seasonStart,today)/7)] || 0;

  const rows=[];
  entries.forEach(e=>{
    const cd = phaseDataFor(phases, e.culture);
    if(!cd) return;
    let order = PHASE_ORDER.filter(ph=>cd[ph]);
    const pd = e.plantingDate;
    let start;
    if(pd && pd.slice(0,4) < D.year){ order=order.filter(ph=>!['seed','seedling','planting'].includes(ph)); start=D.seasonStart; }
    else if(pd && pd>=D.seasonStart && pd<=D.seasonEnd) start=pd;
    else start=D.seasonStart;
    if(!order.length) return;
    let cur=start; const segs=[];
    for(const ph of order){
      const dur=parseInt(cd[ph].duration_days,10)||0;
      const end=addDaysISO(cur,dur);
      const s1=cur<D.seasonStart?D.seasonStart:cur;
      const e1=end>D.seasonEnd?D.seasonEnd:end;
      if(e1>s1) segs.push({ph,s:s1,e:e1});
      cur=end;
      if(cur>D.seasonEnd) break;
    }
    if(segs.length) rows.push({ label:`${e.objName} · ${e.culture}`, culture:e.culture, segs });
  });
  D.gantt = rows.slice(0,12);
  D.ganttTotal = rows.length;

  // 2.85: исключаем культуры, которые не успеют дать урожай в этом году (с возрастом многолетников)
  function bearsThisYear(e){
    const pd = e.plantingDate;
    if (!pd) return true;
    const year = Number(D.year);
    const plantYear = parseInt(String(pd).slice(0,4), 10);
    if (e.kind === 'perennial') {
      const ref = plantingRef(planting, e.culture);
      return (year - plantYear + 1) >= firstFruitYear(ref);
    }
    const cd = phaseDataFor(phases, e.culture);
    if (!cd) return true;
    const order = PHASE_ORDER.filter(ph => cd[ph]);
    let days = 0, fruitingOffset = null;
    for (const ph of order) {
      if (ph === 'fruiting') { fruitingOffset = days; break; }
      days += parseInt(cd[ph].duration_days, 10) || 0;
    }
    if (fruitingOffset == null) return true;
    return addDaysISO(pd, fruitingOffset) <= D.seasonEnd;
  }

  const byCulture = new Map();
  let estTotal=0, actTotal=0, actCount=0;
  entries.filter(e => bearsThisYear(e)).forEach(e=>{
    const ref = plantingRef(planting, e.culture);
    let count = e.planted;
    if(count==null && ref){ const est=estimateCount(ref,e); count = est?est.count:null; }
    const estKg = (ref && count!=null) ? estimateYieldKg(ref,count) : null;
    if(estKg!=null) estTotal+=estKg;
    if(e.actual!=null){ actTotal+=e.actual; actCount++; }
    const agg = byCulture.get(e.culture) || {count:0, est:0, act:0, hasAct:false};
    if(count!=null) agg.count+=count;
    if(estKg!=null) agg.est=Math.round((agg.est+estKg)*10)/10;
    if(e.actual!=null){ agg.act=Math.round((agg.act+e.actual)*10)/10; agg.hasAct=true; }
    byCulture.set(e.culture, agg);
  });
  D.harvestRows = [...byCulture.entries()].map(([culture,a])=>Object.assign({culture},a)).sort((a,b)=>b.est-a.est);
  D.estTotal = Math.round(estTotal);
  D.actTotal = Math.round(actTotal*10)/10;
  D.actCount = actCount;

  return D;
}

/* ---------- загрузка иконок, Цыпы и знака бренда ---------- */
async function loadIcons(D){
  const icons={};
  const wanted=new Set(D.entries.map(e=>e.culture));
  D.harvestRows.forEach(r=>wanted.add(r.culture));
  D.gantt.forEach(r=>wanted.add(r.culture));
  const jobs=[];
  wanted.forEach(culture=>{
    let id=null;
    try {
      const html=cropIconHTML(culture,24);
      if(html){ const d=document.createElement('div'); d.innerHTML=html; const u=d.querySelector('use'); if(u) id=(u.getAttribute('href')||u.getAttribute('xlink:href')||'').replace('#',''); }
    } catch(e){}
    if(!id) return;
    const sym=document.getElementById(id);
    if(!sym) return;
    const vb=sym.getAttribute('viewBox')||'0 0 64 64';
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${sym.innerHTML}</svg>`;
    jobs.push(new Promise(res=>{
      const img=new Image();
      img.onload=()=>{ icons[culture]=img; res(); };
      img.onerror=()=>res();
      img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
    }));
  });
  jobs.push(new Promise(res=>{
    const img=new Image();
    img.onload=()=>{ icons.__tsypa=img; res(); };
    img.onerror=()=>res();
    img.src='assets/chick_full.svg'; // 2.113: относительный путь
  }));
  // 2.105: знак бренда для шапки постера
  jobs.push(new Promise(res=>{
    const img=new Image();
    img.onload=()=>{ icons.__logo=img; res(); };
    img.onerror=()=>res();
    img.src='assets/logo.svg'; // 2.113: относительный путь
  }));
  await Promise.all(jobs);
  return icons;
}

/* ---------- фон, рамка, декор ---------- */
function drawSprig(ctx,x,y,fx,fy){
  ctx.save(); ctx.translate(x,y); ctx.scale(fx,fy);
  ctx.strokeStyle='#8A9B6E'; ctx.lineWidth=2; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(0,0); ctx.quadraticCurveTo(20,8,40,4); ctx.stroke();
  ctx.fillStyle='rgba(138,155,110,.85)';
  [[10,-1,-0.6],[22,4,-0.15],[33,5,0.25]].forEach(([lx,ly,rot])=>{
    ctx.save(); ctx.translate(lx,ly); ctx.rotate(rot);
    ctx.beginPath(); ctx.ellipse(0,-5,4.2,7.5,0,0,Math.PI*2); ctx.fill();
    ctx.restore();
  });
  ctx.fillStyle='#D9A5A0'; ctx.beginPath(); ctx.arc(42,4,3.6,0,Math.PI*2); ctx.fill();
  ctx.restore();
}
function drawSun(ctx,x,y,r){
  ctx.save();
  ctx.strokeStyle='#F2C14E'; ctx.lineWidth=3; ctx.lineCap='round';
  for(let i=0;i<8;i++){ const a=i*Math.PI/4;
    ctx.beginPath(); ctx.moveTo(x+Math.cos(a)*(r+5),y+Math.sin(a)*(r+5)); ctx.lineTo(x+Math.cos(a)*(r+11),y+Math.sin(a)*(r+11)); ctx.stroke(); }
  const g=ctx.createRadialGradient(x-4,y-4,2,x,y,r);
  g.addColorStop(0,'#FFE9A8'); g.addColorStop(1,'#F2C14E');
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  ctx.restore();
}
function drawBackground(ctx){
  const g=ctx.createLinearGradient(0,0,0,PH);
  g.addColorStop(0,'#F8F1E0'); g.addColorStop(1,'#F1E8D7');
  ctx.fillStyle=g; ctx.fillRect(0,0,PW,PH);
  const rg=ctx.createRadialGradient(PW/2,PH/2,PH*0.3,PW/2,PH/2,PH*0.75);
  rg.addColorStop(0,'rgba(0,0,0,0)'); rg.addColorStop(1,'rgba(120,100,60,.07)');
  ctx.fillStyle=rg; ctx.fillRect(0,0,PW,PH);
  roundRect(ctx,24,24,PW-48,PH-48,22); ctx.strokeStyle='#8A9B6E'; ctx.lineWidth=3; ctx.stroke();
  roundRect(ctx,34,34,PW-68,PH-68,16); ctx.strokeStyle='rgba(138,155,110,.45)'; ctx.lineWidth=1; ctx.stroke();
  drawSprig(ctx,52,52,1,1);
  drawSprig(ctx,PW-52,52,-1,1);
  drawSprig(ctx,52,PH-52,1,-1);
  drawSprig(ctx,PW-52,PH-52,-1,-1);
}
function drawHeader(ctx, scheme, D){
  // 2.105: знак бренда вместо солнца (фолбэк — солнце)
  if (D.icons && D.icons.__logo) ctx.drawImage(D.icons.__logo, 74, 70, 46, 46);
  else drawSun(ctx, 96, 92, 18);
  ctx.textAlign='left'; ctx.font='700 15px Manrope, sans-serif'; ctx.fillStyle='#8A6D3B';
  ctx.fillText('Умный садовод', 126, 98);
  ctx.textAlign='right'; ctx.font='600 14px Manrope, sans-serif'; ctx.fillStyle='#8A7A5A';
  ctx.fillText(`${scheme.widthM} × ${scheme.lengthM} м · ${fmtDateLong(D.today)}`, PW-64, 98);
  const title=(scheme.plotName||'').trim()||'Мой участок';
  ctx.textAlign='center';
  ctx.font='400 56px Neucha, cursive'; ctx.fillStyle='#5E7247';
  ctx.fillText(title, PW/2, 152);
  const w=Math.min(560, ctx.measureText(title).width+90);
  ctx.strokeStyle='#D9A5A0'; ctx.lineWidth=3; ctx.beginPath();
  let first=true;
  for(let x=PW/2-w/2;x<=PW/2+w/2;x+=4){ const yy=170+Math.sin((x-PW/2)/13)*4; if(first){ctx.moveTo(x,yy);first=false;} else ctx.lineTo(x,yy); }
  ctx.stroke();
  ctx.font='600 16px Manrope, sans-serif'; ctx.fillStyle='#6B6A64';
  ctx.fillText('план и дневник сезона', PW/2, 194);
  ctx.textAlign='left';
}
function card(ctx,x,y,w,h,title){
  ctx.save();
  ctx.shadowColor='rgba(62,62,58,.10)'; ctx.shadowBlur=14; ctx.shadowOffsetY=5;
  roundRect(ctx,x,y,w,h,18); ctx.fillStyle='rgba(255,253,246,.94)'; ctx.fill();
  ctx.restore();
  roundRect(ctx,x,y,w,h,18); ctx.strokeStyle='rgba(138,155,110,.4)'; ctx.lineWidth=1.5; ctx.stroke();
  if(title){ ctx.font='400 26px Neucha, cursive'; ctx.fillStyle='#5E7247'; ctx.textAlign='left'; ctx.fillText(title, x+18, y+36); }
}

/* ---------- 3D-план ---------- */
function drawIconBadge(ctx,icons,culture,cx,cy,size){
  const img=culture?icons[culture]:null;
  ctx.save();
  ctx.fillStyle='rgba(255,255,255,.92)';
  ctx.beginPath(); ctx.arc(cx,cy,size*0.62,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='rgba(63,62,58,.12)'; ctx.lineWidth=1; ctx.stroke();
  const s=size*0.9;
  if(img){ ctx.drawImage(img, cx-s/2, cy-s/2, s, s); }
  else {
    const em=culture?(PLANT_EMOJI[norm(culture)]||'🌿'):'🌿';
    ctx.font=`${Math.round(s)}px serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(em, cx, cy+1);
  }
  ctx.restore();
  ctx.textAlign='left'; ctx.textBaseline='alphabetic';
}
function drawIsoObject(ctx,o,P,k,icons){
  const x=o.x,y=o.y,w=o.w,l=o.l;
  const cx=x+w/2, cy=y+l/2;
  ctx.save(); ctx.globalAlpha=0.10;
  poly(ctx,[P(x+0.15,y+0.25,0),P(x+w+0.15,y+0.25,0),P(x+w+0.15,y+l+0.25,0),P(x+0.15,y+l+0.25,0)],'#3A4A2A',null);
  ctx.restore();

  if(o.type==='tree'||o.type==='bush'){
    const isTree=o.type==='tree';
    const base=P(cx,cy,0);
    const trunkH=(isTree?1.0:0.5)*k*0.95;
    ctx.strokeStyle='#8B6B4A'; ctx.lineWidth=Math.max(3,k*0.12); ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(base[0],base[1]); ctx.lineTo(base[0],base[1]-trunkH); ctx.stroke();
    const cr=(isTree?Math.min(w,l)*0.52:Math.min(w,l)*0.42)*k*0.9;
    const ccx=base[0], ccy=base[1]-trunkH-cr*0.45;
    const greens=isTree?['#6E9454','#7FA863','#93BC74']:['#7FA05E','#93B877','#A8C98C'];
    ctx.fillStyle=greens[0]; ctx.beginPath(); ctx.arc(ccx-cr*0.45,ccy+cr*0.15,cr*0.62,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=greens[1]; ctx.beginPath(); ctx.arc(ccx+cr*0.45,ccy+cr*0.18,cr*0.6,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=greens[2]; ctx.beginPath(); ctx.arc(ccx,ccy-cr*0.28,cr*0.66,0,Math.PI*2); ctx.fill();
    drawIconBadge(ctx, icons, o.culture, ccx, ccy-cr*0.05, Math.max(20, cr*0.66));
    return;
  }

  const h = o.type==='bed' ? 0.28 : (o.height_m || (o.type==='greenhouse'?2.5:o.type==='building'?4:1));
  const A=P(x,y,h),B=P(x+w,y,h),C=P(x+w,y+l,h),D2=P(x,y+l,h);
  const B0=P(x+w,y,0),C0=P(x+w,y+l,0),D0=P(x,y+l,0);

  if(o.type==='greenhouse'){
    ctx.save(); ctx.globalAlpha=0.62;
    poly(ctx,[D2,C,C0,D0],darken('#9CCFA8',0.10),null);
    poly(ctx,[B,C,C0,B0],darken('#9CCFA8',0.22),null);
    poly(ctx,[A,B,C,D2],'#EAF7EC',null);
    ctx.restore();
    poly(ctx,[A,B,C,D2],null,'#6FA57D');
    poly(ctx,[D2,C,C0,D0],null,'#6FA57D');
    poly(ctx,[B,C,C0,B0],null,'#6FA57D');
    // 2.106: иконки культур на крыше теплицы (до 4 грядок)
    const gcs = (o.greenhouseBedCultures||[]).filter(Boolean);
    const gn = Math.min(4, gcs.length);
    gcs.slice(0,4).forEach((c,i)=>{
      const px = x + w*((i+0.5)/(gn||1));
      const pt = P(px, y + l*0.5, h);
      drawIconBadge(ctx, icons, c, pt[0], pt[1], Math.max(14, Math.min(w,l)*k*0.38));
    });
  } else if(o.type==='building'){
    poly(ctx,[D2,C,C0,D0],darken('#D9B48F',0.12),null);
    poly(ctx,[B,C,C0,B0],'#D9B48F',null);
    poly(ctx,[A,B,C,D2],'#F9E8D4',null);
    const rh=1.1;
    const m1=P(x,y+l/2,h+rh), m2=P(x+w,y+l/2,h+rh);
    poly(ctx,[A,B,m2,m1],'#C98F6B',null);
    poly(ctx,[D2,C,m2,m1],'#B87C58',null);
  } else {
    poly(ctx,[D2,C,C0,D0],darken('#B0D37E',0.12),null);
    poly(ctx,[B,C,C0,B0],'#B0D37E',null);
    poly(ctx,[A,B,C,D2],'#EAF5D6',null);
    ctx.strokeStyle='rgba(140,170,100,.5)'; ctx.lineWidth=1;
    for(let i=1;i<=3;i++){
      const t=i/4;
      const p1=P(x,y+l*t,h+0.01), p2=P(x+w,y+l*t,h+0.01);
      ctx.beginPath(); ctx.moveTo(p1[0],p1[1]); ctx.lineTo(p2[0],p2[1]); ctx.stroke();
    }
  }
  const c=P(cx,cy,h);
  if(o.culture) drawIconBadge(ctx, icons, o.culture, c[0], c[1], Math.max(20, Math.min(w,l)*k*0.5));
}
function drawIso(ctx, scheme, icons, ax, ay, aw, ah){
  const W=scheme.widthM, L=scheme.lengthM;
  const objs=scheme.objects||[];
  const maxZ=Math.max(3, ...objs.map(o=>(o.height_m||0)+(o.type==='building'?1.2:0)));
  const k=Math.min(aw/((W+L)*0.866), ah/((W+L)*0.5 + maxZ*0.95));
  const offX=ax+(aw-(W+L)*0.866*k)/2 + L*0.866*k;
  const offY=ay+(ah-((W+L)*0.5*k + maxZ*0.95*k))/2 + maxZ*0.95*k;
  const P=(x,y,z)=>[offX+(x-y)*0.866*k, offY+(x+y)*0.5*k-(z||0)*0.95*k];

  const gg=ctx.createLinearGradient(ax,ay,ax+aw,ay+ah);
  gg.addColorStop(0,'#E4EFC9'); gg.addColorStop(1,'#CFE3A9');
  poly(ctx,[P(0,0,0),P(W,0,0),P(W,L,0),P(0,L,0)],null,null);
  ctx.fillStyle=gg; ctx.fill();
  ctx.strokeStyle='rgba(110,140,80,.5)'; ctx.lineWidth=1.5; ctx.stroke();

  ctx.strokeStyle='rgba(110,140,80,.18)'; ctx.lineWidth=1;
  for(let i=1;i<W;i++){ const a=P(i,0,0),b=P(i,L,0); ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke(); }
  for(let j=1;j<L;j++){ const a=P(0,j,0),b=P(W,j,0); ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke(); }

  const sorted=objs.slice().sort((a,b)=>(a.x+a.w/2+a.y+a.l/2)-(b.x+b.w/2+b.y+b.l/2));
  sorted.forEach(o=>drawIsoObject(ctx,o,P,k,icons));
}
function drawPlanCard(ctx,x,y,w,h,scheme,D){
  card(ctx,x,y,w,h,'План участка');
  ctx.font='600 12px Manrope, sans-serif'; ctx.fillStyle='#8A7A5A'; ctx.textAlign='right';
  ctx.fillText('Солнце: '+(DIR_NAME[scheme.sunDir||'S']||'Юг'), x+w-18, y+32);
  ctx.textAlign='left';
  drawIso(ctx, scheme, D.icons, x+16, y+52, w-32, h-116);
  const items=[['building','Постройка'],['greenhouse','Теплица'],['bed','Грядка'],['tree','Дерево'],['bush','Кустарник']];
  let lx=x+18; const ly=y+h-28;
  ctx.font='400 11px Manrope, sans-serif'; ctx.textBaseline='middle';
  items.forEach(([t,lab])=>{
    roundRect(ctx,lx,ly-7,13,13,3); ctx.fillStyle=TYPE_TOP[t]; ctx.fill(); ctx.strokeStyle=TYPE_SIDE[t]; ctx.lineWidth=1; ctx.stroke();
    ctx.fillStyle='#6B6A64'; ctx.textAlign='left';
    ctx.fillText(lab, lx+17, ly);
    lx += 17 + ctx.measureText(lab).width + 16;
  });
  ctx.textBaseline='alphabetic';
}

/* ---------- KPI ---------- */
function kpiTile(ctx,x,y,w,h,value,label,sub,pct,color){
  roundRect(ctx,x,y,w,h,12); ctx.fillStyle='#FBF7EA'; ctx.fill();
  ctx.strokeStyle='rgba(138,155,110,.3)'; ctx.lineWidth=1; ctx.stroke();
  ctx.textAlign='center';
  ctx.font='400 40px Neucha, cursive'; ctx.fillStyle=color||'#5E7247';
  ctx.fillText(String(value), x+w/2, y+56);
  ctx.font='700 13px Manrope, sans-serif'; ctx.fillStyle='#3F3E3A';
  ctx.fillText(label, x+w/2, y+82);
  if(sub){ ctx.font='400 11px Manrope, sans-serif'; ctx.fillStyle='#8A7A5A'; ctx.fillText(sub, x+w/2, y+102); }
  if(pct!=null){
    const bw=w-36, bx=x+18, by=y+h-24;
    roundRect(ctx,bx,by,bw,8,4); ctx.fillStyle='rgba(63,62,58,.10)'; ctx.fill();
    roundRect(ctx,bx,by,Math.max(6,bw*Math.max(0,Math.min(1,pct))),8,4); ctx.fillStyle='#8A9B6E'; ctx.fill();
  }
  ctx.textAlign='left';
}
function drawKpiCard(ctx,x,y,w,h,D){
  card(ctx,x,y,w,h,'Пульс сезона');
  const pad=18, gap=14;
  const tw=(w-pad*2-gap)/2, th=140;
  const x1=x+pad, x2=x+pad+tw+gap, y1=y+56, y2=y1+th+gap;
  kpiTile(ctx,x1,y1,tw,th,D.occPct+'%','участка занято',`свободно ${D.freeArea} м²`,D.occPct/100);
  kpiTile(ctx,x2,y1,tw,th,String(D.cultures.length),'культур посажено','грядки, теплицы, сад',null);
  kpiTile(ctx,x1,y2,tw,th,D.donePct+'%','задач выполнено',`${D.doneTasks} из ${D.totalTasks} · просрочено ${D.overdue}`,D.donePct/100);
  kpiTile(ctx,x2,y2,tw,th,(D.actTotal||0)+' кг','урожай записан',`прогноз ≈ ${D.estTotal} кг`, D.estTotal? Math.min(1,D.actTotal/D.estTotal):null, '#C0832B');
  const sy=y2+th+36;
  ctx.font='700 13px Manrope, sans-serif'; ctx.fillStyle='#3F3E3A'; ctx.textAlign='left';
  ctx.fillText(`Сезон пройден на ${D.seasonPct}%`, x+pad, sy);
  ctx.font='400 12px Manrope, sans-serif'; ctx.fillStyle='#8A7A5A';
  ctx.fillText(`до 31 октября осталось ${D.daysLeft} дн.`, x+pad, sy+20);
  roundRect(ctx,x+pad,sy+30,w-pad*2,10,5); ctx.fillStyle='rgba(63,62,58,.10)'; ctx.fill();
  roundRect(ctx,x+pad,sy+30,Math.max(8,(w-pad*2)*D.seasonPct/100),10,5); ctx.fillStyle='#8A9B6E'; ctx.fill();
  ctx.font='400 11px Manrope, sans-serif'; ctx.fillStyle='#8A7A5A';
  ctx.fillText('По данным на '+fmtDateLong(D.today), x+pad, sy+62);
}

/* ---------- Гантт ---------- */
function drawGanttCard(ctx,x,y,w,h,D){
  card(ctx,x,y,w,h,'Фазы культур');
  const rows=D.gantt;
  if(!rows.length){
    ctx.font='400 12px Manrope, sans-serif'; ctx.fillStyle='#8A7A5A'; ctx.textAlign='left';
    ctx.fillText('Посадите культуры — здесь появится таймлайн фаз.', x+18, y+70);
    return;
  }
  const labelW=210, tx=x+labelW+8, tw=w-labelW-26;
  const top=y+58, rowH=Math.min(27,(h-118)/rows.length);
  rows.forEach((r,i)=>{
    const ry=top+i*rowH;
    const img=D.icons[r.culture];
    if(img) ctx.drawImage(img,x+16,ry+rowH/2-8,16,16);
    ctx.font='600 11px Manrope, sans-serif'; ctx.fillStyle='#3F3E3A'; ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillText(clipText(ctx,r.label,labelW-26), x+36, ry+rowH/2);
    roundRect(ctx,tx,ry+4,tw,rowH-10,4); ctx.fillStyle='rgba(63,62,58,.06)'; ctx.fill();
    r.segs.forEach(s=>{
      const left=daysBetween(D.seasonStart,s.s)/D.seasonLen*tw;
      const wd=Math.max(3,daysBetween(s.s,s.e)/D.seasonLen*tw);
      roundRect(ctx,tx+left,ry+4,wd,rowH-10,3);
      ctx.fillStyle=(PHASE_META[s.ph]||{}).color||'#bbb'; ctx.fill();
    });
  });
  ctx.textBaseline='alphabetic';
  const p=Math.max(0,Math.min(1,daysBetween(D.seasonStart,D.today)/D.seasonLen));
  ctx.strokeStyle='#C08B86'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(tx+p*tw, top-6); ctx.lineTo(tx+p*tw, top+rows.length*rowH+2); ctx.stroke();
  ctx.font='400 9.5px Manrope, sans-serif'; ctx.fillStyle='#C08B86'; ctx.textAlign='left';
  ctx.fillText('сегодня', tx+p*tw+4, top-8);
  ctx.fillStyle='#8A7A5A';
  [['апр',4],['май',5],['июн',6],['июл',7],['авг',8],['сен',9],['окт',10]].forEach(([lab,m])=>{
    const left=Math.max(0,daysBetween(D.seasonStart,`${D.year}-${String(m).padStart(2,'0')}-01`)/D.seasonLen)*tw;
    ctx.fillText(lab, tx+left, top+rows.length*rowH+18);
  });
  if((D.ganttTotal||rows.length) > rows.length){
    ctx.font='400 10.5px Manrope, sans-serif'; ctx.fillStyle='#8A7A5A'; ctx.textAlign='left';
    ctx.fillText(`…и ещё ${D.ganttTotal - rows.length} культур(ы) — полный таймлайн на экране «Аналитика»`, x+18, y+h-14);
  }
}

/* ---------- недели ---------- */
function drawWeeksCard(ctx,x,y,w,h,D){
  card(ctx,x,y,w,h,'Загруженность по неделям');
  const cx=x+20, cy=y+56, cw=w-40, ch=h-170;
  const max=Math.max(1,D.weekPeak);
  const n=Math.max(1,D.weeks.length);
  const bw=(cw-(n-1)*3)/n;
  const nowIdx=Math.floor(daysBetween(D.seasonStart,D.today)/7);
  for(let i=0;i<n;i++){
    const b=D.weeks[i], total=D.weekTotals[i];
    if(!total) continue;
    let acc=0;
    CAT_ORDER.forEach(c=>{
      const cnt=b[c]||0; if(!cnt) return;
      const sh=cnt/max*ch;
      ctx.fillStyle=CAT_META[c].color;
      ctx.fillRect(cx+i*(bw+3), cy+ch-acc-sh, bw, Math.max(1,sh-0.5));
      acc+=sh;
    });
    if(i===D.weekPeakIdx){ ctx.strokeStyle='#C08B86'; ctx.lineWidth=1.5; ctx.strokeRect(cx+i*(bw+3)-1, cy+ch-total/max*ch-1, bw+2, total/max*ch+2); }
    else if(i===nowIdx){ ctx.strokeStyle='#6F8257'; ctx.lineWidth=1.5; ctx.strokeRect(cx+i*(bw+3)-1, cy+ch-total/max*ch-1, bw+2, total/max*ch+2); }
  }
  ctx.strokeStyle='rgba(63,62,58,.25)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(cx,cy+ch+0.5); ctx.lineTo(cx+cw,cy+ch+0.5); ctx.stroke();
  ctx.font='400 10px Manrope, sans-serif'; ctx.fillStyle='#8A7A5A'; ctx.textAlign='center';
  ['апр','май','июн','июл','авг','сен','окт'].forEach((m,i)=>{ ctx.fillText(m, cx+cw*(i+0.5)/7, cy+ch+16); });
  let lx=cx, ly=cy+ch+38;
  ctx.textAlign='left'; ctx.font='400 11px Manrope, sans-serif';
  CAT_ORDER.forEach(c=>{
    roundRect(ctx,lx,ly-8,10,10,2); ctx.fillStyle=CAT_META[c].color; ctx.fill();
    ctx.fillStyle='#6B6A64'; ctx.fillText(CAT_META[c].label, lx+14, ly+1);
    lx += 14+ctx.measureText(CAT_META[c].label).width+14;
    if(lx>cx+cw-70){ lx=cx; ly+=16; }
  });
  const peakDate=addDaysISO(D.seasonStart, Math.max(0,D.weekPeakIdx)*7);
  ctx.font='400 11.5px Manrope, sans-serif'; ctx.fillStyle='#8A7A5A';
  ctx.fillText(`Пик: ${D.weekPeak} задач (неделя с ${fmtDM(peakDate)}) · на этой неделе: ${D.weekNow}`, cx, y+h-16);
}

/* ---------- урожай ---------- */
function drawHarvestCard(ctx,x,y,w,h,D){
  card(ctx,x,y,w,h,'Урожай: прогноз и факт');
  const rows=D.harvestRows.slice(0,10);
  if(!rows.length){
    ctx.font='400 12px Manrope, sans-serif'; ctx.fillStyle='#8A7A5A'; ctx.textAlign='left';
    ctx.fillText('Добавьте культуры и запишите урожай — здесь появится сводка.', x+18, y+70);
    return;
  }
  const cx=x+18, cw=w-36;
  const cCount=Math.round(cx+cw*0.52), cEst=Math.round(cx+cw*0.71), cAct=Math.round(cx+cw*0.89);
  const rowH = rows.length>9 ? 26 : 28;
  ctx.font='700 11px Manrope, sans-serif'; ctx.fillStyle='#8A7A5A'; ctx.textAlign='left';
  ctx.fillText('Культура', cx, y+62);
  ctx.textAlign='center';
  ctx.fillText('Растений', cCount, y+62);
  ctx.fillText('Прогноз', cEst, y+62);
  ctx.fillText('Факт', cAct, y+62);
  ctx.textAlign='left';
  ctx.strokeStyle='rgba(63,62,58,.15)'; ctx.beginPath(); ctx.moveTo(cx,y+70); ctx.lineTo(cx+cw,y+70); ctx.stroke();
  rows.forEach((r,i)=>{
    const ry=y+94+i*rowH;
    if(i%2===0){ ctx.fillStyle='rgba(138,155,110,.07)'; ctx.fillRect(cx-6,ry-14,cw+12,rowH-2); }
    const img=D.icons[r.culture];
    if(img) ctx.drawImage(img,cx,ry-11,16,16);
    ctx.font='600 12px Manrope, sans-serif'; ctx.fillStyle='#3F3E3A'; ctx.textAlign='left';
    ctx.fillText(clipText(ctx,r.culture,cw*0.42), cx+22, ry);
    ctx.font='400 12px Manrope, sans-serif'; ctx.textAlign='center'; ctx.fillStyle='#6B6A64';
    ctx.fillText(r.count||'—', cCount, ry);
    ctx.fillText(r.est?('≈ '+r.est+' кг'):'—', cEst, ry);
    ctx.font='700 12px Manrope, sans-serif'; ctx.fillStyle=r.hasAct?'#2F7D32':'#B9AE98';
    ctx.fillText(r.hasAct?(r.act+' кг'):'—', cAct, ry);
  });
  ctx.textAlign='left';
  const ty=y+94+rows.length*rowH+10;
  ctx.strokeStyle='rgba(63,62,58,.15)'; ctx.beginPath(); ctx.moveTo(cx,ty-14); ctx.lineTo(cx+cw,ty-14); ctx.stroke();
  ctx.font='700 13px Manrope, sans-serif'; ctx.fillStyle='#5E7247';
  ctx.fillText(`Итого: прогноз ≈ ${D.estTotal} кг · факт ${D.actTotal} кг (${D.actCount} записей)`, cx, ty+4);
  if(D.harvestRows.length>10){
    ctx.font='400 11px Manrope, sans-serif'; ctx.fillStyle='#8A7A5A';
    ctx.fillText(`…и ещё ${D.harvestRows.length-10} культур(ы) — подробнее на экране «Аналитика»`, cx, ty+24);
  }
  ctx.font='400 10.5px Manrope, sans-serif'; ctx.fillStyle='#8A7A5A';
  ctx.fillText('Не учитываются культуры, которые не дадут урожай в этом году (молодые посадки и поздние посевы).', cx, y+h-14);
}

/* ---------- Цыпа в углу ---------- */
function drawTsypaCorner(ctx,x,y,w,h,D){
  ctx.strokeStyle='rgba(138,155,110,.5)'; ctx.lineWidth=2; ctx.lineCap='round';
  for(let i=0;i<7;i++){
    const gx=x+30+i*((w-60)/6), gy=y+h-24;
    ctx.beginPath(); ctx.moveTo(gx,gy);
    ctx.quadraticCurveTo(gx+(i%2?8:-8), gy-22, gx+(i%2?14:-14), gy-36);
    ctx.stroke();
  }
  const bx=x+12, by=y+24, bw=w-24, bh=Math.min(180, Math.round(h*0.42));
  roundRect(ctx,bx,by,bw,bh,20);
  ctx.fillStyle='#FFFDF4'; ctx.fill();
  ctx.strokeStyle='rgba(138,155,110,.55)'; ctx.lineWidth=2; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(bx+bw*0.52, by+bh-2);
  ctx.lineTo(bx+bw*0.60, by+bh+34);
  ctx.lineTo(bx+bw*0.74, by+bh-2);
  ctx.closePath(); ctx.fillStyle='#FFFDF4'; ctx.fill();
  ctx.font='400 24px Neucha, cursive'; ctx.fillStyle='#5E7247'; ctx.textAlign='center';
  const phrase = POSTER_PHRASES[Math.floor(Math.random() * POSTER_PHRASES.length)];
  wrapText(ctx,phrase,bw-48).slice(0,3).forEach((ln,i)=>ctx.fillText(ln, bx+bw/2, by+58+i*32));
  ctx.font='400 12px Manrope, sans-serif'; ctx.fillStyle='#8A7A5A';
  ctx.fillText('Цыпа, твой агроном-помощник', bx+bw/2, by+bh-16);
  ctx.textAlign='left';
  const img=D.icons.__tsypa;
  const s=Math.max(120, Math.min(190, h-bh-80));
  const ix=x+w-s-20, iy=y+h-s-30;
  if(img){
    ctx.save();
    ctx.shadowColor='rgba(0,0,0,.18)'; ctx.shadowBlur=12; ctx.shadowOffsetY=4;
    ctx.drawImage(img,ix,iy,s,s);
    ctx.restore();
  } else {
    ctx.font='120px serif'; ctx.textAlign='center';
    ctx.fillText('🐤', ix+s/2, iy+s-14);
    ctx.textAlign='left';
  }
}

/* ---------- футер ---------- */
function drawFooter(ctx,D){
  ctx.textAlign='center'; ctx.font='400 12px Manrope, sans-serif'; ctx.fillStyle='#8A7A5A';
  ctx.fillText(`Создано в приложении «Умный садовод» · ${fmtDateLong(D.today)}`, PW/2, PH-62);
  ctx.font='13px serif';
  ctx.fillText('🌿', PW/2-180, PH-62);
  ctx.fillText('🌿', PW/2+180, PH-62);
  ctx.textAlign='left';
}

/* ---------- главный вход ---------- */
export async function exportPosterPNG({ scheme, plants, phases, planting, buildCalendar }){
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch(e){} }
  const D = collectData(scheme, plants, phases, planting, buildCalendar);
  D.icons = await loadIcons(D);

  const canvas = document.createElement('canvas');
  canvas.width = PW; canvas.height = PH;
  const ctx = canvas.getContext('2d');

  drawBackground(ctx);
  drawHeader(ctx, scheme, D);
  drawPlanCard(ctx, 56, 216, 660, 470, scheme, D);      // план 3D — верх слева
  drawKpiCard(ctx, 740, 216, 444, 470, D);              // KPI — верх справа
  drawGanttCard(ctx, 56, 710, 780, 430, D);             // Гантт шире — подписи культур умещаются
  drawTsypaCorner(ctx, 860, 710, 324, 430, D);          // Цыпа компактнее, случайная фраза
  drawWeeksCard(ctx, 56, 1164, 560, 450, D);            // недели — низ слева
  drawHarvestCard(ctx, 640, 1164, 544, 450, D);         // урожай — низ справа, до 10 культур
  drawFooter(ctx, D);

  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (((scheme.plotName || '').trim() || 'мой-участок').replace(/[\\/:*?"<>|]/g,'').replace(/\s+/g,'-')) + '-постер.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}