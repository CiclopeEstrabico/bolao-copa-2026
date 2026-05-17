/**
 * app.js - Init Firebase + estado global + roteador de abas
 */
window.APP = {
  db: null, modoSimulacao: false,
  resultados: {}, resultadosSim: null,
  palpites: {}, apostadores: [], bracket: {}, _unsubs: [],
  modelo: null,           // metadados do MODELO (ou null se não existir)
  palpitesModelo: {},     // { gameId: { homeGoals, awayGoals, ... } }
  _modeloCarregado: false,
  _modeloPalpitesUnsub: null,
};

function initApp() {
  if (!window.FIREBASE_CONFIG || !window.FIREBASE_CONFIG.apiKey) {
    console.error("[app] Firebase não configurado. Verifique firebase-config.js.");
    document.body.innerHTML =
      '<div style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif">' +
      '<div style="text-align:center;padding:40px"><div style="font-size:2rem;margin-bottom:12px">⚙️</div>' +
      '<div style="font-weight:700;margin-bottom:6px">Firebase não configurado</div>' +
      '<div style="font-size:.85rem;color:#888">Adicione suas credenciais em firebase-config.js</div></div></div>';
    return;
  }
  try {
    firebase.initializeApp(window.FIREBASE_CONFIG);
  } catch (e) {
    if (e.code !== "app/duplicate-app") throw e;
  }
  APP.db = firebase.firestore();
  APP.configStatus = {};
  listenResultados(); listenApostadores(); listenPalpites(); listenConfigStatus();
  listenModelo();
  atualizarBracket();
  iniciarRoteador();
}

// ---- Firestore listeners ----------------------------------------------------
function listenResultados() {
  const u = APP.db.collection("resultados_oficiais").onSnapshot(snap => {
    // Limpa para garantir que deletados sumam
    APP.resultados = {};
    snap.forEach(d => { APP.resultados[d.id] = d.data(); });
    atualizarBracket(); renderAbaAtiva();
  });
  APP._unsubs.push(u);
}
function listenApostadores() {
  const u = APP.db.collection("apostadores").onSnapshot(snap => {
    APP.apostadores = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(a => a.ativo !== false)
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    APP._apostadoresCarregados = true;
    renderAbaAtiva();
  });
  APP._unsubs.push(u);
}
function listenPalpites() {
  const u = APP.db.collectionGroup("palpites_jogos").onSnapshot(snap => {
    // Limpa para garantir que deletados sumam
    APP.palpites = {};
    snap.forEach(d => {
      const data = d.data();
      if (!APP.palpites[data.apostadorId]) APP.palpites[data.apostadorId] = {};
      APP.palpites[data.apostadorId][data.gameId] = data;
    });
    renderAbaAtiva();
  });
  APP._unsubs.push(u);
}
function listenConfigStatus() {
  const u = APP.db.collection("config").doc("status").onSnapshot(doc => {
    if (doc.exists) {
      APP.configStatus = doc.data();
    }
    renderAbaAtiva();
  });
  APP._unsubs.push(u);
}

function listenModelo() {
  const u = APP.db.collection("modelo").doc("dados").onSnapshot(doc => {
    if (!doc.exists) {
      APP.modelo = null;
      APP.palpitesModelo = {};
      APP._modeloCarregado = true;
      if (!window._estaDigitando) renderAbaAtiva();
      return;
    }
    // Armazena apenas os dados crus do Firestore; getModelo() compõe o objeto final
    APP.modelo = doc.data();

    if (!APP._modeloPalpitesUnsub) {
      const innerUnsub = doc.ref.collection("palpites_modelo").onSnapshot(snap => {
        APP.palpitesModelo = {};
        snap.forEach(d => { APP.palpitesModelo[d.id] = d.data(); });
        if (!window._estaDigitando) renderAbaAtiva();
      });
      APP._modeloPalpitesUnsub = innerUnsub;
      APP._unsubs.push(innerUnsub);
    }
    APP._modeloCarregado = true;
    if (!window._estaDigitando) renderAbaAtiva();
  });
  APP._unsubs.push(u);
}
function listenConfigStatus() {
  const u = APP.db.collection("config").doc("status").onSnapshot(doc => {
    if (doc.exists) {
      APP.configStatus = doc.data();
    }
    renderAbaAtiva();
  });
  APP._unsubs.push(u);
}

