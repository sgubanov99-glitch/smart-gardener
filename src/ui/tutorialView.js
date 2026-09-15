// src/ui/tutorialView.js — обучающая слайд-программа (ревизия 2.111)
// 2.111: автооткрытие при каждом запуске, пока обучение не пройдено до конца:
//        флаг sg-tutorial-seen ставится ТОЛЬКО кнопкой «Понятно! 🌱» на последнем слайде;
//        закрытие крестиком, кликом по фону или Esc флаг не ставит —
//        при следующем запуске обучение откроется снова
// 2.105: брендовая строка внизу слайдов (знак + «Умный садовод · обучение»)
// 2.87: Садовод — векторный рисунок /assets/boy.svg вместо эмодзи
// 2.86: слайды с пояснениями Садовода и репликами Цыпы; навигация кнопками, точками и клавиатурой
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }

export function createTutorialView({ slides }) {
  const overlay = document.getElementById('tutorialOverlay');
  const modal = document.getElementById('tutorialModal');
  const list = Array.isArray(slides) ? slides : [];
  let idx = 0;

  function render(){
    if (!modal || !list.length) return;
    const s = list[idx] || {};
    const dots = list.map((_,i)=>`<span class="tut-dot ${i===idx?'active':''}" data-tut-i="${i}" title="Слайд ${i+1}"></span>`).join('');
    modal.innerHTML = `
      <div class="tut-head">
        <div class="tut-ill">
          <span class="tut-icon">${s.icon || '🌱'}</span>
          ${s.sticker ? `<img src="${esc(s.sticker)}" alt="" class="tut-sticker" />` : ''}
        </div>
        <button type="button" class="m-close" id="tutClose" title="Закрыть (обучение откроется при следующем запуске)">✕</button>
      </div>
      <h2 class="tut-title">${esc(s.title || '')}</h2>
      <div class="tut-gardener">
        <img src="/assets/boy.svg" alt="Садовод" class="tut-gardener-img" />
        <p>${esc(s.gardener || '')}</p>
      </div>
      ${Array.isArray(s.tips) && s.tips.length ? `<ul class="tut-tips">${s.tips.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      ${s.tsypa ? `<div class="tut-tsypa">
        <div class="tut-tsypa-bubble">${esc(s.tsypa)}</div>
        <img src="/assets/chick.svg" alt="Цыпа" class="tut-tsypa-img" />
      </div>` : ''}
      <div class="tut-nav">
        <button type="button" class="btn" id="tutPrev" ${idx===0?'disabled':''}>← Назад</button>
        <div class="tut-dots">${dots}</div>
        ${idx < list.length-1
          ? `<button type="button" class="btn btn-olive" id="tutNext">Дальше →</button>`
          : `<button type="button" class="btn btn-olive" id="tutFinish">Понятно! 🌱</button>`}
      </div>
      <!-- 2.105: брендовая строка -->
      <div class="tut-brand"><img src="assets/logo.svg" alt="" /> Умный садовод · обучение</div>`;
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

  if (overlay) {
    overlay.addEventListener('click', (e)=>{
      if (e.target === overlay) { dismiss(); return; }          // клик по фону — без флага
      if (e.target.closest('#tutClose')) { dismiss(); return; } // крестик — без флага
      if (e.target.closest('#tutFinish')) { finish(); return; } // «Понятно! 🌱» — с флагом
      if (e.target.closest('#tutPrev')) { idx = Math.max(0, idx-1); render(); return; }
      if (e.target.closest('#tutNext')) { idx = Math.min(list.length-1, idx+1); render(); return; }
      const dot = e.target.closest('.tut-dot');
      if (dot) { idx = Math.max(0, Math.min(list.length-1, parseInt(dot.dataset.tutI,10)||0)); render(); return; }
    });
  }
  document.addEventListener('keydown', (e)=>{
    if (!overlay || overlay.classList.contains('hidden')) return;
    if (e.key === 'Escape') dismiss();                          // Esc — без флага
    else if (e.key === 'ArrowRight') { idx = Math.min(list.length-1, idx+1); render(); }
    else if (e.key === 'ArrowLeft') { idx = Math.max(0, idx-1); render(); }
  });

  return { open, close: dismiss, finish };
}