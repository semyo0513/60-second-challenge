/**
 * 60초 미션 클리어 챌린지 - Google Apps Script 백엔드 (Code.gs)
 * 
 * [주요 기능]
 * 1. 스프레드시트 4종(Missions, Rankings, GameLog, Settings) 자동 초기화 및 유연한 시트 연동
 * 2. 관리자 웹 화면 및 구글 시트 직접 편집 양방향 지원 (스마트 파싱 및 기본값 보정)
 * 3. GET/POST 요청 액션 기반 분기 라우팅
 * 4. LockService를 통한 동시성 쓰기 정합성 보장
 * 5. 관리자 PIN 검증
 */

const SHEET_NAMES = {
  MISSIONS: "Missions",
  RANKINGS: "Rankings",
  GAME_LOG: "GameLog",
  SETTINGS: "Settings"
};

const DEFAULT_SETTINGS_MAP = {
  "이벤트명": "📚 60초 독서 미션 챌린지",
  "서브타이틀": "책 속의 미션을 60초 안에 클리어하라!",
  "타이머초": "60",
  "관리자PIN": "1234",
  "재도전허용": "TRUE",
  "자동복귀초": "5",
  "사운드볼륨": "80"
};

const SAMPLE_MISSIONS = [
  ["M001", "책의 60페이지를 펼쳐 '사랑' 또는 '마음' 단어 3개 찾아 가리키기", "찾기", "중", "TRUE", new Date().toISOString()],
  ["M002", "책 제목의 첫 글자로 3글자 이상 단어 5개 연속 말하기", "말하기", "하", "TRUE", new Date().toISOString()],
  ["M003", "무작위로 펼친 페이지의 첫 문장을 감정을 듬뿍 담아 낭독하기", "낭독", "하", "TRUE", new Date().toISOString()],
  ["M004", "책을 머리 위에 올리고 10초간 제자리에서 중심 잡기", "신체", "중", "TRUE", new Date().toISOString()],
  ["M005", "책에 나오는 주인공/등장인물 이름 3명 10초 안에 외치기", "퀴즈", "하", "TRUE", new Date().toISOString()],
  ["M006", "가장 최근에 읽은 책의 줄거리를 20초 이내로 흥미진진하게 설명하기", "말하기", "중", "TRUE", new Date().toISOString()],
  ["M007", "표지에 파란색 또는 노란색이 들어간 책 3권 찾아오기", "찾기", "하", "TRUE", new Date().toISOString()],
  ["M008", "책 속 문장 하나를 보고 몸짓(바디랭귀지)으로 표현하여 진행자가 맞히기", "신체", "상", "TRUE", new Date().toISOString()],
  ["M009", "책 뒷표지의 추천사를 막힘없이 또박또박 15초 안에 읽기", "낭독", "중", "TRUE", new Date().toISOString()],
  ["M010", "내가 가장 좋아하는 책의 명대사 또는 명문장 한 줄 적어 낭독하기", "말하기", "중", "TRUE", new Date().toISOString()],
  ["M011", "두께가 300페이지 이상인 책 1권 찾아오기", "찾기", "하", "TRUE", new Date().toISOString()],
  ["M012", "책 5권을 탑처럼 쓰러지지 않게 높이 쌓기", "신체", "중", "TRUE", new Date().toISOString()],
  ["M013", "작가의 이름이 3글자인 국내 도서 3권 찾기", "찾기", "중", "TRUE", new Date().toISOString()],
  ["M014", "책 표지만 보고 즉흥으로 상상 속 이야기 3줄 지어내기", "말하기", "상", "TRUE", new Date().toISOString()],
  ["M015", "책갈피를 공중에 던져 책 사이에 끼우기 (3회 기회)", "신체", "상", "TRUE", new Date().toISOString()],
  ["M016", "책 속 목차에서 숫자가 들어간 챕터 3개 찾아 읽기", "찾기", "하", "TRUE", new Date().toISOString()],
  ["M017", "자음 퀴즈: 'ㅂ-ㄱ-ㅅ-ㅍ' (북스팟/독서관련 단어) 맞히기", "퀴즈", "하", "TRUE", new Date().toISOString()],
  ["M018", "부스에 있는 친구/진행자에게 오늘 추천하고 싶은 책과 이유 말하기", "말하기", "중", "TRUE", new Date().toISOString()],
  ["M019", "펼친 페이지의 글자 수 중 '다'로 끝나는 문장 3개 찾기", "찾기", "중", "TRUE", new Date().toISOString()],
  ["M020", "도서관/서점 에티켓 3가지를 큰 소리로 외치기", "말하기", "하", "TRUE", new Date().toISOString()]
];

