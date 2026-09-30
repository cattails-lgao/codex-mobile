import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'dist-cli/**', 'output/**'],
    // Windows 上这批 fs 密集测试（mkdtemp / realpath / rm -r）在 73 个文件并发时会
    // 互相争抢磁盘与 CPU：同一个测试隔离跑约 2.5s，并发下会超过默认的 5000ms，把
    // 「慢」误报成失败。用 --testTimeout=30000 复跑，三例超时全部消失（706 例里
    // 只剩 2 例真实失败）。15s 对正常测试（通常 <100ms）仍有百倍以上余量。
    testTimeout: 15000,
    hookTimeout: 15000,
  },
})
