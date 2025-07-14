/* ========================================================================= */
/* SCRIPT.JS - VERSI STABIL TERAKHIR (SEBELUM FITUR JADWAL GURU) */
/* VERSI REFAKTORISASI UNTUK KETERBACAAN */
/* ========================================================================= */

// =========================================================================
// 1. STATE GLOBAL, KONSTANTA, & ELEMEN DOM
// =========================================================================

// Variabel untuk menyimpan data dari file JSON
let roomData = {};
let teacherData = {};
let subjectData = {};
let scheduleData = {};
let piketData = {};
let classSchedules = {};

// Variabel untuk melacak state tampilan saat ini
let currentBuilding = 'utara';
let currentFloor = 1;
let isZoomedOut = false; // Status untuk zoom in/out denah

// Elemen DOM yang sering diakses
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

/**
 * Merender nama dan tipe (kelas CSS) untuk semua elemen ruangan pada denah.
 */
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

/**
 * Memperbarui tampilan denah berdasarkan gedung dan lantai yang dipilih.
 * @param {string} buildingId - ID gedung ('utara' atau 'selatan').
 * @param {number|string} floorNumber - Nomor lantai.
 * @param {boolean} [isSearchUpdate=false] - Tandai true jika pembaruan ini dari hasil pencarian, untuk mencegah reset visibility.
 */
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


/**
 * Menerapkan atau menghapus state zoom-out pada denah.
 * @param {HTMLElement} planWrapper - Elemen pembungkus denah yang bisa di-scroll.
 * @param {HTMLElement} floorPlan - Elemen grid denah itu sendiri.
 */
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

/**
 * Mereset tampilan pencarian, menghapus highlight, dan mengembalikan ke view default.
 */
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
            // Beri skor tambahan jika hasil ada di gedung yang sedang aktif
            if (roomId.startsWith(currentBuilding)) {
                score += 0.5;
            }
            results.push({ id: roomId, ...roomInfo, score: score });
        }
    }

    // Urutkan hasil dari skor tertinggi ke terendah
    return results.sort((a, b) => b.score - a.score);
}


/**
 * Menampilkan daftar saran pencarian di bawah search box.
 * @param {Array<object>} searchResults - Array hasil dari findRooms.
 */
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


/**
 * Menyorot hasil pencarian di denah, meredupkan yang lain, dan pindah ke view yang relevan.
 * @param {Array<object>} searchResults - Array hasil dari findRooms.
 */
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

    // Pindahkan view ke lokasi hasil teratas, tandai sebagai update dari pencarian
    updateView(building, floor, true);

    // Terapkan highlight dan dimmed pada lantai yang relevan
    document.querySelectorAll(`#plan-${building} .room, #plan-${building} .area-luar`).forEach(element => {
        const elementId = element.id || element.dataset.id;
        if (!elementId) return;

        // Cek apakah elemen ada di lantai yang benar
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

/**
 * Mendapatkan status pelajaran yang sedang berlangsung di sebuah ruangan.
 * @param {string} roomId - ID ruangan.
 * @returns {object|null} Objek status atau null jika data tidak ditemukan.
 */
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

    // Jika tidak ada pelajaran spesifik di ruangan ini, tapi masih jam sekolah
    if (isSchoolHours) {
        return { status: "EMPTY_ROOM" };
    }

    // Jika di luar semua jam pelajaran
    return { status: "OUTSIDE_SCHOOL_HOURS" };
}


/**
 * Mendapatkan data guru piket untuk ruangan tertentu (misal: Ruang Guru).
 * @param {string} roomId - ID ruangan.
 * @returns {Array<object>|null} Array objek guru yang piket atau null.
 */
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
            fetch("data/class-schedules.json")
        ]);

        // Cek apakah semua request berhasil
        for (const response of responses) {
            if (!response.ok) {
                throw new Error(`Gagal memuat file data: ${response.url}`);
            }
        }

        // Parse semua JSON
        [roomData, teacherData, subjectData, scheduleData, piketData, classSchedules] = await Promise.all(responses.map(res => res.json()));

        // Setelah semua data siap, jalankan fungsi setup
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

/* --- EVENT LISTENER UTAMA --- */

/**
 * Menangani klik pada elemen ruangan untuk membuka modal detail.
 */
document.querySelectorAll('.room, .area-luar[data-id]').forEach(roomElement => {
    roomElement.addEventListener('click', () => {
        const roomId = roomElement.dataset.id || roomElement.id;
        const roomInfo = roomData[roomId];
        
        // Jangan buka modal jika ruangan tidak punya nama atau data
        if (!roomInfo?.name || roomInfo.name === "-") return;
        
        openRoomModal(roomId, roomInfo);
    });
});

/**
 * Menangani klik pada tombol lihat jadwal kelas di dalam modal.
 */
document.getElementById('btn-show-schedule').addEventListener('click', () => {
    const roomName = document.getElementById('modal-title').textContent;
    const scheduleContainer = document.getElementById('modal-schedule-display-container');

    // Toggle tampilan jadwal
    if (scheduleContainer.style.display === 'block') {
        scheduleContainer.style.display = 'none';
        return;
    }
    
    displayClassSchedule(roomName);
});


/**
 * Menangani klik pada tombol pemilih gedung dan lantai.
 */
// Listener untuk tombol navigasi gedung dan lantai
document.querySelectorAll('.building-selector button, .floor-selector button').forEach(button => {
    button.addEventListener('click', () => {
        resetSearchView(); 
        const isBuildingButton = button.id.includes('btn-building');
        const targetBuilding = isBuildingButton ? button.id.replace('btn-building-', '') : button.closest('.building-plan').id.replace('plan-', '');
        const targetFloor = isBuildingButton ? 1 : button.dataset.floor;
        updateView(targetBuilding, targetFloor);
    });
});

