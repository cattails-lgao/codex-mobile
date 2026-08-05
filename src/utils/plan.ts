import type { UiMessage, UiPlanStep } from '../types/codex'

export type ParsedPlan = {
  explanation: string
  steps: UiPlanStep[]
}

/**
 * Parse plan text in the `- [ ] step` / `- [x] step` / `- [~] step` form into
 * steps with status, keeping any leading non-step lines as the explanation.
 */
export function parsePlanFromMessageText(text: string): ParsedPlan | null {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return null

  const steps: UiPlanStep[] = []
  const explanationLines: string[] = []

  for (const line of normalized.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (steps.length === 0) explanationLines.push('')
      continue
    }

    const match = trimmed.match(/^[-*]\s+\[([ xX~>|-])\]\s+(.+)$/)
    if (match) {
      const marker = (match[1] ?? ' ').toLowerCase()
      let status: UiPlanStep['status'] = 'pending'
      if (marker === 'x') status = 'completed'
      if (marker === '~' || marker === '>' || marker === '-') status = 'inProgress'
      steps.push({
        step: match[2]?.trim() ?? '',
        status,
      })
      continue
    }

    explanationLines.push(trimmed)
  }

  if (steps.length === 0) return null
  return {
    explanation: explanationLines.join('\n').trim(),
    steps: steps.filter((step) => step.step.length > 0),
  }
}

/**
 * Read plan data from a normalized message, preferring the structured
 * `message.plan` field and falling back to parsing the raw text (used for
 * optimistic/live messages that were not normalized).
 */
export function readPlanData(message: UiMessage): ParsedPlan | null {
  if (message.plan && message.plan.steps.length > 0) {
    return {
      explanation: message.plan.explanation?.trim() ?? '',
      steps: message.plan.steps,
    }
  }
  return parsePlanFromMessageText(message.text)
}
