/**
 * v-fit-lines: 슬라이드 카드 글자를 원래 데이터의 줄바꿈 그대로(임의로 꺾지 않음) 두고,
 * 가장 긴 줄이 폭에 들어가도록(고정 크기 카드면 높이도) 그 요소의 글자 크기만 줄인다(사용자 요청 2026-11-18 —
 * 카드에서 긴 줄이 브라우저 자동 줄바꿈으로 꺾여 4줄이 5줄로 보였음). 출력 화면(FitText)과 같은 규칙.
 *  - 최소 MIN 배율까지만 줄이고, 그래도 넘치면 잘라서(fit-clip) 마우스를 올리면 전체(title).
 *  - 자간 줄이기는 쓰지 않는다(한글은 뭉쳐 읽기 어렵고 효과도 5~10% 수준).
 *  - 요소는 폭을 꽉 채워야 한다(flex: 1 / width: 100%) — clientWidth 가 쓸 수 있는 폭이 되도록.
 *  - 높이 맞춤은 부모(카드)가 aspect-ratio 로 크기가 고정됐을 때만(모바일 한 줄 목록은 높이가 글에 맞춰 늘어남).
 * 값(binding.value)은 글 — 바뀌면 다시 맞춘다. 부모 크기가 바뀌어도(ResizeObserver) 다시.
 */
import type { Directive } from 'vue'

const MIN = 0.55
const targets = new Map<Element, HTMLElement>() // 부모(카드) → 글 요소

function fit(el: HTMLElement) {
  const box = el.parentElement
  if (!box) return
  el.style.fontSize = ''
  el.classList.remove('fit-clip')
  const base = parseFloat(getComputedStyle(el).fontSize)
  const w = el.clientWidth
  if (!base || !w) return
  const bs = getComputedStyle(box)
  const fixedH = bs.aspectRatio !== 'auto'
  const h = fixedH ? box.clientHeight - parseFloat(bs.paddingTop) - parseFloat(bs.paddingBottom) : Infinity
  let k = Math.min(1, w / el.scrollWidth, h / el.scrollHeight)
  if (k >= 1) { el.removeAttribute('title'); return }
  // 한 번 줄인 뒤 다시 재서 미세 조정(줄 높이 반올림 등)
  el.style.fontSize = `${base * Math.max(k, MIN)}px`
  k = Math.min(k, k * Math.min(w / el.scrollWidth, h / el.scrollHeight))
  const fin = Math.max(k, MIN)
  el.style.fontSize = `${base * fin}px`
  if (el.scrollWidth > w + 1 || el.scrollHeight > h + 1) {
    el.classList.add('fit-clip')
    el.title = el.textContent ?? ''
  } else el.removeAttribute('title')
}

const ro = typeof ResizeObserver !== 'undefined'
  ? new ResizeObserver((entries) => { for (const e of entries) { const el = targets.get(e.target); if (el) fit(el) } })
  : null
// 웹폰트(Pretendard 등)가 늦게 로드되면 글자 폭이 바뀌므로 전부 다시
document.fonts?.addEventListener?.('loadingdone', () => { for (const el of targets.values()) fit(el) })

export const vFitLines: Directive<HTMLElement, string> = {
  mounted(el) {
    const box = el.parentElement
    if (box) { targets.set(box, el); ro?.observe(box) }
    requestAnimationFrame(() => fit(el))
  },
  updated(el, b) { if (b.value !== b.oldValue) fit(el) },
  beforeUnmount(el) {
    const box = el.parentElement
    if (box) { targets.delete(box); ro?.unobserve(box) }
  },
}
