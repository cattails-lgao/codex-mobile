<template>
<Teleport to="body">
  <div
    class="settings-dialog-backdrop"
    role="presentation"
    @click.self="onClose"
  >
    <div
      ref="settingsPanelRef"
      class="sidebar-settings-panel"
      role="dialog"
      aria-modal="true"
      :aria-label="t('Settings')"
      @click.stop
    >
      <div class="settings-dialog-header">
        <h2 class="settings-dialog-title">{{ t('Settings') }}</h2>
        <button
          class="settings-dialog-close"
          type="button"
          :aria-label="t('Close')"
          :title="t('Close')"
          @click="onClose"
        >
          <IconTablerX class="settings-dialog-close-icon" />
        </button>
      </div>
      <div class="settings-dialog-body">
        <nav class="settings-group-nav" :aria-label="t('Settings groups')">
          <button
            v-for="group in settingsGroups"
            :key="group.id"
            type="button"
            class="settings-group-nav-item"
            :class="{ 'is-active': activeSettingsGroup === group.id }"
            :aria-current="activeSettingsGroup === group.id ? 'true' : undefined"
            @click="onActiveSettingsGroupChange(group.id)"
          >
            {{ t(group.label) }}
          </button>
        </nav>
        <div class="settings-group-content">
        <div v-show="activeSettingsGroup === 'general'">
      <SettingsAccountsPanel
        :accounts="accounts"
        :is-accounts-section-collapsed="isAccountsSectionCollapsed"
        :is-refreshing-accounts="isRefreshingAccounts"
        :is-switching-accounts="isSwitchingAccounts"
        :is-starting-codex-login="isStartingCodexLogin"
        :is-completing-codex-login="isCompletingCodexLogin"
        :account-action-error="accountActionError"
        :codex-login-url="codexLoginUrl"
        :feedback-mailto="feedbackMailto"
        :is-account-unavailable="isAccountUnavailable"
        :is-remove-confirmation-active="isRemoveConfirmationActive"
        :is-remove-visible="isRemoveVisible"
        :build-account-title="buildAccountTitle"
        :format-account-meta="formatAccountMeta"
        :format-account-quota="formatAccountQuota"
        :short-account-id="shortAccountId"
        :is-account-action-disabled="isAccountActionDisabled"
        :get-account-switch-label="getAccountSwitchLabel"
        :get-account-remove-label="getAccountRemoveLabel"
        :on-refresh-accounts="onRefreshAccounts"
        :on-start-codex-login="onStartCodexLogin"
        :on-switch-account="onSwitchAccount"
        :on-remove-account="onRemoveAccount"
        :on-account-card-pointer-enter="onAccountCardPointerEnter"
        :on-account-card-pointer-leave="onAccountCardPointerLeave"
        :toggle-accounts-section-collapsed="toggleAccountsSectionCollapsed"
        :prepare-feedback-link="prepareFeedbackLink"
      />
      <button class="sidebar-settings-row" type="button" :title="SETTINGS_HELP.sendWithEnter" @click="toggleSendWithEnter">
        <span class="sidebar-settings-label">{{ t('Require ⌘ + enter to send') }}</span>
        <span class="sidebar-settings-toggle" :class="{ 'is-on': !sendWithEnter }" />
      </button>
      <button class="sidebar-settings-row" type="button" :title="SETTINGS_HELP.inProgressSendMode" @click="cycleInProgressSendMode">
        <span class="sidebar-settings-label">{{ t('When busy, send as') }}</span>
        <span class="sidebar-settings-value">{{ inProgressSendMode === 'steer' ? t('Steer') : t('Queue') }}</span>
      </button>
      <button class="sidebar-settings-row" type="button" :title="SETTINGS_HELP.appearance" @click="cycleDarkMode">
        <span class="sidebar-settings-label">{{ t('Appearance') }}</span>
        <span class="sidebar-settings-value">{{ darkMode === 'system' ? t('System') : darkMode === 'dark' ? t('Dark') : t('Light') }}</span>
      </button>
      <div class="sidebar-settings-row sidebar-settings-row--select" :title="t('Choose the interface language for the app.')">
        <span class="sidebar-settings-label">{{ t('UI language') }}</span>
        <ComposerDropdown
          class="sidebar-settings-provider-dropdown"
          :model-value="uiLanguage"
          :options="uiLanguageOptions"
          :placeholder="t('UI language')"
          menu-align="end"
          @update:model-value="onUiLanguageChange($event as 'en' | 'zh-CN')"
        />
      </div>
      <button class="sidebar-settings-row" type="button" :title="SETTINGS_HELP.chatWidth" @click="cycleChatWidth">
        <span class="sidebar-settings-label">{{ t('Chat width') }}</span>
        <span class="sidebar-settings-value">{{ chatWidthLabel }}</span>
      </button>
      <button class="sidebar-settings-row" type="button" :title="SETTINGS_HELP.dictationClickToToggle" @click="toggleDictationClickToToggle">
        <span class="sidebar-settings-label">{{ t('Click to toggle dictation') }}</span>
        <span class="sidebar-settings-toggle" :class="{ 'is-on': dictationClickToToggle }" />
      </button>
      <button class="sidebar-settings-row" type="button" :title="SETTINGS_HELP.dictationAutoSend" @click="toggleDictationAutoSend">
        <span class="sidebar-settings-label">{{ t('Auto send dictation') }}</span>
        <span class="sidebar-settings-toggle" :class="{ 'is-on': dictationAutoSend }" />
      </button>
      <div class="sidebar-settings-row sidebar-settings-row--select" :title="SETTINGS_HELP.dictationLanguage">
        <span class="sidebar-settings-label">{{ t('Dictation language') }}</span>
        <ComposerDropdown
          class="sidebar-settings-language-dropdown"
          :model-value="dictationLanguage"
          :options="dictationLanguageOptions"
          :placeholder="t('Auto-detect')"
          open-direction="up"
          :enable-search="true"
          :search-placeholder="t('Search language...')"
          @update:model-value="onDictationLanguageChange"
        />
      </div>
      <div class="sidebar-settings-row sidebar-settings-row--select" :title="t('Auto-compact at or below remaining context percentage. 0 disables auto-compaction and falls back to server-side compaction.')">
        <span class="sidebar-settings-label">{{ t('Auto-compact before send') }}</span>
        <ComposerDropdown
          class="sidebar-settings-auto-compact-dropdown"
          :model-value="String(autoCompactThreshold)"
          :options="autoCompactThresholdOptions"
          :placeholder="t('Off')"
          menu-align="end"
          @update:model-value="onAutoCompactThresholdChange"
        />
      </div>
      <a
        v-if="hasVisibleFeedbackError"
        class="sidebar-settings-row sidebar-settings-feedback-row"
        :href="feedbackMailto"
        @click="prepareFeedbackLink"
      >
        <span class="sidebar-settings-label">{{ t('Send feedback') }}</span>
        <span class="sidebar-settings-value">{{ t('Issue detected') }}</span>
      </a>

        </div>
        <div v-show="activeSettingsGroup === 'models'">
      <div class="sidebar-settings-row sidebar-settings-row--select" :title="t('Choose the API provider for the Codex backend')">
        <span class="sidebar-settings-label">{{ t('Provider') }}</span>
        <ComposerDropdown
          class="sidebar-settings-provider-dropdown"
          :model-value="selectedProvider"
          :options="providerDropdownOptions"
          :placeholder="t('Provider')"
          :disabled="freeModeLoading"
          menu-align="end"
          @update:model-value="onProviderChange"
        />
      </div>
      <div v-if="providerError" class="sidebar-settings-row sidebar-settings-error">
        <span>{{ providerError }}</span>
        <a class="visible-error-feedback" :href="feedbackMailto" @click="prepareFeedbackLink($event, providerError)">{{ t('Send feedback') }}</a>
      </div>
      <div v-if="selectedProvider === 'openrouter'" class="sidebar-settings-row sidebar-settings-row--input">
        <div class="sidebar-settings-provider-info">
          <span class="sidebar-settings-label">{{ t('OpenRouter API key') }}</span>
          <a
            class="sidebar-settings-provider-link"
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noopener noreferrer"
          >{{ t('Get API key') }}</a>
        </div>
        <div class="sidebar-settings-key-group">
          <template v-if="freeModeHasCustomKey && !freeModeCustomKey">
            <span class="sidebar-settings-key-masked">{{ freeModeCustomKeyMasked }}</span>
            <button
              class="sidebar-settings-key-clear"
              type="button"
              :disabled="freeModeCustomKeySaving"
              :title="t('Remove custom key, use community keys')"
              @click="clearFreeModeCustomKey"
            >&#x2715;</button>
          </template>
          <template v-else>
            <input
              :model-value="freeModeCustomKey"
                      @input="onFreeModeCustomKeyChange(($event.target as HTMLInputElement).value)"
              class="sidebar-settings-key-input"
              type="password"
              :placeholder="t('sk-or-v1-... (optional, uses free keys if empty)')"
              @keydown.enter="saveFreeModeCustomKey"
            />
            <button
              class="sidebar-settings-key-save"
              type="button"
              :disabled="freeModeCustomKeySaving || !freeModeCustomKey.trim()"
              @click="saveFreeModeCustomKey"
            >{{ freeModeCustomKeySaving ? '...' : t('Set') }}</button>
          </template>
        </div>
        <div class="sidebar-settings-row sidebar-settings-row--select" style="margin-top: 4px; padding: 0">
          <span class="sidebar-settings-label">{{ t('API format') }}</span>
          <div class="sidebar-settings-segmented" role="group" :aria-label="t('OpenRouter API format')">
            <button
              type="button"
              class="sidebar-settings-segmented-option"
              :class="{ 'is-active': openRouterWireApi === 'responses' }"
              :disabled="freeModeCustomKeySaving || freeModeLoading"
              @click="setOpenRouterWireApi('responses')"
            >
              {{ t('Responses') }}
            </button>
            <button
              type="button"
              class="sidebar-settings-segmented-option"
              :class="{ 'is-active': openRouterWireApi === 'chat' }"
              :disabled="freeModeCustomKeySaving || freeModeLoading"
              @click="setOpenRouterWireApi('chat')"
            >
              {{ t('Completions') }}
            </button>
          </div>
        </div>
      </div>
      <div v-if="selectedProvider === 'opencode-zen'" class="sidebar-settings-row sidebar-settings-row--input">
        <div class="sidebar-settings-provider-info">
          <span class="sidebar-settings-label">{{ t('OpenCode Zen API key') }}</span>
          <a
            class="sidebar-settings-provider-link"
            href="https://opencode.ai/auth"
            target="_blank"
            rel="noopener noreferrer"
          >{{ t('Get API key') }}</a>
        </div>
        <div class="sidebar-settings-key-group">
          <input
            :model-value="opencodeZenKey"
                    @input="onOpencodeZenKeyChange(($event.target as HTMLInputElement).value)"
            class="sidebar-settings-key-input"
            type="password"
            :placeholder="t('sk-...')"
            @keydown.enter="saveOpencodeZen"
          />
          <button
            class="sidebar-settings-key-save"
            type="button"
            :disabled="freeModeCustomKeySaving || !opencodeZenKey.trim()"
            @click="saveOpencodeZen"
          >{{ freeModeCustomKeySaving ? '...' : t('Save') }}</button>
        </div>
      </div>
      <div v-if="selectedProvider === 'custom'" class="sidebar-settings-row sidebar-settings-row--input">
        <span class="sidebar-settings-label">{{ t('Custom endpoint URL') }}</span>
        <div class="sidebar-settings-key-group">
          <input
            :model-value="customEndpointUrl"
                    @input="onCustomEndpointUrlChange(($event.target as HTMLInputElement).value)"
            class="sidebar-settings-key-input"
            type="url"
            :placeholder="t('https://api.example.com/v1')"
            @keydown.enter="saveCustomEndpoint"
          />
        </div>
        <span class="sidebar-settings-label" style="margin-top: 4px">{{ t('API key') }}</span>
        <div class="sidebar-settings-key-group">
          <input
            :model-value="customEndpointKey"
                    @input="onCustomEndpointKeyChange(($event.target as HTMLInputElement).value)"
            class="sidebar-settings-key-input"
            type="password"
            :placeholder="t('Bearer token (optional)')"
            @keydown.enter="saveCustomEndpoint"
          />
          <button
            class="sidebar-settings-key-save"
            type="button"
            :disabled="freeModeCustomKeySaving || !customEndpointUrl.trim()"
            @click="saveCustomEndpoint"
          >{{ freeModeCustomKeySaving ? '...' : t('Save') }}</button>
        </div>
        <div class="sidebar-settings-row sidebar-settings-row--select" style="margin-top: 4px; padding: 0">
          <span class="sidebar-settings-label">{{ t('API format') }}</span>
          <div class="sidebar-settings-segmented" role="group" :aria-label="t('Custom endpoint API format')">
            <button
              type="button"
              class="sidebar-settings-segmented-option"
              :class="{ 'is-active': customEndpointWireApi === 'responses' }"
              @click="onCustomEndpointWireApiChange('responses')"
            >
              {{ t('Responses') }}
            </button>
            <button
              type="button"
              class="sidebar-settings-segmented-option"
              :class="{ 'is-active': customEndpointWireApi === 'chat' }"
              @click="onCustomEndpointWireApiChange('chat')"
            >
              {{ t('Completions') }}
            </button>
          </div>
        </div>
      </div>
        </div>
        <div v-show="activeSettingsGroup === 'integrations'">
      <button class="sidebar-settings-row" type="button" aria-live="polite" @click="onTelegramConfigOpenChange(!isTelegramConfigOpen)">
        <span class="sidebar-settings-label">{{ t('Telegram') }}</span>
        <span class="sidebar-settings-value">{{ telegramStatusText }}</span>
      </button>
      <div v-if="isTelegramConfigOpen" class="sidebar-settings-telegram-panel">
        <label class="sidebar-settings-field">
          <span class="sidebar-settings-field-label">{{ t('Bot token') }}</span>
          <input
            :value="telegramBotTokenDraft"
                    @input="onTelegramBotTokenDraftChange(($event.target as HTMLInputElement).value)"
            class="sidebar-settings-input"
            type="password"
            placeholder="123456:ABCDEF"
            autocomplete="off"
            spellcheck="false"
          >
        </label>
        <label class="sidebar-settings-field">
          <span class="sidebar-settings-field-label">{{ t('Allowed Telegram user IDs') }}</span>
          <textarea
            :value="telegramAllowedUserIdsDraft"
                    @input="onTelegramAllowedUserIdsDraftChange(($event.target as HTMLTextAreaElement).value)"
            class="sidebar-settings-textarea"
            rows="3"
            placeholder="123456789&#10;987654321"
            spellcheck="false"
          />
        </label>
        <div class="sidebar-settings-field-help">
          {{ t('Put one Telegram user ID per line or separate them with commas. Use `*` to allow all Telegram users. Unauthorized users will see their own ID in the rejection message so they can copy it here.') }}
        </div>
        <div v-if="telegramConfigError" class="sidebar-settings-telegram-error">
          <span>{{ telegramConfigError }}</span>
          <a class="visible-error-feedback" :href="feedbackMailto" @click="prepareFeedbackLink($event, telegramConfigError)">{{ t('Send feedback') }}</a>
        </div>
        <div class="sidebar-settings-telegram-actions">
          <button
            class="sidebar-settings-telegram-save"
            type="button"
            :disabled="isTelegramSaving"
            @click="saveTelegramConfig"
          >
            {{ isTelegramSaving ? t('Saving…') : t('Save Telegram config') }}
          </button>
        </div>
      </div>
      <div class="sidebar-settings-hooks-section">
        <div class="sidebar-settings-hooks-header">
          <span class="sidebar-settings-hooks-title">{{ t('Hooks') }}</span>
          <button
            class="sidebar-settings-hooks-reload"
            type="button"
            :disabled="isHooksLoading"
            :title="t('Reload lifecycle hooks')"
            @click="refreshHooks({ force: true })"
          >
            {{ isHooksLoading ? t('Reloading…') : t('Reload') }}
          </button>
        </div>
        <p v-if="!supportsHooks" class="sidebar-settings-hooks-empty">
          {{ t('Hooks are not supported by this Codex version.') }}
        </p>
        <template v-else>
          <p v-if="isHooksLoading" class="sidebar-settings-hooks-empty">{{ t('Loading hooks…') }}</p>
          <p v-else-if="hooksList.length === 0" class="sidebar-settings-hooks-empty">{{ t('No hooks registered.') }}</p>
          <div v-else class="sidebar-settings-hooks-list">
            <div v-for="entry in hooksList" :key="entry.cwd || '__global__'" class="sidebar-settings-hooks-entry">
              <p class="sidebar-settings-hooks-cwd">{{ entry.cwd || t('Global') }}</p>
              <div v-for="(hook, index) in entry.hooks" :key="`${entry.cwd}:${hook.event}:${index}`" class="sidebar-settings-hooks-item">
                <span class="sidebar-settings-hooks-state" :class="{ 'is-on': hook.enabled !== false }">
                  {{ hook.enabled === false ? t('Disabled') : t('Enabled') }}
                </span>
                <span class="sidebar-settings-hooks-event">{{ hook.event }}</span>
                <code class="sidebar-settings-hooks-command">{{ hook.command }}</code>
              </div>
            </div>
          </div>
        </template>
      </div>
      <div class="sidebar-settings-remote-section">
        <div class="sidebar-settings-remote-header">
          <span class="sidebar-settings-remote-title">{{ t('Remote control') }}</span>
          <button
            class="sidebar-settings-remote-toggle"
            type="button"
            :disabled="isRemoteControlActionInFlight || isRemoteControlLoading"
            :title="t('Enable or disable remote control')"
            @click="toggleRemoteControl"
          >
            <span class="sidebar-settings-remote-toggle-track" :class="{ 'is-on': remoteControlStatus.enabled }">
              <span class="sidebar-settings-remote-toggle-thumb" />
            </span>
            <span class="sidebar-settings-remote-toggle-label">{{ remoteControlStatus.enabled ? t('Enabled') : t('Disabled') }}</span>
          </button>
        </div>
        <p v-if="!supportsRemoteControl" class="sidebar-settings-remote-empty">
          {{ t('Remote control is not supported by this Codex version.') }}
        </p>
        <template v-else>
          <p v-if="remoteControlError" class="sidebar-settings-remote-error">{{ remoteControlError }}</p>
          <p v-if="remoteControlNotice" class="sidebar-settings-remote-notice">{{ remoteControlNotice }}</p>
          <p v-if="isRemoteControlLoading" class="sidebar-settings-remote-empty">{{ t('Loading…') }}</p>
          <template v-else>
            <button
              class="sidebar-settings-remote-row"
              type="button"
              :disabled="!remoteControlStatus.enabled || isRemoteControlActionInFlight"
              @click="startRemotePairing"
            >
              <span class="sidebar-settings-remote-label">{{ t('Pair a new device') }}</span>
              <span class="sidebar-settings-remote-value">
                {{ remoteControlActionName === 'pairing' ? t('Starting…') : pairingCode?.pairingCode ? pairingCode.pairingCode : t('Generate code') }}
              </span>
            </button>
            <div class="sidebar-settings-remote-clients">
              <div class="sidebar-settings-remote-clients-header">
                <span class="sidebar-settings-remote-label">{{ t('Paired devices') }}</span>
                <button
                  class="sidebar-settings-remote-reload"
                  type="button"
                  :disabled="isRemoteControlActionInFlight"
                  @click="refreshRemoteClients"
                >
                  {{ remoteControlActionName === 'clients' ? t('Reloading…') : t('Reload') }}
                </button>
              </div>
              <p v-if="remoteControlStatus.clients.length === 0" class="sidebar-settings-remote-empty">{{ t('No paired devices.') }}</p>
              <div v-for="client in remoteControlStatus.clients" :key="client.clientId" class="sidebar-settings-remote-client">
                <span class="sidebar-settings-remote-client-name">{{ client.deviceName || client.clientId }}</span>
                <button
                  class="sidebar-settings-remote-client-revoke"
                  type="button"
                  :disabled="isRemoteControlActionInFlight"
                  @click="revokeRemoteClient(client.clientId)"
                >
                  {{ remoteControlActionName === `revoke:${client.clientId}` ? t('Removing…') : t('Revoke') }}
                </button>
              </div>
            </div>
          </template>
        </template>
      </div>
        </div>
        <div v-show="activeSettingsGroup === 'usage'">
      <div class="sidebar-settings-rate-limits">
        <RateLimitStatus :snapshots="accountRateLimitSnapshots" />
      </div>
      <div class="sidebar-settings-build-label" :aria-label="t('Worktree name and version')">
        WT {{ worktreeName }} · v{{ appVersion }}
      </div>
        </div>
        </div>
      </div>
    </div>
  </div>
</Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { UiHooksListEntry, UiRemoteControlStatus, UiRemotePairingCode } from '../../api/codexGateway'
import { useUiLanguage } from '../../composables/useUiLanguage'
import type { UiAccountEntry, UiRateLimitSnapshot } from '../../types/codex'
import ComposerDropdown from '../content/ComposerDropdown.vue'
import RateLimitStatus from '../content/RateLimitStatus.vue'
import IconTablerX from '../icons/IconTablerX.vue'
import SettingsAccountsPanel from './SettingsAccountsPanel.vue'

type SettingsGroup = 'general' | 'models' | 'integrations' | 'usage'
type Provider = 'codex' | 'openrouter' | 'opencode-zen' | 'custom'
type WireApi = 'responses' | 'chat'
type DropdownOption = { value: string; label: string }

const { t } = useUiLanguage()

defineProps<{
  activeSettingsGroup: SettingsGroup
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
  sendWithEnter: boolean
  inProgressSendMode: 'steer' | 'queue'
  darkMode: 'system' | 'light' | 'dark'
  uiLanguage: 'en' | 'zh-CN'
  uiLanguageOptions: DropdownOption[]
  chatWidthLabel: string
  dictationClickToToggle: boolean
  dictationAutoSend: boolean
  dictationLanguage: string
  dictationLanguageOptions: DropdownOption[]
  autoCompactThreshold: number
  autoCompactThresholdOptions: DropdownOption[]
  hasVisibleFeedbackError: boolean
  selectedProvider: Provider
  providerDropdownOptions: DropdownOption[]
  freeModeLoading: boolean
  providerError: string
  freeModeHasCustomKey: boolean
  freeModeCustomKey: string
  freeModeCustomKeyMasked: string | null
  freeModeCustomKeySaving: boolean
  openRouterWireApi: WireApi
  opencodeZenKey: string
  customEndpointUrl: string
  customEndpointKey: string
  customEndpointWireApi: WireApi
  isTelegramConfigOpen: boolean
  telegramStatusText: string
  telegramBotTokenDraft: string
  telegramAllowedUserIdsDraft: string
  telegramConfigError: string
  isTelegramSaving: boolean
  supportsHooks: boolean
  isHooksLoading: boolean
  hooksList: UiHooksListEntry[]
  supportsRemoteControl: boolean
  remoteControlStatus: UiRemoteControlStatus
  isRemoteControlActionInFlight: boolean
  remoteControlError: string
  remoteControlNotice: string
  isRemoteControlLoading: boolean
  remoteControlActionName: string
  pairingCode: UiRemotePairingCode | null
  accountRateLimitSnapshots: UiRateLimitSnapshot[]
  worktreeName: string
  appVersion: string
  onClose: () => void
  onActiveSettingsGroupChange: (group: SettingsGroup) => void
  toggleSendWithEnter: () => void
  cycleInProgressSendMode: () => void
  cycleDarkMode: () => void
  onUiLanguageChange: (language: 'en' | 'zh-CN') => void
  cycleChatWidth: () => void
  toggleDictationClickToToggle: () => void
  toggleDictationAutoSend: () => void
  onDictationLanguageChange: (language: string) => void
  onAutoCompactThresholdChange: (threshold: string) => void
  onProviderChange: (provider: string) => void
  onFreeModeCustomKeyChange: (key: string) => void
  clearFreeModeCustomKey: () => void
  saveFreeModeCustomKey: () => void
  setOpenRouterWireApi: (wireApi: WireApi) => void
  onOpencodeZenKeyChange: (key: string) => void
  saveOpencodeZen: () => void
  onCustomEndpointUrlChange: (url: string) => void
  onCustomEndpointKeyChange: (key: string) => void
  saveCustomEndpoint: () => void
  onCustomEndpointWireApiChange: (wireApi: WireApi) => void
  onTelegramConfigOpenChange: (open: boolean) => void
  onTelegramBotTokenDraftChange: (token: string) => void
  onTelegramAllowedUserIdsDraftChange: (ids: string) => void
  saveTelegramConfig: () => void
  refreshHooks: (options?: { force?: boolean }) => void
  toggleRemoteControl: () => void
  startRemotePairing: () => void
  refreshRemoteClients: () => void
  revokeRemoteClient: (clientId: string) => void
}>()

