# ✈️ ระบบเช็คเวลา WFH - กองทัพอากาศ

> **WFH Attendance System for Royal Thai Air Force**  
> ระบบบันทึกเวลาปฏิบัติงาน Work From Home พร้อมระบบยืนยันตัวตนด้วยใบหน้า และระบุตำแหน่งที่ตั้ง

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Platform](https://img.shields.io/badge/platform-Mobile%20%7C%20iPad-green)
![Database](https://img.shields.io/badge/database-Google%20Sheets-brightgreen)
![Face AI](https://img.shields.io/badge/Face%20AI-face--api.js-orange)

---

## 📱 ฟีเจอร์หลัก

| ฟีเจอร์ | รายละเอียด |
|---------|-----------|
| 👤 ลงทะเบียน | ยศ, ชื่อ-นามสกุล, ตำแหน่ง, สังกัด + ถ่ายภาพใบหน้า |
| 🤳 Face Recognition | ยืนยันตัวตนด้วยใบหน้าก่อนเช็คเวลา (face-api.js) |
| 📍 GPS Location | ระบุตำแหน่งที่ตั้งขณะเช็คเวลา |
| ⏰ เช็คอิน/เช็คเอาท์ | บันทึกเวลาเข้า-ออกงาน พร้อมตรวจสอบการมาสาย |
| 📊 Google Sheets | บันทึกข้อมูลลง Google Sheets อัตโนมัติ |
| 📲 PWA | ติดตั้งเป็นแอปบนมือถือได้ (Progressive Web App) |
| 🇹🇭 ภาษาไทย | แสดงวัน-เดือน-ปี พ.ศ. ตามรูปแบบไทย |

---

## 🏗️ โครงสร้างโปรเจค

```
wfh-attendance/
├── index.html              # หน้าหลัก Web App (Single Page App)
├── styles.css              # CSS สำหรับ Mobile-First Design
├── app.js                  # JavaScript หลัก (Logic ทั้งหมด)
├── manifest.json           # PWA Manifest
├── assets/                 # รูปภาพและไอคอน
│   ├── rtaf-logo.png       # โลโก้กองทัพอากาศ
│   ├── icon-192.png        # PWA Icon 192x192
│   └── icon-512.png        # PWA Icon 512x512
└── google-apps-script/
    └── Code.gs             # Google Apps Script (Backend API)
```

---

## 🚀 วิธีติดตั้ง

### ขั้นตอนที่ 1: สร้าง Google Sheet

1. ไปที่ [Google Sheets](https://sheets.google.com) สร้าง Spreadsheet ใหม่
2. คัดลอก **Spreadsheet ID** จาก URL: `https://docs.google.com/spreadsheets/d/**[ID HERE]**/edit`

### ขั้นตอนที่ 2: ติดตั้ง Google Apps Script

1. ไปที่ [Google Apps Script](https://script.google.com)
2. สร้าง Project ใหม่ ตั้งชื่อ "WFH Attendance API"
3. วางโค้ดจาก `google-apps-script/Code.gs`
4. แก้ไข `SPREADSHEET_ID` บรรทัดที่ 25:
   ```javascript
   const SPREADSHEET_ID = 'ใส่ ID ของ Google Sheet ที่นี่';
   ```
5. Deploy > **New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. คัดลอก **Web App URL**

### ขั้นตอนที่ 3: ตั้งค่า Web App

แก้ไข `app.js` บรรทัด SHEET_API_URL:
```javascript
const CONFIG = {
  SHEET_API_URL: 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec',
  // ... 
};
```

### ขั้นตอนที่ 4: Deploy Web App

**ตัวเลือก A: GitHub Pages (ฟรี)**
1. ไปที่ Repository Settings > Pages
2. Source: Deploy from branch > main
3. URL: `https://GOLFDA.github.io/wfh-attendance/`

**ตัวเลือก B: Upload ขึ้น Web Server**
- อัปโหลดไฟล์ทั้งหมดขึ้น Web Hosting
- ต้องใช้ HTTPS (จำเป็นสำหรับ Camera และ GPS)

---

## 📋 ยศทหารอากาศที่รองรับ

### นายทหารสัญญาบัตร
- จอมพลอากาศ | พลอากาศเอก | พลอากาศโท | พลอากาศตรี
- นาวาอากาศเอก | นาวาอากาศโท | นาวาอากาศตรี
- เรืออากาศเอก | เรืออากาศโท | เรืออากาศตรี

### นายทหารประทวน
- พันจ่าอากาศเอก | พันจ่าอากาศโท | พันจ่าอากาศตรี
- จ่าอากาศเอก | จ่าอากาศโท | จ่าอากาศตรี

### พลทหาร/พลเรือน
- พลอากาศ | พนักงานราชการ | ข้าราชการพลเรือน | ลูกจ้าง

---

## 📊 โครงสร้าง Google Sheets

### Sheet 1: ทะเบียนเจ้าหน้าที่
| หมายเลขประจำตัว | ยศ | ชื่อ | นามสกุล | ตำแหน่ง | สังกัด | วันที่ลงทะเบียน | สถานะ |

### Sheet 2: บันทึกเวลา
| วันที่ | หมายเลขประจำตัว | ยศ | ชื่อ-นามสกุล | ตำแหน่ง | สังกัด | ประเภท | เวลา | ตำแหน่งที่ตั้ง | หมายเหตุ |

### Sheet 3: สรุปรายเดือน
(สร้างอัตโนมัติผ่าน Apps Script)

---

## 🔒 ระบบความปลอดภัย

- **Face Recognition**: ใช้ `face-api.js` กับ TinyFaceDetector model
- **Face Matching Threshold**: 0.45 (ปรับได้ใน CONFIG)
- **GPS Verification**: บันทึก lat/lon พร้อม accuracy
- **Session Management**: เก็บ session ใน localStorage
- **Data Storage**: ข้อมูลสำรองเก็บใน localStorage ก่อน sync

---

## ⚙️ ปรับแต่งเวลาทำงาน

แก้ไขใน `app.js`:
```javascript
const CONFIG = {
  WORK_START_HOUR: 8,    // เวลาเริ่มงาน (ชั่วโมง)
  WORK_START_MIN: 30,    // เวลาเริ่มงาน (นาที) = 08:30
  WORK_END_HOUR: 16,     // เวลาเลิกงาน (ชั่วโมง)
  WORK_END_MIN: 30,      // เวลาเลิกงาน (นาที) = 16:30
};
```

---

## 📲 การติดตั้งเป็น App บนมือถือ

### iPhone/iPad (Safari)
1. เปิดเว็บใน Safari
2. กดปุ่ม Share (📤)
3. เลือก "Add to Home Screen"
4. กด "Add"

### Android (Chrome)
1. เปิดเว็บใน Chrome
2. กดเมนู (⋮)
3. เลือก "Add to Home Screen" หรือ "Install App"

---

## 🛠️ Technology Stack

| เทคโนโลยี | การใช้งาน |
|-----------|----------|
| HTML5/CSS3/JavaScript | Frontend (Vanilla JS, ไม่ใช้ Framework) |
| face-api.js 0.22.2 | Face Detection & Recognition |
| Web Camera API | เข้าถึงกล้อง |
| Geolocation API | ระบุตำแหน่ง GPS |
| Google Apps Script | Backend API |
| Google Sheets | ฐานข้อมูล |
| Progressive Web App | ติดตั้งบนมือถือ |
| localStorage | เก็บข้อมูลชั่วคราว |

---

## 📞 ปัญหาที่พบบ่อย

**กล้องไม่เปิด:**
- ต้องเข้าผ่าน HTTPS เท่านั้น
- ต้องให้สิทธิ์ Camera access

**GPS ไม่ทำงาน:**
- ต้องให้สิทธิ์ Location access
- เปิด Location services บนมือถือ

**Face Recognition ไม่แม่น:**
- ปรับ `FACE_MATCH_THRESHOLD` (0.3-0.6)
- ถ่ายในที่แสงสว่างเพียงพอ

**ข้อมูลไม่เข้า Google Sheets:**
- ตรวจสอบ `SHEET_API_URL` ใน app.js
- ตรวจสอบ Apps Script deployment
- ดู Console log สำหรับ error

---

## 📄 License

MIT License - สร้างเพื่อใช้งานภายในกองทัพอากาศไทย

---

*พัฒนาโดย: ระบบเช็คเวลา WFH v1.0.0*
