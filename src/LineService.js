var LineService = (function () {
  var PUSH_URL = "https://api.line.me/v2/bot/message/push";
  var REPLY_URL = "https://api.line.me/v2/bot/message/reply";
  var DEFAULT_WEB_APP_URL =
    "https://script.google.com/macros/s/AKfycbzWIel1bSh8-bvQxISTagyQBmG3LdoDFr3O3WCAS3Rkbcx716WhDaH7AjMON5SDkRoTYA/exec";

  function getProfile(token, userId) {
    try {
      var res = UrlFetchApp.fetch(
        "https://api.line.me/v2/bot/profile/" + userId,
        {
          headers: { Authorization: "Bearer " + token },
          muteHttpExceptions: true,
        },
      );
      if (res.getResponseCode() === 200) {
        return JSON.parse(res.getContentText());
      }
    } catch (e) {}
    return null;
  }

  function getGroupSummary(token, groupId) {
    try {
      var res = UrlFetchApp.fetch(
        "https://api.line.me/v2/bot/group/" + groupId + "/summary",
        {
          headers: { Authorization: "Bearer " + token },
          muteHttpExceptions: true,
        },
      );
      if (res.getResponseCode() === 200) {
        return JSON.parse(res.getContentText());
      }
    } catch (e) {}
    return null;
  }

  function getSourceChatId(source, sourceType) {
    if (!source) return "";
    if (sourceType === "group") return source.groupId || "";
    if (sourceType === "room") return source.roomId || "";
    return source.userId || "";
  }

  function displayLoadingAnimation(chatId, loadingSeconds) {
    var settings = SettingsService.getSettings();
    var token = settings.LINE_CHANNEL_ACCESS_TOKEN || "";
    if (!token || !chatId) return { success: false, error: "missing token or chatId" };
    // loadingSeconds must be one of 5,10,15,...,60; default 20
    var seconds = loadingSeconds || 5;
    try {
      var res = UrlFetchApp.fetch("https://api.line.me/v2/bot/chat/loading/start", {
        method: "post",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        payload: JSON.stringify({ chatId: chatId, loadingSeconds: seconds }),
        muteHttpExceptions: true,
      });
      var code = res.getResponseCode();
      return { success: code >= 200 && code < 300, status: code, body: res.getContentText() };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  function maybeShowLoading(sourceType, userId, context) {
    if (sourceType !== "user" || !userId) return;
    var res = displayLoadingAnimation(userId, 5);
    if (!res.success) {
      LogService.logEvent("LOADING_ANIMATION", userId, context || "", JSON.stringify(res));
    }
  }

  function getLineMediaContent(token, messageId, mediaLabel) {
    if (!token) return { success: false, error: "ยังไม่ได้ตั้งค่า LINE Channel Access Token" };
    if (!messageId) return { success: false, error: "ไม่พบรหัส" + (mediaLabel || "ไฟล์") + "จาก LINE" };
    try {
      var response = UrlFetchApp.fetch(
        "https://api-data.line.me/v2/bot/message/" + encodeURIComponent(messageId) + "/content",
        {
          headers: { Authorization: "Bearer " + token },
          muteHttpExceptions: true,
        }
      );
      if (response.getResponseCode() !== 200) {
        return {
          success: false,
          error: "ดาวน์โหลด" + (mediaLabel || "ไฟล์") + "จาก LINE ไม่สำเร็จ (HTTP " + response.getResponseCode() + ")",
        };
      }
      return { success: true, blob: response.getBlob() };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  function getLineImageContent(token, messageId) {
    return getLineMediaContent(token, messageId, "รูปภาพ");
  }

  function getLineAudioContent(token, messageId) {
    return getLineMediaContent(token, messageId, "ข้อความเสียง");
  }

  function getTyphoonApiKey() {
    return PropertiesService.getScriptProperties().getProperty("TYPHOON_OCR_API_KEY") || "";
  }

  function getGroqAsrApiKey() {
    return PropertiesService.getScriptProperties().getProperty("GROQ_ASR_API_KEY") || "";
  }

  function extractSlipText(blob) {
    var apiKey = getTyphoonApiKey();
    if (!apiKey) {
      return { success: false, error: "ยังไม่ได้ตั้งค่า Typhoon OCR API key สำหรับอ่านสลิป" };
    }
    try {
      var mimeType = String(blob.getContentType() || "").toLowerCase();
      if (mimeType !== "image/jpeg" && mimeType !== "image/jpg" && mimeType !== "image/png") {
        mimeType = "image/jpeg";
      }
      var payload = {
        model: "typhoon-ocr",
        messages: [{
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract all text from this Thai bank transfer slip. Only return the clean Markdown. Do not include any explanation or extra text. Include all visible information on the slip.",
            },
            {
              type: "image_url",
              image_url: {
                url: "data:" + mimeType + ";base64," + Utilities.base64Encode(blob.getBytes()),
              },
            },
          ],
        }],
        max_tokens: 4096,
        repetition_penalty: 1.1,
        temperature: 0.1,
        top_p: 0.6,
      };
      var response = UrlFetchApp.fetch("https://api.opentyphoon.ai/v1/chat/completions", {
        method: "post",
        contentType: "application/json",
        headers: { Authorization: "Bearer " + apiKey },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });
      if (response.getResponseCode() !== 200) {
        var errorBody = {};
        try { errorBody = JSON.parse(response.getContentText()); } catch (ignore) {}
        return {
          success: false,
          error: (errorBody.error && errorBody.error.message) ||
            "Typhoon OCR อ่านสลิปไม่สำเร็จ (HTTP " + response.getResponseCode() + ")",
        };
      }
      var data = JSON.parse(response.getContentText());
      var content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!content) {
        return { success: false, error: (data.error && data.error.message) || "Typhoon OCR ไม่สามารถอ่านข้อความจากสลิปได้" };
      }
      var text = String(content || "").trim();
      text = String(text || "").trim();
      return text ? { success: true, text: text } : { success: false, error: "ไม่พบข้อความที่อ่านได้ในสลิป" };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  function getAudioFileExtension(contentType) {
    var mimeType = String(contentType || "").toLowerCase().split(";")[0];
    if (mimeType === "audio/mpeg" || mimeType === "audio/mp3") return "mp3";
    if (mimeType === "audio/ogg" || mimeType === "application/ogg") return "ogg";
    if (mimeType === "audio/opus") return "opus";
    if (mimeType === "audio/wav" || mimeType === "audio/x-wav") return "wav";
    if (mimeType === "audio/flac") return "flac";
    // LINE Voice Message เป็น m4a โดยทั่วไป จึงตั้งชื่อไฟล์ให้ API ระบุชนิดเสียงได้ถูกต้อง
    return "m4a";
  }

  function transcribeVoiceMessage(blob) {
    var apiKey = getGroqAsrApiKey();
    if (!apiKey) {
      return { success: false, error: "ยังไม่ได้ตั้งค่า Groq API key สำหรับจดด้วยเสียง" };
    }
    try {
      var audioBlob = blob.copyBlob ? blob.copyBlob() : blob;
      if (audioBlob.setName) {
        audioBlob.setName("line-voice." + getAudioFileExtension(audioBlob.getContentType()));
      }
      // เมื่อ payload มี Blob, Apps Script จะสร้าง multipart/form-data ให้โดยอัตโนมัติ
      var response = UrlFetchApp.fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "post",
        headers: { Authorization: "Bearer " + apiKey },
        payload: {
          file: audioBlob,
          model: "whisper-large-v3",
          language: "th",
          response_format: "json",
          temperature: 0,
        },
        muteHttpExceptions: true,
      });
      if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
        var errorBody = {};
        try { errorBody = JSON.parse(response.getContentText()); } catch (ignore) {}
        return {
          success: false,
          error: (errorBody.error && errorBody.error.message) ||
            "Groq Whisper ถอดเสียงไม่สำเร็จ (HTTP " + response.getResponseCode() + ")",
        };
      }
      var data = JSON.parse(response.getContentText());
      var text = String((data && data.text) || "").trim();
      return text ? { success: true, text: text } : { success: false, error: "ไม่พบข้อความที่ถอดได้จากเสียง" };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  function normalizeAmount(value) {
    var amount = parseFloat(String(value || "").replace(/[^0-9.]/g, ""));
    return isNaN(amount) || amount <= 0 ? 0 : amount;
  }

  function stripSlipMemoForAmount(text) {
    var lines = String(text || "").split(/\r?\n/);
    var memoLabel = /(?:บันทึกช่วยจำ|บันทึก|รายละเอียด|หมายเหตุ|โน้ต|โน้ท|note|memo|description)\s*[:：-]?\s*/i;
    var nextSection = /^(?:จำนวนเงิน|ยอดเงิน|จาก|ไปยัง|ผู้โอน|ผู้รับ|ชื่อผู้รับ|เลขอ้างอิง|reference|ref\.?|วันที่|date|time|ผู้รับเงินสามารถ|scan|qr\b)/i;
    var kept = [];
    for (var i = 0; i < lines.length; i++) {
      if (!memoLabel.test(lines[i])) {
        kept.push(lines[i]);
        continue;
      }
      // ไม่อนุญาตให้ตัวเลขที่อยู่ในช่อง Note เป็นยอดเงินสำรองของสลิป
      // เพราะผู้ใช้มักพิมพ์ราคาไว้กำกับชื่อรายการ
      while (i + 1 < lines.length && !nextSection.test(String(lines[i + 1]).trim())) i++;
    }
    return kept.join("\n");
  }

  function findSlipAmount(text) {
    var amountText = stripSlipMemoForAmount(text);
    var labeled = /(?:จำนวนเงิน|ยอดเงินที่โอน|ยอดโอน|ยอดรายการ|ยอดเงิน(?!คงเหลือ)|amount|total)\s*[:：]?\s*(?:THB|฿)?\s*([\d,]+(?:\.\d{1,2})?)/ig;
    var match;
    while ((match = labeled.exec(amountText)) !== null) {
      var labeledAmount = normalizeAmount(match[1]);
      if (labeledAmount) return labeledAmount;
    }
    var moneyMatches = amountText.match(/(?:฿|THB\s*)\s*([\d,]+(?:\.\d{1,2})?)/ig) || [];
    for (var i = 0; i < moneyMatches.length; i++) {
      var moneyAmount = normalizeAmount(moneyMatches[i]);
      if (moneyAmount) return moneyAmount;
    }
    var decimals = amountText.match(/\b[\d,]+\.\d{2}\b/g) || [];
    for (var j = 0; j < decimals.length; j++) {
      var decimalAmount = normalizeAmount(decimals[j]);
      if (decimalAmount) return decimalAmount;
    }
    return 0;
  }

  function findSlipDate(text, fallbackDate) {
    var iso = String(text || "").match(/\b(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/);
    if (iso) return iso[1] + "-" + ("0" + iso[2]).slice(-2) + "-" + ("0" + iso[3]).slice(-2);
    var thai = String(text || "").match(/\b(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})\b/);
    if (!thai) return fallbackDate;
    var year = parseInt(thai[3], 10);
    if (year > 2400) year -= 543;
    if (year < 100) year += 2000;
    var month = parseInt(thai[2], 10);
    var day = parseInt(thai[1], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return fallbackDate;
    return year + "-" + ("0" + month).slice(-2) + "-" + ("0" + day).slice(-2);
  }

  function inferSlipType(text) {
    var normalized = String(text || "").toLowerCase();
    var expenseSignals = ["โอนเงินสำเร็จ", "โอนออก", "รายการโอน", "จ่ายเงิน", "payment successful", "transfer successful"];
    for (var e = 0; e < expenseSignals.length; e++) {
      if (normalized.indexOf(expenseSignals[e]) >= 0) return "รายจ่าย";
    }
    var incomeSignals = ["เงินเข้า", "รับเงิน", "ได้รับเงิน", "โอนเข้าบัญชี", "credit", "received"];
    for (var i = 0; i < incomeSignals.length; i++) {
      if (normalized.indexOf(incomeSignals[i]) >= 0) return "รายรับ";
    }
    // สลิปโอนออกหรือข้อความที่ระบุทิศทางไม่ได้ ให้จดเป็นรายจ่ายตามกติกาของระบบ
    return "รายจ่าย";
  }

  function findSlipCounterparty(text, type) {
    var labels = type === "รายรับ"
      ? ["ผู้โอน", "จาก", "sender", "from"]
      : ["ชื่อผู้รับ", "ผู้รับเงิน", "ผู้รับ", "ไปยัง", "recipient", "to"];
    var lines = String(text || "").split(/\r?\n/).map(function(line) { return String(line).trim(); });
    for (var i = 0; i < lines.length; i++) {
      var lower = lines[i].toLowerCase();
      for (var j = 0; j < labels.length; j++) {
        if (lower.indexOf(labels[j]) < 0) continue;
        var inline = lines[i].replace(/^.*?(?:ชื่อผู้รับ|ผู้รับเงิน|ผู้รับ|ผู้โอน|ไปยัง|จาก|recipient|sender|from|to)\s*[:：-]?\s*/i, "").trim();
        if (inline && inline.length >= 2 && inline.length <= 80) return inline;
        if (lines[i + 1] && lines[i + 1].length >= 2 && lines[i + 1].length <= 80) return lines[i + 1];
      }
    }
    return "";
  }

  function findReferenceNumber(text) {
    var match = String(text || "").match(/(?:เลขที่รายการ|หมายเลขอ้างอิง|reference(?:\s*no\.?)?|ref\.?)(?:\s*[:：-])?\s*([A-Z0-9-]{6,})/i);
    return match ? match[1] : "";
  }

  function getDefaultFinanceCategory(categories, type) {
    var list = categories || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].name === "อื่นๆ" && list[i].type === type) return list[i].name;
    }
    for (var j = 0; j < list.length; j++) {
      if (list[j].name === "อื่นๆ") return list[j].name;
    }
    for (var k = 0; k < list.length; k++) {
      if (list[k].type === type) return list[k].name;
    }
    return "อื่นๆ";
  }

  function cleanSlipMemo(value) {
    return String(value || "")
      // ตัวเลขใน Note อาจเป็นราคาที่ผู้ใช้พิมพ์กำกับไว้ จึงไม่ใช้เป็นส่วนของชื่อรายการ
      .replace(/(?:^|\s)(?:฿\s*|THB\s*)?\d[\d,]*(?:\.\d{1,2})?(?=\s|$)/gi, " ")
      .replace(/\s+/g, " ")
      .replace(/^[\s:：\-–—]+|[\s:：\-–—]+$/g, "")
      .trim()
      .slice(0, 120);
  }

  function findSlipMemo(text) {
    var lines = String(text || "")
      .split(/\r?\n/)
      .map(function(line) { return String(line || "").trim(); })
      .filter(function(line) { return !!line; });
    var memoLabel = /(?:บันทึกช่วยจำ|บันทึก|รายละเอียด|หมายเหตุ|โน้ต|โน้ท|note|memo|description)\s*[:：-]?\s*/i;
    var nextSection = /^(?:จำนวนเงิน|ยอดเงิน|จาก|ไปยัง|ผู้โอน|ผู้รับ|ชื่อผู้รับ|เลขอ้างอิง|reference|ref\.?|วันที่|date|time|ผู้รับเงินสามารถ|scan|qr\b)/i;

    for (var i = 0; i < lines.length; i++) {
      if (!memoLabel.test(lines[i])) continue;
      var memoParts = [lines[i].replace(memoLabel, "").trim()];

      // ธนาคารจำนวนมากแสดงหัวข้อ Note คนละบรรทัดกับข้อความ จึงอ่านบรรทัดถัดไปด้วย
      for (var j = i + 1; j < lines.length && j <= i + 2; j++) {
        if (nextSection.test(lines[j]) || memoLabel.test(lines[j])) break;
        memoParts.push(lines[j]);
      }

      var memo = cleanSlipMemo(memoParts.join(" "));
      // ต้องเหลืออักษรจริงหลังตัดตัวเลขออก จึงถือว่าเป็นชื่อรายการที่ใช้ได้
      if (/[A-Za-zก-๙]/.test(memo)) return memo;
    }
    return "";
  }

  function getMemoFinanceCategory(memo, categories, type) {
    if (!memo) return getDefaultFinanceCategory(categories, type);

    // ใช้กติกา keyword เดียวกับการพิมพ์รายรับ-รายจ่ายด้วยข้อความ
    // และรับเฉพาะหมวดที่มีชนิดตรงกับทิศทางเงินในสลิป
    var analysis = parseFinanceMessage(memo + " 1", categories || []);
    if (analysis && analysis.category) {
      var list = categories || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].name === analysis.category && list[i].type === type) return list[i].name;
      }
    }
    return getDefaultFinanceCategory(categories, type);
  }

  function parseFinanceSlip(text, categories, fallbackDate) {
    var amount = findSlipAmount(text);
    if (!amount) return null;
    var type = inferSlipType(text);
    var memo = findSlipMemo(text);
    var counterparty = findSlipCounterparty(text, type);
    var title = type === "รายรับ" ? "รับเงินจากสลิป" : "โอนเงินจากสลิป";
    if (memo) title = memo;
    else if (counterparty) title += " - " + counterparty;
    var reference = findReferenceNumber(text);
    var noteParts = ["บันทึกจากสลิป LINE"];
    if (reference) noteParts.push("เลขอ้างอิง: " + reference);
    return {
      title: title,
      amount: amount,
      type: type,
      category: getMemoFinanceCategory(memo, categories, type),
      date: findSlipDate(text, fallbackDate),
      note: noteParts.join(" | "),
    };
  }

  function buildFinanceScopeQuestion(records) {
    var itemSummary = records.map(function(record) {
      return record.title + " ฿" + Number(record.amount).toLocaleString("th-TH");
    }).join("\n");
    return makeQuickReplyMessage(
      "พบ " + records.length + " รายการ\n" + itemSummary + "\n\nเป็นค่าใช้จ่ายส่วนไหนคะ",
      [
        { type: "message", label: "ส่วนตัว", text: "ส่วนตัว" },
        { type: "message", label: "ที่ทำงาน", text: "ที่ทำงาน" },
      ]
    );
  }

  function normalizeThaiDigits(text) {
    var thaiDigits = "๐๑๒๓๔๕๖๗๘๙";
    return String(text || "").replace(/[๐-๙]/g, function(digit) {
      return String(thaiDigits.indexOf(digit));
    });
  }

  function thaiNumberWordsToNumber(words) {
    var tokens = String(words || "").match(/ศูนย์|หนึ่ง|เอ็ด|สอง|ยี่|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|ร้อย|พัน|หมื่น|แสน|ล้าน/g) || [];
    if (tokens.length === 0) return 0;
    var digits = { "ศูนย์": 0, "หนึ่ง": 1, "เอ็ด": 1, "สอง": 2, "ยี่": 2, "สาม": 3, "สี่": 4, "ห้า": 5, "หก": 6, "เจ็ด": 7, "แปด": 8, "เก้า": 9 };
    var units = { "สิบ": 10, "ร้อย": 100, "พัน": 1000, "หมื่น": 10000, "แสน": 100000 };
    var total = 0;
    var group = 0;
    var digit = 0;
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      if (digits.hasOwnProperty(token)) {
        digit = digits[token];
      } else if (token === "ล้าน") {
        total += (group + digit || 1) * 1000000;
        group = 0;
        digit = 0;
      } else {
        group += (digit || 1) * units[token];
        digit = 0;
      }
    }
    return total + group + digit;
  }

  function findFinanceAmount(text) {
    var original = String(text || "");
    var normalized = normalizeThaiDigits(original);
    var digitMatches = normalized.match(/\d+(?:\.\d+)?/g);
    if (digitMatches && digitMatches.length > 0) {
      var amountText = digitMatches[digitMatches.length - 1];
      var amount = parseFloat(amountText);
      if (!isNaN(amount) && amount > 0) {
        var start = normalized.lastIndexOf(amountText);
        return { amount: amount, start: start, end: start + amountText.length };
      }
    }

    // รองรับคำพูด เช่น "ค่ากาแฟห้าสิบบาท" โดยใช้คำที่อยู่ติดกับคำว่า "บาท" เท่านั้น
    var spokenPattern = /((?:(?:ศูนย์|หนึ่ง|เอ็ด|สอง|ยี่|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|ร้อย|พัน|หมื่น|แสน|ล้าน)\s*)+)\s*บาท/g;
    var spokenMatch;
    var lastSpokenMatch = null;
    while ((spokenMatch = spokenPattern.exec(original)) !== null) lastSpokenMatch = spokenMatch;
    if (lastSpokenMatch) {
      var spokenAmount = thaiNumberWordsToNumber(lastSpokenMatch[1]);
      if (spokenAmount > 0) {
        return {
          amount: spokenAmount,
          start: lastSpokenMatch.index,
          end: lastSpokenMatch.index + lastSpokenMatch[1].length,
        };
      }
    }
    return null;
  }

  function parseFinanceMessage(text, categories) {
    var t = String(text || "").trim();
    if (!t) return null;

    var amountInfo = findFinanceAmount(t);
    if (!amountInfo) return null;
    var amount = amountInfo.amount;
    var afterAmount = t.slice(amountInfo.end);
    var currency = afterAmount.match(/^\s*(?:บาท|baht|THB|฿)/i);
    var removeEnd = amountInfo.end + (currency ? currency[0].length : 0);
    // บางแอปถอดเสียง/สลิปใส่สัญลักษณ์สกุลเงินไว้ก่อนยอด เช่น ฿60
    // จึงลบสัญลักษณ์ที่ติดอยู่หน้าตัวเลขออกจากชื่อรายการด้วย
    var titleBeforeAmount = t.slice(0, amountInfo.start).replace(/(?:฿|THB)\s*$/i, "");
    var title = (titleBeforeAmount + t.slice(removeEnd))
      .replace(/\s+/g, " ")
      .trim();
    if (!title) title = "ไม่ระบุรายการ";

    var lowerT = t.toLowerCase();

    var categoryKeywords = {
      ค่าอาหาร: [
        "ข้าว",
        "อาหาร",
        "ก๋วยเตี๋ยว",
        "มาม่า",
        "กาแฟ",
        "น้ำ",
        "ขนม",
        "ส้มตำ",
        "ไก่",
        "หมู",
        "ปลา",
        "กุ้ง",
        "ผัก",
        "ผลไม้",
        "แกง",
        "ผัด",
        "ทอด",
        "นึ่ง",
        "สเต็ก",
        "พิซซ่า",
        "แฮมเบอร์เกอร์",
        "ชาบู",
        "ปิ้งย่าง",
        "บุฟเฟ่ต์",
        "อาหารเช้า",
        "อาหารเที่ยง",
        "อาหารเย็น",
        "ของหวาน",
        "ไอศกรีม",
        "เบเกอรี่",
        "ขนมปัง",
        "โจ๊ก",
        "ตำ",
        "ยำ",
        "หมูกระทะ",
        "หมูกรอบ",
        "กะเพรา",
        "ข้าวผัด",
        "ราเมง",
        "ซูชิ",
        "บะหมี่",
        "เตี๋ยว",
        "สปาเกตตี้",
      ],
      ค่าเดินทาง: [
        "แท็กซี่",
        "taxi",
        "grab",
        "bolt",
        "รถ",
        "บขส",
        "รถไฟ",
        "bts",
        "mrt",
        "brt",
        "เรือ",
        "น้ำมัน",
        "ดีเซล",
        "เบนซิน",
        "ที่จอดรถ",
        "ทางด่วน",
        "ตั๋ว",
        "เครื่องบิน",
        "สนามบิน",
        "วินมอเตอร์ไซค์",
        "มอเตอร์ไซค์",
        "รถเมล์",
        "รถตู้",
        "รถทัวร์",
        "รถไฟฟ้า",
        "สายการบิน",
        "เดินทาง",
        "ตรวจ",
        "ป้าย",
      ],
      ค่าไฟฟ้า: [
        "ไฟฟ้า",
        "ประปา",
        "อินเทอร์เน็ต",
        "เน็ต",
        "ค่าน้ำ",
        "ค่าไฟ",
        "โทรศัพท์",
        "มือถือ",
        "ค่าโทร",
        "wifi",
        "อินเตอร์เน็ต",
        "สมาร์ทโฟน",
        "ซิม",
        "รายเดือน",
        "บิล",
        "ค่าสมาชิก",
        "subscription",
        "netflix",
        "spotify",
        "youtube",
        "disney",
        "ค่าห้อง",
        "ค่าเช่า",
      ],
      ช้อปปิ้ง: [
        "ซื้อ",
        "ช้อป",
        "shopee",
        "lazada",
        "เสื้อ",
        "กางเกง",
        "รองเท้า",
        "ถุงเท้า",
        "หมวก",
        "กระเป๋า",
        "ของใช้",
        "ของขวัญ",
        "เครื่องสำอาง",
        "อิเล็กทรอนิกส์",
        "โทรศัพท์",
        "คอมพิวเตอร์",
        "แก็ดเจ็ต",
        "ของเล่น",
        "เฟอร์นิเจอร์",
        "เครื่องใช้ไฟฟ้า",
        "หนังสือ",
        "อุปกรณ์",
        "อุปกรณ์สำนักงาน",
        "เครื่องเขียน",
        "สบู่",
        "ยาสีฟัน",
        "แชมพู",
        "ทิชชู่",
        "กระดาษ",
        "เครื่องครัว",
      ],
    };

    function categoryNameExists(name) {
      for (var i = 0; i < categories.length; i++) {
        if (categories[i].name === name) return true;
      }
      return false;
    }

    function findCategoryByKeywords(typeFilter) {
      for (var catName in categoryKeywords) {
        if (!categoryKeywords.hasOwnProperty(catName)) continue;
        if (!categoryNameExists(catName)) continue;
        var keywords = categoryKeywords[catName];
        for (var i = 0; i < keywords.length; i++) {
          if (lowerT.indexOf(keywords[i].toLowerCase()) >= 0) {
            for (var j = 0; j < categories.length; j++) {
              if (
                categories[j].name === catName &&
                (!typeFilter || categories[j].type === typeFilter)
              ) {
                return categories[j];
              }
            }
          }
        }
      }
      return null;
    }

    // 1) ตรงชื่อหมวดหมู่พอดี
    var matchedCat = null;
    for (var i = 0; i < categories.length; i++) {
      if (t.indexOf(categories[i].name) >= 0) {
        matchedCat = categories[i];
        break;
      }
    }

    // 2) ถ้าไม่ตรง ลองเดาจาก keyword
    if (!matchedCat) {
      matchedCat = findCategoryByKeywords();
    }

    var type = "";
    var categoryName = "";
    if (matchedCat) {
      type = matchedCat.type || "รายจ่าย";
      categoryName = matchedCat.name;
    } else {
      var incomeKeywords = [
        "เงินเดือน",
        "รายรับ",
        "ได้รับ",
        "โบนัส",
        "คืนเงิน",
        "ดอกเบี้ย",
        "ขาย",
        "รับ",
        "ให้เงิน",
        "รับเงิน",
        "ได้เงิน",
        "เงินเข้า",
        "โอนเงินเข้า",
      ];
      var isIncome = false;
      for (var i = 0; i < incomeKeywords.length; i++) {
        if (t.indexOf(incomeKeywords[i]) >= 0) {
          isIncome = true;
          break;
        }
      }
      type = isIncome ? "รายรับ" : "รายจ่าย";

      var fallbackName = "อื่นๆ";
      for (var i = 0; i < categories.length; i++) {
        if (
          categories[i].type === type &&
          categories[i].name === fallbackName
        ) {
          categoryName = categories[i].name;
          break;
        }
      }
      if (!categoryName) {
        for (var i = 0; i < categories.length; i++) {
          if (categories[i].name === fallbackName) {
            categoryName = categories[i].name;
            break;
          }
        }
      }
      if (!categoryName) categoryName = fallbackName;
    }

    return { title: title, amount: amount, type: type, category: categoryName };
  }

  /**
   * แยกรายการที่พูดต่อกันโดยไม่มีจุลภาค เช่น
   * "ค่ากาแฟห้าสิบบาท ค่ารถไฟฟ้าสี่สิบบาท ค่าอาหาร ฿60"
   *
   * ใช้ยอดเงินที่ตามด้วยหน่วยเงินเป็นขอบเขตหลัก ส่วนตัวเลขเปล่าจะใช้ได้
   * เมื่ออยู่ท้ายข้อความ หรือรายการถัดไปขึ้นต้นด้วยคำที่พบได้บ่อย เพื่อไม่ให้
   * แยกเลขอื่นในชื่อรายการ (เช่น "ซื้อ 2 ชิ้น 50 บาท") โดยผิดพลาด
   */
  function splitFinanceSegmentByAmount(text) {
    var raw = String(text || "").trim();
    if (!raw) return [];

    var thaiNumberWord = "(?:ศูนย์|หนึ่ง|เอ็ด|สอง|ยี่|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|ร้อย|พัน|หมื่น|แสน|ล้าน)";
    var nextItemPrefix = "(?:ค่า|เงิน|ซื้อ|จ่าย|เติม|โอน|รับ|อาหาร|กาแฟ|รถ|น้ำ|บิล|โทรศัพท์|แท็กซี่|ช้อป|grab|taxi)";
    var amountBoundary = new RegExp(
      "(?:" +
        "(?:(?:฿\\s*|THB\\s*)\\d+(?:,\\d{3})*(?:\\.\\d+)?|\\d+(?:,\\d{3})*(?:\\.\\d+)?\\s*(?:บาท|baht|THB|฿))" +
        "|(?:" + thaiNumberWord + "\\s*)+\\s*บาท" +
        "|\\d+(?:,\\d{3})*(?:\\.\\d+)?(?=\\s+(?=" + nextItemPrefix + ")|\\s*$)" +
      ")",
      "gi"
    );

    var boundaries = [];
    var match;
    while ((match = amountBoundary.exec(raw)) !== null) {
      boundaries.push(match.index + match[0].length);
    }

    // มีขอบเขตเดียวก็ยังเป็นเพียงรายการเดียว ไม่ต้องเปลี่ยนข้อความเดิม
    if (boundaries.length < 2) return [raw];

    var segments = [];
    var start = 0;
    for (var i = 0; i < boundaries.length; i++) {
      var segment = raw
        .slice(start, boundaries[i])
        .replace(/[\s,;]+$/, "")
        .replace(/^(?:และ|กับ|แล้วก็)\s*/, "")
        .trim();
      if (segment) segments.push(segment);
      start = boundaries[i];
    }

    // เก็บข้อความที่ตามหลังยอดสุดท้ายไว้กับรายการสุดท้าย แทนที่จะทิ้งไป
    var trailingText = raw.slice(start).trim();
    if (trailingText && segments.length > 0) {
      segments[segments.length - 1] += " " + trailingText;
    }
    return segments.length > 0 ? segments : [raw];
  }

  function parseFinanceItems(text, categories) {
    var raw = String(text || "").trim();
    if (!raw) return null;
    var delimitedSegments = raw
      .split(/,|\n/)
      .map(function (s) {
        return String(s).trim();
      })
      .filter(function (s) {
        return s;
      });
    var segments = [];
    for (var i = 0; i < delimitedSegments.length; i++) {
      segments = segments.concat(splitFinanceSegmentByAmount(delimitedSegments[i]));
    }
    var records = [];
    for (var j = 0; j < segments.length; j++) {
      var rec = parseFinanceMessage(segments[j], categories);
      if (rec) records.push(rec);
    }
    return records.length > 0 ? records : null;
  }

  function getWebAppUrl(settings) {
    return settings.WEB_APP_URL || DEFAULT_WEB_APP_URL;
  }

  function getUserStateKey(userId) {
    return "USER_STATE_" + userId;
  }

  function getUserState(userId) {
    if (!userId) return null;
    try {
      var props = PropertiesService.getScriptProperties();
      var json = props.getProperty(getUserStateKey(userId));
      if (json) return JSON.parse(json);
    } catch (e) {
      LogService.logEvent(
        "USER_STATE_ERROR",
        userId,
        "getUserState failed",
        e.message,
      );
    }
    return null;
  }

  function setUserState(userId, state) {
    if (!userId) return;
    try {
      PropertiesService.getScriptProperties().setProperty(
        getUserStateKey(userId),
        JSON.stringify(state),
      );
    } catch (e) {
      LogService.logEvent(
        "USER_STATE_ERROR",
        userId,
        "setUserState failed",
        e.message,
      );
    }
  }

  function clearUserState(userId) {
    if (!userId) return;
    try {
      PropertiesService.getScriptProperties().deleteProperty(
        getUserStateKey(userId),
      );
    } catch (e) {
      LogService.logEvent(
        "USER_STATE_ERROR",
        userId,
        "clearUserState failed",
        e.message,
      );
    }
  }

  function makeQuickReplyMessage(text, actions) {
    return {
      type: "text",
      text: text,
      quickReply: {
        items: actions.map(function (a) {
          return { type: "action", action: a };
        }),
      },
    };
  }

  function todayStrInTz(tz) {
    return Utilities.formatDate(
      new Date(),
      tz || Session.getScriptTimeZone(),
      "yyyy-MM-dd",
    );
  }

  function isValidDate(str) {
    if (!str) return false;
    return /^\d{4}-\d{2}-\d{2}$/.test(str);
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function parseThaiDateInput(text) {
    var s = String(text || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) {
      var dd = pad2(parseInt(m[1], 10));
      var mm = pad2(parseInt(m[2], 10));
      var yyyy = parseInt(m[3], 10);
      if (yyyy > 2400) yyyy -= 543;
      return yyyy + "-" + mm + "-" + dd;
    }
    return null;
  }

  var TIMED_REMINDER_OPTIONS = [
    { value: 0, label: "ตรงเวลา" },
    { value: 5, label: "ก่อน 5 นาที" },
    { value: 15, label: "ก่อน 15 นาที" },
    { value: 30, label: "ก่อน 30 นาที" },
    { value: 60, label: "ก่อน 1 ชั่วโมง" },
    { value: 120, label: "ก่อน 2 ชั่วโมง" },
    { value: 1440, label: "ก่อน 1 วัน" },
    { value: 2880, label: "ก่อน 2 วัน" },
    { value: 10080, label: "ก่อน 1 สัปดาห์" },
  ];

  var ALL_DAY_REMINDER_OPTIONS = [
    { value: 0, label: "ตรงเวลา (08:00)" },
    { value: 1440, label: "ก่อนหนึ่งวัน (08:00)" },
    { value: 2880, label: "ก่อน 2 วัน (08:00)" },
    { value: 10080, label: "ก่อน 1 สัปดาห์" },
  ];

  function getAvailableReminderOptions(state) {
    var baseOptions = state.data.is_all_day
      ? ALL_DAY_REMINDER_OPTIONS
      : TIMED_REMINDER_OPTIONS;
    var now = new Date();
    var baseTime = state.data.is_all_day
      ? "08:00"
      : state.data.due_time || "08:00";
    var taskDateTime = new Date(state.data.task_date + "T" + baseTime);
    if (isNaN(taskDateTime.getTime())) return baseOptions;
    return baseOptions.filter(function (opt) {
      var reminderTime = new Date(taskDateTime.getTime() - opt.value * 60000);
      return reminderTime >= now;
    });
  }

  function normalizeTime(str) {
    if (!str || str === "-" || str === "ไม่ระบุ") return "";
    var s = String(str).trim().replace(/\./g, ":");
    if (/^([01]?\d|2[0-3]):([0-5]\d)$/.test(s)) return s;
    return null;
  }

  function thaiDateFromKeyword(text, tz) {
    var today = todayStrInTz(tz);
    if (text === "วันนี้") return today;
    if (text === "พรุ่งนี้") {
      var d = new Date(today + "T00:00:00");
      d.setDate(d.getDate() + 1);
      return Utilities.formatDate(
        d,
        tz || Session.getScriptTimeZone(),
        "yyyy-MM-dd",
      );
    }
    if (text === "เมื่อวาน") {
      var d2 = new Date(today + "T00:00:00");
      d2.setDate(d2.getDate() - 1);
      return Utilities.formatDate(
        d2,
        tz || Session.getScriptTimeZone(),
        "yyyy-MM-dd",
      );
    }
    var parsed = parseThaiDateInput(text);
    if (parsed) return parsed;
    return text;
  }

  function buildExpenseGuideFlex() {
    return {
      type: "flex",
      altText: "พิมพ์เพื่อจดค่าใช้จ่ายได้เลย",
      contents: {
        type: "bubble",
        size: "kilo",
        styles: {
          header: { backgroundColor: "#FFF7ED" },
          body: { backgroundColor: "#FFFFFF" },
        },
        header: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          paddingAll: "lg",
          contents: [
            {
              type: "text",
              text: "จดรายรับ-รายจ่าย",
              weight: "bold",
              size: "lg",
              color: "#111827",
            },
            {
              type: "text",
              text: "พิมพ์เพื่อจดค่าใช้จ่ายได้เลย",
              size: "xs",
              color: "#6B7280",
            },
          ],
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          paddingAll: "lg",
          contents: [
            {
              type: "text",
              text: "พิมพ์เพื่อจดค่าใช้จ่ายได้เลย",
              size: "sm",
              color: "#374151",
              wrap: true,
            },
            {
              type: "text",
              text: "• ข้าวไข่เจียว 20\n• เงินเดือน 20000\n• ข้าวไข่เจียว 20, น้ำแตงโมปั่น 40",
              size: "sm",
              color: "#374151",
              wrap: true,
            },
            { type: "separator", margin: "md" },
            {
              type: "text",
              text: "ระบบจะจดรายการและจัดประเภทให้อัตโนมัติค่ะ",
              size: "xs",
              color: "#6B7280",
              wrap: true,
            },
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          paddingAll: "lg",
          contents: [
            {
              type: "button",
              style: "primary",
              color: "#10B981",
              action: { type: "message", label: "จดเลย", text: "จดค่าใช้จ่าย" },
            },
          ],
        },
      },
    };
  }

  function buildTaskFlex(mode, task, webAppUrl) {
    var dashboardUrl = webAppUrl || DEFAULT_WEB_APP_URL;
    var editUrl =
      dashboardUrl +
      (dashboardUrl.indexOf("?") >= 0 ? "&" : "?") +
      "openExternalBrowser=1&editTaskId=" +
      encodeURIComponent(task.task_id);

    var priorityMap = { Low: "ต่ำ", Medium: "กลาง", High: "สูง" };
    var priorityText = priorityMap[task.priority] || task.priority || "-";
    var timeText = task.is_all_day ? "ทั้งวัน" : (task.due_time || "-");
    if (!task.is_all_day && task.end_time && task.end_time !== "-")
      timeText += " - " + task.end_time;
    var remindText =
      Number(task.remind_before_m || 0) === 0
        ? "ตรงเวลา"
        : "ก่อน " + String(task.remind_before_m) + " นาที";
    var notifyTargetText = "เฉพาะฉัน";
    if (task.notify_group) {
      var notifyIds = String(task.notify_group_ids || "").trim();
      if (notifyIds === "__all__") {
        notifyTargetText = "ฉันและทุกกลุ่ม LINE";
      } else if (notifyIds) {
        var groups = SettingsService.getLineGroups();
        var selectedNames = notifyIds
          .split(",")
          .map(function (s) { return s.trim(); })
          .filter(function (s) { return s; })
          .map(function (id) {
            var g = null;
            for (var i = 0; i < groups.length; i++) {
              if (groups[i].group_id === id) { g = groups[i]; break; }
            }
            return g ? g.name : id;
          });
        notifyTargetText = selectedNames.length ? "ฉันและ " + selectedNames.join(", ") : "ฉันและกลุ่ม LINE";
      } else {
        notifyTargetText = "ฉันและกลุ่ม LINE";
      }
    }
    var noteText = task.note || "-";

    var headerTitle = mode === "confirm" ? "ยืนยันภารกิจ 📋" : "ภารกิจใหม่ ✅";
    var bodyContents = [
      {
        type: "text",
        text: task.task_name,
        weight: "bold",
        size: "lg",
        color: "#111827",
        wrap: true,
      },
      { type: "separator", margin: "md" },
      {
        type: "box",
        layout: "horizontal",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "🗓️ วันที่",
            flex: 2,
            size: "sm",
            color: "#6B7280",
          },
          {
            type: "text",
            text: task.task_date || "-",
            flex: 4,
            size: "sm",
            color: "#111827",
            weight: "bold",
            align: "end",
          },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "⏰ เวลา",
            flex: 2,
            size: "sm",
            color: "#6B7280",
          },
          {
            type: "text",
            text: timeText,
            flex: 4,
            size: "sm",
            color: "#111827",
            weight: "bold",
            align: "end",
          },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "🏷️ หมวดหมู่",
            flex: 2,
            size: "sm",
            color: "#6B7280",
          },
          {
            type: "text",
            text: task.category || "-",
            flex: 4,
            size: "sm",
            color: "#111827",
            weight: "bold",
            align: "end",
          },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "⭐ ความสำคัญ",
            flex: 2,
            size: "sm",
            color: "#6B7280",
          },
          {
            type: "text",
            text: priorityText,
            flex: 4,
            size: "sm",
            color: "#111827",
            weight: "bold",
            align: "end",
          },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "⏳ การเตือน",
            flex: 2,
            size: "sm",
            color: "#6B7280",
          },
          {
            type: "text",
            text: remindText,
            flex: 4,
            size: "sm",
            color: "#111827",
            weight: "bold",
            align: "end",
          },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "📢 เป้าหมาย",
            flex: 2,
            size: "sm",
            color: "#6B7280",
          },
          {
            type: "text",
            text: notifyTargetText,
            flex: 4,
            size: "sm",
            color: "#111827",
            weight: "bold",
            align: "end",
          },
        ],
      },
    ];
    if (noteText && noteText !== "-") {
      bodyContents.push({ type: "separator", margin: "md" });
      bodyContents.push({
        type: "text",
        text: "หมายเหตุ",
        size: "sm",
        color: "#6B7280",
      });
      bodyContents.push({
        type: "text",
        text: noteText,
        size: "sm",
        color: "#374151",
        wrap: true,
      });
    }

    var footer = null;
    if (mode === "confirm") {
      footer = {
        type: "box",
        layout: "horizontal",
        spacing: "md",
        paddingAll: "lg",
        contents: [
          {
            type: "button",
            style: "secondary",
            height: "sm",
            flex: 1,
            action: {
              type: "postback",
              label: "❌ ยกเลิก",
              data: "action=confirmTask&confirm=no",
            },
          },
          {
            type: "button",
            style: "primary",
            height: "sm",
            color: "#10B981",
            flex: 1,
            action: {
              type: "postback",
              label: "✅ บันทึก",
              data: "action=confirmTask&confirm=yes",
            },
          },
        ],
      };
    } else if (mode === "created") {
      footer = {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "lg",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            spacing: "md",
            contents: [
              {
                type: "button",
                style: "secondary",
                height: "sm",
                flex: 1,
                action: { type: "uri", label: "✏️ แก้ไข", uri: editUrl },
              },
              {
                type: "button",
                style: "primary",
                height: "sm",
                color: "#EF4444",
                flex: 1,
                action: {
                  type: "postback",
                  label: "🗑️ ลบ",
                  data: "action=deleteTask&task_id=" + task.task_id,
                },
              },
            ],
          },
          {
            type: "button",
            style: "primary",
            height: "sm",
            color: "#10B981",
            action: {
              type: "postback",
              label: "✅ ทำเสร็จแล้ว",
              data: "action=completeTask&task_id=" + task.task_id,
            },
          },
        ],
      };
    }

    var bubble = {
      type: "bubble",
      styles: {
        header: { backgroundColor: "#ECFDF5" },
        body: { backgroundColor: "#FFFFFF" },
      },
      header: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "lg",
        contents: [
          {
            type: "text",
            text: headerTitle,
            weight: "bold",
            size: "lg",
            color: "#111827",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        paddingAll: "lg",
        contents: bodyContents,
      },
    };
    if (footer) bubble.footer = footer;

    return {
      type: "flex",
      altText: headerTitle + " " + task.task_name,
      contents: bubble,
    };
  }

  function buildTaskDoneFlex(task, undo) {
    var headerTitle = undo
      ? "ยกเลิกสถานะเสร็จสิ้น ❌"
      : "ได้ทำภารกิจเสร็จสิ้นแล้ว 🎉";
    var buttonData = undo
      ? "action=completeTask&task_id=" + task.task_id
      : "action=undoCompleteTask&task_id=" + task.task_id;
    var buttonLabel = undo ? "ทำเสร็จแล้ว" : "ยังทำไม่เสร็จ";
    return {
      type: "flex",
      altText: headerTitle,
      contents: {
        type: "bubble",
        styles: {
          header: { backgroundColor: undo ? "#FEE2E2" : "#ECFDF5" },
          body: { backgroundColor: "#FFFFFF" },
        },
        header: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          paddingAll: "lg",
          contents: [
            {
              type: "text",
              text: headerTitle,
              weight: "bold",
              size: "lg",
              color: "#111827",
            },
          ],
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          paddingAll: "lg",
          contents: [
            {
              type: "text",
              text: task.task_name,
              weight: "bold",
              size: "md",
              color: "#111827",
              wrap: true,
            },
            {
              type: "text",
              text:
                "วันที่: " +
                (task.task_date || "-") +
                " | เวลา: " +
                (task.due_time || "-"),
              size: "sm",
              color: "#6B7280",
            },
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          paddingAll: "lg",
          contents: [
            {
              type: "button",
              style: undo ? "primary" : "secondary",
              height: "sm",
              color: undo ? "#10B981" : undefined,
              action: {
                type: "postback",
                label: buttonLabel,
                data: buttonData,
              },
            },
          ],
        },
      },
    };
  }

  function buildTaskDeletedFlex(taskName) {
    return {
      type: "flex",
      altText: "ลบภารกิจ " + taskName + " เรียบร้อยแล้ว",
      contents: {
        type: "bubble",
        styles: {
          header: { backgroundColor: "#FEE2E2" },
          body: { backgroundColor: "#FFFFFF" },
        },
        header: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          paddingAll: "lg",
          contents: [
            {
              type: "text",
              text: "ลบภารกิจเรียบร้อยแล้ว",
              weight: "bold",
              size: "lg",
              color: "#111827",
            },
          ],
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          paddingAll: "lg",
          contents: [
            { type: "text", text: "ลบภารกิจ", size: "sm", color: "#6B7280" },
            {
              type: "text",
              text: taskName,
              weight: "bold",
              size: "md",
              color: "#111827",
              wrap: true,
            },
            {
              type: "text",
              text: "เรียบร้อยแล้ว",
              size: "sm",
              color: "#6B7280",
            },
          ],
        },
      },
    };
  }

  function buildFinanceFlex(mode, record, webAppUrl) {
    var dashboardUrl = webAppUrl || DEFAULT_WEB_APP_URL;
    var editUrl =
      dashboardUrl +
      (dashboardUrl.indexOf("?") >= 0 ? "&" : "?") +
      "openExternalBrowser=1&editFinanceId=" +
      encodeURIComponent(record.transaction_id);

    var headerTitle = "";
    var headerSub = "";
    if (mode === "created") {
      headerTitle = "จดสำเร็จ ✅";
      headerSub = "อย่าลืมตรวจสอบรายการทั้งหมดด้วยนะคะ";
    } else if (mode === "updated") {
      headerTitle = "แก้ไขสำเร็จ ✏️";
      headerSub = "ป้ายกันให้แล้วค่ะ ตรวจสอบอีกทีนะคะ";
    } else if (mode === "deleted") {
      headerTitle = "ลบสำเร็จ ❌";
      headerSub = "รายการถูกลบเรียบร้อยแล้วค่ะ";
    }

    var typeLabel = record.type || "รายจ่าย";
    var categoryLabel = record.category || "อื่นๆ";
    var titleText = record.title || "ไม่ระบุรายการ";
    var amountText = "฿" + Number(record.amount || 0).toLocaleString("th-TH");
    var dateText = record.created_at ? record.created_at : record.date || "";
    var showActions = mode === "created" || mode === "updated";

    var bodyContents = [
      {
        type: "text",
        text: typeLabel + " - " + categoryLabel,
        size: "sm",
        color: "#EC4899",
        weight: "bold",
      },
      { type: "separator", margin: "md" },
      {
        type: "box",
        layout: "horizontal",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: titleText,
            flex: 3,
            size: "md",
            color: "#111827",
            wrap: true,
          },
          {
            type: "text",
            text: amountText,
            flex: 1,
            size: "lg",
            color: "#EC4899",
            weight: "bold",
            align: "end",
          },
        ],
      },
      {
        type: "text",
        text: dateText,
        size: "xs",
        color: "#9CA3AF",
        margin: "sm",
      },
    ];

    if (showActions) {
      bodyContents.push({ type: "separator", margin: "md" });
      bodyContents.push({
        type: "box",
        layout: "horizontal",
        spacing: "md",
        contents: [
          {
            type: "button",
            style: "secondary",
            height: "sm",
            flex: 1,
            action: { type: "uri", label: "✏️ แก้ไข", uri: editUrl },
          },
          {
            type: "button",
            style: "primary",
            height: "sm",
            color: "#EF4444",
            flex: 1,
            action: {
              type: "postback",
              label: "🗑️ ลบ",
              data:
                "action=deleteFinance&transaction_id=" + record.transaction_id,
            },
          },
        ],
      });
    }

    return {
      type: "flex",
      altText: headerTitle + " " + titleText + " " + amountText,
      contents: {
        type: "bubble",
        styles: {
          header: { backgroundColor: "#FFF7ED" },
          body: { backgroundColor: "#FFFFFF" },
        },
        header: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          paddingAll: "lg",
          contents: [
            {
              type: "text",
              text: headerTitle,
              weight: "bold",
              size: "lg",
              color: "#111827",
            },
            { type: "text", text: headerSub, size: "xs", color: "#6B7280" },
          ],
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          paddingAll: "lg",
          contents: bodyContents,
        },
      },
    };
  }

  function buildFinanceSummaryFlex(records, webAppUrl) {
    var dashboardUrl = webAppUrl || DEFAULT_WEB_APP_URL;
    var incomeColor = "#10B981";
    var expenseColor = "#EF4444";

    var groups = {};
    var incomeTotal = 0;
    var expenseTotal = 0;
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      var key = (rec.type || "รายจ่าย") + " - " + (rec.category || "อื่นๆ");
      if (!groups[key]) {
        groups[key] = {
          type: rec.type || "รายจ่าย",
          category: rec.category || "อื่นๆ",
          records: [],
          total: 0,
        };
      }
      groups[key].records.push(rec);
      groups[key].total += Number(rec.amount || 0);
      if ((rec.type || "รายจ่าย") === "รายรับ") {
        incomeTotal += Number(rec.amount || 0);
      } else {
        expenseTotal += Number(rec.amount || 0);
      }
    }

    var bodyContents = [];
    for (var key in groups) {
      if (!groups.hasOwnProperty(key)) continue;
      var g = groups[key];
      var isIncome = g.type === "รายรับ";
      var groupColor = isIncome ? incomeColor : expenseColor;

      bodyContents.push({
        type: "text",
        text: g.type + " - " + g.category,
        size: "sm",
        weight: "bold",
        color: groupColor,
      });

      for (var j = 0; j < g.records.length; j++) {
        var rec = g.records[j];
        var editUrl =
          dashboardUrl +
          (dashboardUrl.indexOf("?") >= 0 ? "&" : "?") +
          "openExternalBrowser=1&editFinanceId=" +
          encodeURIComponent(rec.transaction_id);

        bodyContents.push({
          type: "box",
          layout: "vertical",
          spacing: "sm",
          margin: "sm",
          contents: [
            {
              type: "box",
              layout: "horizontal",
              spacing: "md",
              alignItems: "center",
              contents: [
                {
                  type: "text",
                  text: rec.title || "ไม่ระบุรายการ",
                  flex: 3,
                  size: "sm",
                  color: "#111827",
                  wrap: true,
                },
                {
                  type: "text",
                  text: "฿" + Number(rec.amount || 0).toLocaleString("th-TH"),
                  flex: 2,
                  size: "md",
                  color: groupColor,
                  weight: "bold",
                  align: "end",
                },
              ],
            },
            {
              type: "box",
              layout: "horizontal",
              spacing: "md",
              contents: [
                {
                  type: "button",
                  style: "secondary",
                  height: "sm",
                  flex: 1,
                  action: { type: "uri", label: "แก้ไข", uri: editUrl },
                },
                {
                  type: "button",
                  style: "primary",
                  height: "sm",
                  flex: 1,
                  color: "#EF4444",
                  action: {
                    type: "postback",
                    label: "ลบ",
                    data: "action=deleteFinance&transaction_id=" + rec.transaction_id,
                  },
                },
              ],
            },
          ],
        });

        if (rec.created_at) {
          bodyContents.push({
            type: "text",
            text: rec.created_at,
            size: "xs",
            color: "#9CA3AF",
            margin: "sm",
          });
        }
      }

      bodyContents.push({ type: "separator", margin: "md" });
    }

    if (incomeTotal > 0) {
      bodyContents.push({
        type: "box",
        layout: "horizontal",
        spacing: "md",
        margin: "lg",
        contents: [
          {
            type: "text",
            text: "รวมรายรับทั้งหมด",
            flex: 3,
            size: "md",
            weight: "bold",
            color: "#111827",
          },
          {
            type: "text",
            text: "฿" + Number(incomeTotal).toLocaleString("th-TH"),
            flex: 2,
            size: "lg",
            color: incomeColor,
            weight: "bold",
            align: "end",
          },
        ],
      });
    }

    if (expenseTotal > 0) {
      bodyContents.push({
        type: "box",
        layout: "horizontal",
        spacing: "md",
        margin: "lg",
        contents: [
          {
            type: "text",
            text: "รวมรายจ่ายทั้งหมด",
            flex: 3,
            size: "md",
            weight: "bold",
            color: "#111827",
          },
          {
            type: "text",
            text: "฿" + Number(expenseTotal).toLocaleString("th-TH"),
            flex: 2,
            size: "lg",
            color: expenseColor,
            weight: "bold",
            align: "end",
          },
        ],
      });
    }

    return {
      type: "flex",
      altText: "จดสำเร็จ รวม " + records.length + " รายการ",
      contents: {
        type: "bubble",
        styles: {
          header: { backgroundColor: "#FFF7ED" },
          body: { backgroundColor: "#FFFFFF" },
        },
        header: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          paddingAll: "lg",
          contents: [
            {
              type: "text",
              text: "จดสำเร็จ",
              weight: "bold",
              size: "lg",
              color: "#111827",
            },
            {
              type: "text",
              text: "อย่าลืมตรวจสอบรายการทั้งหมดด้วยนะคะ",
              size: "xs",
              color: "#6B7280",
            },
          ],
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          paddingAll: "lg",
          contents: bodyContents,
        },
      },
    };
  }

  function buildFinanceConfirmFlex(records, userId) {
    var incomeColor = "#10B981";
    var expenseColor = "#EF4444";
    var total = 0;
    var incomeTotal = 0;
    var expenseTotal = 0;
    var items = [];
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      var isIncome = (rec.type || "รายจ่าย") === "รายรับ";
      var color = isIncome ? incomeColor : expenseColor;
      total += Number(rec.amount || 0);
      if (isIncome) incomeTotal += Number(rec.amount || 0);
      else expenseTotal += Number(rec.amount || 0);
      items.push({
        type: "box",
        layout: "horizontal",
        spacing: "md",
        alignItems: "center",
        contents: [
          {
            type: "text",
            text: rec.title || "ไม่ระบุรายการ",
            flex: 3,
            size: "sm",
            color: "#111827",
            wrap: true,
          },
          {
            type: "text",
            text: "฿" + Number(rec.amount || 0).toLocaleString("th-TH"),
            flex: 2,
            size: "md",
            color: color,
            weight: "bold",
            align: "end",
          },
        ],
      });
      items.push({
        type: "text",
        text: "(" + (rec.type || "รายจ่าย") + " - " + (rec.category || "อื่นๆ") + ")",
        size: "xs",
        color: "#6B7280",
        margin: "sm",
      });
    }

    var totalContents = [];
    if (incomeTotal > 0) {
      totalContents.push({
        type: "text",
        text: "รวมรายรับ: ฿" + incomeTotal.toLocaleString("th-TH"),
        size: "sm",
        color: incomeColor,
        weight: "bold",
        align: "end",
      });
    }
    if (expenseTotal > 0) {
      totalContents.push({
        type: "text",
        text: "รวมรายจ่าย: ฿" + expenseTotal.toLocaleString("th-TH"),
        size: "sm",
        color: expenseColor,
        weight: "bold",
        align: "end",
      });
    }
    if (totalContents.length === 0) {
      totalContents.push({
        type: "text",
        text: "รวมทั้งหมด: ฿" + total.toLocaleString("th-TH"),
        size: "sm",
        color: "#111827",
        weight: "bold",
        align: "end",
      });
    }

    return {
      type: "flex",
      altText: "จดรายการนี้ใช่ไหมคะ?",
      contents: {
        type: "bubble",
        styles: {
          header: { backgroundColor: "#FFF7ED" },
          body: { backgroundColor: "#FFFFFF" },
          footer: { backgroundColor: "#FFFFFF" },
        },
        header: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          paddingAll: "lg",
          contents: [
            {
              type: "text",
              text: "จดรายการนี้ใช่ไหมคะ?",
              weight: "bold",
              size: "lg",
              color: "#111827",
            },
            {
              type: "text",
              text: "ตรวจสอบรายการแล้วกดบันทึกได้เลยค่ะ",
              size: "xs",
              color: "#6B7280",
            },
          ],
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          paddingAll: "lg",
          contents: items.concat([{ type: "separator", margin: "md" }]).concat(totalContents),
        },
        footer: {
          type: "box",
          layout: "horizontal",
          spacing: "md",
          paddingAll: "lg",
          contents: [
            {
              type: "button",
              style: "primary",
              color: "#10B981",
              height: "sm",
              flex: 1,
              action: {
                type: "postback",
                label: "บันทึก",
                data: "action=confirmFinance&confirm=yes",
              },
            },
            {
              type: "button",
              style: "secondary",
              height: "sm",
              flex: 1,
              action: {
                type: "postback",
                label: "ยกเลิก",
                data: "action=confirmFinance&confirm=no",
              },
            },
          ],
        },
      },
    };
  }

  function startTaskFlow(replyToken, userId) {
    setUserState(userId, { step: "name", data: {} });
    return {
      type: "text",
      text: "มาบันทึกภารกิจประจำวันกัน 📝\nพิมพ์ชื่อภารกิจได้เลย\nเช่น ประชุมทีม, นัดกินข้าวกับเพื่อน",
    };
  }

  function handleTaskFlow(replyToken, userId, text, settings, webAppUrl) {
    var state = getUserState(userId);
    LogService.logEvent(
      "TASK_FLOW",
      userId,
      "handle step " + (state ? state.step : "no-state"),
      JSON.stringify({ text: text, state: state }),
    );
    if (!state) return null;
    var tz = settings.TIMEZONE || Session.getScriptTimeZone();
    var t = String(text || "").trim();

    function reply(msg) {
      return Array.isArray(msg) ? msg : [msg];
    }

    if (state.step === "name") {
      if (!t) return reply({ type: "text", text: "กรุณาระบุชื่อภารกิจค่ะ" });
      state.data.task_name = t;
      state.step = "description";
      setUserState(userId, state);
      return reply(
        makeQuickReplyMessage("เพิ่มคำอธิบายภารกิจ ถ้าไม่มีกดข้ามได้เลย", [
          { type: "message", label: "ข้าม", text: "ข้าม" },
        ]),
      );
    }

    if (state.step === "description") {
      state.data.note = t === "ข้าม" ? "" : t;
      state.step = "date";
      setUserState(userId, state);
      return reply(
        makeQuickReplyMessage(
          "เป็นภารกิจของวันไหนคะ (วว-ดด-ปปปป) เช่น 01-05-2569\nแต่หากเป็นวันนี้หรือพรุ่งนี้ให้กดที่ด้านล่างได้เลยค่ะ",
          [
            { type: "message", label: "วันนี้", text: "วันนี้" },
            { type: "message", label: "พรุ่งนี้", text: "พรุ่งนี้" },
          ],
        ),
      );
    }

    if (state.step === "date") {
      var dateStr = thaiDateFromKeyword(t, tz);
      if (!isValidDate(dateStr))
        return reply({
          type: "text",
          text: 'รูปแบบวันที่ไม่ถูกต้อง กรุณาระบุเป็น วว-ดด-ปปปป เช่น 01-05-2569 หรือพิมพ์ "วันนี้"',
        });
      state.data.task_date = dateStr;
      state.step = "startTime";
      setUserState(userId, state);
      return reply(
        makeQuickReplyMessage(
          "ระบุเวลาเริ่ม ตัวอย่าง 14.00 หากเป็นภารกิจทั้งวัน ให้กดด้านล่างได้เลยค่ะ",
          [
            { type: "message", label: "09.00", text: "09.00" },
            { type: "message", label: "13.00", text: "13.00" },
            { type: "message", label: "17.00", text: "17.00" },
            { type: "message", label: "ทั้งวัน", text: "ทั้งวัน" },
          ],
        ),
      );
    }

    if (state.step === "startTime") {
      if (t === "ทั้งวัน") {
        state.data.is_all_day = true;
        state.data.due_time = "08:00";
        state.step = "priority";
        setUserState(userId, state);
        return reply(
          makeQuickReplyMessage("ระบุระดับความสำคัญ", [
            { type: "message", label: "สูง", text: "สูง" },
            { type: "message", label: "กลาง", text: "กลาง" },
            { type: "message", label: "ต่ำ", text: "ต่ำ" },
          ]),
        );
      }
      var startTime = normalizeTime(t);
      if (startTime === null)
        return reply({
          type: "text",
          text: 'รูปแบบเวลาไม่ถูกต้อง กรุณาระบุเวลา เช่น 14.00 หรือกด "ทั้งวัน"',
        });
      state.data.due_time = startTime;
      state.step = "endTime";
      setUserState(userId, state);
      return reply(
        makeQuickReplyMessage(
          "ระบุเวลาเสร็จ ตัวอย่าง 16.00 หากไม่ระบุกด ไม่ระบุ ได้เลย",
          [
            { type: "message", label: "10.00", text: "10.00" },
            { type: "message", label: "14.00", text: "14.00" },
            { type: "message", label: "18.00", text: "18.00" },
            { type: "message", label: "ไม่ระบุ", text: "ไม่ระบุ" },
          ],
        ),
      );
    }

    if (state.step === "endTime") {
      var endTime = normalizeTime(t);
      if (endTime === null)
        return reply({
          type: "text",
          text: "รูปแบบเวลาไม่ถูกต้อง กรุณาระบุเวลา เช่น 16.00 หรือกด ไม่ระบุ",
        });
      if (endTime) {
        state.data.end_time = endTime;
        var note = state.data.note || "";
        if (note) note += " | ";
        note += "เวลาเสร็จ: " + endTime;
        state.data.note = note;
      }
      state.step = "priority";
      setUserState(userId, state);
      return reply(
        makeQuickReplyMessage("ระบุระดับความสำคัญ", [
          { type: "message", label: "สูง", text: "สูง" },
          { type: "message", label: "กลาง", text: "กลาง" },
          { type: "message", label: "ต่ำ", text: "ต่ำ" },
        ]),
      );
    }

    if (state.step === "priority") {
      var priorityMap = { สูง: "High", กลาง: "Medium", ต่ำ: "Low" };
      if (!priorityMap[t])
        return reply({
          type: "text",
          text: "กรุณาเลือกระดับความสำคัญ: ต่ำ, กลาง หรือ สูง",
        });
      state.data.priority = priorityMap[t];
      state.step = "category";
      setUserState(userId, state);

      var taskCategories = [];
      try {
        taskCategories = SettingsService.getCategories() || [];
      } catch (e) {}
      var categoryActions = [];
      if (taskCategories.length > 0) {
        for (var c = 0; c < taskCategories.length; c++) {
          var catName = String(taskCategories[c].name || "");
          if (catName)
            categoryActions.push({
              type: "message",
              label: catName,
              text: catName,
            });
        }
      }
      if (categoryActions.length === 0) {
        categoryActions = [
          { type: "message", label: "งาน", text: "งาน" },
          { type: "message", label: "ส่วนตัว", text: "ส่วนตัว" },
          { type: "message", label: "สุขภาพ", text: "สุขภาพ" },
          { type: "message", label: "การศึกษา", text: "การศึกษา" },
          { type: "message", label: "อื่นๆ", text: "อื่นๆ" },
        ];
      }
      return reply(
        makeQuickReplyMessage("ระบุหมวดหมู่ภารกิจ", categoryActions),
      );
    }

    if (state.step === "category") {
      if (!t) return reply({ type: "text", text: "กรุณาระบุหมวดหมู่" });
      state.data.category = t;
      state.step = "reminder";
      setUserState(userId, state);
      var availableOptions = getAvailableReminderOptions(state);
      if (availableOptions.length === 0) {
        clearUserState(userId);
        return reply({
          type: "text",
          text: "เวลาของภารกิจนี้อยู่ในอดีตแล้ว กรุณาเริ่มสร้างภารกิจใหม่ค่ะ",
        });
      }
      var reminderActions = availableOptions.map(function (opt) {
        return { type: "message", label: opt.label, text: opt.label };
      });
      return reply(
        makeQuickReplyMessage("ต้องการให้แจ้งเตือนเวลาไหน", reminderActions),
      );
    }

    if (state.step === "reminder") {
      var availableOptions = getAvailableReminderOptions(state);
      var reminderMap = {};
      for (var ri = 0; ri < availableOptions.length; ri++) {
        reminderMap[availableOptions[ri].label] = availableOptions[ri].value;
      }
      var minutes = reminderMap[t];
      if (minutes === undefined) {
        minutes = parseInt(t, 10);
      }
      if (isNaN(minutes) || minutes < 0)
        return reply({
          type: "text",
          text: "กรุณาเลือกตัวเลือกจากปุ่มด้านล่างค่ะ",
        });
      state.data.remind_before_m = minutes;
      state.step = "notifyTarget";
      setUserState(userId, state);
      var lineGroups = SettingsService.getLineGroups();
      var groupActions = [];
      for (var gi = 0; gi < lineGroups.length && gi < 11; gi++) {
        var gName = String(lineGroups[gi].name || "กลุ่ม").trim();
        if (gName.length > 20) gName = gName.substring(0, 20);
        groupActions.push({
          type: "message",
          label: gName,
          text: "group:" + lineGroups[gi].group_id,
        });
      }
      var notifyActions = [
        { type: "message", label: "เฉพาะฉัน", text: "เฉพาะฉัน" },
        { type: "message", label: "ฉันและทุกกลุ่ม", text: "ฉันและทุกกลุ่ม" },
      ].concat(groupActions);
      return reply(makeQuickReplyMessage("ต้องการให้ส่งแจ้งเตือนไปที่ไหนคะ", notifyActions));
    }

    if (state.step === "notifyTarget") {
      if (t === "เฉพาะฉัน") {
        state.data.notify_group = false;
        state.data.notify_group_ids = "";
      } else if (t === "ฉันและทุกกลุ่ม") {
        state.data.notify_group = true;
        state.data.notify_group_ids = "__all__";
      } else if (t.indexOf("group:") === 0) {
        state.data.notify_group = true;
        state.data.notify_group_ids = t.substring(6);
      } else {
        return reply({
          type: "text",
          text: "กรุณาเลือก เฉพาะฉัน, ฉันและทุกกลุ่ม หรือกลุ่มที่ต้องการ",
        });
      }
      state.step = "confirm";
      setUserState(userId, state);
      var flex = buildTaskFlex("confirm", state.data, webAppUrl);
      return reply([
        flex,
        {
          type: "text",
          text: 'กด "✅ บันทึก" เพื่อบันทึก หรือ "❌ ยกเลิก" เพื่อยกเลิกค่ะ',
        },
      ]);
    }

    if (state.step === "confirm") {
      if (t === "บันทึก" || t === "yes")
        return saveTaskFromState(userId, state, webAppUrl, true);
      clearUserState(userId);
      return reply({ type: "text", text: "ยกเลิกการบันทึกภารกิจแล้วค่ะ" });
    }

    return null;
  }

  function saveTaskFromState(userId, state, webAppUrl, viaText) {
    try {
      var task = TaskService.addTask({
        task_name: state.data.task_name,
        category: state.data.category,
        task_date: state.data.task_date,
        due_time: state.data.due_time || "",
        priority: state.data.priority,
        remind_before_m: state.data.remind_before_m,
        note: state.data.note || "",
        notify_group: state.data.notify_group === true,
        notify_group_ids: state.data.notify_group_ids || "",
      }, { skipNotify: true });
      task.end_time = state.data.end_time || "";
      task.notify_group = state.data.notify_group === true;
      task.notify_group_ids = state.data.notify_group_ids || "";
      LogService.logEvent(
        "TASK_CREATED_FROM_LINE",
        task.task_id,
        "notify_target=" + (task.notify_group ? (task.notify_group_ids || "(empty)") : "user_only"),
        JSON.stringify({ notify_group: task.notify_group, notify_group_ids: task.notify_group_ids })
      );
      clearUserState(userId);
      var flex = buildTaskFlex("created", task, webAppUrl);
      return [flex, { type: "text", text: "บันทึกภารกิจเรียบร้อยแล้วค่ะ ✅" }];
    } catch (e) {
      return [{ type: "text", text: "บันทึกภารกิจไม่สำเร็จ: " + e.message }];
    }
  }

  function handleFinanceFlow(replyToken, userId, text, settings, webAppUrl, todayStr) {
    var state = getUserState(userId);
    if (!state || state.flow !== "finance") return null;
    var t = String(text || "").trim();

    if (state.step === "scope") {
      var scope = "";
      if (t === "ส่วนตัว") scope = "ส่วนตัว";
      else if (t === "ที่ทำงาน") scope = "ที่ทำงาน";
      else return [{ type: "text", text: "กรุณาเลือก ส่วนตัว หรือ ที่ทำงาน" }];

      var records = state.records || [];
      for (var i = 0; i < records.length; i++) {
        records[i].scope = scope;
      }
      state.records = records;
      state.step = "confirm";
      setUserState(userId, state);

      return [buildFinanceConfirmFlex(records, userId)];
    }

    if (state.step === "confirm") {
      if (t === "บันทึก") {
        try {
          var recordsToSave = state.records || [];
          var savedRecords = [];
          for (var k = 0; k < recordsToSave.length; k++) {
            var recordDate = recordsToSave[k].date || todayStr;
            var recordNote = recordsToSave[k].note || "บันทึกจาก LINE";
            var rec = FinanceService.addFinanceRecord({
              type: recordsToSave[k].type,
              title: recordsToSave[k].title,
              amount: recordsToSave[k].amount,
              category: recordsToSave[k].category,
              scope: recordsToSave[k].scope,
              date: recordDate,
              note: recordNote,
            });
            savedRecords.push(rec);
          }
          clearUserState(userId);
          var flex = buildFinanceSummaryFlex(savedRecords, webAppUrl);
          return [flex];
        } catch (e) {
          return [{ type: "text", text: "บันทึกไม่สำเร็จ: " + e.message }];
        }
      } else {
        clearUserState(userId);
        return [{ type: "text", text: "ยกเลิกการบันทึกแล้วค่ะ" }];
      }
    }

    return null;
  }

  function getTaskByIdSafe(id) {
    if (TaskService.getTaskById) return TaskService.getTaskById(id);
    var tasks = TaskService.getAllTasks();
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].task_id === id) return tasks[i];
    }
    throw new Error("Task not found");
  }

  function handlePostback(ev, settings, webAppUrl) {
    var source = ev.source || {};
    var sourceType = source.type || "";
    var uid = source.userId || "";
    var pbData = ev.postback ? ev.postback.data : "";
    var pbParams = {};
    var pairs = String(pbData).split("&");
    for (var i = 0; i < pairs.length; i++) {
      var kv = pairs[i].split("=");
      if (kv.length === 2)
        pbParams[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
    }

    if (pbParams.action === "showExpenseGuide") {
      maybeShowLoading(sourceType, uid, "showExpenseGuide");
      clearUserState(uid);
      return [buildExpenseGuideFlex()];
    }

    if (pbParams.action === "startAddTask") {
      maybeShowLoading(sourceType, uid, "startAddTask");
      clearUserState(uid);
      return [startTaskFlow(ev.replyToken, uid)];
    }

    if (pbParams.action === "confirmTask") {
      maybeShowLoading(sourceType, uid, "confirmTask");
      var state = getUserState(uid);
      if (!state || state.step !== "confirm") {
        return [
          {
            type: "text",
            text: "ไม่พบข้อมูลภารกิจที่กำลังบันทึกค่ะ กรุณาเริ่มใหม่",
          },
        ];
      }
      if (pbParams.confirm === "yes") {
        return saveTaskFromState(uid, state, webAppUrl, false);
      }
      clearUserState(uid);
      return [{ type: "text", text: "ยกเลิกการบันทึกภารกิจแล้วค่ะ" }];
    }

    if (pbParams.action === "completeTask" && pbParams.task_id) {
      maybeShowLoading(sourceType, uid, "completeTask");
      try {
        TaskService.updateTaskStatus(pbParams.task_id, "Done");
        var doneTask = getTaskByIdSafe(pbParams.task_id);
        return [buildTaskDoneFlex(doneTask, false)];
      } catch (e) {
        return [{ type: "text", text: "อัปเดตสถานะไม่สำเร็จ: " + e.message }];
      }
    }

    if (pbParams.action === "undoCompleteTask" && pbParams.task_id) {
      maybeShowLoading(sourceType, uid, "undoCompleteTask");
      try {
        TaskService.updateTaskStatus(pbParams.task_id, "Pending");
        var pendingTask = getTaskByIdSafe(pbParams.task_id);
        return [buildTaskDoneFlex(pendingTask, true)];
      } catch (e) {
        return [{ type: "text", text: "อัปเดตสถานะไม่สำเร็จ: " + e.message }];
      }
    }

    if (pbParams.action === "deleteTask" && pbParams.task_id) {
      maybeShowLoading(sourceType, uid, "deleteTask");
      try {
        var delTask = getTaskByIdSafe(pbParams.task_id);
        var delName = delTask ? delTask.task_name : "ภารกิจ";
        TaskService.deleteTask(pbParams.task_id);
        return [buildTaskDeletedFlex(delName)];
      } catch (e) {
        return [{ type: "text", text: "ลบภารกิจไม่สำเร็จ: " + e.message }];
      }
    }

    if (pbParams.action === "confirmFinance") {
      maybeShowLoading(sourceType, uid, "confirmFinance");
      var state = getUserState(uid);
      if (!state || state.flow !== "finance" || state.step !== "confirm") {
        return [
          { type: "text", text: "ไม่พบรายการที่กำลังบันทึกค่ะ กรุณาเริ่มใหม่" },
        ];
      }
      if (pbParams.confirm === "yes") {
        try {
          var tz = settings.TIMEZONE || Session.getScriptTimeZone();
          var todayStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
          var records = state.records || [];
          var savedRecords = [];
          for (var i = 0; i < records.length; i++) {
            var recordDate = records[i].date || todayStr;
            var recordNote = records[i].note || "บันทึกจาก LINE";
            var rec = FinanceService.addFinanceRecord({
              type: records[i].type,
              title: records[i].title,
              amount: records[i].amount,
              category: records[i].category,
              scope: records[i].scope,
              date: recordDate,
              note: recordNote,
            });
            savedRecords.push(rec);
          }
          clearUserState(uid);
          var flex = buildFinanceSummaryFlex(savedRecords, webAppUrl);
          return [flex];
        } catch (e) {
          return [{ type: "text", text: "บันทึกไม่สำเร็จ: " + e.message }];
        }
      } else {
        clearUserState(uid);
        return [{ type: "text", text: "ยกเลิกการบันทึกแล้วค่ะ" }];
      }
    }

    return null;
  }

  return {
    saveLineSetup: function (token, userId) {
      SettingsService.saveSetting("LINE_CHANNEL_ACCESS_TOKEN", token || "");
      SettingsService.saveSetting("LINE_DEFAULT_USER_ID", userId || "");
      return { success: true };
    },

    pushMessage: function (userId, messages) {
      var settings = SettingsService.getSettings();
      var token = settings.LINE_CHANNEL_ACCESS_TOKEN || "";
      var target = userId || settings.LINE_DEFAULT_USER_ID || "";
      if (!token)
        return {
          success: false,
          error: "ไม่พบ Channel Access Token กรุณาตั้งค่า LINE",
        };
      if (!target) return { success: false, error: "ไม่พบ LINE User/Group ID" };

      try {
        var response = UrlFetchApp.fetch(PUSH_URL, {
          method: "post",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          payload: JSON.stringify({
            to: target,
            messages: messages,
          }),
          muteHttpExceptions: true,
        });
        var code = response.getResponseCode();
        if (code >= 200 && code < 300) {
          return { success: true };
        }
        return {
          success: false,
          error: "LINE API " + code + ": " + response.getContentText(),
          payload: messages,
        };
      } catch (e) {
        return { success: false, error: e.message, payload: messages };
      }
    },

    sendLineMessage: function (userId, message) {
      return this.pushMessage(userId, [{ type: "text", text: message }]);
    },

    replyMessage: function (replyToken, messages) {
      var settings = SettingsService.getSettings();
      var token = settings.LINE_CHANNEL_ACCESS_TOKEN || "";
      if (!token)
        return { success: false, error: "ไม่พบ Channel Access Token" };
      if (!replyToken) return { success: false, error: "ไม่พบ replyToken" };

      try {
        var response = UrlFetchApp.fetch(REPLY_URL, {
          method: "post",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          payload: JSON.stringify({
            replyToken: replyToken,
            messages: messages,
          }),
          muteHttpExceptions: true,
        });
        var code = response.getResponseCode();
        if (code >= 200 && code < 300) {
          return { success: true };
        }
        return {
          success: false,
          error: "LINE API " + code + ": " + response.getContentText(),
          payload: messages,
        };
      } catch (e) {
        return { success: false, error: e.message, payload: messages };
      }
    },

    sendFinanceReply: function (replyToken, mode, record, webAppUrl) {
      var flex = buildFinanceFlex(mode, record, webAppUrl);
      return this.replyMessage(replyToken, [flex]);
    },

    sendFinancePush: function (userId, mode, record, webAppUrl) {
      var flex = buildFinanceFlex(mode, record, webAppUrl);
      return this.pushMessage(userId, [flex]);
    },

    sendTaskPush: function (userId, mode, task, webAppUrl) {
      var flex = buildTaskFlex(mode, task, webAppUrl);
      return this.pushMessage(userId, [flex]);
    },

    sendTaskCreatedPush: function (userId, task, webAppUrl) {
      var flex = buildTaskFlex("created", task, webAppUrl);
      return this.pushMessage(userId, [
        flex,
        { type: "text", text: "บันทึกภารกิจเรียบร้อยแล้วค่ะ ✅" },
      ]);
    },

    sendTaskDeletedPush: function (userId, taskName) {
      var flex = buildTaskDeletedFlex(taskName);
      return this.pushMessage(userId, [flex]);
    },

    sendLineReminder: function (userId, task, webAppUrl, options) {
      options = options || {};
      var settings = SettingsService.getSettings();
      var dashboardUrl = webAppUrl || settings.WEB_APP_URL || DEFAULT_WEB_APP_URL;
      var taskTitle = task.task_name || "ภารกิจ";
      if (options.isEdited) taskTitle += " (แก้ไข)";
      var dateStr = task.task_date || "-";
      var timeStr = task.is_all_day ? "ทั้งวัน" : (task.due_time || "-");
      var remindText =
        Number(task.remind_before_m || 0) === 0
          ? "ตรงเวลา"
          : "ก่อน " + String(task.remind_before_m) + " นาที";
      var categoryStr = task.category || "-";
      var priorityMap = { Low: "ต่ำ", Medium: "ปานกลาง", High: "สูง" };
      var priorityStr = priorityMap[task.priority] || task.priority || "-";
      var noteStr = task.note || "-";

      function infoRow(icon, label, value) {
        return {
          type: "box",
          layout: "horizontal",
          spacing: "md",
          contents: [
            {
              type: "text",
              text: icon + " " + label,
              flex: 2,
              size: "sm",
              color: "#6B7280",
            },
            {
              type: "text",
              text: String(value),
              flex: 4,
              size: "sm",
              color: "#111827",
              weight: "bold",
              align: "end",
              wrap: true,
            },
          ],
        };
      }

      function buildFlex(includeDashboard, groupId) {
        var footerContents = [];
        if (includeDashboard) {
          footerContents.push({
            type: "button",
            style: "primary",
            color: "#10B981",
            action: {
              type: "uri",
              label: "เปิด Dashboard",
              uri: dashboardUrl,
            },
          });
        }
        if (!includeDashboard && groupId) {
          var calendarUrl =
            dashboardUrl +
            (dashboardUrl.indexOf("?") >= 0 ? "&" : "?") +
            "view=calendar&gid=" +
            encodeURIComponent(groupId) +
            "&openExternalBrowser=1";
          footerContents.push({
            type: "button",
            style: "primary",
            color: "#006664",
            action: {
              type: "uri",
              label: "ดูปฏิทิน",
              uri: calendarUrl,
            },
          });
        }
        if (!includeDashboard) {
          footerContents.push({
            type: "text",
            text: "แจ้งเตือนจาก Remind Me",
            size: "xs",
            color: "#9CA3AF",
            align: "center",
            margin: "md",
          });
        }

        return {
          type: "flex",
          altText: "แจ้งเตือนงาน: " + taskTitle,
          contents: {
            type: "bubble",
            header: {
              type: "box",
              layout: "vertical",
              backgroundColor: "#10B981",
              paddingAll: "20px",
              contents: [
                {
                  type: "text",
                  text: taskTitle,
                  color: "#FFFFFF",
                  size: "xl",
                  weight: "bold",
                  wrap: true,
                },
              ],
            },
            body: {
              type: "box",
              layout: "vertical",
              spacing: "md",
              paddingAll: "20px",
              contents: [
                infoRow("🗓️", "วันที่", dateStr),
                infoRow("⏰", "เวลา", timeStr),
                infoRow("⏳", "การเตือน", remindText),
                infoRow("🏷️", "หมวดหมู่", categoryStr),
                infoRow("⭐", "ความสำคัญ", priorityStr),
                { type: "separator", margin: "md" },
                { type: "text", text: "หมายเหตุ", size: "sm", color: "#6B7280" },
                {
                  type: "text",
                  text: noteStr,
                  size: "sm",
                  color: "#374151",
                  wrap: true,
                },
              ],
            },
            footer: {
              type: "box",
              layout: "vertical",
              spacing: "sm",
              paddingAll: "20px",
              contents: footerContents,
            },
          },
        };
      }

      var userTarget = userId || settings.LINE_DEFAULT_USER_ID || "";
      var lineGroups = SettingsService.getLineGroups();
      var groupTargets = [];
      if (task.notify_group) {
        var ids = String(task.notify_group_ids || "").trim();
        if (ids === "__all__") {
          groupTargets = lineGroups.map(function (g) { return g.group_id; });
        } else if (ids) {
          groupTargets = ids.split(",").map(function (s) { return s.trim(); }).filter(function (s) { return s; });
        }
      }

      var results = {
        success: false,
        userSent: false,
        groupSent: false,
        userResult: null,
        groupResults: [],
      };

      LogService.logEvent(
        "LINE_REMINDER_TARGETS",
        task.task_id,
        "groups=" + groupTargets.length + " ids=" + (task.notify_group_ids || "(empty)") + " all=" + (task.notify_group_ids === "__all__"),
        JSON.stringify({ userTarget: userTarget, groupTargets: groupTargets, notify_group: task.notify_group, notify_group_ids: task.notify_group_ids })
      );

      if (!userTarget && groupTargets.length === 0) {
        return { success: false, error: "ไม่พบ LINE User ID หรือ Group ID" };
      }

      if (userTarget) {
        var userFlex = buildFlex(true);
        results.userResult = this.pushMessage(userTarget, [userFlex]);
        results.userSent = results.userResult.success;
        results.success = results.userResult.success;
      }

      if (groupTargets.length > 0) {
        for (var gi = 0; gi < groupTargets.length; gi++) {
          var groupFlex = buildFlex(false, groupTargets[gi]);
          var gResult = this.pushMessage(groupTargets[gi], [groupFlex]);
          results.groupResults.push({ group_id: groupTargets[gi], result: gResult });
          if (gResult.success) results.groupSent = true;
        }
        if (!userTarget && results.groupSent) {
          results.success = true;
        }
      }

      return results;
    },

    testLineMessage: function () {
      return this.sendLineMessage(
        null,
        "ทดสอบการแจ้งเตือนจาก Remind Me\nหากคุณได้รับข้อความนี้ แสดงว่าการเชื่อมต่อ LINE ใช้งานได้แล้ว",
      );
    },

    doPost: function (e) {
      try {
        var body = JSON.parse(e.postData.contents);
        var events = body.events || [];
        var settings = SettingsService.getSettings();
        var token = settings.LINE_CHANNEL_ACCESS_TOKEN || "";
        var webAppUrl = settings.WEB_APP_URL || DEFAULT_WEB_APP_URL;
        var tz = settings.TIMEZONE || Session.getScriptTimeZone();
        var todayStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
        var categories = SettingsService.getFinanceCategories();

        for (var i = 0; i < events.length; i++) {
          var ev = events[i];
          var source = ev.source || {};
          var sourceType = source.type || "";
          var userId = source.userId || "";
          var groupId = source.groupId || "";
          var roomId = source.roomId || "";
          var uid = userId || groupId || roomId || "";
          var messageText = "";
          if (ev.message && ev.message.type === "text") {
            messageText = ev.message.text || "";
          }

          // บันทึก User ID / Group ID ล่าสุดแยกกัน
          if (sourceType === "user" && userId) {
            SettingsService.saveSetting("LAST_WEBHOOK_USER_ID", userId);
            var displayName = sourceType;
            if (token) {
              var profile = getProfile(token, userId);
              if (profile && profile.displayName)
                displayName = profile.displayName;
            }
            UserService.addOrUpdateUser(userId, displayName, messageText);
          }
          if ((sourceType === "group" && groupId) || (sourceType === "room" && roomId)) {
            SettingsService.saveSetting("LAST_WEBHOOK_GROUP_ID", groupId || roomId);
          }

          if (uid) {
            LogService.logEvent(
              "LINE_WEBHOOK",
              uid,
              "Received " + ev.type,
              JSON.stringify({ sourceType: sourceType, message: messageText }),
            );
          }

          var handled = false;

          // Bot ถูกเพิ่มเข้ากลุ่ม
          if (ev.type === "join" && ev.replyToken) {
            if (sourceType === "group" && groupId) {
              SettingsService.saveSetting("LAST_WEBHOOK_GROUP_ID", groupId);
              try {
                var existingGroups = SettingsService.getLineGroups();
                var alreadyAdded = existingGroups.some(function (g) {
                  return g.group_id === groupId;
                });
                if (!alreadyAdded) {
                  var groupSummary = getGroupSummary(token, groupId);
                  var groupName = groupSummary && groupSummary.groupName
                    ? groupSummary.groupName
                    : "กลุ่ม LINE";
                  SettingsService.addLineGroup(groupId, groupName);
                }
              } catch (groupErr) {
                LogService.logEvent(
                  "LINE_GROUP_ADD_ERROR",
                  groupId,
                  groupErr.message,
                  "{}"
                );
              }
              this.replyMessage(ev.replyToken, [
                { type: "text", text: "Bot พร้อมรับแจ้งเตือนภารกิจในกลุ่มนี้แล้วค่ะ" },
              ]);
              continue;
            }
          }

          // จัดการ Postback จาก Rich Menu / Flex Message
          if (ev.type === "postback" && ev.replyToken) {
            var pbMessages = handlePostback(ev, settings, webAppUrl);
            if (pbMessages && pbMessages.length > 0) {
              var pbReplyRes = this.replyMessage(ev.replyToken, pbMessages);
              if (!pbReplyRes.success) {
                LogService.logEvent(
                  "LINE_PUSH_ERROR",
                  uid,
                  pbReplyRes.error,
                  JSON.stringify({
                    type: "postback_reply",
                    payload: pbReplyRes.payload,
                  }),
                );
              }
              handled = true;
            }
          }

          // จัดการ conversation flow บันทึกรายรับ-รายจ่าย (เฉพาะแชทส่วนตัว)
          if (!handled && messageText && ev.replyToken && sourceType !== "group" && sourceType !== "room") {
            var finState = getUserState(uid);
            if (finState && finState.flow === "finance") {
              maybeShowLoading(sourceType, userId, "finance_flow");
              var finFlowMessages = handleFinanceFlow(
                ev.replyToken,
                uid,
                messageText,
                settings,
                webAppUrl,
                todayStr,
              );
              if (finFlowMessages && finFlowMessages.length > 0) {
                var finFlowReplyRes = this.replyMessage(ev.replyToken, finFlowMessages);
                if (!finFlowReplyRes.success) {
                  LogService.logEvent(
                    "LINE_PUSH_ERROR",
                    uid,
                    finFlowReplyRes.error,
                    JSON.stringify({
                      type: "finance_flow_reply",
                      payload: finFlowReplyRes.payload,
                    }),
                  );
                }
                handled = true;
              }
            }
          }

          // จัดการ conversation flow สร้างภารกิจ (เฉพาะแชทส่วนตัว)
          if (!handled && messageText && ev.replyToken && sourceType !== "group" && sourceType !== "room" && getUserState(uid)) {
            maybeShowLoading(sourceType, userId, "task_flow");
            var flowMessages = handleTaskFlow(
              ev.replyToken,
              uid,
              messageText,
              settings,
              webAppUrl,
            );
            if (flowMessages && flowMessages.length > 0) {
              var flowReplyRes = this.replyMessage(ev.replyToken, flowMessages);
              if (!flowReplyRes.success) {
                LogService.logEvent(
                  "LINE_PUSH_ERROR",
                  uid,
                  flowReplyRes.error,
                  JSON.stringify({
                    type: "task_flow_reply",
                    payload: flowReplyRes.payload,
                  }),
                );
              }
              handled = true;
            }
          }

          // จดรายรับ-รายจ่ายจากรูปสลิป (เฉพาะแชทส่วนตัว)
          if (!handled && ev.message && ev.message.type === "image" && ev.replyToken && sourceType === "user") {
            maybeShowLoading(sourceType, userId, "finance_slip_ocr");
            var imageResult = getLineImageContent(token, ev.message.id);
            var ocrResult = imageResult.success ? extractSlipText(imageResult.blob) : imageResult;
            var slipRecord = ocrResult.success ? parseFinanceSlip(ocrResult.text, categories, todayStr) : null;

            if (!slipRecord) {
              var slipError = ocrResult.error || "ไม่พบยอดเงินที่อ่านได้จากสลิป";
              var errorReply = this.replyMessage(ev.replyToken, [{
                type: "text",
                text: "อ่านสลิปไม่สำเร็จ: " + slipError + "\nกรุณาส่งสลิปที่เห็นยอดเงินชัดเจน หรือพิมพ์รายการ เช่น ข้าวมันไก่ 50",
              }]);
              if (!errorReply.success) {
                LogService.logEvent("LINE_PUSH_ERROR", uid, errorReply.error, JSON.stringify({ type: "finance_slip_error_reply" }));
              }
              LogService.logEvent("FINANCE_SLIP_OCR_ERROR", uid, slipError, JSON.stringify({ message_id: ev.message.id }));
            } else {
              clearUserState(uid);
              setUserState(uid, { flow: "finance", records: [slipRecord], step: "scope", source: "line_slip" });
              var scopeReply = this.replyMessage(ev.replyToken, [buildFinanceScopeQuestion([slipRecord])]);
              if (!scopeReply.success) {
                LogService.logEvent("LINE_PUSH_ERROR", uid, scopeReply.error, JSON.stringify({ type: "finance_slip_scope_ask" }));
              }
              LogService.logEvent(
                "FINANCE_SLIP_PARSED",
                uid,
                "Parsed finance slip",
                JSON.stringify({ message_id: ev.message.id, type: slipRecord.type, amount: slipRecord.amount, date: slipRecord.date })
              );
            }
            handled = true;
          }

          // Voice Message: ถอดเสียงแล้วใช้ parser รายรับ-รายจ่ายตัวเดียวกับข้อความ
          if (!handled && ev.message && ev.message.type === "audio" && ev.replyToken && sourceType === "user") {
            maybeShowLoading(sourceType, userId, "finance_voice_asr");
            var audioResult = getLineAudioContent(token, ev.message.id);
            var transcriptionResult = audioResult.success ? transcribeVoiceMessage(audioResult.blob) : audioResult;
            var voiceRecords = transcriptionResult.success
              ? parseFinanceItems(transcriptionResult.text, categories)
              : null;

            if (!voiceRecords || voiceRecords.length === 0) {
              var voiceError = transcriptionResult.error || "ไม่พบชื่อรายการและยอดเงินจากเสียง";
              var voiceErrorReply = this.replyMessage(ev.replyToken, [{
                type: "text",
                text: "จดรายการจากเสียงไม่สำเร็จ: " + voiceError +
                  "\nกรุณาพูดชื่อรายการและยอดเงินให้ชัดเจน เช่น ค่ากาแฟ 50 บาท",
              }]);
              if (!voiceErrorReply.success) {
                LogService.logEvent("LINE_PUSH_ERROR", uid, voiceErrorReply.error, JSON.stringify({ type: "finance_voice_error_reply" }));
              }
              LogService.logEvent("FINANCE_VOICE_ASR_ERROR", uid, voiceError, JSON.stringify({ message_id: ev.message.id }));
            } else {
              for (var voiceIndex = 0; voiceIndex < voiceRecords.length; voiceIndex++) {
                voiceRecords[voiceIndex].note = "บันทึกจากเสียง LINE";
              }
              clearUserState(uid);
              setUserState(uid, { flow: "finance", records: voiceRecords, step: "scope", source: "line_voice" });
              var voiceScopeReply = this.replyMessage(ev.replyToken, [buildFinanceScopeQuestion(voiceRecords)]);
              if (!voiceScopeReply.success) {
                LogService.logEvent("LINE_PUSH_ERROR", uid, voiceScopeReply.error, JSON.stringify({ type: "finance_voice_scope_ask" }));
              }
              LogService.logEvent(
                "FINANCE_VOICE_PARSED",
                uid,
                "Parsed finance voice message",
                JSON.stringify({ message_id: ev.message.id, records: voiceRecords.length })
              );
            }
            handled = true;
          }

          // เริ่มบันทึกรายรับ-รายจ่ายจากข้อความ (เฉพาะแชทส่วนตัว ไม่ทำงานในกลุ่ม/ห้อง)
          if (!handled && messageText && ev.replyToken && sourceType !== "group" && sourceType !== "room") {
            var parsedRecords = parseFinanceItems(messageText, categories);
            if (parsedRecords && parsedRecords.length > 0) {
              clearUserState(uid);
              setUserState(uid, { flow: "finance", records: parsedRecords, step: "scope" });
              var scopeMsg = buildFinanceScopeQuestion(parsedRecords);
              var scopeReplyRes = this.replyMessage(ev.replyToken, [scopeMsg]);
              if (!scopeReplyRes.success) {
                LogService.logEvent(
                  "LINE_PUSH_ERROR",
                  uid,
                  scopeReplyRes.error,
                  JSON.stringify({ type: "finance_scope_ask" }),
                );
              }
            } else if (messageText === "จดค่าใช้จ่าย") {
              maybeShowLoading(sourceType, userId, "expense_guide_text");
              this.replyMessage(ev.replyToken, [
                {
                  type: "text",
                  text: 'พิมพ์รายการตามด้วยจำนวนเงินได้เลยค่ะ\nเช่น "ข้าวไข่เจียว 20" หรือ "เงินเดือน 20000"\nสามารถเพิ่มได้ทีละหลายรายการโดยการพิมพ์ comma\nเช่น "ข้าวไข่เจียว 20, น้ำแตงโมปั่น 40"',
                },
              ]);
            } else if (
              messageText.toLowerCase().indexOf("สวัสดี") === 0 ||
              messageText.toLowerCase().indexOf("help") === 0 ||
              messageText === "?"
            ) {
              maybeShowLoading(sourceType, userId, "greeting_help");
              this.replyMessage(ev.replyToken, [
                {
                  type: "text",
                  text: 'พิมพ์รายการตามด้วยจำนวนเงิน เช่น\n"ข้าวมันไก่ 50" หรือ "เงินเดือน 20000"\nหรือ "ข้าวไข่เจียว 20, น้ำแตงโมปั่น 40"\nระบบจะบันทึกให้อัตโนมัติ',
                },
              ]);
            }
          }

          // ลบรายการจากปุ่มถังขยะใน Flex Message
          if (
            !handled &&
            ev.type === "postback" &&
            ev.postback &&
            ev.postback.data &&
            ev.replyToken
          ) {
            var pbData = ev.postback.data;
            var pbParams = {};
            var pairs = pbData.split("&");
            for (var j = 0; j < pairs.length; j++) {
              var kv = pairs[j].split("=");
              if (kv.length === 2)
                pbParams[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
            }
            if (
              pbParams.action === "deleteFinance" &&
              pbParams.transaction_id
            ) {
              maybeShowLoading(sourceType, userId, "deleteFinance");
              try {
                var delRecord = FinanceService.getFinanceRecords({}).find(
                  function (r) {
                    return r.transaction_id === pbParams.transaction_id;
                  },
                );
                FinanceService.deleteFinanceRecord(pbParams.transaction_id);
                if (delRecord) {
                  delRecord.amount = 0;
                  var delReplyRes = this.sendFinanceReply(
                    ev.replyToken,
                    "deleted",
                    delRecord,
                    webAppUrl,
                  );
                  if (!delReplyRes.success) {
                    LogService.logEvent(
                      "LINE_PUSH_ERROR",
                      pbParams.transaction_id,
                      delReplyRes.error,
                      JSON.stringify({ type: "finance_flex_deleted" }),
                    );
                    var delFallbackRes = this.replyMessage(ev.replyToken, [
                      { type: "text", text: "ลบรายการแล้ว ✅" },
                    ]);
                    if (!delFallbackRes.success) {
                      LogService.logEvent(
                        "LINE_PUSH_ERROR",
                        pbParams.transaction_id,
                        delFallbackRes.error,
                        JSON.stringify({ type: "finance_text_fallback" }),
                      );
                      if (uid) {
                        var delPushRes = this.pushMessage(uid, [
                          { type: "text", text: "ลบรายการแล้ว ✅" },
                        ]);
                        if (!delPushRes.success) {
                          LogService.logEvent(
                            "LINE_PUSH_ERROR",
                            pbParams.transaction_id,
                            delPushRes.error,
                            JSON.stringify({ type: "finance_push_fallback" }),
                          );
                        }
                      }
                    }
                  }
                } else {
                  this.replyMessage(ev.replyToken, [
                    { type: "text", text: "ลบรายการแล้ว ✅" },
                  ]);
                }
                LogService.logEvent(
                  "LINE_FINANCE_DELETED",
                  uid,
                  "Deleted from LINE",
                  JSON.stringify({ transaction_id: pbParams.transaction_id }),
                );
              } catch (delErr) {
                this.replyMessage(ev.replyToken, [
                  { type: "text", text: "ลบไม่สำเร็จ: " + delErr.message },
                ]);
                LogService.logEvent(
                  "LINE_FINANCE_ERROR",
                  uid,
                  delErr.message,
                  JSON.stringify({ postback: pbData }),
                );
              }
            }
          }
        }
      } catch (err) {
        LogService.logEvent(
          "LINE_WEBHOOK_ERROR",
          "",
          err.message,
          e.postData ? e.postData.contents : "",
        );
      }
      return ContentService.createTextOutput(
        JSON.stringify({ status: "ok" }),
      ).setMimeType(ContentService.MimeType.JSON);
    },
  };
})();
