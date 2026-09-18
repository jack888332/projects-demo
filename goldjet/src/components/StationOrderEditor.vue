<script setup>
import {computed,ref,onMounted,onBeforeUnmount} from 'vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate} from 'vue-router'
import {ElMessage,ElMessageBox} from 'element-plus'
import {usePrototypeData} from '../data/usePrototypeData.js'
import {canWriteModule} from '../data/accessControl.js'
import {STATION_ORDER_FIELDS,stationOrderDraft,stationOrderErrors,stationCustomers,stationRights} from '../domain/stationPallet.js'
const emit=defineEmits(['saved']), {state,workbenchSession,createStationOrder}=usePrototypeData()
const visible=ref(false),draft=ref(stationOrderDraft()),initial=ref(''),failure=ref('')
const customers=computed(()=>stationCustomers(state)),errors=computed(()=>stationOrderErrors(draft.value,state))
const allowed=computed(()=>canWriteModule('stationPallet')&&stationRights(workbenchSession.personaId).manage)
const dirty=computed(()=>visible.value&&JSON.stringify(draft.value)!==initial.value)
function open(){draft.value=stationOrderDraft();initial.value=JSON.stringify(draft.value);failure.value='';visible.value=true}
async function leave(){if(!dirty.value)return true;try{await ElMessageBox.confirm('放弃尚未提交的打板订单？','放弃修改',{confirmButtonText:'放弃修改',cancelButtonText:'继续编辑'});return true}catch{return false}}
async function close(done){if(!await leave())return;visible.value=false;if(typeof done==='function')done()}
function save(){try{const row=createStationOrder(draft.value);visible.value=false;ElMessage.success('订单已成功创建！');emit('saved',row)}catch(error){failure.value=error.message}}
onBeforeRouteLeave(leave);onBeforeRouteUpdate(async()=>{if(!await leave())return false;visible.value=false})
const unload=event=>{if(dirty.value){event.preventDefault();event.returnValue=''}}
onMounted(()=>window.addEventListener('beforeunload',unload));onBeforeUnmount(()=>window.removeEventListener('beforeunload',unload))
defineExpose({open})
</script>
<template>
  <el-dialog v-model="visible" title="创建打板订单" width="min(980px,96vw)" :close-on-click-modal="false" :before-close="close" destroy-on-close>
    <el-alert v-if="failure" :title="failure" type="error" :closable="false" />
    <el-form label-position="top" @submit.prevent="save"><div class="station-form-grid">
      <el-form-item v-for="[key,label,type,required,max] in STATION_ORDER_FIELDS" :key="key" :label="label" :required="required" :error="errors[key]">
        <el-select v-if="type==='customer'" v-model="draft[key]" filterable :aria-label="label"><el-option v-for="row in customers" :key="row.id" :value="row.id" :label="row.name" /></el-select>
        <el-input v-else v-model="draft[key]" :type="type==='textarea'?'textarea':'text'" :maxlength="max" :inputmode="type==='number'?'decimal':type==='phone'?'tel':'text'" :aria-label="label" />
      </el-form-item>
    </div></el-form>
    <template #footer><el-button @click="close">取消</el-button><el-button type="primary" :disabled="!allowed||Object.keys(errors).length>0" @click="save">提交订单</el-button></template>
  </el-dialog>
</template>
<style scoped>.station-form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px 18px}.el-select{width:100%}@media(max-width:700px){.station-form-grid{grid-template-columns:minmax(0,1fr)}}</style>
