<template>
  <ComposerPopover
    :open="open"
    align="start"
    width="lg"
    :aria-label="t('Add photos & files')"
    @update:open="emit('update:open', $event)"
  >
    <template #trigger>
      <button
        class="thread-composer-attach-trigger"
        type="button"
        :aria-label="t('Add photos & files')"
        :disabled="isInteractionDisabled"
        @click="toggleAttachMenu"
      >
        +
      </button>
    </template>
    <button
      class="thread-composer-attach-item"
      type="button"
      :disabled="isInteractionDisabled"
      @click="triggerPhotoLibrary"
    >
      {{ t('Add photos & files') }}
    </button>
    <button
      class="thread-composer-attach-item"
      type="button"
      :disabled="isInteractionDisabled"
      @click="triggerFolderPicker"
    >
      {{ t('Add folder') }}
    </button>
    <button
      class="thread-composer-attach-item"
      type="button"
      :disabled="isInteractionDisabled"
      @click="triggerCameraCapture"
    >
      {{ t('Take photo') }}
    </button>
    <div class="thread-composer-attach-separator" />
    <div class="thread-composer-attach-mode">
      <span class="thread-composer-attach-mode-label">{{ t('In-progress send') }}</span>
      <div class="thread-composer-attach-mode-buttons">
        <button
          class="thread-composer-attach-mode-button"
          :class="{ 'is-active': activeInProgressMode === 'steer' }"
          type="button"
          :disabled="isInteractionDisabled"
          @click="setActiveInProgressMode('steer')"
        >
          {{ t('Steer') }}
        </button>
        <button
          class="thread-composer-attach-mode-button"
          :class="{ 'is-active': activeInProgressMode === 'queue' }"
          type="button"
          :disabled="isInteractionDisabled"
          @click="setActiveInProgressMode('queue')"
        >
          {{ t('Queue') }}
        </button>
      </div>
    </div>
    <template v-if="isMobile">
      <div class="thread-composer-attach-separator" />
      <div class="thread-composer-attach-mode">
        <span class="thread-composer-attach-mode-label">{{ t('Plan mode') }}</span>
        <div class="thread-composer-attach-mode-buttons">
          <button
            v-for="choice in collaborationModeChoices"
            :key="`mobile-plan-${choice.value}`"
            class="thread-composer-attach-mode-button"
            :class="{ 'is-active': selectedCollaborationMode === choice.value }"
            type="button"
            :disabled="choice.disabled || isComposerConfigDisabled"
            @click="onMobileCollaborationModeSelect(choice.value)"
          >
            {{ t(choice.labelKey) }}
          </button>
        </div>
      </div>
      <div class="thread-composer-attach-separator" />
      <div class="thread-composer-attach-mode">
        <span class="thread-composer-attach-mode-label">{{ t('Approval policy') }}</span>
        <div class="thread-composer-attach-mode-buttons">
          <button
            v-for="choice in approvalPolicyChoices"
            :key="`mobile-approval-${choice.value}`"
            class="thread-composer-attach-mode-button"
            :class="{ 'is-active': approvalPolicy === choice.value }"
            type="button"
            :disabled="isApprovalPolicySaving"
            @click="onApprovalPolicySelect(choice.value)"
          >
            {{ t(choice.label) }}
          </button>
        </div>
      </div>
      <p v-if="approvalPolicyError" class="thread-composer-menu-error" role="alert">{{ approvalPolicyError }}</p>
      <Transition name="approval-tip">
        <span v-if="approvalPolicyNotice" class="thread-composer-approval-tip" role="status">{{ approvalPolicyNotice }}</span>
      </Transition>
    </template>
  </ComposerPopover>
</template>

<script setup lang="ts">
import type { CollaborationModeKind } from '../../types/codex'
import { useUiLanguage } from '../../composables/useUiLanguage'
import ComposerPopover from './ComposerPopover.vue'

type CollaborationModeChoice = {
  value: CollaborationModeKind
  labelKey: string
  disabled: boolean
}

type ApprovalPolicyChoice = {
  value: string
  label: string
}

const props = defineProps<{
  open: boolean
  isMobile?: boolean
  isInteractionDisabled: boolean
  isComposerConfigDisabled: boolean
  isApprovalPolicySaving?: boolean
  approvalPolicy?: string
  approvalPolicyError?: string
  approvalPolicyNotice?: string
  selectedCollaborationMode: CollaborationModeKind
  collaborationModeChoices: CollaborationModeChoice[]
  approvalPolicyChoices: ApprovalPolicyChoice[]
  activeInProgressMode: 'steer' | 'queue'
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'toggle': []
  'set-active-mode': [mode: 'steer' | 'queue']
  'select-photo': []
  'select-folder': []
  'capture-camera': []
  'select-collaboration-mode': [mode: CollaborationModeKind]
  'select-approval-policy': [value: string]
}>()

const { t } = useUiLanguage()

function toggleAttachMenu(): void {
  emit('toggle')
}
function setActiveInProgressMode(mode: 'steer' | 'queue'): void {
  emit('set-active-mode', mode)
}
function triggerPhotoLibrary(): void {
  emit('select-photo')
}
function triggerFolderPicker(): void {
  emit('select-folder')
}
function triggerCameraCapture(): void {
  emit('capture-camera')
}
function onMobileCollaborationModeSelect(mode: CollaborationModeKind): void {
  emit('select-collaboration-mode', mode)
}
function onApprovalPolicySelect(value: string): void {
  emit('select-approval-policy', value)
}
</script>

<style scoped>
@reference "tailwindcss";

.thread-composer-attach-trigger {
  @apply inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-none border-0 bg-transparent pb-px text-xl leading-tight text-zinc-700 transition hover:text-zinc-900 disabled:cursor-not-allowed disabled:text-zinc-400;
}

.thread-composer-attach-item {
  @apply block w-full rounded-lg border-0 bg-transparent px-3 py-2 text-left text-sm text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400;
}

.thread-composer-attach-separator {
  @apply my-1 h-px bg-zinc-100;
}

.thread-composer-attach-mode {
  @apply px-3 py-2 flex flex-wrap items-center justify-between gap-2;
}

.thread-composer-attach-mode-label {
  @apply text-sm text-zinc-800;
}

.thread-composer-attach-mode-buttons {
  @apply inline-flex items-center rounded-full border border-zinc-200 bg-white p-0.5;
}

.thread-composer-attach-mode-button {
  @apply rounded-full border-0 bg-transparent px-2 py-1 text-xs text-zinc-600 transition hover:text-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-400;
}

.thread-composer-attach-mode-button.is-active {
  @apply bg-zinc-900 text-white hover:text-white;
}

.thread-composer-menu-error {
  @apply px-3 py-1 text-xs text-red-600;
}

.thread-composer-approval-tip {
  @apply pointer-events-none absolute bottom-11 left-1/2 z-30 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 shadow-sm;
  transform: translateX(-50%);
}

.approval-tip-enter-active,
.approval-tip-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.approval-tip-enter-from,
.approval-tip-leave-to {
  opacity: 0;
  transform: translate(-50%, 4px);
}

.approval-tip-enter-to,
.approval-tip-leave-from {
  opacity: 1;
  transform: translate(-50%, 0);
}
</style>