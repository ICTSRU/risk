/**
 * =====================================================================
 *  ICTD Risk Register v1.5 — built on SRU Secure Access Kit v1.4
 *  Access: Sulaiman Al Rajhi University Google accounts (@sr.edu.sa) only
 *  ICTD — ITOC
 * ---------------------------------------------------------------------
 *  Files:  Code.gs · Index.html · Logos.html · Denied.html  (Google Sheet: ICTD Risk Register)
 *  Deploy: Deploy ▸ New deployment ▸ Web app
 *          Execute as: Me  ·  Who has access: Anyone within Sulaiman Al Rajhi University
 *  Access log: every sign-in → sheet "AccessLog" (see LOG_* settings)
 *  Access list: only active emails in sheet "AllowedUsers" (ACCESS_MODE = 'LIST')
 * =====================================================================
 */

/* ▼▼▼ CONFIG — change per platform ▼▼▼ */
const APP_NAME       = 'سجل المخاطر';           // Arabic title shown in the page
const APP_NAME_EN    = 'ICTD Risk Register';        // English name
const APP_VERSION    = '1.5';
const ALLOWED_DOMAIN = 'sr.edu.sa';
const FAVICON_URL    = 'https://ictsru.github.io/ITOC/assets/itoc-logo.png';

/* Access log */
const LOG_ENABLED        = true;
const LOG_SPREADSHEET_ID = '';            // '' = the spreadsheet this script is bound to; or paste a Sheet ID
const SHEET_LOG          = 'AccessLog';
const LOG_TIMEZONE       = 'Asia/Riyadh';
const LOG_DEDUP_MINUTES  = 30;            // same user within N min = one entry (0 = log every page open)
const LOG_RETENTION_DAYS = 180;           // menu: delete entries older than this
/* Access list (who may open the platform) */
const ACCESS_MODE        = 'LIST';         // 'LIST' = only active emails in the AllowedUsers tab · 'DOMAIN' = any @sr.edu.sa account
const ACCESS_SPREADSHEET_ID = ''           ;  // where the AllowedUsers tab lives
const SHEET_ACCESS       = 'AllowedUsers';
const OWNER_EMAILS       = ['m.elmahdy@sr.edu.sa']; // always allowed, so the owner can never be locked out

/* Default access list — added to AllowedUsers by setupAccessList() (existing rows are kept) */
const DEFAULT_ALLOWED = [
  // [email, name, role, notes]
  ['nabounar@sr.edu.sa',    'Nasser Abounar', 'admin', 'CIO'],
  ['m.elmahdy@sr.edu.sa',   'Mohamed ElMahdy', 'admin', 'Owner — IT Operations Manager'],
  ['n.nawaz@sr.edu.sa',     '', 'user', ''],
  ['m.omar@sr.edu.sa',      '', 'user', ''],
  ['m.saleh@sr.edu.sa',     '', 'user', ''],
  ['a.alrowedan@sr.edu.sa', '', 'user', ''],
  ['n.alrashidi@sr.edu.sa', '', 'user', ''],
  ['a.alawaji@sr.edu.sa',   '', 'user', ''],
  ['a.alaqeel@sr.edu.sa',   '', 'user', ''],
  ['a.alolayan@sr.edu.sa',  '', 'user', ''],
  ['s.albusayli@sr.edu.sa', '', 'user', ''],
  ['i.almutairi@sr.edu.sa', '', 'user', ''],
  ['a.elnadi@sr.edu.sa',    '', 'user', '']
];
const ACCESS_CACHE_SECONDS = 120;          // list changes take effect within 2 minutes
/* ▲▲▲ CONFIG ▲▲▲ */

const LOG_HEADERS = ['timestamp', 'date', 'time', 'day', 'email', 'result', 'version'];
const DAYS_AR_    = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']; // index = ISO day % 7

/* ----------------------------- Web app ------------------------------ */

