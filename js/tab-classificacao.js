window.renderClassificacao = function () {
  const el = document.getElementById("aba-classificacao");
  if (!el) return;
  const res = getResultados();
  const apos = APP.apostadores || [];
  const pals = APP.palpites || {};
  // Especiais oficiais derivados do bracket
  const esp = window.BRACKET.extrairEspeciaisOficiais(res, APP.bracket || {});

  const ranking = gerarRanking(pals, res, apos, esp);

  // --- CALCULAR RANKING ANTERIOR (baseado na exclusão da última rodada de jogos) ---
  const todosJogosRealizados = (window.SCHEDULE || [])
    .filter(j => res[j.id]?.homeGoals !== undefined)
    .sort((a, b) => new Date(b.utc) - new Date(a.utc));
    
  const _rankingAnteriorData = {};
  if (todosJogosRealizados.length > 0) {
    const resAnterior = { ...res };
    const ultimaDataUtc = todosJogosRealizados[0].utc;
    for (const j of todosJogosRealizados) {
      if (j.utc === ultimaDataUtc) delete resAnterior[j.id];
    }
    const espAnterior = window.BRACKET.extrairEspeciaisOficiais(resAnterior, APP.bracket || {});
    const rankingAntList = gerarRanking(pals, resAnterior, apos, espAnterior);
    
    rankingAntList.forEach(item => {
      _rankingAnteriorData[item.participante.id || item.participante.token] = item.posicao;
    });

    const mod = window.getModelo ? window.getModelo() : null;
    if (mod && APP._modeloCarregado) {
      const stModAnt = calcularPontosApostador(APP.palpitesModelo || {}, resAnterior, mod, espAnterior);
      let posModAnt = 1;
      for (const item of rankingAntList) {
        const exItem = item.stats.acertos_placar_exato + item.stats.acertos_placar_alto;
        const exMod = stModAnt.acertos_placar_exato + stModAnt.acertos_placar_alto;
        if (item.stats.total > stModAnt.total) posModAnt++;
        else if (item.stats.total === stModAnt.total) {
          if (exItem > exMod) posModAnt++;
          else if (exItem === exMod && item.stats.acertos_resultado > stModAnt.acertos_resultado) posModAnt++;
        }
      }
      _rankingAnteriorData['MODELO'] = posModAnt;
    }
  }

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

  // Jogos realizados recentes (ultimos 5) — mais antigo primeiro, mais recente à direita
  const jogosFeitosIds = (window.SCHEDULE || []).filter(j => res[j.id]?.homeGoals !== undefined)
    .sort((a, b) => new Date(a.utc) - new Date(b.utc)).slice(-5).map(j => j.id);

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
  const _isMobileClass = window.innerWidth <= 600;
  h += '<div class="card" style="padding:0;overflow-x:auto;-webkit-overflow-scrolling:touch"><table class="tabela-detalhe" style="width:100%;min-width:' + (_isMobileClass ? '520px' : '750px') + '">';
  h += '<thead><tr><th style="width:36px">Pos</th><th class="col-apostador" style="text-align:left;position:sticky;left:0;background:var(--card);z-index:1;box-shadow:2px 0 5px rgba(0,0,0,0.1)">Apostador</th>';
  h += '<th title="Pontos Totais" style="text-align:center">🏆 Pts</th>';
  h += '<th title="Todos os resultados corretos" style="text-align:center">✓ Res.</th>';
  h += '<th title="Resultados que renderam Bônus+1" style="text-align:center">✨ Bônus+1</th>';
  h += '<th title="Placares exatos com menos de 4 gols" style="text-align:center">🎯 Placar+3</th>';
  h += '<th title="Placares exatos com 4 ou mais gols" style="text-align:center">🔥 Placar+5</th>';
  h += '<th title="Últimos 5 jogos (esq=mais antigo → dir=mais recente). 🔥 Placar+5 · 🎯 Placar+3 · ✨ Resultado+Bônus · ✓ Resultado · ✗ Errou" style="text-align:center">Forma</th>';
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
    const posAnterior = _rankingAnteriorData[p.id || p.token || 'MODELO'];
    const mov = (posAnterior) ? (posAnterior > pos ? '▲' : posAnterior < pos ? '▼' : '—') : '—';
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

    const rowBg = '';

    h += '<tr style="cursor:pointer;' + rowBg + '" onclick="_toggleRankingDetalhe(\'rd-' + i + '\')">';
    h += '<td style="text-align:center;font-weight:900;font-size:.95rem">';
    if (isModelo) {
      h += '<span style="font-size:1.1rem">🤖</span><span style="font-size:.65rem;color:' + movCor + '"> ' + mov + '</span>';
    } else {
      h += (medalhao !== null ? medalhao : '<span style="font-size:.88rem">' + pos + '</span>') + '<span style="font-size:.65rem;color:' + movCor + '"> ' + mov + '</span>';
    }
    h += '</td>';

    // Nome
    const stickyBg = 'var(--fundo)';
    h += '<td class="col-apostador" style="text-align:left;font-weight:600;position:sticky;left:0;background:' + stickyBg + ';z-index:1">';
    if (isModelo) {
      h += '<span style="font-weight:normal;color:#94a3b8">Modelo</span>';
      h += '<div style="font-size:.6rem;color:var(--texto2)">referência · fora do ranking</div>';
    } else {
      h += '<span class="apostador-nome" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (p.apelido || p.nome || p.token?.substring(0, 8) || "?") + '</span>';
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
      h += '<div style="grid-column: 1 / -1; margin-bottom: 4px;"><div style="color:var(--texto2)">Tipo</div><div style="font-weight:normal;color:#94a3b8">Referência estatística</div></div>';
    } else {
      h += '<div style="grid-column: 1 / -1; margin-bottom: 4px;"><div style="color:var(--texto2)">Nome Completo</div><div style="font-weight:700">' + (p.nome || "—") + '</div></div>';
    }
    h += '<div><div style="color:var(--texto2)" title="Pontos acumulados somente nos jogos da fase de grupos">Grupos</div><div style="font-weight:700">' + st.total_grupos.toFixed(1) + ' pts</div></div>';
    h += '<div><div style="color:var(--texto2)" title="Pontos dos jogos a partir dos 32 avos de final (fases eliminatórias)">Eliminatórias</div><div style="font-weight:700">' + st.total_eliminatorias.toFixed(1) + ' pts</div></div>';
    h += '<div><div style="color:var(--texto2)" title="Pontos de palpites especiais: Campeão, Vice e 3º Lugar">Especiais</div><div style="font-weight:700">' + st.total_especiais + ' pts</div></div>';
    h += '<div><div style="color:var(--texto2)" title="Jogos em que nenhum palpite foi registrado — valem 0 pts">Sem palpite</div><div style="font-weight:700;color:var(--texto2)">' + st.sem_palpite + '</div></div>';
    h += '</div></div></td></tr>';
  });

  h += '</tbody></table></div>';


  el.innerHTML = h;

  // Tooltip unificado (hover desktop + toque mobile) em todos os [title] da aba
  window.injetarTooltipsMobile(el);
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