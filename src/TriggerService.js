var TriggerService = (function() {
  var HANDLER_NAME = 'checkAndSendReminders';

  function parseDate(str) {
    var parts = String(str).split('-');
    if (parts.length !== 3) return null;
    return new Date(parseInt(parts[0],10), parseInt(parts[1],10)-1, parseInt(parts[2],10));
  }

  function buildDateTime(dateStr, timeStr) {
    var d = parseDate(dateStr);
    if (!d) return null;
    var hm = String(timeStr || '00:00').split(':');
    var h = parseInt(hm[0], 10) || 0;
    var m = parseInt(hm[1], 10) || 0;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0);
  }

  function toWallClock(date, tz) {
    // แปลง Date ให้ wall-clock ตรงกันเวลาใน timezone ที่ตั้งค่า
    var str = Utilities.formatDate(date, tz, 'yyyy-MM-dd HH:mm:ss');
    var parts = str.split(/[- :]/);
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10),
                    parseInt(parts[3], 10), parseInt(parts[4], 10), parseInt(parts[5], 10));
  }

  return {
    setupReminderTrigger: function() {
      this.removeTrigger();
      // จัด trigger ให้วิ่งใกล้ต้นนาทีที่สุด เพื่อลดโอกาส reminder ตรงเวลาช้า/หลุด
      var tz = Session.getScriptTimeZone();
      var now = new Date();
      var seconds = parseInt(Utilities.formatDate(now, tz, 'ss'), 10);
      var ms = now.getMilliseconds();
      var msToNext = (60 - seconds) * 1000 - ms;
      if (msToNext > 0 && msToNext < 60000) {
        Utilities.sleep(msToNext);
      }
      ScriptApp.newTrigger(HANDLER_NAME).timeBased().everyMinutes(1).create();
      LogService.logEvent('TRIGGER_SETUP', '', 'Reminder trigger created (aligned to minute boundary)', JSON.stringify({tz: tz, alignedAt: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss')}));
      return {success: true, message: 'ตั้งค่า Trigger แจ้งเตือนเรียบร้อย (จัดให้ตรงต้นนาที)'};
    },

    removeTrigger: function() {
      var triggers = ScriptApp.getProjectTriggers();
      for (var i = 0; i < triggers.length; i++) {
        if (triggers[i].getHandlerFunction() === HANDLER_NAME) {
          ScriptApp.deleteTrigger(triggers[i]);
        }
      }
      return {success: true, message: 'ลบ Trigger แจ้งเตือนแล้ว'};
    },

    getTriggerStatus: function() {
      var triggers = ScriptApp.getProjectTriggers();
      for (var i = 0; i < triggers.length; i++) {
        if (triggers[i].getHandlerFunction() === HANDLER_NAME) {
          return {active: true};
        }
      }
      return {active: false};
    },

    checkAndSendReminders: function() {
      if (!SetupService.isInstalled()) return;
      var settings = SettingsService.getSettings();
      var tz = settings.TIMEZONE || Session.getScriptTimeZone();
      var now = new Date();
      var nowLocal = toWallClock(now, tz);
      var todayStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');

      var sentCount = 0;
      var errorCount = 0;
      var webAppUrl = settings.WEB_APP_URL || '';

      var tasks = TaskService.getTasks({date: todayStr});

      for (var i = 0; i < tasks.length; i++) {
        var t = tasks[i];
        if (t.reminder_sent) continue;
        if (t.status === 'Done') continue;
        if (!t.due_time) continue;
        var start = toWallClock(buildDateTime(t.task_date, t.due_time), tz);
        if (!start) continue;
        var reminderTime = new Date(start.getTime() - t.remind_before_m * 60000);

        var nowMinute = Utilities.formatDate(nowLocal, tz, 'yyyy-MM-dd HH:mm');
        var reminderMinute = Utilities.formatDate(reminderTime, tz, 'yyyy-MM-dd HH:mm');
        var diffSeconds = Math.floor((nowLocal.getTime() - reminderTime.getTime()) / 1000);

        // ส่งเมื่ออยู่ในนาทีที่กำหนด หรือเลยมาไม่เกิน 30 วินาที (รองรับ trigger ล่าช้าเล็กน้อย)
        var shouldSend = nowMinute === reminderMinute || (diffSeconds >= 0 && diffSeconds <= 30);

        LogService.logEvent('REMINDER_CHECK', t.task_id, 'checked', JSON.stringify({
          due_time: t.due_time,
          remind_before_m: t.remind_before_m,
          reminderMinute: reminderMinute,
          nowMinute: nowMinute,
          diffSeconds: diffSeconds,
          shouldSend: shouldSend
        }));

        if (shouldSend) {
          var res = LineService.sendLineReminder(null, t, webAppUrl);
          if (res.success) {
            sentCount++;
            TaskService.markReminderSent(t.task_id);
          } else {
            errorCount++;
            var errMsg = res.error || (res.userResult && res.userResult.error) || 'ส่ง reminder ไม่สำเร็จ';
            LogService.logEvent('LINE_PUSH_ERROR', t.task_id, errMsg, JSON.stringify({task_id: t.task_id}));
          }

          if (res.groupResults && res.groupResults.length > 0) {
            for (var gi = 0; gi < res.groupResults.length; gi++) {
              var gRes = res.groupResults[gi];
              if (!gRes.result.success) {
                errorCount++;
                LogService.logEvent('LINE_PUSH_ERROR', t.task_id, gRes.result.error, JSON.stringify({task_id: t.task_id, target: 'group', group_id: gRes.group_id}));
              }
            }
          }
        }
      }

      var runAt = Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm:ss');
      SettingsService.saveSetting('LAST_REMINDER_RUN_AT', runAt);
      SettingsService.saveSetting('LAST_REMINDER_SENT_COUNT', String(sentCount));
      SettingsService.saveSetting('LAST_REMINDER_ERROR_COUNT', String(errorCount));
    }
  };
})();
