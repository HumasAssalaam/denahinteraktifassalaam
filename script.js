/* ========================================================================= */
/* 1. VARIABEL GLOBAL & KONSTANTA */
/* ========================================================================= */

// Variabel untuk menyimpan data dari JSON
let roomData = {};
let teacherData = {};
let subjectData = {};
let scheduleData = {};
let piketData = {};
let classSchedules = {}; // <-- Data jadwal per kelas yang baru

// Variabel untuk state aplikasi
let roomNameMap = {};
let currentBuilding = 'utara';
let currentFloor = 1;
let activeSuggestionIndex = -1;
let isZoomedOut = false;

// Elemen DOM yang sering diakses
const mainContainer = document.getElementById('main-container');
const modal = document.getElementById('room-modal');
const searchBox = document.getElementById('search-box');
const suggestionsContainer = document.getElementById('search-suggestions');


/* ========================================================================= */
/* 2. FUNGSI-FUNGSI UTAMA */
/* ========================================================================= */

// Menerapkan layout grid dari data JSON ke elemen HTML
function applyLayouts() {
    for (const id in roomData) {
        const element = document.getElementById(id);
        const data = roomData[id];
        if (element && data.layout && data.layout.gridArea) {
            element.style.gridArea = data.layout.gridArea;
        }
    }
}

// Memperbarui tampilan berdasarkan gedung dan lantai yang dipilih
function updateView(building, floor, isSearching = false) {
    currentBuilding = building;
    currentFloor = parseInt(floor);

    mainContainer.style.maxWidth = (building === 'utara') ? '1000px' : '600px';

    document.querySelectorAll('.building-plan').forEach(plan => {
        plan.classList.toggle('active', plan.id === `plan-${building}`);
    });

    document.querySelectorAll('.building-selector button').forEach(btn => {
        btn.classList.toggle('active', btn.id === `btn-building-${building}`);
    });

    const floorSelectorParent = document.querySelector(`#plan-${building} .floor-selector`);
    if (floorSelectorParent) {
        floorSelectorParent.querySelector('button.active')?.classList.remove('active');
        const targetButton = floorSelectorParent.querySelector(`button[data-floor='${currentFloor}']`);
        if (targetButton) {
            targetButton.classList.add('active');
        }
    }

    if (!isSearching) {
        document.querySelectorAll('.room, .area-luar').forEach(el => {
            const elId = el.dataset.id || el.id;
            if (elId) {
                const isVisible = elId.startsWith(`${building}-lt${currentFloor}`);
                el.classList.toggle('is-invisible', !isVisible);
            }
        });
    }

    document.getElementById('plan-grid-utara').classList.toggle('show-floor-2', building === 'utara' && currentFloor === 2);

    const newActivePlanDiv = document.querySelector('.building-plan.active');
    if (newActivePlanDiv) {
        const wrapper = newActivePlanDiv.querySelector('.plan-wrapper');
        const plan = newActivePlanDiv.querySelector('.floor-plan');
        applyZoomState(wrapper, plan);
    }
}

// Mengisi nama ruangan dari data JSON ke elemen HTML
function renderAllRoomData() {
    document.querySelectorAll('.room, .area-luar[data-id]').forEach(el => {
        const data = roomData[el.dataset.id || el.id];
        if (data && data.name) {
            el.textContent = data.name;
            const classesToRemove = Array.from(el.classList).filter(c => c.startsWith('room-type-'));
            el.classList.remove(...classesToRemove);
            if (data.type) {
                el.classList.add(data.type);
            }
        } else if (data && !data.name) {
            el.textContent = "";
        } else {
            el.textContent = "-";
        }
    });
}

// Menerapkan atau menghapus state zoom (fit-to-screen)
function applyZoomState(wrapper, plan) {
    if (!wrapper || !plan) return;
    wrapper.classList.toggle('zoomed-out', isZoomedOut);
    
    if (isZoomedOut) {
        wrapper.scrollLeft = 0;
        const planWidth = plan.scrollWidth;
        const wrapperWidth = wrapper.clientWidth;
        const scale = (wrapperWidth / planWidth) * 0.98;
        const planHeight = plan.scrollHeight;
        
        plan.style.transform = `scale(${scale})`;
        wrapper.style.height = `${planHeight * scale}px`;
        wrapper.style.overflowX = 'hidden';
    } else {
        plan.style.transform = '';
        wrapper.style.height = '';
        wrapper.style.overflowX = 'auto';
    }
}

