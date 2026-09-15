// Code.gs — сервер «Книги отзывов и предложений» (Google Apps Script), ревизия 2.102
// 2.102: колонка ip (видна администратору); публичный GET не отдаёт ip/contact/diagnostics
// Деплой: Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone.
const SHEET_NAME = 'guestbook';
const ADMIN_EMAIL = 's_gubanov@mail.ru';

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['id','date','topic','mood','name','contact','message','diagnostics','reply','replyDate','hidden','ip']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'add') {
      const en = data.entry || {};
      getSheet_().appendRow([
        String(en.id || ('e' + Date.now())),
        String(en.date || new Date().toISOString()),
        String(en.topic || ''),
        String(en.mood || ''),
        String(en.name || 'Садовод без имени'),
        String(en.contact || ''),
        String(en.message || ''),
        String(en.diagnostics || ''),
        '', '', '',
        String(en.ip || '—')   // 2.102: IP отправителя
      ]);
      try {
        MailApp.sendEmail({
          to: (data.adminEmail || ADMIN_EMAIL),
          subject: '📖 Книга отзывов: новая запись (' + String(en.topic || 'note') + ')',
          htmlBody:
            '<h3>Новая запись в Книге отзывов</h3>' +
            '<p><b>Тема:</b> ' + String(en.topic || '') + '<br>' +
            '<b>Имя:</b> ' + String(en.name || 'Садовод без имени') + '<br>' +
            '<b>Контакт:</b> ' + String(en.contact || '—') + '<br>' +
            '<b>IP:</b> ' + String(en.ip || '—') + '<br>' +
            '<b>Дата:</b> ' + String(en.date || '') + '</p>' +
            '<p><b>Сообщение:</b><br>' + String(en.message || '').replace(/\n/g,'<br>') + '</p>' +
            '<p style="color:#888"><b>Диагностика:</b><br>' + String(en.diagnostics || '—') + '</p>' +
            '<p>Ответ: откройте таблицу → лист "' + SHEET_NAME + '" → заполните колонки reply и replyDate (скрыть спам: hidden = yes).</p>'
        });
      } catch (err) { /* письмо не критично */ }
      return json_({ ok: true });
    }
    return json_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'list';
  if (action === 'list') {
    const values = getSheet_().getDataRange().getValues();
    if (values.length) values.shift(); // шапка
    const rows = [];
    for (let i = 0; i < values.length; i++) {
      const r = values[i];
      if (String(r[10]).toLowerCase() === 'yes') continue; // скрыто
      const reply = String(r[8] || '');
      // 2.102: публично не отдаём ip, contact и diagnostics — они только для администратора
      rows.push({
        id: String(r[0]), date: String(r[1]), topic: String(r[2]), mood: String(r[3]),
        name: String(r[4]), message: String(r[6]),
        reply: reply, replyDate: String(r[9] || ''),
        status: reply ? 'answered' : 'waiting'
      });
    }
    rows.reverse(); // свежие сверху
    return json_({ ok: true, entries: rows });
  }
  return json_({ ok: false, error: 'unknown action' });
}