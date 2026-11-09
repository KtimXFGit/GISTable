import { strict as assert } from 'node:assert'
import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'

const url = process.env.GISTABLE_URL || 'https://ktimxfgit.github.io/GISTable/'
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const runtimeErrors = []
const imageryResponses = { eox: { requested: 0, ok: 0, failed: 0, networkErrors: [] }, nasa: { requested: 0, ok: 0, failed: 0, networkErrors: [] } }
function providerKey(url) {
  return url.includes('tiles.maps.eox.at') ? 'eox'
    : url.includes('gibs.earthdata.nasa.gov') ? 'nasa' : null
}
page.on('request', (request) => {
  const key = providerKey(request.url())
  if (key) imageryResponses[key].requested++
})
page.on('requestfailed', (request) => {
  const key = providerKey(request.url())
  if (key && imageryResponses[key].networkErrors.length < 8) {
    imageryResponses[key].networkErrors.push(request.failure()?.errorText || 'network error')
  }
})
page.on('pageerror', (error) => runtimeErrors.push(error.message))
page.on('response', (response) => {
  const key = providerKey(response.url())
  if (key) imageryResponses[key][response.ok() ? 'ok' : 'failed']++
})
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForFunction(() => document.querySelector('.stats-row strong')?.textContent?.trim() === '3', { timeout: 15000 })
  assert.match(await page.title(), /GISTable/)
  assert(await page.locator('.map-element').isVisible())
  assert(await page.locator('.workspace-rail').isVisible(), '桌面功能导航应该可见')
  assert(await page.locator('.right-tabs').isVisible(), '右侧对象属性面板应该可见')
  const bounds = await Promise.all([
    page.locator('.workspace-rail').boundingBox(),
    page.locator('.left-panel').boundingBox(),
    page.locator('.map-stage').boundingBox(),
    page.locator('.right-panel').boundingBox(),
    page.locator('.map-toolbar').boundingBox(),
    page.locator('.map-element').boundingBox(),
  ])
  assert(bounds.every(Boolean), '所有桌面布局组件应可测量')
  assert(bounds[0].x + bounds[0].width <= bounds[1].x + 3, '功能导航不应覆盖图层面板')
  assert(bounds[1].x + bounds[1].width <= bounds[2].x + 3, '图层面板不应覆盖地图')
  assert(bounds[2].x + bounds[2].width <= bounds[3].x + 3, '地图不应覆盖属性面板')
  assert(bounds[4].y + bounds[4].height <= bounds[5].y + 3, '工具栏不应遮挡地图绘制区域')

  const roadsToggle = page.getByRole('button', { name: '隐藏公路线路' })
  await roadsToggle.click()
  assert(await page.getByRole('button', { name: '显示公路线路' }).isVisible())
  await page.getByRole('button', { name: '显示公路线路' }).click()

  await page.locator('.primary-nav button').nth(1).click()
  await page.locator('#gis-imagery-source').selectOption('street')
  assert.match(await page.locator('.map-heading-sub').innerText(), /道路地图/)
  await page.locator('#gis-imagery-source').selectOption('modis2024')
  await page.waitForTimeout(3000)
  await page.locator('.compare-switch').click()
  assert(await page.locator('.swipe-divider').isVisible())
  await page.locator('#gis-time-a').selectOption('sentinel2016')
  await page.locator('#gis-time-b').selectOption('modis2025')
  await page.locator('.swipe-bottom-slider input').evaluate((input) => {
    input.value = '72'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  assert.match(await page.locator('.swipe-divider').getAttribute('style'), /72%/)
  await page.screenshot({path:'browser-smoke-comparison.png'})
  const nasaProbe = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2024-06-15/GoogleMapsCompatible_Level9/3/6/3.jpg'
  try {
    const response = await page.request.get(nasaProbe, {timeout:15000})
    console.log('NASA GIBS direct tile probe:', response.status(), response.headers()['content-type'])
  } catch (error) {
    console.log('NASA GIBS direct tile probe failed:', error instanceof Error ? error.message.slice(0,240) : String(error))
  }

  await page.locator('.compare-switch').click()
  await page.locator('button[title="绘制点标注"]').click()
  await page.locator('.map-element').click({ position: { x: 390, y: 320 } })
  await page.locator('input[aria-label="标注名称"]').waitFor({ timeout: 10000 })
  await page.locator('input[aria-label="标注名称"]').fill('巡查关注点-01')
  await page.locator('textarea[aria-label="标注备注"]').fill('地图现场关注对象')
  await page.getByRole('button', { name: '保存属性' }).click()
  await page.getByRole('button', { name: '对象目录' }).click()
  await page.getByPlaceholder('输入名称、编号或类别...').fill('巡查关注点-01')
  assert.equal(await page.locator('.full-list .compact-record').count(), 1, '新建标注应可检索')

  const geoInput = page.locator('input[type=file]')
  const invalid = { type:'FeatureCollection', features:[
    { type:'Feature', geometry:{type:'Point',coordinates:[300,95]}, properties:{name:'bad-coordinate'} }
  ] }
  await geoInput.setInputFiles({name:'invalid.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(invalid))})
  assert.match(await page.locator('.toast-notice').innerText(), /WGS84/)
  const valid = { type:'FeatureCollection', features:[
    {type:'Feature',geometry:{type:'Point',coordinates:[104.08,30.66]},properties:{name:'导入关注点-02',category:'现场记录'}}
  ] }
  await geoInput.setInputFiles({name:'valid.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(valid))})
  await page.waitForFunction(() => document.querySelectorAll('.stats-row strong')[2]?.textContent?.trim() === '2', {timeout:10000})
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    page.getByRole('button', { name: /导出标注/ }).first().click(),
  ])
  const exportData = JSON.parse(await readFile(await download.path(), 'utf8'))
  assert.equal(exportData.features.length, 2, '导出应包含所有标注')
  assert(exportData.features.some((feature) => feature.properties?.name === '巡查关注点-01'))


  await page.waitForFunction(() => {
    const txt = window.localStorage.getItem('gistable:workspace:annotations:v1')
    return Boolean(txt && txt.includes('巡查关注点-01'))
  }, { timeout: 10000 })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.querySelectorAll('.stats-row strong')[2]?.textContent?.trim() === '2', {timeout: 10000})
  await page.locator('.right-tabs button').nth(1).click()
  assert.equal(await page.locator('.annotation-records .annotation-record').count(), 2)
  await page.locator('.right-tabs button').first().click()
  await page.waitForTimeout(4500)
  await page.screenshot({path:'browser-smoke-desktop.png'})
  await page.setViewportSize({width:390,height:844})
  await page.locator('.mobile-panel-button').click()
  assert(await page.locator('.left-panel.mobile-open').isVisible(), '移动端应能够打开图层菜单')
  await page.getByRole('button', {name:'对象目录'}).click()
  await page.getByPlaceholder('输入名称、编号或类别...').fill('巡查关注点-01')
  await page.locator('.full-list .compact-record').first().click()
  assert(await page.locator('.right-panel.detail-open').isVisible(), '移动端应能够查看与编辑对象')
  await page.screenshot({path:'browser-smoke-mobile.png'})
  const toolsPage = await browser.newPage({viewport:{width:1440,height:900}})
  const toolsErrors = []
  toolsPage.on('pageerror', error => toolsErrors.push(error.message))
  try {
    await toolsPage.goto(url, {waitUntil:'domcontentloaded',timeout:45000})
    await toolsPage.waitForFunction(() => document.querySelectorAll('.stats-row strong')[0]?.textContent?.trim() === '3', {timeout:15000})
    const stage = toolsPage.locator('.map-element')
    await toolsPage.locator('button[title="绘制线标注"]').click()
    await stage.click({position:{x:210,y:230}})
    await stage.click({position:{x:310,y:260}})
    await stage.dblclick({position:{x:400,y:300}})
    await toolsPage.waitForFunction(() => document.querySelectorAll('.stats-row strong')[2]?.textContent?.trim() === '1',{timeout:10000})

    await toolsPage.locator('button[title="绘制面标注"]').click()
    await stage.click({position:{x:210,y:210}})
    await stage.click({position:{x:330,y:220}})
    await stage.dblclick({position:{x:300,y:340}})
    await toolsPage.waitForFunction(() => document.querySelectorAll('.stats-row strong')[2]?.textContent?.trim() === '2',{timeout:10000})

    await toolsPage.locator('button[title="测量距离"]').click()
    await stage.click({position:{x:180,y:260}})
    await stage.dblclick({position:{x:300,y:320}})
    assert.match(await toolsPage.locator('.measure-result').innerText(), /测量距离/)

    await toolsPage.locator('button[title="测量面积"]').click()
    await stage.click({position:{x:190,y:180}})
    await stage.click({position:{x:300,y:200}})
    await stage.dblclick({position:{x:270,y:340}})
    assert.match(await toolsPage.locator('.measure-result').innerText(), /测量面积/)

    toolsPage.once('dialog', dialog => dialog.accept())
    await toolsPage.getByRole('button', {name:'清空标注'}).click()
    await toolsPage.waitForFunction(() => document.querySelectorAll('.stats-row strong')[2]?.textContent?.trim() === '0',{timeout:10000})
    assert.equal(toolsErrors.length,0,toolsErrors.join('\n'))
  } finally {
    await toolsPage.close()
  }
  assert.equal(runtimeErrors.length, 0, runtimeErrors.join('\n'))
  console.log('Imagery provider HTTP response observations:', JSON.stringify(imageryResponses))
  console.log('Browser GIS flow passed: layer controls, imagery/swipe, validated GeoJSON I/O, annotation persistence, mobile panels, line/polygon drawing, distance/area measurement, clearing')
} catch (error) {
  await page.screenshot({ path: 'browser-smoke-failure.png', fullPage: true }).catch(() => {})
  console.error('Browser GIS flow failed:', error)
  if (runtimeErrors.length) console.error(runtimeErrors)
  process.exitCode = 1
} finally {
  await browser.close()
}
