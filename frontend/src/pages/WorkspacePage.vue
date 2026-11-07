<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Map from 'ol/Map'
import View from 'ol/View'
import Feature from 'ol/Feature'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import OSM from 'ol/source/OSM'
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
const leftTab = ref<'layers' | 'objects'>('layers')
const query = ref('')
const activeTool = ref<Tool>('browse')
const selected = ref<RecordItem | null>(null)
const objectItems = ref<RecordItem[]>([])
const annotationCount = ref(0)
const currentLonLat = ref('104.0670° E  30.6500° N')
const currentZoom = ref('12.0')
const notice = ref('')
const measureOutput = ref('')
const dataLoaded = ref(false)
const layersVisible = ref<Record<LayerKey, boolean>>({
  basemap: true, roads: true, facilities: true, annotations: true,
})
const layerOpacity = ref<Record<LayerKey, number>>({
  basemap: 100, roads: 100, facilities: 100, annotations: 100,
})

const roadSource = new VectorSource<Feature<Geometry>>()
const facilitySource = new VectorSource<Feature<Geometry>>()
const annotationSource = new VectorSource<Feature<Geometry>>()
const measureSource = new VectorSource<Feature<Geometry>>()
const highlightSource = new VectorSource<Feature<Geometry>>()
const geojson = new GeoJSON()

const baseLayer = new TileLayer({ source: new OSM(), visible: true })
const roadLayer = new VectorLayer({
  source: roadSource,
  style: [
    new Style({ stroke: new Stroke({ color: '#ffffff', width: 8 }) }),
    new Style({ stroke: new Stroke({ color: '#157d8c', width: 4.5 }) }),
  ],
})
const facilityLayer = new VectorLayer({
  source: facilitySource,
  style: new Style({
    image: new CircleStyle({
      radius: 7, fill: new Fill({ color: '#f8a24e' }),
      stroke: new Stroke({ color: '#ffffff', width: 3 }),
    }),
  }),
})
const annotationLayer = new VectorLayer({
  source: annotationSource,
  style: new Style({
    image: new CircleStyle({
      radius: 7, fill: new Fill({ color: '#206de0' }),
      stroke: new Stroke({ color: '#ffffff', width: 2.5 }),
    }),
    stroke: new Stroke({ color: '#256ee2', width: 3, lineDash: [8, 5] }),
    fill: new Fill({ color: 'rgba(37,110,226,0.16)' }),
  }),
})
const measureLayer = new VectorLayer({
  source: measureSource,
  style: new Style({
    image: new CircleStyle({ radius: 5, fill: new Fill({ color: '#ee7056' }) }),
    stroke: new Stroke({ color: '#ed775c', width: 3, lineDash: [7, 7] }),
    fill: new Fill({ color: 'rgba(237,119,92,0.12)' }),
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
  { key: 'basemap', name: '基础底图', desc: 'OpenStreetMap', symbol: '▦', color: '#8ea0b3' },
  { key: 'roads', name: '公路线路', desc: '道路线形资料', symbol: '━', color: '#157d8c' },
  { key: 'facilities', name: '道路设施', desc: '空间位置与属性', symbol: '●', color: '#f2a04b' },
  { key: 'annotations', name: '地图标注', desc: '当前工作区图形', symbol: '◆', color: '#276de0' },
]

const filteredItems = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  return objectItems.value.filter((item) =>
    !keyword || [item.name, item.code, item.category, item.unit]
      .some((value) => value.toLowerCase().includes(keyword))
  )
})
const roadCount = computed(() => objectItems.value.filter((item) => item.category === '道路线路').length)
const facilityCount = computed(() => objectItems.value.length - roadCount.value)

let map: Map | null = null
let drawing: Draw | null = null
let modifying: Modify | null = null
let toastTimer: number | undefined

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
  highlightSource.clear()
  highlightSource.addFeature(feature.clone())
}

function clearSelection() {
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

function zoomBy(delta: number) {
  if (!map) return
  const view = map.getView()
  view.animate({ zoom: Math.min(19, Math.max(4, (view.getZoom() || 12) + delta)), duration: 240 })
}

function resetView() {
  clearSelection()
  map?.getView().animate({ center: fromLonLat([104.075, 30.652]), zoom: 12, duration: 450 })
}

function toggleLayer(key: LayerKey) {
  layersVisible.value[key] = !layersVisible.value[key]
  layerMap[key].setVisible(layersVisible.value[key])
}

function changeOpacity(key: LayerKey, event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  layerOpacity.value[key] = value
  layerMap[key].setOpacity(value / 100)
}

function updateAnnotationCount() {
  annotationCount.value = annotationSource.getFeatures().length
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
        id: 'A-' + String(Date.now()),
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
    if (parsed?.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
      throw new Error('请选择有效的 GeoJSON FeatureCollection 文件')
    }
    if (parsed.features.length > 5000) throw new Error('单次最多导入 5000 个要素')
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
      feature.setProperties({
        ...feature.getProperties(),
        name: typeof name === 'string' ? name : '导入标注',
        category: '地图标注',
        unit: '当前工作区',
        code: String(feature.get('code') || feature.get('id') || '导入数据'),
      })
    }
    annotationSource.addFeatures(features)
    updateAnnotationCount()
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
  clearSelection()
  showNotice('标注已移除')
}

