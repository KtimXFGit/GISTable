import { strict as assert } from 'node:assert'
import { chromium } from 'playwright'

const url = process.env.GISTABLE_URL || 'https://ktimxfgit.github.io/GISTable/'
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const runtimeErrors = []
page.on('pageerror', (error) => runtimeErrors.push(error.message))
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForFunction(() => document.querySelector('.stats-row strong')?.textContent?.trim() === '3', { timeout: 15000 })
  assert.match(await page.title(), /GISTable/)
  assert(await page.locator('.map-element').isVisible())

  await page.locator('.primary-nav button').nth(1).click()
  await page.locator('#gis-imagery-source').selectOption('modis2024')
  await page.locator('.compare-switch').click()
  assert(await page.locator('.swipe-divider').isVisible())
  await page.locator('#gis-time-a').selectOption('sentinel2016')
  await page.locator('#gis-time-b').selectOption('modis2025')
  await page.locator('.swipe-bottom-slider input').evaluate((input) => {
    input.value = '72'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  assert.match(await page.locator('.swipe-divider').getAttribute('style'), /72%/)

  await page.locator('.compare-switch').click()
  await page.locator('button[title="绘制点标注"]').click()
  await page.locator('.map-element').click({ position: { x: 390, y: 320 } })
  await page.locator('input[aria-label="标注名称"]').waitFor({ timeout: 10000 })
  await page.locator('input[aria-label="标注名称"]').fill('巡查关注点-01')
  await page.locator('textarea[aria-label="标注备注"]').fill('地图现场关注对象')
  await page.getByRole('button', { name: '保存属性' }).click()

  await page.waitForFunction(() => {
    const txt = window.localStorage.getItem('gistable:workspace:annotations:v1')
    return Boolean(txt && txt.includes('巡查关注点-01'))
  }, { timeout: 10000 })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => [...document.querySelectorAll('.stats-row strong')].some((x) => x.textContent?.trim() === '1'), { timeout: 10000 })
  assert.equal(runtimeErrors.length, 0, runtimeErrors.join('\n'))
  console.log('Browser GIS flow passed: imagery, swipe, annotation editing and local restore')
} catch (error) {
  await page.screenshot({ path: 'browser-smoke-failure.png', fullPage: true }).catch(() => {})
  console.error('Browser GIS flow failed:', error)
  if (runtimeErrors.length) console.error(runtimeErrors)
  process.exitCode = 1
} finally {
  await browser.close()
}
