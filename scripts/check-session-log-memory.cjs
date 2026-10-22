#!/usr/bin/env node
// round-185 闸门：桥层不得再把 rollout（`sessions/**.jsonl`）整份读进内存。
//
// 事故经过（2026-10-22 线上）：`readFile(sessionPath, 'utf8')` + `split('\n')` 出现在
// 四条路径上（thread/read 的命令时序恢复与技能输入恢复、文件改动回退、项目 ZIP 导出）。
// 在 181MB 的线程上单次 `thread/read` 让桥的 RSS 从 438MB 涨到 1027MB（+589MB 常驻），
// 四路并发直接把 ~991MB 的 V8 堆顶穿，进程 core dump（栈里是
// `v8::String::NewFromUtf8` / `node::StringDecoder::DecodeData`）。桥挂掉期间
// `/codex-api/rpc` 全断，UI 上表现为「点保存什么都没发生」。
//
// 修法是把这些读取全部换成分行流式扫描（`bridge/sessionLogScan.ts`）。这道闸门防的是
// **回退**：任何人再写一次整读（或把整份日志装进一个叫 sessionLogRaw 的字符串），
// 退出码立刻非 0。
//
// 退出码：0 干净 / 1 命中违规 / 2 环境不足（源码目录缺失）
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const SERVER_DIR = path.join(ROOT, 'src', 'server')

// 1) 整份日志字符串：变量名本身就是这个反模式的指纹。
const WHOLE_LOG_IDENTIFIER = /\bsessionLogRaw\b/
// 2) 直接整读会话日志：`readFile(sessionPath, 'utf8')` 及其同族写法。
const WHOLE_FILE_READ = /\breadFile(?:Sync)?\s*\(\s*(?:[A-Za-z_$][\w$]*\.)?(?:sessionPath|sessionLogPath|rolloutPath|sessionFilePath)\b/
// 显式例外标记（见 scanSource 的说明）。
const ALLOW_MARKER = /session-log-memory:\s*allow/

const RULES = [
  {
    id: 'whole-log-string',
    why: '整份日志装进字符串（内存 2x 文件 + split 每行一个字符串）',
    match: (line) => WHOLE_LOG_IDENTIFIER.test(line),
  },
  {
    id: 'whole-file-read',
    why: '对 sessionPath 直接 readFile —— 改用 iterateSessionLogLines / readSessionLogFirstLine',
    match: (line) => WHOLE_FILE_READ.test(line),
  },
]

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

// 显式例外：`session-log-memory: allow` 写在违规行本身或上方 5 行以内（够覆盖「注释块 +
// 函数签名 + 局部声明」这种形状）。只接受「调用方已持有字符串、本函数不读文件」这一类；例外总数会被
// 打印出来，多一条就得有人解释。
function hasAllowAbove(lines, index) {
  for (let i = index; i >= 0 && i >= index - 5; i -= 1) {
    if (ALLOW_MARKER.test(lines[i] || '')) return true
  }
  return false
}

function scanSource(text) {
  const violations = []
  const allowances = []
  const lines = text.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    // 注释里讲解反模式是允许的（本模块自己的文档就这么写）。
    const code = line.replace(/^\s*\/\/.*$/, '').replace(/^\s*\*.*$/, '')
    if (!code.trim()) continue
    for (const rule of RULES) {
      if (!rule.match(code)) continue
      if (hasAllowAbove(lines, index)) {
        allowances.push({ line: index + 1, rule: rule.id })
        continue
      }
      violations.push({ line: index + 1, rule: rule.id, text: line.trim() })
    }
  }
  return { violations, allowances }
}

function selftest() {
  const cases = [
    ['  const sessionLogRaw = await readFile(sessionPath, \'utf8\')', true],
    ['  raw = await readFileSync(sessionPath, \'utf8\')', true],
    ['  const text = await readFile(sessionLogPath, \'utf8\')', true],
    ['  for await (const line of iterateSessionLogLines(sessionPath)) {', false],
    ['  const metaLine = await readSessionLogFirstLine(sessionPath)', false],
    ['  // 以前这里写 readFile(sessionPath) —— 已改流式', false],
    ['  const sessionPath = readNonEmptyString(thread?.path)', false],
    ['  const raw = await readFile(clientRequestPath, \'utf8\')', false],
  ]
  let failed = 0
  for (const [sample, shouldFlag] of cases) {
    const flagged = scanSource(sample).violations.length > 0
    if (flagged !== shouldFlag) {
      console.error(`selftest FAIL: ${shouldFlag ? '应命中' : '应放行'} :: ${sample}`)
      failed += 1
    }
  }
  if (failed > 0) {
    console.error(`selftest: ${failed}/${cases.length} 条失败`)
    return 1
  }
  console.log(`selftest: ${cases.length}/${cases.length} 通过`)
  return 0
}

function main() {
  if (process.argv.includes('--selftest')) return selftest()
  if (!fs.existsSync(SERVER_DIR)) {
    console.error(`环境不足：找不到 ${SERVER_DIR}`)
    return 2
  }

  const files = walk(SERVER_DIR).filter((file) => !file.endsWith('.test.ts'))
  const findings = []
  let allowanceCount = 0
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    const { violations, allowances } = scanSource(text)
    allowanceCount += allowances.length
    for (const violation of violations) {
      findings.push({ file: path.relative(ROOT, file).split(path.sep).join('/'), ...violation })
    }
  }

  if (findings.length > 0) {
    console.error(`会话日志整读残留 ${findings.length} 处：`)
    for (const finding of findings) {
      const rule = RULES.find((entry) => entry.id === finding.rule)
      console.error(`  ${finding.file}:${finding.line}  [${finding.rule}] ${rule ? rule.why : ''}`)
      console.error(`    ${finding.text}`)
    }
    return 1
  }

  console.log(`session-log memory OK: ${files.length} 个服务端源文件，0 处整读，${allowanceCount} 处显式例外`)
  return 0
}

process.exit(main())
