/** tab-grafico.js - Gráfico de barras e evolução dos apostadores */

const _EVOLUCAO_CORES_DISTINTAS = [
  '#ff5252', '#4fc3f7', '#69f0ae', '#ffb74d', '#e040fb',
  '#ffff00', '#8c9eff', '#1de9b6', '#f48fb1', '#cddc39',
  '#ffab40', '#bcaaa4', '#90caf9', '#a5d6a7', '#ce93d8'
];

/**
 * Interpola entre stops RGB [[r,g,b], ...] para o índice i de n itens.
 */
function _interpStops(stops, i, n) {
  if (n <= 1) { const m = stops[Math.floor(stops.length / 2)]; return `rgb(${m[0]},${m[1]},${m[2]})`; }
  const t = i / (n - 1);
  const pos = t * (stops.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, stops.length - 1);
  const frac = pos - lo;
  const r = Math.round(stops[lo][0] + (stops[hi][0] - stops[lo][0]) * frac);
  const g = Math.round(stops[lo][1] + (stops[hi][1] - stops[lo][1]) * frac);
  const b = Math.round(stops[lo][2] + (stops[hi][2] - stops[lo][2]) * frac);
  return `rgb(${r},${g},${b})`;
}

const _PALETAS = {
  rainbow: {
    label: 'Rainbow',
    fn: (i, n) => {
      if (n <= 1) return 'hsl(0,90%,60%)';
      const hue = Math.round((i / (n - 1)) * 280);
      return `hsl(${hue},90%,60%)`;
    }
  },
  termo: {
    label: 'Termo',
    fn: (i, n) => {
      // Escala termográfica clássica: preto → azul → magenta → vermelho → amarelo → branco
      const stops = [
        [0,0,0], [0,0,140], [0,0,255], [128,0,255], [200,0,200],
        [255,0,100], [255,0,0], [255,100,0], [255,180,0], [255,255,0],
        [255,255,128], [255,255,255]
      ];
      return _interpStops(stops, i, n);
    }
  },
  pb: {
    label: 'P&B',
    fn: (i, n) => {
      if (n <= 1) return 'rgb(200,200,200)';
      // Branco → cinza escuro (mín ~80 para contraste com fundo escuro)
      const v = 240 - Math.round((i / (n - 1)) * 160);
      return `rgb(${v},${v},${v})`;
    }
  },
  neon: {
    label: 'Neon',
    fn: (i, n) => {
      const neons = [
        '#ff00ff', '#00ffff', '#ff3366', '#39ff14', '#ff6600',
        '#bf00ff', '#00ff7f', '#ff0099', '#33ccff', '#ffff00',
        '#ff4444', '#00ffcc', '#cc66ff', '#66ff33', '#ff6699',
        '#3399ff', '#ff3300', '#00ff44', '#cc00ff', '#ffcc00'
      ];
      return neons[i % neons.length];
    }
  },
  oceano: {
    label: 'Oceano',
    fn: (i, n) => {
      const cores = [
        '#0d47a1', '#1565c0', '#0288d1', '#0097a7', '#00838f',
        '#00695c', '#26a69a', '#4db6ac', '#4fc3f7', '#00bcd4',
        '#1e88e5', '#039be5', '#0277bd', '#00acc1', '#26c6da',
        '#00897b', '#80cbc4', '#4dd0e1', '#29b6f6', '#0d47a1'
      ];
      return cores[i % cores.length];
    }
  },
  pastel: {
    label: 'Pastel',
    fn: (i, n) => {
      if (n <= 1) return 'hsl(0,70%,78%)';
      const hue = Math.round((i / (n - 1)) * 330);
      return `hsl(${hue},65%,76%)`;
    }
  },
  terra: {
    label: 'Terra',
    fn: (i, n) => {
      const cores = [
        '#c17817', '#6d4c41', '#a0522d', '#2e7d32', '#cd853f',
        '#558b2f', '#795548', '#daa520', '#4e342e', '#8bc34a',
        '#a1887f', '#d2691e', '#33691e', '#bf360c', '#827717',
        '#3e2723', '#9e9d24', '#ff8f00', '#4a148c', '#1b5e20'
      ];
      return cores[i % cores.length];
    }
  },
  viridis: {
    label: 'Viridis',
    fn: (i, n) => {
      // Matplotlib/MATLAB: roxo escuro → azul → verde-azulado → verde → amarelo
      const stops = [
        [68,1,84], [72,36,117], [65,68,135], [53,95,141], [42,120,142],
        [33,145,140], [34,168,132], [68,191,112], [122,209,81], [189,223,38],
        [253,231,37]
      ];
      return _interpStops(stops, i, n);
    }
  },
  turbo: {
    label: 'Turbo',
    fn: (i, n) => {
      // Google Turbo: máximo de cores distintas, percorrendo todo o espectro
      const stops = [
        [48,18,59], [67,62,133], [61,112,180], [35,158,170], [30,187,137],
        [62,210,86], [122,220,38], [182,217,25], [230,195,21], [255,163,0],
        [255,117,0], [250,67,0], [220,24,32], [165,0,38]
      ];
      return _interpStops(stops, i, n);
    }
  },
  magma: {
    label: 'Magma',
    fn: (i, n) => {
      // Matplotlib: preto → roxo → magenta → laranja → amarelo claro
      const stops = [
        [0,0,4], [18,13,50], [51,16,91], [89,17,110], [130,18,112],
        [170,34,100], [204,71,78], [227,112,57], [241,163,47],
        [248,210,67], [252,253,191]
      ];
      return _interpStops(stops, i, n);
    }
  },
  quente: {
    label: 'Quente',
    fn: (i, n) => {
      // Escala quente: preto → vermelho escuro → laranja → amarelo → branco
      const stops = [
        [30,0,0], [100,0,0], [180,0,0], [230,40,0], [255,100,0],
        [255,160,0], [255,210,30], [255,240,100], [255,255,180], [255,255,240]
      ];
      return _interpStops(stops, i, n);
    }
  },
  fria: {
    label: 'Fria',
    fn: (i, n) => {
      // Escala fria: ciano claro → azul → índigo → roxo → magenta → rosa
      const stops = [
        [180,255,255], [100,220,255], [50,170,255], [30,120,240], [40,70,220],
        [60,30,200], [90,10,180], [130,0,170], [170,20,160], [210,60,150],
        [240,100,150]
      ];
      return _interpStops(stops, i, n);
    }
  },
  crepusculo: {
    label: 'Crepúsculo',
    fn: (i, n) => {
      // Pôr do sol: azul noite → roxo → rosa → vermelho → laranja → dourado
      const stops = [
        [20,20,80], [40,30,120], [80,30,150], [130,20,160], [180,30,140],
        [210,50,100], [230,80,60], [240,120,40], [245,160,30], [250,200,50],
        [255,230,80]
      ];
      return _interpStops(stops, i, n);
    }
  },
  parula: {
    label: 'Parula',
    fn: (i, n) => {
      // MATLAB default (2014+): azul escuro → ciano → verde-amarelo → amarelo
      const stops = [
        [53,42,135], [40,70,180], [30,110,200], [25,155,190], [30,180,160],
        [60,195,115], [120,200,70], [180,200,45], [225,195,35], [250,210,40],
        [249,251,14]
      ];
      return _interpStops(stops, i, n);
    }
  },
  random: {
    label: 'Random',
    fn: (i, n) => {
      // Seeded pseudo-random: hue espalhado, com variação de sat/light
      const hue = (i * 137 + 73) % 360;
      const sat = 65 + ((i * 53) % 30);
      const light = 50 + ((i * 29) % 18);
      return `hsl(${hue},${sat}%,${light}%)`;
    }
  }
};

const _PALETAS_IDS = Object.keys(_PALETAS);

/** Retorna a cor da paleta ativa para o índice i de n itens */
function _getCorPaleta(i, n) {
  const id = window._graficoPaleta || 'rainbow';
  const p = _PALETAS[id] || _PALETAS.rainbow;
  return p.fn(i, n);
}

// Alias legado
function _rainbowColor(i, n) { return _getCorPaleta(i, n); }

// Métricas disponíveis
const _METRICAS = [
  { id: 'pts', label: 'Pontos', short: 'Pontos' },
  { id: 'evolucao', label: 'Evolução', short: 'Evolução' },
  { id: 'chance', label: 'Projeção', short: 'Projeção' },
  { id: 'pct', label: 'Pontos %', short: 'Pontos %' },
  { id: 'res', label: 'Resultados', short: 'Results' },
  { id: 'bonus1', label: 'Bônus+1', short: 'Bônus+1' },
  { id: 'placar', label: 'Placar+3', short: 'Placar+3' },
  { id: 'placar_alto', label: 'Placar+5', short: 'Placar+5' },
  { id: 'macaco', label: 'Macaco', short: 'Macaco' },
];

// Métrica onde o Modelo aparece por default
function _isModeloDefaultOn(metrica) {
  return metrica !== 'evolucao' && metrica !== 'macaco';
}

// Retorna se o Modelo deve ser visível agora (checa o filtro)
function _isModeloVisivel() {
  return !!(window._graficoFiltroApos && window._graficoFiltroApos.has('Modelo'));
}