// --- 1. GET 요청 핸들러 ---
function doGet(e) {
  try {
    ensureDatabaseInitialized();
    const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "getMissions";

    switch (action) {
      case "getMissions":
        return jsonResponse(getMissionsHandler(false));
      case "getAllMissions":
        return jsonResponse(getMissionsHandler(true));
      case "getRanking":
        const limit = e.parameter.limit ? parseInt(e.parameter.limit) : 50;
        return jsonResponse(getRankingHandler(limit));
      case "getSettings":
        return jsonResponse(getSettingsHandler());
      case "getGameLogs":
        return jsonResponse(getGameLogsHandler(100));
      default:
        return jsonResponse({ success: false, message: "알 수 없는 GET 액션입니다: " + action });
    }
  } catch (error) {
    return jsonResponse({ success: false, error: error.toString() });
  }
}

// --- 2. POST 요청 핸들러 ---
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    // 동시 쓰기 잠금 대기 (최대 10초)
    lock.waitLock(10000);
    ensureDatabaseInitialized();

    let data = {};
    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (pe) {
        data = e.parameter || {};
      }
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    const action = data.action;
    const payload = data.payload || data;

    switch (action) {
      case "submitResult":
        return jsonResponse(submitResultHandler(payload));

      case "verifyPin":
        return jsonResponse(verifyPinHandler(payload.pin));

      case "addMission":
        if (!checkAdminPin(payload.pin)) return jsonResponse({ success: false, message: "관리자 PIN이 일치하지 않습니다." });
        return jsonResponse(addMissionHandler(payload));

      case "updateMission":
        if (!checkAdminPin(payload.pin)) return jsonResponse({ success: false, message: "관리자 PIN이 일치하지 않습니다." });
        return jsonResponse(updateMissionHandler(payload));

      case "deleteMission":
        if (!checkAdminPin(payload.pin)) return jsonResponse({ success: false, message: "관리자 PIN이 일치하지 않습니다." });
        return jsonResponse(deleteMissionHandler(payload.id));

      case "batchAddMissions":
        if (!checkAdminPin(payload.pin)) return jsonResponse({ success: false, message: "관리자 PIN이 일치하지 않습니다." });
        return jsonResponse(batchAddMissionsHandler(payload.missions));

      case "resetRanking":
        if (!checkAdminPin(payload.pin)) return jsonResponse({ success: false, message: "관리자 PIN이 일치하지 않습니다." });
        return jsonResponse(resetRankingHandler());

      case "deleteRankingItem":
        if (!checkAdminPin(payload.pin)) return jsonResponse({ success: false, message: "관리자 PIN이 일치하지 않습니다." });
        return jsonResponse(deleteRankingItemHandler(payload.rowId));

      case "updateSettings":
        if (!checkAdminPin(payload.pin)) return jsonResponse({ success: false, message: "관리자 PIN이 일치하지 않습니다." });
        return jsonResponse(updateSettingsHandler(payload.settings));

      case "resetGameLog":
        if (!checkAdminPin(payload.pin)) return jsonResponse({ success: false, message: "관리자 PIN이 일치하지 않습니다." });
        return jsonResponse(resetGameLogHandler());

      default:
        return jsonResponse({ success: false, message: "알 수 없는 POST 액션입니다: " + action });
    }
  } catch (error) {
    return jsonResponse({ success: false, error: error.toString() });
  } finally {
    try {
      lock.releaseLock();
    } catch (ignore) {}
  }
}

