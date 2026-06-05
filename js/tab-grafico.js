/** tab-grafico.js - Gráfico de barras e evolução dos apostadores */

const _EVOLUCAO_CORES = [
  '#4fc3f7', '#81c784', '#ffb74d', '#f06292', '#ce93d8',
  '#80cbc4', '#fff176', '#ff8a65', '#90caf9', '#a5d6a7'
];

/**
 * Retorna uma cor do espectro arco-íris para o índice i dentro de n barras.
 * Vai de dourado (1º) → verde → ciano → azul → roxo → vermelho/rosa (último).
 * Saturação e luminosidade fixas para ficar bonito no fundo escuro.
 */
function _rainbowColor(i, n) {
  if (n <= 1) return 'hsl(45,100%,60%)';
  // Hue: 45° (dourado) até 300° (magenta), passando pelo arco-íris
  const hue = Math.round(45 + (i / (n - 1)) * 255);
  return `hsl(${hue},90%,60%)`;
}

// Métricas disponíveis
const _METRICAS = [
  { id: 'pts',        label: 'Pontos' },
  { id: 'evolucao',   label: 'Evolução' },
  { id: 'chance',     label: 'Projeção' },
  { id: 'pct',        label: 'Pontos %' },
  { id: 'res',        label: 'Resultados' },
  { id: 'bonus1',     label: 'Bônus+1' },
  { id: 'placar',     label: 'Placar+3' },
  { id: 'placar_alto',label: 'Placar+5' },
];

window.renderGrafico = function() {
  const el = document.getElementById("aba-grafico");
  if (!el) return;
  const res = getResultados();
  const apos = APP.apostadores || [];
  const pals = APP.palpites || {};
  if (!apos.length) { el.innerHTML = '<div class="card"><p style="color:var(--texto2)">Nenhum apostador cadastrado.</p></div>'; return; }

  const metricaAtiva = window._graficoMetrica || "pts";

  // Ranking completo — base para cores consistentes e pct corrigido
  // Passa especiais oficiais para que pontos totais incluam campeão/vice/3º,
  // mantendo a ordem de cores consistente com a aba Classificação.
  const espOficiaisGraf = window.BRACKET.extrairEspeciaisOficiais(res, APP.bracket || {});
  
  let rankingCompleto = apos.map((a, idx) => {
    const st = calcularPontosApostador(pals[a.id]||{}, res, a, espOficiaisGraf);
    return {
      id: a.id,
      nome: (a.apelido || a.nome || "?").substring(0, 14),
      pts:         st.total,
      pct:         st.pct_pontos,
      res:         st.acertos_resultado,
      bonus1:      st.acertos_bonus1,
      placar:      st.acertos_placar_exato + st.acertos_placar_alto,
      placar_alto: st.acertos_placar_alto,
      isModelo: false,
    };
  }).sort((a,b) => b.pts - a.pts);

  // Inserir Modelo na posição correta
  const modeloGraf = window.getModelo ? window.getModelo() : null;
  if (modeloGraf && APP._modeloCarregado) {
    const stMod = calcularPontosApostador(APP.palpitesModelo || {}, res, modeloGraf, espOficiaisGraf);
    const itemMod = {
      id: "Modelo",
      nome: "Modelo",
      pts:         stMod.total,
      pct:         stMod.pct_pontos,
      res:         stMod.acertos_resultado,
      bonus1:      stMod.acertos_bonus1,
      placar:      stMod.acertos_placar_exato + stMod.acertos_placar_alto,
      placar_alto: stMod.acertos_placar_alto,
      isModelo: true,
    };
    const insertIdx = rankingCompleto.findIndex(a => a.pts < stMod.total);
    if (insertIdx === -1) rankingCompleto.push(itemMod);
    else rankingCompleto.splice(insertIdx, 0, itemMod);
  }

  // Inicializar filtro com todos os apostadores por padrão
  if (!window._graficoFiltroApos) {
    window._graficoFiltroApos = new Set(rankingCompleto.map(a => a.id));
  }

  // ── Toggle de métrica ──
  let h = '<div class="toggle-bar" style="margin-bottom:12px;flex-wrap:wrap;justify-content:center;gap:5px">';
  h += '<span class="toggle-label">Métrica:</span>';
  _METRICAS.forEach(m => {
    const ativo = metricaAtiva === m.id;
    const onclick = m.id === 'evolucao'
      ? 'onclick="_graficoIrEvolucao()"'
      : m.id === 'chance'
      ? 'onclick="_graficoIrProjecao()"'
      : `onclick="window._graficoMetrica='${m.id}';renderAbaAtiva()"`;
    h += `<button class="btn-toggle${ativo?' ativo':''}" ${onclick}>${m.label}</button>`;
  });
  h += '</div>';

  // ── Filtro dropdown estilo Excel ──
  h += _renderFiltroDropdown(rankingCompleto);

  if (metricaAtiva === "evolucao") {
    h += _renderEvolucao(res, pals, apos, rankingCompleto);
  } else if (metricaAtiva === "chance") {
    // Se já temos cache, exibir direto; senão mostrar spinner e calcular
    if (window._graficoChanceCache) {
      h += _renderChance(rankingCompleto, window._graficoChanceCache);
    } else {
      h += _renderChanceLoading();
    }
  } else {
    h += _renderBarras(rankingCompleto, metricaAtiva);
  }

  el.innerHTML = h;

  // Reabrir dropdown se estava aberto para não interromper a seleção do usuário
  if (window._graficoDropdownAberto) {
    const dd = document.getElementById('grafico-dropdown');
    if (dd) {
      dd.style.display = 'block';
      if (window._graficoDropdownScrollTop !== undefined) {
        dd.scrollTop = window._graficoDropdownScrollTop;
      }
    }
    
    // Configura o evento para fechar ao clicar fora, com pequeno timeout para não capturar o próprio clique
    setTimeout(() => {
      document.addEventListener('click', _graficoFecharDropdown, { once: true });
    }, 0);
    
    window._graficoDropdownAberto = false;
  } else {
    // Fechar dropdown ao clicar fora
    document.addEventListener('click', _graficoFecharDropdown, { once: true });
  }
};

