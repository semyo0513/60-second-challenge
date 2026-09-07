/**
 * 60초 미션 클리어 챌린지 — 메인 프론트엔드 스크립트
 * 상태 머신 기반 인터랙션 및 애니메이션 / 사운드 연출
 */

// ==========================================================================
// 1. 게임 상태 및 전역 변수
// ==========================================================================
const STATES = {
  IDLE: "idle",
  NAME_ENTRY: "nameEntry",
  DRAWING: "drawing",
  READY: "ready",
  TIMING: "timing",
  SUCCESS: "success",
  FAIL: "fail"
};

let currentState = STATES.IDLE;
let activeMissions = [];
let rankingsList = [];
let currentParticipant = "";
let currentMission = null;
let passUsed = false;

// 타이머 관련
let totalTimerSeconds = 60;
let remainingSeconds = 60;
let timerStartTime = 0;
let timerInterval = null;
let autoReturnTimeout = null;

// 오프라인 / 온라인 상태
let isOnline = false;

// ==========================================================================
// 2. 초기화 및 이벤트 리스너
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
  initBackgroundParticles();
  initConfettiCanvas();
  loadConfigurationAndData();
  setupEventListeners();
  setupKeyboardShortcuts();
});

function setupEventListeners() {
  // 1. 대기 화면 버튼
  document.getElementById("btnStartEntry").addEventListener("click", () => {
    soundEngine.playClick();
    changeState(STATES.NAME_ENTRY);
  });

  // 2. 이름 입력 후 뽑기 시작
  document.getElementById("btnConfirmDraw").addEventListener("click", handleStartDraw);
  document.getElementById("participantInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleStartDraw();
  });
  document.getElementById("btnCancelEntry").addEventListener("click", () => {
    soundEngine.playClick();
    changeState(STATES.IDLE);
  });

  // 3. 미션 준비 화면 버튼
  document.getElementById("btnStartTimer").addEventListener("click", handleStartTimer);
  document.getElementById("btnPassMission").addEventListener("click", handlePassMission);

  // 4. 타이머 진행 중 판정 버튼
  document.getElementById("btnJudgeClear").addEventListener("click", () => handleVerdict(true));
  document.getElementById("btnJudgeFail").addEventListener("click", () => handleVerdict(false));

  // 5. 상단 유틸리티 버튼
  document.getElementById("btnToggleSound").addEventListener("click", () => {
    const muted = soundEngine.toggleMute();
    document.getElementById("soundIcon").textContent = muted ? "🔇" : "🔊";
    showToast(muted ? "음소거되었습니다." : "소리가 켜졌습니다.");
  });

  document.getElementById("btnToggleFullscreen").addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  // 6. 진행자 마스터 패널 제어
  const masterToggle = document.getElementById("masterToggleBtn");
  const masterPanel = document.getElementById("masterPanelCard");
  masterToggle.addEventListener("click", () => {
    masterPanel.classList.toggle("open");
  });

  document.getElementById("masterBtnForceClear").addEventListener("click", () => {
    if (currentState === STATES.TIMING) handleVerdict(true);
  });
  document.getElementById("masterBtnForceFail").addEventListener("click", () => {
    if (currentState === STATES.TIMING) handleVerdict(false);
  });
  document.getElementById("masterBtnResetIdle").addEventListener("click", () => {
    resetToIdle();
  });
  document.getElementById("masterBtnGoAdmin").addEventListener("click", () => {
    window.open("admin.html", "_blank");
  });
}

// 키보드 단축키
function setupKeyboardShortcuts() {
  window.addEventListener("keydown", (e) => {
    // 입력창 포커스 중에는 무시
    if (e.target.tagName === "INPUT") return;

    if (e.code === "Space") {
      e.preventDefault();
      if (currentState === STATES.IDLE) {
        changeState(STATES.NAME_ENTRY);
      } else if (currentState === STATES.READY) {
        handleStartTimer();
      } else if (currentState === STATES.TIMING) {
        handleVerdict(true); // 스페이스바로 빠른 성공 판정
      }
    } else if (e.key === "Escape") {
      if (currentState !== STATES.IDLE) resetToIdle();
    } else if (e.code === "KeyF" && !e.ctrlKey) {
      document.getElementById("btnToggleFullscreen").click();
    } else if (e.code === "KeyM" && !e.ctrlKey) {
      document.getElementById("btnToggleSound").click();
    } else if (e.key === "F2" || (e.ctrlKey && e.code === "KeyM")) {
      e.preventDefault();
      document.getElementById("masterToggleBtn").click();
    }
  });
}

