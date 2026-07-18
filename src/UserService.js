var UserService = (function() {
  var SHEET_NAME = 'Users';
  var HEADERS = ['line_user_id','display_name','last_message','created_at','updated_at'];

  function getSheet() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Sheet ' + SHEET_NAME + ' not found');
    return sheet;
  }

  function nowString() {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  }

  function findRow(sheet, id) {
    var data = sheet.getDataRange().getValues() || [];
    for (var i = 0; i < data.length; i++) {
      if (data[i][0] === 'line_user_id') continue;
      if (data[i][0] === id) return i + 1;
    }
    return -1;
  }

  function rowToObject(row) {
    var obj = {};
    for (var i = 0; i < HEADERS.length; i++) obj[HEADERS[i]] = row[i];
    return obj;
  }

  return {
    getUsers: function() {
      var sheet = getSheet();
      var users = [];
      var lastRow = sheet.getLastRow();
      if (lastRow >= 1) {
        var data = sheet.getRange(1, 1, lastRow, HEADERS.length).getValues() || [];
        for (var i = 0; i < data.length; i++) {
          if (String(data[i][0]).toLowerCase() === 'line_user_id') continue;
          users.push(rowToObject(data[i]));
        }
      }
      return users;
    },

    addOrUpdateUser: function(id, displayName, lastMessage) {
      var sheet = getSheet();
      var row = findRow(sheet, id);
      var now = nowString();
      if (row > 0) {
        sheet.getRange(row, 2, 1, 3).setValues([[displayName || '', lastMessage || '', now]]);
      } else {
        sheet.appendRow([id, displayName || '', lastMessage || '', now, now]);
      }
      return {success: true};
    },

    getLatestUserId: function() {
      var settings = SettingsService.getSettings();
      if (settings.LAST_WEBHOOK_USER_ID) return settings.LAST_WEBHOOK_USER_ID;
      var sheet = getSheet();
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        return sheet.getRange(lastRow, 1).getValue();
      }
      return '';
    },

    getLatestGroupId: function() {
      var settings = SettingsService.getSettings();
      if (settings.LAST_WEBHOOK_GROUP_ID) return settings.LAST_WEBHOOK_GROUP_ID;
      return '';
    }
  };
})();
