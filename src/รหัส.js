function doGet(e) {
  initializeSheets();
  if (e.parameter && e.parameter.view === 'calendar') {
    var vcTemplate = HtmlService.createTemplateFromFile('ViewCalendar');
    vcTemplate.gid = e.parameter.gid || '';
    return vcTemplate.evaluate()
      .setTitle('ปฏิทินภารกิจ - Remind Me')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  if (e.parameter && e.parameter.editFinanceId) {
    var t = HtmlService.createTemplateFromFile('EditFinanceFromLine');
    t.editFinanceId = e.parameter.editFinanceId || '';
    return t.evaluate()
      .setTitle('แก้ไขรายการ - Remind Me')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  if (e.parameter && e.parameter.editTaskId) {
    var taskT = HtmlService.createTemplateFromFile('EditTaskFromLine');
    taskT.editTaskId = e.parameter.editTaskId || '';
    return taskT.evaluate()
      .setTitle('แก้ไขภารกิจ - Remind Me')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  var indexTemplate = HtmlService.createTemplateFromFile('index');
  indexTemplate.view = (e.parameter && e.parameter.view) ? e.parameter.view : '';
  return indexTemplate.evaluate()
    .setTitle('Remind Me')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function initializeSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var required = {
    'Tasks': ['task_id','task_name','category','task_date','due_time','remind_before_m','status','priority','note','reminder_sent','notify_group','notify_group_ids','is_all_day'],
    'Categories': ['name','color','created_at'],
    'Settings': ['setting_key','setting_value','description'],
    'Users': ['line_user_id','display_name','last_message','created_at','updated_at'],
    'Logs': ['log_at','type','task_id','message','payload'],
    'Finance': ['transaction_id','type','title','amount','category','date','note','created_at','scope'],
    'FinanceCategories': ['name','type','icon','color','created_at'],
    'LineGroups': ['group_id','name','created_at'],
    'ข้อมูลรายวัน': [],
    'README': []
  };

  for (var name in required) {
    if (!required.hasOwnProperty(name)) continue;
    var sheet = ss.getSheetByName(name);
    var headers = required[name];
    if (!sheet) {
      sheet = ss.insertSheet(name);
      if (headers.length) {
        sheet.appendRow(headers);
        sheet.getRange(1, 1, 1, headers.length)
          .setFontWeight('bold')
          .setBackground('#006664')
          .setFontColor('#FFFFFF');
      }
    } else if (headers.length) {
      var existingHeaders = sheet.getLastRow() > 0
        ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
        : [];
      var missing = [];
      for (var h = 0; h < headers.length; h++) {
        var found = false;
        for (var e = 0; e < existingHeaders.length; e++) {
          if (String(existingHeaders[e]) === headers[h]) { found = true; break; }
        }
        if (!found) missing.push(headers[h]);
      }
      if (existingHeaders.length === 0) {
        sheet.appendRow(headers);
        sheet.getRange(1, 1, 1, headers.length)
          .setFontWeight('bold')
          .setBackground('#006664')
          .setFontColor('#FFFFFF');
      } else if (missing.length > 0) {
        var startCol = existingHeaders.length + 1;
        sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
        sheet.getRange(1, startCol, 1, missing.length)
          .setFontWeight('bold')
          .setBackground('#006664')
          .setFontColor('#FFFFFF');
      }
    }
  }

  seedDefaults();
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Remind Me')
    .addItem('เปิด Dashboard', 'openDashboardDialog')
    .addItem('ตั้งค่าเริ่มต้นระบบ', 'runSetup')
    .addToUi();
}

function openDashboardDialog() {
  var settings = SettingsService.getSettings();
  var url = settings.WEB_APP_URL || '';
  var html;
  if (!url) {
    html = '<p style="font-family:sans-serif;text-align:center">ยังไม่ได้ตั้งค่า Web App URL<br>กรุณา Deploy โปรเจกต์นี้เป็น Web App ก่อน แล้วใส่ URL ในหน้า Settings</p>';
  } else {
    html = '<p style="font-family:sans-serif;text-align:center"><a href="' + url + '" target="_blank" style="font-size:18px">คลิกที่นี่เพื่อเปิด Dashboard</a></p>';
  }
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(360).setHeight(120),
    'Remind Me Dashboard'
  );
}

function runSetup() {
  initializeSheets();
  seedDefaults();
  seedReadmeSheet();
  SettingsService.saveSetting('TIMEZONE', 'Asia/Bangkok');
  SettingsService.saveSetting('DEFAULT_REMIND_MINUTES', '15');
  return {success: true, message: 'ตั้งค่าเริ่มต้นเสร็จสิ้น กรุณา Deploy Web App แล้วใส่ URL ในหน้า Settings'};
}

function seedReadmeSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('README');
  if (!sheet) {
    sheet = ss.insertSheet('README');
  }
  sheet.clear();

  var rows = [
    ['คู่มือติดตั้ง Remind Me'],
    [''],
    ['1. แนะนำระบบ'],
    ['Remind Me คือระบบจัดการภารกิจ รายรับ-รายจ่าย และการแจ้งเตือนผ่าน LINE Bot บน Google Sheets'],
    ['หลังจาก Make a copy แล้ว ให้ทำตามขั้นตอนด้านล่าง'],
    [''],
    ['2. ขั้นตอนหลัง Make a copy'],
    ['2.1 เปิด Google Sheet สำเนาที่คุณสร้างขึ้น'],
    ['2.2 รอสักครู่ให้เมนู Remind Me ปรากฏ (หรือรีเฟรชหน้า)'],
    ['2.3 คลิกเมนู Remind Me → ตั้งค่าเริ่มต้นระบบ'],
    ['2.4 คลิกเมนู Extensions → Apps Script'],
    ['2.5 ใน Apps Script คลิกปุ่ม Deploy (รูปจรวด) → New deployment'],
    ['2.6 เลือก Type: Web app'],
    ['2.7 ตั้งค่า:'],
    ['   - Description: Remind Me Web App'],
    ['   - Execute as: Me'],
    ['   - Who has access: Anyone'],
    ['2.8 คลิก Deploy แล้วคัดลอก Web App URL'],
    ['2.9 เปิด Web App URL ในเบราว์เซอร์'],
    ['2.10 ไปที่หน้า ตั้งค่า แล้วใส่ Web App URL ในช่อง "ลิงก์ Dashboard"'],
    [''],
    ['3. วิธีสร้าง LINE Official Account (OA)'],
    ['3.1 เปิด https://manager.line.biz/'],
    ['3.2 คลิก "สร้างบัญชี" หรือ Create account'],
    ['3.3 เลือกประเทศและภาษา'],
    ['3.4 กรอกชื่อบัญชี เช่น Remind Me Bot'],
    ['3.5 เลือกหมวดหมู่และอัปโหลดรูปโปรไฟล์'],
    ['3.6 คลิกสร้างบัญชีให้เสร็จสิ้น'],
    [''],
    ['4. วิธีสร้าง Messaging API Channel และรับ Channel Access Token'],
    ['4.1 ใน LINE Official Account Manager ไปที่ Settings → Messaging API'],
    ['4.2 คลิก "Apply for Messaging API" หรือ "เปิดใช้ Messaging API"'],
    ['4.3 เลือก Provider (หรือสร้างใหม่)'],
    ['4.4 เลือก Channel หรือสร้างใหม่'],
    ['4.5 หลังจากเปิด Messaging API แล้ว ไปที่ LINE Developers Console'],
    ['4.6 เลือก Provider และ Channel ของคุณ'],
    ['4.7 ไปที่ tab Messaging API'],
    ['4.8 คัดลอก Channel Access Token (หากยังไม่มี ให้คลิก Issue)'],
    ['4.9 เปิดใช้งาน Webhook โดยใส่ URL: https://script.google.com/macros/s/.../exec (URL หลักของ Web App ที่คุณ Deploy)'],
    ['4.10 เปิด Use webhook เป็น Enabled'],
    [''],
    ['5. วิธีหา LINE User ID'],
    ['5.1 เพิ่มบอทเป็นเพื่อนใน LINE (แสกน QR Code จากหน้า Settings ของ OA)'],
    ['5.2 ส่งข้อความอะไรก็ได้ให้บอท 1 ครั้ง'],
    ['5.3 ใน Web App ไปที่หน้า ตั้งค่า'],
    ['5.4 คลิกปุ่ม "ดึงล่าสุด" ข้างช่อง User ID หรือดูที่ Sheet Users คอลัมน์ line_user_id'],
    [''],
    ['6. วิธีตั้งค่าใน Web App'],
    ['6.1 ใส่ Channel Access Token ในช่อง "Channel Access Token"'],
    ['6.2 ใส่ User ID ในช่อง "User ID / Group ID"'],
    ['6.3 ใส่ Web App URL ในช่อง "ลิงก์ Dashboard" ต่อด้วย ?openExternalBrowser=1'],
    ['6.4 คลิก "บันทึกการตั้งค่า LINE"'],
    ['6.5 คลิก "ทดสอบ LINE" เพื่อส่งข้อความทดสอบ'],
    ['6.6 คลิก "เปิด Trigger" เพื่อให้ระบบตรวจสอบการเตือนอัตโนมัติ'],
    [''],
    ['7. วิธีสร้าง Rich Menu (ถ้าต้องการ)'],
    ['7.1 ออกแบบรูป Rich Menu ขนาด 2500 x 1686 px เป็น PNG หรือ JPEG'],
    ['7.2 อัปโหลดรูปขึ้น Google Drive'],
    ['7.3 คัดลอก File ID จากลิงก์ Google Drive'],
    ['7.4 ใน Web App ไปที่หน้า ตั้งค่า → ส่วน LINE Rich Menu'],
    ['7.5 ใส่ File ID แล้วคลิก "สร้างและตั้งค่า Rich Menu"'],
    [''],
    ['8. ข้อควรระวัง'],
    ['- อย่าแชร์ Channel Access Token ให้ผู้อื่น'],
    ['- หาก redeploy Web App URL จะเปลี่ยน ต้องเอา URL ใหม่มาใส่ในหน้าตั้งค่าใหม่'],
    ['- ระบบใช้ timezone Asia/Bangkok เป็นค่าเริ่มต้น'],
    ['- ข้อมูลทั้งหมดจะถูกเก็บใน Google Sheet นี้']
  ];

  var range = sheet.getRange(1, 1, rows.length, 1);
  range.setValues(rows);
  sheet.getRange(1, 1).setFontSize(16).setFontWeight('bold');
  sheet.setColumnWidth(1, 700);
  sheet.setRowHeights(1, rows.length, 24);
}

function seedDefaults() {
  var settings = SettingsService.getSettings();
  if (settings.DEFAULTS_SEEDED === 'TRUE') return;

  // Categories
  var catSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Categories');
  if (catSheet.getLastRow() <= 1) {
    var now = nowString();
    var defaults = [
      ['Work','#006664',now],
      ['Personal','#10b981',now],
      ['Urgent','#dc2626',now],
      ['Shopping','#f59e0b',now]
    ];
    defaults.forEach(function(row){ catSheet.appendRow(row); });
  }

  // Settings
  var settingsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Settings');
  var existing = {};
  if (settingsSheet.getLastRow() > 1) {
    var values = settingsSheet.getRange(2, 1, settingsSheet.getLastRow() - 1, 1).getValues() || [];
    values.forEach(function(row){ existing[String(row[0])] = true; });
  }
  var defaults = [
    ['APP_NAME','Remind Me','ชื่อระบบ'],
    ['TIMEZONE','Asia/Bangkok','เขตเวลา'],
    ['LINE_CHANNEL_ACCESS_TOKEN','','Token ของ LINE Bot'],
    ['LINE_DEFAULT_USER_ID','','LINE userId หลักสำหรับรับแจ้งเตือน'],
    ['LINE_GROUP_ID','','LINE groupId สำหรับส่งแจ้งเตือนไปกลุ่ม'],
    ['DEFAULT_REMIND_MINUTES','15','ค่าเริ่มต้นเตือนก่อนกี่นาที'],
    ['WEB_APP_URL','','URL หลักของ Web App'],
    ['LAST_REMINDER_RUN_AT','','เวลาที่ trigger ตรวจ reminder ล่าสุด'],
    ['LAST_REMINDER_SENT_COUNT','0','จำนวน reminder ที่ส่งในรอบล่าสุด'],
    ['LAST_REMINDER_ERROR_COUNT','0','จำนวน error ในรอบล่าสุด'],
    ['LAST_WEBHOOK_USER_ID','','User ID ล่าสุดจาก LINE Webhook'],
    ['LAST_WEBHOOK_GROUP_ID','','Group/Room ID ล่าสุดจาก LINE Webhook']
  ];
  defaults.forEach(function(row){
    if (!existing[row[0]]) settingsSheet.appendRow(row);
  });

  // FinanceCategories
  var finCatSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('FinanceCategories');
  if (finCatSheet.getLastRow() <= 1) {
    var now = nowString();
    var finDefaults = [
      ['ค่าอาหาร','รายจ่าย','🍜','#f59e0b',now],
      ['ค่าเดินทาง','รายจ่าย','🚗','#3b82f6',now],
      ['ค่าไฟฟ้า','รายจ่าย','⚡','#ef4444',now],
      ['ช้อปปิ้ง','รายจ่าย','🛍️','#8b5cf6',now],
      ['เงินเดือน','รายรับ','💰','#10b981',now],
      ['อื่นๆ','รายจ่าย','📌','#94a3b8',now]
    ];
      finDefaults.forEach(function(row){ finCatSheet.appendRow(row); });
    }
  SettingsService.saveSetting('DEFAULTS_SEEDED', 'TRUE');
}

function nowString() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

/* ---------- Task API ---------- */
function getTasks(filters) { return TaskService.getTasks(filters); }
function getTasksByDate(date) { return TaskService.getTasksByDate(date); }
function getTasksForMonth(year, month) { return TaskService.getTasksForMonth(year, month); }
function getAllTasks() { return TaskService.getAllTasks(); }
function addTask(data) { return TaskService.addTask(data); }
function updateTask(id, data) { return TaskService.updateTask(id, data); }
function deleteTask(id) { return TaskService.deleteTask(id); }
function updateTaskStatus(id, status) { return TaskService.updateTaskStatus(id, status); }
function getTaskStats(date) { return TaskService.getTaskStats(date); }

/* ---------- Group Calendar View API (read-only) ---------- */
function getTasksForGroup(groupId) {
  var tasks = TaskService.getAllTasks();
  var result = [];
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    if (!t.notify_group) continue;
    var ids = String(t.notify_group_ids || "").trim();
    var match = false;
    if (ids === "__all__") {
      match = true;
    } else if (ids) {
      var idArr = ids.split(",").map(function (s) { return s.trim(); });
      match = idArr.indexOf(groupId) >= 0;
    }
    if (match) {
      result.push({
        task_id: t.task_id,
        task_name: t.task_name,
        category: t.category,
        task_date: t.task_date,
        due_time: t.due_time,
        is_all_day: t.is_all_day,
        status: t.status,
        priority: t.priority,
        note: t.note
      });
    }
  }
  return result;
}

