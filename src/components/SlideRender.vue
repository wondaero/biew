<script setup lang="ts">
/** 출력 화면과 컨트롤러 미리보기가 공유하는 렌더러. 부모 크기를 꽉 채운다. */
import { computed } from 'vue'
import type { OutputStyle } from '@shared/types'
import FitText from './FitText.vue'
import MediaImage from './MediaImage.vue'
import { isMediaSlide, mediaIdOf } from '@shared/media'
import { backdropCss, toBackdrop } from '@shared/backdrop'

const props = withDefaults(
  defineProps<{ text: string | null; blank?: boolean; styleCfg: OutputStyle; layerKey?: string | number; animate?: boolean }>(),
  { blank: false, layerKey: 0, animate: true },
)

const shown = computed(() => (props.blank ? null : props.text))
// 예전 형식(background: 'black'|'green')이 섞여 들어와도 안전하게
const bg = computed(() => backdropCss(toBackdrop(props.styleCfg.backdrop, (props.styleCfg as { background?: unknown }).background)))
const useFade = computed(() => props.animate && props.styleCfg.transition === 'fade')
/** 그림 슬라이드(PDF·이미지)면 그림 id — 글 대신 그림을 화면 가득(비율 유지) */
const media = computed(() => (isMediaSlide(shown.value) ? mediaIdOf(shown.value) : null))
const key = computed(() => (shown.value == null ? 'blank' : `${props.layerKey}`))
</script>

<template>
  <div class="stage" :style="{ background: bg, '--fade-ms': `${styleCfg.fadeMs}ms` }">
    <Transition name="xfade" :css="useFade">
      <div v-if="shown != null" :key="key" class="layer">
        <MediaImage v-if="media" :id="media" />
        <FitText v-else :text="shown" :style-cfg="styleCfg" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.stage {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  container-type: size;
}
.layer { position: absolute; inset: 0; }
.xfade-enter-active,
.xfade-leave-active { transition: opacity var(--fade-ms) ease; }
.xfade-enter-from,
.xfade-leave-to { opacity: 0; }
</style>
