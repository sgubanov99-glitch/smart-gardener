// src/ui/icons.js — централизованный слой иконок спрайта smart-gardener.svg (ревизия 2.177)
// 2.177: SITE_ICON дополнен недостающими эмодзи: 🗺→si-map, 🌿→si-leaf, 🌧→si-rain,
//        📴→si-offline, 🔥→si-drought, ❄/❄️→si-cold (Обучение, подсказки «4 шага»,
//        нижнее меню, кнопки погоды в Календаре); контекст фаз расширен на .tut-tips,
//        чтобы списки фаз в Обучении использовали фазовые знаки (si-shoots/si-growth и т.д.)
// 2.166: swapEmojiInTextNodes(document.body) через MutationObserver после каждого рендера
export const SITE_ICON = {
  // навигация / файлы / действия
  '🏡':'si-map', '🗺':'si-map',
  '🌱':'si-sprout',
  '🗓':'si-calendar', '📅':'si-calendar',
  '💬':'si-chat', '📋':'si-overview', '📊':'si-analytics',
  '💾':'si-save', '📂':'si-load', '🧹':'si-reset', '🕘':'si-history',
  '🎓':'si-tutorial', '📖':'si-guestbook', '🖨':'si-print', '🖼':'si-poster',
  '🗑':'si-delete', '✕':'si-close', '✓':'si-check',
  '⚙':'si-settings', '⚙️':'si-settings',
  '↩':'si-undo', '↪':'si-redo', '←':'si-arrowL', '→':'si-arrowR',
  // схема и участок
  '🏠':'si-house', '🥕':'si-bed', '🌳':'si-tree', '🌵':'si-bush',
  '🤝':'si-compatibility', '☀':'si-sun', '☀️':'si-sun', '🖐':'si-drag', '🐤':'si-chick',
  // помощь и статусы
  '⚠':'si-warning', '⚠️':'si-warning', '⛔':'si-noEntry', '✅':'si-compatGood',
  '🔄':'si-rotate', '💡':'si-hint', '🧺':'si-basket', '💧':'si-water',
  '🌾':'si-wheat', '📍':'si-geo', '🌐':'si-forecast', '☰':'si-menu', '📱':'si-phone',
  '🌟':'si-sparkle', '💪':'si-sparkle', '🎉':'si-sparkle',
  // погода / PWA  (2.177: добавлены 🌧/🔥/❄/📴/🌥/)
  '':'si-weather', '🌧':'si-rain', '🔥':'si-drought', '❄':'si-cold', '❄️':'si-cold',
  '📴':'si-offline', '🌥':'si-sunHalf', '📲':'si-install',
  // 2.177: 🗺 (Обучение/навигация) и 🌿 вне фазового контекста
  '🌿':'si-leaf',
  // карточка культуры
  '🧪':'si-fertilize', '✂':'si-prune', '✂️':'si-prune',
  // подсказки / аналитика
  '⏰':'si-alarm', '📈':'si-pulse',
  // фазовые эмодзи как общий фолбэк (вне фазового контекста)
  '🌰':'si-seed', '🪴':'si-planting', '🌸':'si-flowering', '🍅':'si-fruiting', '🍂':'si-wilting'
};
// фазовый контекст: те же эмодзи, но фазовые знаки (по строкам «Фазы растения — по порядку»)
export const PHASE_BY_EMOJI = {
  '🌰':'si-seed', '🌱':'si-shoots', '🪴':'si-planting', '🌿':'si-growth',
  '🌸':'si-flowering', '🍅':'si-fruiting', '🍂':'si-wilting'
};
// фазовые знаки по ключу фазы (для schemeView/analytics, где есть ключ, а не эмодзи)
export const PHASE_ICON = {
  seed:'si-seed', seedling:'si-shoots', planting:'si-planting',
  vegetative:'si-growth', flowering:'si-flowering', fruiting:'si-fruiting', senescence:'si-wilting'
};
// 2.177: .tut-tips добавлен — списки фаз в Обучении получают фазовые знаки
const PHASE_CONTEXT = '.phase-badge, .gh-phase-badge, .pl-ico, .phase-controls, .an-legend, .tut-tips';
const EMOJI_RE = /([\u{1F000}-\u{1FAFF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{2030}-\u{203F}\u{FE0F}])/gu;
const SKIP_TAGS = { SCRIPT:1, STYLE:1, TEXTAREA:1, INPUT:1, SELECT:1, OPTION:1, SVG:1, USE:1 };

export function siteIcon(id, cls){
  return `<svg class="ic-site${cls?' '+cls:''}" aria-hidden="true"><use href="#${id}"></use></svg>`;
}
export function emojiIcon(em, cls){
  const id = SITE_ICON[em];
  return id ? siteIcon(id, cls) : em;
}
export function phaseIcon(key, cls){
  const id = PHASE_ICON[key];
  return id ? siteIcon(id, cls) : '';
}
function pickId(em, textNode){
  const parent = textNode.parentElement;
  const inPhase = parent && parent.closest ? parent.closest(PHASE_CONTEXT) : null;
  if (inPhase && PHASE_BY_EMOJI[em]) return PHASE_BY_EMOJI[em];
  return SITE_ICON[em] || null;
}
// Замена эмодзи на <svg class="ic-site"><use href="#si-…"> только в текстовых узлах.
// Атрибуты, <script>/<style>/<input> и содержимое svg не затрагиваются.
export function swapEmojiInTextNodes(root){
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node){
      if (!node.nodeValue || !EMOJI_RE.test(node.nodeValue)) { EMOJI_RE.lastIndex = 0; return NodeFilter.FILTER_SKIP; }
      EMOJI_RE.lastIndex = 0;
      const p = node.parentNode;
      if (!p || SKIP_TAGS[p.tagName]) return NodeFilter.FILTER_SKIP;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const targets = [];
  let n;
  while ((n = walker.nextNode())) targets.push(n);
  targets.forEach(t => {
    const val = t.nodeValue;
    const frag = document.createDocumentFragment();
    let last = 0, m;
    EMOJI_RE.lastIndex = 0;
    while ((m = EMOJI_RE.exec(val))){
      if (m.index > last) frag.appendChild(document.createTextNode(val.slice(last, m.index)));
      const id = pickId(m[0], t);
      if (id){
        const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
        svg.setAttribute('class','ic-site'); svg.setAttribute('aria-hidden','true');
        const use = document.createElementNS('http://www.w3.org/2000/svg','use');
        use.setAttribute('href', '#'+id);
        svg.appendChild(use);
        frag.appendChild(svg);
      } else {
        frag.appendChild(document.createTextNode(m[0]));
      }
      last = m.index + m[0].length;
    }
    if (last < val.length) frag.appendChild(document.createTextNode(val.slice(last)));
    t.parentNode.replaceChild(frag, t);
  });
}