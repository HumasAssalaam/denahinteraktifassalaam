let roomData = {};
let teacherData = {};
let subjectData = {};
let scheduleData = {};
let piketData = {};
let classSchedules = {};
let teacherActiveSchedules = {};
let currentBuilding = 'utara';
let currentFloor = 1;
let isZoomedOut = false; 

const mainContainer = document.getElementById('main-container');
const modal = document.getElementById('room-modal');
const searchBox = document.getElementById('search-box');
const suggestionsContainer = document.getElementById('search-suggestions');


// =========================================================================
// 2. FUNGSI-FUNGSI UTAMA APLIKASI
// =========================================================================

/* --- FUNGSI INISIALISASI & RENDER AWAL --- */

/**
 * Menerapkan layout grid CSS ke setiap ruangan berdasarkan data dari rooms.json.
 */
function applyLayouts() {
    for (const roomId in roomData) {
        const roomElement = document.getElementById(roomId);
        if (roomElement && roomData[roomId].layout?.gridArea) {
            roomElement.style.gridArea = roomData[roomId].layout.gridArea;
        }
    }
}

function renderAllRoomData() {
    document.querySelectorAll(".room, .area-luar[data-id]").forEach(element => {
        const roomId = element.dataset.id || element.id;
        const data = roomData[roomId];

        if (data?.name) {
            element.textContent = data.name;
            // Hapus kelas tipe ruangan yang lama sebelum menambahkan yang baru
            const oldTypeClasses = Array.from(element.classList).filter(c => c.startsWith("room-type-"));
            element.classList.remove(...oldTypeClasses);
            if (data.type) {
                element.classList.add(data.type);
            }
        } else {
            element.textContent = "-"; // Teks default jika tidak ada nama
        }
    });
}


/* --- FUNGSI PENGELOLA TAMPILAN (VIEW) --- */
function updateView(buildingId, floorNumber, isSearchUpdate = false) {
    // 1. Update state global
    currentBuilding = buildingId;
    currentFloor = parseInt(floorNumber);

    // 2. Sesuaikan lebar maksimum container berdasarkan gedung
    mainContainer.style.maxWidth = (buildingId === "utara") ? "1000px" : "600px";

    // 3. Tampilkan denah gedung yang aktif dan sembunyikan yang lain
    document.querySelectorAll(".building-plan").forEach(plan => {
        plan.classList.toggle("active", plan.id === `plan-${buildingId}`);
    });

    // 4. Update tombol pemilih gedung yang aktif
    document.querySelectorAll(".building-selector button").forEach(button => {
        button.classList.toggle("active", button.id === `btn-building-${buildingId}`);
    });

    // 5. Update tombol pemilih lantai yang aktif
    const floorSelectorContainer = document.querySelector(`#plan-${buildingId} .floor-selector`);
    if (floorSelectorContainer) {
        const currentActiveButton = floorSelectorContainer.querySelector("button.active");
        if (currentActiveButton) currentActiveButton.classList.remove("active");

        const newActiveButton = floorSelectorContainer.querySelector(`button[data-floor='${currentFloor}']`);
        if (newActiveButton) newActiveButton.classList.add("active");
    }

    // 6. Sembunyikan/tampilkan ruangan berdasarkan lantai (kecuali jika dari pencarian)
    if (!isSearchUpdate) {
        document.querySelectorAll(".room, .area-luar").forEach(element => {
            const elementId = element.dataset.id || element.id;
            if (elementId) {
                const isVisible = elementId.startsWith(`${buildingId}-lt${currentFloor}`);
                element.classList.toggle("is-invisible", !isVisible);
            }
        });
    }

    // 7. Logika khusus untuk denah utara lantai 2 (yang layout-nya berbeda)
    document.getElementById("plan-grid-utara").classList.toggle("show-floor-2", buildingId === "utara" && currentFloor === 2);

    // 8. Terapkan state zoom jika ada
    const activePlan = document.querySelector(".building-plan.active");
    if (activePlan) {
        const planWrapper = activePlan.querySelector(".plan-wrapper");
        const floorPlan = activePlan.querySelector(".floor-plan");
        applyZoomState(planWrapper, floorPlan);
    }
}

