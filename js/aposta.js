/**
 * aposta.js - Palpites do apostador
 * Layout idêntico ao de resultados, usando ui-jogos.js
 * Palpites calculados on-demand, standings projetados dos próprios palpites
 * Tokens validados no Firestore (não mais no tokens.js local)
 */

let _apostador = null;
let _palpitesLocais = {};
let _modoVer = false;

// Sobrescrever a função do ui-jogos para a tela de apostas
window._onInputPlacar = function (id, ehElim) {
  const h1 = document.getElementById("sim-hg-" + id)?.value;
  const h2 = document.getElementById("sim-ag-" + id)?.value;

  // Se um dos dois estiver vazio, não atualizamos o palpite local "salvável"
  if (h1 === "" || h2 === "") return;

  const hg = parseInt(h1);
  const ag = parseInt(h2);

  if (!isNaN(hg) && !isNaN(ag)) {
    if (!_palpitesLocais[id]) _palpitesLocais[id] = {};
    _palpitesLocais[id].homeGoals = hg;
    _palpitesLocais[id].awayGoals = ag;

    // Mostrar/esconder campo de pênaltis em eliminatórias
    const pw = document.getElementById("pen-wrap-" + id);
    if (pw) { (ehElim && hg === ag) ? pw.classList.add("visivel") : pw.classList.remove("visivel"); }
    // Se não é mais empate, limpa pênaltis do palpite local
    if (!(ehElim && hg === ag)) {
      delete _palpitesLocais[id].penaltis_home;
      delete _palpitesLocais[id].penaltis_away;
    }

    // Marca que o usuário está digitando — suprime re-renders do Firebase
    window._digitandoTimer && clearTimeout(window._digitandoTimer);
    window._estaDigitando = true;
    window._digitandoTimer = setTimeout(() => {
      window._estaDigitando = false;
      // Atualiza mini-tabelas de progresso após parar de digitar
      atualizarMiniTabelasAposta();
    }, 800);
    // Nota: sem auto-save — salvo somente pelo botão 💾 SALVAR PALPITES
  }
};

// Blur no placar: nunca simula — apenas atualiza visibilidade do campo de pênaltis.
// Guard defensivo: mesmo que ui-jogos.js seja carregado depois de aposta.js,
// esta sobrescrita garante que simularResultado() nunca é chamado aqui.
window._onBlurPlacar = function (id, ehElim) {
  const hg = parseInt(document.getElementById("sim-hg-" + id)?.value);
  const ag = parseInt(document.getElementById("sim-ag-" + id)?.value);
  const pw = document.getElementById("pen-wrap-" + id);
  if (pw) {
    (ehElim && !isNaN(hg) && !isNaN(ag) && hg === ag)
      ? pw.classList.add("visivel")
      : pw.classList.remove("visivel");
  }
};

// Captura pênaltis no palpite local para projeção do bracket pessoal
window._onBlurPen = function (id) {
  const ph = parseInt(document.getElementById("pen-hg-" + id)?.value);
  const pa = parseInt(document.getElementById("pen-ag-" + id)?.value);
  if (!isNaN(ph) && !isNaN(pa)) {
    if (!_palpitesLocais[id]) _palpitesLocais[id] = {};
    _palpitesLocais[id].penaltis_home = ph;
    _palpitesLocais[id].penaltis_away = pa;
  }
};

document.addEventListener("DOMContentLoaded", iniciarAposta);

async function iniciarAposta() {
  const params = new URLSearchParams(location.search);
  const token = params.get("token");
  _modoVer = params.has("ver");

  if (!token) { renderLoginToken(); return; }

  // Aguarda o primeiro snapshot dos apostadores chegar (ou timeout de 6s)
  if (!APP._apostadoresCarregados) {
    await new Promise(r => {
      const check = setInterval(() => {
        if (APP._apostadoresCarregados) { clearInterval(check); clearTimeout(fallback); r(); }
      }, 50);
      const fallback = setTimeout(() => { clearInterval(check); r(); }, 6000);
    });
  }

  atualizarBracket();

  // Primeiro tenta encontrar nos apostadores já carregados (já cadastrado antes)
  _apostador = APP.apostadores.find(a => a.token === token);

  // Se não encontrou, valida o token no Firestore
  if (!_apostador) {
    try {
      const snap = await APP.db.collection("tokens")
        .where("token", "==", token)
        .where("ativo", "==", true)
        .limit(1)
        .get();

      if (snap.empty) {
        mostrarErroAposta("Token inválido ou expirado. Solicite seu link ao organizador.");
        return;
      }

      const info = snap.docs[0].data();
      _apostador = { ...info, nome: "", apelido: "", novo: true };
      APP.apostadores.push(_apostador);
    } catch (e) {
      console.error("Erro ao validar token:", e);
      mostrarErroAposta("Erro ao verificar seu token. Tente novamente.");
      return;
    }
  }

  _palpitesLocais = JSON.parse(JSON.stringify(APP.palpites[_apostador.id] || {}));

  // Cadastro se novo
  if (_apostador.novo && !_modoVer) {
    renderCadastro();
  } else {
    renderAposta();
  }
}

