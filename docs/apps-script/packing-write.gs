/**
 * 東京 2026 行程 · 行前準備「完成」勾選寫入
 *
 * 讓 tokyo-2026 網頁可以直接勾選行前準備，寫回試算表的「完成」欄。
 * 只能改「行前準備」工作表的「完成」欄，其他工作表、其他欄位一律拒絕。
 *
 * 安裝步驟見 docs/apps-script/README.md。
 * ⚠️ 下面的 PASSCODE 請改成你們自己的通關密碼，不要把改過的版本放回 GitHub。
 */

const PASSCODE = '請改成你們的通關密碼';

const SHEET_NAME = '行前準備';
const ITEM_HEADER = '項目';
const DONE_HEADER = '完成';

function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!PASSCODE || PASSCODE === '請改成你們的通關密碼') return reply_({ok: false, error: 'not_configured'});
    if (req.pass !== PASSCODE) return reply_({ok: false, error: 'wrong_pass'});
    if (typeof req.item !== 'string' || !req.item.trim() || typeof req.checked !== 'boolean') {
      return reply_({ok: false, error: 'bad_request'});
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
      if (!sh) return reply_({ok: false, error: 'no_sheet'});
      const values = sh.getDataRange().getValues();
      const head = values[0].map(String).map(s => s.trim());
      const itemCol = head.indexOf(ITEM_HEADER), doneCol = head.indexOf(DONE_HEADER);
      if (itemCol < 0 || doneCol < 0) return reply_({ok: false, error: 'no_column'});

      const item = req.item.trim();
      let row = -1;
      // 先看網頁送來的列號是不是同一個項目；不是的話（有人插入或刪除列），用項目名稱找
      const hinted = parseInt(req.row, 10);
      if (hinted >= 2 && hinted <= values.length && String(values[hinted - 1][itemCol]).trim() === item) {
        row = hinted;
      } else {
        const hits = [];
        values.forEach((r, i) => { if (i > 0 && String(r[itemCol]).trim() === item) hits.push(i + 1); });
        if (hits.length !== 1) return reply_({ok: false, error: hits.length ? 'ambiguous_item' : 'item_not_found'});
        row = hits[0];
      }

      sh.getRange(row, doneCol + 1).setValue(req.checked);
      return reply_({ok: true, row: row, checked: req.checked});
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return reply_({ok: false, error: 'server_error'});
  }
}

// 用瀏覽器打開部署網址時，會看到這個訊息，代表部署成功
function doGet() {
  return reply_({ok: true, message: '行前準備寫入服務運作中'});
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
