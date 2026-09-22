// src/ui/icons.js — централизованный слой замены эмодзи на знаки спрайта smart-gardener.svg (ревизия 2.168)
// Вариант 2: рантайм-замена эмодзи в ТЕКСТОВЫХ УЗЛАХ по всему DOM (TreeWalker),
// без правок логики видов. Контекст фаз выбирается по классам-предкам,
// чтобы одни и те же эмодзи (🌱/🌿/🍅…) в фазах и в навигации давали разные знаки.
export const SITE_ICON = {
  // навигация / файлы / действия
  '🏡':'si-map','🗺':'si-map','🌱':'si-sprout','🗓':'si-calendar','📅':'si-calendar',
  '💬':'si-chat','📋':'si-overview','📊':'si-analytics','💾':'si-save','📂':'si-load',
  '🧹':'si-reset','🕘':'si-history','🎓':'si-tutorial','📖':'si-guestbook','🖨':'si-print',
  '🖼':'si-poster','🗑':'si-delete','✕':'si-close','✓':'si-check','⚙':'si-settings','⚙️':'si-settings',
  '↩':'si-undo','↪':'si-redo','☰':'si-menu','📱':'si-phone',
  // схема и участок
  '🏠':'si-house','🥕':'si-bed','🌳':'si-tree','🌵':'si-bush','🤝':'si-compatibility',
  '☀':'si-sun','☀️':'si-sun','🖐':'si-drag','🐤':'si-chick',
  // помощь и статусы
  '⚠':'si-warning','⚠️':'si-warning','⛔':'si-noEntry','✅':'si-compatGood','🔄':'si-rotate',
  '💡':'si-hint','🧺':'si-basket','💧':'si-water','🌾':'si-wheat','📍':'si-geo','🌐':'si-forecast',
  '🌟':'si-sparkle','💪':'si-sparkle','🎉':'si-sparkle','🌦':'si-weather','📴':'si-offline',
  '←':'si-arrowL','→':'si-arrowR','🌧':'si-rain','🔥':'si-drought','❄':'si-cold','❄️':'si-cold',
  '🧪':'si-fertilize','✂':'si-prune','✂️':'si-prune','🌿':'si-leaf','⏰':'si-alarm',
  '📈':'si-pulse','🌿':'si-leaf',
  // фазы в НЕ-фазовом контексте (фолбэк)
  '🌰':'si-seed','🪴':'si-planting','🌸':'si-flowering','🍅':'si-fruiting','🍂':'si-wilting'
};
// фазовый контекст: те же эмодзи, но фазовые значения
export const PHASE_EMOJI_MAP = {
  '🌰':'si-seed','🌱':'si-shoots','🪴':'si-planting','🌿':'si-growth',
  '🌸':'si-flowering','🍅':'si-fruiting','🍂':'si-wilting'
};
const PHASE_CONTEXT = '.phase-badge, .gh-phase-badge, .pl-ico, .phase-controls, .an-legend, .tut-icon';
const EMOJI_RE = /([\u{1F000}-\u{1FAFF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{2030}-\u{203F}\u{FE0F}])/gu;
const SKIP_TAGS = { SCRIPT:1, STYLE:1, TEXTAREA:1, INPUT:1, SELECT:1, OPTION:1, SVG:1, USE:1 };

export function siteIcon(id, cls){
  return `<svg class="ic-site${cls?' '+cls:''}" aria-hidden="true"><use href="#${id}"></use></svg>`;
}

// Замена эмодзи на <svg class="ic-site"><use href="#si-…"> только в текстовых узлах.
// Атрибуты, <script>/<style>/<input> и уже готовые svg не затрагиваются.
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
    const inPhase = !!(t.parentNode && t.parentNode.closest && t.parentNode.closest(PHASE_CONTEXT));
    const frag = document.createDocumentFragment();
    let last = 0, m;
    EMOJI_RE.lastIndex = 0;
    while ((m = EMOJI_RE.exec(val))){
      if (m.index > last) frag.appendChild(document.createTextNode(val.slice(last, m.index)));
      const id = (inPhase && PHASE_EMOJI_MAP[m[0]]) || SITE_ICON[m[0]];
      if (id){
        const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
        svg.setAttribute('class','ic-site'); svg.setAttribute('aria-hidden','true');
        const use = document.createElementNS('http://www.w3.org/2000/svg','use');
        use.setAttribute('href', '#'+id);
        svg.appendChild(use);
        frag.appendChild(svg);
      } else {
        frag.appendChild(document.createTextNode(m[0])); // нет знака — оставляем эмодзи
      }
      last = m.index + m[0].length;
    }
    if (last < val.length) frag.appendChild(document.createTextNode(val.slice(last)));
    t.parentNode.replaceChild(frag, t);
  });
}