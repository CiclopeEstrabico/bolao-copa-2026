/** tab-grafico.js - Gráfico de barras e evolução dos apostadores */

const _EVOLUCAO_CORES = [
  '#4fc3f7', '#81c784', '#ffb74d', '#f06292', '#ce93d8',
  '#80cbc4', '#fff176', '#ff8a65', '#90caf9', '#a5d6a7'
];

window.renderGrafico = function() {
  const el = document.getElementById("aba-grafico");
  if (!el) return;
  const res = getResultados();
  const apos = APP.apostadores || [];
  const pals = APP.palpites || {};
  if (!apos.length) { el.innerHTML = '<div class="card"><p style="color:var(--texto2)">Nenhum apostador cadastrado.</p></div>'; return; }

  const metricaAtiva = window._graficoMetrica || "pts";

  // Ranking completo para saber top 5 e cores consistentes
  let rankingCompleto = apos.map(a => {
    const st = calcularPontosApostador(pals[a.id]||{}, res, a, {});
    return {
      id: a.id,
      nome: (a.apelido || a.nome || "?").substring(0, 12),
      pts: st.total,
      placar: st.acertos_placar_exato,
      res: st.acertos_resultado,
      pct: st.aproveitamento_pct
    };
  }).sort((a,b) => b.pts - a.pts);

  const top5Ids = new Set(rankingCompleto.slice(0, 5).map(a => a.id));

  // Inicializar filtro com top 5 se ainda não definido
  if (!window._graficoFiltroApos) {
    window._graficoFiltroApos = new Set(top5Ids);
  }

  // ── Toggle de métrica ──
  let h = '<div class="toggle-bar" style="margin-bottom:15px;flex-wrap:wrap;justify-content:center">';
  h += '<span class="toggle-label">Métrica:</span>';
  h += '<button class="btn-toggle'+(metricaAtiva==="pts"?" ativo":"")+'" onclick="window._graficoMetrica=\'pts\';renderAbaAtiva()">Pontos</button>';
  h += '<button class="btn-toggle'+(metricaAtiva==="pct"?" ativo":"")+'" onclick="window._graficoMetrica=\'pct\';renderAbaAtiva()">Aproveitamento (%)</button>';
  h += '<button class="btn-toggle'+(metricaAtiva==="res"?" ativo":"")+'" onclick="window._graficoMetrica=\'res\';renderAbaAtiva()">Acertos Res.</button>';
  h += '<button class="btn-toggle'+(metricaAtiva==="placar"?" ativo":"")+'" onclick="window._graficoMetrica=\'placar\';renderAbaAtiva()">Placar Exato</button>';
  h += '<button class="btn-toggle'+(metricaAtiva==="evolucao"?" ativo":"")+'" onclick="_graficoIrEvolucao()">Evolução</button>';
  h += '</div>';

  // ── Filtro de apostadores ──
  h += '<div class="card" style="padding:10px 14px;margin-bottom:12px">';
  h += '<div style="font-size:.68rem;font-weight:700;color:var(--texto2);margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em">👤 Apostadores exibidos</div>';
  h += '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">';
  rankingCompleto.forEach((a, i) => {
    const ativo = window._graficoFiltroApos.has(a.id);
    const cor = _EVOLUCAO_CORES[i % _EVOLUCAO_CORES.length];
    h += '<button onclick="window._graficoToggleApos(\''+a.id+'\')" style="font-size:.68rem;padding:3px 10px;border-radius:12px;border:2px solid '+cor+';background:'+(ativo?cor:'transparent')+';color:'+(ativo?'#000':'var(--texto2)')+';cursor:pointer;font-weight:600;transition:all .15s">'+a.nome+'</button>';
  });
  h += '<button onclick="window._graficoFiltroApos=new Set(APP.apostadores.map(a=>a.id));renderAbaAtiva()" style="font-size:.62rem;padding:2px 8px;border-radius:10px;border:1px solid var(--borda);background:transparent;color:var(--texto2);cursor:pointer;margin-left:4px">Todos</button>';
  h += '</div></div>';

  if (metricaAtiva === "evolucao") {
    h += _renderEvolucao(res, pals, apos, rankingCompleto);
  } else {
    h += _renderBarras(rankingCompleto, metricaAtiva);
  }

  el.innerHTML = h;
};