function applyZoomState(planWrapper, floorPlan) {
    if (!planWrapper || !floorPlan) return;

    planWrapper.classList.toggle("zoomed-out", isZoomedOut);

    if (isZoomedOut) {
        planWrapper.scrollLeft = 0; // Reset scroll horizontal
        const planWidth = floorPlan.scrollWidth;
        const wrapperWidth = planWrapper.clientWidth;
        const scale = (0.98 * wrapperWidth) / planWidth; // 98% untuk sedikit padding
        const planHeight = floorPlan.scrollHeight;

        floorPlan.style.transform = `scale(${scale})`;
        planWrapper.style.height = `${planHeight * scale}px`;
        planWrapper.style.overflowX = "hidden";
    } else {
        // Reset ke state normal
        floorPlan.style.transform = "";
        planWrapper.style.height = "";
        planWrapper.style.overflowX = "auto";
    }
}


/* --- FUNGSI PENCARIAN (SEARCH) --- */

function resetSearchView() {
    searchBox.value = "";
    suggestionsContainer.classList.remove("visible");
    suggestionsContainer.innerHTML = "";
    document.querySelectorAll(".room, .area-luar").forEach(el => el.classList.remove("highlight", "dimmed"));
    // Kembalikan view ke state sebelum pencarian
    updateView(currentBuilding, currentFloor, false);
}


/**
 * Mencari ruangan berdasarkan query dan memberikan skor relevansi.
 * @param {string} query - Kata kunci pencarian.
 * @returns {Array<object>} Array objek ruangan yang cocok, diurutkan berdasarkan skor.
 */
function findRooms(query) {
    if (!query || query.trim().length === 0) return [];

    const normalizedQuery = query.toLowerCase().replace(/[-\s]/g, "");
    const results = [];

    for (const roomId in roomData) {
        const roomInfo = roomData[roomId];
        if (!roomInfo.name || roomInfo.name === "-") continue;

        const roomName = roomInfo.name;
        const normalizedRoomName = roomName.toLowerCase().replace(/[-\s]/g, "");
        let score = 0;

        // Skema pemberian skor untuk relevansi hasil
        if (normalizedRoomName === normalizedQuery) {
            score = 5; // Cocok persis
        } else if (normalizedRoomName.startsWith(normalizedQuery)) {
            score = 4; // Dimulai dengan query
        } else if (new RegExp("\\b" + query + "\\b", "i").test(roomName)) {
            score = 3; // Query adalah kata utuh dalam nama
        } else if (new RegExp("\\b" + query, "i").test(roomName)) {
            score = 2; // Query adalah awal dari sebuah kata dalam nama
        } else if (normalizedRoomName.includes(normalizedQuery)) {
            score = 1; // Query terkandung di mana saja dalam nama
        }

        if (score > 0) {
            // skor tambahan jika hasil ada di gedung yang sedang aktif
            if (roomId.startsWith(currentBuilding)) {
                score += 0.5;
            }
            results.push({ id: roomId, ...roomInfo, score: score });
        }
    }
    return results.sort((a, b) => b.score - a.score);
}


function renderSuggestions(searchResults) {
    suggestionsContainer.innerHTML = "";
    if (searchResults.length === 0) {
        suggestionsContainer.classList.remove("visible");
        return;
    }

    const list = document.createElement("ul");
    searchResults.slice(0, 15).forEach(room => {
        const listItem = document.createElement("li");
        listItem.dataset.roomId = room.id;
        const [building, floorInfo] = room.id.split("-lt");
        const floor = floorInfo.charAt(0);
        const buildingName = building.charAt(0).toUpperCase() + building.slice(1);

        listItem.innerHTML = `${room.name} <small>(${buildingName} Lt. ${floor})</small>`;
        list.appendChild(listItem);
    });

    suggestionsContainer.appendChild(list);
    suggestionsContainer.classList.add("visible");
}


