<script setup lang="ts">
/** 출력 화면과 컨트롤러 미리보기가 공유하는 렌더러. 부모 크기를 꽉 채운다. */
import { computed } from 'vue'
import type { OutputStyle } from '@shared/types'
import FitText from './FitText.vue'

const props = withDefaults(
  defineProps<{ text: string | null; blank?: boolean; styleCfg: OutputStyle; layerKey?: string | number; animate?: boolean }>(),
  { blank: false, layerKey: 0, animate: true },
)

const shown = computed(() => (props.blank ? null : props.text))
const bg = computed(() => (props.styleCfg.background === 'green' ? '#00b140' : '#000'))
const useFade = computed(() => props.animate && props.styleCfg.transition === 'fade')
const key = computed(() => (shown.value == null ? 'blank' : `${props.layerKey}`))
</script>

<template>
  <div class="stage" :style="{ background: bg, '--fade-ms': `${styleCfg.fadeMs}ms` }">
    <Transition name="xfade" :css="useFade">
      <div v-if="shown != null" :key="key" class="layer">
        <FitText :text="shown" :style-cfg="styleCfg" />
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
