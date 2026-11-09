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
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style'
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
const rightTab = ref<'details' | 'annotations'>('details')
const imagerySelected = ref<ImageId | 'street'>('sentinel2016')
const compareEnabled = ref(false)
const compareBefore = ref<ImageId>('modis2024')
const compareAfter = ref<ImageId>('modis2025')
const swipePosition = ref(50)
const draftSaved = ref(false)
const annotationRevision = ref(0)
const imageryError = ref(false)
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
  style: [
    new Style({ stroke: new Stroke({ color: 'rgba(255,255,255,.95)', width: 9 }) }),
    new Style({ stroke: new Stroke({ color: '#49a842', width: 5.6 }) }),
    new Style({ stroke: new Stroke({ color: '#ecf584', width: 2.4 }) }),
  ],
})
const facilityLayer = new VectorLayer({
  source: facilitySource,
  style: new Style({
    image: new CircleStyle({
      radius: 7, fill: new Fill({ color: '#fda54a' }),
      stroke: new Stroke({ color: '#ffffff', width: 3 }),
    }),
  }),
})
const annotationLayer = new VectorLayer({
  source: annotationSource,
  style: new Style({
    image: new CircleStyle({
      radius: 7, fill: new Fill({ color: '#2683eb' }),
      stroke: new Stroke({ color: '#ffffff', width: 2.5 }),
    }),
    stroke: new Stroke({ color: '#2080de', width: 3, lineDash: [8, 5] }),
    fill: new Fill({ color: 'rgba(28,131,231,0.18)' }),
  }),
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
const selectedIsAnnotation = computed(() => Boolean(selected.value && annotationSource.hasFeature(selected.value.feature)))

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
        name: '地图标注 ' + String(index).padStart(2, '0'),
        code: 'A-' + String(index).padStart(3, '0'),
        category: '地图标注',
        unit: '当前工作区',
        description: '用户绘制的空间标注',
      })
      window.queueMicrotask(() => {
        updateAnnotationCount()
        selectFeature(feature)
      })
      showNotice('标注已添加到当前工作区')
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
  annotationSource.on('addfeature', persistAnnotations)
  annotationSource.on('changefeature', (event) => {
    persistAnnotations()
    if (event.feature && selected.value?.feature === event.feature) {
      highlightSource.clear()
      highlightSource.addFeature(event.feature.clone())
    }
  })
  annotationSource.on('removefeature', persistAnnotations)
  annotationSource.on('clear', persistAnnotations)
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
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '空间数据加载失败，请刷新页面')
  }
})

onBeforeUnmount(() => {
  deactivateDrawing()
  if (toastTimer !== undefined) window.clearTimeout(toastTimer)
  window.removeEventListener('pagehide', flushAnnotations)
  flushAnnotations()
  map?.setTarget(undefined)
  map = null
})
</script>

