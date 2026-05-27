/** tab-grafico.js - Gráfico de barras e evolução dos apostadores */

const _EVOLUCAO_CORES = [
  '#4fc3f7', '#81c784', '#ffb74d', '#f06292', '#ce93d8',
  '#80cbc4', '#fff176', '#ff8a65', '#90caf9', '#a5d6a7'
];

// Métricas disponíveis
const _METRICAS = [
  { id: 'pts',        label: 'Pontos' },
  { id: 'evolucao',   label: 'Evolução' },
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
      : `onclick="window._graficoMetrica='${m.id}';renderAbaAtiva()"`;
    h += `<button class="btn-toggle${ativo?' ativo':''}" ${onclick}>${m.label}</button>`;
  });
  h += '</div>';

  // ── Filtro dropdown estilo Excel ──
  h += _renderFiltroDropdown(rankingCompleto);

  if (metricaAtiva === "evolucao") {
    h += _renderEvolucao(res, pals, apos, rankingCompleto);
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
function _fmtVal(metricaAtiva, val) {
  if (metricaAtiva === 'pct') return val + '%';
  if (metricaAtiva === 'pts') return val.toFixed(1);
  return String(val);
}

// ── Gráfico de Barras ──────────────────────────────────────────────────────
function _renderBarras(rankingCompleto, metricaAtiva) {
  const filtro = window._graficoFiltroApos;
  let ranking = rankingCompleto.filter(a => filtro.has(a.id));
  if (!ranking.length) return '<div class="card" style="text-align:center;color:var(--texto2);padding:30px">Nenhum apostador selecionado.</div>';

  ranking = [...ranking].sort((a,b) => b[metricaAtiva] - a[metricaAtiva]);

  const maxVal = Math.max(1, ...ranking.map(a => a[metricaAtiva]));
  const avgVal = ranking.reduce((s, a) => s + a[metricaAtiva], 0) / ranking.length;
  const avgPerc = (avgVal / maxVal) * 100;

  const coresMap = {};
  rankingCompleto.forEach((a, i) => {
    coresMap[a.id] = a.isModelo ? '#b8cfe8' : _EVOLUCAO_CORES[i % _EVOLUCAO_CORES.length];
  });

  // ── Dimensões responsivas baseadas no número de apostadores ──
  const n = ranking.length;
  // Gap entre barras: reduz conforme cresce a quantidade
  const gap = n <= 6 ? 12 : n <= 10 ? 8 : n <= 16 ? 4 : 2;
  // Largura fixa da barra: reduz para caber todos na tela sem scroll
  const barWidth = n <= 6 ? 28 : n <= 10 ? 22 : n <= 16 ? 16 : n <= 24 ? 12 : 8;
  // Tamanho de fonte do valor acima da barra
  const valFontSize = n <= 10 ? '.7rem' : n <= 16 ? '.62rem' : '.55rem';
  // Tamanho de fonte do nome abaixo da barra
  const nameFontSize = n <= 10 ? '.68rem' : n <= 16 ? '.60rem' : '.54rem';

  let h = '<div class="card" style="padding:20px 10px;">';
  h += `<div style="display:flex;align-items:flex-end;gap:${gap}px;height:280px;padding-bottom:10px;border-bottom:1px solid var(--borda);margin-bottom:80px;position:relative">`;

  // Linha da média
  const avgValFmt = metricaAtiva === 'pct'
    ? avgVal.toFixed(1) + '%'
    : avgVal.toFixed(1);
  h += `<div style="position:absolute;bottom:10px;left:0;right:0;height:${avgPerc}%;border-top:1px dashed var(--texto2);opacity:0.6;pointer-events:none;z-index:0">`;
  h += `<span style="position:absolute;top:-18px;left:0;font-size:.65rem;color:var(--texto2);font-weight:700">Média: ${avgValFmt}</span></div>`;

  for (const a of ranking) {
    const val = a[metricaAtiva];
    const perc = (val / maxVal) * 100;
    const cor = coresMap[a.id] || '#4fc3f7';

    const nomeBarra = a.isModelo
      ? `<span style='font-weight:normal;color:#b8cfe8'>${a.nome}</span>`
      : a.nome;
    h += `<div style="display:flex;flex-direction:column;align-items:center;flex:1;position:relative;height:100%;justify-content:flex-end;z-index:1">`;
    h += `<div style="font-size:${valFontSize};font-weight:800;color:var(--texto);margin-bottom:4px;white-space:nowrap">${_fmtVal(metricaAtiva, val)}</div>`;
    h += `<div style="width:${barWidth}px;background:${cor};border-radius:4px 4px 0 0;height:${Math.max(2,perc)}%;transition:height 0.4s ease;box-shadow:0 -2px 10px ${cor}60"></div>`;
    h += `<div style="position:absolute;top:calc(100% + 8px);left:50%;writing-mode:vertical-rl;transform:rotate(180deg);font-size:${nameFontSize};color:var(--texto2);font-weight:600;white-space:nowrap">${nomeBarra}</div>`;
    h += '</div>';
  }

  h += '</div></div>';
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
