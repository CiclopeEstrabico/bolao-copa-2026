/** admin.js - Resultados oficiais (mesmo layout que resultados) */
const ADMIN_SENHA = "#bolao2026#";

document.addEventListener("DOMContentLoaded", () => {
  const main = document.getElementById("admin-main");
  if (!main) return;
  if (sessionStorage.getItem("bolao_admin_auth") === ADMIN_SENHA) { renderAdmin(); return; }
  main.innerHTML = '<div class="card" style="max-width:340px;margin:40px auto">' +
    '<div class="card-titulo">🔐 Acesso Admin</div>' +
    '<div class="form-group"><label>Senha</label>' +
    '<input type="password" id="admin-senha" placeholder="Senha de administrador" onkeydown="if(event.key===\'Enter\')loginAdmin()"></div>' +
    '<button class="btn btn-primario" onclick="loginAdmin()">Entrar</button></div>';
});

function loginAdmin() {
  const s = document.getElementById("admin-senha")?.value;
  if (s === ADMIN_SENHA) { sessionStorage.setItem("bolao_admin_auth", s); renderAdmin(); }
  else alert("Senha incorreta.");
}

function adminAutenticado() {
  return sessionStorage.getItem("bolao_admin_auth") === ADMIN_SENHA;
}

function renderAdmin() {
  const main = document.getElementById("admin-main");
  if (!main) return;
  const res = getResultados();
  const tg = window.BRACKET.calcularTodosOsGrupos(res);

  let h = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">';
  h += '<div style="font-size:.9rem;font-weight:800">🔧 Inserir Resultados Oficiais</div>';
  h += '<div style="display:flex;gap:6px;flex-wrap:wrap">';
  h += '<button class="btn btn-perigo btn-sm" onclick="limparTudoAdmin()">🗑 Limpar Resultados</button>';
  h += '<button class="btn btn-perigo btn-sm" onclick="limparApostadoresAdmin()">🗑 Limpar Apostadores</button>';
  h += '<button class="btn btn-perigo btn-sm" onclick="limparSeedAdmin()">🧹 Limpar Dados de Teste</button>';
  h += '<button class="btn btn-secundario btn-sm" onclick="sairAdmin()">Sair</button></div></div>';

  h += renderJogosComToggle(res, tg, true, null);

  // Log compacto
  const log = JSON.parse(localStorage.getItem("bolao_admin_log")||"[]");
  if (log.length) {
    h += '<div class="card"><div class="card-titulo">📋 Log ' +
      '<button class="btn btn-perigo btn-sm" onclick="limparLog()">Limpar</button></div>';
    h += '<div style="font-size:.7rem;color:var(--texto2);display:flex;flex-direction:column;gap:3px;max-height:200px;overflow-y:auto">';
    log.slice().reverse().forEach(l => h += '<div style="padding:3px 0;border-bottom:1px solid var(--borda)">'+l+'</div>');
    h += '</div></div>';
  }
  main.innerHTML = h;
}

function limparLog() {
  if (!confirm("Limpar log?")) return;
  localStorage.removeItem("bolao_admin_log"); renderAdmin();
}

function limparTudoAdmin() {
  if (!confirm("⚠️ LIMPAR TODOS OS RESULTADOS OFICIAIS?\nIsso não pode ser desfeito.")) return;
  APP.resultados = {}; _persistirLocal();
  if (APP.db && !APP.modoOffline) APP.db.collection("resultados_oficiais").get().then(s=>s.forEach(d=>d.ref.delete()));
  atualizarBracket(); renderAdmin();
}

function sairAdmin() {
  sessionStorage.removeItem("bolao_admin_auth");
  document.getElementById("admin-main").innerHTML =
    '<div class="card" style="max-width:340px;margin:40px auto">' +
    '<div class="card-titulo">🔐 Acesso Admin</div>' +
    '<div class="form-group"><label>Senha</label>' +
    '<input type="password" id="admin-senha" onkeydown="if(event.key===\'Enter\')loginAdmin()"></div>' +
    '<button class="btn btn-primario" onclick="loginAdmin()">Entrar</button></div>';
}

function limparApostadoresAdmin() {
  if (!confirm("⚠️ LIMPAR TODOS OS APOSTADORES E PALPITES?\nIsso não pode ser desfeito.")) return;
  APP.apostadores = []; APP.palpites = {}; _persistirLocal();
  if (APP.db && !APP.modoOffline) {
    APP.db.collection("apostadores").get().then(s=>s.forEach(d=>d.ref.delete()));
    APP.db.collection("palpites").get().then(s=>s.forEach(d=>d.ref.delete()));
  }
  renderAdmin();
}

function limparSeedAdmin() {
  if (!confirm("Limpar dados de teste e recarregar?")) return;
  localStorage.removeItem("bolao_seed_done");
  localStorage.removeItem("bolao_seed_res");
  localStorage.removeItem("bolao_seed_v3");localStorage.removeItem("bolao_seed_v4");
  APP.apostadores = []; APP.palpites = {}; APP.resultados = {};
  _persistirLocal();
  location.reload();
}