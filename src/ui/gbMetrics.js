// src/ui/gbMetrics.js — метрики модератора Книги отзывов (ревизия 3.21)
// Чистые функции: нормализация записей, computeMetrics (KPI/SLA/темы/рейтинг/недели),
// renderMetricsBox (HTML блока), экспорт JSON/CSV/копирование сводки. DOM книги не трогают.
function isoDay(v){ return String(v==null?'':v).slice(0,10); }
function normEntry(raw){
  const r = raw || {};
  const created = isoDay(r.date || r.createdAt || r.created || r.ts || r.time);
  let replyAt = isoDay(r.replyAt || r.replyDate || r.repliedAt || r.answeredAt);
  const replyText = typeof r.reply === 'string' ? r.reply : ((r.reply && (r.reply.text || r.reply.message)) || r.answer || r.replyText || '');
  if (!replyAt && r.reply && typeof r.reply === 'object') replyAt = isoDay(r.reply.date || r.reply.at || r.reply.created);
  const status = r.status || (replyText ? 'answered' : 'waiting');
  return {
    id: r.id, created, replyAt, status,
    topic: String(r.topic || r.category || r.theme || 'Без темы').trim(),
    rating: Number(r.rating || r.stars || r.score) || 0,
    text: r.text || r.message || '', reply: replyText
  };
}
export function computeMetrics(entries, today){
  const list = (Array.isArray(entries) ? entries : []).map(normEntry);
  const counters = { total: list.length, waiting: 0, answered: 0, queued: 0, other: 0 };
  list.forEach(e=>{
    if (e.status === 'waiting') counters.waiting++;
    else if (e.status === 'answered') counters.answered++;
    else if (e.status === 'queued') counters.queued++;
    else counters.other++;
  });
  const todayMs = new Date(today + 'T00:00:00').getTime();
  let slaSum = 0, slaN = 0, slaMax = 0, slaNoData = 0, overdue = 0, overdueOldest = '';
  list.forEach(e=>{
    if (e.status === 'answered'){
      if (e.created && e.replyAt){
        const d = Math.max(0, Math.round((new Date(e.replyAt+'T00:00:00').getTime() - new Date(e.created+'T00:00:00').getTime())/86400000));
        slaSum += d; slaN++; if (d > slaMax) slaMax = d;
      } else slaNoData++;
    }
    if (e.status === 'waiting' && e.created){
      const age = Math.round((todayMs - new Date(e.created+'T00:00:00').getTime())/86400000);
      if (age > 7){ overdue++; if (!overdueOldest || e.created < overdueOldest) overdueOldest = e.created; }
    }
  });
  const sla = { avg: slaN ? Math.round((slaSum/slaN)*10)/10 : null, max: slaN ? slaMax : null, n: slaN, noData: slaNoData, overdue, overdueOldest };
  const tmap = new Map();
  list.forEach(e=> tmap.set(e.topic, (tmap.get(e.topic)||0)+1));
  const topics = Array.from(tmap.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5)
    .map(([name,count])=>({ name, count, share: list.length ? Math.round(count*100/list.length) : 0 }));
  const rated = list.filter(e=> e.rating>=1 && e.rating<=5);
  const dist = [0,0,0,0,0];
  rated.forEach(e=> dist[e.rating-1]++);
  const rating = { count: rated.length, avg: rated.length ? Math.round((rated.reduce((m,e)=>m+e.rating,0)/rated.length)*10)/10 : null, dist };
  const monday = (iso)=>{ const d = new Date(iso+'T00:00:00'); const wd = (d.getDay()+6)%7; d.setDate(d.getDate()-wd); return d; };
  const m0 = monday(today);
  const starts = [];
  for (let i=7;i>=0;i--) starts.push(new Date(m0.getTime()-i*7*86400000).toISOString().slice(0,10));
  const weeks = starts.map((s,i)=>({ start:s, count:0, now: i===7 }));
  list.forEach(e=>{ if (!e.created) return; for (let i=7;i>=0;i--){ if (e.created >= starts[i]){ weeks[i].count++; break; } } });
  return { counters, sla, topics, rating, weeks, today };
}
export function renderMetricsBox(m, filterOn){
  const c = m.counters, s = m.sla;
  const kpi = `<div class="gbm-kpis">` +
    `<span class="gbm-kpi">всего: ${c.total}</span>` +
    `<span class="gbm-kpi${c.waiting?' warn':''}">ждут: ${c.waiting}</span>` +
    `<span class="gbm-kpi">очередь: ${c.queued}</span>` +
    `<span class="gbm-kpi">отвечено: ${c.answered}</span></div>`;
  const slaRow = `<div class="gbm-row">SLA: среднее ${s.avg!=null?s.avg:'—'} дн · макс ${s.max!=null?s.max:'—'} дн${s.noData?` · б/д: ${s.noData}`:''}</div>` +
    `<div class="gbm-row${s.overdue?' warn':''}">просрочено (>7 дн): ${s.overdue}${s.overdueOldest?` · старейшее ${s.overdueOldest.slice(8,10)}.${s.overdueOldest.slice(5,7)}`:''}</div>`;
  const topics = m.topics.length
    ? m.topics.map(t=>`<div class="gbm-row">${t.name} — ${t.count} (${t.share}%)</div><div class="gbm-bar"><i style="width:${t.share}%"></i></div>`).join('')
    : `<div class="gbm-row">тем пока нет</div>`;
  const rating = m.rating.count
    ? `<div class="gbm-row">рейтинг: ${m.rating.avg} из 5 (${m.rating.count} оценок)</div>` +
      m.rating.dist.map((n,i)=>`<div class="gbm-row">${i+1}★ — ${n}</div><div class="gbm-bar"><i style="width:${m.rating.count?Math.round(n*100/m.rating.count):0}%"></i></div>`).join('')
    : `<div class="gbm-row">оценок пока нет</div>`;
  const wMax = Math.max(1, ...m.weeks.map(w=>w.count));
  const weeks = `<div class="gbm-weeks">` + m.weeks.map(w=>`<span class="${w.now?'now':''}" style="height:${Math.round(w.count*100/wMax)}%" title="неделя с ${w.start}: ${w.count}"></span>`).join('') + `</div>` +
    `<div class="gbm-row">приходы за 8 недель (текущая обведена)</div>`;
  const actions = `<div class="gbm-actions">` +
    `<button type="button" class="gbm-btn${filterOn?' active':''}" data-gbm="filter">${filterOn?'Показать все':'Без ответа ('+c.waiting+')'}</button>` +
    `<button type="button" class="gbm-btn" data-gbm="copy">Копировать сводку</button>` +
    `<button type="button" class="gbm-btn" data-gbm="json">Скачать JSON</button>` +
    `<button type="button" class="gbm-btn" data-gbm="csv">Скачать CSV</button></div>`;
  return `<details class="gb-metrics" open><summary>Метрики модератора</summary>` + kpi + slaRow + topics + rating + weeks + actions + `</details>`;
}
function download(name, mime, content){
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 400);
}
export function exportGbJSON(entries, m){
  download('guestbook-metrics-' + m.today + '.json', 'application/json', JSON.stringify({ generatedAt: new Date().toISOString(), metrics: m, entries }, null, 2));
}
export function exportGbCSV(entries, m){
  const escv = (v)=>{ v = String(v==null?'':v); return /[;"\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v; };
  const list = (Array.isArray(entries) ? entries : []).map(normEntry);   // 3.21.2: терпим к именам полей, как метрики
  const rows = [['id','date','status','topic','rating','replyAt','text'].join(';')];
  list.forEach(e=>{
    rows.push([e.id ?? '', e.created, e.status, escv(e.topic), e.rating || '', e.replyAt, escv(e.text)].join(';'));
  });
  download('guestbook-' + m.today + '.csv', 'text/csv;charset=utf-8', '\uFEFF' + rows.join('\r\n'));
}
export async function copyGbSummary(m){
  const c = m.counters, s = m.sla;
  const d = m.today.slice(8,10)+'.'+m.today.slice(5,7)+'.'+m.today.slice(0,4);
  const lines = [
    'Книга отзывов — сводка на ' + d,
    `Всего: ${c.total} · ждут: ${c.waiting} · очередь: ${c.queued} · отвечено: ${c.answered}`,
    `Просрочено (>7 дн): ${s.overdue}` + (s.overdueOldest ? ` (старейшее ${s.overdueOldest})` : ''),
    `SLA: среднее ${s.avg!=null?s.avg:'—'} дн · макс ${s.max!=null?s.max:'—'} дн` + (s.noData ? ` · без даты ответа: ${s.noData}` : ''),
    m.topics.length ? 'Топ тем: ' + m.topics.map(t=>`${t.name} (${t.count})`).join(', ') : 'Топ тем: —',
    m.rating.count ? `Рейтинг: ${m.rating.avg} из 5 (${m.rating.count} оценок)` : 'Рейтинг: —',
    'Приходы за 8 недель: ' + m.weeks.map(w=>w.count).join(', ')
  ];
  const text = lines.join('\n');
  try { await navigator.clipboard.writeText(text); return true; }
  catch(e){
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch(_){}
    ta.remove(); return ok;
  }
}