<template>
  <div class="app-shell">
    <header class="header">
      <button class="mobile-panel-button" aria-label="打开图层与影像菜单" @click="mobileMenuOpen = !mobileMenuOpen">☰</button>
      <div class="brand">
        <div class="brand-mark"><span class="brand-globe">◈</span></div>
        <div class="brand-copy">
          <span class="brand-name">GISTable</span>
          <span class="brand-sub">公路遥感监测与巡查执法管理平台</span>
        </div>
      </div>
      <div class="header-divider"></div>
      <nav class="primary-nav" aria-label="主要导航">
        <button class="nav-link" :class="{ active: leftTab === 'layers' && !compareEnabled }" @click="resetView"><span class="nav-symbol">▧</span> 综合地图</button>
        <button class="nav-link" :class="{ active: leftTab === 'imagery' && !compareEnabled }" @click="openSection('imagery')"><span class="nav-symbol">◈</span> 遥感影像</button>
        <button class="nav-link" :class="{ active: compareEnabled }" @click="toggleComparison"><span class="nav-symbol">◫</span> 影像对比</button>
        <button class="nav-link" :class="{ active: leftTab === 'objects' && !compareEnabled }" @click="openSection('objects')"><span class="nav-symbol">⌕</span> 空间查询</button>
      </nav>
      <div class="header-spacer"></div>
      <button class="header-button header-data-button" @click="fileInput?.click()"><span>↥</span> 导入 GeoJSON</button>
      <button v-if="annotationCount" class="header-button primary" @click="exportGeoJSON"><span>⇩</span> 导出标注</button>
      <div class="avatar" title="空间工作台">GIS</div>
    </header>

    <div class="content-grid">
      <nav class="workspace-rail" aria-label="工作台功能导航">
        <div class="rail-group">
          <button class="rail-link" :class="{ selected: leftTab === 'layers' && !compareEnabled }"
            @click="resetView" title="地图工作台"><span class="rail-icon">▧</span><span>地图工作台</span></button>
          <button class="rail-link" :class="{ selected: leftTab === 'imagery' && !compareEnabled }"
            @click="openSection('imagery')" title="影像浏览"><span class="rail-icon">▣</span><span>影像浏览</span></button>
          <button class="rail-link" :class="{ selected: compareEnabled }"
            @click="toggleComparison" title="影像对比"><span class="rail-icon">◫</span><span>影像对比</span></button>
          <button class="rail-link" :class="{ selected: leftTab === 'objects' && !compareEnabled }"
            @click="openSection('objects')" title="空间查询"><span class="rail-icon">⌕</span><span>空间查询</span></button>
          <button class="rail-link" @click="openAnnotationRecords" title="标注管理"><span class="rail-icon">⬡</span><span>标注管理</span></button>
          <button class="rail-link" @click="fileInput?.click()" title="数据导入"><span class="rail-icon">↥</span><span>数据导入</span></button>
        </div>
        <div class="rail-bottom"><span class="rail-bottom-mark">◈</span><span>空间工作台</span></div>
      </nav>
      <aside class="left-panel" :class="{ 'mobile-open': mobileMenuOpen }">
        <div class="intro">
          <div class="eyebrow">SPATIAL LAYERS <span class="tiny-line"></span></div>
          <h1>图层管理</h1>
          <p>管理影像、道路和工作区标注图层</p>
        </div>

        <div class="left-tabs">
          <button :class="{ selected: leftTab === 'layers' }" @click="leftTab = 'layers'">图层管理</button>
          <button :class="{ selected: leftTab === 'objects' }" @click="leftTab = 'objects'">对象目录</button>
          <button :class="{ selected: leftTab === 'imagery' }" @click="leftTab = 'imagery'">遥感影像</button>
        </div>

        <div class="left-scroll">
          <template v-if="leftTab === 'layers'">
            <div class="section-heading"><span>图层列表</span><small>{{ layerDefinitions.length }} 个图层</small></div>
            <div class="layer-list">
              <div v-for="layer in layerDefinitions" :key="layer.key" class="layer-row">
                <div class="layer-main">
                  <button class="layer-toggle" :class="{ on: layersVisible[layer.key] }"
                    :aria-label="(layersVisible[layer.key] ? '隐藏' : '显示') + layer.name"
                    @click="toggleLayer(layer.key)">
                    <span v-if="layersVisible[layer.key]">✓</span>
                  </button>
                  <span class="layer-symbol" :style="{ color: layer.color }">{{ layer.symbol }}</span>
                  <div class="layer-label"><strong>{{ layer.name }}</strong><span>{{ layer.desc }}</span></div>
                  <span class="layer-caret">⌄</span>
                </div>
                <div v-if="layer.key !== 'basemap' && layersVisible[layer.key]" class="opacity-row">
                  <span>透明度</span>
                  <input type="range" min="15" max="100" :value="layerOpacity[layer.key]"
                    :aria-label="layer.name + '不透明度'" @input="changeOpacity(layer.key, $event)" />
                  <span>{{ layerOpacity[layer.key] }}%</span>
                </div>
              </div>
            </div>
            <div class="section-heading second-heading"><span>快速检索</span><small>空间对象</small></div>
            <label class="search-box">
              <span class="search-icon">⌕</span>
              <input v-model="query" type="search" placeholder="搜索线路、名称或编号..." />
            </label>
            <div class="compact-list">
              <button v-for="item in filteredItems.slice(0, 5)" :key="item.id"
                class="compact-record" @click="focusFeature(item)">
                <span class="record-dot" :class="item.category === '道路线路' ? 'teal' : 'amber'"></span>
                <span><strong>{{ item.name }}</strong><small>{{ item.category }} · {{ item.code }}</small></span>
                <span class="record-arrow">›</span>
              </button>
              <div v-if="!filteredItems.length" class="empty-list">未找到符合条件的空间对象</div>
            </div>
            <button v-if="filteredItems.length > 5" class="text-link" @click="leftTab = 'objects'">查看全部对象 <span>→</span></button>
          </template>
          <template v-else-if="leftTab === 'imagery'">
            <div class="section-heading"><span>影像图层</span><small>资料目录</small></div>
            <div class="imagery-group">
              <label class="imagery-label" for="gis-imagery-source">地图背景</label>
              <select id="gis-imagery-source" class="imagery-select" :value="imagerySelected"
                @change="changeImagery(($event.target as HTMLSelectElement).value)">
                <option value="street">道路地图</option>
                <option v-for="item in imageCatalog" :key="item.id" :value="item.id">{{ item.name }}</option>
              </select>
              <p class="imagery-description">切换不同来源的卫星影像和道路底图。</p>
            </div>
            <div class="section-heading second-heading"><span>多时相对比</span><small>卷帘浏览</small></div>
            <div class="imagery-group">
              <button class="compare-switch" :class="{ selected: compareEnabled }" @click="toggleComparison">
                <span>◫</span> {{ compareEnabled ? '关闭卷帘对比' : '开启卷帘对比' }}
              </button>
              <template v-if="compareEnabled">
                <label class="imagery-label" for="gis-time-a">左侧影像</label>
                <select id="gis-time-a" class="imagery-select" :value="compareBefore"
                  @change="changeComparisonDate('before', ($event.target as HTMLSelectElement).value)">
                  <option v-for="item in imageCatalog" :key="item.id" :value="item.id">{{ item.name }}</option>
                </select>
                <label class="imagery-label" for="gis-time-b">右侧影像</label>
                <select id="gis-time-b" class="imagery-select" :value="compareAfter"
                  @change="changeComparisonDate('after', ($event.target as HTMLSelectElement).value)">
                  <option v-for="item in imageCatalog" :key="item.id" :value="item.id">{{ item.name }}</option>
                </select>
                <label class="imagery-label" for="gis-swipe-left">对比位置 {{ swipePosition }}%</label>
                <input id="gis-swipe-left" class="imagery-range" type="range" min="5" max="95" :value="swipePosition" @input="updateSwipe" />
              </template>
              <p class="imagery-description">不同来源影像的采集日期、分辨率可能不同，变化判断需核对影像元数据。</p>
            </div>
            <div class="section-heading second-heading"><span>影像目录</span></div>
            <div v-for="item in imageCatalog" :key="item.id" class="imagery-dataset">
              <span class="image-catalog-dot">◈</span>
              <div><strong>{{ item.name }}</strong><small>{{ item.resolution }} · {{ item.provider }}</small></div>
            </div>
          </template>
          <template v-else>
            <div class="section-heading"><span>对象检索</span><small>{{ filteredItems.length }} 条记录</small></div>
            <label class="search-box">
              <span class="search-icon">⌕</span>
              <input v-model="query" type="search" placeholder="输入名称、编号或类别..." />
            </label>
            <div class="compact-list full-list">
              <button v-for="item in filteredItems" :key="item.id"
                class="compact-record" :class="{ picked: selected?.id === item.id }" @click="focusFeature(item)">
                <span class="record-dot" :class="item.category === '道路线路' ? 'teal' : 'amber'"></span>
                <span><strong>{{ item.name }}</strong><small>{{ item.category }} · {{ item.code }}</small></span>
                <span class="record-arrow">›</span>
              </button>
              <div v-if="!filteredItems.length" class="empty-list">未找到符合条件的空间对象</div>
            </div>
          </template>
        </div>
        <div class="left-footer">
          <span class="network-icon">◇</span>
          <div><strong>数据总览</strong><small>{{ dataLoaded ? '空间图层已加载' : '正在读取空间资料' }}</small></div>
          <span class="healthy-dot" :class="{ inactive: !dataLoaded }"></span>
        </div>
      </aside>

      <main class="map-stage">
        <div ref="mapElement" class="map-element" aria-label="可交互的空间地图"></div>
        <div class="hud-reticle" aria-hidden="true"></div>
        <div class="hud-corner hud-nw" aria-hidden="true"></div>
        <div class="hud-corner hud-ne" aria-hidden="true"></div>
        <div class="hud-corner hud-sw" aria-hidden="true"></div>
        <div class="hud-corner hud-se" aria-hidden="true"></div>
        <div class="map-heading">
          <span class="map-heading-label"><span class="online-dot"></span> 公路空间信息</span>
          <span class="map-heading-sub">{{ compareEnabled ? '多时相影像卷帘' : imageryLabel }}</span>
        </div>

        <div class="map-toolbar" aria-label="地图工具">
          <button :class="{ toolactive: activeTool === 'browse' }" title="选择对象" @click="setTool('browse')"><span>↖</span><small>选择</small></button>
          <div class="toolbar-divider"></div>
          <button :class="{ toolactive: activeTool === 'point' }" title="绘制点标注" @click="setTool('point')"><span>⌖</span><small>点</small></button>
          <button :class="{ toolactive: activeTool === 'line' }" title="绘制线标注" @click="setTool('line')"><span>⌁</span><small>线</small></button>
          <button :class="{ toolactive: activeTool === 'polygon' }" title="绘制面标注" @click="setTool('polygon')"><span>⬡</span><small>面</small></button>
          <div class="toolbar-divider"></div>
          <button :class="{ toolactive: activeTool === 'length' }" title="测量距离" @click="setTool('length')"><span>⟷</span><small>测距</small></button>
          <button :class="{ toolactive: activeTool === 'area' }" title="测量面积" @click="setTool('area')"><span>▱</span><small>测面</small></button>
        </div>

        <div v-if="compareEnabled" class="imagery-swipe-labels">
          <span>{{ imageCatalog.find((x) => x.id === compareBefore)?.name }}</span>
          <span>{{ imageCatalog.find((x) => x.id === compareAfter)?.name }}</span>
        </div>
        <div v-if="compareEnabled" class="swipe-divider" :style="{ left: swipePosition + '%' }" aria-hidden="true">
          <span class="swipe-grip">↔</span>
        </div>
        <div v-if="compareEnabled" class="swipe-bottom-slider">
          <input type="range" min="5" max="95" :value="swipePosition" @input="updateSwipe" aria-label="调整卷帘对比位置" />
        </div>
        <div v-if="imageryError && layersVisible.basemap" class="imagery-error" role="alert">
          <span>当前影像部分区域加载失败</span>
          <button @click="changeImagery('street')">查看道路地图</button>
        </div>
        <div class="zoom-toolbar">
          <button title="放大地图" @click="zoomBy(1)">+</button>
          <button title="缩小地图" @click="zoomBy(-1)">−</button>
          <div class="zoom-separator"></div>
          <button title="恢复初始视野" @click="resetView">⌂</button>
        </div>

        <div v-if="activeTool !== 'browse'" class="draw-hint">
          <span class="pulse"></span>
          {{ activeTool === 'point' ? '单击地图放置标注点'
            : activeTool === 'line' || activeTool === 'length' ? '单击绘制节点，双击结束'
            : '单击绘制边界，双击结束' }}
          <button @click="setTool('browse')">完成</button>
        </div>
        <div v-if="measureOutput" class="measure-result">
          <span>◈</span> {{ measureOutput }}
          <button @click="measureOutput = ''; measureSource.clear()">×</button>
        </div>

        <div class="map-legend">
          <strong>图例</strong>
          <span><i class="legend-line"></i> 公路线路</span>
          <span><i class="legend-dot amber"></i> 道路设施</span>
          <span><i class="legend-dot blue"></i> 地图标注</span>
        </div>
        <div v-if="usesSentinelImagery" class="raster-attribution">
          <a href="https://cloudless.eox.at" target="_blank" rel="noopener noreferrer">EOxCloudless</a>
          by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 &amp; 2017)
        </div>
        <div class="map-footnote">
          <span>{{ compareEnabled ? 'NASA GIBS / EOxCloudless' : imagerySelected === 'street' ? 'OpenStreetMap' : imagerySelected === 'sentinel2016' ? 'EOxCloudless' : 'NASA GIBS' }}</span>
          <span class="foot-separator">/</span>
          <span>WGS84</span><span class="foot-separator">/</span>
          <span>{{ currentLonLat }}</span>
          <span class="foot-separator">/</span>
          <span>缩放 {{ currentZoom }}</span>
        </div>
      </main>

      <aside class="right-panel" :class="{ 'detail-open': detailDrawerOpen && selected }">
        <div class="right-header">
          <div><div class="eyebrow">FEATURE INFORMATION</div><h2>对象详情</h2></div>
          <button v-if="selected" class="close-detail" title="关闭详情" @click="clearSelection">×</button>
        </div>
        <template v-if="selected">
          <div class="detail-hero">
            <div class="detail-icon" :class="{ amberbg: selected.category !== '道路线路' }">
              {{ selected.category === '道路线路' ? '━' : '⌖' }}
            </div>
            <div><small>{{ selected.category }}</small><h3>{{ selected.name }}</h3><span>{{ selected.code }}</span></div>
          </div>
          <div class="detail-section-title">基础信息</div>
          <div class="detail-fields">
            <div><span>对象名称</span><strong>{{ selected.name }}</strong></div>
            <div><span>对象编号</span><strong>{{ selected.code }}</strong></div>
            <div><span>对象类型</span><strong>{{ selected.category }}</strong></div>
            <div><span>所属资料</span><strong>{{ selected.unit }}</strong></div>
          </div>
          <template v-if="selectedIsAnnotation">
            <div class="detail-section-title">标注属性</div>
            <div class="annotation-editor">
              <label>名称<input v-model="editName" maxlength="100" aria-label="标注名称" /></label>
              <label>类别<input v-model="editCategory" maxlength="50" aria-label="标注类别" /></label>
              <label>备注<textarea v-model="editDescription" maxlength="300" rows="3" aria-label="标注备注"></textarea></label>
              <button @click="saveProperties">保存属性</button>
            </div>
          </template>
          <template v-else>
            <div class="detail-section-title">对象描述</div>
            <p class="detail-description">{{ selected.description }}</p>
          </template>
          <div class="detail-buttons">
            <button @click="focusFeature(selected!)">⌖ 定位对象</button>
            <button v-if="annotationSource.hasFeature(selected.feature)" class="danger-button" @click="removeSelected">移除标注</button>
          </div>
        </template>
        <template v-else>
          <div class="overview-card">
            <div class="overview-icon">⌖</div>
            <h3>地图对象信息</h3>
            <p>在地图中选择道路或设施对象，查看其位置与基础属性。</p>
          </div>
          <div class="detail-section-title">工作区概览</div>
          <div class="summary-list">
            <div><span class="summary-icon teal-icon">━</span><span>道路线路</span><strong>{{ roadCount }}</strong></div>
            <div><span class="summary-icon amber-icon">●</span><span>道路设施</span><strong>{{ facilityCount }}</strong></div>
            <div><span class="summary-icon blue-icon">◆</span><span>地图标注</span><strong>{{ annotationCount }}</strong></div>
          </div>
          <div class="info-note"><span>◉</span> 使用上方绘制工具可添加点、线、面标注。</div>
        </template>
        <div class="right-bottom" v-if="annotationCount">
          <div class="workspace-count"><span>当前工作区标注</span><strong>{{ annotationCount }} 个 · {{ draftSaved ? '已保存本机' : '未保存' }}</strong></div>
          <button class="outline-button" @click="exportGeoJSON">⇩ 导出 GeoJSON</button>
          <button class="muted-button" @click="clearAnnotations">清空标注</button>
        </div>
      </aside>
    </div>

    <div v-if="mobileMenuOpen" class="mobile-scrim" @click="mobileMenuOpen = false"></div>
    <footer class="status-bar">
      <span><i class="status-connected"></i> 地图服务</span>
      <span class="status-divider"></span>
      <span>© OpenStreetMap contributors · EOxCloudless / EOX · NASA GIBS</span>
      <span class="footer-spacer"></span>
      <span>图层 {{ layerDefinitions.filter((x) => layersVisible[x.key]).length }} / {{ layerDefinitions.length }}</span>
      <span class="status-divider"></span>
      <span>EPSG:3857</span>
    </footer>
    <input ref="fileInput" class="visually-hidden" type="file" accept=".geojson,.json,application/geo+json,application/json" @change="importGeoJSON" />
    <div v-if="notice" class="toast-notice" role="status"><span>◉</span> {{ notice }} <button @click="notice = ''">×</button></div>
  </div>
</template>
