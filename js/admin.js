/**
 * admin.js — Painel de controle do Bolão Copa 2026
 *
 * Estratégia de integração com app.js:
 *   - app.js chama iniciarRoteador() e renderAbaAtiva() via DOMContentLoaded.
 *   - admin.js é carregado DEPOIS de app.js no HTML, então sobrescreve essas
 *     funções no nível do módulo (fora de qualquer listener). Quando o
 *     DOMContentLoaded do app.js disparar, ele já encontra as versões admin.
 */

window._isAdminView = true;

// ─── UIDs autorizados ─────────────────────────────────────────────────────────
const ADMIN_UIDS = [
  "oSnCwYjIe6eh7W1pUhZZUtX0B1q2",
  "J0anvKKB5deimhpidxz6B7Ql2yd2",
  "PnHGV4PrzCY4HwbgYZiKu6IngPB2",
  "",
];

// ─── Estado do roteador admin ─────────────────────────────────────────────────
const ADMIN_ABAS = ["resultados", "apostadores", "tokens"];
let _adminAbaAtiva = "resultados";

// ─── Sobrescreve iniciarRoteador (chamada por app.js dentro do initApp) ───────
// Definido no nível do módulo → sobrescreve a função do app.js antes que o
// DOMContentLoaded dispare, porque admin.js é carregado por último no HTML.
window.iniciarRoteador = function () {
  firebase.auth().onAuthStateChanged(user => {
    if (user && ADMIN_UIDS.filter(Boolean).includes(user.uid)) {
      _montarRoteadorAdmin();
    } else {
      _renderLogin();
    }
  });
};

function _montarRoteadorAdmin() {
  document.querySelectorAll("[data-tab]").forEach(btn =>
    btn.addEventListener("click", () => _mudarAbaAdmin(btn.dataset.tab))
  );
  const hash = location.hash.replace("#", "");
  _mudarAbaAdmin(ADMIN_ABAS.includes(hash) ? hash : "resultados");
}

function _mudarAbaAdmin(aba) {
  if (!ADMIN_ABAS.includes(aba)) return;
  _adminAbaAtiva = aba;
  location.hash = aba;
  document.querySelectorAll("[data-tab]").forEach(b =>
    b.classList.toggle("ativa", b.dataset.tab === aba));
  document.querySelectorAll(".aba-conteudo").forEach(el =>
    el.classList.toggle("hidden", el.dataset.aba !== aba));
  _renderAbaAdmin();
}

// ─── Sobrescreve renderAbaAtiva (chamada pelos listeners do Firestore) ────────
window.renderAbaAtiva = function () {
  if (!_adminAutenticado()) return;
  _renderAbaAdmin();
};

function _renderAbaAdmin() {
  const fn = {
    resultados: renderAdmin,
    apostadores: renderApostadores,
    tokens: renderTokens,
  };
  fn[_adminAbaAtiva]?.();
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
function _adminAutenticado() {
  try {
    const user = firebase.auth().currentUser;
    return !!(user && ADMIN_UIDS.filter(Boolean).includes(user.uid));
  } catch (e) { return false; }
}

// Exposta globalmente pois app.js também declara adminAutenticado() com outra
// lógica (sessionStorage). No contexto admin.html, esta versão prevalece.
window.adminAutenticado = _adminAutenticado;

function loginAdmin() {
  const provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider)
    .then(result => {
      if (!ADMIN_UIDS.filter(Boolean).includes(result.user.uid)) {
        firebase.auth().signOut();
        alert("Essa conta Google não tem permissão de admin.");
        return;
      }
      _montarRoteadorAdmin();
    })
    .catch(e => alert("Erro no login: " + e.message));
}

function logoutAdmin() {
  firebase.auth().signOut().then(() => location.reload());
}

