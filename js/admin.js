/** admin.js - Resultados oficiais com autenticação Google */

window._isAdminView = true;

// ─── UID do admin (não é segredo — não é senha, não autentica sozinho) ───────
const ADMIN_UID = "SEU_UID_AQUI";

// ─── Auth helpers ─────────────────────────────────────────────────────────────
function adminAutenticado() {
  const user = firebase.auth().currentUser;
  return user && user.uid === ADMIN_UID;
}

function loginAdmin() {
  const provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider)
    .then(result => {
      if (result.user.uid !== ADMIN_UID) {
        firebase.auth().signOut();
        alert("Essa conta Google não tem permissão de admin.");
        return;
      }
      renderAdmin();
    })
    .catch(e => alert("Erro no login: " + e.message));
}

function logoutAdmin() {
  firebase.auth().signOut().then(() => location.reload());
}

// ─── Inicialização ────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Aguarda o Firebase Auth resolver o estado antes de qualquer coisa
  firebase.auth().onAuthStateChanged(user => {
    if (user && user.uid === ADMIN_UID) {
      renderAdmin();
    } else {
      renderLogin();
    }
  });
});

function renderLogin() {
  const main = document.getElementById("admin-main");
  if (!main) return;
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
window.renderAbaAtiva = function () {
  if (!adminAutenticado()) return;
  const activeId = document.activeElement?.id;
  const sy = window.scrollY;
  const sStart = document.activeElement?.selectionStart;
  const sEnd = document.activeElement?.selectionEnd;

  const oldHeight = document.body.style.minHeight;
  document.body.style.minHeight = document.body.scrollHeight + "px";

  renderAdmin();

  if (activeId) {
    const el = document.getElementById(activeId);
    if (el) {
      el.focus();
      try { el.setSelectionRange(sStart ?? el.value.length, sEnd ?? el.value.length); } catch (e) { }
    }
  }
  window.scrollTo(0, sy);
  requestAnimationFrame(() => (document.body.style.minHeight = oldHeight));
};

// ─── Render principal ─────────────────────────────────────────────────────────
function renderAdmin() {
  const main = document.getElementById("admin-main");
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
  h += '<div style="display:flex;gap:4px;align-items:center">';
  h += '<select id="admin-apaga-apostador" class="form-input" style="padding:4px;height:28px;font-size:.7rem">';
  h += '<option value="">Deletar um apostador...</option>';
  APP.apostadores.forEach(a => (h += `<option value="${a.id}">${a.apelido || a.nome}</option>`));
  h += '</select>';
  h += '<button class="btn btn-perigo btn-sm" onclick="deletarApostadorEspecifico()">✕</button></div>';
  h += '<button class="btn btn-primario btn-sm" onclick="gravarTudoAdmin()">💾 GRAVAR OFICIAL</button>';
  h += `<button class="btn btn-sm" onclick="logoutAdmin()" style="background:var(--borda)">Sair</button>`;
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

// ─── Ações ────────────────────────────────────────────────────────────────────
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

function deletarApostadorEspecifico() {
  if (!adminAutenticado()) return alert("Não autorizado.");
  const select = document.getElementById("admin-apaga-apostador");
  const id = select?.value;
  if (!id) { alert("Selecione um apostador para deletar."); return; }
  const a = APP.apostadores.find(x => x.id === id);
  if (!confirm(`Deletar o apostador ${a.apelido || a.nome}?`)) return;

  APP.apostadores = APP.apostadores.filter(x => x.id !== id);
  delete APP.palpites[id];
  _persistirLocal();

  if (APP.db && !APP.modoOffline) {
    APP.db.collection("apostadores").doc(id).delete();
    APP.db.collection("apostadores").doc(id).collection("palpites_jogos").get()
      .then(snap => snap.forEach(doc => doc.ref.delete()));
  }
  renderAdmin();
  alert("Apostador deletado.");
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
          inserido_por: "admin"   // ← sem vazar o UID aqui
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