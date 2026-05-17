const _rankingAnterior = {};
window.renderClassificacao = function () {
  const el = document.getElementById("aba-classificacao");
  if (!el) return;
  const res = getResultados();
  const apos = APP.apostadores || [];
  const pals = APP.palpites || {};
  // Especiais oficiais derivados do bracket
  const esp = window.BRACKET.extrairEspeciaisOficiais(res, APP.bracket || {});

  const ranking = gerarRanking(pals, res, apos, esp);

  // Inserir MODELO visualmente na posição correta
  const modeloParticipante = window.getModelo ? window.getModelo() : null;
  let rankingComModelo = ranking.slice();

  if (modeloParticipante && APP._modeloCarregado) {
    const palsModelo = APP.palpitesModelo || {};
    const statsModelo = calcularPontosApostador(palsModelo, res, modeloParticipante, esp);

    let posModelo = 1;
    for (const item of ranking) {
      const exatosItem = item.stats.acertos_placar_exato + item.stats.acertos_placar_alto;
      const exatosModelo = statsModelo.acertos_placar_exato + statsModelo.acertos_placar_alto;
      if (item.stats.total > statsModelo.total) posModelo++;
      else if (item.stats.total === statsModelo.total) {
        if (exatosItem > exatosModelo) posModelo++;
        else if (exatosItem === exatosModelo && item.stats.acertos_resultado > statsModelo.acertos_resultado) posModelo++;
      }
    }

    const itemModelo = {
      posicao: posModelo,
      participante: modeloParticipante,
      stats: statsModelo,
      isModelo: true,
    };

    const insertIdx = rankingComModelo.findIndex(item => {
      const exatosItem = item.stats.acertos_placar_exato + item.stats.acertos_placar_alto;
      const exatosModelo = statsModelo.acertos_placar_exato + statsModelo.acertos_placar_alto;
      if (item.stats.total < statsModelo.total) return true;
      if (item.stats.total === statsModelo.total && exatosItem < exatosModelo) return true;
      if (item.stats.total === statsModelo.total && exatosItem === exatosModelo && item.stats.acertos_resultado < statsModelo.acertos_resultado) return true;
      return false;
    });
    if (insertIdx === -1) rankingComModelo.push(itemModelo);
    else rankingComModelo.splice(insertIdx, 0, itemModelo);
  }

  // Jogos realizados recentes (ultimos 5)
  const jogosFeitosIds = (window.SCHEDULE || []).filter(j => res[j.id]?.homeGoals !== undefined)
    .sort((a, b) => new Date(b.utc) - new Date(a.utc)).slice(0, 5).map(j => j.id);

  // Header stats
  const totalJogos = (window.SCHEDULE || []).filter(j => res[j.id]?.homeGoals !== undefined).length;
  const totalPoss = (window.SCHEDULE || []).length;
  const ptsAindaEmJogo = calcularPontosAindaEmJogo(res);

  let h = '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px">';
  h += _statCard("Participantes", ranking.length, "👥");
  h += _statCard("Jogos Realizados", totalJogos + "/" + totalPoss, "⚽");
  h += _statCard("Pontos em Jogo", ptsAindaEmJogo > 0 ? ptsAindaEmJogo + " ainda possíveis" : "Campeonato encerrado", "🎯");
  const lider = ranking[0];
  h += _statCard("Líder", lider ? (lider.participante.apelido || lider.participante.nome || "?") : "—", "🏆");
  h += '</div>';

  // Denominador individual: pontos que realmente estiveram em jogo (bônus real por jogo)
  const maxPtsGeral = calcularMaxPontosPossiveis(res);

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

  rankingComModelo.forEach((item, i) => {
    const isModelo = !!item.isModelo;
    const p = item.participante; const st = item.stats;
    const pos = item.posicao;
    const posAnterior = _rankingAnterior[p.id || p.token];
    const mov = (!isModelo && posAnterior) ? (posAnterior > pos ? '▲' : posAnterior < pos ? '▼' : '—') : '—';
    const movCor = mov === '▲' ? 'var(--verde-ok)' : mov === '▼' ? '#f87171' : 'var(--texto2)';
    const medalhao = isModelo ? '🤖' : _getMedalhao(pos);

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

    const pctPts = st.pct_pontos;
    const pctRes = st.pct_resultado;
    const pctBonus1 = st.pct_bonus1;
    const pctPlacar = st.pct_placar;
    const pctPlacarAlto = st.pct_placar_alto;

    const rowBg = isModelo
      ? 'background:rgba(180,210,240,0.06);border-left:2px solid rgba(180,210,240,0.25)'
      : '';

    h += '<tr style="cursor:pointer;' + rowBg + '" onclick="_toggleRankingDetalhe(\'rd-' + i + '\')">';
    h += '<td style="text-align:center;font-weight:900;font-size:.95rem">';
    if (isModelo) {
      h += '<span style="font-size:1.1rem">🤖</span>';
    } else {
      h += (medalhao !== null ? medalhao : '<span style="font-size:.88rem">' + pos + '</span>') + '<span style="font-size:.65rem;color:' + movCor + '"> ' + mov + '</span>';
    }
    h += '</td>';

    // Nome
    const stickyBg = isModelo ? 'rgba(180,210,240,0.06)' : 'var(--fundo)';
    h += '<td style="text-align:left;font-weight:600;position:sticky;left:0;background:' + stickyBg + ';z-index:1">';
    if (isModelo) {
      h += '<span style="font-weight:700;color:#b8cfe8">Modelo</span>';
      h += '<div style="font-size:.6rem;color:var(--texto2)">referência · fora do ranking</div>';
    } else {
      h += (p.apelido || p.nome || p.token?.substring(0, 8) || "?");
    }
    h += '</td>';

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
    if (isModelo) {
      h += '<div><div style="color:var(--texto2)">Tipo</div><div style="font-weight:700;color:#b8cfe8">Referência estatística</div></div>';
    } else {
      h += '<div><div style="color:var(--texto2)">Nome Completo</div><div style="font-weight:700">' + (p.nome || "—") + '</div></div>';
    }
    h += '<div><div style="color:var(--texto2)">Grupos</div><div style="font-weight:700">' + st.total_grupos.toFixed(1) + ' pts</div></div>';
    h += '<div><div style="color:var(--texto2)">Eliminatórias</div><div style="font-weight:700">' + st.total_eliminatorias.toFixed(1) + ' pts</div></div>';
    h += '<div><div style="color:var(--texto2)">Especiais</div><div style="font-weight:700">' + st.total_especiais + ' pts</div></div>';
    h += '<div><div style="color:var(--texto2)">Sem palpite</div><div style="font-weight:700;color:var(--texto2)">' + st.sem_palpite + '</div></div>';
    h += '</div></div></td></tr>';
  });

  h += '</tbody></table></div>';

  // Guardar ranking para mostrar movimento (apenas apostadores reais)
  ranking.forEach(item => { _rankingAnterior[item.participante.id || item.participante.token] = item.posicao; });

  el.innerHTML = h;
};

