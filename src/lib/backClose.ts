/**
 * 뒤로가기 = 팝업 닫기(모바일 요청 — 페이지 전체가 나가지 않게).
 * 팝업이 열리면 같은 주소로 히스토리 칸을 하나 쌓고(pushState), 뒤로가기(popstate)가 오면 맨 위 팝업에 '닫아 줘'를 요청한다.
 *  - 팝업이 겹치면(곡 검색 시트 → 곡 편집기) 위의 것부터 하나씩 닫힌다(스택).
 *  - 닫기를 거절하면(저장 안 한 변경 확인에서 취소, 처리 중) 칸을 다시 쌓아 다음 뒤로가기도 팝업에 간다.
 *  - 버튼(✕ 등)으로 닫으면 쌓아 둔 칸을 history.back() 으로 치운다(그 popstate 는 무시).
 *    단, 팝업 안에서 다른 페이지로 이동했으면(채널 삭제 → 홈) 지금 칸이 우리 것이 아니므로 되돌리지 않는다.
 * vue-router 상태(history.state 의 position 등)는 그대로 복사해 쌓는다 → 라우터는 같은 위치로 보고 아무것도 안 한다.
 */
import { watch, nextTick, onBeforeUnmount } from 'vue'

const KEY = 'biewPopup'
interface Entry { id: number; request: () => void; popped: boolean }
const stack: Entry[] = []
let seq = 0
let skip = 0 // 우리가 부른 history.back() 이 만든 popstate 개수

function push(e: Entry) {
  e.popped = false
  history.pushState({ ...(history.state ?? {}), [KEY]: e.id }, '')
}

window.addEventListener('popstate', () => {
  if (skip > 0) { skip--; return }
  const top = stack[stack.length - 1]
  if (!top) return
  top.popped = true // 브라우저가 이미 칸을 뺐다
  top.request()
  // 닫기가 거절됐으면(다음 렌더 후에도 스택에 남아 있음) 칸을 다시 쌓는다
  void nextTick(() => { if (stack.includes(top) && top.popped) push(top) })
})

/**
 * isOpen: 팝업이 열려 있는지(반응형). 팝업 컴포넌트 안에서 쓸 때는 () => true(마운트 = 열림).
 * request: 닫기 요청 — 거절할 수 있다(확인창 취소·처리 중이면 아무것도 안 하면 됨).
 */
export function useBackClose(isOpen: () => boolean, request: () => void) {
  let entry: Entry | null = null
  const open = () => {
    if (entry) return
    entry = { id: ++seq, request, popped: false }
    stack.push(entry)
    push(entry)
  }
  const close = () => {
    if (!entry) return
    const e = entry
    entry = null
    stack.splice(stack.indexOf(e), 1)
    // 버튼으로 닫음 → 쌓아 둔 칸 치우기. 지금 칸이 우리 것일 때만(다른 페이지로 이동했으면 그대로)
    if (!e.popped && history.state?.[KEY] === e.id) { skip++; history.back() }
  }
  watch(isOpen, (v) => (v ? open() : close()), { immediate: true })
  onBeforeUnmount(close)
}
