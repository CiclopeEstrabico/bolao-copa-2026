/** admin.js - Resultados oficiais (mesmo layout que resultados) */
const ADMIN_SENHA = "#bolao2026#";

// Sobrescreve o renderAbaAtiva do app.js para re-renderizar o admin quando os dados carregarem
window.renderAbaAtiva = function() {
  if (adminAutenticado()) {
    const activeId = document.activeElement?.id;
    const sy = window.scrollY;
    const sStart = document.activeElement?.selectionStart;
    const sEnd = document.activeElement?.selectionEnd;
    
    const oldHeight = document.body.style.minHeight;
    document.body.style.minHeight = document.body.scrollHeight + 'px';
    
    renderAdmin();
    
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
};

// Admin não deve simular palpites enquanto digita, apenas controla interface de penaltis
window._onInputPlacar = function(id, isElim) {
  const hg = parseInt(document.getElementById("sim-hg-"+id)?.value);
  const ag = parseInt(document.getElementById("sim-ag-"+id)?.value);
  const pwrap = document.getElementById("pen-wrap-"+id);
  if (isElim && !isNaN(hg) && !isNaN(ag) && hg === ag) {
    if (pwrap) pwrap.classList.add("visivel");
  } else {
    if (pwrap) pwrap.classList.remove("visivel");
  }
};

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
  h += '<div style="display:flex;gap:4px;align-items:center">';
  h += '<select id="admin-apaga-apostador" class="form-input" style="padding:4px;height:28px;font-size:.7rem">';
  h += '<option value="">Deletar um apostador...</option>';
  APP.apostadores.forEach(a => h += `<option value="${a.id}">${a.apelido || a.nome}</option>`);
  h += '</select>';
  h += '<button class="btn btn-perigo btn-sm" onclick="deletarApostadorEspecifico()">✕</button></div>';
  h += '<button class="btn btn-primario btn-sm" onclick="gravarTudoAdmin()">💾 GRAVAR OFICIAL</button></div></div>';

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
  APP.resultados = {}; APP.resultadosSim = {}; _persistirLocal();
  document.querySelectorAll('input[type="number"]').forEach(el => el.value = '');
  if (APP.db && !APP.modoOffline) APP.db.collection("resultados_oficiais").get().then(s=>s.forEach(d=>d.ref.delete()));
  atualizarBracket(); renderAdmin();
}

function deletarApostadorEspecifico() {
  const select = document.getElementById("admin-apaga-apostador");
  const id = select?.value;
  if (!id) { alert("Selecione um apostador para deletar."); return; }
  const a = APP.apostadores.find(x => x.id === id);
  if (!confirm(`Deletar o apostador ${a.apelido || a.nome}?`)) return;
  
  // Apaga local
  APP.apostadores = APP.apostadores.filter(x => x.id !== id);
  delete APP.palpites[id];
  _persistirLocal();

  // Apaga Firebase
  if (APP.db && !APP.modoOffline) {
    APP.db.collection("apostadores").doc(id).delete();
    // Apaga também a subcoleção de palpites_jogos do apostador
    APP.db.collection("apostadores").doc(id).collection("palpites_jogos").get().then(snap => {
      snap.forEach(doc => doc.ref.delete());
    });
  }
  renderAdmin();
  alert("Apostador deletado.");
}

function gravarTudoAdmin() {
  const log = JSON.parse(localStorage.getItem("bolao_admin_log")||"[]");
  let gravou = 0;

  for (const j of window.SCHEDULE) {
    const hg = parseInt(document.getElementById("sim-hg-"+j.id)?.value);
    const ag = parseInt(document.getElementById("sim-ag-"+j.id)?.value);
    
    // Só grava se os dois inputs estiverem preenchidos
    if (!isNaN(hg) && !isNaN(ag)) {
      let foiPen=false, penH=null, penA=null;
      if (j.fase !== "grupos" && hg === ag) {
        penH = parseInt(document.getElementById("pen-hg-"+j.id)?.value);
        penA = parseInt(document.getElementById("pen-ag-"+j.id)?.value);
        if (!isNaN(penH) && !isNaN(penA)) {
          if (penH === penA) {
            alert("Pênaltis não podem empatar! Jogo: " + j.id);
            return; // Bloqueia a gravação de tudo até corrigir
          }
          foiPen = true;
        }
      }
      const pv = foiPen ? (penH > penA ? "home" : "away") : null;
      
      const resLocal = APP.resultados[j.id];
      // Para economizar Firebase, só grava se os dados mudaram de fato
      if (!resLocal || resLocal.homeGoals !== hg || resLocal.awayGoals !== ag || resLocal.foi_penaltis !== foiPen) {
        const data = {
          gameId: j.id, homeGoals: hg, awayGoals: ag,
          foi_penaltis: foiPen, penaltis_vencedor: pv,
          penaltis_home: foiPen ? penH : null, penaltis_away: foiPen ? penA : null,
          inserido_em: new Date().toISOString(), inserido_por: "admin"
        };
        
        APP.resultados[j.id] = data;
        if (APP.db && !APP.modoOffline) {
          APP.db.collection("resultados_oficiais").doc(j.id).set(data, {merge: true});
        }
        
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