window._toggleRankingDetalhe = function (id) {
  const el = document.getElementById(id);
  if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
};

// Retorna HTML da medalha para os top 5; null para posições fora do pódio
function _getMedalhao(pos) {
  const _emoji = (e, title) => '<span title="' + title + '" style="font-size:1.25rem;line-height:1;vertical-align:middle;display:inline-block">' + e + '</span>';
  if (pos === 1) return _emoji('🥇', '1° Lugar');
  if (pos === 2) return _emoji('🥈', '2° Lugar');
  if (pos === 3) return _emoji('🥉', '3° Lugar');
  if (pos === 4) return '<span title="4° Lugar" style="display:inline-block;background:#B87333;color:#fff;font-size:.6rem;font-weight:900;border-radius:50%;width:20px;height:20px;line-height:20px;text-align:center;vertical-align:middle">4°</span>';
  if (pos === 5) return '<span title="5° Lugar" style="display:inline-block;background:#8B9DC3;color:#fff;font-size:.6rem;font-weight:900;border-radius:50%;width:20px;height:20px;line-height:20px;text-align:center;vertical-align:middle">5°</span>';
  return null;
}

function _statCard(label, valor, icon) {
  return '<div style="background:var(--card);border:1px solid var(--borda);border-radius:var(--radius-sm);padding:12px;text-align:center">' +
    '<div style="font-size:1.4rem">' + icon + '</div>' +
    '<div style="font-size:1rem;font-weight:800;color:var(--texto)">' + valor + '</div>' +
    '<div style="font-size:.68rem;color:var(--texto2);margin-top:2px">' + label + '</div></div>';
}