/**
 * aposta.js - Palpites do apostador
 * Layout idêntico ao de resultados, usando ui-jogos.js
 * Palpites calculados on-demand, standings projetados dos próprios palpites
 * Tokens validados no Firestore (não mais no tokens.js local)
 */

let _apostador = null;
let _palpitesLocais = {};
let _palpitesCarregados = {}; // snapshot do Firestore no carregamento — base de comparação para detectar mudanças
let _modoVer = false;
let _modoModelo = false;
let _autoScrollApostaFeito = false; // garante scroll só na 1ª renderização

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

// Blur no placar: no-op na página de apostas
window._onBlurPlacar = function (id, ehElim) {};

// Captura pênaltis no palpite local: no-op na página de apostas
window._onBlurPen = function (id) {};

document.addEventListener("DOMContentLoaded", iniciarAposta);

/**
 * Lê os palpites do próprio apostador do documento compacto:
 *   apostadores/{id}/dados/palpites  →  { G001: "2-1", G002: "0-0", ... }
 *
 * Retorna: { [gameId]: { homeGoals: N, awayGoals: N } }
 */
async function _carregarPalpitesPropriosDoFirestore(apostadorId) {
  try {
    // Lê apenas do documento compacto (novo formato — 1 read)
    const docRef = APP.db
      .collection("apostadores").doc(apostadorId)
      .collection("dados").doc("palpites");
    const snap = await docRef.get();

    if (snap.exists) {
      const data = snap.data();
      if (data.especiais) _apostador.especiais = data.especiais;
      return _expandirDocCompacto(data, apostadorId);
    }

    return {};
  } catch (e) {
    console.error("[aposta] Erro ao carregar palpites:", e);
    return {};
  }
}

/**
 * Converte o mapa compacto { G001: "2-1", ... } para o formato interno
 * { [gameId]: { homeGoals: N, awayGoals: N } } usado por toda a lógica.
 */
function _expandirDocCompacto(mapa, apostadorId) {
  const palpites = {};
  for (const [gameId, val] of Object.entries(mapa || {})) {
    if (typeof val !== "string") continue;
    const partes = val.split("-");
    if (partes.length !== 2) continue;
    const hg = parseInt(partes[0]);
    const ag = parseInt(partes[1]);
    if (isNaN(hg) || isNaN(ag)) continue;
    palpites[gameId] = { homeGoals: hg, awayGoals: ag };
  }
  return palpites;
}

