/** admin.js - Resultados oficiais com autenticação Google */

window._isAdminView = true;

// ─── Lista de UIDs autorizados como admin ─────────────────────────────────────
const ADMIN_UIDS = [
  "oSnCwYjIe6eh7W1pUhZZUtX0B1q2",
  "",
  "",
  "",
];

// ─── Roteador de abas admin ───────────────────────────────────────────────────
const ADMIN_ABAS = ["resultados", "apostadores", "tokens"];
let _adminAbaAtiva = "resultados";

// Sobrescreve renderAbaAtiva do app.js para o contexto admin
window.renderAbaAtiva = function () {
  if (!adminAutenticado()) { renderLogin(); return; }
  _renderAdminAbaAtiva();
};

function _renderAdminAbaAtiva() {
  const fn = {
    resultados:  renderAdmin,
    apostadores: renderApostadores,
    tokens:      renderTokens,
  };
  fn[_adminAbaAtiva]?.();
}

function iniciarRoteadorAdmin() {
  document.querySelectorAll("[data-tab]").forEach(btn =>
    btn.addEventListener("click", () => mudarAbaAdmin(btn.dataset.tab))
  );
  const hash = location.hash.replace("#", "");
  mudarAbaAdmin(ADMIN_ABAS.includes(hash) ? hash : "resultados");
}

function mudarAbaAdmin(aba) {
  if (!ADMIN_ABAS.includes(aba)) return;
  _adminAbaAtiva = aba;
  location.hash = aba;
  document.querySelectorAll("[data-tab]").forEach(b =>
    b.classList.toggle("ativa", b.dataset.tab === aba));
  document.querySelectorAll(".aba-conteudo").forEach(el =>
    el.classList.toggle("hidden", el.dataset.aba !== aba));
  if (adminAutenticado()) _renderAdminAbaAtiva();
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────
function adminAutenticado() {
  try {
    const user = firebase.auth().currentUser;
    return user && ADMIN_UIDS.filter(Boolean).includes(user.uid);
  } catch (e) {
    return false;
  }
}

function loginAdmin() {
  const provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider)
    .then(result => {
      if (!ADMIN_UIDS.filter(Boolean).includes(result.user.uid)) {
        firebase.auth().signOut();
        alert("Essa conta Google não tem permissão de admin.");
        return;
      }
      _renderAdminAbaAtiva();
    })
    .catch(e => alert("Erro no login: " + e.message));
}

function logoutAdmin() {
  firebase.auth().signOut().then(() => location.reload());
}

// ─── Inicialização ────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  firebase.auth().onAuthStateChanged(user => {
    if (user && ADMIN_UIDS.filter(Boolean).includes(user.uid)) {
      iniciarRoteadorAdmin();
    } else {
      renderLogin();
    }
  });
});

function renderLogin() {
  // Mostra tela de login em todas as abas
  ["aba-resultados", "aba-apostadores", "aba-tokens"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });
  // Coloca o login na aba de resultados e mostra só ela
  const main = document.getElementById("aba-resultados");
  if (!main) return;
  main.classList.remove("hidden");
  main.innerHTML =
    '<div class="card" style="max-width:340px;margin:40px auto">' +
      '<div class="card-titulo">🔐 Acesso Admin</div>' +
      '<p style="font-size:.85rem;color:var(--texto2);margin-bottom:16px">' +
        'Faça login com a conta Google autorizada.' +
      '</p>' +
      '<button class="btn btn-primario" onclick="loginAdmin()">🔑 Entrar com Google</button>' +
    '</div>';
}

// ─── renderAbaAtiva (mantém compatibilidade com app.js) ──────────────────────
// já definido acima como window.renderAbaAtiva