// --- 3. 데이터베이스 자동 초기화 ---
function ensureDatabaseInitialized() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1) Missions 시트
  let missionsSheet = ss.getSheetByName(SHEET_NAMES.MISSIONS);
  if (!missionsSheet) {
    missionsSheet = ss.insertSheet(SHEET_NAMES.MISSIONS);
    missionsSheet.appendRow(["ID", "미션내용", "카테고리", "난이도", "사용여부", "등록일시"]);
    missionsSheet.getRange("A1:F1").setFontWeight("bold").setBackground("#E2E8F0");
    missionsSheet.setFrozenRows(1);
    SAMPLE_MISSIONS.forEach(row => missionsSheet.appendRow(row));
  }

  // 2) Rankings 시트
  let rankingsSheet = ss.getSheetByName(SHEET_NAMES.RANKINGS);
  if (!rankingsSheet) {
    rankingsSheet = ss.insertSheet(SHEET_NAMES.RANKINGS);
    rankingsSheet.appendRow(["순번", "참가자명", "미션내용", "소요시간(초)", "클리어일시"]);
    rankingsSheet.getRange("A1:E1").setFontWeight("bold").setBackground("#FEF08A");
    rankingsSheet.setFrozenRows(1);
  }

  // 3) GameLog 시트
  let gameLogSheet = ss.getSheetByName(SHEET_NAMES.GAME_LOG);
  if (!gameLogSheet) {
    gameLogSheet = ss.insertSheet(SHEET_NAMES.GAME_LOG);
    gameLogSheet.appendRow(["순번", "참가자명", "미션내용", "결과", "소요시간(초)", "시도일시"]);
    gameLogSheet.getRange("A1:F1").setFontWeight("bold").setBackground("#E0E7FF");
    gameLogSheet.setFrozenRows(1);
  }

  // 4) Settings 시트
  let settingsSheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet(SHEET_NAMES.SETTINGS);
    settingsSheet.appendRow(["항목", "값", "설명"]);
    settingsSheet.getRange("A1:C1").setFontWeight("bold").setBackground("#DCFCE7");
    settingsSheet.setFrozenRows(1);
    Object.keys(DEFAULT_SETTINGS_MAP).forEach(key => {
      settingsSheet.appendRow([key, DEFAULT_SETTINGS_MAP[key], getSettingDescription(key)]);
    });
  }
}

function getSettingDescription(key) {
  const descMap = {
    "이벤트명": "부스 화면 및 헤더에 표시되는 메인 제목",
    "서브타이틀": "대기 화면에 표시되는 부제목",
    "타이머초": "미션 제한 시간 (초 단위 숫자, 기본: 60)",
    "관리자PIN": "관리자 화면 접속 및 설정 변경용 PIN (기본: 1234)",
    "재도전허용": "미션 1회 재뽑기(Pass) 허용 여부 (TRUE / FALSE)",
    "자동복귀초": "결과 화면 노출 후 대기화면으로 자동 복귀할 시간(초)",
    "사운드볼륨": "기본 사운드 볼륨 (0 ~ 100)"
  };
  return descMap[key] || "";
}

// --- 4. 액션 처리 핸들러들 ---

