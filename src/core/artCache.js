// src/core/artCache.js — ревизия 3.27.4: офлайн-гарантии арта постера/печати БЕЗ опоры на scope SW
// Причина: печатное окно (blob/about) не контролируется сервис-воркером, а precache разных ревизий
// имел пробелы — офлайн <img>/fetch арта падали в ERR_INTERNET_DISCONNECTED и эмодзи-фолбэки.
// Решение: страничный кэш 'sg-art-v1' (window.caches) пополняется онлайн; экспортеры берут data-URL,
// поэтому готовый печатный документ и canvas не делают сетевых запросов вообще.
export const ART_ASSETS = [
  'assets/logo.svg',
  'assets/logo-mono.svg',
  'assets/chick.svg',
  'assets/chick_full.svg',
  'assets/boy.svg',
  'assets/smart-gardener.svg',
  'assets/icons.svg',
  'stickers/watering.png',
  'stickers/apples.png',
  'stickers/seedlings.png',
  'stickers/chick.png',
  'stickers/boy.png',
  'stickers/cat.png',
  'stickers/puppy.png',
  'stickers/ach-first-bed.png',
  'stickers/ach-first-harvest.png',
  'stickers/ach-dream-garden.png',
  'stickers/ach-tidy-notes.png',
  'stickers/ach-streak-7.png',
  'stickers/ach-daily-goal.png',
  'stickers/ach-full-season.png',
  'stickers/ach-printer.png',
  'stickers/ach-demo-master.png',
  'stickers/ach-advisor.png',
  'stickers/ach-collector.png',
  'stickers/ach-keeper.png',
  'stickers/ach-perfect-days.png'
];
const ART_CACHE = 'sg-art-v1';

function absUrl(u){
  const base = location.pathname.replace(/[^/]*$/, '');
  return new URL(u, location.origin + base).href;
}
/* Пополнение кэша арта: только онлайн, только отсутствующее; quota/offline глотаются */
export async function ensureArtCache(){
  if (!navigator.onLine) return;
  try {
    const cache = await caches.open(ART_CACHE);
    const have = new Set((await cache.keys()).map(r => r.url));
    await Promise.allSettled(ART_ASSETS.map(async (u)=>{
      const abs = absUrl(u);
      if (have.has(abs)) return;
      const res = await fetch(abs, { credentials: 'same-origin' });
      if (res.ok) await cache.put(abs, res.clone());
    }));
  } catch(e){ /* деградация в эмодзи-фолбэк допустима */ }
}
async function fromArtCache(url){
  try { return (await caches.match(absUrl(url))) || null; } catch(e){ return null; }
}
async function resolveRes(url){
  let res = await fromArtCache(url);
  if (!res){ try { res = await fetch(url); if (!res.ok) res = null; } catch(e){ res = null; } }
  return res;
}
/* Картинка → data-URL (кэш первичен, сеть вторична); null = рисовать фолбэк */
export async function artToDataUrl(url){
  const res = await resolveRes(url);
  if (!res) return null;
  try {
    const blob = await res.blob();
    return await new Promise((resolve, reject)=>{
      const fr = new FileReader();
      fr.onload = ()=> resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  } catch(e){ return null; }
}
/* Текст SVG для инлайна в печать (icons.svg, smart-gardener.svg) */
export async function artText(url){
  const res = await resolveRes(url);
  if (!res) return null;
  try { return await res.text(); } catch(e){ return null; }
}
/* Замена ВСЕХ src="assets|stickers/…" в готовом HTML печати на data-URL до записи документа */
export async function inlineArtInHtml(html){
  const found = (html.match(/src="(assets\/[^"]+|stickers\/[^"]+)"/g) || []);
  const urls = Array.from(new Set(found.map(s => s.slice(5, -1))));
  for (const u of urls){
    const d = await artToDataUrl(u);
    if (d) html = html.split('src="' + u + '"').join('src="' + d + '"');
  }
  return html;
}