// ═══════════════════════════════════════════════════════════════════════════════
// ABA RESULTADOS
// ═══════════════════════════════════════════════════════════════════════════════
function renderAdmin() {
  const main = document.getElementById("aba-resultados");
  if (!main) return;

  const res = getResultados();
  const tg = window.BRACKET.calcularTodosOsGrupos(res);
  const st = APP.configStatus?.apostas_liberadas;
  const btnTxt = st ? "🔓 Travar Apostas" : "🔒 Liberar Apostas";
  const btnClass = st ? "btn-perigo" : "btn-primario";

  let h = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">';
  h += '<div style="font-size:.9rem;font-weight:800;display:flex;gap:8px;align-items:center">';
  h += '🔧 Inserir Resultados Oficiais';
  h += `<button class="btn ${btnClass} btn-sm" onclick="toggleApostasLiberadas()">${btnTxt}</button>`;
  h += '</div>';
  h += '<div style="display:flex;gap:6px;flex-wrap:wrap">';
  h += '<button class="btn btn-perigo btn-sm" onclick="limparTudoAdmin()">🗑 Limpar Resultados</button>';
  h += '<button class="btn btn-primario btn-sm" onclick="gravarTudoAdmin()">💾 GRAVAR OFICIAL</button>';
  h += '<button class="btn btn-sm" onclick="logoutAdmin()" style="background:var(--borda)">Sair</button>';
  h += '</div></div>';

  h += renderJogosComToggle(res, tg, true, null);

  // Log compacto
  const log = JSON.parse(localStorage.getItem("bolao_admin_log") || "[]");
  if (log.length) {
    h += '<div class="card"><div class="card-titulo">📋 Log ' +
      '<button class="btn btn-perigo btn-sm" onclick="limparLog()">Limpar</button></div>';
    h += '<div style="font-size:.7rem;color:var(--texto2);display:flex;flex-direction:column;gap:3px;max-height:200px;overflow-y:auto">';
    log.slice().reverse().forEach(l => (h += `<div style="padding:3px 0;border-bottom:1px solid var(--borda)">${l}</div>`));
    h += "</div></div>";
  }

  main.innerHTML = h;
}

// ─── Ações de Resultados ──────────────────────────────────────────────────────
function limparLog() {
  if (!confirm("Limpar log?")) return;
  localStorage.removeItem("bolao_admin_log");
  renderAdmin();
}

function limparTudoAdmin() {
  if (!adminAutenticado()) return alert("Não autorizado.");
  if (!confirm("⚠️ LIMPAR TODOS OS RESULTADOS OFICIAIS?\nIsso não pode ser desfeito.")) return;
  APP.resultados = {};
  APP.resultadosSim = {};
  _persistirLocal();
  document.querySelectorAll('input[type="number"]').forEach(el => (el.value = ""));
  if (APP.db && !APP.modoOffline)
    APP.db.collection("resultados_oficiais").get().then(s => s.forEach(d => d.ref.delete()));
  atualizarBracket();
  renderAdmin();
}

function gravarTudoAdmin() {
  if (!adminAutenticado()) return alert("Não autorizado.");
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
          inserido_em: new Date().toISOString(),
          inserido_por: "admin"
        };

        APP.resultados[j.id] = data;
        if (APP.db && !APP.modoOffline)
          APP.db.collection("resultados_oficiais").doc(j.id).set(data, { merge: true });

        log.push(new Date().toLocaleString("pt-BR") + " | " + j.id + " | Gravado " + hg + "x" + ag);
        gravou++;
      }
    }
  }

  if (gravou > 0) {
    _persistirLocal();
    localStorage.setItem("bolao_admin_log", JSON.stringify(log.slice(-50)));
    atualizarBracket();
    renderAdmin();
    alert(`Salvo com sucesso! ${gravou} jogos gravados no banco de dados.`);
  } else {
    alert("Nenhum novo jogo para gravar (digite placares nos inputs).");
  }
}

