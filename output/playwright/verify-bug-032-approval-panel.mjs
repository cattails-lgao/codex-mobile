import { chromium } from 'playwright'

const BASE_URL = process.env.CODEXUI_BASE_URL || 'http://127.0.0.1:4176'
const THREAD_ID = '0195f727-b3ce-b843-bcb7-04b36dc70451'
const CWD = 'D:\\RENAT\\Documents\\codexui-fork'
const DARK_MODE_KEY = 'codex-web-local.dark-mode.v1'
const CREATED_AT = 1774680000
const UPDATED_AT = 1774680300
const APPROVAL_REQUEST_ID = 32032
const APPROVAL_WRAPPED_COMMAND = '"C:\\\\Windows\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe" -Command "cmd /c \\"echo approval-test > %TEMP%\\\\codex-approval-test.txt\\""' 
const APPROVAL_COMMAND = 'cmd /c "echo approval-test > %TEMP%\\\\codex-approval-test.txt"'
const APPROVAL_PROMPT = 'Do you want to allow creating the requested approval test file in %TEMP% with one cmd command?'
const FOLLOW_UP_MESSAGE = 'Please do this another way without writing outside the workspace.'
const FOLLOW_UP_VISIBILITY_DELAY_MS = 2500

const respondBodies = []
const turnStartBodies = []

function buildThread({
  id,
  name,
  preview,
  updatedAt,
  createdAt,
  inProgress = false,
  turns = [],
}) {
  return {
    id,
    preview,
    name,
    cwd: CWD,
    updatedAt,
    createdAt,
    modelProvider: 'openai',
    path: null,
    cliVersion: '0.0.0-dev',
    source: 'appServer',
    gitInfo: { branch: 'main' },
    turns,
    status: inProgress ? 'inProgress' : 'completed',
    inProgress,
    agentNickname: null,
    agentRole: null,
  }
}

function buildThreadListPayload() {
  return {
    data: [
      buildThread({
        id: THREAD_ID,
        name: 'Run approval-test command',
        preview: 'Approval request should replace the composer.',
        updatedAt: UPDATED_AT,
        createdAt: CREATED_AT,
        inProgress: true,
      }),
    ],
    nextCursor: null,
  }
}

function buildThreadReadPayload(mockState) {
  const followUpVisible =
    mockState.followUpRequestedAtMs > 0 &&
    Date.now() - mockState.followUpRequestedAtMs >= FOLLOW_UP_VISIBILITY_DELAY_MS

  const turns = [
    {
      id: 'turn-approval-sequence',
      status: 'inProgress',
      items: [
        {
          type: 'userMessage',
          id: 'user-approval-seed',
          content: [
            {
              type: 'text',
              text: 'Run the approval-test command and ask for approval first.',
            },
          ],
        },
        {
          type: 'agentMessage',
          id: 'assistant-explanation-1',
          text: 'The desktop app emitted a pending approval request. CodexUI should show it as a bottom waiting panel instead of a chat message.',
        },
        {
          type: 'agentMessage',
          id: 'assistant-explanation-2',
          text: 'This thread intentionally contains enough history to make the old top-of-chat rendering obvious if it ever regresses.',
        },
        {
          type: 'agentMessage',
          id: 'assistant-explanation-3',
          text: 'When the request is answered, the normal composer should come back immediately.',
        },
      ],
    },
  ]

  if (followUpVisible) {
    turns.push({
      id: 'turn-approval-follow-up',
      status: 'inProgress',
      items: [
        {
          type: 'userMessage',
          id: 'user-follow-up-message',
          content: [
            {
              type: 'text',
              text: FOLLOW_UP_MESSAGE,
            },
          ],
        },
      ],
    })
  }

  return {
    thread: buildThread({
      id: THREAD_ID,
      name: 'Run approval-test command',
      preview: 'Approval request should replace the composer.',
      updatedAt: UPDATED_AT,
      createdAt: CREATED_AT,
      inProgress: true,
      turns,
    }),
  }
}

