<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import Map from 'ol/Map'
import View from 'ol/View'
import Feature from 'ol/Feature'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import OSM from 'ol/source/OSM'
import { getRenderPixel } from 'ol/render'
import { imageCatalog, makeImagerySource, type ImageId } from '../repositories/imageryCatalog'
import { localAnnotationRepository } from '../repositories/annotationDraftRepository'
import { validateImportPayload } from '../lib/geojsonValidation'
import VectorSource from 'ol/source/Vector'
import GeoJSON from 'ol/format/GeoJSON'
import Draw from 'ol/interaction/Draw'
import Modify from 'ol/interaction/Modify'
import { defaults as defaultControls, ScaleLine } from 'ol/control'
import { fromLonLat, toLonLat } from 'ol/proj'
import { getArea, getLength } from 'ol/sphere'
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style'
import { getCenter } from 'ol/extent'
import { localTaskRepository, type LocalTask, type TaskState } from '../repositories/localTaskRepository'
import type Geometry from 'ol/geom/Geometry'
import { staticFeatureRepository } from '../repositories/featureRepository'

type Tool = 'browse' | 'point' | 'line' | 'polygon' | 'length' | 'area'
type LayerKey = 'basemap' | 'roads' | 'facilities' | 'annotations'
type RecordItem = {
  id: string
  name: string
  code: string
  category: string
  description: string
  unit: string
  feature: Feature<Geometry>
}

const mapElement = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const leftTab = ref<'layers' | 'objects' | 'imagery'>('layers')
const query = ref('')
const activeTool = ref<Tool>('browse')
const selected = shallowRef<RecordItem | null>(null)
const objectItems = shallowRef<RecordItem[]>([])
const annotationCount = ref(0)
const currentLonLat = ref('104.0670° E  30.6500° N')
const currentZoom = ref('12.0')
const notice = ref('')
const measureOutput = ref('')
const dataLoaded = ref(false)
const mobileMenuOpen = ref(false)
const detailDrawerOpen = ref(false)
const rightTab = ref<'details' | 'annotations' | 'tasks' | 'stats'>('details')
const imagerySelected = ref<ImageId | 'street'>('sentinel2016')
const compareEnabled = ref(false)
const compareBefore = ref<ImageId>('modis2024')
const compareAfter = ref<ImageId>('modis2025')
const swipePosition = ref(50)
const draftSaved = ref(false)
const annotationRevision = ref(0)
const imageryError = ref(false)
const layerGroup = ref<'base' | 'business' | 'topic'>('base')
const showClues = ref(true)
const drawAsClue = ref(false)
const selectedPeriod = ref<'7' | '30' | 'all'>('all')
const tasks = ref<LocalTask[]>([])
const analysisVisible = ref(true)
const inspectionVisible = ref(true)
let annotationSerial = 0
const editName = ref('')
const editCategory = ref('')
const editDescription = ref('')
const imageryLabel = computed(() => imageCatalog.find(x => x.id === imagerySelected.value)?.name || '道路地图')
const layersVisible = ref<Record<LayerKey, boolean>>({
  basemap: true, roads: true, facilities: true, annotations: true,
})
const layerOpacity = ref<Record<LayerKey, number>>({
  basemap: 100, roads: 100, facilities: 100, annotations: 100,
})
const usesSentinelImagery = computed(() => layersVisible.value.basemap && (
  compareEnabled.value
    ? compareBefore.value === 'sentinel2016' || compareAfter.value === 'sentinel2016'
    : imagerySelected.value === 'sentinel2016'
))

const roadSource = new VectorSource<Feature<Geometry>>()
const facilitySource = new VectorSource<Feature<Geometry>>()
const annotationSource = new VectorSource<Feature<Geometry>>()
const measureSource = new VectorSource<Feature<Geometry>>()
const highlightSource = new VectorSource<Feature<Geometry>>()
const geojson = new GeoJSON()

const baseLayer = new TileLayer({ className: 'gis-light-basemap', source: new OSM(), visible: true })
const historicalLayer = new TileLayer({ source: makeImagerySource('sentinel2016'), visible: true })
const comparisonLayer = new TileLayer({ source: makeImagerySource('modis2025'), visible: false })
const roadLayer = new VectorLayer({
  source: roadSource,
  style: (feature) => [
    new Style({ stroke: new Stroke({ color: 'rgba(20,219,250,.22)', width: 18 }) }),
    new Style({ stroke: new Stroke({ color: 'rgba(10,226,253,.53)', width: 10 }) }),
    new Style({ stroke: new Stroke({ color: '#031f38', width: 6 }) }),
    new Style({ stroke: new Stroke({ color: '#73f2ff', width: 2.6 }) }),
    new Style({ text: new Text({
      text: String(feature.get('name') || ''), placement: 'line',
      fill: new Fill({color:'#e9ffff'}), stroke: new Stroke({color:'#08213a',width:4}),
      font:'bold 12px sans-serif', overflow:false,
    }) }),
  ],
})
const facilityLayer = new VectorLayer({
  source: facilitySource,
  style: (feature) => new Style({
    image: new CircleStyle({
      radius: 7, fill: new Fill({ color: '#18e5ff' }),
      stroke: new Stroke({ color: '#e6ffff', width: 2.5 }),
    }),
    text: new Text({
      text:String(feature.get('name') || ''),offsetY:-24,
      fill:new Fill({color:'#e9ffff'}),stroke:new Stroke({color:'#05243b',width:5}),
      font:'bold 11px sans-serif',overflow:false,
    }),
  }),
})
const annotationDefaultStyle = new Style({
  image:new CircleStyle({radius:7,fill:new Fill({color:'#53b6ff'}),stroke:new Stroke({color:'#fff',width:2})}),
  stroke:new Stroke({color:'#57abff',width:3,lineDash:[8,5]}),
  fill:new Fill({color:'rgba(41,149,247,.2)'}),
})
const changeClueStyle = new Style({
  image:new CircleStyle({radius:8,fill:new Fill({color:'#ff5971'}),stroke:new Stroke({color:'#fff',width:2})}),
  stroke:new Stroke({color:'#ff5669',width:3,lineDash:[8,5]}),
  fill:new Fill({color:'rgba(255,71,89,.28)'}),
})
const annotationLayer = new VectorLayer({
  source: annotationSource,
  style: (feature) => feature.get('category') === '变化线索'
    ? (showClues.value ? changeClueStyle : undefined)
    : annotationDefaultStyle,
})
const measureLayer = new VectorLayer({
  source: measureSource,
  style: new Style({
    image: new CircleStyle({ radius: 5, fill: new Fill({ color: '#ee7056' }) }),
    stroke: new Stroke({ color: '#ffca71', width: 3, lineDash: [7, 7] }),
    fill: new Fill({ color: 'rgba(255,202,113,0.12)' }),
  }),
})
const highlightLayer = new VectorLayer({
  source: highlightSource,
  style: new Style({
    image: new CircleStyle({
      radius: 12, fill: new Fill({ color: 'rgba(255,208,73,.4)' }),
      stroke: new Stroke({ color: '#d35e16', width: 3 }),
    }),
    stroke: new Stroke({ color: '#f0a020', width: 8 }),
    fill: new Fill({ color: 'rgba(240,160,32,.17)' }),
  }),
})

