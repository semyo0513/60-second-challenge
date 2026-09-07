/**
 * 60초 미션 클리어 챌린지 — 관리자 대시보드 로직 (admin.js)
 */

let currentAdminPin = "";
let missions = [];
let rankings = [];
let gameLogs = [];
let settings = {};

document.addEventListener("DOMContentLoaded", () => {
  checkSessionAuth();
  setupAdminEvents();
});

// ==========================================================================
// 1. PIN 인증 및 세션 관리
// ==========================================================================
function checkSessionAuth() {
  const savedPin = sessionStorage.getItem("admin_auth_pin");
  if (savedPin) {
    currentAdminPin = savedPin;
    showAdminDashboard();
  } else {
    showPinModal();
  }
}

function showPinModal() {
  document.getElementById("pinAuthModal").style.display = "flex";
  document.getElementById("adminMainWrap").style.display = "none";
  document.getElementById("inputAdminPin").focus();
}

function showAdminDashboard() {
  document.getElementById("pinAuthModal").style.display = "none";
  document.getElementById("adminMainWrap").style.display = "block";
  loadAllAdminData();
}

async function handlePinSubmit() {
  const pin = document.getElementById("inputAdminPin").value.trim();
  if (!pin) {
    alert("PIN 번호를 입력해주세요.");
    return;
  }

  // GAS 연동 확인 또는 로컬 PIN 확인
  const localSettings = JSON.parse(localStorage.getItem("challenge_settings") || "{}");
  const expectedPin = localSettings.adminPin || CONFIG.DEFAULT_SETTINGS.adminPin;

  if (CONFIG.GAS_API_URL && CONFIG.GAS_API_URL.startsWith("http")) {
    try {
      const res = await fetch(CONFIG.GAS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "verifyPin", payload: { pin: pin } })
      }).then(r => r.json());

      if (res.success) {
        currentAdminPin = pin;
        sessionStorage.setItem("admin_auth_pin", pin);
        showAdminDashboard();
        return;
      }
    } catch (e) {
      console.warn("서버 인증 실패, 로컬 검증 진행");
    }
  }

  if (pin === expectedPin) {
    currentAdminPin = pin;
    sessionStorage.setItem("admin_auth_pin", pin);
    showAdminDashboard();
  } else {
    alert("PIN 번호가 일치하지 않습니다.");
    document.getElementById("inputAdminPin").value = "";
    document.getElementById("inputAdminPin").focus();
  }
}

// ==========================================================================
// 2. 전체 데이터 불러오기
// ==========================================================================
async function loadAllAdminData() {
  // 1) 로컬 데이터 로드
  const lMissions = localStorage.getItem("challenge_missions");
  const lRankings = localStorage.getItem("challenge_rankings");
  const lSettings = localStorage.getItem("challenge_settings");
  const lLogs = localStorage.getItem("challenge_gamelog");

  missions = lMissions ? JSON.parse(lMissions) : [...CONFIG.DEFAULT_MISSIONS];
  rankings = lRankings ? JSON.parse(lRankings) : [];
  settings = lSettings ? JSON.parse(lSettings) : { ...CONFIG.DEFAULT_SETTINGS };
  gameLogs = lLogs ? JSON.parse(lLogs) : [];

  // 2) GAS 연동 데이터 동기화
  if (CONFIG.GAS_API_URL && CONFIG.GAS_API_URL.startsWith("http")) {
    try {
      const [mRes, rRes, sRes, lRes] = await Promise.all([
        fetch(`${CONFIG.GAS_API_URL}?action=getAllMissions`).then(r => r.json()),
        fetch(`${CONFIG.GAS_API_URL}?action=getRanking&limit=100`).then(r => r.json()),
        fetch(`${CONFIG.GAS_API_URL}?action=getSettings`).then(r => r.json()),
        fetch(`${CONFIG.GAS_API_URL}?action=getGameLogs`).then(r => r.json())
      ]);

      if (mRes.success && mRes.missions) {
        missions = mRes.missions;
        localStorage.setItem("challenge_missions", JSON.stringify(missions));
      }
      if (rRes.success && rRes.rankings) {
        rankings = rRes.rankings;
        localStorage.setItem("challenge_rankings", JSON.stringify(rankings));
      }
      if (sRes.success && sRes.settings) {
        settings = sRes.settings;
        localStorage.setItem("challenge_settings", JSON.stringify(settings));
      }
      if (lRes.success && lRes.logs) {
        gameLogs = lRes.logs;
        localStorage.setItem("challenge_gamelog", JSON.stringify(gameLogs));
      }
    } catch (e) {
      console.warn("GAS 연동 데이터 로드 실패 (로컬 데이터 사용):", e);
    }
  }

  renderMissionsTable();
  renderSettingsForm();
  renderRankingsTable();
  renderStatsAndLogs();
}

