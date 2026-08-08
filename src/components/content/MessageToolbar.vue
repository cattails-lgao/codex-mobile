<template>
  <div
    v-if="showEdit || showFork || showCopy"
    class="message-toolbar"
    :data-role="role"
  >
    <button
      v-if="showEdit"
      type="button"
      class="message-rollback-button"
      :aria-label="t('Rollback this message')"
      :title="t('Rollback this message')"
      @click="$emit('edit')"
    >
      <IconTablerArrowBackUp class="icon-svg message-rollback-icon" />
      <span v-if="role !== 'user'" class="message-rollback-label">{{ t('Rollback') }}</span>
    </button>
    <button
      v-if="showFork"
      type="button"
      class="message-fork-button"
      :aria-label="t('Fork thread from this response')"
      :title="t('Fork thread from this response')"
      @click="$emit('fork')"
    >
      <IconTablerGitFork class="icon-svg message-fork-icon" />
      <span class="message-fork-label">{{ t('Fork') }}</span>
    </button>
    <button
      v-if="showCopy"
      type="button"
      class="message-copy-button"
      :data-copied="copied"
      :aria-label="copied ? t('Response copied') : t('Copy response')"
      :title="copied ? t('Response copied') : t('Copy response')"
      @click="$emit('copy')"
    >
      <IconTablerCopy class="icon-svg message-copy-icon" />
      <span class="message-copy-label">{{ copied ? 'Copied' : 'Copy' }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { useUiLanguage } from '../../composables/useUiLanguage'
import IconTablerArrowBackUp from '../icons/IconTablerArrowBackUp.vue'
import IconTablerCopy from '../icons/IconTablerCopy.vue'
import IconTablerGitFork from '../icons/IconTablerGitFork.vue'

withDefaults(defineProps<{
  role: string
  showEdit?: boolean
  showFork?: boolean
  showCopy?: boolean
  copied?: boolean
}>(), {
  showEdit: false,
  showFork: false,
  showCopy: false,
  copied: false,
})

defineEmits<{
  edit: []
  fork: []
  copy: []
}>()

const { t } = useUiLanguage()
</script>

<style scoped>
@reference "tailwindcss";

.message-toolbar {
  @apply mt-1 self-start flex items-center gap-1 opacity-[0.01] transition-opacity duration-200;
}

/* round-23：用户消息下的操作条默认常显（无需 hover）、图标化、整体右对齐 */
.message-toolbar[data-role='user'] {
  @apply self-end opacity-100;
}

/* hover 显隐规则放在组件 scoped 内会被 Vue scoped + `:global()` 组合编译坏
   （实测产物为 `.message-row:hover { opacity: 1 }`，作用在行上而非工具栏，
   工具栏永不显示），已迁移到全局 style.css：
   `.message-row:hover .message-toolbar { opacity: 1 }`。 */

.message-fork-button {
  @apply inline-flex items-center gap-0.5 px-0.5 py-0 text-[11px] font-medium leading-none text-slate-500 transition hover:text-slate-900;
}

/* round-24：用户消息下回退与复制按钮统一风格（同为朴素 icon 按钮）并加大：
   之前回退按钮是无边框琥珀文字、复制按钮是带边框胶囊，两者风格不一且偏小。
   现在统一为同款「图标 + 可选文字」按钮：同字号、同间距、同 hover 背景。 */
.message-rollback-button,
.message-copy-button {
  @apply inline-flex items-center gap-0.5 rounded-full px-1.5 py-1 text-[11px] font-medium leading-none transition;
}

.message-rollback-button {
  @apply text-amber-600/80 hover:bg-amber-50 hover:text-amber-700;
}

.message-copy-button {
  @apply text-slate-500 hover:bg-slate-100 hover:text-slate-900;
}

.message-copy-button[data-copied='true'] {
  @apply text-emerald-700 hover:bg-emerald-50 hover:text-emerald-700;
}

.message-fork-icon,
.message-copy-icon,
.message-rollback-icon {
  @apply text-sm;
}

.message-fork-label,
.message-copy-label,
.message-rollback-label {
  @apply leading-none;
}
</style>
