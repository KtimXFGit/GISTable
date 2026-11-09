export type TaskState = 'pending' | 'active' | 'review' | 'done'
export interface LocalTask {
  id: string
  featureId: string
  name: string
  state: TaskState
  createdAt: string
  updatedAt: string
}
const storageKey = 'gistable:workspace:tasks:v1'
const allowed = new Set<TaskState>(['pending','active','review','done'])
export const localTaskRepository = {
  load(): LocalTask[] {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw || raw.length > 180_000) return []
      const value: unknown = JSON.parse(raw)
      if (!Array.isArray(value)) return []
      return value.slice(0,1000).filter((r): r is LocalTask => (
        !!r && typeof r === 'object' &&
        typeof r.id === 'string' && typeof r.featureId === 'string' &&
        typeof r.name === 'string' && typeof r.createdAt === 'string' &&
        typeof r.updatedAt === 'string' && allowed.has(r.state as TaskState)
      ))
    } catch { return [] }
  },
  save(items: LocalTask[]): boolean {
    try {
      if (items.length > 1000) return false
      const raw = JSON.stringify(items)
      if (raw.length > 180_000) return false
      window.localStorage.setItem(storageKey,raw)
      return true
    } catch { return false }
  },
}