// ── Dropdown filtro ────────────────────────────────────────────────────────
function _renderFiltroDropdown(rankingCompleto) {
  const filtro = window._graficoFiltroApos;
  const selecionados = rankingCompleto.filter(a => filtro.has(a.id));
  const label = selecionados.length === rankingCompleto.length
    ? 'Todos os apostadores'
    : selecionados.length === 0
    ? 'Nenhum selecionado'
    : selecionados.map(a => a.nome).join(', ');

  let h = `<div style="position:relative;margin-bottom:12px;z-index:50">`;

  // Botão que abre o dropdown
  h += `<button onclick="_graficoToggleDropdown(event)"
    style="width:100%;background:var(--fundo2);border:1.5px solid var(--borda2);border-radius:var(--radius-sm);
           padding:9px 14px;color:var(--texto);font-size:.82rem;font-weight:600;cursor:pointer;
           display:flex;align-items:center;justify-content:space-between;gap:8px;font-family:inherit;text-align:left">
    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">👤 ${label}</span>
    <span style="flex-shrink:0;color:var(--texto2);font-size:.7rem">▼</span>
  </button>`;

  // Painel dropdown
  h += `<div id="grafico-dropdown" onclick="event.stopPropagation()" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;
    background:var(--card);border:1.5px solid var(--borda2);border-radius:var(--radius-sm);
    box-shadow:0 8px 24px rgba(0,0,0,.5);max-height:260px;overflow-y:auto;z-index:100">`;

  // Opções: Todos / Nenhum
  h += `<div style="display:flex;gap:0;border-bottom:1px solid var(--borda)">`;
  h += `<button onclick="_graficoSelecionarTodos()" style="flex:1;padding:8px;font-size:.72rem;font-weight:700;background:none;border:none;border-right:1px solid var(--borda);color:var(--verde-light);cursor:pointer">✓ Todos</button>`;
  h += `<button onclick="_graficoSelecionarNenhum()" style="flex:1;padding:8px;font-size:.72rem;font-weight:700;background:none;border:none;color:var(--texto2);cursor:pointer">✕ Limpar</button>`;
  h += `</div>`;

  // Lista de apostadores (incluindo Modelo)
  rankingCompleto.forEach((a, i) => {
    const ativo = filtro.has(a.id);
    const cor = a.isModelo ? '#b8cfe8' : _EVOLUCAO_CORES[i % _EVOLUCAO_CORES.length];
    const nomeBadge = a.isModelo
      ? `<span style="font-weight:normal;color:#b8cfe8">${a.nome}</span>`
      : a.nome;
    h += `<label onclick="event.stopPropagation()" style="display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;border-bottom:1px solid var(--borda);transition:background .1s"
      onmouseover="this.style.background='rgba(255,255,255,.04)'" onmouseout="this.style.background=''">
      <input type="checkbox" ${ativo?'checked':''} onchange="window._graficoToggleApos('${a.id}')"
        style="width:16px;height:16px;accent-color:${cor};cursor:pointer;flex-shrink:0">
      <div style="width:10px;height:10px;border-radius:50%;background:${cor};flex-shrink:0"></div>
      <span style="font-size:.82rem;font-weight:600;color:var(--texto)">${nomeBadge}</span>
      <span style="margin-left:auto;font-size:.72rem;color:var(--texto2)">${a.pts} pts</span>
    </label>`;
  });

  h += `</div></div>`;
  return h;
}

window._graficoToggleDropdown = function(e) {
  e.stopPropagation();
  const dd = document.getElementById('grafico-dropdown');
  if (!dd) return;
  const aberto = dd.style.display !== 'none';
  dd.style.display = aberto ? 'none' : 'block';
  if (!aberto) {
    setTimeout(() => {
      document.addEventListener('click', _graficoFecharDropdown, { once: true });
    }, 0);
  }
};

window._graficoFecharDropdown = function() {
  const dd = document.getElementById('grafico-dropdown');
  if (dd) dd.style.display = 'none';
};

window._graficoToggleApos = function(id) {
  const dd = document.getElementById('grafico-dropdown');
  if (dd) {
    window._graficoDropdownScrollTop = dd.scrollTop;
  }
  if (!window._graficoFiltroApos) window._graficoFiltroApos = new Set();
  if (window._graficoFiltroApos.has(id)) {
    window._graficoFiltroApos.delete(id);
  } else {
    window._graficoFiltroApos.add(id);
  }
  window._graficoDropdownAberto = true;
  renderAbaAtiva();
};

window._graficoSelecionarTodos = function() {
  const dd = document.getElementById('grafico-dropdown');
  if (dd) {
    window._graficoDropdownScrollTop = dd.scrollTop;
  }
  const ids = (APP.apostadores||[]).map(a => a.id);
  if (APP.modelo || (window.getModelo && window.getModelo())) ids.push("Modelo");
  window._graficoFiltroApos = new Set(ids);
  window._graficoDropdownAberto = true;
  renderAbaAtiva();
};

window._graficoSelecionarNenhum = function() {
  const dd = document.getElementById('grafico-dropdown');
  if (dd) {
    window._graficoDropdownScrollTop = dd.scrollTop;
  }
  window._graficoFiltroApos = new Set();
  window._graficoDropdownAberto = true;
  renderAbaAtiva();
};

window._graficoIrEvolucao = function() {
  window._graficoMetrica = 'evolucao';
  renderAbaAtiva();
};

// ── Labels de valor por métrica ────────────────────────────────────────────
function _fmtVal(metricaAtiva, val, shortFmt = false) {
  if (metricaAtiva === 'pct') {
    return shortFmt ? Math.round(parseFloat(val)) + '%' : val + '%';
  }
  if (metricaAtiva === 'pts') {
    return shortFmt ? Math.round(val) : val.toFixed(1);
  }
  return String(val);
}

window._graficoIrProjecao = function() {
  window._graficoMetrica = 'chance';
  renderAbaAtiva();
  // Só rodar Monte Carlo se ainda não temos cache
  if (!window._graficoChanceCache) {
    setTimeout(_graficoRodarMonteCarlo, 0);
  }
};

// Alias legacy
window._graficoIrChance = window._graficoIrProjecao;

function _renderChanceLoading() {
  return `<div class="card" id="chance-loading" style="text-align:center;padding:40px 20px">
    <div style="font-size:2rem;margin-bottom:10px">⚡</div>
    <div style="font-size:.9rem;font-weight:700;color:var(--dourado)">Simulando 20.000 cenários…</div>
    <div style="font-size:.75rem;color:var(--texto2);margin-top:6px">Resolvendo o bracket fase a fase via Poisson</div>
  </div>`;
}

// ── Motor Monte Carlo ──────────────────────────────────────────────────────

/**
 * CDF plana (Float32Array) por par de times — computada uma vez por sessão.
 */
const _cdfsCacheFast = {};

function _getCdf(homeCode, awayCode, jogoInfo) {
  let hcObj = _cdfsCacheFast[homeCode];
  if (!hcObj) { hcObj = {}; _cdfsCacheFast[homeCode] = hcObj; }
  let entry = hcObj[awayCode];
  if (entry) return entry;
  
  const isNeutral = jogoInfo ? (jogoInfo.pais !== homeCode && jogoInfo.pais !== awayCode) : true;
  const prog = window.PROGNOSE.calcular(homeCode, awayCode, isNeutral);
  const N = prog.N;
  const flat = new Float32Array(N * N);
  let acc = 0;
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) { acc += prog.matrix[i][j]; flat[i * N + j] = acc; }
  entry = { cdf: flat, N };
  hcObj[awayCode] = entry;
  return entry;
}

/** Amostra (homeGoals, awayGoals) de CDF pré-computada — O(49). */
function _amostrar(cdfEntry) {
  const { cdf, N } = cdfEntry;
  const r = Math.random();
  for (let k = 0; k < cdf.length; k++)
    if (r <= cdf[k]) return { homeGoals: (k / N) | 0, awayGoals: k % N };
  return { homeGoals: N - 1, awayGoals: 0 };
}

// _pontosRapidoOt removida em favor de _pontosInteiros inline

