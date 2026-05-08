/**
 * ui-jogos.js v3 - layout grid, penaltis centrados, 2 toggles, stats no modal
 */
let _ordemJogos = localStorage.getItem("bolao_ordem") || "grupos";
let _modoGrupos = localStorage.getItem("bolao_grupos_modo") || "topo";

function setOrdemJogos(v){ _ordemJogos=v; localStorage.setItem("bolao_ordem",v); renderAbaAtiva(); }
function setModoGrupos(v){ _modoGrupos=v; localStorage.setItem("bolao_grupos_modo",v); renderAbaAtiva(); }

/* ---- auto-simulacao ---- */
function _onInputPlacar(id, ehElim){ const _h=document.getElementById('sim-hg-'+id),_a=document.getElementById('sim-ag-'+id); if(_h&&_h.value<0)_h.value=0; if(_a&&_a.value<0)_a.value=0;
  const hg=parseInt(document.getElementById("sim-hg-"+id)?.value);
  const ag=parseInt(document.getElementById("sim-ag-"+id)?.value);
  const pw=document.getElementById("pen-wrap-"+id);
  if(pw){ (ehElim&&!isNaN(hg)&&!isNaN(ag)&&hg===ag)?pw.classList.add("visivel"):pw.classList.remove("visivel"); }
  if(isNaN(hg)||isNaN(ag)) return;
  if(ehElim&&hg===ag){ const ph=parseInt(document.getElementById("pen-hg-"+id)?.value),pa=parseInt(document.getElementById("pen-ag-"+id)?.value); if(isNaN(ph)||isNaN(pa)||ph===pa) return; simularResultado(id,hg,ag,true,ph>pa?"home":"away"); return; }
  simularResultado(id,hg,ag,false,null);
}
function _onInputPen(id){
  const hg=parseInt(document.getElementById("sim-hg-"+id)?.value);
  const ag=parseInt(document.getElementById("sim-ag-"+id)?.value);
  const ph=parseInt(document.getElementById("pen-hg-"+id)?.value);
  const pa=parseInt(document.getElementById("pen-ag-"+id)?.value);
  if(isNaN(hg)||isNaN(ag)||isNaN(ph)||isNaN(pa)||ph===pa) return;
  simularResultado(id,hg,ag,true,ph>pa?"home":"away");
}
function limparSimulacao(id){ delete APP.resultadosSim[id]; atualizarBracket(); renderAbaAtiva(); }
function limparResultadoAdmin(id){
  if(!confirm("Limpar resultado de "+id+"?")) return;
  delete APP.resultados[id]; _persistirLocal();
  if(APP.db&&!APP.modoOffline) APP.db.collection("resultados_oficiais").doc(id).delete();
  atualizarBracket(); renderAbaAtiva();
}
function confirmarAdmin(id,ehElim){
  const hg=parseInt(document.getElementById("sim-hg-"+id)?.value);
  const ag=parseInt(document.getElementById("sim-ag-"+id)?.value);
  if(isNaN(hg)||isNaN(ag)){alert("Preencha o placar.");return;}
  let foiPen=false,penH=null,penA=null;
  if(ehElim&&hg===ag){
    penH=parseInt(document.getElementById("pen-hg-"+id)?.value);
    penA=parseInt(document.getElementById("pen-ag-"+id)?.value);
    if(isNaN(penH)||isNaN(penA)){alert("Preencha penaltis.");return;}
    if(penH===penA){alert("Penaltis nao podem empatar.");return;}
    foiPen=true;
  }
  const j=window.SCHEDULE_BY_ID[id]; const b=APP.bracket[id]||{};
  const hN=window.TEAMS_BY_CODE[b.home||j?.home]?.name||"A";
  const aN=window.TEAMS_BY_CODE[b.away||j?.away]?.name||"B";
  if(!confirm(hN+" "+hg+"x"+ag+" "+aN+(foiPen?" PEN "+penH+"x"+penA:"")+"\nGravar como OFICIAL?")) return;
  const pv=foiPen?(penH>penA?"home":"away"):null;
  const data={gameId:id,homeGoals:hg,awayGoals:ag,foi_penaltis:foiPen,penaltis_vencedor:pv,penaltis_home:foiPen?penH:null,penaltis_away:foiPen?penA:null,inserido_em:new Date().toISOString(),inserido_por:"admin"};
  gravarResultadoOficial(id,hg,ag,foiPen,pv,data);
  const log=JSON.parse(localStorage.getItem("bolao_admin_log")||"[]");
  log.push(new Date().toLocaleString("pt-BR")+" | "+id+" | "+hN+" "+hg+"x"+ag+" "+aN);
  localStorage.setItem("bolao_admin_log",JSON.stringify(log.slice(-50)));
}

