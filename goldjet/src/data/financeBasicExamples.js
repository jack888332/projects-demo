export function createFinanceCostItemSeed() {
  const defaults = ['运费成本', '提货', '中转', '仓储', '预配发送', '报关', '货站安检', '清关派送', '提单费', '燃油附加费', '安全附加费', '燃油费', '信息费', '分单费']
    .map((name,index)=>({id:`FC-${String(index+1).padStart(4,'0')}`,code:`F${String(index+1).padStart(3,'0')}`,name,status:'已生效'}))
  return [...defaults,
    {id:'COST-001',code:'F015',name:'运输成本',level:1,parentId:'',status:'已生效'},
    {id:'COST-002',code:'F016',name:'地面作业成本',level:2,parentId:'COST-001',status:'已生效'},
    {id:'COST-003',code:'F017',name:'装卸成本',level:3,parentId:'COST-002',status:'已生效'},
    {id:'COST-004',code:'F018',name:'附加服务成本',level:3,parentId:'COST-002',status:'已生效'},
    {id:'COST-005',code:'F019',name:'历史保管成本',level:3,parentId:'COST-002',status:'已停用'},
  ].map(row=>({...row,updatedBy:'财务基础演示管理员',updatedAt:'2026-09-08 09:00'}))
}

export function createFinanceBasicSeed() {
  return { financeBasics: { currentPeriod:'2026-09', sequence:3, eventSequence:0,
    rates:[
      {id:'FX-DEMO-001',period:'2026-09',sourceCurrency:'USD',targetCurrency:'CNY',rate:'7.0500',status:'已生效',updatedBy:'财务会计演示员',updatedAt:'2026-09-08 09:00'},
      {id:'FX-DEMO-002',period:'2026-09',sourceCurrency:'USD',targetCurrency:'HKD',rate:'7.8000',status:'已生效',updatedBy:'财务会计演示员',updatedAt:'2026-09-08 09:10'},
      {id:'FX-DEMO-003',period:'2026-08',sourceCurrency:'USD',targetCurrency:'CNY',rate:'7.1000',status:'已生效',updatedBy:'财务会计演示员',updatedAt:'2026-08-01 09:00'},
    ], rateReferences:[{rateId:'FX-DEMO-003',source:'合成历史结算引用'}],
    businessCostLinks: [{id:'BC-DEMO-001',costId:'COST-003',businessType:'合成地面服务',status:'已生效'}],
    departments:[{id:'FIN-DEMO-D1',code:'D001',name:'合成空运部门',companyId:'FIN-DEMO-A'},{id:'FIN-DEMO-D2',code:'D002',name:'合成异公司部门',companyId:'FIN-DEMO-B'}],
    departmentMappings:[
      {id:'MAP-DEMO-001',departmentId:'FIN-DEMO-D1',level1Id:'COST-001',level2Id:'COST-002',detailId:'COST-003'},
      {id:'MAP-DEMO-002',departmentId:'FIN-DEMO-D2',level1Id:'COST-001',level2Id:'COST-002',detailId:'COST-003'},
    ].map(row=>({...row,status:'已生效',createdBy:'财务会计演示员',createdAt:'2026-09-08 09:00'})),
    invoiceProfiles:[{id:'INV-PROFILE-001',partnerId:'PT-00018'},{id:'INV-PROFILE-002',partnerId:'PT-00019'}].map(row=>({...row,status:'已生效',updatedBy:'财务基础演示员',updatedAt:'2026-09-08 09:00'})),
    invoiceUnits:[
      {id:'INV-UNIT-001',profileId:'INV-PROFILE-001',name:'启航演示开票单位',isDefault:'是',taxpayerId:'DEMO00000000000001',bankName:'演示银行甲',accountNo:'00000001001',address:'合成开票地址一号',phone:'00000000001'},
      {id:'INV-UNIT-002',profileId:'INV-PROFILE-001',name:'启航历史开票单位',isDefault:'否',taxpayerId:'DEMO00000000000002',bankName:'',accountNo:'',address:'',phone:''},
      {id:'INV-UNIT-003',profileId:'INV-PROFILE-002',name:'云帆演示开票单位',isDefault:'是',taxpayerId:'DEMO00000000000003',bankName:'演示银行乙',accountNo:'00000002001',address:'合成开票地址二号',phone:'00000000002'},
    ].map(row=>({...row,updatedBy:'财务基础演示员',updatedAt:'2026-09-08 09:00',deleted:false})),
    invoiceReferences:[{unitId:'INV-UNIT-002',source:'合成历史发票引用'}],
    bankAccounts:[
      {id:'BANK-DEMO-001',bankName:'演示银行甲',accountName:'合成公司甲基本户',accountNo:'00000010001',currency:'CNY',basic:'Y',companyId:'FIN-DEMO-A',organizationId:'FIN-DEMO-ORG-A',departmentId:'FIN-DEMO-D1',status:'已生效'},
      {id:'BANK-DEMO-002',bankName:'演示银行乙',accountName:'合成公司甲外币户',accountNo:'00000010002',currency:'USD',basic:'N',companyId:'FIN-DEMO-A',organizationId:'FIN-DEMO-ORG-A',departmentId:'FIN-DEMO-D1',status:'已生效'},
      {id:'BANK-DEMO-003',bankName:'演示银行丙',accountName:'合成公司乙基本户',accountNo:'00000020001',currency:'CNY',basic:'Y',companyId:'FIN-DEMO-B',organizationId:'FIN-DEMO-ORG-B',departmentId:'FIN-DEMO-D2',status:'已生效'},
      {id:'BANK-DEMO-004',bankName:'演示银行丁',accountName:'合成公司甲已停用户',accountNo:'00000010003',currency:'HKD',basic:'N',companyId:'FIN-DEMO-A',organizationId:'FIN-DEMO-ORG-A',departmentId:'FIN-DEMO-D1',status:'已停用'},
    ].map(row=>({...row,updatedBy:'财务会计演示员',updatedAt:'2026-09-08 09:00'})),
    bankReferences:[{bankId:'BANK-DEMO-002',source:'合成历史核销引用'}],
  } }
}
