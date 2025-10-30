// ==========================================================
// == ✨ ค่าคงที่ - กรุณาตรวจสอบให้ถูกต้อง ✨ ==
// ==========================================================
// LIFF ID ของหน้านี้ (technician_liff_js)
const LIFF_ID = "2008231531-3LAmQ8nk"; // <--- ⚠️ LIFF ID ของช่าง (อันใหม่)

// URL ของ Google Apps Script Web App ที่ Deploy แล้ว
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyibX_LWg6o6hbp_zq2M2R__4fUMECAptdOxYGqgjtBvLnhrw6Lzs2ILucrVEGgV_U/exec"; // <--- ⚠️ ใส่ URL .gs Web App ของคุณ
// ==========================================================

// --- ตัวแปร Global ---
let lineProfile = null;      // เก็บข้อมูล Profile จาก LINE
let technicianUser = null; // เก็บข้อมูล User (รวม Role) จาก Google Sheet
let currentTicketId = null;  // เก็บ Ticket ID ที่ดึงมาจาก URL

// --- DOM Elements ---
const loadingDiv = document.getElementById('loading');
const appContainer = document.getElementById('appContainer');
const ticketIdDisplay = document.getElementById('ticketIdDisplay');
const updateForm = document.getElementById('updateForm');
const saveButton = document.getElementById('saveButton');
const operatorSelect = document.getElementById('action-operator');
const statusSelect = document.getElementById('action-status');
const workDateInput = document.getElementById('action-workDate');
const workTimeInput = document.getElementById('action-workTime');
const solutionTextarea = document.getElementById('action-solution');
// (ใหม่) ปุ่ม Login/Logout
const btnLogIn = document.getElementById('btnLogin');
const btnLogOut = document.getElementById('btnLogout');

// ==========================================================
// == ✨ LOGIC การ INITIALIZE LIFF (แบบใหม่) ✨ ==
// ==========================================================

/**
 * ฟังก์ชันตรวจสอบว่าเป็น Mobile Browser หรือไม่
 */
function mobileCheck() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * ฟังก์ชันหลักที่ทำงานหลังจาก Login สำเร็จ
 * (ย้ายโค้ดเดิมจาก DOMContentLoaded มาไว้ที่นี่)
 */
async function initializeApp() {
    try {
        log("App Initializing (User is logged in)...");

        // 1. แสดง Logout Button (ถ้าเราอยู่ใน External Browser)
        if (!liff.isInClient()) {
            btnLogOut.style.display = 'block';
        }

        // 2. ดึงโปรไฟล์ LINE
        log("Getting LINE profile...");
        lineProfile = await liff.getProfile();
        if (!lineProfile || !lineProfile.userId) {
            throw new Error("ไม่สามารถดึงข้อมูลโปรไฟล์ LINE ได้");
        }
        log(`Logged in as: ${lineProfile.displayName} (${lineProfile.userId})`);

        // 3. ตรวจสอบ Role จาก Backend
        log("Verifying user role...");
        technicianUser = await fetchFromApi('getUserByLineId', { lineId: lineProfile.userId });

        if (!technicianUser || technicianUser.error || !technicianUser.role || !['Admin', 'Technician'].includes(technicianUser.role)) {
            let errorMsg = "คุณไม่มีสิทธิ์เข้าใช้งานหน้านี้";
            if (technicianUser && technicianUser.error) errorMsg = `เกิดข้อผิดพลาด: ${technicianUser.error}`;
            else if (!technicianUser || !technicianUser.role) errorMsg = `ไม่พบข้อมูลผู้ใช้ (${lineProfile.displayName}) หรือ Role ในระบบ`;
            else errorMsg = `Role "${technicianUser.role}" ไม่มีสิทธิ์เข้าใช้งาน`;
            throw new Error(errorMsg);
        }
        log(`User role verified: ${technicianUser.role}`);

        // 4. ดึง Ticket ID จาก URL Parameter
        const urlParams = new URLSearchParams(window.location.search);
        currentTicketId = urlParams.get('ticketId');
        if (!currentTicketId) {
             // ถ้าไม่ได้เปิดจาก Carousel (เช่น เปิดตรง) ให้แสดงข้อความ
             throw new Error("ไม่พบ Ticket ID ใน URL (กรุณาเปิดจาก Carousel ใน LINE)");
        }
        ticketIdDisplay.textContent = `Ticket: ${currentTicketId}`;
        log(`Target Ticket ID: ${currentTicketId}`);

        // 5. โหลดข้อมูล Ticket และ Technicians
        // ใช้ Promise.all เพื่อโหลด 2 อย่างพร้อมกัน
        await Promise.all([
            populateTechnicianDropdown(), // โหลดรายชื่อช่าง
            loadTicketDetailsAndPopulateForm(currentTicketId) // โหลดรายละเอียด Ticket (รอ dropdown เสร็จก่อน)
        ]);

        // 6. แสดงผลหน้า App และซ่อน Loading
        loadingDiv.classList.add('hidden');
        appContainer.classList.remove('hidden');
        log("Initialization complete.");

    } catch (error) {
        showError(`เกิดข้อผิดพลาดในการโหลดข้อมูล: ${error.message}`, false);
        // แสดงปุ่ม Logout แม้ว่า App จะโหลดไม่สำเร็จ (ถ้าเปิดบน External Browser)
        if (!liff.isInClient()) {
            btnLogOut.style.display = 'block';
        }
    }
}

