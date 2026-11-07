/** 数据访问接口：未来由 HTTP 实现替换，页面和地图逻辑保持不变。 */
export interface FeatureRepository {
  getWorkspaceObjects(): Promise<GeoJSONFeatureCollection>
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    id?: string | number
    geometry: { type: string; coordinates: unknown }
    properties: Record<string, unknown>
  }>
}

export const staticFeatureRepository: FeatureRepository = {
  async getWorkspaceObjects() {
    const response = await fetch(`${import.meta.env.BASE_URL}sample-data/objects.geojson`, {
      cache: 'no-cache',
    })
    if (!response.ok) throw new Error('空间数据读取失败')
    const data = await response.json()
    if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
      throw new Error('空间数据格式不正确')
    }
    return data as GeoJSONFeatureCollection
  },
}
