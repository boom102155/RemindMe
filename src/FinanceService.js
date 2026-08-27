var FinanceService = (function() {
  var SHEET_NAME = 'Finance';
  var HEADERS = ['transaction_id','type','title','amount','category','date','note','created_at','scope'];

  function getSheet() {
    var ss = SetupService.getSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Sheet ' + SHEET_NAME + ' not found');
    return sheet;
  }

  function nowString() {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  }

  function rowToObject(row) {
    var obj = {};
    for (var i = 0; i < HEADERS.length; i++) {
      obj[HEADERS[i]] = row[i];
    }
    obj.date = normalizeDateValue(obj.date);
    obj.created_at = normalizeDateTimeValue(obj.created_at);
    obj.amount = parseFloat(obj.amount) || 0;
    obj.scope = obj.scope || 'ส่วนตัว';
    return obj;
  }

  function normalizeDateValue(value) {
    if (value instanceof Date && !isNaN(value.getTime())) {
      return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    return String(value || '').trim();
  }

  function normalizeDateTimeValue(value) {
    if (value instanceof Date && !isNaN(value.getTime())) {
      return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    }
    return String(value || '').trim();
  }

  function objectToRow(obj) {
    return HEADERS.map(function(h) { return obj[h] !== undefined ? obj[h] : ''; });
  }

  function findRowIndex(sheet, id) {
    var data = sheet.getDataRange().getValues() || [];
    for (var i = 0; i < data.length; i++) {
      if (data[i][0] === 'transaction_id') continue;
      if (data[i][0] === id) return i + 1;
    }
    return -1;
  }

  function parseDate(str) {
    var parts = String(str).split('-');
    if (parts.length !== 3) return null;
    return new Date(parseInt(parts[0],10), parseInt(parts[1],10)-1, parseInt(parts[2],10));
  }

  function compareDate(a, b) {
    var da = parseDate(a.date);
    var db = parseDate(b.date);
    if (!da || !db) return 0;
    return da - db;
  }

  function inPeriod(record, period, dateStr) {
    var rp = parseDate(record.date);
    if (!rp) return false;
    var dp = parseDate(dateStr);
    if (!dp) return false;
    if (period === 'daily') {
      return rp.getFullYear() === dp.getFullYear() && rp.getMonth() === dp.getMonth() && rp.getDate() === dp.getDate();
    }
    if (period === 'monthly') {
      return rp.getFullYear() === dp.getFullYear() && rp.getMonth() === dp.getMonth();
    }
    if (period === 'yearly') {
      return rp.getFullYear() === dp.getFullYear();
    }
    return true;
  }

  return {
    getFinanceRecord: function(id) {
      var sheet = getSheet();
      var row = findRowIndex(sheet, id);
      if (row < 0) return null;
      return rowToObject(sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0]);
    },

    getFinanceRecords: function(filters) {
      filters = filters || {};
      var sheet = getSheet();
      var records = [];
      var lastRow = sheet.getLastRow();
      if (lastRow >= 1) {
        var data = sheet.getRange(1, 1, lastRow, HEADERS.length).getValues() || [];
        for (var i = 0; i < data.length; i++) {
          if (String(data[i][0]).toLowerCase() === 'transaction_id') continue;
          var r = rowToObject(data[i]);
          if (filters.type && r.type !== filters.type) continue;
          if (filters.date && r.date !== filters.date) continue;
          if (filters.category && r.category !== filters.category) continue;
          if (filters.scope && r.scope !== filters.scope) continue;
          if (filters.period && filters.periodDate && !inPeriod(r, filters.period, filters.periodDate)) continue;
          if (filters.search) {
            var q = filters.search.toLowerCase();
            var text = String(r.title + ' ' + (r.note || '')).toLowerCase();
            if (text.indexOf(q) === -1) continue;
          }
          records.push(r);
        }
      }
      records.sort(function(a, b) { return compareDate(b, a); });
      return records;
    },

    addFinanceRecord: function(data) {
      if (!data.title) throw new Error('Title is required');
      if (!data.date) throw new Error('Date is required');
      var sheet = getSheet();
      var record = {
        transaction_id: Utilities.getUuid(),
        type: data.type || 'รายจ่าย',
        title: data.title,
        amount: parseFloat(data.amount) || 0,
        category: data.category || 'อื่นๆ',
        scope: data.scope || 'ส่วนตัว',
        date: data.date,
        note: data.note || '',
        created_at: nowString()
      };
      sheet.appendRow(objectToRow(record));
      LogService.logEvent('FINANCE_CREATED', record.transaction_id, 'Created finance record', JSON.stringify({title: record.title, amount: record.amount}));
      return record;
    },

    updateFinanceRecord: function(id, data) {
      var sheet = getSheet();
      var row = findRowIndex(sheet, id);
      if (row < 0) throw new Error('Finance record not found');
      var existing = rowToObject(sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0]);
      for (var key in data) {
        if (data.hasOwnProperty(key) && HEADERS.indexOf(key) >= 0) {
          existing[key] = data[key];
        }
      }
      if (data.amount !== undefined) existing.amount = parseFloat(data.amount) || 0;
      sheet.getRange(row, 1, 1, HEADERS.length).setValues([objectToRow(existing)]);
      LogService.logEvent('FINANCE_UPDATED', id, 'Updated finance record', JSON.stringify(data));

      try {
        var settings = SettingsService.getSettings();
        if (settings.LINE_DEFAULT_USER_ID) {
          var pushRes = LineService.sendFinancePush(null, 'updated', existing, settings.WEB_APP_URL);
          if (!pushRes.success) {
            LogService.logEvent('LINE_PUSH_ERROR', id, pushRes.error, JSON.stringify({type: 'finance_flex_updated'}));
          }
        }
      } catch (pushErr) {
        LogService.logEvent('LINE_PUSH_ERROR', id, pushRes ? pushRes.error : pushErr.message, JSON.stringify({type: 'finance_updated'}));
      }

      return existing;
    },

    deleteFinanceRecord: function(id) {
      var sheet = getSheet();
      var row = findRowIndex(sheet, id);
      if (row < 0) throw new Error('Finance record not found');
      sheet.deleteRow(row);
      LogService.logEvent('FINANCE_DELETED', id, 'Deleted finance record', '{}');
      return {success: true, transaction_id: id};
    },

    getFinanceSummary: function(period, date) {
      var records = this.getFinanceRecords({period: period, periodDate: date});
      var income = 0, expense = 0;
      for (var i = 0; i < records.length; i++) {
        if (records[i].type === 'รายรับ') income += records[i].amount;
        else expense += records[i].amount;
      }
      return {income: income, expense: expense, balance: income - expense};
    },

    getExpenseByCategory: function(period, date) {
      var records = this.getFinanceRecords({period: period, periodDate: date, type: 'รายจ่าย'});
      var map = {};
      for (var i = 0; i < records.length; i++) {
        var cat = records[i].category || 'ไม่ระบุหมวดหมู่';
        if (!map[cat]) map[cat] = 0;
        map[cat] += records[i].amount;
      }
      var result = [];
      for (var cat in map) {
        if (map.hasOwnProperty(cat)) result.push({category: cat, amount: map[cat]});
      }
      result.sort(function(a, b) { return b.amount - a.amount; });
      return result;
    },

    exportReport: function(filters, format) {
      filters = filters || {};
      var records = this.getFinanceRecords(filters);
      var headers = ['วันที่', 'ประเภท', 'รายการ', 'หมวดหมู่', 'ขอบเขต', 'จำนวนเงิน', 'หมายเหตุ', 'วันที่บันทึก'];
      var rows = records.map(function(r) {
        return [
          r.date || '',
          r.type || '',
          r.title || '',
          r.category || '-',
          r.scope || 'ส่วนตัว',
          r.amount || 0,
          r.note || '',
          r.created_at || ''
        ];
      });
      var dateSuffix = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
      var filename = 'รายงานรายรับรายจ่าย_' + dateSuffix;

      if (format === 'csv') {
        var lines = [headers.join(',')];
        for (var i = 0; i < rows.length; i++) {
          lines.push(rows[i].map(function(cell) {
            var s = String(cell || '').replace(/"/g, '""');
            if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) s = '"' + s + '"';
            return s;
          }).join(','));
        }
        var content = '\uFEFF' + lines.join('\n');
        return {
          success: true,
          filename: filename + '.csv',
          mimeType: 'text/csv;charset=utf-8',
          content: Utilities.base64Encode(content, Utilities.Charset.UTF_8)
        };
      }

      if (format === 'excel' || format === 'pdf') {
        var ss = SpreadsheetApp.create(filename);
        var sheet = ss.getActiveSheet();
        sheet.appendRow(headers);
        for (var j = 0; j < rows.length; j++) {
          sheet.appendRow(rows[j]);
        }
        var headerRange = sheet.getRange(1, 1, 1, headers.length);
        headerRange.setFontWeight('bold').setBackground('#006664').setFontColor('#FFFFFF');
        sheet.setColumnWidth(1, 100);
        sheet.setColumnWidth(2, 90);
        sheet.setColumnWidth(3, 220);
        sheet.setColumnWidth(4, 130);
        sheet.setColumnWidth(5, 110);
        sheet.setColumnWidth(6, 110);
        sheet.setColumnWidth(7, 220);
        sheet.setColumnWidth(8, 150);
        SpreadsheetApp.flush();

        var exportFormat = format === 'pdf' ? 'pdf' : 'xlsx';
        var mimeType = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        var ext = format === 'pdf' ? 'pdf' : 'xlsx';
        var blob = exportSpreadsheetAs(ss.getId(), exportFormat);
        DriveApp.getFileById(ss.getId()).setTrashed(true);
        return {
          success: true,
          filename: filename + '.' + ext,
          mimeType: mimeType,
          content: Utilities.base64Encode(blob.getBytes())
        };
      }

      throw new Error('รูปแบบไฟล์ไม่รองรับ');
    }
  };

  function exportSpreadsheetAs(spreadsheetId, format) {
    var token = ScriptApp.getOAuthToken();
    var url = 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/export?format=' + format;
    var response = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) {
      throw new Error('Export ' + format + ' failed: ' + response.getContentText());
    }
    return response.getBlob();
  }
})();