// Mereset tampilan pencarian
function resetSearchView() {
    searchBox.value = '';
    suggestionsContainer.classList.remove('visible');
    suggestionsContainer.innerHTML = '';
    
    document.querySelectorAll('.room, .area-luar').forEach(el => {
        el.classList.remove('highlight', 'dimmed');
    });
    
    document.getElementById('plan-grid-utara').classList.remove('show-floor-2');
    updateView(currentBuilding, currentFloor, false);
}

// Mencari ruangan berdasarkan query
function findRooms(query) {
    if (!query || query.trim().length === 0) return [];

    const normalizedQuery = query.toLowerCase().replace(/[-\s]/g, '');
    const results = [];
    const wholeWordRegex = new RegExp('\\b' + query + '\\b', 'i');
    const wordStartsWithRegex = new RegExp('\\b' + query, 'i');

    for (const id in roomData) {
        const room = roomData[id];
        if (!room.name || room.name === '-') continue;

        const originalRoomName = room.name;
        const normalizedRoomName = originalRoomName.toLowerCase().replace(/[-\s]/g, '');
        let score = 0;

        if (normalizedRoomName === normalizedQuery) { score = 5; }
        else if (normalizedRoomName.startsWith(normalizedQuery)) { score = 4; }
        else if (wholeWordRegex.test(originalRoomName)) { score = 3; }
        else if (wordStartsWithRegex.test(originalRoomName)) { score = 2; }
        else if (normalizedRoomName.includes(normalizedQuery)) { score = 1; }
        
        if (score > 0) {
            if (id.startsWith(currentBuilding)) { score += 0.5; }
            results.push({ id, ...room, score });
        }
    }
    return results.sort((a, b) => b.score - a.score);
}

// Menampilkan hasil pencarian di daftar sugesti
function renderSuggestions(results) {
    suggestionsContainer.innerHTML = '';
    if (results.length === 0) {
        suggestionsContainer.classList.remove('visible');
        return;
    }

    const list = document.createElement('ul');
    results.slice(0, 15).forEach(result => {
        const item = document.createElement('li');
        item.dataset.roomId = result.id;
        const [building, floorPart] = result.id.split('-lt');
        const buildingName = building.charAt(0).toUpperCase() + building.slice(1);
        item.innerHTML = `${result.name} <small>(${buildingName} Lt. ${floorPart.charAt(0)})</small>`;
        list.appendChild(item);
    });

    suggestionsContainer.appendChild(list);
    suggestionsContainer.classList.add('visible');
}

// Menyorot hasil pencarian di denah
function highlightSearchResults(results) {
    document.querySelectorAll('.room, .area-luar').forEach(el => {
        el.classList.remove('highlight', 'dimmed');
    });

    if (!results || results.length === 0) {
        resetSearchView();
        return;
    }

    const resultIds = new Set(results.map(r => r.id));
    const firstResultId = results[0].id;
    const [building, floorPart] = firstResultId.split('-lt');
    const floor = floorPart.charAt(0);
    
    updateView(building, floor, true); 
    
    document.querySelectorAll(`#plan-${building} .room, #plan-${building} .area-luar`).forEach(el => {
        const elId = el.id || el.dataset.id;
        if (!elId) return;

        if (elId.startsWith(`${building}-lt${floor}`)) {
            el.classList.remove('is-invisible');
            if (resultIds.has(elId)) {
                el.classList.add('highlight');
            } else {
                el.classList.add('dimmed');
            }
        } else {
            el.classList.add('is-invisible');
        }
    });
}

// Fungsi untuk scroll ke elemen saat denah di-zoom-out
function scrollToElementInScaledContainer(element) {
    const planWrapper = element.closest('.plan-wrapper');
    const floorPlan = element.closest('.floor-plan');
    if (!planWrapper || !floorPlan) return;

    const transformStyle = window.getComputedStyle(floorPlan).transform;
    let scale = 1;
    if (transformStyle && transformStyle !== 'none') {
        const matrix = new DOMMatrixReadOnly(transformStyle);
        scale = matrix.m11;
    }

    const elementTopRelativeToPlan = element.offsetTop;
    const elementHeight = element.offsetHeight;
    const scaledElementCenter = (elementTopRelativeToPlan + (elementHeight / 2)) * scale;
    const wrapperTopRelativeToDocument = planWrapper.getBoundingClientRect().top + window.pageYOffset;
    const viewportHeight = window.innerHeight;
    const targetScrollY = wrapperTopRelativeToDocument + scaledElementCenter - (viewportHeight / 2);

    window.scrollTo({
        top: targetScrollY,
        behavior: 'smooth'
    });
}

