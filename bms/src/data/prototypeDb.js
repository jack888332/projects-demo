import Dexie from 'dexie'

export const prototypeDb = new Dexie('BmsCostCenterPrototype')

prototypeDb.version(1).stores({
  sampleFiles: '&id,supplier,board',
  suppliers: '&code,name,state,*boards',
  bills: '&id,supplier,board,state,created',
  costs: '&id,bill,supplier,board,type,status,key',
  pools: '&id,supplier,fee,status',
  fees: '&code,board,status',
  operationLogs: '++id,entityType,entityId,action,createdAt',
  settings: '&key',
})

prototypeDb.version(2).stores({
  feeAliases: '&id,supplier,board,rawName,feeCode,status,[supplier+board+rawName]',
})

prototypeDb.version(3).stores({
  allocationRules: '&id,board,fee,supplier,status',
})

prototypeDb.version(4).stores({
  demoRecords: '&key,dataset,position',
})
