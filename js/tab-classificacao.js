/** tab-classificacao.js - Ranking com sparklines e movimento */
let _rankingAnterior = {};

window.renderClassificacao = function () {
  const el = document.getElementById("aba-classificacao");
  if (!el) return;
  const res = getResultados();
  const apos = APP.apostadores || [];
  const pals = APP.palpites || {};
  const esp = APP.especiais || {};

  const ranking = gerarRanking(pals, res, apos, esp);

  // Jogos realizados recentes (ultimos 5)
  const jogosFeitosIds = (window.SCHEDULE || []).filter(j => res[j.id]?.homeGoals !== undefined)
    .sort((a, b) => new Date(b.utc) - new Date(a.utc)).slice(0, 5).map(j => j.id);

  // Header stats
  const totalJogos = (window.SCHEDULE || []).filter(j => res[j.id]?.homeGoals !== undefined).length;
  const totalPoss = (window.SCHEDULE || []).length;
  let h = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px">';
  h += _statCard("Participantes", ranking.length, "👥");
  h += _statCard("Jogos Realizados", totalJogos + "/" + totalPoss, "⚽");
  const lider = ranking[0];
  h += _statCard("Líder", lider ? (lider.participante.apelido || lider.participante.nome || "?") : "—", "🏆");
  h += '</div>';

  // Calcular total de pontos possíveis
  let maxPtsGeral = 0;
  for (const jogo of (window.SCHEDULE || [])) {
    const r = res[jogo.id];
    if (r && r.homeGoals !== undefined) {
      let maxBruto = window.CONFIG?.pontuacao?.resultado_base || 3;
      if (!r.foi_penaltis) {
        const tGols = Number(r.homeGoals) + Number(r.awayGoals);
        const cfg = window.CONFIG?.pontuacao || {};
        const limiar = cfg.limiar_placar_alto || 4;
        const bonus = tGols >= limiar ? (cfg.bonus_placar_exato_alto || 5) : (cfg.bonus_placar_exato_baixo || 3);
        maxBruto += bonus;
      }
      const fator = window.CONFIG?.pontuacao?.fatores_fase?.[jogo.fase] || 1.0;
      maxPtsGeral += Math.round(maxBruto * fator * 10) / 10;
    }
  }

  // Tabela ranking
  h += '<div class="card" style="padding:0;overflow-x:auto;-webkit-overflow-scrolling:touch"><table class="tabela-detalhe" style="width:100%;min-width:750px">';
  h += '<thead><tr><th style="width:36px">Pos</th><th style="text-align:left;position:sticky;left:0;background:var(--card);z-index:1;box-shadow:2px 0 5px rgba(0,0,0,0.1)">Apostador</th>';
  h += '<th title="Pontos Totais" style="text-align:center">🏆 Pts</th>';
  h += '<th title="Todos os resultados corretos" style="text-align:center">✓ Res.</th>';
  h += '<th title="Resultados que renderam Bônus +1 ou +2" style="text-align:center">✨ Bônus+1</th>';
  h += '<th title="Placares exatos com menos de 4 gols" style="text-align:center">🎯 Placar+3</th>';
  h += '<th title="Placares exatos com 4 ou mais gols" style="text-align:center">🔥 Placar+5</th>';
  h += '<th title="Últimos 5 jogos" style="text-align:center">Forma</th>';
  h += '</tr></thead><tbody>';

  const _renderCol = (val, pct, valCor) => {
    return '<td style="text-align:center"><div style="display:inline-flex;align-items:baseline;gap:7px">' +
      '<span style="font-weight:800;font-size:1.05rem;color:' + valCor + '">' + val + '</span>' +
      '<span style="font-size:.64rem;color:var(--texto2);font-weight:600">' + pct + '%</span>' +
      '</div></td>';
  };

  ranking.forEach((item, i) => {
    const p = item.participante; const st = item.stats;
    const pos = item.posicao;
    const posAnterior = _rankingAnterior[p.id || p.token];
    const mov = posAnterior ? (posAnterior > pos ? '▲' : posAnterior < pos ? '▼' : '—') : '—';
    const movCor = mov === '▲' ? 'var(--verde-ok)' : mov === '▼' ? '#f87171' : 'var(--texto2)';
    const medalhao = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : '';

    // Sparkline: últimos 5 jogos
    let spark = '';
    for (const jId of jogosFeitosIds) {
      const jg = st.jogos?.find(x => x.gameId === jId);
      if (!jg) { spark += '<span style="color:var(--texto2)">·</span>'; continue; }
      if (jg.acertou === null) { spark += '<span style="color:var(--texto2)">·</span>'; continue; }

      if (jg.bonus_tipo === "placar_exato") {
        if (jg.bonus_pts === (window.CONFIG?.pontuacao?.bonus_placar_exato_alto || 5)) {
          spark += '<span title="Placar+5 (+' + jg.pontos + 'pts)">🔥</span>';
        } else {
          spark += '<span title="Placar+3 (+' + jg.pontos + 'pts)">🎯</span>';
        }
      } else if (jg.acertou) {
        if (jg.bonus_pts > 0) {
          spark += '<span title="Resultado com Bônus +' + jg.pontos + 'pts">✨</span>';
        } else {
          spark += '<span style="color:var(--texto)" title="Resultado +' + jg.pontos + 'pts">✓</span>';
        }
      } else {
        spark += '<span style="color:var(--texto2)" title="Errou">✗</span>';
      }
    }

    const jReal = st.jogos_realizados || 0;
    const pctPts = maxPtsGeral > 0 ? ((st.total / maxPtsGeral) * 100).toFixed(1) : "0.0";
    const pctRes = jReal > 0 ? ((st.acertos_resultado / jReal) * 100).toFixed(1) : "0.0";
    const pctBonus1 = jReal > 0 ? ((st.acertos_bonus1 / jReal) * 100).toFixed(1) : "0.0";
    const pctPlacar = jReal > 0 ? ((st.acertos_placar_exato / jReal) * 100).toFixed(1) : "0.0";
    const pctPlacarAlto = jReal > 0 ? ((st.acertos_placar_alto / jReal) * 100).toFixed(1) : "0.0";
    const aprov = st.aproveitamento_pct;

    h += '<tr style="cursor:pointer" onclick="_toggleRankingDetalhe(\'rd-' + i + '\')">';
    h += '<td style="text-align:center;font-weight:900;font-size:.95rem">';
    h += (medalhao || pos) + '<span style="font-size:.65rem;color:' + movCor + '"> ' + mov + '</span></td>';
    h += '<td style="text-align:left;font-weight:600;position:sticky;left:0;background:var(--fundo);z-index:1">' + (p.apelido || p.nome || p.token?.substring(0, 8) || "?") + '</td>';
    h += _renderCol(st.total.toFixed(1), pctPts, "var(--verde-light)");
    h += _renderCol(st.acertos_resultado, pctRes, "var(--texto)");
    h += _renderCol(st.acertos_bonus1, pctBonus1, "#fbbf24");
    h += _renderCol(st.acertos_placar_exato, pctPlacar, "#86efac");
    h += _renderCol(st.acertos_placar_alto, pctPlacarAlto, "#f87171");
    h += '<td style="letter-spacing:1px;vertical-align:middle;text-align:center">' + spark + '</td></tr>';

    // Linha de detalhe expansível
    h += '<tr id="rd-' + i + '" style="display:none"><td colspan="8" style="padding:0">';
    h += '<div style="background:var(--fundo2);padding:10px 14px;font-size:.76rem">';
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px">';
    h += '<div><div style="color:var(--texto2)">Nome Completo</div><div style="font-weight:700">' + (p.nome || "—") + '</div></div>';
    h += '<div><div style="color:var(--texto2)">Grupos</div><div style="font-weight:700">' + st.total_grupos.toFixed(1) + ' pts</div></div>';
    h += '<div><div style="color:var(--texto2)">Eliminatórias</div><div style="font-weight:700">' + st.total_eliminatorias.toFixed(1) + ' pts</div></div>';
    h += '<div><div style="color:var(--texto2)">Especiais</div><div style="font-weight:700">' + st.total_especiais + ' pts</div></div>';
    h += '<div><div style="color:var(--texto2)">Sem palpite</div><div style="font-weight:700;color:var(--texto2)">' + st.sem_palpite + '</div></div>';
    h += '</div></div></td></tr>';
  });

  h += '</tbody></table></div>';

  // Guardar ranking para mostrar movimento
  ranking.forEach(item => { _rankingAnterior[item.participante.id || item.participante.token] = item.posicao; });

  el.innerHTML = h;
};

window._toggleRankingDetalhe = function (id) {
  const el = document.getElementById(id);
  if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
};

function _statCard(label, valor, icon) {
  return '<div style="background:var(--card);border:1px solid var(--borda);border-radius:var(--radius-sm);padding:12px;text-align:center">' +
    '<div style="font-size:1.4rem">' + icon + '</div>' +
    '<div style="font-size:1rem;font-weight:800;color:var(--texto)">' + valor + '</div>' +
    '<div style="font-size:.68rem;color:var(--texto2);margin-top:2px">' + label + '</div></div>';
}