const layerMap = { basemap: baseLayer, roads: roadLayer, facilities: facilityLayer, annotations: annotationLayer }
const layerDefinitions: Array<{ key: LayerKey; name: string; desc: string; symbol: string; color: string }> = [
  { key: 'basemap', name: '基础底图', desc: '卫星影像 / 道路底图', symbol: '▦', color: '#2884e2' },
  { key: 'roads', name: '公路线路', desc: '道路线形资料', symbol: '━', color: '#157d8c' },
  { key: 'facilities', name: '道路设施', desc: '空间位置与属性', symbol: '●', color: '#f2a04b' },
  { key: 'annotations', name: '地图标注', desc: '当前工作区图形', symbol: '◆', color: '#276de0' },
]

const filteredItems = computed(() => {
  void annotationRevision.value
  const keyword = query.value.trim().toLowerCase()
  const allItems = [
    ...objectItems.value,
    ...annotationSource.getFeatures().map(asItem),
  ]
  return allItems.filter((item) =>
    !keyword || [item.name, item.code, item.category, item.unit]
      .some((value) => value.toLowerCase().includes(keyword))
  )
})
const roadCount = computed(() => objectItems.value.filter((item) => item.category === '道路线路').length)
const facilityCount = computed(() => objectItems.value.length - roadCount.value)
const clueItems = computed(() => {
  void annotationRevision.value
  return annotationSource.getFeatures().filter(x => x.get('category') === '变化线索').map(asItem).reverse()
})
const clueCount = computed(() => clueItems.value.length)
const monitoringCounts = computed(() => {
  const items = [
    { label:'道路线路',count:roadCount.value,color:'#22d8ed' },
    { label:'道路设施',count:facilityCount.value,color:'#2288fb' },
    { label:'变化线索',count:clueCount.value,color:'#ff5a78' },
    { label:'其他标注',count:Math.max(0,annotationCount.value-clueCount.value),color:'#8b91ff' },
  ]
  const total = items.reduce((sum,x) => sum + x.count,0)
  return items.map(x => ({...x, percent:total ? x.count / total * 100 : 0}))
})
const chartBackground = computed(() => {
  let position = 0
  const slices = monitoringCounts.value.map(x => {
    const from = position
    position += x.percent
    return x.color + ' ' + from + '% ' + position + '%'
  })
  return 'conic-gradient(' + slices.join(',') + ')'
})
const totalSpatialRecords = computed(() => roadCount.value + facilityCount.value + annotationCount.value)
const taskCounts = computed(() => ({
  pending:tasks.value.filter(x => x.state==='pending').length,
  active:tasks.value.filter(x => x.state==='active').length,
  review:tasks.value.filter(x => x.state==='review').length,
  done:tasks.value.filter(x => x.state==='done').length,
}))
const taskProgress = computed(() => tasks.value.length ? Math.round(taskCounts.value.done/tasks.value.length*100) : 0)
const filteredClues = computed(() => clueItems.value.filter(item => {
  if (selectedPeriod.value === 'all') return true
  const raw = item.feature.get('createdAt')
  const timestamp = typeof raw === 'string' ? Date.parse(raw) : NaN
  return Number.isFinite(timestamp) && Date.now()-timestamp <= Number(selectedPeriod.value)*86400000
}))
const latestCards = computed(() => clueItems.value.length
  ? clueItems.value.slice(0,8)
  : objectItems.value.filter(x => x.category !== '道路线路').slice(0,8))
const newestCardsTitle = computed(() => clueItems.value.length ? '最新监测线索' : '最新空间记录')

const annotationItems = computed(() => {
  void annotationRevision.value
  return annotationSource.getFeatures().map(asItem)
})

let map: Map | null = null
let drawing: Draw | null = null
let modifying: Modify | null = null
let toastTimer: number | undefined
let draftTimer: number | undefined
let draftsInitialized = false
let taskSerial = 0
let historyTimer: number | undefined
let historyReady = false
let historyRestoring = false
const undoStack: string[] = []
let historyIndex = -1
const historyVersion = ref(0)
const canUndo = computed(() => {void historyVersion.value;return historyIndex > 0})
const canRedo = computed(() => {void historyVersion.value;return historyIndex >= 0 && historyIndex < undoStack.length - 1})
const selectedIsAnnotation = computed(() => Boolean(selected.value && annotationSource.hasFeature(selected.value.feature)))