window._graficoToggleApos = function(id) {
  if (!window._graficoFiltroApos) window._graficoFiltroApos = new Set();
  if (window._graficoFiltroApos.has(id)) {
    if (window._graficoFiltroApos.size > 1) window._graficoFiltroApos.delete(id);
  } else {
    window._graficoFiltroApos.add(id);
  }
  renderAbaAtiva();
};

window._graficoIrEvolucao = function() {
  window._graficoMetrica = 'evolucao';
  // Pré-seleciona top 5 ao entrar em evolução, se filtro tiver todos ou estiver vazio demais
  const res = getResultados();
  const apos = APP.apostadores || [];
  const pals = APP.palpites || {};
  const top5 = apos.map(a => ({
    id: a.id,
    pts: calcularPontosApostador(pals[a.id]||{}, res, a, {}).total
  })).sort((a,b) => b.pts - a.pts).slice(0,5).map(a => a.id);
  window._graficoFiltroApos = new Set(top5);
  renderAbaAtiva();
};

// ── Gráfico de Barras ──────────────────────────────────────────────────────
function _renderBarras(rankingCompleto, metricaAtiva) {
  const filtro = window._graficoFiltroApos;
  let ranking = rankingCompleto.filter(a => filtro.has(a.id));
  ranking.sort((a,b) => b[metricaAtiva] - a[metricaAtiva]);

  if (!ranking.length) return '<div class="card" style="text-align:center;color:var(--texto2);padding:30px">Nenhum apostador selecionado.</div>';

  const maxVal = Math.max(1, ...ranking.map(a => a[metricaAtiva]));
  const avgVal = ranking.reduce((acc, curr) => acc + curr[metricaAtiva], 0) / Math.max(1, ranking.length);
  const avgPerc = (avgVal / maxVal) * 100;

  const coresMap = {};
  rankingCompleto.forEach((a, i) => { coresMap[a.id] = _EVOLUCAO_CORES[i % _EVOLUCAO_CORES.length]; });

  let h = '<div class="card" style="padding:20px 10px;overflow-x:auto">';
  h += '<div style="display:flex;align-items:flex-end;gap:12px;height:280px;min-width:min-content;padding-bottom:10px;border-bottom:1px solid var(--borda);margin-bottom:80px;position:relative">';

  h += '<div style="position:absolute;bottom:10px;left:0;right:0;height:'+avgPerc+'%;border-top:1px dashed var(--texto2);opacity:0.6;pointer-events:none;z-index:0">';
  h += '<span style="position:absolute;top:-18px;left:0;font-size:.65rem;color:var(--texto2);font-weight:700">Média: '+(metricaAtiva==="pct"?avgVal.toFixed(1)+"%":avgVal.toFixed(1))+'</span></div>';

  for (let i = 0; i < ranking.length; i++) {
    const a = ranking[i];
    const val = a[metricaAtiva];
    const perc = (val / maxVal) * 100;
    const cor = coresMap[a.id] || _EVOLUCAO_CORES[i % _EVOLUCAO_CORES.length];
    let valStr = metricaAtiva === "pct" ? val+"%" : metricaAtiva === "pts" ? val.toFixed(1) : val;

    h += '<div style="display:flex;flex-direction:column;align-items:center;flex:1;min-width:40px;position:relative;height:100%;justify-content:flex-end;z-index:1">';
    h += '<div style="font-size:.7rem;font-weight:800;color:var(--texto);margin-bottom:4px">'+valStr+'</div>';
    h += '<div style="width:28px;background:'+cor+';border-radius:4px 4px 0 0;height:'+Math.max(2,perc)+'%;transition:height 0.4s ease;box-shadow:0 -2px 10px '+cor+'60"></div>';
    h += '<div style="position:absolute;top:calc(100% + 8px);left:50%;writing-mode:vertical-rl;transform:rotate(180deg);font-size:.68rem;color:var(--texto2);font-weight:600;white-space:nowrap">'+a.nome+'</div>';
    h += '</div>';
  }

  h += '</div></div>';
  return h;
}

