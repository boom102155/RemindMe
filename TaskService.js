var TaskService = (function() {
  var SHEET_NAME = 'Tasks';
  var EXPECTED_HEADERS = ['task_id','task_name','category','task_date','due_time','remind_before_m','status','priority','note','reminder_sent','notify_group','notify_group_ids','is_all_day'];

  function getSheet() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Sheet ' + SHEET_NAME + ' not found');
    return sheet;
  }

  function getTimezone() {
    try {
      var settings = SettingsService.getSettings();
      return settings.TIMEZONE || Session.getScriptTimeZone();
    } catch (e) {
      return Session.getScriptTimeZone();
    }
  }

  function nowString() {
    return Utilities.formatDate(new Date(), getTimezone(), 'yyyy-MM-dd HH:mm:ss');
  }

  function getSheetHeaders(sheet) {
    if (sheet.getLastRow() === 0) return [];
    var values = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues();
    if (!values || !values[0]) return [];
    return values[0].map(function(h) { return String(h || '').trim(); });
  }

  function headersMatchExpected(headers) {
    if (headers.length !== EXPECTED_HEADERS.length) return false;
    for (var i = 0; i < EXPECTED_HEADERS.length; i++) {
      if (headers[i] !== EXPECTED_HEADERS[i]) return false;
    }
    return true;
  }

  function normalizeTasksSheet(sheet) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var oldHeaders = getSheetHeaders(sheet);
    var oldData = sheet.getDataRange().getValues();
    var tempName = 'Tasks_New_' + Utilities.getUuid().slice(0, 8);
    var newSheet = ss.insertSheet(tempName);
    newSheet.appendRow(EXPECTED_HEADERS);
    newSheet.getRange(1, 1, 1, EXPECTED_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#006664')
      .setFontColor('#FFFFFF');

    var swappedOrder = oldHeaders.indexOf('is_all_day') >= 0 && oldHeaders.indexOf('notify_group_ids') >= 0 &&
      oldHeaders.indexOf('is_all_day') < oldHeaders.indexOf('notify_group_ids');

    for (var i = 1; i < oldData.length; i++) {
      var obj = rowToObject(oldData[i], oldHeaders);
      // Heuristic: if the old sheet had is_all_day before notify_group_ids, values may be swapped.
      if (swappedOrder) {
        var allDayVal = String(obj.is_all_day || '').trim();
        var idsVal = String(obj.notify_group_ids || '').trim();
        if (allDayVal.length > 10 && (idsVal.toUpperCase() === 'TRUE' || idsVal.toUpperCase() === 'FALSE' || idsVal === '')) {
          obj.notify_group_ids = allDayVal;
          obj.is_all_day = idsVal.toUpperCase() === 'TRUE';
        }
      }
      newSheet.appendRow(objectToRow(obj, EXPECTED_HEADERS));
    }

    ss.deleteSheet(sheet);
    newSheet.setName(SHEET_NAME);
    SettingsService.saveSetting('TASKS_SHEET_NORMALIZED', 'TRUE');
    LogService.logEvent('TASKS_SHEET_NORMALIZED', '', 'Rebuilt Tasks sheet with ' + (oldData.length - 1) + ' rows', '{}');
    return newSheet;
  }

  function ensureHeaders(sheet) {
    var headers = getSheetHeaders(sheet);
    var missing = [];
    for (var i = 0; i < EXPECTED_HEADERS.length; i++) {
      if (headers.indexOf(EXPECTED_HEADERS[i]) < 0) missing.push(EXPECTED_HEADERS[i]);
    }
    if (missing.length > 0) {
      if (headers.length === 0) {
        sheet.appendRow(EXPECTED_HEADERS);
        sheet.getRange(1, 1, 1, EXPECTED_HEADERS.length)
          .setFontWeight('bold')
          .setBackground('#006664')
          .setFontColor('#FFFFFF');
      } else {
        sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
        sheet.getRange(1, headers.length + 1, 1, missing.length)
          .setFontWeight('bold')
          .setBackground('#006664')
          .setFontColor('#FFFFFF');
      }
      headers = getSheetHeaders(sheet);
    }

    if (!headersMatchExpected(headers)) {
      try {
        var normFlag = SettingsService.getSetting('TASKS_SHEET_NORMALIZED');
        if (normFlag !== 'TRUE') {
          normalizeTasksSheet(sheet);
          headers = getSheetHeaders(getSheet());
        }
      } catch (normErr) {
        LogService.logEvent('TASKS_SHEET_NORMALIZE_ERROR', '', normErr.message, '{}');
      }
    }

    return headers;
  }

  function rowToObject(row, headers) {
    var obj = {};
    var tz = getTimezone();
    for (var i = 0; i < EXPECTED_HEADERS.length; i++) {
      var key = EXPECTED_HEADERS[i];
      var idx = headers.indexOf(key);
      obj[key] = idx >= 0 ? row[idx] : '';
    }
    obj.task_date = normalizeDateValue(obj.task_date, tz);
    obj.due_time = normalizeTimeValue(obj.due_time, tz);
    obj.remind_before_m = parseInt(obj.remind_before_m, 10) || 0;
    obj.reminder_sent = obj.reminder_sent === true || String(obj.reminder_sent).toUpperCase() === 'TRUE';
    obj.notify_group = obj.notify_group === true || String(obj.notify_group).toUpperCase() === 'TRUE';
    obj.notify_group_ids = String(obj.notify_group_ids || '').trim();
    obj.is_all_day = obj.is_all_day === true || String(obj.is_all_day).toUpperCase() === 'TRUE';
    return obj;
  }

  function normalizeDateValue(value, tz) {
    tz = tz || getTimezone();
    if (value instanceof Date && !isNaN(value.getTime())) {
      return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
    }
    return String(value || '').trim();
  }

  function normalizeTimeValue(value, tz) {
    tz = tz || getTimezone();
    if (value instanceof Date && !isNaN(value.getTime())) {
      return Utilities.formatDate(value, tz, 'HH:mm');
    }
    if (typeof value === 'number') {
      var totalMinutes = Math.round(value * 24 * 60);
      var hh = Math.floor(totalMinutes / 60) % 24;
      var mm = totalMinutes % 60;
      return pad(hh) + ':' + pad(mm);
    }
    return String(value || '').trim();
  }

  function pad(n) {
    return n < 10 ? '0' + n : n;
  }

  function objectToRow(obj, headers) {
    return headers.map(function(h) { return obj[h] !== undefined ? obj[h] : ''; });
  }

  function findRowIndex(sheet, id) {
    var data = sheet.getDataRange().getValues() || [];
    for (var i = 0; i < data.length; i++) {
      if (data[i][0] === 'task_id') continue;
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
    var da = parseDate(a.task_date);
    var db = parseDate(b.task_date);
    if (!da || !db) return 0;
    if (da.getTime() !== db.getTime()) return da - db;
    var ta = a.due_time || '00:00';
    var tb = b.due_time || '00:00';
    return String(ta).localeCompare(String(tb));
  }

  function getDefaultReminderMinutes() {
    try {
      var settings = SettingsService.getSettings();
      return parseInt(settings.DEFAULT_REMIND_MINUTES, 10) || 15;
    } catch (e) {
      return 15;
    }
  }

  return {
    getTasks: function(filters) {
      filters = filters || {};
      var sheet = getSheet();
      var headers = ensureHeaders(sheet);
      sheet = getSheet();
      var lastRow = sheet.getLastRow();
      var tasks = [];
      if (lastRow >= 1) {
        var data = sheet.getRange(1, 1, lastRow, headers.length).getValues() || [];
        for (var i = 0; i < data.length; i++) {
          if (String(data[i][0]).toLowerCase() === 'task_id') continue;
          var t = rowToObject(data[i], headers);
          if (filters.date && t.task_date !== filters.date) continue;
          if (filters.status && t.status !== filters.status) continue;
          if (filters.priority && t.priority !== filters.priority) continue;
          if (filters.category && t.category !== filters.category) continue;
          if (filters.search) {
            var q = filters.search.toLowerCase();
            var text = String(t.task_name + ' ' + (t.note || '')).toLowerCase();
            if (text.indexOf(q) === -1) continue;
          }
          tasks.push(t);
        }
      }
      var sortBy = filters.sortBy || 'date';
      var sortOrder = filters.sortOrder || 'asc';
      tasks.sort(function(a, b) {
        var cmp = 0;
        if (sortBy === 'date') cmp = compareDate(a, b);
        else if (sortBy === 'name') cmp = String(a.task_name).localeCompare(String(b.task_name));
        else if (sortBy === 'priority') cmp = String(a.priority).localeCompare(String(b.priority));
        return sortOrder === 'desc' ? -cmp : cmp;
      });
      if (filters.offset !== undefined && filters.limit !== undefined) {
        tasks = tasks.slice(filters.offset, filters.offset + filters.limit);
      }
      return tasks;
    },

    getTasksByDate: function(date) {
      return this.getTasks({date: date});
    },

    getAllTasks: function() {
      var sheet = getSheet();
      var headers = ensureHeaders(sheet);
      sheet = getSheet();
      var tasks = [];
      var lastRow = sheet.getLastRow();
      if (lastRow >= 1) {
        var data = sheet.getRange(1, 1, lastRow, headers.length).getValues() || [];
        for (var i = 0; i < data.length; i++) {
          if (String(data[i][0]).toLowerCase() === 'task_id') continue;
          tasks.push(rowToObject(data[i], headers));
        }
      }
      tasks.sort(compareDate);
      return tasks;
    },

    getTasksForMonth: function(year, month) {
      var sheet = getSheet();
      var headers = ensureHeaders(sheet);
      sheet = getSheet();
      var tasks = [];
      var lastRow = sheet.getLastRow();
      if (lastRow >= 1) {
        var data = sheet.getRange(1, 1, lastRow, headers.length).getValues() || [];
        for (var i = 0; i < data.length; i++) {
          if (String(data[i][0]).toLowerCase() === 'task_id') continue;
          var t = rowToObject(data[i], headers);
          var d = parseDate(t.task_date);
          if (d && d.getFullYear() === year && d.getMonth() === month) {
            tasks.push(t);
          }
        }
      }
      tasks.sort(compareDate);
      return tasks;
    },

    addTask: function(data) {
      if (!data.task_name) throw new Error('Task name is required');
      if (!data.task_date) throw new Error('Task date is required');
      var sheet = getSheet();
      var headers = ensureHeaders(sheet);
      sheet = getSheet();
      var task = {
        task_id: Utilities.getUuid(),
        task_name: data.task_name,
        category: data.category || 'Work',
        task_date: data.task_date,
        due_time: data.due_time || '',
        remind_before_m: parseInt(data.remind_before_m, 10) >= 0 ? parseInt(data.remind_before_m, 10) : getDefaultReminderMinutes(),
        status: data.status || 'Pending',
        priority: data.priority || 'Medium',
        note: data.note || '',
        reminder_sent: false,
        notify_group: data.notify_group === true || String(data.notify_group).toUpperCase() === 'TRUE',
        notify_group_ids: String(data.notify_group_ids || '').trim(),
        is_all_day: data.is_all_day === true || String(data.is_all_day).toUpperCase() === 'TRUE'
      };
      sheet.appendRow(objectToRow(task, headers));
      LogService.logEvent('TASK_CREATED', task.task_id, 'Created task', JSON.stringify({task_name: task.task_name, notify_group: task.notify_group, notify_group_ids: task.notify_group_ids}));

      // ส่ง Flex + ข้อความยืนยันให้ผู้ใช้หลักเมื่อสร้างภารกิจจากหน้าเว็บ
      try {
        var settings = SettingsService.getSettings();
        LineService.sendTaskCreatedPush(null, task, settings.WEB_APP_URL || '');
      } catch (notifyErr) {
        LogService.logEvent('TASK_CREATE_NOTIFY_ERROR', task.task_id, notifyErr.message, '{}');
      }

      return task;
    },

    updateTask: function(id, data) {
      var sheet = getSheet();
      var headers = ensureHeaders(sheet);
      sheet = getSheet();
      var row = findRowIndex(sheet, id);
      if (row < 0) throw new Error('Task not found');
      var existing = rowToObject(sheet.getRange(row, 1, 1, headers.length).getValues()[0], headers);
      for (var key in data) {
        if (data.hasOwnProperty(key) && EXPECTED_HEADERS.indexOf(key) >= 0) {
          existing[key] = data[key];
        }
      }
      if (data.remind_before_m !== undefined) existing.remind_before_m = parseInt(data.remind_before_m, 10) || 0;
      if (data.notify_group_ids !== undefined) {
        existing.notify_group_ids = String(data.notify_group_ids || '').trim();
        existing.notify_group = existing.notify_group_ids !== '';
      } else if (data.notify_group !== undefined) {
        existing.notify_group = data.notify_group === true || String(data.notify_group).toUpperCase() === 'TRUE';
      }
      if (data.is_all_day !== undefined) existing.is_all_day = data.is_all_day === true || String(data.is_all_day).toUpperCase() === 'TRUE';
      sheet.getRange(row, 1, 1, headers.length).setValues([objectToRow(existing, headers)]);
      LogService.logEvent('TASK_UPDATED', id, 'Updated task', JSON.stringify(data));

      // ส่งแจ้งเตือน Flex การแก้ไขไปยังเป้าหมายเดิม เฉพาะเมื่อ reminder_sent = true
      if (existing.reminder_sent === true || String(existing.reminder_sent).toUpperCase() === 'TRUE') {
        try {
          var settings = SettingsService.getSettings();
          LineService.sendLineReminder(null, existing, settings.WEB_APP_URL || '');
          LogService.logEvent('TASK_UPDATE_NOTIFIED', id, 'Sent update notification', JSON.stringify({notify_group: existing.notify_group, notify_group_ids: existing.notify_group_ids}));
        } catch (notifyErr) {
          LogService.logEvent('TASK_UPDATE_NOTIFY_ERROR', id, notifyErr.message, '{}');
        }
      }

      return existing;
    },

    deleteTask: function(id) {
      var sheet = getSheet();
      var row = findRowIndex(sheet, id);
      if (row < 0) throw new Error('Task not found');
      sheet.deleteRow(row);
      LogService.logEvent('TASK_DELETED', id, 'Deleted task', '{}');
      return {success: true, task_id: id};
    },

    updateTaskStatus: function(id, status) {
      return this.updateTask(id, {status: status});
    },

    getTaskById: function(id) {
      var sheet = getSheet();
      var headers = ensureHeaders(sheet);
      sheet = getSheet();
      var row = findRowIndex(sheet, id);
      if (row < 0) throw new Error('Task not found');
      return rowToObject(sheet.getRange(row, 1, 1, headers.length).getValues()[0], headers);
    },

    getTaskStats: function(date) {
      var tasks = this.getTasks({date: date});
      var total = tasks.length;
      var pending = 0;
      var done = 0;
      var urgent = 0;
      for (var i = 0; i < tasks.length; i++) {
        if (tasks[i].status === 'Done') done++;
        else pending++;
        if (tasks[i].priority === 'High') urgent++;
      }
      return {total: total, pending: pending, done: done, urgent: urgent};
    },

    markReminderSent: function(id) {
      var sheet = getSheet();
      var headers = ensureHeaders(sheet);
      sheet = getSheet();
      var row = findRowIndex(sheet, id);
      if (row < 0) return false;
      var col = headers.indexOf('reminder_sent') + 1;
      if (col <= 0) return false;
      sheet.getRange(row, col).setValue('TRUE');
      return true;
    }
  };
})();