// ==========================================================================
// 3. 데이터 로딩 및 동기화 (GAS or LocalStorage)
// ==========================================================================
async function loadConfigurationAndData() {
  updateConnectionBadge(false);

  // 로컬 저장소 우선 로드
  const localMissions = localStorage.getItem("challenge_missions");
  const localSettings = localStorage.getItem("challenge_settings");
  const localRankings = localStorage.getItem("challenge_rankings");

  activeMissions = localMissions ? JSON.parse(localMissions) : CONFIG.DEFAULT_MISSIONS;
  rankingsList = localRankings ? JSON.parse(localRankings) : [];

  if (localSettings) {
    const s = JSON.parse(localSettings);
    applySettings(s);
  } else {
    applySettings(CONFIG.DEFAULT_SETTINGS);
  }

  // GAS Web App URL이 설정되어 있다면 서버에서 최신 데이터 가져오기
  if (CONFIG.GAS_API_URL && CONFIG.GAS_API_URL.startsWith("http")) {
    try {
      const [missionsRes, rankingsRes, settingsRes] = await Promise.all([
        fetch(`${CONFIG.GAS_API_URL}?action=getMissions`).then(r => r.json()),
        fetch(`${CONFIG.GAS_API_URL}?action=getRanking&limit=20`).then(r => r.json()),
        fetch(`${CONFIG.GAS_API_URL}?action=getSettings`).then(r => r.json())
      ]);

      if (missionsRes.success && missionsRes.missions.length > 0) {
        activeMissions = missionsRes.missions;
        localStorage.setItem("challenge_missions", JSON.stringify(activeMissions));
      }
      if (rankingsRes.success) {
        rankingsList = rankingsRes.rankings;
        localStorage.setItem("challenge_rankings", JSON.stringify(rankingsList));
      }
      if (settingsRes.success && settingsRes.settings) {
        applySettings(settingsRes.settings);
        localStorage.setItem("challenge_settings", JSON.stringify(settingsRes.settings));
      }

      isOnline = true;
      updateConnectionBadge(true);
    } catch (err) {
      console.warn("GAS 서버 연동 실패 - 로컬 모드로 작동합니다.", err);
      updateConnectionBadge(false);
    }
  }

  renderRankings();
}

function applySettings(settings) {
  if (settings.eventTitle) {
    document.getElementById("headerTitle").textContent = settings.eventTitle;
    document.getElementById("idleTitle").textContent = settings.eventTitle;
  }
  if (settings.subTitle) {
    document.getElementById("idleSubtitle").textContent = settings.subTitle;
  }
  if (settings.timerSeconds) {
    totalTimerSeconds = parseInt(settings.timerSeconds) || 60;
  }
}

function updateConnectionBadge(online) {
  const badge = document.getElementById("connectionBadge");
  if (online) {
    badge.textContent = "● 구글 시트 연동됨";
    badge.className = "mode-badge";
  } else {
    badge.textContent = "● 로컬/오프라인 모드";
    badge.className = "mode-badge offline";
  }
}

// ==========================================================================
// 4. 상태 머신 및 뷰 전환
// ==========================================================================
function changeState(newState) {
  currentState = newState;
  document.querySelectorAll(".state-view").forEach(el => el.classList.remove("active"));
  document.body.classList.remove("panic-mode");

  switch (newState) {
    case STATES.IDLE:
      document.getElementById("viewIdle").classList.add("active");
      renderRankings();
      break;

    case STATES.NAME_ENTRY:
      document.getElementById("viewNameEntry").classList.add("active");
      const input = document.getElementById("participantInput");
      input.value = "";
      setTimeout(() => input.focus(), 100);
      break;

    case STATES.DRAWING:
      document.getElementById("viewDrawing").classList.add("active");
      break;

    case STATES.READY:
      document.getElementById("viewReady").classList.add("active");
      break;

    case STATES.TIMING:
      document.getElementById("viewTiming").classList.add("active");
      break;

    case STATES.SUCCESS:
      document.getElementById("viewSuccess").classList.add("active");
      break;

    case STATES.FAIL:
      document.getElementById("viewFail").classList.add("active");
      break;
  }
}

