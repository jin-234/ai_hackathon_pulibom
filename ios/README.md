# 풀이봄 학생용 아이패드 앱

학생은 이 앱으로 수업(과제 풀이)을 하고, 교사는 웹사이트(`/teacher`)를 그대로 씁니다.
앱은 풀이봄 웹의 학생 화면을 띄우는 SwiftUI 껍데기라서, `app/` 의 학생 화면을 고치면 앱에도 바로 반영돼요.

## 실행

1. 맥에서 서버 켜기: `cd app && npm run dev`
2. `ios/Pulibom.xcodeproj` 를 Xcode 로 열기
3. 실제 아이패드: 케이블 연결 → 상단에서 기기 선택 → Signing & Capabilities 에서 Team 에 내 Apple ID 선택 → ▶︎
   - 처음 설치하면 아이패드 설정 → 일반 → VPN 및 기기 관리 에서 개발자 앱 신뢰
   - 아이패드에서 설정 → 개인정보 보호 → 개발자 모드 켜기 (요청 시)
4. 앱 첫 화면에 서버 주소 입력: `맥 IP:3000` (예: `192.168.50.91:3000`)
   - 맥 IP: `ipconfig getifaddr en0`
   - 처음에 '로컬 네트워크' 허용 팝업 → 허용

시뮬레이터에서는 서버 주소를 `localhost:3000` 으로 넣으면 됩니다.

## 앱이 하는 일

| 기능 | 설명 |
|---|---|
| 학생 로그인 | 앱을 켤 때마다 웹과 같은 학생 로그인(반 → 번호 선택 + 비밀번호 4자리) (`LoginView.swift`, 명단은 `/api/roster`). 아이패드를 돌려 써도 누가 풀었는지 남음. 웹에서 로그아웃하면 이 화면으로 돌아옴. "반 코드로 회원가입"으로 새 학생 가입도 가능 |
| 앱 상단 바 | 로그인 뒤 웹 상단 바(로고·과제 목록·이름·로그아웃, `data-app-hide`)는 숨기고 앱 상단 바를 씀: 과제 목록에선 풀이봄 로고, 문제 푸는 중엔 "← 과제 목록", 오른쪽 학생 이름 → 메뉴(서버 주소·로그아웃) |
| 학생 화면만 | 웹뷰 User-Agent 에 `PulibomApp` 을 붙이고, 웹(`app/src/middleware.ts`, 로그인 화면)이 이를 보고 첫 화면·교사 화면 대신 학생 로그인으로 보냄 |
| 애플펜슬 | 펜슬을 쓰기 시작하면 손가락·손바닥 터치는 필기에서 무시 (`InkCanvas.tsx`) |
| 필기 중 화면 고정 | 확대, 길게 눌러 선택·메뉴 막기 |
| 팝업 | 제출 확인 등 `alert`/`confirm` 을 iOS 팝업으로 |
| 화면 꺼짐 방지 | 앱이 켜져 있는 동안 자동 잠금 안 함 |
| 새로고침 | 화면을 아래로 당기기 |
| 서버 주소 바꾸기 | 세 손가락으로 1초 길게 누르기, 또는 연결 실패 화면의 버튼 |

## 파일

```
ios/
├── Pulibom.xcodeproj
├── Info.plist                 ← http 접속 허용, 로컬 네트워크 권한 문구, 앱 이름(풀이봄)
└── Pulibom/                   ← 이 폴더에 파일을 넣으면 Xcode 에 자동으로 포함됨
    ├── PulibomApp.swift       ← 앱 시작, 색
    ├── ContentView.swift      ← 서버 주소 없으면 설정 화면, 있으면 웹뷰 / 연결 실패 화면
    ├── LoginView.swift        ← 학생 로그인 (가로: 왼쪽 병아리 / 오른쪽 입력)
    ├── SignupView.swift       ← 반 코드로 학생 회원가입 시트
    ├── StudentShellView.swift ← 로그인 뒤: 앱 상단 바 + 웹 학생 화면
    ├── DesignKit.swift        ← 공통 모양 (묶음 칸, 큰 버튼, 알림, 색)
    ├── PulibomAPI.swift       ← 명단·로그인 API, 로그인 쿠키를 웹뷰에 넘김
    ├── ServerSettingsView.swift
    ├── StudentWebView.swift   ← WKWebView 설정
    └── Assets.xcassets        ← 앱 아이콘(병아리)
```