function setDashboardPanel(panel: 'details' | 'annotations' | 'tasks' | 'stats') {
  rightTab.value = panel
  detailDrawerOpen.value = true
}
function taskLabel(state: TaskState): string {
  return ({pending:'待派发',active:'进行中',review:'待核查',done:'已完成'} as Record<TaskState,string>)[state]
}
function taskNextLabel(state: TaskState): string {
  return ({pending:'开始巡查',active:'提交核查',review:'完成任务',done:'已完成'} as Record<TaskState,string>)[state]
}
function createTaskForSelected() {
  if (!selected.value) { showNotice('请先选择一个地图对象'); return }
  if (tasks.value.some(t => t.featureId === selected.value!.id && t.state !== 'done')) {
    showNotice('该对象已有尚未完成的巡查任务'); return
  }
  const id = 'T-' + Date.now() + '-' + ++taskSerial
  const now = new Date().toISOString()
  const task: LocalTask = {
    id,featureId:selected.value.id,name:selected.value.name,
    state:'pending',createdAt:now,updatedAt:now,
  }
  const next = [task,...tasks.value]
  if (!localTaskRepository.save(next)) {
    showNotice('本机任务保存失败，请检查浏览器存储空间'); return
  }
  tasks.value = next
  setDashboardPanel('tasks')
  showNotice('巡查任务已加入本机工作区')
}
function advanceTask(id: string) {
  const current = tasks.value.find(t => t.id === id)
  if (!current || current.state === 'done') return
  const next: Record<Exclude<TaskState,'done'>,TaskState> = {
    pending:'active',active:'review',review:'done',
  }
  const updated: LocalTask = {...current,state:next[current.state],updatedAt:new Date().toISOString()}
  const data = tasks.value.map(t => t.id === id ? updated : t)
  if (!localTaskRepository.save(data)) { showNotice('任务状态保存失败'); return }
  tasks.value = data
  showNotice('任务已更新为' + taskLabel(updated.state))
}
function focusTask(task: LocalTask) {
  const feature = [...annotationSource.getFeatures(),...roadSource.getFeatures(),...facilitySource.getFeatures()]
    .find(x => asItem(x).id === task.featureId)
  if (feature) focusFeature(asItem(feature))
  else showNotice('关联的地图对象已不在当前工作区')
}
function beginClueDraw() {
  showClues.value = true
  annotationLayer.changed()
  drawAsClue.value = true
  setTool('polygon')
  showNotice('请在地图上绘制关注区域，双击结束')
}
function toggleClueLayer() {
  showClues.value = !showClues.value
  annotationLayer.changed()
}
function spatialPreview(item: RecordItem): string {
  const extent = item.feature.getGeometry()?.getExtent()
  if (!extent) return ''
  const [lon,lat] = toLonLat(getCenter(extent))
  const z = 12, n = 2 ** z
  const x = Math.floor((lon+180)/360*n)
  const y = Math.floor((1-Math.log(Math.tan(lat*Math.PI/180)+1/Math.cos(lat*Math.PI/180))/Math.PI)/2*n)
  if (x < 0 || x >= n || y < 0 || y >= n) return ''
  return 'https://tile.openstreetmap.org/' + z + '/' + x + '/' + y + '.png'
}
function snapshotAnnotations(): string {
  return geojson.writeFeatures(annotationSource.getFeatures(), {
    dataProjection:'EPSG:4326',featureProjection:'EPSG:3857',rightHanded:true,
  })
}
function storeHistoryNow() {
  if (!historyReady || historyRestoring) return
  if (historyTimer !== undefined) window.clearTimeout(historyTimer)
  historyTimer = undefined
  const value = snapshotAnnotations()
  if (undoStack[historyIndex] === value) return
  undoStack.splice(historyIndex+1)
  undoStack.push(value)
  if (undoStack.length > 25) undoStack.shift()
  historyIndex = undoStack.length-1
  historyVersion.value++
}
function scheduleHistory() {
  if (!historyReady || historyRestoring) return
  if (historyTimer !== undefined) window.clearTimeout(historyTimer)
  historyTimer = window.setTimeout(storeHistoryNow,80)
}
function applyHistory(direction: -1 | 1) {
  storeHistoryNow()
  const next = historyIndex+direction
  if (next < 0 || next >= undoStack.length) return
  historyRestoring = true
  try {
    const data = geojson.readFeatures(JSON.parse(undoStack[next]), {
      dataProjection:'EPSG:4326',featureProjection:'EPSG:3857',
    }) as Feature<Geometry>[]
    annotationSource.clear()
    annotationSource.addFeatures(data)
    historyIndex = next
    historyVersion.value++
    updateAnnotationCount()
    clearSelection()
  } finally { historyRestoring = false }
  persistAnnotations()
}

function showNotice(message: string) {
  notice.value = message
  if (toastTimer !== undefined) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { notice.value = '' }, 4300)
}

function asItem(feature: Feature<Geometry>): RecordItem {
  return {
    id: String(feature.get('id') || feature.getId() || ''),
    name: String(feature.get('name') || '未命名对象'),
    code: String(feature.get('code') || feature.get('id') || '—'),
    category: String(feature.get('category') || '地图标注'),
    unit: String(feature.get('unit') || '工作区'),
    description: String(feature.get('description') || '空间数据对象'),
    feature,
  }
}

function selectFeature(feature: Feature<Geometry>) {
  selected.value = asItem(feature)
  rightTab.value = 'details'
  detailDrawerOpen.value = true
  editName.value = String(feature.get('name') || '')
  editCategory.value = String(feature.get('category') || '')
  editDescription.value = String(feature.get('description') || '')
  highlightSource.clear()
  highlightSource.addFeature(feature.clone())
}

function clearSelection() {
  detailDrawerOpen.value = false
  selected.value = null
  highlightSource.clear()
}

function focusFeature(item: RecordItem) {
  if (!map) return
  mobileMenuOpen.value = false
  selectFeature(item.feature)
  const extent = item.feature.getGeometry()?.getExtent()
  if (extent) map.getView().fit(extent, {
    duration: 550, maxZoom: 15, padding: [90, 100, 90, 100],
  })
}

function openSection(section: 'layers' | 'objects' | 'imagery') {
  leftTab.value = section
  mobileMenuOpen.value = false
}

function openAnnotationRecords() {
  rightTab.value = 'annotations'
  detailDrawerOpen.value = true
  mobileMenuOpen.value = false
}

function toggleMapFullscreen() {
  if (!document.fullscreenElement) {
    void document.documentElement.requestFullscreen?.().catch(() => showNotice('浏览器未允许全屏显示'))
  } else {
    void document.exitFullscreen?.().catch(() => showNotice('无法退出全屏显示'))
  }
}

function zoomBy(delta: number) {
  if (!map) return
  const view = map.getView()
  view.animate({ zoom: Math.min(19, Math.max(4, (view.getZoom() || 12) + delta)), duration: 240 })
}

function resetView() {
  leftTab.value = 'layers'
  mobileMenuOpen.value = false
  clearSelection()
  map?.getView().animate({ center: fromLonLat([104.075, 30.652]), zoom: 12, duration: 450 })
}

function toggleLayer(key: LayerKey) {
  layersVisible.value[key] = !layersVisible.value[key]
  if (key === 'basemap') updateImageryLayers()
  else layerMap[key].setVisible(layersVisible.value[key])
}

function changeOpacity(key: LayerKey, event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  layerOpacity.value[key] = value
  if (key === 'basemap') {
    baseLayer.setOpacity(value / 100)
    historicalLayer.setOpacity(value / 100)
    comparisonLayer.setOpacity(value / 100)
  } else {
    layerMap[key].setOpacity(value / 100)
  }
}

function updateAnnotationCount() {
  annotationCount.value = annotationSource.getFeatures().length
  annotationRevision.value += 1
}

function flushAnnotations() {
  if (!draftsInitialized) return
  if (draftTimer !== undefined) window.clearTimeout(draftTimer)
  draftTimer = undefined
  const data = geojson.writeFeaturesObject(annotationSource.getFeatures(), {
    dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857',
  })
  draftSaved.value = localAnnotationRepository.save(data)
  if (!draftSaved.value) showNotice('本机空间不足或浏览器禁止存储，请导出 GeoJSON 保存')
}