/**
 * ฟังก์ชันหลักในการเริ่ม LIFF (ตามแนวทางของคุณ)
 */
async function main() {
    log("Starting main()...");
    try {
        // Case 1: เปิดในแอป LINE (In-Client)
        if (liff.isInClient()) {
            log("Running in LINE client.");
            await liff.init({ liffId: LIFF_ID });
            await initializeApp(); // รัน App หลักเลย
            return;
        }

        // Case 2: เปิดใน Mobile Browser (พยายาม Redirect กลับเข้า LINE)
        if (mobileCheck()) {
            log("Running on mobile browser, attempting redirect...");
            // ส่ง parameter ของ URL (เช่น ?ticketId=...) กลับเข้าไปใน LINE ด้วย
            window.location.replace(`line://app/${LIFF_ID}${window.location.search}`);
            return;
        }

        // Case 3: เปิดใน External Browser (Windows/Desktop)
        log("Running on external browser (Desktop).");
        // *** ใช้ withLoginOnExternalBrowser: true ***
        await liff.init({ liffId: LIFF_ID, withLoginOnExternalBrowser: true });

        if (liff.isLoggedIn()) {
            log("User is logged in on external browser.");
            await initializeApp(); // รัน App หลัก
        } else {
            log("User is NOT logged in. Showing login button.");
            loadingDiv.classList.add('hidden');
            btnLogIn.style.display = 'block'; // แสดงปุ่ม Login
        }
    } catch (error) {
        showError(`LIFF Init Error: ${error.message}`, true);
    }
}

// --- เรียกใช้ฟังก์ชัน main() ---
main();

// --- Event Listeners สำหรับปุ่ม Login/Logout ---
btnLogIn.addEventListener('click', () => {
    log("Login button clicked.");
    // liff.init() ถูกตั้งค่า withLoginOnExternalBrowser: true ไว้แล้ว
    // liff.login() จะเปิดหน้าต่าง Popup Login ให้อัตโนมัติ
    liff.login();
});

btnLogOut.addEventListener('click', () => {
    log("Logout button clicked.");
    if (liff.isLoggedIn()) {
        liff.logout();
        window.location.reload(); // Reload หน้าใหม่
    }
});

// ==========================================================
// == ✨ ฟังก์ชันเดิม (API, Form Handling) ✨ ==
// (คัดลอกฟังก์ชันเดิมทั้งหมดมาวางต่อจากตรงนี้)
// ==========================================================

// --- ฟังก์ชันเรียก Backend API (Google Apps Script) ---
async function fetchFromApi(action, params = {}, method = 'GET', body = null) {
    const url = new URL(SCRIPT_URL);
    url.searchParams.append('action', action);
    if (method === 'GET' && params) {
        for (const key in params) {
            url.searchParams.append(key, params[key]);
        }
    }
    const options = { method: method, headers: {} };
    if (method === 'POST' && body) {
        options.headers['Content-Type'] = 'text/plain;charset=utf-8';
        options.body = JSON.stringify(body);
    }
    log(`Fetching API: ${action}, Method: ${method}, Params/Body: ${JSON.stringify(params || body)}`);
    try {
        const response = await fetch(url.toString(), options);
        if (!response.ok) {
            const errorText = await response.text();
            log(`HTTP error! Status: ${response.status}, Body: ${errorText}`);
            throw new Error(`ไม่สามารถติดต่อ Backend ได้ (Status: ${response.status}) ${errorText.substring(0, 100)}`);
        }
        const data = await response.json();
        log(`API Response for ${action}:`, data);
        if (data && data.error) {
             throw new Error(data.error);
        }
        return data;
    } catch (networkError) {
         log(`Network or Fetch Error for ${action}:`, networkError);
         throw new Error(`การเชื่อมต่อ Backend ล้มเหลว: ${networkError.message}`);
    }
}