function resetToIdle() {
  if (timerInterval) clearInterval(timerInterval);
  if (autoReturnTimeout) clearTimeout(autoReturnTimeout);
  document.body.classList.remove("panic-mode");
  currentParticipant = "";
  currentMission = null;
  passUsed = false;
  changeState(STATES.IDLE);
}

// ==========================================================================
// 5. 미션 뽑기 연출 로직 (Slot / Book Draw)
// ==========================================================================
function handleStartDraw() {
  const input = document.getElementById("participantInput");
  const name = input.value.trim() || `도전자 ${Math.floor(Math.random() * 900 + 100)}`;
  currentParticipant = name;
  passUsed = false;

  soundEngine.playClick();
  changeState(STATES.DRAWING);
  runDrawingAnimation();
}

function handlePassMission() {
  if (passUsed) return;
  passUsed = true;
  soundEngine.playClick();
  showToast("미션 재뽑기를 사용했습니다! (1회 한정)");
  changeState(STATES.DRAWING);
  runDrawingAnimation();
}

function runDrawingAnimation() {
  const slotEl = document.getElementById("slotText");
  const available = activeMissions.filter(m => m.active !== false);

  if (available.length === 0) {
    available.push(...CONFIG.DEFAULT_MISSIONS);
  }

  // 뽑힐 최종 미션 미리 선정
  const selected = available[Math.floor(Math.random() * available.length)];
  currentMission = selected;

  let speed = 50;
  let elapsed = 0;
  const totalDuration = 2200; // 2.2초 동안 롤링

  slotEl.classList.add("spinning");

  function spinReel() {
    const tempMission = available[Math.floor(Math.random() * available.length)];
    slotEl.textContent = tempMission.mission;
    soundEngine.playPageFlip();

    elapsed += speed;
    if (elapsed > totalDuration * 0.6) {
      speed += 30; // 감속
    }

    if (elapsed < totalDuration) {
      setTimeout(spinReel, speed);
    } else {
      // 멈춤 연출
      slotEl.classList.remove("spinning");
      slotEl.textContent = selected.mission;
      soundEngine.playDrawStop();

      setTimeout(() => {
        showMissionReadyView(selected);
      }, 700);
    }
  }

  spinReel();
}

function showMissionReadyView(mission) {
  document.getElementById("readyParticipantName").textContent = currentParticipant;
  document.getElementById("readyCategory").textContent = mission.category || "일반";
  document.getElementById("readyLevel").textContent = `난이도: ${mission.level || "중"}`;
  document.getElementById("readyMissionText").textContent = mission.mission;

  const passBtn = document.getElementById("btnPassMission");
  passBtn.style.display = passUsed ? "none" : "block";

  changeState(STATES.READY);
}

