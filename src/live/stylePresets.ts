/**
 * 저장된 출력 설정(프리셋) — **이 PC(브라우저)에만** 저장한다. 서버로 보내지 않는다(사용자 결정).
 *  - 키 하나(biew.stylePresets.v1)에 목록 전체. 채널과 무관 → 로컬 송출·인터넷 송출 어디서든 같은 목록.
 *  - 불러올 때마다 normalizeStyle 을 거친다 → 나중에 OutputStyle 필드가 늘거나 바뀌어도 옛 저장본이 그대로 쓰인다.
 *  - 다른 PC 로 옮기거나 백업은 파일 내보내기/가져오기(JSON)로 — 역시 서버를 거치지 않는다.
 */
import { ref } from 'vue'
import type { OutputStyle } from '@shared/types'
import { normalizeStyle } from '@shared/outputStyle'
import { uid } from '@/lib/uid'

export interface StylePreset { id: string; name: string; style: OutputStyle; savedAt: string }

const KEY = 'biew.stylePresets.v1'
const FILE_KIND = 'biew-style-presets'
export const NAME_MAX = 40
export const PRESET_MAX = 50

function read(): StylePreset[] {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    return Array.isArray(arr) ? arr.map(toPreset).filter((p): p is StylePreset => !!p) : []
  } catch {
    return []
  }
}

function toPreset(v: unknown): StylePreset | null {
  const p = v as Partial<StylePreset> | null
  const name = typeof p?.name === 'string' ? p.name.trim().slice(0, NAME_MAX) : ''
  if (!p || !name) return null
  return {
    id: typeof p.id === 'string' && p.id ? p.id : uid(),
    name,
    style: normalizeStyle(p.style),
    savedAt: typeof p.savedAt === 'string' ? p.savedAt : new Date().toISOString(),
  }
}

/** 화면이 바로 따라오도록 반응형 목록 */
export const presets = ref<StylePreset[]>(read())

function write(list: StylePreset[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
    presets.value = list
    return true
  } catch {
    return false // 저장 공간 부족·사생활 보호 모드
  }
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
export const findByName = (name: string) => presets.value.find((p) => sameName(p.name, name)) ?? null

/** 현재 설정을 이름으로 저장. 같은 이름이 있으면 덮어쓴다(확인은 화면에서) */
export function savePreset(name: string, style: OutputStyle): string | null {
  const n = name.trim().slice(0, NAME_MAX)
  if (!n) return '이름을 입력하세요'
  const now = new Date().toISOString()
  const old = findByName(n)
  if (!old && presets.value.length >= PRESET_MAX) return `최대 ${PRESET_MAX}개까지 저장할 수 있습니다`
  const item: StylePreset = { id: old?.id ?? uid(), name: n, style: normalizeStyle(style), savedAt: now }
  const list = old ? presets.value.map((p) => (p.id === old.id ? item : p)) : [...presets.value, item]
  return write(list) ? null : '이 브라우저에 저장하지 못했습니다(저장 공간)'
}

export function deletePreset(id: string) {
  write(presets.value.filter((p) => p.id !== id))
}

/** 파일 내보내기용 JSON */
export function exportJson(): string {
  return JSON.stringify({ kind: FILE_KIND, version: 1, exportedAt: new Date().toISOString(), presets: presets.value }, null, 2)
}

/** 파일 가져오기: 같은 이름은 파일 것으로 바꾸고, 새 이름은 추가 */
export function importJson(text: string): { added: number; replaced: number; error?: string } {
  let data: { kind?: unknown; presets?: unknown }
  try { data = JSON.parse(text) } catch { return { added: 0, replaced: 0, error: '읽을 수 없는 파일입니다' } }
  if (data?.kind !== FILE_KIND || !Array.isArray(data.presets)) return { added: 0, replaced: 0, error: 'Biew 출력 설정 파일이 아닙니다' }
  const list = [...presets.value]
  let added = 0, replaced = 0
  for (const v of data.presets) {
    const p = toPreset(v)
    if (!p) continue
    const i = list.findIndex((x) => sameName(x.name, p.name))
    if (i >= 0) { list[i] = { ...p, id: list[i]!.id }; replaced++ }
    else if (list.length < PRESET_MAX) { list.push({ ...p, id: uid() }); added++ }
  }
  if (!write(list)) return { added: 0, replaced: 0, error: '이 브라우저에 저장하지 못했습니다(저장 공간)' }
  return { added, replaced }
}

/** 다른 탭에서 저장·삭제해도 목록을 맞춘다 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === KEY) presets.value = read() })
}
