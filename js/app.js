/**
 * app.js - Init Firebase + estado global + roteador de abas
 * Modo offline: usa localStorage quando Firebase nao configurado.
 */
window.APP = {
  db: null, modoOffline: false, modoSimulacao: false,
  resultados: {}, resultadosSim: null,
  palpites: {}, apostadores: [], bracket: {}, _unsubs: []
};

function initApp() {
  const semConfig = !window.FIREBASE_CONFIG || !window.FIREBASE_CONFIG.apiKey;
  if (semConfig) {
    console.warn("[app] Modo offline ativo");
    APP.modoOffline = true;
    carregarDadosLocais();
  } else {
    try {
      firebase.initializeApp(window.FIREBASE_CONFIG);
      APP.db = firebase.firestore();
      listenResultados(); listenApostadores(); listenPalpites();
    } catch(e) {
      if (e.code === "app/duplicate-app") APP.db = firebase.firestore();
      else { APP.modoOffline = true; carregarDadosLocais(); }
    }
  }
  atualizarBracket();
  iniciarRoteador();
}

// ---- Offline (localStorage) -------------------------------------------------
function carregarDadosLocais() {
  try {
    APP.resultados   = JSON.parse(localStorage.getItem("bolao_res") || "{}");
    APP.palpites     = JSON.parse(localStorage.getItem("bolao_pal") || "{}");
    APP.apostadores  = JSON.parse(localStorage.getItem("bolao_apt") || "[]");
  } catch(e) {}
}
function _persistirLocal() {
  localStorage.setItem("bolao_res", JSON.stringify(APP.resultados));
  localStorage.setItem("bolao_pal", JSON.stringify(APP.palpites));
  localStorage.setItem("bolao_apt", JSON.stringify(APP.apostadores));
}

// ---- Firestore listeners ----------------------------------------------------
function listenResultados() {
  const u = APP.db.collection("resultados_oficiais").onSnapshot(snap => {
    snap.forEach(d => { APP.resultados[d.id] = d.data(); });
    atualizarBracket(); renderAbaAtiva();
  });
  APP._unsubs.push(u);
}
function listenApostadores() {
  const u = APP.db.collection("apostadores").onSnapshot(snap => {
    APP.apostadores = snap.docs.map(d => ({id: d.id, ...d.data()}))
      .filter(a => a.ativo !== false)
      .sort((a, b) => (a.ordem||0) - (b.ordem||0));
    renderAbaAtiva();
  });
  APP._unsubs.push(u);
}
function listenPalpites() {
  const u = APP.db.collectionGroup("palpites_jogos").onSnapshot(snap => {
    snap.forEach(d => {
      const data = d.data();
      if (!APP.palpites[data.apostadorId]) APP.palpites[data.apostadorId] = {};
      APP.palpites[data.apostadorId][data.gameId] = data;
    });
    renderAbaAtiva();
  });
  APP._unsubs.push(u);
}

// ---- Gravar resultado -------------------------------------------------------
async function gravarResultadoOficial(gameId, homeGoals, awayGoals, foiPen, penVenc, extraData) {
  const data = Object.assign({ gameId, homeGoals, awayGoals, foi_penaltis: !!foiPen,
    penaltis_vencedor: penVenc||null, inserido_em: new Date().toISOString(), inserido_por:"admin" },
    extraData || {});
  if (APP.modoOffline) {
    APP.resultados[gameId] = data; _persistirLocal();
    atualizarBracket(); renderAbaAtiva(); return;
  }
  await APP.db.collection("resultados_oficiais").doc(gameId).set(data);
}

async function gravarApostador(apostador) {
  if (APP.modoOffline) {
    const i = APP.apostadores.findIndex(a => a.id === apostador.id);
    if (i >= 0) APP.apostadores[i] = apostador; else APP.apostadores.push(apostador);
    _persistirLocal(); renderAbaAtiva(); return;
  }
  await APP.db.collection("apostadores").doc(apostador.id).set(apostador, {merge: true});
}

async function gravarPalpite(apostadorId, gameId, homeGoals, awayGoals) {
  const data = { apostadorId, gameId, homeGoals, awayGoals,
    atualizado_em: new Date().toISOString() };
  if (APP.modoOffline) {
    if (!APP.palpites[apostadorId]) APP.palpites[apostadorId] = {};
    APP.palpites[apostadorId][gameId] = data; _persistirLocal();
    renderAbaAtiva(); return;
  }
  await APP.db.collection("apostadores").doc(apostadorId)
    .collection("palpites_jogos").doc(gameId).set(data, {merge: true});
}