function buildPendingApprovalRequest() {
  return {
    id: APPROVAL_REQUEST_ID,
    method: 'item/commandExecution/requestApproval',
    threadId: THREAD_ID,
    turnId: 'turn-approval-sequence',
    itemId: 'approval-item-1',
    receivedAtIso: '2026-03-28T09:15:00.000Z',
    params: {
      id: APPROVAL_REQUEST_ID,
      method: 'item/commandExecution/requestApproval',
      threadId: THREAD_ID,
      turnId: 'turn-approval-sequence',
      itemId: 'approval-item-1',
      reason: APPROVAL_PROMPT,
      command: APPROVAL_WRAPPED_COMMAND,
      cwd: CWD,
      commandActions: [
        {
          type: 'unknown',
          command: APPROVAL_COMMAND,
        },
      ],
    },
  }
}

function jsonResponse(body, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  }
}

async function installApiMocks(page) {
  const mockState = {
    followUpRequestedAtMs: 0,
  }

  await page.route('**/codex-api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())

    if (url.pathname === '/codex-api/rpc' && request.method() === 'POST') {
      const payload = JSON.parse(request.postData() || '{}')
      const method = typeof payload.method === 'string' ? payload.method : ''

      switch (method) {
        case 'thread/list':
          await route.fulfill(jsonResponse({ result: buildThreadListPayload() }))
          return
        case 'thread/read':
          await route.fulfill(jsonResponse({ result: buildThreadReadPayload(mockState) }))
          return
        case 'thread/resume':
        case 'turn/interrupt':
        case 'setDefaultModel':
        case 'config/batchWrite':
          await route.fulfill(jsonResponse({ result: {} }))
          return
        case 'turn/start':
          turnStartBodies.push(payload.params ?? null)
          mockState.followUpRequestedAtMs = Date.now()
          await route.fulfill(jsonResponse({ result: {} }))
          return
        case 'model/list':
          await route.fulfill(jsonResponse({
            result: {
              data: [
                { id: 'gpt-5.4' },
                { id: 'gpt-5.4-mini' },
              ],
            },
          }))
          return
        case 'config/read':
          await route.fulfill(jsonResponse({
            result: {
              config: {
                model: 'gpt-5.4',
                model_reasoning_effort: 'high',
                service_tier: 'default',
              },
            },
          }))
          return
        case 'account/rateLimits/read':
          await route.fulfill(jsonResponse({
            result: {
              rateLimits: null,
              rateLimitsByLimitId: {},
            },
          }))
          return
        case 'skills/list':
          await route.fulfill(jsonResponse({
            result: {
              data: [],
            },
          }))
          return
        default:
          await route.fulfill(jsonResponse({ result: {} }))
          return
      }
    }

    if (url.pathname === '/codex-api/server-requests/pending' && request.method() === 'GET') {
      await route.fulfill(jsonResponse({ data: [buildPendingApprovalRequest()] }))
      return
    }

    if (url.pathname === '/codex-api/server-requests/respond' && request.method() === 'POST') {
      respondBodies.push(JSON.parse(request.postData() || '{}'))
      await route.fulfill(jsonResponse({ ok: true }))
      return
    }

    if (url.pathname === '/codex-api/home-directory' && request.method() === 'GET') {
      await route.fulfill(jsonResponse({ data: { path: 'D:\\RENAT\\Documents' } }))
      return
    }

    if (url.pathname === '/codex-api/workspace-roots-state' && request.method() === 'GET') {
      await route.fulfill(jsonResponse({
        data: {
          order: [CWD],
          labels: { [CWD]: 'codexui-fork' },
          active: [CWD],
        },
      }))
      return
    }

    if (url.pathname === '/codex-api/project-root-suggestion' && request.method() === 'GET') {
      await route.fulfill(jsonResponse({
        data: {
          name: 'codexui-fork-approval-test',
          path: 'D:\\RENAT\\Documents\\codexui-fork-approval-test',
        },
      }))
      return
    }

    if (url.pathname === '/codex-api/thread-read-state') {
      await route.fulfill(jsonResponse({ data: {} }))
      return
    }

    if (url.pathname === '/codex-api/thread-titles') {
      await route.fulfill(jsonResponse({ data: { titles: {}, order: [] } }))
      return
    }

    if (url.pathname === '/codex-api/transport-diagnostics' || url.pathname === '/codex-api/system-row-diagnostics') {
      await route.fulfill(jsonResponse({ ok: true }))
      return
    }

    await route.fulfill(jsonResponse({ data: {} }))
  })
}