function highlightSearchResults(searchResults) {
    document.querySelectorAll(".room, .area-luar").forEach(el => el.classList.remove("highlight", "dimmed"));

    if (!searchResults || searchResults.length === 0) {
        resetSearchView();
        return;
    }

    const resultIds = new Set(searchResults.map(r => r.id));
    const topResultId = searchResults[0].id;
    const [building, floorInfo] = topResultId.split("-lt");
    const floor = floorInfo.charAt(0);

    updateView(building, floor, true);
    document.querySelectorAll(`#plan-${building} .room, #plan-${building} .area-luar`).forEach(element => {
        const elementId = element.id || element.dataset.id;
        if (!elementId) return;
        if (elementId.startsWith(`${building}-lt${floor}`)) {
            element.classList.remove("is-invisible"); // Pastikan terlihat
            if (resultIds.has(elementId)) {
                element.classList.add("highlight");
            } else {
                element.classList.add("dimmed");
            }
        } else {
            element.classList.add("is-invisible"); // Sembunyikan semua elemen di lantai lain
        }
    });
}


/* --- FUNGSI PENGAMBILAN DATA LIVE (JADWAL & PIKET) --- */

function getCurrentLesson(roomId) {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Minggu, 1 = Senin, ...
    const currentTime = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');

    const scheduleForToday = scheduleData[dayOfWeek];
    if (!scheduleForToday || Object.keys(scheduleForToday).length === 0) {
        return { status: "NO_SCHOOL_DAY" }; // Hari libur atau tidak ada jadwal
    }

    const roomName = roomData[roomId]?.name;
    if (!roomName) return null;

    let isSchoolHours = false;
    let currentLessonData = null;

    // Iterasi melalui jam pelajaran hari ini
    for (const timeSlot in scheduleForToday) {
        const [startTime, endTime] = timeSlot.split('-');
        if (currentTime >= startTime && currentTime < endTime) {
            isSchoolHours = true;
            const lessonInThisRoom = scheduleForToday[timeSlot][roomName];
            if (lessonInThisRoom) {
                currentLessonData = lessonInThisRoom;
                break; // Ditemukan pelajaran, hentikan loop
            }
        }
    }

    if (currentLessonData) {
        if (currentLessonData.subjectId === "ISTIRAHAT") {
            return { status: "BREAK_TIME" };
        }
        const subject = subjectData[currentLessonData.subjectId];
        const teacher = teacherData[currentLessonData.teacherId];
        if (subject && teacher) {
            return { status: "ONGOING_LESSON", subject, teacher };
        }
    }

    if (isSchoolHours) {
        return { status: "EMPTY_ROOM" };
    }
    return { status: "OUTSIDE_SCHOOL_HOURS" };
}


function getDutyTeacher(roomId) {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const piketForToday = piketData[dayOfWeek];
    if (!piketForToday) return null;

    const roomName = roomData[roomId]?.name;
    if (!roomName) return null;

    const dutyTeacherIds = piketForToday[roomName];
    if (dutyTeacherIds?.length > 0) {
        const dutyTeachersData = dutyTeacherIds.map(id => teacherData[id]).filter(Boolean); // Filter guru yg tidak ada datanya
        if (dutyTeachersData.length > 0) {
            return dutyTeachersData;
        }
    }
    return null;
}


// =========================================================================
// 3. INISIALISASI APLIKASI
// =========================================================================

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Muat semua data JSON secara paralel
        const responses = await Promise.all([
            fetch("data/rooms.json"),
            fetch("data/teachers.json"),
            fetch("data/subjects.json"),
            fetch("data/schedule.json"),
            fetch("data/piket.json"),
            fetch("data/class-schedules.json"),
            fetch("data/teacher-active-schedule.json")
        ]);

        for (const response of responses) {
            if (!response.ok) {
                throw new Error(`Gagal memuat file data: ${response.url}`);
            }
        }
        [roomData, teacherData, subjectData, scheduleData, piketData, classSchedules, teacherActiveSchedules] = await Promise.all(responses.map(res => res.json()));
        applyLayouts();
        renderAllRoomData();
        updateView(currentBuilding, currentFloor);

    } catch (error) {
        console.error("Gagal menginisialisasi aplikasi:", error);
        mainContainer.innerHTML = "<h1>Oops! Terjadi kesalahan.</h1><p>Gagal memuat data denah, silakan muat ulang halaman.</p>";
    }
});