function getGroupName(groupId) {
  var groups = SettingsService.getLineGroups();
  for (var i = 0; i < groups.length; i++) {
    if (groups[i].group_id === groupId) return groups[i].name || "กลุ่ม LINE";
  }
  return "กลุ่ม LINE";
}

/* ---------- Finance API ---------- */
function getFinanceRecords(filters) { return FinanceService.getFinanceRecords(filters); }
function getFinanceRecordWithCategories(id) {
  return {
    record: FinanceService.getFinanceRecord(id),
    categories: SettingsService.getFinanceCategories()
  };
}
function addFinanceRecord(data) { return FinanceService.addFinanceRecord(data); }
function updateFinanceRecord(id, data) { return FinanceService.updateFinanceRecord(id, data); }
function deleteFinanceRecord(id) { return FinanceService.deleteFinanceRecord(id); }
function getFinanceSummary(period, date) { return FinanceService.getFinanceSummary(period, date); }
function getExpenseByCategory(period, date) { return FinanceService.getExpenseByCategory(period, date); }
function exportFinanceReport(filters, format) { return FinanceService.exportReport(filters, format); }

/* ---------- Categories API ---------- */
function getCategories() { return SettingsService.getCategories(); }
function debugCategories() { return SettingsService.debugCategories(); }
function addCategory(name, color) { return SettingsService.addCategory(name, color); }
function updateCategory(oldName, newName, color) { return SettingsService.updateCategory(oldName, newName, color); }
function deleteCategory(name) { return SettingsService.deleteCategory(name); }