async function assertPendingPanelLayout(page, viewportLabel) {
  await page.waitForSelector('.thread-pending-request-shell', { timeout: 15000 })
  await page.waitForTimeout(2500)

  const shell = page.locator('.composer-with-queue > .thread-pending-request .thread-pending-request-shell')
  const shellCount = await shell.count()
  if (shellCount !== 1) {
    throw new Error(`[${viewportLabel}] Expected one pending request shell inside composer slot, found ${shellCount}`)
  }

  const nestedInConversation = await page.locator('.conversation-list .thread-pending-request').count()
  if (nestedInConversation !== 0) {
    throw new Error(`[${viewportLabel}] Pending request panel rendered inside the conversation list`)
  }

  const oldRequestCards = await page.locator('.conversation-list .request-card').count()
  if (oldRequestCards !== 0) {
    throw new Error(`[${viewportLabel}] Old top-of-chat request cards are still rendering`)
  }

  const composerCount = await page.locator('.thread-composer').count()
  if (composerCount !== 0) {
    throw new Error(`[${viewportLabel}] Thread composer should be hidden while approval is pending`)
  }

  const sidebarChip = page.locator('.thread-row-request-chip').first()
  if (await sidebarChip.count() !== 1) {
    throw new Error(`[${viewportLabel}] Expected an awaiting-approval chip in the sidebar`)
  }

  const promptText = (await shell.locator('.thread-pending-request-title').innerText()).replace(/\s+/gu, ' ').trim()
  if (!promptText.includes('allow creating the requested approval test file')) {
    throw new Error(`[${viewportLabel}] Unexpected approval prompt: ${promptText}`)
  }

  const eyebrowCount = await shell.locator('.thread-pending-request-eyebrow').count()
  if (eyebrowCount !== 0) {
    throw new Error(`[${viewportLabel}] Approval panel should not show an eyebrow label`)
  }

  const previewText = (await shell.locator('.thread-pending-request-command-line').innerText()).replace(/\s+/gu, ' ').trim()
  if (previewText !== APPROVAL_COMMAND) {
    throw new Error(`[${viewportLabel}] Approval preview should show the unwrapped command only, got: ${previewText}`)
  }

  if (previewText.includes('WindowsPowerShell')) {
    throw new Error(`[${viewportLabel}] Approval preview leaked the PowerShell wrapper`)
  }

  const optionCount = await shell.locator('.thread-pending-request-option').count()
  if (optionCount !== 2) {
    throw new Error(`[${viewportLabel}] Expected exactly 2 clickable approval options, found ${optionCount}`)
  }

  const inlineInput = shell.locator('.thread-pending-request-inline-control')
  if (await inlineInput.count() !== 1) {
    throw new Error(`[${viewportLabel}] Expected an inline freeform input for option 3`)
  }

  const panelBox = await shell.boundingBox()
  if (!panelBox) {
    throw new Error(`[${viewportLabel}] Pending request panel was not visible`)
  }

  const queueBox = await page.locator('.composer-with-queue').boundingBox()
  if (queueBox && panelBox.width < queueBox.width * 0.88) {
    throw new Error(`[${viewportLabel}] Pending panel should span almost the full composer width`)
  }

  const viewport = page.viewportSize()
  if (!viewport) {
    throw new Error(`[${viewportLabel}] Missing viewport metadata`)
  }

  if (panelBox.y + panelBox.height > viewport.height + 6) {
    throw new Error(`[${viewportLabel}] Pending panel overflowed past the viewport bottom`)
  }

  if (viewportLabel === 'desktop') {
    const optionOneBox = await shell.locator('.thread-pending-request-option').nth(0).boundingBox()
    const optionTwoBox = await shell.locator('.thread-pending-request-option').nth(1).boundingBox()
    const inlineRowBox = await shell.locator('.thread-pending-request-inline-input').boundingBox()
    const skipBox = await shell.locator('.thread-pending-request-secondary').boundingBox()
    const sendBox = await shell.locator('.thread-pending-request-primary').boundingBox()

    if (!optionOneBox || !optionTwoBox || !inlineRowBox || !skipBox || !sendBox) {
      throw new Error('[desktop] Missing inline approval controls')
    }

    if (Math.abs(optionOneBox.x - optionTwoBox.x) >= 2 || Math.abs(optionOneBox.x - inlineRowBox.x) >= 2) {
      throw new Error('[desktop] Approval options and inline option 3 should share the same left alignment')
    }

    const sameRow = Math.max(
      Math.abs(inlineRowBox.y - skipBox.y),
      Math.abs(inlineRowBox.y - sendBox.y),
    ) < 18

    if (!sameRow) {
      throw new Error('[desktop] Option 3 input, Skip, and Send should stay on the same row')
    }

    const controlHeights = [
      optionOneBox.height,
      optionTwoBox.height,
      inlineRowBox.height,
      skipBox.height,
      sendBox.height,
    ]
    const minHeight = Math.min(...controlHeights)
    const maxHeight = Math.max(...controlHeights)

    if (maxHeight - minHeight > 4) {
      throw new Error(`[desktop] Approval controls should have matching compact heights, got: ${controlHeights.join(', ')}`)
    }
  }
}

