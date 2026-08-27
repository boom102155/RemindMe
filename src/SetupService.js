/**
 * SetupService
 * จัดการการติดตั้งระบบครั้งแรก (First-time Setup) และการเข้าถึง Spreadsheet ฐานข้อมูล
 *
 * ระบบนี้เป็น Standalone Apps Script ไม่ผูกกับ Spreadsheet ใด ๆ
 * เมื่อผู้ใช้ติดตั้งครั้งแรก ระบบจะสร้าง Spreadsheet ใหม่ใน Drive ของผู้ใช้
 * และเก็บ Spreadsheet ID ไว้ใน Script Properties เพื่อใช้งานต่อไป
 *
 * ทุกส่วนของระบบต้องเข้าถึง Spreadsheet ผ่าน SetupService.getSpreadsheet() เท่านั้น
 * ห้ามใช้ SpreadsheetApp.getActiveSpreadsheet() หรือฝัง Spreadsheet ID ไว้ในโค้ด
 */
var SetupService = (function() {

  /* Script Properties keys */
  var PROP_SHEET_ID = 'SHEET_ID';
  var PROP_VERSION = 'VERSION';
  var PROP_INSTALL_DATE = 'INSTALL_DATE';
  var PROP_CREATED_BY = 'CREATED_BY';

  var CURRENT_VERSION = '1.0.0';
  var SPREADSHEET_NAME = 'Remind Me';

  /* โครงสร้างชีตทั้งหมดของระบบ พร้อม header ของแต่ละชีต */
  var REQUIRED_SHEETS = {
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

  function getProperties() {
    return PropertiesService.getScriptProperties();
  }

  function nowString() {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  }

  function isInstalled() {
    return !!getProperties().getProperty(PROP_SHEET_ID);
  }

  /**
   * ทุกฟังก์ชันในระบบเรียก Spreadsheet ผ่านฟังก์ชันนี้เท่านั้น
   */
  function getSpreadsheet() {
    var id = getProperties().getProperty(PROP_SHEET_ID);
    if (!id) {
      throw new Error('ระบบยังไม่ได้ติดตั้ง กรุณาเปิด Web App แล้วกด "ติดตั้งระบบครั้งแรก"');
    }
    return SpreadsheetApp.openById(id);
  }

  function getSpreadsheetUrl() {
    var id = getProperties().getProperty(PROP_SHEET_ID);
    return id ? 'https://docs.google.com/spreadsheets/d/' + id + '/edit' : '';
  }

  function getStatus() {
    var props = getProperties();
    var installed = isInstalled();
    return {
      installed: installed,
      spreadsheetId: installed ? props.getProperty(PROP_SHEET_ID) : '',
      spreadsheetUrl: installed ? getSpreadsheetUrl() : '',
      version: props.getProperty(PROP_VERSION) || '',
      installDate: props.getProperty(PROP_INSTALL_DATE) || ''
    };
  }

  /**
   * ติดตั้งระบบครั้งแรก:
   * 1. ตรวจสอบว่าติดตั้งแล้วหรือยัง (idempotent)
   * 2. สร้าง Spreadsheet ใหม่ใน Drive ของผู้ใช้
   * 3. บันทึก SHEET_ID ลง Script Properties
   * 4. สร้างชีตทั้งหมด + header + ค่าเริ่มต้น
   * 5. ลบชีตว่างที่ติดมากับ Spreadsheet ตอนสร้างใหม่
   */
  function setup() {
    if (isInstalled()) {
      return {
        success: true,
        alreadyInstalled: true,
        spreadsheetUrl: getSpreadsheetUrl(),
        message: 'ระบบถูกติดตั้งแล้ว'
      };
    }

    var ss = SpreadsheetApp.create(SPREADSHEET_NAME);
    var defaultSheets = ss.getSheets();

    var props = getProperties();
    props.setProperty(PROP_SHEET_ID, ss.getId());
    props.setProperty(PROP_VERSION, CURRENT_VERSION);
    props.setProperty(PROP_INSTALL_DATE, nowString());
    try {
      props.setProperty(PROP_CREATED_BY, Session.getActiveUser().getEmail() || '');
    } catch (e) { /* บางสภาพแวดล้อมอ่านอีเมลผู้ใช้ไม่ได้ */ }

    // สร้างชีตทั้งหมด + seed ค่าเริ่มต้น
    // (ฟังก์ชันใน รหัส.js เหล่านี้เข้าถึง Spreadsheet ผ่าน SetupService.getSpreadsheet()
    // ซึ่งพร้อมใช้งานแล้วหลังบันทึก SHEET_ID ด้านบน)
    initializeSheets();
    seedDefaults();
    seedReadmeSheet();

    // ลบชีตว่างที่มาพร้อม Spreadsheet ตอนสร้างใหม่ (เช่น Sheet1)
    for (var i = 0; i < defaultSheets.length; i++) {
      var ds = defaultSheets[i];
      if (!REQUIRED_SHEETS.hasOwnProperty(ds.getName())) {
        try { ss.deleteSheet(ds); } catch (e) {}
      }
    }

    return {
      success: true,
      alreadyInstalled: false,
      spreadsheetId: ss.getId(),
      spreadsheetUrl: ss.getUrl(),
      message: 'ติดตั้งระบบเรียบร้อยแล้ว'
    };
  }

  /**
   * สำหรับนักพัฒนาเท่านั้น: เชื่อมโปรเจกต์นี้เข้ากับ Spreadsheet ที่มีอยู่แล้ว
   * ใช้ตอนย้ายจากเวอร์ชัน container-bound (push ทับโปรเจกต์เดิม)
   * เพื่อให้ระบบใช้ฐานข้อมูลเดิมต่อได้โดยไม่ต้องสร้าง Sheet ใหม่
   */
  function linkExistingSpreadsheet(spreadsheetId) {
    var id = String(spreadsheetId || '').trim();
    if (!id) throw new Error('กรุณาระบุ Spreadsheet ID');
    var ss = SpreadsheetApp.openById(id); // ตรวจสอบว่าเข้าถึงได้จริงก่อน
    var props = getProperties();
    props.setProperty(PROP_SHEET_ID, id);
    if (!props.getProperty(PROP_VERSION)) props.setProperty(PROP_VERSION, CURRENT_VERSION);
    if (!props.getProperty(PROP_INSTALL_DATE)) props.setProperty(PROP_INSTALL_DATE, nowString());
    return {
      success: true,
      spreadsheetId: id,
      spreadsheetUrl: ss.getUrl(),
      message: 'เชื่อมฐานข้อมูลเดิมเรียบร้อยแล้ว'
    };
  }

  /**
   * สำหรับนักพัฒนาเท่านั้น: ลบข้อมูลการติดตั้งออกจาก Script Properties
   * (ไม่ลบ Spreadsheet จริงของผู้ใช้) ไม่เปิดให้ผู้ใช้ทั่วไปเรียกจากหน้าเว็บ
   */
  function resetSystem() {
    var props = getProperties();
    props.deleteProperty(PROP_SHEET_ID);
    props.deleteProperty(PROP_VERSION);
    props.deleteProperty(PROP_INSTALL_DATE);
    props.deleteProperty(PROP_CREATED_BY);
    return { success: true };
  }

  return {
    REQUIRED_SHEETS: REQUIRED_SHEETS,
    isInstalled: isInstalled,
    getSpreadsheet: getSpreadsheet,
    getSpreadsheetUrl: getSpreadsheetUrl,
    getStatus: getStatus,
    setup: setup,
    linkExistingSpreadsheet: linkExistingSpreadsheet,
    resetSystem: resetSystem
  };
})();