/* ---- GRUPOS GRID ---- */
function renderGruposGrid(tg,res){
  let h='<div class="grupos-grid">';
  for(const L of "ABCDEFGHIJKL".split("")){
    const st=tg.grupos[L]||[]; if(!st.length) continue;
    const jg=(window.SCHEDULE||[]).filter(j=>j.grupo===L);
    const ok=jg.length===6&&jg.every(j=>res[j.id]?.homeGoals!==undefined);
    h+='<div class="grupo-mini"><div class="grupo-mini-header">GRUPO '+L+'</div>';
    h+='<table class="tabela-mini"><thead><tr><th>Seleção</th><th title="Pts">P</th><th class="td-hid">J</th><th class="td-hid">V</th><th class="td-hid">E</th><th class="td-hid">D</th><th title="Gols Pró">GP</th><th title="Gols Contra">GC</th><th>SG</th></tr></thead><tbody>';
    st.forEach((t,i)=>{
      const cls=ok&&i<2?"row-classif":(ok&&tg.melhoresTerceiros?.some(x=>x.code===t.code)?"row-terceiro":"");
      h+='<tr class="'+cls+'"><td style="display:flex;align-items:center;gap:4px;padding:5px 8px">'+htmlBandeira(t.code,14)+'<span>'+(window.TEAMS_BY_CODE[t.code]?.name||t.code)+'</span></td>';
      h+='<td class="num-pts">'+t.Pts+'</td><td class="num td-hid">'+t.J+'</td><td class="num td-hid">'+t.V+'</td><td class="num td-hid">'+t.E+'</td><td class="num td-hid">'+t.D+'</td><td class="num">'+t.GP+'</td><td class="num">'+t.GC+'</td><td class="num" style="font-weight:600">'+(t.SG>0?"+":"")+t.SG+'</td></tr>';
    });
    h+='</tbody></table>';
    if(ok&&st[0]){
      h+='<div style="padding:4px 8px 6px;display:flex;gap:3px;flex-wrap:wrap">';
      h+='<span class="classificado-badge">✓ '+(window.TEAMS_BY_CODE[st[0].code]?.name||st[0].code)+'</span>';
      h+='<span class="classificado-badge">✓ '+(window.TEAMS_BY_CODE[st[1]?.code]?.name||st[1]?.code||"?")+'</span>';
      if(tg.melhoresTerceiros?.some(x=>x.code===st[2]?.code)) h+='<span class="terceiro-badge">3° '+(window.TEAMS_BY_CODE[st[2].code]?.name||st[2].code)+'</span>';
      h+='</div>';
    }
    h+='</div>';
  }
  return h+'</div>';
}

/* ---- TOGGLES ---- */
function renderToggles(){
  let h='<div class="toggle-bar">';
  h+='<span class="toggle-label">Ordenar:</span>';
  h+='<button class="btn-toggle'+(_ordemJogos==="grupos"?" ativo":"")+'" onclick="setOrdemJogos(\'grupos\')">Por Grupo</button>';
  h+='<button class="btn-toggle'+(_ordemJogos==="dias"?" ativo":"")+'" onclick="setOrdemJogos(\'dias\')">Por Dia</button>';
  h+='<div class="toggle-sep"></div>';
  h+='<span class="toggle-label">Grupos:</span>';
  h+='<button class="btn-toggle'+(_modoGrupos==="topo"?" ativo":"")+'" onclick="setModoGrupos(\'topo\')">No Topo</button>';
  h+='<button class="btn-toggle'+(_modoGrupos==="jogos"?" ativo":"")+'" onclick="setModoGrupos(\'jogos\')">Com Jogos</button>';
  return h+'</div>';
}

/* ---- RENDER PRINCIPAL ---- */
function renderJogosComToggle(res,tg,isAdm,palApo){
  let h=renderToggles();
  // Grupos NO TOPO: grid compacto acima dos jogos (sem duplicar no inline)
  if(_modoGrupos==="topo") h+='<div class="card" style="padding:10px;margin-bottom:10px">'+renderGruposGrid(tg,res)+'</div>';
  const gJogos=(window.SCHEDULE||[]).filter(j=>j.fase==="grupos");
  h+=_ordemJogos==="grupos"?renderPorGrupo(gJogos,res,tg,isAdm,palApo):renderPorDia(gJogos,res,isAdm,palApo);
  for(const fe of [{l:"32 Avos de Final",ids:["32avos"]},{l:"Oitavas de Final",ids:["oitavas"]},{l:"Quartas de Final",ids:["quartas"]},{l:"Semifinais",ids:["semis"]},{l:"3° Lugar e Final",ids:["terceiro","final"]}]){
    const jogos=(window.SCHEDULE||[]).filter(j=>fe.ids.includes(j.fase)).sort((a,b)=>new Date(a.utc)-new Date(b.utc));
    if(!jogos.length) continue;
    h+='<div class="fase-header">'+fe.l+'</div><div class="fase-grupo-bloco">';
    for(const j of jogos) h+=renderJogoRow(j,res,true,isAdm,palApo);
    h+='</div>';
  }
  return h;
}