// =========================================================================
// 4. EVENT LISTENERS
// =========================================================================
document.querySelectorAll('.room, .area-luar[data-id]').forEach(roomElement => {
    roomElement.addEventListener('click', () => {
        const roomId = roomElement.dataset.id || roomElement.id;
        const roomInfo = roomData[roomId];
        if (!roomInfo?.name || roomInfo.name === "-") return;
        
        openRoomModal(roomId, roomInfo);
    });
});
document.getElementById('btn-show-schedule').addEventListener('click', () => {
    const roomName = document.getElementById('modal-title').textContent;
    const scheduleContainer = document.getElementById('modal-schedule-display-container');

    if (scheduleContainer.style.display === 'block') {
        scheduleContainer.style.display = 'none';
        return;
    }
    
    displayClassSchedule(roomName);
});

document.querySelectorAll('.building-selector button, .floor-selector button').forEach(button => {
    button.addEventListener('click', () => {
        resetSearchView(); 
        const isBuildingButton = button.id.includes('btn-building');
        const targetBuilding = isBuildingButton ? button.id.replace('btn-building-', '') : button.closest('.building-plan').id.replace('plan-', '');
        const targetFloor = isBuildingButton ? 1 : button.dataset.floor;
        updateView(targetBuilding, targetFloor);
    });
});

searchBox.addEventListener('input', () => {
    const query = searchBox.value.trim();
    if (query.length === 0) {
        resetSearchView();
        return;
    }
    const searchResults = findRooms(query);
    renderSuggestions(searchResults);
    highlightSearchResults(searchResults);
});

suggestionsContainer.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const listItem = e.target.closest('li');
    if (listItem) {
        e.preventDefault(); 
        const resultId = listItem.dataset.roomId;
        const [building, floorPart] = resultId.split('-lt');
        const floor = floorPart.charAt(0);
        
        resetSearchView(); 
        updateView(building, floor);
        
        const targetElement = document.getElementById(resultId);
        if (targetElement) {
            targetElement.classList.add('highlight');
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => {
                targetElement.classList.remove('highlight');
            }, 3000);
        }    
    }
});

// Listener untuk tombol zoom/fit
document.getElementById('btn-global-fit').addEventListener('click', (e) => {
    isZoomedOut = !isZoomedOut;
    e.currentTarget.classList.toggle('active', isZoomedOut);
    const activePlanDiv = document.querySelector('.building-plan.active');
    if(activePlanDiv){
        const wrapper = activePlanDiv.querySelector('.plan-wrapper');
        const plan = activePlanDiv.querySelector('.floor-plan');
        applyZoomState(wrapper, plan);
    }
});

document.querySelector('#room-modal .close-button').addEventListener('click', () => {
    modal.style.display = 'none';
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const teacherOverlay = document.getElementById('teacher-schedule-overlay');
        if (teacherOverlay.classList.contains('visible')) {
            teacherOverlay.classList.remove('visible');
            document.body.classList.remove('no-scroll');
        } else if (modal.style.display === 'block') {
            modal.style.display = 'none';
        } else if (searchBox.value.trim() !== '') {
            resetSearchView();
        }
    }
});

document.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.style.display = 'none';
    }
    const searchContainer = e.target.closest('.search-container');
    const navButton = e.target.closest('.building-selector button, .floor-selector button');
    if (!searchContainer && !navButton && searchBox.value.trim() !== '') {
        resetSearchView();
    }
});
document.querySelector('#room-modal .close-button').addEventListener('click', () => {
    modal.style.display = 'none';
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        modal.style.display = 'none';
    }
});

document.getElementById('btn-show-all-teachers-schedule').addEventListener('click', () => {
    displayAllTeachersSchedule();
});

const teacherOverlay = document.getElementById('teacher-schedule-overlay');
teacherOverlay.querySelector('.close-button').addEventListener('click', () => {
    teacherOverlay.classList.remove('visible');
    document.body.classList.remove('no-scroll');
});

teacherOverlay.addEventListener('click', (e) => {
    if (e.target === teacherOverlay) {
        teacherOverlay.classList.remove('visible');
        document.body.classList.remove('no-scroll');
    }
});