/* ---------- Finance Categories API ---------- */
function getFinanceCategories() { return SettingsService.getFinanceCategories(); }
function addFinanceCategory(name, type, icon, color) { return SettingsService.addFinanceCategory(name, type, icon, color); }
function updateFinanceCategory(oldName, newName, type, icon, color) { return SettingsService.updateFinanceCategory(oldName, newName, type, icon, color); }
function deleteFinanceCategory(name) { return SettingsService.deleteFinanceCategory(name); }

/* ---------- Settings API ---------- */
function getSettings() { return SettingsService.getSettings(); }
function saveSetting(key, value) { return SettingsService.saveSetting(key, value); }
function clearAllData() { return SettingsService.clearAllData(); }

/* ---------- Combined Data API ---------- */
function getInitialData() {
  initializeSheets();
  var settings = SettingsService.getSettings();
  var now = new Date();
  var tz = settings.TIMEZONE || Session.getScriptTimeZone();
  var today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  return {
    year: now.getFullYear(),
    month: now.getMonth(),
    settings: SettingsService.getSettings(),
    categories: SettingsService.getCategories(),
    financeCategories: SettingsService.getFinanceCategories(),
    lineGroups: SettingsService.getLineGroups(),
    tasks: TaskService.getAllTasks(),
    financeRecords: FinanceService.getFinanceRecords({}),
    financeSummary: FinanceService.getFinanceSummary('daily', today),
    todayFinanceRecords: FinanceService.getFinanceRecords({date: today})
  };
}