async function iniciarAposta() {
  const params = new URLSearchParams(location.search);
  const token = params.get("token");
  _modoVer = params.has("ver");

  // ─── MODELO ─────────────────────────────────────────────────────────────────
  if (token === "modelo") {
    _modoModelo = true;
    _modoVer = true; // sempre somente-leitura
    window._modoModeloAtivo = true;

    // Aguarda MODELO carregar
    if (!APP._modeloCarregado) {
      await new Promise(r => {
        const check = setInterval(() => {
          if (APP._modeloCarregado) { clearInterval(check); clearTimeout(fb); r(); }
        }, 50);
        const fb = setTimeout(() => { clearInterval(check); r(); }, 6000);
      });
    }

    _apostador = window.getModelo ? window.getModelo() : null;
    if (!_apostador) {
      mostrarErroAposta("Nenhum palpite do MODELO disponível ainda.");
      return;
    }

    _palpitesLocais = JSON.parse(JSON.stringify(APP.palpitesModelo || {}));
    renderAposta();
    return;
  }
  // ────────────────────────────────────────────────────────────────────────────

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
      // Carrega diretamente pelo ID (ID do doc é o próprio token secreto)
      const directSnap = await APP.db.collection("tokens").doc(token).get();
      if (!directSnap.exists || directSnap.data().ativo !== true) {
        mostrarErroAposta("Token inválido ou expirado. Solicite seu link ao organizador.");
        return;
      }

      const info = directSnap.data();
      _apostador = { ...info, nome: "", apelido: "", novo: true };
      APP.apostadores.push(_apostador);
    } catch (e) {
      console.error("Erro ao validar token:", e);
      mostrarErroAposta("Erro ao verificar seu token. Tente novamente.");
      return;
    }
  }

  _palpitesLocais = await _carregarPalpitesPropriosDoFirestore(_apostador.id);

  // Guarda snapshot do estado inicial (vindo do Firestore) para comparação em salvarTodosPalpites().
  // Usar APP.palpites como referência causava bug: APP.palpites é atualizado após cada save,
  // então edições em palpites já existentes não eram detectadas como mudança.
  _palpitesCarregados = JSON.parse(JSON.stringify(_palpitesLocais));

  // Mantém APP.palpites sincronizado (usado por outras partes do app).
  if (!APP.palpites[_apostador.id]) APP.palpites[_apostador.id] = {};
  Object.assign(APP.palpites[_apostador.id], _palpitesLocais);

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

  // Desabilita o botão durante o salvamento para evitar cliques duplos
  const btnSalvar = document.querySelector("#aposta-main .btn-primario");
  if (btnSalvar) {
    btnSalvar.disabled = true;
    btnSalvar.textContent = "Salvando...";
  }

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

  // Limpa campos extras (como numero, pago, enviado) vindos do token para
  // respeitar as regras de segurança estritas do Firestore (hasOnly)
  const apostadorLimpo = {
    id: _apostador.id,
    nome: _apostador.nome,
    apelido: _apostador.apelido,
    token: _apostador.token || "",
    ativo: _apostador.ativo !== undefined ? _apostador.ativo : true,
    novo: false,
    criado_em: _apostador.criado_em || new Date().toISOString()
  };
  if (_apostador.especiais) apostadorLimpo.especiais = _apostador.especiais;
  if (_apostador.ordem !== undefined) apostadorLimpo.ordem = _apostador.ordem;

  _apostador = apostadorLimpo;

  try {
    await gravarApostador(_apostador);
  } catch (e) {
    console.error("[aposta] Erro ao gravar cadastro no Firestore:", e);
    // Restaura o estado para permitir nova tentativa
    _apostador.novo = true;
    if (btnSalvar) {
      btnSalvar.disabled = false;
      btnSalvar.textContent = "Salvar e Começar";
    }
    alert("Erro ao salvar seu cadastro. Verifique sua conexão e tente novamente.");
    return;
  }

  // Sincroniza apelido no doc do token (se estava vazio)
  if (_apostador.token && _apostador.apelido) {
    try {
      // Carrega diretamente pelo ID (ID do doc é o próprio token secreto)
      const docRef = APP.db.collection("tokens").doc(_apostador.token);
      const docSnap = await docRef.get();
      if (docSnap.exists && !docSnap.data().apelido) {
        await docRef.update({ apelido: _apostador.apelido });
      }
    } catch (e) { /* silencioso */ }
  }

  renderAposta();
}

function calcularProjecao() {
  const res = Object.assign({}, APP.resultados);
  for (const [id, p] of Object.entries(_palpitesLocais)) {
    if (res[id]?.homeGoals === undefined && p?.homeGoals !== undefined) {
      res[id] = {
        gameId: id,
        homeGoals: p.homeGoals,
        awayGoals: p.awayGoals,
        foi_penaltis: false,
        penaltis_vencedor: null,
        penaltis_home: null,
        penaltis_away: null,
      };
    }
  }
  return window.BRACKET.calcularTodosOsGrupos(res);
}

