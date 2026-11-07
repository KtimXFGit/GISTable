/** Local browser draft, not a server database. */
const key = 'gistable:workspace:annotations:v1'
const maxSize = 2_000_000
export const localAnnotationRepository = {
  load(): unknown | null {
    try {
      const value = window.localStorage.getItem(key)
      if (!value || value.length > maxSize) return null
      const parsed: unknown = JSON.parse(value)
      if (!parsed || typeof parsed !== 'object') return null
      const item = parsed as { type?: unknown; features?: unknown }
      if (item.type !== 'FeatureCollection' || !Array.isArray(item.features) || item.features.length > 5000) return null
      return parsed
    } catch { return null }
  },
  save(data: unknown): boolean {
    try {
      const value = JSON.stringify(data)
      if (value.length > maxSize) return false
      window.localStorage.setItem(key, value)
      return true
    } catch { return false }
  },
}
