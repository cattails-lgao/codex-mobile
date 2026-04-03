<template>
  <section v-if="request" class="thread-pending-request">
    <article
      class="thread-pending-request-shell"
      :class="{ 'thread-pending-request-shell--no-top-radius': hasQueueAbove }"
    >
      <template v-if="isApprovalRequest(request)">
        <p class="thread-pending-request-title">{{ requestPanelPrompt(request) }}</p>
        <p
          v-if="requestPreview(request)"
          class="thread-pending-request-command-line"
          :title="requestPreview(request)"
        >
          {{ requestPreview(request) }}
        </p>

        <section class="thread-pending-request-approval">
          <div class="thread-pending-request-options" role="radiogroup" aria-label="Approval choices">
            <button
              v-for="(option, index) in approvalOptions"
              :key="option.id"
              type="button"
              class="thread-pending-request-option"
              :class="{ 'is-selected': selectedApprovalDecision === option.id }"
              :aria-pressed="selectedApprovalDecision === option.id"
              @click="onSelectApprovalOption(option.id)"
            >
              <span class="thread-pending-request-option-index">{{ index + 1 }}.</span>
              <span class="thread-pending-request-option-label">{{ option.label }}</span>
            </button>
          </div>

          <footer class="thread-pending-request-footer thread-pending-request-footer--approval">
            <label
              class="thread-pending-request-inline-input"
              :class="{ 'is-active': selectedApprovalDecision === 'decline' || approvalFreeformText.length > 0 }"
            >
              <span class="thread-pending-request-option-index">3.</span>
              <input
                class="thread-pending-request-inline-control"
                type="text"
                :value="approvalFreeformText"
                placeholder="No, and tell Codex what to do differently"
                @focus="onFocusApprovalOther"
                @input="onApprovalOtherInput"
                @keydown.enter.prevent="onSubmitApproval(request)"
              />
            </label>

            <button type="button" class="thread-pending-request-secondary" @click="onRespondApproval(request, 'cancel')">
              Skip
            </button>
            <button type="button" class="thread-pending-request-primary" @click="onSubmitApproval(request)">
              Send
            </button>
          </footer>
        </section>
      </template>

      <template v-else>
        <header class="thread-pending-request-header">
          <div class="thread-pending-request-heading">
            <p class="thread-pending-request-eyebrow">{{ requestPanelTitle(request) }}</p>
            <p class="thread-pending-request-title">{{ requestPanelPrompt(request) }}</p>
          </div>
          <span v-if="(requestCount ?? 0) > 1" class="thread-pending-request-counter">{{ requestCount ?? 0 }} pending</span>
        </header>

        <div v-if="requestPreview(request)" class="thread-pending-request-preview">
          <code class="thread-pending-request-preview-code">{{ requestPreview(request) }}</code>
        </div>

        <section v-if="request.method === 'item/tool/requestUserInput'" class="thread-pending-request-user-input">
          <div
            v-for="question in readToolQuestions(request)"
            :key="`${request.id}:${question.id}`"
            class="thread-pending-request-question"
          >
            <p class="thread-pending-request-question-title">{{ question.header || question.question }}</p>
            <p v-if="question.question" class="thread-pending-request-question-text">{{ question.question }}</p>

            <div v-if="question.options.length > 0" class="thread-pending-request-question-options">
              <label class="thread-pending-request-select-wrap">
                <span class="thread-pending-request-select-label">Choice</span>
                <select
                  class="thread-pending-request-select"
                  :value="readQuestionAnswer(request.id, question.id, question.options[0]?.label || '')"
                  @change="onQuestionAnswerChange(request.id, question.id, $event)"
                >
                  <option
                    v-for="option in question.options"
                    :key="`${request.id}:${question.id}:${option.label}`"
                    :value="option.label"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </label>

              <p
                v-if="selectedOptionDescription(request.id, question.id, question.options)"
                class="thread-pending-request-question-description"
              >
                {{ selectedOptionDescription(request.id, question.id, question.options) }}
              </p>
            </div>

            <label v-if="question.isOther" class="thread-pending-request-input-wrap">
              <span class="thread-pending-request-select-label">Other answer</span>
              <input
                class="thread-pending-request-input"
                type="text"
                :value="readQuestionOtherAnswer(request.id, question.id)"
                placeholder="Other answer"
                @input="onQuestionOtherAnswerInput(request.id, question.id, $event)"
              />
            </label>
          </div>

          <footer class="thread-pending-request-footer">
            <button type="button" class="thread-pending-request-primary" @click="onRespondToolRequestUserInput(request)">
              Send
            </button>
          </footer>
        </section>

        <section v-else-if="request.method === 'item/tool/call'" class="thread-pending-request-actions">
          <button type="button" class="thread-pending-request-primary" @click="onRespondToolCallFailure(request)">
            Fail Tool Call
          </button>
          <button type="button" class="thread-pending-request-secondary" @click="onRespondToolCallSuccess(request)">
            Success (Empty)
          </button>
        </section>

        <section v-else class="thread-pending-request-actions">
          <button type="button" class="thread-pending-request-primary" @click="onRespondEmptyResult(request)">
            Return Empty Result
          </button>
          <button type="button" class="thread-pending-request-secondary" @click="onRejectUnknownRequest(request)">
            Reject Request
          </button>
        </section>
      </template>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { UiServerRequest, UiServerRequestReply } from '../../types/codex'