function doGet() {
  const email = currentEmail_();
  const status = accessStatus_(email);
  if (status !== 'ok') {
    logAccess_(email || '(unknown)', status === 'list' ? 'not-listed' : 'denied');
    const d = HtmlService.createTemplateFromFile('Denied');
    d.appName = APP_NAME; d.appNameEn = APP_NAME_EN;
    d.userEmail = email || '';
    d.reason = status;
    return d.evaluate().setTitle(APP_NAME + ' | غير مصرح')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  logAccess_(email, 'granted');
  ensureSetup_();                                   // creates Risks / Audit / Lists / AllowedUsers on first use

  const user = userInfo_(email);
  const t = HtmlService.createTemplateFromFile('Index');
  t.appName   = APP_NAME;
  t.appNameEn = APP_NAME_EN;
  t.version   = APP_VERSION;
  t.userEmail = email;
  t.dataJson  = safeJson_(initialData_(user));      // risks rendered into the page (no extra round trip)
  const out = t.evaluate().setTitle(APP_NAME_EN + ' | ' + APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  if (FAVICON_URL) out.setFaviconUrl(FAVICON_URL);
  return out;
}

function initialData_(user) {
  return { ok: true, user: { email: user.email, name: user.name }, isAdmin: user.isAdmin,
           risks: readRisks_(), lists: readLists_() };
}

/* ------------------- Server calls from the page --------------------- */
/*  The page calls ONE function, api(), which starts with requireSruUser_().  */

function api(reqJson) {
  let email;
  try { email = requireSruUser_(); }
  catch (e) { return JSON.stringify({ ok: false, error: 'unauthorized', message: e.message, email: currentEmail_() }); }
  let req;
  try { req = JSON.parse(reqJson); } catch (err) { return JSON.stringify({ ok: false, error: 'bad_request' }); }
  const user = userInfo_(email);
  try {
    let out;
    switch (req.action) {
      case 'signin': out = { ok: true, user: { email: user.email, name: user.name }, isAdmin: user.isAdmin }; break;
      case 'list':   out = initialData_(user); break;
      case 'add':    out = withLock_(() => addRisk_(req.risk || {}, user)); break;
      case 'update': out = withLock_(() => updateRisk_(req.id, req.risk || {}, user)); break;
      case 'delete': out = withLock_(() => deleteRisk_(req.id, user)); break;
      default:       out = { ok: false, error: 'unknown_action' };
    }
    return JSON.stringify(out);
  } catch (err) {
    return JSON.stringify({ ok: false, error: String(err.message || err) });
  }
}

/* ------------------------------ Access ------------------------------ */

function currentEmail_() {
  return String(Session.getActiveUser().getEmail() || '').toLowerCase();
}
function isAllowed_(email) {
  return !!email && email.endsWith('@' + ALLOWED_DOMAIN);
}
function requireSruUser_() {
  const email = currentEmail_();
  const status = accessStatus_(email);
  if (status === 'domain') throw new Error('غير مصرح — الدخول لمنسوبي الجامعة فقط');
  if (status === 'list') throw new Error('غير مصرح — حسابك غير مضاف إلى قائمة المصرّح لهم');
  return email;
}

/* ---------------------------- Access list --------------------------- */

const ACCESS_HEADERS = ['email', 'name', 'role', 'active', 'notes'];

/** 'ok' | 'domain' (not @sr.edu.sa) | 'list' (not on the active list) */
function accessStatus_(email) {
  if (!isAllowed_(email)) return 'domain';
  if (ACCESS_MODE !== 'LIST') return 'ok';
  if (OWNER_EMAILS.map(e => e.toLowerCase()).indexOf(email) !== -1) return 'ok';
  return allowedEmails_().indexOf(email) !== -1 ? 'ok' : 'list';
}

/** Active emails from the AllowedUsers tab (cached briefly). */
function allowedEmails_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('acl_v1');
  if (hit) return JSON.parse(hit);
  let list = [];
  try {
    const sh = accessSheet_(false);
    if (sh && sh.getLastRow() > 1) {
      list = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues()
        .filter(r => r[0] && r[3] !== false && String(r[3]).toUpperCase() !== 'FALSE')
        .map(r => String(r[0]).trim().toLowerCase());
    }
  } catch (e) { console.error('allowedEmails_ failed: ' + e); }
  cache.put('acl_v1', JSON.stringify(list), ACCESS_CACHE_SECONDS);
  return list;
}

function accessSheet_(create) {
  const ss = ACCESS_SPREADSHEET_ID ? SpreadsheetApp.openById(ACCESS_SPREADSHEET_ID) : ss_();
  let sh = ss.getSheetByName(SHEET_ACCESS);
  if (!sh && create) {
    sh = ss.insertSheet(SHEET_ACCESS);
    sh.getRange(1, 1, 1, ACCESS_HEADERS.length).setValues([ACCESS_HEADERS])
      .setFontWeight('bold').setFontColor('#ffffff').setBackground('#501e8c');
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
    [260, 200, 100, 70, 260].forEach((w, i) => sh.setColumnWidth(i + 1, w));
    sh.getRange(2, 4, 300, 1).insertCheckboxes();
    sh.getRange('A1').setNote('البريد الجامعي كاملًا — name@sr.edu.sa');
    sh.getRange('C1').setNote('admin / user (للتوثيق — يمكن استخدامه لاحقًا لصلاحيات أدق)');
    sh.getRange('D1').setNote('ألغِ العلامة لإيقاف الوصول دون حذف الصف');
  }
  return sh;
}

/** Run once from the editor: creates the AllowedUsers tab and adds the owner(s). */
function setupAccessList() {
  const sh = accessSheet_(true);
  const n = Math.max(sh.getLastRow() - 1, 0);            // includes empty rows that only hold checkboxes
  const data = n ? sh.getRange(2, 1, n, 5).getValues() : [];

  // Keep every existing entry (and its active state), compacted to the top — fixes rows that
  // earlier versions appended below the pre-made checkbox rows.
  const kept = data.filter(r => String(r[0]).trim())
    .map(r => [String(r[0]).trim(), r[1], r[2], r[3] === true || String(r[3]).toUpperCase() === 'TRUE', r[4]]);
  const have = kept.map(r => r[0].toLowerCase());

  const seed = OWNER_EMAILS.map(e => [e, e === 'm.elmahdy@sr.edu.sa' ? 'Mohamed ElMahdy' : '', 'admin', 'owner'])
    .concat(typeof DEFAULT_ALLOWED !== 'undefined' ? DEFAULT_ALLOWED : []);
  let added = 0;
  seed.forEach(r => {
    const e = String(r[0]).trim().toLowerCase();
    if (e && have.indexOf(e) === -1) {
      kept.push([e, r[1] || '', r[2] || 'user', true, r[3] || 'added by setupAccessList']);
      have.push(e); added++;
    }
  });

  if (n) sh.getRange(2, 1, n, 5).clearContent();
  const rows = Math.max(n, kept.length, 50);
  sh.getRange(2, 4, rows, 1).insertCheckboxes();          // checkboxes first (this sets them to unchecked)
  if (kept.length) sh.getRange(2, 1, kept.length, 5).setValues(kept);  // then the real values

  CacheService.getScriptCache().removeAll(['acl_v1', 'dir_v1']);
  console.log('AllowedUsers ready: ' + kept.length + ' entries (' + added + ' added).');
  try { SpreadsheetApp.getActive().toast('قائمة المصرّح لهم جاهزة: ' + kept.length + ' بريدًا (أُضيف ' + added + ').', SHEET_ACCESS, 8); } catch (e) {}
}

/* ---------------------------- Access log ---------------------------- */

/** Appends one row to AccessLog. Never blocks the page if logging fails. */
function logAccess_(email, result) {
  if (!LOG_ENABLED) return;
  try {
    if (LOG_DEDUP_MINUTES > 0 && result === 'granted') {
      const cache = CacheService.getScriptCache();
      const key = 'log_' + email;
      if (cache.get(key)) return;
      cache.put(key, '1', LOG_DEDUP_MINUTES * 60);
    }
    const now = new Date();
    const f = p => Utilities.formatDate(now, LOG_TIMEZONE, p);
    getLogSheet_().appendRow([now, f('yyyy-MM-dd'), f('HH:mm:ss'), DAYS_AR_[Number(f('u')) % 7],
      email, result === 'granted' ? 'دخول' : (result === 'not-listed' ? 'غير مدرج' : 'مرفوض'), APP_VERSION]);
  } catch (e) {
    console.error('logAccess_ failed: ' + e);
  }
}

function getLogSheet_() {
  const ss = LOG_SPREADSHEET_ID ? SpreadsheetApp.openById(LOG_SPREADSHEET_ID) : ss_();
  if (!ss) throw new Error('No spreadsheet: bind the script to a Sheet or set LOG_SPREADSHEET_ID');
  let sh = ss.getSheetByName(SHEET_LOG);
  if (!sh) {
    sh = ss.insertSheet(SHEET_LOG);
    sh.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS])
      .setFontWeight('bold').setFontColor('#ffffff').setBackground('#3a1464');
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
    sh.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm:ss');
    [170, 100, 80, 80, 260, 80, 70].forEach((w, i) => sh.setColumnWidth(i + 1, w));
  }
  return sh;
}

/** Menu: quick summary of the last 30 days. */
function showLogSummary() {
  const sh = getLogSheet_();
  const ui = SpreadsheetApp.getUi();
  const last = sh.getLastRow();
  if (last < 2) { ui.alert('سجل الدخول', 'لا توجد سجلات بعد.', ui.ButtonSet.OK); return; }
  const since = new Date(Date.now() - 30 * 864e5);
  const rows = sh.getRange(2, 1, last - 1, LOG_HEADERS.length).getValues()
    .filter(r => r[0] instanceof Date && r[0] >= since && r[5] === 'دخول');
  const users = {};
  rows.forEach(r => { users[r[4]] = (users[r[4]] || 0) + 1; });
  const top = Object.keys(users).sort((a, b) => users[b] - users[a]).slice(0, 10)
    .map((u, i) => (i + 1) + '. ' + u + ' — ' + users[u]).join('\n');
  ui.alert('سجل الدخول — آخر 30 يومًا — ' + APP_NAME,
    'عدد الزيارات: ' + rows.length + '\nعدد المستخدمين: ' + Object.keys(users).length + '\n\nالأكثر دخولًا:\n' + (top || '—'),
    ui.ButtonSet.OK);
}

/** Menu: delete entries older than LOG_RETENTION_DAYS. */
function purgeOldLogs() {
  const sh = getLogSheet_();
  const last = sh.getLastRow();
  let removed = 0;
  if (last > 1) {
    const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 864e5);
    const stamps = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = stamps.length - 1; i >= 0; i--) {
      if (stamps[i][0] instanceof Date && stamps[i][0] < cutoff) { sh.deleteRow(i + 2); removed++; }
    }
  }
  SpreadsheetApp.getActive().toast('حُذف ' + removed + ' سجل أقدم من ' + LOG_RETENTION_DAYS + ' يومًا.', APP_NAME_EN, 6);
}

/** Sheet menu (bound scripts). Add platform items here. */
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu(APP_NAME_EN)
      .addItem('إعداد سجل المخاطر (الأوراق + 44 خطرًا)', 'setup')
      .addItem('إعداد قائمة المصرّح لهم (AllowedUsers)', 'setupAccessList')
      .addSeparator()
      .addItem('ملخص سجل الدخول (30 يومًا)', 'showLogSummary')
      .addItem('حذف سجلات الدخول القديمة', 'purgeOldLogs')
      .addSeparator()
      .addItem('عرض رابط المنصة', 'showWebAppUrl')
      .addToUi();
  } catch (e) { /* standalone script: no sheet UI */ }
}

function showWebAppUrl() {
  const ui = SpreadsheetApp.getUi();
  ui.alert('رابط ' + APP_NAME, ScriptApp.getService().getUrl() || 'لم يُنشر بعد: Deploy ▸ New deployment ▸ Web app', ui.ButtonSet.OK);
}

