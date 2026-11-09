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
  assert(await page.locator('.latest-panel').isVisible(), '最新记录卡片区域应该可见')
  assert(await page.locator('.statistics-section .donut').isVisible(), '动态环形图应该可见')
  assert(await page.locator('.right-tabs').isVisible(), '对象属性标签应该可见')
  for (const [width,height,filename] of [
    [1920,1080,'browser-command-1920x1080.png'],
    [2560,1440,'browser-command-2560x1440.png'],
    [2048,1022,'browser-command-2048x1022.png'],
  ]) {
    await page.setViewportSize({width,height})
    await page.waitForTimeout(3200)
    const visual = await page.evaluate(() => {
      const css = (query) => {
        const el = document.querySelector(query)
        if (!el) return {font:0,visible:false}
        const st = getComputedStyle(el)
        return {font:parseFloat(st.fontSize),visible:st.display!=='none',width:el.getBoundingClientRect().width}
      }
      const panels = [...document.querySelectorAll('.left-panel .command-section,.right-panel .command-section,.latest-panel')]
      return {
        nav:css('.primary-nav .nav-link'),
        title:css('.panel-title strong'),
        layer:css('.layer-label strong'),
        toolbar:css('.map-toolbar button small'),
        kpi:css('.statistics-section .stats-row strong'),
        detail:css('.detail-fields strong'),
        iconCount:document.querySelectorAll('svg.ui-icon').length,
        panel:panels.map(e => ({name:e.className,client:e.clientHeight,scroll:e.scrollHeight})),
        contents:[...document.querySelectorAll('.left-panel .section-inner,.right-panel .detail-body')]
          .map(e => ({name:e.parentElement?.className,client:e.clientHeight,scroll:e.scrollHeight})),
        documentWidth:document.documentElement.scrollWidth,
        viewportWidth:innerWidth,
      }
    })
    console.log('Visual metrics',width,height,JSON.stringify(visual))
    assert(visual.nav.font >= 12, 'Navigation font too small at '+width)
    assert(visual.title.font >= 15, 'Panel title too small at '+width)
    assert(visual.layer.font >= 12.5, 'Layer name too small at '+width)
    assert(visual.toolbar.font >= 11, 'Map toolbar label too small at '+width)
    assert(visual.kpi.font >= 23, 'KPI font too small at '+width)
    assert(visual.iconCount >= 20, 'SVG icon family is not rendered')
    assert(visual.documentWidth <= width + 2, 'Unexpected horizontal document overflow at '+width)
    await page.screenshot({path:filename})
  }
  await page.setViewportSize({width:1440,height:900})
  const bounds = await Promise.all([
    page.locator('.left-panel').boundingBox(),
    page.locator('.map-stage').boundingBox(),
    page.locator('.right-panel').boundingBox(),
    page.locator('.map-toolbar').boundingBox(),
    page.locator('.map-element').boundingBox(),
    page.locator('.latest-panel').boundingBox(),
  ])
  assert(bounds.every(Boolean), '三栏驾驶舱组件应该具有有效布局')
  assert(bounds[0].x + bounds[0].width <= bounds[1].x + 4, '左侧图层面板不应覆盖地图')
  assert(bounds[1].x + bounds[1].width <= bounds[2].x + 4, '地图不应覆盖右侧统计看板')
  assert(bounds[3].x >= bounds[1].x && bounds[3].x + bounds[3].width <= bounds[1].x + bounds[1].width + 3, '悬浮工具栏应保持在地图内部')
  assert(bounds[5].y >= bounds[1].y + bounds[1].height - 3, '最新记录区域应位于地图下方')

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
  await page.locator('.layer-bottom-actions button').first().click()
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
    page.locator('button[title="导出 GeoJSON"]').click(),
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
  await page.locator('.layer-bottom-actions button').first().click()
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
    await toolsPage.locator('button[title="清空标注"]').click()
    await toolsPage.waitForFunction(() => document.querySelectorAll('.stats-row strong')[2]?.textContent?.trim() === '0',{timeout:10000})
    assert.equal(toolsErrors.length,0,toolsErrors.join('\n'))
  } finally {
    await toolsPage.close()
  }
  const workflowPage = await browser.newPage({viewport:{width:1440,height:900}})
  const workflowErrors = []
  workflowPage.on('pageerror', error => workflowErrors.push(error.message))
  try {
    await workflowPage.goto(url,{waitUntil:'domcontentloaded',timeout:45000})
    await workflowPage.waitForFunction(() => document.querySelector('.stats-row strong')?.textContent?.trim()==='3',{timeout:15000})
    await workflowPage.locator('.detect-button').click()
    const workingMap = workflowPage.locator('.map-element')
    await workingMap.click({position:{x:260,y:225}})
    await workingMap.click({position:{x:410,y:230}})
    await workingMap.dblclick({position:{x:350,y:345}})
    await workflowPage.waitForFunction(() => document.querySelectorAll('.stats-row strong')[2]?.textContent?.trim()==='1',{timeout:12000})
    assert.match(await workflowPage.locator('.latest-panel .panel-title strong').innerText(),/最新监测线索/)
    assert.equal(await workflowPage.locator('.latest-card-track .latest-card').count(),1)
    await workflowPage.getByRole('button',{name:/创建任务/}).click()
    await workflowPage.getByRole('button',{name:'开始巡查'}).click()
    await workflowPage.getByRole('button',{name:'提交核查'}).click()
    await workflowPage.getByRole('button',{name:'完成任务'}).click()
    await workflowPage.waitForFunction(() => document.querySelector('.progress-line strong')?.textContent?.includes('100%'),{timeout:8000})
    await workflowPage.reload({waitUntil:'domcontentloaded'})
    await workflowPage.waitForFunction(() => document.querySelectorAll('.stats-row strong')[3]?.textContent?.trim()==='1',{timeout:12000})
    assert.match(await workflowPage.locator('.progress-line strong').innerText(),/100%/)
    assert.equal(workflowErrors.length,0,workflowErrors.join('\n'))
    console.log('Local workflow passed: manual change polygon, dashboard clue card, patrol task lifecycle and reload persistence')
  } finally {
    await workflowPage.close()
  }
  assert.equal(runtimeErrors.length, 0, runtimeErrors.join('\n'))
  console.log('Imagery provider HTTP response observations:', JSON.stringify(imageryResponses))
  console.log('Browser GIS command center passed: dashboard geometry, charts, imagery swipe, GeoJSON, annotation persistence, mobile and GIS drawing tools')
} catch (error) {
  await page.screenshot({ path: 'browser-smoke-failure.png', fullPage: true }).catch(() => {})
  console.error('Browser GIS flow failed:', error)
  if (runtimeErrors.length) console.error(runtimeErrors)
  process.exitCode = 1
} finally {
  await browser.close()
}
