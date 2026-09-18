<script setup>
import {computed,ref,watch,onMounted,onBeforeUnmount} from 'vue'
import {useRoute,useRouter,onBeforeRouteLeave,onBeforeRouteUpdate} from 'vue-router'
import {Plus,Edit,View} from '@element-plus/icons-vue'
import {ElMessage,ElMessageBox} from 'element-plus'
import DataTableFrame from './DataTableFrame.vue'
import GroundImagesField from './GroundImagesField.vue'
import {usePrototypeData} from '../data/usePrototypeData.js'
import {canWriteModule} from '../data/accessControl.js'
import {stationRights} from '../domain/stationPallet.js'
import {stationPaperRows,stationPaperImagesError} from '../domain/stationPapers.js'
const {state,workbenchSession,airSession,saveStationPaper}=usePrototypeData(),route=useRoute(),router=useRouter()
const rows=computed(()=>stationPaperRows(state,workbenchSession.personaId,airSession)),writable=computed(()=>stationRights(workbenchSession.personaId).manage&&canWriteModule('stationPallet'))
const selected=computed(()=>rows.value.find(row=>row.id===route.query.paper)),editing=ref(false),draft=ref({}),initial=ref(''),failure=ref(''),busy=ref(false)
const empty=()=>({flight:'',orderReference:'',images:[],remark:''}),dirty=computed(()=>editing.value&&JSON.stringify(draft.value)!==initial.value)
function edit(row){draft.value=row?JSON.parse(JSON.stringify({flight:row.flight,orderReference:row.sourceReference,images:row.images,remark:row.remark,revision:row.revision})):empty();initial.value=JSON.stringify(draft.value);failure.value='';editing.value=true}
async function leave(){if(busy.value){ElMessage.warning('图片正在读取，请稍候');return false}if(!dirty.value)return true;try{await ElMessageBox.confirm('放弃尚未提交的板纸修改？','放弃修改',{confirmButtonText:'放弃修改',cancelButtonText:'继续编辑'});return true}catch{return false}}
async function cancel(){if(await leave()){editing.value=false;failure.value=''}}
function save(){if(busy.value)return;try{saveStationPaper(draft.value,selected.value?.id);editing.value=false;ElMessage.success('板纸已修改，已记录本地通知')}catch(error){failure.value=error.message}}
function open(row){router.push({query:{tab:'papers',paper:row.id}})}
onBeforeRouteLeave(leave);onBeforeRouteUpdate(async()=>{if(!await leave())return false;editing.value=false;failure.value=''})
watch(()=>route.query.paper,()=>{editing.value=false;failure.value=''})
const unload=event=>{if(dirty.value||busy.value){event.preventDefault();event.returnValue=''}}
onMounted(()=>window.addEventListener('beforeunload',unload));onBeforeUnmount(()=>window.removeEventListener('beforeunload',unload))
</script>
<template>
  <section>
    <template v-if="!selected&&!editing"><DataTableFrame :rows="rows" :page-size="10"><template #actions><el-button v-if="writable" :icon="Plus" type="primary" @click="edit()">上传板纸</el-button></template><template #default="{rows:pageRows}"><el-table :data="pageRows" aria-label="板纸回执列表"><el-table-column prop="flight" label="航班号" min-width="130"/><el-table-column prop="flightDate" label="显式关联航班日期" min-width="175"/><el-table-column label="图片" width="90"><template #default="{row}">{{row.images.length}} 张</template></el-table-column><el-table-column prop="completedAt" label="首次打板完成时间" min-width="175"/><el-table-column prop="updatedAt" label="更新时间" min-width="175"/><el-table-column prop="revision" label="版本" width="80"/><el-table-column label="操作" width="100" fixed="right"><template #default="{row}"><el-button :icon="View" link type="primary" @click="open(row)">查看</el-button></template></el-table-column></el-table></template></DataTableFrame></template>
    <template v-else>
      <div class="paper-heading"><h2>{{selected?selected.flight+' · '+selected.flightDate:'上传板纸'}}</h2><el-button v-if="selected&&!editing&&writable" :icon="Edit" @click="edit(selected)">修改板纸</el-button><el-button v-if="!editing" @click="router.push({query:{tab:'papers'}})">返回板纸列表</el-button></div>
      <el-alert v-if="failure" :title="failure" type="error" :closable="false"/>
      <el-form v-if="editing" label-position="top" @submit.prevent="save">
        <el-alert v-if="!selected" title="首次上传的扫码入口、订单关联与航班批次口径待确认（119、172）；当前输入不会生成完成回执。" type="warning" :closable="false"/>
        <div class="paper-fields"><el-form-item label="航班号" required><el-input v-model="draft.flight" :readonly="Boolean(selected)" aria-label="板纸航班号"/></el-form-item><el-form-item label="扫码单号 / 订单关联"><el-input v-model="draft.orderReference" :readonly="Boolean(selected)" aria-label="板纸订单关联"/></el-form-item></div>
        <el-form-item label="板纸图片" required><GroundImagesField v-model="draft.images" label="板纸图片文件" camera limit-exclusive :validate="stationPaperImagesError" @busy="busy=$event"/></el-form-item>
        <el-form-item label="备注"><el-input v-model="draft.remark" type="textarea" aria-label="板纸备注"/></el-form-item>
        <div class="paper-actions"><el-button :disabled="busy" @click="cancel">取消</el-button><el-button type="primary" :loading="busy" :disabled="!writable||!draft.flight||Boolean(stationPaperImagesError(draft.images))" @click="save">{{selected?'提交修改':'提交板纸'}}</el-button></div>
      </el-form>
      <template v-else><p>订单关联：{{selected.orderIds.map(id=>state.stationOrders.find(row=>row.id===id)?.orderNo||id).join('；')}}</p><GroundImagesField :model-value="selected.images" readonly/><p>{{selected.remark}}</p><el-table :data="selected.history" aria-label="板纸修改记录"><el-table-column prop="event" label="事件" min-width="180"/><el-table-column prop="remark" label="备注" min-width="220"/><el-table-column prop="actor" label="操作人" min-width="180"/><el-table-column prop="time" label="时间" min-width="175"/></el-table></template>
    </template>
  </section>
</template>
<style scoped>.paper-heading{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:16px 0}h2{font-size:18px;overflow-wrap:anywhere}.paper-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-top:20px}.paper-actions{display:flex;justify-content:flex-end;gap:8px;margin:20px 0}p{overflow-wrap:anywhere}@media(max-width:700px){.paper-fields{grid-template-columns:minmax(0,1fr)}}</style>