// ---- Modo Simulacao ---------------------------------------------------------
function ativarSimulacao() {
  APP.modoSimulacao = true;
  APP.resultadosSim = JSON.parse(JSON.stringify(APP.resultados));
  atualizarBracket(); renderAbaAtiva();
  document.getElementById("banner-simulacao")?.classList.remove("hidden");
  if(document.getElementById("sim-icon")) document.getElementById("sim-icon").style.display = 'block';
}
function desativarSimulacao() {
  APP.modoSimulacao = false;
  APP.resultadosSim = null;
  atualizarBracket(); renderAbaAtiva();
  document.getElementById("banner-simulacao")?.classList.add("hidden");
  if(document.getElementById("sim-icon")) document.getElementById("sim-icon").style.display = 'none';
}
function simularResultado(gameId, hg, ag, foiPen, penVenc) {
  if (!APP.modoSimulacao) ativarSimulacao();
  APP.resultadosSim[gameId] = { gameId, homeGoals: hg, awayGoals: ag,
    foi_penaltis: !!foiPen, penaltis_vencedor: penVenc||null, simulado: true };
  atualizarBracket(); renderAbaAtiva();
}
function getResultados() {
  return (APP.modoSimulacao && APP.resultadosSim) ? APP.resultadosSim : APP.resultados;
}

// ---- Bracket ----------------------------------------------------------------
function atualizarBracket() {
  APP.bracket = window.BRACKET.preencherBracket(getResultados());
}

// ---- Roteador ---------------------------------------------------------------
const ABAS = ["resultados","classificacao","tabela","compilacao","estatisticas","aproveitamento","regras"];
let _abaAtiva = "resultados";

function iniciarRoteador() {
  document.querySelectorAll("[data-tab]").forEach(btn =>
    btn.addEventListener("click", () => mudarAba(btn.dataset.tab)));
  const hash = location.hash.replace("#","");
  mudarAba(ABAS.includes(hash) ? hash : "resultados");
}
function mudarAba(aba) {
  if (!ABAS.includes(aba)) return;
  _abaAtiva = aba; location.hash = aba;
  document.querySelectorAll("[data-tab]").forEach(b =>
    b.classList.toggle("ativa", b.dataset.tab === aba));
  document.querySelectorAll(".aba-conteudo").forEach(el =>
    el.classList.toggle("hidden", el.dataset.aba !== aba));
  renderAbaAtiva();
}
function renderAbaAtiva() {
  const fn = { resultados: window.renderResultados, classificacao: window.renderClassificacao,
    tabela: window.renderTabela, compilacao: window.renderCompilacao,
    grafico: window.renderGrafico, estatisticas: window.renderEstatisticas, regras: window.renderRegras };
  
  // Salva scroll e foco
  const activeId = document.activeElement?.id;
  const sy = window.scrollY;
  const sStart = document.activeElement?.selectionStart;
  const sEnd = document.activeElement?.selectionEnd;
  
  const oldHeight = document.body.style.minHeight;
  document.body.style.minHeight = document.body.scrollHeight + 'px';

  fn[_abaAtiva]?.();

  // Restaura scroll e foco
  if (activeId) {
    const el = document.getElementById(activeId);
    if (el) {
      el.focus();
      try { el.setSelectionRange(sStart !== null ? sStart : el.value.length, sEnd !== null ? sEnd : el.value.length); } catch(e){}
    }
  }
  window.scrollTo(0, sy);
  requestAnimationFrame(() => document.body.style.minHeight = oldHeight);
}

// ---- Utilitarios ------------------------------------------------------------
function formatarDataBRT(utcStr, soHora) {
  const opts = soHora
    ? { hour:"2-digit", minute:"2-digit", timeZone:"America/Sao_Paulo" }
    : { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit", timeZone:"America/Sao_Paulo" };
  return new Intl.DateTimeFormat("pt-BR", opts).format(new Date(utcStr));
}
function htmlBandeira(code, size) {
  size = size || 24;
  const t = window.TEAMS_BY_CODE[code];
  if (!t) return '<span class="flag-empty" style="width:'+size+'px;display:inline-block"></span>';
  return '<img src="'+t.flag+'" alt="'+t.name+'" width="'+size+'" height="'+Math.round(size*.75)+'" class="flag" loading="lazy">';
}
function nomeTime(code) {
  return window.TEAMS_BY_CODE[code]?.name ?? code ?? "A definir";
}
function jogoAceita(jogoId) {
  const jogo = window.SCHEDULE_BY_ID[jogoId];
  if (!jogo) return false;
  const dlJogo = new Date(jogo.utc).getTime() - window.CONFIG.deadline_min_antes_jogo * 60000;
  const faseConf = window.CONFIG.fases_apostas.find(f => f.fases_cobertas.includes(jogo.fase));
  if (!faseConf) return false;
  return Date.now() < Math.min(dlJogo, new Date(faseConf.deadline_utc).getTime());
}
function adminAutenticado() {
  return sessionStorage.getItem("bolao_admin") === window.CONFIG.admin_senha;
}

document.addEventListener("DOMContentLoaded", initApp);