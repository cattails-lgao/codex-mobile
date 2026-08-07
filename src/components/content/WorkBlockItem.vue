<template>
  <div
    class="work-block"
    :class="[
      statusClass,
      {
        'work-block-expanded': expanded,
        'work-block-compact': compact,
      },
    ]"
  >
    <button
      type="button"
      class="work-block-header"
      :aria-expanded="expanded"
      @click="$emit('toggle')"
    >
      <span class="work-step-dot" :title="`${t('Step')} ${String(stepIndex + 1)}`">{{ stepIndex + 1 }}</span>
      <code class="work-block-command">{{ command.commandExecution?.command || '(command)' }}</code>
      <span class="work-block-status">
        <span v-if="command.commandExecution?.status === 'inProgress'" class="work-block-spinner" aria-hidden="true" />
        <span v-else-if="command.commandExecution?.status === 'completed' && command.commandExecution?.exitCode === 0" class="work-block-status-icon" aria-hidden="true">✓</span>
        <span v-else-if="command.commandExecution?.status === 'failed'" class="work-block-status-icon" aria-hidden="true">✗</span>
        {{ statusLabel }}
      </span>
    </button>
    <div
      class="work-block-output-wrap"
      :class="{ 'work-block-output-visible': expanded }"
    >
      <div class="work-block-output-inner">
        <pre
          class="work-block-output"
          :class="{ 'cmd-output-condensed': outputCondensed }"
          v-text="command.commandExecution?.aggregatedOutput || '(no output)'"
        ></pre>
      </div>
    </div>
    <p v-if="permissionHint" class="work-block-permission-hint" role="note">
      {{ permissionHint }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { UiMessage } from '../../types/codex'
import { useUiLanguage } from '../../composables/useUiLanguage'

const props = defineProps<{
  command: UiMessage
  stepIndex: number
  expanded: boolean
  compact: boolean
  outputCondensed: boolean
}>()

defineEmits<{
  toggle: []
}>()

const { t } = useUiLanguage()

const statusClass = computed(() => {
  const s = props.command.commandExecution?.status
  if (s === 'inProgress') return 'cmd-status-running'
  if (s === 'completed' && props.command.commandExecution?.exitCode === 0) return 'cmd-status-ok'
  return 'cmd-status-error'
})

const statusLabel = computed(() => {
  const ce = props.command.commandExecution
  if (!ce) return ''
  switch (ce.status) {
    case 'inProgress': return t('Running')
    case 'completed': return ce.exitCode === 0 ? t('Done') : `${t('Exit')} ${ce.exitCode ?? '?'}`
    case 'failed': return t('Failed')
    case 'declined': return t('Declined')
    case 'interrupted': return t('Stopped')
    default: return ''
  }
})

const PERMISSION_BLOCKED_PATTERNS = [
  /access to the path .* is denied/iu,
  /access is denied/iu,
  /permission denied/iu,
  /not permitted/iu,
  /EACCES|EPERM/iu,
  /denied access|deny access/iu,
  /拒绝访问/iu,
  /没有权限/iu,
  /权限不足/iu,
  /要求提权|需要提权|require_escalated/iu,
]

const permissionHint = computed(() => {
  const execution = props.command.commandExecution
  if (!execution) return ''
  const failed =
    execution.status === 'failed' ||
    execution.status === 'declined' ||
    (typeof execution.exitCode === 'number' && execution.exitCode !== 0)
  if (!failed) return ''
  const output = execution.aggregatedOutput ?? ''
  if (!output || !PERMISSION_BLOCKED_PATTERNS.some((pattern) => pattern.test(output))) return ''
  return t('Command blocked by a permission or sandbox restriction; no approval prompt was shown. Check the approval policy or trusted directories if you expected one.')
})
</script>

<style scoped>
@reference "tailwindcss";

.work-block-list {
  @apply flex w-full min-w-0 flex-col gap-1.5;
}

.work-block {
  @apply w-full min-w-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50/60 transition-colors;
}

/* 命令块视觉降噪（第十六轮反馈「命令执行块太显眼，灰一点」）：去掉左侧
   4px 彩色粗边框，状态只通过步骤圆点底色与状态文字的弱化色体现。 */

.work-block.work-block-compact {
  border-left-width: 0;
}

.work-block.work-block-compact .work-block-header {
  padding-top: 0.375rem;
  padding-bottom: 0.375rem;
}

.work-block.work-block-compact .work-step-dot {
  @apply h-4 min-w-4 text-[10px];
}

.work-block.work-block-compact .work-block-command {
  font-size: 0.75rem;
}

.work-block.work-block-compact .work-block-status {
  max-width: 4.5rem;
  font-size: 0.75rem;
}

.work-block-header {
  @apply flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left cursor-pointer transition-colors hover:bg-zinc-100/60;
}

.work-step-dot {
  @apply flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-semibold leading-none text-zinc-500 tabular-nums;
}

.work-block.cmd-status-running .work-step-dot {
  @apply bg-amber-50 text-amber-600;
}

.work-block.cmd-status-ok .work-step-dot {
  @apply bg-emerald-50 text-emerald-600;
}

.work-block.cmd-status-error .work-step-dot {
  @apply bg-rose-50 text-rose-600;
}

.work-block-command {
  @apply flex-1 min-w-0 truncate text-xs font-mono text-zinc-600;
}

.work-block-status {
  @apply inline-flex max-w-24 shrink-0 items-center gap-1 truncate text-right text-[11px] font-medium;
}

.work-block.cmd-status-running .work-block-status {
  @apply text-amber-600/80;
}

.work-block.cmd-status-ok .work-block-status {
  @apply text-emerald-600/80;
}

.work-block.cmd-status-error .work-block-status {
  @apply text-rose-600/80;
}

.work-block-status-icon {
  @apply inline-flex shrink-0 items-center text-[11px] leading-none;
}

.work-block-spinner {
  @apply inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-amber-500/40 border-t-amber-500;
}

.work-block-output-wrap {
  @apply rounded-b-xl bg-zinc-900;
  display: grid;
  /* 列轨道固定为 minmax(0,1fr)：auto 轨道会被子项 max-content（超长行）撑开，
     导致 break-words 永不触发、输出无限变宽 */
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: 0fr;
  transition: grid-template-rows 300ms ease-out, border-color 300ms ease-out;
  border: 1px solid transparent;
  border-top: none;
}

.work-block-output-wrap.work-block-output-visible {
  grid-template-rows: 1fr;
  border-color: #e4e4e7;
}

.work-block-output-inner {
  overflow: hidden;
  min-height: 0;
  min-width: 0; /* grid 子项 min-width:auto 会让超长行无限撑宽，break-words 失效 → 强制约束后断行 */
}

.work-block-output {
  @apply m-0 px-3 py-2 text-xs font-mono text-zinc-200 whitespace-pre-wrap break-words max-h-60 overflow-y-auto;
}

.work-block-output.cmd-output-condensed {
  max-height: 9rem;
}

.work-block-permission-hint {
  @apply mx-3 mb-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-4 text-amber-800;
}
</style>
