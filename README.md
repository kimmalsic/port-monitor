# Port Monitor

세로 사이드바 형태로 상주하며 열려 있는 포트를 실시간 모니터링하는 Electron 앱.
Windows(로컬 + WSL 통합), Linux, macOS 지원.

## 주요 기능

- 전체 포트 실시간 리스트 (기본 1s 폴링, 숨김 시 자동 정지)
- LISTEN / ESTABLISHED 등 상태, PID, 프로세스명, WSL 배포판 표시
- 포트 kill / force kill
- 외부 포트 접근성 테스트 (방화벽/NAT 관통 확인)
- 글로벌 단축키로 숨김 토글 (기본 `Ctrl+Shift+P`)
- 화면 좌/우 가장자리 스냅, 크기 조정 시 500ms 디바운스로 저장
- 트레이 상주 — 창 닫기는 종료가 아님. 종료는 트레이 메뉴에서만.
- NSIS 클린 언인스톨 (사용자 데이터, 레지스트리, 단축키 제거)

## 개발

```bash
npm install
npm run electron:dev
```

## 빌드

```bash
npm run electron:build:win     # Windows NSIS installer
npm run electron:build:linux   # AppImage + deb
npm run electron:build:mac     # dmg
```

빌드 아티팩트는 `release/`에 생성됩니다.

## 아키텍처

- `electron/main.ts` — 창/트레이/단축키/폴링 오케스트레이션
- `electron/scanners/` — 플랫폼별 포트 수집 (linux `/proc/net/tcp`, windows `Get-NetTCPConnection`, wsl `wsl.exe -> ss`)
- `electron/killer.ts` — PID 기반 프로세스 종료
- `electron/external-check.ts` — 외부 포트 리치빌리티 테스트
- `electron/store.ts` — electron-store 설정 영속화
- `src/` — React 렌더러 (zustand + react-window)
```
