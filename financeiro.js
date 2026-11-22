/* =====================================================================
   SANTEX — módulos financeiros (substitui a planilha "Gestão Financeira")
   Painel · Serviços · Despesas · Sócios · Relatório
   Dados no Firestore: servicos, despesas_servico, despesas_gerais, retiradas
   ===================================================================== */
(function(){
"use strict";

/* ---------- listas ---------- */
const TIPOS_SERVICO=["Levantamento planialtimétrico","Levantamento planimétrico","Levantamento altimétrico / nivelamento","Levantamento cadastral","Levantamento GNSS / RTK","Coleta de pontos de controle (GCP) com RTK","Locação de pontos / estacas com RTK","Rastreio GNSS estático / transporte de coordenadas","Pós-processamento GNSS (IBGE-PPP)","Implantação de marcos geodésicos","Aerolevantamento com drone (fotogrametria)","Ortofoto / ortomosaico","Modelo digital de terreno (MDT)","Modelo digital de superfície (MDS)","Nuvem de pontos","Modelo 3D / malha texturizada","Curvas de nível","Inspeção visual com drone","Georreferenciamento de imóvel","Georreferenciamento rural (INCRA/SIGEF)","Regularização fundiária (REURB)","Usucapião (planta e memorial descritivo)","Desmembramento / unificação de imóvel","Retificação de área","Demarcação de divisas","Loteamento","CAR (Cadastro Ambiental Rural)","Locação de obra","As-built","Cálculo de volume / terraplenagem","Topografia para projeto de estradas","Monitoramento de recalque / deformação","Batimetria","Desenho técnico / planta topográfica (AutoCAD)","Memorial descritivo","Perfis longitudinais e seções transversais","Processamento fotogramétrico (Metashape)","Mapas temáticos (QGIS)","Análise geoespacial / SIG (QGIS)","Vetorização de imagens e mapas","Peças técnicas para SIGEF","Conversão de arquivos (DWG, SHP, KML)","Laudo técnico / perícia","Outros"];
const CAT_DESP_SERV=["Combustível","ART","TRT","Alimentação","Hospedagem","Pedágio","Ajudante / mão de obra","Aluguel de equipamento","Material (piquetes, marcos, tinta)","Impressão / plotagem","Cartório / taxas","Processamento terceirizado","Outros"];
const CAT_DESP_GER=["Equipamento","Combustível","Software","Escritório","Impostos e taxas","Manutenção","Outros"];
const PAGAMENTOS=["Cartão de crédito","Boleto","À vista / Pix"];
const UFS=["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const MESES=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MAP_CATALOGO={georef:"Georreferenciamento rural (INCRA/SIGEF)",plani_rural:"Levantamento planialtimétrico",plani_urb:"Levantamento planialtimétrico",planimetrico:"Levantamento planimétrico",drone:"Aerolevantamento com drone (fotogrametria)",reurb_rural:"Usucapião (planta e memorial descritivo)",reurb_urb:"Regularização fundiária (REURB)",desmemb:"Desmembramento / unificação de imóvel",car:"CAR (Cadastro Ambiental Rural)",locacao:"Locação de obra",mapas:"Mapas temáticos (QGIS)"};

const COLS={servicos:"servicos",despServ:"despesas_servico",despGer:"despesas_gerais",retiradas:"retiradas"};
const FIN={servicos:[],despServ:[],despGer:[],retiradas:[],pronto:false};
let fsRef=null, unsubs=[];

/* ---------- datas ---------- */
const hojeStr=()=>{ const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const ymd=(y,m,d)=>{ const dt=new Date(y,m,1); const last=new Date(dt.getFullYear(),dt.getMonth()+1,0).getDate(); return dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0")+"-"+String(Math.min(d,last)).padStart(2,"0"); };
const fimMes=(y,m)=>{ const dt=new Date(y,m+1,0); return dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0")+"-"+String(dt.getDate()).padStart(2,"0"); };
const parts=s=>{ const [y,m,d]=String(s||"").split("-").map(Number); return {y,m:m-1,d}; };
const addMonths=(s,n)=>{ const p=parts(s); return ymd(p.y,p.m+n,p.d); };
const monthsDiff=(a,b)=>{ const A=parts(a),B=parts(b); return (B.y-A.y)*12+(B.m-A.m); };
const daysBetween=(a,b)=>Math.round((Date.UTC(parts(b).y,parts(b).m,parts(b).d)-Date.UTC(parts(a).y,parts(a).m,parts(a).d))/864e5);
const fmtD=s=>{ if(!s) return "—"; const p=parts(s); return String(p.d).padStart(2,"0")+"/"+String(p.m+1).padStart(2,"0")+"/"+p.y; };
const mesAno=s=>{ const p=parts(s); return MESES[p.m].slice(0,3).toLowerCase()+"/"+String(p.y).slice(2); };
const inPeriod=(s,ini,fim)=>s&&s>=ini&&s<=fim;
const R=v=>brl(v||0);

/* ---------- configuração ---------- */
function fcfg(){ const f=(cfg&&cfg.financeiro)||{}; return {fechamento:nz(f.fechamento)||31, vencimento:nz(f.vencimento)||7, socios:(f.socios&&f.socios.length?f.socios:[{nome:"Clessiano Antunes",pct:50},{nome:"João Veríssimo",pct:50}])}; }

/* ---------- cálculos (mesma lógica da planilha) ---------- */
function calcServico(s){
  const recebido=(s.recebimentos||[]).reduce((a,r)=>a+nz(r.valor),0);
  const despesas=FIN.despServ.filter(d=>d.servicoId===s.id).reduce((a,d)=>a+nz(d.valor),0);
  const valor=s.cancelado?0:nz(s.valor);
  const situacao = s.cancelado ? "Cancelado" : recebido>=valor && valor>0 ? "Quitado" : recebido>0 ? "Pago parcialmente" : "Em aberto";
  return {recebido, aReceber:s.cancelado?0:Math.max(valor-recebido,0), despesas, lucro:valor-despesas, situacao, valor};
}
function primeiroVenc(g){
  if(g.pagamento!=="Cartão de crédito") return g.dataCompra;
  const f=fcfg(), p=parts(g.dataCompra);
  return ymd(p.y, p.m+1+(p.d>f.fechamento?1:0), f.vencimento);
}
function calcGeral(g, hoje){
  hoje=hoje||hojeStr();
  const np=Math.max(1,Math.round(nz(g.parcelas)||1)), pg=Math.max(0,Math.round(nz(g.pagas)));
  const v1=primeiroVenc(g), prox= pg>=np ? null : addMonths(v1,pg);
  const falta=nz(g.valorParcela)*Math.max(np-pg,0), total=nz(g.valorParcela)*np;
  const status = pg>=np ? "Quitado" : prox<hoje ? "Vencido" : daysBetween(hoje,prox)<=7 ? "Vence em até 7 dias" : "A vencer";
  // parcelas que já venceram até hoje (planilha: diferença de meses + 1 se o dia já passou)
  const dt=monthsDiff(v1,hoje)+(parts(hoje).d>parts(v1).d?1:0); const c=Math.min(Math.max(dt,0),np);
  const atrasadas=Math.max(c-pg,0);
  const kMes=Math.min(Math.max(monthsDiff(v1,hoje)+1,0),np); // parcelas até este mês
  return {np,pg,v1,prox,falta,total,status,atrasadas,valorAtraso:atrasadas*nz(g.valorParcela),ateEsteMes:kMes*nz(g.valorParcela)};
}
function parcelasNoPeriodo(g,ini,fim){ // quantas parcelas vencem entre ini e fim
  const np=Math.max(1,Math.round(nz(g.parcelas)||1)), v1=primeiroVenc(g); let n=0;
  for(let k=0;k<np;k++){ const d=addMonths(v1,k); if(d>fim) break; if(d>=ini) n++; } return n;
}
function resumo(hoje){
  hoje=hoje||hojeStr();
  const sv=FIN.servicos.map(s=>Object.assign({s},calcServico(s)));
  const faturado=sv.reduce((a,x)=>a+x.valor,0), recebido=sv.reduce((a,x)=>a+x.recebido,0);
  const despServ=FIN.despServ.reduce((a,d)=>a+nz(d.valor),0);
  const gs=FIN.despGer.map(g=>Object.assign({g},calcGeral(g,hoje)));
  const despAteMes=despServ+gs.reduce((a,x)=>a+x.ateEsteMes,0);
  const lucroReal=recebido-despAteMes, lucroPrev=faturado-despAteMes;
  const contasAbertas=gs.reduce((a,x)=>a+x.falta,0), vencidas=gs.reduce((a,x)=>a+x.valorAtraso,0);
  const vence7=gs.filter(x=>x.prox&&x.prox>=hoje&&daysBetween(hoje,x.prox)<=7).reduce((a,x)=>a+nz(x.g.valorParcela),0);
  const vence30=gs.filter(x=>x.prox&&x.prox>=hoje&&daysBetween(hoje,x.prox)<=30).reduce((a,x)=>a+nz(x.g.valorParcela),0);
  const f=fcfg();
  const socios=f.socios.map(so=>{ const direito=lucroReal*nz(so.pct)/100; const ret=FIN.retiradas.filter(r=>r.socio===so.nome).reduce((a,r)=>a+nz(r.valor),0); const saldo=Math.abs(direito-ret)<0.01?0:direito-ret; return {nome:so.nome,pct:nz(so.pct),direito,ret,saldo}; });
  return {sv,gs,faturado,recebido,aReceber:faturado-recebido,despServ,despAteMes,lucroReal,lucroPrev,contasAbertas,vencidas,vence7,vence30,margem:recebido?lucroReal/recebido:0,socios};
}
function mesAMes(){
  const datas=FIN.servicos.map(s=>s.data).concat(FIN.despServ.map(d=>d.data)).filter(Boolean).sort();
  const ini = datas.length ? datas[0].slice(0,8)+"01" : hojeStr().slice(0,8)+"01";
  const fimLista = addMonths(hojeStr().slice(0,8)+"01", 12);
  const out=[]; const f=fcfg();
  for(let m=ini; m<=fimLista; m=addMonths(m,1)){
    const fim=fimMes(parts(m).y,parts(m).m);
    const sv=FIN.servicos.filter(s=>!s.cancelado&&inPeriod(s.data,m,fim));
    const faturado=sv.reduce((a,s)=>a+nz(s.valor),0);
    const recebido=FIN.servicos.reduce((a,s)=>a+(s.recebimentos||[]).filter(r=>inPeriod(r.data,m,fim)).reduce((b,r)=>b+nz(r.valor),0),0);
    const recDosServ=sv.reduce((a,s)=>a+calcServico(s).recebido,0);
    const dServ=FIN.despServ.filter(d=>inPeriod(d.data,m,fim)).reduce((a,d)=>a+nz(d.valor),0);
    const dGer=FIN.despGer.reduce((a,g)=>a+parcelasNoPeriodo(g,m,fim)*nz(g.valorParcela),0);
    const lucro=recebido-dServ-dGer;
    out.push({mes:m,fim,faturado,recebido,aReceber:faturado-recDosServ,dServ,dGer,lucro,partes:f.socios.map(so=>lucro*nz(so.pct)/100)});
  }
  // extrato acumulado
  const acc=f.socios.map(()=>0);
  out.forEach(r=>{ r.extrato=f.socios.map((so,i)=>{ const ret=FIN.retiradas.filter(x=>x.socio===so.nome&&inPeriod(x.data,r.mes,r.fim)).reduce((a,x)=>a+nz(x.valor),0); acc[i]+=r.partes[i]-ret; return {ret,saldo:Math.abs(acc[i])<0.01?0:acc[i]}; }); });
  return out;
}
function proximoCodigo(){ const n=FIN.servicos.map(s=>parseInt(String(s.codigo||"").replace(/\D/g,""))||0); return "S"+String((n.length?Math.max(...n):0)+1).padStart(3,"0"); }

/* ---------- Firestore ---------- */
function col(k){ return fsRef.collection(COLS[k]); }
function salvar(k,obj,id){
  if(!fsRef){ toast("Sem conexão com a nuvem — entre com sua conta"); return null; }
  const ref= id ? col(k).doc(id) : col(k).doc();
  const data=JSON.parse(JSON.stringify(obj)); delete data.id; data.atualizadoEm=new Date().toISOString(); data.por=(fbUser&&fbUser.email)||"";
  ref.set(data).catch(e=>toast("Erro ao salvar ("+(e.code||"erro")+")"));
  return ref.id;
}
function excluir(k,id){ if(!fsRef) return; col(k).doc(id).delete().catch(e=>toast("Erro ao excluir")); }

window.finStart=function(fs){
  fsRef=fs; window.finStop();
  let n=0; const total=4;
  Object.keys(COLS).forEach(k=>{
    unsubs.push(fs.collection(COLS[k]).onSnapshot(sn=>{ FIN[k]=sn.docs.map(d=>Object.assign({id:d.id},d.data())); if(!FIN["_"+k]){ FIN["_"+k]=1; n++; if(n===total){ FIN.pronto=true; migrarPlanilha(); } } finRender(); }, e=>{}));
  });
};
window.finStop=function(){ unsubs.forEach(u=>{ try{u();}catch(e){} }); unsubs=[]; };

/* ---------- migração única dos dados da planilha ---------- */
async function migrarPlanilha(){
  if(!fsRef) return;
  const flag=fsRef.doc("config/migracao_planilha");
  let fazer=false;
  try{ fazer = await fsRef.runTransaction(async t=>{ const s=await t.get(flag); if(s.exists) return false; t.set(flag,{feitoEm:new Date().toISOString(),por:(fbUser&&fbUser.email)||""}); return true; }); }catch(e){ return; }
  if(!fazer) return;
  if(FIN.servicos.length) return;
  const S=[
    {codigo:"S001",data:"2026-10-01",local:"Eunice",cidade:"Pedra Azul",uf:"MG",contratante:"Advogado, amigo de João (nome a confirmar)",tipo:"Georreferenciamento de imóvel",valor:2000,recebimentos:[{data:"2026-10-01",valor:1000,obs:"Lançado da planilha"}],obs:"Realizado em 29/09/2026; lançado em 01/10 para entrar no faturamento de outubro"},
    {codigo:"S002",data:"2026-10-26",local:"Escola Estadual Deputado João de Almeida",cidade:"Pedra Azul",uf:"MG",contratante:"Mariélia Vieira Chaves",tipo:"Levantamento planialtimétrico",valor:1000,recebimentos:[{data:"2026-10-26",valor:1000,obs:"Lançado da planilha"}],obs:""},
    {codigo:"S003",data:"2026-10-26",local:"Escola Estadual Geni Maria de Souza",cidade:"Rio do Prado (distrito de Vila Formosa)",uf:"MG",contratante:"PRECON & CIA - PREMOLDADOS, CONSTRUCOES & CIA LTDA",tipo:"Levantamento planialtimétrico",valor:1000,recebimentos:[{data:"2026-10-26",valor:1000,obs:"Lançado da planilha"}],obs:""},
    {codigo:"S004",data:"2026-10-26",local:"Escola Estadual Tancredo Neves",cidade:"Almenara",uf:"MG",contratante:"Martins Construções e Serviços LTDA",tipo:"Levantamento planialtimétrico",valor:1000,recebimentos:[{data:"2026-10-26",valor:1000,obs:"Lançado da planilha"}],obs:""}];
  const ids={};
  S.forEach(s=>{ ids[s.codigo]=salvar("servicos",Object.assign({criadoEm:new Date().toISOString()},s)); });
  [["S001","Combustível",100],["S002","Combustível",140],["S002","ART",69],["S003","Combustível",140],["S003","ART",69],["S004","Combustível",140],["S004","ART",69]]
    .forEach(([c,d,v])=>salvar("despServ",{data:"2026-10-01",servicoId:ids[c],despesa:d,valor:v,obs:""}));
  [["2026-10-03","RTK (Reach RS2 + RS3)",1221.21,12,"Parcelado em 12x — cada sócio arca com 50%"],["2026-10-08","Bastão 3,10 m",34.75,10,"Parcelado em 10x"],["2026-10-08","Bipé",50.59,10,""],["2026-10-08","Bastão 2,6 m",32.16,10,""]]
    .forEach(([dt,ds,v,np,o])=>salvar("despGer",{dataCompra:dt,descricao:ds,categoria:"Equipamento",pagamento:"Cartão de crédito",valorParcela:v,parcelas:np,pagas:1,obs:o}));
  [["Clessiano Antunes",967.15],["João Veríssimo",967.14]].forEach(([so,v])=>salvar("retiradas",{data:"2026-11-07",socio:so,valor:v,obs:"Retirada total do saldo (lucro até 07/11/2026)"}));
  toast("Dados da planilha financeira importados para o sistema");
}

/* ---------- formulário genérico (modal) ---------- */
function ensureModal(){
  if(document.getElementById("fmodal")) return;
  const d=document.createElement("div"); d.id="fmodal"; d.className="modal";
  d.innerHTML='<div class="box"><h3 style="margin-top:0" id="fmTitle"></h3><div id="fmBody"></div><div class="actions" style="margin-top:12px"><button class="btn" id="fmSave">Salvar</button><button class="btn ghost" id="fmClose">Cancelar</button><button class="btn danger" id="fmDel" style="margin-left:auto;display:none">Excluir</button></div></div>';
  document.body.appendChild(d);
  d.addEventListener("click",e=>{ if(e.target.id==="fmodal") fecharForm(); });
  document.getElementById("fmClose").addEventListener("click",fecharForm);
}
function fecharForm(){ const m=document.getElementById("fmodal"); if(m) m.classList.remove("on"); }
function campo(f,v){
  const val = v==null ? (f.def!=null?f.def:"") : v;
  if(f.type==="select") return `<label>${esc(f.label)}<select data-f="${f.k}">${f.options.map(o=>`<option ${String(o)===String(val)?"selected":""}>${esc(o)}</option>`).join("")}</select></label>`;
  if(f.type==="textarea") return `<label>${esc(f.label)}<textarea data-f="${f.k}">${esc(val)}</textarea></label>`;
  return `<label>${esc(f.label)}${f.hint?`<small>${esc(f.hint)}</small>`:""}<input data-f="${f.k}" type="${f.type||"text"}" ${f.type==="number"?'step="0.01" min="0"':""} value="${esc(val)}" ${f.list?`list="${f.list}"`:""}></label>`;
}
function abrirForm(titulo, campos, obj, onSave, onDel, extraHTML){
  ensureModal();
  document.getElementById("fmTitle").textContent=titulo;
  document.getElementById("fmBody").innerHTML=`<div class="row">${campos.map(f=>campo(f,obj?obj[f.k]:null)).join("")}</div>`+(extraHTML||"");
  const del=document.getElementById("fmDel"); del.style.display=onDel?"inline-block":"none"; del.textContent="Excluir"; delete del.dataset.c;
  del.onclick=()=>{ if(del.dataset.c){ onDel(); fecharForm(); } else { del.dataset.c="1"; del.textContent="Confirmar exclusão?"; setTimeout(()=>{ delete del.dataset.c; del.textContent="Excluir"; },3000); } };
  document.getElementById("fmSave").onclick=()=>{
    const out={}; let ok=true;
    campos.forEach(f=>{ const el=document.querySelector(`#fmBody [data-f="${f.k}"]`); let v=el.value; if(f.type==="number") v=nz(v); if(f.req&&(v===""||v==null||(f.type==="number"&&!(v>0)))){ ok=false; el.style.outline="2px solid var(--danger)"; } out[f.k]=v; });
    if(!ok){ toast("Preencha os campos destacados"); return; }
    if(onSave(out)!==false) fecharForm();
  };
  document.getElementById("fmodal").classList.add("on");
}

/* ---------- renderização ---------- */
const tag=(t,cls)=>`<span class="pill ${cls||""}">${esc(t)}</span>`;
const sitCls=s=>({"Quitado":"","Pago parcialmente":"warn","Em aberto":"warn","Cancelado":"","Vencido":"bad","Vence em até 7 dias":"warn","A vencer":""}[s]||"");
let filtroServ="";

function finRender(){
  if(!document.getElementById("v-painel")) return;
  const off=!fsRef;
  ["painel","servicos","despesas","socios","relatorio"].forEach(t=>{ const v=document.getElementById("fin-"+t); if(v&&off) v.innerHTML='<div class="info warn">Os módulos financeiros precisam da conexão com a nuvem. Entre com sua conta ou aguarde a sincronização.</div>'; });
  if(off) return;
  renderPainel(); renderServicos(); renderDespesas(); renderSocios(); renderRelatorio();
}
window.finRender=finRender;

function renderPainel(){
  const r=resumo(), el=document.getElementById("fin-painel"); if(!el) return;
  const kp=(l,v,cls)=>`<div class="kpi ${cls||""}"><span>${l}</span><b>${v}</b></div>`;
  const venc=r.gs.filter(x=>x.atrasadas>0).sort((a,b)=>(a.prox||"").localeCompare(b.prox||""));
  const prox=r.gs.filter(x=>x.prox&&x.prox>=hojeStr()&&daysBetween(hojeStr(),x.prox)<=30).sort((a,b)=>a.prox.localeCompare(b.prox));
  const areceber=r.sv.filter(x=>x.aReceber>0).sort((a,b)=>(a.s.data||"").localeCompare(b.s.data||""));
  const mm=mesAMes(); const maxV=Math.max(1,...mm.map(m=>Math.max(m.faturado,m.recebido,m.dServ+m.dGer)));
  el.innerHTML=`
  <div class="kgrid">${kp("Faturado",R(r.faturado))}${kp("Recebido",R(r.recebido))}${kp("A receber",R(r.aReceber),r.aReceber>0?"warn":"")}${kp("Despesas até este mês",R(r.despAteMes))}${kp("Lucro realizado",R(r.lucroReal),r.lucroReal<0?"bad":"good")}${kp("Lucro previsto",R(r.lucroPrev))}${kp("Contas a pagar (em aberto)",R(r.contasAbertas))}${kp("Parcelas vencidas",R(r.vencidas),r.vencidas>0?"bad":"")}${kp("Margem de lucro",fmt(r.margem*100,1)+"%")}</div>
  <div class="card"><h2>Alertas e pendências</h2>
    <div class="kgrid" style="margin-bottom:12px">${kp("Contas vencidas",R(r.vencidas),r.vencidas>0?"bad":"")}${kp("Vencem em até 7 dias",R(r.vence7),r.vence7>0?"warn":"")}${kp("Vencem em até 30 dias",R(r.vence30))}${kp("A receber de clientes",R(r.aReceber),r.aReceber>0?"warn":"")}</div>
    <div class="fgrid">
      <div><h3 class="fh">Contas a pagar vencidas</h3>${venc.length?`<table class="ft"><tr><th>Descrição</th><th>Vencimento</th><th>Parcelas</th><th class="n">Valor</th></tr>${venc.map(x=>`<tr><td>${esc(x.g.descricao)}</td><td>${fmtD(x.prox)}</td><td>${x.atrasadas}</td><td class="n">${R(x.valorAtraso)}</td></tr>`).join("")}</table>`:'<p class="hint">Nenhuma conta vencida.</p>'}</div>
      <div><h3 class="fh">Próximos vencimentos (30 dias)</h3>${prox.length?`<table class="ft"><tr><th>Descrição</th><th>Vencimento</th><th class="n">Valor</th><th>Faltam</th></tr>${prox.map(x=>`<tr><td>${esc(x.g.descricao)}</td><td>${fmtD(x.prox)}</td><td class="n">${R(x.g.valorParcela)}</td><td>${daysBetween(hojeStr(),x.prox)} dias</td></tr>`).join("")}</table>`:'<p class="hint">Nenhum vencimento nos próximos 30 dias.</p>'}</div>
      <div><h3 class="fh">A receber de clientes</h3>${areceber.length?`<table class="ft"><tr><th>Cód.</th><th>Contratante</th><th class="n">A receber</th><th>Desde</th></tr>${areceber.map(x=>`<tr class="click" data-sv="${x.s.id}"><td>${esc(x.s.codigo)}</td><td>${esc(x.s.contratante)}</td><td class="n">${R(x.aReceber)}</td><td>${daysBetween(x.s.data,hojeStr())} dias</td></tr>`).join("")}</table>`:'<p class="hint">Nada a receber.</p>'}</div>
    </div></div>
  <div class="card"><h2>Divisão entre sócios (lucro realizado)</h2>
    <table class="ft"><tr><th>Sócio</th><th class="n">Direito</th><th class="n">Já retirado</th><th class="n">Saldo a retirar</th></tr>${r.socios.map(s=>`<tr><td>${esc(s.nome)} (${fmt(s.pct,0)}%)</td><td class="n">${R(s.direito)}</td><td class="n">${R(s.ret)}</td><td class="n"><b class="${s.saldo<0?"neg":""}">${R(s.saldo)}</b></td></tr>`).join("")}</table><br></div>
  <div class="card"><h2>Resultado mês a mês</h2>
    <div class="bars">${mm.filter(m=>m.mes<=hojeStr()||m.faturado||m.dGer).map(m=>`<div class="bcol" title="${mesAno(m.mes)}"><div class="bstack"><i class="b1" style="height:${m.recebido/maxV*100}%"></i><i class="b2" style="height:${(m.dServ+m.dGer)/maxV*100}%"></i></div><span>${mesAno(m.mes)}</span></div>`).join("")}</div>
    <div class="hint" style="margin:6px 0 10px"><span class="lg b1"></span> recebido &nbsp; <span class="lg b2"></span> despesas</div>
    <div class="hwrap"><table class="ft"><tr><th>Mês</th><th class="n">Faturado</th><th class="n">Recebido</th><th class="n">A receber</th><th class="n">Desp. serviços</th><th class="n">Desp. gerais</th><th class="n">Lucro do mês</th>${fcfg().socios.map(s=>`<th class="n">${esc(s.nome.split(" ")[0])}</th>`).join("")}</tr>
    ${mm.map(m=>`<tr><td>${mesAno(m.mes)}</td><td class="n">${R(m.faturado)}</td><td class="n">${R(m.recebido)}</td><td class="n">${R(m.aReceber)}</td><td class="n">${R(m.dServ)}</td><td class="n">${R(m.dGer)}</td><td class="n ${m.lucro<0?"neg":""}">${R(m.lucro)}</td>${m.partes.map(p=>`<td class="n ${p<0?"neg":""}">${R(p)}</td>`).join("")}</tr>`).join("")}
    <tr class="tot"><td>Total</td>${["faturado","recebido","aReceber","dServ","dGer","lucro"].map(k=>`<td class="n">${R(mm.reduce((a,m)=>a+m[k],0))}</td>`).join("")}${fcfg().socios.map((s,i)=>`<td class="n">${R(mm.reduce((a,m)=>a+m.partes[i],0))}</td>`).join("")}</tr></table></div><br></div>`;
  el.querySelectorAll("[data-sv]").forEach(tr=>tr.addEventListener("click",()=>{ tab("servicos"); abrirServico(tr.dataset.sv); }));
}

function renderServicos(){
  const el=document.getElementById("fin-servicos"); if(!el) return;
  const q=filtroServ.toLowerCase();
  const lista=FIN.servicos.slice().sort((a,b)=>(b.codigo||"").localeCompare(a.codigo||"")).filter(s=>!q||[s.codigo,s.local,s.cidade,s.contratante,s.tipo].join(" ").toLowerCase().includes(q));
  const tot=lista.reduce((a,s)=>{ const c=calcServico(s); a.v+=c.valor; a.r+=c.recebido; a.ar+=c.aReceber; a.d+=c.despesas; a.l+=c.lucro; return a; },{v:0,r:0,ar:0,d:0,l:0});
  el.innerHTML=`<div class="actions" style="margin-bottom:12px"><button class="btn" id="svNovo">+ Novo serviço</button><input id="svBusca" placeholder="Buscar por código, local, cidade, contratante…" value="${esc(filtroServ)}" style="flex:1;min-width:200px"></div>
  <div class="hwrap"><table class="hist"><tr><th>Cód.</th><th>Data</th><th>Local / cidade</th><th>Contratante</th><th>Serviço</th><th class="n">Valor</th><th class="n">Recebido</th><th class="n">A receber</th><th class="n">Despesas</th><th class="n">Lucro</th><th>Situação</th></tr>
  ${lista.map(s=>{ const c=calcServico(s); return `<tr class="click" data-id="${s.id}"><td class="mono"><b>${esc(s.codigo)}</b></td><td>${fmtD(s.data)}</td><td><b>${esc(s.local)}</b><br><small>${esc(s.cidade)}${s.uf?" / "+esc(s.uf):""}</small></td><td><small>${esc(s.contratante)}</small></td><td><small>${esc(s.tipo)}</small></td><td class="num">${R(c.valor)}</td><td class="num">${R(c.recebido)}</td><td class="num">${R(c.aReceber)}</td><td class="num">${R(c.despesas)}</td><td class="num"><b>${R(c.lucro)}</b></td><td>${tag(c.situacao,sitCls(c.situacao))}</td></tr>`; }).join("") || '<tr><td colspan="11" style="padding:20px;color:var(--muted)">Nenhum serviço.</td></tr>'}
  <tr class="tot"><td colspan="5">${lista.length} serviço${lista.length!==1?"s":""}</td><td class="num">${R(tot.v)}</td><td class="num">${R(tot.r)}</td><td class="num">${R(tot.ar)}</td><td class="num">${R(tot.d)}</td><td class="num">${R(tot.l)}</td><td></td></tr></table></div>`;
  el.querySelector("#svNovo").addEventListener("click",()=>abrirServico(null));
  const b=el.querySelector("#svBusca"); b.addEventListener("input",()=>{ filtroServ=b.value; const pos=b.selectionStart; renderServicos(); const nb=document.getElementById("svBusca"); nb.focus(); nb.setSelectionRange(pos,pos); });
  el.querySelectorAll("tr[data-id]").forEach(tr=>tr.addEventListener("click",()=>abrirServico(tr.dataset.id)));
}
const CAMPOS_SERV=[{k:"data",label:"Data",type:"date",req:true},{k:"local",label:"Local do serviço",req:true},{k:"cidade",label:"Cidade"},{k:"uf",label:"UF",type:"select",options:UFS,def:"MG"},{k:"contratante",label:"Contratante"},{k:"tipo",label:"Serviço",type:"select",options:TIPOS_SERVICO},{k:"valor",label:"Valor do orçamento (R$)",type:"number"},{k:"obs",label:"Observações",type:"textarea"}];
function abrirServico(id, pre){
  const s = id ? FIN.servicos.find(x=>x.id===id) : Object.assign({data:hojeStr(),uf:"MG",tipo:TIPOS_SERVICO[0],recebimentos:[]},pre||{});
  if(!s) return;
  const c = id ? calcServico(s) : null;
  const desp = id ? FIN.despServ.filter(d=>d.servicoId===id).sort((a,b)=>(a.data||"").localeCompare(b.data||"")) : [];
  const extra = id ? `
    <div class="sub-card"><h3 class="fh">Pagamentos recebidos <span class="pill">${R(c.recebido)} de ${R(c.valor)}</span></h3>
      ${(s.recebimentos||[]).length?`<table class="ft">${s.recebimentos.map((r,i)=>`<tr><td>${fmtD(r.data)}</td><td class="n">${R(r.valor)}</td><td><small>${esc(r.obs||"")}</small></td><td><button class="btn danger small" data-delrec="${i}">×</button></td></tr>`).join("")}</table>`:'<p class="hint">Nenhum pagamento lançado.</p>'}
      <div class="row" style="margin-top:8px"><label>Data<input type="date" id="recData" value="${hojeStr()}"></label><label>Valor (R$)<input type="number" step="0.01" id="recValor" placeholder="${fmt(c.aReceber,2)}"></label><label>Obs.<input id="recObs" placeholder="Pix, entrada…"></label></div>
      <button class="btn ghost small" id="recAdd">+ Lançar pagamento</button></div>
    <div class="sub-card"><h3 class="fh">Despesas do serviço <span class="pill">${R(c.despesas)}</span></h3>
      ${desp.length?`<table class="ft">${desp.map(d=>`<tr><td>${fmtD(d.data)}</td><td>${esc(d.despesa)}</td><td class="n">${R(d.valor)}</td><td><small>${esc(d.obs||"")}</small></td><td><button class="btn danger small" data-deldesp="${d.id}">×</button></td></tr>`).join("")}</table>`:'<p class="hint">Nenhuma despesa lançada.</p>'}
      <div class="row" style="margin-top:8px"><label>Data<input type="date" id="dsData" value="${hojeStr()}"></label><label>Despesa<select id="dsCat">${CAT_DESP_SERV.map(o=>`<option>${esc(o)}</option>`).join("")}</select></label><label>Valor (R$)<input type="number" step="0.01" id="dsValor"></label></div>
      <button class="btn ghost small" id="dsAdd">+ Lançar despesa</button></div>
    <p class="hint">Lucro do serviço: <b>${R(c.lucro)}</b> · Situação: ${tag(c.situacao,sitCls(c.situacao))}${s.orcamentoNumero?` · Orçamento nº ${esc(s.orcamentoNumero)}`:""}</p>
    <label style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="svCanc" style="width:auto" ${s.cancelado?"checked":""}> Serviço cancelado (sai dos totais, mantém o código)</label>` : '<p class="hint">O código é gerado ao salvar. Depois de salvar, abra o serviço para lançar pagamentos e despesas.</p>';
  abrirForm(id?`Serviço ${s.codigo}`:`Novo serviço (${proximoCodigo()})`, CAMPOS_SERV, s, out=>{
    const novo=Object.assign({},s,out);
    if(!id){ novo.codigo=proximoCodigo(); novo.criadoEm=new Date().toISOString(); novo.recebimentos=[]; }
    const canc=document.getElementById("svCanc"); if(canc) novo.cancelado=canc.checked;
    const nid=salvar("servicos",novo,id);
    if(!id && pre && pre._orcId && typeof updateQuoteField==="function"){ updateQuoteField(pre._orcId,{servicoId:nid,servicoCodigo:novo.codigo,status:"Aprovado"}); }
    delete novo._orcId; toast(`Serviço ${novo.codigo} salvo`);
  }, id ? ()=>{ FIN.despServ.filter(d=>d.servicoId===id).forEach(d=>excluir("despServ",d.id)); excluir("servicos",id); toast("Serviço excluído"); } : null, extra);
  if(!id) return;
  const rec=s.recebimentos||[];
  document.getElementById("recAdd").onclick=()=>{ const v=nz(document.getElementById("recValor").value)||c.aReceber; if(!(v>0)) return toast("Informe o valor"); const nr=rec.concat([{data:document.getElementById("recData").value||hojeStr(),valor:Math.round(v*100)/100,obs:document.getElementById("recObs").value}]); salvar("servicos",Object.assign({},s,{recebimentos:nr}),id); toast("Pagamento lançado"); setTimeout(()=>abrirServico(id),250); };
  document.querySelectorAll("[data-delrec]").forEach(b=>b.onclick=()=>{ const nr=rec.filter((_,i)=>i!==+b.dataset.delrec); salvar("servicos",Object.assign({},s,{recebimentos:nr}),id); setTimeout(()=>abrirServico(id),250); });
  document.getElementById("dsAdd").onclick=()=>{ const v=nz(document.getElementById("dsValor").value); if(!(v>0)) return toast("Informe o valor"); salvar("despServ",{data:document.getElementById("dsData").value||hojeStr(),servicoId:id,despesa:document.getElementById("dsCat").value,valor:v,obs:""}); toast("Despesa lançada"); setTimeout(()=>abrirServico(id),250); };
  document.querySelectorAll("[data-deldesp]").forEach(b=>b.onclick=()=>{ excluir("despServ",b.dataset.deldesp); setTimeout(()=>abrirServico(id),250); });
}
window.finNovoServicoDeOrcamento=function(x){
  const qq=x.q||{}; const sel=Object.keys(qq.servicos||{}).filter(k=>qq.servicos[k]&&qq.servicos[k].on);
  const mun=String(x.municipio||qq.municipio||""); const m=mun.match(/^(.*?)\s*[-\/]\s*([A-Za-z]{2})\s*$/);
  abrirServico(null,{_orcId:x.id,orcamentoNumero:x.numero,data:hojeStr(),local:x.imovel||qq.imovel||"",cidade:m?m[1]:mun,uf:m?m[2].toUpperCase():"MG",contratante:x.cliente||"",tipo:MAP_CATALOGO[sel[0]]||"Outros",valor:nz(x.valor),obs:x.servicos?("Orçamento: "+x.servicos):""});
};

function renderDespesas(){
  const el=document.getElementById("fin-despesas"); if(!el) return;
  const hoje=hojeStr();
  const gs=FIN.despGer.map(g=>Object.assign({g},calcGeral(g,hoje))).sort((a,b)=>(a.g.pagas>=a.g.parcelas)-(b.g.pagas>=b.g.parcelas)||(a.prox||"9").localeCompare(b.prox||"9"));
  const cartao=gs.filter(x=>x.g.pagamento==="Cartão de crédito"&&x.prox); const fat=cartao.length?cartao.map(x=>x.prox).sort()[0]:null;
  const fatTot=fat?cartao.filter(x=>x.prox===fat).reduce((a,x)=>a+nz(x.g.valorParcela),0):0;
  const ds=FIN.despServ.slice().sort((a,b)=>(b.data||"").localeCompare(a.data||""));
  const sv=id=>FIN.servicos.find(s=>s.id===id)||{};
  el.innerHTML=`<div class="card"><h2>Despesas gerais (compras da empresa)</h2>
    <p class="hint">Compras no cartão têm o vencimento calculado pela fatura (fecha dia ${fcfg().fechamento}, vence dia ${fcfg().vencimento} — ajuste em Configurações).</p>
    <div class="actions" style="margin-bottom:12px"><button class="btn" id="dgNova">+ Nova compra</button>${fat?`<button class="btn ghost" id="dgFatura">✔ Pagar fatura de ${fmtD(fat)} (${R(fatTot)})</button>`:""}</div>
    <div class="hwrap"><table class="hist"><tr><th>Compra</th><th>Descrição</th><th>Categoria</th><th>Pagamento</th><th class="n">Parcela</th><th>Pagas</th><th>Próx. venc.</th><th class="n">Falta pagar</th><th>Status</th><th></th></tr>
    ${gs.map(x=>`<tr class="click" data-dg="${x.g.id}"><td>${fmtD(x.g.dataCompra)}</td><td><b>${esc(x.g.descricao)}</b>${x.g.obs?`<br><small>${esc(x.g.obs)}</small>`:""}</td><td><small>${esc(x.g.categoria)}</small></td><td><small>${esc(x.g.pagamento)}</small></td><td class="num">${R(x.g.valorParcela)}</td><td>${x.pg}/${x.np}</td><td>${fmtD(x.prox)}</td><td class="num">${R(x.falta)}</td><td>${tag(x.status,sitCls(x.status))}</td><td>${x.prox?`<button class="btn ghost small" data-pg1="${x.g.id}" title="Marcar a próxima parcela como paga">+1 paga</button>`:""}</td></tr>`).join("")||'<tr><td colspan="10" style="padding:20px;color:var(--muted)">Nenhuma compra lançada.</td></tr>'}
    <tr class="tot"><td colspan="7">Total em aberto</td><td class="num">${R(gs.reduce((a,x)=>a+x.falta,0))}</td><td colspan="2"></td></tr></table></div><br></div>
  <div class="card"><h2>Despesas por serviço</h2>
    <p class="hint">Também dá para lançar direto dentro de cada serviço.</p>
    <div class="actions" style="margin-bottom:12px"><button class="btn" id="dsNova">+ Nova despesa de serviço</button></div>
    <div class="hwrap"><table class="hist"><tr><th>Data</th><th>Serviço</th><th>Contratante</th><th>Despesa</th><th class="n">Valor</th><th>Obs.</th></tr>
    ${ds.map(d=>{ const s=sv(d.servicoId); return `<tr class="click" data-ds="${d.id}"><td>${fmtD(d.data)}</td><td><b>${esc(s.codigo||"?")}</b> <small>${esc(s.local||"")}</small></td><td><small>${esc(s.contratante||"")}</small></td><td>${esc(d.despesa)}</td><td class="num">${R(d.valor)}</td><td><small>${esc(d.obs||"")}</small></td></tr>`; }).join("")||'<tr><td colspan="6" style="padding:20px;color:var(--muted)">Nenhuma despesa lançada.</td></tr>'}
    <tr class="tot"><td colspan="4">Total</td><td class="num">${R(ds.reduce((a,d)=>a+nz(d.valor),0))}</td><td></td></tr></table></div><br></div>`;
  const CG=[{k:"dataCompra",label:"Data da compra",type:"date",req:true},{k:"descricao",label:"Descrição",req:true},{k:"categoria",label:"Categoria",type:"select",options:CAT_DESP_GER},{k:"pagamento",label:"Pagamento",type:"select",options:PAGAMENTOS},{k:"valorParcela",label:"Valor da parcela (R$)",type:"number",req:true},{k:"parcelas",label:"Parcelas",type:"number",def:1,hint:"à vista = 1"},{k:"pagas",label:"Parcelas já pagas",type:"number",def:0},{k:"obs",label:"Observações",type:"textarea"}];
  el.querySelector("#dgNova").onclick=()=>abrirForm("Nova compra",CG,{dataCompra:hojeStr(),categoria:"Equipamento",pagamento:"Cartão de crédito",parcelas:1,pagas:0},o=>{ o.parcelas=Math.max(1,Math.round(o.parcelas)); o.pagas=Math.round(o.pagas); salvar("despGer",o); toast("Compra lançada"); });
  el.querySelectorAll("[data-dg]").forEach(tr=>tr.addEventListener("click",e=>{ if(e.target.closest("[data-pg1]")) return; const g=FIN.despGer.find(x=>x.id===tr.dataset.dg); const cg=calcGeral(g);
    abrirForm("Compra: "+g.descricao,CG,g,o=>{ o.parcelas=Math.max(1,Math.round(o.parcelas)); o.pagas=Math.round(o.pagas); salvar("despGer",Object.assign({},g,o),g.id); toast("Compra atualizada"); },()=>{ excluir("despGer",g.id); toast("Compra excluída"); },`<p class="hint">1º vencimento: ${fmtD(cg.v1)} · Total: ${R(cg.total)} · Falta pagar: ${R(cg.falta)}</p>`); }));
  el.querySelectorAll("[data-pg1]").forEach(b=>b.addEventListener("click",e=>{ e.stopPropagation(); const g=FIN.despGer.find(x=>x.id===b.dataset.pg1); salvar("despGer",Object.assign({},g,{pagas:Math.round(nz(g.pagas))+1}),g.id); toast("Parcela marcada como paga"); }));
  const fb=el.querySelector("#dgFatura"); if(fb) fb.onclick=function(){ if(!this.dataset.c){ this.dataset.c="1"; this.textContent=`Confirmar: marcar ${cartao.filter(x=>x.prox===fat).length} parcela(s) de ${fmtD(fat)} como pagas?`; setTimeout(()=>{ renderDespesas(); },4000); return; }
    cartao.filter(x=>x.prox===fat).forEach(x=>salvar("despGer",Object.assign({},x.g,{pagas:x.pg+1}),x.g.id)); toast("Fatura registrada como paga"); };
  const svOpts=FIN.servicos.slice().sort((a,b)=>(b.codigo||"").localeCompare(a.codigo||"")).map(s=>`${s.codigo} - ${s.local}`);
  const CS=[{k:"data",label:"Data",type:"date",req:true},{k:"servico",label:"Serviço",type:"select",options:svOpts},{k:"despesa",label:"Despesa",type:"select",options:CAT_DESP_SERV},{k:"valor",label:"Valor (R$)",type:"number",req:true},{k:"obs",label:"Observações"}];
  const toId=lbl=>{ const cod=String(lbl).split(" - ")[0]; return (FIN.servicos.find(s=>s.codigo===cod)||{}).id; };
  el.querySelector("#dsNova").onclick=()=>{ if(!svOpts.length) return toast("Cadastre um serviço primeiro"); abrirForm("Nova despesa de serviço",CS,{data:hojeStr(),servico:svOpts[0]},o=>{ const sid=toId(o.servico); delete o.servico; salvar("despServ",Object.assign(o,{servicoId:sid})); toast("Despesa lançada"); }); };
  el.querySelectorAll("[data-ds]").forEach(tr=>tr.addEventListener("click",()=>{ const d=FIN.despServ.find(x=>x.id===tr.dataset.ds); const s=sv(d.servicoId);
    abrirForm("Despesa de serviço",CS,Object.assign({},d,{servico:`${s.codigo} - ${s.local}`}),o=>{ const sid=toId(o.servico); delete o.servico; salvar("despServ",Object.assign({},d,o,{servicoId:sid}),d.id); toast("Despesa atualizada"); },()=>{ excluir("despServ",d.id); toast("Despesa excluída"); }); }));
}

function renderSocios(){
  const el=document.getElementById("fin-socios"); if(!el) return;
  const r=resumo(), mm=mesAMes().filter(m=>m.mes<=hojeStr()), f=fcfg();
  const ret=FIN.retiradas.slice().sort((a,b)=>(b.data||"").localeCompare(a.data||""));
  el.innerHTML=`<div class="card"><h2>Divisão do lucro realizado</h2>
    <table class="ft"><tr><th>Sócio</th><th class="n">Direito</th><th class="n">Já retirado</th><th class="n">Saldo a retirar</th></tr>${r.socios.map(s=>`<tr><td>${esc(s.nome)} (${fmt(s.pct,0)}%)</td><td class="n">${R(s.direito)}</td><td class="n">${R(s.ret)}</td><td class="n"><b class="${s.saldo<0?"neg":""}">${R(s.saldo)}</b></td></tr>`).join("")}</table>
    <p class="hint" style="margin-top:8px">Lucro realizado = recebido dos clientes − despesas até este mês (${R(r.lucroReal)}).</p></div>
  <div class="card"><h2>Retiradas</h2><div class="actions" style="margin-bottom:12px"><button class="btn" id="rtNova">+ Nova retirada</button></div>
    <table class="hist"><tr><th>Data</th><th>Sócio</th><th class="n">Valor</th><th>Obs.</th></tr>${ret.map(x=>`<tr class="click" data-rt="${x.id}"><td>${fmtD(x.data)}</td><td>${esc(x.socio)}</td><td class="num">${R(x.valor)}</td><td><small>${esc(x.obs||"")}</small></td></tr>`).join("")||'<tr><td colspan="4" style="padding:20px;color:var(--muted)">Nenhuma retirada.</td></tr>'}</table><br></div>
  <div class="card"><h2>Extrato dos sócios — saldo acumulado mês a mês</h2>
    <div class="hwrap"><table class="ft"><tr><th>Mês</th><th class="n">Parte de cada sócio</th>${f.socios.map(s=>`<th class="n">${esc(s.nome.split(" ")[0])} retirou</th><th class="n">Saldo ${esc(s.nome.split(" ")[0])}</th>`).join("")}</tr>
    ${mm.map(m=>`<tr><td>${mesAno(m.mes)}</td><td class="n">${R(m.partes[0])}</td>${m.extrato.map(e=>`<td class="n">${R(e.ret)}</td><td class="n ${e.saldo<0?"neg":""}">${R(e.saldo)}</td>`).join("")}</tr>`).join("")}</table></div>
    <p class="hint">O saldo é acumulado: o que não é retirado num mês continua no saldo do mês seguinte. Saldo negativo = o sócio retirou mais do que o lucro acumulado até ali.</p></div>`;
  const CR=[{k:"data",label:"Data",type:"date",req:true},{k:"socio",label:"Sócio",type:"select",options:f.socios.map(s=>s.nome)},{k:"valor",label:"Valor (R$)",type:"number",req:true},{k:"obs",label:"Observações"}];
  el.querySelector("#rtNova").onclick=()=>abrirForm("Nova retirada",CR,{data:hojeStr()},o=>{ salvar("retiradas",o); toast("Retirada lançada"); });
  el.querySelectorAll("[data-rt]").forEach(tr=>tr.addEventListener("click",()=>{ const x=FIN.retiradas.find(y=>y.id===tr.dataset.rt); abrirForm("Retirada",CR,x,o=>{ salvar("retiradas",Object.assign({},x,o),x.id); toast("Retirada atualizada"); },()=>{ excluir("retiradas",x.id); toast("Retirada excluída"); }); }));
}

/* ---------- relatório (DRE) ---------- */
let relTipo="Mensal", relMes=null, relAno=null;
function dre(){
  const hoje=hojeStr(); if(relMes==null){ const p=parts(hoje); relMes=p.m===0?11:p.m-1; relAno=p.m===0?p.y-1:p.y; }
  const ini = relTipo==="Anual" ? relAno+"-01-01" : ymd(relAno,relMes,1);
  const fim = relTipo==="Anual" ? relAno+"-12-31" : fimMes(relAno,relMes);
  const sv=FIN.servicos.filter(s=>!s.cancelado&&inPeriod(s.data,ini,fim));
  const receita=sv.reduce((a,s)=>a+nz(s.valor),0);
  const custos=FIN.despServ.filter(d=>inPeriod(d.data,ini,fim)).reduce((a,d)=>a+nz(d.valor),0);
  const cats=CAT_DESP_GER.map(c=>({c,v:FIN.despGer.filter(g=>g.categoria===c).reduce((a,g)=>a+parcelasNoPeriodo(g,ini,fim)*nz(g.valorParcela),0)}));
  const dg=cats.reduce((a,x)=>a+x.v,0);
  const recebido=FIN.servicos.reduce((a,s)=>a+(s.recebimentos||[]).filter(r=>inPeriod(r.data,ini,fim)).reduce((b,r)=>b+nz(r.valor),0),0);
  const aReceber=sv.reduce((a,s)=>a+calcServico(s).aReceber,0);
  const socios=fcfg().socios.map(so=>({nome:so.nome,v:FIN.retiradas.filter(r=>r.socio===so.nome&&inPeriod(r.data,ini,fim)).reduce((a,r)=>a+nz(r.valor),0)}));
  const lb=receita-custos, liq=lb-dg;
  return {ini,fim,sv,receita,custos,lb,dg,liq,margem:receita?liq/receita:0,recebido,aReceber,caixa:recebido-custos-dg,cats,socios,titulo: relTipo==="Anual" ? "Ano de "+relAno : MESES[relMes]+" de "+relAno};
}
function renderRelatorio(){
  const el=document.getElementById("fin-relatorio"); if(!el) return;
  const d=dre(); const anos=[]; for(let y=2026;y<=parts(hojeStr()).y+1;y++) anos.push(y);
  const lin=(l,v,b)=>`<tr${b?' class="tot"':""}><td>${l}</td><td class="n">${typeof v==="string"?v:R(v)}</td></tr>`;
  el.innerHTML=`<div class="card"><h2>Relatório financeiro</h2>
    <div class="row"><label>Tipo<select id="rlTipo"><option ${relTipo==="Mensal"?"selected":""}>Mensal</option><option ${relTipo==="Anual"?"selected":""}>Anual</option></select></label>
    <label>Mês<select id="rlMes" ${relTipo==="Anual"?"disabled":""}>${MESES.map((m,i)=>`<option value="${i}" ${i===relMes?"selected":""}>${m}</option>`).join("")}</select></label>
    <label>Ano<select id="rlAno">${anos.map(y=>`<option ${y===relAno?"selected":""}>${y}</option>`).join("")}</select></label></div>
    <div class="actions" style="margin-bottom:14px"><button class="btn" id="rlPdf">Gerar PDF do relatório</button></div>
    <div class="fgrid">
      <div><h3 class="fh">Demonstrativo de resultado — ${esc(d.titulo)}</h3><table class="ft">
        ${lin("Receita bruta (serviços do período)",d.receita)}${lin("(−) Custos diretos dos serviços",d.custos)}${lin("(=) Lucro bruto",d.lb,1)}${lin("(−) Despesas gerais (parcelas do período)",d.dg)}${lin("(=) Resultado líquido",d.liq,1)}${lin("Margem líquida",fmt(d.margem*100,1)+"%")}</table></div>
      <div><h3 class="fh">Caixa e sócios</h3><table class="ft">${lin("Recebido dos clientes no período",d.recebido)}${lin("A receber (serviços do período)",d.aReceber)}${lin("Resultado de caixa",d.caixa,1)}${d.socios.map(s=>lin("Retiradas — "+esc(s.nome),s.v)).join("")}${lin("Total retirado",d.socios.reduce((a,s)=>a+s.v,0),1)}</table></div>
      <div><h3 class="fh">Despesas gerais por categoria</h3><table class="ft">${d.cats.map(c=>lin(esc(c.c),c.v)).join("")}${lin("Total",d.dg,1)}</table></div>
    </div>
    <h3 class="fh">Serviços realizados no período</h3>
    <div class="hwrap"><table class="ft"><tr><th>Cód.</th><th>Data</th><th>Local</th><th>Cidade / UF</th><th>Contratante</th><th>Serviço</th><th class="n">Valor</th><th class="n">Recebido</th></tr>
    ${d.sv.sort((a,b)=>a.data.localeCompare(b.data)).map(s=>`<tr><td>${esc(s.codigo)}</td><td>${fmtD(s.data)}</td><td>${esc(s.local)}</td><td>${esc(s.cidade)} / ${esc(s.uf)}</td><td><small>${esc(s.contratante)}</small></td><td><small>${esc(s.tipo)}</small></td><td class="n">${R(s.valor)}</td><td class="n">${R(calcServico(s).recebido)}</td></tr>`).join("")||'<tr><td colspan="8" class="hint">Nenhum serviço no período.</td></tr>'}</table></div><br></div>`;
  el.querySelector("#rlTipo").onchange=e=>{ relTipo=e.target.value; renderRelatorio(); };
  el.querySelector("#rlMes").onchange=e=>{ relMes=+e.target.value; renderRelatorio(); };
  el.querySelector("#rlAno").onchange=e=>{ relAno=+e.target.value; renderRelatorio(); };
  el.querySelector("#rlPdf").onclick=pdfRelatorio;
}
async function pdfRelatorio(){
  if(!window.jspdf) return toast("Gerador de PDF não carregou");
  const d=dre(); const {jsPDF}=window.jspdf; const doc=new jsPDF({unit:"mm",format:"a4"}); const W=210,M=16; let y;
  const navy=[0,41,85], cyan=[27,166,216], ink=[14,31,54], muted=[91,107,130];
  doc.setFillColor(...navy); doc.rect(0,0,W,28,"F"); doc.setFillColor(...cyan); doc.rect(0,28,W,1.2,"F");
  if(typeof LOGO_PDF!=="undefined"&&LOGO_PDF) doc.addImage(LOGO_PDF,"JPEG",M-3,4,62,62*289/900);
  doc.setTextColor(255); doc.setFontSize(9); doc.text(["Relatório financeiro",d.titulo,"Emitido em "+fmtD(hojeStr())],W-M,10,{align:"right"});
  y=40; doc.setTextColor(...ink); doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.text("Relatório financeiro — "+d.titulo,M,y); y+=4;
  const sec=t=>{ y+=8; if(y>270){doc.addPage();y=20;} doc.setTextColor(...navy); doc.setFont("helvetica","bold"); doc.setFontSize(10.5); doc.text(t,M,y); doc.setDrawColor(...cyan); doc.setLineWidth(0.4); doc.line(M,y+1.8,W-M,y+1.8); doc.setLineWidth(0.2); y+=7; doc.setTextColor(...ink); doc.setFont("helvetica","normal"); doc.setFontSize(10); };
  const row=(l,v,b)=>{ if(y>282){doc.addPage();y=20;} doc.setFont("helvetica",b?"bold":"normal"); doc.text(l,M,y); doc.text(typeof v==="string"?v:brl(v),W-M,y,{align:"right"}); y+=6; };
  sec("Demonstrativo de resultado (DRE simplificada)");
  row("Receita bruta (serviços do período)",d.receita); row("(−) Custos diretos dos serviços",d.custos); row("(=) Lucro bruto",d.lb,1); row("(−) Despesas gerais (parcelas do período)",d.dg); row("(=) Resultado líquido",d.liq,1); row("Margem líquida",fmt(d.margem*100,1)+"%");
  sec("Caixa"); row("Recebido dos clientes no período",d.recebido); row("A receber (serviços do período)",d.aReceber); row("Resultado de caixa (recebido − despesas)",d.caixa,1);
  sec("Retiradas dos sócios"); d.socios.forEach(s=>row(s.nome,s.v)); row("Total retirado",d.socios.reduce((a,s)=>a+s.v,0),1);
  sec("Despesas gerais por categoria"); d.cats.forEach(c=>row(c.c,c.v)); row("Total",d.dg,1);
  sec("Serviços realizados no período");
  doc.setFontSize(8.5);
  if(!d.sv.length){ doc.text("Nenhum serviço no período.",M,y); y+=5; }
  d.sv.forEach(s=>{ if(y>280){doc.addPage();y=20;} const t=doc.splitTextToSize(`${s.codigo} · ${fmtD(s.data)} · ${s.local} — ${s.cidade}/${s.uf} · ${s.contratante} · ${s.tipo}`,W-2*M-32); doc.text(t,M,y); doc.text(brl(s.valor),W-M,y,{align:"right"}); y+=4.2*t.length+1.5; });
  const np=doc.getNumberOfPages(); for(let i=1;i<=np;i++){ doc.setPage(i); doc.setFillColor(...navy); doc.rect(0,290,W,7,"F"); doc.setFontSize(7.5); doc.setTextColor(255); doc.text("SANTEX — Geotecnologia & Engenharia de Precisão",M,294.5); doc.text(`Página ${i} de ${np}`,W-M,294.5,{align:"right"}); }
  const blob=doc.output("blob"), name=`Relatorio-financeiro-${d.titulo.replace(/\s+/g,"-")}.pdf`;
  try{ const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),5000); toast("PDF baixado"); }catch(e){ toast("Não foi possível gerar o PDF"); }
  return doc;
}
window.finAbrirServico=abrirServico;
window._fin={FIN,resumo,mesAMes,calcGeral,calcServico,dre,parcelasNoPeriodo,primeiroVenc,setRel:(t,m,y)=>{relTipo=t;relMes=m;relAno=y;},pdfRelatorio};
})();