function renderLoginToken() {
  const el = document.getElementById("aposta-main");
  if (!el) return;
  el.innerHTML =
    '<div class="card" style="max-width:360px;margin:60px auto;text-align:center">' +
    '<div style="font-size:2.2rem;margin-bottom:8px">🏆</div>' +
    '<div class="card-titulo" style="justify-content:center">Bolão Copa 2026</div>' +
    '<p style="font-size:.85rem;color:var(--texto2);margin:0 0 18px">Digite o token que você recebeu do organizador.</p>' +
    '<div class="form-group" style="text-align:left">' +
    '<label>Seu token</label>' +
    '<input type="text" id="token-input" placeholder="Ex: pfvit651u6kb" maxlength="20" ' +
    'style="font-family:monospace;letter-spacing:.05em" ' +
    'onkeydown="if(event.key===\'Enter\')entrarComToken()">' +
    '</div>' +
    '<button class="btn btn-primario" style="width:100%" onclick="entrarComToken()">Entrar →</button>' +
    '<div id="token-erro" style="margin-top:12px;font-size:.8rem;color:var(--vermelho);min-height:18px"></div>' +
    '</div>';
  setTimeout(() => document.getElementById("token-input")?.focus(), 100);
}

async function entrarComToken() {
  const input = document.getElementById("token-input");
  const erroEl = document.getElementById("token-erro");
  const token = input?.value.trim().toLowerCase();

  if (!token) { if (erroEl) erroEl.textContent = "Digite seu token."; return; }
  if (erroEl) erroEl.textContent = "";

  const btn = document.querySelector("#aposta-main .btn-primario");
  if (btn) { btn.disabled = true; btn.textContent = "Verificando..."; }

  // Redireciona para a mesma página com o token na URL
  // (reutiliza todo o fluxo normal de iniciarAposta)
  window.location.href = "aposta.html?token=" + encodeURIComponent(token);
}

function mostrarErroAposta(msg) {
  const el = document.getElementById("aposta-main");
  if (el) el.innerHTML = '<div class="card" style="max-width:380px;margin:40px auto;text-align:center">' +
    '<div style="font-size:2rem;margin-bottom:10px">⚠️</div>' +
    '<div style="font-weight:700;margin-bottom:6px">Erro</div>' +
    '<div style="font-size:.82rem;color:var(--texto2)">' + msg + '</div></div>';
}

function renderCadastro() {
  const el = document.getElementById("aposta-main");
  if (!el) return;
  el.innerHTML = '<div class="card" style="max-width:380px;margin:40px auto">' +
    '<div class="card-titulo">👤 Seu Cadastro</div>' +
    '<div class="form-group"><label>Nome completo</label>' +
    '<input type="text" id="apt-nome" placeholder="Ex: João Silva" maxlength="50"></div>' +
    '<div class="form-group"><label>Apelido <span style="font-size:0.65rem;color:var(--dourado)">(Letras e ponto ".", máx 10)</span></label>' +
    '<input type="text" id="apt-apelido" placeholder="Nome que os outros apostadores verão." maxlength="10" oninput="formatarApelido(this)"></div>' +
    '<button class="btn btn-primario" style="width:100%" onclick="salvarCadastro()">Salvar e Começar</button></div>';
}

function formatarApelido(el) {
  let val = el.value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ. ]/g, '');
  if (val.length > 0) {
    // Capitaliza primeira letra e letras após ponto ou espaço
    val = val.split(/([. ])/).map(part => {
      if (part.length === 0) return "";
      if (part === "." || part === " ") return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    }).join('');
  }
  el.value = val;
}

