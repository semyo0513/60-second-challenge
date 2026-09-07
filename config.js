/**
 * 60초 미션 클리어 챌린지 - 설정 파일
 * 
 * Google Apps Script Web App을 배포한 후 발급받은 웹 앱 URL(exec)을 아래 GAS_API_URL에 입력하세요.
 * URL이 비어있거나 기본값인 경우, 브라우저 로컬 저장소(localStorage)를 활용한
 * '오프라인/체험 모드'로 자동 동작하여 언제든 바로 테스트할 수 있습니다.
 */
const CONFIG = {
  // Google Apps Script Web App URL (배포 후 아래 따옴표 안에 URL 입력)
  GAS_API_URL: "https://script.google.com/macros/s/AKfycbycOu8otHg4-TuCU1T7JD_1f781gG_XUCklW94ZmMn3fw7TgOv-sd1QtRBu24C8nQVC-w/exec",

  // 기본 게임 설정값 (GAS 연동 전 또는 로컬 모드용 기본값)
  DEFAULT_SETTINGS: {
    eventTitle: "📚 60초 독서 미션 챌린지",
    subTitle: "책 속의 미션을 60초 안에 클리어하라!",
    timerSeconds: 60,
    adminPin: "1234",
    allowPass: true,
    autoReturnSeconds: 5,
    soundVolume: 0.8
  },

  // 로컬/오프라인 모드용 기본 추천 미션 20종
  DEFAULT_MISSIONS: [
    { id: "M001", mission: "책의 60페이지를 펼쳐 '사랑' 또는 '마음' 단어 3개 찾아 가리키기", category: "찾기", level: "중", active: true },
    { id: "M002", mission: "책 제목의 첫 글자로 3글자 이상 단어 5개 연속 말하기", category: "말하기", level: "하", active: true },
    { id: "M003", mission: "무작위로 펼친 페이지의 첫 문장을 감정을 듬뿍 담아 낭독하기", category: "낭독", level: "하", active: true },
    { id: "M004", mission: "책을 머리 위에 올리고 10초간 제자리에서 중심 잡기", category: "신체", level: "중", active: true },
    { id: "M005", mission: "책에 나오는 주인공/등장인물 이름 3명 10초 안에 외치기", category: "퀴즈", level: "하", active: true },
    { id: "M006", mission: "가장 최근에 읽은 책의 줄거리를 20초 이내로 흥미진진하게 설명하기", category: "말하기", level: "중", active: true },
    { id: "M007", mission: "표지에 파란색 또는 노란색이 들어간 책 3권 찾아오기", category: "찾기", level: "하", active: true },
    { id: "M008", mission: "책 속 문장 하나를 보고 몸짓(바디랭귀지)으로 표현하여 진행자가 맞히기", category: "신체", level: "상", active: true },
    { id: "M009", mission: "책 뒷표지의 추천사를 막힘없이 또박또박 15초 안에 읽기", category: "낭독", level: "중", active: true },
    { id: "M010", mission: "내가 가장 좋아하는 책의 명대사 또는 명문장 한 줄 적어 낭독하기", category: "말하기", level: "중", active: true },
    { id: "M011", mission: "두께가 300페이지 이상인 책 1권 찾아오기", category: "찾기", level: "하", active: true },
    { id: "M012", mission: "책 5권을 탑처럼 쓰러지지 않게 높이 쌓기", category: "신체", level: "중", active: true },
    { id: "M013", mission: "작가의 이름이 3글자인 국내 도서 3권 찾기", category: "찾기", level: "중", active: true },
    { id: "M014", mission: "책 표지만 보고 즉흥으로 상상 속 이야기 3줄 지어내기", category: "말하기", level: "상", active: true },
    { id: "M015", mission: "책갈피를 공중에 던져 책 사이에 끼우기 (3회 기회)", category: "신체", level: "상", active: true },
    { id: "M016", mission: "책 속 목차에서 숫자가 들어간 챕터 3개 찾아 읽기", category: "찾기", level: "하", active: true },
    { id: "M017", mission: "자음 퀴즈: 'ㅂ-ㄱ-ㅅ-ㅍ' (북스팟/독서관련 단어) 맞히기", category: "퀴즈", level: "하", active: true },
    { id: "M018", mission: "부스에 있는 친구/진행자에게 오늘 추천하고 싶은 책과 이유 말하기", category: "말하기", level: "중", active: true },
    { id: "M019", mission: "펼친 페이지의 글자 수 중 '다'로 끝나는 문장 3개 찾기", category: "찾기", level: "중", active: true },
    { id: "M020", mission: "도서관/서점 에티켓 3가지를 큰 소리로 외치기", category: "말하기", level: "하", active: true }
  ]
};
