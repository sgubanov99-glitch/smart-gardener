// src/core/guestbook.js — клиентский слой «Книги отзывов и предложений» (ревизия 2.102)
// 2.102: IP отправителя (api.ipify.org) включается в запись — виден администратору
//        в Google-таблице (колонка ip) и в письме; в публичную ленту не попадает
// 2.101: провайдер — Google Apps Script (POST — добавить, GET — лента);
//        если scriptUrl пуст или сервис недоступен — офлайн-режим: запись уходит
//        в локальную очередь и отправляется автоматически, лента показывается из кэша
export const GUESTBOOK_CONFIG = {
  scriptUrl: 'https://script.google.com/macros/s/AKfycby2LTZx3ktmNxYYnbuGn22gJ8dt6MXPG6E17sqkwivXhj5SaJKYuoWSTgEXE6fBiQl-8g/exec', // ← вставьте URL веб-приложения Apps Script (оканчивается на /exec)
  adminEmail: 's_gubanov@mail.ru'
};

const QUEUE_KEY = 'sg-gb-queue';
const CACHE_KEY = 'sg-gb-cache';

function readLS(key, def){ try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : def; } catch(e){ return def; } }
function writeLS(key, val){ try { localStorage.setItem(key, JSON.stringify(val)); } catch(e){} }

export function pendingCount(){ return readLS(QUEUE_KEY, []).length; }

/* публичный IP отправителя (для модерации); без сети — пустая строка */
async function fetchClientIp(){
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    if (res.ok) { const j = await res.json(); if (j && j.ip) return j.ip; }
  } catch(e){}
  return '';
}

async function postAdd(entry){
  const res = await fetch(GUESTBOOK_CONFIG.scriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // без preflight-запроса
    body: JSON.stringify({ action: 'add', adminEmail: GUESTBOOK_CONFIG.adminEmail, entry: entry })
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

/* отправить накопленную очередь */
export async function flushQueue(){
  const q = readLS(QUEUE_KEY, []);
  if (!q.length || !GUESTBOOK_CONFIG.scriptUrl) return 0;
  const rest = [];
  let sent = 0;
  for (const en of q) {
    try { await postAdd(en); sent++; } catch(e){ rest.push(en); }
  }
  writeLS(QUEUE_KEY, rest);
  return sent;
}

/* добавить запись: сразу в книгу или в локальную очередь */
export async function submitEntry(entry){
  const ip = await fetchClientIp(); // 2.102: IP для администратора
  const en = Object.assign({
    id: 'e' + Date.now() + '-' + Math.random().toString(36).slice(2,8),
    date: new Date().toISOString(),
    ip: ip
  }, entry);
  if (GUESTBOOK_CONFIG.scriptUrl) {
    try {
      await postAdd(en);
      await flushQueue();
      return { ok: true, sent: true, entry: en };
    } catch(e){ /* упадём в очередь */ }
  }
  const q = readLS(QUEUE_KEY, []); q.push(en); writeLS(QUEUE_KEY, q);
  return { ok: true, sent: false, queued: true, entry: en };
}

/* лента: из сервиса, а при недоступности — кэш + локальная очередь */
export async function fetchEntries(){
  if (GUESTBOOK_CONFIG.scriptUrl) {
    try {
      const res = await fetch(GUESTBOOK_CONFIG.scriptUrl + '?action=list');
      if (res.ok) {
        const j = await res.json();
        if (j && Array.isArray(j.entries)) {
          writeLS(CACHE_KEY, j.entries);
          await flushQueue();
          return j.entries;
        }
      }
    } catch(e){}
  }
  const cached = readLS(CACHE_KEY, []);
  const queued = readLS(QUEUE_KEY, []).map(en => Object.assign({}, en, { status: 'queued' }));
  return queued.concat(cached);
}