/* ----------------------------- Helpers ------------------------------ */

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
function safeJson_(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/* =====================================================================
 *  RISK REGISTER — data layer
 * ===================================================================== */

const CONFIG = {
  SPREADSHEET_ID: '110jrIGTFvsEVQ8pJH0oXLtwfejDKDSLHEdT_kzF2LlY', // fallback if the script is not bound to the sheet
  TZ: 'Asia/Riyadh',
  // Roles come from AllowedUsers (role = admin) + OWNER_EMAILS:
  // admins may edit/delete any risk; users may add risks and edit/delete their own.
  SHEET_RISKS: 'Risks',
  SHEET_AUDIT: 'Audit',
  SHEET_LISTS: 'Lists'
};

// Column order of the Risks sheet (key → Arabic header)
const COLS = [
  ['id', 'الرقم'], ['date', 'تاريخ التسجيل'], ['reporter', 'مقدم البلاغ'], ['reporterEmail', 'بريد مقدم البلاغ'],
  ['receiver', 'المستلم'], ['risk', 'وصف الخطر'], ['impactDesc', 'وصف الأثر'],
  ['likelihood', 'تقييم الاحتمالية'], ['impact', 'تقييم الأثر'], ['priority', 'تقييم الأولوية'],
  ['preventive', 'الإجراءات الوقائية'], ['treatment', 'الإجراء'], ['contingency', 'إجراءات الطوارئ'],
  ['owner', 'مسؤول الإجراء'], ['status', 'الحالة'], ['reviewDate', 'تاريخ المراجعة القادمة'],
  ['createdBy', 'أُنشئ بواسطة'], ['createdAt', 'تاريخ الإنشاء'], ['updatedBy', 'آخر تعديل بواسطة'], ['updatedAt', 'تاريخ آخر تعديل']
];
const KEYS = COLS.map(c => c[0]);
const EDITABLE = ['date', 'receiver', 'risk', 'impactDesc', 'likelihood', 'impact', 'preventive', 'treatment', 'contingency', 'owner', 'status', 'reviewDate'];

const LEVELS = ['منخفض جداً', 'منخفض', 'متوسط', 'مرتفع', 'مرتفع جداً'];
// Risk Matrix sheet of the source workbook: MATRIX[likelihood][impactIndex]
const MATRIX = {
  'مرتفع جداً': ['متوسط', 'مرتفع', 'مرتفع', 'مرتفع جداً', 'مرتفع جداً'],
  'مرتفع':      ['متوسط', 'متوسط', 'مرتفع', 'مرتفع جداً', 'مرتفع جداً'],
  'متوسط':      ['متوسط', 'متوسط', 'مرتفع', 'مرتفع', 'مرتفع جداً'],
  'منخفض':      ['منخفض', 'متوسط', 'متوسط', 'مرتفع', 'مرتفع'],
  'منخفض جداً': ['منخفض جداً', 'منخفض', 'متوسط', 'مرتفع', 'مرتفع']
};
const TREATMENTS = ['التخفيف', 'القبول', 'التجنب', 'النقل'];
const STATUSES = ['مفتوح', 'قيد المعالجة', 'تحت المراقبة', 'مغلق'];

/* ───────────────────────── spreadsheet access + self-setup ───────────────────────── */

function ss_() {
  let ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
  return ss || SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

/** Creates any missing tab (and seeds the 44 risks) automatically — no need to run setup() by hand. */
/* Names removed from the register (v1.5). Reporter → blank, owner → «غير محدد». */
const REMOVED_NAMES = ['Omar Saleh', 'Nora Al-Zahrani', 'Ahmed Al-Rashidi', 'Khalid Mansour', 'Sara Al-Otaibi'];
const UNASSIGNED = 'غير محدد';

/** One-time clean-up of the live sheet (runs once per script, on the first page load after updating). */
function cleanupNames_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('cleanup_names_v15') === 'done') return;
  const ss = ss_(), bad = REMOVED_NAMES.map(n => n.toLowerCase());
  const isBad = v => bad.indexOf(String(v || '').trim().toLowerCase()) !== -1;
  let changed = 0;

  const risks = ss.getSheetByName(CONFIG.SHEET_RISKS);
  if (risks && risks.getLastRow() > 1) {
    const rng = risks.getRange(2, 1, risks.getLastRow() - 1, KEYS.length), v = rng.getValues();
    const iRep = KEYS.indexOf('reporter'), iOwn = KEYS.indexOf('owner');
    v.forEach(r => {
      if (isBad(r[iRep])) { r[iRep] = ''; changed++; }
      if (isBad(r[iOwn])) { r[iOwn] = UNASSIGNED; changed++; }
    });
    rng.setValues(v);
  }
  const lists = ss.getSheetByName(CONFIG.SHEET_LISTS);
  if (lists && lists.getLastRow() > 1) {
    const n = lists.getLastRow() - 1, v = lists.getRange(2, 1, n, 2).getValues();
    const col = i => v.map(r => r[i]).filter(x => String(x).trim() && !isBad(x));
    const a = col(0), b = col(1), m = Math.max(a.length, b.length), out = [];
    for (let i = 0; i < n; i++) out.push(i < m ? [a[i] || '', b[i] || ''] : ['', '']);
    lists.getRange(2, 1, n, 2).setValues(out);
  }
  // The kit seeds the owner row with the name "Owner" — show the real name instead.
  const acc = ss.getSheetByName(SHEET_ACCESS);
  if (acc && acc.getLastRow() > 1) {
    const rng = acc.getRange(2, 1, acc.getLastRow() - 1, 2), v = rng.getValues();
    let fixed = false;
    v.forEach(r => { if (String(r[0]).trim().toLowerCase() === 'm.elmahdy@sr.edu.sa' && String(r[1]).trim() === 'Owner') { r[1] = 'Mohamed ElMahdy'; fixed = true; } });
    if (fixed) { rng.setValues(v); CacheService.getScriptCache().removeAll(['acl_v1', 'dir_v1']); }
  }
  props.setProperty('cleanup_names_v15', 'done');
  console.log('cleanupNames_: ' + changed + ' cells cleared.');
}

function ensureSetup_() {
  try { cleanupNames_(); } catch (e) { console.error('cleanupNames_ failed: ' + e); }
  const ss = ss_();
  const need = [CONFIG.SHEET_RISKS, CONFIG.SHEET_AUDIT, CONFIG.SHEET_LISTS, SHEET_ACCESS]
    .some(n => !ss.getSheetByName(n));
  if (!need) return;
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try { setup(); } finally { lock.releaseLock(); }
}

/* ───────────────────────── setup ───────────────────────── */

function setup() {
  const ss = ss_();
  ss.setSpreadsheetTimeZone(CONFIG.TZ);

  // If the sheet was created from the seed CSV, its first tab already holds the risks.
  let risks = ss.getSheetByName(CONFIG.SHEET_RISKS);
  if (!risks) {
    const first = ss.getSheets()[0];
    if (first && String(first.getRange(1, 1).getValue()).trim() === COLS[0][1]) {
      first.setName(CONFIG.SHEET_RISKS); risks = first;
    } else {
      risks = ss.insertSheet(CONFIG.SHEET_RISKS, 0);
    }
  }
  if (risks.getLastRow() === 0) risks.appendRow(COLS.map(c => c[1]));
  if (risks.getLastRow() === 1) {
    const seed = SEED.map(r => KEYS.map(k => r[k] || ''));
    if (seed.length) risks.getRange(2, 1, seed.length, KEYS.length).setValues(seed);
  }
  risks.getRange(1, 1, risks.getMaxRows(), KEYS.length).setNumberFormat('@'); // keep dates/years as text
  styleHeader_(risks, KEYS.length);
  risks.setRightToLeft(true);

  ensureSheet_(ss, CONFIG.SHEET_AUDIT, ['التاريخ والوقت', 'المستخدم', 'العملية', 'رقم الخطر', 'التفاصيل']);
  const lists = ensureSheet_(ss, CONFIG.SHEET_LISTS, ['مسؤولو الإجراء', 'المستلمون']);
  if (lists.getLastRow() === 1) {
    const owners = uniq_(SEED.map(r => r.owner)), receivers = uniq_(SEED.map(r => r.receiver));
    const n = Math.max(owners.length, receivers.length);
    const vals = []; for (let i = 0; i < n; i++) vals.push([owners[i] || '', receivers[i] || '']);
    if (n) lists.getRange(2, 1, n, 2).setValues(vals);
  }
  if (!ss.getSheetByName(SHEET_ACCESS)) setupAccessList();
  return 'Setup complete — ' + (risks.getLastRow() - 1) + ' risks in sheet.';
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.appendRow(headers);
  styleHeader_(sh, headers.length); sh.setRightToLeft(true);
  return sh;
}
function styleHeader_(sh, n) {
  sh.getRange(1, 1, 1, n).setFontWeight('bold').setBackground('#501e8c').setFontColor('#ffffff');
  sh.setFrozenRows(1);
}
function uniq_(a) { return [...new Set(a.map(x => String(x || '').trim()).filter(Boolean))].sort(); }

