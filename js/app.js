/**
 * app.js - Init Firebase + estado global + roteador de abas
 *
 * CACHE v2: em vez de 4+ listeners que disparam 15k+ reads por visita,
 * usamos 3 documentos de cache + sessionStorage anti-F5.
 *
 * Reads por visita:
 *   - Primeira visita na sessão: 1 (config/status) + 3 (cache docs) = 4 reads
 *   - F5 subsequente na mesma sessão: 1 read (config/status valida timestamps)
 *   - Quando admin regera cache: 1 + 3 = 4 reads (invalida sessionStorage)
 */
window.APP = {
  db: null, modoSimulacao: false,
  resultados: {}, resultadosSim: null,
  palpites: {}, apostadores: [], bracket: {}, _unsubs: [],
  // Campos legados mantidos para compatibilidade com aposta.js e tab-*.js
  modelo: null,
  palpitesModelo: {},
  _modeloCarregado: false,
  _modeloPalpitesUnsub: null,
  _apostadoresCarregados: false,
};

// Chaves de sessionStorage
const _SS_GRUPOS = "bolao_cache_grupos";
const _SS_ELIM   = "bolao_cache_elim";
const _SS_RES    = "bolao_cache_res";

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
  listenCache();
  atualizarBracket();
  iniciarRoteador();
}

// ─── Cache: expansão do formato compacto para APP state ──────────────────────

/**
 * Recebe os 3 documentos de cache e popula APP.apostadores, APP.palpites,
 * APP.resultados e os campos legados APP.modelo / APP.palpitesModelo.
 * Chamado tanto ao ler do Firestore quanto ao restaurar do sessionStorage.
 */
function _expandirCacheParaAppState(gruposDoc, elimDoc, resDoc) {
  // 1. Apostadores (vêm do doc de grupos)
  if (gruposDoc && gruposDoc.apostadores) {
    APP.apostadores = gruposDoc.apostadores
      .map(a => ({
        id:       a.id,
        apelido:  a.apelido  || "",
        nome:     a.nome     || "",
        ordem:    a.ordem    || 0,
        especiais: a.especiais || {},
        isModelo: a.isModelo || false,
        ativo:    true,
        token:    a.token    || "",
      }))
      // MODELO não entra no array principal de apostadores humanos —
      // é tratado separadamente via getModelo() para compatibilidade.
      .filter(a => !a.isModelo)
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    APP._apostadoresCarregados = true;
  }

  // 2. Palpites — expande hg/ag → homeGoals/awayGoals
  function _expandirPalpites(doc) {
    if (!doc || !doc.palpites) return;
    for (const [apostadorId, jogos] of Object.entries(doc.palpites)) {
      if (!APP.palpites[apostadorId]) APP.palpites[apostadorId] = {};
      for (const [gameId, v] of Object.entries(jogos)) {
        const entry = {
          homeGoals:  v.hg,
          awayGoals:  v.ag,
          apostadorId,
          gameId,
        };
        if (v.pen_h !== undefined) {
          entry.penaltis_home = v.pen_h;
          entry.penaltis_away = v.pen_a;
        }
        APP.palpites[apostadorId][gameId] = entry;
      }
    }
  }

  // Limpa antes de expandir (evita dados obsoletos de sessão anterior)
  APP.palpites = {};
  _expandirPalpites(gruposDoc);
  _expandirPalpites(elimDoc);

  // 3. Resultados
  if (resDoc && resDoc.resultados) {
    APP.resultados = {};
    for (const [gameId, v] of Object.entries(resDoc.resultados)) {
      APP.resultados[gameId] = {
        gameId,
        homeGoals:         v.hg,
        awayGoals:         v.ag,
        foi_penaltis:      v.pen  || false,
        penaltis_vencedor: v.pen_v || null,
      };
    }
  }

  // 4. Compatibilidade legada: APP.modelo / APP.palpitesModelo
  // O MODELO é incluído no cache como entrada especial em palpites["MODELO"].
  // Aqui extraímos de volta para os campos legados que aposta.js e tab-*.js consomem.
  const modeloEntry = gruposDoc && gruposDoc.apostadores
    ? gruposDoc.apostadores.find(a => a.isModelo)
    : null;

  if (modeloEntry) {
    APP.modelo = {
      nome:      "Modelo Estatístico",
      apelido:   "MODELO",
      especiais: modeloEntry.especiais || {},
      tipo:      "modelo",
    };
    APP.palpitesModelo = {};
    // Palpites do MODELO estão em APP.palpites["MODELO"] após a expansão acima
    const palModelo = APP.palpites["MODELO"] || {};
    for (const [gameId, p] of Object.entries(palModelo)) {
      APP.palpitesModelo[gameId] = p;
    }
    APP._modeloCarregado = true;
  } else {
    // Sem MODELO no cache → limpa campos legados
    APP.modelo = null;
    APP.palpitesModelo = {};
    APP._modeloCarregado = true; // true = "já tentou carregar, não existe"
  }
}

