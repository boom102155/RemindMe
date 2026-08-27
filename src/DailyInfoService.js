var DailyInfoService = (function() {
  var SHEET_NAME = 'ข้อมูลรายวัน';

  function formatThaiDate(dateStr) {
    var parts = String(dateStr).split('-');
    if (parts.length !== 3) return dateStr;
    var y = parseInt(parts[0],10) + 543;
    var m = parseInt(parts[1],10);
    var d = parseInt(parts[2],10);
    var months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    return d + ' ' + months[m-1] + ' ' + y;
  }

  function parseDate(str) {
    var parts = String(str).split('-');
    if (parts.length !== 3) return new Date();
    return new Date(parseInt(parts[0],10), parseInt(parts[1],10)-1, parseInt(parts[2],10));
  }

  return {
    render: function(dateStr) {
      var ss = SetupService.getSpreadsheet();
      var sheet = ss.getSheetByName(SHEET_NAME);
      if (!sheet) throw new Error('Sheet ' + SHEET_NAME + ' not found');

      var stats = TaskService.getTaskStats(dateStr);
      var tasks = TaskService.getTasksByDate(dateStr);

      // Clear content
      if (sheet.getMaxRows() > 30) sheet.deleteRows(31, sheet.getMaxRows() - 30);
      sheet.clear();

      // Title
      sheet.getRange('A1:G1').merge().setValue('📅 ข้อมูลรายวัน').setHorizontalAlignment('center').setFontWeight('bold').setBackground('#2563EB').setFontColor('#FFFFFF');

      sheet.getRange('A2').setValue('วันที่');
      var d = parseDate(dateStr);
      sheet.getRange('B2').setValue(d).setNumberFormat('d mmmm yyyy');
      sheet.getRange('A3').setValue('แก้วันที่ในเซลล์ B2 เพื่อดูงานของวันอื่น');

      sheet.getRange('A4').setValue('สรุป').setFontWeight('bold');
      sheet.getRange('B4').setValue('จำนวน').setFontWeight('bold');

      var summary = [
        ['งานทั้งหมดของวัน', stats.total],
        ['รอดำเนินการ', stats.pending],
        ['เสร็จแล้ว', stats.done],
        ['งานด่วน', stats.urgent]
      ];
      sheet.getRange('A5:B8').setValues(summary);

      // Headers
      var headers = ['task_id','task_name','category','due_time','priority','status','note'];
      sheet.getRange('A9:G9').setValues([headers]).setFontWeight('bold').setBackground('#DBEAFE');

      // Tasks
      if (tasks.length === 0) {
        sheet.getRange('A10').setValue('ไม่มีงานสำหรับวันที่เลือก');
      } else {
        var rows = tasks.map(function(t) {
          return [t.task_id, t.task_name, t.category, t.due_time, t.priority, t.status, t.note];
        });
        sheet.getRange(10, 1, rows.length, 7).setValues(rows);
      }

      return {success: true, date: dateStr, count: tasks.length};
    }
  };
})();
