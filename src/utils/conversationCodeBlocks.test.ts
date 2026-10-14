import { describe, expect, it } from 'vitest'
import type { UiMessage } from '../types/codex'
import { hasCodeFenceStart } from './conversationMarkdown'
import {
  collectCodeBlocksFromMessage,
  findLastAssistantCodeBlock,
  hasAssistantCodeBlock,
  isAssistantContentMessage,
} from './conversationCodeBlocks'

const msg = (over: Partial<UiMessage> & { id: string }): UiMessage => ({
  role: 'assistant',
  text: '',
  ...over,
})

const fence = (...lines: string[]): string => ['```', ...lines, '```'].join('\n')

describe('collectCodeBlocksFromMessage', () => {
  it('单个围栏产出一个块，正文不含围栏行', () => {
    expect(collectCodeBlocksFromMessage(msg({ id: 'a', text: fence('echo hi', 'echo ho') }))).toEqual([
      { language: '', value: 'echo hi\necho ho' },
    ])
  })

  it('捕获语言标记', () => {
    expect(collectCodeBlocksFromMessage(msg({ id: 'a', text: '```ts\nconst a = 1\n```' }))).toEqual([
      { language: 'ts', value: 'const a = 1' },
    ])
  })

  it('一条消息里多个围栏按出现顺序返回', () => {
    expect(collectCodeBlocksFromMessage(msg({ id: 'a', text: 'first\n\n```sh\nls\n```\n\nmid\n\n```py\nprint(1)\n```\n' })))
      .toEqual([
        { language: 'sh', value: 'ls' },
        { language: 'py', value: 'print(1)' },
      ])
  })

  it('~~~ 围栏同样识别', () => {
    expect(collectCodeBlocksFromMessage(msg({ id: 'a', text: '~~~json\n{}\n~~~' }))).toEqual([
      { language: 'json', value: '{}' },
    ])
  })

  it('4 个反引号的围栏里可以含 3 个反引号的行', () => {
    expect(collectCodeBlocksFromMessage(msg({ id: 'a', text: '````md\n```ts\nx\n```\n````' }))).toEqual([
      { language: 'md', value: '```ts\nx\n```' },
    ])
  })

  it('未闭合的围栏仍产出块（一直吃到文末）', () => {
    expect(collectCodeBlocksFromMessage(msg({ id: 'a', text: '```sh\nls -la' }))).toEqual([
      { language: 'sh', value: 'ls -la' },
    ])
  })

  it('CRLF 正文照常解析', () => {
    expect(collectCodeBlocksFromMessage(msg({ id: 'a', text: '```sh\r\nls\r\n```\r\n' }))).toEqual([
      { language: 'sh', value: 'ls' },
    ])
  })

  it('块内保留空行与缩进', () => {
    expect(collectCodeBlocksFromMessage(msg({ id: 'a', text: fence('  indented', '', 'tail') }))).toEqual([
      { language: '', value: '  indented\n\ntail' },
    ])
  })

  it('列表项内的围栏也能收集（递归进 children；围栏内原始缩进照解析结果保留）', () => {
    // 解析器（= 渲染层同一条路径）不会替列表内的围栏剥离正文缩进，故复制结果与
    // 屏幕上看到的一致（含缩进），这里刻意不为「好看」而额外 trim —— 否则会与渲染层分歧。
    const text = ['- 步骤一：', '', '  ```sh', '  npm ci', '  ```'].join('\n')
    expect(collectCodeBlocksFromMessage(msg({ id: 'a', text }))).toEqual([
      { language: 'sh', value: '  npm ci' },
    ])
  })

  it('无围栏的正文返回空数组', () => {
    expect(collectCodeBlocksFromMessage(msg({ id: 'a', text: 'just prose, no code' }))).toEqual([])
  })

  it('空正文 / 纯空白返回空数组', () => {
    expect(collectCodeBlocksFromMessage(msg({ id: 'a', text: '' }))).toEqual([])
    expect(collectCodeBlocksFromMessage(msg({ id: 'a', text: '   \n\t  ' }))).toEqual([])
  })

  it('行内单反引号不算代码块', () => {
    expect(collectCodeBlocksFromMessage(msg({ id: 'a', text: 'use `npm ci` here' }))).toEqual([])
  })

  it('引用块内的围栏不算代码块（解析器不在引用内解析块，渲染层同此）', () => {
    const text = ['> ```sh', '> ls', '> ```'].join('\n')
    expect(collectCodeBlocksFromMessage(msg({ id: 'a', text }))).toEqual([])
    // 且廉价判定不会因此误报：引用行以 > 开头，围栏正则不命中 ⇒ 两侧判定一致。
    expect(hasCodeFenceStart(text)).toBe(false)
    expect(hasAssistantCodeBlock([msg({ id: 'a', text })])).toBe(false)
  })
})