// --- โหลดรายละเอียด Ticket และเติมข้อมูลลงฟอร์ม ---
async function loadTicketDetailsAndPopulateForm(ticketId) {
    log(`Loading details for ticket: ${ticketId}`);
    try {
        const data = await fetchFromApi('getRepairDataById', { ticketId: ticketId });
        if (!data || Object.keys(data).length === 0) {
            throw new Error(`ไม่พบข้อมูลสำหรับ Ticket ID: ${ticketId}`);
        }
        // (Populate detail-...)
        document.getElementById('detail-submissionDate').textContent = data['วันที่แจ้ง'] ? formatDate(data['วันที่แจ้ง']) : '-';
        document.getElementById('detail-submissionTime').textContent = data['เวลาที่แจ้ง'] || '-';
        document.getElementById('detail-equipmentName').textContent = data['ชื่อครุภัณฑ์'] || '-';
        document.getElementById('detail-equipmentId').textContent = data['หมายเลขครุภัณฑ์'] || '-';
        document.getElementById('detail-problemDesc').textContent = data['ลักษณะอาการเสีย'] || '-';
        document.getElementById('detail-userName').textContent = data['ชื่อผู้แจ้ง'] || '-';
        document.getElementById('detail-userPhone').textContent = data['เบอร์โทร'] ? String(data['เบอร์โทร']).replace("'", "") : '-';
        document.getElementById('detail-userDepartment').textContent = data['หน่วยงาน'] || '-';
        document.getElementById('detail-userLocation').textContent = data['สถานที่ตั้ง'] || '-';
        document.getElementById('detail-userPosition').textContent = data['ตำแหน่ง'] || '-';

        // (Populate action-...)
        operatorSelect.value = data['ผู้ปฏิบัติงาน'] || "";
        statusSelect.value = data['สถานะ'] || "รอรับเรื่อง";
        workDateInput.value = data['วันที่ปฏิบัติงาน'] || "";
        workTimeInput.value = data['เวลาที่ปฏิบัติงาน'] || "";
        solutionTextarea.value = data['สรุปการแก้ไข/หมายเหตุ'] || "";

        // (Check permissions logic - เหมือนเดิม)
        const currentOperator = data['ผู้ปฏิบัติงาน'];
        const currentStatus = data['สถานะ'];
        let canEdit = false;
        if (technicianUser.role === 'Admin') {
            canEdit = true;
        } else if (technicianUser.role === 'Technician') {
            if (!currentOperator || currentOperator.trim() === technicianUser.name.trim()) {
                canEdit = true;
                if (!currentOperator && operatorSelect.querySelector(`option[value="${technicianUser.name}"]`)) {
                    operatorSelect.value = technicianUser.name;
                    log("Auto-assigning technician to self.");
                }
                operatorSelect.disabled = !!currentOperator;
            } else {
                 canEdit = false;
            }
        }
        if (currentStatus === 'เสร็จสิ้น' || currentStatus === 'ยกเลิก') {
            canEdit = false;
            Swal.fire({
                 toast: true, icon: 'info', title: 'ดูข้อมูลเท่านั้น',
                 text: 'งานนี้ถูกปิดสถานะแล้ว', position: 'top',
                 showConfirmButton: false, timer: 3000
             });
        }
        // (Disable form logic - เหมือนเดิม)
        if (!canEdit) {
            operatorSelect.disabled = true;
            statusSelect.disabled = true;
            workDateInput.disabled = true;
            workTimeInput.disabled = true;
            solutionTextarea.disabled = true;
            saveButton.disabled = true;
            saveButton.textContent = "ปิดสถานะ/งานของผู้อื่น";
             if (technicianUser.role === 'Technician' && currentOperator && currentOperator.trim() !== technicianUser.name.trim()){
                 Swal.fire({
                     toast: true, icon: 'warning', title: 'งานของผู้อื่น',
                     text: `งานนี้มอบหมายให้ ${currentOperator} แล้ว`, position: 'top',
                     showConfirmButton: false, timer: 3000
                 });
             }
        } else {
             operatorSelect.disabled = (technicianUser.role === 'Technician' && !!currentOperator);
             statusSelect.disabled = false;
             workDateInput.disabled = false;
             workTimeInput.disabled = false;
             solutionTextarea.disabled = false;
             saveButton.disabled = false;
             saveButton.innerHTML = '<i class="fas fa-save mr-2"></i> บันทึกการเปลี่ยนแปลง';
        }
        log("Form populated.");
    } catch (error) {
        showError(`ไม่สามารถโหลดรายละเอียด Ticket: ${error.message}`, false);
        disableForm();
    }
}