function renderPorGrupo(jogos,res,tg,isAdm,palApo){
  let h="";
  for(const L of "ABCDEFGHIJKL".split("")){
    const jg=jogos.filter(j=>j.grupo===L).sort((a,b)=>new Date(a.utc)-new Date(b.utc));
    if(!jg.length) continue;
    const ok=jg.filter(j=>res[j.id]?.homeGoals!==undefined).length;
    const st=tg?.grupos[L];
    h+='<div class="fase-grupo-bloco"><div class="grupo-header"><span class="grupo-badge">GRUPO '+L+'</span>';
    h+='<span style="font-size:.65rem;color:rgba(255,255,255,.6)">'+ok+'/6</span>';
    if(_modoGrupos==="jogos"&&st&&ok===6) h+='<span style="margin-left:auto;font-size:.65rem;color:#86efac">✓ '+(window.TEAMS_BY_CODE[st[0]?.code]?.name||"")+" · "+(window.TEAMS_BY_CODE[st[1]?.code]?.name||"")+'</span>';
    h+='</div>';
    if(_modoGrupos==="jogos"){ const miniTg={grupos:tg.grupos,melhoresTerceiros:tg.melhoresTerceiros}; h+=renderGrupoMini(L,miniTg,res); }
    for(const j of jg) h+=renderJogoRow(j,res,false,isAdm,palApo);
    h+='</div>';
  }
  return h;
}

function renderGrupoMini(L,tg,res){
  const st=tg.grupos[L]||[]; if(!st.length) return "";
  const jg=(window.SCHEDULE||[]).filter(j=>j.grupo===L);
  const ok=jg.every(j=>res[j.id]?.homeGoals!==undefined);
  let h='<div style="padding:6px 10px;border-bottom:1px solid var(--borda)"><table class="tabela-mini"><thead><tr><th>Seleção</th><th>P</th><th class="td-hid">J</th><th class="td-hid">V</th><th class="td-hid">E</th><th class="td-hid">D</th><th title="Gols Pró">GP</th><th title="Gols Contra">GC</th><th>SG</th></tr></thead><tbody>';
  st.forEach((t,i)=>{
    const cls=ok&&i<2?"row-classif":(ok&&tg.melhoresTerceiros?.some(x=>x.code===t.code)?"row-terceiro":"");
    h+='<tr class="'+cls+'"><td style="display:flex;align-items:center;gap:4px;padding:4px 6px">'+htmlBandeira(t.code,13)+'<span style="font-size:.69rem">'+(window.TEAMS_BY_CODE[t.code]?.name||t.code)+'</span></td>';
    h+='<td class="num-pts">'+t.Pts+'</td><td class="num td-hid">'+t.J+'</td><td class="num td-hid">'+t.V+'</td><td class="num td-hid">'+t.E+'</td><td class="num td-hid">'+t.D+'</td><td class="num">'+t.GP+'</td><td class="num">'+t.GC+'</td><td class="num" style="font-weight:600">'+(t.SG>0?"+":"")+t.SG+'</td></tr>';
  });
  return h+'</tbody></table></div>';
}

function renderPorDia(jogos,res,isAdm,palApo){
  const porDia={};
  [...jogos].sort((a,b)=>new Date(a.utc)-new Date(b.utc)).forEach(j=>{
    const d=new Intl.DateTimeFormat("pt-BR",{weekday:"long",day:"2-digit",month:"long",timeZone:"America/Sao_Paulo"}).format(new Date(j.utc));
    if(!porDia[d]) porDia[d]=[];
    porDia[d].push(j);
  });
  let h="";
  for(const [d,jgs] of Object.entries(porDia)){
    h+='<div class="dia-header">'+d+'</div><div class="fase-grupo-bloco">';
    for(const j of jgs) h+=renderJogoRow(j,res,false,isAdm,palApo);
    h+='</div>';
  }
  return h;
}

