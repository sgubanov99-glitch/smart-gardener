// src/ui/chatView.js — чат с садоводом (ревизия 2.51)
// 2.51: быстрые вопросы включают новые сценарии; строки с ⚠ мигают (chat-warn)
// 2.48: быстрый вопрос подставляется в поле (редактируемо), отправка по кнопке/Enter
import { screenHintHTML, emptyStateHTML } from './ux.js';

const QUICK = [
  'Что посадить на грядке 1?',
  'Помоги посадить',
  'Что с грядкой 1?',
  'Томаты зацвели'
];

function escapeHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
// 2.51: строки-предупреждения (начинаются с ⚠) подсвечиваем миганием
function fmtMsg(txt){
  return escapeHtml(txt).split('\n').map(line => line.startsWith('⚠') ? '<span class="chat-warn">'+line+'</span>' : line).join('<br>');
}

export function createChatView({ bot }) {
  const root = document.getElementById('chatRoot');
  let messages = [];

  function render(){
    if(!root) return;
    const msgs = messages.length
      ? messages.map(m=>`<div class="chat-msg ${m.role}">${fmtMsg(m.text)}</div>`).join('')
      : emptyStateHTML({ icon:'💬', title:'Чат пока пуст', text:'Спросите про состояние грядки, попросите помочь посадить — или нажмите готовый вопрос ниже.' });

    root.innerHTML =
      screenHintHTML('Нажмите готовый вопрос — он подставится в поле; отредактируйте и нажмите «Отправить».') +
      `<div class="chat-messages" id="chatMessages">${msgs}</div>
       <div style="display:flex;gap:6px;flex-wrap:wrap;padding:8px 10px 0">
         ${QUICK.map(q=>`<button type="button" class="chat-quick-btn" data-q="${escapeHtml(q)}" style="border:1.5px solid rgba(63,62,58,.14);background:var(--panel);border-radius:999px;padding:5px 12px;font:600 12px 'Manrope',sans-serif;color:var(--ink);cursor:pointer">${escapeHtml(q)}</button>`).join('')}
       </div>
       <div class="chat-input-row">
         <input id="chatInput" type="text" placeholder="Спросите про сад…" />
         <button id="chatSend">Отправить</button>
       </div>`;

    const box = root.querySelector('#chatMessages');
    if(box) box.scrollTop = box.scrollHeight;
    const input = root.querySelector('#chatInput');
    const sendBtn = root.querySelector('#chatSend');
    const doSend = ()=>{ const t=input.value.trim(); if(!t) return; input.value=''; send(t); };
    if(sendBtn) sendBtn.addEventListener('click', doSend);
    if(input) input.addEventListener('keydown', e=>{ if(e.key==='Enter') doSend(); });
    root.querySelectorAll('.chat-quick-btn').forEach(b=>b.addEventListener('click', ()=>{
      if(!input) return;
      input.value = b.dataset.q;
      input.focus();
      const len=input.value.length;
      if(typeof input.setSelectionRange==='function') input.setSelectionRange(len,len);
    }));
  }

  function send(text){
    messages.push({role:'user', text});
    let reply='';
    try { reply = bot.respond(text); }
    catch(e){ reply='Извините, не понял вопрос. Попробуйте «что с грядкой 1».'; }
    messages.push({role:'bot', text: reply});
    render();
  }

  return { render };
}