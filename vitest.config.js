import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default defineConfig(configEnv => mergeConfig(
  viteConfig(configEnv),
  defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    alias: {
      "\\.css$": "identity-obj-proxy",
      "\\.svg\\?react$": "<rootDir>/test/mocks/svgr.ts",
      "^\\./IndexedDBWorker\\?worker$": "<rootDir>/test/mocks/workerMock.ts",
      "^\\./olm$": "<rootDir>/test/mocks/olmMock.ts"
    },
    css: {
      modules: {
        classNameStrategy: 'non-scoped'
      }
    },
    include: [
      "test/**/*-test.[jt]s?(x)"
    ],
    coverage: {
      reporter: ['text', 'html'],
      exclude: [
        'node_modules/'
      ]
    }
  }
})))