/* ───────────────────────── users & roles ───────────────────────── */

function withLock_(fn) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/** AllowedUsers rows (active) → { email: {name, role} } — cached like the access list. */
function userDirectory_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('dir_v1');
  if (hit) return JSON.parse(hit);
  const dir = {};
  try {
    const sh = accessSheet_(false);
    if (sh && sh.getLastRow() > 1) {
      sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues()
        .filter(r => r[0] && r[3] !== false && String(r[3]).toUpperCase() !== 'FALSE')
        .forEach(r => { dir[String(r[0]).trim().toLowerCase()] = { name: String(r[1] || '').trim(), role: String(r[2] || '').trim().toLowerCase() }; });
    }
  } catch (e) { console.error('userDirectory_ failed: ' + e); }
  cache.put('dir_v1', JSON.stringify(dir), ACCESS_CACHE_SECONDS);
  return dir;
}

function userInfo_(email) {
  const d = userDirectory_()[email] || {};
  const owner = OWNER_EMAILS.map(x => x.toLowerCase()).indexOf(email) !== -1;
  const name = (d.name && d.name !== 'Owner' ? d.name : '') || email.split('@')[0].split(/[._-]+/).filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  return { email: email, name: name, isAdmin: owner || d.role === 'admin' };
}
function isAdmin_(email) { return userInfo_(String(email).toLowerCase()).isAdmin; }

function audit_(user, action, id, details) {
  ss_().getSheetByName(CONFIG.SHEET_AUDIT).appendRow([
    Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd HH:mm:ss'), user.email, action, id || '', details || ''
  ]);
}

/* ───────────────────────── data ───────────────────────── */

function sheet_() { return ss_().getSheetByName(CONFIG.SHEET_RISKS); }

function readRisks_() {
  const sh = sheet_(), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, KEYS.length).getDisplayValues()
    .filter(r => String(r[0]).trim())
    .map(r => { const o = {}; KEYS.forEach((k, i) => o[k] = r[i]); return o; });
}
function readLists_() {
  const sh = ss_().getSheetByName(CONFIG.SHEET_LISTS);
  if (!sh || sh.getLastRow() < 2) return { owners: [], receivers: [] };
  const v = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getDisplayValues();
  return { owners: uniq_(v.map(r => r[0])), receivers: uniq_(v.map(r => r[1])) };
}

function clean_(risk) {
  const o = {};
  EDITABLE.forEach(k => { o[k] = String(risk[k] == null ? '' : risk[k]).trim().slice(0, 3000); });
  if (!o.risk) throw new Error('وصف الخطر مطلوب');
  if (LEVELS.indexOf(o.likelihood) < 0) throw new Error('قيمة الاحتمالية غير صحيحة');
  if (LEVELS.indexOf(o.impact) < 0) throw new Error('قيمة الأثر غير صحيحة');
  if (TREATMENTS.indexOf(o.treatment) < 0) o.treatment = 'التخفيف';
  if (STATUSES.indexOf(o.status) < 0) o.status = 'مفتوح';
  if (!o.owner) throw new Error('مسؤول الإجراء مطلوب');
  o.priority = MATRIX[o.likelihood][LEVELS.indexOf(o.impact)]; // always computed on the server
  return o;
}

function nextId_(rows) {
  let max = 0;
  rows.forEach(r => { const m = /^RR-(\d+)$/.exec(r.id); if (m) max = Math.max(max, Number(m[1])); });
  return 'RR-' + String(max + 1).padStart(3, '0');
}

function addRisk_(risk, user) {
  const o = clean_(risk), now = Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd HH:mm');
  o.id = nextId_(readRisks_());
  o.date = o.date || Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd');
  o.reporter = user.name; o.reporterEmail = user.email;   // identity comes from the verified token only
  o.createdBy = user.email; o.createdAt = now; o.updatedBy = ''; o.updatedAt = '';
  sheet_().appendRow(KEYS.map(k => o[k] || ''));
  audit_(user, 'إضافة', o.id, o.risk.slice(0, 120));
  return { ok: true, risk: o };
}

function findRow_(id) {
  const sh = sheet_(), n = sh.getLastRow() - 1;
  if (n < 1) return -1;
  const ids = sh.getRange(2, 1, n, 1).getDisplayValues().map(r => r[0]);
  const i = ids.indexOf(String(id)); return i < 0 ? -1 : i + 2;
}
function canEdit_(row, user) {
  return isAdmin_(user.email) || String(row.createdBy).toLowerCase() === user.email;
}

function updateRisk_(id, risk, user) {
  const rowNo = findRow_(id); if (rowNo < 0) throw new Error('الخطر غير موجود');
  const sh = sheet_(), vals = sh.getRange(rowNo, 1, 1, KEYS.length).getDisplayValues()[0];
  const cur = {}; KEYS.forEach((k, i) => cur[k] = vals[i]);
  if (!canEdit_(cur, user)) throw new Error('لا تملك صلاحية تعديل هذا الخطر');
  const o = clean_(risk), changed = [];
  EDITABLE.concat(['priority']).forEach(k => { if (String(cur[k]) !== String(o[k])) { changed.push(k); cur[k] = o[k]; } });
  cur.updatedBy = user.email; cur.updatedAt = Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd HH:mm');
  sh.getRange(rowNo, 1, 1, KEYS.length).setValues([KEYS.map(k => cur[k] || '')]);
  audit_(user, 'تعديل', id, changed.join(', '));
  return { ok: true, risk: cur };
}

function deleteRisk_(id, user) {
  const rowNo = findRow_(id); if (rowNo < 0) throw new Error('الخطر غير موجود');
  const sh = sheet_(), vals = sh.getRange(rowNo, 1, 1, KEYS.length).getDisplayValues()[0];
  const cur = {}; KEYS.forEach((k, i) => cur[k] = vals[i]);
  if (!canEdit_(cur, user)) throw new Error('لا تملك صلاحية حذف هذا الخطر');
  sh.deleteRow(rowNo);
  audit_(user, 'حذف', id, String(cur.risk).slice(0, 120));
  return { ok: true };
}