function listenModelo() {
  const u = APP.db.collection("modelo").doc("dados").onSnapshot(doc => {
    if (!doc.exists) {
      APP.modelo = null;
      APP.palpitesModelo = {};
      APP._modeloCarregado = true;
      renderAbaAtiva();
      return;
    }
    // Armazena apenas os dados crus do Firestore; getModelo() compõe o objeto final
    APP.modelo = doc.data();

    if (!APP._modeloPalpitesUnsub) {
      const innerUnsub = doc.ref.collection("palpites_modelo").onSnapshot(snap => {
        APP.palpitesModelo = {};
        snap.forEach(d => { APP.palpitesModelo[d.id] = d.data(); });
        renderAbaAtiva();
      });
      APP._modeloPalpitesUnsub = innerUnsub;
      APP._unsubs.push(innerUnsub); // Bug 3: registrar para cleanup
    }
    APP._modeloCarregado = true;
    renderAbaAtiva();
  });
  APP._unsubs.push(u);
}

function getModelo() {
  if (!APP.modelo) return null;
  // Bug 1: campos fixos vêm APÓS o spread para não serem sobrescritos pelo Firestore
  return {
    ...APP.modelo,
    id: "MODELO",
    apelido: "MODELO",
    nome: "Modelo Estatístico",
    isModelo: true,
    especiais: APP.modelo.especiais || {},
  };
}
window.getModelo = getModelo;

// ---- Gravar resultado -------------------------------------------------------
async function gravarResultadoOficial(gameId, homeGoals, awayGoals, foiPen, penVenc, extraData) {
  const data = Object.assign({
    gameId, homeGoals, awayGoals, foi_penaltis: !!foiPen,
    penaltis_vencedor: penVenc || null, inserido_em: new Date().toISOString(), inserido_por: "admin"
  },
    extraData || {});
  await APP.db.collection("resultados_oficiais").doc(gameId).set(data);
}

async function gravarApostador(apostador) {
  await APP.db.collection("apostadores").doc(apostador.id).set(apostador, { merge: true });
}

async function gravarPalpite(apostadorId, gameId, homeGoals, awayGoals, token) {
  const jogo = window.SCHEDULE_BY_ID[gameId];
  const fase = (jogo.fase === "final" || jogo.fase === "terceiro") ? "finais" : jogo.fase;
  const data = {
    apostadorId, gameId, homeGoals, awayGoals, fase,
    token: token || null,
    atualizado_em: new Date().toISOString()
  };
  await APP.db.collection("apostadores").doc(apostadorId)
    .collection("palpites_jogos").doc(gameId).set(data, { merge: true });
}

// ---- Modo Simulacao ---------------------------------------------------------
function ativarSimulacao() {
  APP.modoSimulacao = true;
  APP.resultadosSim = {}; // apenas inputs do usuário — oficiais ficam em APP.resultados
  atualizarBracket(); renderAbaAtiva();
  document.getElementById("banner-simulacao")?.classList.remove("hidden");
  const btn = document.getElementById("btn-simulacao");
  if (btn) btn.style.display = 'flex';
}
function desativarSimulacao() {
  APP.modoSimulacao = false;
  APP.resultadosSim = null;
  atualizarBracket(); renderAbaAtiva();
  document.getElementById("banner-simulacao")?.classList.add("hidden");
  const btn = document.getElementById("btn-simulacao");
  if (btn) btn.style.display = 'none';
}
function simularResultado(gameId, hg, ag, foiPen, penVenc, ph, pa) {
  if (!APP.modoSimulacao) ativarSimulacao();
  APP.resultadosSim[gameId] = {
    gameId, homeGoals: hg, awayGoals: ag,
    foi_penaltis: !!foiPen, penaltis_vencedor: penVenc || null, simulado: true, penaltis_home: ph, penaltis_away: pa
  };
  atualizarBracket(); renderAbaAtiva();
}
function getResultados() {
  if (APP.modoSimulacao && APP.resultadosSim) {
    // merge: oficiais primeiro, simulados sobrepõem apenas os jogos digitados
    return Object.assign({}, APP.resultados, APP.resultadosSim);
  }
  return APP.resultados;
}
// Retorna true SOMENTE para jogos que o usuário digitou na simulação (não oficiais)
function jogoEhSimulado(gameId) {
  return APP.modoSimulacao && APP.resultadosSim != null && APP.resultadosSim[gameId]?.simulado === true;
}

// ---- Bracket ----------------------------------------------------------------
function atualizarBracket() {
  APP.bracket = window.BRACKET.preencherBracket(getResultados());
}

