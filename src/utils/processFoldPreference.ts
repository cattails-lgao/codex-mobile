// Process Fold 偏好持久化：移植自 DeepSeek-Reasonix `lib/processFoldPreference.ts`。
// 仅改 localStorage key 前缀与 CustomEvent 名，读写/广播语义与上游一致。

export type ProcessFoldPreference = 'auto' | 'expanded'

const PROCESS_FOLD_KEY = 'codex-web-local.process-fold.v1'
const PROCESS_FOLD_EVENT = 'codex:web-local:process-fold'

export function getProcessFoldPreference(): ProcessFoldPreference {
  if (typeof localStorage === 'undefined') return 'auto'
  const stored = localStorage.getItem(PROCESS_FOLD_KEY)
  return stored === 'expanded' ? 'expanded' : 'auto'
}

export function setProcessFoldPreference(pref: ProcessFoldPreference): void {
  localStorage.setItem(PROCESS_FOLD_KEY, pref)
  window.dispatchEvent(new CustomEvent(PROCESS_FOLD_EVENT, { detail: pref }))
}

export function onProcessFoldPreferenceChange(cb: (pref: ProcessFoldPreference) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent).detail as ProcessFoldPreference)
  window.addEventListener(PROCESS_FOLD_EVENT, handler)
  return () => window.removeEventListener(PROCESS_FOLD_EVENT, handler)
}
