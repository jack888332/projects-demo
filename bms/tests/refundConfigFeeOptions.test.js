import { describe, expect, it } from 'vitest'
import { oisCustomerFeeItemFixtures } from '../src/data/fixtures/oisCustomerFeeItems.js'

describe('refund config fee options from PRD 021', () => {
  const eligible = oisCustomerFeeItemFixtures.filter(item => item.name !== '代收货款' && item.type !== '非费项')

  it('contains every unique fee name from PRD 021', () => {
    expect(eligible.map(item => item.name)).toEqual([
      '派送费', '系统服务费', '打包费', '超重费', '超材费', '超长费', '满减活动优惠金额', '仓租费', '优惠券优惠金额', '包税手续费', '包材费', '积分优惠金额', '保险金额', '运费', '转运费用', '偏远地区费用', '保价金额', '保价手续费', '垫付金额', '代收货款手续费', '代收货款手续费（包裹导入值）', '重出费', '航空费', '清关费', '偏远费', '应付手续费', '费用6', '费用7', '理赔费', '转板费', '退运费', '税金', '税费', '木架费', '加收地址附加费', '加固包装费', '国内转寄', '国内到付', '改单费', '分单费', '罚款', '店取费', '代客收台币', '代客付台币', '超材手续费', '缠膜费', '报关费', '其他',
    ])
    expect(new Set(eligible.map(item => item.name)).size).toBe(eligible.length)
  })

  it('excludes COD principal and all non-fee fields', () => {
    expect(oisCustomerFeeItemFixtures.filter(item => item.type === '非费项').map(item => item.name)).toEqual([
      '到付金额', '货到付款手续费', '到付附加费总额', '历史实付返款', '实收回款', '回款汇率',
    ])
    expect(eligible.some(item => item.name === '代收货款')).toBe(false)
  })
})
