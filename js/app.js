'use strict';
const DB_KEY='ibuild_orcamentos_v2';
const $=(s,c=document)=>c.querySelector(s);
const fmtBRL=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const fmtNum=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2});

function uid(){return window.crypto&&crypto.randomUUID?crypto.randomUUID():'id-'+Date.now()+'-'+Math.random().toString(36).slice(2,10);}
function esc(s){return String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');}
function num(v){if(v==null||String(v).trim()==='')return null;let s=String(v).trim();if(s.includes(',')){s=s.replace(/\./g,'').replace(',','.');}else{const d=(s.match(/\./g)||[]).length;if(d>1)s=s.replace(/\./g,'');}const n=Number(s);return isNaN(n)?null:n;}

function estadoInicial(){return{orcamentos:[],ativoId:null};}
function carregarEstado(){try{const raw=localStorage.getItem(DB_KEY);if(!raw)return estadoInicial();const s=JSON.parse(raw);return{orcamentos:Array.isArray(s.orcamentos)?s.orcamentos:[],ativoId:s.ativoId||null};}catch(e){return estadoInicial();}}
const state=carregarEstado();
function salvar(){localStorage.setItem(DB_KEY,JSON.stringify(state));}

function orcamentoAtivo(){return state.orcamentos.find(o=>o.id===state.ativoId)||null;}

/* ---------- navegação na árvore ---------- */
function acharUnidade(o,uid_){return o.unidades.find(u=>u.id===uid_);}
function acharEtapa(o,uid_,eid){const u=acharUnidade(o,uid_);return u?u.etapas.find(e=>e.id===eid):null;}
function acharSub(o,uid_,eid,sid){const e=acharEtapa(o,uid_,eid);return e?e.subEtapas.find(s=>s.id===sid):null;}
function acharServico(o,uid_,eid,sid,svid){const s=acharSub(o,uid_,eid,sid);return s?s.servicos.find(x=>x.id===svid):null;}
function acharServicoPorId(o,svid){
  for(const u of o.unidades)for(const e of u.etapas)for(const s of e.subEtapas){
    const sv=s.servicos.find(x=>x.id===svid);if(sv)return sv;
  }
  return null;
}
function acharServicoPorLinha(o,lid){
  for(const u of o.unidades)for(const e of u.etapas)for(const s of e.subEtapas)for(const sv of s.servicos){
    if(sv.memo&&sv.memo.find(x=>x.id===lid))return sv;
  }
  return null;
}
function acharSubPorId(o,sid){
  for(const u of o.unidades)for(const e of u.etapas){
    const s=e.subEtapas.find(x=>x.id===sid);if(s)return s;
  }
  return null;
}

/* ---------- orçamentos ---------- */
function criarOrcamento(nome){const o={id:uid(),nome:(nome||'').trim()||'Orçamento sem nome',criadoEm:new Date().toISOString(),unidades:[]};state.orcamentos.push(o);state.ativoId=o.id;salvar();renderTudo();}
function renomearOrcamento(){const o=orcamentoAtivo();if(!o)return;const n=prompt('Nome do orçamento:',o.nome);if(n===null)return;o.nome=n.trim()||o.nome;salvar();renderTudo();}
function excluirOrcamento(id){const o=state.orcamentos.find(x=>x.id===id);if(!o)return;if(!confirm(`Excluir o orçamento "${o.nome}"?`))return;state.orcamentos=state.orcamentos.filter(x=>x.id!==id);if(state.ativoId===id)state.ativoId=state.orcamentos.length?state.orcamentos[0].id:null;salvar();renderTudo();}
function ativarOrcamento(id){if(!state.orcamentos.some(o=>o.id===id))return;state.ativoId=id;salvar();renderTudo();}

/* ---------- CRUD níveis ---------- */
function addUnidade(){const o=orcamentoAtivo();const n=prompt('Nome da unidade construtiva (ex.: Casa 01):','');if(n===null||!n.trim())return;o.unidades.push({id:uid(),nome:n.trim(),etapas:[]});salvar();renderTudo();}
function renomearUnidade(u){const n=prompt('Renomear unidade construtiva:',u.nome);if(n===null)return;u.nome=n.trim()||u.nome;salvar();renderTudo();}
function excluirUnidade(o,u){if(!confirm(`Excluir a unidade "${u.nome}" e tudo dentro dela?`))return;o.unidades=o.unidades.filter(x=>x.id!==u.id);salvar();renderTudo();}
function moverUnidade(o,u,dir){const i=o.unidades.indexOf(u);const j=i+dir;if(j<0||j>=o.unidades.length)return;[o.unidades[i],o.unidades[j]]=[o.unidades[j],o.unidades[i]];salvar();renderTudo();}

function addEtapa(u){const n=prompt('Nome da etapa (ex.: Estrutura):','');if(n===null||!n.trim())return;u.etapas.push({id:uid(),nome:n.trim(),subEtapas:[]});salvar();renderTudo();}
function renomearEtapa(e){const n=prompt('Renomear etapa:',e.nome);if(n===null)return;e.nome=n.trim()||e.nome;salvar();renderTudo();}
function excluirEtapa(u,e){if(!confirm(`Excluir a etapa "${e.nome}" e tudo dentro dela?`))return;u.etapas=u.etapas.filter(x=>x.id!==e.id);salvar();renderTudo();}
function moverEtapa(u,e,dir){const i=u.etapas.indexOf(e);const j=i+dir;if(j<0||j>=u.etapas.length)return;[u.etapas[i],u.etapas[j]]=[u.etapas[j],u.etapas[i]];salvar();renderTudo();}

function addSub(e){const n=prompt('Nome da sub etapa (ex.: Paredes):','');if(n===null||!n.trim())return;e.subEtapas.push({id:uid(),nome:n.trim(),servicos:[]});salvar();renderTudo();}
function renomearSub(s){const n=prompt('Renomear sub etapa:',s.nome);if(n===null)return;s.nome=n.trim()||s.nome;salvar();renderTudo();}
function excluirSub(e,s){if(!confirm(`Excluir a sub etapa "${s.nome}" e seus serviços?`))return;e.subEtapas=e.subEtapas.filter(x=>x.id!==s.id);salvar();renderTudo();}
function moverSub(e,s,dir){const i=e.subEtapas.indexOf(s);const j=i+dir;if(j<0||j>=e.subEtapas.length)return;[e.subEtapas[i],e.subEtapas[j]]=[e.subEtapas[j],e.subEtapas[i]];salvar();renderTudo();}

function abrirModalServico(sv,sub){$('#fServicoId').value=sv?sv.id:'';$('#fSubId').value=sub?sub.id:'';$('#modalTitulo').textContent=sv?'Editar serviço':'Adicionar serviço';$('#fNome').value=sv?sv.nome:'';$('#fUnidadeMedida').value=sv?sv.unidadeMedida:'m²';$('#fValor').value=sv&&sv.valorUnitario!=null?sv.valorUnitario:'';$('#modalServico').showModal();$('#fNome').focus();}
function renomearServico(sv){const n=prompt('Renomear serviço:',sv.nome);if(n===null)return;sv.nome=n.trim()||sv.nome;salvar();renderTudo();}
function excluirServico(s,sv){if(!confirm(`Excluir o serviço "${sv.nome}"?`))return;s.servicos=s.servicos.filter(x=>x.id!==sv.id);salvar();renderTudo();}
function moverServico(s,sv,dir){const i=s.servicos.indexOf(sv);const j=i+dir;if(j<0||j>=s.servicos.length)return;[s.servicos[i],s.servicos[j]]=[s.servicos[j],s.servicos[i]];salvar();renderTudo();}

/* ---------- memória de cálculo ---------- */
function calcularLinha(l){
  const c=num(l.comprimento),a=num(l.altura),w=num(l.largura);
  const q=num(l.quantidade),coef=num(l.coeficiente);
  let base,tipo;
  if(c!=null&&a!=null&&w!=null){base=c*a*w;tipo='m³';}
  else if(c!=null&&a!=null){base=c*a;tipo='m²';}
  else{base=1;tipo='qtd';}
  if(c==null&&a==null&&w==null&&q==null&&coef==null)return{valor:null,tipo:''};
  return{valor:base*(q??1)*(coef??1),tipo};
}
function qtdServico(sv){if(sv.memo&&sv.memo.length){return sv.memo.reduce((acc,l)=>{const r=calcularLinha(l);return acc+(r.valor||0);},0);}return num(sv.qtdManual)||0;}
function totalServico(sv){return qtdServico(sv)*(num(sv.valorUnitario)||0);}
function totalOrcamento(o){let t=0;for(const u of o.unidades)for(const e of u.etapas)for(const s of e.subEtapas)for(const sv of s.servicos)t+=totalServico(sv);return t;}
function contarServicos(o){let n=0;for(const u of o.unidades)for(const e of u.etapas)for(const s of e.subEtapas)n+=s.servicos.length;return n;}
function subtotalSub(s){return s.servicos.reduce((a,sv)=>a+totalServico(sv),0);}
function subtotalEtapa(e){let t=0;for(const s of e.subEtapas)for(const sv of s.servicos)t+=totalServico(sv);return t;}
function subtotalUnidade(o,u){let t=0;for(const e of u.etapas)for(const s of e.subEtapas)for(const sv of s.servicos)t+=totalServico(sv);return t;}

/* ---------- renderização ---------- */
function renderTudo(){renderLista();renderConteudo();}

function renderLista(){const ul=$('#listaOrcamentos');if(!state.orcamentos.length){ul.innerHTML='<li class="lista-vazia">Nenhum orçamento.<br>Crie com "+ Novo".</li>';return;}
ul.innerHTML=state.orcamentos.map(o=>{const ativo=o.id===state.ativoId?' ativo':'';return `<li class="orcamento-item${ativo}" data-orcamento-id="${o.id}"><div class="oi-info"><strong>${esc(o.nome)}</strong><span>${fmtBRL.format(totalOrcamento(o))} · ${new Date(o.criadoEm).toLocaleDateString('pt-BR')}</span></div><button class="btn-icon btn-danger" data-acao="del-orcamento" data-id="${o.id}" title="Excluir">🗑</button></li>`;}).join('');}

function renderConteudo(){const o=orcamentoAtivo();const vazio=$('#contentVazio');const orc=$('#contentOrcamento');if(!o){vazio.classList.remove('hidden');orc.classList.add('hidden');return;}vazio.classList.add('hidden');orc.classList.remove('hidden');
$('#orcamentoNome').textContent=o.nome;
$('#orcamentoMeta').textContent='Criado em '+new Date(o.criadoEm).toLocaleDateString('pt-BR')+' · '+contarServicos(o)+' serviço(s)';
$('#totalGeral').textContent=fmtBRL.format(totalOrcamento(o));
$('#totalServicos').textContent=contarServicos(o);
$('#totalRodape').textContent=fmtBRL.format(totalOrcamento(o));
$('#corpoTabela').innerHTML=renderTabela(o);}

function renderTabela(o){
  if(!o.unidades.length)return `<tr><td colspan="7" class="sem-servicos">Nenhuma unidade construtiva ainda.<br>Clique em <strong>+ Unidade construtiva</strong> para começar.</td></tr>`;
  let html='';
  o.unidades.forEach((u,iu)=>{
    const cU=iu+1;
    html+=`<tr class="grupo n1">
      <td class="col-codigo codigo">${cU}</td>
      <td><strong>${esc(u.nome)}</strong><button class="btn btn-primary btn-xs" data-acao="add-etapa" data-uid="${u.id}">+ Etapa</button></td>
      <td class="col-un"></td><td class="col-num"></td><td class="col-num"></td>
      <td class="col-num total">${fmtBRL.format(subtotalUnidade(o,u))}</td>
      <td class="col-acoes">
        <button class="btn-icon" data-acao="up-un" data-uid="${u.id}" title="Subir">↑</button>
        <button class="btn-icon" data-acao="down-un" data-uid="${u.id}" title="Descer">↓</button>
        <button class="btn-icon" data-acao="ren-un" data-uid="${u.id}" title="Renomear">✏️</button>
        <button class="btn-icon btn-danger" data-acao="del-un" data-uid="${u.id}" title="Excluir unidade">🗑</button>
      </td>
    </tr>`;
    u.etapas.forEach((e,ie)=>{
      const cE=cU+'.'+(ie+1);
      html+=`<tr class="grupo n2">
        <td class="col-codigo codigo">${cE}</td>
        <td><strong>${esc(e.nome)}</strong><button class="btn btn-primary btn-xs" data-acao="add-sub" data-uid="${u.id}" data-eid="${e.id}">+ Sub Etapa</button></td>
        <td class="col-un"></td><td class="col-num"></td><td class="col-num"></td>
        <td class="col-num total">${fmtBRL.format(subtotalEtapa(e))}</td>
        <td class="col-acoes">
          <button class="btn-icon" data-acao="up-et" data-uid="${u.id}" data-eid="${e.id}" title="Subir">↑</button>
          <button class="btn-icon" data-acao="down-et" data-uid="${u.id}" data-eid="${e.id}" title="Descer">↓</button>
          <button class="btn-icon" data-acao="ren-et" data-uid="${u.id}" data-eid="${e.id}" title="Renomear">✏️</button>
          <button class="btn-icon btn-danger" data-acao="del-et" data-uid="${u.id}" data-eid="${e.id}" title="Excluir etapa">🗑</button>
        </td>
      </tr>`;
      e.subEtapas.forEach((s,is)=>{
        const cS=cE+'.'+(is+1);
        html+=`<tr class="grupo n3">
          <td class="col-codigo codigo">${cS}</td>
          <td><strong>${esc(s.nome)}</strong><button class="btn btn-primary btn-xs" data-acao="add-servico" data-uid="${u.id}" data-eid="${e.id}" data-sid="${s.id}">+ Serviço</button></td>
          <td class="col-un"></td><td class="col-num"></td><td class="col-num"></td>
          <td class="col-num total">${fmtBRL.format(subtotalSub(s))}</td>
          <td class="col-acoes">
            <button class="btn-icon" data-acao="up-sub" data-uid="${u.id}" data-eid="${e.id}" data-sid="${s.id}" title="Subir">↑</button>
            <button class="btn-icon" data-acao="down-sub" data-uid="${u.id}" data-eid="${e.id}" data-sid="${s.id}" title="Descer">↓</button>
            <button class="btn-icon" data-acao="ren-sub" data-uid="${u.id}" data-eid="${e.id}" data-sid="${s.id}" title="Renomear">✏️</button>
            <button class="btn-icon btn-danger" data-acao="del-sub" data-uid="${u.id}" data-eid="${e.id}" data-sid="${s.id}" title="Excluir sub etapa">🗑</button>
          </td>
        </tr>`;
        s.servicos.forEach((sv,isv)=>{
          const cSv=cS+'.'+(isv+1);
          const qtd=qtdServico(sv);
          html+=`<tr class="linha-servico">
            <td class="col-codigo codigo">${cSv}</td>
            <td><strong>${esc(sv.nome)}</strong>${sv.memo&&sv.memo.length?'<span class="tag-memo">memória de cálculo</span>':''}</td>
            <td class="col-un">${esc(sv.unidadeMedida)}</td>
            <td class="col-num" id="qtdsv_${sv.id}">${fmtNum.format(qtd)}</td>
            <td class="col-num">${sv.valorUnitario==null?'—':fmtBRL.format(num(sv.valorUnitario))}</td>
            <td class="col-num total" id="totalsv_${sv.id}">${fmtBRL.format(totalServico(sv))}</td>
            <td class="col-acoes">
              <button class="btn-icon" data-acao="memo-sv" data-uid="${u.id}" data-eid="${e.id}" data-sid="${s.id}" data-svid="${sv.id}" title="Memória de cálculo">🧮</button>
              <button class="btn-icon" data-acao="edit-sv" data-uid="${u.id}" data-eid="${e.id}" data-sid="${s.id}" data-svid="${sv.id}" title="Editar">✏️</button>
              <button class="btn-icon btn-danger" data-acao="del-sv" data-uid="${u.id}" data-eid="${e.id}" data-sid="${s.id}" data-svid="${sv.id}" title="Excluir">🗑</button>
              <button class="btn-icon" data-acao="up-sv" data-uid="${u.id}" data-eid="${e.id}" data-sid="${s.id}" data-svid="${sv.id}" title="Subir">↑</button>
              <button class="btn-icon" data-acao="down-sv" data-uid="${u.id}" data-eid="${e.id}" data-sid="${s.id}" data-svid="${sv.id}" title="Descer">↓</button>
            </td>
          </tr>`;
          if(sv.memo&&sv.memo.length)html+=renderMemo(sv);
        });
      });
    });
  });
  return html;
}

function renderMemo(sv){
  const linhas=sv.memo.map(l=>{const r=calcularLinha(l);return `
  <tr>
    <td><input data-lid="${l.id}" data-campo="descricao" value="${esc(l.descricao)}" placeholder="Descrição" /></td>
    <td><input data-lid="${l.id}" data-campo="quantidade" inputmode="decimal" value="${esc(l.quantidade)}" placeholder="Qtd" /></td>
    <td><input data-lid="${l.id}" data-campo="coeficiente" inputmode="decimal" value="${esc(l.coeficiente)}" placeholder="Coef." /></td>
    <td><input data-lid="${l.id}" data-campo="comprimento" inputmode="decimal" value="${esc(l.comprimento)}" placeholder="Compr." /></td>
    <td><input data-lid="${l.id}" data-campo="altura" inputmode="decimal" value="${esc(l.altura)}" placeholder="Alt." /></td>
    <td><input data-lid="${l.id}" data-campo="largura" inputmode="decimal" value="${esc(l.largura)}" placeholder="Larg." /></td>
    <td class="res" id="res_${l.id}">${r.valor==null?'—':fmtNum.format(r.valor)+' '+r.tipo}</td>
    <td><button class="btn-icon btn-danger" data-acao="del-linha" data-lid="${l.id}" title="Remover">✕</button></td>
  </tr>`;}).join('');
  const soma=qtdServico(sv);
  return `
  <tr class="linha-memo"><td colspan="7">
    <div class="memo-box">
      <div class="memo-head">
        <h4>🧮 Memória de cálculo — ${esc(sv.nome)}</h4>
        <span class="memo-soma">Soma: <strong id="soma_${sv.id}">${fmtNum.format(soma)} ${esc(sv.unidadeMedida)}</strong></span>
      </div>
      <table class="tabela-memo">
        <thead><tr><th>Descrição</th><th>Qtd</th><th>Coef.</th><th>Compr.</th><th>Altura</th><th>Largura</th><th>Resultado</th><th></th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <div class="memo-add">
        <button class="btn btn-primary btn-sm" data-acao="add-linha" data-svid="${sv.id}">+ Adicionar linha</button>
        <button class="btn btn-ghost btn-sm" data-acao="clear-memo" data-svid="${sv.id}">Apagar memória</button>
      </div>
      <p class="memo-aviso">ℹ️ <b>Comprimento + Altura</b> → m² · <b>+ Largura</b> → m³ · só <b>Qtd</b> → qtd. A <b>Qtd</b> e o <b>Coef.</b> multiplicam o resultado.</p>
    </div>
  </td></tr>`;
}

/* ---------- formulário serviço ---------- */
$('#formServico').addEventListener('submit',(ev)=>{
  ev.preventDefault();
  const o=orcamentoAtivo();if(!o)return;
  const svid=$('#fServicoId').value;
  const dados={nome:$('#fNome').value.trim(),unidadeMedida:$('#fUnidadeMedida').value.trim(),valorUnitario:num($('#fValor').value)};
  if(!dados.nome){alert('Informe o nome do serviço.');return;}
  if(svid){
    const sv=acharServicoPorId(o,svid);
    if(sv){sv.nome=dados.nome;sv.unidadeMedida=dados.unidadeMedida;sv.valorUnitario=dados.valorUnitario;}
  }else{
    const sub=acharSubPorId(o,$('#fSubId').value);
    if(sub){sub.servicos.push({id:uid(),nome:dados.nome,unidadeMedida:dados.unidadeMedida,valorUnitario:dados.valorUnitario,qtdManual:null,memo:[]});}
  }
  salvar();renderTudo();$('#modalServico').close();
});

/* ---------- eventos ---------- */
$('#listaOrcamentos').addEventListener('click',(ev)=>{
  const b=ev.target.closest('[data-acao="del-orcamento"]');if(b){excluirOrcamento(b.dataset.id);return;}
  const item=ev.target.closest('.orcamento-item');if(item)ativarOrcamento(item.dataset.orcamentoId);
});

$('#corpoTabela').addEventListener('click',(ev)=>{
  const b=ev.target.closest('[data-acao]');if(!b)return;
  const o=orcamentoAtivo();if(!o)return;
  const acao=b.dataset.acao;
  const uid_=b.dataset.uid,eid=b.dataset.eid,sid=b.dataset.sid,svid=b.dataset.svid,lid=b.dataset.lid;
  const u=acharUnidade(o,uid_),e=acharEtapa(o,uid_,eid),s=acharSub(o,uid_,eid,sid),sv=acharServico(o,uid_,eid,sid,svid);

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
    case 'add-servico':abrirModalServico(null,s);break;

    case 'up-sv':moverServico(s,sv,-1);break;
    case 'down-sv':moverServico(s,sv,1);break;
    case 'edit-sv':abrirModalServico(sv);break;
    case 'del-sv':excluirServico(s,sv);break;

    case 'memo-sv':case 'add-linha':{
      const svx=acharServicoPorId(o,svid);
      if(svx){svx.memo=svx.memo||[];svx.memo.push({id:uid(),descricao:'',comprimento:'',altura:'',largura:'',coeficiente:'',quantidade:''});salvar();renderTudo();}
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
  const inp=ev.target.closest('input[data-lid]');if(!inp)return;
  const o=orcamentoAtivo();if(!o)return;
  const lid=inp.dataset.lid,campo=inp.dataset.campo;
  const sv=acharServicoPorLinha(o,lid);if(!sv)return;
  const l=sv.memo.find(x=>x.id===lid);if(!l)return;
  l[campo]=inp.value;
  salvar();
  const r=calcularLinha(l);
  const res=document.getElementById('res_'+lid);
  if(res)res.textContent=(r.valor==null?'—':fmtNum.format(r.valor)+' '+r.tipo);
  const qCell=document.getElementById('qtdsv_'+sv.id);
  if(qCell)qCell.textContent=fmtNum.format(qtdServico(sv));
  const tCell=document.getElementById('totalsv_'+sv.id);
  if(tCell)tCell.textContent=fmtBRL.format(totalServico(sv));
  const somaEl=document.getElementById('soma_'+sv.id);
  if(somaEl)somaEl.textContent=fmtNum.format(qtdServico(sv))+' '+sv.unidadeMedida;
  $('#totalGeral').textContent=fmtBRL.format(totalOrcamento(o));
  $('#totalRodape').textContent=fmtBRL.format(totalOrcamento(o));
});

$('#btnNovoOrcamento').addEventListener('click',()=>{const n=prompt('Nome do novo orçamento:','');if(n===null)return;criarOrcamento(n);});
$('#btnNovoVazio').addEventListener('click',()=>{const n=prompt('Nome do novo orçamento:','');if(n===null)return;criarOrcamento(n);});
$('#btnRenomear').addEventListener('click',renomearOrcamento);
$('#btnAddUnidade').addEventListener('click',addUnidade);
$('#btnCancelarModal').addEventListener('click',()=>$('#modalServico').close());
$('#btnExportar').addEventListener('click',()=>{
  if(!state.orcamentos.length){alert('Não há orçamentos para exportar.');return;}
  const blob=new Blob([JSON.stringify(state.orcamentos,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='ibuild-orcamentos-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(a.href);
});
$('#inputImportar').addEventListener('change',(ev)=>{
  const file=ev.target.files&&ev.target.files[0];ev.target.value='';if(!file)return;
  const reader=new FileReader();reader.onload=()=>{try{const dados=JSON.parse(reader.result);if(!Array.isArray(dados)||!dados.every(o=>o&&Array.isArray(o.unidades)))throw new Error('formato');if(!confirm(`Importar ${dados.length} orçamento(s)? Os dados atuais serão SUBSTITUÍDOS.`))return;state.orcamentos=dados;state.ativoId=dados.length?dados[0].id:null;salvar();renderTudo();alert('Backup importado.');}catch(e){alert('Arquivo inválido.');}};reader.readAsText(file);
});

renderTudo();
