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

describe('useUiLanguage empty-state copy carries a next step (round-137)', () => {
  beforeEach(() => {
    setUiLanguage('zh-CN')
  })

  it('appends an actionable next step to the three empty states', () => {
    expect(t('No messages in this thread yet. Type a message below to get started.')).toBe(
      '此线程还没有消息。在下方输入消息即可开始。',
    )
    expect(t('No matching threads. Clear the search to see all threads.')).toBe(
      '没有匹配的线程。清除搜索即可查看全部线程。',
    )
    expect(t('No threads yet. Start a new thread to begin.')).toBe('还没有线程。新建一个线程即可开始。')
  })

  it('translates the unresolved image attachment placeholder', () => {
    expect(t('Image attachment (preview unavailable)')).toBe('图片附件（无法预览）')
  })
})