// ==========================================================================
// 3. UI 탭 전환 및 이벤트 리스너
// ==========================================================================
function setupAdminEvents() {
  // PIN 제출
  document.getElementById("btnSubmitPin").addEventListener("click", handlePinSubmit);
  document.getElementById("inputAdminPin").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handlePinSubmit();
  });

  // 로그아웃
  document.getElementById("btnLogout").addEventListener("click", () => {
    sessionStorage.removeItem("admin_auth_pin");
    location.reload();
  });

  // 탭 전환
  document.querySelectorAll(".admin-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".admin-tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content-panel").forEach(p => p.classList.remove("active"));

      btn.classList.add("active");
      const target = btn.getAttribute("data-tab");
      document.getElementById(target).classList.add("active");
    });
  });

  // 미션 필터 및 검색
  document.getElementById("missionSearchInput").addEventListener("input", renderMissionsTable);
  document.getElementById("categoryFilter").addEventListener("change", renderMissionsTable);

  // 미션 추가 모달 열기/닫기
  document.getElementById("btnOpenAddMissionModal").addEventListener("click", () => {
    document.getElementById("addMissionForm").reset();
    document.getElementById("addMissionModal").style.display = "flex";
  });
  document.getElementById("btnCloseAddMissionModal").addEventListener("click", () => {
    document.getElementById("addMissionModal").style.display = "none";
  });
  document.getElementById("btnAddMissionSubmit").addEventListener("click", handleAddMission);

  // 추천 프리셋 미션 일괄 추가
  document.getElementById("btnBatchPresetMissions").addEventListener("click", handleBatchPresetMissions);

  // 설정 저장
  document.getElementById("btnSaveSettings").addEventListener("click", handleSaveSettings);

  // 랭킹 초기화 & CSV 내보내기
  document.getElementById("btnResetRankings").addEventListener("click", handleResetRankings);
  document.getElementById("btnExportRankingCsv").addEventListener("click", exportRankingsCsv);

  // 게임 로그 초기화 & CSV 내보내기
  document.getElementById("btnResetLogs").addEventListener("click", handleResetLogs);
  document.getElementById("btnExportLogsCsv").addEventListener("click", exportLogsCsv);
}