// Listener untuk fungsionalitas pencarian
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

// Listener untuk klik sugesti pencarian
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

// Listener untuk menutup modal
document.querySelector('#room-modal .close-button').addEventListener('click', () => {
    modal.style.display = 'none';
});

// Listener lain-lain (keyboard, klik di luar modal)
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (modal.style.display === 'block') {
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

/**
 * Menangani penutupan modal.
 */
document.querySelector('#room-modal .close-button').addEventListener('click', () => {
    modal.style.display = 'none';
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        modal.style.display = 'none';
    }
});


/* --- FUNGSI-FUNGSI PEMBANTU UNTUK MODAL --- */

/**
 * Membuka dan mengisi konten modal dengan informasi ruangan yang dipilih.
 * @param {string} roomId - ID unik ruangan.
 * @param {object} roomInfo - Objek data untuk ruangan tersebut.
 */
function openRoomModal(roomId, roomInfo) {
    resetModalContent();

    // Set judul dan deskripsi dasar
    document.getElementById('modal-title').textContent = roomInfo.name;
    document.getElementById('modal-desc').textContent = roomInfo.desc || '';
    
    // Isi konten modal berdasarkan tipe ruangan
    populateKeyPersonnel(roomInfo);
    populateContactInfo(roomInfo);
    populateClassSpecificInfo(roomInfo);
    populateLiveInfo(roomId, roomInfo);
    
    modal.style.display = 'block';
}

/**
 * Mereset semua konten dinamis di dalam modal ke keadaan awal.
 */
function resetModalContent() {
    // Sembunyikan semua kontainer dinamis
    document.getElementById('modal-live-info').style.display = 'none';
    document.getElementById('modal-class-info').style.display = 'none';
    document.getElementById('modal-capacity-info').style.display = 'none';
    document.getElementById('modal-personnel-info').style.display = 'none';
    document.getElementById('modal-schedule-display-container').style.display = 'none';
    document.getElementById('btn-show-schedule').style.display = 'none';
    
    // Kosongkan konten yang digenerate
    document.getElementById('modal-personnel-info').innerHTML = '';
    document.getElementById('modal-contact-container').innerHTML = '';
}

/**
 * Menampilkan informasi personel kunci (misal: Kepala Lab) di modal.
 * @param {object} roomInfo - Objek data ruangan.
 */
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

    // Tampilkan info Wali Kelas
    if (roomInfo.waliKelasId && teacherData[roomInfo.waliKelasId]) {
        const walasData = teacherData[roomInfo.waliKelasId];
        document.getElementById('walas-img').src = walasData.image || 'images/guru/default.png';
        document.getElementById('walas-name').textContent = walasData.name;
        document.getElementById('modal-class-info').style.display = 'block';
    }

    // Tampilkan info Kapasitas
    if (roomInfo.kapasitas) {
        document.getElementById('class-capacity').textContent = roomInfo.kapasitas;
        document.getElementById('modal-capacity-info').style.display = 'block';
    }

    // Tampilkan tombol lihat jadwal jika data jadwal tersedia
    if (classSchedules[roomInfo.name]) {
        document.getElementById('btn-show-schedule').style.display = 'inline-block';
    }
}

/**
 * Menampilkan informasi real-time (pelajaran berlangsung atau guru piket).
 * @param {string} roomId - ID ruangan.
 * @param {object} roomInfo - Objek data ruangan.
 */
function populateLiveInfo(roomId, roomInfo) {
    const liveInfoContainer = document.getElementById('modal-live-info');
    const modalDesc = document.getElementById('modal-desc');

    // Prioritaskan Guru Piket
    const dutyTeachers = getDutyTeacher(roomId);
    if (dutyTeachers) {
        document.getElementById('live-info-label').textContent = "Guru Piket";
        document.getElementById('live-teacher-img').src = dutyTeachers[0].image || 'images/guru/default.png';
        document.getElementById('live-teacher-name').textContent = dutyTeachers.length > 1 ? `${dutyTeachers[0].name} & tim` : dutyTeachers[0].name;
        document.getElementById('live-info-status').textContent = "Bertugas Hari Ini";
        liveInfoContainer.style.display = 'block';
        return;
    }

    // Jika bukan ruang piket, cek pelajaran berlangsung (hanya untuk kelas & lab)
    if (roomInfo.type === 'room-type-kelas' || roomInfo.type === 'room-type-lab') {
        const lessonResult = getCurrentLesson(roomId);
        if (lessonResult) {
            switch (lessonResult.status) {
                case "ONGOING_LESSON":
                    document.getElementById('live-info-label').textContent = "Pelajaran Berlangsung";
                    document.getElementById('live-teacher-img').src = lessonResult.teacher.image || 'images/guru/default.png';
                    document.getElementById('live-teacher-name').textContent = lessonResult.teacher.name;
                    document.getElementById('live-info-status').textContent = lessonResult.subject.displayName;
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

/**
 * Membuat dan menampilkan tabel jadwal pelajaran untuk hari ini di modal.
 * @param {string} roomName - Nama kelas/ruangan.
 */
function displayClassSchedule(roomName) {
    const scheduleTableBody = document.getElementById('schedule-table-body');
    const scheduleDayTitle = document.getElementById('schedule-day-title');
    const scheduleContainer = document.getElementById('modal-schedule-display-container');

    const now = new Date();
    const dayOfWeek = now.getDay();
    const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const scheduleForToday = classSchedules[roomName]?.[dayOfWeek];

    scheduleDayTitle.textContent = `Jadwal Hari ${dayNames[dayOfWeek]}`;
    scheduleTableBody.innerHTML = ''; // Kosongkan tabel sebelum diisi

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