/**
 * WFH Attendance System - Google Apps Script Backend
 * Code.gs
 * 
 * วิธีติดตั้ง:
 * 1. ไปที่ https://script.google.com สร้าง Project ใหม่
 * 2. วางโค้ดนี้แทนที่โค้ดเดิม
 * 3. แก้ไข SPREADSHEET_ID ให้ตรงกับ Google Sheet ของคุณ
 * 4. กด Deploy > New deployment > Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy Web App URL ไปวางใน app.js ที่ CONFIG.SHEET_API_URL
 */

// ============ CONFIGURATION ============
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';
const SHEET_NAMES = {
  USERS: 'ทะเบียนเจ้าหน้าที่',
  ATTENDANCE: 'บันทึกเวลา',
  SUMMARY: 'สรุปรายเดือน'
};

// ============ MAIN HANDLER ============
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    let result;
    
    switch (data.action) {
      case 'register':
        result = handleRegister(data);
        break;
      case 'attendance':
        result = handleAttendance(data);
        break;
      case 'getRecords':
        result = handleGetRecords(data);
        break;
      default:
        result = { success: false, message: 'Unknown action: ' + data.action };
    }
    
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  const action = e.parameter.action;
  
  if (action === 'getSummary') {
    return ContentService
      .createTextOutput(JSON.stringify(handleGetSummary(e.parameter)))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // Return app info
  return ContentService
    .createTextOutput(JSON.stringify({ 
      status: 'WFH Attendance API Running',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============ HANDLERS ============

function handleRegister(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAMES.USERS);
  
  // Create sheet if not exists
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAMES.USERS);
    // Add headers
    sheet.getRange(1, 1, 1, 8).setValues([[
      'หมายเลขประจำตัว', 'ยศ', 'ชื่อ', 'นามสกุล', 
      'ตำแหน่ง', 'สังกัด', 'วันที่ลงทะเบียน', 'สถานะ'
    ]]);
    sheet.getRange(1, 1, 1, 8).setFontBold(true);
    sheet.getRange(1, 1, 1, 8).setBackground('#003087');
    sheet.getRange(1, 1, 1, 8).setFontColor('#FFFFFF');
  }
  
  // Check if user already exists
  const data_range = sheet.getDataRange().getValues();
  for (let i = 1; i < data_range.length; i++) {
    if (data_range[i][0] == data.id) {
      return { success: false, message: 'User already exists' };
    }
  }
  
  // Add new user
  sheet.appendRow([
    data.id,
    data.rank,
    data.firstName,
    data.lastName,
    data.position,
    data.unit,
    new Date(data.registeredAt),
    'ใช้งานอยู่'
  ]);
  
  return { success: true, message: 'User registered successfully' };
}

function handleAttendance(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAMES.ATTENDANCE);
  
  // Create sheet if not exists
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAMES.ATTENDANCE);
    sheet.getRange(1, 1, 1, 10).setValues([[
      'วันที่', 'หมายเลขประจำตัว', 'ยศ', 'ชื่อ-นามสกุล',
      'ตำแหน่ง', 'สังกัด', 'ประเภท', 'เวลา', 'ตำแหน่งที่ตั้ง', 'หมายเหตุ'
    ]]);
    sheet.getRange(1, 1, 1, 10).setFontBold(true);
    sheet.getRange(1, 1, 1, 10).setBackground('#003087');
    sheet.getRange(1, 1, 1, 10).setFontColor('#FFFFFF');
  }
  
  const now = new Date(data.timestamp);
  const thaiDate = Utilities.formatDate(now, 'Asia/Bangkok', 'dd/MM/yyyy');
  const thaiTime = Utilities.formatDate(now, 'Asia/Bangkok', 'HH:mm:ss');
  
  // Determine status (on-time/late)
  let note = '';
  if (data.type === 'checkin') {
    const startTime = new Date(now);
    startTime.setHours(8, 30, 0, 0);
    note = now > startTime ? 'สาย' : 'ตรงเวลา';
  }
  
  sheet.appendRow([
    thaiDate,
    data.userId,
    data.rank,
    data.name,
    data.position,
    data.unit,
    data.type === 'checkin' ? 'เช็คอิน' : 'เช็คเอาท์',
    thaiTime,
    data.location,
    note
  ]);
  
  // Auto-resize columns
  try { sheet.autoResizeColumns(1, 10); } catch {}
  
  return { success: true, message: 'Attendance recorded', time: thaiTime };
}

function handleGetRecords(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAMES.ATTENDANCE);
  if (!sheet) return { success: true, records: [] };
  
  const allData = sheet.getDataRange().getValues();
  const records = [];
  
  for (let i = 1; i < allData.length; i++) {
    if (allData[i][1] == data.userId) {
      records.push({
        date: allData[i][0],
        userId: allData[i][1],
        rank: allData[i][2],
        name: allData[i][3],
        type: allData[i][6],
        time: allData[i][7],
        location: allData[i][8],
        note: allData[i][9]
      });
    }
  }
  
  return { success: true, records: records.slice(-30) };
}

function handleGetSummary(params) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAMES.ATTENDANCE);
  if (!sheet) return { success: true, summary: [] };
  
  const month = params.month || (new Date().getMonth() + 1);
  const year = params.year || new Date().getFullYear();
  
  const allData = sheet.getDataRange().getValues();
  const summary = {};
  
  for (let i = 1; i < allData.length; i++) {
    const dateStr = allData[i][0];
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const rowMonth = parseInt(parts[1]);
      const rowYear = parseInt(parts[2]);
      if (rowMonth === parseInt(month) && rowYear === parseInt(year)) {
        const userId = allData[i][1];
        if (!summary[userId]) {
          summary[userId] = {
            name: allData[i][3], rank: allData[i][2],
            unit: allData[i][5], days: new Set(), late: 0
          };
        }
        summary[userId].days.add(allData[i][0]);
        if (allData[i][6] === 'เช็คอิน' && allData[i][9] === 'สาย') {
          summary[userId].late++;
        }
      }
    }
  }
  
  const result = Object.entries(summary).map(([id, s]) => ({
    userId: id, name: s.name, rank: s.rank, unit: s.unit,
    workDays: s.days.size, lateDays: s.late
  }));
  
  return { success: true, summary: result };
}

// ============ SETUP FUNCTION ============
// Run this once to set up the spreadsheet
function setupSpreadsheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // Create all sheets if they don't exist
  Object.values(SHEET_NAMES).forEach(name => {
    if (!ss.getSheetByName(name)) {
      ss.insertSheet(name);
    }
  });
  
  Logger.log('Setup complete!');
}
