<script setup lang="ts">
/**
 * 폰 뷰어 /view/:code — 로그인 불필요, 보기 전용.
 * 접속 시 get_room RPC 로 현재 상태를 받고, 이후 Realtime Broadcast 로 따라간다.
 * 탭이 다시 보이거나 재연결되면 RPC 로 한 번 더 따라잡는다(끊긴 동안 놓친 변경 보정).
 */
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import type { LiveState } from '@shared/types'
import { supabase } from '@/lib/supabase'
import { SyncHub } from '@/sync/SyncHub'
import { SupabaseRealtimeTransport } from '@/sync/SupabaseRealtimeTransport'

const route = useRoute()
const code = computed(() => String(route.params.code ?? '').toUpperCase())
const state = ref<LiveState | null>(null)
const status = ref<'loading' | 'live' | 'reconnecting' | 'notfound' | 'error'>('loading')
const list = ref<HTMLElement>()

let hub: SyncHub | null = null

async function catchUp() {
  if (!supabase) { status.value = 'error'; return }
  const { data, error } = await supabase.rpc('get_room', { p_code: code.value })
  if (error) { status.value = 'error'; return }
  const row = (data as { state: LiveState; version: number }[] | null)?.[0]
  if (!row) { status.value = 'notfound'; state.value = null; return }
  hub?.receive(row.state)
}

const item = computed(() => (state.value ? state.value.setlist[state.value.itemIndex] : undefined))
const nextItem = computed(() => (state.value ? state.value.setlist[state.value.itemIndex + 1] : undefined))

// 현재 슬라이드를 화면 중앙 근처로
watch(
  () => [state.value?.itemIndex, state.value?.slideIndex],
  async () => {
    await nextTick()
    list.value?.querySelector('.slide.cur')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  },
)

const onVis = () => { if (document.visibilityState === 'visible') void catchUp() }

onMounted(async () => {
  document.title = `${code.value} — 실시간 가사`
  if (!supabase) { status.value = 'error'; return }
  const rt = new SupabaseRealtimeTransport(supabase, code.value, {
    onStatus: (st) => {
      if (st === 'SUBSCRIBED') { if (status.value !== 'notfound') status.value = 'live'; void catchUp() }
      else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') status.value = 'reconnecting'
    },
  })
  hub = new SyncHub([rt], (s) => { state.value = s; status.value = 'live' })
  await catchUp()
  document.addEventListener('visibilitychange', onVis)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVis)
  hub?.close()
})
</script>

<template>
  <div class="viewer">
    <header>
      <div class="t">
        <strong>{{ item?.title ?? '실시간 가사' }}</strong>
        <small v-if="item && state">{{ state.slideIndex + 1 }} / {{ item.slides.length }}</small>
      </div>
      <span class="dot" :class="status" :title="status" />
    </header>

    <main v-if="status === 'notfound'" class="msg">
      <p>방을 찾을 수 없습니다.</p>
      <small>코드 <b>{{ code }}</b> 가 종료되었거나 잘못되었습니다.</small>
    </main>
    <main v-else-if="status === 'error' && !state" class="msg"><p>연결할 수 없습니다.</p></main>
    <main v-else-if="!state" class="msg"><p>불러오는 중…</p></main>

    <main v-else ref="list" class="slides" :class="{ blank: state.blank }">
      <p
        v-for="(s, j) in item?.slides ?? []"
        :key="`${state.itemIndex}-${j}`"
        class="slide"
        :class="{ cur: j === state.slideIndex, past: j < state.slideIndex }"
      >{{ s }}</p>
      <p v-if="!item" class="msg">대기 중</p>
      <footer v-if="nextItem" class="next">다음 곡 · {{ nextItem.title }}</footer>
    </main>
  </div>
</template>

<style scoped>
.viewer { min-height: 100dvh; display: flex; flex-direction: column; background: #0e0e11; color: #eee; }
header {
  position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; padding-top: max(12px, env(safe-area-inset-top));
  background: rgba(14, 14, 17, .92); backdrop-filter: blur(8px); border-bottom: 1px solid #26262c;
}
.t { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 8px; }
.t strong { font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.t small { color: #888; flex: none; }
.dot { width: 9px; height: 9px; border-radius: 50%; background: #666; flex: none; }
.dot.live { background: #2ecc71; box-shadow: 0 0 6px #2ecc71; }
.dot.reconnecting, .dot.loading { background: #f5a524; }
.dot.error, .dot.notfound { background: #ff3b3b; }
.slides { flex: 1; padding: 16px 16px 50dvh; }
.slide {
  margin: 0 0 14px; padding: 14px 16px; border-radius: 12px; white-space: pre-line; text-align: center;
  font-size: 19px; line-height: 1.55; color: #9a9aa3; background: #17171c; transition: all .2s;
}
.slide.past { opacity: .5; }
.slide.cur { color: #fff; background: #23232b; font-weight: 700; font-size: 22px; box-shadow: inset 0 0 0 2px #4f8cff; }
.slides.blank .slide.cur { box-shadow: inset 0 0 0 2px #555; color: #aaa; font-weight: 400; }
.next { text-align: center; color: #777; font-size: 14px; margin-top: 24px; }
.msg { flex: 1; display: grid; place-content: center; text-align: center; color: #aaa; padding: 24px; }
.msg p { margin: 0 0 6px; font-size: 17px; }
</style>
