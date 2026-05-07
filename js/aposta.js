/**
 * aposta.js - Palpites do apostador
 * Layout idêntico ao de resultados, usando ui-jogos.js
 * Palpites calculados on-demand, standings projetados dos próprios palpites
 */

let _apostador = null;
let _palpitesLocais = {};
let _modoVer = false;

// Sobrescrever a função do ui-jogos para a tela de apostas
window._onInputPlacar = function(id) {
  const hg = parseInt(document.getElementById("sim-hg-" + id)?.value);
  const ag = parseInt(document.getElementById("sim-ag-" + id)?.value);
  
  if (!isNaN(hg) && !isNaN(ag)) {
    _palpitesLocais[id] = { homeGoals: hg, awayGoals: ag };
    
    // Atualizar apenas as tabelas de grupos sem dar re-render na página toda (evita perder o foco)
    atualizarMiniTabelasAposta();
    
    // Auto-save suave
    clearTimeout(window._saveTimerAposta);
    window._saveTimerAposta = setTimeout(() => salvarTodosPalpites(true), 2000);
  }
};

document.addEventListener("DOMContentLoaded", iniciarAposta);

async function iniciarAposta() {
  const params = new URLSearchParams(location.search);
  const token = params.get("token");
  _modoVer = params.has("ver");

  if (!token) { mostrarErroAposta("Link inválido. Solicite seu link personalizado."); return; }

  await new Promise(r => setTimeout(r, 1000));
  atualizarBracket();

  _apostador = APP.apostadores.find(a => a.token === token);
  if (!_apostador && window.TOKENS_BY_TOKEN?.[token]) {
    const info = window.TOKENS_BY_TOKEN[token];
    const salvo = JSON.parse(localStorage.getItem("bolao_apt")||"[]").find(a => a.token === token);
    _apostador = salvo || { ...info, nome:"", apelido:"", novo:true };
    if (!APP.apostadores.find(a => a.token === token)) APP.apostadores.push(_apostador);
  }
  if (!_apostador && APP.modoOffline) {
    _apostador = { id:"local_"+token, token, nome:"", apelido:"", ativo:true, novo:true };
    APP.apostadores.push(_apostador);
  }
  if (!_apostador) { mostrarErroAposta("Token inválido ou expirado."); return; }

  _palpitesLocais = JSON.parse(JSON.stringify(APP.palpites[_apostador.id]||{}));

  // Cadastro se novo
  if (_apostador.novo && !_modoVer) {
    renderCadastro();
  } else {
    renderAposta();
  }
}

function mostrarErroAposta(msg) {
  const el = document.getElementById("aposta-main");
  if (el) el.innerHTML = '<div class="card" style="max-width:380px;margin:40px auto;text-align:center">'+
    '<div style="font-size:2rem;margin-bottom:10px">⚠️</div>'+
    '<div style="font-weight:700;margin-bottom:6px">Erro</div>'+
    '<div style="font-size:.82rem;color:var(--texto2)">'+msg+'</div></div>';
}

function renderCadastro() {
  const el = document.getElementById("aposta-main");
  if (!el) return;
  el.innerHTML = '<div class="card" style="max-width:380px;margin:40px auto">'+
    '<div class="card-titulo">👤 Seu Cadastro</div>'+
    '<div class="form-group"><label>Nome completo</label>'+
    '<input type="text" id="apt-nome" placeholder="Ex: João Silva" maxlength="50"></div>'+
    '<div class="form-group"><label>Apelido (exibido no ranking)</label>'+
    '<input type="text" id="apt-apelido" placeholder="Ex: Jão" maxlength="20"></div>'+
    '<button class="btn btn-primario" style="width:100%" onclick="salvarCadastro()">Salvar e Começar</button></div>';
}

async function salvarCadastro() {
  const nome = document.getElementById("apt-nome")?.value.trim();
  const apelido = document.getElementById("apt-apelido")?.value.trim();
  if (!nome) { alert("Informe seu nome."); return; }
  _apostador.nome = nome;
  _apostador.apelido = apelido || nome.split(" ")[0];
  _apostador.novo = false;
  _apostador.token = _apostador.token;
  if (!_apostador.id) _apostador.id = "tok_"+Date.now();
  await gravarApostador(_apostador);
  renderAposta();
}

// ── Projeção on-demand dos palpites do apostador ──
function calcularProjecao() {
  const res = Object.assign({}, APP.resultados);
  for (const [id, p] of Object.entries(_palpitesLocais)) {
    if (!res[id]?.homeGoals !== undefined && p?.homeGoals !== undefined)
      res[id] = { gameId:id, homeGoals:p.homeGoals, awayGoals:p.awayGoals, foi_penaltis:false };
    else if (!res[id] && p?.homeGoals !== undefined)
      res[id] = { gameId:id, homeGoals:p.homeGoals, awayGoals:p.awayGoals, foi_penaltis:false };
  }
  return window.BRACKET.calcularTodosOsGrupos(res);
}

