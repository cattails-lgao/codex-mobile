import { describe, expect, it } from 'vitest'
import { parsePlanFromMessageText } from './plan'

describe('parsePlanFromMessageText', () => {
  it('parses checkbox steps with statuses unchanged', () => {
    const parsed = parsePlanFromMessageText([
      '# 计划',
      '- [ ] 第一步',
      '- [x] 已完成步骤',
      '- [~] 进行中步骤',
    ].join('\n'))
    expect(parsed).not.toBeNull()
    expect(parsed?.steps).toEqual([
      { step: '第一步', status: 'pending' },
      { step: '已完成步骤', status: 'completed' },
      { step: '进行中步骤', status: 'inProgress' },
    ])
  })

  it('prefers numbered items over bullets when both exist (real codex plan shape)', () => {
    const parsed = parsePlanFromMessageText([
      '# 本地图片批量重命名工具',
      '## 摘要',
      '- 纯标准库 Python CLI',
      '- 支持 --dry-run 与 --undo',
      '## 目录结构与实施步骤（每步产出）',
      '1. **脚手架** → 产出：目录骨架',
      '2. **主程序 renamer.py** → 产出：单文件 CLI',
      '3. **测试图片生成** → 产出：测试图片',
      '4. **自测脚本** → 产出：unittest 用例',
      '5. **说明文档 README.md** → 产出：使用说明',
      '6. **演示与验证** → 产出：演示输出',
    ].join('\n'))
    expect(parsed).not.toBeNull()
    expect(parsed?.steps).toHaveLength(6)
    expect(parsed?.steps[0]?.step).toBe('**脚手架** → 产出：目录骨架')
    expect(parsed?.steps[5]?.step).toBe('**演示与验证** → 产出：演示输出')
    // 编号优先时项目符号是细节说明：既不当步骤，也不进 explanation
    expect(parsed?.explanation).not.toContain('纯标准库 Python CLI')
    expect(parsed?.explanation).toContain('本地图片批量重命名工具')
    expect(parsed?.explanation).not.toContain('##')
  })

  it('falls back to bullets when there are no numbered items', () => {
    const parsed = parsePlanFromMessageText([
      '## 实施步骤',
      '- 搭建目录',
      '- 实现主程序',
      '- 编写自测',
    ].join('\n'))
    expect(parsed).not.toBeNull()
    expect(parsed?.steps).toHaveLength(3)
    expect(parsed?.steps[1]?.step).toBe('实现主程序')
  })

  it('strips markdown heading markers from the explanation', () => {
    const parsed = parsePlanFromMessageText([
      '# 标题',
      '## 小节',
      '1. 步骤一',
    ].join('\n'))
    expect(parsed?.explanation).toBe('标题\n小节')
  })

  it('returns null for text without any list items', () => {
    expect(parsePlanFromMessageText('只是普通文字')).toBeNull()
  })
})
