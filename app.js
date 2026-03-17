/**
 * WFH Attendance System - Royal Thai Air Force
 * app.js - Main Application Logic
 * 
 * Features:
 * - User Registration with Face Enrollment
 * - Face Recognition Authentication (face-api.js)
 * - GPS Location Detection
 * - Check-In / Check-Out Recording
 * - Google Sheets Integration
 */

// ============ CONFIGURATION ============
const CONFIG = {
  // Replace with your Google Apps Script Web App URL
  SHEET_API_URL: 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec',
  
  // Work schedule settings
  WORK_START_HOUR: 8,    // 08:00
  WORK_START_MIN: 30,
  WORK_END_HOUR: 16,     // 16:30
  WORK_END_MIN: 30,
  
  // Face recognition threshold (0-1, lower = more strict)
  FACE_MATCH_THRESHOLD: 0.45,
  
  // Models path (face-api.js models)
  MODELS_PATH: 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/',
  
  // App version
  VERSION: '1.0.0'
};

// ============ STATE ============
const State = {
  currentUser: null,
  attendanceMode: 'checkin', // 'checkin' or 'checkout'
  faceDescriptors: [],
  videoStream: null,
  faceDetectionInterval: null,
  capturedFaceDescriptor: null,
  capturedFaceImage: null,
  currentLocation: null,
  locationWatcher: null,
  faceModelsLoaded: false,
  clockInterval: null
};

// ============ THAI LOCALE ============
const THAI_MONTHS = [
  'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'
];

const THAI_DAYS = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];

function getThaiDate(date = new Date()) {
  const d = date.getDay();
  const dd = date.getDate();
  const mm = date.getMonth();
  const yyyy = date.getFullYear() + 543;
  return `วัน${THAI_DAYS[d]}ที่ ${dd} ${THAI_MONTHS[mm]} ${yyyy}`;
}

function getThaiTime(date = new Date()) {
  return date.toLocaleTimeString('th-TH', {hour12: false});
}

function formatThaiDateTime(isoString) {
  const d = new Date(isoString);
  return `${getThaiDate(d)} ${getThaiTime(d)}`;
}

// ============ LOCAL STORAGE ============
const DB = {
  getUsers() {
    try { return JSON.parse(localStorage.getItem('wfh_users') || '[]'); }
    catch { return []; }
  },
  saveUsers(users) {
    localStorage.setItem('wfh_users', JSON.stringify(users));
  },
  getUser(id) {
    return this.getUsers().find(u => u.id === id);
  },
  addUser(user) {
    const users = this.getUsers();
    users.push(user);
    this.saveUsers(users);
  },
  getRecords(userId) {
    try { return JSON.parse(localStorage.getItem(`wfh_records_${userId}`) || '[]'); }
    catch { return []; }
  },
  addRecord(userId, record) {
    const records = this.getRecords(userId);
    records.unshift(record);
    if (records.length > 30) records.pop(); // keep last 30
    localStorage.setItem(`wfh_records_${userId}`, JSON.stringify(records));
  },
  getTodayRecord(userId) {
    const today = new Date().toDateString();
    return this.getRecords(userId).find(r => new Date(r.date).toDateString() === today);
  }
};