/* ---- JOGO ROW (grid 5 colunas) ---- */
function renderJogoRow(jogo,res,ehElim,isAdm,palApo){
  const r=res[jogo.id]; const b=(APP.bracket&&APP.bracket[jogo.id])||{};
  const hCode=b.home||jogo.home; const aCode=b.away||jogo.away;
  const hName=window.TEAMS_BY_CODE[hCode]?.name||window.BRACKET.descricaoPosicao(b.homePos||"")||"A definir";
  const aName=window.TEAMS_BY_CODE[aCode]?.name||window.BRACKET.descricaoPosicao(b.awayPos||"")||"A definir";
  const temRes=r&&r.homeGoals!==undefined;
  const isSim=APP.modoSimulacao&&APP.resultadosSim&&APP.resultadosSim[jogo.id]!==undefined;
  const isEmp=temRes&&r.homeGoals===r.awayGoals;
  const hg=r?.homeGoals??""; const ag=r?.awayGoals??"";
  const ph=r?.penaltis_home??""; const pa=r?.penaltis_away??"";
  const pal=palApo?palApo[jogo.id]:null;

  let chome="",caway="";

  const rowCls="jogo-row"+(temRes?(isSim?" simulado":" realizado"):" futuro");

  let h='<div class="'+rowCls+'">';
  // Col 1: meta — horário + cidade (estádio fica no modal 📊)
  h+='<div class="jogo-col-meta"><div>'+formatarDataBRT(jogo.utc,true)+'</div>';
  if(jogo.cidade) h+='<div class="jogo-local">'+jogo.cidade+'</div>';
  if(isSim) h+='<div><span class="badge-sim">simulado</span></div>';
  h+='</div>';

  // Col 2: home
  h+='<div class="jogo-col-home"><span style="color:'+(chome||"inherit")+';font-weight:'+(chome?700:500)+'">'+hName+'</span>'+htmlBandeira(hCode,22)+'</div>';

  // Col 3: placar
  h+='<div class="jogo-col-placar">';
  if(temRes&&!isAdm){
    h+='<div class="placar-display"><span class="placar-num" style="color:'+(chome||"var(--texto)")+'">'+r.homeGoals+'</span><span class="placar-sep">x</span><span class="placar-num" style="color:'+(caway||"var(--texto)")+'">'+r.awayGoals+'</span></div>';
    if(r.foi_penaltis) h+='<div class="placar-pen">PEN '+(ph!==null&&ph!==undefined?ph+"x"+pa:"")+'</div>';
    if(pal?.homeGoals!==undefined){
      const br=calcularPontosBrutos(pal,r); const pts=aplicarFator(br.total_bruto,jogo.fase);
      const cor=br.bonus_tipo==="placar_exato"?"#86efac":br.acertou?"#4ade80":"#f87171";
      h+='<div style="font-size:.65rem;color:'+cor+';">'+(br.acertou===false?"✗":"✓")+' '+pal.homeGoals+"x"+pal.awayGoals+' ('+pts+'pts)</div>';
    }
  } else {
    const v1=temRes?hg:(pal?.homeGoals??""); const v2=temRes?ag:(pal?.awayGoals??"");
    h+='<div class="placar-inputs"><input type="number" class="placar-input" id="sim-hg-'+jogo.id+'" min="0" max="20" value="'+v1+'" placeholder="-" oninput="_onInputPlacar(\''+jogo.id+'\','+ehElim+')">';
    h+='<span class="vs">x</span>';
    h+='<input type="number" class="placar-input" id="sim-ag-'+jogo.id+'" min="0" max="20" value="'+v2+'" placeholder="-" oninput="_onInputPlacar(\''+jogo.id+'\','+ehElim+')"></div>';
    if(ehElim){
      h+='<div class="pen-wrap'+(isEmp?" visivel":"")+'" id="pen-wrap-'+jogo.id+'">';
      h+='<div class="pen-label">Penaltis</div>';
      h+='<div class="pen-inputs-row"><input type="number" class="pen-input" id="pen-hg-'+jogo.id+'" value="'+ph+'" min="0" placeholder="0" oninput="_onInputPen(\''+jogo.id+'\')">';
      h+='<span class="vs">x</span>';
      h+='<input type="number" class="pen-input" id="pen-ag-'+jogo.id+'" value="'+pa+'" min="0" placeholder="0" oninput="_onInputPen(\''+jogo.id+'\')"></div></div>';
    }
    if(isAdm){
      h+='<div style="display:flex;gap:4px;margin-top:4px;justify-content:center">';
      if(temRes) h+='<button class="btn-limpar" onclick="limparResultadoAdmin(\''+jogo.id+'\')">✕ Deletar</button>';
      h+='</div>';
    } else if(isSim){
      h+='<div style="margin-top:4px;text-align:center"><button class="btn-limpar" onclick="limparSimulacao(\''+jogo.id+'\')">✕ Reset</button></div>';
    }
  }
  h+='</div>';

  // Col 4: away
  h+='<div class="jogo-col-away">'+htmlBandeira(aCode,22)+'<span style="color:'+(caway||"inherit")+';font-weight:'+(caway?700:500)+'">'+aName+'</span></div>';

  // Col 5: acoes
  h+='<div class="jogo-col-acoes"><button class="btn-prog" onclick="PROGNOSE.abrirModal(\''+jogo.id+'\')" title="Info e Estatísticas">📊</button></div>';

  h+='</div>'; return h;
}