// 미션 목록 조회 (구글 시트에서 직접 수정한 데이터도 스마트하게 파싱)
function getMissionsHandler(includeInactive) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.MISSIONS);
  if (!sheet) return { success: true, missions: [] };

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { success: true, missions: [] };

  const missions = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const mission = String(row[1] !== undefined && row[1] !== null ? row[1] : "").trim();
    if (!mission) continue; // 미션 내용이 비어있는 빈 행은 건너뜀

    // ID가 비어있으면 행 번호 기반 자동 부여
    let id = String(row[0] !== undefined && row[0] !== null ? row[0] : "").trim();
    if (!id) {
      id = "M" + String(i).padStart(3, "0");
    }

    const category = String(row[2] || "일반").trim() || "일반";
    const level = String(row[3] || "중").trim() || "중";

    // 사용여부 스마트 파싱:
    // 빈칸이거나 TRUE/Y/O/사용 등 -> true
    // FALSE/N/X/0/비활성/미사용 등 -> false
    const rawActive = String(row[4] !== undefined && row[4] !== null ? row[4] : "").trim().toUpperCase();
    let active = true;
    if (rawActive === "FALSE" || rawActive === "N" || rawActive === "X" || rawActive === "0" || rawActive === "비활성" || rawActive === "미사용" || row[4] === false) {
      active = false;
    }

    const createdAt = row[5] ? String(row[5]) : "";

    if (includeInactive || active) {
      missions.push({ id, mission, category, level, active, createdAt, rowIndex: i + 1 });
    }
  }

  return { success: true, missions: missions };
}

// 랭킹 조회 (소요시간 오름차순 정렬)
function getRankingHandler(limit) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.RANKINGS);
  if (!sheet) return { success: true, rankings: [] };

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { success: true, rankings: [] };

  const items = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowId = i + 1; // 시트 상 실제 행 번호
    const name = String(row[1] || "").trim();
    const mission = String(row[2] || "").trim();
    const seconds = parseFloat(row[3]) || 0;
    const clearedAt = row[4] ? String(row[4]) : "";

    if (name) {
      items.push({ rowId, name, mission, seconds, clearedAt });
    }
  }

  // 소요시간 오름차순 (빠른 순서대로)
  items.sort((a, b) => a.seconds - b.seconds);

  const rankings = items.slice(0, limit).map((item, index) => ({
    rank: index + 1,
    rowId: item.rowId,
    name: item.name,
    mission: item.mission,
    seconds: item.seconds,
    clearedAt: item.clearedAt
  }));

  return { success: true, rankings: rankings };
}

// 설정값 조회 (구글 시트의 다양한 키 명칭 및 한글/영문 별칭 유연하게 지원)
function getSettingsHandler() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  const settingsRaw = {};

  if (sheet) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const k = String(data[i][0] || "").trim();
      const v = String(data[i][1] !== undefined && data[i][1] !== null ? data[i][1] : "").trim();
      if (k) settingsRaw[k.toLowerCase()] = v;
    }
  }

  // 별칭 매핑 헬퍼
  function findVal(keys, fallback) {
    for (let j = 0; j < keys.length; j++) {
      const key = keys[j].toLowerCase();
      if (settingsRaw[key] !== undefined && settingsRaw[key] !== "") {
        return settingsRaw[key];
      }
    }
    return fallback;
  }

  const eventTitle = findVal(["이벤트명", "eventtitle", "title", "이벤트제목"], DEFAULT_SETTINGS_MAP["이벤트명"]);
  const subTitle = findVal(["서브타이틀", "subtitle", "부제목", "설명"], DEFAULT_SETTINGS_MAP["서브타이틀"]);
  const timerSeconds = parseInt(findVal(["타이머초", "timerseconds", "타이머", "제한시간", "초"], DEFAULT_SETTINGS_MAP["타이머초"])) || 60;
  const adminPin = findVal(["관리자pin", "adminpin", "pin", "비밀번호", "패스워드"], DEFAULT_SETTINGS_MAP["관리자PIN"]);
  
  const rawPass = findVal(["재도전허용", "allowpass", "재뽑기허용", "패스허용"], DEFAULT_SETTINGS_MAP["재도전허용"]).toUpperCase();
  const allowPass = !(rawPass === "FALSE" || rawPass === "N" || rawPass === "X" || rawPass === "0" || rawPass === "미사용");
  
  const autoReturnSeconds = parseInt(findVal(["자동복귀초", "autoreturnseconds", "자동복귀", "복귀초"], DEFAULT_SETTINGS_MAP["자동복귀초"])) || 5;
  const soundVolume = parseInt(findVal(["사운드볼륨", "soundvolume", "볼륨"], DEFAULT_SETTINGS_MAP["사운드볼륨"])) || 80;

  return {
    success: true,
    settings: {
      eventTitle,
      subTitle,
      timerSeconds,
      adminPin,
      allowPass,
      autoReturnSeconds,
      soundVolume
    }
  };
}