async function salvarCadastro() {
  const nome = document.getElementById("apt-nome")?.value.trim();
  let apelido = document.getElementById("apt-apelido")?.value.trim() || "";
  apelido = apelido.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ. ]/g, '');
  if (apelido.length > 0) {
    apelido = apelido.split(/([. ])/).map(part => {
      if (part.length === 0) return "";
      if (part === "." || part === " ") return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    }).join('');
  }
  apelido = apelido.substring(0, 10);

  if (!nome) { alert("Informe seu nome."); return; }
  _apostador.nome = nome;
  _apostador.apelido = apelido || nome.split(" ")[0].replace(/[^A-Za-zÀ-ÖØ-öø-ÿ. ]/g, '').substring(0, 10);
  if (_apostador.apelido.length > 0) {
    _apostador.apelido = _apostador.apelido.split(/([. ])/).map(part => {
      if (part.length === 0) return "";
      if (part === "." || part === " ") return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    }).join('');
  }
  _apostador.novo = false;
  _apostador.token = _apostador.token;
  if (!_apostador.id) _apostador.id = "tok_" + Date.now();
  await gravarApostador(_apostador);

  // Sincroniza apelido no doc do token (se estava vazio)
  if (_apostador.token && _apostador.apelido) {
    try {
      const snap = await APP.db.collection("tokens")
        .where("token", "==", _apostador.token)
        .limit(1)
        .get();
      if (!snap.empty) {
        const tokenDoc = snap.docs[0];
        if (!tokenDoc.data().apelido) {
          await tokenDoc.ref.update({ apelido: _apostador.apelido });
        }
      }
    } catch (e) { /* silencioso */ }
  }

  renderAposta();
}

// ── Projeção on-demand dos palpites do apostador ──
// Regra: resultado oficial sempre prevalece.
// Palpite só é usado para jogos sem resultado oficial ainda.
// Em jogos eliminatórios onde o palpite é empate, os pênaltis do palpite
// são usados APENAS para decidir quem avança no bracket (não afetam pontos).
function calcularProjecao() {
  const res = Object.assign({}, APP.resultados);
  for (const [id, p] of Object.entries(_palpitesLocais)) {
    if (res[id]?.homeGoals === undefined && p?.homeGoals !== undefined) {
      const jogo = window.SCHEDULE_BY_ID[id];
      const ehElim = jogo && jogo.fase !== "grupos";
      const ehEmpate = p.homeGoals === p.awayGoals;
      // Pênaltis do palpite: só existem se o apostador os preencheu (pen-hg / pen-ag)
      const penH = p.penaltis_home;
      const penA = p.penaltis_away;
      const temPen = ehElim && ehEmpate && penH !== undefined && penA !== undefined && penH !== penA;
      res[id] = {
        gameId: id,
        homeGoals: p.homeGoals,
        awayGoals: p.awayGoals,
        // foi_penaltis: true apenas quando há pênaltis declarados no palpite de eliminatória
        foi_penaltis: !!temPen,
        penaltis_vencedor: temPen ? (penH > penA ? "home" : "away") : null,
        penaltis_home: temPen ? penH : null,
        penaltis_away: temPen ? penA : null,
      };
    }
  }
  return window.BRACKET.calcularTodosOsGrupos(res);
}

