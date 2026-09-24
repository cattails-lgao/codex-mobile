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
      :aria-label="rowAriaLabel"
      :title="rowAriaLabel"
      @click="$emit('toggle')"
    >
      <span class="work-block-pip" :class="badgeClass" aria-hidden="true" />
      <code class="work-block-command">{{ commandText }}</code>
      <span v-if="metricText" class="work-block-metric">{{ metricText }}</span>
      <span v-if="badgeText" class="work-block-status" :class="badgeClass">{{ badgeText }}</span>
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

// ---- round-93：会话区签名组件「工具调用行」--------------------------------
// 度量稿 .toolrow：14px pip 列 + 等宽命令名 + 右侧读数 + 等宽大写徽记。

const commandText = computed(() => props.command.commandExecution?.command || '(command)')

// 读数只写真实拥有的数据。协议里命令执行没有时长字段，所以读数只给输出字节：
// 有 spill 时用 totalBytes（准确总数），否则按 UTF-8 字节估 aggregatedOutput。
const outputBytes = computed(() => {
  const execution = props.command.commandExecution
  if (!execution) return 0
  if (execution.outputSpill && execution.outputSpill.totalBytes > 0) {
    return execution.outputSpill.totalBytes
  }
  if (!execution.aggregatedOutput) return 0
  return new TextEncoder().encode(execution.aggregatedOutput).length
})

const metricText = computed(() => (outputBytes.value > 0 ? formatByteSize(outputBytes.value) : ''))

// 机器口径徽记（等宽大写，颜色只表示状态）。本地化状态文案不丢——放在 title/aria 里。
const badge = computed(() => {
  const execution = props.command.commandExecution
  if (!execution) return { text: '', cls: '' }
  switch (execution.status) {
    case 'inProgress':
      return { text: 'RUN', cls: 'is-live' }
    case 'completed':
      return execution.exitCode === 0
        ? { text: 'OK', cls: 'is-ok' }
        : { text: `EXIT ${execution.exitCode ?? '?'}`, cls: 'is-alert' }
    case 'failed':
      return { text: 'FAIL', cls: 'is-alert' }
    case 'declined':
      return { text: 'SKIP', cls: 'is-alert' }
    case 'interrupted':
      return { text: 'STOP', cls: 'is-alert' }
    default:
      return { text: '', cls: '' }
  }
})

const badgeText = computed(() => badge.value.text)
const badgeClass = computed(() => badge.value.cls)

const rowAriaLabel = computed(() => {
  const parts = [commandText.value, statusLabel.value, metricText.value]
  return parts.filter(Boolean).join(' · ')
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
@reference "../../style.css";

.work-block-list {
  @apply flex w-full min-w-0 flex-col gap-1;
}

/* round-93：会话区签名组件「工具调用行」（方案 §5 P1，度量稿 .toolrow）。
   形态＝14px pip 列 + 等宽命令名 + 右侧读数 + OK/RUN 徽记，外面是度量稿里
   「已认可」的发丝边框 + s2 表面卡片。旧 round-16/17 去掉的是当时的高对比
   大卡片（粗边框、翠绿渐变、圆形序号徽章），不是这种安静形态。 */
.work-block {
  @apply w-full min-w-0 overflow-hidden rounded-[10px] border border-line-1 bg-s2;
}

.work-block:hover {
  @apply border-line-2;
}

/* 运行中：边框转 --live 40%（度量稿 data-state="run"）。写在 :hover 之后，
   同权重下后者胜出，悬停不会盖掉运行态边框。 */
.work-block.cmd-status-running {
  border-color: color-mix(in srgb, var(--live) 40%, transparent);
}

.work-block-header {
  @apply grid w-full min-w-0 cursor-pointer items-center gap-2.5 px-3 py-2 text-left transition-colors;
  grid-template-columns: 14px minmax(0, 1fr) auto auto;
}

.work-block.work-block-compact .work-block-header {
  @apply px-2 py-1;
}

/* pip：状态点。运行中呼吸 + 22% 光晕；prefers-reduced-motion 下归零。 */
.work-block-pip {
  @apply h-1.5 w-1.5 justify-self-center rounded-full;
}

.work-block-pip.is-ok {
  @apply bg-ok;
}

.work-block-pip.is-alert {
  @apply bg-alert;
}

.work-block-pip.is-live {
  @apply bg-live;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--live) 22%, transparent);
  animation: work-pip-breathe 1.6s cubic-bezier(0.22, 0.61, 0.36, 1) infinite;
}

@media (prefers-reduced-motion: reduce) {
  .work-block-pip.is-live {
    animation: none;
  }
}

@keyframes work-pip-breathe {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}

/* 命令名：等宽（机器口径）+ ink-1。完整命令本来就在展开区第一行，这里截断即可。 */
.work-block-command {
  @apply min-w-0 truncate font-mono text-xs text-ink-1;
}

/* 读数：等宽 + tabular-nums（机器口径），ink-3。 */
.work-block-metric {
  @apply shrink-0 font-mono text-xs tabular-nums text-ink-3;
}

/* 徽记：等宽大写；颜色只表示状态（ok/live/alert token），ink-4 禁用于文字。 */
.work-block-status {
  @apply shrink-0 font-mono text-xs uppercase tracking-[0.08em];
}

.work-block-status.is-ok {
  @apply text-ok;
}

.work-block-status.is-live {
  @apply text-live;
}

.work-block-status.is-alert {
  @apply text-alert;
}

.work-block-output-wrap {
  @apply bg-s-inv;
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
  @apply m-0 px-3 py-2 text-xs font-mono text-ink-3 whitespace-pre-wrap break-words max-h-60 overflow-y-auto;
}

/* 展开区第一行：具体命令（与结果放一起），下边一条暗色分隔线 */
.work-block-output-command {
  @apply m-0 px-3 pt-2 pb-1.5 text-xs font-mono whitespace-pre-wrap break-words border-b border-ink-2/60 text-ink-3/90;
}

.work-block-output.cmd-output-condensed {
  max-height: 9rem;
}

/* round-76：输出被截断时的提示行 + 按需取回完整输出的入口。放在展开区内部，
   折叠时不占高度、也不干扰「命令块视觉降噪」的朴素行设计。 */
.work-block-output-spill {
  @apply m-0 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-ink-2/60 px-3 py-1.5 text-micro leading-4;
  color: #a1a1aa;
}

.work-block-output-spill-action {
  @apply cursor-pointer rounded border border-line-5 px-1.5 py-0.5 text-micro leading-4 transition-colors;
  color: #e4e4e7;
  background: transparent;
}

.work-block-output-spill-action:hover {
  @apply border-line-4 text-ink-inv;
}

.work-block-output-spill-action:disabled {
  @apply cursor-default opacity-60;
}

.work-block-permission-hint {
  @apply mx-3 mb-2 rounded-md border border-live bg-live px-2.5 py-1.5 text-micro leading-4 text-live;
}
</style>