const settingsPanelRef = ref<HTMLElement | null>(null)
const settingsGroups: ReadonlyArray<{ id: SettingsGroup; label: string }> = [
  { id: 'general', label: 'General settings' },
  { id: 'models', label: 'Models & providers' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'usage', label: 'Usage & about' },
]
const SETTINGS_HELP = {
  sendWithEnter: t('When enabled, press Enter to send. When disabled, use Command+Enter to send.'),
  inProgressSendMode: t('If a turn is still running, choose whether a new prompt should steer the current turn or be queued.'),
  appearance: t('Switch between system theme, light mode, and dark mode.'),
  chatWidth: t('Choose how wide the conversation column and composer can grow on desktop screens.'),
  dictationClickToToggle: t('Use click-to-start and click-to-stop dictation instead of hold-to-talk.'),
  dictationAutoSend: t('Automatically send transcribed dictation when recording stops.'),
  dictationLanguage: t('Choose transcription language or keep auto-detect.'),
}

function containsTarget(target: Node): boolean {
  return settingsPanelRef.value?.contains(target) ?? false
}

defineExpose({ containsTarget })
</script>

<style scoped>
@reference "tailwindcss";

.sidebar-settings-panel {
  @apply flex h-[min(84vh,46rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl;
}

.settings-dialog-backdrop {
  @apply fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-3 sm:p-6;
}

.settings-dialog-header {
  @apply flex h-12 shrink-0 items-center justify-between gap-2 border-b border-zinc-200 px-4;
}

.settings-dialog-title {
  @apply m-0 text-sm font-semibold text-zinc-900;
}

.settings-dialog-close {
  @apply inline-flex h-8 w-8 items-center justify-center rounded-md border-0 bg-transparent text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800;
}

.settings-dialog-close-icon {
  @apply h-4.5 w-4.5;
}

.settings-dialog-body {
  @apply flex min-h-0 flex-1 overflow-hidden;
}

.settings-group-nav {
  @apply flex w-36 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-zinc-100 p-2;
}

.settings-group-nav-item {
  @apply w-full rounded-lg border-0 px-3 py-2 text-left text-[13px] font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 cursor-pointer;
}

.settings-group-nav-item.is-active {
  @apply bg-zinc-100 text-zinc-900;
}

.settings-group-content {
  @apply min-h-0 min-w-0 flex-1 overflow-y-auto;
}

.sidebar-settings-row {
  @apply flex items-center justify-between w-full px-3 py-2.5 text-sm text-zinc-700 border-0 bg-transparent transition hover:bg-zinc-50 cursor-pointer;
}

.sidebar-settings-row--select {
  @apply cursor-default items-center gap-2;
}

.sidebar-settings-language-dropdown {
  @apply min-w-0 max-w-52;
}

.sidebar-settings-language-dropdown :deep(.composer-dropdown-trigger) {
  @apply h-auto rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700;
}

.sidebar-settings-language-dropdown :deep(.composer-dropdown-value) {
  @apply max-w-32;
}

.sidebar-settings-row + .sidebar-settings-row {
  @apply border-t border-zinc-100;
}

.sidebar-settings-hooks-section {
  @apply border-t border-zinc-100 px-3 py-2.5;
}

.sidebar-settings-hooks-header {
  @apply flex items-center justify-between;
}

.sidebar-settings-hooks-title {
  @apply text-sm font-medium text-zinc-700;
}

.sidebar-settings-hooks-reload {
  @apply rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900 cursor-pointer disabled:opacity-50;
}

.sidebar-settings-hooks-empty {
  @apply mt-1.5 text-xs text-zinc-500;
}

.sidebar-settings-hooks-list {
  @apply mt-1.5 flex flex-col gap-1.5;
}

.sidebar-settings-hooks-entry {
  @apply rounded-md border border-zinc-200 bg-zinc-50/70 px-2 py-1.5;
}

.sidebar-settings-hooks-cwd {
  @apply mb-1 font-mono text-[10px] uppercase tracking-wide text-zinc-400 break-all;
}

.sidebar-settings-hooks-item {
  @apply flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs;
}

.sidebar-settings-hooks-state {
  @apply rounded-full bg-zinc-200 px-1.5 py-px text-[10px] font-medium text-zinc-500;
}

.sidebar-settings-hooks-state.is-on {
  @apply bg-emerald-100 text-emerald-700;
}

.sidebar-settings-hooks-event {
  @apply font-medium text-zinc-700;
}

.sidebar-settings-hooks-command {
  @apply min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-500;
}

.sidebar-settings-remote-section {
  @apply border-t border-zinc-100 px-3 py-2.5;
}

.sidebar-settings-remote-header {
  @apply flex items-center justify-between;
}

.sidebar-settings-remote-title {
  @apply text-sm font-medium text-zinc-700;
}

.sidebar-settings-remote-toggle {
  @apply flex items-center gap-1.5 rounded-md border-0 bg-transparent px-1 py-0.5 transition cursor-pointer disabled:opacity-50;
}

.sidebar-settings-remote-toggle-track {
  @apply relative inline-flex h-4 w-8 items-center rounded-full bg-zinc-300 transition;
}

.sidebar-settings-remote-toggle-track.is-on {
  @apply bg-emerald-500;
}

.sidebar-settings-remote-toggle-thumb {
  @apply inline-block h-3 w-3 transform rounded-full bg-white shadow transition translate-x-0.5;
}

.sidebar-settings-remote-toggle-track.is-on .sidebar-settings-remote-toggle-thumb {
  @apply translate-x-4;
}

.sidebar-settings-remote-toggle-label {
  @apply text-xs text-zinc-600;
}

.sidebar-settings-remote-empty {
  @apply mt-1.5 text-xs text-zinc-500;
}

.sidebar-settings-remote-error {
  @apply mt-1.5 text-xs text-rose-600;
}

.sidebar-settings-remote-notice {
  @apply mt-1.5 text-xs text-emerald-600;
}

.sidebar-settings-remote-row {
  @apply flex w-full items-center justify-between rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700 transition hover:bg-zinc-50 mt-1.5 cursor-pointer disabled:opacity-50;
}

.sidebar-settings-remote-label {
  @apply text-xs text-zinc-700;
}

.sidebar-settings-remote-value {
  @apply font-mono text-xs font-medium text-zinc-600;
}

.sidebar-settings-remote-clients {
  @apply mt-1.5;
}

.sidebar-settings-remote-clients-header {
  @apply flex items-center justify-between;
}

.sidebar-settings-remote-reload {
  @apply rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900 cursor-pointer disabled:opacity-50;
}

.sidebar-settings-remote-client {
  @apply mt-1 flex items-center justify-between rounded-md border border-zinc-200 bg-white px-2 py-1.5;
}

.sidebar-settings-remote-client-name {
  @apply min-w-0 flex-1 truncate text-xs text-zinc-700;
}

.sidebar-settings-remote-client-revoke {
  @apply shrink-0 rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-500 transition hover:bg-rose-50 hover:text-rose-600 cursor-pointer disabled:opacity-50;
}

.sidebar-settings-telegram-panel {
  @apply border-t border-zinc-100 bg-zinc-50/70 px-3 py-3;
}

.sidebar-settings-field {
  @apply flex flex-col gap-1.5;
}

.sidebar-settings-field + .sidebar-settings-field {
  @apply mt-3;
}

.sidebar-settings-field-label {
  @apply text-xs font-medium text-zinc-700;
}

.sidebar-settings-input,
.sidebar-settings-textarea {
  @apply w-full rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-sm text-zinc-800 outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200;
}

.sidebar-settings-textarea {
  @apply min-h-20 resize-y font-mono text-xs;
}

.sidebar-settings-field-help {
  @apply mt-2 text-xs leading-5 text-zinc-500;
}

.sidebar-settings-telegram-error {
  @apply mt-2 rounded-md bg-rose-50 px-2.5 py-2 text-xs text-rose-700;
}

.sidebar-settings-telegram-actions {
  @apply mt-3 flex items-center justify-end;
}

.sidebar-settings-telegram-save {
  @apply rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-default disabled:opacity-60;
}

.sidebar-settings-label {
  @apply text-left;
}

.sidebar-settings-value {
  @apply text-xs text-zinc-500 bg-zinc-100 rounded px-1.5 py-0.5;
}


.sidebar-settings-toggle {
  @apply relative w-9 h-5 rounded-full bg-zinc-300 transition-colors shrink-0;
}

.sidebar-settings-toggle::after {
  content: '';
  @apply absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm;
}

.sidebar-settings-toggle.is-on {
  @apply bg-zinc-800;
}

.sidebar-settings-toggle.is-on::after {
  transform: translateX(16px);
}

.sidebar-settings-row--input {
  @apply flex flex-col gap-1 py-1.5;
}

.sidebar-settings-error {
  @apply text-xs text-red-600 bg-red-50 rounded px-2 py-1.5 break-words;
}

.sidebar-settings-key-group {
  @apply flex items-center gap-1.5 w-full;
}

.sidebar-settings-key-input {
  @apply flex-1 min-w-0 text-xs rounded border border-zinc-200 bg-white px-2 py-1 outline-none transition-colors placeholder:text-zinc-400;
}

.sidebar-settings-key-input:focus {
  @apply border-zinc-400;
}

.sidebar-settings-key-save {
  @apply shrink-0 rounded border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-default;
}

.sidebar-settings-key-masked {
  @apply flex-1 min-w-0 text-xs text-zinc-500 font-mono truncate;
}

.sidebar-settings-key-clear {
  @apply shrink-0 w-6 h-6 flex items-center justify-center rounded-full border border-zinc-200 text-xs text-zinc-400 transition-colors hover:text-zinc-600 hover:border-zinc-300 disabled:opacity-40;
}

.sidebar-settings-provider-dropdown {
  @apply min-w-0 max-w-44;
}

.sidebar-settings-provider-dropdown :deep(.composer-dropdown-trigger) {
  @apply h-auto rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700;
}

.sidebar-settings-provider-dropdown :deep(.composer-dropdown-value) {
  @apply max-w-36;
}

.sidebar-settings-segmented {
  @apply inline-flex items-center rounded-md border border-zinc-200 bg-white p-0.5;
}

.sidebar-settings-segmented-option {
  @apply rounded px-2 py-1 text-xs text-zinc-600 transition-colors;
}

.sidebar-settings-segmented-option.is-active {
  @apply bg-zinc-800 text-white;
}

.sidebar-settings-provider-info {
  @apply flex items-center justify-between w-full;
}

.sidebar-settings-provider-link {
  @apply text-xs text-blue-600 hover:text-blue-700 underline shrink-0;
}

:global(:root.dark) .sidebar-settings-segmented {
  @apply border-zinc-600 bg-zinc-800;
}

:global(:root.dark) .sidebar-settings-segmented-option {
  @apply text-zinc-300;
}

:global(:root.dark) .sidebar-settings-segmented-option.is-active {
  @apply bg-zinc-100 text-zinc-900;
}

:global(:root.dark) .sidebar-settings-provider-link {
  @apply text-blue-400 hover:text-blue-300;
}

:global(:root.dark) .sidebar-settings-key-input {
  @apply border-zinc-600 bg-zinc-800 text-zinc-200 placeholder:text-zinc-500;
}

:global(:root.dark) .sidebar-settings-key-input:focus {
  @apply border-zinc-500;
}

:global(:root.dark) .sidebar-settings-key-save {
  @apply border-zinc-600 bg-zinc-700 text-zinc-200 hover:bg-zinc-600;
}

:global(:root.dark) .sidebar-settings-key-masked {
  @apply text-zinc-400;
}

:global(:root.dark) .sidebar-settings-key-clear {
  @apply border-zinc-600 text-zinc-500 hover:text-zinc-300 hover:border-zinc-500;
}

.sidebar-settings-rate-limits {
  @apply border-t border-zinc-200 px-2 pt-2;
}

.sidebar-settings-build-label {
  @apply border-t border-zinc-100 px-3 py-2 text-[11px] text-zinc-500;
}

.visible-error-with-feedback {
  @apply flex items-start justify-between gap-3;
}

.visible-error-feedback {
  @apply shrink-0 rounded-full border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-300;
}

:global(:root.dark) .visible-error-feedback {
  @apply border-rose-700 bg-zinc-900 text-rose-300 hover:bg-zinc-800;
}
</style>
