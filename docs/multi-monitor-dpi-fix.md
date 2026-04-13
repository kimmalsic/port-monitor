# 멀티모니터 창 크기 축소 이슈와 해결

Electron 앱을 스케일이 다른 서브 모니터에서 사용하다 `hide()→show()` 하거나
종료 후 재시작하면 창이 축소되는 현상의 원인과 현재 적용한 해결책을 기록한다.

관련 Electron 이슈:
[#10862](https://github.com/electron/electron/issues/10862),
[#29605](https://github.com/electron/electron/issues/29605),
[PR #10972](https://github.com/electron/electron/pull/10972).
공식 수정은 없고, 애플리케이션 측 워크어라운드가 필요하다.

---

## 배경: DIP와 물리 픽셀

- **DIP (Device-Independent Pixel)**: 애플리케이션이 보는 논리 단위.
- **물리 픽셀**: 실제 모니터 픽셀.
- **Scale factor**: `physical = DIP × scale`.
  - 100% 모니터 = 1.0
  - 125% 모니터 = 1.25
  - 150% 모니터 = 1.5

Electron의 `BrowserWindow.getBounds()` / `setBounds()` 는 기본적으로 **DIP**
단위로 동작한다. 단, DIP는 "어느 디스플레이에서의 DIP인가"에 따라 같은 숫자가
다른 물리 픽셀을 의미한다.

---

## 증상

환경 가정: 메인 모니터 100%, 서브 모니터 125%.

1. 창을 서브 모니터로 이동 후 크기 조정
2. `×` 버튼(hide) 또는 트레이 메뉴 종료(quit)
3. 단축키/재실행으로 다시 표시
4. **창이 정확히 20% 축소되어 나타남** (`1.0 / 1.25 = 0.8`)

스케일이 더 크게 차이나면(100% ↔ 150%) 축소 폭도 더 커진다.

---

## 원인 분석

### 저장 시점

- 창이 서브 모니터에 있는 상태에서 `win.getBounds()` 호출
- Electron이 DIP로 반환: 예를 들어 `{ x: 2000, y: 500, width: 280, height: 700 }`
- 이 DIP 값을 그대로 `electron-store`에 저장 (초기 구현)

이 저장 방식의 문제: `280` DIP가 **어느 모니터의 280이냐**에 따라 물리 픽셀이
달라진다는 맥락이 같이 저장되지 않는다.

### 재시작 시점 (버그 발동)

```js
new BrowserWindow({ x: 2000, y: 500, width: 280, height: 700 })
```

Windows에서 Electron의 per-monitor DPI awareness 구현 버그:

1. BrowserWindow 생성자가 호출되는 순간 창은 **아직 어떤 디스플레이에도 속하지
   않은 상태**다. 순수한 window handle 만 존재.
2. Electron은 생성자 인자(DIP)를 내부적으로 물리 픽셀로 변환할 때
   **primary 디스플레이의 scale factor**를 쓴다.
   - `physical_width = 280 × 1.0 = 280`
3. Windows가 `(2000, 500)` 좌표를 서브 모니터 영역으로 판정하고 창을 배치.
4. 서브 모니터는 125% 스케일이므로 창을 "이 창은 280 물리 픽셀짜리"로 인식.
5. 서브 모니터 기준으로 DIP 역변환 시 `280 / 1.25 = 224` DIP.
6. 결과: 원래 280 DIP 로 보였던 창이 **224 DIP 크기로 표시** → 20% 축소.

### 핵심 원리 요약

> **아직 어느 디스플레이에도 속하지 않은 BrowserWindow에 bounds를 주면 안 된다.**

생성 시점의 DPI 계산과 배치 후 실제 디스플레이의 DPI가 다를 때 버그가 발생.

---

## 해결책

네 가지 장치를 조합해서 해결한다.

### 1. 물리 픽셀로 저장

```ts
// 저장 시 DIP → 물리 픽셀
const dipBounds = win.getBounds();
const stored = screen.dipToScreenRect(win, dipBounds);
electronStore.set('window', stored);
```

물리 픽셀은 디스플레이 상태와 무관한 **절대 좌표**.
서브 모니터 기준 `{280, 700}` DIP는 `{350, 875}` 물리 픽셀로 저장.

### 2. 생성자에 bounds를 주지 않음

```ts
const win = new BrowserWindow({
  width: 280,       // 안전한 기본값
  height: 700,
  // x, y 없음 — primary 디스플레이에 자동 배치
  show: false,      // ready-to-show 전까지 숨김
  ...
});
```

창을 **primary 디스플레이에 기본 크기로 먼저 만든다**. 이 시점에선 cross-monitor
DPI 혼동이 없다.

### 3. `ready-to-show` 이후에 bounds 적용

```ts
win.once('ready-to-show', () => {
  applyStoredBounds();
  if (!startHidden) win.show();
});
```

`ready-to-show` 는 창 객체가 완전히 초기화된 후 발화되는 이벤트. 이 시점엔
창이 primary 디스플레이에 실제로 존재하므로 setBounds가 안전하다.

### 4. 2단계 setBounds

```ts
function applyStoredBounds() {
  const stored = electronStore.get('window'); // 물리 픽셀
  const targetDip = screen.screenToDipRect(null, stored);
  //  └─ rect가 위치한 디스플레이(= 서브)의 scale 사용해 역변환
  //     {350, 875} 물리 → {280, 700} DIP (서브 모니터 기준) ✓

  const current = win.getBounds();
  // 1차: 위치만 변경 → 창이 서브 모니터로 이동, Windows가 scale 재인식
  win.setBounds({
    x: targetDip.x,
    y: targetDip.y,
    width: current.width,   // 그대로
    height: current.height, // 그대로
  });
  // 2차: 전체 bounds 적용 → 이제 서브 모니터 scale로 올바르게 해석
  win.setBounds(targetDip);
}
```

한 번의 `setBounds` 로는 부족한 이유: Windows가 창을 이동시키기 **전에**
width/height를 계산하면, 여전히 primary scale로 해석될 수 있다. 이동을
먼저 끝내고 크기를 나중에 적용하면 target 디스플레이의 scale factor가
확실히 활성화된 뒤에 크기가 결정된다.

---

## 적용 위치

창이 다시 보일 수 있는 모든 경로에서 `applyStoredBounds()` 호출:

1. `win.once('ready-to-show', ...)` — 최초 창 생성 후
2. `win.on('show', ...)` — hide → show 사이클
3. 코너 스냅 버튼 → `applySnap()` 내부에서 물리 픽셀로 직접 저장

리소스 정리: `win.on('resize' | 'move', scheduleBoundsSave)` — 500ms 디바운스 후
현재 DIP bounds를 물리 픽셀로 변환해 저장. 숨김 상태일 때는 저장 스킵
(`isVisible()` 체크).

---

## 이전 시도들과 실패 이유

| 시도 | 실패 이유 |
|---|---|
| DIP 그대로 저장 + 생성자에 전달 | 생성자 타이밍 이슈 — primary scale로 해석 |
| DIP 저장 + show 이벤트에서 2단계 setBounds | 생성자에 잘못된 DIP가 이미 적용돼 기준점 어긋남 |
| 물리 픽셀 저장 + 생성자에 전달 | 생성자가 물리 픽셀을 DIP로 오해 |
| **물리 저장 + 생성자 제외 + ready-to-show 시 2단계** | ✓ 동작 |

---

## 플랫폼 차이

- **Windows**: per-monitor DPI awareness 활성. `dipToScreenRect` / `screenToDipRect`
  가 이 플랫폼의 핵심 API.
- **macOS**: Retina는 정수 스케일(1x, 2x, 3x)이고 창을 디스플레이간 옮겨도
  자동 재배치가 깔끔. 물리 픽셀 저장 불필요.
- **Linux**: X11/Wayland마다 다르지만 일반적으로 단일 스케일이라 문제 드묾.

코드에서 Windows만 선택적으로 물리 픽셀 변환을 적용:

```ts
const USE_PHYSICAL_BOUNDS = process.platform === 'win32';
```

다른 플랫폼은 DIP 그대로 저장 (변환 API가 Windows 전용).

---

## 주의 사항

- `electron-store` 저장 포맷이 DIP → 물리 픽셀로 바뀌는 변경이므로, 이전
  버전에서 설치된 사용자는 첫 실행 시 한 번 잘못된 크기로 보일 수 있다.
  창을 한 번 이동/리사이즈하면 올바른 물리 픽셀로 재저장된다.
- `screen.screenToDipRect(null, rect)` 에서 첫 인자 null은 "rect가 위치한
  디스플레이 기준으로 변환"을 의미. 타입은 `BrowserWindow` 을 요구하므로
  TypeScript에서는 `null as unknown as BrowserWindow` 캐스팅.
- 가상 데스크탑 / 모니터 분리 시 저장된 좌표가 어떤 디스플레이에도 속하지
  않을 수 있다. `isBoundsOnAnyDisplay()` 로 체크 후 유효하지 않으면 기본
  코너 스냅 위치로 폴백.