describe('hasCodeFenceStart（与解析器同源）', () => {
  it('识别 ``` 与 ~~~、含语言标记与缩进', () => {
    expect(hasCodeFenceStart('```\nx\n```')).toBe(true)
    expect(hasCodeFenceStart('~~~sh\nls\n~~~')).toBe(true)
    expect(hasCodeFenceStart('  ```ts\nconst a=1\n  ```')).toBe(true)
    expect(hasCodeFenceStart('````')).toBe(true)
  })

  it('行内单反引号与普通文本为 false', () => {
    expect(hasCodeFenceStart('use `npm ci` here')).toBe(false)
    expect(hasCodeFenceStart('plain text')).toBe(false)
    expect(hasCodeFenceStart('')).toBe(false)
  })

  it('缩进超过 3 空格的行不算围栏（与解析器一致）', () => {
    expect(hasCodeFenceStart('    ```\n    code\n    ```')).toBe(false)
    expect(hasCodeFenceStart('   ```\ncode\n   ```')).toBe(true)
  })

  it('CRLF 下仍能命中', () => {
    expect(hasCodeFenceStart('prose\r\n```sh\r\nls\r\n```\r\n')).toBe(true)
  })

  it('连续多次调用结果稳定（全局正则的 lastIndex 已复位）', () => {
    const text = '```\nx\n```'
    expect(hasCodeFenceStart(text)).toBe(true)
    expect(hasCodeFenceStart(text)).toBe(true)
    expect(hasCodeFenceStart('prose')).toBe(false)
    expect(hasCodeFenceStart(text)).toBe(true)
  })
})

describe('isAssistantContentMessage', () => {
  it('助手普通消息为真，用户消息为假', () => {
    expect(isAssistantContentMessage(msg({ id: 'a' }))).toBe(true)
    expect(isAssistantContentMessage(msg({ id: 'b', role: 'user' }))).toBe(false)
    expect(isAssistantContentMessage(msg({ id: 'c', role: 'system' }))).toBe(false)
  })

  it('排除 worked 过程消息与 .live 流式占位', () => {
    expect(isAssistantContentMessage(msg({ id: 'a', messageType: 'worked' }))).toBe(false)
    expect(isAssistantContentMessage(msg({ id: 'a', messageType: 'assistant.live' }))).toBe(false)
    expect(isAssistantContentMessage(msg({ id: 'a', messageType: 'worked.live' }))).toBe(false)
  })

  it('messageType 为 commandExecution 但无载荷时仍算助手内容', () => {
    expect(isAssistantContentMessage(msg({ id: 'a', messageType: 'commandExecution' }))).toBe(true)
    expect(
      isAssistantContentMessage(
        msg({ id: 'a', messageType: 'commandExecution', commandExecution: { command: 'ls' } as never }),
      ),
    ).toBe(false)
  })
})

describe('hasAssistantCodeBlock', () => {
  it('助手带围栏为真', () => {
    expect(hasAssistantCodeBlock([msg({ id: 'a', text: '```sh\nls\n```' })])).toBe(true)
  })

  it('只有用户消息带围栏时为假', () => {
    expect(hasAssistantCodeBlock([msg({ id: 'u', role: 'user', text: '```sh\nls\n```' })])).toBe(false)
  })

  it('助手只有普通文本为假', () => {
    expect(hasAssistantCodeBlock([msg({ id: 'a', text: 'no code here' })])).toBe(false)
  })

  it('跳过 worked / .live / 命令执行消息', () => {
    expect(hasAssistantCodeBlock([msg({ id: 'a', messageType: 'worked', text: '```sh\nls\n```' })])).toBe(false)
    expect(hasAssistantCodeBlock([msg({ id: 'a', messageType: 'assistant.live', text: '```sh\nls\n```' })])).toBe(false)
    expect(
      hasAssistantCodeBlock([
        msg({ id: 'a', messageType: 'commandExecution', commandExecution: { command: 'ls' } as never, text: '```sh\nls\n```' }),
      ]),
    ).toBe(false)
  })

  it('最后一条助手没有、更早的助手有 ⇒ 真', () => {
    expect(
      hasAssistantCodeBlock([
        msg({ id: 'a1', text: '```sh\nls\n```' }),
        msg({ id: 'u', role: 'user', text: 'why?' }),
        msg({ id: 'a2', text: 'no code in this one' }),
      ]),
    ).toBe(true)
  })

  it('可以传入自定义判定谓词', () => {
    const messages = [msg({ id: 'u', role: 'user', text: '```sh\nls\n```' })]
    expect(hasAssistantCodeBlock(messages)).toBe(false)
    expect(hasAssistantCodeBlock(messages, () => true)).toBe(true)
  })

  it('空消息列表为假', () => {
    expect(hasAssistantCodeBlock([])).toBe(false)
  })
})

