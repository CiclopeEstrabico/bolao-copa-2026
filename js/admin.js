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
  "",
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
    resultados:  renderAdmin,
    apostadores: renderApostadores,
    tokens:      renderTokens,
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
    { k: "grupos",  l: "Grupos" },
    { k: "32avos",  l: "32avos" },
    { k: "oitavas", l: "Oitavas" },
    { k: "quartas", l: "Quartas" },
    { k: "semis",   l: "Semis" },
    { k: "finais",  l: "Finais" }
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
  if (!confirm("⚠️ LIMPAR TODOS OS RESULTADOS OFICIAIS?\nIsso não pode ser desfeito.")) return;

  // Bug 3: aguarda a deleção no servidor ANTES de alterar estado local.
  // Antes era fire-and-forget: se falhasse, o estado local ficava limpo
  // mas os dados voltavam do Firestore no próximo onSnapshot.
  if (APP.db && !APP.modoOffline) {
    try {
      const snap = await APP.db.collection("resultados_oficiais").get();
      await Promise.all(snap.docs.map(d => d.ref.delete()));
    } catch (e) {
      alert("Erro ao limpar no servidor: " + e.message + "\nNenhum dado foi alterado.");
      return;
    }
  }

  APP.resultados = {};
  APP.resultadosSim = null;
  _persistirLocal();
  document.querySelectorAll('input[type="number"]').forEach(el => (el.value = ""));
  atualizarBracket();
  renderAdmin();
}

function gravarTudoAdmin() {
  if (!_adminAutenticado()) return alert("Não autorizado.");
  const log = JSON.parse(localStorage.getItem("bolao_admin_log") || "[]");
  let gravou = 0;

  for (const j of window.SCHEDULE) {
    const hg = parseInt(document.getElementById("sim-hg-" + j.id)?.value);
    const ag = parseInt(document.getElementById("sim-ag-" + j.id)?.value);

    if (!isNaN(hg) && !isNaN(ag)) {
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
        const data = {
          gameId: j.id, homeGoals: hg, awayGoals: ag,
          foi_penaltis: foiPen, penaltis_vencedor: pv,
          penaltis_home: foiPen ? penH : null, penaltis_away: foiPen ? penA : null,
          inserido_em: new Date().toISOString(), inserido_por: "admin"
        };
        APP.resultados[j.id] = data;
        if (APP.db && !APP.modoOffline)
          APP.db.collection("resultados_oficiais").doc(j.id).set(data, { merge: true });
        log.push(new Date().toLocaleString("pt-BR") + " | " + j.id + " | " + hg + "x" + ag);
        gravou++;
      }
    }
  }

  if (gravou > 0) {
    _persistirLocal();
    localStorage.setItem("bolao_admin_log", JSON.stringify(log.slice(-50)));
    atualizarBracket();
    renderAdmin();
    alert("✅ " + gravou + " jogos gravados.");
  } else {
    alert("Nenhum novo placar para gravar.");
  }
}