function _graficoRodarMonteCarlo() {
  const N_ITER = 20000;
  const res      = getResultados();
  const apos     = APP.apostadores || [];
  const pals     = APP.palpites    || {};
  const schedule = window.SCHEDULE || [];
  const sById    = window.SCHEDULE_BY_ID || {};

  // Configurações e Fatores de Fase cacheados
  const cfgRaw = window.CONFIG && window.CONFIG.pontuacao;
  if (!cfgRaw) { _graficoExibirChance({}); return; }
  // Lookup tables de pontuação pré-multiplicadas por 10 (inteiros)
  const cfgOt = {
    limiar: cfgRaw.limiar_placar_alto || 4,
    pts_exatoAlto: {}, pts_exatoBaixo: {}, pts_diff: {}, pts_umTime: {}, pts_base: {}
  };
  const bExA = cfgRaw.bonus_placar_exato_alto || 0;
  const bExB = cfgRaw.bonus_placar_exato_baixo || 0;
  const bDif = cfgRaw.bonus_diferenca_gols || 0;
  const bUmT = cfgRaw.bonus_gols_um_time || 0;
  const base = cfgRaw.resultado_base || 0;

  const FASES = ['grupos', '32avos', 'oitavas', 'quartas', 'semis', 'terceiro', 'final'];
  for (const f of FASES) {
    const ft = cfgRaw.fatores_fase[f] || 1;
    cfgOt.pts_exatoAlto[f] = Math.round((base + bExA) * ft * 10);
    cfgOt.pts_exatoBaixo[f] = Math.round((base + bExB) * ft * 10);
    cfgOt.pts_diff[f] = Math.round((base + bDif) * ft * 10);
    cfgOt.pts_umTime[f] = Math.round((base + bUmT) * ft * 10);
    cfgOt.pts_base[f] = Math.round(base * ft * 10);
  }

  // Função super rápida e inlineável (retorna inteiros)
  function _pontosInteiros(palH, palA, resH, resA, c, f) {
    const resEf  = resH > resA ? 1 : resH < resA ? -1 : 0;
    const resPal = palH > palA ? 1 : palH < palA ? -1 : 0;
    if (resPal !== resEf) return 0;
    if (palH === resH && palA === resA) {
      return (resH + resA) >= c.limiar ? c.pts_exatoAlto[f] : c.pts_exatoBaixo[f];
    }
    const dPal = palH - palA, dRes = resH - resA;
    const absPal = dPal < 0 ? -dPal : dPal;
    const absRes = dRes < 0 ? -dRes : dRes;
    if (absPal === absRes) return c.pts_diff[f];
    if (palH === resH || palA === resA) return c.pts_umTime[f];
    return c.pts_base[f];
  }

  const todoParticipantes = [...apos];
  const modeloPart = window.getModelo ? window.getModelo() : null;
  if (modeloPart && APP._modeloCarregado) todoParticipantes.push(modeloPart);
  if (!todoParticipantes.length) { _graficoExibirChance({}); return; }

  const nPart  = todoParticipantes.length;
  const partIds = todoParticipantes.map(p => p.id || 'Modelo');

  // Pré-parse dos palpites para evitar Number() no loop
  const parsedPals = {};
  for (const pid of partIds) {
    parsedPals[pid] = {};
    const palP = pals[pid] || {};
    for (const [jid, pal] of Object.entries(palP)) {
      if (pal.homeGoals !== undefined) {
        parsedPals[pid][jid] = { h: Number(pal.homeGoals), a: Number(pal.awayGoals) };
      }
    }
  }


  const jogosPorFase = {};
  for (const f of FASES) jogosPorFase[f] = [];
  let temPendentes = false;
  for (const j of schedule) {
    const r = res[j.id];
    if (!r || r.homeGoals === undefined) {
      jogosPorFase[j.fase].push(j);
      temPendentes = true;
    }
  }

  const espOficiais = window.BRACKET.extrairEspeciaisOficiais(res, APP.bracket || {});
  const espJaOficializados = !!(espOficiais.campeao && espOficiais.vice && espOficiais.terceiro);

  const ptBase = new Int32Array(nPart);
  for (let pi = 0; pi < nPart; pi++) {
    const p   = todoParticipantes[pi];
    const pid = partIds[pi];
    const palP = parsedPals[pid];
    let acc = 0;
    for (const j of schedule) {
      const r = res[j.id];
      if (!r || r.homeGoals === undefined) continue;
      const pal = palP[j.id];
      if (!pal) continue;
      acc += _pontosInteiros(
        pal.h, pal.a,
        Number(r.homeGoals), Number(r.awayGoals),
        cfgOt, j.fase
      );
    }
    if (espOficiais.campeao || espOficiais.vice || espOficiais.terceiro)
      acc += Math.round(calcularPontosEspeciais(p, espOficiais.campeao, espOficiais.vice, espOficiais.terceiro).total_especiais * 10);
    ptBase[pi] = acc;
  }

  // Especiais base por participante (para subtrair antes de somar os simulados)
  const espBaseParticipante = new Int32Array(nPart);
  if (!espJaOficializados) {
    for (let pi = 0; pi < nPart; pi++) {
      const p = todoParticipantes[pi];
      if (espOficiais.campeao || espOficiais.vice || espOficiais.terceiro)
        espBaseParticipante[pi] = Math.round(calcularPontosEspeciais(p, espOficiais.campeao, espOficiais.vice, espOficiais.terceiro).total_especiais * 10);
    }
  }

  // ── Buffers reutilizáveis ──
  const vitorias = new Float64Array(nPart);
  const ptIter   = new Int32Array(nPart);

  // Verifica se todos os jogos de grupo já acabaram no mundo real
  const gruposFinished = (jogosPorFase['grupos'].length === 0);
  let classificadosBase = null;
  if (gruposFinished) {
    classificadosBase = window.BRACKET.calcularTodosOsGrupos(res).classificados;
  }

  // Pré-resolve bracket oficial para ter times nos jogos reais no resSim
  const bracketOficial = window.BRACKET.preencherBracket(res);
  const resSim = Object.assign({}, res);
  for (const j of schedule) {
    if (resSim[j.id] && bracketOficial[j.id]) {
      resSim[j.id].homeTeam = bracketOficial[j.id].home;
      resSim[j.id].awayTeam = bracketOficial[j.id].away;
    }
  }
  const palSim = {};

  // Resolver rápido O(1) sem slice/startsWith complexo
  function getTeamFast(pos, classificados) {
    if (classificados[pos]) return classificados[pos];
    if (pos[0] === 'W' || pos[0] === 'L') {
      const gId = pos.substring(1);
      const r = resSim[gId];
      if (!r || r.homeGoals === undefined || !r.homeTeam) return null;
      const isW = pos[0] === 'W';
      let hWon;
      if (r.foi_penaltis) hWon = r.penaltis_vencedor === 'home';
      else hWon = r.homeGoals > r.awayGoals;
      return (hWon === isW) ? r.homeTeam : r.awayTeam;
    }
    return pos;
  }

  // ── Loop Monte Carlo ──
  for (let iter = 0; iter < N_ITER; iter++) {
    
    let cachedClassificados = classificadosBase;

    // Passo 1: sortear resultados pendentes — UMA chamada ao bracket por fase
    for (const fase of FASES) {
      const jogos = jogosPorFase[fase];
      if (!jogos.length) continue;

      if (!cachedClassificados) {
        cachedClassificados = window.BRACKET.calcularTodosOsGrupos(resSim).classificados;
      }

      for (const jogo of jogos) {
        const hC = getTeamFast(jogo.home, cachedClassificados);
        const aC = getTeamFast(jogo.away, cachedClassificados);
        if (!hC || !aC) continue;

        const placar = _amostrar(_getCdf(hC, aC, sById[jogo.id]));
        let foi_penaltis = false, penaltis_vencedor = null;
        if (fase !== 'grupos' && placar.homeGoals === placar.awayGoals) {
          foi_penaltis = true;
          penaltis_vencedor = Math.random() < 0.5 ? 'home' : 'away';
        }
        resSim[jogo.id] = { homeTeam: hC, awayTeam: aC, homeGoals: placar.homeGoals, awayGoals: placar.awayGoals, foi_penaltis, penaltis_vencedor, _simulado: true };
      }

      // Se simulamos jogos da fase de grupos, o cache de classificados precisa ser refeito para as próximas fases
      if (fase === 'grupos') cachedClassificados = null;
    }

    // Passo 3: especiais simulados
    let espSim = espOficiais;
    if (!espJaOficializados) {
      const rFNL = resSim['FNL'], rTPL = resSim['TPL'];
      let campeao = espOficiais.campeao, vice = espOficiais.vice, terceiro = espOficiais.terceiro;
      if (!campeao && rFNL && rFNL.homeGoals !== undefined) {
        const hV = rFNL.foi_penaltis ? rFNL.penaltis_vencedor === 'home' : rFNL.homeGoals > rFNL.awayGoals;
        campeao = hV ? rFNL.homeTeam : rFNL.awayTeam;
        vice    = hV ? rFNL.awayTeam : rFNL.homeTeam;
      }
      if (!terceiro && rTPL && rTPL.homeGoals !== undefined) {
        const hV = rTPL.foi_penaltis ? rTPL.penaltis_vencedor === 'home' : rTPL.homeGoals > rTPL.awayGoals;
        terceiro = hV ? rTPL.homeTeam : rTPL.awayTeam;
      }
      espSim = { campeao, vice, terceiro };
    }

    // Passo 4: palpite simulado compartilhado para jogos sem aposta (1 roll/jogo)
    if (temPendentes) {
      if (!cachedClassificados) {
        cachedClassificados = window.BRACKET.calcularTodosOsGrupos(resSim).classificados;
      }
      for (const fase of FASES) {
        const jogos = jogosPorFase[fase];
        for (const jogo of jogos) {
          const hC = getTeamFast(jogo.home, cachedClassificados);
          const aC = getTeamFast(jogo.away, cachedClassificados);
          if (hC && aC) palSim[jogo.id] = _amostrar(_getCdf(hC, aC, sById[jogo.id]));
        }
      }
    }

    // Passo 5: pontos incrementais (só jogos pendentes) + especiais simulados
    for (let pi = 0; pi < nPart; pi++) {
      const p   = todoParticipantes[pi];
      const pid = partIds[pi];
      const palP = parsedPals[pid];
      let acc = ptBase[pi];

      if (temPendentes) {
        for (const fase of FASES) {
          const jogos = jogosPorFase[fase];
          for (const jogo of jogos) {
            const rSim = resSim[jogo.id];
            if (!rSim) continue;
            let p_h = 0, p_a = 0;
            const pal = palP[jogo.id];
            if (pal) {
              p_h = pal.h; p_a = pal.a;
            } else {
              const pS = palSim[jogo.id];
              if (!pS) continue;
              p_h = pS.homeGoals; p_a = pS.awayGoals;
            }
            acc += _pontosInteiros(
              p_h, p_a,
              rSim.homeGoals, rSim.awayGoals,
              cfgOt, jogo.fase
            );
          }
        }

        // Especiais: swap do parcial oficial → simulado
        if (!espJaOficializados) {
          acc -= espBaseParticipante[pi];
          if (espSim.campeao || espSim.vice || espSim.terceiro)
            acc += Math.round(calcularPontosEspeciais(p, espSim.campeao, espSim.vice, espSim.terceiro).total_especiais * 10);
        }
      }

      ptIter[pi] = acc;
    }

    // Registrar vencedor entre HUMANOS com divisão de empate
    let melhorPtsHumano = -Infinity;
    let vencedoresHumanos = [];
    for (let pi = 0; pi < nPart; pi++) {
      if (partIds[pi] === "MODELO") continue;
      if (ptIter[pi] > melhorPtsHumano) {
        melhorPtsHumano = ptIter[pi];
        vencedoresHumanos = [pi];
      } else if (ptIter[pi] === melhorPtsHumano) {
        vencedoresHumanos.push(pi);
      }
    }
    if (vencedoresHumanos.length > 0) {
      const frac = 1.0 / vencedoresHumanos.length;
      for (const idx of vencedoresHumanos) vitorias[idx] += frac;
    }

    // Calcular se o Modelo "venceria" o melhor humano
    const idxModelo = partIds.indexOf("MODELO");
    if (idxModelo !== -1) {
      const ptsModelo = ptIter[idxModelo];
      if (ptsModelo >= melhorPtsHumano) {
        vitorias[idxModelo] += 1;
      }
    }
  }

  const chances = {};
  for (let pi = 0; pi < nPart; pi++)
    chances[partIds[pi]] = parseFloat((vitorias[pi] / N_ITER * 100).toFixed(1));
  // Guardar cache para não recalcular ao voltar para a aba
  window._graficoChanceCache = chances;
  _graficoExibirChance(chances);
}