// ── Render principal ──
function renderAposta() {
  const el = document.getElementById("aposta-main");
  if (!el) return;
  const nome = _apostador.apelido || _apostador.nome || "Apostador";

  // Header com nome
  const hn = document.getElementById("header-nome");
  if (hn) hn.innerHTML = (_modoVer?"Palpites de ":"Olá, ")+"<strong>"+nome+"</strong><small>Copa 2026</small>";

  const resOficiais = getResultados();
  const tg = calcularProjecao();

  // Contagem palpites preenchidos
  const totalJogos = (window.SCHEDULE||[]).filter(j=>j.fase==="grupos").length;
  const preenchidos = Object.values(_palpitesLocais).filter(p=>p?.homeGoals!==undefined).length;

  let h = "";

  // Header de status
  h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">';
  h += '<div style="font-size:.78rem;color:var(--texto2)">Palpites preenchidos: <strong style="color:var(--verde-light)">'+preenchidos+'/'+totalJogos+'</strong> jogos da fase de grupos</div>';
  if (!_modoVer) {
    h += '<button class="btn btn-primario btn-sm" style="margin-left:auto" onclick="salvarTodosPalpites()">💾 Salvar Palpites</button>';
  }
  h += '</div>';

  // Palpites especiais (campeão, vice, 3o)
  if (!_modoVer) h += renderEspeciaisAposta(resOficiais);

  // Mesmo layout do resultados: grupos + toggle + jogos
  h += renderJogosComToggle(resOficiais, tg, false, _palpitesLocais);

  el.innerHTML = h;

  // Registrar inputs: ao digitar, atualiza palpite local + re-renderiza grupos
  _registrarInputsAposta();
}

function renderEspeciaisAposta(res) {
  const esp = _apostador.especiais || {};
  const fases = [
    { key:"campeao", label:"🏆 Campeão", pts:"15pts" },
    { key:"vice",    label:"🥈 Vice",    pts:"10pts" },
    { key:"terceiro",label:"🥉 3° Lugar",pts:"5pts" },
  ];
  const grupos = Object.values(window.SCHEDULE_BY_GROUP||{});
  const todos = (window.TEAMS||window.SCHEDULE||[]).map(j=>[j.home,j.away]).flat()
    .filter((v,i,a)=>a.indexOf(v)===i).filter(c=>c&&c!=="TBD");
  const times = [...new Set((window.SCHEDULE||[]).filter(j=>j.grupo).map(j=>[j.home,j.away]).flat())];

  let h = '<div class="card"><div class="card-titulo">⭐ Palpites Especiais</div>';
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">';
  for (const f of fases) {
    const val = esp[f.key]||"";
    const info = window.TEAMS_BY_CODE?.[val];
    h += '<div style="background:var(--fundo2);border-radius:var(--radius-sm);padding:10px">';
    h += '<div style="font-size:.78rem;font-weight:700;margin-bottom:6px">'+f.label+' <span style="color:var(--dourado);font-size:.65rem">'+f.pts+'</span></div>';
    h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">'+htmlBandeira(val,24);
    h += '<span style="font-size:.82rem;font-weight:600">'+(info?.name||"Selecionar")+'</span></div>';
    if (!_modoVer) {
      h += '<select class="apt-esp" data-key="'+f.key+'" onchange="gravarEspecialAposta(this)" style="font-size:.75rem;padding:5px 8px">';
      h += '<option value="">-- Selecionar --</option>';
      for (const c of times.sort()) {
        const t = window.TEAMS_BY_CODE?.[c];
        h += '<option value="'+c+'"'+(val===c?" selected":"")+'>'+((t?.flag||"")+" "+(t?.name||c))+'</option>';
      }
      h += '</select>';
    }
    h += '</div>';
  }
  h += '</div></div>';
  return h;
}

function gravarEspecialAposta(sel) {
  const key = sel.dataset.key;
  if (!_apostador.especiais) _apostador.especiais = {};
  _apostador.especiais[key] = sel.value;
  gravarApostador(_apostador);
}

function atualizarMiniTabelasAposta() {
  const tg = calcularProjecao();
  const resOficiais = getResultados();
  
  // Atualizar o grid de grupos no topo se existir
  const gridContainer = document.querySelector(".grupos-grid")?.parentElement;
  if (gridContainer && _modoGrupos === "topo") {
    gridContainer.innerHTML = renderGruposGrid(tg, resOficiais);
  }
  
  // Atualizar contagem no header
  const totalJogos = (window.SCHEDULE || []).filter(j => j.fase === "grupos").length;
  const preenchidos = Object.values(_palpitesLocais).filter(p => p?.homeGoals !== undefined).length;
  const contador = document.querySelector("strong[style*='verde-light']");
  if (contador) contador.textContent = preenchidos + "/" + totalJogos;
}

function _registrarInputsAposta() {
    // A lógica agora é tratada pelo window._onInputPlacar sobrescrito
}

async function salvarTodosPalpites(silencioso = false) {
  if (_modoVer) return;
  if (!_apostador?.id) return;
    // Gravar todos os palpites modificados
  const promessas = [];
  for (const [gameId, p] of Object.entries(_palpitesLocais)) {
    if (p?.homeGoals !== undefined)
      promessas.push(gravarPalpite(_apostador.id, gameId, p.homeGoals, p.awayGoals));
  }
  await Promise.all(promessas);
  if (!silencioso) {
    const btn = document.querySelector(".btn-primario");
    if (btn) { const t=btn.textContent; btn.textContent="✓ Salvo!"; setTimeout(()=>btn.textContent=t,1500); }
  }
}
async function gravarEspecialAposta(sel) {
  const key = sel.dataset.key;
  if (!_apostador.especiais) _apostador.especiais = {};
  _apostador.especiais[key] = sel.value;
  // Salvar em apostador
  await gravarApostador(_apostador);
}