var SettingsService = (function() {
  function getSheet(name) {
    var ss = SetupService.getSpreadsheet();
    var sheet = ss.getSheetByName(name);
    if (!sheet) throw new Error('Sheet ' + name + ' not found');
    return sheet;
  }

  function findRow(sheet, col, value, headerValue) {
    var data = sheet.getDataRange().getValues() || [];
    for (var i = 0; i < data.length; i++) {
      var cell = data[i][col - 1];
      if (headerValue && String(cell).toLowerCase() === String(headerValue).toLowerCase()) continue;
      if (cell === value) return i + 1;
    }
    return -1;
  }

  function nowString() {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  }

  function normalizeDateTimeValue(value) {
    if (value instanceof Date && !isNaN(value.getTime())) {
      return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    }
    return String(value || '').trim();
  }

  return {
    getSettings: function() {
      var sheet = getSheet('Settings');
      var settings = {};
      var lastRow = sheet.getLastRow();
      if (lastRow >= 1) {
        var values = sheet.getRange(1, 1, lastRow, 2).getValues() || [];
        for (var i = 0; i < values.length; i++) {
          var key = String(values[i][0] || '');
          if (!key || key.toLowerCase() === 'setting_key') continue;
          settings[key] = String(values[i][1] || '');
        }
      }
      return settings;
    },

    getSetting: function(key) {
      var sheet = getSheet('Settings');
      var row = findRow(sheet, 1, key, 'setting_key');
      if (row > 0) return String(sheet.getRange(row, 2).getValue() || '');
      return '';
    },

    saveSetting: function(key, value) {
      var sheet = getSheet('Settings');
      var row = findRow(sheet, 1, key, 'setting_key');
      if (row > 0) {
        sheet.getRange(row, 2).setValue(value);
      } else {
        sheet.appendRow([key, value, '']);
      }
      return {success: true, key: key, value: value};
    },

    getCategories: function() {
      var sheet = getSheet('Categories');
      var categories = [];
      var lastRow = sheet.getLastRow();
      if (lastRow >= 1) {
        var data = sheet.getRange(1, 1, lastRow, 3).getValues() || [];
        for (var i = 0; i < data.length; i++) {
          var name = data[i][0];
          if (!name || String(name).toLowerCase() === 'name') continue;
          categories.push({name: name, color: data[i][1], created_at: normalizeDateTimeValue(data[i][2])});
        }
      }
      return categories;
    },

    addCategory: function(name, color) {
      if (!name) throw new Error('Category name is required');
      var sheet = getSheet('Categories');
      if (findRow(sheet, 1, name, 'name') > 0) throw new Error('Category already exists');
      sheet.appendRow([name, color || '#006664', nowString()]);
      return {success: true};
    },

    updateCategory: function(oldName, newName, color) {
      var sheet = getSheet('Categories');
      var row = findRow(sheet, 1, oldName, 'name');
      if (row < 0) throw new Error('Category not found');
      sheet.getRange(row, 1, 1, 2).setValues([[newName || oldName, color]]);
      var taskSheet = getSheet('Tasks');
      var taskData = taskSheet.getDataRange().getValues() || [];
      for (var i = 1; i < taskData.length; i++) {
        if (taskData[i][2] === oldName) {
          taskSheet.getRange(i + 1, 3).setValue(newName || oldName);
        }
      }
      return {success: true};
    },

    deleteCategory: function(name) {
      var sheet = getSheet('Categories');
      var row = findRow(sheet, 1, name, 'name');
      if (row < 0) throw new Error('Category not found');
      sheet.deleteRow(row);
      return {success: true};
    },

    getFinanceCategories: function() {
      var sheet = getSheet('FinanceCategories');
      var categories = [];
      var lastRow = sheet.getLastRow();
      if (lastRow >= 1) {
        var data = sheet.getRange(1, 1, lastRow, 5).getValues() || [];
        for (var i = 0; i < data.length; i++) {
          var name = data[i][0];
          if (!name || String(name).toLowerCase() === 'name') continue;
          categories.push({name: name, type: data[i][1], icon: data[i][2], color: data[i][3], created_at: normalizeDateTimeValue(data[i][4])});
        }
      }
      return categories;
    },

    addFinanceCategory: function(name, type, icon, color) {
      if (!name) throw new Error('Finance category name is required');
      var sheet = getSheet('FinanceCategories');
      if (findRow(sheet, 1, name, 'name') > 0) throw new Error('Finance category already exists');
      sheet.appendRow([name, type || 'รายจ่าย', icon || '📌', color || '#94A3B8', nowString()]);
      return {success: true};
    },

    updateFinanceCategory: function(oldName, newName, type, icon, color) {
      var sheet = getSheet('FinanceCategories');
      var row = findRow(sheet, 1, oldName, 'name');
      if (row < 0) throw new Error('Finance category not found');
      sheet.getRange(row, 1, 1, 4).setValues([[newName || oldName, type, icon, color]]);
      var financeSheet = getSheet('Finance');
      var data = financeSheet.getDataRange().getValues() || [];
      for (var i = 1; i < data.length; i++) {
        if (data[i][4] === oldName) {
          financeSheet.getRange(i + 1, 5).setValue(newName || oldName);
        }
      }
      return {success: true};
    },

    deleteFinanceCategory: function(name) {
      var sheet = getSheet('FinanceCategories');
      var row = findRow(sheet, 1, name);
      if (row < 0) throw new Error('Finance category not found');
      sheet.deleteRow(row);
      return {success: true};
    },

    getLineGroups: function() {
      var sheet = getSheet('LineGroups');
      var groups = [];
      var lastRow = sheet.getLastRow();
      if (lastRow >= 1) {
        var data = sheet.getRange(1, 1, lastRow, 3).getValues() || [];
        for (var i = 0; i < data.length; i++) {
          var id = String(data[i][0] || '').trim();
          if (!id || id.toLowerCase() === 'group_id') continue;
          groups.push({group_id: id, name: String(data[i][1] || ''), created_at: normalizeDateTimeValue(data[i][2])});
        }
      }
      // one-time migration from legacy single LINE_GROUP_ID
      if (groups.length === 0) {
        var settings = this.getSettings();
        var legacyId = String(settings.LINE_GROUP_ID || '').trim();
        if (legacyId) {
          var legacyName = String(settings.LINE_GROUP_NAME || 'กลุ่ม LINE').trim() || 'กลุ่ม LINE';
          this.addLineGroup(legacyId, legacyName);
          groups.push({group_id: legacyId, name: legacyName, created_at: nowString()});
          this.saveSetting('LINE_GROUP_ID', '');
        }
      }
      return groups;
    },

    addLineGroup: function(groupId, name) {
      if (!groupId) throw new Error('Group ID is required');
      var sheet = getSheet('LineGroups');
      var data = sheet.getDataRange().getValues() || [];
      var count = 0;
      for (var i = 0; i < data.length; i++) {
        var id = String(data[i][0] || '').trim();
        if (!id || id.toLowerCase() === 'group_id') continue;
        count++;
        if (id === groupId) throw new Error('Group ID already exists');
      }
      if (count >= 11) throw new Error('จำนวนกลุ่มเต็มแล้ว (สูงสุด 11 กลุ่ม)');
      sheet.appendRow([groupId, name || 'กลุ่ม LINE', nowString()]);
      return {success: true, group_id: groupId, name: name || 'กลุ่ม LINE'};
    },

    deleteLineGroup: function(groupId) {
      var sheet = getSheet('LineGroups');
      var data = sheet.getDataRange().getValues() || [];
      for (var i = 0; i < data.length; i++) {
        var id = String(data[i][0] || '').trim();
        if (id === groupId) {
          sheet.deleteRow(i + 1);
          return {success: true};
        }
      }
      throw new Error('Group not found');
    },

    debugCategories: function() {
      var sheet = getSheet('Categories');
      var lastRow = sheet.getLastRow();
      var raw = sheet.getDataRange().getValues();
      var parsed = this.getCategories();
      return {lastRow: lastRow, raw: raw, parsed: parsed};
    },

    clearAllData: function() {
      var ss = SetupService.getSpreadsheet();
      var names = ['Tasks', 'Finance', 'Categories', 'FinanceCategories', 'Users', 'Logs', 'LineGroups'];
      for (var i = 0; i < names.length; i++) {
        var sheet = ss.getSheetByName(names[i]);
        if (sheet && sheet.getLastRow() > 1) {
          sheet.deleteRows(2, sheet.getLastRow() - 1);
        }
      }
      this.saveSetting('LAST_REMINDER_SENT_COUNT', '0');
      this.saveSetting('LAST_REMINDER_ERROR_COUNT', '0');
      this.saveSetting('LAST_WEBHOOK_USER_ID', '');
      this.saveSetting('LAST_WEBHOOK_GROUP_ID', '');
      return {success: true};
    }
  };
})();