function _graficoExibirChance(chances) {
  // Rebuild rankingCompleto igual ao renderGrafico para cores consistentes
  const res = getResultados();
  const apos = APP.apostadores || [];
  const pals = APP.palpites || {};
  const espOficiaisGraf = window.BRACKET.extrairEspeciaisOficiais(res, APP.bracket || {});

  let rankingCompleto = apos.map((a, idx) => {
    const st = calcularPontosApostador(pals[a.id] || {}, res, a, espOficiaisGraf);
    return {
      id: a.id,
      nome: (a.apelido || a.nome || '?').substring(0, 14),
      pts: st.total,
      chance: chances[a.id] || 0,
      isModelo: false,
    };
  }).sort((a, b) => b.pts - a.pts);

  const modeloGraf = window.getModelo ? window.getModelo() : null;
  if (modeloGraf && APP._modeloCarregado) {
    const stMod = calcularPontosApostador(APP.palpitesModelo || {}, res, modeloGraf, espOficiaisGraf);
    const itemMod = {
      id: modeloGraf.id,           // usa o id real ('MODELO') para bater com o dict chances
      nome: 'Modelo',
      pts: stMod.total,
      chance: chances[modeloGraf.id] || 0,
      isModelo: true,
    };
    const insertIdx = rankingCompleto.findIndex(a => a.pts < stMod.total);
    if (insertIdx === -1) rankingCompleto.push(itemMod);
    else rankingCompleto.splice(insertIdx, 0, itemMod);
  }

  // Injetar resultado no container sem rerender tudo
  const el = document.getElementById('aba-grafico');
  if (!el) return;

  const loading = document.getElementById('chance-loading');
  if (loading) {
    loading.outerHTML = _renderChance(rankingCompleto, chances);
  }
}

