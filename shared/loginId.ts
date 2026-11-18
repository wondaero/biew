/**
 * 로그인 아이디 → 이메일. 스태프 계정은 모두 같은 도메인이라 아이디만 입력하면 도메인을 붙인다.
 * '@' 가 들어 있으면 입력 그대로(다른 도메인 계정·E2E 임시 계정). 브라우저 앱과 스크립트(npm run staff) 공용.
 */
export const LOGIN_DOMAIN = 'jv.jv'

export function toLoginEmail(id: string): string {
  const v = id.trim().toLowerCase()
  if (!v) return ''
  return v.includes('@') ? v : `${v}@${LOGIN_DOMAIN}`
}