// ==========================================================================
// 4. 미션 관리 (CRUD)
// ==========================================================================
function renderMissionsTable() {
  const tbody = document.getElementById("missionsTableBody");
  const query = document.getElementById("missionSearchInput").value.trim().toLowerCase();
  const catFilter = document.getElementById("categoryFilter").value;

  tbody.innerHTML = "";

  const filtered = missions.filter(m => {
    const matchText = (m.mission || "").toLowerCase().includes(query) || (m.id || "").toLowerCase().includes(query);
    const matchCat = catFilter === "ALL" || (m.category === catFilter);
    return matchText && matchCat;
  });

  document.getElementById("missionCountBadge").textContent = `${filtered.length} / ${missions.length}개`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem; color: #94a3b8;">조건에 맞는 미션이 없습니다.</td></tr>`;
    return;
  }

  filtered.forEach(m => {
    const tr = document.createElement("tr");
    const isActive = m.active !== false;

    tr.innerHTML = `
      <td><code>${m.id || "-"}</code></td>
      <td style="text-align: left; font-weight: 600;">${m.mission}</td>
      <td><span class="badge badge-cyan">${m.category || "일반"}</span></td>
      <td><span class="badge badge-purple">${m.level || "중"}</span></td>
      <td>
        <button class="status-toggle-btn ${isActive ? 'active' : 'inactive'}" onclick="toggleMissionActive('${m.id}')">
          ${isActive ? "사용중" : "비활성"}
        </button>
      </td>
      <td>
        <button class="action-sm-btn btn-delete" onclick="deleteMission('${m.id}')">삭제</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function handleAddMission() {
  const missionText = document.getElementById("newMissionText").value.trim();
  const category = document.getElementById("newCategory").value;
  const level = document.getElementById("newLevel").value;

  if (!missionText) {
    alert("미션 내용을 입력해주세요.");
    return;
  }

  const newId = "M" + Date.now().toString().slice(-6);
  const newMission = {
    id: newId,
    mission: missionText,
    category: category,
    level: level,
    active: true,
    createdAt: new Date().toLocaleString()
  };

  missions.unshift(newMission);
  localStorage.setItem("challenge_missions", JSON.stringify(missions));

  if (CONFIG.GAS_API_URL && CONFIG.GAS_API_URL.startsWith("http")) {
    try {
      await fetch(CONFIG.GAS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "addMission",
          payload: { pin: currentAdminPin, ...newMission }
        })
      });
    } catch (e) {
      console.warn("GAS 미션 추가 오류:", e);
    }
  }

  document.getElementById("addMissionModal").style.display = "none";
  renderMissionsTable();
  alert("새 미션이 등록되었습니다.");
}

async function toggleMissionActive(id) {
  const target = missions.find(m => m.id === id);
  if (!target) return;

  target.active = !(target.active !== false);
  localStorage.setItem("challenge_missions", JSON.stringify(missions));

  if (CONFIG.GAS_API_URL && CONFIG.GAS_API_URL.startsWith("http")) {
    try {
      await fetch(CONFIG.GAS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "updateMission",
          payload: { pin: currentAdminPin, id: id, active: target.active }
        })
      });
    } catch (e) {}
  }

  renderMissionsTable();
}

async function deleteMission(id) {
  if (!confirm("정말 이 미션을 삭제하시겠습니까?")) return;

  missions = missions.filter(m => m.id !== id);
  localStorage.setItem("challenge_missions", JSON.stringify(missions));

  if (CONFIG.GAS_API_URL && CONFIG.GAS_API_URL.startsWith("http")) {
    try {
      await fetch(CONFIG.GAS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "deleteMission",
          payload: { pin: currentAdminPin, id: id }
        })
      });
    } catch (e) {}
  }

  renderMissionsTable();
}

async function handleBatchPresetMissions() {
  if (!confirm("독서행사 추천 기본 미션 20종을 추가하시겠습니까? (중복 미션은 자동으로 추가됩니다)")) return;

  missions.push(...CONFIG.DEFAULT_MISSIONS);
  localStorage.setItem("challenge_missions", JSON.stringify(missions));

  if (CONFIG.GAS_API_URL && CONFIG.GAS_API_URL.startsWith("http")) {
    try {
      await fetch(CONFIG.GAS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "batchAddMissions",
          payload: { pin: currentAdminPin, missions: CONFIG.DEFAULT_MISSIONS }
        })
      });
    } catch (e) {}
  }

  renderMissionsTable();
  alert("추천 미션 20종이 성공적으로 추가되었습니다.");
}

// ==========================================================================
// 5. 게임 설정 (Settings)
// ==========================================================================
function renderSettingsForm() {
  document.getElementById("settingEventTitle").value = settings.eventTitle || CONFIG.DEFAULT_SETTINGS.eventTitle;
  document.getElementById("settingSubTitle").value = settings.subTitle || CONFIG.DEFAULT_SETTINGS.subTitle;
  document.getElementById("settingTimerSeconds").value = settings.timerSeconds || CONFIG.DEFAULT_SETTINGS.timerSeconds;
  document.getElementById("settingAdminPin").value = settings.adminPin || CONFIG.DEFAULT_SETTINGS.adminPin;
  document.getElementById("settingAllowPass").checked = settings.allowPass !== false;
  document.getElementById("settingAutoReturn").value = settings.autoReturnSeconds || CONFIG.DEFAULT_SETTINGS.autoReturnSeconds;
}

async function handleSaveSettings() {
  const newSettings = {
    eventTitle: document.getElementById("settingEventTitle").value.trim(),
    subTitle: document.getElementById("settingSubTitle").value.trim(),
    timerSeconds: parseInt(document.getElementById("settingTimerSeconds").value) || 60,
    adminPin: document.getElementById("settingAdminPin").value.trim() || "1234",
    allowPass: document.getElementById("settingAllowPass").checked,
    autoReturnSeconds: parseInt(document.getElementById("settingAutoReturn").value) || 5
  };

  settings = newSettings;
  localStorage.setItem("challenge_settings", JSON.stringify(settings));

  if (CONFIG.GAS_API_URL && CONFIG.GAS_API_URL.startsWith("http")) {
    try {
      await fetch(CONFIG.GAS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "updateSettings",
          payload: { pin: currentAdminPin, settings: newSettings }
        })
      });
    } catch (e) {
      console.warn("GAS 설정 저장 실패:", e);
    }
  }

  currentAdminPin = newSettings.adminPin;
  sessionStorage.setItem("admin_auth_pin", currentAdminPin);
  alert("설정이 성공적으로 저장되었습니다!");
}

// ==========================================================================
// 6. 랭킹보드 관리 (Rankings)
// ==========================================================================
function renderRankingsTable() {
  const tbody = document.getElementById("rankingsTableBody");
  tbody.innerHTML = "";

  if (rankings.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem; color: #94a3b8;">등록된 랭킹 기록이 없습니다.</td></tr>`;
    return;
  }

  rankings.forEach((r, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${idx + 1}위</strong></td>
      <td style="font-weight: 700;">${r.name}</td>
      <td style="text-align: left;">${r.mission}</td>
      <td style="color: #fbbf24; font-weight: 800;">${r.seconds}초</td>
      <td>${r.clearedAt || "-"}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function handleResetRankings() {
  if (!confirm("⚠️ 주의: 명예의 전당 랭킹 기록을 모두 초기화하시겠습니까? (되돌릴 수 없습니다)")) return;

  rankings = [];
  localStorage.setItem("challenge_rankings", JSON.stringify([]));

  if (CONFIG.GAS_API_URL && CONFIG.GAS_API_URL.startsWith("http")) {
    try {
      await fetch(CONFIG.GAS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "resetRanking",
          payload: { pin: currentAdminPin }
        })
      });
    } catch (e) {}
  }

  renderRankingsTable();
  alert("랭킹보드가 초기화되었습니다.");
}

