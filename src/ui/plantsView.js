// src/ui/plantsView.js — каталог растений (ревизия 2.164)
// 2.164: ВОЗВРАЩЁН фильтр по свету/тени (light_requirements); иконки культур из icons.svg,
//        фолбэк для деревьев/кустарников — site-иконки si-tree/si-bush
// 2.163: уход/соседи/севооборот/болезни с site-иконками в карточке
import { screenHintHTML, emptyStateHTML, cropIconHTML } from './ux.js';
import { siteIcon } from './icons.js';
import { familyOf } from '../core/compatibility.js';

const MONTHS_LOW = ['январ','феврал','март','апрел','ма','июн','июл','август','сентябр','октябр','ноябр','декабр'];
const TYPE_FILTERS = [
  { key:'all', label:'Все' },
  { key:'дерево', label:'Деревья' },
  { key:'кустарник', label:'Кустарники' },
  { key:'овощ', label:'Овощи' },
  { key:'зелень', label:'Зелень' },
  { key:'ягода', label:'Ягоды' }
];
const LIGHT_FILTERS = [
  { key:'all', label:'Любой свет' },
  { key:'full_sun', label:'Солнце' },
  { key:'partial_shade', label:'Полутень' },
  { key:'full_shade', label:'Тень' }
];
function norm(s){ return String(s || '').trim().toLowerCase(); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }

