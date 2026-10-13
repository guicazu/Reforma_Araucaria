'use strict';
const DB_KEY='ibuild_orcamentos_v5';
const $=(s,c=document)=>c.querySelector(s);
const fmtBRL=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const fmtNum=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2});

function uid(){return window.crypto&&crypto.randomUUID?crypto.randomUUID():'id-'+Date.now()+'-'+Math.random().toString(36).slice(2,10);}
function esc(s){return String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');}
function primeiraMaiuscula(s){const texto=String(s??'');return texto?texto.charAt(0).toLocaleUpperCase('pt-BR')+texto.slice(1):'';}
function num(v){if(v==null||String(v).trim()==='')return null;let s=String(v).trim();if(s.includes(',')){s=s.replace(/\./g,'').replace(',','.');}else{const d=(s.match(/\./g)||[]).length;if(d>1)s=s.replace(/\./g,'');}const n=Number(s);return isNaN(n)?null:n;}
function num2(n){return Math.round((Number(n)||0)*100)/100;}
function clone(x){return JSON.parse(JSON.stringify(x));}

function estadoInicial(){return{orcamentos:[],ativoId:null,expandidos:{}};}
function carregarEstado(){try{const raw=localStorage.getItem(DB_KEY);if(!raw)return estadoInicial();const s=JSON.parse(raw);return{orcamentos:Array.isArray(s.orcamentos)?s.orcamentos:[],ativoId:s.ativoId||null,expandidos:s.expandidos||{}};}catch(e){return estadoInicial();}}
const state=carregarEstado();

/* --- migrar estrutura antiga (unidades no topo) para versões --- */
function migrarOrcamento(o){
  if(!Array.isArray(o.versoes)||!o.versoes.length){
    o.versoes=[{id:uid(),numero:1,rotulo:'Versão 1',criadoEm:o.criadoEm||new Date().toISOString(),unidades:Array.isArray(o.unidades)?o.unidades:[]}];
  }
  delete o.unidades;
  return o;
}
state.orcamentos.forEach(migrarOrcamento);

/* códigos sequenciais automáticos */
function proximoCodigo(){
  const ano=new Date().getFullYear();
  let max=0;
  for(const o of state.orcamentos){
    const m=(o.codigo||'').match(/^ORC-(\d{4})-(\d+)$/);
    if(m&&Number(m[1])===ano)max=Math.max(max,Number(m[2]));
  }
  return 'ORC-'+ano+'-'+String(max+1).padStart(3,'0');
}
state.orcamentos.forEach(o=>{if(!o.codigo)o.codigo=proximoCodigo();});
let snapshotServidor = null;
let carregamentoConcluido = false;
let carregandoDoServidor = false;
let salvandoNoServidor = false;
let erroSalvamento = false;
let detalheErroSalvamento = '';
let usuarioPodeEditar = false;
let bloqueiosPorOrcamento = {};
let orcamentoEditandoId = null;
let modoEdicao = false;

// Planejamento locks: map of orcamentoId -> array of versaoIds that are blocked for planning
const DB_KEY_PLANEJAMENTO_BLOQUEIOS = 'ibuild_planejamento_bloqueios_v1';
let bloqueiosPorVersaoParaPlanejamento = {};

function carregarBloqueiosPlanejamento() {
  try {
    const raw = localStorage.getItem(DB_KEY_PLANEJAMENTO_BLOQUEIOS);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function salvarBloqueiosPlanejamento(bloqueios) {
  localStorage.setItem(DB_KEY_PLANEJAMENTO_BLOQUEIOS, JSON.stringify(bloqueios));
}

// Load planning locks on startup
bloqueiosPorVersaoParaPlanejamento = carregarBloqueiosPlanejamento();

function bloquearOrcamentoParaPlanejamento(orcamentoId, versaoId) {
  if (!bloqueiosPorVersaoParaPlanejamento[orcamentoId]) {
    bloqueiosPorVersaoParaPlanejamento[orcamentoId] = [];
  }
  if (!bloqueiosPorVersaoParaPlanejamento[orcamentoId].includes(versaoId)) {
    bloqueiosPorVersaoParaPlanejamento[orcamentoId].push(versaoId);
  }
  salvarBloqueiosPlanejamento(bloqueiosPorVersaoParaPlanejamento);
}

function isVersaoBloqueadaParaPlanejamento(orcamentoId, versaoId) {
  return bloqueiosPorVersaoParaPlanejamento[orcamentoId] && 
         bloqueiosPorVersaoParaPlanejamento[orcamentoId].includes(versaoId);
}

salvar();

function salvar(){
  localStorage.setItem(DB_KEY, JSON.stringify(state));
  if(snapshotServidor !== null && JSON.stringify(state.orcamentos) !== snapshotServidor){
    erroSalvamento = false;
  }
  atualizarStatusSalvamento();
}

function definirStatusSalvamento(texto, classe){
  ['#statusSalvamento', '#statusListaSalvamento'].forEach(seletor=>{
    const status = $(seletor);
    if(!status)return;
    status.textContent = texto;
    status.className = 'save-status ' + classe;
  });
}

function atualizarStatusSalvamento(){
  const botao = $('#btnSalvarOrcamento');
  const botaoLista = $('#btnSalvarLista');
  const pendente = snapshotServidor !== null && JSON.stringify(state.orcamentos) !== snapshotServidor;
  if(botao)botao.disabled = carregandoDoServidor || salvandoNoServidor || !modoEdicao;
  if(botaoLista)botaoLista.disabled = carregandoDoServidor || salvandoNoServidor || !pendente;
  const painelLista = $('#listaStatusSalvamento');
  const liberarLista = $('#btnLiberarBloqueioLista');
  const removido = Boolean(orcamentoEditandoId && !state.orcamentos.some(o=>o.id === orcamentoEditandoId));
  if(painelLista)painelLista.classList.toggle('hidden', modoEdicao || (!pendente && !removido));
  if(botaoLista)botaoLista.classList.toggle('hidden', !pendente);
  if(liberarLista){
    liberarLista.classList.toggle('hidden', !removido || pendente);
  }
  const orcamentoAtivoId = state.ativoId;
  const bloqueioAtivo = orcamentoAtivoId && bloqueiosPorOrcamento[orcamentoAtivoId];
  const emailAtual = window.usuarioAtual && window.usuarioAtual.email;
  const podeLiberarAtivo = Boolean(
    bloqueioAtivo && emailAtual &&
    String(bloqueioAtivo.usuarioEmail || bloqueioAtivo.email || '').toLowerCase() === String(emailAtual).toLowerCase()
  );
  $('#btnEntrarEdicao').classList.toggle('hidden', modoEdicao || !usuarioPodeEditar);
  $('#btnLiberarBloqueio').classList.toggle('hidden', !((modoEdicao && orcamentoEditandoId) || podeLiberarAtivo));
  $('#btnRenomear').classList.toggle('hidden', !modoEdicao);
  $('#btnAddUnidade').classList.toggle('hidden', !modoEdicao);
  $('#btnGerarVersao').classList.toggle('hidden', !modoEdicao);
  $('#btnDuplicar').classList.toggle('hidden', !usuarioPodeEditar || modoEdicao || Boolean(orcamentoEditandoId));
  $('#btnNovoOrcamento').classList.toggle('hidden', !usuarioPodeEditar);
  $('#btnNovoVazio').classList.toggle('hidden', !usuarioPodeEditar);
  if(carregandoDoServidor || !carregamentoConcluido){
    definirStatusSalvamento('⏳ Carregando último orçamento...', 'save-status-pending');
  }else if(salvandoNoServidor){
    definirStatusSalvamento('💾 Salvando alterações no banco...', 'save-status-pending');
  }else if(snapshotServidor === null){
    definirStatusSalvamento('⚠️ Não foi possível carregar o orçamento do banco. Clique em Salvar para tentar novamente.', 'save-status-error');
  }else if(erroSalvamento){
    definirStatusSalvamento('⚠️ Não foi possível salvar. '+(detalheErroSalvamento || 'Suas alterações continuam pendentes; tente novamente.'), 'save-status-error');
  }else if(pendente){
    definirStatusSalvamento('📝 Foram feitas alterações que ainda não foram salvas.', 'save-status-unsaved');
  }else{
    definirStatusSalvamento('✅ Orçamento salvo com sucesso. As últimas alterações estão no banco.', 'save-status-saved');
  }
}

async function fetchComTimeout(url, opcoes){
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(), 15000);
  try{
    return await fetch(url, Object.assign({}, opcoes, { signal: controller.signal }));
  }finally{
    clearTimeout(timeout);
  }
}

async function salvarNoServidor(){
  if(carregandoDoServidor || salvandoNoServidor)return;
  if(snapshotServidor === null){
    await carregarDoServidor();
    return;
  }
  if(!usuarioPodeEditar || !orcamentoEditandoId){
    definirStatusSalvamento('⚠️ Entre em modo de edição antes de salvar.', 'save-status-error');
    return;
  }
  const snapshot = JSON.stringify(state.orcamentos);
  erroSalvamento = false;
  detalheErroSalvamento = '';
  salvandoNoServidor = true;
  atualizarStatusSalvamento();
  try{
    const resposta = await fetchComTimeout('/api/orcamentos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orcamentos: JSON.parse(snapshot), editandoId: orcamentoEditandoId })
    });
    const resultado = await resposta.json();
    if(!resposta.ok){
      const mensagens = {
        somente_visualizacao: 'Sua conta está somente para visualização. Peça ao administrador para liberar edição.',
        bloqueio_obrigatorio: 'A gravação exige que apenas o orçamento bloqueado por você tenha sido alterado.',
        bloqueio_nao_permitido: 'O bloqueio de edição não está ativo para sua conta. Volte à lista, reabra em Editar e tente salvar novamente.',
        nao_autenticado: 'Sua sessão expirou. Entre novamente e tente salvar.'
      };
      throw new Error(mensagens[resultado.erro] || 'A API recusou a gravação (' + resposta.status + ').');
    }
    if(!resultado || resultado.ok !== true)throw new Error('A API não confirmou a gravação');
    snapshotServidor = snapshot;
  }catch(erro){
    console.error('Não foi possível salvar as alterações no banco:', erro);
    erroSalvamento = true;
    detalheErroSalvamento = erro.message;
  }finally{
    salvandoNoServidor = false;
    atualizarStatusSalvamento();
  }
}
function orcamentoAtivo(){return state.orcamentos.find(o=>o.id===state.ativoId)||null;}
function versaoAtiva(o){return o.versoes[o.versoes.length-1];}
function uu(o){return versaoAtiva(o).unidades;}

/* ---------- expansão/recolhimento ---------- */
function estaAberto(key){return state.expandidos[key]!==false;}
function alternar(key){state.expandidos[key]=!estaAberto(key);salvar();renderTudo();}
function seta(aberto){return aberto?'▾':'▸';}

/* ---------- navegação na árvore ---------- */
function acharUnidade(o,uid_){return uu(o).find(u=>u.id===uid_);}
function acharEtapa(o,uid_,eid){const u=acharUnidade(o,uid_);return u?u.etapas.find(e=>e.id===eid):null;}
function acharSub(o,uid_,eid,sid){const e=acharEtapa(o,uid_,eid);return e?e.subEtapas.find(s=>s.id===sid):null;}
function acharServico(o,uid_,eid,sid,svid){const s=acharSub(o,uid_,eid,sid);return s?s.servicos.find(x=>x.id===svid):null;}
function acharServicoDiretoEmEtapa(o,uid_,eid,svid){const e=acharEtapa(o,uid_,eid);if(!e||!Array.isArray(e.servicos))return null;return e.servicos.find(x=>x.id===svid)||null;}
function acharServicoPorId(o,svid){for(const u of uu(o))for(const e of u.etapas){const sv=(e.servicos||[]).find(x=>x.id===svid);if(sv)return sv;for(const s of e.subEtapas){const x=s.servicos.find(y=>y.id===svid);if(x)return x;}}return null;}
function acharServicoPorLinha(o,lid){for(const u of uu(o))for(const e of u.etapas){if(Array.isArray(e.servicos))for(const sv of e.servicos){if(sv.memo&&sv.memo.find(x=>x.id===lid))return sv;}for(const s of e.subEtapas)for(const sv of s.servicos){if(sv.memo&&sv.memo.find(x=>x.id===lid))return sv;}}return null;}
function acharSubPorId(o,sid){for(const u of uu(o))for(const e of u.etapas){const s=e.subEtapas.find(x=>x.id===sid);if(s)return s;}return null;}

/* ---------- orçamentos ---------- */
async function criarOrcamento(){
  if(!usuarioPodeEditar)return;
  if(orcamentoEditandoId){
    alert('Libere o orçamento que está em edição antes de criar outro.');
    return;
  }
  const nome=prompt('Nome do orçamento (ex.: Reforma Araucária):','');
  if(nome===null)return;
  const agora=new Date().toISOString();
  const novo={id:uid(),codigo:proximoCodigo(),nome:nome.trim()||'Orçamento sem nome',criadoEm:agora,versoes:[{id:uid(),numero:1,rotulo:'Versão 1',criadoEm:agora,unidades:[]}]};
  try{
    await window.bloquearOrcamento(novo.id);
    orcamentoEditandoId=novo.id;
    const usuario=window.usuarioAtual||{};
    bloqueiosPorOrcamento[novo.id]={usuarioEmail:usuario.email,usuarioNome:usuario.nome};
    modoEdicao=true;
    state.orcamentos.push(novo);state.ativoId=novo.id;
    $('#viewOrcamento').dataset.modo='editor';
    salvar();renderTudo();
  }catch(erro){
    alert('Não foi possível criar o orçamento para edição: '+erro.message);
  }
}
function renomearOrcamento(){const o=orcamentoAtivo();if(!o)return;const n=prompt('Nome do orçamento:',o.nome);if(n===null)return;o.nome=n.trim()||o.nome;salvar();renderTudo();}
async function excluirOrcamento(id){
  const o=state.orcamentos.find(x=>x.id===id);
  if(!o || !usuarioPodeEditar)return;
  if(orcamentoEditandoId && orcamentoEditandoId!==id){
    alert('Libere o orçamento que está em edição antes de excluir outro.');
    return;
  }
  if(!confirm(`Excluir o orçamento "${o.codigo} — ${o.nome}"?`))return;
  try{
    await window.bloquearOrcamento(id);
    orcamentoEditandoId=id;
    bloqueiosPorOrcamento[id]={usuarioEmail:window.usuarioAtual&&window.usuarioAtual.email,usuarioNome:window.usuarioAtual&&window.usuarioAtual.nome};
    modoEdicao=false;
    state.orcamentos=state.orcamentos.filter(x=>x.id!==id);
    if(state.ativoId===id)state.ativoId=state.orcamentos.length?state.orcamentos[0].id:null;
    $('#viewOrcamento').dataset.modo='lista';
    salvar();renderTudo();
  }catch(erro){
    alert('Não foi possível excluir: '+erro.message);
  }
}
function ativarOrcamento(id){if(!state.orcamentos.some(o=>o.id===id))return;state.ativoId=id;salvar();renderTudo();}
async function duplicarOrcamento(id){
  const src=state.orcamentos.find(x=>x.id===id);if(!src||!usuarioPodeEditar)return;
  if(orcamentoEditandoId){
    alert('Libere o orçamento que está em edição antes de duplicar outro.');
    return;
  }
  const c=clone(src);
  c.id=uid();c.codigo=proximoCodigo();c.nome=src.nome+' (cópia)';c.criadoEm=new Date().toISOString();
  c.versoes.forEach(v=>{v.id=uid();});
  try{
    await window.bloquearOrcamento(c.id);
    orcamentoEditandoId=c.id;
    bloqueiosPorOrcamento[c.id]={usuarioEmail:window.usuarioAtual&&window.usuarioAtual.email,usuarioNome:window.usuarioAtual&&window.usuarioAtual.nome};
    modoEdicao=true;
    state.orcamentos.push(c);state.ativoId=c.id;state.expandidos={};
    $('#viewOrcamento').dataset.modo='editor';
    salvar();renderTudo();atualizarTotaisVisuais(c);
  }catch(erro){
    alert('Não foi possível criar a cópia para edição: '+erro.message);
  }
}

function abrirParaVisualizar(id){
  const orcamento=state.orcamentos.find(o=>o.id===id);
  if(!orcamento)return;
  state.ativoId=id;
  modoEdicao=false;
  $('#viewOrcamento').dataset.modo='editor';
  renderTudo();
}

async function abrirParaEditar(id){
  if(!usuarioPodeEditar){
    alert('Sua conta tem permissão somente para visualizar.');
    return;
  }
  if(orcamentoEditandoId && orcamentoEditandoId!==id){
    alert('Libere o orçamento que está em edição antes de editar outro.');
    return;
  }
  try{
    await window.bloquearOrcamento(id);
    orcamentoEditandoId=id;
    const usuario=window.usuarioAtual||{};
    bloqueiosPorOrcamento[id]={usuarioEmail:usuario.email,usuarioNome:usuario.nome};
    modoEdicao=true;
    state.ativoId=id;
    $('#viewOrcamento').dataset.modo='editor';
    renderTudo();
  }catch(erro){
    alert('Não foi possível abrir para edição: '+erro.message);
  }
}

async function liberarEdicaoAtual(){
  const bloqueioAtivo = state.ativoId && bloqueiosPorOrcamento[state.ativoId];
  const emailAtual = window.usuarioAtual && window.usuarioAtual.email;
  const id = orcamentoEditandoId || (
    bloqueioAtivo && emailAtual &&
    String(bloqueioAtivo.usuarioEmail || bloqueioAtivo.email || '').toLowerCase() === String(emailAtual).toLowerCase()
      ? state.ativoId
      : null
  );
  if(!id)return;
  try{
    await window.liberarOrcamento(id);
    delete bloqueiosPorOrcamento[id];
    orcamentoEditandoId=null;
    modoEdicao=false;
    $('#viewOrcamento').dataset.modo='editor';
    renderTudo();
  }catch(erro){
    alert('Não foi possível liberar o orçamento: '+erro.message);
  }
}

/* ---------- versões ---------- */
function gerarVersao(){
  const o=orcamentoAtivo();if(!o)return;
  const ativa=versaoAtiva(o);
  const novoNum=Math.max(...o.versoes.map(v=>v.numero))+1;
  const rotulo=prompt(`Rótulo da versão ${novoNum} (ex.: Após revisão da cobertura):`, `Versão ${novoNum}`);
  if(rotulo===null)return;
  o.versoes.push({id:uid(),numero:novoNum,rotulo:rotulo.trim()||('Versão '+novoNum),criadoEm:new Date().toISOString(),unidades:clone(ativa.unidades)});
  state.expandidos={};
  salvar();renderTudo();
  if($('#modalVersoes').open)renderVersoes(o);
}
function totalVersao(v){let t=0;for(const u of v.unidades)for(const e of u.etapas)for(const s of e.subEtapas)for(const sv of s.servicos)t+=totalServico(sv);return t;}
function flatServicos(unidades){
  const out=[];
  unidades.forEach((u,iu)=>{
    u.etapas.forEach((e,ie)=>{
      e.subEtapas.forEach((s,is)=>{
        s.servicos.forEach((sv,isv)=>{
          out.push({cod:`${iu+1}.${ie+1}.${is+1}.${isv+1}`,nome:sv.nome,un:sv.unidadeMedida,qtd:qtdServico(sv),total:totalServico(sv)});
        });
      });
    });
  });
  return out;
}
function renderVersoes(o){
  const el=$('#listaVersoes');if(!el)return;
  if(!o.versoes.length){el.innerHTML='<p class="memo-aviso">Nenhuma versão.</p>';return;}
  el.innerHTML=o.versoes.map((v,idx)=>{
    const ultima=idx===o.versoes.length-1;
    return `<div class="versao-item" data-idx="${idx}">
      <input type="checkbox" class="chk-versao" value="${idx}" />
      <span class="v-num">V${v.numero}</span>
      <span class="v-info"><strong>${esc(v.rotulo)}</strong><small>${new Date(v.criadoEm).toLocaleString('pt-BR')} · ${fmtBRL.format(totalVersao(v))}</small></span>
      ${ultima?'<span class="badge-ativa">Ativa</span>':''}
    </div>`;
  }).join('');
  el.querySelectorAll('.versao-item').forEach(item=>{
    item.addEventListener('click',(ev)=>{
      if(ev.target.tagName==='INPUT')return;
      const chk=item.querySelector('.chk-versao');chk.checked=!chk.checked;
      item.classList.toggle('selecionada',chk.checked);
    });
  });
}
function compararVersoes(){
  const o=orcamentoAtivo();if(!o)return;
  const sel=[...document.querySelectorAll('.chk-versao:checked')].map(c=>Number(c.value));
  if(sel.length!==2){alert('Selecione exatamente 2 versões para comparar.');return;}
  const a=o.versoes[sel[0]],b=o.versoes[sel[1]];
  const fa=flatServicos(a.unidades),fb=flatServicos(b.unidades);
  const ma={},mb={};
  fa.forEach(x=>ma[x.cod]=x);fb.forEach(x=>mb[x.cod]=x);
  const keys=[...new Set([...Object.keys(ma),...Object.keys(mb)])].sort();
  let html=`
    <div class="cmp-head">
      <span><b>${esc(a.rotulo)} (V${a.numero})</b>: ${fmtBRL.format(totalVersao(a))}</span>
      <span><b>${esc(b.rotulo)} (V${b.numero})</b>: ${fmtBRL.format(totalVersao(b))}</span>
      <span>Diferença: <b>${fmtBRL.format(totalVersao(b)-totalVersao(a))}</b></span>
    </div>
    <table class="cmp-tabela">
      <thead><tr><th>Código</th><th>Serviço</th><th>Un.</th><th>Qtd ${esc(a.rotulo)}</th><th>Total ${esc(a.rotulo)}</th><th>Qtd ${esc(b.rotulo)}</th><th>Total ${esc(b.rotulo)}</th><th>Situação</th></tr></thead><tbody>`;
  keys.forEach(cod=>{
    const x=ma[cod],y=mb[cod];
    let sit,cls;
    if(!x&&y){sit='Adicionado';cls='sit-add';}
    else if(x&&!y){sit='Removido';cls='sit-rem';}
    else if(Math.abs((x.qtd||0)-(y.qtd||0))>0.001||Math.abs((x.total||0)-(y.total||0))>0.001){sit='Alterado';cls='sit-alt';}
    else{sit='Igual';cls='sit-ig';}
    const nome=x?esc(x.nome):esc(y.nome);
    const un=x?esc(x.un):esc(y.un);
    html+=`<tr><td>${cod}</td><td>${nome}</td><td>${un}</td>
      <td>${x?fmtNum.format(x.qtd):'—'}</td><td>${x?fmtBRL.format(x.total):'—'}</td>
      <td>${y?fmtNum.format(y.qtd):'—'}</td><td>${y?fmtBRL.format(y.total):'—'}</td>
      <td class="${cls}">${sit}</td></tr>`;
  });
  html+='</tbody></table>';
  $('#comparacaoVersoes').innerHTML=html;
  $('#btnCompararVersoes').textContent='Comparar selecionadas (2)';
}

/* ---------- CRUD níveis ---------- */
function addUnidade(){const o=orcamentoAtivo();const n=prompt('Nome da unidade construtiva (ex.: Casa 01):','');if(n===null||!n.trim())return;uu(o).push({id:uid(),nome:n.trim(),etapas:[]});salvar();renderTudo();}
function renomearUnidade(u){const n=prompt('Renomear unidade construtiva:',u.nome);if(n===null)return;u.nome=n.trim()||u.nome;salvar();renderTudo();}
function excluirUnidade(o,u){
  if(!confirm(`Excluir a unidade "${u.nome}" e tudo dentro dela?`))return;
  const arr=uu(o);const i=arr.indexOf(u);
  if(i>-1)arr.splice(i,1);
  salvar();renderTudo();
}function moverUnidade(o,u,dir){const arr=uu(o);const i=arr.indexOf(u);const j=i+dir;if(j<0||j>=arr.length)return;[arr[i],arr[j]]=[arr[j],arr[i]];salvar();renderTudo();}

function addEtapa(u){const n=prompt('Nome da etapa (ex.: Estrutura):','');if(n===null||!n.trim())return;u.etapas.push({id:uid(),nome:n.trim(),subEtapas:[],servicos:[],servicos:[],servicos:[]});salvar();renderTudo();}
function renomearEtapa(e){const n=prompt('Renomear etapa:',e.nome);if(n===null)return;e.nome=n.trim()||e.nome;salvar();renderTudo();}
function excluirEtapa(u,e){if(!confirm(`Excluir a etapa "${e.nome}" e tudo dentro dela?`))return;u.etapas=u.etapas.filter(x=>x.id!==e.id);salvar();renderTudo();}
function moverEtapa(u,e,dir){const i=u.etapas.indexOf(e);const j=i+dir;if(j<0||j>=u.etapas.length)return;[u.etapas[i],u.etapas[j]]=[u.etapas[j],u.etapas[i]];salvar();renderTudo();}

function addSub(e){const n=prompt('Nome da sub etapa (ex.: Paredes):','');if(n===null||!n.trim())return;e.subEtapas.push({id:uid(),nome:n.trim(),servicos:[]});salvar();renderTudo();}
function renomearSub(s){const n=prompt('Renomear sub etapa:',s.nome);if(n===null)return;s.nome=n.trim()||s.nome;salvar();renderTudo();}
function excluirSub(e,s){if(!confirm(`Excluir a sub etapa "${s.nome}" e seus serviços?`))return;e.subEtapas=e.subEtapas.filter(x=>x.id!==s.id);salvar();renderTudo();}
function moverSub(e,s,dir){const i=e.subEtapas.indexOf(s);const j=i+dir;if(j<0||j>=e.subEtapas.length)return;[e.subEtapas[i],e.subEtapas[j]]=[e.subEtapas[j],e.subEtapas[i]];salvar();renderTudo();}
function moverSubEntreEtapa(eOrigem, eDestino, s){// Move sub-étapa de uma etapa para outra
  if(!eOrigem || !eDestino) return;
  const index = eOrigem.subEtapas.indexOf(s);
  if(index === -1) return;
  eOrigem.subEtapas.splice(index, 1);
  eDestino.subEtapas.push(s);
  salvar();renderTudo();
}

function preencherCatalogoServico(sv){
  const select=$('#fCatalogoItem');
  select.replaceChildren(new Option('Selecione uma composição própria',''));
  const composicoes=window.Composicoes?window.Composicoes.carregar().filter(item=>item.base==='propria'||!item.base):[];
  composicoes.forEach(item=>{
    const codigo=item.codigo||'';
    select.appendChild(new Option(`${codigo?codigo+' — ':''}${item.nome} · ${fmtBRL.format(num(item.valorUnitario)||0)}/${item.unidade||'un'}`,item.id));
  });
  select.value=sv&&sv.catalogoTipo==='composicao'?(sv.catalogoId||''):'';
}

function aplicarItemCatalogo(){
  const id=$('#fCatalogoItem').value;
  const item=window.Composicoes&&window.Composicoes.carregar().find(registro=>registro.id===id&&(registro.base==='propria'||!registro.base));
  if(!item){limparFonteServico();return;}
  $('#fCatalogoTipo').value='composicao';$('#fCatalogoId').value=item.id;$('#fCatalogoDetalheId').value='';
  $('#fCodigoSinapi').value='';
  $('#fNome').value=item.nome||'';
  $('#fUnidadeMedida').value=item.unidade||'un';
  definirPrecoServico(item.valorUnitario);
  $('#fonteServicoResumo').textContent='Composição própria · '+(item.codigo||'')+(item.componentes&&item.componentes.length?' · '+item.componentes.length+' insumo(s)':'');
  $('#sinapiStatus').textContent='';
}

function definirPrecoServico(valor){
  const preco=num(valor);
  $('#fValor').value=preco==null?'':String(preco);
  $('#fValorExibicao').textContent=preco==null?'Selecione uma fonte':fmtBRL.format(preco);
}

function limparFonteServico(){
  $('#fCatalogoTipo').value='';$('#fCatalogoId').value='';$('#fCatalogoDetalheId').value='';$('#fCodigoSinapi').value='';$('#fCatalogoItem').value='';
  $('#fNome').value='';$('#fUnidadeMedida').value='';definirPrecoServico(null);
  $('#fonteServicoResumo').textContent='Selecione uma composição própria ou busque uma composição SINAPI.';
}

window.selecionarComposicaoSinapiServico=function(resultado){
  if(!resultado||!resultado.codigo||!resultado.descricao||resultado.valor==null)return false;
  $('#fCatalogoTipo').value='sinapi';$('#fCatalogoId').value=String(resultado.codigo);$('#fCatalogoDetalheId').value='';
  $('#fCatalogoItem').value='';$('#fCodigoSinapi').value=String(resultado.codigo);
  $('#fNome').value=resultado.descricao;$('#fUnidadeMedida').value=resultado.unidade||'';
  definirPrecoServico(resultado.valor);
  $('#fonteServicoResumo').textContent='SINAPI · Código '+resultado.codigo+(resultado.referencia?' · Referência '+resultado.referencia:'');
  $('#sinapiStatus').textContent='Composição SINAPI selecionada';
  $('#sinapiStatus').className='sinapi-status ok';
  return true;
}

function abrirModalServico(sv, sub, etapa, unidade){
  if(!sv&&typeof window.limparBuscaSinapi==='function')window.limparBuscaSinapi();
  $('#fServicoId').value=sv?sv.id:'';
  $('#fSubId').value=sub?sub.id:'';
  $('#fEtapaId').value=etapa?etapa.id:'';
  $('#fUnidadeId').value=unidade?unidade.id:'';
  $('#fCatalogoTipo').value=sv?sv.catalogoTipo||'':'';
  $('#fCatalogoId').value=sv?sv.catalogoId||'':'';
  $('#fCatalogoDetalheId').value=sv?sv.catalogoDetalheId||'':'';
  $('#modalTitulo').textContent=sv?'Editar serviço':'Adicionar serviço';
  $('#fNome').value=sv?sv.nome:'';
  $('#fCodigoSinapi').value=sv?sv.codigo||'':'';
  $('#fUnidadeMedida').value=sv?sv.unidadeMedida:'m²';
  definirPrecoServico(sv&&sv.valorUnitario!=null?sv.valorUnitario:null);
  preencherCatalogoServico(sv);
  if(sv&&sv.catalogoTipo==='composicao')aplicarItemCatalogo();
  else if(sv&&sv.catalogoTipo==='sinapi'){
    $('#fNome').value=sv.nome||'';$('#fUnidadeMedida').value=sv.unidadeMedida||'';$('#fCodigoSinapi').value=sv.codigo||'';
    $('#fonteServicoResumo').textContent='SINAPI · Código '+(sv.codigo||sv.catalogoId||'');
    $('#sinapiStatus').textContent='Composição SINAPI selecionada';
    $('#sinapiStatus').className='sinapi-status ok';
  }else if(sv){
    $('#fonteServicoResumo').textContent='Serviço antigo sem composição vinculada. Selecione uma fonte para continuar.';
    $('#sinapiStatus').textContent='';
  }else{
    limparFonteServico();
  }
  $('#modalServico').showModal();
  if(!sv||!sv.catalogoTipo)$('#fCatalogoItem').focus();
}
function renomearServico(sv){if(!sv)return;const n=prompt('Renomear serviço:',sv.nome);if(n===null)return;sv.nome=n.trim()||sv.nome;salvar();renderTudo();}
function colecaoDeServicos(etapa,sub){return sub?sub.servicos:(etapa&&Array.isArray(etapa.servicos)?etapa.servicos:null);}
function excluirServico(etapa,sub,sv){
  const servicos=colecaoDeServicos(etapa,sub);
  if(!servicos||!sv)return;
  if(!confirm(`Excluir o serviço "${sv.nome}"?`))return;
  const indice=servicos.findIndex(x=>x.id===sv.id);
  if(indice<0)return;
  servicos.splice(indice,1);
  salvar();renderTudo();
}
function moverServico(etapa,sub,sv,dir){
  const servicos=colecaoDeServicos(etapa,sub);
  if(!servicos||!sv)return;
  const i=servicos.findIndex(x=>x.id===sv.id),j=i+dir;
  if(i<0||j<0||j>=servicos.length)return;
  [servicos[i],servicos[j]]=[servicos[j],servicos[i]];
  salvar();renderTudo();
}
function moverServicoEntreSub(sOrigem, sDestino, sv){// Move serviço de uma sub-étapa para outra
  if(!sOrigem || !sDestino) return;
  const index = sOrigem.servicos.indexOf(sv);
  if(index === -1) return;
  sOrigem.servicos.splice(index, 1);
  sDestino.servicos.push(sv);
  salvar();renderTudo();
}
function moverSubEntreEtapa(eOrigem, eDestino, s){// Move sub-étapa de uma etapa para outra
  if(!eOrigem || !eDestino) return;
  const index = eOrigem.subEtapas.indexOf(s);
  if(index === -1) return;
  eOrigem.subEtapas.splice(index, 1);
  eDestino.subEtapas.push(s);
  salvar();renderTudo();
}

/* ---------- memória de cálculo ---------- */
function calcularLinha(l){
  const c=num(l.comprimento),a=num(l.altura),w=num(l.largura);
  const q=num(l.quantidade),coef=num(l.coeficiente);
  let base,tipo;
  if(c==null&&a==null&&w==null&&q==null&&coef==null)return{valor:null,tipo:''};
  if(c!=null||a!=null||w!=null){
    if(c==null||a==null)return{valor:null,tipo:'',incompleto:true};
    if(w!=null){base=c*a*w;tipo='m³';}
    else{base=c*a;tipo='m²';}
  }else{base=1;tipo='qtd';}
  return{valor:base*(q??1)*(coef??1),tipo};
}
function qtdServico(sv){if(sv.memo&&sv.memo.length){return num2(sv.memo.reduce((acc,l)=>{const r=calcularLinha(l);return acc+(r.valor||0);},0));}return num2(num(sv.qtdManual)||0);}
function totalServico(sv){return qtdServico(sv)*(num(sv.valorUnitario)||0);}
function totalOrcamento(o){let t=0;for(const u of uu(o))for(const e of u.etapas){for(const sv of (e.servicos||[]))t+=totalServico(sv);for(const s of e.subEtapas)for(const sv of s.servicos)t+=totalServico(sv);}return t;}
function contarServicos(o){let n=0;for(const u of uu(o))for(const e of u.etapas){n+= (e.servicos||[]).length;for(const s of e.subEtapas)n+=s.servicos.length;}return n;}
function subtotalSub(s){return s.servicos.reduce((a,sv)=>a+totalServico(sv),0);}
function subtotalEtapa(e){let t=0;for(const sv of (e.servicos||[]))t+=totalServico(sv);for(const s of e.subEtapas)for(const sv of s.servicos)t+=totalServico(sv);return t;}
function subtotalUnidade(o,u){let t=0;for(const e of u.etapas){t+=subtotalEtapa(e);}return t;}
function atualizarTotaisVisuais(o){
  $('#totalGeral').textContent=fmtBRL.format(totalOrcamento(o));
  $('#totalRodape').textContent=fmtBRL.format(totalOrcamento(o));
  for(const u of uu(o)){
    const totalUn=document.getElementById('subtotalUnidade_'+u.id);if(totalUn)totalUn.textContent=fmtBRL.format(subtotalUnidade(o,u));
    for(const e of u.etapas){
      const totalEt=document.getElementById('subtotalEtapa_'+e.id);if(totalEt)totalEt.textContent=fmtBRL.format(subtotalEtapa(e));
      for(const s of e.subEtapas){const totalS=document.getElementById('subtotalSub_'+s.id);if(totalS)totalS.textContent=fmtBRL.format(subtotalSub(s));}
    }
  }
}

/* ---------- renderização ---------- */
function renderTudo(){renderLista();renderConteudo();atualizarStatusSalvamento();}

function renderLista(){
  const ul=$('#listaOrcamentos');
  if(!state.orcamentos.length){
    ul.innerHTML='<li class="lista-vazia">Nenhum orçamento.<br>Crie com "+ Novo".</li>';
    return;
  }
  ul.innerHTML=state.orcamentos.map(o=>{
    const ativo=o.id===state.ativoId?' ativo':'';
    const bloqueio=bloqueiosPorOrcamento[o.id];
    const estado=bloqueio?`<span class="oi-bloqueio">🔒 Em edição por ${esc(bloqueio.usuarioNome||bloqueio.usuarioEmail)}</span>`:'';
    const acoes=`<button class="btn btn-ghost btn-xs" data-acao="ver-orcamento" data-id="${esc(o.id)}" title="Abrir para visualizar">👁 Visualizar</button>`+
      (usuarioPodeEditar?`<button class="btn btn-ghost btn-xs" data-acao="editar-orcamento" data-id="${esc(o.id)}" title="Abrir para editar">✏️ Editar</button>`:'')+
      (usuarioPodeEditar?`<button class="btn-icon" data-acao="dup-orcamento" data-id="${esc(o.id)}" title="Duplicar">⧉</button><button class="btn-icon btn-danger" data-acao="del-orcamento" data-id="${esc(o.id)}" title="Excluir">🗑</button>`:'');
    return `<li class="orcamento-item${ativo}" data-orcamento-id="${esc(o.id)}"><div class="oi-info"><strong>${esc(o.codigo||'')} — ${esc(o.nome)}</strong><span>${fmtBRL.format(totalOrcamento(o))} · V${versaoAtiva(o).numero} · ${new Date(o.criadoEm).toLocaleDateString('pt-BR')}</span></div>${estado}<div class="oi-acoes">${acoes}</div></li>`;
  }).join('');
}

function renderConteudo(){const o=orcamentoAtivo();const vazio=$('#contentVazio');const orc=$('#contentOrcamento');if(!o){vazio.classList.remove('hidden');orc.classList.add('hidden');return;}vazio.classList.add('hidden');orc.classList.remove('hidden');
orc.dataset.somenteLeitura=String(!modoEdicao);
$('#orcamentoNome').textContent=(o.codigo?o.codigo+' — ':'')+o.nome;
$('#orcamentoMeta').textContent='Criado em '+new Date(o.criadoEm).toLocaleDateString('pt-BR')+' · '+contarServicos(o)+' serviço(s) · '+o.versoes.length+' versão(ões)';
$('#totalGeral').textContent=fmtBRL.format(totalOrcamento(o));
$('#totalServicos').textContent=contarServicos(o);
$('#versaoAtivaLabel').textContent='V'+versaoAtiva(o).numero;
$('#totalRodape').textContent=fmtBRL.format(totalOrcamento(o));
$('#corpoTabela').innerHTML=renderTabela(o);}

function renderTabela(o){
  const unidades=uu(o);
  if(!unidades.length)return `<tr><td colspan="7" class="sem-servicos">${modoEdicao?'Nenhuma unidade construtiva ainda.<br>Clique em <strong>+ Unidade construtiva</strong> para começar.':'Este orçamento ainda não tem unidades construtivas.'}</td></tr>`;
  let html='';
  unidades.forEach((u,iu)=>{
    const cU=iu+1;
    const abertaU=estaAberto('u-'+u.id);
    html+=`<tr class="grupo n1">
      <td class="col-codigo codigo">${cU}</td>
      <td><button class="btn-icon" data-acao="toggle" data-key="u-${u.id}" title="Recolher/expandir">${seta(abertaU)}</button><strong>${esc(u.nome.toLocaleUpperCase('pt-BR'))}</strong></td>
      <td class="col-un"></td><td class="col-num"></td><td class="col-num"></td>
      <td class="col-num total" id="subtotalUnidade_${u.id}">${fmtBRL.format(subtotalUnidade(o,u))}</td>
<td class="col-acoes">
  <button class="btn btn-primary btn-xs" data-acao="add-etapa" data-uid="${u.id}">+ Etapa</button>
  <button class="btn-icon" data-acao="up-un" data-uid="${u.id}" title="Subir">↑</button>
  <button class="btn-icon" data-acao="down-un" data-uid="${u.id}" title="Descer">↓</button>
  <button class="btn-icon" data-acao="ren-un" data-uid="${u.id}" title="Renomear">✏️</button>
  <button class="btn-icon btn-danger" data-acao="del-un" data-uid="${u.id}" title="Excluir unidade">🗑</button>
</td>
    </tr>`;
    if(!abertaU)return;
    u.etapas.forEach((e,ie)=>{
      const cE=cU+'.'+(ie+1);
      const abertaE=estaAberto('e-'+e.id);
      html+=`<tr class="grupo n2">
        <td class="col-codigo codigo">${cE}</td>
        <td><button class="btn-icon" data-acao="toggle" data-key="e-${e.id}" title="Recolher/expandir">${seta(abertaE)}</button><strong>${esc(primeiraMaiuscula(e.nome))}</strong></td>
        <td class="col-un"></td><td class="col-num"></td><td class="col-num"></td>
        <td class="col-num total" id="subtotalEtapa_${e.id}">${fmtBRL.format(subtotalEtapa(e))}</td>
        <td class="col-acoes">
  <button class="btn btn-primary btn-xs" data-acao="add-sub" data-uid="${u.id}" data-eid="${e.id}">+ Sub Etapa</button>
  <button class="btn btn-ghost btn-xs" data-acao="add-servico" data-uid="${u.id}" data-eid="${e.id}">+ Serviço</button>
  <button class="btn-icon" data-acao="up-et" data-uid="${u.id}" data-eid="${e.id}" title="Subir">↑</button>
  <button class="btn-icon" data-acao="down-et" data-uid="${u.id}" data-eid="${e.id}" title="Descer">↓</button>
  <button class="btn-icon" data-acao="ren-et" data-uid="${u.id}" data-eid="${e.id}" title="Renomear">✏️</button>
  <button class="btn-icon btn-danger" data-acao="del-et" data-uid="${u.id}" data-eid="${e.id}" title="Excluir etapa">🗑</button>
</td>
      </tr>`;
      if(!abertaE)return;
      (e.servicos||[]).forEach((sv,isv)=>{
        const cSv=cE+'.'+(isv+1);
        const qtd=qtdServico(sv);
        const temMemo=sv.memo&&sv.memo.length;
        const memoAberta=estaAberto('sv-'+sv.id);
        html+=`<tr class="linha-servico linha-direta">
          <td class="col-codigo codigo">${cSv}</td>
          <td><strong>${sv.codigo?esc(sv.codigo)+' ':''}${esc(primeiraMaiuscula(sv.nome))}</strong>${temMemo?'<span class="tag-memo">M.C.</span>':''}</td>
          <td class="col-un">${esc(sv.unidadeMedida)}</td>
          <td class="col-num"><input class="qtd-servico" id="qtdsv_${sv.id}" data-svid="${sv.id}" aria-label="Quantidade de ${esc(sv.nome)}" inputmode="decimal" value="${esc(fmtNum.format(temMemo?qtd:(sv.qtdManual??0)))}" ${temMemo||!modoEdicao?'readonly':''} ${temMemo?'title="Quantidade calculada pela memória"':'title="Quantidade manual"'} /></td>
          <td class="col-num">${sv.valorUnitario==null?'—':fmtBRL.format(num(sv.valorUnitario))}</td>
          <td class="col-num total" id="totalsv_${sv.id}">${fmtBRL.format(totalServico(sv))}</td>
          <td class="col-acoes">
            ${temMemo?`<button class="btn-icon" data-acao="toggle" data-key="sv-${sv.id}" title="Recolher/expandir memória">${seta(memoAberta)}</button>`:''}
            <button class="btn-icon" data-acao="memo-sv" data-uid="${u.id}" data-eid="${e.id}" data-svid="${sv.id}" title="Adicionar linha na memória">🧮</button>
            <button class="btn-icon" data-acao="up-sv" data-uid="${u.id}" data-eid="${e.id}" data-svid="${sv.id}" title="Subir">↑</button>
            <button class="btn-icon" data-acao="down-sv" data-uid="${u.id}" data-eid="${e.id}" data-svid="${sv.id}" title="Descer">↓</button>
            <button class="btn-icon" data-acao="edit-sv" data-uid="${u.id}" data-eid="${e.id}" data-svid="${sv.id}" title="Editar">✏️</button>
            <button class="btn-icon btn-danger" data-acao="del-sv" data-uid="${u.id}" data-eid="${e.id}" data-svid="${sv.id}" title="Excluir">🗑</button>
          </td>
        </tr>`;
        if(temMemo&&memoAberta)html+=renderMemo(sv);
      });
      e.subEtapas.forEach((s,is)=>{
        const cS=cE+'.'+((e.servicos||[]).length+is+1);
        const abertaS=estaAberto('s-'+s.id);
        html+=`<tr class="grupo n3">
          <td class="col-codigo codigo">${cS}</td>
          <td><button class="btn-icon" data-acao="toggle" data-key="s-${s.id}" title="Recolher/expandir">${seta(abertaS)}</button><strong>${esc(primeiraMaiuscula(s.nome))}</strong></td>
          <td class="col-un"></td><td class="col-num"></td><td class="col-num"></td>
          <td class="col-num total" id="subtotalSub_${s.id}">${fmtBRL.format(subtotalSub(s))}</td>
          <td class="col-acoes">
  <button class="btn btn-primary btn-xs" data-acao="add-servico" data-uid="${u.id}" data-eid="${e.id}" data-sid="${s.id}">+ Serviço</button>
  <button class="btn-icon" data-acao="up-sub" data-uid="${u.id}" data-eid="${e.id}" data-sid="${s.id}" title="Subir">↑</button>
  <button class="btn-icon" data-acao="down-sub" data-uid="${u.id}" data-eid="${e.id}" data-sid="${s.id}" title="Descer">↓</button>
  <button class="btn-icon" data-acao="ren-sub" data-uid="${u.id}" data-eid="${e.id}" data-sid="${s.id}" title="Renomear">✏️</button>
  <button class="btn-icon btn-danger" data-acao="del-sub" data-uid="${u.id}" data-eid="${e.id}" data-sid="${s.id}" title="Excluir sub etapa">🗑</button>
</td>
        </tr>`;
        if(!abertaS)return;
        s.servicos.forEach((sv,isv)=>{
          const cSv=cS+'.'+(isv+1);
          const qtd=qtdServico(sv);
          const temMemo=sv.memo&&sv.memo.length;
          const memoAberta=estaAberto('sv-'+sv.id);
          html+=`<tr class="linha-servico">
            <td class="col-codigo codigo">${cSv}</td>
            <td><strong>${sv.codigo?esc(sv.codigo)+' ':''}${esc(primeiraMaiuscula(sv.nome))}</strong>${temMemo?'<span class="tag-memo">M.C.</span>':''}</td>
            <td class="col-un">${esc(sv.unidadeMedida)}</td>
            <td class="col-num"><input class="qtd-servico" id="qtdsv_${sv.id}" data-svid="${sv.id}" aria-label="Quantidade de ${esc(sv.nome)}" inputmode="decimal" value="${esc(fmtNum.format(temMemo?qtd:(sv.qtdManual??0)))}" ${temMemo||!modoEdicao?'readonly':''} ${temMemo?'title="Quantidade calculada pela memória"':'title="Quantidade manual"'} /></td>
            <td class="col-num">${sv.valorUnitario==null?'—':fmtBRL.format(num(sv.valorUnitario))}</td>
            <td class="col-num total" id="totalsv_${sv.id}">${fmtBRL.format(totalServico(sv))}</td>
            <td class="col-acoes">
              ${temMemo?`<button class="btn-icon" data-acao="toggle" data-key="sv-${sv.id}" title="Recolher/expandir memória">${seta(memoAberta)}</button>`:''}
              <button class="btn-icon" data-acao="memo-sv" data-uid="${u.id}" data-eid="${e.id}" data-sid="${s.id}" data-svid="${sv.id}" title="Adicionar linha na memória">🧮</button>
              <button class="btn-icon" data-acao="up-sv" data-uid="${u.id}" data-eid="${e.id}" data-sid="${s.id}" data-svid="${sv.id}" title="Subir">↑</button>
              <button class="btn-icon" data-acao="down-sv" data-uid="${u.id}" data-eid="${e.id}" data-sid="${s.id}" data-svid="${sv.id}" title="Descer">↓</button>
              <button class="btn-icon" data-acao="edit-sv" data-uid="${u.id}" data-eid="${e.id}" data-sid="${s.id}" data-svid="${sv.id}" title="Editar">✏️</button>
              <button class="btn-icon btn-danger" data-acao="del-sv" data-uid="${u.id}" data-eid="${e.id}" data-sid="${s.id}" data-svid="${sv.id}" title="Excluir">🗑</button>
            </td>
          </tr>`;
          if(temMemo&&memoAberta)html+=renderMemo(sv);
        });
      });
    });
  });
  return html;
}

function renderMemo(sv){
  const linhas=sv.memo.map((l,indice)=>{const r=calcularLinha(l);return `
  <tr>
    <td class="memo-indice">${indice+1}</td>
    <td><input data-lid="${l.id}" data-campo="descricao" value="${esc(l.descricao)}" placeholder="Descrição" aria-label="Descrição da linha ${indice+1}" /></td>
    <td><input data-lid="${l.id}" data-campo="quantidade" inputmode="decimal" value="${esc(l.quantidade)}" placeholder="1" aria-label="Quantidade da linha ${indice+1}" /></td>
    <td><input data-lid="${l.id}" data-campo="coeficiente" inputmode="decimal" value="${esc(l.coeficiente)}" placeholder="1" aria-label="Coeficiente da linha ${indice+1}" /></td>
    <td><input data-lid="${l.id}" data-campo="comprimento" inputmode="decimal" value="${esc(l.comprimento)}" placeholder="m" aria-label="Comprimento da linha ${indice+1}" /></td>
    <td><input data-lid="${l.id}" data-campo="altura" inputmode="decimal" value="${esc(l.altura)}" placeholder="m" aria-label="Altura da linha ${indice+1}" /></td>
    <td><input data-lid="${l.id}" data-campo="largura" inputmode="decimal" value="${esc(l.largura)}" placeholder="m" aria-label="Largura da linha ${indice+1}" /></td>
    <td class="res${r.incompleto?' memo-incompleto':''}" id="res_${l.id}" title="${r.incompleto?'Informe comprimento e altura para calcular dimensões.':''}">${r.incompleto?'Incompleta':r.valor==null?'—':fmtNum.format(r.valor)+' '+r.tipo}</td>
    <td><button class="btn-icon btn-danger" data-acao="del-linha" data-lid="${l.id}" title="Remover" aria-label="Remover linha ${indice+1}">×</button></td>
  </tr>`;}).join('');
  const soma=qtdServico(sv);
  return `
  <tr class="linha-memo"><td colspan="7">
    <div class="memo-box">
      <div class="memo-head">
        <div><h4>Memória de cálculo</h4><p>${esc(sv.nome)} · ${sv.memo.length} linha(s)</p></div>
        <div class="memo-head-total"><span>Quantidade</span><strong id="soma_${sv.id}">${fmtNum.format(soma)} ${esc(sv.unidadeMedida)}</strong></div>
      </div>
      <div class="memo-table-wrap"><table class="tabela-memo">
        <thead><tr><th>#</th><th>Descrição</th><th>Qtd</th><th>Coef.</th><th>Compr.</th><th>Altura</th><th>Largura</th><th>Resultado</th><th></th></tr></thead>
        <tbody>${linhas}</tbody>
      </table></div>
      <div class="memo-add">
        <button class="btn btn-primary btn-sm" data-acao="add-linha" data-svid="${sv.id}">+ Linha</button>
        <button class="btn btn-ghost btn-sm" data-acao="clear-memo" data-svid="${sv.id}">Quantidade manual</button>
      </div>
    </div>
  </td></tr>`;
}

/* ---------- formulário serviço ---------- */
$('#formServico').addEventListener('submit',(ev)=>{
  ev.preventDefault();
  const o=orcamentoAtivo();if(!o)return;
  const svid=$('#fServicoId').value;
  const etapaId=$('#fEtapaId').value;
  const subId=$('#fSubId').value;
  const dados={nome:$('#fNome').value.trim(),unidadeMedida:$('#fUnidadeMedida').value.trim(),valorUnitario:num($('#fValor').value),codigo:$('#fCodigoSinapi').value.trim(),catalogoTipo:$('#fCatalogoTipo').value||null,catalogoId:$('#fCatalogoId').value||null,catalogoDetalheId:$('#fCatalogoDetalheId').value||null};
  if(!['composicao','sinapi'].includes(dados.catalogoTipo)||!dados.catalogoId||!dados.nome||!dados.unidadeMedida||dados.valorUnitario==null){alert('Selecione uma composição própria ou uma composição SINAPI válida.');return;}
  if(dados.catalogoTipo==='composicao'){
    const composicao=window.Composicoes&&window.Composicoes.carregar().find(item=>item.id===dados.catalogoId&&(item.base==='propria'||!item.base));
    if(!composicao){alert('A composição própria selecionada não está mais disponível. Escolha outra composição.');return;}
    dados.nome=composicao.nome;dados.unidadeMedida=composicao.unidade||'un';dados.valorUnitario=num(composicao.valorUnitario);
  }
  if(svid){
    const sv=acharServicoPorId(o,svid);
    if(sv){sv.nome=dados.nome;sv.unidadeMedida=dados.unidadeMedida;sv.valorUnitario=dados.valorUnitario;sv.codigo=dados.codigo;sv.catalogoTipo=dados.catalogoTipo;sv.catalogoId=dados.catalogoId;sv.catalogoDetalheId=dados.catalogoDetalheId;}
  }else{
    const etapa = etapaId ? acharEtapa(o, $('#fUnidadeId').value, etapaId) : null;
    const sub = subId ? acharSubPorId(o, subId) : null;
    if(sub){
      sub.servicos.push({id:uid(),...dados,qtdManual:null,memo:[]});
    } else if(etapa){
      etapa.servicos = etapa.servicos || [];
      etapa.servicos.push({id:uid(),...dados,qtdManual:null,memo:[]});
    } else {
      alert('Não foi possível localizar a etapa para salvar o serviço.');
      return;
    }
  }
  salvar();renderTudo();$('#modalServico').close();
});

/* ---------- exportar Excel / PDF ---------- */
function exportarExcel(){
  const o=orcamentoAtivo();if(!o)return;
  const unidades=uu(o);
  const rows=[];
  rows.push(['CÓDIGO','DESCRIÇÃO','UN.','QUANTIDADE ORÇADA','PREÇO UNITÁRIO','PREÇO TOTAL']);
  unidades.forEach((u,iu)=>{
    rows.push([String(iu+1),u.nome,'',null,null,num2(subtotalUnidade(o,u))]);
    u.etapas.forEach((e,ie)=>{
      const codigoEtapa=`${iu+1}.${ie+1}`;
      rows.push([codigoEtapa,'   '+e.nome,'',null,null,num2(subtotalEtapa(e))]);
      (e.servicos||[]).forEach((sv,isv)=>{
        rows.push([`${codigoEtapa}.${isv+1}`,'      '+sv.nome,sv.unidadeMedida||'',num2(qtdServico(sv)),num2(num(sv.valorUnitario)),num2(totalServico(sv))]);
      });
      e.subEtapas.forEach((s,is)=>{
        const codigoSub=`${codigoEtapa}.${(e.servicos||[]).length+is+1}`;
        rows.push([codigoSub,'      '+s.nome,'',null,null,num2(subtotalSub(s))]);
        s.servicos.forEach((sv,isv)=>{
          rows.push([`${codigoSub}.${isv+1}`,'         '+sv.nome,sv.unidadeMedida||'',num2(qtdServico(sv)),num2(num(sv.valorUnitario)),num2(totalServico(sv))]);
        });
      });
    });
  });
  rows.push([]);
  rows.push(['','TOTAL GERAL','','','',num2(totalOrcamento(o))]);

  const mrows=[['CÓDIGO DO SERVIÇO','SERVIÇO','DESCRIÇÃO','QTD','COEF.','COMPR.','ALTURA','LARGURA','RESULTADO']];
  unidades.forEach((u,iu)=>{
    u.etapas.forEach((e,ie)=>{
      const codigoEtapa=`${iu+1}.${ie+1}`;
      (e.servicos||[]).forEach((sv,isv)=>{
        if(sv.memo&&sv.memo.length){
          const cod=`${codigoEtapa}.${isv+1}`;
          sv.memo.forEach(l=>{
            const r=calcularLinha(l);
            mrows.push([cod,sv.nome,l.descricao||'',num2(num(l.quantidade)),num2(num(l.coeficiente)),num2(num(l.comprimento)),num2(num(l.altura)),num2(num(l.largura)),r.valor==null?'':num2(r.valor)+' '+r.tipo]);
          });
        }
      });
      e.subEtapas.forEach((s,is)=>{
        const codigoSub=`${codigoEtapa}.${(e.servicos||[]).length+is+1}`;
        s.servicos.forEach((sv,isv)=>{
          if(sv.memo&&sv.memo.length){
            const cod=`${codigoSub}.${isv+1}`;
            sv.memo.forEach(l=>{
              const r=calcularLinha(l);
              mrows.push([cod,sv.nome,l.descricao||'',num2(num(l.quantidade)),num2(num(l.coeficiente)),num2(num(l.comprimento)),num2(num(l.altura)),num2(num(l.largura)),r.valor==null?'':num2(r.valor)+' '+r.tipo]);
            });
          }
        });
      });
    });
  });

  const nomeArquivo=((o.codigo||'orcamento')+'-'+o.nome).replace(/[^a-zA-Z0-9\-_]+/g,'_');
  try{
    if(typeof XLSX!=='undefined'){
      const ws=XLSX.utils.aoa_to_sheet(rows);
      ws['!cols']=[{wch:14},{wch:50},{wch:6},{wch:14},{wch:14},{wch:16}];
      const wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,ws,'Orçamento');
      if(mrows.length>1){
        const ws2=XLSX.utils.aoa_to_sheet(mrows);
        ws2['!cols']=[{wch:14},{wch:36},{wch:36},{wch:8},{wch:8},{wch:10},{wch:8},{wch:9},{wch:14}];
        XLSX.utils.book_append_sheet(wb,ws2,'Memória de cálculo');
      }
      XLSX.writeFile(wb,nomeArquivo+'.xlsx');
      return;
    }
  }catch(err){}
  const csv='\uFEFF'+rows.map(r=>r.map(c=>{if(c==null)return'';const s=String(c).replace(/"/g,'""');return /[";]/.test(s)?'"'+s+'"':s;}).join(';')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=nomeArquivo+'.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(a.href);
}
function exportarPdf(){window.print();}

/* ---------- eventos ---------- */
$('#listaOrcamentos').addEventListener('click',(ev)=>{
  const b=ev.target.closest('[data-acao]');if(b){
    if(b.dataset.acao==='ver-orcamento'){abrirParaVisualizar(b.dataset.id);return;}
    if(b.dataset.acao==='editar-orcamento'){abrirParaEditar(b.dataset.id);return;}
    if(b.dataset.acao==='del-orcamento'){excluirOrcamento(b.dataset.id);return;}
    if(b.dataset.acao==='dup-orcamento'){duplicarOrcamento(b.dataset.id);return;}
  }
});

$('#corpoTabela').addEventListener('click',(ev)=>{
  const b=ev.target.closest('[data-acao]');if(!b)return;
  const o=orcamentoAtivo();if(!o)return;
  const acao=b.dataset.acao;
  if(!modoEdicao && acao!=='toggle')return;
  const uid_=b.dataset.uid,eid=b.dataset.eid,sid=b.dataset.sid,svid=b.dataset.svid,lid=b.dataset.lid;
  const u=acharUnidade(o,uid_),e=acharEtapa(o,uid_,eid),s=acharSub(o,uid_,eid,sid),sv=(acharServicoDiretoEmEtapa(o,uid_,eid,svid) || acharServico(o,uid_,eid,sid,svid));

  if(acao==='toggle'){alternar(b.dataset.key);return;}

  switch(acao){
    case 'up-un':moverUnidade(o,u,-1);break;
    case 'down-un':moverUnidade(o,u,1);break;
    case 'ren-un':renomearUnidade(u);break;
    case 'del-un':excluirUnidade(o,u);break;
    case 'add-etapa':addEtapa(u);break;

    case 'up-et':moverEtapa(u,e,-1);break;
    case 'down-et':moverEtapa(u,e,1);break;
    case 'ren-et':renomearEtapa(e);break;
    case 'del-et':excluirEtapa(u,e);break;
    case 'add-sub':addSub(e);break;

    case 'up-sub':moverSub(e,s,-1);break;
    case 'down-sub':moverSub(e,s,1);break;
    case 'ren-sub':renomearSub(s);break;
    case 'del-sub':excluirSub(e,s);break;
    case 'add-servico':{
      if(s){
        abrirModalServico(null,s,e,u);
      }else{
        abrirModalServico(null,null,e,u);
      }
      break;
    }

    case 'up-sv':moverServico(e,s,sv,-1);break;
    case 'down-sv':moverServico(e,s,sv,1);break;
    case 'edit-sv':abrirModalServico(sv);break;
    case 'del-sv':excluirServico(e,s,sv);break;
    case 'mover-sv-para':{
      // Mover serviço para outra sub-étapa (precisa selecionar destino)
      const subDestinoId = prompt('Digite o ID da sub-étapa destino:');
      if(subDestinoId){
        const subDestino = acharSubPorId(o, subDestinoId);
        if(subDestino && subDestino !== s){
          moverServicoEntreSub(s, subDestino, sv);
        }else{
          alert('Sub-étapa destino inválida ou mesma sub-étapa');
        }
      }
      break;
    }
    case 'mover-sub-para':{
      // Mover sub-étapa para outra etapa (precisa selecionar destino)
      const etapaDestinoId = prompt('Digite o ID da etapa destino:');
      if(etapaDestinoId){
        const etapaDestino = acharEtapa(o, uid_, etapaDestinoId);
        if(etapaDestino && etapaDestino !== e){
          moverSubEntreEtapa(e, etapaDestino, s);
        }else{
          alert('Etapa destino inválida ou mesma etapa');
        }
      }
      break;
    }

    case 'memo-sv':case 'add-linha':{
      const svx=acharServicoPorId(o,svid);
      if(svx){svx.memo=svx.memo||[];svx.memo.push({id:uid(),descricao:'',comprimento:'',altura:'',largura:'',coeficiente:'',quantidade:''});state.expandidos['sv-'+svid]=true;salvar();renderTudo();}
      break;
    }
    case 'clear-memo':{
      const svx=acharServicoPorId(o,svid);
      if(svx&&svx.memo&&svx.memo.length&&confirm('Apagar toda a memória de cálculo deste serviço?')){svx.memo=[];salvar();renderTudo();}
      break;
    }
    case 'del-linha':{
      const svx=acharServicoPorLinha(o,lid);
      if(svx){svx.memo=svx.memo.filter(l=>l.id!==lid);salvar();renderTudo();}
      break;
    }
  }
});

$('#corpoTabela').addEventListener('input',(ev)=>{
  if(!modoEdicao)return;
  const qtdInput=ev.target.closest('input.qtd-servico');
  if(qtdInput){
    const o=orcamentoAtivo();if(!o)return;
    const sv=acharServicoPorId(o,qtdInput.dataset.svid);if(!sv||sv.memo&&sv.memo.length)return;
    const quantidade=num(qtdInput.value);
    sv.qtdManual=Math.max(0,quantidade||0);
    salvar();
    const totalEl=document.getElementById('totalsv_'+sv.id);if(totalEl)totalEl.textContent=fmtBRL.format(totalServico(sv));
    atualizarTotaisVisuais(o);
    return;
  }
  const inp=ev.target.closest('input[data-lid]');if(!inp)return;
  const o=orcamentoAtivo();if(!o)return;
  const lid=inp.dataset.lid,campo=inp.dataset.campo;
  const sv=acharServicoPorLinha(o,lid);if(!sv)return;
  const l=sv.memo.find(x=>x.id===lid);if(!l)return;
  l[campo]=inp.value;
  salvar();
  const r=calcularLinha(l);
  const res=document.getElementById('res_'+lid);
  if(res){res.textContent=r.incompleto?'Incompleta':(r.valor==null?'—':fmtNum.format(r.valor)+' '+r.tipo);res.classList.toggle('memo-incompleto',!!r.incompleto);res.title=r.incompleto?'Informe comprimento e altura para calcular dimensões.':'';}
  const qCell=document.getElementById('qtdsv_'+sv.id);
  if(qCell)qCell.value=fmtNum.format(qtdServico(sv));
  const tCell=document.getElementById('totalsv_'+sv.id);
  if(tCell)tCell.textContent=fmtBRL.format(totalServico(sv));
  const somaEl=document.getElementById('soma_'+sv.id);
  if(somaEl)somaEl.textContent=fmtNum.format(qtdServico(sv))+' '+sv.unidadeMedida;
  atualizarTotaisVisuais(o);
});

$('#corpoTabela').addEventListener('change',(ev)=>{
  if(!modoEdicao)return;
  const qtdInput=ev.target.closest('input.qtd-servico');if(!qtdInput||qtdInput.readOnly)return;
  const o=orcamentoAtivo();if(!o)return;
  const sv=acharServicoPorId(o,qtdInput.dataset.svid);if(!sv||sv.memo&&sv.memo.length)return;
  qtdInput.value=fmtNum.format(qtdServico(sv));
});

$('#btnNovoOrcamento').addEventListener('click',criarOrcamento);
$('#btnNovoVazio').addEventListener('click',criarOrcamento);
$('#btnRenomear').addEventListener('click',renomearOrcamento);
$('#btnAddUnidade').addEventListener('click',addUnidade);
$('#btnCancelarModal').addEventListener('click',()=>$('#modalServico').close());
$('#fCatalogoItem').addEventListener('change',aplicarItemCatalogo);
$('#btnDuplicar').addEventListener('click',()=>{const o=orcamentoAtivo();if(o)duplicarOrcamento(o.id);});
$('#btnVersoes').addEventListener('click',()=>{const o=orcamentoAtivo();if(!o)return;renderVersoes(o);$('#comparacaoVersoes').innerHTML='';$('#modalVersoes').showModal();});
$('#btnGerarVersao').addEventListener('click',gerarVersao);
$('#btnCompararVersoes').addEventListener('click',compararVersoes);
$('#btnFecharVersoes').addEventListener('click',()=>$('#modalVersoes').close());
$('#btnExportarExcel').addEventListener('click',exportarExcel);
$('#btnExportarPdf').addEventListener('click',exportarPdf);
$('#btnSalvarOrcamento').addEventListener('click',salvarNoServidor);
$('#btnSalvarLista').addEventListener('click',salvarNoServidor);
$('#btnEntrarEdicao').addEventListener('click',()=>{
  const o=orcamentoAtivo();
  if(o)abrirParaEditar(o.id);
});
$('#btnLiberarBloqueio').addEventListener('click',liberarEdicaoAtual);
$('#btnLiberarBloqueioLista').addEventListener('click',liberarEdicaoAtual);
$('#btnVoltarLista').addEventListener('click',()=>{
  modoEdicao=false;
  atualizarStatusSalvamento();
  renderLista();
});
$('#btnExportar').addEventListener('click',()=>{
  if(!state.orcamentos.length){alert('Não há orçamentos para exportar.');return;}
  const blob=new Blob([JSON.stringify(state.orcamentos,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='ibuild-orcamentos-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(a.href);
});
$('#inputImportar').addEventListener('change',(ev)=>{
  const file=ev.target.files&&ev.target.files[0];ev.target.value='';if(!file)return;
  const reader=new FileReader();reader.onload=()=>{try{const dados=JSON.parse(reader.result);if(!Array.isArray(dados)||!dados.every(o=>o&&(Array.isArray(o.unidades)||Array.isArray(o.versoes))))throw new Error('formato');if(!confirm(`Importar ${dados.length} orçamento(s)? Os dados atuais serão SUBSTITUÍDOS.`))return;state.orcamentos=dados.map(migrarOrcamento);state.orcamentos.forEach(o=>{if(!o.codigo)o.codigo=proximoCodigo();});state.ativoId=dados.length?dados[0].id:null;state.expandidos={};salvar();renderTudo();alert('Backup importado.');}catch(e){alert('Arquivo inválido.');}};reader.readAsText(file);
});

renderTudo();
async function carregarDoServidor(){
  if(carregandoDoServidor || salvandoNoServidor)return;
  const snapshotLocalInicial = JSON.stringify(state.orcamentos);
  const possuiAlteracoesPendentes = snapshotServidor !== null && snapshotLocalInicial !== snapshotServidor;
  carregandoDoServidor = true;
  atualizarStatusSalvamento();
  try{
    const [res, perfilResposta] = await Promise.all([
      fetchComTimeout('/api/orcamentos'),
      fetchComTimeout('/api/auth/me')
    ]);
    if(!res.ok)throw new Error('API retornou ' + res.status);
    const resposta = await res.json();
    if(!resposta || !Array.isArray(resposta.dados)){
      throw new Error('A API retornou um formato de dados inválido');
    }
    if(perfilResposta.ok){
      const perfil = await perfilResposta.json();
      usuarioPodeEditar = Boolean(perfil.podeEditar || perfil.isAdmin);
      window.usuarioAtual = perfil;
    }else{
      usuarioPodeEditar = false;
      window.usuarioAtual = null;
    }
    document.dispatchEvent(new CustomEvent('app:profilechange'));
    const remotos = resposta.dados.map(orcamento=>{
      const copia = Object.assign({}, orcamento);
      if(copia.bloqueio)bloqueiosPorOrcamento[copia.id]=copia.bloqueio;
      else delete bloqueiosPorOrcamento[copia.id];
      delete copia.bloqueio;
      return migrarOrcamento(copia);
    });
    snapshotServidor = JSON.stringify(remotos);
    if(!possuiAlteracoesPendentes && JSON.stringify(state.orcamentos) === snapshotLocalInicial && (remotos.length || !state.orcamentos.length)){
      state.orcamentos = remotos;
      if(!state.orcamentos.some(orcamento=>orcamento.id === state.ativoId)){
        state.ativoId = state.orcamentos[0].id;
      }
    }

    localStorage.setItem(DB_KEY, JSON.stringify(state));
    carregamentoConcluido = true;
    renderTudo();
  }catch(erro){
    snapshotServidor = null;
    console.error('Não foi possível carregar os dados do banco:', erro);
  }finally{
    carregamentoConcluido = true;
    carregandoDoServidor = false;
    atualizarStatusSalvamento();
  }
}
document.addEventListener('app:viewchange', function (ev) {
  if (ev.detail && ev.detail.view === 'orcamento') carregarDoServidor();
});
document.addEventListener('catalogos:loaded', function () {
  renderTudo();
  const modalServico = document.getElementById('modalServico');
  if (modalServico && modalServico.open) {
    preencherCatalogoServico({catalogoTipo: 'composicao', catalogoId: $('#fCatalogoItem').value});
  }
});
carregarDoServidor();
window.state = state;