function toggleStatusFase(fase) {
  if (!_adminAutenticado()) return alert("Não autorizado.");
  if (APP.modoOffline) return alert("Indisponível offline.");
  const key = "liberado_" + fase;
  const atual = !!(APP.configStatus && APP.configStatus[key]);
  const novo = !atual;
  
  if (!confirm("Deseja realmente " + (novo ? "LIBERAR" : "TRAVAR") + " apostas de " + fase + "?")) return;
  
  APP.db.collection("config").doc("status")
    .set({ [key]: novo }, { merge: true })
    .then(() => alert("Fase " + fase.toUpperCase() + " " + (novo ? "LIBERADA ✅" : "TRAVADA 🔒")))
    .catch(e => alert("Erro: " + e.message));
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA APOSTADORES
// ═══════════════════════════════════════════════════════════════════════════════

const FASES_CONFIG = [
  { key: "grupos",  label: "Grupos"  },
  { key: "32avos",  label: "32avos"  },
  { key: "oitavas", label: "Oitavas" },
  { key: "quartas", label: "Quartas" },
  { key: "semis",   label: "Semis"   },
  { key: "finais",  label: "Finais"  },
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
  if (!confirm("Limpar " + desc + " de " + nome + "?")) return;

  if (fase === "especiais") {
    if (a) { a.especiais = {}; await gravarApostador(a); }
  } else {
    const fasesFiltro = fase === "todas" ? ["grupos", "32avos", "oitavas", "quartas", "semis", "final", "terceiro"] : 
                       (fase === "finais" ? ["final", "terceiro"] : [fase]);
    const jogosParaLimpar = (window.SCHEDULE || []).filter(j => fasesFiltro.includes(j.fase));
    for (const j of jogosParaLimpar) {
      if (APP.palpites[id]) delete APP.palpites[id][j.id];
      if (APP.db && !APP.modoOffline)
        await APP.db.collection("apostadores").doc(id)
          .collection("palpites_jogos").doc(j.id).delete().catch(() => {});
    }
    if (fase === "todas" && a) { a.especiais = {}; await gravarApostador(a); }
    _persistirLocal();
  }

  toggleEditApostador(id);
  renderApostadores();
  alert("✅ Apostas limpas.");
}

async function deletarApostadorId(id) {
  if (!_adminAutenticado()) return alert("Não autorizado.");
  const a = APP.apostadores.find(x => x.id === id);
  if (!confirm('Deletar "' + _esc(a?.apelido || a?.nome || id) + '"? Não pode ser desfeito.')) return;

  const tokenDoApostador = a?.token;
  const apelidoDoApostador = a?.apelido || "";

  // Bug 4: deleções eram fire-and-forget. Se falhassem, o apostador sumia
  // da UI mas persistia no Firestore e voltava no próximo onSnapshot.
  // Agora: deleta no servidor primeiro, só altera estado local se der certo.
  if (APP.db && !APP.modoOffline) {
    try {
      // Deletar subcoleção de palpites antes do documento pai
      const palpitesSnap = await APP.db.collection("apostadores").doc(id)
        .collection("palpites_jogos").get();
      await Promise.all(palpitesSnap.docs.map(doc => doc.ref.delete()));

      // Deletar o documento do apostador
      await APP.db.collection("apostadores").doc(id).delete();

      // Token volta para "Enviado" (não disponível) — operação secundária,
      // não bloqueia nem reverte a deleção principal se falhar
      if (tokenDoApostador) {
        try {
          const tokenSnap = await APP.db.collection("tokens")
            .where("token", "==", tokenDoApostador)
            .limit(1)
            .get();
          if (!tokenSnap.empty) {
            const tokenDoc = tokenSnap.docs[0];
            const dadosAtuais = tokenDoc.data();
            await tokenDoc.ref.update({
              enviado: true,
              apelido: dadosAtuais.apelido || apelidoDoApostador,
              enviado_em: dadosAtuais.enviado_em || new Date().toISOString()
            });
          }
        } catch (_) { /* falha no token não impede a deleção */ }
      }
    } catch (e) {
      alert("Erro ao deletar no servidor: " + e.message + "\nNenhum dado foi alterado.");
      return;
    }
  }

  // Só atualiza estado local após confirmar sucesso no servidor
  APP.apostadores = APP.apostadores.filter(x => x.id !== id);
  delete APP.palpites[id];
  _persistirLocal();
  renderApostadores();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA TOKENS
// ═══════════════════════════════════════════════════════════════════════════════

async function renderTokens() {
  const el = document.getElementById("aba-tokens");
  if (!el) return;

  if (APP.modoOffline) {
    el.innerHTML = '<div class="card" style="color:var(--texto2);text-align:center;padding:30px">Tokens indisponíveis no modo offline.</div>';
    return;
  }

  el.innerHTML = '<div class="loading"><div class="spinner"></div>Buscando tokens...</div>';

  let tokens = [];
  try {
    const snap = await APP.db.collection("tokens").get();
    tokens = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    el.innerHTML = '<div class="card" style="color:var(--vermelho)">Erro ao carregar tokens: ' + _esc(e.message) + '</div>';
    return;
  }

  const tokensUsados = new Set(APP.apostadores.map(a => a.token).filter(Boolean));
  const usados    = tokens.filter(t => tokensUsados.has(t.token));
  const enviados  = tokens.filter(t => !tokensUsados.has(t.token) && t.enviado === true);
  const livres    = tokens.filter(t => !tokensUsados.has(t.token) && t.enviado !== true && t.ativo !== false);
  const inativos  = tokens.filter(t => !tokensUsados.has(t.token) && t.enviado !== true && t.ativo === false);

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
    await APP.db.collection("tokens").doc(tokenDocId).update({
      enviado: true,
      apelido: apelido.trim(),
      enviado_em: new Date().toISOString()
    });
    renderTokens();
  } catch (e) { alert("Erro: " + e.message); }
}

async function reverterEnviado(tokenDocId) {
  if (!_adminAutenticado()) return alert("Não autorizado.");
  if (!confirm("Reverter token para Disponível? O apelido será removido.")) return;
  try {
    await APP.db.collection("tokens").doc(tokenDocId).update({
      enviado: false,
      apelido: "",
      enviado_em: null
    });
    renderTokens();
  } catch (e) { alert("Erro: " + e.message); }
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
    await APP.db.collection("tokens").add({ token, ativo: true, criado_em: new Date().toISOString() });
    renderTokens();
  } catch (e) { alert("Erro: " + e.message); }
}

async function deletarToken(tokenDocId) {
  if (!_adminAutenticado()) return alert("Não autorizado.");
  if (!confirm("Deletar este token permanentemente?")) return;
  try {
    await APP.db.collection("tokens").doc(tokenDocId).delete();
    renderTokens();
  } catch (e) { alert("Erro: " + e.message); }
}
