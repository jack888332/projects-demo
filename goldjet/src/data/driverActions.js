import { reactive } from 'vue'
import { DRIVER_DEMO, driverLoginError } from '../domain/driverTasks.js'
import { driverSessionStorage } from './driverSessionStorage.js'
import { canReadModule } from './accessControl.js'
import { groundAccount } from '../domain/groundService.js'

export function createDriverActions(state, getPersona, storage = driverSessionStorage, clock = () => Date.now()) {
  const session = reactive({ phone: '', method: '', remember: true })
  const challenge = reactive({ phone: '', sentAt: null })
  let generation = 0
  function role() { if (!groundAccount(getPersona()) || !canReadModule(getPersona() === 'driver' ? 'driver' : 'groundService')) throw new Error('请先切换获授权的司机演示角色或地面服务角色') }
  function loginError(phone) {
    if (getPersona() === 'driver') return driverLoginError(state.groundWaybills, phone)
    if (!/^\d{11}$/.test(phone)) return '请输入11位手机号'
    if (groundAccount(getPersona())?.phone !== phone) return '该手机号未配置当前地面服务账户'
    return ''
  }
  function sendDriverCode(phone, answer) {
    role()
    const error = loginError(phone)
    if (error) throw new Error(error)
    if (challenge.sentAt !== null && clock() - challenge.sentAt < 60000) throw new Error('请在60秒倒计时结束后重新获取')
    if (String(answer).toUpperCase() !== DRIVER_DEMO.challenge) throw new Error('图形校验错误，请重新输入')
    Object.assign(challenge, { phone, sentAt: clock() })
  }
  async function loginDriver({ phone, code, remember = true, method = 'sms' }) {
    role()
    const error = loginError(phone)
    if (error) throw new Error(error)
    if (method === 'sms' && (challenge.phone !== phone || challenge.sentAt === null || code !== DRIVER_DEMO.code)) throw new Error('验证码错误，请重新输入！')
    if (method === 'wechat' && phone !== groundAccount(getPersona())?.phone) throw new Error('当前模拟微信未绑定该手机号')
    if (!['sms', 'wechat'].includes(method)) throw new Error('登录方式无效')
    const token = ++generation
    const persona = getPersona()
    await storage.write(remember ? { phone, method } : null)
    if (token !== generation || getPersona() !== persona) return false
    role()
    if (loginError(phone)) return false
    Object.assign(session, { phone, method, remember })
    challenge.phone = ''; challenge.sentAt = null
    return true
  }
  async function enterDriver() {
    role()
    if (session.phone && !loginError(session.phone)) return
    const token = ++generation
    const persona = getPersona()
    Object.assign(session, { phone: '', method: '', remember: true })
    const saved = await storage.read()
    if (token !== generation || getPersona() !== persona) return
    role()
    if (saved && !loginError(saved.phone)) Object.assign(session, saved)
  }
  async function logoutDriver() {
    generation++
    Object.assign(session, { phone: '', method: '', remember: true })
    challenge.phone = ''; challenge.sentAt = null
    await storage.write(null)
  }
  function leaveDriver() { generation++; Object.assign(session, { phone: '', method: '' }) }
  return { driverSession: session, driverChallenge: challenge, sendDriverCode, loginDriver, enterDriver, logoutDriver, leaveDriver }
}