/* ─────────── Seed: 44 risks imported from Risk_Register_Arabic_2026_Updated_1.xlsx ─────────── */
const SEED = [
 {
  "id": "RR-001",
  "date": "2023-01-01",
  "reporter": "M Hasnnen",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "فقدان البيانات بسبب الخطأ البشري",
  "impactDesc": "تعذر على المستخدم إكمال عمله",
  "likelihood": "متوسط",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "تدريب المستخدمين بشكل دوري لتقليل الأخطاء",
  "treatment": "التخفيف",
  "contingency": "استعادة النسخة الاحتياطية / النسخة الظلية",
  "owner": "M Hasnnen",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-002",
  "date": "2023",
  "reporter": "M Hasnnen",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "تعطل نظام مكتب الخدمة",
  "impactDesc": "لا يستطيع المستخدمون تسجيل أو الإبلاغ عن المشكلات مما يؤدي إلى تأخير المعالجة",
  "likelihood": "منخفض",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "الحفاظ على نظام دعم احتياطي وتدريب الموظفين",
  "treatment": "التخفيف",
  "contingency": "استقبال الطلبات عبر الهاتف",
  "owner": "M Hasnnen",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-003",
  "date": "2023",
  "reporter": "M Hasnnen",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "تعطل طابعة متعددة الوظائف",
  "impactDesc": "تأخر عمليات الطباعة الحرجة مما يؤثر على الكفاءة الإدارية",
  "likelihood": "منخفض",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "اتفاقية صيانة: زيارتان سنوياً",
  "treatment": "التخفيف",
  "contingency": "استخدام طابعة أخرى حتى الإصلاح",
  "owner": "M Hasnnen",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-004",
  "date": "2023",
  "reporter": "M Hasnnen",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "تعطل جهاز العرض والحاجة إلى استبداله",
  "impactDesc": "انقطاع المحاضرات أو العروض مما يؤثر على مخرجات التعلم",
  "likelihood": "منخفض",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "الصيانة الدورية لأجهزة العرض وتوفير أجهزة احتياطية",
  "treatment": "التخفيف",
  "contingency": "الصيانة أو الاستبدال بجهاز احتياطي",
  "owner": "M Hasnnen",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-005",
  "date": "2023",
  "reporter": "M Hasnnen",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "تعطل الميكروفون.",
  "impactDesc": "انقطاع الصوت في الأحداث أو الفصول الدراسية، مما يؤدي إلى عدم فعالية الاتصال",
  "likelihood": "منخفض",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "تأكد من توفر الميكروفونات الاحتياطية وفحصها",
  "treatment": "التخفيف",
  "contingency": "صيانة الميكروفون أو تغييره من أجهزة النسخ الاحتياطي",
  "owner": "M Hasnnen",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-006",
  "date": "2023",
  "reporter": "M Hasnnen",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "تعذر الوصول إلى خادم الملفات.",
  "impactDesc": "عدم تمكن المستخدمين من الوصول إلى الملفات، مما يؤدي إلى توقف الأعمال وانخفاض الإنتاجية.",
  "likelihood": "منخفض",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "توفير بنية احتياطية قوية لخادم الملفات وإنشاء لقطات (Snapshots) دورية للآلات الافتراضية.",
  "treatment": "التخفيف",
  "contingency": "التحقق من حالة الآلة الافتراضية (VM) الخاصة بخادم الملفات واستعادتها من النسخة الاحتياطية عند الحاجة.",
  "owner": "M Hasnnen",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-007",
  "date": "2023",
  "reporter": "M Hasnnen",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "تعطل وحدة التحكم بالمجال (Domain Controller) الخاصة بالموظفين.",
  "impactDesc": "عدم تمكن الموظفين من الوصول إلى الموارد، مما يؤثر على سير العمليات الإدارية.",
  "likelihood": "منخفض",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "إجراء اختبارات دورية ونسخ احتياطية منتظمة لوحدات التحكم بالمجال الخاصة بالموظفين (Domain Controllers).",
  "treatment": "التخفيف",
  "contingency": "التحقق من حالة الآلة الافتراضية الخاصة بوحدة التحكم بالمجال (Domain Controller) واستعادتها من النسخة الاحتياطية عند الحاجة.",
  "owner": "M Hasnnen",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-008",
  "date": "2023",
  "reporter": "M Hasnnen",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "تعطل وحدة التحكم بالمجال (Domain Controller) الخاصة بالطلاب.",
  "impactDesc": "عدم تمكن الطلاب من الوصول إلى الموارد، مما يؤثر على العملية التعليمية والواجبات الدراسية.",
  "likelihood": "منخفض",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "إجراء اختبارات دورية ونسخ احتياطية منتظمة لوحدات التحكم بالمجال الخاصة بالطلاب.",
  "treatment": "التخفيف",
  "contingency": "التحقق من حالة الآلة الافتراضية الخاصة بوحدة التحكم بالمجال (Domain Controller) واستعادتها من النسخة الاحتياطية عند الحاجة.",
  "owner": "M Hasnnen",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-009",
  "date": "2023",
  "reporter": "M Hasnnen",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "تعذر الوصول إلى خادم vCenter.",
  "impactDesc": "عدم توفر أدوات إدارة الأنظمة، مما يؤدي إلى تأخير معالجة المشكلات وحلها.",
  "likelihood": "منخفض",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "مراقبة خادم vCenter ومراجعته بشكل دوري للكشف المبكر عن المشكلات.",
  "treatment": "التخفيف",
  "contingency": "التحقق من حالة vCenter من خلال المضيف (Host)، واستعادته من النسخة الاحتياطية عند الحاجة.",
  "owner": "M Hasnnen",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-010",
  "date": "2023",
  "reporter": "M Hasnnen",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "تلف الخادم.",
  "impactDesc": "تعطل الخدمات الحيوية، مما يؤثر على العديد من العمليات التشغيلية.",
  "likelihood": "منخفض",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "تنفيذ فحوصات دورية لصحة الأنظمة وتطبيق سياسات فعالة للنسخ الاحتياطي للبيانات.",
  "treatment": "التخفيف",
  "contingency": "استعادة النظام أو البيانات من خادم النسخ الاحتياطي.",
  "owner": "M Hasnnen",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-011",
  "date": "2024",
  "reporter": "M Hasnnen",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "حذف آلة افتراضية (Virtual Machine).",
  "impactDesc": "فقدان بيانات مهمة، مما يستلزم عمليات استعادة تستغرق وقتًا وجهدًا كبيرين.",
  "likelihood": "منخفض",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "إجراء نسخ احتياطية منتظمة مع اختبار عمليات استعادة البيانات بشكل دوري.",
  "treatment": "التخفيف",
  "contingency": "استعادة النظام أو البيانات من خادم النسخ الاحتياطي.",
  "owner": "M Hasnnen",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-012",
  "date": "2024",
  "reporter": "M Hasnnen",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "توقف أو إيقاف مضيف ESXi.",
  "impactDesc": "تعطل الأنظمة، مما يؤدي إلى توقف العمليات إلى حين معالجة المشكلة.",
  "likelihood": "منخفض",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "تهيئة بيئة عالية التوافر (High Availability) لمضيفي ESXi لضمان استمرارية الخدمة.",
  "treatment": "التخفيف",
  "contingency": "الاعتماد على بيئة التوافر العالي (High Availability) إلى حين إعادة تهيئة مضيفات ESXi.",
  "owner": "M Hasnnen",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-013",
  "date": "2024",
  "reporter": "M Hasnnen",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "حذف ملفات من المجلدات المشتركة.",
  "impactDesc": "فقدان البيانات المشتركة، مما يؤدي إلى تأخير إنجاز المشاريع والمهام.",
  "likelihood": "منخفض",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "توعية الموظفين بسياسات حفظ الملفات وآليات النسخ الاحتياطي التلقائي.",
  "treatment": "التخفيف",
  "contingency": "استعادة البيانات أو النظام من النسخة الاحتياطية.",
  "owner": "M Hasnnen",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-014",
  "date": "2024",
  "reporter": "M Hasnnen",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "توقف نظام النسخ الاحتياطي Veeam عن العمل.",
  "impactDesc": "توقف عمليات النسخ الاحتياطي، مما يعرض سلامة البيانات وعمليات الاستعادة للخطر.",
  "likelihood": "منخفض",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "إجراء صيانة واختبارات دورية لأنظمة النسخ الاحتياطي لضمان جاهزيتها.",
  "treatment": "التخفيف",
  "contingency": "إعادة تهيئة النظام بأسرع وقت ممكن.",
  "owner": "M Hasnnen",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-015",
  "date": "2024",
  "reporter": "M Hasnnen",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "تعذر الوصول إلى خدمات AWS.",
  "impactDesc": "تعطل الخدمات السحابية، مما يؤثر على التطبيقات المستضافة واستمرارية التشغيل.",
  "likelihood": "منخفض",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "توفير مسارات اتصال بديلة لضمان استمرارية الخدمة عند حدوث الأعطال.",
  "treatment": "التخفيف",
  "contingency": "التواصل الفوري مع الشريك التقني لمعالجة المشكلة.",
  "owner": "M Hasnnen",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-016",
  "date": "2023",
  "reporter": "OMER AHMED",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "فشل وصلة الربط بين FAC و SAC أو فشل التحويل التلقائي للمسار.",
  "impactDesc": "تعذر الوصول إلى موارد سكن الطلاب (SAC) وسكن الطالبات (FAC).",
  "likelihood": "منخفض",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "تطبيق أدوات لمراقبة حالة الوصلات والتنبيه عند حدوث أي انقطاع أو خلل.",
  "treatment": "التخفيف",
  "contingency": "التواصل مع فريق الشبكات لمعالجة المشكلة واستعادة الخدمة.",
  "owner": "Mahdy",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-017",
  "date": "2023",
  "reporter": "OMER AHMED",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "وصول جدار الحماية Cisco ASA إلى نهاية دورة الدعم (EOL).",
  "impactDesc": "توقف خدمات الجامعة (SRU).",
  "likelihood": "منخفض",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "إعداد خطة لاستبدال جدران الحماية التي اقتربت من نهاية دورة الدعم (EOL).",
  "treatment": "التخفيف",
  "contingency": "ترقية جدار الحماية أو استبداله بجهاز أحدث.",
  "owner": "Mahdy",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-018",
  "date": "2023",
  "reporter": "OMER AHMED",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "إصابة وسائط التخزين USB ببرمجيات خبيثة.",
  "impactDesc": "قد تتعرض شبكة الجامعة للإصابة بالبرمجيات الخبيثة أو الفيروسات.",
  "likelihood": "مرتفع",
  "impact": "مرتفع",
  "priority": "مرتفع جداً",
  "preventive": "تقييد استخدام وحدات تخزين USB وتثبيت برامج مكافحة الفيروسات على جميع الأجهزة.",
  "treatment": "التخفيف",
  "contingency": "تشغيل برنامج مكافحة الفيروسات وعزل الأجهزة المتأثرة لمنع انتشار الإصابة.",
  "owner": "Mahdy",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-019",
  "date": "2023",
  "reporter": "OMER AHMED",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "تسرب البيانات.",
  "impactDesc": "تسرب أو اختراق البيانات السرية.",
  "likelihood": "مرتفع",
  "impact": "مرتفع",
  "priority": "مرتفع جداً",
  "preventive": "تدريب الموظفين على التعرف على هجمات التصيد الاحتيالي واتباع أساليب آمنة لنقل الملفات.",
  "treatment": "التخفيف",
  "contingency": "إبلاغ الجهات المعنية واتخاذ الإجراءات اللازمة لتأمين الأنظمة.",
  "owner": "Mahdy",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-020",
  "date": "2023",
  "reporter": "OMER AHMED",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "عدم تنظيف أو تفقد غرف الخوادم بشكل دوري.",
  "impactDesc": "التأثير على أداء معدات الشبكة.",
  "likelihood": "متوسط",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "إجراء عمليات تفتيش وصيانة دورية لغرف الخوادم.",
  "treatment": "التخفيف",
  "contingency": "تنظيف وتنظيم غرف الخوادم فورًا لضمان بيئة تشغيل آمنة.",
  "owner": "Mahdy",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-021",
  "date": "2023",
  "reporter": "OMER AHMED",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "نقص عدد موظفي تقنية المعلومات.",
  "impactDesc": "عدم القدرة على دعم رسالة المؤسسة، وعدم القدرة على تشغيل أو استعادة الأنظمة والبيانات اللازمة لدعم الأعمال والأنشطة الأكاديمية.",
  "likelihood": "مرتفع",
  "impact": "مرتفع",
  "priority": "مرتفع جداً",
  "preventive": "تعزيز كوادر تقنية المعلومات من خلال استقطاب وتوظيف موظفين جدد.",
  "treatment": "التخفيف",
  "contingency": "تخصيص موارد دعم مؤقتة لضمان استمرارية العمل حتى معالجة المشكلة.",
  "owner": "Mahdy",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-022",
  "date": "2024",
  "reporter": "Mahdy",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "المعلومات المنشورة على المواقع العامة غير محدثة.",
  "impactDesc": "",
  "likelihood": "متوسط",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "تنفيذ مراجعات دورية للمحتوى للتأكد من حداثته ودقته.",
  "treatment": "التخفيف",
  "contingency": "تحديث المحتوى ومراجعته بشكل دوري لضمان دقته وحداثته.",
  "owner": "Mahdy",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-023",
  "date": "",
  "reporter": "OMER AHMED",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "أعطال في الأجهزة أو البرمجيات.",
  "impactDesc": "تعطل العمليات التشغيلية (مثل وظائف الموارد البشرية)، وعدم القدرة على تحقيق أهداف ورسالة المؤسسة.",
  "likelihood": "منخفض",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "تطبيق خطة صيانة وقائية مجدولة لتقليل احتمالية الأعطال.",
  "treatment": "التخفيف",
  "contingency": "إصلاح أو استبدال الأجهزة أو البرمجيات حسب الحاجة.",
  "owner": "Mahdy",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-024",
  "date": "2024",
  "reporter": "Atef Elnadi",
  "reporterEmail": "",
  "receiver": "Nawaz",
  "risk": "قد يؤدي تعطل موازن الأحمال A10 إلى انقطاع الخدمات أو اضطرابها.",
  "impactDesc": "قد يؤدي تعطل موازن الأحمال (Load Balancer) إلى انقطاع خدمة الإنترنت، مما يؤثر مباشرةً على وصول المستخدمين وكفاءة التشغيل.",
  "likelihood": "مرتفع",
  "impact": "مرتفع",
  "priority": "مرتفع جداً",
  "preventive": "إضافة جهاز Load Balancer آخر وتطبيق إعدادات التوافر العالي (HA) على موازن الأحمال A10 لضمان استمرارية الخدمة.",
  "treatment": "التخفيف",
  "contingency": "توفير موازن أحمال احتياطي ووضع خطة للتحويل التلقائي (Failover) لضمان استمرارية الخدمة.",
  "owner": "Nawaz",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-025",
  "date": "2024",
  "reporter": "Atef Elnadi",
  "reporterEmail": "",
  "receiver": "Nawaz",
  "risk": "وصل متحكم الشبكة اللاسلكية AIR-CT8510-K9 إلى نهاية فترة الدعم (EoS) في عام 2023، مما يعني عدم توفر أي دعم فني أو تحديثات برمجية أو تصحيحات أمنية من الشركة المصنعة.",
  "impactDesc": "قد يؤدي أي عطل مادي في جهاز AIR-CT8510-K9 أو في وحدة تزويد الطاقة الخاصة به إلى فقدان كامل لخدمات الشبكة اللاسلكية. كما أن انتهاء دعم الجهاز يعني عدم إمكانية إصلاحه عبر القنوات الرسمية، مما يزيد من مدة الانقطاع وصعوبة الاستعادة.",
  "likelihood": "مرتفع",
  "impact": "مرتفع",
  "priority": "مرتفع جداً",
  "preventive": "وضع خطة لاستبدال جهاز AIR-CT8510-K9 فورًا بطراز أحدث لا يزال مدعومًا من الشركة المصنعة.",
  "treatment": "التخفيف",
  "contingency": "تطبيق إجراءات أمنية إضافية وتعزيز المراقبة للحد من المخاطر إلى حين الانتهاء من عملية الترقية.",
  "owner": "Nawaz",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-026",
  "date": "2025",
  "reporter": "Nawaz",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "هجمات البرمجيات الخبيثة.",
  "impactDesc": "قد تتعرض شبكة الجامعة للإصابة بالبرمجيات الخبيثة أو الفيروسات.",
  "likelihood": "مرتفع",
  "impact": "مرتفع",
  "priority": "مرتفع جداً",
  "preventive": "رفع مستوى وعي المستخدمين وتطبيق سياسات جدار الحماية لمنع هجمات البرمجيات الخبيثة.",
  "treatment": "التخفيف",
  "contingency": "عزل الخادم عن الشبكة وإزالة البرمجيات الخبيثة منه قبل إعادته للخدمة.",
  "owner": "Nawaz",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-027",
  "date": "2025",
  "reporter": "Nawaz",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "هجمات التصيد الاحتيالي.",
  "impactDesc": "رسائل أو بريد إلكتروني احتيالي يهدف إلى سرقة بيانات الدخول أو المعلومات الحساسة.",
  "likelihood": "منخفض",
  "impact": "متوسط",
  "priority": "مرتفع",
  "preventive": "رفع مستوى وعي المستخدمين وتطبيق سياسات جدار الحماية للحد من هجمات التصيد الاحتيالي.",
  "treatment": "التخفيف",
  "contingency": "حظر عنوان البريد الإلكتروني للمرسل، وعزل الجهاز المصاب، وإزالة البرمجيات الخبيثة منه.",
  "owner": "Nawaz",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-028",
  "date": "2025",
  "reporter": "Nawaz",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "هجمات استغلال موارد الأجهزة في تعدين العملات المشفرة.",
  "impactDesc": "استخدام غير مصرح به لموارد النظام في تعدين العملات المشفرة.",
  "likelihood": "منخفض",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "رفع مستوى وعي المستخدمين وتطبيق سياسات جدار الحماية لمنع هجمات استغلال الموارد في تعدين العملات المشفرة.",
  "treatment": "التخفيف",
  "contingency": "عزل حساب أو جهاز المستخدم مؤقتًا، وإبلاغه بضرورة تنظيف جهازه قبل إعادة الاتصال بالشبكة.",
  "owner": "Nawaz",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-029",
  "date": "2025",
  "reporter": "Nawaz",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "أجهزة منتهية الدعم (EOL).",
  "impactDesc": "تشكل الأجهزة منتهية الدعم (EOL) مخاطر كبيرة على أمن الشبكات والأنظمة بسبب توقف دعم الشركة المصنعة لها.",
  "likelihood": "متوسط",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "تنفيذ الصيانة الوقائية، ومراقبة الأداء، وتحسين استخدام الموارد بشكل مستمر.",
  "treatment": "التخفيف",
  "contingency": "استبدال الأجهزة منتهية الدعم (EOL) بأجهزة مدعومة وحديثة.",
  "owner": "Nawaz",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-030",
  "date": "2025",
  "reporter": "Nawaz",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "خوادم فعلية منتهية الدعم (EOL).",
  "impactDesc": "تشكل الأجهزة منتهية الدعم (EOL) مخاطر كبيرة على أمن الشبكات والأنظمة بسبب توقف دعم الشركة المصنعة، كما قد لا تكون متوافقة مع البرمجيات أو الأجهزة أو بروتوكولات الاتصال الحديثة.",
  "likelihood": "منخفض",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "تنفيذ الصيانة الوقائية ومراقبة الأداء بشكل دوري.",
  "treatment": "التخفيف",
  "contingency": "استبدال الأجهزة أو ترحيل الخدمات إلى بيئة الحوسبة السحابية.",
  "owner": "Nawaz",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-031",
  "date": "2025",
  "reporter": "Atef Elnadi",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "قد تؤدي الأعطال المادية في جهازي FortiGate Firewall المثبتين بين شبكة الجامعة وشبكتي سكن الطلاب والطالبات إلى مشكلات أمنية أو فقدان مؤقت للاتصال بالشبكة.",
  "impactDesc": "1. قد يؤدي أي عطل مادي في جدران الحماية إلى فقدان كامل للحماية الأمنية لشبكتي سكن الطلاب وسكن الطالبات. 2. انقطاع خدمة الإنترنت عن الطلاب، مما يؤثر على الأنشطة الأكاديمية والإدارية. 3. زيادة احتمالية التعرض للوصول غير المصرح به والهجمات الأمنية.",
  "likelihood": "متوسط",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "1. تنفيذ جدول صيانة دوري لجدران الحماية يشمل فحص المكونات المادية وتحديث البرامج الثابتة (Firmware). 2. تطبيق حلول التكرار (Failover Firewall) لضمان استمرارية الخدمة في حال تعطل أحد جدران الحماية.",
  "treatment": "التخفيف",
  "contingency": "وضع إجراءات واضحة للتحويل السريع إلى الأنظمة الاحتياطية أو تطبيق تدابير أمنية بديلة لحماية الشبكة أثناء فترة التوقف.",
  "owner": "Nawaz",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-032",
  "date": "2025",
  "reporter": "Nayeyedh",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "تعطل بعض كاميرات المراقبة في مباني SAC وFAC.",
  "impactDesc": "قد يؤدي تعطل أو فقدان كاميرا التسجيل إلى التأثير على كفاءة نظام المراقبة.",
  "likelihood": "متوسط",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "تنفيذ الصيانة الوقائية والاستمرار في المراقبة المستمرة للأداء والحالة التشغيلية.",
  "treatment": "التخفيف",
  "contingency": "التوجه فورًا إلى موقع المشكلة وإصلاحها.",
  "owner": "Nayead",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-033",
  "date": "2025",
  "reporter": "Nayeyedh",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "تعطل أو توقف نظام تكييف مركز البيانات أو غرفة الخوادم.",
  "impactDesc": "توقف تشغيل مركز البيانات بالكامل.",
  "likelihood": "منخفض",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "إبرام عقد صيانة يتضمن اتفاقية مستوى الخدمة (SLA) لضمان تنفيذ أعمال الصيانة الدورية.",
  "treatment": "التخفيف",
  "contingency": "التواصل مع الجهة المختصة لاتخاذ الإجراء اللازم بشكل عاجل.",
  "owner": "Nawaz",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-034",
  "date": "2025",
  "reporter": "Ammar",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "تغيير استضافة خوادم نظام SIS المستضاف على Oracle Cloud، والذي يتم تجديد اشتراكه سنويًا بقيمة 180,000 ريال سعودي.",
  "impactDesc": "تغيير استضافة خوادم نظام SIS قد يؤدي إلى مخاطر تؤثر على توافر النظام واستمرارية الاتصال به.",
  "likelihood": "مرتفع",
  "impact": "مرتفع",
  "priority": "مرتفع جداً",
  "preventive": "تقييم واتخاذ قرار مبكر بشأن تجديد عقد Oracle أو عدم تجديده قبل موعد الانتهاء بشهر واحد (15/04/2025).",
  "treatment": "التخفيف",
  "contingency": "التواصل المبكر مع الشريك التقني (ATS) لتسريع عملية الدعم والمعالجة.",
  "owner": "Ammar",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-035",
  "date": "2026",
  "reporter": "Ammar",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "تأخر أو تعثر تنفيذ مشروع Oracle Fusion ERP نتيجة النزاع القائم مع شركة Sama Systems.",
  "impactDesc": "تعطل استمرارية العمليات الأكاديمية والمالية والإدارية المعتمدة على النظام، وتحمل الجامعة تكاليف إضافية للتقاضي والتحول إلى شريك تنفيذ بديل.",
  "likelihood": "مرتفع",
  "impact": "مرتفع جداً",
  "priority": "مرتفع جداً",
  "preventive": "إشراك الإدارة القانونية مبكرًا، وتوثيق تقرير الفحص الفني (Health Check) الصادر عن Oracle، والتفاوض عبر منصة تراضي قبل التصعيد للقضاء التجاري.",
  "treatment": "التخفيف",
  "contingency": "تفعيل خطة بديلة لاستمرارية تشغيل النظام الحالي وتقييم شركاء تنفيذ (SI) بديلين معتمدين من Oracle.",
  "owner": "Ammar",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-036",
  "date": "2026",
  "reporter": "",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "عدم امتثال اتفاقيات مشاركة البيانات مع جهات خارجية (مثل البنك السعودي للتنمية) لمتطلبات نظام حماية البيانات الشخصية (PDPL).",
  "impactDesc": "فرض غرامات نظامية من الهيئة السعودية لبيانات والذكاء الاصطناعي (SDAIA)، والإضرار بسمعة الجامعة وثقة الشركاء.",
  "likelihood": "متوسط",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "مراجعة دورية لجميع اتفاقيات مشاركة البيانات ومستوى الخدمة (SLA) في ضوء PDPL وNDMO وNCA ECC، وتحديث بند حوكمة البيانات في العقود الجديدة.",
  "treatment": "التخفيف",
  "contingency": "تعليق مشاركة البيانات مع الجهة المخالفة فورًا وإبلاغ SDAIA خلال المهلة النظامية عند وقوع خرق.",
  "owner": "غير محدد",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-037",
  "date": "2026",
  "reporter": "",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "هجوم فدية (Ransomware) يستهدف الأنظمة والخدمات السحابية المستضاف عليها بيانات الطلاب والموظفين.",
  "impactDesc": "تشفير أو فقدان البيانات الأكاديمية والإدارية الحرجة، وتوقف الخدمات الرقمية للطلاب لفترة قد تمتد لأيام.",
  "likelihood": "متوسط",
  "impact": "مرتفع جداً",
  "priority": "مرتفع جداً",
  "preventive": "تطبيق حل EDR/XDR على جميع الأجهزة، وتجزئة الشبكة (Network Segmentation)، واختبار استعادة النسخ الاحتياطية بشكل ربع سنوي وفق إطار NCA ECC.",
  "treatment": "التخفيف",
  "contingency": "عزل الأنظمة المصابة فورًا، وتفعيل خطة استمرارية الأعمال (BCP) والاستعادة من نسخ احتياطية غير متصلة بالشبكة (Air-gapped).",
  "owner": "غير محدد",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-038",
  "date": "2026",
  "reporter": "",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "أخطاء في إعدادات الأمان (Misconfiguration) أثناء مرحلة ترحيل الأنظمة إلى البيئة السحابية.",
  "impactDesc": "انكشاف بيانات حساسة أو خدمات للوصول غير المصرح به، وتوقف غير مخطط له للخدمات أثناء الترحيل.",
  "likelihood": "متوسط",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "اعتماد قائمة تحقق أمنية (Security Baseline Checklist) لكل مرحلة ترحيل، ومراجعة مستقلة للإعدادات قبل التفعيل النهائي (Go-Live).",
  "treatment": "التخفيف",
  "contingency": "التراجع الفوري (Rollback) إلى البيئة السابقة وإغلاق أي منفذ أو خدمة مكشوفة عن طريق الخطأ.",
  "owner": "غير محدد",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-039",
  "date": "2026",
  "reporter": "",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "اختراق حسابات المستخدمين نتيجة ضعف أو غياب المصادقة متعددة العوامل (MFA) على بعض الأنظمة الحرجة.",
  "impactDesc": "وصول غير مصرح به لأنظمة أكاديمية أو مالية حساسة، واحتمال انتحال هوية مستخدمين شرعيين.",
  "likelihood": "متوسط",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "فرض تفعيل MFA على جميع الحسابات الإدارية والحرجة، ومراجعة سياسات كلمات المرور بشكل دوري.",
  "treatment": "التخفيف",
  "contingency": "تعطيل الحساب المخترق فوراً، وإعادة تعيين بيانات الاعتماد، ومراجعة سجلات الدخول (Audit Logs) لتحديد نطاق الاختراق.",
  "owner": "غير محدد",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-040",
  "date": "2026",
  "reporter": "",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "استخدام غير مصرح به أو غير خاضع للرقابة لأدوات الذكاء الاصطناعي التوليدي (Shadow AI) من قبل الموظفين والطلاب.",
  "impactDesc": "تسرّب بيانات مؤسسية أو أكاديمية حساسة إلى منصات خارجية، ومخاطر امتثال متعلقة بحقوق الملكية الفكرية وPDPL.",
  "likelihood": "مرتفع",
  "impact": "متوسط",
  "priority": "مرتفع",
  "preventive": "إصدار سياسة استخدام مقبول للذكاء الاصطناعي، وتوعية الموظفين والطلاب، وتوفير أدوات ذكاء اصطناعي معتمدة ومؤمنة داخليًا.",
  "treatment": "التخفيف",
  "contingency": "حظر الوصول إلى الأدوات غير المعتمدة عبر جدار الحماية، والتحقيق في أي حادثة تسرّب بيانات مبلغ عنها.",
  "owner": "غير محدد",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-041",
  "date": "2026",
  "reporter": "",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "ضغط غير متوقع على البنية التحتية للشبكة (Wi-Fi والنطاق الترددي) نتيجة التوسع في رقمنة خدمات الطلاب.",
  "impactDesc": "بطء أو انقطاع الوصول إلى الخدمات الرقمية للطلاب خلال فترات الذروة (التسجيل، الاختبارات الإلكترونية).",
  "likelihood": "متوسط",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "دراسة سعة الشبكة دوريًا، وتوسيع النطاق الترددي وتحديث نقاط الوصول اللاسلكي قبل بدء كل فصل دراسي.",
  "treatment": "التخفيف",
  "contingency": "إعادة توجيه الأحمال الحرجة وتفعيل نطاق ترددي احتياطي، وتمديد فترات إتاحة الخدمات المتأثرة للطلاب.",
  "owner": "غير محدد",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-042",
  "date": "2026",
  "reporter": "M Hasnnen",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "فقدان الخبرات والمعرفة التقنية (Key-Person Risk) نتيجة دوران الموظفين في فريق تقنية المعلومات دون توثيق كافٍ للإجراءات.",
  "impactDesc": "تأخر الاستجابة للأعطال وتراجع جودة الدعم الفني، وصعوبة نقل المهام لموظفين جدد.",
  "likelihood": "متوسط",
  "impact": "متوسط",
  "priority": "متوسط",
  "preventive": "توثيق كل الإجراءات التشغيلية القياسية (SOPs) لكل نظام حرج، وتطبيق برنامج تدريب متبادل (Cross-training) بين أعضاء الفريق.",
  "treatment": "التخفيف",
  "contingency": "الاستعانة بدعم فني خارجي مؤقت من الشريك التقني (ATS) لحين استقرار الفريق.",
  "owner": "M Hasnnen",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-043",
  "date": "2026",
  "reporter": "",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "عدم اكتمال أدلة الامتثال التقني المطلوبة لإعادة الاعتماد المؤسسي (NCAAA) في الموعد المحدد ضمن المعيار 6.2.",
  "impactDesc": "تأخر عملية إعادة الاعتماد المؤسسي أو تسجيل ملاحظات من هيئة تقويم التعليم والتدريب على جاهزية الأدلة التقنية.",
  "likelihood": "منخفض",
  "impact": "مرتفع",
  "priority": "مرتفع",
  "preventive": "إعداد سجل فجوات (Gap Register) وخطة زمنية لتجهيز كل عنصر من عناصر الأدلة العشرة قبل موعد التقديم بشهرين على الأقل.",
  "treatment": "التخفيف",
  "contingency": "تشكيل فريق عمل مؤقت لتسريع تجميع الأدلة الناقصة بالتنسيق مع عمادة الجودة.",
  "owner": "غير محدد",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 },
 {
  "id": "RR-044",
  "date": "2026",
  "reporter": "Nawaz",
  "reporterEmail": "",
  "receiver": "Mahdy",
  "risk": "تعطل خدمات الحوسبة السحابية لدى مزود الخدمة الخارجي (Cloud Service Outage) المستضيف لأنظمة الجامعة الحرجة.",
  "impactDesc": "توقف الوصول إلى الأنظمة الأكاديمية والإدارية المستضافة سحابيًا لفترة تعتمد على مدة انقطاع خدمة المزود.",
  "likelihood": "منخفض",
  "impact": "مرتفع جداً",
  "priority": "مرتفع",
  "preventive": "مراجعة اتفاقية مستوى الخدمة (SLA) مع مزود الخدمة السحابية، واعتماد بنية متعددة المناطق (Multi-Region) للأنظمة الحرجة قدر الإمكان.",
  "treatment": "التخفيف",
  "contingency": "التفعيل الفوري لخطة التعافي من الكوارث (DRP) والتواصل مع الدعم الفني للمزود وفق مستوى الأولوية التعاقدي.",
  "owner": "Nawaz",
  "status": "مفتوح",
  "reviewDate": "",
  "createdBy": "import:Risk_Register_Arabic_2026",
  "createdAt": "2026-10-18 00:00",
  "updatedBy": "",
  "updatedAt": ""
 }
];