function _renderChance(rankingCompleto, chances) {
  const filtro = window._graficoFiltroApos;
  let ranking = rankingCompleto.filter(a => filtro.has(a.id));
  if (!ranking.length) return '<div class="card" style="text-align:center;color:var(--texto2);padding:30px">Nenhum apostador selecionado.</div>';

  // Ordenação: 'rank' (por chance, default) ou 'az' (A-Z)
  const _chanceOrdem = window._graficoOrdem || 'rank';
  if (_chanceOrdem === 'az') {
    ranking = [...ranking].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  } else {
    ranking = [...ranking].sort((a, b) => (chances[b.id] || 0) - (chances[a.id] || 0));
  }

  const maxVal = Math.max(1, ...ranking.map(a => chances[a.id] || 0));

  const coresMap = {};
  rankingCompleto.forEach((a, i) => {
    coresMap[a.id] = a.isModelo ? '#b8cfe8' : _EVOLUCAO_CORES[i % _EVOLUCAO_CORES.length];
  });

  const n = ranking.length;
  const isMobile    = window.innerWidth <= 768;
  const isLandscape = window.innerWidth > window.innerHeight;

  let gap, barWidth, valFontSize, nameFontSize, needsScroll;

  if (isMobile && !isLandscape) {
    // ── PORTRAIT MOBILE: barras menores (~12 visíveis), scroll permitido ──
    const targetVisible = 12;
    const screenPx = window.innerWidth - 40;
    const targetColW = Math.floor(screenPx / targetVisible);
    barWidth     = Math.max(14, Math.min(24, targetColW - 2));
    gap          = 2;
    valFontSize  = '.64rem'; // menor pois XX.X% é mais largo
    nameFontSize = '.68rem';

    const minPx   = n * (barWidth + gap) + gap;
    needsScroll   = minPx > screenPx;
  } else {
    needsScroll = false;
    const margemPx     = isMobile ? 40 : 80;
    const disponivelPx = window.innerWidth - margemPx;
    const perColuna = disponivelPx / n;
    if (isMobile && isLandscape) {
      barWidth = Math.max(4, Math.floor(perColuna - 1));
    } else {
      if      (n <= 6)  barWidth = 36;
      else if (n <= 10) barWidth = 30;
      else if (n <= 15) barWidth = 24;
      else if (n <= 20) barWidth = 18;
      else if (n <= 28) barWidth = 14;
      else              barWidth = Math.max(6, Math.floor(perColuna - 1));
    }
    gap = Math.max(1, Math.floor(perColuna - barWidth));
    const fScale = (isMobile && isLandscape) ? 0.90 : 1.0;
    const fv = (base) => (base * fScale).toFixed(2) + 'rem';
    if      (n <= 8)  { valFontSize = fv(0.72); nameFontSize = fv(0.78); }
    else if (n <= 12) { valFontSize = fv(0.67); nameFontSize = fv(0.73); }
    else if (n <= 18) { valFontSize = fv(0.62); nameFontSize = fv(0.68); }
    else if (n <= 24) { valFontSize = fv(0.58); nameFontSize = fv(0.63); }
    else if (n <= 40) { valFontSize = fv(0.54); nameFontSize = fv(0.58); }
    else              { valFontSize = fv(0.50); nameFontSize = fv(0.54); }
  }

  const chartHeight = (isMobile && isLandscape) ? '180px' : '280px';
  const marginBot   = (isMobile && isLandscape) ? '65px' : '80px';
  const shortFmt    = isMobile && isLandscape;

  let h = '<div class="card" style="padding:20px 10px;">';

  // Cabeçalho com tooltip ao clicar
  const _tipText = "Probabilidade de terminar em 1.º ao final da Copa, estimada via 20.000 simulações Monte Carlo. Resultados oficiais são fixos; jogos futuros são sorteados pelo modelo Poisson, resolvendo o bracket fase a fase. Palpites não registrados são amostrados com a mesma distribuição do modelo.";
  h += `<div style="text-align:center;margin-bottom:14px;position:relative">
    <span id="proj-label" onclick="_toggleProjecaoTooltip(event)" style="cursor:pointer;font-size:.85rem;font-weight:700;color:var(--dourado);border-bottom:1px dashed var(--dourado);padding-bottom:1px">Chance de ganhar o bolão</span>
    <div id="proj-tooltip" style="display:none;position:absolute;top:calc(100% + 8px);left:50%;transform:translateX(-50%);background:#1e293b;color:#e2e8f0;font-size:.72rem;line-height:1.5;padding:10px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);max-width:280px;text-align:left;z-index:999;box-shadow:0 6px 20px rgba(0,0,0,0.5)">
      ${_tipText}
    </div>
  </div>`;

  let minWidthStyle = '';
  if (needsScroll) {
    const minPx = n * (barWidth + gap) + gap;
    h += `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">`;
    minWidthStyle = `min-width:${minPx}px;`;
  }

  h += `<div style="display:flex;align-items:flex-end;gap:${gap}px;height:${chartHeight};padding-bottom:10px;border-bottom:1px solid var(--borda);margin-bottom:${marginBot};position:relative;${minWidthStyle}">`;

  const rankingHumanosC = ranking.filter(a => !a.isModelo);
  for (const a of ranking) {
    if (a.isModelo) continue; // Modelo não tem chance calculada vs humanos — não exibir
    const val = chances[a.id] || 0;
    const perc = (val / maxVal) * 100;
    const cor = _rainbowColor(rankingHumanosC.indexOf(a), rankingHumanosC.length);
    const valFmt = shortFmt ? Math.round(val) + '%' : val.toFixed(1) + '%';
    h += `<div style="display:flex;flex-direction:column;align-items:center;flex:1;min-width:0;position:relative;height:100%;justify-content:flex-end;z-index:1">`;
    h += `<div style="font-size:${valFontSize};font-weight:800;color:var(--texto);margin-bottom:2px;white-space:nowrap">${valFmt}</div>`;
    h += `<div style="width:${barWidth}px;background:${cor};border-radius:4px 4px 0 0;height:${Math.max(2, perc)}%;transition:height 0.4s ease;box-shadow:0 -2px 10px ${cor}60"></div>`;
    h += `<div style="position:absolute;top:calc(100% + 8px);left:50%;writing-mode:vertical-rl;transform:rotate(180deg);font-size:${nameFontSize};color:var(--texto2);font-weight:600;white-space:nowrap">${a.nome}</div>`;
    h += '</div>';
  }

  h += '</div>';
  if (needsScroll) h += '</div>';
  h += `<div style="text-align:center;font-size:.65rem;color:var(--texto2);margin-top:6px">20.000 simulações · modelo Poisson Dixon-Coles</div>`;

  // ── Botões de ação: ordenação + exportar ──
  const _ordemC = window._graficoOrdem || 'rank';
  const _btnBaseC = 'background:var(--fundo2);border:1.5px solid var(--borda2);border-radius:var(--radius-sm);padding:8px 14px;color:var(--texto);font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit';
  const _btnAtivoC = 'background:var(--fundo2);border:1.5px solid var(--dourado);border-radius:var(--radius-sm);padding:8px 14px;color:var(--dourado);font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit';
  h += `<div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:12px;flex-wrap:wrap">`;
  h += `<div style="display:flex;gap:4px;background:rgba(255,255,255,0.04);border-radius:var(--radius-sm);padding:3px">`;
  h += `<button onclick="window._graficoOrdem='rank';renderAbaAtiva()" style="${_ordemC==='rank'?_btnAtivoC:_btnBaseC}">🏆 Classificação</button>`;
  h += `<button onclick="window._graficoOrdem='az';renderAbaAtiva()" style="${_ordemC==='az'?_btnAtivoC:_btnBaseC}">A → Z</button>`;
  h += `</div>`;
  h += `<button onclick="_graficoExportarJPG()" style="${_btnBaseC}">📷 Exportar JPG</button>`;
  h += `</div>`;
  h += '</div>';
  return h;
}

// Toggle do tooltip de Projeção
window._toggleProjecaoTooltip = function(e) {
  e.stopPropagation();
  const tip = document.getElementById('proj-tooltip');
  if (!tip) return;
  const visible = tip.style.display !== 'none';
  tip.style.display = visible ? 'none' : 'block';
  if (!visible) {
    // Fechar ao clicar fora
    setTimeout(() => {
      document.addEventListener('click', function _closeTip() {
        const t = document.getElementById('proj-tooltip');
        if (t) t.style.display = 'none';
        document.removeEventListener('click', _closeTip);
      });
    }, 0);
  }
};