// --- โหลดรายชื่อ Technicians ใส่ Dropdown ---
async function populateTechnicianDropdown() {
    log("Populating technician dropdown...");
    try {
        const users = await fetchFromApi('getUsers');
        operatorSelect.innerHTML = '<option value="">-- เลือกผู้รับผิดชอบ --</option>';
        if (users && Array.isArray(users)) {
             users.forEach(user => {
                 if (user.role === 'Admin' || user.role === 'Technician') {
                     const option = document.createElement('option');
                     option.value = user.name;
                     option.textContent = `${user.name} (${user.role})`;
                     operatorSelect.appendChild(option);
                 }
             });
             log("Technician dropdown populated.");
        } else {
             log("No users found or error fetching users for dropdown.");
             operatorSelect.innerHTML = '<option value="">-- ไม่พบข้อมูลช่าง --</option>';
        }
    } catch (error) {
        log(`Error populating technician dropdown: ${error.message}`);
        operatorSelect.innerHTML = '<option value="">-- โหลดล้มเหลว --</option>';
        showError(`ไม่สามารถโหลดรายชื่อช่างได้: ${error.message}`, false);
    }
}

// --- จัดการการ Submit ฟอร์ม ---
updateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    log("Form submitted.");
    if (saveButton.disabled) return;
    const selectedOperator = operatorSelect.value;
    const selectedStatus = statusSelect.value;
    const workDate = workDateInput.value;
    const workTime = workTimeInput.value;
    const solution = solutionTextarea.value.trim();

    // (Validation logic - เหมือนเดิม)
     if ((selectedStatus === 'เสร็จสิ้น' || selectedStatus === 'ยกเลิก') && !solution && technicianUser.role !== 'Admin') {
         Swal.fire('ข้อมูลไม่ครบ', 'กรุณากรอกสรุปการแก้ไข/สาเหตุที่ยกเลิก', 'warning');
         solutionTextarea.focus();
         return;
     }
      if ((selectedStatus === 'กำลังดำเนินการ' || selectedStatus === 'เสร็จสิ้น' || selectedStatus === 'ส่งซ่อมภายนอก') && !selectedOperator) {
           Swal.fire('ข้อมูลไม่ครบ', 'กรุณาเลือกผู้ปฏิบัติงาน', 'warning');
           operatorSelect.focus();
           return;
      }

    saveButton.disabled = true;
    saveButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>กำลังบันทึก...';
    
    const updateDataPayload = {
        ticketId: currentTicketId,
        status: selectedStatus,
        lineUserId: lineProfile.userId, // ส่ง Line ID ของช่างที่กดบันทึก
        dataObject: {
            'รหัสใบแจ้งซ่อม': currentTicketId,
            'ผู้ปฏิบัติงาน': selectedOperator,
            'สถานะ': selectedStatus,
            'วันที่ปฏิบัติงาน': workDate,
            'เวลาที่ปฏิบัติงาน': workTime,
            'สรุปการแก้ไข/หมายเหตุ': solution
        }
    };
    try {
        log("Sending update to backend:", updateDataPayload);
        const result = await fetchFromApi('submitTechnicianUpdate', {}, 'POST', updateDataPayload);
        log("Backend update response:", result);
        if (result && result.success) {
            Swal.fire({
                icon: 'success', title: 'บันทึกสำเร็จ!',
                text: `อัปเดตข้อมูล Ticket ${currentTicketId} เรียบร้อย`,
                timer: 2500, showConfirmButton: false
            }).then(() => {
                if (liff.isInClient()) {
                    liff.closeWindow();
                }
            });
        } else {
            throw new Error(result.message || 'ไม่สามารถบันทึกข้อมูลได้ (Backend)');
        }
    } catch (error) {
        log("Error during form submission:", error);
        Swal.fire({
            icon: 'error', title: 'เกิดข้อผิดพลาด',
            text: `ไม่สามารถบันทึกข้อมูลได้: ${error.message}`,
            confirmButtonColor: '#1e5631'
        });
        saveButton.disabled = false;
        saveButton.innerHTML = '<i class="fas fa-save mr-2"></i> บันทึกการเปลี่ยนแปลง';
    }
});

// --- Helper Functions (log, showError, disableForm, formatDate) ---
function log(...messages) {
    console.log("[LIFF Log]", ...messages); // เปิดใช้ Console Log เพื่อ Debug
}
function showError(message, isFatal = false) {
    loadingDiv.innerHTML = `<p class="text-red-600 font-bold text-center">${message}</p>`;
    loadingDiv.classList.remove('hidden');
    appContainer.classList.add('hidden');
    if (isFatal) {
         disableForm();
         // ถ้า Error ร้ายแรง และไม่ได้ Login ให้แสดงปุ่ม Login
         if (!liff.isLoggedIn()) {
             btnLogIn.style.display = 'block';
         }
    }
}
function disableForm() {
     const formElements = updateForm.elements;
     for (let i = 0; i < formElements.length; i++) {
         formElements[i].disabled = true;
     }
     saveButton.disabled = true;
     saveButton.textContent = "เกิดข้อผิดพลาด";
}
function formatDate(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        return date.toLocaleDateString('th-TH', {
            day: '2-digit', month: 'short', year: 'numeric',
        });
    } catch (e) { return dateString; }
}
