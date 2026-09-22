// src/ui/ux.js — общие UX-хелперы (ревизия 2.166)
// 2.166: getCropIconId устойчиво находит id символа культуры в инлайновом icons.svg:
//        карта CROP_EN (англ. слаги: crop-sweet-cherry, crop-honeysuckle, crop-blackberry, crop-grape,
//        crop-serviceberry, crop-blueberry, crop-chokeberry, crop-barberry, …) + кандидаты с префиксами
//        + скан символов по нормализованному id и по <title>
// 2.159: screenHintHTML рисует site-иконку si-hint вместо эмодзи
// 2.49: единый fmtDateRu; emptyStateHTML для пустых блоков

const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

// культура → английский слаг для id вида crop-<slug> / ic-<slug> в icons.svg
const CROP_EN = {
  'томат':'tomato','огурец':'cucumber','перец':'pepper','капуста':'cabbage','редис':'radish',
  'морковь':'carrot','свёкла':'beet','лук':'onion','чеснок':'garlic','картофель':'potato',
  'клубника':'strawberry','земляника садовая':'strawberry','укроп':'dill','петрушка':'parsley',
  'салат':'lettuce','шпинат':'spinach','тыква':'pumpkin','кабачок':'zucchini','патиссон':'pattypan',
  'дыня':'melon','арбуз':'watermelon','баклажан':'eggplant','горох':'pea','фасоль':'bean','бобы':'bean',
  'черешня':'sweet-cherry','жимолость':'honeysuckle','ежевика':'blackberry','виноград':'grape',
  'ирга':'serviceberry','голубика':'blueberry','арония':'chokeberry','барбарис':'barberry',
  'яблоня':'apple','груша':'pear','слива':'plum','вишня':'cherry','абрикос':'apricot',
  'смородина':'currant','крыжовник':'gooseberry','малина':'raspberry','облепиха':'seabuckthorn',
  'репа':'turnip','рукола':'arugula','щавель':'sorrel','кинза':'cilantro'
};
const TR = {'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'i','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'c','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'};
function translit(s){ return String(s).split('').map(ch => TR.hasOwnProperty(ch) ? TR[ch] : ch).join(''); }
function norm(s){ return String(s || '').trim().toLowerCase(); }

export function fmtNum(n){
  const v = Math.round(Number(n) * 100) / 100;
  return String(v).replace('.', ',');
}
export function fmtDateRu(iso, withYear){
  const p = String(iso || '').split('-');
  if (p.length < 3) return String(iso || '');
  const d = parseInt(p[2], 10);
  const m = MONTHS_GEN[parseInt(p[1], 10) - 1] || '';
  return withYear === false ? `${d} ${m}` : `${d} ${m} ${p[0]}`;
}
export function emptyStateHTML({ icon = '', title = '', text = '' }){
  return '<div class="empty-state">' +
           '<div class="empty-state-icon">' + icon + '</div>' +
           '<div class="empty-state-title">' + title + '</div>' +
           '<div class="empty-state-text">' + text + '</div>' +
         '</div>';
}
export function screenHintHTML(text){
  return '<div class="screen-hint">' +
           '<svg class="ic-site" aria-hidden="true"><use href="#si-hint"></use></svg>' +
           '<span>' + text + '</span>' +
         '</div>';
}

let __symsCache = null;
function cropSymbols(){
  if (!__symsCache || !__symsCache.length) __symsCache = Array.from(document.querySelectorAll('symbol[id]'));
  return __symsCache;
}
export function getCropIconId(culture){
  const n = norm(culture);
  if (!n) return null;
  const en = CROP_EN[n];
  const dashed = n.replace(/\s+/g, '-');
  const tr = translit(n).replace(/\s+/g, '-');
  const cands = [];
  if (en) cands.push('crop-'+en, 'ic-'+en, 'icon-'+en, en);
  cands.push('crop-'+dashed, 'crop-'+tr, 'ic-'+dashed, 'icon-'+dashed, 'i-'+dashed, dashed, n, 'ic-'+tr, 'icon-'+tr, 'i-'+tr, tr);
  for (const c of cands) if (document.getElementById(c)) return c;
  // фолбэк: скан символов по нормализованному id (без префикса/разделителей), по подстроке слага и по <title>
  const syms = cropSymbols();
  const trFlat = tr.replace(/[-_]/g, '');
  const ruFlat = dashed.replace(/[-_]/g, '');
  const enFlat = en || '';
  for (let i = 0; i < syms.length; i++){
    const s = syms[i];
    const id = s.id;
    const base = norm(id).replace(/^(ic|icon|crop|plant|cult|tree|bush)[-_]/, '').replace(/[-_]/g, '');
    if (base === trFlat || base === ruFlat) return id;
    if (enFlat && (base.includes(enFlat) || enFlat.includes(base))) return id;
    const t = s.querySelector('title');
    if (t && norm(t.textContent) === n) return id;
  }
  return null;
}
export function cropIconHTML(culture, size){
  const id = getCropIconId(culture);
  if (!id) return '';
  const s = size || 24;
  return `<svg class="icon" style="width:${s}px;height:${s}px" aria-hidden="true"><use href="#${id}"></use></svg>`;
}
export function cropSiteIconHTML(culture){
  const id = getCropIconId(culture);
  if (!id) return '';
  return `<svg class="ic-site" aria-hidden="true"><use href="#${id}"></use></svg>`;
}