// ── Render principal ──
function renderAposta() {
  const el = document.getElementById("aposta-main");
  if (!el || !_apostador) return;
  const displayName = _apostador.nome ? `${_apostador.nome}` + (_apostador.apelido ? ` ("${_apostador.apelido}")` : "") : "Apostador";

  // Header com nome
  const hn = document.getElementById("header-nome");
  if (hn) hn.innerHTML = (_modoVer ? "Palpites de " : "Olá, ") + "<strong>" + displayName + "</strong><small>Bolão Copa 2026</small>";

  const resOficiais = getResultados();
  const tg = calcularProjecao();

  // resCompleto = official + bets para o check de 'ok' nas badges de grupos.
  // res (oficial) continua sendo usado para display de placar e inputs — não muda o UX.
  const resCompleto = Object.assign({}, resOficiais);
  for (const [id, p] of Object.entries(_palpitesLocais)) {
    if (resCompleto[id]?.homeGoals === undefined && p?.homeGoals !== undefined) {
      resCompleto[id] = { homeGoals: p.homeGoals, awayGoals: p.awayGoals };
    }
  }
  // Bracket projetado: palpites do apostador preenchem onde não há resultado oficial.
  // Pênaltis do palpite são propagados para que empates em eliminatórias avancem o time certo.
  // Resultados oficiais sempre sobrepõem os palpites.
  const _resProjecao = {};
  for (const [_pid, _p] of Object.entries(_palpitesLocais)) {
    if (_p?.homeGoals !== undefined) {
      const _j = window.SCHEDULE_BY_ID[_pid];
      const _ehElim = _j && _j.fase !== "grupos";
      const _ehEmpate = _p.homeGoals === _p.awayGoals;
      const _pH = _p.penaltis_home;
      const _pA = _p.penaltis_away;
      const _temPen = _ehElim && _ehEmpate && _pH !== undefined && _pA !== undefined && _pH !== _pA;
      _resProjecao[_pid] = {
        gameId: _pid,
        homeGoals: _p.homeGoals,
        awayGoals: _p.awayGoals,
        foi_penaltis: !!_temPen,
        penaltis_vencedor: _temPen ? (_pH > _pA ? "home" : "away") : null,
        penaltis_home: _temPen ? _pH : null,
        penaltis_away: _temPen ? _pA : null,
      };
    }
  }
  for (const [_pid, _pr] of Object.entries(resOficiais)) _resProjecao[_pid] = _pr;
  const _bracketApostador = window.BRACKET.preencherBracket(_resProjecao);

  // Contagem palpites preenchidos
  const totalJogos = (window.SCHEDULE || []).filter(j => j.fase === "grupos").length;
  const preenchidos = Object.values(_palpitesLocais).filter(p => p?.homeGoals !== undefined).length;

  let h = "";

  const status = window.APP?.configStatus || {};
  const algumaLiberada = Object.keys(status).some(k => k.startsWith("liberado_") && status[k] === true);

  // Botão Salvar Discreto
  if (!_modoVer) {
    h += '<div style="display:flex; justify-content:flex-end; margin-bottom:15px">';
    if (algumaLiberada) {
      h += '<button class="btn btn-primario btn-sm" onclick="salvarTodosPalpites()" style="font-weight:800">💾 SALVAR PALPITES</button>';
    } else {
      h += '<button class="btn btn-perigo btn-sm" disabled style="opacity:0.7">🔒 APOSTAS TRAVADAS</button>';
    }
    h += '</div>';
  }

  // Mini-tabela de progresso por fase
  h += '<div id="progresso-container" style="margin-bottom:15px">' + renderProgressoAposta() + '</div>';

  // Palpites especiais (campeão, vice, 3o)
  if (!_modoVer) h += '<div id="especiais-container">' + renderEspeciaisAposta(resOficiais) + '</div>';

  // Mesmo layout do resultados: grupos + toggle + jogos
  h += renderJogosComToggle(resOficiais, tg, false, _palpitesLocais, _bracketApostador, resCompleto);

  // Focus Guard: captura o input focado antes de destruir o DOM
  const _fgId = document.activeElement?.id || null;
  const _fgVal = document.activeElement?.value ?? null;
  const _fgSel = document.activeElement?.selectionStart ?? null;

  el.innerHTML = h;

  // Registrar inputs: ao digitar, atualiza palpite local + re-renderiza grupos
  _registrarInputsAposta();

  // Focus Guard: restaura foco após re-render
  if (_fgId) {
    const _fgEl = document.getElementById(_fgId);
    if (_fgEl) {
      _fgEl.focus();
      if (_fgVal !== null) _fgEl.value = _fgVal;
      try { _fgEl.setSelectionRange(_fgSel, _fgSel); } catch (_e) { }
    }
  }
}

// Sobrescreve a função global para que os toggles de ui-jogos.js funcionem aqui
window.renderAbaAtiva = function () {
  // Suprime re-render completo enquanto usuário está digitando (evita flickering)
  if (window._estaDigitando) return;
  renderAposta();
};

