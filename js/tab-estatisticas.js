/** tab-estatisticas.js - Dashboard completo de estatísticas */
window.renderEstatisticas = function () {
  const el = document.getElementById("aba-estatisticas");
  if (!el) return;
  const res = getResultados();
  const apos = APP.apostadores || [];
  const pals = APP.palpites || {};
  const schedule = window.SCHEDULE || [];
  // Fix #8: APP.especiais não existe — usar extrairEspeciaisOficiais, igual às outras abas.
  const esp = window.BRACKET.extrairEspeciaisOficiais(res, APP.bracket || {});
  if (!apos.length) { el.innerHTML = '<div class="card"><p style="color:var(--texto2)">Nenhum apostador cadastrado.</p></div>'; return; }

  const ranking = gerarRanking(pals, res, apos, esp);
  const jogosFeitos = schedule
    .filter(j => res[j.id]?.homeGoals !== undefined)
    .sort((a, b) => new Date(a.utc) - new Date(b.utc));

  // Helper: dado array sorted desc por score, retorna [top1, top2?] se empate no topo
  function _tieTop2(sorted, getScore) {
    if (!sorted.length) return null;
    const best = sorted[0];
    const bestScore = getScore(best);
    const second = sorted[1];
    if (second && getScore(second) === bestScore) return [best, second];
    return [best];
  }
  function _tieName(arr) {
    if (!arr) return '—';
    if (arr.length >= 2) return [
      arr[0]?.participante?.apelido || arr[0]?.participante?.nome || arr[0]?.apelido || arr[0]?.nome || '—',
      arr[1]?.participante?.apelido || arr[1]?.participante?.nome || arr[1]?.apelido || arr[1]?.nome || '—',
    ];
    const a = arr[0];
    return a?.participante?.apelido || a?.participante?.nome || a?.apelido || a?.nome || '—';
  }

  // Helper: ordena os candidatos e retorna os 2 melhores/piores respeitando os desempates por pontos
  function obterDestaques(getScore, isGoodCard, higherIsWinner = true, filterFn = null) {
    let candidatos = ranking.map(r => {
      const score = getScore(r);
      return { r, score };
    });

    if (filterFn) {
      candidatos = candidatos.filter(c => filterFn(c.score, c.r));
    }

    candidatos.sort((a, b) => {
      const diff = higherIsWinner ? (b.score - a.score) : (a.score - b.score);
      if (Math.abs(diff) > 0.0001) return diff;
      
      // Desempate:
      if (isGoodCard) {
        // Se o card for bom: mais pontos primeiro
        if (b.r.stats.total !== a.r.stats.total) {
          return b.r.stats.total - a.r.stats.total;
        }
        return a.r.posicao - b.r.posicao; // melhor posição
      } else {
        // Se o card for ruim: menos pontos primeiro
        if (a.r.stats.total !== b.r.stats.total) {
          return a.r.stats.total - b.r.stats.total;
        }
        return b.r.posicao - a.r.posicao; // pior posição
      }
    });

    if (!candidatos.length) return { bestArr: null, bestScore: 0, bestApo: null };

    const bestScore = candidatos[0].score;
    // Se o score do melhor for inválido ou 0 (para cards baseados em contagem positiva), trata como vazio.
    const isInvalid = (higherIsWinner === true && bestScore === 0) ||
                      (higherIsWinner === true && bestScore === -Infinity) ||
                      (higherIsWinner === false && bestScore === Infinity);
                      
    if (isInvalid) {
      return { bestArr: null, bestScore: 0, bestApo: null };
    }

    const best = candidatos[0].r;
    let bestArr = [best];
    if (candidatos[1] && Math.abs(candidatos[1].score - bestScore) < 0.0001) {
      bestArr.push(candidatos[1].r);
    }
    
    return { bestArr, bestScore, bestApo: best };
  }

  // Top performers (Líder segue exatamente a classificação oficial)
  const melhorPts = ranking[0];
  const _melhorPtsArr = (ranking[1] && ranking[1].posicao === 1) ? [ranking[0], ranking[1]] : [ranking[0]];

  const destVidente = obterDestaques(r => r.stats.acertos_resultado, true, true);
  const melhorRes = destVidente.bestApo;
  const _melhorResArr = destVidente.bestArr;

  const destAtirador = obterDestaques(r => r.stats.acertos_placar_exato + r.stats.acertos_placar_alto, true, true);
  const melhorExato = destAtirador.bestApo;
  const _melhorExatoArr = destAtirador.bestArr;
  const melhorExatoCount = destAtirador.bestScore;

  // --- Zebra de Ouro ---
  const zebraScores = {};
  for (const jogo of jogosFeitos) {
    const r = res[jogo.id];
    let vH = 0, vD = 0, vA = 0, total = 0;
    for (const aId of Object.keys(pals)) {
      const p = pals[aId]?.[jogo.id];
      if (!p || p.homeGoals === undefined) continue;
      total++;
      const hg = parseInt(p.homeGoals), ag = parseInt(p.awayGoals);
      if (hg > ag) vH++; else if (hg < ag) vA++; else vD++;
    }
    if (total === 0) continue;
    const resReal = r.homeGoals > r.awayGoals ? "H" : (r.homeGoals < r.awayGoals ? "A" : "D");
    const pctGanha = (resReal === "H" ? vH : (resReal === "A" ? vA : vD)) / total;

    if (pctGanha < 0.20) { // Zebra!
      for (const a of apos) {
        const p = pals[a.id]?.[jogo.id];
        if (!p || p.homeGoals === undefined) continue;
        const br = calcularPontosBrutos(p, r);
        if (br.acertou) zebraScores[a.id] = (zebraScores[a.id] || 0) + 1;
      }
    }
  }
  const destZebra = obterDestaques(r => zebraScores[r.participante.id] || 0, true, true);
  const melhorZebra = destZebra.bestApo;
  const _zebraArr = destZebra.bestArr;
  const zebraCount = destZebra.bestScore;

  // --- Mestre dos Bônus ---
  const destMestreBonus = obterDestaques(r => r.stats.acertos_placar_exato + r.stats.acertos_placar_alto + r.stats.acertos_bonus1, true, true);
  const mestreBonus = destMestreBonus.bestApo;
  const _mestreBonusArr = destMestreBonus.bestArr;

  // --- Escalando (Últimos 5 jogos) ---
  const totalJogos = jogosFeitos.length;
  const saltos5 = {};
  if (totalJogos >= 5) {
    const jogosOrdenados = [...jogosFeitos].sort((a, b) => new Date(a.utc) - new Date(b.utc));
    const ultimos5Ids = jogosOrdenados.slice(-5).map(j => j.id);
    const resAnterior = {};
    for (const [id, val] of Object.entries(res)) {
      if (!ultimos5Ids.includes(id)) resAnterior[id] = val;
    }
    const rankingAnterior = gerarRanking(pals, resAnterior, apos, esp);

    for (let i = 0; i < ranking.length; i++) {
      const aId = ranking[i].participante.id;
      const posAtual = ranking[i].posicao;
      const posAnt = rankingAnterior.findIndex(x => x.participante.id === aId) + 1;
      saltos5[aId] = posAnt - posAtual;
    }
  }

  const destEscalando = obterDestaques(r => saltos5[r.participante.id] || 0, true, true, (score) => totalJogos >= 5 && score > 0);
  const escalandoApo = destEscalando.bestApo;
  const _escalandoArr = destEscalando.bestArr;
  const maiorSalto = destEscalando.bestScore;

  // --- Lanterninha (segue exatamente a classificação oficial, pior posição) ---
  const lanterninha = ranking[ranking.length - 1];
  const _lanterninhaArr = (ranking.length >= 2 && ranking[ranking.length - 2].posicao === lanterninha.posicao)
    ? [ranking[ranking.length - 2], lanterninha]
    : [lanterninha];

  // ─── Feature 2: Cálculos dos novos cards ─────────────────────────────────

  // --- Maior Tombo (inverso do Escalando) ---
  const quedas5 = {};
  if (totalJogos >= 5) {
    const jogosOrdenadosTombo = [...jogosFeitos].sort((a, b) => new Date(a.utc) - new Date(b.utc));
    const ultimos5IdsTombo = jogosOrdenadosTombo.slice(-5).map(j => j.id);
    const resAntTombo = {};
    for (const [id, val] of Object.entries(res)) {
      if (!ultimos5IdsTombo.includes(id)) resAntTombo[id] = val;
    }
    const rankingAntTombo = gerarRanking(pals, resAntTombo, apos, esp);
    for (let i = 0; i < ranking.length; i++) {
      const aId = ranking[i].participante.id;
      const posAtual = ranking[i].posicao;
      const posAnt = rankingAntTombo.findIndex(x => x.participante.id === aId) + 1;
      quedas5[aId] = posAtual - posAnt;
    }
  }

  const destQueda = obterDestaques(r => quedas5[r.participante.id] || 0, false, true, (score) => totalJogos >= 5 && score > 0);
  const tombApo = destQueda.bestApo;
  const _tombArr = destQueda.bestArr;
  const maiorTombo = destQueda.bestScore;

  // --- Fênix: maior salto nos últimos 20 jogos (mín 15) ---
  const recuperacoes20 = {};
  if (totalJogos >= 15) {
    const jogosOrdenadosFenix = [...jogosFeitos].sort((a, b) => new Date(a.utc) - new Date(b.utc));
    const ultimos20Ids = jogosOrdenadosFenix.slice(-20).map(j => j.id);
    const resAntFenix = {};
    for (const [id, val] of Object.entries(res)) {
      if (!ultimos20Ids.includes(id)) resAntFenix[id] = val;
    }
    const rankingAntFenix = gerarRanking(pals, resAntFenix, apos, esp);
    for (let i = 0; i < ranking.length; i++) {
      const aId = ranking[i].participante.id;
      const posAtual = ranking[i].posicao;
      const posAnt = rankingAntFenix.findIndex(x => x.participante.id === aId) + 1;
      recuperacoes20[aId] = posAnt - posAtual;
    }
  }

  const destFenix = obterDestaques(r => recuperacoes20[r.participante.id] || 0, true, true, (score) => totalJogos >= 15 && score > 0);
  const recuperApo = destFenix.bestApo;
  const _recuperArr = destFenix.bestArr;
  const maiorRecup = destFenix.bestScore;

  // --- Chutador de Zebra (apostou em mais zebras, independente de acerto) ---
  const zebraApostas = {};
  for (const jogo of schedule) {
    let vH2 = 0, vD2 = 0, vA2 = 0, total2 = 0;
    for (const aId of Object.keys(pals)) {
      const p = pals[aId]?.[jogo.id];
      if (!p || p.homeGoals === undefined) continue;
      total2++;
      const hg = parseInt(p.homeGoals), ag = parseInt(p.awayGoals);
      if (hg > ag) vH2++; else if (hg < ag) vA2++; else vD2++;
    }
    if (total2 === 0) continue;
    for (const a of apos) {
      const p = pals[a.id]?.[jogo.id];
      if (!p || p.homeGoals === undefined) continue;
      const hg = parseInt(p.homeGoals), ag = parseInt(p.awayGoals);
      const apost = hg > ag ? "H" : (hg < ag ? "A" : "D");
      const cnt = apost === "H" ? vH2 : (apost === "A" ? vA2 : vD2);
      if (cnt / total2 < 0.20) {
        zebraApostas[a.id] = (zebraApostas[a.id] || 0) + 1;
      }
    }
  }

  const destDestemido = obterDestaques(r => zebraApostas[r.participante.id] || 0, true, true);
  const chutZebraApo = destDestemido.bestApo;
  const _chutZebraArr = destDestemido.bestArr;
  const chutZebraCount = destDestemido.bestScore;

  // --- Conservador: mais apostas onde ≥50% do grupo apostou no mesmo resultado ---
  const conservScores = {};
  for (const jogo of schedule) {
    let cH = 0, cD = 0, cA = 0, cTotal = 0;
    for (const a of apos) {
      const p = pals[a.id]?.[jogo.id];
      if (!p || p.homeGoals === undefined) continue;
      cTotal++;
      const hg = parseInt(p.homeGoals), ag = parseInt(p.awayGoals);
      if (hg > ag) cH++; else if (hg < ag) cA++; else cD++;
    }
    if (cTotal === 0) continue;
    for (const a of apos) {
      const p = pals[a.id]?.[jogo.id];
      if (!p || p.homeGoals === undefined) continue;
      const hg = parseInt(p.homeGoals), ag = parseInt(p.awayGoals);
      const apost = hg > ag ? "H" : (hg < ag ? "A" : "D");
      const cnt = apost === "H" ? cH : (apost === "A" ? cA : cD);
      if (cnt / cTotal >= 0.50) conservScores[a.id] = (conservScores[a.id] || 0) + 1;
    }
  }

  const destConservador = obterDestaques(r => conservScores[r.participante.id] || 0, true, true);
  const conservApo = destConservador.bestApo;
  const _conservArr = destConservador.bestArr;
  const conservCount = destConservador.bestScore;

  // --- Anarquista: maior distância média |ΔH - ΔA| do placar mais votado ---
  const anarqScores = {};
  const anarqJogos = {};
  for (const jogo of schedule) {
    const placCont = {};
    for (const a of apos) {
      const p = pals[a.id]?.[jogo.id];
      if (!p || p.homeGoals === undefined) continue;
      const pk = parseInt(p.homeGoals) + 'x' + parseInt(p.awayGoals);
      placCont[pk] = (placCont[pk] || 0) + 1;
    }
    const topPlacar = Object.entries(placCont).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!topPlacar) continue;
    const [tH, tA] = topPlacar.split('x').map(Number);
    for (const a of apos) {
      const p = pals[a.id]?.[jogo.id];
      if (!p || p.homeGoals === undefined) continue;
      const dH = parseInt(p.homeGoals) - tH;
      const dA = parseInt(p.awayGoals) - tA;
      const dist = Math.abs(dH - dA);
      anarqScores[a.id] = (anarqScores[a.id] || 0) + dist;
      anarqJogos[a.id] = (anarqJogos[a.id] || 0) + 1;
    }
  }

  const destAnarquista = obterDestaques(r => {
    const id = r.participante.id;
    return (anarqJogos[id] || 0) >= 3 ? (anarqScores[id] / anarqJogos[id]) : 0;
  }, true, true, (score) => score > 0);
  const anarqApo = destAnarquista.bestApo;
  const _anarqArr = destAnarquista.bestArr;
  const anarqMedia = destAnarquista.bestScore ? destAnarquista.bestScore.toFixed(1) : "—";

  // --- Consistência (menor desvio padrão de pts/jogo, mínimo 10 jogos) ---
  const dps = {};
  for (const r2 of ranking) {
    const aId = r2.participante.id;
    const ptsPorJogo = jogosFeitos.map(jogo => {
      const p = pals[aId]?.[jogo.id];
      if (!p || p.homeGoals === undefined) return null;
      const br = calcularPontosBrutos(p, res[jogo.id]);
      return aplicarFator(br.total_bruto, jogo.fase);
    }).filter(x => x !== null);
    if (ptsPorJogo.length < 10) continue;
    const media = ptsPorJogo.reduce((s, v) => s + v, 0) / ptsPorJogo.length;
    dps[aId] = Math.sqrt(ptsPorJogo.reduce((s, v) => s + (v - media) ** 2, 0) / ptsPorJogo.length);
  }

  const destMetronome = obterDestaques(r => dps[r.participante.id] !== undefined ? dps[r.participante.id] : Infinity, true, false, (score) => score !== Infinity);
  const consistApo = destMetronome.bestApo;
  const _consistArr = destMetronome.bestArr;
  const menorDP = destMetronome.bestScore;

  // --- Pior Palpite (maior distância absoluta ΔH+ΔA) ---
  let piorPalpite = null, maiorDistancia = -1;
  let piorJogo = null, piorPlacarApostado = null, piorPlacarReal = null;
  for (const jogo of jogosFeitos) {
    const r2 = res[jogo.id];
    for (const a of apos) {
      const p = pals[a.id]?.[jogo.id];
      if (!p || p.homeGoals === undefined) continue;
      const dist = Math.abs((parseInt(p.homeGoals) - parseInt(p.awayGoals)) - (r2.homeGoals - r2.awayGoals));
      
      const aRank = ranking.find(x => x.participante.id === a.id);
      const piorRank = piorPalpite ? ranking.find(x => x.participante.id === piorPalpite.id) : null;
      
      let isNewPior = false;
      if (dist > maiorDistancia) {
        isNewPior = true;
      } else if (dist === maiorDistancia && dist > 0 && aRank && piorRank) {
        // Desempate: pior card, escolhe o que tem menos pontos
        if (aRank.stats.total < piorRank.stats.total) {
          isNewPior = true;
        } else if (aRank.stats.total === piorRank.stats.total) {
          if (aRank.posicao > piorRank.posicao) {
            isNewPior = true;
          }
        }
      }
      
      if (isNewPior) {
        maiorDistancia = dist;
        piorPalpite = a;
        piorJogo = jogo;
        piorPlacarApostado = p.homeGoals + '×' + p.awayGoals;
        piorPlacarReal = r2.homeGoals + '×' + r2.awayGoals;
      }
    }
  }

  // --- Pé Frio (maior sequência consecutiva de 0 pts, recorde na Copa) ---
  // --- Pé Quente (maior sequência consecutiva acertando pelo menos o resultado, recorde na Copa) ---
  const jogosOrdenadosSeq = [...jogosFeitos].sort((a, b) => new Date(a.utc) - new Date(b.utc));
  const coldStreaks = {};
  const hotStreaks = {};
  for (const r2 of ranking) {
    const aId = r2.participante.id;
    let seqFria = 0, recFria = 0;
    let seqQuente = 0, recQuente = 0;
    for (const jogo of jogosOrdenadosSeq) {
      const p = pals[aId]?.[jogo.id];
      const r2Val = res[jogo.id];
      if (!p || p.homeGoals === undefined || !r2Val) continue;
      const br = calcularPontosBrutos(p, r2Val);
      const pts = aplicarFator(br.total_bruto, jogo.fase);
      // Pé Frio: zero pontos
      if (pts === 0) {
        seqFria++;
        recFria = Math.max(recFria, seqFria);
      } else {
        seqFria = 0;
      }
      // Pé Quente: acertou pelo menos o resultado
      if (br.acertou) {
        seqQuente++;
        recQuente = Math.max(recQuente, seqQuente);
      } else {
        seqQuente = 0;
      }
    }
    coldStreaks[aId] = recFria;
    hotStreaks[aId] = recQuente;
  }

  const destPeFrio = obterDestaques(r => coldStreaks[r.participante.id] || 0, false, true);
  const peFrioApo = destPeFrio.bestApo;
  const _peFrioArr = destPeFrio.bestArr;
  const maiorSeqFria = destPeFrio.bestScore;

  const destPeQuente = obterDestaques(r => hotStreaks[r.participante.id] || 0, true, true);
  const peQuenteApo = destPeQuente.bestApo;
  const _peQuenteArr = destPeQuente.bestArr;
  const maiorSeqQuente = destPeQuente.bestScore;

  let h = "";

  // Cards de destaque
  h += `<style>
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6px;
      margin-bottom: 12px;
    }
    @media (min-width: 600px) {
      .stats-grid {
        grid-template-columns: repeat(8, 1fr);
        gap: 8px;
      }
    }
    .stat-d-card {
      background: var(--card2);
      border: 1px solid var(--borda);
      border-radius: var(--radius-sm);
      padding: 6px 4px;
      text-align: center;
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-height: 100px;
      position: relative;
      cursor: pointer;
    }
    .stat-d-icon { font-size: 1.38rem; margin-bottom: 7px; line-height: 1; }
    .stat-d-label { font-size: 0.64rem; color: var(--texto2); text-transform: uppercase; letter-spacing: 0.02em; margin-bottom: 3px; line-height: 1.1; }
    .stat-d-nome { font-size: 0.88rem; font-weight: 800; color: var(--cor-destaque); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 2px; }
    .stat-d-nome--tie { font-size: 0.72rem; white-space: normal; line-height: 1.25; word-break: break-word; }
    .stat-d-tie-sep { color: var(--texto2); font-weight: 400; }
    .stat-d-sub { font-size: 0.62rem; color: var(--texto2); margin-top: 2px; }
    @media (max-width: 599px) {
      .stat-d-card {
        min-height: 0;
        padding: 7px 5px;
        flex-direction: row;
        align-items: center;
        gap: 6px;
        text-align: left;
        justify-content: flex-start;
      }
      .stat-d-icon {
        font-size: 1.1rem;
        margin-bottom: 0;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        align-self: center;
        line-height: 1;
      }
      .stat-d-body {
        display: flex;
        flex-direction: column;
        min-width: 0;
        gap: 2px;
      }
      .stat-d-label { font-size: 0.52rem; margin-bottom: 0; }
      .stat-d-nome { font-size: 0.83rem; }
      .stat-d-nome--tie { font-size: 0.68rem; }
      .stat-d-sub { font-size: 0.56rem; margin-top: 0; }
    }
    .stat-tooltip {
      display: none;
      position: absolute;
      top: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%);
      background: #1e293b;
      color: #e2e8f0;
      font-size: 0.68rem;
      line-height: 1.45;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.12);
      width: 200px;
      text-align: left;
      z-index: 999;
      box-shadow: 0 6px 20px rgba(0,0,0,0.5);
      pointer-events: none;
    }
    .stat-tooltip::before {
      content: '';
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      border: 6px solid transparent;
      border-bottom-color: #1e293b;
    }
    .stat-d-card.tooltip-visivel .stat-tooltip { display: block; }
    .fav-apostadores-row {
      display: grid;
      grid-template-columns: 120px 1fr 65px;
      align-items: center;
      gap: 12px;
      padding: 6px 8px;
      border-radius: var(--radius-sm);
      transition: background 0.2s ease;
    }
    .fav-apostadores-row:hover {
      background: rgba(255, 255, 255, 0.02);
    }
    @media (min-width: 600px) {
      .fav-apostadores-row {
        grid-template-columns: 160px 1fr 80px;
        gap: 16px;
      }
    }
    .card-sem-padding {
      padding: 0 !important;
      overflow: hidden;
    }
    .card-sem-padding .card-titulo {
      padding: 14px 14px 8px;
      margin-bottom: 12px;
    }
    @media (max-width: 599px) {
      .card-sem-padding .card-titulo {
        padding: 10px 10px 8px;
      }
    }
  </style>`;

  h += '<div class="stats-grid">';
  h += _dCard("🏆", "Líder", (jogosFeitos.length === 0 ? "—" : _tieName(_melhorPtsArr)), (jogosFeitos.length === 0 ? "— (sem jogos)" : melhorPts ? melhorPts.stats.total.toFixed(1) + " pts" : "—"), "var(--dourado)", "Quem tem mais pontos no total. Cada jogo vale mais dependendo da fase: grupos, oitavas, quartas, semi e final têm multiplicadores crescentes.");
  h += _dCard("🔮", "Vidente", (jogosFeitos.length === 0 ? "—" : _tieName(_melhorResArr)), (jogosFeitos.length === 0 ? "— (sem jogos)" : melhorRes ? melhorRes.stats.acertos_resultado + " acertos de resultados" : "—"), "#86efac", "Quem mais acertou o desfecho dos jogos — vitória do time da casa, empate ou vitória do visitante — sem precisar acertar o placar exato.");
  h += _dCard("🎯", "Atirador de Elite", (jogosFeitos.length === 0 ? "—" : _tieName(_melhorExatoArr)), (jogosFeitos.length === 0 ? "— (sem jogos)" : melhorExato ? melhorExatoCount + " placares exatos" : "—"), "var(--verde-ok)", "Quem mais acertou o placar exato. Placares normais dão +3 pts de bônus; placares com 4 ou mais gols no total dão +5 pts.");
  h += _dCard("🦓", "Zebra de Ouro", (jogosFeitos.length === 0 ? "—" : _tieName(_zebraArr)), (jogosFeitos.length === 0 ? "— (sem jogos)" : melhorZebra ? zebraCount + " zebras domadas" : "—"), "#fcd34d", "Quem mais acertou resultados que menos de 20% do grupo havia apostado — palpites raros E corretos. Coragem com precisão.");
  h += _dCard("💎", "Mestre dos Bônus", (jogosFeitos.length === 0 ? "—" : _tieName(_mestreBonusArr)), (jogosFeitos.length === 0 ? "— (sem jogos)" : mestreBonus ? (mestreBonus.jogosComBonus ?? 0) + " jogos com bônus" : "—"), "#c084fc", "Quem somou mais jogos com algum bônus: placar exato (+3 ou +5 pts), diferença de gols correta (+1 pt) ou gols de um time corretos (+1 pt).");
  h += _dCard("🧗", "Escalando", (totalJogos < 5 ? "—" : _tieName(_escalandoArr)), (totalJogos < 5 ? "— (< 5 jogos)" : (escalandoApo && maiorSalto > 0 ? "+" + maiorSalto + " posições" : "—")), "#fb7185", "Quem mais subiu no ranking nos últimos 5 jogos. Compara a posição atual com a de antes desses 5 jogos.");
  h += _dCard("🕯️", "Lanterninha", (jogosFeitos.length === 0 ? "—" : _tieName(_lanterninhaArr)), (jogosFeitos.length === 0 ? "— (sem jogos)" : lanterninha ? lanterninha.stats.total.toFixed(1) + " pts" : "—"), "#94a3b8", "Quem está com menos pontos acumulados até agora. A lanterna da Copa.");
  h += _dCard("📉", "Queda Livre", (totalJogos < 5 ? "—" : _tieName(_tombArr)), (totalJogos < 5 ? "— (< 5 jogos)" : (tombApo && maiorTombo > 0 ? "−" + maiorTombo + " posições" : "—")), "#f87171", "Quem mais caiu no ranking nos últimos 5 jogos. Compara a posição atual com a de antes desses 5 jogos.");
  h += _dCard("🔄", "Fênix", (totalJogos < 15 ? "—" : _tieName(_recuperArr)), (totalJogos < 15 ? "— (< 15 jogos)" : (recuperApo && maiorRecup > 0 ? "+" + maiorRecup + " posições" : "—")), "#38bdf8", "Quem mais subiu no ranking nos últimos 20 jogos. Começa a ser calculado a partir do 15º jogo da Copa.");
  h += _dCard("🃏", "Destemido", _tieName(_chutZebraArr), (!chutZebraApo ? "—" : chutZebraCount + " palpites improváveis"), "#f59e0b", "Quem mais apostou em resultados que menos de 20% do grupo escolheu — independente de acertar. Diferente da Zebra de Ouro, que só conta quando o palpite improvável estava certo.");
  h += _dCard("💤", "Conservador", _tieName(_conservArr), (!conservApo ? "— (sem consenso)" : conservCount + " vezes no consenso"), "#94a3b8", "Quem mais apostou igual à maioria: o resultado escolhido tinha pelo menos 50% dos palpites do grupo naquela direção.");
  h += _dCard("🎲", "Anarquista", _tieName(_anarqArr), (!anarqApo ? "— (< 3 apostas)" : "Δ" + anarqMedia + " de distância média"), "#a78bfa", "Quem mais diverge do placar mais votado pelo grupo em cada jogo apostado. A distância é medida por |(palH−palA) − (topH−topA)|, onde topH×topA é o placar mais chutado. Mínimo 3 apostas.");
  h += _dCard("⚖️", "Metrônomo", (jogosFeitos.length < 10 ? "—" : _tieName(_consistArr)), (jogosFeitos.length < 10 || !consistApo ? "— (< 10 jogos)" : (consistApo ? "DP " + menorDP.toFixed(2) + " pts" : "—")), "#34d399", "Quem pontua de forma mais consistente jogo a jogo, com menor variação entre rodadas boas e ruins. Calculado pelo desvio padrão dos pontos por jogo (mínimo 10 jogos).");
  h += _dCard("🙈", "Pra fora!", (piorPalpite?.apelido || piorPalpite?.nome || "—"), (piorJogo && piorPalpite ? piorPlacarApostado + " (foi " + piorPlacarReal + ")" : "—"), "#fb923c", "O palpite mais distante do resultado real na Copa inteira, medido pela diferença de gols: |(palH−palA) − (resH−resA)|. Ex: resultado 1×0, chute 0×4 → |(−4) − 1| = 5.");
  h += _dCard("🥶", "Pé Frio", (jogosFeitos.length === 0 ? "—" : _tieName(_peFrioArr)), (jogosFeitos.length === 0 ? "— (sem jogos)" : (!peFrioApo || maiorSeqFria === 0 ? "—" : maiorSeqFria + " jogos seguidos zerado")), "#7dd3fc", "Quem teve a maior sequência seguida de jogos com zero pontos — o recorde de fase ruim da Copa.");
  h += _dCard("🔥", "Pé Quente", (jogosFeitos.length === 0 ? "—" : _tieName(_peQuenteArr)), (jogosFeitos.length === 0 ? "— (sem jogos)" : (!peQuenteApo || maiorSeqQuente === 0 ? "—" : maiorSeqQuente + " resultados seguidos")), "#fdba74", "Quem teve a maior sequência seguida acertando pelo menos o resultado (vitória/empate) em cada jogo — o recorde de fase boa da Copa.");
  h += '</div>';

  // Listener de delegate para tooltips (garante single-listener via flag no document)
  requestAnimationFrame(() => {
    if (!document._statTooltipListenerActive) {
      document._statTooltipListenerActive = true;
      document.addEventListener('click', function (e) {
        const card = e.target.closest('.stat-d-card');
        const allCards = document.querySelectorAll('#aba-estatisticas .stat-d-card');
        if (card && card.dataset.tooltip) {
          const isVisible = card.classList.contains('tooltip-visivel');
          allCards.forEach(c => c.classList.remove('tooltip-visivel'));
          if (!isVisible) card.classList.add('tooltip-visivel');
          e.stopPropagation();
        } else {
          allCards.forEach(c => c.classList.remove('tooltip-visivel'));
        }
      });
    }
  });

  // Jogo mais e menos acertado
  const jogoStats = jogosFeitos.map(jogo => {
    const r = res[jogo.id];
    let acertos = 0, totalApostas = 0;
    for (const a of apos) {
      const p = pals[a.id]?.[jogo.id];
      if (!p || p.homeGoals === undefined) continue;
      totalApostas++;
      const br = calcularPontosBrutos(p, r);
      if (br.acertou) acertos++;
    }
    return { jogo, acertos, totalApostas, pct: totalApostas ? Math.round(acertos / totalApostas * 100) : 0 };
  }).filter(x => x.acertos > 0).sort((a, b) => b.pct - a.pct);

  if (jogoStats.length) {
    h += '<div class="card"><div class="card-titulo">📊 Jogos por Acerto</div>';
    h += '<div style="display:grid;gap:6px">';
    const top3 = jogoStats.slice(0, 3);
    const bot3 = jogoStats.slice(-3).reverse();
    h += '<div style="font-size:.7rem;font-weight:700;color:var(--verde-ok);text-transform:uppercase;letter-spacing:.05em">Mais acertados</div>';
    for (const s of top3) {
      const b = APP.bracket?.[s.jogo.id] || {}; const hC = b.home || s.jogo.home; const aC = b.away || s.jogo.away;
      h += _jogoStatRow(s.jogo.id, hC, aC, res[s.jogo.id], s.acertos, s.totalApostas, "var(--verde-ok)");
    }
    h += '<div style="font-size:.7rem;font-weight:700;color:#f87171;text-transform:uppercase;letter-spacing:.05em;margin-top:8px">Menos acertados (mais difíceis)</div>';
    for (const s of bot3) {
      const b = APP.bracket?.[s.jogo.id] || {}; const hC = b.home || s.jogo.home; const aC = b.away || s.jogo.away;
      h += _jogoStatRow(s.jogo.id, hC, aC, res[s.jogo.id], s.acertos, s.totalApostas, "#f87171");
    }
    h += '</div></div>';
  }

  // Projeção campeão (% dos apostadores)
  // Fix #8: especiais ficam em apostador.especiais, não em esp[a.id]
  const campVotos = {};
  for (const a of apos) {
    const c = a.especiais?.campeao;
    if (!c) continue;
    campVotos[c] = (campVotos[c] || 0) + 1;
  }
  const sortedCamp = Object.entries(campVotos).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (sortedCamp.length) {
    h += '<div class="card"><div class="card-titulo">🏆 Favoritos dos Apostadores <span title="Mostra para qual seleção cada apostador apostou como campeão do mundial. O ✓ dourado indica o campeão real já confirmado." style="font-size:.8rem;cursor:help;color:var(--texto2);font-weight:normal">ⓘ</span></div>';
    h += '<div style="display:grid;gap:6px">';
    const maxV = sortedCamp[0][1];
    for (const [code, ct] of sortedCamp) {
      const info = window.TEAMS_BY_CODE?.[code];
      const pct = apos.length ? Math.round(ct / apos.length * 100) : 0;
      // Fix #4: campeão oficial vem de extrairEspeciaisOficiais, não de bracket["FNL"].home
      const campeaoOficial = esp.campeao && esp.campeao === code;
      h += '<div class="fav-apostadores-row">';
      h += '<div style="display:flex;align-items:center;gap:8px;font-weight:600;min-width:0;">' +
           htmlBandeira(code, 18) +
           '<span class="stat-time-nome" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (info?.name || code) + '</span>' +
           (campeaoOficial ? '<span style="color:var(--dourado);margin-left:4px" title="Campeão Confirmado">✓</span>' : '') +
           '</div>';
      h += '<div style="background:var(--fundo2);border-radius:5px;height:10px;overflow:hidden;border:1px solid var(--borda)">' +
           '<div style="width:' + (ct / maxV * 100) + '%;height:100%;background:var(--verde);border-radius:5px"></div>' +
           '</div>';
      h += '<span style="font-size:.75rem;color:var(--texto2);font-weight:700;text-align:right;white-space:nowrap">' +
           ct + ' <span style="font-size:.65rem;font-weight:normal;opacity:0.85">(' + pct + '%)</span>' +
           '</span>';
      h += '</div>';
    }
    h += '</div></div>';
  }


  // Resumo Avançado de Todos os Jogos
  h += '<div class="card card-sem-padding"><div class="card-titulo">📈 Estatísticas Avançadas por Jogo</div><div class="compilacao-wrap"><table class="compilacao-table stat-full-table" style="font-size:.7rem">';
  h += '<thead><tr>';
  h += '<th class="stat-col-jogo" style="text-align:left;position:sticky;left:0;background:var(--fundo2);z-index:2;box-shadow:2px 0 5px rgba(0,0,0,0.1)">Jogo</th>';
  h += '<th class="col-resultado" title="Placar oficial do jogo">Resultado</th>';
  h += '<th title="Nº de apostadores que apostaram na vitória do Time 1 (mandante)">Apostas T1</th>';
  h += '<th title="Nº de apostadores que apostaram em empate">Apostas Emp</th>';
  h += '<th title="Nº de apostadores que apostaram na vitória do Time 2 (visitante)">Apostas T2</th>';
  h += '<th title="O placar mais apostado pelo grupo, com % dos que apostaram nele">Top Placar</th>';
  h += '<th title="Quantos apostadores acertaram o resultado (vitória ou empate)">Acertos Res</th>';
  h += '<th title="Quantos apostadores acertaram o placar exato">Acertos Plac</th>';
  h += '<th style="width:12px;background:var(--fundo);border-left:1px solid var(--borda);border-right:1px solid var(--borda)"></th>';
  h += '<th title="Rating ELO do Time 1 — mede a força histórica acumulada da seleção">Elo T1</th>';
  h += '<th title="Rating ELO do Time 2 — mede a força histórica acumulada da seleção">Elo T2</th>';
  h += '<th title="Gols esperados do Time 1 estimados pelo modelo Dixon-Coles">xGols T1</th>';
  h += '<th title="Gols esperados do Time 2 estimados pelo modelo Dixon-Coles">xGols T2</th>';
  h += '<th title="Probabilidade de vitória do Time 1 segundo o modelo">Prob T1</th>';
  h += '<th title="Probabilidade de empate segundo o modelo">Prob E</th>';
  h += '<th title="Probabilidade de vitória do Time 2 segundo o modelo">Prob T2</th>';
  h += '</tr></thead><tbody>';

  const formatPct = (val, tot) => tot > 0 ? `<div style="font-size:.6rem;color:var(--texto2);margin-top:1px;line-height:1">${((val / tot) * 100).toFixed(0)}%</div>` : '';
  const formatNumPct = (val, tot, color = "var(--texto)") => `<div style="color:${color};font-weight:700;line-height:1">${val}</div>` + formatPct(val, tot);

  const jogosOrdenados = (window.SCHEDULE || []).sort((a, b) => new Date(a.utc) - new Date(b.utc));
  for (const jogo of jogosOrdenados) {
    const b = APP.bracket?.[jogo.id] || {};
    const hC = b.home || jogo.home;
    const aC = b.away || jogo.away;
    const hName = getShortName(hC);
    const aName = getShortName(aC);

    // Bets
    let totalBets = 0, vH = 0, vD = 0, vA = 0;
    const placares = {};
    let aRes = 0, aPlac = 0;
    const r = res[jogo.id];

    for (const a of apos) {
      const p = pals[a.id]?.[jogo.id];
      if (!p || p.homeGoals === undefined) continue;
      totalBets++;
      const hg = parseInt(p.homeGoals);
      const ag = parseInt(p.awayGoals);
      if (hg > ag) vH++; else if (hg < ag) vA++; else vD++;
      const pk = hg + 'x' + ag;
      placares[pk] = (placares[pk] || 0) + 1;

      if (r && r.homeGoals !== undefined) {
        const br = calcularPontosBrutos(p, r);
        if (br.acertou) aRes++;
        if (br.bonus_tipo === "placar_exato") aPlac++;
      }
    }

    const mChutado = Object.entries(placares).sort((a, b) => b[1] - a[1])[0];
    const temRes = r && r.homeGoals !== undefined;
    const apostasAbertas = jogoAceita(jogo.id);
    const podeVer = (temRes && !jogoEhSimulado(jogo.id)) || !apostasAbertas;

    const strPlacarMais = mChutado ? `${mChutado[0]} <span style="font-size:.65rem;color:var(--texto2)">(${((mChutado[1] / totalBets) * 100).toFixed(1)}%)</span>` : '—';

    // AI Prognosis
    let prog = null;
    if (window.PROGNOSE && typeof PROGNOSE.calcular === "function" && hC !== "TBD" && aC !== "TBD") {
      const isNeutral = !['USA', 'CAN', 'MEX'].includes(hC) && !['USA', 'CAN', 'MEX'].includes(aC);
      prog = PROGNOSE.calcular(hC, aC, isNeutral);
    }

    const rowBg = (r && r.homeGoals !== undefined) ? '' : ' opacity:0.65;';

    const isMobile = window.innerWidth <= 600;
    const dataHoraStr = formatarDataBRT(jogo.utc, false);
    const faseLbl = getFaseLabel(jogo);
    const dataHoraLbl = dataHoraStr + (faseLbl ? ", " + faseLbl : "");
    h += `<tr style="${rowBg}">`;
    h += `<td class="stat-col-jogo" onclick="PROGNOSE.abrirModal('${jogo.id}')" style="text-align:left;position:sticky;left:0;background:var(--card2);padding:6px 8px;z-index:1;box-shadow:2px 0 5px rgba(0,0,0,0.1);cursor:pointer">
            <div style="font-size:.6rem;color:var(--texto2);margin-bottom:3px">${dataHoraLbl}</div>
            <div style="display:flex;align-items:center;gap:4px;font-weight:700;width:100%">
              ${htmlBandeira(hC, 14)} <span class="stat-time-nome${isMobile ? ' stat-sigla' : ''}">${isMobile ? getSigla(hC) : hName}</span> <span style="color:var(--texto2)">×</span> <span class="stat-time-nome${isMobile ? ' stat-sigla' : ''}">${isMobile ? getSigla(aC) : aName}</span> ${htmlBandeira(aC, 14)}
            </div>
          </td>`;

    // Result column
    if (temRes) {
      let resHtml = `${r.homeGoals}x${r.awayGoals}`;
      if (r.foi_penaltis) {
        const ph = r.penaltis_home ?? 0; const pa = r.penaltis_away ?? 0;
        resHtml += `<div style="font-size:.58rem;color:var(--amber);margin-top:1px;font-weight:700">PEN ${ph}x${pa}</div>`;
      }
      h += `<td class="col-resultado" onclick="PROGNOSE.abrirModal('${jogo.id}')" style="color:var(--verde-ok);font-weight:800;vertical-align:middle;cursor:pointer">${resHtml}</td>`;
    } else {
      h += `<td class="col-resultado" onclick="PROGNOSE.abrirModal('${jogo.id}')" style="color:var(--texto2);cursor:pointer">–</td>`;
    }

    if (podeVer) {
      h += `<td>${formatNumPct(vH, totalBets)}</td>`;
      h += `<td>${formatNumPct(vD, totalBets)}</td>`;
      h += `<td>${formatNumPct(vA, totalBets)}</td>`;
      h += `<td><strong style="color:var(--verde-light)">${strPlacarMais}</strong></td>`;
      h += `<td>${temRes ? formatNumPct(aRes, totalBets, 'var(--verde-ok)') : '—'}</td>`;
      h += `<td>${temRes ? formatNumPct(aPlac, totalBets, '#86efac') : '—'}</td>`;
    } else {
      h += `<td colspan="6" style="color:var(--texto2);font-size:.75rem;letter-spacing:1px;opacity:0.6">🔒 Conteúdo bloqueado até o fechamento das apostas</td>`;
    }

    h += `<td style="background:var(--fundo);border-left:1px solid var(--borda);border-right:1px solid var(--borda)"></td>`; // gap

    if (podeVer && prog) {
      h += `<td><span style="color:var(--texto2)">${Math.round(prog.eloH)}</span></td>`;
      h += `<td><span style="color:var(--texto2)">${Math.round(prog.eloA)}</span></td>`;
      h += `<td><strong style="color:var(--texto)">${prog.lH.toFixed(2)}</strong></td>`;
      h += `<td><strong style="color:var(--texto)">${prog.lA.toFixed(2)}</strong></td>`;
      h += `<td><div style="color:var(--verde-light);font-weight:700">${(prog.home * 100).toFixed(1)}%</div></td>`;
      h += `<td><div style="color:var(--texto2);font-weight:700">${(prog.draw * 100).toFixed(1)}%</div></td>`;
      h += `<td><div style="color:var(--verde-light);font-weight:700">${(prog.away * 100).toFixed(1)}%</div></td>`;
    } else if (!podeVer) {
      h += `<td colspan="7" style="color:var(--texto2);font-size:.7rem;opacity:0.6">🔒 Previsão indisponível</td>`;
    } else {
      h += `<td colspan="7" style="color:var(--texto2);font-size:.65rem">Sem dados do modelo</td>`;
    }

    h += `</tr>`;
  }
  h += '</tbody></table></div></div>';

  // Head-to-Head (se >= 2 apostadores)
  let aposHtH = [...apos];
  const modHtH = window.getModelo ? window.getModelo() : null;
  if (modHtH && APP._modeloCarregado) {
    aposHtH.push(modHtH);
  }

  if (aposHtH.length >= 2) {
    h += '<div class="card"><div class="card-titulo">⚔️ Head-to-Head</div>';
    if (APP._modoSimulacao) {
      h += '<div style="color:#f87171;font-size:.8rem;padding:10px 0;text-align:center">🔒 O Head-to-Head fica indisponível no modo simulação para proteger a privacidade dos palpites.</div></div>';
    } else {
      h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">';
      h += '<select id="hth-a1" style="flex:1" onchange="renderHtH()"><option value="">Apostador 1</option>';
      for (const a of aposHtH) h += '<option value="' + a.id + '">' + (a.apelido || a.nome || a.token) + '</option>';
      h += '</select><span style="align-self:center">vs</span>';
      h += '<select id="hth-a2" style="flex:1" onchange="renderHtH()"><option value="">Apostador 2</option>';
      for (const a of aposHtH) h += '<option value="' + a.id + '">' + (a.apelido || a.nome || a.token) + '</option>';
      h += '</select></div>';
      h += '<div id="hth-resultado"></div></div>';
    }
  }

  el.innerHTML = h;

  // Tooltip unificado (hover desktop + toque mobile) em todos os [title] da aba
  window.injetarTooltipsMobile(el);
};

