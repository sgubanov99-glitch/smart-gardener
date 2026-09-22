// src/ui/schemeView.js — представление схемы (ревизия 2.159)
// 2.159: легенда фаз под иконками в настройках культуры (мобильный); на десктопе скрыта CSS
// 2.153: зум схемы this.zoom (1..4), pinch (_initZoom), панорама скроллом при zoom>1,
//        двойной тап по СВОБОДНОМУ месту = сброс 1:1; двойной тап по объекту = настройки
// 2.140: closePanel()/openPanel(); addObject сам создаёт массивы грядок теплицы
// 2.66: имя участка — редактируемое поле вверху, привязка к scheme.plotName
// 2.64: блок «Схема посадки» с расчётом растений, оценкой урожая и полем «Фактический урожай»
// 2.57: иконки культур +20%; 2.56: SVG-иконки (фолбэк эмодзи); 2.52: справка у меню фаз
// 2.50: пустое состояние списка; 2.46: тултипы значков + сводные предупреждения
// 2.39: тень от дальней границы; 2.38: световые зоны; 2.37: совместимость теплиц; 2.34: севооборот
import { objValid, clampNum, norm } from '../domain/scheme.js';
import { computeShade, drawShade, SUN_MARKER_POS } from '../core/shade.js';
import { PHASE_META, PHASE_ORDER } from '../core/phaseMachine.js';
import { familyOf, pairResult } from '../core/compatibility.js';
import { fmtDateRu, fmtNum, emptyStateHTML, cropIconHTML } from './ux.js';
import { plantingRef, estimateCount, estimateYieldKg } from '../core/planting.js';

const OBJ_TYPES = {
  building:   { label: 'Постройка',  emoji: '🏠', w: 3, l: 4, h: 4 },
  greenhouse: { label: 'Теплица',    emoji: '🌱', w: 3, l: 6, h: 2.5 },
  bed:        { label: 'Грядка',     emoji: '🥕', w: 1, l: 3 },
  tree:       { label: 'Дерево',     emoji: '🌳', w: 2, l: 2, h: 3 },
  bush:       { label: 'Кустарник',  emoji: '🌵', w: 1, l: 1, h: 1.5 }
};

const PLANT_EMOJI = {
  'томат':'🍅','огурец':'🥒','перец':'🫑','капуста':'🥬','редис':'🌶',
  'морковь':'🥕','свёкла':'🟣','лук':'🧅','чеснок':'🧄','картофель':'🥔',
  'клубника':'🍓','земляника садовая':'🍓','укроп':'🌿','петрушка':'🌿',
  'салат':'🥬','шпинат':'🥬','тыква':'🎃','кабачок':'🥒','патиссон':'🎃',
  'дыня':'🍈','арбуз':'🍉','баклажан':'🍆','горох':'🫛','фасоль':'🫘',
  'репа':'🍠','рукола':'🌿','щавель':'🍃','кинза':'🌿'
};

function toDateStrLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export class SchemeView {
  constructor({ scheme, plants, phases, nextUniqueName, compat, planting }) {
    this.scheme = scheme;
    this.plants = plants;
    this.phases = phases;
    this.nextUniqueName = nextUniqueName;
    this.compat = compat || null;
    this.planting = planting || null;   // 2.64: справочник схем посадки
    this.selectedObjId = null;
    this.drag = null;
    this.ppm = 30;
    this.onPhaseChange = null;
    this.onOpenPlantCard = null;
    this.lastTapId = null;
    this.lastTapTime = 0;
    this._panelOpen = false;   // 2.140: открыта ли панель настроек (мобильный: только двойной тап)
    this.zoom = 1;             // 2.153: множитель масштаба схемы (1..4)
    this._zoomRaf = 0;
    this._lastEmptyTap = 0;    // 2.153: метка тапа по свободному месту (для сброса 1:1)
    this._pairs = [];
    this._badIds = new Set();
    this._ghBadIds = new Set();
    this._lightBadIds = new Set();
    this._compatNotes = new Map();
    this._lightNotes = new Map();
    this.plotEl = document.getElementById('plot');
    this.plotBox = document.getElementById('plotBox');
    this.shadeCanvas = document.getElementById('shadeCanvas');
    this._bind();
    this._bindPlotName();   // 2.66: имя участка
    this._initZoom();       // 2.153: pinch-зум и панорама
  }

  /* ---------- 2.140: мобильность панели настроек ---------- */
  _isMobile() { return !!(window.matchMedia && window.matchMedia('(max-width:900px)').matches); }
  closePanel() { this._panelOpen = false; const p = document.getElementById('objPanel'); if (p) p.classList.add('hidden'); }
  openPanel() { this._panelOpen = true; this._renderPanel(); }

  /* ---------- 2.153: масштаб и панорама схемы (pinch) ---------- */
  setZoom(z) {
    this.zoom = Math.max(1, Math.min(4, z || 1));
    this.render();
  }
  _initZoom() {
    const wrap = this.plotBox ? this.plotBox.parentElement : null;
    if (!wrap) return;
    const pts = new Map();
    let d0 = 0, z0 = 1;
    const dist = () => {
      const p = Array.from(pts.values());
      return p.length < 2 ? 0 : Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    };
    wrap.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { d0 = dist(); z0 = this.zoom; this.drag = null; }
    });
    wrap.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && d0 > 10) {
        const z = Math.max(1, Math.min(4, z0 * dist() / d0));
        if (Math.abs(z - this.zoom) > 0.02) {
          this.zoom = z;
          if (!this._zoomRaf) this._zoomRaf = requestAnimationFrame(() => { this._zoomRaf = 0; this.render(); });
        }
      }
    });
    const end = (e) => { pts.delete(e.pointerId); if (pts.size < 2) d0 = 0; };
    wrap.addEventListener('pointerup', end);
    wrap.addEventListener('pointercancel', end);
  }

  /* ---------- 2.66: имя участка ---------- */
  _bindPlotName() {
    const input = document.getElementById('plotNameInput');
    if (!input) return;
    input.value = this.scheme.plotName || '';
    input.addEventListener('input', () => {
      this.scheme.plotName = input.value;
    });
  }

  _plantEmoji(cultureName) {
    const n = norm(cultureName);
    const fromMap = PLANT_EMOJI[n];
    if (fromMap) return fromMap;
    const plant = this.plants.find(p => norm(p.name) === n);
    return (plant && plant.emoji) || '🌿';
  }

  _phaseDataFor(cultureName) {
    if (!this.phases || !cultureName) return null;
    if (this.phases[cultureName]) return this.phases[cultureName];
    const n = norm(cultureName);
    const key = Object.keys(this.phases).find(k => norm(k) === n);
    return key ? this.phases[key] : null;
  }
  _hasPhaseData(cultureName) { return !!this._phaseDataFor(cultureName); }

  _initialPhaseFor(obj, cropPhases) {
    const order = PHASE_ORDER.filter(ph => cropPhases[ph]);
    if (!order.length) return null;
    let first = order[0];
    const isPerennial = obj.type === 'tree' || obj.type === 'bush';
    const pd = obj.plantingDate;
    if (isPerennial && pd) {
      const py = parseInt(String(pd).slice(0, 4), 10);
      if (py < new Date().getFullYear()) {
        const skipped = order.find(ph => !['seed', 'seedling', 'planting'].includes(ph));
        if (skipped) first = skipped;
      }
    }
    return first;
  }

  /* ---------- совместимость и севооборот ---------- */
  _familyOf(c){ return familyOf(this.compat, c); }
  _pairResult(a,b){ return pairResult(this.compat, a, b); }
  _rectGap(A,B){
    const dx = Math.max(0, Math.max(A.x, B.x) - Math.min(A.x + A.w, B.x + B.w));
    const dy = Math.max(0, Math.max(A.y, B.y) - Math.min(A.y + A.l, B.y + B.l));
    return Math.sqrt(dx * dx + dy * dy);
  }
  _neighborPairs(){
    const beds = this.scheme.objects.filter(o => o.type === 'bed' && o.culture);
    const pairs = [];
    for (let i = 0; i < beds.length; i++) {
      for (let j = i + 1; j < beds.length; j++) {
        if (this._rectGap(beds[i], beds[j]) <= 1.5) {
          const r = this._pairResult(beds[i].culture, beds[j].culture);
          if (r) pairs.push({ a: beds[i], b: beds[j], result: r });
        }
      }
    }
    return pairs;
  }
  _greenhousePairs(){
    const pairs = [];
    this.scheme.objects.forEach(o => {
      if (o.type !== 'greenhouse') return;
      const cs = (o.greenhouseBedCultures || []).filter(Boolean);
      for (let i = 0; i < cs.length; i++) {
        for (let j = i + 1; j < cs.length; j++) {
          const r = this._pairResult(cs[i], cs[j]);
          if (r) pairs.push({
            a: { id: o.id, culture: cs[i] },
            b: { id: o.id, culture: cs[j] },
            result: r,
            gh: o.id,
            where: 'в теплице «' + o.name + '»'
          });
        }
      }
    });
    return pairs;
  }
  _pushHistory(obj){
    const year = new Date().getFullYear();
    obj.history = (obj.history || []).filter(h => h.year !== year);
    obj.history.push({ year: year, culture: obj.culture });
  }
  _prevHistory(obj){
    const year = new Date().getFullYear();
    return (obj.history || []).filter(h => h.year < year).sort((a,b) => b.year - a.year)[0] || null;
  }
  _rotationWarnings(){
    const out = [];
    this.scheme.objects.forEach(o => {
      if (o.type !== 'bed' || !o.culture) return;
      const fam = this._familyOf(o.culture);
      if (!fam) return;
      const prev = this._prevHistory(o);
      if (prev && this._familyOf(prev.culture) === fam) {
        out.push(`Грядка «${o.name}»: в ${prev.year} росло «${prev.culture}» (та же семья ${fam}) — не рекомендуется сажать «${o.culture}» подряд.`);
      }
    });
    return out;
  }

  /* ---------- световые зоны ---------- */
  _sunShadeDir(){
    const map = { N:[0,1], S:[0,-1], E:[-1,0], W:[1,0], NE:[-1,1], SW:[1,-1], NW:[1,1], SE:[-1,-1] };
    return map[this.scheme.sunDir || 'S'] || map.S;
  }
  _shadeRects(){
    const dir = this._sunShadeDir();
    const dx = dir[0], dy = dir[1];
    const rects = [];
    this.scheme.objects.forEach(c => {
      const h = c.height_m || 0;
      if (h <= 0) return;
      const L = h * 0.9;
      if (c.type === 'building') {
        let x = c.x, y = c.y, w = c.w, l = c.l;
        if (dx > 0) w += L; else if (dx < 0) { x -= L; w += L; }
        if (dy > 0) l += L; else if (dy < 0) { y -= L; l += L; }
        rects.push({ x, y, w, l });
      } else if (c.type === 'tree' || c.type === 'bush') {
        if (dx > 0) { rects.push({ x: c.x + c.w, y: c.y, w: L, l: c.l }); }
        else if (dx < 0) { rects.push({ x: c.x - L, y: c.y, w: L, l: c.l }); }
        if (dy > 0) { rects.push({ x: c.x, y: c.y + c.l, w: c.w, l: L }); }
        else if (dy < 0) { rects.push({ x: c.x, y: c.y - L, w: c.w, l: L }); }
      }
    });
    return rects;
  }
  _pointInRect(px, py, r){ return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.l; }
  _lightZoneFor(obj){
    const rects = this._shadeRects();
    const step = 0.5;
    let total = 0, shaded = 0;
    for (let py = obj.y + step / 2; py < obj.y + obj.l; py += step) {
      for (let px = obj.x + step / 2; px < obj.x + obj.w; px += step) {
        total++;
        if (rects.some(r => this._pointInRect(px, py, r))) shaded++;
      }
    }
    if (total === 0) return 'full_sun';
    const f = shaded / total;
    if (f < 0.25) return 'full_sun';
    if (f <= 0.6) return 'partial_shade';
    return 'full_shade';
  }
  _lightViolations(){
    const zoneLabel = { full_sun:'солнечная зона', partial_shade:'лёгкая полутень', full_shade:'тень' };
    const reqLabel = { full_sun:'солнечное место', partial_shade:'лёгкая полутень', full_shade:'тень' };
    const out = [];
    this.scheme.objects.forEach(o => {
      if (!['bed','tree','bush'].includes(o.type) || !o.culture) return;
      const plant = this.plants.find(p => norm(p.name) === norm(o.culture));
      if (!plant || !Array.isArray(plant.light_requirements) || !plant.light_requirements.length) return;
      const zone = this._lightZoneFor(o);
      const req = plant.light_requirements.map(r => String(r).trim());
      if (!req.includes(zone)) {
        out.push({ obj: o, culture: o.culture, zone,
          zoneText: zoneLabel[zone] || zone,
          reqText: req.map(r => reqLabel[r] || r).join(' / ') });
      }
    });
    return out;
  }
  _openCompatModal(){
    const modal = document.getElementById('compatModal');
    const overlay = document.getElementById('compatOverlay');
    if (!modal || !overlay) return;
    let html = '<div class="modal-head"><h2>🤝 Совместимость и севооборот</h2><button type="button" class="m-close" id="compatClose">✕</button></div>';
    if (this._pairs.length) {
      html += this._pairs.map(p => {
        const icon = p.result === 'bad' ? '⚠' : '✅';
        const txt = p.result === 'bad' ? 'плохая совместимость (конфликт/общие болезни)' : 'хорошая совместимость (помогают друг другу)';
        const where = p.where ? ` ${p.where}` : '';
        return `<div class="m-row">${icon} <b>${p.a.culture}</b> ↔ <b>${p.b.culture}</b>${where} — ${txt}</div>`;
      }).join('');
    } else {
      html += '<div class="m-row">Соседних грядок с культурами не найдено либо сочетания нейтральны.</div>';
    }
    const rot = this._rotationWarnings();
    if (rot.length) {
      html += '<div class="m-section">Севооборот</div>' + rot.map(w => `<div class="m-row">⚠ ${w}</div>`).join('');
    }
    const lv = this._lightViolations();
    if (lv.length) {
      html += '<div class="m-section">☀ Световые зоны</div>' +
        lv.map(v => `<div class="m-row">🌥 «${v.culture}» (${v.obj.name}): требует ${v.reqText}, но зона — ${v.zoneText}.</div>`).join('');
    }
    modal.innerHTML = html;
    overlay.classList.remove('hidden');
    const hc = modal.querySelector('#compatClose');
    if (hc) hc.addEventListener('click', () => overlay.classList.add('hidden'));
  }

  /* ---------- справка ---------- */
  _lightInfo(plant){
    if (!plant || !Array.isArray(plant.light_requirements) || !plant.light_requirements.length) return null;
    const map = { full_sun:'солнечное место', partial_shade:'допустима лёгкая полутень', full_shade:'теневыносливо' };
    return plant.light_requirements.map(r => map[r] || r).join(', ');
  }
  _neighborsOf(culture){
    const c = String(culture).trim().toLowerCase();
    const good = [], bad = [];
    if (this.compat) {
      (this.compat.good || []).forEach(p => { if (p[0] === c) good.push(p[1]); else if (p[1] === c) good.push(p[0]); });
      (this.compat.bad || []).forEach(p => { if (p[0] === c) bad.push(p[1]); else if (p[1] === c) bad.push(p[0]); });
    }
    return { good, bad };
  }
  _refHtml(culture){
    const plantRec = this.plants.find(p => norm(p.name) === norm(culture));
    const light = this._lightInfo(plantRec);
    const nb = this._neighborsOf(culture);
    let html = '<div style="grid-column:1/-1;display:flex;flex-direction:column;gap:3px;font-size:12px;background:rgba(138,155,110,.08);border-radius:10px;padding:8px 10px">';
    html += '<b>📖 Справка:</b>';
    if (light) html += `<div>☀ Свет: ${light}</div>`;
    if (nb.good.length) html += `<div>✅ Хорошие соседи: ${nb.good.join(', ')}</div>`;
    if (nb.bad.length) html += `<div>⛔ Плохие соседи: ${nb.bad.join(', ')}</div>`;
    const fam = this._familyOf(culture);
    if (fam) html += `<div>🔄 Севооборот: семья ${fam} — не сажайте подряд после культур той же семьи</div>`;
    if (!light && !nb.good.length && !nb.bad.length && !fam) html += '<div>Нет справочных данных.</div>';
    html += '</div>';
    return html;
  }

  /* ---------- 2.159: легенда фаз (иконка = название) ---------- */
  _phaseLegendHtml(order){
    return `<div class="phase-legend">${order.map(ph => `<span class="pl-item"><span class="pl-ico">${PHASE_META[ph].icon}</span>${PHASE_META[ph].label}</span>`).join('')}</div>`;
  }

  /* ---------- 2.64: схема посадки и урожай для грядки теплицы ---------- */
  _ghPlantingHtml(obj, i, culture) {
    const pRef = plantingRef(this.planting, culture);
    if (!pRef) return '';
    const bedsN = obj.greenhouseBedCount || 1;
    const area = Math.max(0.5, (obj.w * obj.l) / bedsN * 0.6);
    const est = estimateCount(pRef, { kind: 'greenhouseBed', areaM2: area });
    const counts = obj.greenhouseBedPlantedCounts || [];
    const yields = obj.greenhouseBedYields || [];
    const count = counts[i] != null ? counts[i] : (est ? est.count : null);
    const estKg = estimateYieldKg(pRef, count);
    return `<div style="grid-column:1/-1;display:flex;flex-direction:column;gap:5px;font-size:12px;background:rgba(232,160,92,.10);border-radius:10px;padding:8px 10px">` +
      `<b>🌱 Схема посадки:</b>` +
      `<div>Интервал в ряду ${pRef.spacing_cm} см, между рядами ${pRef.row_spacing_cm} см · грядка ≈ ${Math.round(area*10)/10} м² → около <b>${est ? est.count : '—'}</b> раст.${pRef.note ? ` · ${pRef.note}` : ''}</div>` +
      `<label style="display:flex;align-items:center;gap:6px;font:700 12px 'Manrope',sans-serif;color:var(--ink-soft)">Посажено растений <input class="opGhPlanted" data-i="${i}" type="number" min="0" step="1" style="width:90px;border:none;border-radius:8px;padding:6px 8px;background:#fff;box-shadow:var(--shadow-s)" value="${count != null ? count : ''}" /></label>` +
      `<div>Оценка урожая: <b>${estKg != null ? '≈ ' + estKg + ' кг' : '—'}</b></div>` +
      `<label style="display:flex;align-items:center;gap:6px;font:700 12px 'Manrope',sans-serif;color:var(--ink-soft)">Фактический урожай, кг <input class="opGhYield" data-i="${i}" type="number" min="0" step="0.1" style="width:90px;border:none;border-radius:8px;padding:6px 8px;background:#fff;box-shadow:var(--shadow-s)" value="${yields[i] != null ? yields[i] : ''}" placeholder="—" /></label>` +
      `</div>`;
  }

  render() {
    // 2.66: актуализировать имя участка (не затираем, пока пользователь печатает)
    const pn = document.getElementById('plotNameInput');
    if (pn && document.activeElement !== pn) pn.value = this.scheme.plotName || '';
    this._pairs = this._neighborPairs().concat(this._greenhousePairs());
    this._badIds = new Set();
    this._ghBadIds = new Set();
    this._pairs.forEach(p => {
      if (p.result === 'bad') {
        if (p.gh != null) this._ghBadIds.add(p.gh);
        else { this._badIds.add(p.a.id); this._badIds.add(p.b.id); }
      }
    });
    const lightViol = this._lightViolations();
    this._lightBadIds = new Set(lightViol.map(v => v.obj.id));
    this._compatNotes = new Map();
    this._pairs.forEach(p => {
      if (p.result !== 'bad') return;
      if (p.gh != null) {
        const arr = this._compatNotes.get(p.gh) || [];
        arr.push(`«${p.a.culture}» и «${p.b.culture}» — плохая совместимость (внутри теплицы)`);
        this._compatNotes.set(p.gh, arr);
      } else {
        const a1 = this._compatNotes.get(p.a.id) || []; a1.push(`«${p.b.culture}» — плохая совместимость (соседняя грядка)`); this._compatNotes.set(p.a.id, a1);
        const a2 = this._compatNotes.get(p.b.id) || []; a2.push(`«${p.a.culture}» — плохая совместимость (соседняя грядка)`); this._compatNotes.set(p.b.id, a2);
      }
    });
    this._lightNotes = new Map();
    lightViol.forEach(v => this._lightNotes.set(v.obj.id, `зона: ${v.zoneText}, требует: ${v.reqText}`));
    const wrap = this.plotBox.parentElement;
    const avail = Math.max(120, wrap.clientWidth - 40);
    const basePpm = Math.max(14, Math.min(avail / this.scheme.widthM, 420 / this.scheme.lengthM));
    this.ppm = basePpm * (this.zoom || 1);   // 2.153: масштаб схемы
    this.plotBox.style.margin = (this.zoom > 1) ? '0' : 'auto';   // 2.153: при зуме полотно прижато и панорамируется
    this.plotBox.style.width = Math.round(this.scheme.widthM * this.ppm) + 'px';
    this.plotBox.style.height = Math.round(this.scheme.lengthM * this.ppm) + 'px';
    this.plotEl.innerHTML = this.scheme.objects.map(o => {
      const vis = this._objectVisual(o);
      return `<div class="obj o-${o.type} ${o.id === this.selectedObjId ? 'selected' : ''}" data-id="${o.id}" title="${o.name}${vis.tip ? ' • ' + vis.tip : ''}" style="left:${o.x * this.ppm}px; top:${o.y * this.ppm}px; width:${o.w * this.ppm}px; height:${o.l * this.ppm}px;">${vis.html}</div>`;
    }).join('');
    const shade = computeShade(this.scheme);
    drawShade(this.shadeCanvas, this.scheme, shade, this.ppm, this.scheme.gridStepM);
    this._positionSunMarker();
    this._renderPanel();
    this._renderObjList();
  }

  _positionSunMarker() {
    const m = document.getElementById('sunMarker');
    if (!m) return;
    const p = SUN_MARKER_POS[this.scheme.sunDir || 'S'] || SUN_MARKER_POS.S;
    m.style.left = p.left; m.style.top = p.top; m.style.transform = p.transform;
  }

  _objectVisual(o) {
    const minPx = Math.min(o.w, o.l) * this.ppm;
    const fontSize = Math.max(16, minPx * 0.5);
    if (o.type === 'greenhouse') {
      const bedCultures = (o.greenhouseBedCultures || []).filter(Boolean);
      const bedPhases = (o.greenhouseBedPhases || []).filter(bp => bp && bp.phase && PHASE_META[bp.phase]);
      if (bedCultures.length || bedPhases.length) {
        const n = Math.max(bedCultures.length, 1);
        const iconSize = Math.max(12, Math.min(minPx * 0.6, (minPx / Math.ceil(Math.sqrt(n))) * 0.62)) * 1.2;
        const plantIcons = bedCultures.map(c =>
          cropIconHTML(c, iconSize) || `<span style="font-size:${iconSize}px;line-height:1">${this._plantEmoji(c)}</span>`
        ).join('');
        const phaseBadges = bedPhases.map(bp => {
          const pm = PHASE_META[bp.phase];
          return `<span class="phase-badge gh-phase-badge" style="background:${pm.color}" title="Фаза: ${pm.label}${bp.phase_started ? ' (с ' + fmtDateRu(bp.phase_started) + ')' : ''}">${pm.icon}</span>`;
        }).join('');
        const culturesStr = bedCultures.join(', ');
        let html = '';
        if (plantIcons) html += `<span class="greenhouse-plants">${plantIcons}</span>`;
        if (phaseBadges) html += `<span class="gh-phases">${phaseBadges}</span>`;
        let tip = culturesStr ? `Теплица · ${culturesStr}` : 'Теплица';
        if (this._ghBadIds && this._ghBadIds.has(o.id)) {
          const notes = (this._compatNotes.get(o.id) || []).join('; ');
          html += `<span class="phase-badge" style="background:#E53935;left:auto;right:4px" title="Совместимость: ${notes || 'конфликт внутри теплицы'}">⚠</span>`;
          tip += ' · ⚠ совместимость';
        }
        return { html, tip };
      }
      return { html: `<span style="font-size:${fontSize}px;line-height:1">${OBJ_TYPES.greenhouse.emoji}</span>`, tip: 'Теплица' };
    }
    if ((o.type === 'bed' || o.type === 'tree' || o.type === 'bush') && o.culture) {
      const plantEmoji = this._plantEmoji(o.culture);
      const iconHtml = cropIconHTML(o.culture, Math.min(fontSize, minPx * 0.8) * 1.2);
      let html = iconHtml || `<span style="font-size:${Math.min(fontSize, minPx * 0.8)}px;line-height:1">${plantEmoji}</span>`;
      let tip = o.culture;
      if (this._hasPhaseData(o.culture) && o.phase && PHASE_META[o.phase]) {
        const pm = PHASE_META[o.phase];
        html += `<span class="phase-badge" style="background:${pm.color}" title="Фаза: ${pm.label}${o.phase_started ? ' (с ' + fmtDateRu(o.phase_started) + ')' : ''}">${pm.icon}</span>`;
        tip = `${o.culture} · ${pm.label}`;
      }
      if (o.type === 'bed' && this._badIds.has(o.id)) {
        const notes = (this._compatNotes.get(o.id) || []).join('; ');
        html += `<span class="phase-badge" style="background:#E53935;left:auto;right:4px" title="Совместимость: ${notes || 'конфликт'}">⚠</span>`;
        tip += ' · ⚠ совместимость';
      }
      if (this._lightBadIds && this._lightBadIds.has(o.id)) {
        const ln = this._lightNotes.get(o.id) || '';
        html += `<span class="phase-badge" style="background:#E67E22;left:auto;top:auto;right:4px;bottom:4px" title="Свет: ${ln || 'недопустимая зона'}">🌥</span>`;
        tip += ' · 🌥 свет';
      }
      return { html, tip };
    }
    return { html: `<span style="font-size:${fontSize}px;line-height:1">${OBJ_TYPES[o.type].emoji}</span>`, tip: '' };
  }

  _renderPanel() {
    const obj = this.scheme.objects.find(o => o.id === this.selectedObjId);
    const panel = document.getElementById('objPanel');
    // 2.140: на мобильном панель открыта только если _panelOpen (двойной тап / чип / selectAndShow);
    //        на десктопе — как прежде (при выбранном объекте)
    const show = !!obj && (!this._isMobile() || this._panelOpen);
    panel.classList.toggle('hidden', !show);
    if (!show) return;
    document.getElementById('opName').value = obj.name;
    document.getElementById('opX').value = obj.x;
    document.getElementById('opY').value = obj.y;
    document.getElementById('opW').value = obj.w;
    document.getElementById('opL').value = obj.l;
    document.getElementById('objInfo').textContent =
      `${OBJ_TYPES[obj.type].label} · ${fmtNum(obj.w)}×${fmtNum(obj.l)} м` + (obj.height_m ? ` · h ${fmtNum(obj.height_m)} м` : '');
    const isCaster = ['building', 'greenhouse', 'tree', 'bush'].includes(obj.type);
    document.getElementById('opHeightWrap').classList.toggle('hidden', !isCaster);
    if (isCaster) document.getElementById('opHeight').value = obj.height_m || OBJ_TYPES[obj.type].h || 2;
    const isPlant = ['bed', 'tree', 'bush'].includes(obj.type);
    document.getElementById('opCultureWrap').classList.toggle('hidden', !isPlant);
    const opExtra = document.getElementById('opExtra');
    opExtra.innerHTML = '';
    opExtra.classList.add('hidden');
    if (isPlant) {
      const cultures = this.plants.filter(p =>
        obj.type === 'tree' ? p.type.includes('дерево') :
        obj.type === 'bush' ? p.type.includes('кустарник') :
        /овощ|зелень|ягода/.test(p.type)
      );
      document.getElementById('opCulture').innerHTML =
        '<option value="">— не выбрана —</option>' +
        cultures.map(p => `<option value="${p.name}" ${p.name === obj.culture ? 'selected' : ''}>${p.name}</option>`).join('');
      if (obj.culture) {
        opExtra.classList.remove('hidden');
        let extraHtml = '';
        extraHtml += `<label style="grid-column:1/-1">Дата посадки
          <input id="opPlantDate" type="date" value="${obj.plantingDate || ''}" />
        </label>`;
        extraHtml += `<button type="button" id="opPlantCard" class="btn-card" style="grid-column:1/-1">📖 Карточка растения: ${obj.culture}</button>`;
        if (obj.type === 'bed') {
          const fam = this._familyOf(obj.culture);
          const prev = this._prevHistory(obj);
          if (fam) extraHtml += `<div style="grid-column:1/-1;font-size:12px;color:var(--ink-soft)">Семья: ${fam}${prev ? ` · в ${prev.year}: ${prev.culture}` : ''}</div>`;
          if (prev && fam && this._familyOf(prev.culture) === fam) {
            extraHtml += `<div style="grid-column:1/-1;font-size:12px;color:#C0392B">⚠ Севооборот: не рекомендуется сажать «${obj.culture}» после «${prev.culture}» (та же семья).</div>`;
          }
        }
        const warns = [];
        (this._compatNotes.get(obj.id) || []).forEach(s => warns.push('⚠ Совместимость: ' + s));
        const ln = this._lightNotes.get(obj.id);
        if (ln) warns.push('🌥 Свет: ' + ln);
        if (warns.length) {
          extraHtml += `<div style="grid-column:1/-1;display:flex;flex-direction:column;gap:3px;font-size:12px;background:rgba(217,165,160,.15);border-radius:10px;padding:8px 10px;color:#9A635E">` +
            warns.map(w => `<div>${w}</div>`).join('') + `</div>`;
        }
        extraHtml += this._refHtml(obj.culture);
        // 2.64: схема посадки, оценка урожая и фактический учёт
        const pRef = plantingRef(this.planting, obj.culture);
        if (pRef) {
          const kind = (obj.type === 'tree' || obj.type === 'bush') ? 'perennial' : 'bed';
          const est = estimateCount(pRef, { kind: kind, wM: obj.w, lM: obj.l });
          const count = obj.planted_count != null ? obj.planted_count : (est ? est.count : null);
          const estKg = estimateYieldKg(pRef, count);
          const detail = (est && est.rows)
            ? ` → ${est.rows} ряд(а) × ${est.perRow} = <b>${est.count}</b> раст.`
            : (est ? ` → <b>${est.count}</b> раст.` : '');
          extraHtml += `<div style="grid-column:1/-1;display:flex;flex-direction:column;gap:5px;font-size:12px;background:rgba(232,160,92,.10);border-radius:10px;padding:8px 10px">
            <b>🌱 Схема посадки:</b>
            <div>Интервал в ряду ${pRef.spacing_cm} см, между рядами ${pRef.row_spacing_cm} см${detail}${pRef.note ? ` · ${pRef.note}` : ''}</div>
            <label style="display:flex;align-items:center;gap:6px;font:700 12px 'Manrope',sans-serif;color:var(--ink-soft)">Посажено растений
              <input id="opPlantedCount" type="number" min="0" step="1" style="width:90px;border:none;border-radius:8px;padding:6px 8px;background:#fff;box-shadow:var(--shadow-s)" value="${count != null ? count : ''}" />
            </label>
            <div>Оценка урожая: <b>${estKg != null ? '≈ ' + estKg + ' кг' : '—'}</b></div>
            <label style="display:flex;align-items:center;gap:6px;font:700 12px 'Manrope',sans-serif;color:var(--ink-soft)">Фактический урожай, кг
              <input id="opActualYield" type="number" min="0" step="0.1" style="width:90px;border:none;border-radius:8px;padding:6px 8px;background:#fff;box-shadow:var(--shadow-s)" value="${obj.actual_yield_kg != null ? obj.actual_yield_kg : ''}" placeholder="по окончании плодоношения" />
            </label>
          </div>`;
        }
        const cropPhases = this._phaseDataFor(obj.culture);
        if (cropPhases) {
          const order = PHASE_ORDER.filter(ph => cropPhases[ph]);
          const curIdx = order.indexOf(obj.phase);
          extraHtml += `<div class="phase-controls" style="grid-column:1/-1">
            <span style="font:700 12px 'Manrope',sans-serif;color:var(--ink-soft)">Фаза:</span>
            ${order.map((ph, i) => {
              let cls = 'ph';
              if (curIdx >= 0 && i < curIdx) cls += ' ph-past';
              else if (i === curIdx) cls += ' ph-current';
              else cls += ' ph-next';
              return `<button type="button" class="${cls}" data-phase="${ph}" ${curIdx >= 0 && i <= curIdx ? 'disabled' : ''} title="${PHASE_META[ph].label}">${PHASE_META[ph].icon}</button>`;
            }).join('')}
            <span style="flex-basis:100%;font-size:11px;color:var(--ink-soft)">💡 Меняйте вручную фазы растения для уточнения фазового календаря</span>
          </div>`;
          // 2.159: легенда фаз под иконками (мобильный; на десктопе скрыта CSS)
          extraHtml += this._phaseLegendHtml(order);
        }
        opExtra.innerHTML = extraHtml;
        const plantDateInput = document.getElementById('opPlantDate');
        if (plantDateInput) plantDateInput.addEventListener('change', (e) => { obj.plantingDate = e.target.value || null; });
        const plantCardBtn = document.getElementById('opPlantCard');
        if (plantCardBtn) plantCardBtn.addEventListener('click', () => { if (this.onOpenPlantCard) this.onOpenPlantCard(obj.culture); });
        opExtra.querySelectorAll('.ph-next').forEach(btn => btn.addEventListener('click', () => this._changePhase(obj, btn.dataset.phase)));
        // 2.64: число растений и фактический урожай
        const pcInput = document.getElementById('opPlantedCount');
        if (pcInput) pcInput.addEventListener('change', (e) => {
          const v = parseInt(e.target.value, 10);
          obj.planted_count = isNaN(v) ? null : v;
          this._renderPanel();
        });
        const ayInput = document.getElementById('opActualYield');
        if (ayInput) ayInput.addEventListener('change', (e) => {
          const v = parseFloat(e.target.value);
          obj.actual_yield_kg = isNaN(v) ? null : v;
          if (obj.actual_yield_kg != null) obj.yield_date = toDateStrLocal(new Date());
        });
      }
    }
    if (obj.type === 'greenhouse') {
      opExtra.classList.remove('hidden');
      const count = obj.greenhouseBedCount || 1;
      let bedsHtml = `
        <label style="grid-column:1/-1">Грядок в теплице
          <select id="opGhCount">
            <option value="1" ${count === 1 ? 'selected' : ''}>1</option>
            <option value="2" ${count === 2 ? 'selected' : ''}>2</option>
            <option value="3" ${count === 3 ? 'selected' : ''}>3</option>
            <option value="4" ${count === 4 ? 'selected' : ''}>4</option>
          </select>
        </label>`;
      for (let i = 0; i < count; i++) {
        const c = (obj.greenhouseBedCultures || [])[i] || '';
        const d = (obj.greenhouseBedPlantingDates || [])[i] || '';
        const cultures = this.plants.filter(p => /овощ|зелень|ягода/.test(p.type));
        bedsHtml += `
          <div class="op-bed">
            <span class="op-bed-title">Грядка ${i + 1}</span>
            <label>Культура
              <select class="opGhCulture" data-i="${i}">
                <option value="">— не выбрана —</option>
                ${cultures.map(p => `<option value="${p.name}" ${p.name === c ? 'selected' : ''}>${p.name}</option>`).join('')}
              </select>
            </label>
            <label>Дата посадки
              <input class="opGhDate" data-i="${i}" type="date" value="${d}" />
            </label>
            ${c ? `<button type="button" class="btn-card gh-plant-card" data-i="${i}" style="grid-column:1/-1">📖 Карточка: ${c}</button>` : ''}
            ${c ? this._refHtml(c) : ''}
            ${c ? this._ghPlantingHtml(obj, i, c) : ''}
            ${c && this._phaseDataFor(c) ? this._renderGhPhaseControls(obj, i, c) : ''}
          </div>`;
      }
      const ghWarns = (this._compatNotes.get(obj.id) || []);
      if (ghWarns.length) {
        bedsHtml = `<div style="grid-column:1/-1;display:flex;flex-direction:column;gap:3px;font-size:12px;background:rgba(217,165,160,.15);border-radius:10px;padding:8px 10px;color:#9A635E">` +
          ghWarns.map(w => `<div>⚠ Совместимость: ${w}</div>`).join('') + `</div>` + bedsHtml;
      }
      opExtra.innerHTML = bedsHtml;
      document.getElementById('opGhCount').addEventListener('change', (e) => {
        this._setGreenhouseBedCount(obj, parseInt(e.target.value, 10));
        this.render();
        if (this.onPhaseChange) this.onPhaseChange();
      });
      opExtra.querySelectorAll('.opGhCulture').forEach(sel => sel.addEventListener('change', () => {
        const i = parseInt(sel.dataset.i, 10);
        const newCulture = sel.value || null;
        // 2.140: защита от TypeError на старых объектах без массивов
        obj.greenhouseBedCultures = obj.greenhouseBedCultures || [];
        obj.greenhouseBedPhases = obj.greenhouseBedPhases || [];
        obj.greenhouseBedPlantingDates = obj.greenhouseBedPlantingDates || [];
        obj.greenhouseBedCultures[i] = newCulture;
        const cropPhases = this._phaseDataFor(newCulture);
        if (newCulture && cropPhases) {
          const first = PHASE_ORDER.find(ph => cropPhases[ph]);
          if (first) {
            obj.greenhouseBedPhases[i] = { phase: first, phase_started: toDateStrLocal(new Date()), phase_history: [{ phase: first, started: toDateStrLocal(new Date()), ended: null }] };
          }
          if (!obj.greenhouseBedPlantingDates[i]) obj.greenhouseBedPlantingDates[i] = toDateStrLocal(new Date());
        } else {
          obj.greenhouseBedPhases[i] = null;
        }
        this.render();
        if (this.onPhaseChange) this.onPhaseChange();
      }));
      opExtra.querySelectorAll('.opGhDate').forEach(inp => inp.addEventListener('change', () => {
        obj.greenhouseBedPlantingDates = obj.greenhouseBedPlantingDates || [];
        obj.greenhouseBedPlantingDates[parseInt(inp.dataset.i, 10)] = inp.value || null;
      }));
      opExtra.querySelectorAll('.gh-plant-card').forEach(btn => btn.addEventListener('click', () => {
        const c = (obj.greenhouseBedCultures || [])[parseInt(btn.dataset.i, 10)];
        if (c && this.onOpenPlantCard) this.onOpenPlantCard(c);
      }));
      opExtra.querySelectorAll('.gh-phase-btn.ph-next').forEach(btn => btn.addEventListener('click', () => {
        this._changeGreenhouseBedPhase(obj, parseInt(btn.dataset.i, 10), btn.dataset.phase);
      }));
      // 2.64: число растений и урожай в грядках теплицы
      opExtra.querySelectorAll('.opGhPlanted').forEach(inp => inp.addEventListener('change', () => {
        const i = parseInt(inp.dataset.i, 10);
        const v = parseInt(inp.value, 10);
        (obj.greenhouseBedPlantedCounts = obj.greenhouseBedPlantedCounts || [])[i] = isNaN(v) ? null : v;
        this._renderPanel();
      }));
      opExtra.querySelectorAll('.opGhYield').forEach(inp => inp.addEventListener('change', () => {
        const i = parseInt(inp.dataset.i, 10);
        const v = parseFloat(inp.value);
        (obj.greenhouseBedYields = obj.greenhouseBedYields || [])[i] = isNaN(v) ? null : v;
      }));
    }
  }

  _renderGhPhaseControls(obj, bedIndex, culture) {
    const cropPhases = this._phaseDataFor(culture);
    if (!cropPhases) return '';
    const bedPhase = (obj.greenhouseBedPhases || [])[bedIndex];
    const curPhase = bedPhase ? bedPhase.phase : null;
    const order = PHASE_ORDER.filter(ph => cropPhases[ph]);
    const curIdx = order.indexOf(curPhase);
    return `<div class="phase-controls" style="grid-column:1/-1">` +
      `<span style="font:700 12px 'Manrope',sans-serif;color:var(--ink-soft)">Фаза:</span>` +
      order.map((ph, i) => {
        let cls = 'ph gh-phase-btn';
        if (curIdx >= 0 && i < curIdx) cls += ' ph-past';
        else if (i === curIdx) cls += ' ph-current';
        else cls += ' ph-next';
        return `<button type="button" class="${cls}" data-i="${bedIndex}" data-phase="${ph}" ${curIdx >= 0 && i <= curIdx ? 'disabled' : ''} title="${PHASE_META[ph].label}">${PHASE_META[ph].icon}</button>`;
      }).join('') +
      `<span style="flex-basis:100%;font-size:11px;color:var(--ink-soft)">💡 Меняйте вручную фазы растения для уточнения фазового календаря</span>` +
      `</div>` +
      // 2.159: легенда фаз под иконками (мобильный)
      this._phaseLegendHtml(order);
  }

  _setGreenhouseBedCount(obj, newCount) {
    newCount = Math.max(1, Math.min(4, newCount));
    obj.greenhouseBedCount = newCount;
    if (!obj.greenhouseBedCultures) obj.greenhouseBedCultures = [];
    if (!obj.greenhouseBedPlantingDates) obj.greenhouseBedPlantingDates = [];
    if (!obj.greenhouseBedPhases) obj.greenhouseBedPhases = [];
    while (obj.greenhouseBedCultures.length < newCount) { obj.greenhouseBedCultures.push(null); obj.greenhouseBedPlantingDates.push(null); obj.greenhouseBedPhases.push(null); }
    obj.greenhouseBedCultures.length = newCount;
    obj.greenhouseBedPlantingDates.length = newCount;
    obj.greenhouseBedPhases.length = newCount;
  }

  _changePhase(obj, newPhase) {
    const cropPhases = this._phaseDataFor(obj.culture);
    if (!cropPhases || !cropPhases[newPhase]) return;
    const order = PHASE_ORDER.filter(ph => cropPhases[ph]);
    const curIdx = order.indexOf(obj.phase);
    const newIdx = order.indexOf(newPhase);
    if (newIdx <= curIdx) return;
    const today = toDateStrLocal(new Date());
    (obj.phase_history = obj.phase_history || []).forEach(h => { if (!h.ended) h.ended = today; });
    obj.phase = newPhase; obj.phase_started = today;
    obj.phase_history.push({ phase: newPhase, started: today, ended: null });
    this.render();
    if (this.onPhaseChange) this.onPhaseChange();
  }

  _changeGreenhouseBedPhase(obj, bedIndex, newPhase) {
    const culture = (obj.greenhouseBedCultures || [])[bedIndex];
    const cropPhases = this._phaseDataFor(culture);
    if (!culture || !cropPhases || !cropPhases[newPhase]) return;
    const order = PHASE_ORDER.filter(ph => cropPhases[ph]);
    const bedPhase = (obj.greenhouseBedPhases || [])[bedIndex];
    const curIdx = order.indexOf(bedPhase ? bedPhase.phase : null);
    const newIdx = order.indexOf(newPhase);
    if (newIdx <= curIdx) return;
    const today = toDateStrLocal(new Date());
    if (!obj.greenhouseBedPhases[bedIndex]) {
      obj.greenhouseBedPhases[bedIndex] = { phase: newPhase, phase_started: today, phase_history: [{ phase: newPhase, started: today, ended: null }] };
    } else {
      const bp = obj.greenhouseBedPhases[bedIndex];
      (bp.phase_history = bp.phase_history || []).forEach(h => { if (!h.ended) h.ended = today; });
      bp.phase = newPhase; bp.phase_started = today;
      bp.phase_history.push({ phase: newPhase, started: today, ended: null });
    }
    this.render();
    if (this.onPhaseChange) this.onPhaseChange();
  }

  advancePhaseForBed(bedId, bedIndex, newPhase) {
    const obj = this.scheme.objects.find(o => o.id === bedId);
    if (!obj) return;
    if (bedIndex === null || bedIndex === undefined) this._changePhase(obj, newPhase);
    else this._changeGreenhouseBedPhase(obj, bedIndex, newPhase);
  }

  selectAndShow(objId) {
    const obj = this.scheme.objects.find(o => o.id === objId);
    if (!obj) return;
    this.selectedObjId = objId;
    this._panelOpen = true;   // 2.140: переход из списка/обзора открывает настройки
    this.render();
    const panel = document.getElementById('objPanel');
    if (panel && !panel.classList.contains('hidden')) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  _setCulture() {
    const obj = this.scheme.objects.find(o => o.id === this.selectedObjId);
    if (!obj) return;
    obj.culture = document.getElementById('opCulture').value || null;
    if (obj.culture) {
      if (!obj.plantingDate) obj.plantingDate = toDateStrLocal(new Date());
      if (obj.type === 'bed') this._pushHistory(obj);
      const cropPhases = this._phaseDataFor(obj.culture);
      if (cropPhases && !obj.phase) {
        const first = this._initialPhaseFor(obj, cropPhases);
        if (first) {
          obj.phase = first;
          obj.phase_started = obj.plantingDate || toDateStrLocal(new Date());
          obj.phase_history = [{ phase: first, started: obj.phase_started, ended: null }];
        }
      }
    }
    this.render();
    if (this.onPhaseChange) this.onPhaseChange();
  }

  addNewObjectForPlant(plantName, plantType) {
    const typeKey = this._getPlantTypeKey(plantType);
    if (typeKey === 'дерево') this._createObjectWithCulture('tree', plantName);
    else if (typeKey === 'кустарник') this._createObjectWithCulture('bush', plantName);
    else this._showBedOrGreenhouseChoice(plantName);
  }
  _getPlantTypeKey(plantType) {
    const t = (plantType || '').toLowerCase();
    if (t.includes('дерево')) return 'дерево';
    if (t.includes('кустарник')) return 'кустарник';
    return 'овощ';
  }
  _createObjectWithCulture(objType, plantName) {
    const obj = this.addObject(objType);
    if (obj) {
      obj.culture = plantName;
      obj.plantingDate = toDateStrLocal(new Date());
      if (obj.type === 'bed') this._pushHistory(obj);
      const cropPhases = this._phaseDataFor(plantName);
      if (cropPhases && !obj.phase) {
        const first = this._initialPhaseFor(obj, cropPhases);
        if (first) {
          obj.phase = first;
          obj.phase_started = obj.plantingDate || toDateStrLocal(new Date());
          obj.phase_history = [{ phase: first, started: obj.phase_started, ended: null }];
        }
      }
      this.selectedObjId = obj.id;
      this._panelOpen = true;   // 2.140: после добавления из каталога показать настройки
      this.render();
      if (this.onPhaseChange) this.onPhaseChange();
    }
  }
  _createGreenhouseWithCulture(plantName) {
    const obj = this.addObject('greenhouse');
    if (obj) {
      obj.greenhouseBedCount = 1;
      obj.greenhouseBedCultures = [plantName];
      obj.greenhouseBedPlantingDates = [toDateStrLocal(new Date())];
      obj.greenhouseBedPhases = [null];
      const cropPhases = this._phaseDataFor(plantName);
      if (cropPhases) {
        const first = PHASE_ORDER.find(ph => cropPhases[ph]);
        if (first) obj.greenhouseBedPhases[0] = { phase: first, phase_started: toDateStrLocal(new Date()), phase_history: [{ phase: first, started: toDateStrLocal(new Date()), ended: null }] };
      }
      this.selectedObjId = obj.id;
      this._panelOpen = true;   // 2.140: после добавления из каталога показать настройки
      this.render();
      if (this.onPhaseChange) this.onPhaseChange();
    }
  }
  _showBedOrGreenhouseChoice(plantName) {
    const overlay = document.createElement('div');
    overlay.className = 'plant-detail-overlay';
    overlay.innerHTML = `<div class="plant-detail-modal"><div class="plant-detail-head"><h3>Куда посадить «${plantName}»?</h3><button type="button" class="plant-detail-close">✕</button></div><div class="plant-detail-actions"><button type="button" class="btn btn-olive" id="chooseBed">🥕 Грядка</button><button type="button" class="btn btn-olive" id="chooseGreenhouse">🌱 Теплица</button></div></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.plant-detail-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#chooseBed').addEventListener('click', () => { this._createObjectWithCulture('bed', plantName); overlay.remove(); });
    overlay.querySelector('#chooseGreenhouse').addEventListener('click', () => { this._createGreenhouseWithCulture(plantName); overlay.remove(); });
  }

  _renderObjList() {
    const listEl = document.getElementById('objList');
    if (!this.scheme.objects.length) {
      listEl.innerHTML = emptyStateHTML({ icon:'🏡', title:'Схема пока пуста', text:'Добавьте постройку, грядку, дерево или кустарник кнопками палитры выше — объекты появятся здесь и на схеме.' });
      return;
    }
    listEl.innerHTML = this.scheme.objects.map(o => {
      let extra = '';
      if (o.type === 'greenhouse') extra = `· грядок: ${o.greenhouseBedCount || 0}`;
      else if (o.culture) extra = `· ${o.culture}`;
      return `<button type="button" class="obj-chip ${o.id === this.selectedObjId ? 'selected' : ''}" data-id="${o.id}">${OBJ_TYPES[o.type].emoji} ${o.name}${extra}</button>`;
    }).join('');
  }

  /* ---------- 2.58: зазор >= 0.5 м при размещении нового объекта ---------- */
  _gapOk(o, gap = 0.5){
    return this.scheme.objects.every(other => other.id === o.id || this._rectGap(o, other) >= gap - 0.001);
  }
  _findSpot(o) {
    const step = Math.max(this.scheme.gridStepM, 0.5);
    for (let y = 0; y <= this.scheme.lengthM - o.l + 0.001; y += step) {
      for (let x = 0; x <= this.scheme.widthM - o.w + 0.001; x += step) {
        o.x = x; o.y = y;
        if (objValid(this.scheme, o) && this._gapOk(o)) return;
      }
    }
    for (let y = 0; y <= this.scheme.lengthM - o.l + 0.001; y += step) {
      for (let x = 0; x <= this.scheme.widthM - o.w + 0.001; x += step) {
        o.x = x; o.y = y;
        if (objValid(this.scheme, o)) return;
      }
    }
    o.x = 0; o.y = 0;
  }

  _bind() {
    document.getElementById('plotW').addEventListener('change', () => { this.scheme.widthM = clampNum(Number(document.getElementById('plotW').value) || 12, 4, 60); this.render(); });
    document.getElementById('plotL').addEventListener('change', () => { this.scheme.lengthM = clampNum(Number(document.getElementById('plotL').value) || 8, 4, 60); this.render(); });
    document.getElementById('sunDir').addEventListener('change', () => { this.scheme.sunDir = document.getElementById('sunDir').value || 'S'; this.render(); });
    document.querySelectorAll('.pal-btn[data-add]').forEach(b => b.addEventListener('click', () => this.addObject(b.dataset.add)));
    const compatBtn = document.getElementById('compatBtn');
    if (compatBtn) compatBtn.addEventListener('click', () => this._openCompatModal());
    document.getElementById('objDelete').addEventListener('click', () => this.deleteSelected());
    document.getElementById('opName').addEventListener('change', () => this._renameSelected());
    ['opX', 'opY', 'opW', 'opL'].forEach(id => document.getElementById(id).addEventListener('change', () => this._updateGeom()));
    document.getElementById('opHeight').addEventListener('change', () => this._updateHeight());
    document.getElementById('opCulture').addEventListener('change', () => this._setCulture());
    document.getElementById('objList').addEventListener('click', e => {
      const chip = e.target.closest('.obj-chip');
      if (!chip) return;
      this.selectedObjId = Number(chip.dataset.id);
      this._panelOpen = true;   // 2.140: клик по чипу открывает настройки
      this.render();
    });
    this.plotEl.addEventListener('pointerdown', e => this._onPointerDown(e));
    document.addEventListener('pointermove', e => this._onPointerMove(e));
    document.addEventListener('pointerup', () => this._onPointerUp());
  }

  _onPointerDown(e) {
    const el = e.target.closest('.obj');
    if (!el) {
      // 2.153: двойной тап по СВОБОДНОМУ месту = быстрый сброс зума к 1:1 (окно 500 мс)
      const nowEmpty = Date.now();
      if (this._lastEmptyTap && (nowEmpty - this._lastEmptyTap) < 500) {
        this._lastEmptyTap = 0;
        this.zoom = 1;
        const wrap = this.plotBox ? this.plotBox.parentElement : null;
        if (wrap) { wrap.scrollLeft = 0; wrap.scrollTop = 0; }   // сброс панорамы
      } else {
        this._lastEmptyTap = nowEmpty;
      }
      this.selectedObjId = null; this._panelOpen = false; this.render(); return;
    }
    this._lastEmptyTap = 0;   // тап по объекту сбрасывает счётчик свободных тапов
    const id = Number(el.dataset.id);
    const now = Date.now();
    // 2.140: двойной тап по тому же объекту (<400 мс) = открыть настройки
    const isDouble = (this.lastTapId === id && (now - this.lastTapTime) < 400);
    this.lastTapId = id; this.lastTapTime = now;
    this.selectedObjId = id;
    if (isDouble) {
      this.lastTapId = null; this.lastTapTime = 0;
      this.drag = null;
      this._panelOpen = true;
      this.render();
      const panel = document.getElementById('objPanel');
      if (panel && !panel.classList.contains('hidden')) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    // одиночный тап: мобильный — панель закрыта (можно перетаскивать); десктоп — панель открыта
    this._panelOpen = !this._isMobile();
    this.render();
    const obj = this.scheme.objects.find(o => o.id === id);
    this.drag = { id, startX: e.clientX, startY: e.clientY, origX: obj.x, origY: obj.y, lastX: obj.x, lastY: obj.y };
    e.preventDefault();
  }

  addObject(type) {
    const t = OBJ_TYPES[type];
    if (!t) return;
    // 2.173: гарантируем уникальный id даже если nextId не восстановился после загрузки
    const maxId = this.scheme.objects.reduce((m,o)=>Math.max(m, o.id||0), 0);
    if (!Number.isFinite(this.scheme.nextId) || this.scheme.nextId <= maxId) this.scheme.nextId = maxId + 1;
    const obj = { id: this.scheme.nextId++, type, name: this.nextUniqueName(this.scheme, t.label), culture: null, plantingDate: null, w: Math.min(t.w, this.scheme.widthM), l: Math.min(t.l, this.scheme.lengthM), x: 0, y: 0 };
    if (t.h) obj.height_m = t.h;
    // 2.140: теплица сразу получает массивы грядок — выбор культуры не падает
    if (type === 'greenhouse') {
      obj.greenhouseBedCount = 1;
      obj.greenhouseBedCultures = [null];
      obj.greenhouseBedPlantingDates = [null];
      obj.greenhouseBedPhases = [null];
    }
    this._findSpot(obj);
    this.scheme.objects.push(obj);
    this.selectedObjId = obj.id;
    this._panelOpen = !this._isMobile();   // 2.140: на мобильном не раскрывать панель сразу
    this.render();
    return obj;
  }

  deleteSelected() {
    this.scheme.objects = this.scheme.objects.filter(o => o.id !== this.selectedObjId);
    this.selectedObjId = null;
    this._panelOpen = false;
    this.render();
  }

  _renameSelected() {
    const obj = this.scheme.objects.find(o => o.id === this.selectedObjId);
    if (!obj) return;
    const v = document.getElementById('opName').value.trim();
    if (!v) { document.getElementById('opName').value = obj.name; return; }
    if (this.scheme.objects.some(o => o.id !== obj.id && norm(o.name) === norm(v))) { alert('Имя занято — выберите другое'); document.getElementById('opName').value = obj.name; return; }
    obj.name = v;
    this.render();
  }

  _updateGeom() {
    const obj = this.scheme.objects.find(o => o.id === this.selectedObjId);
    if (!obj) return;
    obj.w = clampNum(Number(document.getElementById('opW').value) || obj.w, 0.3, this.scheme.widthM);
    obj.l = clampNum(Number(document.getElementById('opL').value) || obj.l, 0.3, this.scheme.lengthM);
    obj.x = clampNum(Number(document.getElementById('opX').value) || 0, 0, this.scheme.widthM - obj.w);
    obj.y = clampNum(Number(document.getElementById('opY').value) || 0, 0, this.scheme.lengthM - obj.l);
    this.render();
  }

  _updateHeight() {
    const obj = this.scheme.objects.find(o => o.id === this.selectedObjId);
    if (!obj) return;
    obj.height_m = clampNum(Number(document.getElementById('opHeight').value) || OBJ_TYPES[obj.type].h || 2, 0.5, 15);
    this.render();
  }

  _onPointerMove(e) {
    if (!this.drag) return;
    const obj = this.scheme.objects.find(o => o.id === this.drag.id);
    if (!obj) return;
    const step = this.scheme.gridStepM;
    let x = Math.round((this.drag.origX + (e.clientX - this.drag.startX) / this.ppm) / step) * step;
    let y = Math.round((this.drag.origY + (e.clientY - this.drag.startY) / this.ppm) / step) * step;
    x = clampNum(x, 0, this.scheme.widthM - obj.w);
    y = clampNum(y, 0, this.scheme.lengthM - obj.l);
    obj.x = x; obj.y = y;
    const valid = objValid(this.scheme, obj);
    if (valid) { this.drag.lastX = x; this.drag.lastY = y; }
    const el = this.plotEl.querySelector(`.obj[data-id="${obj.id}"]`);
    if (el) { el.style.left = `${x * this.ppm}px`; el.style.top = `${y * this.ppm}px`; el.classList.toggle('invalid', !valid); }
  }

  _onPointerUp() {
    if (!this.drag) return;
    const obj = this.scheme.objects.find(o => o.id === this.drag.id);
    if (obj && !objValid(this.scheme, obj)) { obj.x = this.drag.lastX; obj.y = this.drag.lastY; }
    this.drag = null;
    this.render();
  }
}