// ── Render principal ──
function renderAposta() {
  const el = document.getElementById("aposta-main");
  if (!el || !_apostador) return;
  const displayName = _modoModelo
    ? "MODELO"
    : (_apostador.nome ? `${_apostador.nome}` + (_apostador.apelido ? ` ("${_apostador.apelido}")` : "") : "Apostador");
  const headerPrefix = _modoModelo ? "Palpites do " : (_modoVer ? "Palpites de " : "Olá, ");

  // Header com nome
  const hn = document.getElementById("header-nome");
  if (hn) hn.innerHTML = headerPrefix + "<strong>" + displayName + "</strong><small>Bolão Copa 2026</small>";

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
  // Resultados oficiais sempre sobrepõem os palpites.
  const _resProjecao = {};
  for (const [_pid, _p] of Object.entries(_palpitesLocais)) {
    if (_p?.homeGoals !== undefined) {
      _resProjecao[_pid] = {
        gameId: _pid,
        homeGoals: _p.homeGoals,
        awayGoals: _p.awayGoals,
        foi_penaltis: false,
        penaltis_vencedor: null,
        penaltis_home: null,
        penaltis_away: null,
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
  // MODELO: somente-leitura; apostador normal: editável (nunca ambos)
  if (_modoModelo) {
    h += '<div id="especiais-container">' + renderEspeciaisModeloReadOnly() + '</div>';
  } else if (!_modoVer) {
    h += '<div id="especiais-container">' + renderEspeciaisAposta(resOficiais) + '</div>';
  }

  // Mesmo layout do resultados: grupos + toggle + jogos
  h += renderJogosComToggle(resOficiais, tg, false, _palpitesLocais, null, resCompleto);

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

  // Auto-scroll para o 1º jogo de fase aberta sem palpite (só na 1ª renderização).
  // Usa !input.disabled para ignorar jogos de fases bloqueadas.
  if (!_modoVer && !_modoModelo && !_autoScrollApostaFeito && typeof window.scrollParaPrimeiroJogoVazio === 'function') {
    _autoScrollApostaFeito = true;
    window.scrollParaPrimeiroJogoVazio('aposta-main', (_id, input) => !input.disabled && input.value === '');
  }
}

// Sobrescreve a função global para que os toggles de ui-jogos.js funcionem aqui
window.renderAbaAtiva = function () {
  // Suprime re-render completo enquanto usuário está digitando (evita flickering)
  if (window._estaDigitando) return;
  if (_modoModelo) {
    _palpitesLocais = JSON.parse(JSON.stringify(APP.palpitesModelo || {}));
    _apostador = window.getModelo ? window.getModelo() : _apostador;
  }
  renderAposta();
};

function renderEspeciaisAposta(res) {
  const esp = _apostador.especiais || {};
  const cfgExtra = window.CONFIG?.pontuacao?.extras || {};
  // jogoOficial: qual jogo define oficialmente aquela posição no pódio
  const fases = [
    { key: "campeao", label: "🏆 Campeão", pts: (cfgExtra.primeiro_lugar || 0) + "pts", jogoOficial: "FNL" },
    { key: "vice", label: "🥈 Vice", pts: (cfgExtra.segundo_lugar || 0) + "pts", jogoOficial: "FNL" },
    { key: "terceiro", label: "🥉 3° Lugar", pts: (cfgExtra.terceiro_lugar || 0) + "pts", jogoOficial: "TPL" },
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
    h += '<span style="font-size:.7rem;font-weight:600">' + (info?.name || "Selecionar") + '</span></div>';

    if (!_modoVer) {
      const disAttr = estaBloqueado
        ? ' disabled style="background-color:#30363d;color:var(--texto2);opacity:1;cursor:not-allowed;border-color:var(--borda)"'
        : '';
      h += '<select class="apt-esp" data-key="' + f.key + '" onchange="gravarEspecialAposta(this)" style="font-size:.64rem;padding:5px 8px"' + disAttr + '>';
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

/**
 * Garante que o documento pai apostadores/{id} existe no Firestore antes de
 * qualquer escrita na subcoleção dados/palpites.
 *
 * Para apostadores já cadastrados (99% dos casos) o .get() confirma que o doc
 * existe e retorna imediatamente — custo: 1 Read, 0 Writes.
 *
 * Para o caso raro de doc pai ausente (apostador fantasma / race condition no
 * cadastro), (re)cria o documento com os dados do _apostador em memória.
 *
 * Retorna false se _apostador não tiver os dados mínimos para ser gravado
 * (novo = true ainda não passou por salvarCadastro) — bloqueia o write.
 */
async function _garantirDocPaiExiste() {
  if (!_apostador?.id) return false;

  // Apostador ainda não concluiu o cadastro — não deixa salvar nada
  if (_apostador.novo === true) return false;

  try {
    const paiRef = APP.db.collection("apostadores").doc(_apostador.id);
    const paiSnap = await paiRef.get();
    if (!paiSnap.exists) {
      // Doc pai ausente: recria a partir dos dados em memória.
      // Só chega aqui em casos de race condition ou cadastro incompleto antigo.
      const apostadorLimpo = {
        id: _apostador.id,
        nome: _apostador.nome || "",
        apelido: _apostador.apelido || "",
        token: _apostador.token || "",
        ativo: _apostador.ativo !== undefined ? _apostador.ativo : true,
        novo: false,
        criado_em: _apostador.criado_em || new Date().toISOString(),
      };
      if (_apostador.especiais) apostadorLimpo.especiais = _apostador.especiais;
      if (_apostador.ordem !== undefined) apostadorLimpo.ordem = _apostador.ordem;
      await paiRef.set(apostadorLimpo, { merge: true });
      console.warn("[aposta] Doc pai recriado para", _apostador.id);
    }
    return true;
  } catch (e) {
    console.error("[aposta] Erro ao verificar/recriar doc pai:", e);
    return false;
  }
}

async function gravarEspecialAposta(sel) {
  const key = sel.dataset.key;
  if (!_apostador.especiais) _apostador.especiais = {};
  _apostador.especiais[key] = sel.value;

  // Garante doc pai antes de escrever na subcoleção
  const paiOk = await _garantirDocPaiExiste();
  if (!paiOk) {
    console.warn("[aposta] gravarEspecialAposta bloqueado: cadastro incompleto.");
    return;
  }

  const docRef = APP.db.collection("apostadores").doc(_apostador.id).collection("dados").doc("palpites");
  await docRef.set({ especiais: _apostador.especiais, token: _apostador.token || "" }, { merge: true });

  // Re-renderiza o bloco de especiais para atualizar validação cruzada dos dropdowns
  const espContainer = document.getElementById("especiais-container");
  if (espContainer) {
    const res = getResultados();
    espContainer.innerHTML = renderEspeciaisAposta(res);
  }

  // Atualiza instantaneamente a tabela de progresso no topo (sem custo de Reads)
  atualizarMiniTabelasAposta();
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
    { key: "16avos", label: "16avos", total: 16 },
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

function exibirToastAposta(msg, sucesso = true) {
  let toast = document.getElementById('toast-salvo');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-salvo';
    document.body.appendChild(toast);
  }
  const bg = sucesso ? '#22c55e' : '#ef4444';
  toast.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:' + bg + ';color:#fff;font-weight:800;font-size:.9rem;padding:10px 24px;border-radius:999px;z-index:9999;box-shadow:0 4px 15px rgba(0,0,0,0.4);transition:opacity 0.4s ease;pointer-events:none;white-space:nowrap';
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2200);
}

async function salvarTodosPalpites(silencioso = false) {
  if (_modoVer) return;
  if (!_apostador?.id) return;

  // Proteção contra erro de digitação: placar com mais de 9 gols pra um time quase
  // sempre é dedo escorregado (ex: "23" em vez de "2"). Confirma antes de salvar.
  if (!silencioso) {
    const suspeitos = [];
    for (const [gameId, p] of Object.entries(_palpitesLocais)) {
      if (p?.homeGoals === undefined || p?.awayGoals === undefined) continue;
      if (Number(p.homeGoals) > 9 || Number(p.awayGoals) > 9) {
        const jogoRef = (window.SCHEDULE || []).find(j => j.id === gameId);
        const nomeJogo = jogoRef ? (getSigla(jogoRef.home) + ' x ' + getSigla(jogoRef.away)) : gameId;
        suspeitos.push(nomeJogo + ': ' + p.homeGoals + ' x ' + p.awayGoals);
      }
    }
    if (suspeitos.length) {
      const ok = confirm(
        '⚠️ Placar com mais de 9 gols pra um time — confere se não foi engano de digitação:\n\n' +
        suspeitos.join('\n') +
        '\n\nSalvar assim mesmo?'
      );
      if (!ok) return;
    }
  }

  // Compara com _palpitesCarregados (snapshot do Firestore ao carregar a página),
  // NÃO com APP.palpites — que é atualizado após cada save e causava bug:
  // quando o usuário editava palpites já existentes (ex: oitavas desbloqueadas),
  // houveMudanca ficava false e o set() nunca era chamado, mas o toast aparecia.
  const anterior = _palpitesCarregados;
  let houveMudanca = false;
  const mapaCompacto = {};

  for (const [gameId, p] of Object.entries(_palpitesLocais)) {
    if (p?.homeGoals === undefined || p?.awayGoals === undefined) continue;
    if (!jogoAceita(gameId)) continue;
    // Inclui no mapa compacto independente de mudança — é o estado completo
    mapaCompacto[gameId] = p.homeGoals + "-" + p.awayGoals;
    // Detecta mudança comparando com o snapshot inicial do Firestore
    const ant = anterior[gameId];
    if (!ant || ant.homeGoals !== p.homeGoals || ant.awayGoals !== p.awayGoals) {
      houveMudanca = true;
    }
  }

  if (houveMudanca) {
    // ── Garante que o doc pai existe antes de escrever na subcoleção ──
    const paiOk = await _garantirDocPaiExiste();
    if (!paiOk) {
      console.warn("[aposta] salvarTodosPalpites bloqueado: cadastro incompleto.");
      if (!silencioso) exibirToastAposta("❌ Erro: cadastro incompleto. Recarregue a página.", false);
      return;
    }

    // ── Novo formato: 1 documento compacto (1 write) ──────────────────────────
    mapaCompacto.token = _apostador.token || "";
    if (window.APP?.configStatus?.liberado_grupos === true) {
      mapaCompacto.especiais = _apostador.especiais || {};
    }

    const docRef = APP.db
      .collection("apostadores").doc(_apostador.id)
      .collection("dados").doc("palpites");
    try {
      await docRef.set(mapaCompacto, { merge: true });

      // Após save bem-sucedido, atualiza o snapshot de referência para que
      // a próxima edição na mesma sessão também seja detectada corretamente.
      _palpitesCarregados = JSON.parse(JSON.stringify(_palpitesLocais));

      // Mantém APP.palpites sincronizado (usado por outras partes do app).
      if (!APP.palpites[_apostador.id]) APP.palpites[_apostador.id] = {};
      Object.assign(APP.palpites[_apostador.id], _palpitesLocais);
    } catch (e) {
      console.error("[aposta] Erro ao salvar palpites no Firestore:", e);
      if (!silencioso) {
        exibirToastAposta("❌ Erro ao salvar: Fase encerrada ou sem permissão", false);
      }
      return;
    }
  }

  // Atualiza instantaneamente a tabela de progresso e pódio simulado na tela (custo zero de Reads!)
  atualizarMiniTabelasAposta();

  if (!silencioso) {
    exibirToastAposta("✓ Palpites salvos!", true);
  }
}

// ── MODELO: Especiais somente-leitura ──
function renderEspeciaisModeloReadOnly() {
  const modelo = window.getModelo ? window.getModelo() : null;
  const esp = modelo?.especiais || {};
  const cfgExtra = window.CONFIG?.pontuacao?.extras || {};
  const fases = [
    { key: "campeao", label: "🏆 Campeão", pts: (cfgExtra.primeiro_lugar || 0) + "pts" },
    { key: "vice", label: "🥈 Vice", pts: (cfgExtra.segundo_lugar || 0) + "pts" },
    { key: "terceiro", label: "🥉 3° Lugar", pts: (cfgExtra.terceiro_lugar || 0) + "pts" },
  ];

  let h = '<div class="card" style="margin-bottom:20px"><div class="card-titulo">⭐ Palpites Especiais — MODELO</div>';
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;justify-content:center">';
  for (const f of fases) {
    const val = esp[f.key] || "";
    const info = window.TEAMS_BY_CODE?.[val];
    h += '<div style="background:var(--fundo2);border-radius:var(--radius-sm);padding:10px">';
    h += '<div style="font-size:.78rem;font-weight:700;margin-bottom:6px">' + f.label +
      ' <span style="color:var(--dourado);font-size:.65rem">' + f.pts + '</span></div>';
    h += '<div style="display:flex;align-items:center;gap:6px">' + htmlBandeira(val, 24);
    h += '<span style="font-size:.7rem;font-weight:600">' + (info?.name || (val ? val : "Não definido")) + '</span></div>';
    h += '</div>';
  }
  h += '</div></div>';
  return h;
}

// ── MODELO: Funções de matriz ──
function _abrirMatrizModelo(gameId) {
  let ov = document.getElementById("modal-prog");
  let box = document.getElementById("modal-prog-body");

  if (!ov || !box) {
    ov = document.createElement("div");
    ov.id = "modal-prog";
    ov.className = "modal-overlay";
    ov.innerHTML = '<div class="modal-box" id="modal-prog-body"></div>';
    document.body.appendChild(ov);
    box = document.getElementById("modal-prog-body");
  }

  if (!ov._clickEv) {
    ov.addEventListener("click", e => {
      if (e.target === ov) {
        ov.classList.remove("aberto");
        document.body.style.overflow = "";
      }
    });
    ov._clickEv = true;
  }

  box.innerHTML = '<button class="modal-close" onclick="(function(){document.getElementById(\'modal-prog\').classList.remove(\'aberto\');document.body.style.overflow=\'\'})()">✕</button>' +
    _renderMatrizModelo(gameId);
  ov.classList.add("aberto");
  document.body.style.overflow = "hidden";
  _switchTabModelo("placares");
}

function _switchTabModelo(tab) {
  ["placares", "pontos"].forEach(t => {
    const c = document.getElementById("modal-mmod-" + t);
    const b = document.getElementById("mtab-mmod-" + t);
    if (c) c.style.display = t === tab ? "" : "none";
    if (b) b.classList.toggle("ativo", t === tab);
  });
}

function _renderMatrizModelo(gameId) {
  const jogo = window.SCHEDULE_BY_ID?.[gameId];
  const b = APP.bracket?.[jogo?.id] || {};
  const hC = b.home || jogo?.home;
  const aC = b.away || jogo?.away;
  const hName = window.TEAMS_BY_CODE?.[hC]?.name || hC || "?";
  const aName = window.TEAMS_BY_CODE?.[aC]?.name || aC || "?";

  let h = '';
  // Header
  h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">';
  h += htmlBandeira(hC, 22) + '<span style="font-weight:700">' + hName + '</span>';
  h += '<span style="color:var(--texto2);margin:0 4px">×</span>';
  h += '<span style="font-weight:700">' + aName + '</span>' + htmlBandeira(aC, 22);
  h += '</div>';

  // Abas
  h += '<div style="display:flex;gap:4px;margin-bottom:10px">';
  h += '<button id="mtab-mmod-placares" class="btn-toggle ativo" onclick="_switchTabModelo(\'placares\')" style="font-size:.7rem">📊 Matriz de Placares</button>';
  h += '<button id="mtab-mmod-pontos" class="btn-toggle" onclick="_switchTabModelo(\'pontos\')" style="font-size:.7rem">🎯 Pontos Esperados</button>';
  h += '</div>';

  h += '<div id="modal-mmod-placares">' + _renderMatrizPlacares(gameId, hC, aC, hName, aName) + '</div>';
  h += '<div id="modal-mmod-pontos" style="display:none">' + _renderMatrizPontos(gameId, hC, aC, hName, aName) + '</div>';
  return h;
}

function _renderMatrizPlacares(gameId, hC, aC, hName, aName) {
  const isNeutral = (() => {
    const j = window.SCHEDULE_BY_ID?.[gameId];
    return j ? (j.pais !== hC && j.pais !== aC) : true;
  })();
  const c = window.PROGNOSE?.calcular(hC, aC, isNeutral);
  if (!c || !c.matrix) return '<p style="text-align:center;padding:30px;color:var(--texto2)">Dados não disponíveis.</p>';

  const N = c.N;
  const all = c.matrix.flat().sort((a, b) => b - a);
  const top1 = all[0] || 1;

  let h = '<div style="font-size:.72rem;font-weight:700;color:var(--texto2);margin:10px 0 6px;text-align:center">Probabilidade Poisson por Placar</div>';
  h += '<div style="overflow-x:auto"><table class="matriz-poisson"><thead><tr><th></th>';
  for (let j = 0; j < N; j++) h += '<th>' + aName.substring(0, 3) + ' ' + (j === 6 ? "6+" : j) + '</th>';
  h += '</tr></thead><tbody>';

  for (let i = 0; i < N; i++) {
    h += '<tr><th>' + hName.substring(0, 3) + ' ' + (i === 6 ? "6+" : i) + '</th>';
    for (let j = 0; j < N; j++) {
      const v = c.matrix[i][j];
      const p = Math.max(0, Math.min(1, v / top1));
      const hue = 60 * (1 - p);
      const alpha = 0.1 + 0.6 * p;
      const bg = `hsla(${hue}, 100%, 50%, ${alpha})`;
      const fw = p > 0.8 ? '800' : (p > 0.4 ? '600' : '400');
      const color = p > 0.5 ? '#fff' : 'var(--texto2)';
      const border = i === j ? 'outline:1px solid rgba(255,255,255,0.2);outline-offset:-1px;' : '';
      const palModelo = _palpitesLocais[gameId];
      const ehPalpiteModelo = palModelo && palModelo.homeGoals === i && palModelo.awayGoals === j;
      const destaque = ehPalpiteModelo ? 'box-shadow:0 0 0 2px var(--dourado) inset;' : '';
      h += `<td style="background:${bg};color:${color};font-weight:${fw};${border}${destaque}">${(v * 100).toFixed(1)}%</td>`;
    }
    h += '</tr>';
  }
  h += '</tbody></table></div>';
  h += '<div style="font-size:.65rem;color:var(--texto2);text-align:center;margin-top:6px">🔲 = Palpite escolhido pelo MODELO</div>';
  return h;
}

function _renderMatrizPontos(gameId, hC, aC, hName, aName) {
  const isNeutral = (() => {
    const j = window.SCHEDULE_BY_ID?.[gameId];
    return j ? (j.pais !== hC && j.pais !== aC) : true;
  })();
  const c = window.PROGNOSE?.calcular(hC, aC, isNeutral);
  if (!c || !c.matrix) return '<p style="text-align:center;padding:30px;color:var(--texto2)">Dados não disponíveis.</p>';

  const N = c.N;
  const jogo = window.SCHEDULE_BY_ID?.[gameId];
  const faseReal = jogo?.fase || "grupos";

  const matrizPontos = [];
  let maxPts = 0;
  for (let h = 0; h < N; h++) {
    matrizPontos[h] = [];
    for (let a = 0; a < N; a++) {
      let esperado = 0;
      for (let rh = 0; rh < N; rh++) {
        for (let ra = 0; ra < N; ra++) {
          const pReal = c.matrix[rh][ra];
          if (pReal < 1e-9) continue;
          const brutos = window.calcularPontosBrutos({ homeGoals: h, awayGoals: a }, { homeGoals: rh, awayGoals: ra, foi_penaltis: false });
          const pts = window.aplicarFator(brutos.total_bruto, faseReal);
          esperado += pReal * pts;
        }
      }
      matrizPontos[h][a] = esperado;
      if (esperado > maxPts) maxPts = esperado;
    }
  }

  let h = '<div style="font-size:.72rem;font-weight:700;color:var(--texto2);margin:10px 0 6px;text-align:center">Pontos Esperados por Palpite (🔴 baixo → 🟢 alto)</div>';
  h += '<div style="overflow-x:auto"><table class="matriz-poisson"><thead><tr><th></th>';
  for (let j = 0; j < N; j++) h += '<th>' + aName.substring(0, 3) + ' ' + (j === 6 ? "6+" : j) + '</th>';
  h += '</tr></thead><tbody>';

  for (let i = 0; i < N; i++) {
    h += '<tr><th>' + hName.substring(0, 3) + ' ' + (i === 6 ? "6+" : i) + '</th>';
    for (let j = 0; j < N; j++) {
      const v = matrizPontos[i][j];
      const p = maxPts > 0 ? v / maxPts : 0;
      const hue = 120 * p;
      const alpha = 0.15 + 0.55 * p;
      const bg = `hsla(${hue}, 80%, 45%, ${alpha})`;
      const fw = p > 0.7 ? '800' : (p > 0.35 ? '600' : '400');
      const color = p > 0.5 ? '#fff' : 'var(--texto2)';
      const border = i === j ? 'outline:1px solid rgba(255,255,255,0.2);outline-offset:-1px;' : '';
      const palModelo = _palpitesLocais[gameId];
      const ehPalpiteModelo = palModelo && palModelo.homeGoals === i && palModelo.awayGoals === j;
      const destaque = ehPalpiteModelo ? 'box-shadow:0 0 0 2px var(--dourado) inset;' : '';
      h += `<td style="background:${bg};color:${color};font-weight:${fw};${border}${destaque}">${v.toFixed(1)}</td>`;
    }
    h += '</tr>';
  }
  h += '</tbody></table></div>';
  h += '<div style="font-size:.65rem;color:var(--texto2);text-align:center;margin-top:6px">Valores em pontos · 🔲 = Palpite escolhido pelo MODELO</div>';
  return h;
}
