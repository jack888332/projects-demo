import { describe, expect, it } from 'vitest'
import { customerRelationSummary, matchCustomerRelations, validateCustomerIdentity } from '../src/domain/customerRelations.js'

const customer = {
  customerCode:'OG0271',
  memberCode:'M-001',
  store:'店铺一',
  group:'客户组一',
  relations:[{ store:'店铺一', group:'客户组一', memberCode:'M-001' }],
}

describe('customer relation snapshots', () => {
  it('retains one current store, group and member identity', () => {
    expect(customerRelationSummary(customer)).toMatchObject({
      store:'店铺一',
      group:'客户组一',
      memberCode:'M-001',
      stores:['店铺一'],
      groups:['客户组一'],
      memberCodes:['M-001'],
    })
  })

  it('matches only the member current store and its customer group', () => {
    expect(matchCustomerRelations(customer, { stores:['店铺一'], groups:['客户组一'] }).matches).toBe(true)
    expect(matchCustomerRelations(customer, { stores:['店铺二'], groups:['客户组一'] }).matches).toBe(false)
  })

  it('rejects upstream identities with multiple current stores or member codes', () => {
    expect(validateCustomerIdentity({
      customerCode:'OG0271',
      relations:[
        { store:'店铺一', group:'客户组一', memberCode:'M-001' },
        { store:'店铺二', group:'客户组二', memberCode:'M-002' },
      ],
    })).toMatchObject({ valid:false, issues:['同一会员存在多个当前所属店铺', '客户与会员不是一一对应关系'] })
  })

  it('rejects a customer group owned by another store', () => {
    expect(validateCustomerIdentity({
      customerCode:'OG0271',
      relations:[{ store:'店铺一', group:'客户组二', groupStore:'店铺二', memberCode:'M-001' }],
    })).toMatchObject({ valid:false, issues:['客户组不属于会员当前所属店铺'] })
  })
})