type ApprovalDecision = 'accept' | 'acceptForSession' | 'decline' | 'cancel'

type ApprovalOption = {
  id: Exclude<ApprovalDecision, 'cancel' | 'decline'>
  label: string
}

type ParsedToolQuestion = {
  id: string
  header: string
  question: string
  isOther: boolean
  options: Array<{ label: string; description: string }>
}

const props = defineProps<{
  request: UiServerRequest | null
  requestCount?: number
  hasQueueAbove?: boolean
}>()

const emit = defineEmits<{
  respondServerRequest: [payload: UiServerRequestReply]
}>()

const selectedApprovalDecision = ref<ApprovalDecision>('accept')
const approvalFreeformText = ref('')
const toolQuestionAnswers = ref<Record<string, string>>({})
const toolQuestionOtherAnswers = ref<Record<string, string>>({})

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isCommandApprovalRequest(request: UiServerRequest): boolean {
  return request.method === 'item/commandExecution/requestApproval' || request.method === 'execCommandApproval'
}

function isFileApprovalRequest(request: UiServerRequest): boolean {
  return request.method === 'item/fileChange/requestApproval' || request.method === 'applyPatchApproval'
}

function isApprovalRequest(request: UiServerRequest): boolean {
  return isCommandApprovalRequest(request) || isFileApprovalRequest(request)
}

function readRequestReason(request: UiServerRequest): string {
  const params = asRecord(request.params)
  return readString(params?.reason) || readString(params?.prompt)
}

function requestPanelTitle(request: UiServerRequest): string {
  if (isApprovalRequest(request)) return 'Awaiting approval'
  if (request.method === 'item/tool/requestUserInput') return 'Awaiting response'
  if (request.method === 'item/tool/call') return 'Tool call waiting for response'
  return request.method
}

function requestPanelPrompt(request: UiServerRequest): string {
  const explicit = readRequestReason(request)
  if (explicit) return explicit
  if (isCommandApprovalRequest(request)) return 'Do you want to run this command?'
  if (isFileApprovalRequest(request)) return 'Do you want to make these changes?'
  if (request.method === 'item/tool/requestUserInput') return 'Codex needs your answer before it can continue.'
  return 'Codex is waiting for a response before it can continue.'
}

