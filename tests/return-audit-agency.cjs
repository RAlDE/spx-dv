const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('modules/assistente-de-devolucoes/assistente.js','utf8');
const start=source.indexOf('  const returnAuditCache ='),end=source.indexOf('  async function enrichReturnOccurrencesFromTracking(',start);
const br='BR262413570263G';
const old={validation_task_id:'VT202611160NJBG',create_time:1794813382};
const future={validation_task_id:'VT202611170NMF4',create_time:1794925316};
const attempt={ctime:1794833117,return_operator_id:'126922',return_occurrence:true,on_hold_reason__desc:'Endereço não encontrado'};
function setup({tasks=[future,old],driver='126922',agency='SPXOWNFLEET',targetTime=1794827391,total,exact=true,fail=false,conflict=false}={}){
 const calls=[],events=[];
 const c=vm.createContext({Map,Set,Date,URLSearchParams,currentRequest:1,receiveDiagPush:(...x)=>events.push(x),
 enrichReturnOccurrencesFromTracking:async a=>a,
 fetchAssignmentAgency:async id=>({assignmentId:id,exactAssignmentId:exact,driverId:driver,agency:conflict&&id==='ATSECOND1'?'OTHER':agency,agencyId:'96',mainNeighborhood:'Do not copy'}),
 fetchJson:async url=>{calls.push(url);if(fail)throw Error('offline');const u=new URL(url);assert.equal(u.searchParams.get('shipment_id'),br);if(u.pathname.endsWith('task/list'))return {retcode:0,data:{total:total??tasks.length,list:tasks}};
 assert.equal(u.searchParams.get('task_id'),old.validation_task_id);return {retcode:0,data:{total:conflict?2:1,list:[{target_id:'AT20261116CX392',validation_end_time:targetTime},...(conflict?[{target_id:'ATSECOND1',validation_end_time:targetTime}]:[])]}};}});
 vm.runInContext(source.slice(start,end),c);return {c,calls,events};
}
(async()=>{
 let x=setup();let r=await x.c.enrichReturnOccurrencesWithAssignmentAgency([attempt],{data:{shipment_id:br}},1);
 assert.equal(r[0].assignment_agency,'SPXOWNFLEET');assert.equal(r[0].return_operator_id,'126922');assert.equal(r[0].ctime,attempt.ctime);assert.equal(r[0].assignment_main_neighborhood,undefined);assert.equal(x.calls.length,2);
 await x.c.enrichReturnOccurrencesWithAssignmentAgency([attempt],{data:{shipment_id:br}},1);assert.equal(x.calls.length,2,'cache shares BR/VT requests');
 for(const options of [{driver:'456987'},{targetTime:1794934104},{tasks:[]},{exact:false},{fail:true},{conflict:true}]){
 x=setup(options);r=await x.c.enrichReturnOccurrencesWithAssignmentAgency([attempt],{data:{shipment_id:br}},1);assert.equal(r[0].assignment_agency,undefined);
 }
 x=setup({total:999});r=await x.c.enrichReturnOccurrencesWithAssignmentAgency([attempt],{data:{shipment_id:br}},1);assert.equal(r[0].assignment_agency,undefined);assert.equal(x.calls.length,5);
 x=setup({fail:true});await assert.rejects(x.c.fetchReturnAuditTasks(br));await assert.rejects(x.c.fetchReturnAuditTasks(br));assert.equal(x.calls.length,2,'failed cache is removed');
 x=setup();r=await x.c.enrichReturnOccurrencesWithAssignmentAgency([attempt],{data:{shipment_id:br}},2);assert.equal(x.calls.length,0,'stale preview makes no audit requests');
 console.log('OK: audit BR/VT/AT, exact driver, future excluded, no neighborhood overwrite, bounded pagination, failures, cache, stale preview');
})().catch(e=>{console.error(e);process.exitCode=1});
