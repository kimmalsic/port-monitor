# Port Monitor

세로 사이드바 형태로 상주하며 열린 포트를 **실시간으로 모니터링**하는 크로스플랫폼 Electron 앱.
Windows · macOS · Linux (+ WSL 배포판 통합) 지원.

<p align="center">
  <img src="docs/screenshots/main-dark.png" alt="Port Monitor — dark" width="280" />
  <img src="docs/screenshots/main-light.png" alt="Port Monitor — light" width="280" />
</p>

## 기능

- **실시간 포트 리스트** — 1Hz 폴링, LISTEN / ESTABLISHED / TIME_WAIT 등 전체 상태 추적
- **프로세스 정보** — PID, 프로세스명, 로컬 주소, 프로토콜 (tcp/tcp6/udp/udp6)
- **WSL 통합** — Windows 호스트 + WSL 배포판의 포트를 한 화면에서 (배포판 이름 배지)
- **프로세스 종료** — 클릭 한 번으로 `kill` / `kill -9`
- **외부 포트 테스트** — 방화벽·NAT 관통 여부 확인 (공개 체커 API)
- **실시간감 인디케이터**
  - 타이틀바 펄스 점 — 스캔 주기 시각화
  - 포트별 60초 스파크라인 — 활성 연결 추이
  - 상태 변화 플래시, 신규 포트 `NEW` 배지 (3초)
  - 연결 수 카운터 배지
- **사이드바 창 동작**
  - 4방향 코너 스냅 (왼/오른쪽 위·아래), 멀티모니터 대응
  - 크기 조절 자동 저장 (500ms 디바운스)
  - 전역 단축키 `Cmd/Ctrl+Shift+P` 로 토글
  - 트레이 상주 (Windows/Linux 알림영역, macOS 메뉴바)
- **테마** — 다크 / 라이트 전환 (CSS 변수 기반)
- **토스트 알림** — kill 성공·실패, 외부 테스트 결과 피드백

<p align="center">
  <img src="docs/screenshots/expanded-row.png" alt="확장 행" width="280" />
  <img src="docs/screenshots/settings-menu.png" alt="설정 메뉴" width="280" />
</p>

## 설치

### Windows

1. [Releases](https://github.com/kimmalsic/port-monitor/releases)에서 `Port Monitor-Setup-x.y.z.exe` 다운로드
2. 실행 → SmartScreen 경고 뜨면 **추가 정보 → 실행**
3. 설치 경로 선택, 옵션 체크 후 설치 완료
4. 트레이(작업표시줄 우하단) 아이콘 또는 `Ctrl+Shift+P`로 표시

**언인스톨**: 설정 → 앱 → Port Monitor → 제거. 사용자 데이터까지 자동 삭제.

### macOS

1. `Port Monitor-x.y.z-arm64.dmg` (Apple Silicon) 또는 `-x64.dmg` (Intel) 다운로드
2. dmg 마운트 → Applications로 드래그
3. 첫 실행 시 Gatekeeper 차단 → Finder에서 **우클릭 → 열기** 선택
4. 메뉴바 아이콘 클릭 또는 `Cmd+Shift+P`로 표시

> 공식 서명이 없으므로 SIP/Gatekeeper 경고가 뜹니다. Apple Developer ID로 서명하려면 아래 빌드 섹션 참고.

### Linux

**AppImage (권장, 배포판 독립)**:

```bash
chmod +x "Port Monitor-x.y.z-x86_64.AppImage"
./"Port Monitor-x.y.z-x86_64.AppImage"
```

**Debian/Ubuntu (.deb)**:

```bash
sudo apt install ./port-monitor_x.y.z_amd64.deb
```

> 한글 UI가 깨지면 CJK 폰트 설치: `sudo apt install -y fonts-noto-cjk`

## 직접 빌드

### 사전 준비

- Node.js 20+, npm
- 플랫폼별 타깃이 아닌 크로스 빌드 시 추가 도구 필요 (아래)

### 공통

```bash
git clone https://github.com/kimmalsic/port-monitor
cd port-monitor
npm install
```

### 개발 실행

```bash
npm run electron:dev
```

Vite 개발 서버 + Electron을 동시 구동. 렌더러는 HMR, 메인 프로세스는 수정 시 재시작 필요 (`Ctrl+C` 후 재실행).

### 현재 OS용 프로덕션 빌드

```bash
npm run electron:build
```

출력: `release/` 디렉터리에 인스톨러/앱 번들.

### Windows 빌드

**Windows에서**:

```bash
npm run electron:build:win
```

**Linux에서 (WSL 포함) 크로스빌드** — Wine 32비트 필요:

```bash
sudo dpkg --add-architecture i386
sudo apt update
sudo apt install -y wine wine32:i386
WINEPREFIX=$HOME/.wine WINEARCH=win32 wineboot -u   # 최초 1회
npm run electron:build:win
```

산출물: `release/Port Monitor-Setup-x.y.z.exe` (NSIS 인스톨러)

### macOS 빌드

```bash
npm run electron:build:mac
```

- **반드시 macOS에서 실행** (Linux/Windows에서 크로스빌드 불가 — Apple 툴체인 필요)
- 산출물: `release/Port Monitor-x.y.z-{x64,arm64}.dmg`
- 서명/노터라이제이션 (공개 배포용):
  ```bash
  export APPLE_ID="you@example.com"
  export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
  export APPLE_TEAM_ID="XXXXXXXXXX"
  export CSC_LINK="path/to/DeveloperID.p12"
  export CSC_KEY_PASSWORD="..."
  npm run electron:build:mac
  ```

### Linux 빌드

```bash
npm run electron:build:linux
```

산출물:
- `release/Port Monitor-x.y.z-x86_64.AppImage`
- `release/port-monitor_x.y.z_amd64.deb`

## 아키텍처

```
electron/
├── main.ts              # 창·트레이·단축키·IPC 오케스트레이션
├── preload.ts           # contextBridge IPC 브릿지 (esbuild 번들)
├── scanners/            # 플랫폼별 포트 수집
│   ├── linux.ts         # /proc/net/tcp,udp + /proc/[pid]/fd 파싱
│   ├── windows.ts       # PowerShell Get-NetTCPConnection
│   ├── wsl.ts           # wsl.exe -> ss -tulnpH
│   ├── mac.ts           # lsof -iTCP -iUDP -P -n -F pcnPT
│   └── index.ts         # 플랫폼 디스패처
├── killer.ts            # PID 기반 프로세스 종료 (host/WSL)
├── external-check.ts    # 외부 리치빌리티 테스트 (global fetch)
├── store.ts             # electron-store 설정 영속화
└── util.ts              # runCommand 헬퍼, WSL 검증

shared/
├── types.ts             # PortEntry · Settings · 공유 타입
└── ipc.ts               # IPC 채널 상수 (main ↔ preload)

src/                     # React 렌더러
├── App.tsx
├── store.ts             # zustand: ports · flash · history · toasts
└── components/          # TitleBar · FilterBar · PortList · PortRow · ...
```

**주요 기술**:
- Electron 30, React 18, TypeScript, Vite
- Tailwind CSS (CSS 변수 기반 테마)
- zustand (상태), react-window (가상화)
- electron-builder (NSIS / dmg / AppImage / deb)

## 단축키

| 동작 | 키 |
|---|---|
| 창 토글 (전역) | `Ctrl/Cmd+Shift+P` |
| 설정 메뉴 닫기 | `Esc` |

## 기여 / 피드백

이슈 또는 PR 환영합니다.

## 라이선스

MIT.
