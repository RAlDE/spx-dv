const {strict: a} = require('node:assert');
const {readFileSync: read} = require('node:fs');
const {execFileSync} = require('node:child_process');
const vm = require('node:vm');
const modulePath = 'modules/assistente-de-devolucoes/assistente.js';
const gsPath = 'apps-script/recebimento-onhold-dados.gs';
const source = (file, base) => base ? execFileSync('git',['show','0f98204:'+file],{encoding:'utf8'}) : read(file,'utf8');
const br = 'BR123456789012X', br2 = 'BR123456789013X';
const sec = Math.floor(Date.now()/1000), old = sec - 500, recent = sec - 100, future = sec + 60;
const key = br + '|' + old;
const date = '2026-11-11';
const silent = {warn(){},error(){}};
function storage() {
  const data = new Map();
  return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
}
function makeServer(base) {
  const props = new Map();
  const ctx = vm.createContext({console:silent,Utilities:{formatDate:()=>date},
    SpreadsheetApp:{openById:()=>ctx.ss,flush(){}},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v)})}});
  vm.runInContext(source(gsPath,base),ctx);
  return ctx;
}
function checkFilters(s) {
  class El {
    constructor(attrs={}){this.attrs=attrs;this.options=[];this.value='';this.textContent='';}
    set innerHTML(_){this.options=[];this.value='';}
    get selectedIndex(){return this.options.findIndex(el=>el.value===this.value);}
    appendChild(el){this.options.push(el);}
    setAttribute(k,v){this.attrs[k]=v;}
    getAttribute(k){return this.attrs[k];}
  }
  const today=date, yesterday='2026-11-10';
  const e=Object.fromEntries(['dayFilter','operator','generalSearch','operatorCount','filterInfo','empty','actionStatus'].map(k=>[k,new El()]));
  const selects=Array.from({length:10},(_,i)=>new El({'data-col':String(i)}));
  const rows=Array.from({length:1200},(_,i)=>Object.assign(new El({'data-day':i===1199?yesterday:today,'data-status':i===0?'confirmed':'captured'}),{
    cells:['data',String(i),i<5?'Grupo único':'Outro','','','',i<4?'Centro':i===4?'':'Sul','',i<5?'ana':'bruno',''].map(textContent=>({textContent}))
  }));
  const document={getElementById:id=>e[id]||null,createElement:()=>new El(),
    querySelectorAll:k=>({'#rows tr':rows,'.column-filter':selects}[k]||[])};
  const html=s.dashboardHtml_({ok:true,today,records:[]});
  const script=html.split('<script>')[1].split('</script>')[0];
  new vm.Script(script);
  const tail=script.indexOf("  try{\n    var operator=byId('operator');");
  a.ok(tail>0);
  const client=vm.createContext({document});
  vm.runInContext(script.slice(0,tail)+"globalThis.run=applyFilters;globalThis.hide=()=>{hideConfirmed=true;applyFilters();};})();",client);
  const opt=i=>selects[i].options.map(el=>el.textContent);
  e.dayFilter.value=today;
  client.run();
  selects[2].value='grupo unico';client.run();
  a.match(e.filterInfo.textContent,/Mostrando 5 de 1199/);
  a.deepEqual(opt(6),['Todos','(Vazio) (1)','Centro (4)']);
  a.deepEqual(e.operator.options.map(el=>el.value),['','ana']);
  selects[6].value='__spxdv_vazio__';client.run();
  a.match(e.filterInfo.textContent,/Mostrando 1 de 1199/);
  e.generalSearch.value='sem resultado';client.run();
  a.deepEqual(opt(6),['Todos','(Vazio) (0)']);
  a.equal(selects[6].value,'__spxdv_vazio__');
  e.generalSearch.value='';selects[6].value='';client.hide();
  a.match(e.filterInfo.textContent,/Mostrando 4 de 1199/);
  selects[2].value='';e.dayFilter.value=yesterday;client.run();
  a.match(e.filterInfo.textContent,/Mostrando 1 de 1/);
  a.equal(e.actionStatus.textContent,'');
}
checkFilters(makeServer(false)); console.log("Filtros: 1200 linhas, encadeamento, vazio, data e ocultos OK");
(async () => {
  const payload = {retcode:0,data:{order_list:[{shipment_id:br,receive_time:sec}],tracking_list:Array.from({length:100},(_,i)=>({status:i,timestamp:sec+i}))}};
  const events=[], timers=new Map();let clock=0;
  class XHR {open(){} send(){} addEventListener(name,fn){this.listener=fn;}}
  const window={fetch:async()=>({status:200,clone:()=>({text:async()=>JSON.stringify(payload)})}),addEventListener(){},dispatchEvent:e=>events.push(e)};
  const ctx=vm.createContext({window,location:{href:'https://spx.shopee.com.br/',origin:'https://spx.shopee.com.br'},localStorage:storage(),URL,URLSearchParams,Blob,XMLHttpRequest:XHR,CustomEvent:class{constructor(name,value){this.name=name;this.detail=value.detail;}},setTimeout:fn=>{timers.set(++clock,fn);return clock;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(read('modules/assistente-de-devolucoes/receive-hook.js','utf8'),ctx);
  await window.fetch('/api/in-station/admin/common_site/eha/no_reason_inbound',{method:'POST',body:JSON.stringify({shipment_id:br})});
  await new Promise(resolve=>setImmediate(resolve));
  a.equal(events.length,0);a.equal(window.__SPX_DV_SCAN_SNAPSHOT__().entries.length,1);
  a.equal(window.__SPX_DV_SCAN_SNAPSHOT__().entries[0].response.data.tracking_list.length,100);
  await window.fetch('/api/in-station/uni_receive/order',{method:'POST',body:'{}'});
  await new Promise(resolve=>setImmediate(resolve));a.equal(events.length,1);
  const xhr=new XHR();xhr.open('GET','/api/fleet_order/order/detail/tracking_info?shipment_id='+br);xhr.send();xhr.status=200;xhr.responseText=JSON.stringify(payload);xhr.listener();
  a.equal(window.__SPX_DV_SCAN_SNAPSHOT__().entries.length,3);
  for(let i=0;i<45;i++)await window.fetch('/api/fleet_order/order/detail/tracking_info?shipment_id='+br);
  await new Promise(resolve=>setImmediate(resolve));
  a.equal(window.__SPX_DV_SCAN_SNAPSHOT__().entries.length,40);a.equal(window.__SPX_DV_SCAN_SNAPSHOT__().dropped,8);
  await window.fetch('https://example.com/api/in-station/uni_receive/order',{method:'POST'});
  await new Promise(resolve=>setImmediate(resolve));a.equal(events.length,1);
  console.log('Diagnóstico: fetch/XHR, rastreio completo, limite e isolamento da captura OK');
})().catch(error=>{console.error(error);process.exitCode=1;});