function exportRankingsCsv() {
  if (rankings.length === 0) {
    alert("내보낼 랭킹 데이터가 없습니다.");
    return;
  }

  let csvContent = "\uFEFF순위,참가자명,미션내용,소요시간(초),클리어일시\n";
  rankings.forEach((r, i) => {
    csvContent += `"${i + 1}","${r.name}","${r.mission.replace(/"/g, '""')}","${r.seconds}","${r.clearedAt || ''}"\n`;
  });

  downloadCsvFile(csvContent, `랭킹보드_결과_${getTodayString()}.csv`);
}

// ==========================================================================
// 7. 게임 통계 및 로그 (Logs & Stats)
// ==========================================================================
function renderStatsAndLogs() {
  const totalPlays = gameLogs.length;
  const clears = gameLogs.filter(l => l.result === "성공").length;
  const fails = totalPlays - clears;
  const clearRate = totalPlays > 0 ? ((clears / totalPlays) * 100).toFixed(1) : 0;

  const totalClearSeconds = gameLogs.filter(l => l.result === "성공").reduce((acc, l) => acc + (parseFloat(l.seconds) || 0), 0);
  const avgClearTime = clears > 0 ? (totalClearSeconds / clears).toFixed(1) : 0;

  document.getElementById("statTotalPlays").textContent = `${totalPlays}회`;
  document.getElementById("statClearCount").textContent = `${clears}회`;
  document.getElementById("statFailCount").textContent = `${fails}회`;
  document.getElementById("statClearRate").textContent = `${clearRate}%`;
  document.getElementById("statAvgTime").textContent = `${avgClearTime}초`;

  const tbody = document.getElementById("logsTableBody");
  tbody.innerHTML = "";

  if (gameLogs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem; color: #94a3b8;">기록된 게임 로그가 없습니다.</td></tr>`;
    return;
  }

  gameLogs.forEach((l, i) => {
    const tr = document.createElement("tr");
    const isSuccess = l.result === "성공";
    tr.innerHTML = `
      <td>${gameLogs.length - i}</td>
      <td style="font-weight: 700;">${l.name}</td>
      <td style="text-align: left;">${l.mission}</td>
      <td><span class="badge ${isSuccess ? 'badge-emerald' : 'badge-rose'}">${l.result}</span></td>
      <td>${l.seconds}초</td>
    `;
    tbody.appendChild(tr);
  });
}

async function handleResetLogs() {
  if (!confirm("⚠️ 전체 게임 시도 로그를 초기화하시겠습니까?")) return;

  gameLogs = [];
  localStorage.setItem("challenge_gamelog", JSON.stringify([]));

  if (CONFIG.GAS_API_URL && CONFIG.GAS_API_URL.startsWith("http")) {
    try {
      await fetch(CONFIG.GAS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "resetGameLog",
          payload: { pin: currentAdminPin }
        })
      });
    } catch (e) {}
  }

  renderStatsAndLogs();
  alert("게임 로그가 초기화되었습니다.");
}

function exportLogsCsv() {
  if (gameLogs.length === 0) {
    alert("내보낼 로그 데이터가 없습니다.");
    return;
  }

  let csvContent = "\uFEFF순번,참가자명,미션내용,결과,소요시간(초),일시\n";
  gameLogs.forEach((l, i) => {
    csvContent += `"${gameLogs.length - i}","${l.name}","${l.mission.replace(/"/g, '""')}","${l.result}","${l.seconds}","${l.timestamp || ''}"\n`;
  });

  downloadCsvFile(csvContent, `게임전체로그_${getTodayString()}.csv`);
}

// CSV 다운로드 유틸리티
function downloadCsvFile(content, fileName) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}
