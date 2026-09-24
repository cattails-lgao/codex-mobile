<template>
  <div class="sidebar-settings-account-section">
    <div class="sidebar-settings-account-header">
      <div class="sidebar-settings-account-header-main">
        <button
          class="sidebar-settings-account-collapse"
          type="button"
          :aria-expanded="!isAccountsSectionCollapsed"
          :title="isAccountsSectionCollapsed ? t('Expand accounts') : t('Collapse accounts')"
          @click="toggleAccountsSectionCollapsed"
        >
          <span class="sidebar-settings-account-collapse-icon">{{ isAccountsSectionCollapsed ? '▸' : '▾' }}</span>
        </button>
        <span class="sidebar-settings-account-title">{{ t('Accounts') }}</span>
        <span class="sidebar-settings-account-count">{{ accounts.length }}</span>
      </div>
      <button
        class="sidebar-settings-account-refresh"
        type="button"
        :disabled="isRefreshingAccounts || isSwitchingAccounts || isStartingCodexLogin || isCompletingCodexLogin"
        @click="onRefreshAccounts"
      >
        {{ isRefreshingAccounts ? t('Reloading…') : t('Reload') }}
      </button>
    </div>
    <template v-if="!isAccountsSectionCollapsed">
      <div v-if="accountActionError" class="sidebar-settings-account-error visible-error-with-feedback">
        <span>{{ accountActionError }}</span>
        <a class="visible-error-feedback" :href="feedbackMailto" @click="prepareFeedbackLink($event, accountActionError)">{{ t('Send feedback') }}</a>
      </div>
      <div class="sidebar-settings-account-login">
        <button
          class="sidebar-settings-account-login-button"
          type="button"
          :disabled="isRefreshingAccounts || isSwitchingAccounts || isStartingCodexLogin || isCompletingCodexLogin"
          @click="onStartCodexLogin"
        >
          {{ isStartingCodexLogin ? t('Starting login…') : t('Login') }}
        </button>
        <a
          v-if="codexLoginUrl"
          class="sidebar-settings-account-login-link"
          :href="codexLoginUrl"
          target="_blank"
          rel="noreferrer"
        >
          {{ t('Open login URL') }}
        </a>
      </div>
      <p v-if="accounts.length === 0" class="sidebar-settings-account-empty">
        {{ t('Click Login, or run `codex login`, then click reload.') }}
      </p>
      <div v-else class="sidebar-settings-account-list">
      <article
        v-for="account in accounts"
        :key="account.storageId"
        class="sidebar-settings-account-item"
        :class="{
          'is-active': account.isActive,
          'is-unavailable': isAccountUnavailable(account),
          'is-confirming-remove': isRemoveConfirmationActive(account),
          'is-remove-visible': isRemoveVisible(account),
        }"
        :title="buildAccountTitle(account)"
        @mouseenter="onAccountCardPointerEnter(account.storageId)"
        @mouseleave="onAccountCardPointerLeave(account.storageId)"
      >
        <div class="sidebar-settings-account-main">
          <p class="sidebar-settings-account-email">{{ account.email || t('Account') }}</p>
          <p class="sidebar-settings-account-meta">
            {{ formatAccountMeta(account) }}
          </p>
          <p class="sidebar-settings-account-quota">
            {{ formatAccountQuota(account) }}
          </p>
          <p class="sidebar-settings-account-id">
            Workspace {{ shortAccountId(account.accountId) }}
          </p>
        </div>
        <div class="sidebar-settings-account-actions">
          <button
            class="sidebar-settings-account-switch"
            type="button"
            :disabled="isAccountActionDisabled(account) || account.isActive || isAccountUnavailable(account)"
            @click="onSwitchAccount(account.storageId)"
          >
            {{ getAccountSwitchLabel(account) }}
          </button>
          <button
            class="sidebar-settings-account-remove"
            :class="{
              'is-visible': isRemoveVisible(account),
              'is-confirming': isRemoveConfirmationActive(account),
            }"
            type="button"
            :disabled="isAccountActionDisabled(account)"
            @click="onRemoveAccount(account.storageId)"
          >
            {{ getAccountRemoveLabel(account) }}
          </button>
        </div>
      </article>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useUiLanguage } from '../../composables/useUiLanguage'
import type { UiAccountEntry } from '../../types/codex'

const { t } = useUiLanguage()

defineProps<{
  accounts: UiAccountEntry[]
  isAccountsSectionCollapsed: boolean
  isRefreshingAccounts: boolean
  isSwitchingAccounts: boolean
  isStartingCodexLogin: boolean
  isCompletingCodexLogin: boolean
  accountActionError: string
  codexLoginUrl: string
  feedbackMailto: string
  isAccountUnavailable: (account: UiAccountEntry) => boolean
  isRemoveConfirmationActive: (account: UiAccountEntry) => boolean
  isRemoveVisible: (account: UiAccountEntry) => boolean
  buildAccountTitle: (account: UiAccountEntry) => string
  formatAccountMeta: (account: UiAccountEntry) => string
  formatAccountQuota: (account: UiAccountEntry) => string
  shortAccountId: (accountId: string) => string
  isAccountActionDisabled: (account: UiAccountEntry) => boolean
  getAccountSwitchLabel: (account: UiAccountEntry) => string
  getAccountRemoveLabel: (account: UiAccountEntry) => string
  onRefreshAccounts: () => void
  onStartCodexLogin: () => void
  onSwitchAccount: (storageId: string) => void
  onRemoveAccount: (storageId: string) => void
  onAccountCardPointerEnter: (accountId: string) => void
  onAccountCardPointerLeave: (accountId: string) => void
  toggleAccountsSectionCollapsed: () => void
  prepareFeedbackLink: (event: MouseEvent, message?: string) => void
}>()
</script>