function _renderLogin() {
  // Esconde todas as abas e mostra a primeira com o card de login
  document.querySelectorAll(".aba-conteudo").forEach((el, i) =>
    el.classList.toggle("hidden", i !== 0));
  const main = document.querySelector(".aba-conteudo");
  if (!main) return;
  main.innerHTML =
    '<div class="card" style="max-width:340px;margin:40px auto;text-align:center">' +
    '<div class="card-titulo">🔐 Acesso Admin</div>' +
    '<p style="font-size:.85rem;color:var(--texto2);margin-bottom:20px">' +
    'Faça login com a conta Google autorizada.' +
    '</p>' +
    '<button class="btn btn-primario" style="margin:0 auto;display:inline-flex;align-items:center;gap:8px" onclick="loginAdmin()">🔑 Entrar com Google</button>' +
    '</div>';
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA RESULTADOS
// ═══════════════════════════════════════════════════════════════════════════════
function renderAdmin() {
  const main = document.getElementById("aba-resultados");
  if (!main) return;

  const res = getResultados();
  const tg = window.BRACKET.calcularTodosOsGrupos(res);
  const status = APP.configStatus || {};

  let h = '<div style="display:flex;flex-direction:column;gap:12px;margin-bottom:12px">';

  // Linha de controles de trava (Mobile-First)
  h += '<div class="card" style="padding:10px;margin-bottom:0">';
  h += '<div style="font-size:.75rem;font-weight:700;color:var(--texto2);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">🔓 Controle de Acesso (Manual)</div>';
  h += '<div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none;-ms-overflow-style:none">';

  const bts = [
    { k: "grupos", l: "Grupos" },
    { k: "32avos", l: "32avos" },
    { k: "oitavas", l: "Oitavas" },
    { k: "quartas", l: "Quartas" },
    { k: "semis", l: "Semis" },
    { k: "finais", l: "Finais" }
  ];

  bts.forEach(b => {
    const liberado = !!status["liberado_" + b.k];
    const icon = liberado ? "🔓" : "🔒";
    const cl = liberado ? "btn-primario" : "btn-perigo";
    h += `<button class="btn ${cl} btn-sm" onclick="toggleStatusFase('${b.k}')" style="white-space:nowrap;font-size:.65rem;padding:4px 8px;flex-shrink:0">${icon} ${b.l}</button>`;
  });

  h += '</div></div>';

  // Linha de ações globais
  h += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">';
  h += '<div style="font-size:.9rem;font-weight:800">🔧 Resultados Oficiais</div>';
  h += '<div style="display:flex;gap:6px;flex-wrap:wrap">';
  h += '<button class="btn btn-perigo btn-sm" onclick="limparTudoAdmin()">🗑 Limpar</button>';
  h += '<button class="btn btn-primario btn-sm" onclick="gravarTudoAdmin()">💾 GRAVAR OFICIAL</button>';
  h += '<button class="btn btn-sm" onclick="logoutAdmin()" style="background:var(--borda)">Sair</button>';
  h += '</div></div></div>';

  // Botões de regeneração de cache (emergência)
  h += '<details style="margin-bottom:8px"><summary style="font-size:.72rem;color:var(--texto2);cursor:pointer;padding:4px 0">🔄 Regenerar cache manualmente</summary>';
  h += '<div style="display:flex;gap:8px;flex-wrap:wrap;padding:8px 0">';
  h += '<button class="btn btn-sm" onclick="gerarCachePalpites(\'grupos\')" style="font-size:.75rem;font-weight:800;background:rgba(245,166,35,0.12);color:var(--dourado);border:1px solid rgba(245,166,35,0.3);flex:1;min-width:140px;padding:8px 12px;border-radius:6px;white-space:normal">🔄 Gerar Cache dos Grupos</button>';
  h += '<button class="btn btn-sm" onclick="gerarCachePalpites(\'eliminatorias\')" style="font-size:.75rem;font-weight:800;background:rgba(245,166,35,0.12);color:var(--dourado);border:1px solid rgba(245,166,35,0.3);flex:1;min-width:140px;padding:8px 12px;border-radius:6px;white-space:normal">🔄 Gerar Cache das Eliminatórias</button>';
  h += '<button class="btn btn-sm" onclick="manualGerarCacheTokens()" style="font-size:.75rem;font-weight:800;background:rgba(245,166,35,0.12);color:var(--dourado);border:1px solid rgba(245,166,35,0.3);flex:1;min-width:140px;padding:8px 12px;border-radius:6px;white-space:normal">🔄 Gerar Cache dos Tokens</button>';
  h += '</div></details>';

  h += renderJogosComToggle(res, tg, true, null);

  // Pódio automático (visível assim que FNL ou TPL tiverem resultado)
  h += renderTabelaPodio(res, APP.bracket || {});

  // Log compacto
  const log = JSON.parse(localStorage.getItem("bolao_admin_log") || "[]");
  if (log.length) {
    h += '<div class="card"><div class="card-titulo">📋 Log ' +
      '<button class="btn btn-perigo btn-sm" onclick="limparLog()">Limpar</button></div>';
    h += '<div style="font-size:.7rem;color:var(--texto2);display:flex;flex-direction:column;gap:3px;max-height:200px;overflow-y:auto">';
    log.slice().reverse().forEach(l => (h += '<div style="padding:3px 0;border-bottom:1px solid var(--borda)">' + l + '</div>'));
    h += '</div></div>';
  }

  main.innerHTML = h;
}

function limparLog() {
  if (!confirm("Limpar log?")) return;
  localStorage.removeItem("bolao_admin_log");
  renderAdmin();
}

async function limparTudoAdmin() {
  if (!_adminAutenticado()) return alert("Não autorizado.");
  if (!confirm("⚠️ ALERTA CRÍTICO: LIMPEZA DE RESULTADOS\n\nVocê está prestes a apagar TODOS os resultados oficiais já inseridos no sistema.\n\nFique tranquilo: isso NÃO apaga as apostas feitas pelos usuários, apenas reseta os placares reais.\n\nEssa ação zera a pontuação gerada e NÃO pode ser desfeita.\n\nDeseja CONFIRMAR a exclusão total?")) return;

  // Bug 3: aguarda a deleção no servidor ANTES de alterar estado local.
  try {
    // Apaga de uma vez só a fonte de verdade consolidada
    await APP.db.collection("resultados_oficiais").doc("dados").delete().catch(() => {});
  } catch (e) {
    alert("Erro ao limpar no servidor: " + e.message + "\nNenhum dado foi alterado.");
    return;
  }

  APP.resultados = {};
  APP.resultadosSim = null;
  document.querySelectorAll('input[type="number"]').forEach(el => (el.value = ""));
  atualizarBracket();
  renderAdmin();
}

async function gravarTudoAdmin() {
  if (!_adminAutenticado()) return alert("Não autorizado.");
  const log = JSON.parse(localStorage.getItem("bolao_admin_log") || "[]");

  // Coleta todos os jogos que mudaram antes de tocar no estado local
  const pendentes = [];
  if (!APP.resultados) APP.resultados = {};

  for (const j of window.SCHEDULE) {
    const hg = parseInt(document.getElementById("sim-hg-" + j.id)?.value);
    const ag = parseInt(document.getElementById("sim-ag-" + j.id)?.value);
    if (isNaN(hg) || isNaN(ag)) continue;

    let foiPen = false, penH = null, penA = null;
    if (j.fase !== "grupos" && hg === ag) {
      penH = parseInt(document.getElementById("pen-hg-" + j.id)?.value);
      penA = parseInt(document.getElementById("pen-ag-" + j.id)?.value);
      if (!isNaN(penH) && !isNaN(penA)) {
        if (penH === penA) { alert("Pênaltis não podem empatar! Jogo: " + j.id); return; }
        foiPen = true;
      }
    }
    const pv = foiPen ? (penH > penA ? "home" : "away") : null;

    const resLocal = APP.resultados[j.id];
    if (!resLocal || resLocal.homeGoals !== hg || resLocal.awayGoals !== ag || resLocal.foi_penaltis !== foiPen) {
      pendentes.push({
        id: j.id,
        data: {
          gameId: j.id, homeGoals: hg, awayGoals: ag,
          foi_penaltis: foiPen, penaltis_vencedor: pv,
          penaltis_home: foiPen ? penH : null, penaltis_away: foiPen ? penA : null,
          inserido_em: new Date().toISOString(), inserido_por: "admin"
        }
      });
    }
  }

  if (pendentes.length === 0) { alert("Nenhum novo placar para gravar."); return; }

  // Persiste no Firestore em um único doc (CQRS / Dicionário)
  try {
    const payload = {};
    for (const p of pendentes) {
      payload[p.id] = p.data;
    }
    
    await APP.db.collection("resultados_oficiais").doc("dados").set(payload, { merge: true });
    
    // Invalida cache local das sessões abertas
    const ts = new Date().toISOString();
    await APP.db.collection("config").doc("status").set({ cache_res_ts: ts }, { merge: true });
  } catch (e) {
    alert("❌ Erro ao gravar no servidor:\n" + e.message + "\n\nNenhum dado foi alterado localmente.");
    return;
  }

  // Só agora atualiza o estado local (servidor já confirmou)
  for (const p of pendentes) {
    APP.resultados[p.id] = p.data;
    log.push(new Date().toLocaleString("pt-BR") + " | " + p.id + " | " + p.data.homeGoals + "x" + p.data.awayGoals);
  }

  localStorage.setItem("bolao_admin_log", JSON.stringify(log.slice(-50)));
  atualizarBracket();
  renderAdmin();
  alert("✅ " + pendentes.length + " jogos gravados com sucesso!");
}

function toggleStatusFase(fase) {
  if (!_adminAutenticado()) return alert("Não autorizado.");
  const key = "liberado_" + fase;
  const atual = !!(APP.configStatus && APP.configStatus[key]);
  const novo = !atual;

  if (!confirm("🔒 CONTROLE DE FASE\n\nVocê está prestes a " + (novo ? "LIBERAR" : "TRAVAR") + " a fase: " + fase.toUpperCase() + ".\n\n- Se TRAVAR: Ninguém mais poderá alterar palpites nesta fase.\n- Se LIBERAR: Os participantes voltarão a poder editar seus palpites.\n\nLembre-se: Você sempre pode reverter essa decisão a qualquer momento clicando novamente.\n\nDeseja CONFIRMAR a alteração?")) return;

  APP.db.collection("config").doc("status")
    .set({ [key]: novo }, { merge: true })
    .then(async () => {
      // Ao TRAVAR: gera cache automático dos palpites desta fase de forma silenciosa e depois alerta consolidado
      if (!novo) {
        const tipoCache = fase === "grupos" ? "grupos" : "eliminatorias";
        await gerarCachePalpites(tipoCache, true);
        alert("🔒 FASE TRAVADA COM SUCESSO!\n\nA fase " + fase.toUpperCase() + " foi bloqueada para palpites e os dados de todos os apostadores foram salvos em cache.");
        renderAdmin();
      } else {
        alert("🔓 FASE LIBERADA COM SUCESSO!\n\nA fase " + fase.toUpperCase() + " está liberada para palpites.");
        renderAdmin();
      }
    })
    .catch(e => alert("Erro: " + e.message));
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA APOSTADORES
// ═══════════════════════════════════════════════════════════════════════════════

const FASES_CONFIG = [
  { key: "grupos", label: "Grupos" },
  { key: "32avos", label: "32avos" },
  { key: "oitavas", label: "Oitavas" },
  { key: "quartas", label: "Quartas" },
  { key: "semis", label: "Semis" },
  { key: "finais", label: "Finais" },
];

function _totalJogosFase(fase) {
  const fases = fase === "finais" ? ["final", "terceiro"] : [fase];
  return (window.SCHEDULE || []).filter(j => fases.includes(j.fase)).length;
}

function _palpitesFase(apostadorId, fase) {
  const fases = fase === "finais" ? ["final", "terceiro"] : [fase];
  const pals = APP.palpites[apostadorId] || {};
  return (window.SCHEDULE || []).filter(j => fases.includes(j.fase)).filter(j => {
    const p = pals[j.id];
    return p && p.homeGoals !== undefined && p.awayGoals !== undefined;
  }).length;
}

function _especialesPreenchidos(apostador) {
  const esp = apostador.especiais || {};
  return { preenchidos: ["campeao", "vice", "terceiro"].filter(k => esp[k]).length, total: 3 };
}

function _palpitesModeloFase(faseKey) {
  const fasesReais = faseKey === "finais" ? ["final", "terceiro"] : [faseKey];
  const pals = APP.palpitesModelo || {};
  return (window.SCHEDULE || [])
    .filter(j => fasesReais.includes(j.fase))
    .filter(j => {
      const p = pals[j.id];
      return p && p.homeGoals !== undefined && p.awayGoals !== undefined;
    }).length;
}

function _htmlEditModelo() {
  let h = '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">';
  h += '<div style="font-size:.7rem;font-weight:700;color:#b8cfe8;padding:4px 8px;background:rgba(180,210,240,0.08);border-radius:4px">🤖 Modelo — Apostador Estatístico</div>';
  h += '<div><label style="font-size:.67rem;color:var(--texto2);display:block;margin-bottom:3px">Limpar apostas de</label>';
  h += '<select id="edit-fase-MODELO" class="form-input" style="padding:4px 8px;font-size:.72rem;height:28px">';
  h += '<option value="">— selecionar —</option>';
  for (const f of FASES_CONFIG)
    h += '<option value="' + f.key + '">' + f.label + '</option>';
  h += '<option value="todas">⚠️ TODAS</option>';
  h += '</select></div>';
  h += '<div style="display:flex;gap:6px;margin-top:auto">';
  h += '<button class="btn btn-primario btn-sm" onclick="window.MODELO_MANAGER.atualizar()" style="font-size:.7rem">🤖 Atualizar MODELO</button>';
  h += '<button class="btn btn-perigo btn-sm" onclick="_limparFaseModelo()" style="font-size:.7rem">🗑 Limpar</button>';
  h += '<button class="btn btn-sm" onclick="toggleEditApostador(\'MODELO\')" style="font-size:.7rem;background:var(--borda)">✕ Fechar</button>';
  h += '</div></div>';
  return h;
}

function _limparFaseModelo() {
  const fase = document.getElementById("edit-fase-MODELO")?.value;
  if (!fase) return alert("Selecione uma fase para limpar.");
  if (fase === "todas") {
    window.MODELO_MANAGER.limparTodas();
  } else {
    window.MODELO_MANAGER.limparFase(fase);
  }
}

function _htmlLinhaModelo(numCols) {
  const m = APP.modelo;
  const baseUrl = "https://ciclopeestrabico.github.io/bolao-copa-2026/aposta.html?token=modelo";
  let h = '';

  h += '<tr style="background:rgba(180,210,240,0.05);border-top:1px solid rgba(180,210,240,0.18)" id="row-MODELO">';
  h += '<td style="' + _tdS("left") + '">';
  h += '<div style="font-weight:700;color:#b8cfe8">Modelo</div>';
  h += '<div style="color:var(--texto2);font-size:.65rem;margin-top:1px">Referência estatística</div>';
  h += '</td>';
  h += '<td style="' + _tdS() + '">';
  h += '<a href="' + baseUrl + '" target="_blank" style="color:#b8cfe8;text-decoration:underline;font-size:.66rem;font-family:monospace">modelo</a>';
  h += '</td>';

  for (const f of FASES_CONFIG) {
    const total = _totalJogosFase(f.key);
    const feitos = _palpitesModeloFase(f.key);
    let cor = "var(--texto2)";
    if (total > 0 && feitos === total) cor = "var(--verde-light)";
    else if (feitos > 0) cor = "#b8cfe8";
    h += '<td style="' + _tdS() + 'color:' + cor + ';font-weight:' + (feitos > 0 ? 700 : 400) + '">';
    h += feitos;
    if (total) h += '<span style="opacity:.4;font-size:.64rem">/' + total + '</span>';
    h += '</td>';
  }

  const esp = m?.especiais || {};
  const espCount = ["campeao", "vice", "terceiro"].filter(k => esp[k]).length;
  const espCor = espCount === 3 ? "var(--verde-light)" : espCount > 0 ? "var(--dourado)" : "var(--texto2)";
  h += '<td style="' + _tdS() + 'color:' + espCor + ';font-weight:' + (espCount > 0 ? 700 : 400) + '">';
  h += espCount + '<span style="opacity:.4;font-size:.64rem">/3</span></td>';

  h += '<td style="' + _tdS() + '">';
  h += '<div style="display:flex;gap:4px;justify-content:center">';
  h += '<button class="btn btn-sm" onclick="toggleEditApostador(\'MODELO\')" style="font-size:.64rem;padding:3px 7px" title="Gerenciar MODELO">✏️</button>';
  h += '</div></td>';
  h += '</tr>';

  h += '<tr id="edit-row-MODELO" style="display:none">';
  h += '<td colspan="' + numCols + '" style="padding:10px 14px;background:color-mix(in srgb,var(--fundo2) 70%,transparent)">';
  h += _htmlEditModelo();
  h += '</td></tr>';

  return h;
}

function renderApostadores() {
  const el = document.getElementById("aba-apostadores");
  if (!el) return;

  const apostadores = APP.apostadores;

  let h = '<div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">';
  h += '<div style="font-size:.9rem;font-weight:800">👥 Apostadores';
  h += ' <span style="font-size:.74rem;font-weight:400;color:var(--texto2)">(' + apostadores.length + ' cadastrados)</span>';
  h += '</div></div>';

  if (!apostadores.length) {
    h += '<div class="card" style="text-align:center;color:var(--texto2);padding:30px">Nenhum apostador cadastrado ainda.</div>';
    el.innerHTML = h;
    return;
  }

  // Número de colunas: Apostador + Token + fases + especiais + ações
  const numCols = 2 + FASES_CONFIG.length + 1 + 1;

  h += '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:var(--radius-sm);border:1px solid var(--borda)">';
  h += '<table style="width:100%;border-collapse:collapse;font-size:.74rem;min-width:680px">';

  h += '<thead><tr style="background:var(--fundo2)">';
  h += _th("Apostador", "left", "min-width:130px");
  h += _th("Token");
  for (const f of FASES_CONFIG) {
    const total = _totalJogosFase(f.key);
    h += _th(f.label + (total ? '<br><span style="font-weight:400;opacity:.55">/' + total + '</span>' : ''));
  }
  h += _th('Especiais<br><span style="font-weight:400;opacity:.55">/3</span>');
  h += _th("Ações");
  h += '</tr></thead><tbody>';

  apostadores.forEach((a, idx) => {
    const esp = _especialesPreenchidos(a);
    const bg = idx % 2 !== 0 ? "background:var(--fundo2)" : "";

    h += '<tr style="border-bottom:1px solid var(--borda);' + bg + '" id="row-' + a.id + '">';

    // Nome/apelido
    h += '<td style="' + _tdS("left") + '">';
    h += '<div style="font-weight:700">' + _esc(a.apelido || "—") + '</div>';
    h += '<div style="color:var(--texto2);font-size:.65rem;margin-top:1px">' + _esc(a.nome || "sem nome") + '</div>';
    h += '</td>';

    // Token (com link para aposta.html)
    const baseUrl = "https://ciclopeestrabico.github.io/bolao-copa-2026/aposta.html?token=";
    const link = baseUrl + (a.token || "");
    h += '<td style="' + _tdS() + '">';
    h += '<a href="' + link + '" target="_blank" style="color:var(--dourado);text-decoration:underline;font-size:.66rem;font-family:monospace">';
    h += _esc(a.token || "—") + '</a></td>';

    // Fases
    for (const f of FASES_CONFIG) {
      const total = _totalJogosFase(f.key);
      const feitos = _palpitesFase(a.id, f.key);
      let cor = "var(--texto2)";
      if (total > 0 && feitos === total) cor = "var(--verde-light)";
      else if (feitos > 0) cor = "var(--dourado)";
      h += '<td style="' + _tdS() + 'color:' + cor + ';font-weight:' + (feitos > 0 ? 700 : 400) + '">';
      h += feitos;
      if (total) h += '<span style="opacity:.4;font-size:.64rem">/' + total + '</span>';
      h += '</td>';
    }

    // Especiais
    {
      const { preenchidos, total } = esp;
      const cor = preenchidos === total ? "var(--verde-light)" : preenchidos > 0 ? "var(--dourado)" : "var(--texto2)";
      h += '<td style="' + _tdS() + 'color:' + cor + ';font-weight:' + (preenchidos > 0 ? 700 : 400) + '">';
      h += preenchidos + '<span style="opacity:.4;font-size:.64rem">/3</span></td>';
    }

    // Ações
    h += '<td style="' + _tdS() + '">';
    h += '<div style="display:flex;gap:4px;justify-content:center">';
    h += '<button class="btn btn-sm" onclick="toggleEditApostador(\'' + a.id + '\')" style="font-size:.64rem;padding:3px 7px" title="Editar">✏️</button>';
    h += '<button class="btn btn-perigo btn-sm" onclick="deletarApostadorId(\'' + a.id + '\')" style="font-size:.64rem;padding:3px 7px" title="Deletar">🗑</button>';
    h += '</div></td>';
    h += '</tr>';

    // Linha de edição inline (oculta por padrão)
    h += '<tr id="edit-row-' + a.id + '" style="display:none">';
    h += '<td colspan="' + numCols + '" style="padding:10px 14px;background:color-mix(in srgb,var(--fundo2) 70%,transparent)">';
    h += _htmlEditApostador(a);
    h += '</td></tr>';
  });

  // Separador + linha do MODELO
  h += '<tr><td colspan="' + numCols + '" style="height:1px;padding:0;background:rgba(180,210,240,0.25)"></td></tr>';
  if (APP._modeloCarregado !== false) {
    h += _htmlLinhaModelo(numCols);
  }

  h += '</tbody></table></div>';
  el.innerHTML = h;
}

function _th(label, align, extra) {
  return '<th style="padding:8px 10px;text-align:' + (align || "center") + ';font-size:.7rem;' +
    'font-weight:700;border-bottom:2px solid var(--borda);white-space:nowrap;' + (extra || "") + '">' + label + '</th>';
}
function _tdS(align) {
  return 'padding:7px 10px;text-align:' + (align || "center") + ';vertical-align:middle;';
}
function _esc(str) {
  return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function _htmlEditApostador(a) {
  let h = '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">';

  h += '<div><label style="font-size:.67rem;color:var(--texto2);display:block;margin-bottom:3px">Nome</label>';
  h += '<input id="edit-nome-' + a.id + '" type="text" class="form-input" value="' + _esc(a.nome || "") + '" style="padding:4px 8px;font-size:.74rem;width:160px"></div>';

  h += '<div><label style="font-size:.67rem;color:var(--texto2);display:block;margin-bottom:3px">Apelido</label>';
  h += '<input id="edit-apelido-' + a.id + '" type="text" class="form-input" maxlength="10" value="' + _esc(a.apelido || "") + '" style="padding:4px 8px;font-size:.74rem;width:90px"></div>';

  h += '<div><label style="font-size:.67rem;color:var(--texto2);display:block;margin-bottom:3px">Token</label>';
  h += '<input id="edit-token-' + a.id + '" type="text" class="form-input" value="' + _esc(a.token || "") + '" style="padding:4px 8px;font-size:.74rem;width:110px"></div>';

  h += '<div><label style="font-size:.67rem;color:var(--texto2);display:block;margin-bottom:3px">Limpar apostas de</label>';
  h += '<select id="edit-fase-' + a.id + '" class="form-input" style="padding:4px 8px;font-size:.72rem;height:28px">';
  h += '<option value="">— selecionar —</option>';
  for (const f of FASES_CONFIG)
    h += '<option value="' + f.key + '">' + f.label + '</option>';
  h += '<option value="especiais">Especiais</option>';
  h += '<option value="todas">⚠️ TODAS</option>';
  h += '</select></div>';

  h += '<div style="display:flex;gap:6px;margin-top:auto">';
  h += '<button class="btn btn-primario btn-sm" onclick="salvarEdicaoApostador(\'' + a.id + '\')" style="font-size:.7rem">💾 Salvar</button>';
  h += '<button class="btn btn-perigo btn-sm" onclick="limparFaseApostador(\'' + a.id + '\')" style="font-size:.7rem">🗑 Limpar</button>';
  h += '<button class="btn btn-sm" onclick="toggleEditApostador(\'' + a.id + '\')" style="font-size:.7rem;background:var(--borda)">✕ Fechar</button>';
  h += '</div></div>';
  return h;
}

function toggleEditApostador(id) {
  document.querySelectorAll('[id^="edit-row-"]').forEach(r => {
    if (r.id !== "edit-row-" + id) r.style.display = "none";
  });
  const row = document.getElementById("edit-row-" + id);
  if (row) row.style.display = row.style.display === "none" ? "" : "none";
}

async function salvarEdicaoApostador(id) {
  if (!_adminAutenticado()) return alert("Não autorizado.");
  const a = APP.apostadores.find(x => x.id === id);
  if (!a) return;

  if (!confirm("✏️ ALTERAR DADOS DO APOSTADOR\n\nVocê modificou os dados de perfil deste apostador. Isso atualizará as informações visíveis dele na tabela de classificação geral.\n\nDeseja CONFIRMAR as alterações?")) return;

  const novoNome = document.getElementById("edit-nome-" + id)?.value.trim();
  const novoApelido = document.getElementById("edit-apelido-" + id)?.value.trim();
  const novoToken = document.getElementById("edit-token-" + id)?.value.trim();

  if (!novoNome) return alert("Nome não pode ser vazio.");
  a.nome = novoNome;
  a.apelido = novoApelido;
  if (novoToken !== undefined) a.token = novoToken;

  await gravarApostador(a);
  toggleEditApostador(id);
  renderApostadores();
}

async function limparFaseApostador(id) {
  if (!_adminAutenticado()) return alert("Não autorizado.");
  const fase = document.getElementById("edit-fase-" + id)?.value;
  if (!fase) return alert("Selecione uma fase para limpar.");

  const a = APP.apostadores.find(x => x.id === id);
  const nome = a?.apelido || a?.nome || id;
  const desc = fase === "todas" ? "TODAS as apostas" : fase === "especiais" ? "apostas especiais" : "apostas: " + fase;
  if (!confirm("🗑 EXCLUIR PALPITES DO APOSTADOR\n\nVocê vai deletar " + desc + " pertencentes a " + nome + ".\nOs dados serão apagados definitivamente do banco de dados e a pontuação dele será reduzida.\n\nDeseja CONFIRMAR a exclusão?")) return;

  if (fase === "especiais") {
    if (a) {
      a.especiais = {};
      await APP.db.collection("apostadores").doc(id).collection("dados").doc("palpites").set({ especiais: {} }, { merge: true });
    }
  } else {
    const fasesFiltro = fase === "todas" ? ["grupos", "32avos", "oitavas", "quartas", "semis", "final", "terceiro"] :
      (fase === "finais" ? ["final", "terceiro"] : [fase]);
    const jogosParaLimpar = (window.SCHEDULE || []).filter(j => fasesFiltro.includes(j.fase));

    // Remove do estado local
    for (const j of jogosParaLimpar) {
      if (APP.palpites[id]) delete APP.palpites[id][j.id];
    }

    // Remove do documento compacto (lê, filtra, regrava)
    try {
      const docRef = APP.db.collection("apostadores").doc(id).collection("dados").doc("palpites");
      const snap = await docRef.get();
      if (snap.exists) {
        const mapa = snap.data() || {};
        const idsParaLimpar = new Set(jogosParaLimpar.map(j => j.id));
        const mapaFiltrado = {};
        for (const [k, v] of Object.entries(mapa)) {
          if (!idsParaLimpar.has(k)) mapaFiltrado[k] = v;
        }
        await docRef.set(mapaFiltrado);
      }
    } catch (e) { console.warn("[admin] Erro ao limpar doc compacto:", e); }

    // Mantém limpeza da subcollection antiga (dual-write — remover após migração)
    for (const j of jogosParaLimpar) {
      await APP.db.collection("apostadores").doc(id)
        .collection("palpites_jogos").doc(j.id).delete().catch(() => { });
    }

    if (fase === "todas" && a) {
      a.especiais = {};
      await APP.db.collection("apostadores").doc(id).collection("dados").doc("palpites").set({ especiais: {} }, { merge: true });
    }
  }

  toggleEditApostador(id);
  renderApostadores();
  alert("✅ Apostas limpas.");
}

async function deletarApostadorId(id) {
  if (!_adminAutenticado()) return alert("Não autorizado.");
  const a = APP.apostadores.find(x => x.id === id);
  const nome = _esc(a?.apelido || a?.nome || id);
  if (!confirm("⛔ DELEÇÃO DEFINITIVA DE APOSTADOR\n\nCUIDADO! Você está excluindo permanentemente " + nome + " e TODOS os seus palpites.\nO token utilizado por ele voltará a ficar disponível na aba de Tokens.\nEsta ação NÃO pode ser desfeita.\n\nDeseja CONFIRMAR a exclusão?")) return;

  const tokenDoApostador = a?.token;
  const apelidoDoApostador = a?.apelido || "";

  try {
    // Deletar documento compacto de palpites
    await APP.db.collection("apostadores").doc(id)
      .collection("dados").doc("palpites").delete().catch(() => { });

    // Deletar subcoleção antiga (dual-write — remover após migração)
    const palpitesSnap = await APP.db.collection("apostadores").doc(id)
      .collection("palpites_jogos").get();
    await Promise.all(palpitesSnap.docs.map(doc => doc.ref.delete()));

    // Deletar o documento do apostador
    await APP.db.collection("apostadores").doc(id).delete();

    // Token volta para "Enviado" — operação secundária
    if (tokenDoApostador) {
      try {
        const tokenSnap = await APP.db.collection("tokens")
          .where("token", "==", tokenDoApostador)
          .limit(1)
          .get();
        if (!tokenSnap.empty) {
          const tokenDoc = tokenSnap.docs[0];
          const dadosAtuais = tokenDoc.data();
          const tokenUpdate = {
            enviado: true,
            apelido: dadosAtuais.apelido || apelidoDoApostador,
            enviado_em: dadosAtuais.enviado_em || new Date().toISOString()
          };
          await tokenDoc.ref.update(tokenUpdate);

          // Auto-save cirúrgico no Dicionário de cache de tokens
          await APP.db.collection("cache").doc("tokens").set({ [tokenDoc.id]: tokenUpdate }, { merge: true });
        }
      } catch (_) { /* falha no token não impede a deleção */ }
    }
  } catch (e) {
    alert("Erro ao deletar no servidor: " + e.message + "\nNenhum dado foi alterado.");
    return;
  }

  // Só atualiza estado local após confirmar sucesso no servidor
  APP.apostadores = APP.apostadores.filter(x => x.id !== id);
  delete APP.palpites[id];
  renderApostadores();

  // Regenerar caches compactos silenciosamente para refletir a deleção na UI pública imediatamente
  try {
    await Promise.all([
      gerarCachePalpites("grupos", true),
      gerarCachePalpites("eliminatorias", true)
    ]);
  } catch (e) {
    console.error("[admin] Erro ao regenerar caches compactos pós-deleção:", e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA TOKENS
// ═══════════════════════════════════════════════════════════════════════════════

async function renderTokens() {
  const el = document.getElementById("aba-tokens");
  if (!el) return;

  el.innerHTML = '<div class="loading"><div class="spinner"></div>Buscando tokens...</div>';

  let tokensObj = {};
  try {
    const snap = await APP.db.collection("cache").doc("tokens").get();
    if (snap.exists) {
      tokensObj = snap.data();
    } else {
      tokensObj = await gerarCacheTokens() || {};
    }
  } catch (e) {
    el.innerHTML = '<div class="card" style="color:var(--vermelho)">Erro ao carregar tokens: ' + _esc(e.message) + '</div>';
    return;
  }

  // Converte dicionário em array pra desenhar a UI igualzinho antes e ORDENA por número
  let tokens = Object.keys(tokensObj).map(id => ({ id, ...tokensObj[id] }))
                 .sort((a, b) => (a.numero || 0) - (b.numero || 0));

  const tokensUsados = new Set(APP.apostadores.map(a => a.token).filter(Boolean));
  const usados = tokens.filter(t => tokensUsados.has(t.token));
  const enviados = tokens.filter(t => !tokensUsados.has(t.token) && t.enviado === true);
  const livres = tokens.filter(t => !tokensUsados.has(t.token) && t.enviado !== true && t.ativo !== false);
  const inativos = tokens.filter(t => !tokensUsados.has(t.token) && t.enviado !== true && t.ativo === false);

  let h = '<div style="margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">';
  h += '<div style="font-size:.9rem;font-weight:800">🔑 Tokens</div>';
  h += '<span style="font-size:.71rem;padding:2px 8px;border-radius:10px;background:var(--verde-ok);color:#fff">' + usados.length + ' em uso</span>';
  h += '<span style="font-size:.71rem;padding:2px 8px;border-radius:10px;background:var(--dourado);color:#000">' + enviados.length + ' enviados</span>';
  h += '<span style="font-size:.71rem;padding:2px 8px;border-radius:10px;border:1px solid var(--verde-light);color:var(--verde-light)">' + livres.length + ' disponíveis</span>';
  if (inativos.length)
    h += '<span style="font-size:.71rem;padding:2px 8px;border-radius:10px;border:1px solid var(--borda);color:var(--texto2)">' + inativos.length + ' inativos</span>';
  h += '<button class="btn btn-primario btn-sm" onclick="criarToken()" style="margin-left:auto">+ Novo Token</button>';
  h += '</div>';

  if (usados.length) {
    h += '<div class="card"><div class="card-titulo">✅ Em Uso (' + usados.length + ')</div>';
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px">';
    usados.forEach(t => { h += _tokenCard(t, APP.apostadores.find(a => a.token === t.token), "usado"); });
    h += '</div></div>';
  }

  if (enviados.length) {
    h += '<div class="card"><div class="card-titulo">✉️ Enviados (' + enviados.length + ')</div>';
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px">';
    enviados.forEach(t => { h += _tokenCard(t, null, "enviado"); });
    h += '</div></div>';
  }

  if (livres.length) {
    h += '<div class="card"><div class="card-titulo">🟢 Disponíveis (' + livres.length + ')</div>';
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px">';
    livres.forEach(t => { h += _tokenCard(t, null, "livre"); });
    h += '</div></div>';
  }

  if (inativos.length) {
    h += '<div class="card"><div class="card-titulo">⛔ Inativos (' + inativos.length + ')</div>';
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px">';
    inativos.forEach(t => { h += _tokenCard(t, null, "inativo"); });
    h += '</div></div>';
  }

  if (!tokens.length) {
    h += '<div class="card" style="text-align:center;padding:30px;color:var(--texto2)">';
    h += 'Nenhum token cadastrado.<br><br>';
    h += '<button class="btn btn-primario" onclick="criarToken()">+ Criar primeiro token</button></div>';
  }

  el.innerHTML = h;
}

function _tokenCard(t, apt, tipo) {
  const corBorda = tipo === "usado" ? "var(--verde-ok)" : tipo === "enviado" ? "var(--dourado)" : tipo === "livre" ? "var(--verde-light)" : "var(--borda)";
  const tokenVal = t.token || t.id;
  const baseUrl = "https://ciclopeestrabico.github.io/bolao-copa-2026/aposta.html?token=";
  const link = baseUrl + tokenVal;

  let h = '<div style="background:var(--fundo2);border-radius:var(--radius-sm);padding:10px 12px;border-left:3px solid ' + corBorda + '">';

  h += '<div style="display:flex;align-items:center;gap:5px;margin-bottom:6px">';
  h += '<code style="font-size:.7rem;color:var(--dourado);background:var(--fundo);padding:2px 6px;border-radius:3px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _esc(tokenVal) + '</code>';
  h += '<button onclick="copiarTexto(\'' + _esc(tokenVal) + '\',this)" title="Copiar token" style="border:none;background:none;cursor:pointer;font-size:.85rem;padding:1px 3px;flex-shrink:0">📋</button>';
  h += '</div>';

  if (apt) {
    h += '<div style="font-size:.73rem;font-weight:700">' + _esc(apt.apelido || apt.nome || "—") + '</div>';
    if (apt.nome && apt.apelido) h += '<div style="font-size:.65rem;color:var(--texto2)">' + _esc(apt.nome) + '</div>';
  } else if (tipo === "enviado") {
    h += '<div style="font-size:.73rem;font-weight:700;color:var(--dourado)">✉️ ' + _esc(t.apelido || "—") + '</div>';
    if (t.enviado_em) h += '<div style="font-size:.6rem;color:var(--texto2)">' + new Date(t.enviado_em).toLocaleDateString("pt-BR") + '</div>';
  } else if (tipo === "livre") {
    h += '<div style="font-size:.68rem;color:var(--verde-light);margin-bottom:2px">Disponível</div>';
    h += '<div style="font-size:.62rem;color:var(--texto2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">';
    h += '<a href="' + link + '" target="_blank" style="color:inherit">' + link + '</a></div>';
  } else {
    h += '<div style="font-size:.68rem;color:var(--texto2)">Inativo</div>';
  }

  h += '<div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap">';

  // Botão PAGO para tokens Em Uso e Enviados
  if (tipo === "usado" || tipo === "enviado") {
    const isPago = t.pago === true;
    const btnText = isPago ? "✅ PAGO" : "A PAGAR";
    const btnStyle = isPago ? "background:var(--verde-ok);color:#fff;border:none" : "background:transparent;color:var(--texto2);border:1px solid var(--borda)";
    h += '<button class="btn btn-sm" onclick="togglePago(\'' + t.id + '\', ' + !isPago + ')" style="font-size:.62rem;padding:2px 6px;' + btnStyle + '">' + btnText + '</button>';
  }

  if (tipo === "livre") {
    h += '<button class="btn btn-sm" onclick="copiarLink(\'' + link + '\',this)" style="font-size:.62rem;padding:2px 6px">🔗 Link</button>';
    h += '<button class="btn btn-sm" onclick="marcarEnviado(\'' + t.id + '\')" style="font-size:.62rem;padding:2px 6px;background:var(--dourado);color:#000;border:none">✉️ Enviar</button>';
    h += '<button class="btn btn-perigo btn-sm" onclick="deletarToken(\'' + t.id + '\')" style="font-size:.62rem;padding:2px 6px">🗑</button>';
  } else if (tipo === "enviado") {
    h += '<button class="btn btn-sm" onclick="copiarLink(\'' + link + '\',this)" style="font-size:.62rem;padding:2px 6px">🔗 Link</button>';
    h += '<button class="btn btn-sm" onclick="reverterEnviado(\'' + t.id + '\')" style="font-size:.62rem;padding:2px 6px;background:var(--borda)">↩️ Reverter</button>';
    h += '<button class="btn btn-perigo btn-sm" onclick="deletarToken(\'' + t.id + '\')" style="font-size:.62rem;padding:2px 6px">🗑</button>';
  }
  h += '</div>';
  h += '</div>';
  return h;
}

async function marcarEnviado(tokenDocId) {
  if (!_adminAutenticado()) return alert("Não autorizado.");
  const apelido = prompt("Nome ou apelido de quem vai receber este token (opcional):");
  if (apelido === null) return; // cancelou
  try {
    const updateData = {
      enviado: true,
      apelido: apelido.trim(),
      enviado_em: new Date().toISOString()
    };
    await APP.db.collection("tokens").doc(tokenDocId).update(updateData);

    // Auto-save cirúrgico no Dicionário
    await APP.db.collection("cache").doc("tokens").set({ [tokenDocId]: updateData }, { merge: true });

    renderTokens();
  } catch (e) { alert("Erro: " + e.message); }
}

async function reverterEnviado(tokenDocId) {
  if (!_adminAutenticado()) return alert("Não autorizado.");
  if (!confirm("↩️ REVERTER STATUS DO TOKEN\n\nO token voltará a ficar 'Disponível'. O nome ou apelido provisório anotado nele será apagado e qualquer pessoa que acessar esse link poderá utilizá-lo.\n\nDeseja CONFIRMAR a reversão?")) return;
  try {
    const updateData = {
      enviado: false,
      apelido: "",
      enviado_em: null
    };
    await APP.db.collection("tokens").doc(tokenDocId).update(updateData);
    await APP.db.collection("cache").doc("tokens").set({ [tokenDocId]: updateData }, { merge: true });

    renderTokens();
  } catch (e) { alert("Erro: " + e.message); }
}

async function togglePago(tokenDocId, isPago) {
  if (!_adminAutenticado()) return alert("Não autorizado.");

  if (!isPago) {
    if (!confirm("💰 REMOVER PAGAMENTO\n\nEste token estava marcado como PAGO.\nTem certeza que deseja reverter o status para NÃO PAGO?\n\nDeseja CONFIRMAR?")) return;
  }

  try {
    const updateData = { pago: isPago ? true : "" };
    await APP.db.collection("tokens").doc(tokenDocId).update(updateData);
    await APP.db.collection("cache").doc("tokens").set({ [tokenDocId]: updateData }, { merge: true });

    renderTokens();
  } catch (e) { alert("Erro ao atualizar status de pagamento: " + e.message); }
}

function copiarTexto(txt, btn) {
  navigator.clipboard?.writeText(txt).then(() => {
    if (btn) { const o = btn.textContent; btn.textContent = "✓"; setTimeout(() => btn.textContent = o, 1200); }
  }).catch(() => alert("Token: " + txt));
}

function copiarLink(url, btn) {
  navigator.clipboard?.writeText(url).then(() => {
    if (btn) { const o = btn.textContent; btn.textContent = "✓ Copiado!"; setTimeout(() => btn.textContent = o, 1500); }
  }).catch(() => alert("Link: " + url));
}

async function criarToken() {
  if (!_adminAutenticado()) return alert("Não autorizado.");

  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const token = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");

  if (!confirm("Criar token: " + token + "?")) return;

  try {
    const snap = await APP.db.collection("tokens").orderBy("numero", "desc").limit(1).get();
    let proxNumero = 1;
    if (!snap.empty) {
      const maxAtual = snap.docs[0].data().numero || 0;
      proxNumero = maxAtual + 1;
    }

    const novoDocId = "tok_" + proxNumero;
    const docRef = APP.db.collection("tokens").doc(novoDocId);

    const docVerifica = await docRef.get();
    if (docVerifica.exists) {
      throw new Error("Conflito de ID (" + novoDocId + "). Tente novamente.");
    }

    const newObj = {
      id: novoDocId,
      numero: proxNumero,
      token: token,
      ativo: true,
      nome: "",
      apelido: "",
      criado_em: new Date().toISOString()
    };
    await docRef.set(newObj);

    // Auto-save da nova chave no Dicionário
    await APP.db.collection("cache").doc("tokens").set({ [novoDocId]: newObj }, { merge: true });

    renderTokens();
  } catch (e) {
    alert("Erro ao criar token: " + e.message);
  }
}

async function deletarToken(tokenDocId) {
  if (!_adminAutenticado()) return alert("Não autorizado.");
  if (!confirm("🗑 DELEÇÃO DE TOKEN\n\nVocê vai deletar este token do banco de dados permanentemente.\n\nDeseja CONFIRMAR a exclusão deste token?")) return;
  try {
    await APP.db.collection("tokens").doc(tokenDocId).delete();
    // Remove a chave do dicionário sem precisar reler o banco
    await APP.db.collection("cache").doc("tokens").update({
      [tokenDocId]: firebase.firestore.FieldValue.delete()
    });
    renderTokens();
  } catch (e) { alert("Erro: " + e.message); }
}

// Função de emergência para montar o cache do zero, caso seja limpo/perdido
async function gerarCacheTokens() {
  if (!_adminAutenticado()) return null;
  try {
    const snap = await APP.db.collection("tokens").get();
    const dicionario = {};
    snap.docs.forEach(d => { dicionario[d.id] = d.data(); });
    await APP.db.collection("cache").doc("tokens").set(dicionario);
    return dicionario;
  } catch (e) {
    console.error("Erro ao gerar cache de tokens", e);
    return null;
  }
}

async function manualGerarCacheTokens() {
  if (!_adminAutenticado()) return alert("Não autorizado.");
  if (!confirm("🔄 CONFIRMAR REGENERAÇÃO DE CACHE — TOKENS\n\nVocê vai re-compilar e salvar em um documento único todos os tokens cadastrados para exibição rápida no painel.\n\nDeseja prosseguir?")) return;

  const res = await gerarCacheTokens();
  if (res) {
    alert("✅ Cache de tokens gerado com sucesso!");
    renderTokens();
  } else {
    alert("❌ Erro ao gerar cache de tokens.");
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GERAÇÃO DE CACHE
// Chamado automaticamente ao travar fase e ao gravar resultados oficiais.
// Também exposto via botões manuais de emergência no painel admin.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gera cache/palpites_grupos ou cache/palpites_eliminatorias.
 * Lê os dados atuais de APP.apostadores, APP.palpites e APP.palpitesModelo
 * e salva um documento compacto com hg/ag em vez de homeGoals/awayGoals.
 * Também atualiza o timestamp em config/status para invalidar sessionStorage
 * nos clientes.
 *
 * @param {"grupos"|"eliminatorias"} tipo
 */
async function gerarCachePalpites(tipo, silencioso = false) {
  if (!_adminAutenticado()) return alert("Não autorizado.");

  if (!silencioso) {
    const nomeFase = tipo === "grupos" ? "Grupos e Perfis" : "Fases Eliminatórias";
    if (!confirm(`🔄 CONFIRMAR REGENERAÇÃO DE CACHE — ${nomeFase.toUpperCase()}\n\nVocê vai re-compilar e salvar em um documento único todos os palpites e perfis de todos os participantes para exibição rápida no painel dos usuários (index.html).\n\n⚠️ AVISO DE COTAS DE LEITURA:\n- Esse processo lê o banco de dados de cada participante individualmente.\n- EVITE CLICAR VÁRIAS VEZES seguidas neste botão para não consumir desnecessariamente a cota diária de leitura (Reads) do Firebase Firestore.\n\nDeseja prosseguir com a geração do cache?`)) {
      return;
    }
  }

  const FASES_GRUPOS = ["grupos"];
  const FASES_ELIM = ["32avos", "oitavas", "quartas", "semis", "final", "terceiro"];
  const fasesAlvo = tipo === "grupos" ? FASES_GRUPOS : FASES_ELIM;

  const jogosDaFase = (window.SCHEDULE || []).filter(j => fasesAlvo.includes(j.fase));
  const gameIds = new Set(jogosDaFase.map(j => j.id));

  if (gameIds.size === 0) { alert("Nenhum jogo encontrado para a fase: " + tipo); return; }

  let apostadores = [];
  try {
    const snap = await APP.db.collection("apostadores").get();
    apostadores = snap.docs.map(d => d.data());
  } catch (e) {
    console.warn("[cache] Erro ao buscar apostadores:", e);
    return;
  }

  // ── 2. Lê palpites de cada apostador do doc compacto (1 read/apostador) ─────
  const palpites = {};

  const reads = apostadores.map(async a => {
    try {
      const snap = await APP.db
        .collection("apostadores").doc(a.id)
        .collection("dados").doc("palpites").get();

      let mapaLocal = {};
      if (snap.exists) {
        mapaLocal = snap.data() || {};
        if (mapaLocal.especiais) a.especiais = mapaLocal.especiais;
      }

      const compacto = {};
      for (const gameId of gameIds) {
        const val = mapaLocal[gameId];
        if (!val || typeof val !== "string") continue;
        const [hStr, aStr] = val.split("-");
        const hg = parseInt(hStr), ag = parseInt(aStr);
        if (!isNaN(hg) && !isNaN(ag)) compacto[gameId] = { hg, ag };
      }
      if (Object.keys(compacto).length > 0) palpites[a.id] = compacto;
    } catch (e) {
      console.warn("[cache] Erro ao ler palpites de", a.id, e);
    }
  });

  await Promise.all(reads);

  // ── 1. Lista compacta de apostadores (só no doc de grupos) ──────────────────
  // Gerada após as leituras para garantir que a.especiais esteja atualizado.
  const apostadoresCompactos = apostadores.map(a => ({
    id: a.id, apelido: a.apelido || a.nome || "",
    nome: a.nome || "", ordem: a.ordem || 0, especiais: a.especiais || {},
    token: a.token || "",
    isModelo: a.isModelo || false,
  }));

  // ── 3. Monta e grava payload ─────────────────────────────────────────────────
  const ts = new Date().toISOString();
  const docId = tipo === "grupos" ? "palpites_grupos" : "palpites_eliminatorias";
  const payload = { gerado_em: ts, palpites };
  if (tipo === "grupos") payload.apostadores = apostadoresCompactos;

  try {
    await APP.db.collection("cache").doc(docId).set(payload);
    const tsKey = tipo === "grupos" ? "cache_grupos_ts" : "cache_elim_ts";
    await APP.db.collection("config").doc("status").set({ [tsKey]: ts }, { merge: true });
    const nApost = Object.keys(palpites).length;
    const nPals = Object.values(palpites).reduce((s, j) => s + Object.keys(j).length, 0);
    adicionarLog("✅ cache/" + docId + " — " + nApost + " apostadores, " + nPals + " palpites");
    if (!silencioso) {
      alert("✅ Cache de " + (tipo === "grupos" ? "Grupos" : "Eliminatórias") + " gerado com sucesso!\nForam registrados " + nApost + " apostadores e " + nPals + " palpites.");
    }
  } catch (e) {
    alert("❌ Erro ao gerar cache " + docId + ":\n" + e.message);
  }
}


/** Helper: adiciona linha ao log persistido em localStorage */
function adicionarLog(msg) {
  const log = JSON.parse(localStorage.getItem("bolao_admin_log") || "[]");
  log.push(new Date().toLocaleString("pt-BR") + " | " + msg);
  localStorage.setItem("bolao_admin_log", JSON.stringify(log.slice(-50)));
}

// ═══════════════════════════════════════════════════════════════════════════════
// MIGRAÇÃO: subcollection palpites_jogos → documento compacto dados/palpites
//
// Rodar UMA vez. Após confirmar que todos os apostadores têm doc compacto,

