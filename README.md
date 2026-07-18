### **Remind Me**

> เป็นระบบ บันทึกภารกิจและกิจกรรมต่าง ๆ รวมถึงการบันทึกรายรับ-รายจ่ายในแต่ละวัน
> และระบบนี้สามารถเชื่อมต่อกับ Line OA เพื่อใช้แจ้งเตือนงานและภารกิจต่าง ๆ รวมถึงสามารถจดรายรับ-รายจ่าย และบันทึกภารกิจผ่าน Line ได้

### **📌 คู่มือติดตั้งระบบ Remind Me** 

1. แนะนำระบบ
 - Remind Me คือระบบจัดการภารกิจ รายรับ-รายจ่าย และการแจ้งเตือนผ่าน LINE Bot บน Google Sheets
 - หลังจาก Make a copy แล้ว ให้ทำตามขั้นตอนด้านล่าง

2. ขั้นตอนหลัง Make a copy
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
2.8 คลิก Deploy แล้วคัดลอก Web App URL
2.9 เปิด Web App URL ในเบราว์เซอร์
2.10 ไปที่หน้า ตั้งค่า แล้วใส่ Web App URL ในช่อง "ลิงก์ Dashboard"

3. วิธีสร้าง LINE Official Account (OA)
3.1 เปิด https://manager.line.biz/
3.2 คลิก "สร้างบัญชี" หรือ Create account
3.3 เลือกประเทศและภาษา
3.4 กรอกชื่อบัญชี เช่น Remind Me Bot
3.5 เลือกหมวดหมู่และอัปโหลดรูปโปรไฟล์
3.6 คลิกสร้างบัญชีให้เสร็จสิ้น

4. วิธีสร้าง Messaging API Channel และรับ Channel Access Token
4.1 ใน LINE Official Account Manager ไปที่ Settings → Messaging API
4.2 คลิก "Apply for Messaging API" หรือ "เปิดใช้ Messaging API"
4.3 เลือก Provider (หรือสร้างใหม่)
4.4 เลือก Channel หรือสร้างใหม่
4.5 หลังจากเปิด Messaging API แล้ว ไปที่ LINE Developers Console
4.6 เลือก Provider และ Channel ของคุณ
4.7 ไปที่ tab Messaging API
4.8 คัดลอก Channel Access Token (หากยังไม่มี ให้คลิก Issue)
4.9 เปิดใช้งาน Webhook โดยใส่ URL: https://script.google.com/macros/s/.../exec (URL หลักของ Web App ที่คุณ Deploy)
4.10 เปิด Use webhook เป็น Enabled

5. วิธีหา LINE User ID
5.1 เพิ่มบอทเป็นเพื่อนใน LINE (แสกน QR Code จากหน้า Settings ของ OA)
5.2 ส่งข้อความอะไรก็ได้ให้บอท 1 ครั้ง
5.3 ใน Web App ไปที่หน้า ตั้งค่า
5.4 คลิกปุ่ม "ดึงล่าสุด" ข้างช่อง User ID หรือดูที่ Sheet Users คอลัมน์ line_user_id

6. วิธีตั้งค่าใน Web App
6.1 ใส่ Channel Access Token ในช่อง "Channel Access Token"
6.2 ใส่ User ID ในช่อง "User ID / Group ID"
6.3 ใส่ Web App URL ในช่อง "ลิงก์ Dashboard" ต่อด้วย ?openExternalBrowser=1
6.4 คลิก "บันทึกการตั้งค่า LINE"
6.5 คลิก "ทดสอบ LINE" เพื่อส่งข้อความทดสอบ
6.6 คลิก "เปิด Trigger" เพื่อให้ระบบตรวจสอบการเตือนอัตโนมัติ

7. วิธีสร้าง Rich Menu (ถ้าต้องการ)
7.1 ออกแบบรูป Rich Menu ขนาด 2500 x 1686 px เป็น PNG หรือ JPEG
7.2 อัปโหลดรูปขึ้น Google Drive
7.3 คัดลอก File ID จากลิงก์ Google Drive
7.4 ใน Web App ไปที่หน้า ตั้งค่า → ส่วน LINE Rich Menu
7.5 ใส่ File ID แล้วคลิก "สร้างและตั้งค่า Rich Menu"

8. ข้อควรระวัง
- อย่าแชร์ Channel Access Token ให้ผู้อื่น
- หาก redeploy Web App URL จะเปลี่ยน ต้องเอา URL ใหม่มาใส่ในหน้าตั้งค่าใหม่
- ระบบใช้ timezone Asia/Bangkok เป็นค่าเริ่มต้น
- ข้อมูลทั้งหมดจะถูกเก็บใน Google Sheet