// ---- Roteador ---------------------------------------------------------------
const ABAS = ["resultados", "classificacao", "tabela", "compilacao", "estatisticas", "grafico", "regras"];
let _abaAtiva = "resultados";

function iniciarRoteador() {
  document.querySelectorAll("[data-tab]").forEach(btn =>
    btn.addEventListener("click", () => mudarAba(btn.dataset.tab)));
  const hash = location.hash.replace("#", "");
  mudarAba(ABAS.includes(hash) ? hash : "resultados");
}
function mudarAba(aba) {
  if (!ABAS.includes(aba)) return;
  _abaAtiva = aba; location.hash = aba;
  document.querySelectorAll("[data-tab]").forEach(b =>
    b.classList.toggle("ativa", b.dataset.tab === aba));
  document.querySelectorAll(".aba-conteudo").forEach(el =>
    el.classList.toggle("hidden", el.dataset.aba !== aba));
  renderAbaAtiva(true);
}
function renderAbaAtiva(resetScroll = false) {
  const fn = {
    resultados: window.renderResultados, classificacao: window.renderClassificacao,
    tabela: window.renderTabela, compilacao: window.renderCompilacao,
    grafico: window.renderGrafico, estatisticas: window.renderEstatisticas, regras: window.renderRegras
  };

  // Salva scroll e foco
  const activeId = resetScroll ? null : document.activeElement?.id;
  const sy = resetScroll ? 0 : window.scrollY;
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
      try { el.setSelectionRange(sStart !== null ? sStart : el.value.length, sEnd !== null ? sEnd : el.value.length); } catch (e) { }
    }
  }
  window.scrollTo(0, sy);
  requestAnimationFrame(() => document.body.style.minHeight = oldHeight);
}

// ---- Utilitarios ------------------------------------------------------------
function formatarDataBRT(utcStr, soHora) {
  const opts = soHora
    ? { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }
    : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" };
  return new Intl.DateTimeFormat("pt-BR", opts).format(new Date(utcStr));
}
function htmlBandeira(code, size) {
  size = size || 24;
  const t = window.TEAMS_BY_CODE[code];
  if (!t) return '<span class="flag-empty" style="width:' + size + 'px;display:inline-block"></span>';
  return '<img src="' + t.flag + '" alt="' + t.name + '" width="' + size + '" height="' + Math.round(size * .75) + '" class="flag" loading="lazy">';
}
function nomeTime(code) {
  return window.TEAMS_BY_CODE[code]?.name ?? code ?? "A definir";
}
function getFaseLabel(jogo) {
  if (!jogo) return "";
  if (jogo.fase === "grupos") return "Grupo " + (jogo.grupo || "");
  if (jogo.fase === "32avos") return "32 Avos";
  if (jogo.fase === "oitavas") return "Oitavas";
  if (jogo.fase === "quartas") return "Quartas";
  if (jogo.fase === "semis") return "Semi";
  if (jogo.fase === "terceiro") return "3º Lugar";
  if (jogo.fase === "final") return "Final";
  return "";
}
function jogoAceita(jogoId) {
  const jogo = window.SCHEDULE_BY_ID[jogoId];
  if (!jogo) return false;
  const status = APP.configStatus || {};
  if (jogo.fase === "grupos") return !!status.liberado_grupos;
  if (jogo.fase === "32avos") return !!status.liberado_32avos;
  if (jogo.fase === "oitavas") return !!status.liberado_oitavas;
  if (jogo.fase === "quartas") return !!status.liberado_quartas;
  if (jogo.fase === "semis") return !!status.liberado_semis;
  if (jogo.fase === "final" || jogo.fase === "terceiro") return !!status.liberado_finais;
  return false;
}

// Reage a rotação/redimensionamento de tela para layouts que dependem de isMobile.
// No mobile, abrir o teclado virtual dispara resize (janela encolhe na altura).
// Ignoramos resizes que só mudam a altura — esses são causados pelo teclado.
// Só re-renderizamos quando a LARGURA muda (rotação real ou redimensionamento de janela).
let _resizeTimer;
let _lastInnerWidth = window.innerWidth;
window.addEventListener("resize", () => {
  const newWidth = window.innerWidth;
  if (newWidth === _lastInnerWidth) return; // altura mudou, largura não → teclado virtual
  _lastInnerWidth = newWidth;
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => renderAbaAtiva(), 250);
}, { passive: true });

document.addEventListener("DOMContentLoaded", initApp);