/* ---------- Users API ---------- */
function getUsers() { return UserService.getUsers(); }
function getLatestUserId() { return UserService.getLatestUserId(); }
function getLatestGroupId() { return UserService.getLatestGroupId(); }
function getLineGroups() { return SettingsService.getLineGroups(); }
function addLineGroup(groupId, name) { return SettingsService.addLineGroup(groupId, name); }
function deleteLineGroup(groupId) { return SettingsService.deleteLineGroup(groupId); }

/* ---------- Logs API ---------- */
function getLogs(limit) { return LogService.getLogs(limit); }

/* ---------- Task API for LINE Edit ---------- */
function getTaskByIdSafe(id) {
  if (TaskService.getTaskById) return TaskService.getTaskById(id);
  var tasks = TaskService.getAllTasks();
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].task_id === id) return tasks[i];
  }
  throw new Error('Task not found');
}

function getTaskRecordWithCategories(taskId) {
  return {record: getTaskByIdSafe(taskId), categories: SettingsService.getCategories(), lineGroups: SettingsService.getLineGroups()};
}

function updateTaskFromLine(taskId, data) {
  var updated = TaskService.updateTask(taskId, data);
  var settings = SettingsService.getSettings();
  var webAppUrl = settings.WEB_APP_URL || '';
  var userId = settings.LINE_DEFAULT_USER_ID || '';
  if (userId) {
    LineService.sendTaskPush(userId, 'created', updated, webAppUrl);
  }
  return {success: true, task_id: taskId};
}