// ==========================================================================
// 6. 60초 타이머 진행 로직 (Timing Loop)
// ==========================================================================
function handleStartTimer() {
  soundEngine.playClick();
  changeState(STATES.TIMING);

  // 미니 배너 세팅
  document.getElementById("timerParticipant").textContent = `[${currentParticipant}]`;
  document.getElementById("timerMission").textContent = currentMission.mission;

  remainingSeconds = totalTimerSeconds;
  timerStartTime = Date.now();

  const totalDash = 1005.3; // 2 * PI * 160
  const gaugeEl = document.getElementById("timerGaugeProgress");
  const numberEl = document.getElementById("timerSecondsNumber");

  gaugeEl.style.strokeDashoffset = 0;
  gaugeEl.style.stroke = "var(--accent-emerald)";
  numberEl.textContent = remainingSeconds;

  if (timerInterval) clearInterval(timerInterval);

  let lastTickSecond = remainingSeconds;

  timerInterval = setInterval(() => {
    const elapsedMs = Date.now() - timerStartTime;
    const elapsedSec = elapsedMs / 1000;
    remainingSeconds = Math.max(0, totalTimerSeconds - elapsedSec);

    // 게이지 업데이트
    const progressRatio = remainingSeconds / totalTimerSeconds;
    const offset = totalDash * (1 - progressRatio);
    gaugeEl.style.strokeDashoffset = offset;

    const displayInt = Math.ceil(remainingSeconds);
    numberEl.textContent = displayInt;

    // 사운드 & 색상 & 긴장 모드 제어
    if (displayInt !== lastTickSecond && displayInt > 0) {
      lastTickSecond = displayInt;
      if (displayInt <= 10) {
        document.body.classList.add("panic-mode");
        gaugeEl.style.stroke = "var(--accent-rose)";
        soundEngine.playHeartbeat();
      } else if (displayInt <= 25) {
        gaugeEl.style.stroke = "var(--accent-gold)";
        soundEngine.playTick();
      } else {
        soundEngine.playTick();
      }
    }

    // 시간 초과 시 자동 실패 처리
    if (remainingSeconds <= 0) {
      clearInterval(timerInterval);
      handleVerdict(false);
    }
  }, 30);
}

// ==========================================================================
// 7. 판정 처리 및 결과 기록 (Verdict)
// ==========================================================================
async function handleVerdict(isClear) {
  if (timerInterval) clearInterval(timerInterval);
  document.body.classList.remove("panic-mode");

  const elapsedSeconds = parseFloat(((Date.now() - timerStartTime) / 1000).toFixed(1));
  const recordSeconds = isClear ? elapsedSeconds : totalTimerSeconds;

  if (isClear) {
    // 성공 연출
    changeState(STATES.SUCCESS);
    document.getElementById("clearParticipantName").textContent = currentParticipant;
    document.getElementById("clearMissionText").textContent = currentMission.mission;
    document.getElementById("clearElapsedSeconds").textContent = `${recordSeconds}초`;

    soundEngine.playClearFanfare();
    fireConfettiBurst();
  } else {
    // 실패 연출
    changeState(STATES.FAIL);
    document.getElementById("failParticipantName").textContent = currentParticipant;
    soundEngine.playFailExplosion();
  }

  // 서버 및 로컬에 결과 기록
  saveGameResult(currentParticipant, currentMission.mission, isClear ? "성공" : "실패", recordSeconds);

  // 5초 후 자동 대기 화면 복귀
  let autoCountdown = 5;
  const countEl = isClear ? document.getElementById("successAutoCount") : document.getElementById("failAutoCount");
  if (countEl) countEl.textContent = autoCountdown;

  const countInterval = setInterval(() => {
    autoCountdown--;
    if (countEl) countEl.textContent = autoCountdown;
    if (autoCountdown <= 0) {
      clearInterval(countInterval);
      resetToIdle();
    }
  }, 1000);
}

async function saveGameResult(name, mission, result, seconds) {
  const resultData = {
    name,
    mission,
    result,
    seconds,
    timestamp: new Date().toLocaleString()
  };

  // 1) 로컬 스토리지 업데이트
  if (result === "성공") {
    rankingsList.push({
      name,
      mission,
      seconds,
      clearedAt: new Date().toLocaleTimeString()
    });
    rankingsList.sort((a, b) => a.seconds - b.seconds);
    localStorage.setItem("challenge_rankings", JSON.stringify(rankingsList));
  }

  const existingLogs = JSON.parse(localStorage.getItem("challenge_gamelog") || "[]");
  existingLogs.unshift(resultData);
  localStorage.setItem("challenge_gamelog", JSON.stringify(existingLogs.slice(0, 100)));

  // 2) GAS Web App 전송 (온라인일 때)
  if (CONFIG.GAS_API_URL && CONFIG.GAS_API_URL.startsWith("http")) {
    try {
      await fetch(CONFIG.GAS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "submitResult",
          payload: { name, mission, result, seconds }
        })
      });
    } catch (err) {
      console.warn("GAS 결과 저장 실패 (로컬에만 저장됨):", err);
    }
  }
}