async function createContext(browser, width, height) {
  const context = await browser.newContext({ viewport: { width, height } })
  await context.addInitScript(({ threadId, darkModeKey }) => {
    localStorage.setItem('codex-web-local.selected-thread-id.v1', threadId)
    localStorage.setItem(darkModeKey, 'dark')
    Object.defineProperty(window, 'WebSocket', { configurable: true, writable: true, value: undefined })
    Object.defineProperty(window, 'EventSource', { configurable: true, writable: true, value: undefined })
    Object.defineProperty(Navigator.prototype, 'sendBeacon', {
      configurable: true,
      writable: true,
      value: () => true,
    })
  }, { threadId: THREAD_ID, darkModeKey: DARK_MODE_KEY })
  return context
}

async function runViewportVerification(browser, {
  width,
  height,
  name,
  screenshotPath,
  submissionKind = null,
}) {
  const context = await createContext(browser, width, height)
  const page = await context.newPage()
  const pageErrors = []
  const consoleMessages = []

  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleMessages.push(message.text())
    }
  })

  await installApiMocks(page)
  await page.goto(`${BASE_URL}/#/thread/${THREAD_ID}`, { waitUntil: 'domcontentloaded' })
  await assertPendingPanelLayout(page, name)

  if (screenshotPath) {
    await page.screenshot({ path: screenshotPath, fullPage: true })
  }

  if (submissionKind === 'acceptForSession') {
    const initialRespondCount = respondBodies.length
    await page.locator('.thread-pending-request-option').nth(1).click()
    await page.locator('.thread-pending-request-primary').click()
    await page.waitForFunction(
      () => !document.querySelector('.thread-pending-request') && !!document.querySelector('.thread-composer'),
      null,
      { timeout: 10000 },
    )

    if (respondBodies.length !== initialRespondCount + 1) {
      throw new Error(`[${name}] Expected one approval response payload, received ${respondBodies.length - initialRespondCount}`)
    }

    const approvalPayload = respondBodies.at(-1)
    if (approvalPayload?.id !== APPROVAL_REQUEST_ID) {
      throw new Error(`[${name}] Approval response used the wrong request id: ${JSON.stringify(approvalPayload)}`)
    }

    if (approvalPayload?.result?.decision !== 'acceptForSession') {
      throw new Error(`[${name}] Expected acceptForSession reply, got: ${JSON.stringify(approvalPayload)}`)
    }
  }

  if (submissionKind === 'declineWithMessage') {
    const initialRespondCount = respondBodies.length
    const initialTurnStartCount = turnStartBodies.length

    await page.locator('.thread-pending-request-inline-control').fill(FOLLOW_UP_MESSAGE)
    await page.locator('.thread-pending-request-primary').click()
    await page.waitForFunction(
      () => !document.querySelector('.thread-pending-request') && !!document.querySelector('.thread-composer'),
      null,
      { timeout: 10000 },
    )

    if (respondBodies.length !== initialRespondCount + 1) {
      throw new Error(`[${name}] Expected one decline response payload, received ${respondBodies.length - initialRespondCount}`)
    }

    const approvalPayload = respondBodies.at(-1)
    if (approvalPayload?.id !== APPROVAL_REQUEST_ID) {
      throw new Error(`[${name}] Decline response used the wrong request id: ${JSON.stringify(approvalPayload)}`)
    }

    if (approvalPayload?.result?.decision !== 'decline') {
      throw new Error(`[${name}] Expected decline reply, got: ${JSON.stringify(approvalPayload)}`)
    }

    if ('note' in (approvalPayload?.result ?? {})) {
      throw new Error(`[${name}] Approval result should not include a note payload once follow-up text uses normal message send`)
    }

    if (turnStartBodies.length !== initialTurnStartCount + 1) {
      throw new Error(`[${name}] Expected one follow-up turn/start payload, received ${turnStartBodies.length - initialTurnStartCount}`)
    }

    const turnStartPayload = turnStartBodies.at(-1)
    if (turnStartPayload?.threadId !== THREAD_ID) {
      throw new Error(`[${name}] Follow-up turn/start used the wrong thread: ${JSON.stringify(turnStartPayload)}`)
    }

    const firstInput = Array.isArray(turnStartPayload?.input) ? turnStartPayload.input[0] : null
    if (firstInput?.type !== 'text' || firstInput?.text !== FOLLOW_UP_MESSAGE) {
      throw new Error(`[${name}] Follow-up message should be sent through turn/start with the typed text, got: ${JSON.stringify(turnStartPayload)}`)
    }

    await page.waitForFunction(
      (text) => document.body.innerText.includes(text),
      FOLLOW_UP_MESSAGE,
      { timeout: 10000 },
    )
  }

  if (pageErrors.length > 0) {
    throw new Error(`[${name}] Page errors: ${pageErrors.join(' | ')}`)
  }

  if (consoleMessages.length > 0) {
    throw new Error(`[${name}] Console errors: ${consoleMessages.join(' | ')}`)
  }

  await context.close()
}