function clearAnnotations() {
  if (!annotationSource.getFeatures().length) return
  if (!window.confirm('确定清空当前工作区内的所有地图标注吗？')) return
  annotationSource.clear()
  measureSource.clear()
  updateAnnotationCount()
  clearSelection()
  measureOutput.value = ''
  showNotice('当前工作区标注已清空')
}

onMounted(async () => {
  map = new Map({
    target: mapElement.value!,
    layers: [baseLayer, roadLayer, facilityLayer, annotationLayer, measureLayer, highlightLayer],
    view: new View({ center: fromLonLat([104.075, 30.652]), zoom: 12, minZoom: 4, maxZoom: 19 }),
    controls: defaultControls({ zoom: false, rotate: false }).extend([new ScaleLine({ units: 'metric' })]),
  })
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
  map?.setTarget(undefined)
  map = null
})
</script>

<template>
  <div class="app-shell">
    <header class="header">
      <div class="brand">
        <div class="brand-mark"><span class="brand-globe">◈</span></div>
        <div class="brand-copy">
          <span class="brand-name">GISTable</span>
          <span class="brand-sub">公路遥感监测与巡查执法管理平台</span>
        </div>
      </div>
      <div class="header-divider"></div>
      <nav class="primary-nav" aria-label="主要导航">
        <button class="nav-link active" @click="resetView"><span class="nav-symbol">▧</span> 一张图</button>
      </nav>
      <div class="header-spacer"></div>
      <span class="header-scope"><span class="scope-dot"></span> 空间信息工作台</span>
      <button class="header-button" @click="fileInput?.click()"><span>↥</span> 导入数据</button>
      <button v-if="annotationCount" class="header-button primary" @click="exportGeoJSON"><span>⇩</span> 导出标注</button>
      <div class="avatar" title="空间工作台">GIS</div>
    </header>

    <div class="content-grid">
      <aside class="left-panel">
        <div class="intro">
          <div class="eyebrow">GEOSPATIAL WORKSPACE <span class="tiny-line"></span></div>
          <h1>空间信息总览</h1>
          <p>道路、设施与地图标注的统一空间工作区</p>
          <div class="stats-row">
            <div><strong>{{ roadCount }}</strong><span>道路线路</span></div>
            <div><strong>{{ facilityCount }}</strong><span>设施对象</span></div>
            <div><strong>{{ annotationCount }}</strong><span>地图标注</span></div>
          </div>
        </div>

        <div class="left-tabs">
          <button :class="{ selected: leftTab === 'layers' }" @click="leftTab = 'layers'">图层管理</button>
          <button :class="{ selected: leftTab === 'objects' }" @click="leftTab = 'objects'">对象目录</button>
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
        <div class="map-heading">
          <span class="map-heading-label"><span class="online-dot"></span> 公路空间信息</span>
          <span class="map-heading-sub">一张图综合视图</span>
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
        <div class="map-footnote">
          <span>WGS84</span><span class="foot-separator">/</span>
          <span>{{ currentLonLat }}</span>
          <span class="foot-separator">/</span>
          <span>缩放 {{ currentZoom }}</span>
        </div>
      </main>

      <aside class="right-panel">
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
          <div class="detail-section-title">对象描述</div>
          <p class="detail-description">{{ selected.description }}</p>
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
          <div class="workspace-count"><span>当前工作区标注</span><strong>{{ annotationCount }} 个</strong></div>
          <button class="outline-button" @click="exportGeoJSON">⇩ 导出 GeoJSON</button>
          <button class="muted-button" @click="clearAnnotations">清空标注</button>
        </div>
      </aside>
    </div>

    <footer class="status-bar">
      <span><i class="status-connected"></i> 地图服务</span>
      <span class="status-divider"></span>
      <span>地图数据 © OpenStreetMap contributors</span>
      <span class="footer-spacer"></span>
      <span>图层 {{ layerDefinitions.filter((x) => layersVisible[x.key]).length }} / {{ layerDefinitions.length }}</span>
      <span class="status-divider"></span>
      <span>EPSG:3857</span>
    </footer>
    <input ref="fileInput" class="visually-hidden" type="file" accept=".geojson,.json,application/geo+json,application/json" @change="importGeoJSON" />
    <div v-if="notice" class="toast-notice" role="status"><span>◉</span> {{ notice }} <button @click="notice = ''">×</button></div>
  </div>
</template>
