(() => {
  'use strict';
  if (location.hostname !== 'spx.shopee.com.br') { alert('Execute na página do SPX.'); return; }
  if (window.SPX_AT_SCAN) { alert('A varredura já está ativa nesta aba.'); return; }
  const br = String(prompt('BR Return que será investigado:', '') || '').trim().toUpperCase();
  if (!/^BR[A-Z0-9]{8,}$/.test(br)) return;
  const report = {schema:1, selected_br:br, started_at:new Date().toISOString(),
    note:'Candidatos observados; estar na mesma página não comprova vínculo ao BR. Campos de configuração também podem aparecer.',
    requests:[], page:[], dropped:0, limits:{entries:150,response_characters:3000000,visited_fields:60000,hits_per_response:500}};
  let active=true, sequence=0;
  const sensitive=/password|passwd|token|secret|cookie|authorization|credential|session|signature|signed_url/i;
  const relevant=/assignment|(^|_)at(_|$)|return.?task|agency|3pl|carrier|transportadora|fleet|driver|shipment|tracking.?number|order.?id/i;
  const ids=/\b(?:AT[0-9A-Z]{7,}|BR[0-9A-Z]{8,})\b/gi;
  function fields(value) {
    const hits=[];let visited=0,limited=false;
    function walk(v,path,depth){
      if (++visited>60000 || depth>25 || hits.length>=500){limited=true;return;}
      if(v && typeof v==='object'){
        for(const [key,child] of Object.entries(v)){
          if(sensitive.test(key))continue;
          if(visited>60000||hits.length>=500){limited=true;break;}
          walk(child,path+'.'+key,depth+1);
        }
      } else if(v!==null && v!==undefined){
        const str=String(v),found=str.match(ids)||[];
        if(relevant.test(path))hits.push({path,value:str.slice(0,350),truncated:str.length>350});
        else if(found.length)hits.push({path,ids:[...new Set(found)].slice(0,30)});
      }
    }
    walk(value,'$',0);return {hits,limited};
  }
  function endpoint(input){
    try{const u=new URL(typeof input==='string'?input:input.url,location.href);
      return u.origin===location.origin&&!/login|auth|password|token/i.test(u.pathname)?u:null;
    }catch{return null;}
  }
  function bodyFields(body){
    if(typeof body!=='string')return {hits:[],note:'Corpo não textual não inspecionado'};
    try{return fields(JSON.parse(body));}catch{return fields(Object.fromEntries(new URLSearchParams(body)));}
  }
  function record(meta,value,status,note=''){
    if(!active)return;
    const data=value===null?{hits:[],limited:false}:fields(value);
    report.requests.push({...meta,response_at:new Date().toISOString(),http_status:status,
      response_fields:data.hits,limited:data.limited,note});
    if(report.requests.length>150){report.requests.shift();report.dropped++;}
    update();
  }
  function meta(u,method,body){return {id:++sequence,started_at:new Date().toISOString(),
    endpoint:u.pathname,method:String(method||'GET').toUpperCase(),query_fields:fields(Object.fromEntries(u.searchParams)),request_fields:bodyFields(body)};}
  const originalFetch=window.fetch;
  function fetchWrapper(input,init={}){
    const u=endpoint(input),m=u?meta(u,init.method||input?.method,init.body):null;
    const promise=originalFetch.apply(this,arguments);
    if(m)promise.then(async response=>{
      try{
        if(!/json/i.test(response.headers.get('content-type')||'')){record(m,null,response.status,'Resposta não JSON');return;}
        if(Number(response.headers.get('content-length'))>3000000){record(m,null,response.status,'Resposta acima do limite');return;}
        const text=await response.clone().text();
        if(text.length>3000000){record(m,null,response.status,'Resposta acima do limite');return;}
        record(m,JSON.parse(text),response.status);
      }catch{record(m,null,response.status,'Não foi possível ler JSON');}
    },()=>record(m,null,0,'Falha de rede'));
    return promise;
  }
  window.fetch=fetchWrapper;
  const originalOpen=XMLHttpRequest.prototype.open,originalSend=XMLHttpRequest.prototype.send;
  const requestMeta=new WeakMap();
  function openWrapper(method,url){requestMeta.set(this,{method,url});return originalOpen.apply(this,arguments);}
  function sendWrapper(body){
    const info=requestMeta.get(this),u=info&&endpoint(info.url);
    if(u){const m=meta(u,info.method,body);this.addEventListener('load',function(){
      try{
        if(this.responseType==='json')record(m,this.response,this.status);
        else if(!this.responseType||this.responseType==='text'){
          const text=this.responseText||'';
          if(text.length>3000000)record(m,null,this.status,'Resposta acima do limite');
          else{try{record(m,JSON.parse(text),this.status);}catch{record(m,null,this.status,'Resposta não JSON');}}
        }else record(m,null,this.status,'Tipo de resposta não inspecionado');
      }catch{record(m,null,this.status,'Não foi possível ler resposta');}
    },{once:true});}
    return originalSend.apply(this,arguments);
  }
  XMLHttpRequest.prototype.open=openWrapper;XMLHttpRequest.prototype.send=sendWrapper;
  const box=document.createElement('div');box.id='spx-at-scan-box';
  box.style.cssText='position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#171717;color:white;border:2px solid #f97316;border-radius:10px;padding:12px;max-width:360px;font:13px Arial;box-shadow:0 3px 18px #000';
  const title=document.createElement('strong');title.textContent='Varredura AT · '+br;box.appendChild(title);
  const status=document.createElement('p');box.appendChild(status);
  function update(){status.textContent=(active?'Observando':'Parado')+' · '+report.requests.length+' respostas · '+report.requests.filter(x=>x.response_fields.length).length+' com campos candidatos';}
  function pageScan(){
    const found=[];
    const nodes=document.querySelectorAll('input,textarea,select,[data-at-id],[data-assignment-task-id],td,th,label,[role="cell"],script[type="application/json"]');
    for(let i=0;i<Math.min(nodes.length,15000);i++){
      const node=nodes[i];if(box.contains(node)||node.type==='password')continue;
      const name=[node.id,node.getAttribute('name')].filter(Boolean).join(' ');if(sensitive.test(name))continue;
      const locationHint={tag:node.tagName,id:node.id||'',name:node.getAttribute('name')||'',index:i,hidden:node.getClientRects().length===0};
      if(node.matches('script[type="application/json"]')){
        try{if(node.textContent.length<=3000000){const data=fields(JSON.parse(node.textContent));if(data.hits.length)found.push({...locationHint,...data});}}catch{}
      }else{
        const text=String(node.value??node.textContent??'').trim();const matches=text.match(ids)||[];
        const attrs={};for(const attr of node.attributes)if(/^data-/.test(attr.name)&&!sensitive.test(attr.name)&&relevant.test(attr.name))attrs[attr.name]=attr.value;
        if(matches.length||relevant.test(name)||Object.keys(attrs).length)found.push({...locationHint,ids:[...new Set(matches)],attributes:attrs,...(relevant.test(name)?{value:text.slice(0,350)}:{})});
      }
      if(found.length>=500)break;
    }
    report.page=found;report.page_scanned_at=new Date().toISOString();report.page_node_limit_reached=nodes.length>15000;
    update();return found;
  }
  function download(){
    pageScan();report.exported_at=new Date().toISOString();
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='SPX-AT-'+br+'-'+Date.now()+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
  function stop(){active=false;if(window.fetch===fetchWrapper)window.fetch=originalFetch;
    if(XMLHttpRequest.prototype.open===openWrapper)XMLHttpRequest.prototype.open=originalOpen;
    if(XMLHttpRequest.prototype.send===sendWrapper)XMLHttpRequest.prototype.send=originalSend;update();}
  for(const [label,action] of [['Examinar página',pageScan],['Baixar varredura',download],['Parar',stop]]){
    const b=document.createElement('button');b.textContent=label;b.style.cssText='margin:3px;padding:7px;cursor:pointer';b.onclick=action;box.appendChild(b);
  }
  document.body.appendChild(box);window.SPX_AT_SCAN={download,pageScan,stop,report};update();pageScan();
  console.info('Varredura AT ativa. Abra os detalhes e abas do BR nesta mesma aba. Não recarregue antes de baixar. Nenhuma consulta adicional será feita.');
})();