// ─── Cache: leitura com sessionStorage anti-F5 ───────────────────────────────

async function listenCache() {
  // Tenta restaurar do sessionStorage imediatamente (zero reads Firestore)
  let carregouDoSession = false;
  try {
    const sg = sessionStorage.getItem(_SS_GRUPOS);
    const se = sessionStorage.getItem(_SS_ELIM);
    const sr = sessionStorage.getItem(_SS_RES);
    if (sg && sr) {
      const gDoc = JSON.parse(sg);
      const eDoc = se ? JSON.parse(se) : null;
      const rDoc = JSON.parse(sr);
      _expandirCacheParaAppState(gDoc, eDoc, rDoc);
      atualizarBracket();
      renderAbaAtiva();
      carregouDoSession = true;
    }
  } catch (e) {
    console.warn("[cache] sessionStorage inválido, descartando.", e);
    sessionStorage.removeItem(_SS_GRUPOS);
    sessionStorage.removeItem(_SS_ELIM);
    sessionStorage.removeItem(_SS_RES);
  }

  // Listener leve em config/status (1 doc) — detecta invalidação de cache
  // e atualiza APP.configStatus para jogoAceita() e controles de fase.
  const u = APP.db.collection("config").doc("status").onSnapshot(async doc => {
    if (doc.exists) {
      APP.configStatus = doc.data();
    }

    const tsG = (APP.configStatus && APP.configStatus.cache_grupos_ts) || null;
    const tsE = (APP.configStatus && APP.configStatus.cache_elim_ts)   || null;
    const tsR = (APP.configStatus && APP.configStatus.cache_res_ts)    || null;

    // Verifica se o sessionStorage ainda é válido comparando timestamps
    let precisaRecarregar = !carregouDoSession;
    if (!precisaRecarregar) {
      try {
        const sg = sessionStorage.getItem(_SS_GRUPOS);
        const se = sessionStorage.getItem(_SS_ELIM);
        const sr = sessionStorage.getItem(_SS_RES);
        const gLocal = sg ? JSON.parse(sg).gerado_em : null;
        const eLocal = se ? JSON.parse(se).gerado_em : null;
        const rLocal = sr ? JSON.parse(sr).gerado_em : null;
        if (tsG && gLocal !== tsG) precisaRecarregar = true;
        if (tsE && eLocal !== tsE) precisaRecarregar = true;
        if (tsR && rLocal !== tsR) precisaRecarregar = true;
      } catch (e) {
        precisaRecarregar = true;
      }
    }

    if (!precisaRecarregar) {
      // Cache ainda válido — apenas re-renderiza com configStatus atualizado
      renderAbaAtiva();
      return;
    }

    // Lê os 3 docs de cache do Firestore (3 reads)
    try {
      const [snapG, snapE, snapR] = await Promise.all([
        APP.db.collection("cache").doc("palpites_grupos").get(),
        APP.db.collection("cache").doc("palpites_eliminatorias").get(),
        APP.db.collection("cache").doc("resultados").get(),
      ]);

      const gDoc = snapG.exists ? snapG.data() : null;
      const eDoc = snapE.exists ? snapE.data() : null;
      const rDoc = snapR.exists ? snapR.data() : null;

      // Salva no sessionStorage para F5 subsequentes
      try {
        if (gDoc) sessionStorage.setItem(_SS_GRUPOS, JSON.stringify(gDoc));
        if (eDoc) sessionStorage.setItem(_SS_ELIM,   JSON.stringify(eDoc));
        if (rDoc) sessionStorage.setItem(_SS_RES,    JSON.stringify(rDoc));
      } catch (e) {
        console.warn("[cache] Falha ao salvar sessionStorage (quota?).", e);
      }

      _expandirCacheParaAppState(gDoc, eDoc, rDoc);
      carregouDoSession = true;
    } catch (e) {
      console.error("[cache] Erro ao ler cache do Firestore:", e);
      // Fallback: se o cache ainda não existe (sistema novo), seta apostadores
      // como carregados para desbloquear aposta.js
      if (!APP._apostadoresCarregados) {
        APP._apostadoresCarregados = true;
      }
    }

    atualizarBracket();
    renderAbaAtiva();
  });

  APP._unsubs.push(u);
}