// 게임 로그 조회
function getGameLogsHandler(limit) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.GAME_LOG);
  if (!sheet) return { success: true, logs: [] };

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { success: true, logs: [] };

  const logs = [];
  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    if (!row[1] && !row[2]) continue;
    logs.push({
      id: row[0],
      name: row[1],
      mission: row[2],
      result: row[3],
      seconds: row[4],
      timestamp: row[5]
    });
    if (logs.length >= limit) break;
  }

  return { success: true, logs: logs };
}

// 결과 제출 (성공/실패 기록)
function submitResultHandler(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const name = String(payload.name || "익명").trim();
  const mission = String(payload.mission || "").trim();
  const result = String(payload.result || "성공").trim(); // '성공' or '실패'
  const seconds = parseFloat(payload.seconds) || 0;
  const nowStr = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");

  // 1) GameLog에 무조건 추가
  const logSheet = ss.getSheetByName(SHEET_NAMES.GAME_LOG);
  const nextLogId = Math.max(1, logSheet.getLastRow());
  logSheet.appendRow([nextLogId, name, mission, result, seconds, nowStr]);

  // 2) 성공인 경우 Rankings에도 추가
  if (result === "성공") {
    const rankSheet = ss.getSheetByName(SHEET_NAMES.RANKINGS);
    const nextRankId = Math.max(1, rankSheet.getLastRow());
    rankSheet.appendRow([nextRankId, name, mission, seconds, nowStr]);
  }

  return { success: true, message: "결과가 안전하게 기록되었습니다." };
}

// 관리자 PIN 확인
function checkAdminPin(inputPin) {
  const settingsObj = getSettingsHandler();
  const savedPin = settingsObj.settings.adminPin || "1234";
  return String(inputPin).trim() === String(savedPin).trim();
}

function verifyPinHandler(pin) {
  const isValid = checkAdminPin(pin);
  return { success: isValid, message: isValid ? "인증 성공" : "PIN 번호가 일치하지 않습니다." };
}

// 미션 추가
function addMissionHandler(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.MISSIONS);
  const mission = String(payload.mission || "").trim();
  const category = String(payload.category || "일반").trim();
  const level = String(payload.level || "중").trim();
  const active = payload.active !== false ? "TRUE" : "FALSE";
  const id = payload.id || ("M" + Utilities.formatDate(new Date(), "Asia/Seoul", "yyMMddHHmmss"));
  const nowStr = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");

  if (!mission) return { success: false, message: "미션 내용을 입력해주세요." };

  sheet.appendRow([id, mission, category, level, active, nowStr]);
  return { success: true, message: "미션이 등록되었습니다.", id: id };
}

// 미션 수정 (내용, 카테고리, 난이도, 사용여부)
function updateMissionHandler(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.MISSIONS);
  const id = String(payload.id).trim();
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === id || (payload.rowIndex && (i + 1) === parseInt(payload.rowIndex))) {
      const row = i + 1;
      if (payload.mission !== undefined) sheet.getRange(row, 2).setValue(String(payload.mission).trim());
      if (payload.category !== undefined) sheet.getRange(row, 3).setValue(String(payload.category).trim());
      if (payload.level !== undefined) sheet.getRange(row, 4).setValue(String(payload.level).trim());
      if (payload.active !== undefined) sheet.getRange(row, 5).setValue(payload.active ? "TRUE" : "FALSE");
      return { success: true, message: "미션이 수정되었습니다." };
    }
  }

  return { success: false, message: "해당 ID의 미션을 찾을 수 없습니다: " + id };
}