// Mendapatkan informasi pelajaran saat ini
function getCurrentLesson(roomId) {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const currentTime = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');

    const todaySchedule = scheduleData[dayOfWeek];
    if (!todaySchedule || Object.keys(todaySchedule).length === 0) {
        return { status: "NO_SCHOOL_DAY" };
    }

    const roomName = roomData[roomId]?.name;
    if (!roomName) return null;

    let isWithinSchoolHours = false;
    let lessonFound = null;

    for (const timeSlot in todaySchedule) {
        const [startTime, endTime] = timeSlot.split('-');
        if (currentTime >= startTime && currentTime < endTime) {
            isWithinSchoolHours = true;
            const lessonObject = todaySchedule[timeSlot][roomName];
            if (lessonObject) {
                lessonFound = lessonObject;
                break;
            }
        }
    }

    if (lessonFound) {
        if (lessonFound.subjectId === "ISTIRAHAT") {
            return { status: "BREAK_TIME" };
        }
        const subjectInfo = subjectData[lessonFound.subjectId];
        const teacherInfo = teacherData[lessonFound.teacherId];
        if (subjectInfo && teacherInfo) {
            return { status: "ONGOING_LESSON", subject: subjectInfo, teacher: teacherInfo };
        }
    }
    
    if (isWithinSchoolHours) {
        return { status: "EMPTY_ROOM" }; 
    }
    
    return { status: "OUTSIDE_SCHOOL_HOURS" };
}

// Mendapatkan informasi guru piket hari ini
function getDutyTeacher(roomId) {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const todayPiketSchedule = piketData[dayOfWeek];
    if (!todayPiketSchedule) return null;

    const roomName = roomData[roomId]?.name;
    if (!roomName) return null;

    const dutyTeacherIds = todayPiketSchedule[roomName];
    
    if (dutyTeacherIds && dutyTeacherIds.length > 0) {
        const dutyTeachers = dutyTeacherIds.map(id => teacherData[id]).filter(Boolean);
        if (dutyTeachers.length > 0) {
            return dutyTeachers;
        }
    }
    return null;
}


/* ========================================================================= */
/* 3. INISIALISASI APLIKASI DAN EVENT LISTENERS */
/* ========================================================================= */

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // --- Langkah 1: Muat semua data JSON secara paralel ---
        const [roomsRes, teachersRes, subjectsRes, scheduleRes, piketRes, classSchedulesRes] = await Promise.all([
            fetch('data/rooms.json'),
            fetch('data/teachers.json'),
            fetch('data/subjects.json'),
            fetch('data/schedule.json'),
            fetch('data/piket.json'),
            fetch('data/class-schedules.json') // Memuat file jadwal per kelas baru
        ]);

        // Cek jika ada yang gagal dimuat
        if (!roomsRes.ok || !teachersRes.ok || !subjectsRes.ok || !scheduleRes.ok || !piketRes.ok || !classSchedulesRes.ok) {
            throw new Error('Gagal memuat satu atau lebih file data.');
        }

        // --- Langkah 2: Ubah semua respons menjadi objek JSON ---
        [roomData, teacherData, subjectData, scheduleData, piketData, classSchedules] = await Promise.all([
            roomsRes.json(), teachersRes.json(), subjectsRes.json(),
            scheduleRes.json(), piketRes.json(), classSchedulesRes.json()
        ]);
        
        // --- Langkah 3: Lakukan setup awal setelah data siap ---
        for (const roomId in roomData) {
            if (roomData[roomId].name && roomData[roomId].name !== "-") {
                roomNameMap[roomData[roomId].name] = roomId;
            }
        }
        
        applyLayouts();
        renderAllRoomData();
        updateView('utara', 1);

    } catch (error) {
        console.error("Gagal menginisialisasi aplikasi:", error);
        mainContainer.innerHTML = '<h1>Oops! Terjadi kesalahan.</h1><p>Gagal memuat data denah, silakan muat ulang halaman.</p>';
        return; // Hentikan script jika data gagal dimuat
    }
});


// --- EVENT LISTENERS DITEMPATKAN DI LUAR `DOMContentLoaded` AGAR LEBIH RAPI ---