window.renderHtH = function () {
  const id1 = document.getElementById("hth-a1")?.value;
  const id2 = document.getElementById("hth-a2")?.value;
  const out = document.getElementById("hth-resultado");
  if (!out) return;
  if (APP._modoSimulacao) {
    out.innerHTML = '<p style="color:#f87171;font-size:.78rem;text-align:center">Indisponível em simulação.</p>';
    return;
  }
  if (!id1 || !id2 || id1 === id2) { out.innerHTML = '<p style="color:var(--texto2);font-size:.78rem;text-align:center">Selecione dois apostadores diferentes.</p>'; return; }
  
  // Garantia absoluta de usar apenas resultados oficiais
  const res = APP.resultados || {};
  const pals = APP.palpites || {};
  const palsMod = APP.palpitesModelo || {};
  
  const getPalpite = (id, jid) => id === "MODELO" ? palsMod[jid] : pals[id]?.[jid];

  const jogosFeitos = (window.SCHEDULE || []).filter(j => res[j.id]?.homeGoals !== undefined);
  let pts1 = 0, pts2 = 0, ganhou1 = 0, ganhou2 = 0, empHtH = 0;
  let rows = "";
  for (const jogo of jogosFeitos) {
    const r = res[jogo.id];
    const p1 = getPalpite(id1, jogo.id); const p2 = getPalpite(id2, jogo.id);
    const br1 = p1?.homeGoals !== undefined ? calcularPontosBrutos(p1, r) : null;
    const br2 = p2?.homeGoals !== undefined ? calcularPontosBrutos(p2, r) : null;
    const v1 = br1 ? aplicarFator(br1.total_bruto, jogo.fase) : 0;
    const v2 = br2 ? aplicarFator(br2.total_bruto, jogo.fase) : 0;
    pts1 += v1; pts2 += v2;
    if (v1 > v2) ganhou1++; else if (v2 > v1) ganhou2++; else empHtH++;
    const b = APP.bracket?.[jogo.id] || {}; const hC = b.home || jogo.home; const aC = b.away || jogo.away;
    const cor1 = v1 > v2 ? "var(--verde-ok)" : v1 < v2 ? "#f87171" : "var(--texto2)";
    const cor2 = v2 > v1 ? "var(--verde-ok)" : v2 < v1 ? "#f87171" : "var(--texto2)";
    rows += '<tr><td class="stat-col-jogo" onclick="PROGNOSE.abrirModal(\'' + jogo.id + '\')" style="text-align:left;font-size:.73rem;position:sticky;left:0;background:var(--fundo);z-index:1;box-shadow:2px 0 5px rgba(0,0,0,0.1);cursor:pointer">' +
      '<div style="display:flex;align-items:center;gap:4px;width:100%"><span class="stat-time-nome">' + getShortName(hC) + '</span> <span style="color:var(--texto2)">×</span> <span class="stat-time-nome">' + getShortName(aC) + '</span></div></td>' +
      '<td onclick="PROGNOSE.abrirModal(\'' + jogo.id + '\')" style="font-size:.72rem;cursor:pointer">' + r.homeGoals + '×' + r.awayGoals + '</td>' +
      '<td style="color:' + cor1 + ';font-weight:700">' + (p1 ? p1.homeGoals + '×' + p1.awayGoals + ' (' + v1 + 'pts)' : '—') + '</td>' +
      '<td style="color:' + cor2 + ';font-weight:700">' + (p2 ? p2.homeGoals + '×' + p2.awayGoals + ' (' + v2 + 'pts)' : '—') + '</td></tr>';
  }
  
  let aposHtH = [...(APP.apostadores || [])];
  const modHtH = window.getModelo ? window.getModelo() : null;
  if (modHtH && APP._modeloCarregado) aposHtH.push(modHtH);

  const a1 = aposHtH.find(a => a.id === id1); 
  const a2 = aposHtH.find(a => a.id === id2);
  const n1 = a1?.apelido || a1?.nome || "A1"; const n2 = a2?.apelido || a2?.nome || "A2";
  const corTot1 = pts1 > pts2 ? "var(--verde-ok)" : "var(--texto2)"; const corTot2 = pts2 > pts1 ? "var(--verde-ok)" : "var(--texto2)";
  let h = '<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8px;text-align:center;margin-bottom:10px;align-items:center">';
  h += '<div style="font-size:1.1rem;font-weight:900;color:' + corTot1 + '">' + pts1.toFixed(1) + ' pts<div style="font-size:.72rem;color:var(--texto2)">' + n1 + '</div></div>';
  h += '<div style="font-size:.8rem;color:var(--texto2)">' + ganhou1 + '–' + empHtH + '–' + ganhou2 + '</div>';
  h += '<div style="font-size:1.1rem;font-weight:900;color:' + corTot2 + '">' + pts2.toFixed(1) + ' pts<div style="font-size:.72rem;color:var(--texto2)">' + n2 + '</div></div></div>';
  h += '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table class="compilacao-table" style="min-width:350px"><thead><tr><th class="stat-col-jogo" style="text-align:left;position:sticky;left:0;background:var(--card);z-index:1;box-shadow:2px 0 5px rgba(0,0,0,0.1)">Jogo</th><th>Resultado</th><th>' + n1 + '</th><th>' + n2 + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  out.innerHTML = h;
};

