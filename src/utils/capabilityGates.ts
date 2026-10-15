// 批 4（round-168）：能力 → 必需 RPC 方法的声明式门控表（判定书批 4 #3）。
// 桌面端有「60+ 能力 × 最低版本」表；本轮先把「能力 = 全部必需方法存在」收敛到单一数据源，
// 替掉散落在 App.vue / DirectoryHub.vue 的内联方法数组。
// 版本维度（capability × minCliVersion 的**执行**）需要桥上报 CLI 版本后接入——
// 届时在 GATE 上加 `sinceCli` 字段并在 isCapabilitySupported 里比较；现阶段只做方法集合判定。

export interface CapabilityGate {
  readonly id: string
  /** 满足该能力所需的全部 RPC 方法（**全部**存在才算可用）。 */
  readonly methods: readonly string[]
}

export const CAPABILITY_GATES = {
  /** 设置页：hooks 能力（App.vue）。 */
  hooks: { id: 'hooks', methods: ['hooks/list'] },
  /** 设置页：远程控制四件套（App.vue）。 */
  remoteControl: {
    id: 'remoteControl',
    methods: [
      'remoteControl/status/read',
      'remoteControl/enable',
      'remoteControl/pairing/start',
      'remoteControl/client/list',
    ],
  },
  /** 目录页：插件管理（DirectoryHub.vue）。 */
  plugins: { id: 'plugins', methods: ['plugin/list', 'plugin/read', 'plugin/install', 'plugin/uninstall'] },
  /** 目录页：App 列表（DirectoryHub.vue）。 */
  apps: { id: 'apps', methods: ['app/list'] },
  /** 目录页：MCP 状态（DirectoryHub.vue）。 */
  mcps: { id: 'mcps', methods: ['mcpServerStatus/list'] },
  /** 目录页：MCP 配置重载（DirectoryHub.vue）。 */
  mcpReload: { id: 'mcpReload', methods: ['config/mcpServer/reload'] },
  /** 目录页：MCP OAuth 登录（DirectoryHub.vue）。 */
  mcpLogin: { id: 'mcpLogin', methods: ['mcpServer/oauth/login'] },
  /** 目录页：市场安装/移除/升级（DirectoryHub.vue）。 */
  marketplace: {
    id: 'marketplace',
    methods: ['marketplace/add', 'marketplace/remove', 'marketplace/upgrade'],
  },
  /** 目录页：插件分享（DirectoryHub.vue）。 */
  pluginShare: { id: 'pluginShare', methods: ['plugin/share/save', 'plugin/share/list', 'plugin/share/delete'] },
} as const satisfies Record<string, CapabilityGate>

export type CapabilityGateKey = keyof typeof CAPABILITY_GATES

/**
 * 能力是否可用 = 门控表里的**每个**方法都在目录里。
 * 「目录未加载时默认可用」的乐观策略由调用点的 computed 表达（与既有行为一致，不在这里收拢）。
 */
export function isCapabilitySupported(catalog: ReadonlySet<string>, gate: CapabilityGate): boolean {
  return gate.methods.every((method) => catalog.has(method))
}