// Panggil fungsi inisialisasi accordion sekali saja
initializeAccordions();

function openRoomModal(roomId, roomInfo) {
    resetModalContent();

    // Set judul dan deskripsi dasar
    document.getElementById('modal-title').textContent = roomInfo.name;
    document.getElementById('modal-desc').textContent = roomInfo.desc || '';

    const btnShowAllTeachers = document.getElementById('btn-show-all-teachers-schedule');
    const isTeacherOffice = roomInfo.name.toLowerCase().includes('kantor guru');
    btnShowAllTeachers.style.display = isTeacherOffice ? 'inline-block' : 'none';
    
    // Isi konten modal berdasarkan tipe ruangan
    populateKeyPersonnel(roomInfo);
    populateContactInfo(roomInfo);
    populateClassSpecificInfo(roomInfo);
    populateLiveInfo(roomId, roomInfo);
    
    modal.style.display = 'block';
}
function resetModalContent() {
    // Sembunyikan semua kontainer dinamis
    document.getElementById('modal-live-info').style.display = 'none';
    document.getElementById('modal-class-info').style.display = 'none';
    document.getElementById('modal-capacity-info').style.display = 'none';
    document.getElementById('modal-personnel-info').style.display = 'none';
    document.getElementById('modal-schedule-display-container').style.display = 'none';
    document.getElementById('btn-show-schedule').style.display = 'none';
    document.getElementById('btn-show-all-teachers-schedule').style.display = 'none';
    
    // Kosongkan konten yang digenerate
    document.getElementById('modal-personnel-info').innerHTML = '';
    document.getElementById('modal-contact-container').innerHTML = '';
}

function populateKeyPersonnel(roomInfo) {
    if (roomInfo.keyPersonnel?.length > 0) {
        const container = document.getElementById('modal-personnel-info');
        roomInfo.keyPersonnel.forEach(person => {
            const personData = teacherData[person.teacherId];
            if (personData) {
                container.innerHTML += `
                    <div class="personnel-item">
                        <img src="${personData.image || 'images/guru/default.png'}" alt="Foto ${personData.name}">
                        <div>
                            <p class="personnel-name">${personData.name}</p>
                            <p class="personnel-title">${person.title}</p>
                        </div>
                    </div>`;
            }
        });
        container.style.display = 'block';
    }
}
/**
 * Menampilkan tombol kontak (misal: WhatsApp) di modal.
 * @param {object} roomInfo - Objek data ruangan.
 */
function populateContactInfo(roomInfo) {
    if (roomInfo.contactInfo?.whatsappNumber) {
        const container = document.getElementById('modal-contact-container');
        const contactButton = document.createElement('a');
        contactButton.href = `https://wa.me/${roomInfo.contactInfo.whatsappNumber.replace(/\D/g, '')}`;
        contactButton.target = '_blank';
        contactButton.rel = 'noopener noreferrer';
        contactButton.className = 'btn-contact-whatsapp';
        contactButton.textContent = roomInfo.contactInfo.label || 'Hubungi Kami';
        container.appendChild(contactButton);
    }
}
/**
 * Menampilkan informasi spesifik untuk kelas (wali kelas, kapasitas, tombol jadwal).
 * @param {object} roomInfo - Objek data ruangan.
 */
function populateClassSpecificInfo(roomInfo) {
    if (roomInfo.type !== 'room-type-kelas') return;

    // info Wali Kelas
    if (roomInfo.waliKelasId && teacherData[roomInfo.waliKelasId]) {
        const walasData = teacherData[roomInfo.waliKelasId];
        document.getElementById('walas-img').src = walasData.image || 'images/guru/default.png';
        document.getElementById('walas-name').textContent = walasData.name;
        document.getElementById('modal-class-info').style.display = 'block';
    }
    if (roomInfo.kapasitas) {
        document.getElementById('class-capacity').textContent = roomInfo.kapasitas;
        document.getElementById('modal-capacity-info').style.display = 'block';
    }
    if (classSchedules[roomInfo.name]) {
        document.getElementById('btn-show-schedule').style.display = 'inline-block';
    }
}
/**
 * informasi real-time (pelajaran berlangsung atau guru piket).
 * @param {string} roomId - ID ruangan.
 * @param {object} roomInfo - Objek data ruangan.
 */