// Listener untuk klik pada setiap ruangan
document.querySelectorAll('.room, .area-luar[data-id]').forEach(room => {
    room.addEventListener('click', (e) => {
        if (e.target.closest('.highlight')) return;
        const dataId = room.dataset.id || room.id;
        const data = roomData[dataId];

        if (data && data.name && data.name !== "-") {
            // --- AMBIL SEMUA ELEMEN MODAL ---
            const modalTitle = document.getElementById('modal-title');
            const linkButton = document.getElementById('modal-link-button');
            const liveInfoContainer = document.getElementById('modal-live-info');
            const liveInfoLabel = document.getElementById('live-info-label');
            const liveTeacherImg = document.getElementById('live-teacher-img');
            const liveTeacherName = document.getElementById('live-teacher-name');
            const liveInfoStatus = document.getElementById('live-info-status');
            const classInfoContainer = document.getElementById('modal-class-info');
            const capacityInfoContainer = document.getElementById('modal-capacity-info');
            const modalDesc = document.getElementById('modal-desc');
            const personnelContainer = document.getElementById('modal-personnel-info');
            const walasImg = document.getElementById('walas-img');
            const walasName = document.getElementById('walas-name');
            const classCapacity = document.getElementById('class-capacity');
            const btnShowSchedule = document.getElementById('btn-show-schedule');
            const scheduleContainer = document.getElementById('modal-schedule-container');

            // --- RESET TAMPILAN MODAL ---
            modalTitle.textContent = data.name;
            liveInfoContainer.style.display = 'none';
            classInfoContainer.style.display = 'none';
            capacityInfoContainer.style.display = 'none';
            modalDesc.textContent = data.desc || '';
            linkButton.style.display = 'none';
            personnelContainer.style.display = 'none';
            personnelContainer.innerHTML = '';
            btnShowSchedule.style.display = 'none'; // Sembunyikan tombol jadwal
            scheduleContainer.style.display = 'none'; // Sembunyikan kontainer jadwal

            // --- ISI KONTEN MODAL ---
            
            // Tampilkan tombol link jika ada
            if (data.link && data.link.url) {
                linkButton.style.display = 'inline-block';
                linkButton.href = data.link.url;
                linkButton.textContent = data.link.text || 'Info Selengkapnya';
            }
            
            // Tampilkan info personel kunci
            if (data.keyPersonnel && Array.isArray(data.keyPersonnel) && data.keyPersonnel.length > 0) {
                data.keyPersonnel.forEach(person => {
                    const personData = teacherData[person.teacherId];
                    if (personData) {
                        personnelContainer.innerHTML += `
                            <div class="personnel-item">
                                <img src="${personData.image || 'images/default.jpg'}" alt="Foto ${personData.name}">
                                <div>
                                    <p class="personnel-name">${personData.name}</p>
                                    <p class="personnel-title">${person.title}</p>
                                </div>
                            </div>`;
                    }
                });
                personnelContainer.style.display = 'block';
            }
            
            // Tampilkan info spesifik untuk kelas (wali kelas, kapasitas, dan tombol jadwal)
            if (room.classList.contains('room-type-kelas')) {
                if (data.waliKelasId && teacherData[data.waliKelasId]) {
                    const walasData = teacherData[data.waliKelasId];
                    walasImg.src = walasData.image || 'images/guru/default.png';
                    walasName.textContent = walasData.name;
                    classInfoContainer.style.display = 'block';
                }
                if (data.kapasitas) {
                    classCapacity.textContent = data.kapasitas;
                    capacityInfoContainer.style.display = 'block';
                }
                // Tampilkan tombol lihat jadwal jika data jadwal untuk kelas ini ada
                if (classSchedules[data.name]) {
                    btnShowSchedule.style.display = 'inline-block';
                }
            }

            // Tampilkan info live (guru piket atau pelajaran berlangsung)
            const dutyTeachers = getDutyTeacher(dataId);
            
            if (dutyTeachers) {
                liveInfoLabel.textContent = "Guru Piket";
                liveTeacherImg.src = dutyTeachers[0].image || 'images/guru/default.png';
                liveTeacherName.textContent = dutyTeachers[0].name;
                liveInfoStatus.textContent = "Bertugas Hari Ini";
                liveInfoContainer.style.display = 'block';
            } else if (room.classList.contains('room-type-kelas') || room.classList.contains('room-type-lab')) {
                const lessonResult = getCurrentLesson(dataId);
                if (lessonResult) {
                     switch (lessonResult.status) {
                        case "ONGOING_LESSON":
                            liveInfoLabel.textContent = "Pelajaran Berlangsung";
                            liveTeacherImg.src = lessonResult.teacher.image || 'images/guru/default.png';
                            liveTeacherName.textContent = lessonResult.teacher.name;
                            liveInfoStatus.textContent = lessonResult.subject.displayName;
                            liveInfoContainer.style.display = 'block';
                            break;
                        case "BREAK_TIME":
                            modalDesc.textContent = "Saat ini sedang jam istirahat."; break;
                        case "EMPTY_ROOM":
                            modalDesc.textContent = "Ruangan ini sedang tidak digunakan."; break;
                        case "NO_SCHOOL_DAY":
                        case "OUTSIDE_SCHOOL_HOURS":
                            modalDesc.innerHTML = `<strong style="color: #d9534f;">Santri sudah pulang atau bukan waktu KBM!</strong>`; break;
                    }
                }
            }
            
            modal.style.display = 'block';
        }
    });
});

