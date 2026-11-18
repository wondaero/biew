/**
 * 이 기기가 모바일 OS(안드로이드·iOS·iPadOS)인지.
 * 출력 창은 '별도 창 + 외부 모니터'가 필요한데, 이건 입력 장치가 아니라 OS 가 정한다.
 *  - pointer:coarse 로 판단하면 터치 노트북(서피스 태블릿 모드 등)이 모바일로 잡혀 정상 PC 가 막힌다 → 쓰지 않음.
 *  - 화면 폭으로 판단하면 가로 태블릿(1024px+)이 PC 로 잡힌다 → 쓰지 않음.
 * 판정은 경고용일 뿐 막지 않는다(삼성 DeX 처럼 모바일 OS 인데 확장 모니터가 되는 경우도 있으므로).
 */
export interface DeviceInfo {
  userAgent: string
  maxTouchPoints: number
  /** navigator.userAgentData(크롬 계열만). 안드로이드 태블릿 '데스크톱 사이트' 모드는 UA 가 리눅스로 나오지만 여기엔 Android 로 남는다 */
  uaData?: { mobile?: boolean; platform?: string }
}

export function isMobileOS(d: DeviceInfo = currentDevice()): boolean {
  if (/Android|iPhone|iPad|iPod/i.test(d.userAgent)) return true
  if (d.uaData?.mobile || d.uaData?.platform === 'Android' || d.uaData?.platform === 'iOS') return true
  // iPadOS 13+ 는 기본으로 맥 UA 를 보낸다 — 맥은 터치스크린이 없으므로 터치가 되면 아이패드
  if (/Macintosh/.test(d.userAgent) && d.maxTouchPoints > 1) return true
  return false
}

function currentDevice(): DeviceInfo {
  const n = navigator as Navigator & { userAgentData?: { mobile?: boolean; platform?: string } }
  return { userAgent: n.userAgent, maxTouchPoints: n.maxTouchPoints ?? 0, uaData: n.userAgentData }
}
