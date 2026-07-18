# **Remind Me**

> เป็นระบบ บันทึกภารกิจและกิจกรรมต่าง ๆ รวมถึงการบันทึกรายรับ-รายจ่ายในแต่ละวัน
> และระบบนี้สามารถเชื่อมต่อกับ Line OA เพื่อใช้แจ้งเตือนงานและภารกิจต่าง ๆ รวมถึงสามารถจดรายรับ-รายจ่าย และบันทึกภารกิจผ่าน Line ได้
<hr>

## **คู่มือติดตั้งระบบ Remind Me**

### <ins>1. แนะนำระบบ</ins>
- Remind Me คือระบบจัดการภารกิจ รายรับ-รายจ่าย และการแจ้งเตือนผ่าน LINE Bot บน Google Sheets
- หลังจาก Make a copy แล้ว ให้ทำตามขั้นตอนด้านล่าง

### <ins>2. ขั้นตอนหลัง Make a copy</ins>
- เปิด Google Sheet สำเนาที่คุณสร้างขึ้น
- รอสักครู่ให้เมนู Remind Me ปรากฏ (หรือรีเฟรชหน้า)
- คลิกเมนู Remind Me → ตั้งค่าเริ่มต้นระบบ
- คลิกเมนู Extensions → Apps Script
- ใน Apps Script คลิกปุ่ม Deploy (รูปจรวด) → New deployment
- เลือก Type: Web app
- ตั้งค่า:
   - Description: Remind Me Web App
   - Execute as: Me
   - Who has access: Anyone
- คลิก Deploy แล้วคัดลอก Web App URL
- เปิด Web App URL ในเบราว์เซอร์
- ไปที่หน้า ตั้งค่า แล้วใส่ Web App URL ในช่อง "ลิงก์ Dashboard"

### <ins>3. วิธีสร้าง LINE Official Account (OA)</ins>
- เปิด https://manager.line.biz/
- คลิก "สร้างบัญชี" หรือ Create account
- เลือกประเทศและภาษา
- กรอกชื่อบัญชี เช่น Remind Me Bot
- เลือกหมวดหมู่และอัปโหลดรูปโปรไฟล์
- คลิกสร้างบัญชีให้เสร็จสิ้น

### <ins>4. วิธีสร้าง Messaging API Channel และรับ Channel Access Token</ins>
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

### <ins>5. วิธีหา LINE User ID</ins>
- เพิ่มบอทเป็นเพื่อนใน LINE (แสกน QR Code จากหน้า Settings ของ OA)
- ส่งข้อความอะไรก็ได้ให้บอท 1 ครั้ง
- ใน Web App ไปที่หน้า ตั้งค่า
- คลิกปุ่ม "ดึงล่าสุด" ข้างช่อง User ID หรือดูที่ Sheet Users คอลัมน์ line_user_id

### <ins>6. วิธีตั้งค่าใน Web App</ins>
- ใส่ Channel Access Token ในช่อง "Channel Access Token"
- ใส่ User ID ในช่อง "User ID / Group ID"
- ใส่ Web App URL ในช่อง "ลิงก์ Dashboard" ต่อด้วย ?openExternalBrowser=1
- คลิก "บันทึกการตั้งค่า LINE"
- คลิก "ทดสอบ LINE" เพื่อส่งข้อความทดสอบ
- คลิก "เปิด Trigger" เพื่อให้ระบบตรวจสอบการเตือนอัตโนมัติ

### <ins>7. วิธีสร้าง Rich Menu (ถ้าต้องการ)</ins>
- ออกแบบรูป Rich Menu ขนาด 2500 x 1686 px เป็น PNG หรือ JPEG
- อัปโหลดรูปขึ้น Google Drive
- คัดลอก File ID จากลิงก์ Google Drive
- ใน Web App ไปที่หน้า ตั้งค่า → ส่วน LINE Rich Menu
- ใส่ File ID แล้วคลิก "สร้างและตั้งค่า Rich Menu"

### <ins>8. ข้อควรระวัง</ins>
- อย่าแชร์ Channel Access Token ให้ผู้อื่น
- หาก redeploy Web App URL จะเปลี่ยน ต้องเอา URL ใหม่มาใส่ในหน้าตั้งค่าใหม่
- ระบบใช้ timezone Asia/Bangkok เป็นค่าเริ่มต้น
- ข้อมูลทั้งหมดจะถูกเก็บใน Google Sheet