function renderEspeciaisAposta(res) {
  const esp = _apostador.especiais || {};
  const cfgExtra = window.CONFIG?.pontuacao?.extras || {};
  // jogoOficial: qual jogo define oficialmente aquela posição no pódio
  const fases = [
    { key: "campeao",  label: "🏆 Campeão",   pts: (cfgExtra.primeiro_lugar || 0) + "pts", jogoOficial: "FNL" },
    { key: "vice",     label: "🥈 Vice",       pts: (cfgExtra.segundo_lugar  || 0) + "pts", jogoOficial: "FNL" },
    { key: "terceiro", label: "🥉 3° Lugar",   pts: (cfgExtra.terceiro_lugar || 0) + "pts", jogoOficial: "TPL" },
  ];
  const times = [...new Set((window.SCHEDULE || []).filter(j => j.grupo).map(j => [j.home, j.away]).flat())];
  const liberadoGrupos = window.APP?.configStatus?.liberado_grupos === true;

  let h = '<div class="card" style="margin-bottom:20px"><div class="card-titulo">⭐ Palpites Especiais</div>';
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;justify-content:center">';
  for (const f of fases) {
    const val = esp[f.key] || "";
    const info = window.TEAMS_BY_CODE?.[val];
    const outrasEscolhas = fases.filter(f2 => f2.key !== f.key).map(f2 => esp[f2.key]).filter(Boolean);

    // Regra 1: fase de grupos travada → bloqueia todos os especiais
    const bloqueadoPorFase = !liberadoGrupos;
    // Regra 2: resultado oficial do jogo que define essa posição já existe → bloqueia esse campo
    const bloqueadoPorResultado = res[f.jogoOficial]?.homeGoals !== undefined;
    const estaBloqueado = bloqueadoPorFase || bloqueadoPorResultado;

    h += '<div style="background:var(--fundo2);border-radius:var(--radius-sm);padding:10px">';
    // Label com indicador visual do motivo do bloqueio
    h += '<div style="font-size:.78rem;font-weight:700;margin-bottom:6px">' + f.label +
         ' <span style="color:var(--dourado);font-size:.65rem">' + f.pts + '</span>';
    if (bloqueadoPorResultado) {
      h += ' <span style="font-size:.58rem;color:var(--verde-light);opacity:.9;margin-left:2px">✓ oficial</span>';
    } else if (bloqueadoPorFase) {
      h += ' <span style="font-size:.65rem;color:var(--texto2);margin-left:2px">🔒</span>';
    }
    h += '</div>';

    h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">' + htmlBandeira(val, 24);
    h += '<span style="font-size:.82rem;font-weight:600">' + (info?.name || "Selecionar") + '</span></div>';

    if (!_modoVer) {
      const disAttr = estaBloqueado
        ? ' disabled style="background-color:#30363d;color:var(--texto2);opacity:1;cursor:not-allowed;border-color:var(--borda)"'
        : '';
      h += '<select class="apt-esp" data-key="' + f.key + '" onchange="gravarEspecialAposta(this)" style="font-size:.75rem;padding:5px 8px"' + disAttr + '>';
      h += '<option value="">-- Selecionar --</option>';
      for (const c of times.sort()) {
        const t = window.TEAMS_BY_CODE?.[c];
        const jaEscolhido = outrasEscolhas.includes(c);
        h += '<option value="' + c + '"' + (val === c ? " selected" : "") +
             (jaEscolhido ? ' disabled style="color:var(--texto2);opacity:.4"' : '') + '>' +
             (t?.name || c) + (jaEscolhido ? ' ✕' : '') + '</option>';
      }
      h += '</select>';
    }
    h += '</div>';
  }
  h += '</div></div>';
  return h;
}

async function gravarEspecialAposta(sel) {
  const key = sel.dataset.key;
  if (!_apostador.especiais) _apostador.especiais = {};
  _apostador.especiais[key] = sel.value;

  await gravarApostador(_apostador);

  // Re-renderiza o bloco de especiais para atualizar validação cruzada dos dropdowns
  const espContainer = document.getElementById("especiais-container");
  if (espContainer) {
    const res = getResultados();
    espContainer.innerHTML = renderEspeciaisAposta(res);
  }
}

function atualizarMiniTabelasAposta() {
  const tg = calcularProjecao();
  const resOficiais = getResultados();

  // resCompleto = oficial + bets para badges de grupos
  const resCompleto = Object.assign({}, resOficiais);
  for (const [id, p] of Object.entries(_palpitesLocais)) {
    if (resCompleto[id]?.homeGoals === undefined && p?.homeGoals !== undefined) {
      resCompleto[id] = { homeGoals: p.homeGoals, awayGoals: p.awayGoals };
    }
  }

  // Atualizar o grid de grupos no topo se existir
  const gridContainer = document.querySelector(".grupos-grid")?.parentElement;
  if (gridContainer && _modoGrupos === "topo") {
    gridContainer.innerHTML = renderGruposGrid(tg, resOficiais, resCompleto);
  }

  // Atualizar a tabela de progresso
  const progContainer = document.getElementById("progresso-container");
  if (progContainer) progContainer.innerHTML = renderProgressoAposta();
}

