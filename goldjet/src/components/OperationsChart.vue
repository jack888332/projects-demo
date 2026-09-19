<script setup>
import {ref,onMounted,onBeforeUnmount,watch} from 'vue'
import * as echarts from 'echarts/core'
import {BarChart} from 'echarts/charts'
import {GridComponent,TooltipComponent,AriaComponent} from 'echarts/components'
import {CanvasRenderer} from 'echarts/renderers'
echarts.use([BarChart,GridComponent,TooltipComponent,AriaComponent,CanvasRenderer])
const props=defineProps({rows:{type:Array,required:true},label:{type:String,required:true}}),root=ref(null)
let chart,observer
function render(){if(!chart)return;chart.setOption({animation:false,aria:{enabled:true},grid:{left:100,right:30,top:15,bottom:40},tooltip:{trigger:'axis',axisPointer:{type:'shadow'},valueFormatter:value=>`${Number(value).toLocaleString('zh-CN',{maximumFractionDigits:2})} kg`},xAxis:{type:'value',name:'kg',nameLocation:'end',splitLine:{lineStyle:{color:'#e9edef'}}},yAxis:{type:'category',inverse:true,data:props.rows.map(row=>row.airline),axisLabel:{color:'#475259',width:85,overflow:'truncate'}},series:[{name:'出货量',type:'bar',barMaxWidth:28,data:props.rows.map((row,i)=>({value:row.weight,itemStyle:{color:['#258b91','#4b72ba','#bd8a25','#8b7498'][i%4]}}))}]},{notMerge:true})}
onMounted(()=>{chart=echarts.init(root.value);observer=new ResizeObserver(()=>chart?.resize());observer.observe(root.value);render()})
watch(()=>props.rows,render,{deep:true});onBeforeUnmount(()=>{observer?.disconnect();chart?.dispose()})
</script>
<template><div ref="root" class="operations-chart" role="img" :aria-label="label"/></template>
<style scoped>.operations-chart{height:320px;width:100%;min-width:0}</style>