// Listener untuk tombol "Lihat Jadwal Hari Ini"
document.getElementById('btn-show-schedule').addEventListener('click', () => {
    const roomName = document.getElementById('modal-title').textContent;
    const scheduleContainer = document.getElementById('modal-schedule-container');
    const scheduleTableBody = document.getElementById('schedule-table-body');
    const scheduleDayTitle = document.getElementById('schedule-day-title');

    // Toggle tampilan: jika sudah terlihat, sembunyikan. Jika tersembunyi, tampilkan.
    if (scheduleContainer.style.display === 'block') {
        scheduleContainer.style.display = 'none';
        return; // Hentikan fungsi
    }

    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Minggu, 1=Senin, ..., 6=Sabtu
    const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    
    const scheduleForToday = classSchedules[roomName]?.[dayOfWeek];

    scheduleDayTitle.textContent = `Jadwal Hari ${dayNames[dayOfWeek]}`;
    scheduleTableBody.innerHTML = ''; // Kosongkan tabel sebelum diisi

    if (scheduleForToday && scheduleForToday.length > 0) {
        scheduleForToday.forEach(lesson => {
            const row = `
                <tr>
                    <td>${lesson.time}</td>
                    <td>${lesson.subject}</td>
                    <td>${lesson.teacher || '-'}</td>
                </tr>
            `;
            scheduleTableBody.innerHTML += row;
        });
    } else {
        const row = `
            <tr>
                <td colspan="3" style="text-align: center;">Tidak ada jadwal untuk hari ini.</td>
            </tr>
        `;
        scheduleTableBody.innerHTML += row;
    }

    scheduleContainer.style.display = 'block'; // Tampilkan kontainer jadwal
});

// Listener untuk tombol navigasi gedung dan lantai
document.querySelectorAll('.building-selector button, .floor-selector button').forEach(button => {
    button.addEventListener('click', () => {
        resetSearchView(); 
        const isBuildingButton = button.id.includes('btn-building');
        const targetBuilding = isBuildingButton ? button.id.replace('btn-building-', '') : button.closest('.building-plan').id.replace('plan-', '');
        const targetFloor = isBuildingButton ? 1 : button.dataset.floor;
        updateView(targetBuilding, targetFloor, false);
    });
});

// Listener untuk fungsionalitas pencarian
searchBox.addEventListener('input', () => {
    activeSuggestionIndex = -1; 
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
        updateView(building, floor, false);
        
        const targetElement = document.getElementById(resultId);
        if (targetElement) {
            targetElement.classList.add('highlight');
            if (isZoomedOut) {
                scrollToElementInScaledContainer(targetElement);
            } else {
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        
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
    const wrapper = activePlanDiv.querySelector('.plan-wrapper');
    const plan = activePlanDiv.querySelector('.floor-plan');
    applyZoomState(wrapper, plan);
});

// Listener untuk menutup modal
document.querySelector('.close-button').addEventListener('click', () => {
    modal.style.display = 'none';
});

// Listener lain-lain (keyboard, klik di luar modal)
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (searchBox.value.trim() !== '') {
            resetSearchView();
        }
        modal.style.display = 'none';
    }
});

document.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.style.display = 'none';
    }
    const searchContainer = e.target.closest('.search-container');
    const navButton = e.target.closest('.building-selector button, .floor-selector button');
    if (!searchContainer && !navButton) {
        if (searchBox.value.trim() !== '') {
            resetSearchView();
        }
    }
});