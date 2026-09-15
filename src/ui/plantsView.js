// src/ui/plantsView.js — каталог растений (ревизия 2.71)
// 2.71: Цыпа на карточках «подходит к посадке» — векторный /assets/chick.svg (вместо /stickers/chick.png)
// 2.60: строгий фильтр света — «Полное солнце» только full_sun без полутени
// 2.58: соседи и севооборот в карточке растения; фильтр по свету; обновлённая справка блока
import { screenHintHTML, emptyStateHTML, cropIconHTML } from './ux.js';

const PLANT_EMOJI = {
  'томат':'🍅','огурец':'🥒','перец':'🫑','капуста':'🥬','редис':'🌶',
  'морковь':'🥕','свёкла':'🟣','лук':'🧅','чеснок':'🧄','картофель':'🥔',
  'клубника':'🍓','земляника садовая':'🍓','укроп':'🌿','петрушка':'🌿',
  'салат':'🥬','шпинат':'🥬','тыква':'🎃','кабачок':'🥒','патиссон':'🎃',
  'дыня':'🍈','арбуз':'🍉','баклажан':'🍆','горох':'🫛','фасоль':'🫘',
  'репа':'🍠','рукола':'🌿','щавель':'🍃','кинза':'🌿'
};
const MONTHS_LOW = ['январ','феврал','март','апрел','ма','июн','июл','август','сентябр','октябр','ноябр','декабр'];

function norm(s){ return String(s||'').trim().toLowerCase(); }
function plantEmoji(p){ return p.emoji || PLANT_EMOJI[norm(p.name)] || '🌿'; }
function monthShort(){ return MONTHS_LOW[new Date().getMonth()]; }
function isSowNow(p){ return String(p.sowing_timing||'').toLowerCase().includes(monthShort()); }
function lightLabel(reqs){
  if(!Array.isArray(reqs)||!reqs.length) return '—';
  const map={full_sun:'солнечное место',partial_shade:'лёгкая полутень',full_shade:'тень'};
  return reqs.map(r=>map[String(r).trim()]||r).join(' / ');
}

