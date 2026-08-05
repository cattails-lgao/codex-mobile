import { describe, expect, it, beforeEach } from 'vitest'
import { setUiLanguage, t } from './useUiLanguage'

describe('useUiLanguage composer placeholder copy', () => {
  beforeEach(() => {
    setUiLanguage('en')
  })

  it('translates the Codex.app composer placeholder to zh-CN', () => {
    setUiLanguage('zh-CN')
    expect(t('Ask Codex anything, @ to add files, / for commands')).toBe(
      '向 Codex 提问，@ 添加文件，/ 执行命令',
    )
  })

  it('keeps the English composer placeholder unchanged', () => {
    expect(t('Ask Codex anything, @ to add files, / for commands')).toBe(
      'Ask Codex anything, @ to add files, / for commands',
    )
  })

  it('drops the legacy composer placeholder key', () => {
    setUiLanguage('zh-CN')
    expect(t('Type a message... (@ for files)')).toBe('Type a message... (@ for files)')
  })
})
