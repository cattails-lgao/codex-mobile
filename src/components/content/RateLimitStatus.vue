<template>
  <aside v-if="snapshots.length > 0" class="rate-limit-status" aria-live="polite">
    <div
      v-for="snapshot in snapshots"
      :key="getSnapshotKey(snapshot)"
      class="rate-limit-card"
      :title="buildTooltip(snapshot)"
    >
      <div class="rate-limit-card-header">
        <span class="rate-limit-card-title">{{ getSnapshotTitle(snapshot) }}</span>
        <span v-if="snapshot.planType" class="rate-limit-card-plan">{{ formatPlanType(snapshot.planType) }}</span>
      </div>

      <div class="rate-limit-card-metrics">
        <span
          v-for="metric in getWindowMetrics(snapshot)"
          :key="metric.key"
          class="rate-limit-card-metric"
        >
          {{ metric.label }}
        </span>
      </div>

      <div v-if="getFooterParts(snapshot).length > 0" class="rate-limit-card-footer">
        {{ getFooterParts(snapshot).join(' | ') }}
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import type { UiRateLimitSnapshot, UiRateLimitWindow } from '../../types/codex'
import { useUiLanguage } from '../../composables/useUiLanguage'

const { t } = useUiLanguage()

defineProps<{
  snapshots: UiRateLimitSnapshot[]
}>()

type RateLimitMetric = {
  key: string
  label: string
}

function getSnapshotKey(snapshot: UiRateLimitSnapshot): string {
  return snapshot.limitId?.trim() || snapshot.limitName?.trim() || '__default__'
}

function getSnapshotTitle(snapshot: UiRateLimitSnapshot): string {
  return snapshot.limitName?.trim() || snapshot.limitId?.trim() || t('Rate limits')
}

function formatPlanType(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatWindowDuration(windowDurationMins: number | null): string {
  if (!windowDurationMins || windowDurationMins <= 0) return t('Window')
  if (windowDurationMins % 1440 === 0) return `${windowDurationMins / 1440}d`
  if (windowDurationMins % 60 === 0) return `${windowDurationMins / 60}h`
  if (windowDurationMins < 60) return `${windowDurationMins}m`
  return `${Math.round((windowDurationMins / 60) * 10) / 10}h`
}

function formatRemainingPercent(value: number): string {
  const remaining = Math.max(0, Math.min(100, 100 - value))
  return `${Math.round(remaining)}% ${t('left')}`
}

function formatUsedPercent(value: number): string {
  return `${Math.round(value)}%`
}

function formatWindowMetric(window: UiRateLimitWindow, key: string): RateLimitMetric {
  return {
    key,
    label: `${formatWindowDuration(window.windowDurationMins)} ${formatRemainingPercent(window.usedPercent)}`,
  }
}

function getWindowMetrics(snapshot: UiRateLimitSnapshot): RateLimitMetric[] {
  const metrics: RateLimitMetric[] = []
  if (snapshot.primary) metrics.push(formatWindowMetric(snapshot.primary, 'primary'))
  if (snapshot.secondary) metrics.push(formatWindowMetric(snapshot.secondary, 'secondary'))
  return metrics
}

function formatAbsoluteResetDate(resetsAt: number | null): string {
  if (!resetsAt) return ''

  const resetDate = new Date(resetsAt * 1000)
  const month = resetDate.getMonth() + 1
  const day = String(resetDate.getDate()).padStart(2, '0')
  const hours = String(resetDate.getHours()).padStart(2, '0')
  const minutes = String(resetDate.getMinutes()).padStart(2, '0')
  return `${month}.${day} ${hours}:${minutes}`
}

function formatRelativeResetText(window: UiRateLimitWindow | null): string {
  if (!window?.resetsAt) return ''

  const diffMs = window.resetsAt * 1000 - Date.now()
  if (diffMs <= 0) return t('Resetting now')

  const diffMinutes = Math.round(diffMs / 60000)
  if (diffMinutes < 60) {
    return `${t('Resets in')} ${diffMinutes}m`
  }

  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) {
    return `${t('Resets in')} ${diffHours}h`
  }

  const diffDays = Math.round(diffHours / 24)
  return `${t('Resets in')} ${diffDays}d`
}