function toggleApostasLiberadas() {
  if (!adminAutenticado()) return alert("Não autorizado.");
  if (APP.modoOffline) return alert("Indisponível offline");
  const atual = APP.configStatus?.apostas_liberadas || false;
  const novo = !atual;
  if (!confirm(`Deseja realmente ${novo ? "LIBERAR" : "TRAVAR"} as apostas?`)) return;
  APP.db.collection("config").doc("status")
    .set({ apostas_liberadas: novo }, { merge: true })
    .then(() => alert(`Apostas ${novo ? "LIBERADAS" : "TRAVADAS"} com sucesso!`))
    .catch(e => { console.error(e); alert("Erro ao alterar o status."); });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA APOSTADORES
// ═══════════════════════════════════════════════════════════════════════════════

// Fases e quantidades totais de jogos por fase
const FASES_CONFIG = [
  { key: "grupos",   label: "Grupos"   },
  { key: "32avos",   label: "32avos"   },
  { key: "oitavas",  label: "Oitavas"  },
  { key: "quartas",  label: "Quartas"  },
  { key: "semis",    label: "Semis"    },
  { key: "final",    label: "Final"    },
];

function _totalJogosFase(fase) {
  return (window.SCHEDULE || []).filter(j => j.fase === fase).length;
}

function _palpitesFase(apostadorId, fase) {
  const pals = APP.palpites[apostadorId] || {};
  const jogos = (window.SCHEDULE || []).filter(j => j.fase === fase);
  let count = 0;
  for (const j of jogos) {
    const p = pals[j.id];
    if (p && p.homeGoals !== undefined && p.awayGoals !== undefined) count++;
  }
  return count;
}

function _especialesPreenchidos(apostador) {
  const esp = apostador.especiais || {};
  const keys = ["campeao", "vice", "terceiro"];
  const preenchidos = keys.filter(k => esp[k] && esp[k] !== "").length;
  return { preenchidos, total: keys.length };
}

function renderApostadores() {
  const el = document.getElementById("aba-apostadores");
  if (!el) return;

  const apostadores = APP.apostadores;

  let h = '<div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">';
  h += '<div style="font-size:.9rem;font-weight:800">👥 Apostadores <span style="font-size:.75rem;font-weight:400;color:var(--texto2)">(' + apostadores.length + ' cadastrados)</span></div>';
  h += '</div>';

  if (!apostadores.length) {
    h += '<div class="card" style="text-align:center;color:var(--texto2);padding:30px">Nenhum apostador cadastrado ainda.</div>';
    el.innerHTML = h;
    return;
  }

  // Tabela horizontal responsiva
  h += '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch">';
  h += '<table style="width:100%;border-collapse:collapse;font-size:.75rem;min-width:700px">';

  // Cabeçalho
  h += '<thead><tr style="background:var(--fundo2);position:sticky;top:0;z-index:2">';
  h += '<th style="' + _thStyle("left") + 'min-width:120px">Apostador</th>';
  h += '<th style="' + _thStyle() + '">Token</th>';
  for (const f of FASES_CONFIG) {
    const total = _totalJogosFase(f.key);
    h += '<th style="' + _thStyle() + '">' + f.label + '<br><span style="font-weight:400;color:var(--texto2)">/' + total + '</span></th>';
  }
  h += '<th style="' + _thStyle() + '">Especiais<br><span style="font-weight:400;color:var(--texto2)">/3</span></th>';
  h += '<th style="' + _thStyle() + '">Ações</th>';
  h += '</tr></thead><tbody>';

  for (const a of apostadores) {
    const esp = _especialesPreenchidos(a);
    h += '<tr style="border-bottom:1px solid var(--borda)" id="row-apt-' + a.id + '">';

    // Nome + Apelido
    h += '<td style="' + _tdStyle("left") + '">';
    h += '<div style="font-weight:700;color:var(--texto1)">' + (a.apelido || "—") + '</div>';
    h += '<div style="color:var(--texto2);font-size:.68rem">' + (a.nome || "sem nome") + '</div>';
    h += '</td>';

    // Token
    h += '<td style="' + _tdStyle() + '">';
    h += '<code style="font-size:.68rem;background:var(--fundo2);padding:2px 5px;border-radius:4px;color:var(--dourado)">' + (a.token || "—") + '</code>';
    h += '</td>';

    // Apostas por fase
    for (const f of FASES_CONFIG) {
      const total = _totalJogosFase(f.key);
      const feitos = _palpitesFase(a.id, f.key);
      const cor = total === 0 ? "var(--texto2)" : feitos === total ? "var(--verde-light)" : feitos > 0 ? "var(--dourado)" : "var(--texto2)";
      h += '<td style="' + _tdStyle() + 'color:' + cor + ';font-weight:' + (feitos > 0 ? "700" : "400") + '">' + feitos + '</td>';
    }

    // Especiais
    const corEsp = esp.preenchidos === esp.total ? "var(--verde-light)" : esp.preenchidos > 0 ? "var(--dourado)" : "var(--texto2)";
    h += '<td style="' + _tdStyle() + 'color:' + corEsp + ';font-weight:' + (esp.preenchidos > 0 ? "700" : "400") + '">' + esp.preenchidos + '</td>';

    // Ações
    h += '<td style="' + _tdStyle() + '">';
    h += '<div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap">';
    h += '<button class="btn btn-sm" onclick="editarApostador(\'' + a.id + '\')" style="font-size:.65rem;padding:3px 7px">✏️ Editar</button>';
    h += '<button class="btn btn-perigo btn-sm" onclick="deletarApostadorId(\'' + a.id + '\')" style="font-size:.65rem;padding:3px 7px">🗑</button>';
    h += '</div>';
    h += '</td>';
    h += '</tr>';

    // Linha de edição (inline, hidden by default)
    h += '<tr id="edit-row-' + a.id + '" style="display:none;background:var(--fundo2)">';
    h += '<td colspan="' + (FASES_CONFIG.length + 4) + '" style="padding:10px 12px">';
    h += _renderEditApostador(a);
    h += '</td></tr>';
  }

  h += '</tbody></table></div>';
  el.innerHTML = h;
}

function _thStyle(align) {
  return 'padding:8px 10px;text-align:' + (align || 'center') + ';font-size:.7rem;font-weight:700;border-bottom:2px solid var(--borda);white-space:nowrap;';
}
function _tdStyle(align) {
  return 'padding:7px 10px;text-align:' + (align || 'center') + ';vertical-align:middle;';
}

function _renderEditApostador(a) {
  const fases = FASES_CONFIG.map(f => f.key);
  let h = '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">';

  h += '<div><label style="font-size:.68rem;color:var(--texto2);display:block;margin-bottom:3px">Nome</label>';
  h += '<input id="edit-nome-' + a.id + '" type="text" class="form-input" value="' + (a.nome || "") + '" style="padding:4px 8px;font-size:.75rem;width:150px"></div>';

  h += '<div><label style="font-size:.68rem;color:var(--texto2);display:block;margin-bottom:3px">Apelido</label>';
  h += '<input id="edit-apelido-' + a.id + '" type="text" class="form-input" maxlength="8" value="' + (a.apelido || "") + '" style="padding:4px 8px;font-size:.75rem;width:90px"></div>';

  h += '<div><label style="font-size:.68rem;color:var(--texto2);display:block;margin-bottom:3px">Limpar apostas</label>';
  h += '<select id="edit-limpar-fase-' + a.id + '" class="form-input" style="padding:4px 8px;font-size:.72rem">';
  h += '<option value="">Selecionar fase...</option>';
  for (const f of FASES_CONFIG) h += '<option value="' + f.key + '">' + f.label + '</option>';
  h += '<option value="especiais">Especiais</option>';
  h += '<option value="todas">⚠️ TODAS</option>';
  h += '</select></div>';

  h += '<div style="display:flex;gap:6px;margin-top:auto">';
  h += '<button class="btn btn-primario btn-sm" onclick="salvarEdicaoApostador(\'' + a.id + '\')" style="font-size:.7rem">💾 Salvar</button>';
  h += '<button class="btn btn-perigo btn-sm" onclick="limparApostasApostador(\'' + a.id + '\')" style="font-size:.7rem">🗑 Limpar fase</button>';
  h += '<button class="btn btn-sm" onclick="cancelarEdicaoApostador(\'' + a.id + '\')" style="font-size:.7rem;background:var(--borda)">Cancelar</button>';
  h += '</div>';
  h += '</div>';
  return h;
}

function editarApostador(id) {
  // Fecha outros abertos
  document.querySelectorAll('[id^="edit-row-"]').forEach(r => {
    if (r.id !== "edit-row-" + id) r.style.display = "none";
  });
  const row = document.getElementById("edit-row-" + id);
  if (!row) return;
  row.style.display = row.style.display === "none" ? "" : "none";
}

function cancelarEdicaoApostador(id) {
  const row = document.getElementById("edit-row-" + id);
  if (row) row.style.display = "none";
}

async function salvarEdicaoApostador(id) {
  if (!adminAutenticado()) return alert("Não autorizado.");
  const a = APP.apostadores.find(x => x.id === id);
  if (!a) return;

  const novoNome = document.getElementById("edit-nome-" + id)?.value.trim();
  let novoApelido = document.getElementById("edit-apelido-" + id)?.value.trim() || "";
  novoApelido = novoApelido.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
  if (novoApelido.length > 0)
    novoApelido = novoApelido.charAt(0).toUpperCase() + novoApelido.slice(1).toLowerCase();

  if (!novoNome) { alert("Nome não pode ser vazio."); return; }

  a.nome = novoNome;
  a.apelido = novoApelido;

  await gravarApostador(a);
  cancelarEdicaoApostador(id);
  renderApostadores();
  alert("Apostador atualizado!");
}

async function limparApostasApostador(id) {
  if (!adminAutenticado()) return alert("Não autorizado.");
  const fase = document.getElementById("edit-limpar-fase-" + id)?.value;
  if (!fase) { alert("Selecione uma fase para limpar."); return; }

  const a = APP.apostadores.find(x => x.id === id);
  const nome = a?.apelido || a?.nome || id;

  const descFase = fase === "todas" ? "TODAS as apostas" : fase === "especiais" ? "apostas especiais" : "apostas da fase: " + fase;
  if (!confirm(`Limpar ${descFase} de ${nome}?`)) return;

  if (fase === "especiais") {
    // Limpa especiais no apostador
    if (a) { a.especiais = {}; await gravarApostador(a); }
  } else {
    // Limpa apostas de jogos da(s) fase(s)
    const fasesFiltro = fase === "todas" ? FASES_CONFIG.map(f => f.key) : [fase];
    const jogosParaLimpar = (window.SCHEDULE || []).filter(j => fasesFiltro.includes(j.fase));

    for (const j of jogosParaLimpar) {
      if (APP.palpites[id]) delete APP.palpites[id][j.id];
      if (APP.db && !APP.modoOffline) {
        await APP.db.collection("apostadores").doc(id)
          .collection("palpites_jogos").doc(j.id).delete().catch(() => {});
      }
    }

    if (fase === "todas" && a) {
      a.especiais = {};
      await gravarApostador(a);
    }
    _persistirLocal();
  }

  cancelarEdicaoApostador(id);
  renderApostadores();
  alert("Apostas limpas com sucesso!");
}

function deletarApostadorId(id) {
  if (!adminAutenticado()) return alert("Não autorizado.");
  const a = APP.apostadores.find(x => x.id === id);
  if (!confirm(`Deletar o apostador "${a?.apelido || a?.nome}"? Esta ação não pode ser desfeita.`)) return;

  APP.apostadores = APP.apostadores.filter(x => x.id !== id);
  delete APP.palpites[id];
  _persistirLocal();

  if (APP.db && !APP.modoOffline) {
    APP.db.collection("apostadores").doc(id).delete();
    APP.db.collection("apostadores").doc(id).collection("palpites_jogos").get()
      .then(snap => snap.forEach(doc => doc.ref.delete()));
  }
  renderApostadores();
  alert("Apostador deletado.");
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA TOKENS
// ═══════════════════════════════════════════════════════════════════════════════

async function renderTokens() {
  const el = document.getElementById("aba-tokens");
  if (!el) return;

  el.innerHTML = '<div class="loading"><div class="spinner"></div>Buscando tokens...</div>';

  let tokens = [];
  if (APP.db && !APP.modoOffline) {
    try {
      const snap = await APP.db.collection("tokens").get();
      tokens = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      el.innerHTML = '<div class="card" style="color:var(--vermelho)">Erro ao carregar tokens: ' + e.message + '</div>';
      return;
    }
  } else {
    el.innerHTML = '<div class="card" style="color:var(--texto2)">Tokens não disponíveis no modo offline.</div>';
    return;
  }

  // Mapeia tokens usados
  const tokensUsados = new Set(APP.apostadores.map(a => a.token).filter(Boolean));

  const livres = tokens.filter(t => t.ativo !== false && !tokensUsados.has(t.token));
  const usados = tokens.filter(t => tokensUsados.has(t.token));
  const inativos = tokens.filter(t => t.ativo === false && !tokensUsados.has(t.token));

  let h = '<div style="margin-bottom:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">';
  h += '<div style="font-size:.9rem;font-weight:800">🔑 Tokens</div>';
  h += '<span style="font-size:.72rem;padding:2px 8px;border-radius:10px;background:var(--verde-ok);color:#fff">' + usados.length + ' usados</span>';
  h += '<span style="font-size:.72rem;padding:2px 8px;border-radius:10px;background:var(--fundo2);color:var(--verde-light);border:1px solid var(--verde-light)">' + livres.length + ' disponíveis</span>';
  if (inativos.length) h += '<span style="font-size:.72rem;padding:2px 8px;border-radius:10px;background:var(--fundo2);color:var(--texto2);border:1px solid var(--borda)">' + inativos.length + ' inativos</span>';
  h += '<button class="btn btn-primario btn-sm" onclick="criarToken()" style="margin-left:auto">+ Novo Token</button>';
  h += '</div>';

  // ── Tokens em uso ──
  if (usados.length) {
    h += '<div class="card">';
    h += '<div class="card-titulo">✅ Em Uso (' + usados.length + ')</div>';
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">';
    for (const t of usados) {
      const apt = APP.apostadores.find(a => a.token === t.token);
      h += _renderTokenCard(t, apt, "usado");
    }
    h += '</div></div>';
  }

  // ── Tokens disponíveis ──
  if (livres.length) {
    h += '<div class="card">';
    h += '<div class="card-titulo">🟢 Disponíveis (' + livres.length + ')</div>';
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">';
    for (const t of livres) {
      h += _renderTokenCard(t, null, "livre");
    }
    h += '</div></div>';
  }

  // ── Tokens inativos ──
  if (inativos.length) {
    h += '<div class="card">';
    h += '<div class="card-titulo">⛔ Inativos (' + inativos.length + ')</div>';
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">';
    for (const t of inativos) {
      h += _renderTokenCard(t, null, "inativo");
    }
    h += '</div></div>';
  }

  if (!tokens.length) {
    h += '<div class="card" style="text-align:center;color:var(--texto2);padding:30px">Nenhum token cadastrado ainda.<br>Crie o primeiro token abaixo.<br><br>';
    h += '<button class="btn btn-primario" onclick="criarToken()">+ Criar Token</button></div>';
  }

  el.innerHTML = h;
}

function _renderTokenCard(t, apt, tipo) {
  const corBorda = tipo === "usado" ? "var(--verde-ok)" : tipo === "livre" ? "var(--verde-light)" : "var(--borda)";
  const baseUrl = location.origin + location.pathname.replace("admin.html", "") + "aposta.html?token=";
  const link = baseUrl + (t.token || t.id);

  let h = '<div style="background:var(--fundo2);border-radius:var(--radius-sm);padding:10px 12px;border-left:3px solid ' + corBorda + '">';

  // Token value
  h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">';
  h += '<code style="font-size:.72rem;color:var(--dourado);background:var(--fundo);padding:2px 6px;border-radius:4px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (t.token || t.id) + '</code>';
  h += '<button onclick="copiarTexto(\'' + (t.token || t.id) + '\')" style="border:none;background:none;cursor:pointer;font-size:.9rem;padding:2px" title="Copiar token">📋</button>';
  h += '</div>';

  if (apt) {
    h += '<div style="font-size:.72rem;font-weight:700;color:var(--texto1)">' + (apt.apelido || apt.nome || "—") + '</div>';
    h += '<div style="font-size:.65rem;color:var(--texto2)">' + (apt.nome || "") + '</div>';
  } else if (tipo === "livre") {
    h += '<div style="font-size:.7rem;color:var(--verde-light)">Disponível</div>';
    h += '<div style="font-size:.65rem;color:var(--texto2);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">';
    h += '<a href="' + link + '" target="_blank" style="color:var(--texto2);text-decoration:none">' + link + '</a></div>';
  } else {
    h += '<div style="font-size:.7rem;color:var(--texto2)">Inativo</div>';
  }

  h += '<div style="display:flex;gap:4px;margin-top:8px">';
  if (tipo !== "usado") {
    h += '<button class="btn btn-sm" onclick="copiarLink(\'' + link + '\')" style="font-size:.62rem;padding:2px 6px">🔗 Copiar Link</button>';
  }
  if (tipo !== "usado") {
    h += '<button class="btn btn-perigo btn-sm" onclick="deletarToken(\'' + t.id + '\')" style="font-size:.62rem;padding:2px 6px">🗑</button>';
  }
  h += '</div>';
  h += '</div>';
  return h;
}

function copiarTexto(txt) {
  navigator.clipboard?.writeText(txt).then(() => {
    // feedback visual mínimo
    const el = event.target;
    const orig = el.textContent;
    el.textContent = "✓";
    setTimeout(() => (el.textContent = orig), 1200);
  }).catch(() => alert("Token: " + txt));
}

function copiarLink(url) {
  navigator.clipboard?.writeText(url).then(() => {
    const el = event.target;
    const orig = el.textContent;
    el.textContent = "✓ Copiado!";
    setTimeout(() => (el.textContent = orig), 1500);
  }).catch(() => alert("Link: " + url));
}

async function criarToken() {
  if (!adminAutenticado()) return alert("Não autorizado.");
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const token = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");

  if (!confirm(`Criar token: ${token}?`)) return;

  try {
    await APP.db.collection("tokens").add({ token, ativo: true, criado_em: new Date().toISOString() });
    renderTokens();
  } catch (e) {
    alert("Erro ao criar token: " + e.message);
  }
}

async function deletarToken(tokenDocId) {
  if (!adminAutenticado()) return alert("Não autorizado.");
  if (!confirm("Deletar este token permanentemente?")) return;
  try {
    await APP.db.collection("tokens").doc(tokenDocId).delete();
    renderTokens();
  } catch (e) {
    alert("Erro ao deletar: " + e.message);
  }
}