// ─── getModelo: compatibilidade com tab-*.js e aposta.js ─────────────────────
function getModelo() {
  if (!APP.modelo) return null;
  return {
    ...APP.modelo,
    id:      "MODELO",
    apelido: "MODELO",
    nome:    "Modelo Estatístico",
    isModelo: true,
    especiais: APP.modelo.especiais || {},
  };
}
window.getModelo = getModelo;

// ─── Gravar resultado ─────────────────────────────────────────────────────────
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

// ─── Modo Simulação ───────────────────────────────────────────────────────────
function ativarSimulacao() {
  APP.modoSimulacao = true;
  APP.resultadosSim = {};
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
    return Object.assign({}, APP.resultados, APP.resultadosSim);
  }
  return APP.resultados;
}
function jogoEhSimulado(gameId) {
  return APP.modoSimulacao && APP.resultadosSim != null && APP.resultadosSim[gameId]?.simulado === true;
}

// ─── Bracket ──────────────────────────────────────────────────────────────────
function atualizarBracket() {
  APP.bracket = window.BRACKET.preencherBracket(getResultados());
}

// ─── Roteador ─────────────────────────────────────────────────────────────────
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

  const activeId = resetScroll ? null : document.activeElement?.id;
  const sy = resetScroll ? 0 : window.scrollY;
  const sStart = document.activeElement?.selectionStart;
  const sEnd = document.activeElement?.selectionEnd;

  const oldHeight = document.body.style.minHeight;
  document.body.style.minHeight = document.body.scrollHeight + 'px';

  fn[_abaAtiva]?.();

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

// ─── Utilitários ──────────────────────────────────────────────────────────────
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
  if (jogo.fase === "grupos")   return !!status.liberado_grupos;
  if (jogo.fase === "32avos")   return !!status.liberado_32avos;
  if (jogo.fase === "oitavas")  return !!status.liberado_oitavas;
  if (jogo.fase === "quartas")  return !!status.liberado_quartas;
  if (jogo.fase === "semis")    return !!status.liberado_semis;
  if (jogo.fase === "final" || jogo.fase === "terceiro") return !!status.liberado_finais;
  return false;
}

let _resizeTimer;
let _lastInnerWidth = window.innerWidth;
window.addEventListener("resize", () => {
  const newWidth = window.innerWidth;
  if (newWidth === _lastInnerWidth) return;
  _lastInnerWidth = newWidth;
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => renderAbaAtiva(), 250);
}, { passive: true });

document.addEventListener("DOMContentLoaded", initApp);