// ── Gráfico de Evolução ────────────────────────────────────────────────────
function _renderEvolucao(res, pals, apos, rankingCompleto) {
  const filtro = window._graficoFiltroApos;
  const aposFiltrados = apos.filter(a => filtro.has(a.id));

  if (!aposFiltrados.length) return '<div class="card" style="text-align:center;color:var(--texto2);padding:30px">Nenhum apostador selecionado.</div>';

  const jogosComRes = (window.SCHEDULE || [])
    .filter(j => res[j.id] && res[j.id].homeGoals !== undefined)
    .sort((a, b) => new Date(a.utc) - new Date(b.utc));

  if (!jogosComRes.length) {
    return '<div class="card" style="text-align:center;color:var(--texto2);padding:30px">Nenhum resultado oficial ainda.</div>';
  }

  const series = aposFiltrados.map(a => {
    const idxGlobal = rankingCompleto.findIndex(r => r.id === a.id);
    const cor = _EVOLUCAO_CORES[idxGlobal % _EVOLUCAO_CORES.length];
    const pal = pals[a.id] || {};
    let acumulado = 0;
    const pontos = jogosComRes.map(j => {
      const p = pal[j.id];
      const r = res[j.id];
      if (p && r && p.homeGoals !== undefined) {
        const br = calcularPontosBrutos(p, r);
        acumulado += aplicarFator(br.total_bruto, j.fase);
      }
      return parseFloat(acumulado.toFixed(1));
    });
    return { nome: (a.apelido || a.nome || "?").substring(0, 12), cor, pontos };
  });

  const W = 600, H = 280;
  const PAD = { top: 20, right: 100, bottom: 40, left: 48 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const nJogos = jogosComRes.length;
  const maxPts = Math.max(1, ...series.map(s => Math.max(...s.pontos, 0)));

  function xPos(i) { return PAD.left + (nJogos <= 1 ? chartW / 2 : (i / (nJogos - 1)) * chartW); }
  function yPos(v) { return PAD.top + chartH - (v / maxPts) * chartH; }

  let svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;display:block;margin:0 auto;overflow:visible">`;

  // Grid horizontal
  for (let i = 0; i <= 4; i++) {
    const v = (maxPts / 4) * i;
    const y = yPos(v);
    svg += `<line x1="${PAD.left}" y1="${y.toFixed(1)}" x2="${PAD.left+chartW}" y2="${y.toFixed(1)}" stroke="var(--borda)" stroke-width="1" stroke-dasharray="4,4"/>`;
    svg += `<text x="${PAD.left-6}" y="${(y+4).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--texto2)">${v.toFixed(0)}</text>`;
  }

  // Labels eixo X
  const step = Math.max(1, Math.floor(nJogos / 8));
  for (let i = 0; i < nJogos; i += step) {
    const x = xPos(i).toFixed(1);
    svg += `<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${PAD.top+chartH}" stroke="var(--borda)" stroke-width="1" opacity="0.4"/>`;
    svg += `<text x="${x}" y="${PAD.top+chartH+14}" text-anchor="middle" font-size="10" fill="var(--texto2)">J${i+1}</text>`;
  }
  if ((nJogos-1) % step !== 0 && nJogos > 1) {
    const x = xPos(nJogos-1).toFixed(1);
    svg += `<text x="${x}" y="${PAD.top+chartH+14}" text-anchor="middle" font-size="10" fill="var(--texto2)">J${nJogos}</text>`;
  }

  // Linha de cada apostador + label no final
  for (const s of series) {
    if (!s.pontos.length) continue;
    const pts = s.pontos.map((v, i) => `${xPos(i).toFixed(1)},${yPos(v).toFixed(1)}`).join(' ');
    svg += `<polyline points="${pts}" fill="none" stroke="${s.cor}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;

    const lastX = xPos(s.pontos.length-1);
    const lastY = yPos(s.pontos[s.pontos.length-1]);
    svg += `<circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="4" fill="${s.cor}" stroke="var(--fundo)" stroke-width="1.5"/>`;
    svg += `<text x="${(lastX+8).toFixed(1)}" y="${(lastY+4).toFixed(1)}" font-size="10" font-weight="700" fill="${s.cor}">${s.nome}</text>`;
  }

  svg += '</svg>';

  let legenda = '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;justify-content:center">';
  for (const s of series) {
    const ultimo = s.pontos[s.pontos.length-1] ?? 0;
    legenda += `<div style="display:flex;align-items:center;gap:5px;font-size:.72rem;font-weight:600;color:var(--texto)"><div style="width:20px;height:3px;background:${s.cor};border-radius:2px"></div>${s.nome} <span style="color:var(--texto2);font-weight:400">${ultimo} pts</span></div>`;
  }
  legenda += '</div>';

  return `<div class="card" style="padding:16px;overflow-x:auto">${svg}${legenda}</div>`;
}
