import { defineConfig, mergeConfig } from 'vite'
import { readFileSync } from 'node:fs'
import baseConfig from './vite.config'

export default mergeConfig(baseConfig, defineConfig({
  server: {
    host: '0.0.0.0',
    https: {
      key: readFileSync('.cert/localhost-key.pem'),
      cert: readFileSync('.cert/localhost-cert.pem'),
    },
  },
}))
