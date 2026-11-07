/** RFC 7946 GeoJSON subset accepted by the browser-only workspace.
 * Reject ambiguous CRS, nonfinite/out-of-bounds positions and excessive geometry.
 */
const supportedTypes: Record<string, number> = {
  Point: 0, LineString: 1, Polygon: 2,
  MultiPoint: 1, MultiLineString: 2, MultiPolygon: 3,
}
const maxFeatures = 5000
const maxPositions = 30000

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function validateImportPayload(data: unknown, existingFeatureCount: number): void {
  if (!record(data) || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    throw new Error('请选择有效的 GeoJSON FeatureCollection 文件')
  }
  if ('crs' in data) {
    throw new Error('仅支持 WGS84 经纬度 GeoJSON，请先将数据转换为 EPSG:4326')
  }
  if (!Number.isInteger(existingFeatureCount) || existingFeatureCount < 0) {
    throw new Error('工作区数据状态异常')
  }
  if (data.features.length === 0) throw new Error('文件中没有可导入的要素')
  if (existingFeatureCount + data.features.length > maxFeatures) {
    throw new Error('当前工作区最多保留 5000 个标注，请分批处理')
  }

  let positions = 0
  function visitCoords(value: unknown, nesting: number): void {
    if (!Array.isArray(value)) throw new Error('GeoJSON 坐标结构无效')
    if (nesting === 0) {
      if (value.length < 2 || value.length > 3 ||
          !value.every((number) => typeof number === 'number' && Number.isFinite(number)) ||
          Math.abs(value[0] as number) > 180 || Math.abs(value[1] as number) > 90) {
        throw new Error('GeoJSON 坐标必须是合法的 WGS84 经纬度')
      }
      positions += 1
      if (positions > maxPositions) throw new Error('坐标数量过大，请简化几何数据后重新导入')
      return
    }
    if (value.length === 0) throw new Error('GeoJSON 不允许空的几何坐标')
    for (const child of value) visitCoords(child, nesting - 1)
  }

  for (const feature of data.features) {
    if (!record(feature) || feature.type !== 'Feature' || !record(feature.geometry)) {
      throw new Error('GeoJSON 包含无效空间要素')
    }
    const type = feature.geometry.type
    if (typeof type !== 'string' || !(type in supportedTypes)) {
      throw new Error('文件包含不支持的几何类型')
    }
    if (!('coordinates' in feature.geometry)) throw new Error('GeoJSON 缺少坐标信息')
    if (feature.properties !== null && feature.properties !== undefined && !record(feature.properties)) {
      throw new Error('GeoJSON 属性格式无效')
    }
    if (record(feature.properties)) {
      for (const key of Object.keys(feature.properties)) {
        if (['__proto__', 'constructor', 'prototype', 'geometry'].includes(key)) {
          throw new Error('GeoJSON 属性包含保留字段')
        }
      }
    }
    visitCoords(feature.geometry.coordinates, supportedTypes[type])
  }
}