function unwrapApprovalCommand(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''

  const powershellMatch = trimmed.match(/-Command\s+(.+)$/i)
  const rawCommand = powershellMatch?.[1]?.trim() ?? trimmed
  const unquoted = rawCommand.startsWith('"') && rawCommand.endsWith('"')
    ? rawCommand.slice(1, -1)
    : rawCommand

  return unquoted
    .replace(/\\"/g, '"')
    .replace(/`"/g, '"')
    .replace(/""/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function requestPreview(request: UiServerRequest): string {
  const params = asRecord(request.params)
  if (!params) return ''

  if (isCommandApprovalRequest(request)) {
    const commandActions = Array.isArray(params.commandActions) ? params.commandActions : []
    const command = commandActions
      .map((action) => asRecord(action))
      .map((action) => readString(action?.command))
      .find((value) => value.length > 0)

    if (command) return command.replace(/\s+/g, ' ').trim()
    return unwrapApprovalCommand(readString(params.command))
  }

  if (isFileApprovalRequest(request)) {
    return readString(params.grantRoot).replace(/\s+/g, ' ').trim()
  }

  return ''
}

function approvalOptionsForRequest(request: UiServerRequest | null): ApprovalOption[] {
  if (!request || !isApprovalRequest(request)) return []
  return [
    { id: 'accept', label: 'Yes' },
    { id: 'acceptForSession', label: 'Yes for Session' },
  ]
}

const approvalOptions = computed(() => approvalOptionsForRequest(props.request))

watch(
  () => props.request?.id ?? 0,
  () => {
    approvalFreeformText.value = ''
    toolQuestionAnswers.value = {}
    toolQuestionOtherAnswers.value = {}
    selectedApprovalDecision.value = approvalOptions.value[0]?.id ?? 'accept'
  },
  { immediate: true },
)

watch(
  approvalOptions,
  (nextOptions) => {
    if (selectedApprovalDecision.value === 'decline') return
    if (!nextOptions.some((option) => option.id === selectedApprovalDecision.value)) {
      selectedApprovalDecision.value = nextOptions[0]?.id ?? 'accept'
    }
  },
  { immediate: true },
)

function toolQuestionKey(requestId: number, questionId: string): string {
  return `${String(requestId)}:${questionId}`
}

function readToolQuestions(request: UiServerRequest): ParsedToolQuestion[] {
  const params = asRecord(request.params)
  const questions = Array.isArray(params?.questions) ? params.questions : []
  const parsed: ParsedToolQuestion[] = []

  for (const row of questions) {
    const question = asRecord(row)
    if (!question) continue

    const id = readString(question.id)
    if (!id) continue

    const options = Array.isArray(question.options)
      ? question.options
        .map((option) => asRecord(option))
        .map((option) => ({
          label: readString(option?.label),
          description: readString(option?.description),
        }))
        .filter((option) => option.label.length > 0)
      : []

    parsed.push({
      id,
      header: readString(question.header),
      question: readString(question.question),
      isOther: question.isOther === true,
      options,
    })
  }

  return parsed
}

function readQuestionAnswer(requestId: number, questionId: string, fallback: string): string {
  const key = toolQuestionKey(requestId, questionId)
  const saved = toolQuestionAnswers.value[key]
  if (typeof saved === 'string' && saved.length > 0) return saved
  return fallback
}

function readQuestionOtherAnswer(requestId: number, questionId: string): string {
  return toolQuestionOtherAnswers.value[toolQuestionKey(requestId, questionId)] ?? ''
}

function onQuestionAnswerChange(requestId: number, questionId: string, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) return
  const key = toolQuestionKey(requestId, questionId)
  toolQuestionAnswers.value = {
    ...toolQuestionAnswers.value,
    [key]: target.value,
  }
}

function onQuestionOtherAnswerInput(requestId: number, questionId: string, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const key = toolQuestionKey(requestId, questionId)
  toolQuestionOtherAnswers.value = {
    ...toolQuestionOtherAnswers.value,
    [key]: target.value,
  }
}

function selectedOptionDescription(
  requestId: number,
  questionId: string,
  options: Array<{ label: string; description: string }>,
): string {
  const selected = readQuestionAnswer(requestId, questionId, options[0]?.label || '')
  return options.find((option) => option.label === selected)?.description ?? ''
}

function onSelectApprovalOption(decision: ApprovalOption['id']): void {
  selectedApprovalDecision.value = decision
}

function onFocusApprovalOther(): void {
  selectedApprovalDecision.value = 'decline'
}

function onApprovalOtherInput(event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  approvalFreeformText.value = target.value
  selectedApprovalDecision.value = 'decline'
}

function onRespondApproval(request: UiServerRequest, decision: ApprovalDecision): void {
  emit('respondServerRequest', {
    id: request.id,
    result: { decision },
  })
}

function onSubmitApproval(request: UiServerRequest): void {
  const note = approvalFreeformText.value.trim()
  const decision: ApprovalDecision = note.length > 0 ? 'decline' : selectedApprovalDecision.value

  emit('respondServerRequest', {
    id: request.id,
    result: {
      decision,
    },
    followUpMessageText: note || undefined,
  })
}

function onRespondToolRequestUserInput(request: UiServerRequest): void {
  const questions = readToolQuestions(request)
  const answers: Record<string, { answers: string[] }> = {}

  for (const question of questions) {
    const selected = readQuestionAnswer(request.id, question.id, question.options[0]?.label || '')
    const other = readQuestionOtherAnswer(request.id, question.id).trim()
    const values = [selected, other].map((value) => value.trim()).filter((value) => value.length > 0)
    answers[question.id] = { answers: values }
  }

  emit('respondServerRequest', {
    id: request.id,
    result: { answers },
  })
}

function onRespondToolCallFailure(request: UiServerRequest): void {
  emit('respondServerRequest', {
    id: request.id,
    result: {
      success: false,
      contentItems: [
        {
          type: 'inputText',
          text: 'Tool call rejected from CodexUI.',
        },
      ],
    },
  })
}

function onRespondToolCallSuccess(request: UiServerRequest): void {
  emit('respondServerRequest', {
    id: request.id,
    result: {
      success: true,
      contentItems: [],
    },
  })
}

function onRespondEmptyResult(request: UiServerRequest): void {
  emit('respondServerRequest', {
    id: request.id,
    result: {},
  })
}

function onRejectUnknownRequest(request: UiServerRequest): void {
  emit('respondServerRequest', {
    id: request.id,
    error: {
      code: -32000,
      message: 'Rejected from CodexUI.',
    },
  })
}
</script>

<style scoped>
@reference "tailwindcss";

.thread-pending-request {
  @apply w-full px-2 sm:px-6;
}

.thread-pending-request-shell {
  @apply w-full rounded-[1.75rem] border border-zinc-700 bg-zinc-900 px-4 py-4 sm:px-5 sm:py-4 text-zinc-100 shadow-xl;
}

.thread-pending-request-shell--no-top-radius {
  @apply rounded-t-none border-t-0;
}

.thread-pending-request-header {
  @apply flex items-start justify-between gap-3;
}

.thread-pending-request-heading {
  @apply min-w-0 flex-1 flex flex-col gap-1;
}

.thread-pending-request-eyebrow {
  @apply m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400;
}

.thread-pending-request-title {
  @apply m-0 text-[clamp(0.94rem,2vw,1.2rem)] leading-relaxed text-zinc-50 whitespace-pre-wrap break-words;
}

.thread-pending-request-counter {
  @apply shrink-0 rounded-full border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400;
}

.thread-pending-request-command-line,
.thread-pending-request-preview {
  @apply mt-3 rounded-xl bg-zinc-800/85 px-4 py-3 text-sm font-medium text-zinc-100;
}

.thread-pending-request-preview-code {
  @apply block truncate whitespace-nowrap font-mono;
}

.thread-pending-request-approval,
.thread-pending-request-user-input {
  @apply mt-3 flex flex-col gap-2.5;
}

.thread-pending-request-options {
  @apply flex flex-col gap-1.5;
}

.thread-pending-request-option {
  @apply flex h-12 w-full items-center gap-3 rounded-2xl border border-zinc-800 bg-transparent px-4 text-left transition hover:border-zinc-600 hover:bg-zinc-800/70;
}

.thread-pending-request-option.is-selected {
  @apply border-zinc-500 bg-zinc-800/95;
  box-shadow: inset 0 0 0 1px rgba(244, 244, 245, 0.14);
}

.thread-pending-request-option-index {
  @apply shrink-0 text-base font-medium leading-none text-zinc-500;
}

.thread-pending-request-option-label {
  @apply min-w-0 truncate text-sm leading-none text-zinc-50;
}

.thread-pending-request-inline-input {
  @apply flex h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-800/70 px-4 text-sm text-zinc-400 transition focus-within:border-zinc-500 focus-within:bg-zinc-800/90;
}

.thread-pending-request-inline-input.is-active {
  @apply text-zinc-100;
}

.thread-pending-request-inline-control {
  @apply w-full min-w-0 border-none bg-transparent p-0 text-sm leading-none text-zinc-100 outline-none placeholder:text-zinc-500;
}

.thread-pending-request-question {
  @apply rounded-2xl border border-zinc-800 bg-zinc-900/75 px-3 py-3;
}

.thread-pending-request-question-title {
  @apply m-0 text-sm font-medium leading-relaxed text-zinc-50;
}

.thread-pending-request-question-text,
.thread-pending-request-question-description {
  @apply m-0 mt-1 text-xs leading-relaxed text-zinc-400;
}

.thread-pending-request-question-options,
.thread-pending-request-input-wrap {
  @apply mt-3 flex flex-col gap-1.5;
}

.thread-pending-request-select-wrap {
  @apply flex flex-col gap-1.5;
}

.thread-pending-request-select-label {
  @apply text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500;
}

.thread-pending-request-select,
.thread-pending-request-input {
  @apply h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none;
}

.thread-pending-request-select:focus,
.thread-pending-request-input:focus {
  @apply border-zinc-500;
  box-shadow: 0 0 0 1px rgba(244, 244, 245, 0.18);
}

.thread-pending-request-input::placeholder {
  @apply text-zinc-500;
}

.thread-pending-request-actions,
.thread-pending-request-footer {
  @apply mt-3 flex items-center justify-end gap-2;
}

.thread-pending-request-footer--approval {
  @apply mt-0 items-stretch gap-2.5;
}

.thread-pending-request-primary,
.thread-pending-request-secondary {
  @apply h-12 shrink-0 rounded-full border px-5 text-sm font-medium transition;
}

.thread-pending-request-primary {
  @apply border-zinc-100 bg-zinc-100 text-zinc-950 hover:bg-white;
}

.thread-pending-request-secondary {
  @apply border-zinc-700 bg-transparent text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800;
}

@media (max-width: 640px) {
  .thread-pending-request-shell {
    @apply rounded-[1.5rem] px-3 py-3;
  }

  .thread-pending-request-footer--approval {
    @apply flex-wrap;
  }

  .thread-pending-request-inline-input {
    @apply basis-full;
  }
}
</style>