window.renderGrafico = function () {
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

  const baseRanking = gerarRanking(pals, res, apos, espOficiaisGraf);
  const posMap = {};
  baseRanking.forEach(item => {
    const pId = item.participante.id || item.participante.token;
    if (pId) posMap[pId] = item.posicao;
  });

  let rankingCompleto = apos.map((a, idx) => {
    const st = calcularPontosApostador(pals[a.id] || {}, res, a, espOficiaisGraf);
    const pId = a.id || a.token;
    return {
      id: a.id,
      nome: (a.apelido || a.nome || "?").substring(0, 14),
      pts: st.total,
      pct: st.pct_pontos,
      res: st.acertos_resultado,
      bonus1: st.acertos_bonus1,
      placar: st.acertos_placar_exato + st.acertos_placar_alto,
      placar_alto: st.acertos_placar_alto,
      isModelo: false,
      posicao: pId ? posMap[pId] : null
    };
  }).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.placar !== a.placar) return b.placar - a.placar;
    return b.res - a.res;
  });

  // Inserir Modelo na posição correta (sempre computar para dropdown, mas filtrar na renderização)
  const modeloGraf = window.getModelo ? window.getModelo() : null;
  if (modeloGraf && APP._modeloCarregado) {
    const stMod = calcularPontosApostador(APP.palpitesModelo || {}, res, modeloGraf, espOficiaisGraf);
    const itemMod = {
      id: "Modelo",
      nome: "Modelo",
      pts: stMod.total,
      pct: stMod.pct_pontos,
      res: stMod.acertos_resultado,
      bonus1: stMod.acertos_bonus1,
      placar: stMod.acertos_placar_exato + stMod.acertos_placar_alto,
      placar_alto: stMod.acertos_placar_alto,
      isModelo: true,
    };
    const insertIdx = rankingCompleto.findIndex(a => a.pts < stMod.total);
    if (insertIdx === -1) rankingCompleto.push(itemMod);
    else rankingCompleto.splice(insertIdx, 0, itemMod);
  }

  // Inicializar filtro com todos os apostadores por padrão
  if (!window._graficoFiltroApos) {
    const ids = rankingCompleto.filter(a => !a.isModelo).map(a => a.id);
    // Modelo default ON/OFF depende da métrica
    if (_isModeloDefaultOn(metricaAtiva) && rankingCompleto.some(a => a.isModelo)) ids.push('Modelo');
    window._graficoFiltroApos = new Set(ids);
  }

  // Quando não customizado, ajustar filtro por métrica:
  // - Evolução: top 10 humanos (sem Modelo)
  // - Outras: todos os humanos (+ Modelo conforme default da métrica)
  if (!window._graficoFiltroCustomizado) {
    if (metricaAtiva === 'evolucao') {
      const top10Ids = rankingCompleto.filter(a => !a.isModelo).slice(0, 10).map(a => a.id);
      window._graficoFiltroApos = new Set(top10Ids);
    } else {
      const allIds = rankingCompleto.filter(a => !a.isModelo).map(a => a.id);
      if (_isModeloDefaultOn(metricaAtiva) && rankingCompleto.some(a => a.isModelo)) allIds.push('Modelo');
      window._graficoFiltroApos = new Set(allIds);
    }
  }

  // ── Toggle de métrica ──
  const _isMob = window.innerWidth <= 600;
  let h = '<div class="grafico-toggle-grid">';
  _METRICAS.forEach(m => {
    const ativo = metricaAtiva === m.id;
    const onclick = m.id === 'evolucao'
      ? 'onclick="_graficoIrEvolucao()"'
      : m.id === 'chance'
        ? 'onclick="_graficoIrProjecao()"'
        : m.id === 'macaco'
          ? 'onclick="_graficoIrMacaco()"'
          : `onclick="window._graficoMetrica='${m.id}';renderAbaAtiva()"`;
    const txt = _isMob ? m.short : m.label;
    h += `<button class="btn-toggle${ativo ? ' ativo' : ''}" ${onclick}>${txt}</button>`;
  });
  h += '</div>';

  // ── Filtro + Paleta (lado a lado) ──
  const _isDesk = window.innerWidth > 850;
  h += `<div style="display:flex;gap:8px;margin-bottom:12px;align-items:flex-start">`;
  h += _renderFiltroDropdown(rankingCompleto, metricaAtiva, _isDesk);
  h += _renderPaletaDropdown(_isDesk);
  h += `</div>`;

  if (metricaAtiva === "evolucao") {
    h += _renderEvolucao(res, pals, apos, rankingCompleto);
  } else if (metricaAtiva === "chance") {
    // Se já temos cache, exibir direto; senão mostrar spinner e calcular
    if (window._graficoChanceCache) {
      const cache = window._graficoChanceCache;
      const subTipo = window._graficoChanceSubTipo || 'vencedor';
      const chances = subTipo === 'top5' ? (cache.top5 || {}) : (cache.vencedor || {});
      h += _renderChance(rankingCompleto, chances);
    } else {
      h += _renderChanceLoading();
    }
  } else if (metricaAtiva === "macaco") {
    if (window._graficoMacacoCache) {
      h += _renderMacaco(rankingCompleto, window._graficoMacacoCache);
    } else {
      h += _renderMacacoLoading();
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
function _renderFiltroDropdown(rankingCompleto, metricaAtiva, isDesk) {
  const filtro = window._graficoFiltroApos;
  const todos = rankingCompleto;
  const selecionados = todos.filter(a => filtro.has(a.id));
  const humanos = todos.filter(a => !a.isModelo);

  // Badge de contagem
  const badge = `${selecionados.length}/${todos.length}`;

  const containerStyle = isDesk
    ? 'position:relative;width:310px;z-index:50'
    : 'position:relative;flex:1;min-width:0;z-index:50';
  let h = `<div style="${containerStyle}">`;

  // Botão que abre o dropdown
  h += `<button onclick="_graficoToggleDropdown(event)"
    style="width:100%;background:var(--fundo2);border:1.5px solid var(--borda2);border-radius:var(--radius-sm);
           padding:9px 12px;color:var(--texto);font-size:.80rem;font-weight:600;cursor:pointer;
           display:flex;align-items:center;justify-content:space-between;gap:6px;font-family:inherit;text-align:left">
    <span style="white-space:nowrap">👤 Filtro</span>
    <span style="font-size:.68rem;color:var(--texto2);font-weight:400;white-space:nowrap">${badge} ▼</span>
  </button>`;

  // Painel dropdown
  h += `<div id="grafico-dropdown" onclick="event.stopPropagation()" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;
    background:var(--card);border:1.5px solid var(--borda2);border-radius:var(--radius-sm);
    box-shadow:0 8px 24px rgba(0,0,0,.5);max-height:300px;overflow-y:auto;z-index:100">`;

  // ── Header de colunas (sortable) + checkbox master ──
  const ddOrdem = window._graficoDropdownOrdem || 'rank';
  const todosCheck = selecionados.length === todos.length;
  const algunsCheck = selecionados.length > 0 && selecionados.length < todos.length;
  const arrowRank = ddOrdem === 'rank' ? ' ▲' : '';
  const arrowNome = ddOrdem === 'nome' ? ' ▲' : '';
  const colAtivoStyle = 'color:var(--dourado);';
  const colInativoStyle = 'color:var(--texto2);';

  h += `<div style="display:flex;align-items:center;gap:0;border-bottom:1.5px solid var(--borda);background:var(--card);position:sticky;top:0;z-index:2">`;
  // Checkbox master (margin-right matches rows)
  h += `<div style="padding:6px 8px 6px 14px;flex-shrink:0;margin-right:10px">
    <input type="checkbox" id="grafico-master-check" ${todosCheck ? 'checked' : ''}
      onchange="window._graficoMasterToggle(this.checked)"
      style="width:16px;height:16px;accent-color:var(--dourado);cursor:pointer">
  </div>`;
  // Spacer para alinhar com o dot de cor das linhas (10px dot + 10px margin)
  h += `<div style="width:20px;flex-shrink:0"></div>`;
  // Coluna # (rank) — min-width alinha com a posição nas linhas (28px + 4px margin)
  h += `<button onclick="event.stopPropagation();window._graficoDropdownOrdem='rank';window._graficoDropdownAberto=true;renderAbaAtiva()"
    style="background:none;border:none;cursor:pointer;padding:6px 0;font-size:.70rem;font-weight:700;${ddOrdem === 'rank' ? colAtivoStyle : colInativoStyle}font-family:inherit;white-space:nowrap;min-width:28px;margin-right:4px;text-align:left">#${arrowRank}</button>`;
  // Coluna Apostador (nome)
  h += `<button onclick="event.stopPropagation();window._graficoDropdownOrdem='nome';window._graficoDropdownAberto=true;renderAbaAtiva()"
    style="background:none;border:none;cursor:pointer;padding:6px 4px;font-size:.70rem;font-weight:700;${ddOrdem === 'nome' ? colAtivoStyle : colInativoStyle}font-family:inherit;flex:1;text-align:left">Apostador${arrowNome}</button>`;
  h += `</div>`;

  // Set indeterminate via script
  if (algunsCheck) {
    h += `<script>document.getElementById('grafico-master-check')&&(document.getElementById('grafico-master-check').indeterminate=true)</script>`;
  }

  // ── Lista de apostadores (incluindo Modelo como apostador regular) ──
  // Ordenar conforme coluna clicada
  let listaOrdenada = [...todos];
  if (ddOrdem === 'nome') {
    listaOrdenada.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }
  // Se 'rank', já vem na ordem do rankingCompleto (por pontos com desempates)

  listaOrdenada.forEach((a) => {
    const ativo = filtro.has(a.id);
    const hIdx = humanos.indexOf(a);
    let cor = '#b8cfe8';
    if (!a.isModelo) {
      cor = metricaAtiva === 'evolucao'
        ? _EVOLUCAO_CORES_DISTINTAS[hIdx % _EVOLUCAO_CORES_DISTINTAS.length]
        : _rainbowColor(hIdx, humanos.length);
    }
    const posNum = a.isModelo ? null : a.posicao;
    const posStr = posNum !== null && posNum !== undefined ? `${posNum}º` : '';
    const nomeStyle = a.isModelo ? 'font-weight:500;color:#b8cfe8' : 'font-weight:600;color:var(--texto)';
    const nomeTxt = a.isModelo ? `🤖 ${a.nome}` : a.nome;
    const bgBase = a.isModelo ? 'rgba(184,207,232,0.04)' : '';
    h += `<label onclick="event.stopPropagation()" style="display:flex;align-items:center;gap:0;padding:0;cursor:pointer;border-bottom:1px solid var(--borda);transition:background .1s;background:${bgBase}"
      onmouseover="this.style.background='rgba(255,255,255,.04)'" onmouseout="this.style.background='${bgBase}'">
      <div style="padding:7px 8px 7px 14px;flex-shrink:0;margin-right:10px">
        <input type="checkbox" ${ativo ? 'checked' : ''} onchange="window._graficoToggleApos('${a.id}')"
          style="width:16px;height:16px;accent-color:${cor};cursor:pointer">
      </div>
      <div style="width:10px;height:10px;border-radius:50%;background:${cor};flex-shrink:0;margin-right:10px"></div>
      <span style="font-size:.70rem;font-weight:700;color:var(--texto2);min-width:28px;flex-shrink:0;margin-right:4px">${posStr}</span>
      <span style="font-size:.80rem;${nomeStyle};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${nomeTxt}</span>
    </label>`;
  });

  h += `</div></div>`;
  return h;
}

window._graficoToggleDropdown = function (e) {
  e.stopPropagation();
  // Fechar paleta se aberta
  const palDD = document.getElementById('grafico-paleta-dd');
  if (palDD) palDD.style.display = 'none';

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

window._graficoFecharDropdown = function () {
  const dd = document.getElementById('grafico-dropdown');
  if (dd) dd.style.display = 'none';
};

window._graficoToggleApos = function (id) {
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
  // Marcar que o user customizou o Modelo explicitamente
  if (id === 'Modelo') window._graficoModeloCustomizado = true;
  window._graficoFiltroCustomizado = true;
  window._graficoDropdownAberto = true;
  renderAbaAtiva();
};

// Checkbox master: seleciona/deseleciona todos (incluindo Modelo)
window._graficoMasterToggle = function (checked) {
  const dd = document.getElementById('grafico-dropdown');
  if (dd) {
    window._graficoDropdownScrollTop = dd.scrollTop;
  }
  const ids = (APP.apostadores || []).map(a => a.id);
  const modeloGraf = window.getModelo ? window.getModelo() : null;
  if (checked && modeloGraf && APP._modeloCarregado) ids.push('Modelo');
  window._graficoFiltroApos = checked ? new Set(ids) : new Set();
  window._graficoFiltroCustomizado = true;
  window._graficoModeloCustomizado = true;
  window._graficoDropdownAberto = true;
  renderAbaAtiva();
};

// Legacy compat
window._graficoSelecionarTodos = function () {
  window._graficoMasterToggle(true);
};

window._graficoSelecionarNenhum = function () {
  window._graficoMasterToggle(false);
};

// ── Dropdown paleta de cores ───────────────────────────────────────────────
function _renderPaletaDropdown(isDesk) {
  const paletaAtiva = window._graficoPaleta || 'rainbow';
  const p = _PALETAS[paletaAtiva] || _PALETAS.rainbow;

  // Gerar swatch de preview: 6 mini quadrados
  let swatch = '';
  for (let i = 0; i < 6; i++) {
    swatch += `<span style="display:inline-block;width:6px;height:10px;background:${p.fn(i, 6)};border-radius:1px"></span>`;
  }

  const containerStyle = isDesk
    ? 'position:relative;width:200px;z-index:49'
    : 'position:relative;width:35%;flex-shrink:0;z-index:49';
  let h = `<div style="${containerStyle}">`;
  // Botão
  h += `<button onclick="window._graficoTogglePaleta(event)"
    style="width:100%;background:var(--fundo2);border:1.5px solid var(--borda2);border-radius:var(--radius-sm);
           padding:9px 10px;color:var(--texto);font-size:.80rem;font-weight:600;cursor:pointer;
           display:flex;align-items:center;justify-content:space-between;gap:6px;font-family:inherit;white-space:nowrap">
    <span style="display:flex;align-items:center;gap:5px;overflow:hidden">
      <span style="display:flex;gap:1px;flex-shrink:0">${swatch}</span>
      <span style="font-size:.72rem;color:var(--texto);overflow:hidden;text-overflow:ellipsis">${p.label}</span>
    </span>
    <span style="font-size:.68rem;color:var(--texto2);flex-shrink:0">▼</span>
  </button>`;

  // Painel dropdown
  h += `<div id="grafico-paleta-dd" onclick="event.stopPropagation()" style="display:none;position:absolute;top:calc(100% + 4px);right:0;
    background:var(--card);border:1.5px solid var(--borda2);border-radius:var(--radius-sm);
    box-shadow:0 8px 24px rgba(0,0,0,.5);z-index:100;min-width:150px">`;

  _PALETAS_IDS.forEach(id => {
    const pal = _PALETAS[id];
    const ativo = id === paletaAtiva;
    // Mini preview
    let preview = '';
    for (let i = 0; i < 8; i++) {
      preview += `<span style="display:inline-block;width:6px;height:10px;background:${pal.fn(i, 8)};border-radius:1px"></span>`;
    }
    h += `<div onclick="window._graficoSetPaleta('${id}')"
      style="display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--borda);
             background:${ativo ? 'rgba(255,255,255,.06)' : ''};transition:background .1s"
      onmouseover="this.style.background='rgba(255,255,255,.06)'" onmouseout="this.style.background='${ativo ? 'rgba(255,255,255,.06)' : ''}'">
      <span style="display:flex;gap:1px;flex-shrink:0">${preview}</span>
      <span style="font-size:.76rem;font-weight:${ativo ? '700' : '500'};color:${ativo ? 'var(--dourado)' : 'var(--texto)'}">${pal.label}</span>
      ${ativo ? '<span style="margin-left:auto;font-size:.7rem;color:var(--dourado)">✓</span>' : ''}
    </div>`;
  });

  h += `</div></div>`;
  return h;
}

window._graficoTogglePaleta = function (e) {
  e.stopPropagation();
  // Fechar o outro dropdown se aberto
  const filtroDD = document.getElementById('grafico-dropdown');
  if (filtroDD) filtroDD.style.display = 'none';

  const dd = document.getElementById('grafico-paleta-dd');
  if (!dd) return;
  const aberto = dd.style.display !== 'none';
  dd.style.display = aberto ? 'none' : 'block';
  if (!aberto) {
    setTimeout(() => {
      document.addEventListener('click', function _closePal() {
        const d = document.getElementById('grafico-paleta-dd');
        if (d) d.style.display = 'none';
      }, { once: true });
    }, 0);
  }
};

window._graficoSetPaleta = function (id) {
  window._graficoPaleta = id;
  renderAbaAtiva();
};

window._graficoIrEvolucao = function () {
  window._graficoMetrica = 'evolucao';
  renderAbaAtiva();
};

// ── Labels de valor por métrica ────────────────────────────────────────────
function _fmtVal(metricaAtiva, val, shortFmt = false) {
  if (metricaAtiva === 'pct') {
    // Mesmo formato do gráfico de Projeção: XX.X%
    return parseFloat(val).toFixed(1) + '%';
  }
  if (metricaAtiva === 'pts') {
    return val.toFixed(1); // sempre XX.X, inclusive em landscape
  }
  return String(val);
}

window._graficoIrProjecao = function () {
  window._graficoMetrica = 'chance';
  renderAbaAtiva();
  // Só rodar Monte Carlo se ainda não temos cache ou se o cache está no formato antigo plano
  if (!window._graficoChanceCache || !window._graficoChanceCache.vencedor) {
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

/**
 * Amostra (homeGoals, awayGoals) de CDF pré-computada — busca binária O(log n).
 * Trocado de busca linear pra binária porque a correção do Bug Crítico #4
 * (sorteio independente por participante, em vez de 1 roll compartilhado por jogo)
 * multiplica bastante o número de chamadas a esta função.
 */
function _amostrar(cdfEntry) {
  const { cdf, N } = cdfEntry;
  const r = Math.random();
  let lo = 0, hi = cdf.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (r <= cdf[mid]) hi = mid; else lo = mid + 1;
  }
  return { homeGoals: (lo / N) | 0, awayGoals: lo % N };
}

// _pontosRapidoOt removida em favor de _pontosInteiros inline

function _graficoRodarMonteCarlo() {
  const N_ITER = 20000;
  const res = getResultados();
  const apos = APP.apostadores || [];
  const pals = APP.palpites || {};
  const schedule = window.SCHEDULE || [];
  const sById = window.SCHEDULE_BY_ID || {};

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

  const FASES = ['grupos', '16avos', 'oitavas', 'quartas', 'semis', 'terceiro', 'final'];
  for (const f of FASES) {
    const ft = cfgRaw.fatores_fase[f] || 1;
    cfgOt.pts_exatoAlto[f] = Math.round((base + bExA) * ft * 10);
    cfgOt.pts_exatoBaixo[f] = Math.round((base + bExB) * ft * 10);
    cfgOt.pts_diff[f] = Math.round((base + bDif) * ft * 10);
    cfgOt.pts_umTime[f] = Math.round((base + bUmT) * ft * 10);
    cfgOt.pts_base[f] = Math.round(base * ft * 10);
  }

  // Função super rápida e inlineável (retorna inteiros).
  // Além dos pontos, acumula em `exatosArr`/`resultadosArr` (se passados) o total de
  // placares exatos e de resultados corretos do participante `pi` — usado depois como
  // critério de desempate no Top 5, igual à regra oficial do bolão (ver tab-regras.js:
  // 1º placares exatos, 2º resultados corretos). Isso é só incrementar um contador
  // int num array já alocado, então não pesa no laço.
  function _pontosInteiros(palH, palA, resH, resA, c, f, exatosArr, resultadosArr, pi) {
    const resEf = resH > resA ? 1 : resH < resA ? -1 : 0;
    const resPal = palH > palA ? 1 : palH < palA ? -1 : 0;
    if (resPal !== resEf) return 0;
    if (resultadosArr) resultadosArr[pi]++;
    if (palH === resH && palA === resA) {
      if (exatosArr) exatosArr[pi]++;
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

  const nPart = todoParticipantes.length;
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
  const exatosBase = new Int32Array(nPart);
  const resultadosBase = new Int32Array(nPart);
  for (let pi = 0; pi < nPart; pi++) {
    const p = todoParticipantes[pi];
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
        cfgOt, j.fase,
        exatosBase, resultadosBase, pi
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
  const vitoriasTop5 = new Float64Array(nPart);
  const ptIter = new Int32Array(nPart);
  const exatosIter = new Int32Array(nPart);
  const resultadosIter = new Int32Array(nPart);
  // Índices dos participantes humanos (Modelo não concorre a posição/Top 5).
  // A lista de índices é fixa entre iterações — só a ORDEM (obtida por sort a cada
  // iteração, ver Passo 6) muda, pois os pontos/critérios de desempate mudam.
  const humanIdx = [];
  for (let pi = 0; pi < nPart; pi++) {
    if (partIds[pi] && partIds[pi].toUpperCase() !== 'MODELO') humanIdx.push(pi);
  }
  const hCount = humanIdx.length;
  // Buffer dos 5 melhores (por critério oficial: pts → exatos → resultados), mantido via
  // inserção incremental a cada iteração — mais barato que ordenar a lista inteira de
  // humanos toda vez (evita overhead do comparador genérico do Array.prototype.sort).
  const K = Math.min(hCount, 5) || 1;
  const bufPi = new Int32Array(K);
  const bufPts = new Int32Array(K);
  const bufEx = new Int32Array(K);
  const bufRs = new Int32Array(K);

  // Verifica se todos os jogos de grupo já acabaram no mundo real
  const gruposFinished = (jogosPorFase['grupos'].length === 0);
  let classificadosBase = null;
  if (gruposFinished) {
    classificadosBase = window.BRACKET.calcularTodosOsGrupos(res).classificados;
  }

  // Pré-resolve bracket oficial para ter times nos jogos reais no resSim.
  // IMPORTANTE: `res` são os MESMOS objetos vivos em APP.resultados/APP.resultadosSim.
  // Object.assign({}, res) é um clone RASO — res[id] continua sendo a mesma referência,
  // então o código antigo mutava os resultados oficiais de verdade (acrescentando
  // homeTeam/awayTeam neles) toda vez que o gráfico rodava. Aqui clonamos cada jogo.
  const bracketOficial = window.BRACKET.preencherBracket(res);
  const resSim = {};
  for (const key of Object.keys(res)) {
    const r = res[key];
    const b = bracketOficial[key];
    resSim[key] = b ? { ...r, homeTeam: b.home, awayTeam: b.away } : { ...r };
  }

  // Times resolvidos por jogo pendente em cada iteração (o palpite em si é sorteado
  // INDEPENDENTEMENTE por participante no Passo 5 — ver nota no Passo 4 abaixo).
  const palSimTeams = {};

  // Fases cujo prazo de apostas já passou (liberado_* = false no configStatus).
  const _st = APP.configStatus || {};
  const _faseParaKey = { grupos: 'grupos', '16avos': '16avos', oitavas: 'oitavas', quartas: 'quartas', semis: 'semis', terceiro: 'finais', final: 'finais' };
  const fasesFechadas = new Set(
    FASES.filter(fase => {
      const key = _faseParaKey[fase] || fase;
      // Uma fase com jogos pendentes está "fechada" quando sua flag liberado_* é false.
      // Fases ainda não abertas (zeradas e não liberadas) também entram aqui.
      return jogosPorFase[fase].length > 0 && !_st[`liberado_${key}`];
    })
  );

  // Fases ainda fechadas (ex.: quartas/semis/final antes de abrirem) não têm palpite real
  // de ninguém — mas isso não significa que elas vão valer ZERO ponto pra todo mundo até
  // o fim da Copa: quando a fase abrir, cada apostador vai enviar o SEU próprio palpite.
  // Setar como `true` faz o Monte Carlo projetar o campeonato inteiro até a final (recomendado
  // para a pergunta "quem vai ganhar o bolão"). Setar como `false` restaura o comportamento
  // antigo (fases futuras fechadas somam 0 pts para todos, útil para "ranking se a Copa
  // acabasse agora").
  const SIMULAR_PALPITE_FASES_FECHADAS = true;

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
        vice = hV ? rFNL.awayTeam : rFNL.homeTeam;
      }
      if (!terceiro && rTPL && rTPL.homeGoals !== undefined) {
        const hV = rTPL.foi_penaltis ? rTPL.penaltis_vencedor === 'home' : rTPL.homeGoals > rTPL.awayGoals;
        terceiro = hV ? rTPL.homeTeam : rTPL.awayTeam;
      }
      espSim = { campeao, vice, terceiro };
    }

    // Passo 4: resolve os TIMES de cada jogo pendente. O palpite de quem não apostou é
    // sorteado INDIVIDUALMENTE por participante no Passo 5 — antes era UM único sorteio
    // compartilhado por jogo (palSim[jogo.id] = _amostrar(...)), usado como "palpite" de
    // TODOS os apostadores sem aposta própria. Isso colava o destino de vários apostadores
    // entre si (todo mundo sem aposta acertava/errava exatamente igual, iteração após
    // iteração), criando correlação artificial que inflava as chances de Top 5 e de
    // vitória para quem já estava na frente. Ver relatório de bugs.
    if (temPendentes) {
      if (!cachedClassificados) {
        cachedClassificados = window.BRACKET.calcularTodosOsGrupos(resSim).classificados;
      }
      for (const fase of FASES) {
        if (!SIMULAR_PALPITE_FASES_FECHADAS && fasesFechadas.has(fase)) continue;
        const jogos = jogosPorFase[fase];
        for (const jogo of jogos) {
          const hC = getTeamFast(jogo.home, cachedClassificados);
          const aC = getTeamFast(jogo.away, cachedClassificados);
          if (hC && aC) palSimTeams[jogo.id] = { hC, aC };
        }
      }
    }

    // Passo 5: pontos incrementais (só jogos pendentes) + especiais simulados
    for (let pi = 0; pi < nPart; pi++) {
      const p = todoParticipantes[pi];
      const pid = partIds[pi];
      const palP = parsedPals[pid];
      let acc = ptBase[pi];
      exatosIter[pi] = exatosBase[pi];
      resultadosIter[pi] = resultadosBase[pi];

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
              if (!SIMULAR_PALPITE_FASES_FECHADAS && fasesFechadas.has(fase)) continue;
              const teams = palSimTeams[jogo.id];
              if (!teams) continue;
              // Sorteio independente para ESTE participante (não compartilhado com os
              // demais que também não apostaram nesse jogo).
              const pInd = _amostrar(_getCdf(teams.hC, teams.aC, sById[jogo.id]));
              p_h = pInd.homeGoals; p_a = pInd.awayGoals;
            }
            acc += _pontosInteiros(
              p_h, p_a,
              rSim.homeGoals, rSim.awayGoals,
              cfgOt, jogo.fase,
              exatosIter, resultadosIter, pi
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

    // Registrar vencedor: TODOS os participantes (humanos + Modelo, se presente) disputam
    // o MESMO empate, usando o critério de desempate OFICIAL do bolão (tab-regras.js):
    // 1º pontos, 2º placares exatos, 3º resultados corretos. Só se persistir empate nos
    // três critérios é que a posição é dividida — igual à regra real de premiação.
    let melhorPts = -Infinity, melhorExatos = -Infinity, melhorResultados = -Infinity;
    let vencedores = [];
    for (let pi = 0; pi < nPart; pi++) {
      const melhor =
        ptIter[pi] > melhorPts ||
        (ptIter[pi] === melhorPts && exatosIter[pi] > melhorExatos) ||
        (ptIter[pi] === melhorPts && exatosIter[pi] === melhorExatos && resultadosIter[pi] > melhorResultados);
      const empatouTudo =
        ptIter[pi] === melhorPts && exatosIter[pi] === melhorExatos && resultadosIter[pi] === melhorResultados;
      if (melhor) {
        melhorPts = ptIter[pi]; melhorExatos = exatosIter[pi]; melhorResultados = resultadosIter[pi];
        vencedores = [pi];
      } else if (empatouTudo) {
        vencedores.push(pi);
      }
    }
    if (vencedores.length > 0) {
      const frac = 1.0 / vencedores.length;
      for (const idx of vencedores) vitorias[idx] += frac;
    }

    // Registrar Top 5 — cálculo e contagem restritos a HUMANOS (o Modelo não concorre a
    // posição/prêmio). Antes, "todo mundo empatado em pontos no 5º lugar" contava como
    // Top 5 — mas empate em PONTOS não é empate de verdade na classificação oficial do
    // bolão: os critérios de desempate (placares exatos → resultados corretos) quase
    // sempre decidem quem fica realmente à frente. Ordenar por esses 3 critérios (em vez
    // de só pontos) resolve isso sem nenhum sorteio/simulação extra — é só um sort sobre
    // arrays que já temos, O(hCount log hCount), irrelevante perto do custo do Passo 5.
    for (let hi = 0; hi < hCount; hi++) {
      const pi = humanIdx[hi];
      const pts = ptIter[pi], ex = exatosIter[pi], rs = resultadosIter[pi];
      if (hi < K) {
        let ins = hi;
        while (ins > 0) {
          const j = ins - 1;
          const melhor = pts > bufPts[j] || (pts === bufPts[j] && ex > bufEx[j]) || (pts === bufPts[j] && ex === bufEx[j] && rs > bufRs[j]);
          if (!melhor) break;
          bufPi[ins] = bufPi[j]; bufPts[ins] = bufPts[j]; bufEx[ins] = bufEx[j]; bufRs[ins] = bufRs[j];
          ins--;
        }
        bufPi[ins] = pi; bufPts[ins] = pts; bufEx[ins] = ex; bufRs[ins] = rs;
      } else {
        const last = K - 1;
        const melhorQueUltimo = pts > bufPts[last] || (pts === bufPts[last] && ex > bufEx[last]) || (pts === bufPts[last] && ex === bufEx[last] && rs > bufRs[last]);
        if (melhorQueUltimo) {
          let ins = last;
          while (ins > 0) {
            const j = ins - 1;
            const melhor = pts > bufPts[j] || (pts === bufPts[j] && ex > bufEx[j]) || (pts === bufPts[j] && ex === bufEx[j] && rs > bufRs[j]);
            if (!melhor) break;
            bufPi[ins] = bufPi[j]; bufPts[ins] = bufPts[j]; bufEx[ins] = bufEx[j]; bufRs[ins] = bufRs[j];
            ins--;
          }
          bufPi[ins] = pi; bufPts[ins] = pts; bufEx[ins] = ex; bufRs[ins] = rs;
        }
      }
    }
    const cutPts = bufPts[K - 1], cutExatos = bufEx[K - 1], cutResultados = bufRs[K - 1];

    for (const pi of humanIdx) {
      const melhorOuEmpatado =
        ptIter[pi] > cutPts ||
        (ptIter[pi] === cutPts && exatosIter[pi] > cutExatos) ||
        (ptIter[pi] === cutPts && exatosIter[pi] === cutExatos && resultadosIter[pi] >= cutResultados);
      if (melhorOuEmpatado) vitoriasTop5[pi] += 1;
    }
  }

  const chancesVencedor = {};
  const chancesTop5 = {};
  for (let pi = 0; pi < nPart; pi++) {
    chancesVencedor[partIds[pi]] = parseFloat((vitorias[pi] / N_ITER * 100).toFixed(1));
    chancesTop5[partIds[pi]] = parseFloat((vitoriasTop5[pi] / N_ITER * 100).toFixed(1));
  }

  // Guardar cache estruturado com ambos os cálculos realizados na mesma rodada
  window._graficoChanceCache = {
    vencedor: chancesVencedor,
    top5: chancesTop5
  };
  _graficoExibirChance(window._graficoChanceCache);
}

function _graficoExibirChance(cacheOrChances) {
  // Trata compatibilidade se o cache for o novo formato estruturado ou antigo plano
  let cache = cacheOrChances;
  if (!cache || (!cache.vencedor && !cache.top5)) {
    cache = { vencedor: cacheOrChances || {}, top5: {} };
  }
  const subTipo = window._graficoChanceSubTipo || 'vencedor';
  const chances = subTipo === 'top5' ? (cache.top5 || {}) : (cache.vencedor || {});

  // Rebuild rankingCompleto igual ao renderGrafico para cores consistentes
  const res = getResultados();
  const apos = APP.apostadores || [];
  const pals = APP.palpites || {};
  const espOficiaisGraf = window.BRACKET.extrairEspeciaisOficiais(res, APP.bracket || {});

  const baseRanking = gerarRanking(pals, res, apos, espOficiaisGraf);
  const posMap = {};
  baseRanking.forEach(item => {
    const pId = item.participante.id || item.participante.token;
    if (pId) posMap[pId] = item.posicao;
  });

  let rankingCompleto = apos.map((a, idx) => {
    const st = calcularPontosApostador(pals[a.id] || {}, res, a, espOficiaisGraf);
    const pId = a.id || a.token;
    return {
      id: a.id,
      nome: (a.apelido || a.nome || '?').substring(0, 14),
      pts: st.total,
      chance: chances[a.id] || 0,
      isModelo: false,
      posicao: pId ? posMap[pId] : null
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

  const n = ranking.length;
  const isMobile = window.innerWidth <= 768;
  const isLandscape = window.innerWidth > window.innerHeight;

  let gap, barWidth, valFontSize, nameFontSize, needsScroll;

  if (isMobile && !isLandscape) {
    // ── PORTRAIT MOBILE: barras menores (~12 visíveis), scroll permitido ──
    const targetVisible = 12;
    const screenPx = window.innerWidth - 40;
    const targetColW = Math.floor(screenPx / targetVisible);
    barWidth = Math.max(14, Math.min(24, targetColW - 2));
    gap = 2;
    valFontSize = '.52rem'; // menor pois XX.X% é mais largo
    nameFontSize = '.68rem';

    const minPx = n * (barWidth + gap) + gap;
    needsScroll = minPx > screenPx;
  } else {
    needsScroll = false;
    const margemPx = isMobile ? 40 : 80;
    const disponivelPx = window.innerWidth - margemPx;
    const perColuna = disponivelPx / n;
    if (isMobile && isLandscape) {
      barWidth = Math.max(4, Math.floor(perColuna - 1));
    } else {
      if (n <= 6) barWidth = 36;
      else if (n <= 10) barWidth = 30;
      else if (n <= 15) barWidth = 24;
      else if (n <= 20) barWidth = 18;
      else if (n <= 28) barWidth = 14;
      else barWidth = Math.max(6, Math.floor(perColuna - 1));
    }
    gap = Math.max(1, Math.floor(perColuna - barWidth));
    // Fontes adaptativas — valor vertical, 0.90 landscape, 1.13 desktop (+13%)
    const fScaleVal = (isMobile && isLandscape) ? 0.90 : 1.21;
    const fScaleName = (isMobile && isLandscape) ? 0.90 : 1.21;
    const fv = (base) => (base * fScaleVal).toFixed(2) + 'rem';
    const fvn = (base) => (base * fScaleName).toFixed(2) + 'rem';
    if (n <= 8) { valFontSize = fv(0.72); nameFontSize = fvn(0.78); }
    else if (n <= 12) { valFontSize = fv(0.67); nameFontSize = fvn(0.73); }
    else if (n <= 18) { valFontSize = fv(0.62); nameFontSize = fvn(0.68); }
    else if (n <= 24) { valFontSize = fv(0.58); nameFontSize = fvn(0.63); }
    else if (n <= 40) { valFontSize = fv(0.54); nameFontSize = fvn(0.58); }
    else { valFontSize = fv(0.50); nameFontSize = fvn(0.54); }
  }

  const chartHeight = (isMobile && isLandscape) ? '180px' : '280px';
  const marginBot = (isMobile && isLandscape) ? '70px' : '86px';
  const shortFmt = isMobile && isLandscape;
  // Valor sempre vertical — evita sobreposição em todos os modos incluindo portrait mobile
  const valVertical = true;

  const subTipo = window._graficoChanceSubTipo || 'vencedor';
  const _tipText = subTipo === 'top5'
    ? "Probabilidade de terminar entre os 5 primeiros colocados ao final da Copa, estimada via 20.000 simulações Monte Carlo. Resultados oficiais são fixos; jogos futuros são sorteados pelo modelo Poisson. Empates são resolvidos pelos critérios oficiais de desempate (placares exatos → resultados corretos); só entram juntos no Top 5 quando o empate persiste nesses critérios também."
    : "Probabilidade de terminar em 1.º ao final da Copa, estimada via 20.000 simulações Monte Carlo. Resultados oficiais são fixos; jogos futuros são sorteados pelo modelo Poisson, resolvendo o bracket fase a fase. Palpites não registrados são amostrados com a mesma distribuição do modelo.";

  let h = '<div class="card" style="padding:20px 10px;">';

  // Cabeçalho com dropdown integrado — botão pill estilizado
  const _labelAtual = subTipo === 'top5' ? 'Chance de ficar no top 5' : 'Chance de ganhar o bolão';
  h += `<div style="text-align:center;margin-bottom:14px;position:relative;display:flex;align-items:center;justify-content:center;gap:6px">
    <div style="position:relative;display:inline-block">
      <button onclick="document.getElementById('chance-tipo-dd').style.display=document.getElementById('chance-tipo-dd').style.display==='block'?'none':'block';event.stopPropagation()"
        style="display:inline-flex;align-items:center;gap:5px;background:rgba(var(--dourado-rgb,212,175,55),.12);border:1.5px solid var(--dourado);border-radius:20px;padding:4px 12px 4px 10px;cursor:pointer;color:var(--dourado);font-size:.82rem;font-weight:700;font-family:inherit;outline:none;transition:background .2s"
        onmouseover="this.style.background='rgba(212,175,55,.22)'" onmouseout="this.style.background='rgba(212,175,55,.12)'">
        ⚙️ <span>${_labelAtual}</span> <span style="font-size:.65rem;opacity:.8">▾</span>
      </button>
      <div id="chance-tipo-dd" onclick="event.stopPropagation()" style="display:none;position:absolute;top:calc(100% + 6px);left:50%;transform:translateX(-50%);background:var(--card,#1e293b);border:1.5px solid var(--borda2,rgba(255,255,255,.15));border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.5);z-index:200;min-width:200px;overflow:hidden">
        <div onclick="window._graficoChanceSubTipo='vencedor';document.getElementById('chance-tipo-dd').style.display='none';renderAbaAtiva()"
          style="padding:10px 16px;cursor:pointer;font-size:.82rem;color:${subTipo==='vencedor'?'var(--dourado)':'var(--texto)'};font-weight:${subTipo==='vencedor'?'700':'400'};background:${subTipo==='vencedor'?'rgba(212,175,55,.1)':'transparent'};transition:background .15s"
          onmouseover="this.style.background='rgba(212,175,55,.15)'" onmouseout="this.style.background='${subTipo==='vencedor'?'rgba(212,175,55,.1)':'transparent'}'">🏆 Chance de ganhar o bolão</div>
        <div onclick="window._graficoChanceSubTipo='top5';document.getElementById('chance-tipo-dd').style.display='none';renderAbaAtiva()"
          style="padding:10px 16px;cursor:pointer;font-size:.82rem;color:${subTipo==='top5'?'var(--dourado)':'var(--texto)'};font-weight:${subTipo==='top5'?'700':'400'};background:${subTipo==='top5'?'rgba(212,175,55,.1)':'transparent'};transition:background .15s"
          onmouseover="this.style.background='rgba(212,175,55,.15)'" onmouseout="this.style.background='${subTipo==='top5'?'rgba(212,175,55,.1)':'transparent'}'">🎖️ Chance de ficar no top 5</div>
      </div>
    </div>
    <span onclick="_toggleProjecaoTooltip(event)" style="cursor:pointer;font-size:.8rem;opacity:.7" title="Informações e ajuda">ℹ️</span>
    <div id="proj-tooltip" style="display:none;position:absolute;top:calc(100% + 8px);left:50%;transform:translateX(-50%);background:#1e293b;color:#e2e8f0;font-size:.72rem;line-height:1.5;padding:10px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);max-width:280px;text-align:left;z-index:999;box-shadow:0 6px 20px rgba(0,0,0,0.5)">
      ${_tipText}
    </div>
  </div>`;
  // Fechar dropdown ao clicar fora
  if (!window._chanceDdListenerOk) {
    window._chanceDdListenerOk = true;
    document.addEventListener('click', () => { const d = document.getElementById('chance-tipo-dd'); if(d) d.style.display='none'; });
  }

  let minWidthStyle = '';
  if (needsScroll) {
    const minPx = n * (barWidth + gap) + gap;
    h += `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">`;
    minWidthStyle = `min-width:${minPx}px;`;
  }

  h += `<div style="display:flex;align-items:flex-end;gap:${gap}px;height:${chartHeight};padding-bottom:10px;border-bottom:1px solid var(--borda);margin-bottom:${marginBot};position:relative;${minWidthStyle}">`;

  const rankingHumanosC = ranking.filter(a => !a.isModelo);
  for (let _ci = 0; _ci < ranking.length; _ci++) {
    const a = ranking[_ci];
    if (a.isModelo) continue; // Modelo não tem chance calculada vs humanos — não exibir
    const val = chances[a.id] || 0;
    const perc = (val / maxVal) * 100;
    const cor = _rainbowColor(rankingHumanosC.indexOf(a), rankingHumanosC.length);
    const valFmt = shortFmt ? Math.round(val) + '%' : val.toFixed(1) + '%';
    // Posição entre humanos
    const posNum = a.posicao;
    const posStr = posNum !== null ? `${posNum}\u00ba- ` : '';
    h += `<div style="display:flex;flex-direction:column;align-items:center;flex:1;min-width:0;position:relative;height:100%;justify-content:flex-end;z-index:1">`;
    const scaleFactor = (isMobile && !isLandscape) ? 0.82 : 0.90;
    const barHeight = Math.max(2, perc * scaleFactor);
    h += `<div style="position:absolute;bottom:calc(${barHeight.toFixed(1)}% + 4px);left:50%;writing-mode:vertical-rl;transform:translateX(-50%) rotate(180deg);font-size:${valFontSize};font-weight:800;color:var(--texto);white-space:nowrap">${valFmt}</div>`;
    h += `<div style="width:${barWidth}px;background:${cor};border-radius:4px 4px 0 0;height:${barHeight.toFixed(1)}%;transition:height 0.4s ease;box-shadow:0 -2px 10px ${cor}60"></div>`;
    h += `<div style="position:absolute;top:calc(100% + 8px);left:50%;writing-mode:vertical-rl;transform:translateX(-38%) rotate(180deg);font-size:${nameFontSize};color:var(--texto2);font-weight:600;white-space:nowrap">${posStr}${a.nome}</div>`;
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
  h += `<button onclick="window._graficoOrdem='rank';renderAbaAtiva()" style="${_ordemC === 'rank' ? _btnAtivoC : _btnBaseC}">Rank</button>`;
  h += `<button onclick="window._graficoOrdem='az';renderAbaAtiva()" style="${_ordemC === 'az' ? _btnAtivoC : _btnBaseC}">A → Z</button>`;
  h += `</div>`;
  h += `<button onclick="_graficoExportarJPG()" style="${_btnBaseC}">📷 Exportar JPG</button>`;
  h += `</div>`;
  h += '</div>';
  return h;
}

// Toggle do tooltip de Projeção
window._toggleProjecaoTooltip = function (e) {
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

  // Ordenação: 'rank' (classificação) ou 'az' (A-Z)
  // Para pts e pct, preserva a ordem exata do rankingCompleto (já vem com desempates resolvidos).
  // Para outras métricas, rank ordena pelo valor da própria métrica.
  const ordemAtiva = window._graficoOrdem || 'rank';
  if (ordemAtiva === 'az') {
    ranking = [...ranking].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  } else if (metricaAtiva === 'pts' || metricaAtiva === 'pct') {
    // mantém a ordem já estabelecida pelo rankingCompleto
  } else {
    ranking = [...ranking].sort((a, b) => b[metricaAtiva] - a[metricaAtiva]);
  }

  const maxVal = Math.max(1, ...ranking.map(a => a[metricaAtiva]));

  // ── Dimensões responsivas ──
  const n = ranking.length;
  const isMobile = window.innerWidth <= 768;
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
    barWidth = Math.max(14, Math.min(24, targetColW - 2));
    gap = 2; // gap mínimo — barras quase encostadas
    // pct mostra XX.X% (mais largo) — usar fonte menor igual ao gráfico Projeção
    valFontSize = (metricaAtiva === 'pct') ? '.52rem' : '.68rem';
    nameFontSize = '.70rem';

    const minPx = n * (barWidth + gap) + gap;
    needsScroll = minPx > screenPx;

  } else {
    // ── LANDSCAPE MOBILE + DESKTOP: tudo numa tela, sem scroll ──
    needsScroll = false;

    const margemPx = isMobile ? 40 : 80;
    const disponivelPx = window.innerWidth - margemPx;

    // gap mínimo de 1px — barras quase encostadas para caber 70 apostadores
    // barWidth = (disponível / n) - 1, com piso por legibilidade
    const perColuna = disponivelPx / n;
    if (isMobile && isLandscape) {
      barWidth = Math.max(4, Math.floor(perColuna - 1));
    } else {
      // Desktop: barras um pouco maiores, mas comprimem se necessário
      if (n <= 6) barWidth = 36;
      else if (n <= 10) barWidth = 30;
      else if (n <= 15) barWidth = 24;
      else if (n <= 20) barWidth = 18;
      else if (n <= 28) barWidth = 14;
      else barWidth = Math.max(6, Math.floor(perColuna - 1));
    }

    gap = Math.max(1, Math.floor(perColuna - barWidth));

    // Fontes adaptativas — valor vertical, 0.90 landscape, 1.13 desktop (+13%)
    const fScaleVal = (isMobile && isLandscape) ? 0.90 : 1.21;
    const fScaleName = (isMobile && isLandscape) ? 0.90 : 1.21;
    const fv = (base) => (base * fScaleVal).toFixed(2) + 'rem';
    const fvn = (base) => (base * fScaleName).toFixed(2) + 'rem';

    if (n <= 8) { valFontSize = fv(0.78); nameFontSize = fvn(0.80); }
    else if (n <= 12) { valFontSize = fv(0.73); nameFontSize = fvn(0.75); }
    else if (n <= 18) { valFontSize = fv(0.68); nameFontSize = fvn(0.70); }
    else if (n <= 24) { valFontSize = fv(0.64); nameFontSize = fvn(0.66); }
    else if (n <= 40) { valFontSize = fv(0.58); nameFontSize = fvn(0.60); }
    else { valFontSize = fv(0.52); nameFontSize = fvn(0.54); }
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
  const marginBot = (isMobile && isLandscape) ? '70px' : '86px';
  const shortFmt = isMobile && isLandscape;
  // Valor rotacionado (vertical) em landscape/desktop E portrait mobile para evitar sobreposição
  const valVertical = true; // sempre vertical — evita sobreposição em todos os modos

  h += `<div style="display:flex;align-items:flex-end;gap:${gap}px;height:${chartHeight};padding-bottom:10px;border-bottom:1px solid var(--borda);margin-bottom:${marginBot};position:relative;${minWidthStyle}">`;
  // Índice arco-íris apenas entre apostadores não-Modelo (ordem no ranking filtrado)
  const rankingHumanos = ranking.filter(a => !a.isModelo);
  for (let _bi = 0; _bi < ranking.length; _bi++) {
    const a = ranking[_bi];
    const val = a[metricaAtiva];
    const perc = (val / maxVal) * 100;
    const cor = a.isModelo ? '#b8cfe8' : _rainbowColor(rankingHumanos.indexOf(a), rankingHumanos.length);
    // Posição: apenas para não-Modelo (posição real no ranking filtrado entre humanos)
    const posNum = a.isModelo ? null : a.posicao;
    const posStr = posNum !== null ? `${posNum}\u00ba- ` : '';
    const nomeBarra = a.isModelo
      ? `<span style='font-weight:normal;color:#b8cfe8'>${a.nome}</span>`
      : `${posStr}${a.nome}`;
    h += `<div style="display:flex;flex-direction:column;align-items:center;flex:1;min-width:0;position:relative;height:100%;justify-content:flex-end;z-index:1">`;
    // Label vertical ancorado logo acima do topo da barra (sempre vertical)
    const scaleFactor = (isMobile && !isLandscape) ? 0.82 : 0.90;
    const barHeight = Math.max(2, perc * scaleFactor);
    h += `<div style="position:absolute;bottom:calc(${barHeight.toFixed(1)}% + 4px);left:50%;writing-mode:vertical-rl;transform:translateX(-50%) rotate(180deg);font-size:${valFontSize};font-weight:800;color:var(--texto);white-space:nowrap">${_fmtVal(metricaAtiva, val, shortFmt)}</div>`;
    h += `<div style="width:${barWidth}px;background:${cor};border-radius:4px 4px 0 0;height:${barHeight.toFixed(1)}%;transition:height 0.4s ease;box-shadow:0 -2px 10px ${cor}60"></div>`;
    // Nome centralizado abaixo da barra
    h += `<div style="position:absolute;top:calc(100% + 8px);left:50%;writing-mode:vertical-rl;transform:translateX(-38%) rotate(180deg);font-size:${nameFontSize};color:var(--texto2);font-weight:600;white-space:nowrap">${nomeBarra}</div>`;
    h += '</div>';
  }

  h += '</div>';
  if (needsScroll) h += '</div>'; // fecha wrapper scroll

  // ── Botões de ação: ordenação + exportar ──
  const btnBase = 'background:var(--fundo2);border:1.5px solid var(--borda2);border-radius:var(--radius-sm);padding:8px 14px;color:var(--texto);font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit';
  const btnAtivo = 'background:var(--fundo2);border:1.5px solid var(--dourado);border-radius:var(--radius-sm);padding:8px 14px;color:var(--dourado);font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit';
  h += `<div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:12px;flex-wrap:wrap">`;
  h += `<div style="display:flex;gap:4px;background:rgba(255,255,255,0.04);border-radius:var(--radius-sm);padding:3px">`;
  h += `<button onclick="window._graficoOrdem='rank';renderAbaAtiva()" style="${ordemAtiva === 'rank' ? btnAtivo : btnBase}">Rank</button>`;
  h += `<button onclick="window._graficoOrdem='az';renderAbaAtiva()" style="${ordemAtiva === 'az' ? btnAtivo : btnBase}">A → Z</button>`;
  h += `</div>`;
  h += `<button onclick="_graficoExportarJPG()" style="${btnBase}">📷 Exportar JPG</button>`;
  h += `</div>`;
  h += '</div>';
  return h;
}

// ── Gráfico de Evolução ────────────────────────────────────────────────────
function _renderEvolucao(res, pals, apos, rankingCompleto) {
  const filtro = window._graficoFiltroApos;
  const isDefault = !window._graficoFiltroCustomizado;
  const top10Ids = isDefault ? new Set(rankingCompleto.slice(0, 10).map(r => r.id)) : null;
  const modeloGrafEv = window.getModelo ? window.getModelo() : null;

  const aposFiltrados = apos.filter(a => isDefault ? top10Ids.has(a.id) : filtro.has(a.id));
  if (!isDefault && !aposFiltrados.length && !filtro.has("Modelo")) return '<div class="card" style="text-align:center;color:var(--texto2);padding:30px">Nenhum apostador selecionado.</div>';
  if (isDefault && !aposFiltrados.length && (modeloGrafEv && !top10Ids.has("Modelo"))) return '<div class="card" style="text-align:center;color:var(--texto2);padding:30px">Nenhum apostador selecionado.</div>';

  const jogosComRes = (window.SCHEDULE || [])
    .filter(j => res[j.id] && res[j.id].homeGoals !== undefined)
    .sort((a, b) => new Date(a.utc) - new Date(b.utc));

  const espOficiais = window.BRACKET.extrairEspeciaisOficiais(res, APP.bracket || {});
  const temEspeciais = !!(espOficiais.campeao || espOficiais.vice || espOficiais.terceiro);

  if (!jogosComRes.length && !temEspeciais)
    return '<div class="card" style="text-align:center;color:var(--texto2);padding:30px">Nenhum resultado oficial ainda.</div>';

  const humanos = rankingCompleto.filter(x => !x.isModelo);

  const series = aposFiltrados.map(a => {
    const hIdx = humanos.findIndex(r => r.id === a.id);
    const cor = _EVOLUCAO_CORES_DISTINTAS[hIdx % _EVOLUCAO_CORES_DISTINTAS.length];
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
  if (modeloGrafEv && (isDefault ? top10Ids.has("Modelo") : filtro.has("Modelo")) && APP._modeloCarregado) {
    const corMod = '#b8cfe8';
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
  const isMobPortrait = !isDesktop && window.innerWidth <= window.innerHeight;
  const W = isDesktop ? Math.max(800, Math.min(window.innerWidth - 60, 1400)) : 600;
  // Full-viewport height: mobile portrait usa praticamente a tela toda (só header + tabs ~130px)
  const viewH = window.innerHeight || 700;
  const offsetPx = isDesktop ? 240 : (isMobPortrait ? 130 : 180);
  const H = Math.max(isMobPortrait ? 400 : 320, viewH - offsetPx);
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
    svg += `<line x1="${PAD.left}" y1="${y.toFixed(1)}" x2="${PAD.left + chartW}" y2="${y.toFixed(1)}" stroke="var(--borda)" stroke-width="1" stroke-dasharray="4,4"/>`;
    svg += `<text x="${PAD.left - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--texto2)">${v.toFixed(0)}</text>`;
  }

  const step = Math.max(1, Math.floor(nMatches / 8));
  // Começamos em i=1 para pular o rótulo do ponto zero e mostrar J1, J2...
  for (let i = 1; i <= nMatches; i += step) {
    const x = xPos(i).toFixed(1);
    svg += `<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${PAD.top + chartH}" stroke="var(--borda)" stroke-width="1" opacity="0.4"/>`;
    svg += `<text x="${x}" y="${PAD.top + chartH + 14}" text-anchor="middle" font-size="10" fill="var(--texto2)">J${i}</text>`;
  }
  // Garantir que o último rótulo do jogo apareça se o step pulá-lo
  if (nMatches > 0 && nMatches % step !== 0) {
    const x = xPos(nMatches).toFixed(1);
    svg += `<text x="${x}" y="${PAD.top + chartH + 14}" text-anchor="middle" font-size="10" fill="var(--texto2)">J${nMatches}</text>`;
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
    svg += `<text x="${(lastX + 8).toFixed(1)}" y="${(lastY + 4).toFixed(1)}" font-size="10" font-weight="${fw}" fill="${s.cor}">${s.nome}</text>`;
  }

  svg += '</svg>';

  // Legend: hidden on mobile (names already on chart lines)
  const isMobLeg = window.innerWidth <= 600;
  let legenda = '';
  if (!isMobLeg) {
    legenda = '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;justify-content:center">';
    for (const s of series) {
      const ultimo = s.pontos[s.pontos.length - 1] ?? 0;
      legenda += `<div style="display:flex;align-items:center;gap:5px;font-size:.72rem;font-weight:600;color:var(--texto)">
        <div style="width:20px;height:3px;background:${s.cor};border-radius:2px"></div>
        ${s.nome} <span style="color:var(--texto2);font-weight:400">${ultimo} pts</span>
      </div>`;
    }
    legenda += '</div>';
  }

  const _btnBaseEv = 'background:var(--fundo2);border:1.5px solid var(--borda2);border-radius:var(--radius-sm);padding:8px 14px;color:var(--texto);font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit';
  const exportBtn = `<div style="display:flex;justify-content:center;margin-top:12px"><button onclick="_graficoExportarEvolucaoJPG()" style="${_btnBaseEv}">📷 Exportar JPG</button></div>`;

  return `<div class="card" style="padding:16px;overflow-x:auto">${svg}${legenda}${exportBtn}</div>`;
}

// ── Export JPG · Evolução ──────────────────────────────────────────────────
window._graficoExportarEvolucaoJPG = function () {
  const res = getResultados();
  const apos = APP.apostadores || [];
  const pals = APP.palpites || {};

  // Rebuild ranking (cores consistentes)
  const espOficiaisGraf = window.BRACKET.extrairEspeciaisOficiais(res, APP.bracket || {});
  let rankingCompleto = apos.map(a => {
    const st = calcularPontosApostador(pals[a.id] || {}, res, a, espOficiaisGraf);
    return { id: a.id, nome: (a.apelido || a.nome || '?').substring(0, 14), pts: st.total, isModelo: false };
  }).sort((a, b) => b.pts - a.pts);

  const modeloGraf = window.getModelo ? window.getModelo() : null;
  if (modeloGraf && APP._modeloCarregado) {
    const stMod = calcularPontosApostador(APP.palpitesModelo || {}, res, modeloGraf, espOficiaisGraf);
    const itemMod = { id: modeloGraf.id, nome: 'Modelo', pts: stMod.total, isModelo: true };
    const insertIdx = rankingCompleto.findIndex(a => a.pts < stMod.total);
    if (insertIdx === -1) rankingCompleto.push(itemMod);
    else rankingCompleto.splice(insertIdx, 0, itemMod);
  }

  const filtro = window._graficoFiltroApos;
  const isDefault = !window._graficoFiltroCustomizado;
  const top10Ids = isDefault ? new Set(rankingCompleto.slice(0, 10).map(r => r.id)) : null;
  const humanos = rankingCompleto.filter(x => !x.isModelo);

  // Export: usa o mesmo filtro ativo da tela
  const aposFiltrados = apos.filter(a => isDefault ? top10Ids.has(a.id) : filtro.has(a.id));

  const jogosComRes = (window.SCHEDULE || [])
    .filter(j => res[j.id] && res[j.id].homeGoals !== undefined)
    .sort((a, b) => new Date(a.utc) - new Date(b.utc));

  const espOficiais = window.BRACKET.extrairEspeciaisOficiais(res, APP.bracket || {});
  const temEspeciais = !!(espOficiais.campeao || espOficiais.vice || espOficiais.terceiro);

  if (!jogosComRes.length && !temEspeciais) { alert('Nenhum resultado oficial ainda.'); return; }

  // Build series
  const series = aposFiltrados.map(a => {
    const hIdx = humanos.findIndex(r => r.id === a.id);
    const cor = _EVOLUCAO_CORES_DISTINTAS[hIdx % _EVOLUCAO_CORES_DISTINTAS.length];
    const pal = pals[a.id] || {};
    let acumulado = 0;
    const pontos = [0];
    jogosComRes.forEach(j => {
      const p = pal[j.id], r = res[j.id];
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
    return { nome: (a.apelido || a.nome || '?').substring(0, 14), cor, pontos, isModelo: false };
  });

  // Inserir Modelo se está no filtro ativo
  if (modeloGraf && APP._modeloCarregado && filtro && filtro.has('Modelo')) {
    const corMod = '#b8cfe8';
    const palMod = APP.palpitesModelo || {};
    let acc = 0;
    const pts = [0];
    jogosComRes.forEach(j => {
      const p = palMod[j.id], r = res[j.id];
      if (p && r && p.homeGoals !== undefined) {
        const br = calcularPontosBrutos(p, r);
        acc += aplicarFator(br.total_bruto, j.fase);
      }
      pts.push(parseFloat(acc.toFixed(1)));
    });
    if (temEspeciais) {
      const { total_especiais } = calcularPontosEspeciais(modeloGraf, espOficiais.campeao, espOficiais.vice, espOficiais.terceiro);
      acc += total_especiais;
      pts.push(parseFloat(acc.toFixed(1)));
    }
    series.push({ nome: 'Modelo', cor: '#b8cfe8', pontos: pts, isModelo: true });
  }

  if (!series.length) { alert('Nenhum apostador para exportar.'); return; }

  // ── Canvas ──
  // Portrait format — stretches vertically for better readability
  const PAD = { top: 50, right: 130, bottom: 60, left: 55 };
  const W = 720;
  const H = 1280;
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const nMatches = jogosComRes.length;
  const nPoints = Math.max(...series.map(s => s.pontos.length), 2);
  const maxPts = Math.max(1, ...series.map(s => Math.max(...s.pontos, 0)));

  const xPos = i => PAD.left + (i / (nPoints - 1)) * chartW;
  const yPos = v => PAD.top + chartH - (v / maxPts) * chartH;

  const canvas = document.createElement('canvas');
  const DPR = 3;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);

  // Fundo
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, W, H);

  // Título
  ctx.fillStyle = '#f1f5f9';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Bolão Copa 2026 · Evolução de Pontos', W / 2, 30);

  // Grid horizontal
  for (let i = 0; i <= 4; i++) {
    const v = (maxPts / 4) * i;
    const y = yPos(v);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + chartW, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#64748b';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(v.toFixed(0), PAD.left - 6, y + 4);
  }

  // Grid vertical + labels J
  const step = Math.max(1, Math.floor(nMatches / 10));
  for (let i = 1; i <= nMatches; i += step) {
    const x = xPos(i);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, PAD.top + chartH); ctx.stroke();
    ctx.fillStyle = '#64748b';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`J${i}`, x, PAD.top + chartH + 16);
  }
  if (nMatches > 0 && nMatches % step !== 0) {
    const x = xPos(nMatches);
    ctx.fillStyle = '#64748b'; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`J${nMatches}`, x, PAD.top + chartH + 16);
  }

  // Linhas das séries
  for (const s of series) {
    if (!s.pontos.length) continue;
    ctx.strokeStyle = s.cor;
    ctx.lineWidth = s.isModelo ? 2.5 : 2.5;
    ctx.setLineDash(s.isModelo ? [6, 3] : []);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    s.pontos.forEach((v, i) => {
      const x = xPos(i), y = yPos(v);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // Círculo no último ponto
    const lastIdx = s.pontos.length - 1;
    const lx = xPos(lastIdx), ly = yPos(s.pontos[lastIdx]);
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = s.cor; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI * 2); ctx.stroke();

    // Label à direita
    ctx.fillStyle = s.cor;
    ctx.font = `${s.isModelo ? 'normal' : 'bold'} 10px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(`${s.nome} ${s.pontos[lastIdx]}`, lx + 8, ly + 4);
  }

  // Eixo Y (linha vertical esquerda)
  ctx.strokeStyle = '#334155'; ctx.lineWidth = 1; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(PAD.left, PAD.top); ctx.lineTo(PAD.left, PAD.top + chartH); ctx.stroke();

  // Download
  const link = document.createElement('a');
  link.download = 'bolao-copa-2026-evolucao.jpg';
  link.href = canvas.toDataURL('image/jpeg', 0.95);
  link.click();
};

// ── Macaco Cego ────────────────────────────────────────────────────────────

window._graficoIrMacaco = function () {
  window._graficoMetrica = 'macaco';
  renderAbaAtiva();
  if (!window._graficoMacacoCache) {
    setTimeout(_graficoRodarMacaco, 0);
  }
};

function _renderMacacoLoading() {
  return `<div class="card" id="macaco-loading" style="text-align:center;padding:40px 20px">
    <div style="font-size:2rem;margin-bottom:10px">🐒</div>
    <div style="font-size:.9rem;font-weight:700;color:var(--dourado)">Simulando 10.000 macacos…</div>
    <div style="font-size:.75rem;color:var(--texto2);margin-top:6px">Cada macaco chuta 1-0, 1-1 ou 0-1 com chance igual</div>
  </div>`;
}

/**
 * Simula 10.000 macacos cegos, cada um chutando todos os jogos com placar
 * aleatório entre {1-0, 1-1, 0-1} com probabilidade uniforme (1/3 cada).
 * Retorna { media, sigma } em pontos usando a mesma engine de pontuação real.
 */
function _graficoRodarMacaco() {
  const N_MACACOS = 10000;
  const res = getResultados();
  const schedule = window.SCHEDULE || [];
  const cfgRaw = window.CONFIG && window.CONFIG.pontuacao;
  if (!cfgRaw) { _graficoExibirMacaco({ media: 0, sigma: 0 }); return; }

  // Lookup tables de pontuação (inteiros ×10, igual ao Monte Carlo)
  const cfgOt = {
    limiar: cfgRaw.limiar_placar_alto || 4,
    pts_exatoAlto: {}, pts_exatoBaixo: {}, pts_diff: {}, pts_umTime: {}, pts_base: {}
  };
  const bExA = cfgRaw.bonus_placar_exato_alto || 0;
  const bExB = cfgRaw.bonus_placar_exato_baixo || 0;
  const bDif = cfgRaw.bonus_diferenca_gols || 0;
  const bUmT = cfgRaw.bonus_gols_um_time || 0;
  const base = cfgRaw.resultado_base || 0;
  const FASES = ['grupos', '16avos', 'oitavas', 'quartas', 'semis', 'terceiro', 'final'];
  for (const f of FASES) {
    const ft = cfgRaw.fatores_fase[f] || 1;
    cfgOt.pts_exatoAlto[f] = Math.round((base + bExA) * ft * 10);
    cfgOt.pts_exatoBaixo[f] = Math.round((base + bExB) * ft * 10);
    cfgOt.pts_diff[f] = Math.round((base + bDif) * ft * 10);
    cfgOt.pts_umTime[f] = Math.round((base + bUmT) * ft * 10);
    cfgOt.pts_base[f] = Math.round(base * ft * 10);
  }

  function _pts(palH, palA, resH, resA, f) {
    const resEf = resH > resA ? 1 : resH < resA ? -1 : 0;
    const resPal = palH > palA ? 1 : palH < palA ? -1 : 0;
    if (resPal !== resEf) return 0;
    if (palH === resH && palA === resA) {
      return (resH + resA) >= cfgOt.limiar ? cfgOt.pts_exatoAlto[f] : cfgOt.pts_exatoBaixo[f];
    }
    const dPal = palH - palA, dRes = resH - resA;
    if (Math.abs(dPal) === Math.abs(dRes)) return cfgOt.pts_diff[f];
    if (palH === resH || palA === resA) return cfgOt.pts_umTime[f];
    return cfgOt.pts_base[f];
  }

  // Apenas jogos com resultado oficial
  const jogosOficiais = schedule.filter(j => {
    const r = res[j.id];
    return r && r.homeGoals !== undefined;
  });

  if (!jogosOficiais.length) { _graficoExibirMacaco({ media: 0, sigma: 0 }); return; }

  // Placares possíveis para o macaco cego
  const CHUTES = [{ h: 1, a: 0 }, { h: 1, a: 1 }, { h: 0, a: 1 }];

  // Simular
  const totais = new Float64Array(N_MACACOS);
  for (let m = 0; m < N_MACACOS; m++) {
    let acc = 0;
    for (const j of jogosOficiais) {
      const r = res[j.id];
      const chute = CHUTES[(Math.random() * 3) | 0];
      acc += _pts(chute.h, chute.a, Number(r.homeGoals), Number(r.awayGoals), j.fase);
    }
    totais[m] = acc / 10; // converter de inteiro ×10 para pontos reais
  }

  // Média e desvio padrão
  let sum = 0;
  for (let m = 0; m < N_MACACOS; m++) sum += totais[m];
  const media = sum / N_MACACOS;
  let varSum = 0;
  for (let m = 0; m < N_MACACOS; m++) varSum += (totais[m] - media) ** 2;
  const sigma = Math.sqrt(varSum / N_MACACOS);

  window._graficoMacacoCache = { media, sigma };
  _graficoExibirMacaco({ media, sigma });
}

function _graficoExibirMacaco(cache) {
  const el = document.getElementById('aba-grafico');
  if (!el) return;
  // Rebuild rankingCompleto
  const res = getResultados();
  const apos = APP.apostadores || [];
  const pals = APP.palpites || {};
  const espOficiaisGraf = window.BRACKET.extrairEspeciaisOficiais(res, APP.bracket || {});
  const baseRanking = gerarRanking(pals, res, apos, espOficiaisGraf);
  const posMap = {};
  baseRanking.forEach(item => {
    const pId = item.participante.id || item.participante.token;
    if (pId) posMap[pId] = item.posicao;
  });

  let rankingCompleto = apos.map(a => {
    const st = calcularPontosApostador(pals[a.id] || {}, res, a, espOficiaisGraf);
    const pId = a.id || a.token;
    return {
      id: a.id,
      nome: (a.apelido || a.nome || '?').substring(0, 14),
      pts: st.total,
      isModelo: false,
      posicao: pId ? posMap[pId] : null
    };
  }).sort((a, b) => b.pts - a.pts);

  // Inserir Modelo na posição correta do ranking
  const modeloGrafM = window.getModelo ? window.getModelo() : null;
  if (modeloGrafM && APP._modeloCarregado) {
    const stMod = calcularPontosApostador(APP.palpitesModelo || {}, res, modeloGrafM, espOficiaisGraf);
    const itemMod = { id: modeloGrafM.id, nome: 'Modelo', pts: stMod.total, isModelo: true };
    const insertIdx = rankingCompleto.findIndex(a => a.pts < stMod.total);
    if (insertIdx === -1) rankingCompleto.push(itemMod);
    else rankingCompleto.splice(insertIdx, 0, itemMod);
  }

  const loading = document.getElementById('macaco-loading');
  if (loading) {
    loading.outerHTML = _renderMacaco(rankingCompleto, cache);
  }
}

function _renderMacaco(rankingCompleto, cache) {
  const filtro = window._graficoFiltroApos;
  let ranking = rankingCompleto.filter(a => filtro.has(a.id));
  if (!ranking.length) return '<div class="card" style="text-align:center;color:var(--texto2);padding:30px">Nenhum apostador selecionado.</div>';

  // Ordenação: rank preserva ordem da classificação (rankingCompleto já ordenado com desempates)
  const _ordemMrank = window._graficoOrdem || 'rank';
  if (_ordemMrank === 'az') {
    ranking = [...ranking].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }
  // 'rank': mantém a ordem do rankingCompleto (já com desempates resolvidos)

  const { media, sigma } = cache;
  const maxVal = Math.max(1, ...ranking.map(a => a.pts), media + sigma * 1.5);

  const n = ranking.length;
  const isMobile = window.innerWidth <= 768;
  const isLandscape = window.innerWidth > window.innerHeight;

  let gap, barWidth, valFontSize, nameFontSize, needsScroll;

  if (isMobile && !isLandscape) {
    const targetVisible = 12;
    const screenPx = window.innerWidth - 40;
    const targetColW = Math.floor(screenPx / targetVisible);
    barWidth = Math.max(14, Math.min(24, targetColW - 2));
    gap = 2;
    valFontSize = '.68rem';
    nameFontSize = '.70rem';
    needsScroll = n * (barWidth + gap) + gap > screenPx;
  } else {
    needsScroll = false;
    const margemPx = isMobile ? 40 : 80;
    const disponivelPx = window.innerWidth - margemPx;
    const perColuna = disponivelPx / n;
    barWidth = isMobile && isLandscape
      ? Math.max(4, Math.floor(perColuna - 1))
      : n <= 6 ? 36 : n <= 10 ? 30 : n <= 15 ? 24 :
        n <= 20 ? 18 : n <= 28 ? 14 : Math.max(6, Math.floor(perColuna - 1));
    gap = Math.max(1, Math.floor(perColuna - barWidth));
    // Mesmas fontes que _renderBarras: 0.90 landscape, 1.13 desktop (+13%)
    const fScaleVal = (isMobile && isLandscape) ? 0.90 : 1.21;
    const fScaleName = (isMobile && isLandscape) ? 0.90 : 1.21;
    const fv = (base) => (base * fScaleVal).toFixed(2) + 'rem';
    const fvn = (base) => (base * fScaleName).toFixed(2) + 'rem';
    if (n <= 8) { valFontSize = fv(0.78); nameFontSize = fvn(0.80); }
    else if (n <= 12) { valFontSize = fv(0.73); nameFontSize = fvn(0.75); }
    else if (n <= 18) { valFontSize = fv(0.68); nameFontSize = fvn(0.70); }
    else if (n <= 24) { valFontSize = fv(0.64); nameFontSize = fvn(0.66); }
    else if (n <= 40) { valFontSize = fv(0.58); nameFontSize = fvn(0.60); }
    else { valFontSize = fv(0.52); nameFontSize = fvn(0.54); }
  }

  const chartHeight = (isMobile && isLandscape) ? '180px' : '280px';
  const chartHeightPx = (isMobile && isLandscape) ? 180 : 280;
  const marginBot = (isMobile && isLandscape) ? '70px' : '86px';
  // Sempre vertical — evita sobreposição em todos os modos incluindo portrait mobile
  const valVertical = true;

  // Percentuais das linhas do macaco (0% = topo, 100% = base do chart)
  const _mScaleFactor = (isMobile && !isLandscape) ? 0.82 : 0.90;
  // O container tem padding-bottom:10px; as barras alinham ao fundo do conteúdo (10px acima da borda).
  // top% de uma linha = basePerc - (val/maxVal * scaleFactor * 100)
  // onde basePerc = (chartHeightPx - 10) / chartHeightPx * 100
  const _mChartPx = (isMobile && isLandscape) ? 180 : 280;
  const _mBasePerc = (_mChartPx - 10) / _mChartPx * 100;
  const _mLinePerc = (val) => Math.max(0, Math.min(100, _mBasePerc - (val / maxVal) * _mScaleFactor * 100));
  const mediaPerc = _mLinePerc(media);
  const sigmaHiPerc = _mLinePerc(media + sigma);
  const sigmaLoPerc = _mLinePerc(Math.max(0, media - sigma));

  let h = '<div class="card" style="padding:20px 10px;">';

  // Cabeçalho simplificado: ícone maior + pontos + título
  const COR_MACACO_LINHA = '#8B5E3C';
  h += `<div style="text-align:center;margin-bottom:14px">
    <span style="font-size:1.5rem">🐒</span>
    <span style="font-size:.90rem;font-weight:800;color:${COR_MACACO_LINHA};margin-left:4px">${media.toFixed(1)} pts</span>
    <span style="font-size:.85rem;font-weight:700;color:var(--dourado);margin-left:6px">Macaco Médio</span>
  </div>`;

  let minWidthStyle = '';
  if (needsScroll) {
    const minPx = n * (barWidth + gap) + gap;
    h += `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">`;
    minWidthStyle = `min-width:${minPx}px;`;
  }

  // Wrapper relativo para posicionar os labels do eixo Y à direita
  h += `<div style="position:relative;">`;
  h += `<div style="display:flex;align-items:flex-end;gap:${gap}px;height:${chartHeight};padding-bottom:10px;border-bottom:1px solid var(--borda);margin-bottom:${marginBot};position:relative;${minWidthStyle}">`;

  // ── Barras dos apostadores (cores arco-íris, igual pontos, z-index:1) ──
  const rankingHumanosM = ranking.filter(a => !a.isModelo);
  for (let _mi = 0; _mi < ranking.length; _mi++) {
    const a = ranking[_mi];
    const val = a.pts;
    const perc = (val / maxVal) * 100;
    const cor = a.isModelo ? '#b8cfe8' : _rainbowColor(rankingHumanosM.indexOf(a), rankingHumanosM.length);
    const posNum = a.isModelo ? null : a.posicao;
    const posStr = posNum !== null ? `${posNum}\u00ba- ` : '';
    const nomeLabel = a.isModelo
      ? `<span style='font-weight:normal;color:#b8cfe8'>${a.nome}</span>`
      : `${posStr}${a.nome}`;
    h += `<div style="display:flex;flex-direction:column;align-items:center;flex:1;min-width:0;position:relative;height:100%;justify-content:flex-end;z-index:1">`;
    // Valor sempre vertical
    const scaleFactor = (isMobile && !isLandscape) ? 0.82 : 0.90;
    const barHeight = Math.max(2, perc * scaleFactor);
    h += `<div style="position:absolute;bottom:calc(${barHeight.toFixed(1)}% + 4px);left:50%;writing-mode:vertical-rl;transform:translateX(-50%) rotate(180deg);font-size:${valFontSize};font-weight:800;color:var(--texto);white-space:nowrap">${val.toFixed(1)}</div>`;
    h += `<div style="width:${barWidth}px;background:${cor};border-radius:4px 4px 0 0;height:${barHeight.toFixed(1)}%;transition:height 0.4s ease;box-shadow:0 -2px 10px ${cor}60"></div>`;
    // Nome centralizado abaixo
    h += `<div style="position:absolute;top:calc(100% + 8px);left:50%;writing-mode:vertical-rl;transform:translateX(-38%) rotate(180deg);font-size:${nameFontSize};color:var(--texto2);font-weight:600;white-space:nowrap">${nomeLabel}</div>`;
    h += '</div>';
  }

  // ── Linhas do macaco on top (z-index:2) ──
  // Faixa ±1σ
  h += `<div style="position:absolute;left:0;right:0;top:${sigmaHiPerc.toFixed(1)}%;bottom:${(100 - sigmaLoPerc).toFixed(1)}%;background:rgba(139,94,60,0.38);pointer-events:none;z-index:2"></div>`;
  // Linha +1σ
  h += `<div style="position:absolute;left:0;right:0;top:${sigmaHiPerc.toFixed(1)}%;height:0;border-top:1.5px dashed rgba(139,94,60,0.70);pointer-events:none;z-index:2"></div>`;
  // Linha −1σ
  h += `<div style="position:absolute;left:0;right:0;top:${sigmaLoPerc.toFixed(1)}%;height:0;border-top:1.5px dashed rgba(139,94,60,0.70);pointer-events:none;z-index:2"></div>`;
  // Linha da média
  h += `<div style="position:absolute;left:0;right:0;top:${mediaPerc.toFixed(1)}%;height:0;border-top:3px dashed ${COR_MACACO_LINHA};pointer-events:none;z-index:2"></div>`;

  // ── Labels do eixo Y (à direita, fora do fluxo) ──
  h += `<div style="position:absolute;right:-2px;top:${sigmaHiPerc.toFixed(1)}%;transform:translateY(-50%);font-size:.68rem;font-weight:700;color:rgba(139,94,60,0.85);pointer-events:none;z-index:3;line-height:1">+σ</div>`;
  h += `<div style="position:absolute;right:-2px;top:${mediaPerc.toFixed(1)}%;transform:translateY(-50%);font-size:.72rem;font-weight:900;color:${COR_MACACO_LINHA};pointer-events:none;z-index:3;line-height:1">μ</div>`;
  h += `<div style="position:absolute;right:-2px;top:${sigmaLoPerc.toFixed(1)}%;transform:translateY(-50%);font-size:.68rem;font-weight:700;color:rgba(139,94,60,0.85);pointer-events:none;z-index:3;line-height:1">−σ</div>`;

  h += '</div>';
  h += '</div>'; // fecha wrapper relativo
  if (needsScroll) h += '</div>'; // fecha wrapper scroll

  h += `<div style="text-align:center;font-size:.62rem;color:var(--texto2);margin-top:6px">10.000 macacos · chutes: 1-0, 1-1, 0-1 (prob. igual)</div>`;

  // ── Botões de ação: ordenação + exportar ──
  const _ordemM = window._graficoOrdem || 'rank';
  const _btnBaseM = 'background:var(--fundo2);border:1.5px solid var(--borda2);border-radius:var(--radius-sm);padding:8px 14px;color:var(--texto);font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit';
  const _btnAtivoM = 'background:var(--fundo2);border:1.5px solid var(--dourado);border-radius:var(--radius-sm);padding:8px 14px;color:var(--dourado);font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit';
  h += `<div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:12px;flex-wrap:wrap">`;
  h += `<div style="display:flex;gap:4px;background:rgba(255,255,255,0.04);border-radius:var(--radius-sm);padding:3px">`;
  h += `<button onclick="window._graficoOrdem='rank';renderAbaAtiva()" style="${_ordemM === 'rank' ? _btnAtivoM : _btnBaseM}">Rank</button>`;
  h += `<button onclick="window._graficoOrdem='az';renderAbaAtiva()" style="${_ordemM === 'az' ? _btnAtivoM : _btnBaseM}">A → Z</button>`;
  h += `</div>`;
  h += `<button onclick="_graficoExportarJPG()" style="${_btnBaseM}">📷 Exportar JPG</button>`;
  h += `</div>`;

  h += '</div>';
  return h;
}

// ── Exportar JPG ───────────────────────────────────────────────────────────
/**
 * Gera um JPG com TODOS os apostadores (ignorando filtro) em formato paisagem,
 * sem cortes, pronto para compartilhar ou imprimir.
 * Usa Canvas 2D puro — sem dependências externas.
 */
window._graficoExportarJPG = function () {
  const res = getResultados();
  const apos = APP.apostadores || [];
  const pals = APP.palpites || {};
  const metricaAtiva = window._graficoMetrica || 'pts';

  // Evolução tem export próprio
  if (metricaAtiva === 'evolucao') {
    _graficoExportarEvolucaoJPG();
    return;
  }

  const espOficiaisGraf = window.BRACKET.extrairEspeciaisOficiais(res, APP.bracket || {});

  // Montar ranking com filtro ativo (igual à tela)
  const _expFiltro = window._graficoFiltroApos;
  const baseRanking = gerarRanking(pals, res, apos, espOficiaisGraf);
  const posMap = {};
  baseRanking.forEach(item => {
    const pId = item.participante.id || item.participante.token;
    if (pId) posMap[pId] = item.posicao;
  });

  let rankingExp = apos.map((a, idx) => {
    const st = calcularPontosApostador(pals[a.id] || {}, res, a, espOficiaisGraf);
    const pId = a.id || a.token;
    return {
      id: a.id,
      nome: (a.apelido || a.nome || '?').substring(0, 14),
      pts: st.total,
      pct: st.pct_pontos,
      res: st.acertos_resultado,
      bonus1: st.acertos_bonus1,
      placar: st.acertos_placar_exato + st.acertos_placar_alto,
      placar_alto: st.acertos_placar_alto,
      isModelo: false,
      posicao: pId ? posMap[pId] : null
    };
  });

  // Inserir Modelo no ranking (para todas as métricas)
  const modeloGrafExp = window.getModelo ? window.getModelo() : null;
  if (modeloGrafExp && APP._modeloCarregado) {
    const stMod = calcularPontosApostador(APP.palpitesModelo || {}, res, modeloGrafExp, espOficiaisGraf);
    rankingExp.push({
      id: 'Modelo',
      nome: 'Modelo',
      pts: stMod.total,
      pct: stMod.pct_pontos,
      res: stMod.acertos_resultado,
      bonus1: stMod.acertos_bonus1,
      placar: stMod.acertos_placar_exato + stMod.acertos_placar_alto,
      placar_alto: stMod.acertos_placar_alto,
      isModelo: true,
      posicao: null
    });
  }

  if (metricaAtiva === 'chance') {
    const cache = window._graficoChanceCache || { vencedor: {}, top5: {} };
    const subTipo = window._graficoChanceSubTipo || 'vencedor';
    const chances = subTipo === 'top5' ? (cache.top5 || {}) : (cache.vencedor || {});
    rankingExp.forEach(a => { a.chance = chances[a.id] || 0; });
    rankingExp = rankingExp.sort((a, b) => b.chance - a.chance);
  } else if (metricaAtiva === 'pts' || metricaAtiva === 'pct' || metricaAtiva === 'macaco') {
    rankingExp = rankingExp.sort((a, b) => b.pts - a.pts);
  } else {
    rankingExp = rankingExp.sort((a, b) => (b[metricaAtiva] || 0) - (a[metricaAtiva] || 0));
  }

  // Aplicar filtro ativo (igual à tela) para todos, incluindo Modelo
  rankingExp = rankingExp.filter(a => !_expFiltro || _expFiltro.has(a.id));

  // Respeitar a ordenação selecionada na tela (Rank vs A→Z)
  const ordemExport = window._graficoOrdem || 'rank';
  if (ordemExport === 'az') {
    rankingExp = rankingExp.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  const n = rankingExp.length;
  if (!n) { alert('Nenhum apostador para exportar.'); return; }

  // ── Dimensões do canvas (paisagem fixa) ──
  const PADDING_LEFT = 20;
  const PADDING_RIGHT = metricaAtiva === 'macaco' ? 38 : 20; // extra space for greek labels on macaco
  const PADDING_TOP = 80;  // espaço para título + labels verticais de valor
  const PADDING_BOTTOM = 120; // espaço para nomes verticais
  const CHART_HEIGHT = 260;
  const BAR_WIDTH = Math.max(6, Math.min(28, Math.floor((Math.max(900, n * 14 + 40) - PADDING_LEFT - PADDING_RIGHT) / n - 1)));
  const GAP = 1;
  const TOTAL_W = Math.max(900, n * (BAR_WIDTH + GAP) + GAP + PADDING_LEFT + PADDING_RIGHT);
  const TOTAL_H = PADDING_TOP + CHART_HEIGHT + PADDING_BOTTOM;

  const canvas = document.createElement('canvas');
  const DPR = 3; // alta resolução
  canvas.width = TOTAL_W * DPR;
  canvas.height = TOTAL_H * DPR;
  canvas.style.width = TOTAL_W + 'px';
  canvas.style.height = TOTAL_H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);

  // Fundo escuro
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, TOTAL_W, TOTAL_H);

  // Título
  let metricaLabel = { pts: 'Pontos', pct: 'Pontos %', res: 'Resultados', bonus1: 'Bônus+1', placar: 'Placar+3', placar_alto: 'Placar+5', macaco: 'Macaco Médio' }[metricaAtiva] || metricaAtiva;
  if (metricaAtiva === 'chance') {
    const subTipo = window._graficoChanceSubTipo || 'vencedor';
    metricaLabel = subTipo === 'top5' ? 'Projeção (chance de ficar no top 5)' : 'Projeção (chance de ganhar)';
  }
  ctx.fillStyle = '#f1f5f9';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`Bolão Copa 2026 · ${metricaLabel}`, TOTAL_W / 2, 28);

  const macacoCache = (metricaAtiva === 'macaco') ? (window._graficoMacacoCache || { media: 0, sigma: 0 }) : null;
  if (macacoCache && macacoCache.media > 0) {
    const COR_MAC_LEG = '#8B5E3C';
    ctx.fillStyle = COR_MAC_LEG;
    const emoji = '🐒';
    const text = `  ${macacoCache.media.toFixed(1)} pts`;
    
    ctx.save();
    // Medir largura total para centralizar
    ctx.font = 'bold 17px system-ui, sans-serif';
    const wEmoji = ctx.measureText(emoji).width;
    
    ctx.font = 'bold 13px system-ui, sans-serif';
    const wText = ctx.measureText(text).width;
    
    const wTotal = wEmoji + wText;
    const startX = (TOTAL_W - wTotal) / 2;
    
    // Desenhar emoji (30% maior, ~17px)
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(emoji, startX, 54);
    
    // Desenhar pontuação
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(text, startX + wEmoji, 53);
    ctx.restore();
  }

  const vals = rankingExp.map(a =>
    metricaAtiva === 'chance' ? (a.chance || 0) :
      metricaAtiva === 'macaco' ? a.pts :
        a[metricaAtiva]
  );
  const maxValBase = Math.max(1, ...vals);
  const maxVal = macacoCache ? Math.max(maxValBase, macacoCache.media + macacoCache.sigma * 1.5) : maxValBase;


  const CHART_BOTTOM = PADDING_TOP + CHART_HEIGHT;

  // Linha base
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PADDING_LEFT, CHART_BOTTOM);
  ctx.lineTo(TOTAL_W - PADDING_RIGHT, CHART_BOTTOM);
  ctx.stroke();

  // Barras e labels
  const rankingExpHumanos = rankingExp.filter(a => !a.isModelo);
  rankingExp.forEach((a, i) => {
    const val = vals[i];
    const perc = val / maxVal;
    const barH = Math.max(2, Math.floor(perc * CHART_HEIGHT));
    const x = PADDING_LEFT + i * (BAR_WIDTH + GAP) + GAP;
    const y = CHART_BOTTOM - barH;
    const cor = a.isModelo ? '#b8cfe8' : _rainbowColor(rankingExpHumanos.indexOf(a), rankingExpHumanos.length);

    // Barra
    ctx.fillStyle = cor;
    ctx.beginPath();
    ctx.roundRect
      ? ctx.roundRect(x, y, BAR_WIDTH, barH, [3, 3, 0, 0])
      : ctx.rect(x, y, BAR_WIDTH, barH);
    ctx.fill();

    // Valor vertical acima da barra (rotacionado para não sobrepor com 70+ barras)
    ctx.save();
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 8px system-ui, sans-serif'; // +10% vs original
    ctx.textAlign = 'left';
    const valLabel = metricaAtiva === 'pct'
      ? parseFloat(val).toFixed(1) + '%'
      : metricaAtiva === 'chance'
        ? val.toFixed(1) + '%'
        : (metricaAtiva === 'pts' || metricaAtiva === 'macaco')
          ? val.toFixed(1)
          : String(val);
    ctx.translate(x + BAR_WIDTH / 2 + 3, y - 4);
    ctx.rotate(-Math.PI / 2); // rotaciona 90° anti-horário (de baixo para cima)
    ctx.fillText(valLabel, 0, 0);
    ctx.restore();

    // Nome vertical abaixo — âncora no FUNDO da área de labels, lido de baixo pra cima
    // Igual ao CSS: writing-mode:vertical-rl + rotate(180deg) na tela
    // Inclui prefixo de posição (ex: "1º- Fulano") para não-Modelo
    const posNumExp = a.isModelo ? null : a.posicao;
    const nomeLabelExp = posNumExp !== null ? `${posNumExp}\u00ba- ${a.nome}` : a.nome;
    ctx.save();
    ctx.fillStyle = a.isModelo ? '#b8cfe8' : '#94a3b8';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    // Âncora no topo da área de labels (logo abaixo do chart); rotate(-90°) faz X apontar pra cima
    // textAlign:'right' → texto termina na âncora → último char no topo (perto da barra), primeiro embaixo
    ctx.translate(x + BAR_WIDTH / 2, CHART_BOTTOM + 8);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(nomeLabelExp, 0, 0);
    ctx.restore();
  });

  // ── Linhas do Macaco Médio (média ± 1σ) ──
  if (macacoCache && macacoCache.media > 0) {
    const { media, sigma } = macacoCache;
    const yMedia = CHART_BOTTOM - Math.max(0, Math.min(1, media / maxVal)) * CHART_HEIGHT;
    const ySigmaHi = CHART_BOTTOM - Math.max(0, Math.min(1, (media + sigma) / maxVal)) * CHART_HEIGHT;
    const ySigmaLo = CHART_BOTTOM - Math.max(0, Math.min(1, Math.max(0, media - sigma) / maxVal)) * CHART_HEIGHT;
    const COR_MAC = '#8B5E3C';
    const xL = PADDING_LEFT, xR = TOTAL_W - PADDING_RIGHT;
    // Faixa ±1σ
    ctx.fillStyle = 'rgba(139,94,60,0.38)';
    ctx.fillRect(xL, ySigmaHi, xR - xL, ySigmaLo - ySigmaHi);
    // Linha +1σ
    ctx.save(); ctx.strokeStyle = 'rgba(139,94,60,0.60)'; ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(xL, ySigmaHi); ctx.lineTo(xR, ySigmaHi); ctx.stroke();
    // Linha −1σ
    ctx.beginPath(); ctx.moveTo(xL, ySigmaLo); ctx.lineTo(xR, ySigmaLo); ctx.stroke();
    ctx.restore();
    // Linha média
    ctx.save(); ctx.strokeStyle = COR_MAC; ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(xL, yMedia); ctx.lineTo(xR, yMedia); ctx.stroke();
    ctx.restore();
    // Labels do eixo Y (letras gregas à direita)
    ctx.save();
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(139,94,60,0.85)'; ctx.fillText('+σ', xR + 4, ySigmaHi + 4);
    ctx.fillStyle = COR_MAC; ctx.fillText('μ', xR + 4, yMedia + 4);
    ctx.fillStyle = 'rgba(139,94,60,0.85)'; ctx.fillText('−σ', xR + 4, ySigmaLo + 4);
    ctx.restore();
  }

  // Download
  const link = document.createElement('a');
  const filename = metricaAtiva === 'chance'
    ? `bolao-copa-2026-chance-${window._graficoChanceSubTipo || 'vencedor'}.jpg`
    : `bolao-copa-2026-${metricaAtiva}.jpg`;
  link.download = filename;
  link.href = canvas.toDataURL('image/jpeg', 0.95);
  link.click();
};