function _dCard(icon, label, nome, sub, cor, tooltip) {
  const tipAttr = tooltip ? ` data-tooltip="${tooltip.replace(/"/g, '&quot;')}"` : '';
  const tipEl = tooltip
    ? `<div class="stat-tooltip">${tooltip}</div>`
    : '';
  // `nome` pode ser string simples ou array de até 2 nomes (empate)
  let nomeHtml;
  if (Array.isArray(nome) && nome.length >= 2) {
    nomeHtml = `<div class="stat-d-nome stat-d-nome--tie" style="--cor-destaque: ${cor}">${nome[0]}<span class="stat-d-tie-sep"> &amp; </span>${nome[1]}</div>`;
  } else {
    const nomeStr = Array.isArray(nome) ? (nome[0] || '—') : nome;
    nomeHtml = `<div class="stat-d-nome" style="--cor-destaque: ${cor}">${nomeStr}</div>`;
  }
  return `<div class="stat-d-card"${tipAttr}>
    <div class="stat-d-icon">${icon}</div>
    <div class="stat-d-body">
      <div class="stat-d-label">${label}</div>
      ${nomeHtml}
      <div class="stat-d-sub">${sub}</div>
    </div>
    ${tipEl}
  </div>`;
}

function _jogoStatRow(jogoId, hC, aC, r, acertos, total, cor) {
  const pct = total ? Math.round(acertos / total * 100) : 0;
  return '<div onclick="PROGNOSE.abrirModal(\'' + jogoId + '\')" onmouseover="this.style.background=\'rgba(255,255,255,0.04)\'" onmouseout="this.style.background=\'\'" style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;border-radius:6px;transition:background 0.15s">' +
    htmlBandeira(hC, 16) + ' <span class="stat-time-nome">' + getShortName(hC) + '</span>' +
    '<span style="font-size:.72rem;color:var(--texto2);font-weight:700">' + r.homeGoals + '×' + r.awayGoals + '</span>' +
    htmlBandeira(aC, 16) + ' <span class="stat-time-nome">' + getShortName(aC) + '</span>' +
    '<div style="flex:1;background:var(--fundo2);border-radius:3px;height:6px;margin:0 6px">' +
    '<div style="width:' + pct + '%;height:100%;background:' + cor + ';border-radius:3px"></div></div>' +
    '<span style="font-size:.7rem;color:' + cor + ';font-weight:700;min-width:40px;text-align:right">' + acertos + '/' + total + '</span></div>';
}