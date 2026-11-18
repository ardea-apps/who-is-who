/**
 * Who's who — Apps Script backend.
 *
 * SETUP
 * 1. Create a Google Sheet. Extensions > Apps Script. Paste this file as Code.gs.
 * 2. Change PASSPHRASE below.
 * 3. Run "authorize" once (see below), then Deploy > New deployment > type "Web app".
 *      Execute as: Me
 *      Who has access: Anyone
 *    Authorize when asked. Copy the Web app URL (ends in /exec) into API_URL in index.html.
 * 4. After any later edit of this script: Deploy > Manage deployments > edit > New version.
 *
 * Photos: uploaded recent photos are saved as private files in a Drive folder
 * ("Whos-who recent photos", owned by you) and logged on the "Photos" tab.
 * Before the first deployment, select the function "authorize" in the editor, click Run,
 * and accept the permissions. It also creates the tabs and the Drive folder.
 *
 * Data: every save is appended as a row on the "Log" tab (full history, nothing is overwritten).
 * The page shows the most recent entry for each number.
 */
const PASSPHRASE = 'CHANGE_ME';
const COUNT = 40;
const PUBLIC_VIEW = true;    // false = turn off the keyless view.html page
const PUBLIC_PHOTOS = true;  // false = view.html shows names only, no recent photos
const SHEET = 'Log';
const PHOTO_SHEET = 'Photos';
const FOLDER_NAME = 'Whos-who recent photos';
const MAX_PHOTO_B64 = 600000; // ~450 KB; the page downsizes to ~60 KB before upload

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHEET);
    sh.appendRow(['Timestamp', '#', 'Name', 'Entered by']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function photoSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(PHOTO_SHEET);
  if (!sh) {
    sh = ss.insertSheet(PHOTO_SHEET);
    sh.appendRow(['Timestamp', '#', 'File ID', 'Uploaded by']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function folder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) { /* recreate below */ }
  }
  const f = DriveApp.createFolder(FOLDER_NAME); // private to the script owner
  props.setProperty('FOLDER_ID', f.getId());
  return f;
}

function latestPhotos_() {
  const sh = photoSheet_();
  const last = sh.getLastRow();
  const out = {};
  if (last < 2) return out;
  sh.getRange(2, 1, last - 1, 4).getValues().forEach(r => {
    const n = Number(r[1]);
    if (n >= 1 && n <= COUNT) out[n] = { pv: r[0] instanceof Date ? r[0].toISOString() : String(r[0]), id: String(r[2]) };
  });
  return out;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function latest_() {
  const sh = sheet_();
  const last = sh.getLastRow();
  const out = {};
  if (last < 2) return out;
  const rows = sh.getRange(2, 1, last - 1, 4).getValues();
  rows.forEach(r => {
    const n = Number(r[1]);
    if (n >= 1 && n <= COUNT) {
      out[n] = { ts: r[0] instanceof Date ? r[0].toISOString() : String(r[0]), name: String(r[2]), by: String(r[3]) };
    }
  });
  return out;
}

function photoJson_(n) {
  const ph = latestPhotos_()[n];
  if (!ph) return { ok: false, error: 'No photo' };
  try {
    const blob = DriveApp.getFileById(ph.id).getBlob();
    return { ok: true, pv: ph.pv, data: Utilities.base64Encode(blob.getBytes()) };
  } catch (err) {
    return { ok: false, error: 'Photo unavailable' };
  }
}

function doGet(e) {
  const prm = (e && e.parameter) || {};

  // Keyless read-only access for view.html (names and, optionally, recent photos; never "entered by").
  if (prm.action === 'public' || prm.action === 'publicphoto') {
    if (!PUBLIC_VIEW) return json_({ ok: false, error: 'Disabled' });
    if (prm.action === 'publicphoto') {
      if (!PUBLIC_PHOTOS) return json_({ ok: false, error: 'Disabled' });
      return json_(photoJson_(Number(prm.n)));
    }
    const names = latest_();
    const photos = PUBLIC_PHOTOS ? latestPhotos_() : {};
    const out = {};
    for (let n = 1; n <= COUNT; n++) {
      if (names[n] && names[n].name) out[n] = { name: names[n].name };
      if (photos[n]) { out[n] = out[n] || { name: '' }; out[n].pv = photos[n].pv; }
    }
    return json_({ ok: true, names: out });
  }

  if (prm.key !== PASSPHRASE) return json_({ ok: false, error: 'Wrong passphrase' });

  if (prm.action === 'photo') return json_(photoJson_(Number(prm.n)));

  const names = latest_();
  const photos = latestPhotos_();
  Object.keys(photos).forEach(k => {
    if (!names[k]) names[k] = { ts: '', name: '', by: '' };
    names[k].pv = photos[k].pv;
  });
  return json_({ ok: true, names: names });
}

function doPost(e) {
  let p;
  try { p = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Bad request' }); }
  if (p.key !== PASSPHRASE) return json_({ ok: false, error: 'Wrong passphrase' });
  if (p.action === 'photo') return savePhoto_(p);
  if (p.action !== 'set') return json_({ ok: false, error: 'Unknown action' });

  const n = Number(p.n);
  const name = String(p.name || '').trim().slice(0, 80);
  const by = String(p.by || '').trim().slice(0, 60);
  if (!(n >= 1 && n <= COUNT) || !Number.isInteger(n)) return json_({ ok: false, error: 'Bad number' });
  if (!name) return json_({ ok: false, error: 'Empty name' });
  if (!by) return json_({ ok: false, error: 'Missing your name' });

  // Neutralise spreadsheet formulas.
  const safe = s => /^[=+\-@]/.test(s) ? "'" + s : s;

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    sheet_().appendRow([new Date(), n, safe(name), safe(by)]);
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true });
}

function savePhoto_(p) {
  const n = Number(p.n);
  const by = String(p.by || '').trim().slice(0, 60);
  const data = String(p.data || '');
  if (!(n >= 1 && n <= COUNT) || !Number.isInteger(n)) return json_({ ok: false, error: 'Bad number' });
  if (!by) return json_({ ok: false, error: 'Missing your name' });
  if (!data || data.length > MAX_PHOTO_B64) return json_({ ok: false, error: 'Photo too large' });

  let bytes;
  try { bytes = Utilities.base64Decode(data); } catch (err) { return json_({ ok: false, error: 'Bad image' }); }
  // Must be a JPEG (the page always re-encodes to JPEG).
  if (bytes.length < 4 || (bytes[0] & 255) !== 0xFF || (bytes[1] & 255) !== 0xD8) return json_({ ok: false, error: 'Bad image' });

  const safeBy = /^[=+\-@]/.test(by) ? "'" + by : by;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const stamp = new Date();
    const blob = Utilities.newBlob(bytes, 'image/jpeg', n + '_' + stamp.getTime() + '.jpg');
    const file = folder_().createFile(blob);
    photoSheet_().appendRow([stamp, n, file.getId(), safeBy]);
    return json_({ ok: true, pv: stamp.toISOString() });
  } finally {
    lock.releaseLock();
  }
}

/** Run once from the editor to grant permissions and create the tabs and Drive folder. */
function authorize() {
  sheet_();
  photoSheet_();
  folder_();
}
