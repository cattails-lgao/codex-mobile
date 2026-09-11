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
      <code class="work-block-command">{{ t('Command') }}</code>
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
        <pre class="work-block-output-command" v-text="command.commandExecution?.command || '(command)'"></pre>
        <pre
          class="work-block-output"
          :class="{ 'cmd-output-condensed': outputCondensed }"
          v-text="displayedOutput"
        ></pre>
        <p v-if="spillNote" class="work-block-output-spill" role="note">
          <span>{{ spillNote }}</span>
          <button
            v-if="spillRef && !fullOutputLoaded"
            type="button"
            class="work-block-output-spill-action"
            :disabled="spillState === 'loading'"
            @click="loadFullOutput"
          >
            {{ spillState === 'loading' ? t('Loading full output…') : t('Show full output') }}
          </button>
          <span v-else-if="spillState === 'error'">{{ t('Could not load the full output.') }}</span>
        </p>
      </div>
    </div>
    <p v-if="permissionHint" class="work-block-permission-hint" role="note">
      {{ permissionHint }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { UiMessage } from '../../types/codex'
import { useUiLanguage } from '../../composables/useUiLanguage'
import { getCommandOutputText } from '../../api/gateway/threads'

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

// round-76：桥层只内联 16KB 命令输出，溢出落盘并留下一个不透明句柄。折叠状态下
// 用户看到的仍是截断文本，需要时才主动把完整输出取回来。
const spill = computed(() => props.command.commandExecution?.outputSpill)
const spillRef = computed(() => spill.value?.ref ?? '')
const spillState = ref<'idle' | 'loading' | 'error'>('idle')
const loadedOutput = ref<{ ref: string; text: string } | null>(null)

const fullOutputLoaded = computed(() => {
  const current = spill.value
  return Boolean(current && loadedOutput.value && loadedOutput.value.ref === current.ref)
})

const displayedOutput = computed(() => {
  const execution = props.command.commandExecution
  const current = execution?.outputSpill
  const loaded = loadedOutput.value
  if (current && loaded && loaded.ref === current.ref) return loaded.text
  return execution?.aggregatedOutput || '(no output)'
})

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const spillNote = computed(() => {
  const current = spill.value
  if (!current || current.omittedBytes <= 0) return ''
  return t('Output trimmed: {omitted} omitted of {total}.', {
    omitted: formatByteSize(current.omittedBytes),
    total: formatByteSize(current.totalBytes),
  })
})

async function loadFullOutput(): Promise<void> {
  const current = spill.value
  if (!current?.ref || spillState.value === 'loading') return
  spillState.value = 'loading'
  try {
    loadedOutput.value = { ref: current.ref, text: await getCommandOutputText(current.ref) }
    spillState.value = 'idle'
  } catch {
    spillState.value = 'error'
  }
}

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
  @apply flex w-full min-w-0 flex-col gap-1;
}

/* 命令块视觉降噪（round-16 反馈「命令执行块太显眼」+ round-17 反馈「不需要圆形
   边框和背景色」）：去掉圆角/边框/背景，改为「序号 + "命令"标签 + 状态」的朴素行，
   颜色浅。输出区保持深色代码块，具体命令与结果都在展开后的输出区里。 */
.work-block {
  @apply w-full min-w-0;
}

.work-block.work-block-compact .work-block-header {
  padding-top: 0.25rem;
  padding-bottom: 0.25rem;
}

.work-block.work-block-compact .work-step-dot {
  font-size: 10px;
}

.work-block.work-block-compact .work-block-command {
  font-size: 0.75rem;
}

.work-block.work-block-compact .work-block-status {
  max-width: 4.5rem;
  font-size: 0.75rem;
}

.work-block-header {
  @apply flex w-full min-w-0 items-center gap-1.5 px-0 py-0.5 text-left cursor-pointer transition-colors;
}

/* 序号：纯文本数字，浅灰，无圆形徽章 */
.work-step-dot {
  @apply shrink-0 text-[11px] font-medium leading-none text-zinc-400 tabular-nums;
}

.work-block.cmd-status-running .work-step-dot {
  @apply text-amber-500;
}

.work-block.cmd-status-ok .work-step-dot {
  @apply text-emerald-500;
}

.work-block.cmd-status-error .work-step-dot {
  @apply text-rose-500;
}

.work-block-command {
  /* round-23 字体规范：工具文字 #737373 */
  @apply flex-1 min-w-0 truncate text-xs font-mono;
  color: #737373;
}

.work-block-status {
  /* round-23 字体规范：工具文字 #737373 */
  @apply inline-flex max-w-24 shrink-0 items-center gap-1 truncate text-right text-[11px] font-medium;
  color: #737373;
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
  @apply bg-zinc-900;
  display: grid;
  /* 列轨道固定为 minmax(0,1fr)：auto 轨道会被子项 max-content（超长行）撑开，
     导致 break-words 永不触发、输出无限变宽 */
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: 0fr;
  /* round-27：去掉常驻 1px 边框（此前 border:1px solid transparent + border-top:none
     在展开时显示左/右/底三边线，让整条 commandExecution 消息看起来有底部边框）。
     输出区深色背景与消息背景的对比已足够区分，折叠时也不再占 1px 高度。 */
  transition: grid-template-rows 300ms ease-out;
}

.work-block-output-wrap.work-block-output-visible {
  grid-template-rows: 1fr;
}

.work-block-output-inner {
  overflow: hidden;
  min-height: 0;
  min-width: 0; /* grid 子项 min-width:auto 会让超长行无限撑宽，break-words 失效 → 强制约束后断行 */
}

.work-block-output {
  @apply m-0 px-3 py-2 text-xs font-mono text-zinc-200 whitespace-pre-wrap break-words max-h-60 overflow-y-auto;
}

/* 展开区第一行：具体命令（与结果放一起），下边一条暗色分隔线 */
.work-block-output-command {
  @apply m-0 px-3 pt-2 pb-1.5 text-xs font-mono whitespace-pre-wrap break-words border-b border-zinc-700/60 text-sky-300/90;
}

.work-block-output.cmd-output-condensed {
  max-height: 9rem;
}

/* round-76：输出被截断时的提示行 + 按需取回完整输出的入口。放在展开区内部，
   折叠时不占高度、也不干扰「命令块视觉降噪」的朴素行设计。 */
.work-block-output-spill {
  @apply m-0 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-zinc-700/60 px-3 py-1.5 text-[11px] leading-4;
  color: #a1a1aa;
}

.work-block-output-spill-action {
  @apply cursor-pointer rounded border border-zinc-600 px-1.5 py-0.5 text-[11px] leading-4 transition-colors;
  color: #e4e4e7;
  background: transparent;
}

.work-block-output-spill-action:hover {
  @apply border-zinc-500 text-white;
}

.work-block-output-spill-action:disabled {
  @apply cursor-default opacity-60;
}

.work-block-permission-hint {
  @apply mx-3 mb-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-4 text-amber-800;
}
</style>
