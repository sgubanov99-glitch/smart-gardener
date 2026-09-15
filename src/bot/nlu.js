// src/bot/nlu.js — разбор намерений пользователя (ревизия 2.3)
export function parseIntent(text) {
  const t = String(text || '').toLowerCase();
  if (/что делать|что делать с|ухаживать|как ухаживать|что с грядкой|состояние грядки|что посадить на/.test(t)) {
    return { type: 'bed_question' };
  }
  return { type: 'unknown' };
}

// Извлекает имя/номер грядки из фразы.
// Примеры: «что делать с грядкой 1», «грядка 2», «грядка моркови»
export function extractBedName(text) {
  const t = String(text || '').toLowerCase();
  // «грядка 1», «грядке 2», «грядку 3»
  let m = t.match(/грядк[аеуи]\s*(\d+)/);
  if (m) return m[1];
  // «грядка моркови» / «грядке моркови»
  m = t.match(/грядк[аеуи]\s+([a-zа-яё]+)/);
  if (m) return m[1];
  // просто число в конце
  m = t.match(/(\d+)\s*$/);
  if (m) return m[1];
  return null;
}