// ── Gráfico de Barras ──────────────────────────────────────────────────────
function _renderBarras(rankingCompleto, metricaAtiva) {
  const filtro = window._graficoFiltroApos;
  let ranking = rankingCompleto.filter(a => filtro.has(a.id));
  if (!ranking.length) return '<div class="card" style="text-align:center;color:var(--texto2);padding:30px">Nenhum apostador selecionado.</div>';

  // Ordenação: 'rank' (por valor, default) ou 'az' (A-Z)
  const ordemAtiva = window._graficoOrdem || 'rank';
  if (ordemAtiva === 'az') {
    ranking = [...ranking].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  } else {
    ranking = [...ranking].sort((a,b) => b[metricaAtiva] - a[metricaAtiva]);
  }

  const maxVal = Math.max(1, ...ranking.map(a => a[metricaAtiva]));

  const coresMap = {};
  rankingCompleto.forEach((a, i) => {
    coresMap[a.id] = a.isModelo ? '#b8cfe8' : _EVOLUCAO_CORES[i % _EVOLUCAO_CORES.length];
  });

  // ── IC: média ± 1σ para bigodeira de referência ──
  const vals = ranking.map(a => a[metricaAtiva]);
  const mean = vals.reduce((s, v) => s + v, 0) / (vals.length || 1);
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (vals.length || 1);
  const sigma = Math.sqrt(variance);
  const ciLow  = Math.max(0, mean - sigma);
  const ciHigh = mean + sigma;

  // ── Dimensões responsivas ──
  const n = ranking.length;
  const isMobile    = window.innerWidth <= 768;
  const isLandscape = window.innerWidth > window.innerHeight;

  // Três modos:
  //  1. PORTRAIT MOBILE  → barras menores (~12 visíveis), scroll se necessário
  //  2. LANDSCAPE MOBILE → sem scroll, barra ocupa espaço disponível, 70 apostadores
  //  3. DESKTOP          → sem scroll, gap comprimido antes do barWidth

  let gap, barWidth, valFontSize, nameFontSize, needsScroll;

  if (isMobile && !isLandscape) {
    // ── PORTRAIT MOBILE: barras menores para ~12 visíveis, scroll permitido ──
    // Alvo: ~12 barras visíveis em ~360px úteis → ~28px por coluna
    const targetVisible = 12;
    const screenPx = window.innerWidth - 40;
    const targetColW = Math.floor(screenPx / targetVisible);
    barWidth     = Math.max(14, Math.min(24, targetColW - 2));
    gap          = 2; // gap mínimo — barras quase encostadas
    valFontSize  = '.68rem';
    nameFontSize = '.70rem';

    const minPx   = n * (barWidth + gap) + gap;
    needsScroll   = minPx > screenPx;

  } else {
    // ── LANDSCAPE MOBILE + DESKTOP: tudo numa tela, sem scroll ──
    needsScroll = false;

    const margemPx     = isMobile ? 40 : 80;
    const disponivelPx = window.innerWidth - margemPx;

    // gap mínimo de 1px — barras quase encostadas para caber 70 apostadores
    // barWidth = (disponível / n) - 1, com piso por legibilidade
    const perColuna = disponivelPx / n;
    if (isMobile && isLandscape) {
      barWidth = Math.max(4, Math.floor(perColuna - 1));
    } else {
      // Desktop: barras um pouco maiores, mas comprimem se necessário
      if      (n <= 6)  barWidth = 36;
      else if (n <= 10) barWidth = 30;
      else if (n <= 15) barWidth = 24;
      else if (n <= 20) barWidth = 18;
      else if (n <= 28) barWidth = 14;
      else              barWidth = Math.max(6, Math.floor(perColuna - 1));
    }

    gap = Math.max(1, Math.floor(perColuna - barWidth));

    // Fontes adaptativas
    const fScale = (isMobile && isLandscape) ? 0.90 : 1.0;
    const fv = (base) => (base * fScale).toFixed(2) + 'rem';

    if      (n <= 8)  { valFontSize = fv(0.78); nameFontSize = fv(0.80); }
    else if (n <= 12) { valFontSize = fv(0.73); nameFontSize = fv(0.75); }
    else if (n <= 18) { valFontSize = fv(0.68); nameFontSize = fv(0.70); }
    else if (n <= 24) { valFontSize = fv(0.64); nameFontSize = fv(0.66); }
    else if (n <= 40) { valFontSize = fv(0.58); nameFontSize = fv(0.60); }
    else              { valFontSize = fv(0.52); nameFontSize = fv(0.54); }
  }

  // ── Monta o HTML ──
  let h = '<div class="card" style="padding:20px 10px;">';

  // Wrapper com scroll apenas em portrait mobile quando necessário
  let minWidthStyle = '';
  if (needsScroll) {
    const minPx = n * (barWidth + gap) + gap;
    h += `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">`;
    minWidthStyle = `min-width:${minPx}px;`;
  }

  const chartHeight = (isMobile && isLandscape) ? '180px' : '280px';
  const marginBot   = (isMobile && isLandscape) ? '65px' : '80px';
  const shortFmt    = isMobile && isLandscape;

  // Posições IC em percentual do container (invertido: 0% = topo, 100% = base)
  // chartHeight em px para cálculo das linhas IC overlay
  const chartHeightPx = (isMobile && isLandscape) ? 180 : 280;
  const ciHighPerc = Math.max(0, Math.min(100, (1 - ciHigh / maxVal) * 100));
  const ciLowPerc  = Math.max(0, Math.min(100, (1 - ciLow  / maxVal) * 100));
  const meanPerc   = Math.max(0, Math.min(100, (1 - mean   / maxVal) * 100));
  // Mostrar IC apenas quando há variância significativa (σ > 5% da média)
  const showCI = sigma > 0.05 * mean && ranking.length >= 3;

  h += `<div style="display:flex;align-items:flex-end;gap:${gap}px;height:${chartHeight};padding-bottom:10px;border-bottom:1px solid var(--borda);margin-bottom:${marginBot};position:relative;${minWidthStyle}">`;

  // ── Overlay IC (bigodeira horizontal discreta) ──
  if (showCI) {
    // Faixa ±1σ — fundo levíssimo
    h += `<div style="position:absolute;left:0;right:0;top:${ciHighPerc.toFixed(1)}%;bottom:${(100 - ciLowPerc).toFixed(1)}%;background:rgba(255,255,255,0.03);pointer-events:none;z-index:0"></div>`;
    // Linha da média — tracejada, muito sutil
    h += `<div style="position:absolute;left:0;right:0;top:${meanPerc.toFixed(1)}%;height:1px;background:rgba(255,255,255,0.18);pointer-events:none;z-index:0" title="Média: ${_fmtVal(metricaAtiva, parseFloat(mean.toFixed(1)), false)}"></div>`;
    // Linha superior IC (+1σ)
    h += `<div style="position:absolute;left:0;right:0;top:${ciHighPerc.toFixed(1)}%;height:1px;border-top:1px dashed rgba(255,255,255,0.10);pointer-events:none;z-index:0"></div>`;
    // Linha inferior IC (−1σ)
    h += `<div style="position:absolute;left:0;right:0;top:${ciLowPerc.toFixed(1)}%;height:1px;border-top:1px dashed rgba(255,255,255,0.10);pointer-events:none;z-index:0"></div>`;
  }

  // Índice arco-íris apenas entre apostadores não-Modelo (ordem no ranking filtrado)
  const rankingHumanos = ranking.filter(a => !a.isModelo);
  for (const a of ranking) {
    const val = a[metricaAtiva];
    const perc = (val / maxVal) * 100;
    const cor = a.isModelo ? '#b8cfe8' : _rainbowColor(rankingHumanos.indexOf(a), rankingHumanos.length);
    const nomeBarra = a.isModelo
      ? `<span style='font-weight:normal;color:#b8cfe8'>${a.nome}</span>`
      : a.nome;
    h += `<div style="display:flex;flex-direction:column;align-items:center;flex:1;min-width:0;position:relative;height:100%;justify-content:flex-end;z-index:1">`;
    h += `<div style="font-size:${valFontSize};font-weight:800;color:var(--texto);margin-bottom:4px;white-space:nowrap">${_fmtVal(metricaAtiva, val, shortFmt)}</div>`;
    h += `<div style="width:${barWidth}px;background:${cor};border-radius:4px 4px 0 0;height:${Math.max(2,perc)}%;transition:height 0.4s ease;box-shadow:0 -2px 10px ${cor}60"></div>`;
    h += `<div style="position:absolute;top:calc(100% + 8px);left:50%;writing-mode:vertical-rl;transform:rotate(180deg);font-size:${nameFontSize};color:var(--texto2);font-weight:600;white-space:nowrap">${nomeBarra}</div>`;
    h += '</div>';
  }

  h += '</div>';
  if (needsScroll) h += '</div>'; // fecha wrapper scroll

  // ── Botões de ação: ordenação + exportar ──
  const btnBase = 'background:var(--fundo2);border:1.5px solid var(--borda2);border-radius:var(--radius-sm);padding:8px 14px;color:var(--texto);font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit';
  const btnAtivo = 'background:var(--fundo2);border:1.5px solid var(--dourado);border-radius:var(--radius-sm);padding:8px 14px;color:var(--dourado);font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit';
  h += `<div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:12px;flex-wrap:wrap">`;
  h += `<div style="display:flex;gap:4px;background:rgba(255,255,255,0.04);border-radius:var(--radius-sm);padding:3px">`;
  h += `<button onclick="window._graficoOrdem='rank';renderAbaAtiva()" style="${ordemAtiva==='rank'?btnAtivo:btnBase}">🏆 Classificação</button>`;
  h += `<button onclick="window._graficoOrdem='az';renderAbaAtiva()" style="${ordemAtiva==='az'?btnAtivo:btnBase}">A → Z</button>`;
  h += `</div>`;
  h += `<button onclick="_graficoExportarJPG()" style="${btnBase}">📷 Exportar JPG</button>`;
  h += `</div>`;
  h += '</div>';
  return h;
}

