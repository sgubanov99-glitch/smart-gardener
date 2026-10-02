// src/ui/tutorialView.js — обучающая слайд-программа (ревизия 3.29.1)
// 3.29.1: иконка заголовка — ТОЛЬКО спрайт si-* (tutIconHTML рисует svg use; id больше не печатается
//      текстом, дефолт si-sprout); стикеры из шапок убраны (тяжёлые PNG не грузятся на слайдах);
//      кнопка финала «Понятно!» без эмодзи (знак si-sprout рядом)
// 2.125: каждый слайд открывается с верхней позиции текста (modal.scrollTop = 0 в render)
// 2.111: автооткрытие при каждом запуске, пока обучение не пройдено до конца:
//      флаг sg-tutorial-seen ставится ТОЛЬКО кнопкой «Понятно!» на последнем слайде;
//      закрытие крестиком, кликом по фону или Esc флаг не ставит — при следующем запуске обучение откроется снова
// 2.105: брендовая строка внизу слайдов (знак + «Умный садовод · обучение»)
// 2.87: Садовод — векторный рисунок assets/boy.svg
// 2.86: слайды с пояснениями Садовода и репликами Цыпы; навигация кнопками, точками и клавиатурой
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
/* 3.29.1: id вида si-* → svg сайтового спрайта; пусто → si-sprout; прочее — экранированный текст (совместимость) */
function tutIconHTML(icon){
  const id = String(icon || '').trim();
  if (!id) return '<svg class="ic-site" aria-hidden="true"><use href="#si-sprout"/></svg>';
  if (id.indexOf('si-') === 0) return '<svg class="ic-site" aria-hidden="true"><use href="#' + id + '"/></svg>';
  return esc(id);
}
export function createTutorialView({ slides }) {
  const overlay = document.getElementById('tutorialOverlay');
  const modal = document.getElementById('tutorialModal');
  const list = Array.isArray(slides) ? slides : [];
  let idx = 0;

  function render(){
    if (!modal || !list.length) return;
    const s = list[idx] || {};
    const last = idx === list.length - 1;
    const dots = list.map((_,i)=> `<span class="tut-dot ${i===idx?'active':''}" data-tut-i="${i}" title="Слайд ${i+1}"></span>`).join('');
    const tips = Array.isArray(s.tips) && s.tips.length
      ? `<ul class="tut-tips">${s.tips.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`
      : '';
    modal.innerHTML =
      `<div class="tut-head">` +
        `<div class="tut-ill"><span class="tut-icon">${tutIconHTML(s.icon)}</span></div>` +   // 3.29.1: только спрайт-иконка, без стикеров
        `<button type="button" class="m-close" id="tutClose" title="Закрыть (обучение откроется при следующем запуске)" aria-label="Закрыть обучение">✕</button>` +
      `</div>` +
      `<h2 class="tut-title">${esc(s.title || '')}</h2>` +
      `<div class="tut-gardener"><img src="assets/boy.svg" alt="" class="tut-gardener-img" /><p>${esc(s.gardener || '')}</p></div>` +
      tips +
      (s.tsypa
        ? `<div class="tut-tsypa"><div class="tut-tsypa-bubble">${esc(s.tsypa)}</div><img src="assets/chick_full.svg" alt="" class="tut-tsypa-img" /></div>`
        : '') +
      `<div class="tut-nav">` +
        `<button type="button" class="btn" id="tutPrev" ${idx === 0 ? 'disabled' : ''}>Назад</button>` +
        `<div class="tut-dots">${dots}</div>` +
        (last
          ? `<button type="button" class="btn btn-olive" id="tutFinish">Понятно! <svg class="ic-site" aria-hidden="true"><use href="#si-sprout"/></svg></button>`
          : `<button type="button" class="btn btn-olive" id="tutNext">Далее</button>`) +
      `</div>` +
      `<div class="tut-brand"><img src="assets/logo-mono.svg" alt="" />Умный садовод · обучение</div>`;
    // 2.125: каждый слайд открывается с верхней позиции текста
    modal.scrollTop = 0;
  }

  function open(startIdx){
    if (!list.length) return;
    idx = startIdx || 0;
    if (overlay) overlay.classList.remove('hidden');
    render();
  }
  /* 2.111: просто закрыть — БЕЗ флага: при следующем запуске обучение откроется снова */
  function dismiss(){
    if (overlay) overlay.classList.add('hidden');
  }
  /* 2.111: обучение пройдено до конца — ставим флаг и закрываем */
  function finish(){
    try { localStorage.setItem('sg-tutorial-seen','1'); } catch(e){}
    dismiss();
  }
  function step(d){
    idx = Math.min(list.length - 1, Math.max(0, idx + d));
    render();
  }

  if (modal){
    modal.addEventListener('click', (e)=>{
      if (e.target.closest('#tutClose'))  { dismiss(); return; }
      if (e.target.closest('#tutNext'))   { step(1);   return; }
      if (e.target.closest('#tutPrev'))   { step(-1);  return; }
      if (e.target.closest('#tutFinish')) { finish();  return; }
      const dot = e.target.closest('.tut-dot[data-tut-i]');
      if (dot){ idx = Number(dot.dataset.tutI || 0); render(); }
    });
  }
  if (overlay){
    overlay.addEventListener('pointerdown', (e)=>{ if (e.target === overlay) dismiss(); });   // фон не ставит флаг (2.111)
  }
  document.addEventListener('keydown', (e)=>{
    if (!overlay || overlay.classList.contains('hidden')) return;
    if (e.key === 'Escape') dismiss();
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
  });

  return { open, dismiss, finish, render };
}