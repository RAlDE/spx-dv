const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('modules/assistente-de-devolucoes/assistente.js','utf8');
const names=['normalize','collectTrackingNodes','parseReturnTimestamp','returnEventTimestamp','trackingStatusText','primitiveEntries','trackingEventsChronological','nodeRepresentsLmHubReceived','latestLmHubReceivedAfterOccurrence','selectReceivedOccurrence','receivedReturnAttempts'];
function load(s){let code='';for(const n of names){const a=s.indexOf('  function '+n+'('),b=s.indexOf('\n  function ',a+5);assert.ok(a>=0&&b>a);code+=s.slice(a,b)+'\n';}const c=vm.createContext({});vm.runInContext(code,c);return c;}
const c=load(source);
const event={timestamp:1794854834,status:10,message:'Pedido em devolução',station_name:'LM Hub_SC_Itajaí_Espinheiros',tags:['Single']};
assert.equal(c.nodeRepresentsLmHubReceived(event),true);
for(const delta of [{station_name:'SoC_SC_Itajaí'},{tags:[]},{message:'Pedido em devolução ao vendedor'},{status:124}])assert.equal(c.nodeRepresentsLmHubReceived({...event,...delta}),false);
const tracking={data:{tracking_list:[{timestamp:1,children:[event]}]}};
assert.equal(c.latestLmHubReceivedAfterOccurrence(tracking,1794829781),1794854834);
assert.equal(c.latestLmHubReceivedAfterOccurrence(tracking,1794854835),0);
assert.equal(c.nodeRepresentsLmHubReceived({status:1,message:'Pedido chegou ao Last Mile Hub para entrega'}),true);
// Optional private real fixtures supplied on CLI; raw files are never committed.
for(const path of process.argv.slice(2)){
 const report=JSON.parse(fs.readFileSync(path));const br=report.selected_br;
 const entries=report.network.entries.filter(e=>e.path.includes('tracking_info')&&e.path.includes(br));assert.ok(entries.length);
 const expected=br==='BR265562365941M'?[1794829781,1794854834]:br==='BR266809938082M'?[1794669028,1794730494]:[1794502805,1794524832];
 for(const e of entries)assert.equal(c.latestLmHubReceivedAfterOccurrence(e.response,expected[0]),expected[1]);
 console.log('Fixture real validada:',br,entries.length,'respostas');
}
assert.equal(c.selectReceivedOccurrence([{ctime:100},{ctime:300}],200000).ctime,100);
assert.equal(c.selectReceivedOccurrence([{ctime:100},{ctime:300}],400000,100).ctime,100);
assert.equal(c.selectReceivedOccurrence([{ctime:100}],400000,200),null);
assert.equal(c.receivedReturnAttempts([{ctime:1794829781},{ctime:1794854835}],tracking).length,1);
console.log('OK: Return real, fluxo normal, período e falsos positivos.');