function populateLiveInfo(roomId, roomInfo) {
    const liveInfoContainer = document.getElementById('modal-live-info');
    const contentContainer = document.getElementById('live-info-content-container');
    const modalDesc = document.getElementById('modal-desc');

    contentContainer.innerHTML = ''; // Selalu kosongkan kontainer di awal

    const now = new Date();
    const dayOfWeek = now.getDay();
    const piketForToday = piketData[dayOfWeek];
    const isTeacherOffice = roomInfo.name.toLowerCase().includes('kantor guru');

    // --- LOGIKA BARU UNTUK GURU PIKET DI KANTOR GURU ---
    if (isTeacherOffice && piketForToday) {
        const dutyTeachers = [];

        // 1. Ambil data guru piket MTs
        const mtsTeacherIds = piketForToday["Kantor Guru MTs"] || [];
        mtsTeacherIds.forEach(id => {
            if (teacherData[id]) {
                dutyTeachers.push({ ...teacherData[id], duty: "Piket MTs" });
            }
        });
        
        // 2. Ambil data guru piket MA
        const maTeacherIds = piketForToday["Kantor Guru MA"] || [];
        maTeacherIds.forEach(id => {
            if (teacherData[id]) {
                dutyTeachers.push({ ...teacherData[id], duty: "Piket MA" });
            }
        });

        // 3. Jika ada guru piket, tampilkan semuanya
        if (dutyTeachers.length > 0) {
            document.getElementById('live-info-label').textContent = "Guru Piket Hari Ini";
            
            let generatedHTML = '';
            dutyTeachers.forEach(teacher => {
                // Membuat HTML yang meniru struktur .personnel-item atau .live-info-details Anda
                generatedHTML += `
                    <div class="live-info-details" style="display: flex; align-items: center; margin-bottom: 10px;"> 
                        <img src="${teacher.image || 'images/guru/default.png'}" alt="Foto ${teacher.name}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; margin-right: 15px;">
                        <div>
                            <p style="margin: 0; font-weight: bold; font-size: 1.1em;">${teacher.name}</p>
                            <p style="margin: 2px 0 0 0; font-size: 0.9em; color: #666;">${teacher.duty}</p>
                        </div>
                    </div>`;
            });
            contentContainer.innerHTML = generatedHTML;
            liveInfoContainer.style.display = 'block';
            return; // Hentikan fungsi setelah menampilkan guru piket
        }
    }

    // --- LOGIKA LAMA (FALLBACK) UNTUK RUANG KELAS & LAB ---
    if (roomInfo.type === 'room-type-kelas' || roomInfo.type === 'room-type-lab') {
        const lessonResult = getCurrentLesson(roomId);
        if (lessonResult) {
            let lessonHTML = '';
            switch (lessonResult.status) {
                case "ONGOING_LESSON":
                    const liveInfoLabel = document.getElementById('live-info-label');liveInfoLabel.innerHTML = `
                        <div class="marquee-container">
                            <span class="marquee-text">Pelajaran Berlangsung</span>
                        </div>
                    `;
                    lessonHTML = `
                        <div class="live-info-details" style="display: flex; align-items: center;"> 
                            <img src="${lessonResult.teacher.image || 'images/guru/default.png'}" alt="Foto ${lessonResult.teacher.name}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; margin-right: 15px;">
                            <div>
                                <p style="margin: 0; font-weight: bold; font-size: 1.1em;">${lessonResult.teacher.name}</p>
                                <p style="margin: 2px 0 0 0; font-size: 0.9em; color: #666; font-weight: bold;">${lessonResult.subject.displayName}</p>
                            </div>
                        </div>`;
                    contentContainer.innerHTML = lessonHTML;
                    liveInfoContainer.style.display = 'block';
                    break;
                case "BREAK_TIME":
                    modalDesc.textContent = "Saat ini sedang jam istirahat.";
                    break;
                case "EMPTY_ROOM":
                    modalDesc.textContent = "Ruangan ini sedang tidak digunakan.";
                    break;
                case "NO_SCHOOL_DAY":
                case "OUTSIDE_SCHOOL_HOURS":
                    modalDesc.innerHTML = `<strong style="color: #d9534f;">Santri sudah pulang atau bukan waktu KBM!</strong>`;
                    break;
            }
        }
    }
}

