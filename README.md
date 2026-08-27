# **Remind Me**

> เป็นระบบ บันทึกภารกิจและกิจกรรมต่าง ๆ รวมถึงการบันทึกรายรับ-รายจ่ายในแต่ละวัน
> และระบบนี้สามารถเชื่อมต่อกับ Line OA เพื่อใช้แจ้งเตือนงานและภารกิจต่าง ๆ รวมถึงสามารถจดรายรับ-รายจ่าย และบันทึกภารกิจผ่าน Line ได้
<hr>

## **📌คู่มือติดตั้งระบบ Remind Me**

### <ins>1. แนะนำระบบ</ins>
- Remind Me คือระบบจัดการภารกิจ รายรับ-รายจ่าย และการแจ้งเตือนผ่าน LINE Bot บน Google Sheets
- ระบบนี้เป็น **Standalone Apps Script** แยกส่วนโค้ดออกจากฐานข้อมูลอย่างชัดเจน
- การคัดลอกโปรเจกต์จะได้ **เฉพาะโค้ดเท่านั้น ไม่มีข้อมูลของใครติดไปด้วย** ระบบจะสร้าง Google Sheet ใหม่ใน Drive ของคุณเองตอนติดตั้งครั้งแรก

### <ins>2. วิธีนำโปรเจกต์ไปใช้</ins>
เลือกอย่างใดอย่างหนึ่ง:
- **วิธี A (ทั่วไป):** เปิดลิงก์โปรเจกต์ Apps Script ที่ผู้พัฒนาแชร์ให้ แล้วกดไอคอน **Make a copy** (รูปสำเนาเอกสาร) ที่แถบด้านขวาบนของหน้าโปรเจกต์
- **วิธี B (นักพัฒนา):** Clone repository จาก GitHub แล้วใช้ [clasp](https://github.com/google/clasp)
  - `clasp create --type standalone --title "Remind Me"`
  - `clasp push`

### <ins>3. ติดตั้งระบบครั้งแรก (คลิกเดียว)</ins>
- ใน Apps Script คลิกปุ่ม Deploy (รูปจรวด) → New deployment
- เลือก Type: Web app
- ตั้งค่า:
   - Description: Remind Me Web App
   - Execute as: Me
   - Who has access: Anyone
- คลิก Deploy แล้วคัดลอก Web App URL
- **เปิด Web App URL ในเบราว์เซอร์ ระบบจะพาไปหน้าติดตั้งอัตโนมัติ**
- กดปุ่ม **"ติดตั้งระบบครั้งแรก"** ระบบจะสร้าง Google Sheet ชื่อ "Remind Me" ใน Drive ของคุณ พร้อมชีตและค่าเริ่มต้นทั้งหมด
- Spreadsheet ID จะถูกเก็บใน Script Properties อัตโนมัติ **ไม่ต้องแก้ไข Spreadsheet ID ในโค้ด**
- รีโหลดหน้า Web App แล้วไปที่หน้า ตั้งค่า แล้วใส่ Web App URL ในช่อง "ลิงก์ Dashboard"

### <ins>4. วิธีสร้าง LINE Official Account (OA)</ins>
- เปิด https://manager.line.biz/
- คลิก "สร้างบัญชี" หรือ Create account
- เลือกประเทศและภาษา
- กรอกชื่อบัญชี เช่น Remind Me Bot
- เลือกหมวดหมู่และอัปโหลดรูปโปรไฟล์
- คลิกสร้างบัญชีให้เสร็จสิ้น

### <ins>5. วิธีสร้าง Messaging API Channel และรับ Channel Access Token</ins>
- ใน LINE Official Account Manager ไปที่ Settings → Messaging API
- คลิก "Apply for Messaging API" หรือ "เปิดใช้ Messaging API"
- เลือก Provider (หรือสร้างใหม่)
- เลือก Channel หรือสร้างใหม่
- หลังจากเปิด Messaging API แล้ว ไปที่ LINE Developers Console
- เลือก Provider และ Channel ของคุณ
- ไปที่ tab Messaging API
- คัดลอก Channel Access Token (หากยังไม่มี ให้คลิก Issue)
- เปิดใช้งาน Webhook โดยใส่ URL: https://script.google.com/macros/s/.../exec (URL หลักของ Web App ที่คุณ Deploy)
- เปิด Use webhook เป็น Enabled

### <ins>6. วิธีหา LINE User ID</ins>
- เพิ่มบอทเป็นเพื่อนใน LINE (แสกน QR Code จากหน้า Settings ของ OA)
- ส่งข้อความอะไรก็ได้ให้บอท 1 ครั้ง
- ใน Web App ไปที่หน้า ตั้งค่า
- คลิกปุ่ม "ดึงล่าสุด" ข้างช่อง User ID หรือดูที่ Sheet Users คอลัมน์ line_user_id

### <ins>7. วิธีตั้งค่าใน Web App</ins>
- ใส่ Channel Access Token ในช่อง "Channel Access Token"
- ใส่ User ID ในช่อง "User ID / Group ID"
- ใส่ Web App URL ในช่อง "ลิงก์ Dashboard" ต่อด้วย ?openExternalBrowser=1
- คลิก "บันทึกการตั้งค่า LINE"
- คลิก "ทดสอบ LINE" เพื่อส่งข้อความทดสอบ
- คลิก "เปิด Trigger" เพื่อให้ระบบตรวจสอบการเตือนอัตโนมัติ

### <ins>8. วิธีสร้าง Rich Menu (ถ้าต้องการ)</ins>
- ออกแบบรูป Rich Menu ขนาด 2500 x 1686 px เป็น PNG หรือ JPEG
- อัปโหลดรูปขึ้น Google Drive
- คัดลอก File ID จากลิงก์ Google Drive
- ใน Web App ไปที่หน้า ตั้งค่า → ส่วน LINE Rich Menu
- ใส่ File ID แล้วคลิก "สร้างและตั้งค่า Rich Menu"

### <ins>9. วิธีจดรายรับ-รายจ่ายจากสลิปโอนเงิน</ins>
1. สมัครใช้งาน Typhoon และสร้าง API key จาก [Typhoon Playground](https://playground.opentyphoon.ai/)
2. ใน Web App ไปที่หน้า **ตั้งค่า → เชื่อมต่อ LINE** แล้วใส่ key ในช่อง **Typhoon OCR API key (อ่านสลิปโอนเงิน)** จากนั้นกดบันทึก
3. ส่งรูปสลิปโอนเงินให้ LINE Bot ในแชตส่วนตัว ระบบจะอ่านยอดเงิน วันที่ และคู่รายการจากสลิป
4. เลือกขอบเขตค่าใช้จ่ายผ่าน Quick Reply: **ส่วนตัว** หรือ **ที่ทำงาน**
5. ตรวจสอบ Flex Message แล้วกด **บันทึก** หรือ **ยกเลิก**

กติกาการบันทึก: สลิปโอนออกและสลิปที่ระบุทิศทางไม่ได้จะถูกตั้งเป็น **รายจ่าย** ส่วนสลิปเงินเข้า/รับเงินจะถูกตั้งเป็น **รายรับ** โดยค่าเริ่มต้น ระบบไม่บันทึกไฟล์รูปสลิปหรือข้อความ OCR ดิบ

### <ins>10. วิธีจดรายรับ-รายจ่ายด้วยเสียง</ins>
1. สมัครใช้งาน Groq และสร้าง API key จาก [Groq Console](https://console.groq.com/keys)
2. ใน Web App ไปที่หน้า **ตั้งค่า → เชื่อมต่อ LINE** แล้วใส่ key ในช่อง **Groq API key (จดรายรับ-รายจ่ายด้วยเสียง)** จากนั้นกดบันทึก
3. กดค้างเพื่อส่ง Voice Message หา LINE Bot ในแชตส่วนตัว
4. พูดชื่อรายการและยอดเงินให้ชัดเจน เช่น **ค่ากาแฟ 50 บาท** หรือ **ค่าแท็กซี่หนึ่งร้อยยี่สิบบาท**
5. ระบบถอดเสียงภาษาไทย จัดหมวดหมู่ และถามขอบเขตผ่าน Quick Reply: **ส่วนตัว** หรือ **ที่ทำงาน**
6. ตรวจสอบ Flex Message แล้วกด **บันทึก** หรือ **ยกเลิก**

ระบบใช้ Groq Whisper ซึ่งรับไฟล์ M4A จาก LINE ได้โดยตรง จึงไม่ต้องแปลงไฟล์เสียงก่อน ระบบไม่เดายอดเงินเมื่อฟังยอดไม่ชัด และจะขอให้ส่งเสียงใหม่หรือพิมพ์รายการแทน ระบบไม่บันทึกไฟล์เสียงหรือข้อความที่ถอดเสียงดิบ

### <ins>11. ข้อควรระวัง</ins>
- อย่าแชร์ Channel Access Token ให้ผู้อื่น
- อย่าแชร์ Typhoon OCR API key หรือ Groq API key ให้ผู้อื่น และตรวจสอบข้อกำหนด/โควต้าปัจจุบันของแต่ละบริการก่อนใช้งานจริง
- รูปสลิปจะถูกส่งไปประมวลผลกับ Typhoon OCR ส่วนข้อความเสียงจะถูกส่งไปถอดเสียงกับ Groq Whisper ระบบจะไม่เก็บไฟล์สื่อหรือข้อความที่อ่าน/ถอดเสียงดิบ
- หาก redeploy Web App URL จะเปลี่ยน ต้องเอา URL ใหม่มาใส่ในหน้าตั้งค่าใหม่
- ระบบใช้ timezone Asia/Bangkok เป็นค่าเริ่มต้น
- ข้อมูลทั้งหมดจะถูกเก็บใน Google Sheet ที่ระบบสร้างให้ใน Drive ของคุณเท่านั้น

### <ins>12. การอัปเดตระบบ</ins>
- เมื่อมีการอัปเดต Source Code ให้ Pull เวอร์ชันล่าสุดแล้ว Push ขึ้น Apps Script ของคุณ (หรือคัดลอกโค้ดใหม่ทับของเดิม)
- ฐานข้อมูล Google Sheet เดิมของคุณจะยังถูกใช้งานต่อไป เพราะระบบอ้างอิงผ่าน Script Properties
- ไม่ต้องแก้ไข Spreadsheet ID ใหม่ทุกครั้งที่อัปเดต
