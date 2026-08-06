import type { UiMessage, UiPlanStep } from '../types/codex'

export type ParsedPlan = {
  explanation: string
  steps: UiPlanStep[]
}

/**
 * Parse plan text in the `- [ ] step` / `- [x] step` / `- [~] step` form into
 * steps with status, keeping any leading non-step lines as the explanation.
 *
 * Falls back to parsing markdown-style plan bodies (the shape the codex CLI
 * persists from its `<proposed_plan>` blocks): section headings and prose
 * become the explanation, while `- ` / `* ` bullets and numbered list items
 * become pending steps.
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

  if (steps.length === 0) {
    // No checkbox steps: try the markdown fallback so codex `<proposed_plan>`
    // bodies (headings + bullets) render in the plan panel instead of being
    // dropped as unparseable. Numbered items (1. / 1)) represent the ordered
    // execution steps and take precedence: plans written by codex CLI put the
    // real step list under a numbered section, while bullets elsewhere are
    // details (e.g. rule lists), not steps.
    const markdown = parseMarkdownPlan(normalized)
    if (markdown) return markdown
    return null
  }

  return {
    explanation: explanationLines.join('\n').trim(),
    steps: steps.filter((step) => step.step.length > 0),
  }
}

function parseMarkdownPlan(normalized: string): ParsedPlan | null {
  const numberedSteps: UiPlanStep[] = []
  const bulletSteps: UiPlanStep[] = []
  const explanationLines: string[] = []
  for (const line of normalized.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (numberedSteps.length === 0 && bulletSteps.length === 0) explanationLines.push('')
      continue
    }
    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/)
    if (numbered) {
      numberedSteps.push({ step: numbered[1]?.trim() ?? '', status: 'pending' })
      continue
    }
    const bullet = trimmed.match(/^[-*]\s+(.+)$/)
    if (bullet) {
      bulletSteps.push({ step: bullet[1]?.trim() ?? '', status: 'pending' })
      continue
    }
    explanationLines.push(trimmed)
  }
  const chosen = numberedSteps.length > 0 ? numberedSteps : bulletSteps
  if (chosen.length === 0) return null
  return {
    explanation: cleanPlanExplanation(explanationLines.join('\n')),
    steps: chosen.filter((step) => step.step.length > 0),
  }
}

// Strip markdown heading markers from the explanation so the plan popover
// shows readable prose instead of raw `## Section` markers.
function cleanPlanExplanation(value: string): string {
  return value
    .split('\n')
    .map((line) => line.replace(/^\s*#{1,6}\s*/, ''))
    .join('\n')
    .trim()
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