function persistAnnotations() {
  if (!draftsInitialized) return
  draftSaved.value = false
  annotationRevision.value += 1
  if (draftTimer !== undefined) window.clearTimeout(draftTimer)
  draftTimer = window.setTimeout(flushAnnotations, 250)
}

function makeTrackedImagery(id: ImageId) {
  const source = makeImagerySource(id)
  source.set('imageId', id)
  source.on('tileloaderror', () => {
    if (historicalLayer.getSource() === source || comparisonLayer.getSource() === source) {
      imageryError.value = true
    }
  })
  return source
}

function updateImageryLayers() {
  const enabled = layersVisible.value.basemap
  baseLayer.setVisible(enabled && !compareEnabled.value && imagerySelected.value === 'street')
  historicalLayer.setVisible(enabled && (compareEnabled.value || imagerySelected.value !== 'street'))
  comparisonLayer.setVisible(enabled && compareEnabled.value)
  if (!enabled) return
  imageryError.value = false
  if (compareEnabled.value) {
    if (historicalLayer.getSource()?.get('imageId') !== compareBefore.value) historicalLayer.setSource(makeTrackedImagery(compareBefore.value))
    if (comparisonLayer.getSource()?.get('imageId') !== compareAfter.value) comparisonLayer.setSource(makeTrackedImagery(compareAfter.value))
  } else if (imagerySelected.value !== 'street') {
    if (historicalLayer.getSource()?.get('imageId') !== imagerySelected.value) historicalLayer.setSource(makeTrackedImagery(imagerySelected.value))
  }
  map?.render()
}

function changeImagery(value: string) {
  imagerySelected.value = value as ImageId | 'street'
  compareEnabled.value = false
  updateImageryLayers()
}

function toggleComparison() {
  compareEnabled.value = !compareEnabled.value
  if (compareEnabled.value) {
    leftTab.value = 'imagery'
    setTool('browse')
  }
  updateImageryLayers()
}

function changeComparisonDate(which: 'before' | 'after', value: string) {
  if (which === 'before') compareBefore.value = value as ImageId
  else compareAfter.value = value as ImageId
  updateImageryLayers()
}

function updateSwipe(event: Event) {
  swipePosition.value = Number((event.target as HTMLInputElement).value)
  map?.render()
}

function saveProperties() {
  if (!selected.value || !selectedIsAnnotation.value) return
  if (!editName.value.trim()) { showNotice('请输入标注名称'); return }
  selected.value.feature.setProperties({
    name: editName.value.trim().slice(0, 100),
    category: editCategory.value.trim().slice(0, 50) || '地图标注',
    description: editDescription.value.trim().slice(0, 300),
  })
  annotationLayer.changed()
  selectFeature(selected.value.feature)
  persistAnnotations()
  showNotice('标注属性已保存到本机')
}

function deactivateDrawing() {
  if (map && drawing) map.removeInteraction(drawing)
  drawing = null
}

function setTool(tool: Tool) {
  deactivateDrawing()
  if (tool !== 'polygon') drawAsClue.value = false
  activeTool.value = tool
  if (!map || tool === 'browse') return

  const isMeasure = tool === 'length' || tool === 'area'
  const geometryType = tool === 'point' ? 'Point'
    : tool === 'polygon' || tool === 'area' ? 'Polygon' : 'LineString'
  const source = isMeasure ? measureSource : annotationSource
  drawing = new Draw({ source, type: geometryType })
  drawing.on('drawend', (event) => {
    const feature = event.feature
    if (isMeasure) {
      const geometry = feature.getGeometry()
      if (!geometry) return
      const value = tool === 'length'
        ? getLength(geometry, { projection: 'EPSG:3857' })
        : getArea(geometry, { projection: 'EPSG:3857' })
      const unit = tool === 'length'
        ? (value >= 1000 ? (value / 1000).toFixed(2) + ' km' : value.toFixed(1) + ' m')
        : (value >= 1_000_000 ? (value / 1_000_000).toFixed(2) + ' km²' : value.toFixed(1) + ' m²')
      measureOutput.value = (tool === 'length' ? '测量距离：' : '测量面积：') + unit
      showNotice(measureOutput.value)
    } else {
      const index = annotationSource.getFeatures().length + 1
      feature.setProperties({
        id: 'A-' + Date.now() + '-' + ++annotationSerial,
        name: (drawAsClue.value ? '变化关注区域 ' : '地图标注 ') + String(index).padStart(2, '0'),
        code: 'A-' + String(index).padStart(3, '0'),
        category: drawAsClue.value ? '变化线索' : '地图标注',
        unit: '当前工作区',
        description: drawAsClue.value ? '人工标绘的变化关注区域' : '用户绘制的空间标注',
        createdAt: new Date().toISOString(),
      })
      const wasClue = drawAsClue.value
      drawAsClue.value = false
      window.queueMicrotask(() => {
        updateAnnotationCount()
        selectFeature(feature)
        annotationLayer.changed()
      })
      showNotice(wasClue ? '变化线索已登记到本机工作区' : '标注已添加到当前工作区')
    }
  })
  map.addInteraction(drawing)
}

async function importGeoJSON(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    if (file.size > 8 * 1024 * 1024) throw new Error('文件超过 8 MB，请分批导入')
    const parsed = JSON.parse(await file.text())
    validateImportPayload(parsed, annotationSource.getFeatures().length)
    const features = geojson.readFeatures(parsed, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857',
    }) as Feature<Geometry>[]
    if (!features.length) throw new Error('文件中没有可导入的要素')
    for (const feature of features) {
      const type = feature.getGeometry()?.getType()
      if (!type || !['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'].includes(type)) {
        throw new Error('文件包含不支持的几何类型')
      }
    }
    for (const feature of features) {
      const name = feature.get('name')
      const importId = 'I-' + Date.now() + '-' + ++annotationSerial
      feature.setId(importId)
      feature.setProperties({
        ...feature.getProperties(),
        id: importId,
        name: typeof name === 'string' ? name.slice(0, 100) : '导入标注',
        category: '地图标注',
        unit: '当前工作区',
        code: String(feature.get('code') || feature.get('id') || '导入数据'),
      })
    }
    annotationSource.addFeatures(features)
    updateAnnotationCount()
    persistAnnotations()
    annotationLayer.changed()
    const extent = annotationSource.getExtent()
    map?.getView().fit(extent, { duration: 450, maxZoom: 15, padding: [80, 80, 80, 80] })
    layersVisible.value.annotations = true
    annotationLayer.setVisible(true)
    showNotice('已导入 ' + features.length + ' 个空间要素')
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '文件导入失败')
  } finally {
    input.value = ''
  }
}