// ==========================================================================
// 8. 랭킹 렌더링
// ==========================================================================
function renderRankings() {
  const listEl = document.getElementById("idleRankList");
  if (!listEl) return;

  listEl.innerHTML = "";

  if (rankingsList.length === 0) {
    listEl.innerHTML = `<li style="grid-column: 1/-1; color: var(--text-muted); padding: 1.5rem 0;">아직 성공 기록이 없습니다. 1위의 주인공이 되어보세요! 🏆</li>`;
    return;
  }

  const topItems = rankingsList.slice(0, 6);
  topItems.forEach((item, idx) => {
    const li = document.createElement("li");
    li.className = `rank-item rank-${idx + 1}`;

    const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}위`;

    li.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem; overflow: hidden;">
        <span class="rank-badge">${medal}</span>
        <span class="rank-name" title="${item.name}">${item.name}</span>
      </div>
      <span class="rank-time">${item.seconds}초</span>
    `;
    listEl.appendChild(li);
  });
}

// ==========================================================================
// 9. 배경 파티클 & 축하 폭죽 캔버스 (Lightweight Visual Effects)
// ==========================================================================
function initBackgroundParticles() {
  const canvas = document.getElementById("bgCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  let w = (canvas.width = window.innerWidth);
  let h = (canvas.height = window.innerHeight);

  window.addEventListener("resize", () => {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  });

  const particles = [];
  for (let i = 0; i < 45; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      size: Math.random() * 2.5 + 0.8,
      speedY: -(Math.random() * 0.4 + 0.15),
      speedX: (Math.random() - 0.5) * 0.3,
      alpha: Math.random() * 0.6 + 0.2,
      pulseSpeed: Math.random() * 0.02 + 0.01
    });
  }

  function render() {
    ctx.clearRect(0, 0, w, h);
    particles.forEach(p => {
      p.y += p.speedY;
      p.x += p.speedX;
      p.alpha += Math.sin(Date.now() * p.pulseSpeed) * 0.005;

      if (p.y < 0) {
        p.y = h;
        p.x = Math.random() * w;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(245, 158, 11, ${Math.max(0.1, Math.min(0.8, p.alpha))})`;
      ctx.shadowBlur = 8;
      ctx.shadowColor = "#f59e0b";
      ctx.fill();
    });
    requestAnimationFrame(render);
  }

  render();
}

let confettiCtx = null;
let confettiParticles = [];
let confettiAnimationId = null;

function initConfettiCanvas() {
  const canvas = document.getElementById("confettiCanvas");
  if (!canvas) return;
  confettiCtx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });
}

function fireConfettiBurst() {
  if (!confettiCtx) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  confettiParticles = [];

  const colors = ["#ffd700", "#f59e0b", "#10b981", "#06b6d4", "#ec4899", "#8b5cf6", "#ffffff"];

  for (let i = 0; i < 160; i++) {
    confettiParticles.push({
      x: w * 0.5,
      y: h * 0.45,
      vx: (Math.random() - 0.5) * 22,
      vy: (Math.random() - 0.8) * 20,
      size: Math.random() * 9 + 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 12,
      alpha: 1
    });
  }

  if (confettiAnimationId) cancelAnimationFrame(confettiAnimationId);

  function renderConfetti() {
    confettiCtx.clearRect(0, 0, w, h);
    let activeCount = 0;

    confettiParticles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.4; // 중력
      p.vx *= 0.98;
      p.rotation += p.rotSpeed;
      p.alpha -= 0.008;

      if (p.alpha > 0) {
        activeCount++;
        confettiCtx.save();
        confettiCtx.translate(p.x, p.y);
        confettiCtx.rotate((p.rotation * Math.PI) / 180);
        confettiCtx.fillStyle = p.color;
        confettiCtx.globalAlpha = Math.max(0, p.alpha);
        confettiCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        confettiCtx.restore();
      }
    });

    if (activeCount > 0) {
      confettiAnimationId = requestAnimationFrame(renderConfetti);
    } else {
      confettiCtx.clearRect(0, 0, w, h);
    }
  }

  renderConfetti();
}

// ==========================================================================
// 10. 유틸리티 (Toast)
// ==========================================================================
function showToast(msg) {
  const toast = document.getElementById("toastMsg");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}