export function createPlantsView({ plants, compat, onAddToScheme }) {
  const root = document.getElementById('screen-plants-body');
  let query = '';
  let typeFilter = 'all';
  let lightFilter = 'any';
  const TYPES = [ ['all','Все'], ['дерево','🌳 Деревья'], ['кустарник','🌿 Кустарники'], ['овощ','🥕 Овощи'], ['зелень','🌱 Зелень'], ['ягода','🍓 Ягоды'] ];
  const LIGHTS = [ ['any','Любой свет'], ['full_sun','Полное солнце'], ['partial_shade','Солнце/полутень'] ];

  function neighborsOf(name){
    const c = norm(name);
    const good=[], bad=[];
    if (compat) {
      (compat.good||[]).forEach(p=>{ if(p[0]===c) good.push(p[1]); else if(p[1]===c) good.push(p[0]); });
      (compat.bad||[]).forEach(p=>{ if(p[0]===c) bad.push(p[1]); else if(p[1]===c) bad.push(p[0]); });
    }
    return {good,bad};
  }
  function familyOfName(name){
    return (compat && compat.families) ? (compat.families[norm(name)] || null) : null;
  }

  function filtered(){
    return plants.filter(p=>{
      const okType = typeFilter==='all' || String(p.type||'').includes(typeFilter);
      const q = query.trim().toLowerCase();
      const okQ = !q || norm(p.name).includes(q);
      const reqs = Array.isArray(p.light_requirements) ? p.light_requirements.map(x=>String(x).trim()) : [];
      let okLight = true;
      if (lightFilter === 'full_sun') okLight = reqs.includes('full_sun') && !reqs.includes('partial_shade');
      else if (lightFilter === 'partial_shade') okLight = reqs.includes('partial_shade');
      return okType && okQ && okLight;
    });
  }

  function cardHTML(p){
    const name = String(p.name||'').trim();
    const ic = cropIconHTML(name, 36);
    return `<div class="plant-card" data-name="${name.replace(/"/g,'&quot;')}">
      ${isSowNow(p) ? '<img src="/assets/chick.svg" alt="" class="plant-chick" title="Подходит к посадке в этом месяце" />' : ''}
      <span class="plant-emoji">${ic || plantEmoji(p)}</span>
      <span class="plant-info">
        <span class="plant-name" style="display:block">${name}</span>
        <span class="plant-type" style="display:block">${String(p.type||'').trim()}</span>
        <span class="plant-timing" style="display:block">Посев: ${p.sowing_timing||'—'} · Урожай: ${p.harvest_timing||'—'}</span>
      </span>
      <button type="button" class="plant-detail-btn" title="Открыть карточку">ℹ️</button>
    </div>`;
  }

  function render(){
    if(!root) return;
    const list = filtered();
    root.innerHTML =
      screenHintHTML('Ищите по названию и фильтруйте по типу/свету. Клик по карточке откроет карточку растения: регион, сроки посева и урожая, уход, болезни, соседей и севооборот. Кнопка «Добавить на схему» сама найдёт свободное место и запишет дату посадки в календарь.<br>Цыплёнок на карточке 🐤 подскажет культуру, которую можно сажать в этом месяце.') +
      `<div class="plants-toolbar">
        <input id="plantsSearch" type="search" placeholder="Поиск культуры…" value="${query.replace(/"/g,'&quot;')}" />
        <div class="plants-type-filter">
          ${TYPES.map(([k,label])=>`<button type="button" class="plants-type-btn ${typeFilter===k?'active':''}" data-type="${k}">${label}</button>`).join('')}
        </div>
      </div>
      <div class="plants-toolbar" style="margin-top:0">
        <div class="plants-type-filter">
          ${LIGHTS.map(([k,label])=>`<button type="button" class="plants-type-btn ${lightFilter===k?'active':''}" data-light="${k}">☀ ${label}</button>`).join('')}
        </div>
      </div>` +
      (list.length
        ? `<div class="plants-grid">${list.map(cardHTML).join('')}</div>`
        : emptyStateHTML({ icon:'🔍', title:'Ничего не найдено', text:'Попробуйте изменить запрос или сбросить фильтры типа/света.', actionLabel:'Сбросить фильтры', actionId:'reset-filters' }));

    const search = root.querySelector('#plantsSearch');
    if(search) search.addEventListener('input', ()=>{ query = search.value; render(); });
    root.querySelectorAll('[data-type]').forEach(b=>b.addEventListener('click', ()=>{ typeFilter=b.dataset.type; render(); }));
    root.querySelectorAll('[data-light]').forEach(b=>b.addEventListener('click', ()=>{ lightFilter=b.dataset.light; render(); }));
    root.querySelectorAll('[data-ux-action="reset-filters"]').forEach(b=>b.addEventListener('click', ()=>{ query=''; typeFilter='all'; lightFilter='any'; render(); }));
    root.querySelectorAll('.plant-card').forEach(c=>c.addEventListener('click', ()=>openPlantCard(c.dataset.name)));
  }

  function openPlantCard(name){
    const p = plants.find(pp=>norm(pp.name)===norm(name));
    if(!p) return;
    document.querySelectorAll('.plant-detail-overlay').forEach(o=>o.remove());
    const care = p.care||{};
    const ic = cropIconHTML(String(p.name).trim(), 56);
    const nb = neighborsOf(String(p.name).trim());
    const fam = familyOfName(String(p.name).trim());
    const overlay=document.createElement('div');
    overlay.className='plant-detail-overlay';
    overlay.innerHTML=`
      <div class="plant-detail-modal">
        <div class="plant-detail-head">
          <span class="plant-emoji-lg">${ic || plantEmoji(p)}</span>
          <div>
            <h3>${String(p.name).trim()}</h3>
            <div class="plant-type-lg">${String(p.type||'').trim()} · регион: ${p.region||'—'}</div>
          </div>
          <button type="button" class="plant-detail-close">✕</button>
        </div>
        <div class="plant-detail-body">
          <div class="plant-detail-row"><b>Посев:</b> ${p.sowing_timing||'—'}</div>
          <div class="plant-detail-row"><b>Урожай:</b> ${p.harvest_timing||'—'}</div>
          <div class="plant-detail-row"><b>Свет:</b> ${lightLabel(p.light_requirements)}</div>
          <div class="plant-detail-row" style="margin-top:6px"><b>Уход:</b></div>
          <ul class="care-list">
            ${care.watering?`<li>💧 <b>Полив:</b> ${care.watering}</li>`:''}
            ${care.fertilizer?`<li>🧪 <b>Подкормка:</b> ${care.fertilizer}</li>`:''}
            ${care.pruning?`<li>✂️ <b>Обрезка:</b> ${care.pruning}</li>`:''}
            ${care.other?`<li>🌿 <b>Прочее:</b> ${care.other}</li>`:''}
          </ul>
          ${(p.diseases&&p.diseases.length)?`<div class="plant-detail-row" style="margin-top:8px"><b>Болезни и вредители:</b></div><div class="disease-pills">${p.diseases.map(d=>`<span>${d}</span>`).join('')}</div>`:''}
          <div class="plant-detail-row" style="margin-top:8px"><b>🤝 Соседи:</b></div>
          <div class="plant-detail-row">✅ Хорошие: ${nb.good.join(', ')||'—'}</div>
          <div class="plant-detail-row">⛔ Плохие: ${nb.bad.join(', ')||'—'}</div>
          <div class="plant-detail-row">🔄 Севооборот: ${fam ? `семья ${fam} — не сажайте подряд после культур той же семьи` : 'данных о семье нет'}</div>
        </div>
        <div class="plant-detail-actions">
          <button type="button" class="btn btn-olive" id="pdAdd">🌿 Добавить на схему</button>
          <button type="button" class="btn" id="pdClose">Закрыть</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.plant-detail-close').addEventListener('click',()=>overlay.remove());
    overlay.querySelector('#pdClose').addEventListener('click',()=>overlay.remove());
    overlay.addEventListener('click',e=>{ if(e.target===overlay) overlay.remove(); });
    overlay.querySelector('#pdAdd').addEventListener('click',()=>{ if(onAddToScheme) onAddToScheme(String(p.name).trim(), p.type); overlay.remove(); });
  }

  return { render };
}