function displayClassSchedule(roomName) {
    const scheduleTableBody = document.getElementById('schedule-table-body');
    const scheduleDayTitle = document.getElementById('schedule-day-title');
    const scheduleContainer = document.getElementById('modal-schedule-display-container');

    const now = new Date();
    const dayOfWeek = now.getDay();
    const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const scheduleForToday = classSchedules[roomName]?.[dayOfWeek];

    scheduleDayTitle.textContent = `Jadwal Hari ${dayNames[dayOfWeek]}`;
    scheduleTableBody.innerHTML = ''; 

    if (scheduleForToday?.length > 0) {
        scheduleForToday.forEach(lesson => {
            const row = document.createElement('tr');
            if (lesson.subject === "Istirahat") {
                row.className = 'schedule-break-row';
                row.innerHTML = `<td colspan="3">ISTIRAHAT</td>`;
            } else {
                row.innerHTML = `<td>${lesson.time}</td><td>${lesson.subject}</td><td>${lesson.teacher || '-'}</td>`;
            }
            scheduleTableBody.appendChild(row);
        });
    } else {
        scheduleTableBody.innerHTML = `<tr><td colspan="3" style="text-align: center;">Tidak ada jadwal untuk hari ini.</td></tr>`;
    }
    
    scheduleContainer.style.display = 'block';
}

function displayAllTeachersSchedule() {
    const accordionContainer = document.getElementById('teacher-accordion-container');
    const overlay = document.getElementById('teacher-schedule-overlay');
    accordionContainer.innerHTML = ''; // Kosongkan konten sebelumnya

    const now = new Date();
    const dayOfWeek = now.getDay();
    const scheduleForToday = teacherActiveSchedules[dayOfWeek];

    if (!scheduleForToday || scheduleForToday.length === 0) {
        accordionContainer.innerHTML = `<p style="text-align: center; margin-top: 50px; color: #666;">Tidak ada guru yang terjadwal mengajar hari ini.</p>`;
    } else {
        scheduleForToday.forEach(teacher => {
            const scheduleRows = teacher.schedule.map(s => `
                <tr>
                    <td>${s.time}</td>
                    <td>${s.subject}</td>
                    <td>${s.class}</td>
                </tr>
            `).join('');

            const accordionItemHTML = `
                <div class="accordion-item">
                    <button class="accordion-header">
                        <img src="${teacher.teacherImage || 'images/guru/default.png'}" alt="Foto ${teacher.teacherName}">
                        <span class="teacher-name">${teacher.teacherName}</span>
                        <span class="session-count">${teacher.schedule.length} Sesi</span>
                        <span class="accordion-icon">+</span>
                    </button>
                    <div class="accordion-panel">
                        <table>
                            <thead>
                                <tr>
                                    <th>Jam</th>
                                    <th>Mata Pelajaran</th>
                                    <th>Kelas</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${scheduleRows}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            accordionContainer.innerHTML += accordionItemHTML;
        });
    }
    // Overlay
    overlay.classList.add('visible');
    document.body.classList.add('no-scroll');
}
function initializeAccordions() {
    const accordionContainer = document.getElementById('teacher-accordion-container');
    
    accordionContainer.addEventListener('click', function(e) {
        const header = e.target.closest('.accordion-header');
        if (!header) return;

        const item = header.parentElement;
        const panel = header.nextElementSibling;
        const icon = header.querySelector('.accordion-icon');

        header.classList.toggle('active');

        if (panel.style.maxHeight) {
            panel.style.maxHeight = null;
            panel.style.padding = "0 20px";
            icon.textContent = '+';
        } else {
            panel.style.maxHeight = panel.scrollHeight + "px";
            panel.style.padding = "15px 20px";
            icon.textContent = '×';
        }
    });
}