function getResetWindows(snapshot: UiRateLimitSnapshot): UiRateLimitWindow[] {
  return [snapshot.primary, snapshot.secondary].filter((window): window is UiRateLimitWindow => window !== null)
}

function getPrimaryResetWindow(snapshot: UiRateLimitSnapshot): UiRateLimitWindow | null {
  const windows = getResetWindows(snapshot)
  if (windows.length === 0) return null

  return [...windows].sort((first, second) => {
    const firstDuration = first.windowDurationMins ?? Number.MAX_SAFE_INTEGER
    const secondDuration = second.windowDurationMins ?? Number.MAX_SAFE_INTEGER
    if (firstDuration !== secondDuration) return firstDuration - secondDuration
    return (first.resetsAt ?? Number.MAX_SAFE_INTEGER) - (second.resetsAt ?? Number.MAX_SAFE_INTEGER)
  })[0]
}

function getWeeklyResetText(snapshot: UiRateLimitSnapshot): string {
  const windows = getResetWindows(snapshot)
  if (windows.length === 0) return ''

  const weeklyWindow = [...windows].sort((first, second) => {
    const firstDuration = first.windowDurationMins ?? -1
    const secondDuration = second.windowDurationMins ?? -1
    if (firstDuration !== secondDuration) return secondDuration - firstDuration
    return (second.resetsAt ?? -1) - (first.resetsAt ?? -1)
  })[0]

  const absoluteText = formatAbsoluteResetDate(weeklyWindow.resetsAt)
  if (!absoluteText) return ''

  return absoluteText
}

function getCreditsText(snapshot: UiRateLimitSnapshot): string {
  const credits = snapshot.credits
  if (!credits) return ''
  if (credits.unlimited) return t('Unlimited credits')
  if (credits.balance) return `${t('Credits')} ${credits.balance}`
  if (credits.hasCredits) return t('Credits available')
  return ''
}

function getFooterParts(snapshot: UiRateLimitSnapshot): string[] {
  return [
    formatRelativeResetText(getPrimaryResetWindow(snapshot)),
    getWeeklyResetText(snapshot),
    getCreditsText(snapshot),
  ].filter((value) => value.length > 0)
}

function buildTooltip(snapshot: UiRateLimitSnapshot): string {
  const lines = [getSnapshotTitle(snapshot)]
  for (const metric of getWindowMetrics(snapshot)) {
    lines.push(metric.label)
  }
  for (const window of getResetWindows(snapshot)) {
    lines.push(`${formatWindowDuration(window.windowDurationMins)} used ${formatUsedPercent(window.usedPercent)}`)
  }
  for (const footer of getFooterParts(snapshot)) {
    lines.push(footer)
  }
  return lines.join('\n')
}
</script>

<style scoped>
@reference "../../style.css";

.rate-limit-status {
  @apply flex w-full flex-col items-end gap-2;
}

.rate-limit-card {
  @apply w-full rounded-xl border border-line-1 bg-s2/95 px-3 py-2 text-right shadow-sm backdrop-blur;
  max-width: 22rem;
}

.rate-limit-card-header {
  @apply flex items-center justify-end gap-2;
}

.rate-limit-card-title {
  @apply text-micro font-semibold uppercase tracking-[0.08em] text-ink-3;
}

.rate-limit-card-plan {
  @apply rounded-full bg-s1 px-2 py-0.5 text-nano font-medium text-ink-3;
}

.rate-limit-card-metrics {
  @apply mt-1 flex flex-wrap justify-end gap-1;
}

.rate-limit-card-metric {
  @apply rounded-full bg-live px-2 py-0.5 text-xs font-medium text-live;
}

.rate-limit-card-footer {
  @apply mt-1 text-micro text-ink-3;
}
</style>