// ============ APP CONTROLLER ============
const App = {
  
  // ---- Initialization ----
  async init() {
    console.log('WFH Attendance System v' + CONFIG.VERSION + ' starting...');
    
    // Start clock
    this.startClock();
    
    // Load face models in background
    this.loadFaceModels();
    
    // Check if user is already logged in
    const savedSession = localStorage.getItem('wfh_session');
    if (savedSession) {
      try {
        const session = JSON.parse(savedSession);
        const user = DB.getUser(session.userId);
        if (user) {
          State.currentUser = user;
          setTimeout(() => {
            this.showScreen('dashboard-screen');
            this.updateDashboard();
            this.startLocationWatch();
          }, 1500);
          return;
        }
      } catch {}
    }
    
    // Show login after loading
    setTimeout(() => {
      this.showScreen('login-screen');
    }, 2000);
  },

  // ---- Clock ----
  startClock() {
    const update = () => {
      const now = new Date();
      const timeEl = document.getElementById('current-time');
      const dateEl = document.getElementById('current-date');
      const attendTimeEl = document.getElementById('attend-time');
      const attendDateEl = document.getElementById('attend-date');
      
      if (timeEl) timeEl.textContent = getThaiTime(now);
      if (dateEl) dateEl.textContent = getThaiDate(now);
      if (attendTimeEl) attendTimeEl.textContent = getThaiTime(now);
      if (attendDateEl) attendDateEl.textContent = getThaiDate(now);
    };
    update();
    State.clockInterval = setInterval(update, 1000);
  },

  // ---- Screen Navigation ----
  showScreen(screenId) {
    const screens = document.querySelectorAll('.screen');
    screens.forEach(s => {
      s.classList.remove('active');
      s.style.display = 'none';
    });
    
    const target = document.getElementById(screenId);
    if (target) {
      target.style.display = 'block';
      setTimeout(() => target.classList.add('active'), 10);
    }
  },

  // ---- Face Models ----
  async loadFaceModels() {
    try {
      document.getElementById('loading-text').textContent = 'กำลังโหลด Face Recognition...';
      
      const MODEL_URL = CONFIG.MODELS_PATH;
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
      ]);
      
      State.faceModelsLoaded = true;
      document.getElementById('loading-text').textContent = 'โหลดระบบสำเร็จ';
      console.log('Face models loaded');
    } catch (err) {
      console.warn('Face models failed to load:', err);
      document.getElementById('loading-text').textContent = 'โหลดระบบ (ไม่มี Face API)';
      State.faceModelsLoaded = false;
    }
  },

  // ---- Location ----
  startLocationWatch() {
    if (!navigator.geolocation) {
      this.updateLocationDisplay('ไม่รองรับ GPS');
      return;
    }
    
    const updateLocation = (pos) => {
      State.currentLocation = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy: pos.coords.accuracy
      };
      const locText = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)} (±${Math.round(pos.coords.accuracy)}ม.)`;
      this.updateLocationDisplay(locText);
    };
    
    const onError = (err) => {
      console.warn('GPS error:', err);
      this.updateLocationDisplay('ไม่สามารถระบุตำแหน่งได้');
    };
    
    navigator.geolocation.getCurrentPosition(updateLocation, onError, {
      enableHighAccuracy: true, timeout: 10000, maximumAge: 30000
    });
    
    State.locationWatcher = navigator.geolocation.watchPosition(updateLocation, onError, {
      enableHighAccuracy: true, timeout: 15000, maximumAge: 60000
    });
  },
  
  updateLocationDisplay(text) {
    const el = document.getElementById('location-text');
    const attendEl = document.getElementById('attend-location');
    if (el) el.textContent = text;
    if (attendEl) attendEl.textContent = text;
  },

  // ---- Login ----
  async login() {
    const userId = document.getElementById('login-id').value.trim();
    const password = document.getElementById('login-password').value;
    
    if (!userId || !password) {
      this.showToast('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }
    
    const user = DB.getUser(userId);
    if (!user) {
      this.showToast('ไม่พบหมายเลขประจำตัวนี้ในระบบ');
      return;
    }
    
    // Simple password check (in production, use proper hashing)
    if (user.passwordHash !== this.hashPassword(password)) {
      this.showToast('รหัสผ่านไม่ถูกต้อง');
      return;
    }
    
    State.currentUser = user;
    localStorage.setItem('wfh_session', JSON.stringify({ userId: user.id, timestamp: Date.now() }));
    
    this.showToast('เข้าสู่ระบบสำเร็จ ยินดีต้อนรับ ' + user.rank + ' ' + user.firstName);
    this.showScreen('dashboard-screen');
    this.updateDashboard();
    this.startLocationWatch();
  },

  // ---- Logout ----
  logout() {
    State.currentUser = null;
    localStorage.removeItem('wfh_session');
    this.stopCamera('attend');
    this.stopCamera('reg');
    if (State.locationWatcher) navigator.geolocation.clearWatch(State.locationWatcher);
    this.showScreen('login-screen');
    document.getElementById('login-id').value = '';
    document.getElementById('login-password').value = '';
    this.showToast('ออกจากระบบแล้ว');
  },

  // ---- Password Hashing (simple, replace with bcrypt in production) ----
  hashPassword(password) {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
      const char = password.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  },

  // ---- Registration ----
  async register() {
    const rank = document.getElementById('reg-rank').value;
    const firstName = document.getElementById('reg-firstname').value.trim();
    const lastName = document.getElementById('reg-lastname').value.trim();
    const userId = document.getElementById('reg-id').value.trim();
    const position = document.getElementById('reg-position').value.trim();
    const unit = document.getElementById('reg-unit').value.trim();
    const password = document.getElementById('reg-password').value;
    const password2 = document.getElementById('reg-password2').value;
    
    // Validation
    if (!rank || !firstName || !lastName || !userId || !position || !unit || !password) {
      this.showToast('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }
    
    if (password.length < 6) {
      this.showToast('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }
    
    if (password !== password2) {
      this.showToast('รหัสผ่านไม่ตรงกัน');
      return;
    }
    
    if (!State.capturedFaceDescriptor) {
      this.showToast('กรุณาลงทะเบียนใบหน้าก่อน');
      return;
    }
    
    if (DB.getUser(userId)) {
      this.showToast('หมายเลขประจำตัวนี้มีอยู่ในระบบแล้ว');
      return;
    }
    
    const newUser = {
      id: userId,
      rank,
      firstName,
      lastName,
      position,
      unit,
      passwordHash: this.hashPassword(password),
      faceDescriptor: Array.from(State.capturedFaceDescriptor),
      faceImage: State.capturedFaceImage,
      registeredAt: new Date().toISOString()
    };
    
    DB.addUser(newUser);
    
    // Send to Google Sheets
    this.sendToSheet('register', {
      id: userId, rank, firstName, lastName, position, unit,
      registeredAt: newUser.registeredAt
    });
    
    // Clean up
    State.capturedFaceDescriptor = null;
    State.capturedFaceImage = null;
    this.stopCamera('reg');
    
    this.showModal('ลงทะเบียนสำเร็จ', 
      `ยินดีต้อนรับ ${rank} ${firstName} ${lastName}\nหน่วย: ${unit}\nตำแหน่ง: ${position}`);
    
    setTimeout(() => {
      this.closeModal();
      this.showScreen('login-screen');
    }, 3000);
  },

  // ---- Camera Controls ----
  async startFaceCapture(mode) {
    try {
      const videoId = mode === 'register' ? 'reg-video' : 'attend-video';
      const statusId = mode === 'register' ? 'reg-face-status' : 'attend-face-status';
      const captureBtnId = mode === 'register' ? 'reg-capture-btn' : 'attend-capture-btn';
      const cameraBtnId = mode === 'register' ? 'reg-camera-btn' : 'attend-camera-btn';
      
      const video = document.getElementById(videoId);
      
      // Request camera with front-facing preference
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 640 }
        },
        audio: false
      });
      
      video.srcObject = stream;
      State.videoStream = stream;
      
      document.getElementById(statusId).textContent = 'กำลังตรวจจับใบหน้า...';
      document.getElementById(cameraBtnId).textContent = '🔴 ปิดกล้อง';
      document.getElementById(cameraBtnId).onclick = () => this.stopCamera(mode === 'register' ? 'reg' : 'attend');
      
      // Start face detection
      if (State.faceModelsLoaded) {
        this.startFaceDetection(mode, video, statusId, captureBtnId);
      } else {
        document.getElementById(statusId).textContent = 'กดปุ่มเพื่อถ่ายภาพใบหน้า';
        document.getElementById(captureBtnId).disabled = false;
      }
      
    } catch (err) {
      console.error('Camera error:', err);
      this.showToast('ไม่สามารถเปิดกล้องได้: ' + err.message);
    }
  },

  startFaceDetection(mode, video, statusId, captureBtnId) {
    if (State.faceDetectionInterval) clearInterval(State.faceDetectionInterval);
    
    State.faceDetectionInterval = setInterval(async () => {
      if (video.readyState < 2) return;
      
      try {
        const canvasId = mode === 'register' ? 'reg-canvas' : 'attend-canvas';
        const canvas = document.getElementById(canvasId);
        
        const detection = await faceapi.detectSingleFace(
          video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 })
        ).withFaceLandmarks(true).withFaceDescriptor();
        
        if (detection) {
          document.getElementById(statusId).textContent = '✓ ตรวจพบใบหน้า - กดถ่ายภาพ';
          document.getElementById(captureBtnId).disabled = false;
          
          // Draw detection box
          const displaySize = { width: video.videoWidth, height: video.videoHeight };
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          faceapi.matchDimensions(canvas, displaySize);
          const resized = faceapi.resizeResults(detection, displaySize);
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.strokeStyle = '#FFD700';
          ctx.lineWidth = 3;
          ctx.strokeRect(
            resized.detection.box.x, resized.detection.box.y,
            resized.detection.box.width, resized.detection.box.height
          );
        } else {
          document.getElementById(statusId).textContent = 'กรุณาจัดตำแหน่งใบหน้าให้อยู่ในกรอบ';
          document.getElementById(captureBtnId).disabled = true;
        }
      } catch {}
    }, 500);
  },

  async captureFace(mode) {
    const videoId = mode === 'register' ? 'reg-video' : 'attend-video';
    const video = document.getElementById(videoId);
    
    if (!video || video.readyState < 2) {
      this.showToast('กรุณาเปิดกล้องก่อน');
      return;
    }
    
    // Capture image from video
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = video.videoWidth || 320;
    captureCanvas.height = video.videoHeight || 320;
    const ctx = captureCanvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const imageData = captureCanvas.toDataURL('image/jpeg', 0.8);
    
    if (State.faceModelsLoaded) {
      try {
        const detection = await faceapi.detectSingleFace(
          video, new faceapi.TinyFaceDetectorOptions()
        ).withFaceLandmarks(true).withFaceDescriptor();
        
        if (!detection) {
          this.showToast('ไม่พบใบหน้าในภาพ กรุณาลองใหม่');
          return;
        }
        
        State.capturedFaceDescriptor = detection.descriptor;
        State.capturedFaceImage = imageData;
        
        if (mode === 'register') {
          document.getElementById('reg-face-img').src = imageData;
          document.getElementById('reg-face-preview').classList.remove('hidden');
          document.getElementById('reg-face-status').textContent = '✓ บันทึกใบหน้าสำเร็จ';
          this.showToast('บันทึกใบหน้าสำเร็จ');
        }
      } catch (err) {
        console.error('Face capture error:', err);
        // Fallback: use image without descriptor
        State.capturedFaceImage = imageData;
        State.capturedFaceDescriptor = new Float32Array(128).fill(0);
        if (mode === 'register') {
          document.getElementById('reg-face-img').src = imageData;
          document.getElementById('reg-face-preview').classList.remove('hidden');
        }
      }
    } else {
      // No face API - just save image
      State.capturedFaceImage = imageData;
      State.capturedFaceDescriptor = new Float32Array(128).fill(0);
      if (mode === 'register') {
        document.getElementById('reg-face-img').src = imageData;
        document.getElementById('reg-face-preview').classList.remove('hidden');
        this.showToast('บันทึกรูปภาพสำเร็จ (โหมดไม่มี AI)');
      }
    }
  },

  stopCamera(prefix) {
    if (State.videoStream) {
      State.videoStream.getTracks().forEach(t => t.stop());
      State.videoStream = null;
    }
    if (State.faceDetectionInterval) {
      clearInterval(State.faceDetectionInterval);
      State.faceDetectionInterval = null;
    }
    const videoEl = document.getElementById(prefix + '-video');
    if (videoEl) videoEl.srcObject = null;
    const btnId = prefix === 'reg' ? 'reg-camera-btn' : 'attend-camera-btn';
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.textContent = '📷 เปิดกล้อง';
      btn.onclick = () => this.startFaceCapture(prefix === 'reg' ? 'register' : 'attend');
    }
  },

  // ---- Dashboard ----
  updateDashboard() {
    const user = State.currentUser;
    if (!user) return;
    
    // Update user info
    document.getElementById('user-rank-name').textContent = `${user.rank} ${user.firstName} ${user.lastName}`;
    document.getElementById('user-position').textContent = user.position;
    document.getElementById('user-unit').textContent = user.unit;
    document.getElementById('user-initials').textContent = user.firstName.charAt(0);
    
    if (user.faceImage) {
      const img = document.getElementById('user-face-img');
      img.src = user.faceImage;
      img.style.display = 'block';
    }
    
    // Check today's record
    this.updateTodayStatus();
    
    // Load recent records
    this.loadRecentRecords();
  },

  updateTodayStatus() {
    if (!State.currentUser) return;
    const todayRecord = DB.getTodayRecord(State.currentUser.id);
    
    const checkinStatus = document.getElementById('checkin-status');
    const checkinTime = document.getElementById('checkin-time');
    const checkoutStatus = document.getElementById('checkout-status');
    const checkoutTime = document.getElementById('checkout-time');
    const checkinBtn = document.getElementById('checkin-btn');
    const checkoutBtn = document.getElementById('checkout-btn');
    
    if (todayRecord && todayRecord.checkIn) {
      const time = new Date(todayRecord.checkIn);
      checkinTime.textContent = getThaiTime(time);
      checkinStatus.className = 'status-card status-success';
      if (checkinBtn) checkinBtn.disabled = true;
    } else {
      checkinTime.textContent = 'ยังไม่ได้เช็คอิน';
      checkinStatus.className = 'status-card status-pending';
      if (checkinBtn) checkinBtn.disabled = false;
    }
    
    if (todayRecord && todayRecord.checkOut) {
      const time = new Date(todayRecord.checkOut);
      checkoutTime.textContent = getThaiTime(time);
      checkoutStatus.className = 'status-card status-success';
      if (checkoutBtn) checkoutBtn.disabled = true;
    } else {
      checkoutTime.textContent = 'ยังไม่ได้เช็คเอาท์';
      checkoutStatus.className = 'status-card status-pending';
      if (checkoutBtn) checkoutBtn.disabled = !!(todayRecord && todayRecord.checkIn) ? false : true;
    }
  },

  loadRecentRecords() {
    if (!State.currentUser) return;
    const records = DB.getRecords(State.currentUser.id).slice(0, 7);
    const listEl = document.getElementById('records-list');
    
    if (records.length === 0) {
      listEl.innerHTML = '<div class="no-records">ไม่มีประวัติการเช็คเวลา</div>';
      return;
    }
    
    listEl.innerHTML = records.map(r => {
      const date = new Date(r.date);
      const checkIn = r.checkIn ? getThaiTime(new Date(r.checkIn)) : '-';
      const checkOut = r.checkOut ? getThaiTime(new Date(r.checkOut)) : '-';
      
      let statusClass = 'on-time', statusText = 'ตรงเวลา';
      if (r.checkIn) {
        const inTime = new Date(r.checkIn);
        const startTime = new Date(r.checkIn);
        startTime.setHours(CONFIG.WORK_START_HOUR, CONFIG.WORK_START_MIN, 0, 0);
        if (inTime > startTime) { statusClass = 'late'; statusText = 'สาย'; }
      } else { statusClass = 'absent'; statusText = 'ขาด'; }
      
      return `
        <div class="record-item">
          <div>
            <div class="record-date">${date.getDate()} ${THAI_MONTHS[date.getMonth()].substring(0,3)} ${date.getFullYear()+543}</div>
            <span class="record-status ${statusClass}">${statusText}</span>
          </div>
          <div class="record-times">
            <div>เข้า: ${checkIn}</div>
            <div>ออก: ${checkOut}</div>
          </div>
        </div>
      `;
    }).join('');
  },

  // ---- Attendance Screen ----
  showAttendanceScreen(mode) {
    State.attendanceMode = mode;
    document.getElementById('attendance-title').textContent = mode === 'checkin' ? 'เช็คอิน' : 'เช็คเอาท์';
    document.getElementById('attendance-subtitle').textContent = mode === 'checkin' ? 'บันทึกเวลาเข้างาน' : 'บันทึกเวลาออกงาน';
    
    // Reset verify result
    const result = document.getElementById('verify-result');
    result.className = 'verify-result hidden';
    
    State.capturedFaceDescriptor = null;
    State.capturedFaceImage = null;
    
    // Reset camera button
    const btn = document.getElementById('attend-camera-btn');
    if (btn) {
      btn.textContent = '📷 เปิดกล้อง';
      btn.onclick = () => this.startFaceCapture('attend');
    }
    const captureBtn = document.getElementById('attend-capture-btn');
    if (captureBtn) captureBtn.disabled = true;
    
    this.showScreen('attendance-screen');
  },

  // ---- Face Verification & Record ----
  async verifyAndRecord() {
    const video = document.getElementById('attend-video');
    if (!video || video.readyState < 2) {
      this.showToast('กรุณาเปิดกล้องก่อน');
      return;
    }
    
    const resultEl = document.getElementById('verify-result');
    const iconEl = document.getElementById('verify-icon');
    const msgEl = document.getElementById('verify-message');
    
    resultEl.className = 'verify-result';
    iconEl.textContent = '🔄';
    msgEl.textContent = 'กำลังตรวจสอบใบหน้า...';
    
    let verified = false;
    
    if (State.faceModelsLoaded && State.currentUser.faceDescriptor) {
      try {
        const detection = await faceapi.detectSingleFace(
          video, new faceapi.TinyFaceDetectorOptions()
        ).withFaceLandmarks(true).withFaceDescriptor();
        
        if (!detection) {
          resultEl.className = 'verify-result error';
          iconEl.textContent = '❌';
          msgEl.textContent = 'ไม่พบใบหน้า กรุณาลองใหม่';
          return;
        }
        
        const storedDescriptor = new Float32Array(State.currentUser.faceDescriptor);
        const distance = faceapi.euclideanDistance(detection.descriptor, storedDescriptor);
        
        console.log('Face distance:', distance);
        
        if (distance < CONFIG.FACE_MATCH_THRESHOLD) {
          verified = true;
        } else {
          resultEl.className = 'verify-result error';
          iconEl.textContent = '❌';
          msgEl.textContent = `ใบหน้าไม่ตรงกัน (ความแตกต่าง: ${distance.toFixed(3)})\nกรุณาลองใหม่`;
          return;
        }
      } catch (err) {
        console.error('Verification error:', err);
        verified = true; // Fallback: allow if face API fails
      }
    } else {
      verified = true; // No face API: just record
    }
    
    if (verified) {
      await this.recordAttendance();
    }
  },

  async recordAttendance() {
    const user = State.currentUser;
    const now = new Date();
    const mode = State.attendanceMode;
    const resultEl = document.getElementById('verify-result');
    const iconEl = document.getElementById('verify-icon');
    const msgEl = document.getElementById('verify-message');
    
    // Get or create today's record
    let todayRecord = DB.getTodayRecord(user.id);
    
    if (!todayRecord) {
      todayRecord = {
        date: now.toISOString(),
        checkIn: null, checkInLocation: null,
        checkOut: null, checkOutLocation: null
      };
    }
    
    const locationStr = State.currentLocation 
      ? `${State.currentLocation.lat},${State.currentLocation.lon}`
      : 'ไม่ทราบตำแหน่ง';
    
    if (mode === 'checkin') {
      if (todayRecord.checkIn) {
        resultEl.className = 'verify-result error';
        iconEl.textContent = '⚠️';
        msgEl.textContent = 'ได้เช็คอินวันนี้แล้ว';
        return;
      }
      todayRecord.checkIn = now.toISOString();
      todayRecord.checkInLocation = locationStr;
      
      // Check if late
      const startTime = new Date(now);
      startTime.setHours(CONFIG.WORK_START_HOUR, CONFIG.WORK_START_MIN, 0, 0);
      const isLate = now > startTime;
      
      iconEl.textContent = '✅';
      msgEl.textContent = `เช็คอินสำเร็จ!\n${getThaiTime(now)}\n${isLate ? '⚠️ สาย' : '✓ ตรงเวลา'}`;
      resultEl.className = 'verify-result success';
      
    } else { // checkout
      if (!todayRecord.checkIn) {
        resultEl.className = 'verify-result error';
        iconEl.textContent = '⚠️';
        msgEl.textContent = 'ยังไม่ได้เช็คอิน';
        return;
      }
      if (todayRecord.checkOut) {
        resultEl.className = 'verify-result error';
        iconEl.textContent = '⚠️';
        msgEl.textContent = 'ได้เช็คเอาท์วันนี้แล้ว';
        return;
      }
      todayRecord.checkOut = now.toISOString();
      todayRecord.checkOutLocation = locationStr;
      
      iconEl.textContent = '✅';
      msgEl.textContent = `เช็คเอาท์สำเร็จ!\n${getThaiTime(now)}`;
      resultEl.className = 'verify-result success';
    }
    
    // Save locally
    const existingRecords = DB.getRecords(user.id);
    const todayStr = now.toDateString();
    const existingIdx = existingRecords.findIndex(r => new Date(r.date).toDateString() === todayStr);
    
    if (existingIdx >= 0) {
      existingRecords[existingIdx] = todayRecord;
      localStorage.setItem(`wfh_records_${user.id}`, JSON.stringify(existingRecords));
    } else {
      DB.addRecord(user.id, todayRecord);
    }
    
    // Send to Google Sheets
    this.sendToSheet('attendance', {
      userId: user.id,
      rank: user.rank,
      name: `${user.firstName} ${user.lastName}`,
      position: user.position,
      unit: user.unit,
      type: mode,
      timestamp: now.toISOString(),
      location: locationStr,
      date: now.toLocaleDateString('th-TH')
    });
    
    // Stop camera
    this.stopCamera('attend');
    
    // Update dashboard after delay
    setTimeout(() => {
      this.showScreen('dashboard-screen');
      this.updateTodayStatus();
      this.loadRecentRecords();
    }, 2500);
  },

  // ---- Google Sheets API ----
  async sendToSheet(action, data) {
    if (!CONFIG.SHEET_API_URL || CONFIG.SHEET_API_URL.includes('YOUR_SCRIPT_ID')) {
      console.warn('Google Sheets API URL not configured');
      return;
    }
    
    try {
      const payload = { action, ...data };
      const response = await fetch(CONFIG.SHEET_API_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      console.log('Sheet sync:', action);
    } catch (err) {
      console.warn('Sheet sync failed (will retry on next action):', err);
    }
  },

  // ---- UI Helpers ----
  showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    const msg = document.getElementById('toast-message');
    msg.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), duration);
  },

  showModal(title, body) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').textContent = body;
    document.getElementById('modal-overlay').classList.remove('hidden');
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
  }
};

// ============ STARTUP ============
document.addEventListener('DOMContentLoaded', () => {
  // Show loading screen immediately
  document.getElementById('loading-screen').style.display = 'block';
  document.getElementById('loading-screen').classList.add('active');
  
  // Wait for face-api.js to potentially load
  const checkFaceAPI = setInterval(() => {
    if (typeof faceapi !== 'undefined' || Date.now() > window._startTime + 5000) {
      clearInterval(checkFaceAPI);
      App.init();
    }
  }, 200);
  
  window._startTime = Date.now();
  
  // Force init after 3 seconds even if face-api not loaded
  setTimeout(() => {
    clearInterval(checkFaceAPI);
    App.init();
  }, 3000);
});