function exportGeoJSON() {
  const features = annotationSource.getFeatures()
  if (!features.length) { showNotice('当前没有可导出的地图标注'); return }
  const content = geojson.writeFeatures(features, {
    dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857',
    rightHanded: true,
  })
  const blob = new Blob([content], { type: 'application/geo+json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'GISTable_地图标注_' + new Date().toISOString().slice(0, 10) + '.geojson'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
  showNotice('已导出 ' + features.length + ' 个标注要素')
}

function removeSelected() {
  if (!selected.value || !annotationSource.hasFeature(selected.value.feature)) return
  annotationSource.removeFeature(selected.value.feature)
  updateAnnotationCount()
  persistAnnotations()
  clearSelection()
  showNotice('标注已移除')
}

function clearAnnotations() {
  if (!annotationSource.getFeatures().length) return
  if (!window.confirm('确定清空当前工作区内的所有地图标注吗？')) return
  annotationSource.clear()
  persistAnnotations()
  measureSource.clear()
  updateAnnotationCount()
  clearSelection()
  measureOutput.value = ''
  showNotice('当前工作区标注已清空')
}

onMounted(async () => {
  map = new Map({
    target: mapElement.value!,
    layers: [baseLayer, historicalLayer, comparisonLayer, roadLayer, facilityLayer, annotationLayer, measureLayer, highlightLayer],
    view: new View({ center: fromLonLat([104.075, 30.652]), zoom: 12, minZoom: 4, maxZoom: 19 }),
    controls: defaultControls({ zoom: false, rotate: false }).extend([new ScaleLine({ units: 'metric' })]),
  })
  comparisonLayer.on('prerender', (event) => {
    if (!compareEnabled.value || !map) return
    const ctx = event.context as CanvasRenderingContext2D | undefined
    const size = map.getSize()
    if (!ctx || !size) return
    const x = size[0] * swipePosition.value / 100
    const ul = getRenderPixel(event, [x, 0])
    const ur = getRenderPixel(event, [size[0], 0])
    const br = getRenderPixel(event, [size[0], size[1]])
    const bl = getRenderPixel(event, [x, size[1]])
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(ul[0], ul[1])
    ctx.lineTo(ur[0], ur[1])
    ctx.lineTo(br[0], br[1])
    ctx.lineTo(bl[0], bl[1])
    ctx.closePath()
    ctx.clip()
  })
  comparisonLayer.on('postrender', (event) => {
    if (compareEnabled.value) (event.context as CanvasRenderingContext2D | undefined)?.restore()
  })
  annotationSource.on('addfeature', () => {persistAnnotations();scheduleHistory()})
  annotationSource.on('changefeature', (event) => {
    persistAnnotations()
    scheduleHistory()
    annotationLayer.changed()
    if (event.feature && selected.value?.feature === event.feature) {
      highlightSource.clear()
      highlightSource.addFeature(event.feature.clone())
    }
  })
  annotationSource.on('removefeature', () => {persistAnnotations();scheduleHistory()})
  annotationSource.on('clear', () => {persistAnnotations();scheduleHistory()})
  const savedDraft = localAnnotationRepository.load()
  if (savedDraft) {
    try {
      const drafts = geojson.readFeatures(savedDraft as object, {
        dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857',
      }) as Feature<Geometry>[]
      annotationSource.addFeatures(drafts)
      updateAnnotationCount()
      draftSaved.value = true
    } catch {
      showNotice('本机部分标注数据无法读取')
    }
  }
  draftsInitialized = true
  tasks.value = localTaskRepository.load()
  historyReady = true
  undoStack.push(snapshotAnnotations())
  historyIndex = 0
  historyVersion.value++
  window.addEventListener('pagehide', flushAnnotations)
  updateImageryLayers()
  modifying = new Modify({ source: annotationSource })
  map.addInteraction(modifying)
  map.on('pointermove', (event) => {
    if (!map) return
    const coords = toLonLat(event.coordinate)
    currentLonLat.value = coords[0].toFixed(4) + '° E  ' + coords[1].toFixed(4) + '° N'
  })
  map.on('moveend', () => { currentZoom.value = (map?.getView().getZoom() || 12).toFixed(1) })
  map.on('singleclick', (event) => {
    if (!map || activeTool.value !== 'browse') return
    const picked = map.forEachFeatureAtPixel(event.pixel, (feature, layer) => {
      if ([roadLayer, facilityLayer, annotationLayer].includes(layer as any)) {
        return feature as Feature<Geometry>
      }
    }, { hitTolerance: 10 })
    if (picked) selectFeature(picked)
    else clearSelection()
  })

  try {
    const collection = await staticFeatureRepository.getWorkspaceObjects()
    const items = geojson.readFeatures(collection as any, {
      dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857',
    }) as Feature<Geometry>[]
    for (const feature of items) {
      if (feature.get('category') === '道路线路') roadSource.addFeature(feature)
      else facilitySource.addFeature(feature)
    }
    objectItems.value = items.map(asItem)
    dataLoaded.value = true
    if (!selected.value) {
      const first = items.find(item => item.get('category') !== '道路线路')
      if (first) {
        selectFeature(first)
        if (window.innerWidth <= 1000) detailDrawerOpen.value = false
      }
    }
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '空间数据加载失败，请刷新页面')
  }
})

onBeforeUnmount(() => {
  deactivateDrawing()
  if (toastTimer !== undefined) window.clearTimeout(toastTimer)
  window.removeEventListener('pagehide', flushAnnotations)
  if (historyTimer !== undefined) window.clearTimeout(historyTimer)
  flushAnnotations()
  map?.setTarget(undefined)
  map = null
})
</script>

<template>
  <div class="app-shell command-shell">
    <header class="header command-header">
      <button class="mobile-panel-button" aria-label="打开图层与影像菜单" @click="mobileMenuOpen = !mobileMenuOpen; detailDrawerOpen = false">☰</button>
      <div class="brand command-brand">
        <div class="brand-mark"><span class="brand-globe">◈</span></div>
        <div class="brand-copy">
          <span class="brand-name">GISTable</span>
          <span class="brand-sub">公路遥感监测与巡查执法管理平台</span>
        </div>
      </div>
      <nav class="primary-nav" aria-label="主要导航">
        <button class="nav-link active" @click="resetView"><span>⌂</span> 综合指挥</button>
        <button class="nav-link" @click="openSection('imagery')"><span>◈</span> 遥感监测</button>
        <button class="nav-link" @click="setDashboardPanel('tasks')"><span>▣</span> 巡查管理</button>
        <button class="nav-link" @click="setDashboardPanel('stats')"><span>▥</span> 数据分析</button>
        <button class="nav-link" @click="layerGroup = 'topic'; openSection('layers')"><span>▱</span> 专题图层</button>
      </nav>
      <div class="header-spacer"></div>
      <span class="header-scope"><i class="scope-dot"></i> 空间工作区</span>
      <div class="avatar" title="空间工作区">GIS</div>
    </header>

    <div class="content-grid">
      <aside class="left-panel" :class="{ 'mobile-open': mobileMenuOpen }">
        <section class="command-section layer-control-section">
          <header class="panel-title"><span class="panel-icon">▱</span><strong>图层控制</strong><small>{{ layerDefinitions.filter(l => layersVisible[l.key]).length }} / {{ layerDefinitions.length }}</small></header>
          <div class="section-inner">
            <div class="left-tabs">
              <button :class="{ selected: layerGroup === 'base' }" @click="layerGroup = 'base'; leftTab = 'layers'">基础图层</button>
              <button :class="{ selected: layerGroup === 'business' }" @click="layerGroup = 'business'; leftTab = 'layers'">业务图层</button>
              <button :class="{ selected: layerGroup === 'topic' }" @click="layerGroup = 'topic'; leftTab = 'layers'">专题图层</button>
            </div>
            <div v-if="leftTab === 'objects'" class="layer-search-view">
              <label class="search-box">
                <span>⌕</span><input v-model="query" type="search" placeholder="输入名称、编号或类别..." />
              </label>
              <div class="compact-list full-list">
                <button v-for="item in filteredItems" :key="item.id" class="compact-record" @click="focusFeature(item)">
                  <span class="record-dot" :class="item.category === '道路线路' ? 'teal' : 'amber'"></span>
                  <span><strong>{{ item.name }}</strong><small>{{ item.code }}</small></span>
                </button>
                <div v-if="!filteredItems.length" class="empty-list">没有找到匹配的空间对象</div>
              </div>
            </div>
            <div v-else class="layer-list">
              <div v-for="layer in layerDefinitions.filter(l => layerGroup === 'base' || (layerGroup === 'business' ? l.key === 'roads' || l.key === 'facilities' : l.key === 'annotations'))" :key="layer.key" class="layer-row">
                <div class="layer-main">
                  <button class="layer-toggle" :class="{ on: layersVisible[layer.key] }"
                    :aria-label="(layersVisible[layer.key] ? '隐藏' : '显示') + layer.name" @click="toggleLayer(layer.key)">
                    <span v-if="layersVisible[layer.key]">✓</span>
                  </button>
                  <div class="layer-miniature" :class="'mini-' + layer.key"><span>{{ layer.symbol }}</span></div>
                  <div class="layer-label"><strong>{{ layer.name }}</strong><small>{{ layer.desc }}</small></div>
                  <span class="layer-more">···</span>
                </div>
                <div v-if="layersVisible[layer.key]" class="opacity-row">
                  <input type="range" min="15" max="100" :value="layerOpacity[layer.key]"
                    :aria-label="layer.name + '不透明度'" @input="changeOpacity(layer.key, $event)" />
                  <span>{{ layerOpacity[layer.key] }}%</span>
                </div>
              </div>
              <div v-if="layerGroup === 'topic'" class="clue-layer-line">
                <label class="toggle-line"><span>变化线索图层</span><input type="checkbox" :checked="showClues" @change="toggleClueLayer" /></label>
                <small>{{ clueCount }} 个已标绘区域</small>
              </div>
            </div>
            <div class="layer-bottom-actions">
              <button @click="leftTab = 'objects'">⌕ 空间查询</button>
              <button @click="leftTab = 'layers'; layerGroup = 'base'">▱ 图层列表</button>
            </div>
          </div>
        </section>

        <section class="command-section imagery-section">
          <header class="panel-title"><span class="panel-icon">⌖</span><strong>影像与时相</strong><small>IMAGE</small></header>
          <div class="section-inner">
            <label class="form-row" for="gis-imagery-source"><span>影像源</span>
              <select id="gis-imagery-source" class="imagery-select" :value="imagerySelected"
                @change="changeImagery(($event.target as HTMLSelectElement).value)">
                <option value="street">道路底图 · OSM</option>
                <option v-for="image in imageCatalog" :key="image.id" :value="image.id">{{ image.name }}</option>
              </select>
            </label>
            <div class="form-row date-row"><span>影像日期</span>
              <div class="date-comparison-label"><span>{{ imageCatalog.find(x => x.id === compareBefore)?.name.replace('MODIS · ','') }}</span><b>⇄</b><span>{{ imageCatalog.find(x => x.id === compareAfter)?.name.replace('MODIS · ','') }}</span></div>
            </div>
            <div class="compare-modes">
              <button :class="{ selected: !compareEnabled }" @click="compareEnabled && toggleComparison()">单期浏览</button>
              <button class="compare-switch" :class="{ selected: compareEnabled }" @click="toggleComparison">◫ 卷帘对比</button>
            </div>
            <div v-if="compareEnabled" class="compare-options">
              <label for="gis-time-a">左侧影像</label>
              <select id="gis-time-a" class="imagery-select" :value="compareBefore" @change="changeComparisonDate('before', ($event.target as HTMLSelectElement).value)">
                <option v-for="im in imageCatalog" :key="im.id" :value="im.id">{{ im.name }}</option>
              </select>
              <label for="gis-time-b">右侧影像</label>
              <select id="gis-time-b" class="imagery-select" :value="compareAfter" @change="changeComparisonDate('after', ($event.target as HTMLSelectElement).value)">
                <option v-for="im in imageCatalog" :key="im.id" :value="im.id">{{ im.name }}</option>
              </select>
              <input id="gis-swipe-left" type="range" min="5" max="95" aria-label="左侧卷帘位置" :value="swipePosition" @input="updateSwipe" />
            </div>
            <div class="image-preview-pair" @click="!compareEnabled && toggleComparison()" role="button" tabindex="0" @keydown.enter="!compareEnabled && toggleComparison()">
              <div class="image-preview before"><span>{{ compareBefore === 'sentinel2016' ? '2016' : compareBefore === 'modis2024' ? '2024' : '2025' }}</span></div>
              <div class="image-preview after"><span>{{ compareAfter === 'sentinel2016' ? '2016' : compareAfter === 'modis2024' ? '2024' : '2025' }}</span></div>
              <span class="preview-slider-handle">◀▶</span>
            </div>
          </div>
        </section>

        <section class="command-section change-section">
          <header class="panel-title"><span class="panel-icon">◈</span><strong>变化线索</strong><small>{{ clueCount }} 个</small></header>
          <div class="section-inner change-inner">
            <button class="detect-button" @click="beginClueDraw">⬡ 标绘变化区域</button>
            <label class="toggle-line"><span>变化区域显示</span><input type="checkbox" :checked="showClues" @change="toggleClueLayer" /></label>
            <div class="change-hint"><span>◉</span> 新增区域将进入线索统计与最新记录</div>
          </div>
        </section>
      </aside>

      <div class="center-column">
        <main class="map-stage">
          <div ref="mapElement" class="map-element" aria-label="可交互的空间地图"></div>
          <div class="map-grid-overlay" aria-hidden="true"></div>
          <div class="map-compass" aria-hidden="true"><b>N</b><span>✧</span></div>
          <div class="map-heading"><span class="map-heading-label">空间信息地图</span><span class="map-heading-sub">{{ compareEnabled ? '多时相影像卷帘' : imageryLabel }}</span></div>
          <div class="map-coord-chip"><span>经度：{{ currentLonLat.split('  ')[0] }}</span><span>纬度：{{ currentLonLat.split('  ')[1] }}</span><span>级别：{{ currentZoom }}</span></div>

          <div class="map-toolbar" aria-label="地图工具">
            <button :class="{ toolactive: activeTool === 'browse' }" title="选择对象" @click="setTool('browse')"><span>↖</span><small>选择</small></button>
            <button :class="{ toolactive: activeTool === 'point' }" title="绘制点标注" @click="setTool('point')"><span>⌖</span><small>点标注</small></button>
            <button :class="{ toolactive: activeTool === 'line' }" title="绘制线标注" @click="setTool('line')"><span>⌁</span><small>线标注</small></button>
            <button :class="{ toolactive: activeTool === 'polygon' }" title="绘制面标注" @click="setTool('polygon')"><span>⬡</span><small>面标注</small></button>
            <button :class="{ toolactive: activeTool === 'length' }" title="测量距离" @click="setTool('length')"><span>⌁</span><small>测距</small></button>
            <button :class="{ toolactive: activeTool === 'area' }" title="测量面积" @click="setTool('area')"><span>▱</span><small>测面</small></button>
            <span class="toolbar-divider"></span>
            <button title="撤销" :disabled="!canUndo" @click="applyHistory(-1)"><span>↶</span><small>撤销</small></button>
            <button title="重做" :disabled="!canRedo" @click="applyHistory(1)"><span>↷</span><small>重做</small></button>
            <button title="清空标注" :disabled="!annotationCount" @click="clearAnnotations"><span>⌫</span><small>清除</small></button>
            <button title="导入 GeoJSON" @click="fileInput?.click()"><span>↥</span><small>导入</small></button>
            <button title="导出 GeoJSON" @click="exportGeoJSON"><span>↧</span><small>导出</small></button>
          </div>

          <div class="map-target" aria-hidden="true"><span></span></div>
          <div v-if="compareEnabled" class="imagery-swipe-labels"><span>{{ imageCatalog.find(x => x.id === compareBefore)?.name }}</span><span>{{ imageCatalog.find(x => x.id === compareAfter)?.name }}</span></div>
          <div v-if="compareEnabled" class="swipe-divider" :style="{ left: swipePosition + '%' }" aria-hidden="true"><span class="swipe-grip">↔</span></div>
          <div v-if="compareEnabled" class="swipe-bottom-slider"><input type="range" min="5" max="95" :value="swipePosition" @input="updateSwipe" aria-label="调整卷帘对比位置" /></div>
          <div v-if="imageryError && layersVisible.basemap" class="imagery-error" role="alert"><span>当前影像部分区域加载失败</span><button @click="changeImagery('street')">切换道路底图</button></div>
          <div class="zoom-toolbar">
            <button title="切换全屏" @click="toggleMapFullscreen">⛶</button>
            <button title="恢复初始视野" @click="resetView">⌂</button>
            <button title="放大地图" @click="zoomBy(1)">+</button>
            <button title="缩小地图" @click="zoomBy(-1)">−</button>
          </div>
          <div v-if="activeTool !== 'browse'" class="draw-hint"><i class="pulse"></i>
            {{ activeTool === 'point' ? '单击地图放置标注点' : activeTool === 'line' || activeTool === 'length' ? '单击绘制节点，双击结束' : '单击绘制边界，双击结束' }}
            <button @click="setTool('browse')">完成</button>
          </div>
          <div v-if="measureOutput" class="measure-result"><span>◇</span>{{ measureOutput }}<button @click="measureOutput = ''; measureSource.clear()">×</button></div>
          <div class="map-base-switch"><button :class="{ selected: !compareEnabled && imagerySelected === 'sentinel2016' }" @click="changeImagery('sentinel2016')">卫星影像</button><button :class="{ selected: imagerySelected === 'street' && !compareEnabled }" @click="changeImagery('street')">道路底图</button><button :class="{ selected: compareEnabled }" @click="toggleComparison">卷帘</button></div>
          <div class="map-legend"><strong>图例</strong><span><i class="legend-line"></i> 道路</span><span><i class="legend-dot amber"></i> 设施</span><span><i class="legend-dot blue"></i> 标注</span><span><i class="legend-dot red"></i> 变化关注</span></div>
          <div v-if="usesSentinelImagery" class="raster-attribution"><a href="https://cloudless.eox.at" target="_blank" rel="noopener noreferrer">EOxCloudless</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 &amp; 2017)</div>
          <div class="map-footnote"><span>WGS84</span><span class="foot-separator">/</span><span>{{ currentLonLat }}</span><span class="foot-separator">/</span><span>缩放 {{ currentZoom }}</span></div>
        </main>

        <section class="latest-panel">
          <header class="panel-title"><span class="panel-icon">♧</span><strong>{{ newestCardsTitle }}</strong><small>{{ latestCards.length }} 条</small><button class="latest-more" @click="openAnnotationRecords">查看全部 ›</button></header>
          <div class="latest-card-track">
            <button v-for="item in latestCards" :key="item.id" class="latest-card" :class="{ selected: selected?.id === item.id }" @click="focusFeature(item)">
              <div class="latest-thumb" :style="{ backgroundImage: 'linear-gradient(145deg,rgba(5,32,51,.06),rgba(6,26,45,.3)),url(' + spatialPreview(item) + ')' }"><span>⌖</span></div>
              <div class="latest-info"><strong>{{ item.name }}</strong><span>{{ item.category }}</span><small>◈ {{ item.code }}</small><small>⌖ {{ item.unit }}</small></div>
            </button>
            <div v-if="!latestCards.length" class="latest-empty">暂无空间记录</div>
          </div>
        </section>
      </div>

      <aside class="right-panel" :class="{ 'detail-open': detailDrawerOpen }">
        <section class="command-section detail-section">
          <header class="panel-title"><span class="panel-icon">♙</span><strong>对象详情</strong></header>
          <div class="right-tabs"><button :class="{ selected: rightTab === 'details' }" @click="rightTab = 'details'">对象详情</button><button :class="{ selected: rightTab === 'annotations' }" @click="rightTab = 'annotations'">标注记录</button><button v-if="rightTab === 'tasks' || rightTab === 'stats'" class="selected" @click="rightTab = 'details'">返回详情</button></div>
          <div class="detail-body">
            <template v-if="rightTab === 'details' || rightTab === 'stats'">
              <template v-if="selected">
                <div class="detail-top">
                  <div class="detail-thumbnail" :style="{ backgroundImage:'url(' + spatialPreview(selected) + ')' }"></div>
                  <div class="detail-title-group"><strong>{{ selected.name }}</strong><span class="status-chip">{{ selected.category }}</span><small>{{ selected.code }}</small></div>
                </div>
                <div class="detail-fields">
                  <div><span>编号</span><strong>{{ selected.code }}</strong></div>
                  <div><span>类型</span><strong>{{ selected.category }}</strong></div>
                  <div><span>位置</span><strong>地图空间对象</strong></div>
                  <div><span>资料</span><strong>{{ selected.unit }}</strong></div>
                  <div><span>描述</span><strong>{{ selected.description }}</strong></div>
                </div>
                <div v-if="selectedIsAnnotation" class="annotation-editor">
                  <label>名称<input v-model="editName" maxlength="100" aria-label="标注名称" /></label>
                  <label>类别<input v-model="editCategory" maxlength="50" aria-label="标注类别" /></label>
                  <label>备注<textarea v-model="editDescription" maxlength="300" rows="2" aria-label="标注备注"></textarea></label>
                  <button @click="saveProperties">保存属性</button>
                </div>
                <div class="detail-buttons"><button @click="focusFeature(selected!)">⌖ 定位</button><button v-if="selectedIsAnnotation" @click="saveProperties">✎ 编辑保存</button><button @click="createTaskForSelected">➤ 创建任务</button></div>
              </template>
              <div v-else class="detail-placeholder"><span>⌖</span><strong>选择地图对象</strong><small>点击线路、设施或变化区域查看详情</small></div>
            </template>
            <template v-else-if="rightTab === 'annotations'">
              <div class="compact-list full-list annotation-records">
                <button v-for="item in annotationItems" :key="item.id" class="compact-record annotation-record" @click="focusFeature(item)">
                  <span class="record-dot blue"></span><span><strong>{{ item.name }}</strong><small>{{ item.category }} · {{ item.code }}</small></span><span class="record-arrow">›</span>
                </button>
                <div v-if="!annotationItems.length" class="empty-list">暂无标注记录</div>
              </div>
              <button v-if="annotationCount" class="side-action" @click="exportGeoJSON">↧ 导出标注</button>
            </template>
            <template v-else>
              <div class="compact-list task-mini-list">
                <div v-for="task in tasks.slice(0,4)" :key="task.id" class="task-list-item">
                  <strong>{{ task.name }}</strong><small>{{ taskLabel(task.state) }}</small>
                  <button @click="focusTask(task)">定位</button><button v-if="task.state !== 'done'" @click="advanceTask(task.id)">{{ taskNextLabel(task.state) }}</button>
                </div>
                <div v-if="!tasks.length" class="empty-list">暂无巡查任务</div>
              </div>
            </template>
          </div>
        </section>

        <section class="command-section statistics-section">
          <header class="panel-title"><span class="panel-icon">▥</span><strong>监测统计</strong><div class="period-tabs"><button :class="{ selected: selectedPeriod === '7' }" @click="selectedPeriod = '7'">近7天</button><button :class="{ selected: selectedPeriod === '30' }" @click="selectedPeriod = '30'">近30天</button><button :class="{ selected: selectedPeriod === 'all' }" @click="selectedPeriod = 'all'">全部</button></div></header>
          <div class="stats-row">
            <div><span>◈</span><strong>{{ roadCount }}</strong><small>道路线路</small></div>
            <div><span>▣</span><strong>{{ facilityCount }}</strong><small>设施对象</small></div>
            <div><span>⬡</span><strong>{{ annotationCount }}</strong><small>地图标注</small></div>
            <div><span>✓</span><strong>{{ taskCounts.done }}</strong><small>任务完成</small></div>
          </div>
          <div class="stats-chart-row">
            <div class="donut" :style="{ background: chartBackground }"><div class="donut-center"><strong>{{ totalSpatialRecords }}</strong><small>空间对象</small></div></div>
            <div class="chart-legend">
              <div v-for="item in monitoringCounts" :key="item.label"><span class="legend-color" :style="{ background: item.color }"></span><span>{{ item.label }}</span><strong>{{ item.count }}</strong><small>{{ item.percent.toFixed(1) }}%</small></div>
            </div>
          </div>
          <div class="stats-bottom">变化关注区域 <strong>{{ selectedPeriod === 'all' ? clueCount : filteredClues.length }}</strong> 个<span> · 当前工作区</span></div>
        </section>

        <section class="command-section tasks-section">
          <header class="panel-title"><span class="panel-icon">▣</span><strong>巡查任务进度</strong><small>本机工作区</small></header>
          <div class="progress-line"><div class="progress-track"><div :style="{ width: taskProgress + '%' }"></div></div><strong>完成率 {{ taskProgress }}%</strong></div>
          <div class="task-status-grid">
            <button @click="setDashboardPanel('tasks')"><strong>{{ taskCounts.pending }}</strong><small>待派发</small></button>
            <button @click="setDashboardPanel('tasks')"><strong>{{ taskCounts.active }}</strong><small>进行中</small></button>
            <button @click="setDashboardPanel('tasks')"><strong>{{ taskCounts.review }}</strong><small>待核查</small></button>
            <button @click="setDashboardPanel('tasks')"><strong>{{ taskCounts.done }}</strong><small>已完成</small></button>
          </div>
          <div class="task-footer"><button @click="setDashboardPanel('tasks')">查看巡查任务 <span>›</span></button><button v-if="selected" @click="createTaskForSelected">+ 新建</button></div>
        </section>
      </aside>
    </div>

    <div v-if="mobileMenuOpen" class="mobile-scrim" @click="mobileMenuOpen = false"></div>
    <footer class="status-bar"><span><i class="status-connected"></i> 地图服务</span><span>© OpenStreetMap contributors · EOxCloudless / EOX · NASA GIBS</span><span class="footer-spacer"></span><span>本机工作区</span><span>EPSG:3857</span></footer>
    <input ref="fileInput" class="visually-hidden" type="file" accept=".geojson,.json,application/geo+json,application/json" @change="importGeoJSON" />
    <div v-if="notice" class="toast-notice" role="status"><span>◉</span>{{ notice }}<button @click="notice = ''">×</button></div>
  </div>
</template>