<style scoped>
@reference "../../style.css";

.sidebar-settings-account-section {
  @apply border-t border-line-1 bg-s0/60 px-3 py-3;
}

.sidebar-settings-account-header {
  @apply mb-2 flex items-center justify-between gap-2;
}

.sidebar-settings-account-header-main {
  @apply flex items-center gap-2;
}

.sidebar-settings-account-collapse {
  @apply inline-flex h-5 w-5 items-center justify-center rounded border border-line-1 bg-s2 text-ink-3 transition hover:bg-s1;
}

.sidebar-settings-account-collapse-icon {
  @apply text-micro leading-none;
}

.sidebar-settings-account-title {
  @apply text-sm font-medium text-ink-2;
}

.sidebar-settings-account-count {
  @apply rounded bg-line-1 px-1.5 py-0.5 text-micro text-ink-3;
}

.sidebar-settings-account-error {
  @apply mb-2 rounded-md bg-alert/10 px-2 py-1.5 text-xs text-alert;
}

.sidebar-settings-account-refresh {
  @apply shrink-0 rounded-full border border-line-1 bg-s2 px-2.5 py-1 text-xs text-ink-2 transition hover:bg-s0 disabled:cursor-default disabled:opacity-60;
}

.sidebar-settings-account-login {
  @apply mb-2 flex items-center gap-2;
}

.sidebar-settings-account-login-button {
  @apply shrink-0 rounded-full border border-line-1 bg-s2 px-3 py-1 text-xs font-medium text-ink-2 transition hover:bg-s0 disabled:cursor-default disabled:opacity-60;
}

.sidebar-settings-account-login-link {
  @apply min-w-0 truncate text-xs text-ink-1 hover:text-ink-1 hover:underline;
}

.sidebar-settings-account-empty {
  @apply text-xs text-ink-3;
}

.sidebar-settings-account-list {
  @apply flex flex-col gap-2;
}

.sidebar-settings-account-item {
  @apply flex items-center gap-2 rounded-lg border border-line-1 bg-s2 px-2.5 py-2;
}

.sidebar-settings-account-item.is-active {
  @apply border-ok bg-ok;
}

.sidebar-settings-account-item.is-unavailable {
  @apply border-alert bg-alert;
}

.sidebar-settings-account-main {
  @apply min-w-0 flex-1;
}

.sidebar-settings-account-actions {
  @apply flex w-24 shrink-0 flex-col items-end gap-1.5;
}

.sidebar-settings-account-email {
  @apply truncate text-sm text-ink-2;
}

.sidebar-settings-account-meta {
  @apply truncate text-micro text-ink-3;
}

.sidebar-settings-account-quota {
  @apply truncate text-micro text-ink-3;
}

.sidebar-settings-account-id {
  @apply mt-1 inline-flex max-w-full rounded-full bg-s1 px-2 py-0.5 font-mono text-micro text-ink-2;
}

.sidebar-settings-account-item.is-active .sidebar-settings-account-id {
  @apply bg-ok/15 text-ok;
}

.sidebar-settings-account-item.is-unavailable .sidebar-settings-account-id {
  @apply bg-alert/15 text-alert;
}

.sidebar-settings-account-switch {
  @apply min-w-[4.75rem] shrink-0 rounded-full border border-line-1 bg-s2 px-2.5 py-1 text-center text-xs text-ink-2 transition hover:bg-s0 disabled:cursor-default disabled:opacity-60;
}

.sidebar-settings-account-remove {
  @apply invisible shrink-0 rounded-full border border-live bg-s2 px-2 py-0.5 text-nano leading-4 text-ink-3 opacity-0 pointer-events-none transition-colors hover:bg-live disabled:cursor-default disabled:opacity-60;
}

.sidebar-settings-account-remove.is-visible {
  @apply visible opacity-100 pointer-events-auto;
}

.sidebar-settings-account-remove.is-confirming {
  @apply border-live/40 bg-live/10 text-live font-medium;
}

.visible-error-with-feedback {
  @apply flex items-start justify-between gap-3;
}

.visible-error-feedback {
  @apply shrink-0 rounded-full border border-alert/30 bg-s2 px-2.5 py-1 text-xs font-semibold text-alert transition hover:bg-alert/15 focus:outline-none focus:ring-2 focus:ring-alert;
}

:global(:root.dark) .visible-error-feedback {
  @apply border-rose-700 bg-s1 text-rose-300 hover:bg-s2;
}
</style>