// ── Gráfico de Evolução ────────────────────────────────────────────────────
function _renderEvolucao(res, pals, apos, rankingCompleto) {
  const filtro = window._graficoFiltroApos;
  const aposFiltrados = apos.filter(a => filtro.has(a.id));
  if (!aposFiltrados.length && !filtro.has("Modelo")) return '<div class="card" style="text-align:center;color:var(--texto2);padding:30px">Nenhum apostador selecionado.</div>';

  const jogosComRes = (window.SCHEDULE || [])
    .filter(j => res[j.id] && res[j.id].homeGoals !== undefined)
    .sort((a, b) => new Date(a.utc) - new Date(b.utc));

  const espOficiais = window.BRACKET.extrairEspeciaisOficiais(res, APP.bracket || {});
  const temEspeciais = !!(espOficiais.campeao || espOficiais.vice || espOficiais.terceiro);

  if (!jogosComRes.length && !temEspeciais)
    return '<div class="card" style="text-align:center;color:var(--texto2);padding:30px">Nenhum resultado oficial ainda.</div>';

  const series = aposFiltrados.map(a => {
    const idxGlobal = rankingCompleto.findIndex(r => r.id === a.id);
    const cor = _EVOLUCAO_CORES[idxGlobal % _EVOLUCAO_CORES.length];
    const pal = pals[a.id] || {};
    let acumulado = 0;
    const pontos = [0];
    jogosComRes.forEach(j => {
      const p = pal[j.id];
      const r = res[j.id];
      if (p && r && p.homeGoals !== undefined) {
        const br = calcularPontosBrutos(p, r);
        acumulado += aplicarFator(br.total_bruto, j.fase);
      }
      pontos.push(parseFloat(acumulado.toFixed(1)));
    });

    if (temEspeciais) {
      const { total_especiais } = calcularPontosEspeciais(a, espOficiais.campeao, espOficiais.vice, espOficiais.terceiro);
      acumulado += total_especiais;
      pontos.push(parseFloat(acumulado.toFixed(1)));
    }

    return { nome: (a.apelido || a.nome || "?").substring(0, 14), cor, pontos };
  });

  // Inserir Modelo se selecionado
  const modeloGrafEv = window.getModelo ? window.getModelo() : null;
  if (modeloGrafEv && filtro.has("Modelo") && APP._modeloCarregado) {
    const idxMod = rankingCompleto.findIndex(r => r.id === "Modelo");
    const corMod = idxMod >= 0 ? _EVOLUCAO_CORES[idxMod % _EVOLUCAO_CORES.length] : '#b8cfe8';
    const palMod = APP.palpitesModelo || {};
    let acumuladoMod = 0;
    const pontosMod = [0];
    jogosComRes.forEach(j => {
      const p = palMod[j.id];
      const r = res[j.id];
      if (p && r && p.homeGoals !== undefined) {
        const br = calcularPontosBrutos(p, r);
        acumuladoMod += aplicarFator(br.total_bruto, j.fase);
      }
      pontosMod.push(parseFloat(acumuladoMod.toFixed(1)));
    });
    if (temEspeciais) {
      const { total_especiais } = calcularPontosEspeciais(modeloGrafEv, espOficiais.campeao, espOficiais.vice, espOficiais.terceiro);
      acumuladoMod += total_especiais;
      pontosMod.push(parseFloat(acumuladoMod.toFixed(1)));
    }
    series.push({ nome: "Modelo", cor: corMod, pontos: pontosMod, isModelo: true });
  }

  if (!series.length)
    return '<div class="card" style="text-align:center;color:var(--texto2);padding:30px">Nenhum apostador selecionado.</div>';

  const isDesktop = window.innerWidth > 850;
  const W = isDesktop ? Math.max(800, Math.min(window.innerWidth - 60, 1400)) : 600;
  const H = isDesktop ? 340 : 280;
  const PAD = { top: 20, right: 100, bottom: 40, left: 48 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const nMatches = jogosComRes.length;
  const nPoints = Math.max(...series.map(s => s.pontos.length), 2);
  const maxPts = Math.max(1, ...series.map(s => Math.max(...s.pontos, 0)));

  // i vai de 0 a nMatches (ou mais, caso existam especiais)
  function xPos(i) { return PAD.left + (i / (nPoints - 1)) * chartW; }
  function yPos(v) { return PAD.top + chartH - (v / maxPts) * chartH; }

  let svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;display:block;margin:0 auto;overflow:visible">`;

  for (let i = 0; i <= 4; i++) {
    const v = (maxPts / 4) * i;
    const y = yPos(v);
    svg += `<line x1="${PAD.left}" y1="${y.toFixed(1)}" x2="${PAD.left+chartW}" y2="${y.toFixed(1)}" stroke="var(--borda)" stroke-width="1" stroke-dasharray="4,4"/>`;
    svg += `<text x="${PAD.left-6}" y="${(y+4).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--texto2)">${v.toFixed(0)}</text>`;
  }

  const step = Math.max(1, Math.floor(nMatches / 8));
  // Começamos em i=1 para pular o rótulo do ponto zero e mostrar J1, J2...
  for (let i = 1; i <= nMatches; i += step) {
    const x = xPos(i).toFixed(1);
    svg += `<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${PAD.top+chartH}" stroke="var(--borda)" stroke-width="1" opacity="0.4"/>`;
    svg += `<text x="${x}" y="${PAD.top+chartH+14}" text-anchor="middle" font-size="10" fill="var(--texto2)">J${i}</text>`;
  }
  // Garantir que o último rótulo do jogo apareça se o step pulá-lo
  if (nMatches > 0 && nMatches % step !== 0) {
    const x = xPos(nMatches).toFixed(1);
    svg += `<text x="${x}" y="${PAD.top+chartH+14}" text-anchor="middle" font-size="10" fill="var(--texto2)">J${nMatches}</text>`;
  }

  for (const s of series) {
    if (!s.pontos.length) continue;
    const pts = s.pontos.map((v, i) => `${xPos(i).toFixed(1)},${yPos(v).toFixed(1)}`).join(' ');
    const dash = s.isModelo ? ' stroke-dasharray="6,3"' : '';
    const sw = s.isModelo ? '3' : '2.5';
    svg += `<polyline points="${pts}" fill="none" stroke="${s.cor}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"${dash}/>`;
    const lastIdx = s.pontos.length - 1;
    const lastX = xPos(lastIdx);
    const lastY = yPos(s.pontos[lastIdx]);
    svg += `<circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="4" fill="${s.cor}" stroke="var(--fundo)" stroke-width="1.5"/>`;
    const fw = s.isModelo ? "normal" : "700";
    svg += `<text x="${(lastX+8).toFixed(1)}" y="${(lastY+4).toFixed(1)}" font-size="10" font-weight="${fw}" fill="${s.cor}">${s.nome}</text>`;
  }

  svg += '</svg>';

  let legenda = '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;justify-content:center">';
  for (const s of series) {
    const ultimo = s.pontos[s.pontos.length-1] ?? 0;
    legenda += `<div style="display:flex;align-items:center;gap:5px;font-size:.72rem;font-weight:600;color:var(--texto)">
      <div style="width:20px;height:3px;background:${s.cor};border-radius:2px"></div>
      ${s.nome} <span style="color:var(--texto2);font-weight:400">${ultimo} pts</span>
    </div>`;
  }
  legenda += '</div>';

  return `<div class="card" style="padding:16px;overflow-x:auto">${svg}${legenda}</div>`;
}

// ── Exportar JPG ───────────────────────────────────────────────────────────
/**
 * Gera um JPG com TODOS os apostadores (ignorando filtro) em formato paisagem,
 * sem cortes, pronto para compartilhar ou imprimir.
 * Usa Canvas 2D puro — sem dependências externas.
 */
window._graficoExportarJPG = function() {
  const res    = getResultados();
  const apos   = APP.apostadores || [];
  const pals   = APP.palpites || {};
  const metricaAtiva = window._graficoMetrica || 'pts';

  // Não exportar evolução como barras
  if (metricaAtiva === 'evolucao') {
    alert('Exportação disponível para métricas de barra. Selecione uma métrica como Pontos, Projeção, etc.');
    return;
  }

  const espOficiaisGraf = window.BRACKET.extrairEspeciaisOficiais(res, APP.bracket || {});

  // Montar ranking completo (todos, sem filtro)
  let rankingExp = apos.map((a, idx) => {
    const st = calcularPontosApostador(pals[a.id] || {}, res, a, espOficiaisGraf);
    return {
      id: a.id,
      nome: (a.apelido || a.nome || '?').substring(0, 14),
      pts:         st.total,
      pct:         st.pct_pontos,
      res:         st.acertos_resultado,
      bonus1:      st.acertos_bonus1,
      placar:      st.acertos_placar_exato + st.acertos_placar_alto,
      placar_alto: st.acertos_placar_alto,
      isModelo: false,
    };
  });

  if (metricaAtiva === 'chance') {
    const chances = window._graficoChanceCache || {};
    rankingExp.forEach(a => { a.chance = chances[a.id] || 0; });
    rankingExp = rankingExp.sort((a, b) => b.chance - a.chance);
  } else {
    rankingExp = rankingExp.sort((a, b) => b[metricaAtiva] - a[metricaAtiva]);
  }

  // Remover Modelo (não aparece na exportação conforme item 6)
  rankingExp = rankingExp.filter(a => !a.isModelo);

  const n = rankingExp.length;
  if (!n) { alert('Nenhum apostador para exportar.'); return; }

  // ── Dimensões do canvas (paisagem fixa) ──
  const PADDING_LEFT   = 20;
  const PADDING_RIGHT  = 20;
  const PADDING_TOP    = 60;  // espaço para título
  const PADDING_BOTTOM = 120; // espaço para nomes verticais
  const CHART_HEIGHT   = 260;
  const BAR_WIDTH      = Math.max(6, Math.min(28, Math.floor((Math.max(900, n * 14 + 40) - PADDING_LEFT - PADDING_RIGHT) / n - 1)));
  const GAP            = Math.max(1, Math.floor(4));
  const TOTAL_W        = Math.max(900, n * (BAR_WIDTH + GAP) + GAP + PADDING_LEFT + PADDING_RIGHT);
  const TOTAL_H        = PADDING_TOP + CHART_HEIGHT + PADDING_BOTTOM;

  const canvas  = document.createElement('canvas');
  const DPR     = 2; // alta resolução
  canvas.width  = TOTAL_W  * DPR;
  canvas.height = TOTAL_H  * DPR;
  canvas.style.width  = TOTAL_W  + 'px';
  canvas.style.height = TOTAL_H  + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);

  // Fundo escuro
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, TOTAL_W, TOTAL_H);

  // Título
  const metricaLabel = { pts: 'Pontos', pct: 'Pontos %', res: 'Resultados', bonus1: 'Bônus+1', placar: 'Placar+3', placar_alto: 'Placar+5', chance: 'Projeção (chance de ganhar)' }[metricaAtiva] || metricaAtiva;
  ctx.fillStyle = '#f1f5f9';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`Bolão Copa 2026 · ${metricaLabel}`, TOTAL_W / 2, 28);

  const vals = rankingExp.map(a => metricaAtiva === 'chance' ? (a.chance || 0) : a[metricaAtiva]);
  const maxVal = Math.max(1, ...vals);

  const CHART_BOTTOM = PADDING_TOP + CHART_HEIGHT;

  // Linha base
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PADDING_LEFT, CHART_BOTTOM);
  ctx.lineTo(TOTAL_W - PADDING_RIGHT, CHART_BOTTOM);
  ctx.stroke();

  // Barras e labels
  rankingExp.forEach((a, i) => {
    const val   = vals[i];
    const perc  = val / maxVal;
    const barH  = Math.max(2, Math.floor(perc * CHART_HEIGHT));
    const x     = PADDING_LEFT + i * (BAR_WIDTH + GAP) + GAP;
    const y     = CHART_BOTTOM - barH;
    const cor   = _rainbowColor(i, n);

    // Barra
    ctx.fillStyle = cor;
    ctx.beginPath();
    ctx.roundRect
      ? ctx.roundRect(x, y, BAR_WIDTH, barH, [3, 3, 0, 0])
      : ctx.rect(x, y, BAR_WIDTH, barH);
    ctx.fill();

    // Valor acima da barra
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const valLabel = metricaAtiva === 'pct'
      ? val + '%'
      : metricaAtiva === 'chance'
      ? val.toFixed(1) + '%'
      : metricaAtiva === 'pts'
      ? val.toFixed(1)
      : String(val);
    ctx.fillText(valLabel, x + BAR_WIDTH / 2, y - 4);

    // Nome vertical abaixo
    ctx.save();
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.translate(x + BAR_WIDTH / 2 + 4, CHART_BOTTOM + 8);
    ctx.rotate(Math.PI / 2); // texto de baixo pra cima
    ctx.fillText(a.nome, 0, 0);
    ctx.restore();
  });

  // Download
  const link = document.createElement('a');
  link.download = `bolao-copa-2026-${metricaAtiva}.jpg`;
  link.href = canvas.toDataURL('image/jpeg', 0.92);
  link.click();
};
