var LogService = (function() {
  var SHEET_NAME = 'Logs';
  var HEADERS = ['log_at','type','task_id','message','payload'];

  function getSheet() {
    var ss = SetupService.getSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Sheet ' + SHEET_NAME + ' not found');
    return sheet;
  }

  function nowString() {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  }

  return {
    logEvent: function(type, taskId, message, payload) {
      try {
        var sheet = getSheet();
        sheet.appendRow([nowString(), type || '', taskId || '', message || '', payload || '']);
      } catch (e) {
        // Silent fail to avoid breaking main flow
      }
    },

    getLogs: function(limit) {
      var sheet = getSheet();
      var logs = [];
      var lastRow = sheet.getLastRow();
      if (lastRow >= 1) {
        var safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
        var startRow = Math.max(1, lastRow - safeLimit + 1);
        var data = sheet.getRange(startRow, 1, lastRow - startRow + 1, HEADERS.length).getValues() || [];
        for (var i = data.length - 1; i >= 0; i--) {
          if (String(data[i][0]).toLowerCase() === 'log_at') continue;
          var obj = {};
          for (var j = 0; j < HEADERS.length; j++) obj[HEADERS[j]] = data[i][j];
          logs.push(obj);
        }
        if (logs.length > safeLimit) logs = logs.slice(0, safeLimit);
      }
      return logs;
    },

    prune: function(maxRows) {
      var sheet = getSheet();
      var keep = Math.max(parseInt(maxRows, 10) || 5000, 100);
      var lastRow = sheet.getLastRow();
      if (lastRow > keep + 1) sheet.deleteRows(2, lastRow - keep - 1);
      return {success: true};
    }
  };
})();