function renderProgressoAposta() {
  const fases = [
    { key: "grupos", label: "Grupos", total: 72 },
    { key: "32avos", label: "32avos", total: 16 },
    { key: "oitavas", label: "Oitavas", total: 8 },
    { key: "quartas", label: "Quartas", total: 4 },
    { key: "semis", label: "Semis", total: 2 },
    { key: "finais", label: "Finais", total: 2 },
    { key: "especiais", label: "Extra", total: 3 }
  ];

  const pals = _palpitesLocais || {};
  const counts = {};

  // Contar palpites por fase
  fases.forEach(f => {
    if (f.key === "especiais") {
      const esp = _apostador?.especiais || {};
      counts[f.key] = ["campeao", "vice", "terceiro"].filter(k => esp[k]).length;
    } else {
      const faseKeys = f.key === "finais" ? ["final", "terceiro"] : [f.key];
      counts[f.key] = (window.SCHEDULE || []).filter(j => faseKeys.includes(j.fase)).filter(j => {
        const p = pals[j.id];
        return p && p.homeGoals !== undefined && p.awayGoals !== undefined;
      }).length;
    }
  });

  let h = '<div class="card" style="padding:8px 10px; margin-bottom:0">';
  h += '<div style="font-size:.62rem; font-weight:700; color:var(--texto2); text-transform:uppercase; letter-spacing:1px; margin-bottom:6px">📊 Resumo do Preenchimento</div>';

  h += '<div style="overflow-x:auto; -webkit-overflow-scrolling:touch; scrollbar-width:none">';
  h += '<table style="width:100%; border-collapse:collapse; text-align:center; min-width:320px">';
  h += '<thead><tr style="color:var(--texto2); border-bottom:1px solid var(--borda)">';
  fases.forEach(f => h += '<th style="padding:2px; font-weight:500; font-size:.6rem">' + f.label + '</th>');
  h += '</tr></thead>';
  h += '<tbody><tr>';
  fases.forEach(f => {
    const total = f.total;
    const feitos = counts[f.key] || 0;
    let cor = "var(--texto2)";
    if (total > 0 && feitos === total) cor = "var(--verde-light)";
    else if (feitos > 0) cor = "var(--dourado)";

    h += '<td style="padding:6px 2px; font-weight:800; color:' + cor + '; font-size:1rem">';
    h += feitos + '<span style="opacity:.4; font-weight:400; font-size:.62rem">/' + total + '</span>';
    h += '</td>';
  });
  h += '</tr></tbody></table></div></div>';

  return h;
}

function _registrarInputsAposta() {
  // A lógica é tratada pelo window._onInputPlacar sobrescrito acima
}

async function salvarTodosPalpites(silencioso = false) {
  if (_modoVer) return;
  if (!_apostador?.id) return;

  const batch = APP.db.batch();
  let cont = 0;

  const refBase = APP.db.collection("apostadores").doc(_apostador.id).collection("palpites_jogos");

  for (const [gameId, p] of Object.entries(_palpitesLocais)) {
    // Só salva se mudou algo em relação ao que já temos no APP.palpites
    const pAnterior = APP.palpites[_apostador.id]?.[gameId];
    if (pAnterior?.homeGoals === p.homeGoals && pAnterior?.awayGoals === p.awayGoals) continue;

    if (p?.homeGoals !== undefined && p?.awayGoals !== undefined && jogoAceita(gameId)) {
      const jogo = window.SCHEDULE_BY_ID[gameId];
      const fase = (jogo.fase === "final" || jogo.fase === "terceiro") ? "finais" : jogo.fase;
      const data = {
        apostadorId: _apostador.id, gameId, homeGoals: p.homeGoals, awayGoals: p.awayGoals, fase,
        token: _apostador.token || null,
        atualizado_em: new Date().toISOString()
      };
      batch.set(refBase.doc(gameId), data, { merge: true });
      cont++;
    }
  }

  if (cont > 0) {
    await batch.commit();
  }
  if (!silencioso) {
    let toast = document.getElementById('toast-salvo');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast-salvo';
      toast.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#22c55e;color:#fff;font-weight:800;font-size:.9rem;padding:10px 24px;border-radius:999px;z-index:9999;box-shadow:0 4px 15px rgba(0,0,0,0.4);transition:opacity 0.4s ease;pointer-events:none;white-space:nowrap';
      document.body.appendChild(toast);
    }
    toast.textContent = '✓ Palpites salvos!';
    toast.style.opacity = '1';
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2200);
  }
}
