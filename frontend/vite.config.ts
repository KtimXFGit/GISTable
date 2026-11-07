import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_')
  return {
    plugins: [vue()],
    base: env.VITE_BASE_PATH || '/',
    build: { target: 'es2022' },
  }
})
