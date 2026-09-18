let memory = null
let database
async function db() {
  database ||= import('dexie').then(({ default: Dexie }) => {
    const instance = new Dexie('goldjet-driver-demo-session')
    instance.version(1).stores({ preferences: 'key' })
    return instance
  })
  return database
}
const valid = value => Boolean(value && typeof value === 'object' && /^\d{11}$/.test(value.phone) && ['sms', 'wechat'].includes(value.method))
export const driverSessionStorage = {
  async read() {
    const value = typeof indexedDB === 'undefined' ? memory : (await (await db()).table('preferences').get('login'))?.value
    return valid(value) ? value : null
  },
  async write(value) {
    if (value && !valid(value)) throw new Error('演示登录信息无效')
    if (typeof indexedDB === 'undefined') { memory = value; return }
    const table = (await db()).table('preferences')
    if (value) await table.put({ key: 'login', value })
    else await table.delete('login')
  },
}
