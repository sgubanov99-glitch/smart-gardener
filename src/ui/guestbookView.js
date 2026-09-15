// src/ui/guestbookView.js — интерфейс «Книги отзывов и предложений» (ревизия 2.102)
// 2.102: строка согласия на обработку IP в форме; ответ админа — тёмно-красный (CSS)
// 2.101: вкладки «Написать» (тема, настроение, сообщение, подпись, контакт, диагностика)
//        и «Читать» (общая лента со статусами и ответами администратора)
import { submitEntry, fetchEntries, pendingCount, GUESTBOOK_CONFIG } from '../core/guestbook.js';

const TOPICS = [
  { id:'praise',   icon:'😍', label:'Похвала' },
  { id:'idea',     icon:'💡', label:'Идея' },
  { id:'bug',      icon:'🐞', label:'Ошибка' },
  { id:'question', icon:'❓', label:'Вопрос' }
];
const MOODS = ['😞','😕','🙂','😍'];
const THANKS = {
  praise:   'Твои слова — мой корм! Замяукала от счастья! 🐤',
  idea:     'Вот это идея! Садовод уже рисует чертёж! 💡',
  bug:      'Спасибо! Садовод уже бежит чинить! 🔧',
  question: 'Принято! Ответ появится в книге! 📖'
};
const TOPIC_LABEL = { praise:'Похвала', idea:'Идея', bug:'Ошибка', question:'Вопрос' };