function deleteTaskFromLine(taskId) {
  var task = getTaskByIdSafe(taskId);
  TaskService.deleteTask(taskId);
  var settings = SettingsService.getSettings();
  var userId = settings.LINE_DEFAULT_USER_ID || '';
  if (userId) {
    LineService.sendTaskDeletedPush(userId, task.task_name);
  }
  return {success: true, task_id: taskId};
}

/* ---------- Rich Menu API ---------- */
function createAndUploadRichMenu(driveFileId, webAppUrl) { return RichMenuService.createAndUploadRichMenu(driveFileId, webAppUrl); }
function createRichMenu(webAppUrl) { return RichMenuService.createRichMenu(webAppUrl); }
function uploadRichMenuImage(richMenuId, driveFileId) { return RichMenuService.uploadRichMenuImage(richMenuId, driveFileId); }
function setDefaultRichMenu(richMenuId) { return RichMenuService.setDefaultRichMenu(richMenuId); }
function deleteAllRichMenus() { return RichMenuService.deleteAllRichMenus(); }

/* ---------- LINE API ---------- */
function saveLineSetup(token, userId) { return LineService.saveLineSetup(token, userId); }
function sendLineMessage(userId, message) { return LineService.sendLineMessage(userId, message); }
function testLineMessage() { return LineService.testLineMessage(); }

/* ---------- Trigger API ---------- */
function setupReminderTrigger() { return TriggerService.setupReminderTrigger(); }
function removeTrigger() { return TriggerService.removeTrigger(); }
function getTriggerStatus() { return TriggerService.getTriggerStatus(); }
function checkAndSendReminders() { TriggerService.checkAndSendReminders(); }
function runReminderCheckNow() {
  TriggerService.checkAndSendReminders();
  var settings = SettingsService.getSettings();
  return {
    success: true,
    runAt: settings.LAST_REMINDER_RUN_AT || '',
    sent: settings.LAST_REMINDER_SENT_COUNT || '0',
    errors: settings.LAST_REMINDER_ERROR_COUNT || '0'
  };
}

/* ---------- Daily Report ---------- */
function renderDailyInfoSheet(date) { return DailyInfoService.render(date); }

/* ---------- Webhook for LINE ---------- */
function doPost(e) {
  return LineService.doPost(e);
}
