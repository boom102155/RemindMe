var RichMenuService = (function() {
  var RICHMENU_URL = 'https://api.line.me/v2/bot/richmenu';
  var RICHMENU_LIST_URL = RICHMENU_URL + '/list';

  function getDefaultWebAppUrl() {
    try {
      var settings = SettingsService.getSettings();
      return settings.WEB_APP_URL || '';
    } catch (e) {
      return '';
    }
  }

  function buildRichMenu(webAppUrl) {
    var baseUrl = webAppUrl || getDefaultWebAppUrl();
    if (!baseUrl) throw new Error('ไม่พบ Web App URL กรุณาตั้งค่า WEB_APP_URL ในหน้า Settings ก่อน');
    var w = 2500;
    var h = 1686;
    var cols = 3;
    var rows = 2;
    var cellW = Math.floor(w / cols);
    var cellH = Math.floor(h / rows);
    var areas = [];
    var actions = [
      {type: 'postback', data: 'action=showExpenseGuide'},
      {type: 'postback', data: 'action=startAddTask'},
      {type: 'uri', uri: baseUrl + (baseUrl.indexOf('?') >= 0 ? '&' : '?') + 'view=finance&openExternalBrowser=1'},
      {type: 'uri', uri: baseUrl + (baseUrl.indexOf('?') >= 0 ? '&' : '?') + 'view=tasks&openExternalBrowser=1'},
      {type: 'uri', uri: baseUrl + (baseUrl.indexOf('?') >= 0 ? '&' : '?') + 'view=dashboard&openExternalBrowser=1'},
      {type: 'uri', uri: baseUrl + (baseUrl.indexOf('?') >= 0 ? '&' : '?') + 'view=settings&openExternalBrowser=1'}
    ];
    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        var idx = row * cols + col;
        areas.push({
          bounds: {
            x: col * cellW,
            y: row * cellH,
            width: cellW,
            height: cellH
          },
          action: actions[idx]
        });
      }
    }
    return {
      size: {width: w, height: h},
      selected: false,
      name: 'Remind Me Main Menu',
      chatBarText: 'เมนูหลัก',
      areas: areas
    };
  }

  function apiCall(url, options, maxRetries, stepName) {
    maxRetries = maxRetries || 0;
    stepName = stepName || 'LINE API';
    var settings = SettingsService.getSettings();
    var token = settings.LINE_CHANNEL_ACCESS_TOKEN || '';
    if (!token) throw new Error('ไม่พบ LINE Channel Access Token');
    options = options || {};
    options.headers = options.headers || {};
    options.headers['Authorization'] = 'Bearer ' + token;
    options.muteHttpExceptions = true;

    var lastError = null;
    for (var attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) Utilities.sleep(attempt * 2000);
      try {
        LogService.logEvent('RICHMENU_API', stepName, 'Attempt ' + (attempt + 1) + ' to ' + url, '');
        var res = UrlFetchApp.fetch(url, options);
        var code = res.getResponseCode();
        var body = res.getContentText();
        LogService.logEvent('RICHMENU_API', stepName, 'Response ' + code, String(body || '').substring(0, 500));
        if (code >= 200 && code < 300) {
          var trimmed = String(body || '').trim();
          return trimmed ? JSON.parse(trimmed) : {};
        }
        lastError = 'LINE API ' + code + ': ' + body;
        if (code < 500 && code !== 429) break;
      } catch (e) {
        lastError = e.message;
        LogService.logEvent('RICHMENU_API_ERROR', stepName, lastError, '');
      }
    }
    throw new Error(lastError || 'LINE API call failed');
  }

  function setDefaultForAllUsers(richMenuId) {
    return apiCall('https://api.line.me/v2/bot/user/all/richmenu/' + richMenuId, {
      method: 'POST'
    }, 5, 'setDefaultAllUsers');
  }

  return {
    createRichMenu: function(webAppUrl) {
      try {
        LogService.logEvent('RICHMENU_CREATE', 'cleanup', 'Deleting existing rich menus', '');
        var list = apiCall(RICHMENU_LIST_URL, {method: 'GET'}, 2, 'listRichMenus');
        var menus = list.richmenus || [];
        for (var i = 0; i < menus.length; i++) {
          apiCall(RICHMENU_URL + '/' + menus[i].richMenuId, {method: 'DELETE'}, 2, 'deleteRichMenu');
        }
      } catch (cleanupErr) {
        LogService.logEvent('RICHMENU_CREATE', 'cleanupWarning', cleanupErr.message, '');
      }

      var richMenu = buildRichMenu(webAppUrl);
      LogService.logEvent('RICHMENU_CREATE', 'start', 'Creating rich menu', JSON.stringify(richMenu));
      var created = apiCall(RICHMENU_URL, {
        method: 'POST',
        contentType: 'application/json',
        payload: JSON.stringify(richMenu)
      }, 5, 'createRichMenu');
      var richMenuId = created.richMenuId;
      if (!richMenuId) throw new Error('สร้าง Rich Menu ไม่สำเร็จ: ' + JSON.stringify(created));
      LogService.logEvent('RICHMENU_CREATE', 'created', richMenuId, '');
      SettingsService.saveSetting('RICH_MENU_ID', richMenuId);
      return {success: true, richMenuId: richMenuId};
    },

    uploadRichMenuImage: function(richMenuId, driveFileId) {
      if (!richMenuId) {
        var settings = SettingsService.getSettings();
        richMenuId = settings.RICH_MENU_ID || '';
      }
      if (!richMenuId) throw new Error('ไม่พบ Rich Menu ID');
      var file = DriveApp.getFileById(driveFileId);
      var blob = file.getBlob();
      var mimeType = blob.getContentType() || file.getMimeType() || 'image/png';
      if (mimeType !== 'image/png' && mimeType !== 'image/jpeg') {
        throw new Error('รูป Rich Menu ต้องเป็น PNG หรือ JPEG เท่านั้น (พบ ' + mimeType + ')');
      }
      var sizeBytes = blob.getBytes().length;
      if (sizeBytes === 0) {
        throw new Error('ไม่สามารถอ่านข้อมูลไฟล์รูปได้ (อาจเป็นไฟล์ว่างหรือไม่มีสิทธิ์เข้าถึง)');
      }
      if (sizeBytes > 1024 * 1024) {
        throw new Error('รูป Rich Menu ต้องมีขนาดไม่เกิน 1 MB (พบ ' + Math.round(sizeBytes / 1024) + ' KB)');
      }
      blob.setContentType(mimeType);
      var imageBytes = blob.getBytes();
      var uploadUrls = [
        RICHMENU_URL + '/' + richMenuId + '/content',
        'https://api-data.line.me/v2/bot/richmenu/' + richMenuId + '/content'
      ];
      LogService.logEvent('RICHMENU_UPLOAD', 'start', 'Uploading image, mime=' + mimeType + ', size=' + sizeBytes + ', richMenuId=' + richMenuId, '');
      Utilities.sleep(5000);

      var lastErr = null;
      for (var u = 0; u < uploadUrls.length; u++) {
        try {
          apiCall(uploadUrls[u], {
            method: 'POST',
            contentType: mimeType,
            payload: imageBytes
          }, 3, 'uploadImage');
          LogService.logEvent('RICHMENU_UPLOAD', 'success', 'Image uploaded to ' + uploadUrls[u], '');
          return {success: true, richMenuId: richMenuId};
        } catch (uploadApiErr) {
          lastErr = uploadApiErr.message + ' [URL=' + uploadUrls[u] + ', mime=' + mimeType + ', size=' + sizeBytes + ']';
          LogService.logEvent('RICHMENU_UPLOAD', 'fallback', 'Failed ' + uploadUrls[u] + ': ' + uploadApiErr.message, '');
        }
      }
      throw new Error(lastErr || 'อัปโหลดรูป Rich Menu ไม่สำเร็จ');
      return {success: true, richMenuId: richMenuId};
    },

    setDefaultRichMenu: function(richMenuId) {
      if (!richMenuId) {
        var settings = SettingsService.getSettings();
        richMenuId = settings.RICH_MENU_ID || '';
      }
      if (!richMenuId) throw new Error('ไม่พบ Rich Menu ID');
      setDefaultForAllUsers(richMenuId);
      return {success: true, richMenuId: richMenuId};
    },

    createAndUploadRichMenu: function(driveFileId, webAppUrl) {
      var createRes = this.createRichMenu(webAppUrl);
      var richMenuId = createRes.richMenuId;
      var warnings = [];

      Utilities.sleep(2000);
      try {
        this.uploadRichMenuImage(richMenuId, driveFileId);
      } catch (uploadErr) {
        warnings.push('อัปโหลดรูปไม่สำเร็จ: ' + uploadErr.message);
      }

      Utilities.sleep(2000);
      try {
        this.setDefaultRichMenu(richMenuId);
      } catch (defaultErr) {
        warnings.push('ตั้งค่า default ไม่สำเร็จ: ' + defaultErr.message);
      }

      var result = {success: true, richMenuId: richMenuId};
      if (warnings.length > 0) {
        result.warning = warnings.join(' | ');
      }
      return result;
    },

    deleteAllRichMenus: function() {
      if (!richMenuId) {
        var settings = SettingsService.getSettings();
        richMenuId = settings.RICH_MENU_ID || '';
      }
      if (!richMenuId) throw new Error('ไม่พบ Rich Menu ID');
      setDefaultForAllUsers(richMenuId);
      return {success: true, richMenuId: richMenuId};
    },

    deleteAllRichMenus: function() {
      var list = apiCall(RICHMENU_LIST_URL, {method: 'GET'}, 2, 'listRichMenus');
      var menus = list.richmenus || [];
      for (var i = 0; i < menus.length; i++) {
        apiCall(RICHMENU_URL + '/' + menus[i].richMenuId, {method: 'DELETE'}, 2, 'deleteRichMenu');
      }
      SettingsService.saveSetting('RICH_MENU_ID', '');
      return {success: true, deleted: menus.length};
    }
  };
})();