describe('findLastAssistantCodeBlock', () => {
  it('取最后一条助手消息的最后一个代码块', () => {
    const result = findLastAssistantCodeBlock([
      msg({ id: 'a1', turnIndex: 0, text: '```sh\nfirst\n```' }),
      msg({ id: 'u', role: 'user', text: 'again' }),
      msg({ id: 'a2', turnIndex: 1, text: '```sh\nsecond\n```\n\ntext\n\n```py\nthird\n```' }),
    ])
    expect(result).toEqual({ messageId: 'a2', turnIndex: 1, language: 'py', value: 'third' })
  })

  it('跳过用户消息里的围栏', () => {
    const result = findLastAssistantCodeBlock([
      msg({ id: 'a1', text: '```sh\nassistant\n```' }),
      msg({ id: 'u', role: 'user', text: '```sh\nuser\n```' }),
    ])
    expect(result?.value).toBe('assistant')
  })

  it('最后一条助手没有围栏时回退到更早的助手', () => {
    const result = findLastAssistantCodeBlock([
      msg({ id: 'a1', text: '```sh\nold\n```' }),
      msg({ id: 'a2', text: 'prose only' }),
    ])
    expect(result).toEqual({ messageId: 'a1', turnIndex: null, language: 'sh', value: 'old' })
  })

  it('无 turnIndex 时带出 null', () => {
    expect(findLastAssistantCodeBlock([msg({ id: 'a', text: '```\nx\n```' })])?.turnIndex).toBe(null)
  })

  it('跳过 worked / .live / 命令执行消息', () => {
    expect(
      findLastAssistantCodeBlock([
        msg({ id: 'ok', text: '```sh\nreal\n```' }),
        msg({ id: 'w', messageType: 'worked', text: '```sh\ntool\n```' }),
        msg({ id: 'l', messageType: 'assistant.live', text: '```sh\nlive\n```' }),
        msg({ id: 'c', messageType: 'commandExecution', commandExecution: { command: 'ls' } as never, text: '```sh\ncmd\n```' }),
      ])?.value,
    ).toBe('real')
  })

  it('没有任何助手代码块时为 null', () => {
    expect(findLastAssistantCodeBlock([])).toBe(null)
    expect(findLastAssistantCodeBlock([msg({ id: 'a', text: 'prose' })])).toBe(null)
    expect(findLastAssistantCodeBlock([msg({ id: 'u', role: 'user', text: '```sh\nls\n```' })])).toBe(null)
  })

  it('可以传入自定义判定谓词', () => {
    const messages = [msg({ id: 'u', role: 'user', text: '```sh\nls\n```' })]
    expect(findLastAssistantCodeBlock(messages)).toBe(null)
    expect(findLastAssistantCodeBlock(messages, () => true)?.value).toBe('ls')
  })
})

describe('可用性判定与提取结果一致（命令面板的收敛不能与执行分歧）', () => {
  const corpus: UiMessage[][] = [
    [],
    [msg({ id: 'a', text: 'prose' })],
    [msg({ id: 'a', text: '```\nx\n```' })],
    [msg({ id: 'u', role: 'user', text: '```\nx\n```' })],
    [msg({ id: 'a', text: 'use `inline` here' })],
    [msg({ id: 'a', text: '```sh\nls -la' })],
    [msg({ id: 'a', text: '~~~\ny\n~~~' })],
    [msg({ id: 'a', messageType: 'worked', text: '```\nx\n```' })],
    [msg({ id: 'a1', text: '```\nx\n```' }), msg({ id: 'a2', text: 'prose' })],
    [msg({ id: 'a1', text: '```\nx\n```' }), msg({ id: 'a2', messageType: 'assistant.live', text: '```\ny\n```' })],
    [msg({ id: 'a', text: '> ```sh\n> ls\n> ```' })],
    [msg({ id: 'a', text: '- 一\n\n  ```sh\n  ls\n  ```' })],
  ]

  it('hasAssistantCodeBlock === (findLastAssistantCodeBlock !== null) 逐例成立', () => {
    let checked = 0
    for (const messages of corpus) {
      expect(hasAssistantCodeBlock(messages)).toBe(findLastAssistantCodeBlock(messages) !== null)
      checked += 1
    }
    expect(checked).toBe(corpus.length)
  })

  it('对照组非空：语料里既有为真也有为假的样本', () => {
    const flags = corpus.map((messages) => hasAssistantCodeBlock(messages))
    expect(flags).toContain(true)
    expect(flags).toContain(false)
  })
})
