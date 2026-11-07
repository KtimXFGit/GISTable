import { readFileSync } from 'node:fs'

const paths = ['src/pages/WorkspacePage.vue', 'src/styles/main.css', 'index.html']
const forbidden = ['演示模式', '待开发', '建设中', '后续开发', '功能暂未', '技术验证', '测试系统', '此页面作为演示', '当前功能等待']
let hasError = false
for (const path of paths) {
  const content = readFileSync(path, 'utf8')
  for (const phrase of forbidden) {
    if (content.includes(phrase)) {
      console.error(`界面文案不符合规范: ${path} (${phrase})`)
      hasError = true
    }
  }
}
if (hasError) process.exit(1)
console.log('界面文案检查通过')