function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtDate(iso){
  const d = new Date(iso);
  if (isNaN(d)) return iso || '';
  const p = n => String(n).padStart(2,'0');
  return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()}`;
}

export function createGuestbookView({ overlay, panel, getDiagnostics, notify }) {
  let tab = 'write';
  let topic = 'question';
  let mood = '';
  let entries = [];
  let thanksTopic = null;
  let busy = false;

  function writeHTML(){
    const pend = pendingCount();
    return `
      <div class="gb-row">
        <span class="gb-label">О чём пишете?</span>
        <div class="gb-chips">
          ${TOPICS.map(t=>`<button type="button" class="gb-chip ${topic===t.id?'active':''}" data-gb-topic="${t.id}">${t.icon} ${t.label}</button>`).join('')}
        </div>
      </div>
      <div class="gb-row">
        <span class="gb-label">Настроение (необязательно)</span>
        <div class="gb-chips">
          ${MOODS.map(m=>`<button type="button" class="gb-chip ${mood===m?'active':''}" data-gb-mood="${m}">${m}</button>`).join('')}
        </div>
      </div>
      <div class="gb-row">
        <span class="gb-label">Ваше сообщение *</span>
        <textarea class="gb-textarea" id="gbMessage" placeholder="Например: на экране Аналитика не вижу урожая за прошлый год…"></textarea>
      </div>
      <div class="gb-row">
        <span class="gb-label">Как подписаться (необязательно)</span>
        <input class="gb-input" id="gbName" type="text" maxlength="40" placeholder="Имя или ник; пусто — «Садовод без имени»" />
      </div>
      <div class="gb-row">
        <span class="gb-label">Контакт для ответа (необязательно)</span>
        <input class="gb-input" id="gbContact" type="text" maxlength="80" placeholder="E-mail или ник в Telegram" />
      </div>
      <div class="gb-row">
        <label style="display:flex;align-items:center;gap:8px;font:500 12px Manrope,sans-serif;color:#6B6A64">
          <input type="checkbox" id="gbDiag" checked /> Приложить диагностику (версия, браузер, состав плана)
        </label>
      </div>
      <button type="button" class="gb-send" id="gbSend" disabled>Отправить в книгу 📖</button>
      <div class="gb-note">${GUESTBOOK_CONFIG.scriptUrl ? 'Запись попадёт в общую книгу, администратор получит уведомление на почту.' : 'Офлайн-режим: запись сохранится на устройстве и отправится, когда сервис станет доступен.'}${pend ? ` Ждут отправки: ${pend}.` : ''} Отправляя сообщение, вы соглашаетесь на обработку IP-адреса в целях модерации.</div>
    `;
  }

  function readHTML(){
    if (!entries.length) {
      return `<div class="gb-thanks"><div class="gb-thanks-emoji">📖</div><p>В книге пока пусто — станьте первым!</p></div>`;
    }
    return entries.map(en=>{
      const st = en.status === 'answered' ? '<span class="gb-status answered">отвечено</span>'
        : en.status === 'queued' ? '<span class="gb-status queued">ждёт отправки</span>'
        : '<span class="gb-status waiting">ждёт ответа</span>';
      const t = TOPICS.find(x=>x.id===en.topic);
      return `<div class="gb-entry">
        <div class="gb-entry-head">
          <span>${t ? t.icon : '📝'}</span>
          <span>${esc(en.name || 'Садовод без имени')}</span>
          <span>· ${fmtDate(en.date)}</span>
          <span>· ${esc(TOPIC_LABEL[en.topic] || en.topic || '')}</span>
          ${en.mood ? `<span>· ${esc(en.mood)}</span>` : ''}
          ${st}
        </div>
        <div class="gb-msg">${esc(en.message)}</div>
        ${en.reply ? `<div class="gb-reply">💬 <b>Ответ:</b> ${esc(en.reply)}${en.replyDate ? ` <span style="color:#8A7A5A;font-weight:500">(${fmtDate(en.replyDate)})</span>` : ''}</div>` : ''}
      </div>`;
    }).join('');
  }

  function thanksHTML(){
    return `<div class="gb-thanks">
      <div class="gb-thanks-emoji">🐤</div>
      <p style="font-family:'Neucha',cursive;font-size:20px;color:#5E7247">${esc(THANKS[thanksTopic] || THANKS.question)}</p>
      <button type="button" class="gb-send" id="gbThanksBack" style="max-width:260px;margin:10px auto 0">Вернуться в книгу</button>
    </div>`;
  }

  function render(){
    if (!panel) return;
    panel.innerHTML = `
      <div class="gb-head">
        <span class="gb-title">📖 Книга отзывов и предложений</span>
        <div class="gb-tabs">
          <button type="button" class="gb-tab ${tab==='write'?'active':''}" data-gb-tab="write">Написать</button>
          <button type="button" class="gb-tab ${tab==='read'?'active':''}" data-gb-tab="read">Читать${entries.length?` (${entries.length})`:''}</button>
        </div>
      </div>
      ${thanksTopic ? thanksHTML() : (tab==='write' ? writeHTML() : readHTML())}
    `;
    const msg = panel.querySelector('#gbMessage');
    const send = panel.querySelector('#gbSend');
    if (msg && send) {
      const upd = ()=>{ send.disabled = !msg.value.trim(); };
      msg.addEventListener('input', upd); upd();
    }
  }

  async function load(){
    try { entries = await fetchEntries(); } catch(e){ entries = []; }
    render();
  }

  function open(){
    if (overlay) overlay.classList.remove('hidden');
    tab = 'write'; thanksTopic = null;
    render();
    load();
  }
  function close(){
    if (overlay) overlay.classList.add('hidden');
  }

  if (panel) {
    panel.addEventListener('click', async (e)=>{
      const tabBtn = e.target.closest('[data-gb-tab]');
      if (tabBtn) { tab = tabBtn.dataset.gbTab; thanksTopic = null; render(); if (tab==='read' && !entries.length) load(); return; }
      const topicBtn = e.target.closest('[data-gb-topic]');
      if (topicBtn) { topic = topicBtn.dataset.gbTopic; render(); return; }
      const moodBtn = e.target.closest('[data-gb-mood]');
      if (moodBtn) { mood = (mood === moodBtn.dataset.gbMood) ? '' : moodBtn.dataset.gbMood; render(); return; }
      const backBtn = e.target.closest('#gbThanksBack');
      if (backBtn) { thanksTopic = null; tab = 'read'; render(); load(); return; }
      const sendBtn = e.target.closest('#gbSend');
      if (sendBtn && !busy) {
        const message = (panel.querySelector('#gbMessage')||{}).value || '';
        if (!message.trim()) return;
        const name = ((panel.querySelector('#gbName')||{}).value || '').trim();
        const contact = ((panel.querySelector('#gbContact')||{}).value || '').trim();
        const diagOn = !!(panel.querySelector('#gbDiag')||{}).checked;
        busy = true; sendBtn.disabled = true; sendBtn.textContent = 'Отправляем…';
        const res = await submitEntry({
          topic: topic, mood: mood, message: message.trim(),
          name: name || 'Садовод без имени',
          contact: contact,
          diagnostics: (diagOn && getDiagnostics) ? getDiagnostics() : ''
        });
        busy = false;
        if (res.ok) {
          thanksTopic = topic;
          render();
          if (notify) notify(res.sent ? 'Запись отправлена в книгу ✓' : 'Сохранено: отправим, когда сервис станет доступен');
          load();
        } else {
          if (notify) notify('Не удалось отправить запись — попробуйте ещё раз');
          sendBtn.disabled = false; sendBtn.textContent = 'Отправить в книгу 📖';
        }
        return;
      }
    });
  }

  return { open, close, refresh: load };
}