export function createPlantsView({ plants, compat, onAddToScheme }) {
  const root = document.getElementById('screen-plants-body');
  let filter = 'all';
  let light = 'all';
  let query = '';
  let detailName = null;

  function sowNow(p){
    const m = MONTHS_LOW[new Date().getMonth()];
    return ((p.sowing_timing || p.sowing) || '').toLowerCase().includes(m);
  }
  function matches(p){
    if (filter !== 'all' && !String(p.type || '').includes(filter)) return false;
    if (light !== 'all' && !(p.light_requirements || []).includes(light)) return false;
    if (query && !norm(p.name).includes(query)) return false;
    return true;
  }
  function pick(...vals){
    for (const v of vals){
      if (Array.isArray(v) && v.length) return v;
      if (typeof v === 'string' && v.trim()) return [v];
    }
    return [];
  }
  function careOf(p){
    const src = (p.care && typeof p.care === 'object' && !Array.isArray(p.care)) ? p.care : null;
    if (src) return {
      watering: pick(src.watering, src.poliv),
      fertilizing: pick(src.fertilizing, src.podkormka),
      pruning: pick(src.pruning, src.obrezka),
      other: pick(src.other, src.prochee)
    };
    return {
      watering: pick(p.watering, p.care_watering),
      fertilizing: pick(p.fertilizing, p.care_fertilizing),
      pruning: pick(p.pruning, p.care_pruning),
      other: pick(p.care_other, (Array.isArray(p.care) ? p.care : null))
    };
  }
  function diseasesOf(p){
    const d = p.diseases || p.common_diseases || p.disease || [];
    return Array.isArray(d) ? d : (typeof d === 'string' && d.trim() ? [d] : []);
  }
  function neighborsOf(c){
    const c0 = norm(c);
    const good = [], bad = [];
    if (compat) {
      (compat.good || []).forEach(p => { if (p[0] === c0) good.push(p[1]); else if (p[1] === c0) good.push(p[0]); });
      (compat.bad  || []).forEach(p => { if (p[0] === c0) bad.push(p[1]);  else if (p[1] === c0) bad.push(p[0]); });
    }
    return { good, bad };
  }
  // 2.164: иконка культуры; фолбэк для деревьев/кустарников — site-иконки
  function cultureIcon(p, size){
    const svg = cropIconHTML(p.name, size);
    if (svg) return svg;
    const t = String(p.type || '').toLowerCase();
    if (t.includes('дерево')) return siteIcon('si-tree');
    if (t.includes('кустарник')) return siteIcon('si-bush');
    return '';
  }
  function cardHTML(p){
    const sow = sowNow(p);
    return `<div class="plant-card" data-name="${esc(p.name)}">` +
      (sow ? `<img src="assets/chick.svg" alt="" class="plant-chick" title="Сеют в текущем месяце" />` : '') +
      `<span class="plant-emoji">${cultureIcon(p, 36)}</span>` +
      `<div class="plant-info"><div class="plant-name">${esc(p.name)}</div>` +
      `<div class="plant-type">${esc(p.type || '')}</div>` +
      `<div class="plant-timing">${esc(p.sowing_timing || p.sowing || '')} · ${esc(p.harvest_timing || p.harvest || '')}</div></div>` +
      `<button type="button" class="plant-detail-btn" data-detail="${esc(p.name)}" title="Карточка">›</button>` +
      `</div>`;
  }
  function careRow(iconHtml, label, items){
    if (!items || !items.length) return '';
    return `<div class="plant-detail-row">${iconHtml} <b>${label}:</b> ${items.map(esc).join('; ')}</div>`;
  }
  function detailHTML(p){
    if (!p) return '';
    const care = careOf(p);
    const diseases = diseasesOf(p);
    const nb = neighborsOf(p.name);
    const fam = familyOf(compat, p.name);
    const careHtml =
      careRow(siteIcon('si-water'), 'Полив', care.watering) +
      careRow(siteIcon('si-fertilize'), 'Подкормка', care.fertilizing) +
      careRow(siteIcon('si-prune'), 'Обрезка', care.pruning) +
      careRow(siteIcon('si-leaf'), 'Прочее', care.other);
    const disHtml = diseases.length
      ? `<div class="plant-detail-row">${siteIcon('si-warning')} <b>Болезни:</b> ${diseases.map(esc).join(', ')}</div>` : '';
    const nbHtml = (nb.good.length || nb.bad.length)
      ? `<div class="plant-detail-row">${siteIcon('si-compatibility')} <b>Соседи:</b></div>` +
        (nb.good.length ? `<div class="plant-detail-row">${siteIcon('si-compatGood')} Хорошие: ${nb.good.map(esc).join(', ')}</div>` : '') +
        (nb.bad.length ? `<div class="plant-detail-row">${siteIcon('si-noEntry')} Плохие: ${nb.bad.map(esc).join(', ')}</div>` : '')
      : '';
    const famHtml = fam
      ? `<div class="plant-detail-row">${siteIcon('si-rotate')} <b>Севооборот:</b> семья ${fam} — не сажайте подряд после культур той же семьи</div>` : '';
    return `<div class="plant-detail-overlay" id="plantDetail">` +
      `<div class="plant-detail-modal" style="margin:auto;max-height:86vh;overflow:auto">` +
      `<div class="plant-detail-head"><span class="plant-emoji-lg">${cultureIcon(p, 56)}</span>` +
      `<div><h3>${esc(p.name)}</h3><div class="plant-type-lg">${esc(p.type || '')}</div></div>` +
      `<button type="button" class="plant-detail-close" id="pdClose">${siteIcon('si-close')}</button></div>` +
      `<div class="plant-detail-body">` +
      `<div class="plant-detail-row">${siteIcon('si-sprout')} Посев: ${esc(p.sowing_timing || p.sowing || '—')}</div>` +
      `<div class="plant-detail-row">${siteIcon('si-basket')} Сбор: ${esc(p.harvest_timing || p.harvest || '—')}</div>` +
      careHtml + disHtml + nbHtml + famHtml +
      `</div>` +
      `<div class="plant-detail-actions"><button type="button" class="btn btn-olive" id="pdAdd">Добавить на схему</button></div>` +
      `</div></div>`;
  }
  function bind(){
    if (!root) return;
    const search = root.querySelector('#plantSearch');
    if (search) search.addEventListener('input', e => { query = (e.target.value || '').toLowerCase().trim(); render(); });
    root.querySelectorAll('[data-type]').forEach(b => b.addEventListener('click', () => { filter = b.dataset.type; render(); }));
    root.querySelectorAll('[data-light]').forEach(b => b.addEventListener('click', () => { light = b.dataset.light; render(); }));
    root.querySelectorAll('.plant-detail-btn').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); detailName = b.dataset.detail; render(); }));
    root.querySelectorAll('.plant-card').forEach(c => c.addEventListener('click', () => { detailName = c.dataset.name; render(); }));
    const ov = root.querySelector('#plantDetail');
    if (ov) {
      ov.addEventListener('click', e => { if (e.target === ov) { detailName = null; render(); } });
      const cl = ov.querySelector('#pdClose'); if (cl) cl.addEventListener('click', () => { detailName = null; render(); });
      const add = ov.querySelector('#pdAdd'); if (add) add.addEventListener('click', () => { const p = plants.find(p => p.name === detailName); if (p && onAddToScheme) onAddToScheme(p.name, p.type); });
    }
  }
  function render(){
    if (!root) return;
    const list = plants.filter(matches);
    root.innerHTML = screenHintHTML('Выберите культуру — откроется карточка; цыплёнок отмечает культуры, которые сеют в текущем месяце.') +
      `<div class="plants-toolbar"><input id="plantSearch" type="text" placeholder="Поиск культуры…" value="${esc(query)}" />` +
      `<div class="plants-type-filter">${TYPE_FILTERS.map(f => `<button type="button" class="plants-type-btn ${filter === f.key ? 'active' : ''}" data-type="${f.key}">${f.label}</button>`).join('')}</div>` +
      `<div class="plants-type-filter">${LIGHT_FILTERS.map(f => `<button type="button" class="plants-type-btn ${light === f.key ? 'active' : ''}" data-light="${f.key}">${f.label}</button>`).join('')}</div></div>` +
      (list.length ? `<div class="plants-grid">${list.map(cardHTML).join('')}</div>`
                   : emptyStateHTML({ icon:'', title:'Ничего не найдено', text:'Измените фильтр или запрос.' })) +
      (detailName ? detailHTML(plants.find(p => p.name === detailName)) : '');
    bind();
  }
  function openPlantCard(name){ detailName = name; render(); }
  return { render, openPlantCard };
}