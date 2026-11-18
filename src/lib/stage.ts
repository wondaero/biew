import { ref } from 'vue'

/**
 * 지금 화면이 '송출 화면'(프로젝터에 나가는 화면)인지. /output 외에 넓은 화면의 /view 도 해당.
 * 송출 화면에는 새 버전 알림 같은 UI 를 절대 띄우지 않는다(UpdateBanner).
 */
export const onStage = ref(false)