const browser = await chromium.launch({ headless: true })

try {
  await runViewportVerification(browser, {
    width: 1440,
    height: 1024,
    name: 'desktop',
    screenshotPath: 'output/playwright/bug-032-approval-panel-desktop.png',
    submissionKind: 'declineWithMessage',
  })

  await runViewportVerification(browser, {
    width: 375,
    height: 812,
    name: 'mobile',
    screenshotPath: 'output/playwright/bug-032-approval-panel-mobile.png',
  })

  await runViewportVerification(browser, {
    width: 768,
    height: 1024,
    name: 'tablet',
    screenshotPath: 'output/playwright/bug-032-approval-panel-tablet.png',
  })

  await runViewportVerification(browser, {
    width: 1280,
    height: 900,
    name: 'desktop-accept',
    screenshotPath: null,
    submissionKind: 'acceptForSession',
  })

  console.log(JSON.stringify({
    ok: true,
    screenshots: [
      'output/playwright/bug-032-approval-panel-desktop.png',
      'output/playwright/bug-032-approval-panel-mobile.png',
      'output/playwright/bug-032-approval-panel-tablet.png',
    ],
    response: respondBodies.at(-1) ?? null,
    followUpTurnStart: turnStartBodies.at(-1) ?? null,
  }, null, 2))
} finally {
  await browser.close()
}