// 미션 삭제
function deleteMissionHandler(id) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.MISSIONS);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(id).trim()) {
      sheet.deleteRow(i + 1);
      return { success: true, message: "미션이 삭제되었습니다." };
    }
  }

  return { success: false, message: "삭제할 미션을 찾을 수 없습니다." };
}

// 여러 미션 일괄 추가
function batchAddMissionsHandler(missions) {
  if (!Array.isArray(missions) || missions.length === 0) {
    return { success: false, message: "추가할 미션 목록이 비어있습니다." };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.MISSIONS);
  const nowStr = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");

  missions.forEach((m, idx) => {
    const id = m.id || ("M" + Utilities.formatDate(new Date(), "Asia/Seoul", "yyMMddHHmmss") + "_" + idx);
    const mission = String(m.mission || "").trim();
    const category = String(m.category || "일반").trim();
    const level = String(m.level || "중").trim();
    const active = m.active !== false ? "TRUE" : "FALSE";
    if (mission) {
      sheet.appendRow([id, mission, category, level, active, nowStr]);
    }
  });

  return { success: true, message: missions.length + "개의 미션이 추가되었습니다." };
}

// 랭킹 전체 초기화
function resetRankingHandler() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.RANKINGS);
  if (sheet) {
    sheet.clear();
    sheet.appendRow(["순번", "참가자명", "미션내용", "소요시간(초)", "클리어일시"]);
    sheet.getRange("A1:E1").setFontWeight("bold").setBackground("#FEF08A");
    sheet.setFrozenRows(1);
  }
  return { success: true, message: "랭킹보드가 초기화되었습니다." };
}

// 랭킹 특정 항목 삭제
function deleteRankingItemHandler(rowId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.RANKINGS);
  const targetRow = parseInt(rowId);
  if (sheet && targetRow > 1 && targetRow <= sheet.getLastRow()) {
    sheet.deleteRow(targetRow);
    return { success: true, message: "랭킹 기록이 삭제되었습니다." };
  }
  return { success: false, message: "유효하지 않은 행 번호입니다." };
}

// 설정값 일괄 저장 (Settings 시트에 기존 구조 유지하며 스마트 업데이트)
function updateSettingsHandler(newSettings) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAMES.SETTINGS);
  }

  const map = {
    "이벤트명": newSettings.eventTitle !== undefined ? newSettings.eventTitle : DEFAULT_SETTINGS_MAP["이벤트명"],
    "서브타이틀": newSettings.subTitle !== undefined ? newSettings.subTitle : DEFAULT_SETTINGS_MAP["서브타이틀"],
    "타이머초": String(newSettings.timerSeconds || 60),
    "관리자PIN": String(newSettings.adminPin || "1234"),
    "재도전허용": newSettings.allowPass ? "TRUE" : "FALSE",
    "자동복귀초": String(newSettings.autoReturnSeconds || 5),
    "사운드볼륨": String(newSettings.soundVolume || 80)
  };

  sheet.clear();
  sheet.appendRow(["항목", "값", "설명"]);
  sheet.getRange("A1:C1").setFontWeight("bold").setBackground("#DCFCE7");
  sheet.setFrozenRows(1);

  Object.keys(map).forEach(key => {
    sheet.appendRow([key, map[key], getSettingDescription(key)]);
  });

  return { success: true, message: "설정이 성공적으로 저장되었습니다." };
}

// 전체 로그 초기화
function resetGameLogHandler() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.GAME_LOG);
  if (sheet) {
    sheet.clear();
    sheet.appendRow(["순번", "참가자명", "미션내용", "결과", "소요시간(초)", "시도일시"]);
    sheet.getRange("A1:F1").setFontWeight("bold").setBackground("#E0E7FF");
    sheet.setFrozenRows(1);
  }
  return { success: true, message: "게임 로그가 초기화되었습니다." };
}

// --- 5. JSON 응답 유틸리티 ---
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
