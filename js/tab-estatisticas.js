/** tab-estatisticas.js - Dashboard completo de estatÃ­sticas */
window.renderEstatisticas = function () {
  const el = document.getElementById("aba-estatisticas");
  if (!el) return;
  const res = getResultados();
  const apos = APP.apostadores || [];
  const pals = APP.palpites || {};
  const schedule = window.SCHEDULE || [];
  // Fix #8: APP.especiais nÃ£o existe â€” usar extrairEspeciaisOficiais, igual Ã s outras abas.
  const esp = window.BRACKET.extrairEspeciaisOficiais(res, APP.bracket || {});
  if (!apos.length) { el.innerHTML = '<div class="card"><p style="color:var(--texto2)">Nenhum apostador cadastrado.</p></div>'; return; }

  // Cache: evita re-renderizar quando nada mudou (mesma lÃ³gica do compilaÃ§Ã£o)
  const _statCacheKey = JSON.stringify({ resKeys: Object.keys(res).join(','), apLen: apos.length });
  if (window._estatisticasCacheKey === _statCacheKey && el.dataset.rendered === '1') return;
  window._estatisticasCacheKey = _statCacheKey;

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
    if (!arr) return 'â€”';
    if (arr.length >= 2) return [
      arr[0]?.participante?.apelido || arr[0]?.participante?.nome || arr[0]?.apelido || arr[0]?.nome || 'â€”',
      arr[1]?.participante?.apelido || arr[1]?.participante?.nome || arr[1]?.apelido || arr[1]?.nome || 'â€”',
    ];
    const a = arr[0];
    return a?.participante?.apelido || a?.participante?.nome || a?.apelido || a?.nome || 'â€”';
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
        return a.r.posicao - b.r.posicao; // melhor posiÃ§Ã£o
      } else {
        // Se o card for ruim: menos pontos primeiro
        if (a.r.stats.total !== b.r.stats.total) {
          return a.r.stats.total - b.r.stats.total;
        }
        return b.r.posicao - a.r.posicao; // pior posiÃ§Ã£o
      }
    });

    if (!candidatos.length) return { bestArr: null, bestScore: 0, bestApo: null };

    const bestScore = candidatos[0].score;
    // Se o score do melhor for invÃ¡lido ou 0 (para cards baseados em contagem positiva), trata como vazio.
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
    if (pctGanha < 0.20) {
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

  // --- Mestre dos BÃ´nus ---
  const destMestreBonus = obterDestaques(r => r.stats.acertos_placar_exato + r.stats.acertos_placar_alto + r.stats.acertos_bonus1, true, true);
  const mestreBonus = destMestreBonus.bestApo;
  const _mestreBonusArr = destMestreBonus.bestArr;

  const totalJogos = jogosFeitos.length;
  const jogosOrdenadosSeq = [...jogosFeitos].sort((a, b) => new Date(a.utc) - new Date(b.utc));

  // --- PÃ© Frio / PÃ© Quente (recordes histÃ³ricos) ---
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
      if (pts === 0) { seqFria++; recFria = Math.max(recFria, seqFria); } else { seqFria = 0; }
      if (br.acertou) { seqQuente++; recQuente = Math.max(recQuente, seqQuente); } else { seqQuente = 0; }
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

  // --- MarÃ© Alta / MarÃ© Baixa (sequÃªncias ATUAIS) ---
  const maresAltas = {};
  const maresBaixas = {};
  for (const r2 of ranking) {
    const aId = r2.participante.id;
    let seqA = 0, seqB = 0;
    for (const jogo of jogosOrdenadosSeq) {
      const p = pals[aId]?.[jogo.id];
      const rv = res[jogo.id];
      if (!p || p.homeGoals === undefined || !rv) continue;
      const br = calcularPontosBrutos(p, rv);
      const pts = aplicarFator(br.total_bruto, jogo.fase);
      if (br.acertou) { seqA++; } else { seqA = 0; }
      if (pts === 0) { seqB++; } else { seqB = 0; }
    }
    maresAltas[aId] = seqA;
    maresBaixas[aId] = seqB;
  }
  const destMaraAlta = obterDestaques(r => maresAltas[r.participante.id] || 0, true, true, score => score > 0);
  const _maraAltaArr = destMaraAlta.bestArr;
  const maraAltaScore = destMaraAlta.bestScore;
  const destMareBaixa = obterDestaques(r => maresBaixas[r.participante.id] || 0, false, true, score => score > 0);
  const _mareBaixaArr = destMareBaixa.bestArr;
  const mareBaixaScore = destMareBaixa.bestScore;

  // --- Escalando / Queda Livre (Ãšltimos 5 jogos) ---
  const saltos5 = {};
  const quedas5 = {};
  if (totalJogos >= 5) {
    const ultimos5Ids = jogosOrdenadosSeq.slice(-5).map(j => j.id);
    const resAnt5 = {};
    for (const [id, val] of Object.entries(res)) {
      if (!ultimos5Ids.includes(id)) resAnt5[id] = val;
    }
    const rankingAnt5 = gerarRanking(pals, resAnt5, apos, esp);
    for (let i = 0; i < ranking.length; i++) {
      const aId = ranking[i].participante.id;
      const posAtual = ranking[i].posicao;
      const posAnt = rankingAnt5.findIndex(x => x.participante.id === aId) + 1;
      saltos5[aId] = posAnt - posAtual;  // positivo = subiu
      quedas5[aId] = posAtual - posAnt;  // positivo = caiu
    }
  }
  const destEscalando = obterDestaques(r => saltos5[r.participante.id] || 0, true, true, score => totalJogos >= 5 && score > 0);
  const escalandoApo = destEscalando.bestApo;
  const _escalandoArr = destEscalando.bestArr;
  const maiorSalto = destEscalando.bestScore;
  const destQueda = obterDestaques(r => quedas5[r.participante.id] || 0, false, true, score => totalJogos >= 5 && score > 0);
  const tombApo = destQueda.bestApo;
  const _tombArr = destQueda.bestArr;
  const maiorTombo = destQueda.bestScore;

  // --- FÃªnix + Derreteu: compartilham o MESMO ranking sem os Ãºltimos 20 jogos ---
  // OtimizaÃ§Ã£o: unifica dois gerarRanking() em um sÃ³ (economia ~20k calcularPontosBrutos com 80 jogos)
  const recuperacoes20 = {};
  const derreteuScores = {};
  let _rankingAnt20 = null;
  if (totalJogos >= 15) {
    const ultimos20Ids = jogosOrdenadosSeq.slice(-20).map(j => j.id);
    const resAnt20 = {};
    for (const [id, val] of Object.entries(res)) {
      if (!ultimos20Ids.includes(id)) resAnt20[id] = val;
    }
    _rankingAnt20 = gerarRanking(pals, resAnt20, apos, esp);
    for (let i = 0; i < ranking.length; i++) {
      const aId = ranking[i].participante.id;
      const posAtual = ranking[i].posicao;
      const posAnt = _rankingAnt20.findIndex(x => x.participante.id === aId) + 1;
      recuperacoes20[aId] = posAnt - posAtual;   // positivo = subiu (FÃªnix)
      derreteuScores[aId] = posAtual - posAnt;   // positivo = caiu (Derreteu)
    }
  }
  const destFenix = obterDestaques(r => recuperacoes20[r.participante.id] || 0, true, true, score => totalJogos >= 15 && score > 0);
  const recuperApo = destFenix.bestApo;
  const _recuperArr = destFenix.bestArr;
  const maiorRecup = destFenix.bestScore;

  // --- Snapshots progressivos de ranking (reutilizados por 5 cards) ---
  // OTIMIZAÃ‡ÃƒO: Scoring incremental O(JÃ—N) em vez de O(JÂ²Ã—N).
  // Com 80 jogos e 20 apostadores, reduz de ~166.000 para ~1.600 iteraÃ§Ãµes de scoring.
  let snapshots = [];
  if (totalJogos >= 2) {
    // Inicializa acumuladores por apostador
    const _accum = {};
    for (const a of apos) {
      _accum[a.id] = { total: 0, placarExato: 0, placarAlto: 0, resultado: 0 };
    }
    // PrÃ©-calcular pontos especiais (nÃ£o mudam entre snapshots)
    const _espPts = {};
    for (const a of apos) {
      _espPts[a.id] = calcularPontosEspeciais(a, esp.campeao, esp.vice, esp.terceiro).total_especiais;
    }

    for (let i = 0; i < jogosOrdenadosSeq.length; i++) {
      const jogo = jogosOrdenadosSeq[i];
      const rSnap = res[jogo.id];
      if (!rSnap || rSnap.homeGoals === undefined) continue;

      // Atualizar acumulador incremental (+= pontos DESTE jogo apenas)
      for (const a of apos) {
        const p = pals[a.id]?.[jogo.id];
        if (!p || p.homeGoals === undefined) continue;
        const br = calcularPontosBrutos(p, rSnap);
        const pts = aplicarFator(br.total_bruto, jogo.fase);
        _accum[a.id].total += pts;
        if (br.acertou) _accum[a.id].resultado++;
        if (br.bonus_tipo === 'placar_exato') {
          if (br.bonus_pts === (window.CONFIG?.pontuacao?.bonus_placar_exato_alto)) {
            _accum[a.id].placarAlto++;
          } else {
            _accum[a.id].placarExato++;
          }
        }
      }

      // Gerar snapshot-ranking a partir dos acumuladores (sort rÃ¡pido, sem re-scoring)
      const snapItems = apos.map(a => ({
        participante: a,
        stats: {
          total: Math.round((_accum[a.id].total + _espPts[a.id]) * 10) / 10,
          acertos_placar_exato: _accum[a.id].placarExato,
          acertos_placar_alto: _accum[a.id].placarAlto,
          acertos_resultado: _accum[a.id].resultado,
        }
      }));
      snapItems.sort((a, b) => {
        if (b.stats.total !== a.stats.total) return b.stats.total - a.stats.total;
        const totA = a.stats.acertos_placar_exato + a.stats.acertos_placar_alto;
        const totB = b.stats.acertos_placar_exato + b.stats.acertos_placar_alto;
        if (totB !== totA) return totB - totA;
        return b.stats.acertos_resultado - a.stats.acertos_resultado;
      });
      let pos = 1;
      const snap = snapItems.map((item, idx) => {
        if (idx > 0) {
          const prev = snapItems[idx - 1].stats;
          const cur = item.stats;
          const mesmoPts = cur.total === prev.total;
          const mesmoExatos = (cur.acertos_placar_exato + cur.acertos_placar_alto) ===
                              (prev.acertos_placar_exato + prev.acertos_placar_alto);
          const mesmoRes = cur.acertos_resultado === prev.acertos_resultado;
          if (!(mesmoPts && mesmoExatos && mesmoRes)) pos = idx + 1;
        }
        return { posicao: pos, ...item };
      });
      snapshots.push(snap);
    }
  }

  // PrÃ©-indexar posiÃ§Ãµes por apostador para evitar O(N) .find() em cada snapshot
  // snapPosIdx[aId][snapIdx] = posicao
  const snapPosIdx = {};
  for (const a of apos) {
    snapPosIdx[a.id] = new Array(snapshots.length);
  }
  for (let si = 0; si < snapshots.length; si++) {
    for (const item of snapshots[si]) {
      if (snapPosIdx[item.participante.id]) {
        snapPosIdx[item.participante.id][si] = item.posicao;
      }
    }
  }

  // --- Montanha Russa: maior Î£|Î”posiÃ§Ã£o| / nJogos (mÃ­n 5 jogos) ---
  const montanhaScores = {};
  if (totalJogos >= 5 && snapshots.length >= 2) {
    for (const r2 of ranking) {
      const aId = r2.participante.id;
      let soma = 0;
      for (let i = 1; i < snapshots.length; i++) {
        const posAntes  = (snapPosIdx[aId] && snapPosIdx[aId][i-1]) || 0;
        const posDepois = (snapPosIdx[aId] && snapPosIdx[aId][i]) || 0;
        soma += Math.abs(posDepois - posAntes);
      }
      // MÃ©dia por jogo (divisÃ£o pelo nÃºmero de snapshots â€“ 1 = nÃºmero de intervalos)
      montanhaScores[aId] = snapshots.length > 1 ? soma / (snapshots.length - 1) : 0;
    }
  }
  const destMontanha = obterDestaques(r => montanhaScores[r.participante.id] !== undefined ? montanhaScores[r.participante.id] : -1, true, true, score => totalJogos >= 5 && score > 0);
  const _montanhaArr = destMontanha.bestArr;
  const montanhaScore = destMontanha.bestScore;

  // --- Tartaruga: menor Î£|Î”posiÃ§Ã£o| (mÃ­n 5 jogos) ---
  const destTartaruga = obterDestaques(r => montanhaScores[r.participante.id] !== undefined ? montanhaScores[r.participante.id] : Infinity, true, false, score => totalJogos >= 5 && score !== Infinity);
  const _tartarugaArr = destTartaruga.bestArr;
  const tartarugaScore = destTartaruga.bestScore;

  // --- Rei da Colina: maior sequÃªncia consecutiva em 1Âº (usa snapshots) ---
  const reiScores = {};
  if (snapshots.length > 0) {
    for (const r2 of ranking) {
      const aId = r2.participante.id;
      let seqAtual = 0, recorde = 0;
      for (let _si = 0; _si < snapshots.length; _si++) {
        const pos = (snapPosIdx[aId] && snapPosIdx[aId][_si]) || 99;
        if (pos === 1) { seqAtual++; recorde = Math.max(recorde, seqAtual); } else { seqAtual = 0; }
      }
      reiScores[aId] = recorde;
    }
  }
  const destRei = obterDestaques(r => reiScores[r.participante.id] || 0, true, true, score => score > 0);
  const _reiArr = destRei.bestArr;
  const reiScore = destRei.bestScore;

  // --- TubarÃ£o Banguela: mais snapshots no Top 5 e atualmente fora (mÃ­n 10 jogos) ---
  const tubaraoScores = {};
  if (totalJogos >= 10 && snapshots.length > 0) {
    for (const r2 of ranking) {
      const aId = r2.participante.id;
      if (r2.posicao <= 5) { tubaraoScores[aId] = 0; continue; }
      let cnt = 0;
      for (let _si2 = 0; _si2 < snapshots.length; _si2++) {
        const pos = (snapPosIdx[aId] && snapPosIdx[aId][_si2]) || 99;
        if (pos <= 5) cnt++;
      }
      tubaraoScores[aId] = cnt;
    }
  }
  const destTubarao = obterDestaques(r => tubaraoScores[r.participante.id] || 0, false, true, score => totalJogos >= 10 && score > 0);
  const _tubaraoArr = destTubarao.bestArr;
  const tubaraoScore = destTubarao.bestScore;

  // --- Derreteu: jÃ¡ calculado junto com FÃªnix (otimizaÃ§Ã£o: mesmo gerarRanking) ---
  const destDerreteu = obterDestaques(r => derreteuScores[r.participante.id] || 0, false, true, score => totalJogos >= 15 && score > 0);
  const _derreteuArr = destDerreteu.bestArr;
  const derreteuScore = destDerreteu.bestScore;

  // --- Onisciente: quem acertou o placar exato com mais gols dentre todos os acertos de placar da Copa ---
  const oniscienteScores = {};
  const oniscienteDetalhes = {}; // aId -> { goals, games: [...] }
  for (const a of apos) {
    let maxGols = 0;
    let gamesList = [];
    for (const jogo of jogosFeitos) {
      const p = pals[a.id]?.[jogo.id];
      const rv = res[jogo.id];
      if (!p || p.homeGoals === undefined || !rv || rv.homeGoals === undefined) continue;
      const br = calcularPontosBrutos(p, rv);
      if (br.bonus_tipo === 'placar_exato') {
        const goals = rv.homeGoals + rv.awayGoals;
        if (goals > maxGols) {
          maxGols = goals;
          gamesList = [jogo];
        } else if (goals === maxGols && goals > 0) {
          gamesList.push(jogo);
        }
      }
    }
    if (maxGols > 0) {
      oniscienteScores[a.id] = maxGols;
      oniscienteDetalhes[a.id] = {
        goals: maxGols,
        games: gamesList.map(jogo => {
          const rv = res[jogo.id];
          const b = APP.bracket?.[jogo.id] || {};
          const hC = b.home || jogo.home;
          const aC = b.away || jogo.away;
          return getSigla(hC) + ' ' + rv.homeGoals + 'Ã—' + rv.awayGoals + ' ' + getSigla(aC);
        })
      };
    } else {
      oniscienteScores[a.id] = 0;
    }
  }
  const destOnisciente = obterDestaques(r => oniscienteScores[r.participante.id] || 0, true, true, score => score > 0);
  const _oniscienteArr = destOnisciente.bestArr;
  let oniscienteSubStr = 'â€”';
  if (destOnisciente.bestApo) {
    const det = oniscienteDetalhes[destOnisciente.bestApo.participante.id];
    if (det) {
      oniscienteSubStr = det.goals + ' gols (' + det.games[0] + ')';
    }
  }

  // --- Centro Avante / ZagueirÃ£o: maior/menor mÃ©dia de gols apostados ---
  const mediasGols = {};
  for (const a of apos) {
    let totalGolsApostados = 0, countApostas = 0;
    for (const jogo of schedule) {
      const p = pals[a.id]?.[jogo.id];
      if (!p || p.homeGoals === undefined) continue;
      totalGolsApostados += parseInt(p.homeGoals) + parseInt(p.awayGoals);
      countApostas++;
    }
    if (countApostas >= 5) mediasGols[a.id] = totalGolsApostados / countApostas;
  }
  const destCentroAvante = obterDestaques(r => mediasGols[r.participante.id] ?? -Infinity, true, true, score => score !== -Infinity);
  const _centroAvanteArr = destCentroAvante.bestArr;
  const centroAvanteScore = destCentroAvante.bestScore;
  const destZagueiro = obterDestaques(r => mediasGols[r.participante.id] ?? Infinity, true, false, score => score !== Infinity);
  const _zagueiroArr = destZagueiro.bestArr;
  const zagueiroScore = destZagueiro.bestScore;

  // --- Clone: mais apostas idÃªnticas ao placar mais votado pelo grupo ---
  const cloneScores = {};
  for (const jogo of schedule) {
    const placCont = {};
    for (const a of apos) {
      const p = pals[a.id]?.[jogo.id];
      if (!p || p.homeGoals === undefined) continue;
      const pk = parseInt(p.homeGoals) + 'x' + parseInt(p.awayGoals);
      placCont[pk] = (placCont[pk] || 0) + 1;
    }
    const topEntry = Object.entries(placCont).sort((a, b) => b[1] - a[1])[0];
    if (!topEntry || topEntry[1] < 2) continue;
    for (const a of apos) {
      const p = pals[a.id]?.[jogo.id];
      if (!p || p.homeGoals === undefined) continue;
      const pk = parseInt(p.homeGoals) + 'x' + parseInt(p.awayGoals);
      if (pk === topEntry[0]) cloneScores[a.id] = (cloneScores[a.id] || 0) + 1;
    }
  }
  const destClone = obterDestaques(r => cloneScores[r.participante.id] || 0, true, true);
  const _cloneArr = destClone.bestArr;
  const cloneScore = destClone.bestScore;

  // --- Ovelha Negra: mais erros em jogos que â‰¥80% acertou ---
  const ovelhaScores = {};
  for (const jogo of jogosFeitos) {
    const rv = res[jogo.id];
    let totalOv = 0, acertosOv = 0;
    const acertouMap = {};
    for (const a of apos) {
      const p = pals[a.id]?.[jogo.id];
      if (!p || p.homeGoals === undefined) continue;
      totalOv++;
      const br = calcularPontosBrutos(p, rv);
      acertouMap[a.id] = br.acertou;
      if (br.acertou) acertosOv++;
    }
    if (totalOv === 0 || acertosOv / totalOv < 0.80) continue;
    for (const a of apos) {
      if (acertouMap[a.id] === false) ovelhaScores[a.id] = (ovelhaScores[a.id] || 0) + 1;
    }
  }
  const destOvelha = obterDestaques(r => ovelhaScores[r.participante.id] || 0, false, true, score => score > 0);
  const _ovelhaArr = destOvelha.bestArr;
  const ovelhaScore = destOvelha.bestScore;

  // --- Pacifista: mais apostas em empate ---
  const pacifistaScores = {};
  for (const a of apos) {
    let cnt = 0;
    for (const jogo of schedule) {
      const p = pals[a.id]?.[jogo.id];
      if (!p || p.homeGoals === undefined) continue;
      if (parseInt(p.homeGoals) === parseInt(p.awayGoals)) cnt++;
    }
    pacifistaScores[a.id] = cnt;
  }
  const destPacifista = obterDestaques(r => pacifistaScores[r.participante.id] || 0, true, true);
  const _pacifistaArr = destPacifista.bestArr;
  const pacifistaScore = destPacifista.bestScore;

  // --- Destemido: mais apostas em zebras (independente de acerto) ---
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
      if (cnt / total2 < 0.20) zebraApostas[a.id] = (zebraApostas[a.id] || 0) + 1;
    }
  }
  const destDestemido = obterDestaques(r => zebraApostas[r.participante.id] || 0, true, true);
  const chutZebraApo = destDestemido.bestApo;
  const _chutZebraArr = destDestemido.bestArr;
  const chutZebraCount = destDestemido.bestScore;

  // --- Conservador: mais apostas onde â‰¥50% do grupo apostou no mesmo resultado ---
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

  // --- Anarquista: maior distÃ¢ncia mÃ©dia do placar mais votado ---
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
      const dist = Math.abs((parseInt(p.homeGoals) - tH) - (parseInt(p.awayGoals) - tA));
      anarqScores[a.id] = (anarqScores[a.id] || 0) + dist;
      anarqJogos[a.id] = (anarqJogos[a.id] || 0) + 1;
    }
  }
  const destAnarquista = obterDestaques(r => {
    const id = r.participante.id;
    return (anarqJogos[id] || 0) >= 3 ? (anarqScores[id] / anarqJogos[id]) : 0;
  }, true, true, score => score > 0);
  const anarqApo = destAnarquista.bestApo;
  const _anarqArr = destAnarquista.bestArr;
  const anarqMedia = destAnarquista.bestScore ? destAnarquista.bestScore.toFixed(1) : "â€”";

  // --- MetrÃ´nomo: menor desvio padrÃ£o de pts/jogo (mÃ­n 10 jogos) ---
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
  const destMetronome = obterDestaques(r => dps[r.participante.id] !== undefined ? dps[r.participante.id] : Infinity, true, false, score => score !== Infinity);
  const consistApo = destMetronome.bestApo;
  const _consistArr = destMetronome.bestArr;
  const menorDP = destMetronome.bestScore;

  // --- Pra fora! (pior palpite de cada jogador, maior distÃ¢ncia por jogador) ---
  const praForaScores = {};
  const praForaDetalhes = {};
  for (const jogo of jogosFeitos) {
    const r2 = res[jogo.id];
    for (const a of apos) {
      const p = pals[a.id]?.[jogo.id];
      if (!p || p.homeGoals === undefined) continue;
      const dist = Math.abs((parseInt(p.homeGoals) - parseInt(p.awayGoals)) - (r2.homeGoals - r2.awayGoals));
      if (praForaScores[a.id] === undefined || dist > praForaScores[a.id]) {
        praForaScores[a.id] = dist;
        const b = APP.bracket?.[jogo.id] || {};
        const hC = b.home || jogo.home;
        const aC = b.away || jogo.away;
        praForaDetalhes[a.id] = {
          game: getSigla(hC) + 'Ã—' + getSigla(aC),
          apost: p.homeGoals + 'Ã—' + p.awayGoals,
          real: r2.homeGoals + 'Ã—' + r2.awayGoals
        };
      }
    }
  }
  const destPraFora = obterDestaques(r => praForaScores[r.participante.id] ?? 0, false, true, score => score > 0);
  const _praForaArr = destPraFora.bestArr;
  const praForaTopId = destPraFora.bestApo?.participante?.id;
  const praForaSub = praForaTopId && praForaDetalhes[praForaTopId]
    ? praForaDetalhes[praForaTopId].game + ': ' + praForaDetalhes[praForaTopId].apost + ' (foi ' + praForaDetalhes[praForaTopId].real + ')'
    : 'â€”';

  // --- Lanterninha ---
  const lanterninha = ranking[ranking.length - 1];
  const lanterninhaPos = lanterninha.posicao;
  const empatadosLanterna = ranking.filter(r => r.posicao === lanterninhaPos);
  let _lanterninhaArr;
  if (empatadosLanterna.length <= 2) {
    // Empate simples: mostrar todos (1 ou 2)
    _lanterninhaArr = empatadosLanterna;
  } else {
    // Empate triplo+: desempate pelos piores (card ruim = menos pontos na frente, pior posiÃ§Ã£o)
    empatadosLanterna.sort((a, b) => {
      if (Math.abs(a.stats.total - b.stats.total) > 0.0001) return a.stats.total - b.stats.total;
      return b.posicao - a.posicao;
    });
    _lanterninhaArr = [empatadosLanterna[0], empatadosLanterna[1]];
  }

  // â”€â”€ 14 novos cÃ¡lculos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // CampeÃ£o do Avesso (palpites espelhados homeGoalsâ†”awayGoals)
  const demogorgonScores = {};
  for (const a of apos) { let t = 0; for (const jogo of jogosFeitos) { const p = pals[a.id]?.[jogo.id]; if (!p || p.homeGoals === undefined) continue; t += aplicarFator(calcularPontosBrutos({ homeGoals: p.awayGoals, awayGoals: p.homeGoals }, res[jogo.id]).total_bruto, jogo.fase); } demogorgonScores[a.id] = t; }
  const destDemogorgon = obterDestaques(r => demogorgonScores[r.participante.id] || 0, true, true);
  const _demogorgonArr = destDemogorgon.bestArr;

  // GÃªmeos + Polos Opostos (loop triangular, todos os jogos apostados)
  let gemeosBest = { par: null, dist: Infinity, nComum: 0 }, polosBest = { par: null, dist: -1, nComum: 0 };
  const gemeosPerPerson = {}, polosPerPerson = {};
  const gemeosPairs = [], polosPairs = [];
  if (apos.length >= 2) {
    for (const a of apos) { gemeosPerPerson[a.id] = Infinity; polosPerPerson[a.id] = -1; }
    const _allPairs = [];
    for (let _gi = 0; _gi < apos.length; _gi++) for (let _gj = _gi + 1; _gj < apos.length; _gj++) {
      let _gs = 0, _gn = 0;
      for (const jogo of schedule) { const pA = pals[apos[_gi].id]?.[jogo.id], pB = pals[apos[_gj].id]?.[jogo.id]; if (!pA || pA.homeGoals === undefined || !pB || pB.homeGoals === undefined) continue; _gs += Math.abs(parseInt(pA.homeGoals) - parseInt(pB.homeGoals)) + Math.abs(parseInt(pA.awayGoals) - parseInt(pB.awayGoals)); _gn++; }
      if (_gn >= 5) { const _gm = _gs / _gn; _allPairs.push({ a1: apos[_gi], a2: apos[_gj], dist: _gm, nComum: _gn }); if (_gm < gemeosBest.dist) gemeosBest = { par: [apos[_gi], apos[_gj]], dist: _gm, nComum: _gn }; if (_gm > polosBest.dist) polosBest = { par: [apos[_gi], apos[_gj]], dist: _gm, nComum: _gn }; if (_gm < gemeosPerPerson[apos[_gi].id]) gemeosPerPerson[apos[_gi].id] = _gm; if (_gm < gemeosPerPerson[apos[_gj].id]) gemeosPerPerson[apos[_gj].id] = _gm; if (_gm > polosPerPerson[apos[_gi].id]) polosPerPerson[apos[_gi].id] = _gm; if (_gm > polosPerPerson[apos[_gj].id]) polosPerPerson[apos[_gj].id] = _gm; }
    }
    _allPairs.sort((a, b) => a.dist - b.dist);
    for (let _pi = 0; _pi < Math.min(_allPairs.length, 10); _pi++) gemeosPairs.push(_allPairs[_pi]);
    _allPairs.sort((a, b) => b.dist - a.dist);
    for (let _pi = 0; _pi < Math.min(_allPairs.length, 10); _pi++) polosPairs.push(_allPairs[_pi]);
  }
  const _gemeosNomes = gemeosBest.par ? [gemeosBest.par[0].apelido || gemeosBest.par[0].nome, gemeosBest.par[1].apelido || gemeosBest.par[1].nome] : null;
  const _polosNomes = polosBest.par ? [polosBest.par[0].apelido || polosBest.par[0].nome, polosBest.par[1].apelido || polosBest.par[1].nome] : null;

  // PÃ©s de Barro + DragÃ£o Adormecido (aproveitamento grupos vs eliminatÃ³rias)
  const pesBarroScores = {}, dragaoScores = {};
  const _cfgPB = window.CONFIG?.pontuacao;
  if (_cfgPB && jogosFeitos.length > 0) {
    const _limiarPB = _cfgPB.limiar_placar_alto ?? 4;
    for (const r2 of ranking) {
      const aId = r2.participante.id; let ptsGrp = 0, maxGrp = 0, ptsElim = 0, maxElim = 0, nElim = 0;
      for (const jogo of jogosFeitos) {
        const p = pals[aId]?.[jogo.id]; if (!p || p.homeGoals === undefined) continue;
        const rv = res[jogo.id], br = calcularPontosBrutos(p, rv), pts = aplicarFator(br.total_bruto, jogo.fase);
        const tg = Number(rv.homeGoals) + Number(rv.awayGoals);
        const mxBr = tg >= _limiarPB ? _cfgPB.resultado_base + _cfgPB.bonus_placar_exato_alto : _cfgPB.resultado_base + _cfgPB.bonus_placar_exato_baixo;
        const mxPts = aplicarFator(mxBr, jogo.fase);
        if (jogo.fase === "grupos") { ptsGrp += pts; maxGrp += mxPts; } else { ptsElim += pts; maxElim += mxPts; nElim++; }
      }
      if (nElim >= 4 && maxGrp > 0 && maxElim > 0) { const ag = ptsGrp / maxGrp, ae = ptsElim / maxElim; pesBarroScores[aId] = ag - ae; dragaoScores[aId] = ae - ag; }
    }
  }
  const destPesBarro = obterDestaques(r => pesBarroScores[r.participante.id] ?? -Infinity, false, true, s => s !== -Infinity && s > 0);
  const _pesBarroArr = destPesBarro.bestArr;
  const destDragao = obterDestaques(r => dragaoScores[r.participante.id] ?? -Infinity, true, true, s => s !== -Infinity && s > 0);
  const _dragaoArr = destDragao.bestArr;

  // Bilhete Premiado (acerto de placar exato com menor probabilidade Dixon-Coles)
  const loteriaScores = {}, loteriaDetalhes = {}, _progCacheEstat = {};
  for (const a of apos) {
    let minProb = Infinity, bestGame = null;
    for (const jogo of jogosFeitos) {
      const p = pals[a.id]?.[jogo.id]; if (!p || p.homeGoals === undefined) continue;
      const br = calcularPontosBrutos(p, res[jogo.id]); if (br.bonus_tipo !== 'placar_exato') continue;
      const _bL = APP.bracket?.[jogo.id] || {}, _hL = _bL.home || jogo.home, _aL = _bL.away || jogo.away;
      if (_hL === 'TBD' || _aL === 'TBD') continue;
      const _pk = _hL + '_' + _aL;
      if (_progCacheEstat[_pk] === undefined) _progCacheEstat[_pk] = (window.PROGNOSE && typeof PROGNOSE.calcular === 'function') ? PROGNOSE.calcular(_hL, _aL) : null;
      const prog = _progCacheEstat[_pk]; if (!prog || !prog.matrix) continue;
      const rv = res[jogo.id], _hi = Math.min(Number(rv.homeGoals), prog.N - 1), _ai = Math.min(Number(rv.awayGoals), prog.N - 1);
      const prob = prog.matrix[_hi]?.[_ai] || 0;
      if (prob > 0 && prob < minProb) { minProb = prob; bestGame = { jogo, prob, placar: rv.homeGoals + 'Ã—' + rv.awayGoals, hC: _hL, aC: _aL }; }
    }
    if (minProb < Infinity) { loteriaScores[a.id] = 1 / minProb; loteriaDetalhes[a.id] = bestGame; }
  }
  const destLoteria = obterDestaques(r => loteriaScores[r.participante.id] || 0, true, true, s => s > 0);
  const _loteriaArr = destLoteria.bestArr;
  let _loteriaSub = 'â€”';
  if (destLoteria.bestApo) { const _dL = loteriaDetalhes[destLoteria.bestApo.participante.id]; if (_dL) _loteriaSub = (_dL.prob * 100).toFixed(1) + '% prob. (' + getSigla(_dL.hC) + ' ' + _dL.placar + ' ' + getSigla(_dL.aC) + ')'; }

  // TÃ©cnico da SeleÃ§Ã£o (pontos nos jogos do Brasil)
  const jogosBRA = jogosFeitos.filter(j => { const _b = APP.bracket?.[j.id] || {}; return (_b.home || j.home) === 'BRA' || (_b.away || j.away) === 'BRA'; });
  const tecnicoScores = {};
  for (const a of apos) { let t = 0; for (const jogo of jogosBRA) { const p = pals[a.id]?.[jogo.id]; if (!p || p.homeGoals === undefined) continue; t += aplicarFator(calcularPontosBrutos(p, res[jogo.id]).total_bruto, jogo.fase); } tecnicoScores[a.id] = t; }
  const destTecnico = obterDestaques(r => tecnicoScores[r.participante.id] || 0, true, true, () => jogosBRA.length > 0);
  const _tecnicoArr = destTecnico.bestArr;

  // Matador de Canarinho (pontos de dano contra o Brasil: derrota=3, empate=2)
  const matadorScores = {};
  for (const a of apos) {
    let dano = 0;
    for (const jogo of schedule) {
      const _bM = APP.bracket?.[jogo.id] || {}, _hM = _bM.home || jogo.home, _aM = _bM.away || jogo.away;
      if (_hM === 'TBD' || _aM === 'TBD' || (_hM !== 'BRA' && _aM !== 'BRA')) continue;
      const p = pals[a.id]?.[jogo.id]; if (!p || p.homeGoals === undefined) continue;
      const hg = parseInt(p.homeGoals), ag = parseInt(p.awayGoals);
      if (_hM === 'BRA') { if (hg < ag) dano += 3; else if (hg === ag) dano += 2; }
      else { if (ag < hg) dano += 3; else if (ag === hg) dano += 2; }
    }
    matadorScores[a.id] = dano;
  }
  const destMatador = obterDestaques(r => matadorScores[r.participante.id] || 0, false, true);
  const _matadorArr = destMatador.bestArr;

  // Discreto (nunca Top 5 nem Bottom 5, menor distÃ¢ncia do centro)
  const discretoScores = {};
  if (totalJogos >= 15 && snapshots.length >= 15 && apos.length >= 11) {
    const _posCentral = (apos.length + 1) / 2;
    for (const r2 of ranking) {
      const aId = r2.participante.id; let elegivel = true, somaDist = 0, count = 0;
      for (let _si3 = 0; _si3 < snapshots.length; _si3++) {
        const pos = snapPosIdx[aId]?.[_si3]; if (!pos) continue;
        if (pos <= 5 || pos >= apos.length - 4) { elegivel = false; break; }
        somaDist += Math.abs(pos - _posCentral); count++;
      }
      if (elegivel && count > 0) discretoScores[aId] = somaDist / count;
    }
  }
  const destDiscreto = obterDestaques(r => discretoScores[r.participante.id] ?? Infinity, true, false, s => s !== Infinity);
  const _discretoArr = destDiscreto.bestArr;

  // Faro de CampeÃ£o (pontos de palpites especiais)
  const faroScores = {};
  for (const a of apos) faroScores[a.id] = calcularPontosEspeciais(a, esp.campeao, esp.vice, esp.terceiro).total_especiais;
  const destFaro = obterDestaques(r => faroScores[r.participante.id] || 0, true, true, s => s > 0);
  const _faroArr = destFaro.bestArr;

  // Diplomata (acertos de empates reais)
  const jogosEmpate = jogosFeitos.filter(j => res[j.id].homeGoals === res[j.id].awayGoals);
  const diplomataScores = {};
  for (const a of apos) { let cnt = 0; for (const jogo of jogosEmpate) { const p = pals[a.id]?.[jogo.id]; if (!p || p.homeGoals === undefined) continue; if (parseInt(p.homeGoals) === parseInt(p.awayGoals)) cnt++; } diplomataScores[a.id] = cnt; }
  const destDiplomata = obterDestaques(r => diplomataScores[r.participante.id] || 0, true, true, () => jogosEmpate.length > 0);
  const _diplomataArr = destDiplomata.bestArr;

  // Gladiador (acertos do lado vencedor em jogos sem empate)
  const jogosSemEmpate = jogosFeitos.filter(j => res[j.id].homeGoals !== res[j.id].awayGoals);
  const gladiadorScores = {};
  for (const a of apos) { let cnt = 0; for (const jogo of jogosSemEmpate) { const rv = res[jogo.id], p = pals[a.id]?.[jogo.id]; if (!p || p.homeGoals === undefined) continue; const rW = rv.homeGoals > rv.awayGoals ? 'H' : 'A', bW = parseInt(p.homeGoals) > parseInt(p.awayGoals) ? 'H' : (parseInt(p.homeGoals) < parseInt(p.awayGoals) ? 'A' : 'D'); if (bW === rW) cnt++; } gladiadorScores[a.id] = cnt; }
  const destGladiador = obterDestaques(r => gladiadorScores[r.participante.id] || 0, true, true, () => jogosSemEmpate.length > 0);
  const _gladiadorArr = destGladiador.bestArr;

  // Frangueiro + PÃ© de Anjo (distÃ¢ncia mÃ©dia do saldo de gols)
  const franqueiroScores = {};
  for (const a of apos) { let soma = 0, n = 0; for (const jogo of jogosFeitos) { const p = pals[a.id]?.[jogo.id]; if (!p || p.homeGoals === undefined) continue; const rv = res[jogo.id]; soma += Math.abs((parseInt(p.homeGoals) - parseInt(p.awayGoals)) - (rv.homeGoals - rv.awayGoals)); n++; } if (n >= 10) franqueiroScores[a.id] = soma / n; }
  const destFrangueiro = obterDestaques(r => franqueiroScores[r.participante.id] ?? -1, false, true, s => s >= 0);
  const _franqueiroArr = destFrangueiro.bestArr;
  const destPeAnjo = obterDestaques(r => franqueiroScores[r.participante.id] ?? Infinity, true, false, s => s !== Infinity);
  const _peAnjoArr = destPeAnjo.bestArr;

  let h = "";

  // â”€â”€â”€ CSS: Grid 7 colunas desktop, 2 colunas mobile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  h += `<style>
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6px;
      margin-bottom: 12px;
    }
    @media (min-width: 600px) {
      .stats-grid {
        grid-template-columns: repeat(7, 1fr);
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
    .fav-apostadores-row:hover { background: rgba(255, 255, 255, 0.02); }
    @media (min-width: 600px) {
      .fav-apostadores-row {
        grid-template-columns: 160px 1fr 80px;
        gap: 16px;
      }
    }
    .card-sem-padding { padding: 0 !important; overflow: visible; }
    .card-sem-padding .card-titulo { padding: 14px 14px 8px; margin-bottom: 12px; }
    @media (max-width: 599px) {
      .card-sem-padding .card-titulo { padding: 10px 10px 8px; }
    }
  </style>`;

  // â”€â”€â”€ 42 Cards em 6 linhas Ã— 7 colunas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // L1: SequÃªncias | L2: TrajetÃ³ria | L3: PrecisÃ£o | L4: CalibraÃ§Ã£o | L5: Perfil | L6: Especiais
  // Cache stats data for modal detail views
  window.STATS_CACHE = {
    ranking, jogosFeitos, res, apos, pals, schedule, esp,
    hotStreaks, coldStreaks, maresAltas, maresBaixas,
    saltos5, quedas5, recuperacoes20, derreteuScores,
    montanhaScores, reiScores, tubaraoScores,
    zebraScores, mediasGols, cloneScores, ovelhaScores,
    pacifistaScores, zebraApostas, conservScores, anarqScores, anarqJogos,
    dps, praForaScores, praForaDetalhes, oniscienteScores, oniscienteDetalhes,
    totalJogos, snapshots,
    demogorgonScores, gemeosPerPerson, polosPerPerson,
    gemeosPairs, polosPairs,
    pesBarroScores, dragaoScores, loteriaScores, loteriaDetalhes,
    tecnicoScores, matadorScores, discretoScores,
    faroScores, diplomataScores, gladiadorScores,
    franqueiroScores, jogosBRA, jogosEmpate, jogosSemEmpate
  };

  // OrdenaÃ§Ã£o visual CSS: 6 linhas Ã— 7 colunas
  const _cardOrder = ['pe_quente','pe_frio','mare_alta','mare_baixa','escalando','queda_livre','fenix','derreteu','rei_colina','tubarao','montanha_russa','tartaruga','pes_barro','dragao_adormecido','vidente','atirador','zebra_ouro','mestre_bonus','diplomata','gladiador','discreto','onisciente','pra_fora','ovelha_negra','frangueiro','pe_anjo','bilhete_premiado','lanterninha','centro_avante','zagueirao','pacifista','destemido','conservador','clone','anarquista','metronomo','campeao_avesso','gemeos','polos_opostos','tecnico_selecao','matador_canarinho','faro_campeao'];
  h += '<style>' + _cardOrder.map((k,i) => '.stat-d-card[data-card-key="' + k + '"]{order:' + (i+1) + '}').join('') + '</style>';
  h += '<div class="stats-grid">';

  // â”€â”€ Linha 1 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  h += _dCard("ðŸ”¥", "PÃ© Quente",
    jogosFeitos.length === 0 ? 'â€”' : _tieName(_peQuenteArr),
    jogosFeitos.length === 0 ? 'â€” (sem jogos)' : (!peQuenteApo || maiorSeqQuente === 0 ? 'â€”' : maiorSeqQuente + ' resultados seguidos'),
    "#fdba74", "pe_quente", "Quem teve a maior sequÃªncia seguida acertando pelo menos o resultado (vitÃ³ria/empate) em cada jogo â€” o recorde de fase boa da Copa.");

  h += _dCard("ðŸ¥¶", "PÃ© Frio",
    jogosFeitos.length === 0 ? 'â€”' : _tieName(_peFrioArr),
    jogosFeitos.length === 0 ? 'â€” (sem jogos)' : (!peFrioApo || maiorSeqFria === 0 ? 'â€”' : maiorSeqFria + ' zerados seguidos'),
    "#7dd3fc", "pe_frio", "Quem teve a maior sequÃªncia seguida de jogos com zero pontos â€” o recorde de fase ruim da Copa.");

  h += _dCard("ðŸ„", "MarÃ© Alta",
    jogosFeitos.length === 0 ? 'â€”' : (_maraAltaArr ? _tieName(_maraAltaArr) : 'â€”'),
    jogosFeitos.length === 0 ? 'â€” (sem jogos)' : (!_maraAltaArr || maraAltaScore === 0 ? 'â€”' : maraAltaScore + ' em sequÃªncia agora'),
    "#34d399", "mare_alta", "Quem estÃ¡ na maior sequÃªncia atual acertando pelo menos o resultado. Diferente do PÃ© Quente (recorde histÃ³rico): conta sÃ³ o que estÃ¡ acontecendo agora.");

  h += _dCard("ðŸŒŠ", "MarÃ© Baixa",
    jogosFeitos.length === 0 ? 'â€”' : (_mareBaixaArr ? _tieName(_mareBaixaArr) : 'â€”'),
    jogosFeitos.length === 0 ? 'â€” (sem jogos)' : (!_mareBaixaArr || mareBaixaScore === 0 ? 'â€”' : mareBaixaScore + ' zerados agora'),
    "#93c5fd", "mare_baixa", "Quem estÃ¡ na maior sequÃªncia atual de jogos com zero pontos. Diferente do PÃ© Frio (recorde histÃ³rico): conta sÃ³ a seca em curso agora.");

  h += _dCard("ðŸ§—", "Escalando",
    totalJogos < 5 ? 'â€”' : _tieName(_escalandoArr),
    totalJogos < 5 ? 'â€” (< 5 jogos)' : (escalandoApo && maiorSalto > 0 ? '+' + maiorSalto + ' posiÃ§Ãµes' : 'â€”'),
    "#fb7185", "escalando", "Quem mais subiu no ranking nos Ãºltimos 5 jogos. Compara a posiÃ§Ã£o atual com a de antes desses 5 jogos.");

  h += _dCard("ðŸ“‰", "Queda Livre",
    totalJogos < 5 ? 'â€”' : _tieName(_tombArr),
    totalJogos < 5 ? 'â€” (< 5 jogos)' : (tombApo && maiorTombo > 0 ? 'âˆ’' + maiorTombo + ' posiÃ§Ãµes' : 'â€”'),
    "#f87171", "queda_livre", "Quem mais caiu no ranking nos Ãºltimos 5 jogos. Compara a posiÃ§Ã£o atual com a de antes desses 5 jogos.");

  h += _dCard("ðŸ”„", "FÃªnix",
    totalJogos < 15 ? 'â€”' : _tieName(_recuperArr),
    totalJogos < 15 ? 'â€” (< 15 jogos)' : (recuperApo && maiorRecup > 0 ? '+' + maiorRecup + ' posiÃ§Ãµes' : 'â€”'),
    "#38bdf8", "fenix", "Quem mais subiu no ranking nos Ãºltimos 20 jogos. ComeÃ§a a ser calculado a partir do 15Âº jogo da Copa.");

  // â”€â”€ Linha 2 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  h += _dCard("ðŸ§ˆ", "Derreteu",
    totalJogos < 15 ? 'â€”' : (_derreteuArr ? _tieName(_derreteuArr) : 'â€”'),
    totalJogos < 15 ? 'â€” (< 15 jogos)' : (!_derreteuArr || derreteuScore === 0 ? 'â€”' : 'âˆ’' + derreteuScore + ' posiÃ§Ãµes'),
    "#f97316", "derreteu", "Quem mais caiu no ranking nos Ãºltimos 20 jogos. Oposto do FÃªnix. ComeÃ§a a ser calculado a partir do 15Âº jogo da Copa.");

  h += _dCard("ðŸ°", "Rei da Colina",
    _reiArr ? _tieName(_reiArr) : 'â€”',
    !_reiArr || reiScore === 0 ? 'â€”' : reiScore + ' rodadas na lideranÃ§a',
    "#fbbf24", "rei_colina", "Quem ficou mais rodadas consecutivas em 1Âº lugar. Conta a maior sequÃªncia contÃ­nua na lideranÃ§a, nÃ£o o tempo total.");

  h += _dCard("ðŸ¦ˆ", "TubarÃ£o Banguela",
    totalJogos < 10 ? 'â€”' : (_tubaraoArr ? _tieName(_tubaraoArr) : 'â€”'),
    totalJogos < 10 ? 'â€” (< 10 jogos)' : (!_tubaraoArr || tubaraoScore === 0 ? 'â€”' : tubaraoScore + ' rodadas no Top 5'),
    "#94a3b8", "tubarao", "Quem passou mais rodadas no Top 5 mas estÃ¡ fora dessa zona agora. Era temido, perdeu o faro. MÃ­nimo 10 jogos.");

  h += _dCard("ðŸŽ¢", "Montanha Russa",
    totalJogos < 5 ? 'â€”' : (_montanhaArr ? _tieName(_montanhaArr) : 'â€”'),
    totalJogos < 5 ? 'â€” (< 5 jogos)' : (!_montanhaArr || montanhaScore === 0 ? 'â€”' : montanhaScore.toFixed(2) + ' pos./jogo'),
    "#e879f9", "montanha_russa", "Quem mais oscilou de posiÃ§Ã£o no ranking: mÃ©dia de |Î”posiÃ§Ã£o| por jogo. MÃ­nimo 5 jogos.");

  h += _dCard("ðŸ¢", "Tartaruga",
    totalJogos < 5 ? 'â€”' : (_tartarugaArr ? _tieName(_tartarugaArr) : 'â€”'),
    totalJogos < 5 ? 'â€” (< 5 jogos)' : (!_tartarugaArr ? 'â€”' : tartarugaScore.toFixed(2) + ' pos./jogo'),
    "#84cc16", "tartaruga", "Quem menos oscilou de posiÃ§Ã£o â€” sempre no mesmo lugar. MÃ©dia de |Î”posiÃ§Ã£o| por jogo, o menor valor vence. MÃ­nimo 5 jogos.");

  h += _dCard("ðŸ”®", "Vidente",
    jogosFeitos.length === 0 ? 'â€”' : _tieName(_melhorResArr),
    jogosFeitos.length === 0 ? 'â€” (sem jogos)' : (melhorRes ? melhorRes.stats.acertos_resultado + ' resultados acertados' : 'â€”'),
    "#86efac", "vidente", "Quem mais acertou o desfecho dos jogos â€” vitÃ³ria do time da casa, empate ou vitÃ³ria do visitante â€” sem precisar acertar o placar exato.");

  h += _dCard("ðŸª¬", "Onisciente",
    jogosFeitos.length === 0 ? 'â€”' : (_oniscienteArr ? _tieName(_oniscienteArr) : 'â€”'),
    jogosFeitos.length === 0 ? 'â€” (sem jogos)' : (!_oniscienteArr ? 'â€”' : oniscienteSubStr),
    "#c084fc", "onisciente", "Acertou o placar exato do jogo com mais gols da Copa â€” o mais difÃ­cil de prever pelo volume de gols.");

  // â”€â”€ Linha 3 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  h += _dCard("ðŸŽ¯", "Atirador de Elite",
    jogosFeitos.length === 0 ? 'â€”' : _tieName(_melhorExatoArr),
    jogosFeitos.length === 0 ? 'â€” (sem jogos)' : (melhorExato ? melhorExatoCount + ' placares exatos' : 'â€”'),
    "var(--verde-ok)", "atirador", "Quem mais acertou o placar exato. Placares normais dÃ£o +3 pts de bÃ´nus; placares com 4 ou mais gols no total dÃ£o +5 pts.");

  h += _dCard("ðŸ¦“", "Zebra de Ouro",
    jogosFeitos.length === 0 ? 'â€”' : _tieName(_zebraArr),
    jogosFeitos.length === 0 ? 'â€” (sem jogos)' : (melhorZebra ? zebraCount + ' zebras domadas' : 'â€”'),
    "#fcd34d", "zebra_ouro", "Quem mais acertou resultados que menos de 20% do grupo havia apostado â€” palpites raros E corretos. Coragem com precisÃ£o.");

  h += _dCard("ðŸ’Ž", "Mestre dos BÃ´nus",
    jogosFeitos.length === 0 ? 'â€”' : _tieName(_mestreBonusArr),
    jogosFeitos.length === 0 ? 'â€” (sem jogos)' : (mestreBonus ? destMestreBonus.bestScore + ' jogos com bÃ´nus' : 'â€”'),
    "#a78bfa", "mestre_bonus", "Quem somou mais jogos com algum bÃ´nus: placar exato (+3 ou +5 pts), diferenÃ§a de gols correta (+1 pt) ou gols de um time corretos (+1 pt).");

  h += _dCard("ðŸ™ˆ", "Pra fora!",
    _tieName(_praForaArr),
    praForaSub,
    "#fb923c", "pra_fora", "O palpite mais distante do resultado real na Copa inteira, medido pela diferenÃ§a de gols: |(palHâˆ’palA) âˆ’ (resHâˆ’resA)|. Ex: resultado 1Ã—0, chute 0Ã—4 â†’ |(âˆ’4) âˆ’ 1| = 5.");

  h += _dCard("âš½", "Centro Avante",
    _centroAvanteArr ? _tieName(_centroAvanteArr) : 'â€”',
    !_centroAvanteArr || centroAvanteScore === -Infinity ? 'â€” (< 5 apostas)' : centroAvanteScore.toFixed(2) + ' gols/jogo',
    "#fb923c", "centro_avante", "Quem aposta em mais gols por jogo em mÃ©dia. O otimista ofensivo do bolÃ£o. MÃ­nimo 5 apostas.");

  h += _dCard("ðŸ§±", "ZagueirÃ£o",
    _zagueiroArr ? _tieName(_zagueiroArr) : 'â€”',
    !_zagueiroArr || zagueiroScore === Infinity ? 'â€” (< 5 apostas)' : zagueiroScore.toFixed(2) + ' gols/jogo',
    "#64748b", "zagueirao", "Quem aposta em menos gols por jogo em mÃ©dia. Acredita em defesas, resultados magros e jogos travados. MÃ­nimo 5 apostas.");

  h += _dCard("ðŸƒ", "Destemido",
    _tieName(_chutZebraArr),
    !chutZebraApo ? 'â€”' : chutZebraCount + ' palpites improvÃ¡veis',
    "#f59e0b", "destemido", "Quem mais apostou em resultados que menos de 20% do grupo escolheu â€” independente de acertar. Diferente da Zebra de Ouro, que sÃ³ conta quando o palpite improvÃ¡vel estava certo.");

  // â”€â”€ Linha 4 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  h += _dCard("ðŸ‘", "Ovelha Negra",
    _ovelhaArr ? _tieName(_ovelhaArr) : 'â€”',
    !_ovelhaArr || ovelhaScore === 0 ? 'â€”' : ovelhaScore + ' erros em jogos fÃ¡ceis',
    "#f43f5e", "ovelha_negra", "Quem mais errou em jogos que 80% ou mais do grupo acertou. Errar o que todo mundo acertou Ã© uma arte.");

  h += _dCard("ðŸªž", "Clone",
    _cloneArr ? _tieName(_cloneArr) : 'â€”',
    !_cloneArr || cloneScore === 0 ? 'â€”' : cloneScore + 'x no placar do grupo',
    "#a5f3fc", "clone", "Quem mais vezes apostou exatamente o placar mais votado pelo grupo. SÃ³ conta quando ao menos 2 pessoas apostaram o mesmo placar.");

  h += _dCard("ðŸ•Šï¸", "Pacifista",
    _pacifistaArr ? _tieName(_pacifistaArr) : 'â€”',
    !_pacifistaArr || pacifistaScore === 0 ? 'â€”' : pacifistaScore + ' empates apostados',
    "#bae6fd", "pacifista", "Quem mais apostou em empate ao longo do bolÃ£o. O resultado mais raro em Copas do Mundo, apostado com convicÃ§Ã£o.");

  h += _dCard("ðŸ’¤", "Conservador",
    _tieName(_conservArr),
    !conservApo ? 'â€” (sem consenso)' : conservCount + 'x no consenso',
    "#94a3b8", "conservador", "Quem mais apostou igual Ã  maioria: o resultado escolhido tinha pelo menos 50% dos palpites do grupo naquela direÃ§Ã£o.");

  h += _dCard("ðŸŽ²", "Anarquista",
    _tieName(_anarqArr),
    !anarqApo ? 'â€” (< 3 apostas)' : 'dist. mÃ©dia ' + anarqMedia + ' gols',
    "#a78bfa", "anarquista", "Quem mais diverge do placar mais votado pelo grupo em cada jogo apostado. A distÃ¢ncia Ã© medida por |(palHâˆ’palA) âˆ’ (topHâˆ’topA)|. MÃ­nimo 3 apostas.");

  h += _dCard("âš–ï¸", "MetrÃ´nomo",
    jogosFeitos.length < 10 ? 'â€”' : _tieName(_consistArr),
    jogosFeitos.length < 10 || !consistApo ? 'â€” (< 10 jogos)' : 'desvio ' + menorDP.toFixed(2) + ' pts/jogo',
    "#34d399", "metronomo", "Quem pontua de forma mais consistente jogo a jogo, com menor variaÃ§Ã£o entre rodadas boas e ruins. Calculado pelo desvio padrÃ£o dos pontos por jogo (mÃ­nimo 10 jogos).");

  h += _dCard("ðŸ•¯ï¸", "Lanterninha",
    jogosFeitos.length === 0 ? 'â€”' : _tieName(_lanterninhaArr),
    jogosFeitos.length === 0 ? 'â€” (sem jogos)' : (_lanterninhaArr?.[0] ? _lanterninhaArr[0].stats.total.toFixed(1) + ' pts' : 'â€”'),
    "#94a3b8", "lanterninha", "Quem estÃ¡ com menos pontos acumulados atÃ© agora. A lanterna da Copa.");

  // â”€â”€ Novos Cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  h += _dCard("ðŸ¥·", "Discreto",
    totalJogos < 15 || apos.length < 11 ? 'â€”' : (_discretoArr ? _tieName(_discretoArr) : 'â€”'),
    totalJogos < 15 ? 'â€” (< 15 jogos)' : (apos.length < 11 ? 'â€” (poucos apost.)' : (!_discretoArr ? 'â€”' : destDiscreto.bestScore.toFixed(2) + ' dist. mÃ©dia')),
    "#64748b", "discreto", "Passou a Copa inteira no anonimato. Nunca Top 5 nem Bottom 5, gravitou no centro exato da tabela. O mestre da mediocridade estratÃ©gica.");

  h += _dCard("ðŸ—¿", "PÃ©s de Barro",
    !_pesBarroArr ? 'â€”' : _tieName(_pesBarroArr),
    !_pesBarroArr ? 'â€” (< 4 jogos elim.)' : (destPesBarro.bestScore * 100).toFixed(1) + '% de queda',
    "#a8a29e", "pes_barro", "Gigante com os pÃ©s de barro! Mandou bem nos grupos, desmoronou no mata-mata. MÃ­n. 4 jogos eliminatÃ³rios.");

  h += _dCard("ðŸ¤", "Diplomata",
    jogosEmpate.length === 0 ? 'â€”' : (_diplomataArr ? _tieName(_diplomataArr) : 'â€”'),
    jogosEmpate.length === 0 ? 'â€” (sem empates)' : (!_diplomataArr || destDiplomata.bestScore === 0 ? 'â€”' : destDiplomata.bestScore + ' empates acertados'),
    "#7dd3fc", "diplomata", "Mestre do equilÃ­brio! Quem mais acertou jogos que terminaram empatados de verdade.");

  h += _dCard("âš”ï¸", "Gladiador",
    jogosSemEmpate.length === 0 ? 'â€”' : (_gladiadorArr ? _tieName(_gladiadorArr) : 'â€”'),
    jogosSemEmpate.length === 0 ? 'â€” (sem decisivos)' : (!_gladiadorArr || destGladiador.bestScore === 0 ? 'â€”' : destGladiador.bestScore + ' vencedores acertados'),
    "#ef4444", "gladiador", "Sangue de gladiador! Quem mais acertou o lado vencedor em jogos sem empate.");

  h += _dCard("ðŸ‰", "DragÃ£o Adormecido",
    !_dragaoArr ? 'â€”' : _tieName(_dragaoArr),
    !_dragaoArr ? 'â€” (< 4 jogos elim.)' : '+' + (destDragao.bestScore * 100).toFixed(1) + '% de melhora',
    "#22d3ee", "dragao_adormecido", "Estava quieto nos grupos, acordou no mata-mata e virou o jogo! MÃ­n. 4 jogos eliminatÃ³rios.");

  h += _dCard("ðŸ”", "Frangueiro",
    jogosFeitos.length < 10 ? 'â€”' : (_franqueiroArr ? _tieName(_franqueiroArr) : 'â€”'),
    jogosFeitos.length < 10 ? 'â€” (< 10 jogos)' : (!_franqueiroArr ? 'â€”' : destFrangueiro.bestScore.toFixed(2) + ' gols dist./jogo'),
    "#f97316", "frangueiro", "Sempre longe da realidade! Maior mÃ©dia de distÃ¢ncia entre o saldo apostado e o real. MÃ­n. 10 jogos.");

  h += _dCard("ðŸ‘¼", "PÃ© de Anjo",
    jogosFeitos.length < 10 ? 'â€”' : (_peAnjoArr ? _tieName(_peAnjoArr) : 'â€”'),
    jogosFeitos.length < 10 ? 'â€” (< 10 jogos)' : (!_peAnjoArr ? 'â€”' : destPeAnjo.bestScore.toFixed(2) + ' gols dist./jogo'),
    "#34d399", "pe_anjo", "Toque divino! Mesmo errando o placar, fica colado no saldo real de gols. PrecisÃ£o de craque. MÃ­n. 10 jogos.");

  h += _dCard("ðŸ€", "Bilhete Premiado",
    !_loteriaArr ? 'â€”' : _tieName(_loteriaArr),
    !_loteriaArr ? 'â€” (sem acertos exatos)' : _loteriaSub,
    "#fbbf24", "bilhete_premiado", "Acertou o inacertÃ¡vel! Cravou um placar exato que o modelo Dixon-Coles considerava quase impossÃ­vel.");

  h += _dCard("ðŸ™ƒ", "CampeÃ£o do Avesso",
    jogosFeitos.length === 0 ? 'â€”' : (_demogorgonArr ? _tieName(_demogorgonArr) : 'â€”'),
    jogosFeitos.length === 0 ? 'â€”' : (!_demogorgonArr || destDemogorgon.bestScore === 0 ? 'â€”' : destDemogorgon.bestScore.toFixed(1) + ' pts invertidos'),
    "#c084fc", "campeao_avesso", "Bem-vindo ao Mundo Invertido! PontuaÃ§Ã£o recalculada como se os resultados fossem espelhados: o placar do mandante vira do visitante e vice-versa. O campeÃ£o de cabeÃ§a pra baixo.");

  h += _dCard("ðŸ‘¯", "GÃªmeos",
    _gemeosNomes || 'â€”',
    !_gemeosNomes ? 'â€” (< 5 jogos comuns)' : 'dist. mÃ©dia ' + gemeosBest.dist.toFixed(2),
    "#a78bfa", "gemeos", "Quase telepatia! A dupla com os palpites mais parecidos da Copa inteira. Parece que combinaram â€” mas juram que nÃ£o.");

  h += _dCard("ðŸ§²", "Polos Opostos",
    _polosNomes || 'â€”',
    !_polosNomes ? 'â€” (< 5 jogos comuns)' : 'dist. mÃ©dia ' + polosBest.dist.toFixed(2),
    "#f43f5e", "polos_opostos", "Nunca concordaram em nada! A dupla mais divergente da Copa inteira. Ou um estava certo... ou o outro.");

  h += _dCard("ðŸŽ™ï¸", "TÃ©cnico da SeleÃ§Ã£o",
    jogosBRA.length === 0 ? 'â€”' : (_tecnicoArr ? _tieName(_tecnicoArr) : 'â€”'),
    jogosBRA.length === 0 ? 'â€” (sem jogos BRA)' : (!_tecnicoArr || destTecnico.bestScore === 0 ? 'â€”' : destTecnico.bestScore.toFixed(1) + ' pts jogos BRA'),
    "#009c3b", "tecnico_selecao", "Escalou certo quando o Brasil entrou em campo! O apostador que mais pontuou nos jogos da SeleÃ§Ã£o.");

  h += _dCard("ðŸª“", "Matador de Canarinho",
    _matadorArr ? _tieName(_matadorArr) : 'â€”',
    !_matadorArr || destMatador.bestScore === 0 ? 'â€”' : destMatador.bestScore + ' pts contra BRA',
    "#dc2626", "matador_canarinho", "Carrasco verde e amarelo! Acumulou dano apostando contra o Brasil: derrota = 3 pts, empate = 2 pts.");

  h += _dCard("ðŸ†", "Faro de CampeÃ£o",
    _faroArr ? _tieName(_faroArr) : 'â€”',
    !_faroArr || destFaro.bestScore === 0 ? 'â€” (sem especiais)' : destFaro.bestScore + ' pts especiais',
    "#fbbf24", "faro_campeao", "Aposta especial impecÃ¡vel! Quem mais pontuou nos palpites de campeÃ£o, vice e terceiro colocado.");

  h += '</div>';


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
  }).filter(x => x.totalApostas > 0).sort((a, b) => b.pct - a.pct);

  if (jogoStats.length) {
    h += '<div class="card"><div class="card-titulo">ðŸ“Š Jogos por Acerto</div>';
    h += '<div style="display:grid;gap:6px">';
    const top5 = jogoStats.slice(0, 5);
    const bot5 = jogoStats.slice(-5).reverse();
    h += '<div style="font-size:.7rem;font-weight:700;color:var(--verde-ok);text-transform:uppercase;letter-spacing:.05em">Mais acertados</div>';
    for (const s of top5) {
      const b = APP.bracket?.[s.jogo.id] || {}; const hC = b.home || s.jogo.home; const aC = b.away || s.jogo.away;
      h += _jogoStatRow(s.jogo.id, hC, aC, res[s.jogo.id], s.acertos, s.totalApostas, "var(--verde-ok)");
    }
    h += '<div style="font-size:.7rem;font-weight:700;color:#f87171;text-transform:uppercase;letter-spacing:.05em;margin-top:8px">Menos acertados (mais difÃ­ceis)</div>';
    for (const s of bot5) {
      const b = APP.bracket?.[s.jogo.id] || {}; const hC = b.home || s.jogo.home; const aC = b.away || s.jogo.away;
      h += _jogoStatRow(s.jogo.id, hC, aC, res[s.jogo.id], s.acertos, s.totalApostas, "#f87171");
    }
    h += '</div></div>';
  }

  // ProjeÃ§Ã£o campeÃ£o (% dos apostadores)
  // Fix #8: especiais ficam em apostador.especiais, nÃ£o em esp[a.id]
  const campVotos = {};
  for (const a of apos) {
    const c = a.especiais?.campeao;
    if (!c) continue;
    campVotos[c] = (campVotos[c] || 0) + 1;
  }
  const sortedCamp = Object.entries(campVotos).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (sortedCamp.length) {
    h += '<div class="card"><div class="card-titulo">ðŸ† Favoritos dos Apostadores <span title="Mostra para qual seleÃ§Ã£o cada apostador apostou como campeÃ£o do mundial. O âœ“ dourado indica o campeÃ£o real jÃ¡ confirmado." style="font-size:.8rem;cursor:help;color:var(--texto2);font-weight:normal">â“˜</span></div>';
    h += '<div style="display:grid;gap:6px">';
    const maxV = sortedCamp[0][1];
    for (const [code, ct] of sortedCamp) {
      const info = window.TEAMS_BY_CODE?.[code];
      const pct = apos.length ? Math.round(ct / apos.length * 100) : 0;
      // Fix #4: campeÃ£o oficial vem de extrairEspeciaisOficiais, nÃ£o de bracket["FNL"].home
      const campeaoOficial = esp.campeao && esp.campeao === code;
      const isMobFav = window.innerWidth <= 600;
      const favNameW = isMobFav ? '115px' : '320px';
      h += '<div style="display:flex;align-items:center;gap:' + (isMobFav ? '16' : '12') + 'px;padding:' + (isMobFav ? '3px 6px' : '4px 8px') + ';border-radius:6px">';
      h += '<div style="display:flex;align-items:center;gap:6px;font-weight:600;width:' + favNameW + ';flex-shrink:0;font-size:' + (isMobFav ? '.65' : '.72') + 'rem;min-width:0">' +
           htmlBandeira(code, isMobFav ? 14 : 18) +
           '<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (info?.name || code) + '</span>' +
           (campeaoOficial ? '<span style="color:var(--dourado);margin-left:2px" title="CampeÃ£o Confirmado">âœ“</span>' : '') +
           '</div>';
      h += '<div style="flex:1;background:var(--fundo2);border-radius:5px;height:10px;overflow:hidden;border:1px solid var(--borda)">' +
           '<div style="width:' + (ct / maxV * 100) + '%;height:100%;background:var(--verde);border-radius:5px"></div>' +
           '</div>';
      h += '<span style="font-size:.7rem;color:var(--texto2);font-weight:700;text-align:right;white-space:nowrap;min-width:' + (isMobFav ? '34' : '40') + 'px;flex-shrink:0">' +
           ct + ' <span style="font-size:.65rem;font-weight:normal;opacity:0.85">(' + pct + '%)</span>' +
           '</span>';
      h += '</div>';
    }
    h += '</div></div>';
  }


  // OTIMIZAÃ‡ÃƒO: Render cards imediatamente, defer tabela + HtH para o prÃ³ximo frame
  // Isso faz os 42 cards aparecerem instantaneamente no mobile.
  h += '<div id="stat-table-deferred"><div class="card" style="text-align:center;padding:20px;color:var(--texto2)"><div class="spinner" style="margin:0 auto 8px"></div>Carregando tabela avanÃ§ada...</div></div>';
  h += '<div id="stat-hth-deferred"></div>';

  el.innerHTML = h;
  el.dataset.rendered = '1';

  // Tooltip unificado (hover desktop + toque mobile) em todos os [title] da aba
  window.injetarTooltipsMobile(el);

  // Defer: tabela avanÃ§ada + HtH aparecem no prÃ³ximo frame, liberando o thread principal
  requestAnimationFrame(() => {
    _renderStatsTabelaDeferred(el, res, apos, pals, esp);
  });
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// DEFERRED: Tabela AvanÃ§ada + Head-to-Head (renderizados apÃ³s os 42 cards)
// OtimizaÃ§Ã£o: libera o thread principal para que os cards apareÃ§am instantaneamente
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function _renderStatsTabelaDeferred(el, res, apos, pals, esp) {
  const tableContainer = document.getElementById('stat-table-deferred');
  const hthContainer = document.getElementById('stat-hth-deferred');
  if (!tableContainer) return;

  // Cache de PROGNOSE: evita chamar Dixon-Coles 104 vezes redundantemente
  const _progCache = {};
  function _getCachedPrognose(hC, aC) {
    const key = hC + '_' + aC;
    if (_progCache[key] !== undefined) return _progCache[key];
    if (window.PROGNOSE && typeof PROGNOSE.calcular === "function" && hC !== "TBD" && aC !== "TBD") {
      const isNeutral = !['USA', 'CAN', 'MEX'].includes(hC) && !['USA', 'CAN', 'MEX'].includes(aC);
      _progCache[key] = PROGNOSE.calcular(hC, aC, isNeutral);
    } else {
      _progCache[key] = null;
    }
    return _progCache[key];
  }

  let h = '<div class="card card-sem-padding"><div class="card-titulo">ðŸ“ˆ EstatÃ­sticas AvanÃ§adas por Jogo</div><div class="compilacao-wrap stat-table-wrap"><table class="compilacao-table stat-full-table" style="font-size:.7rem">';
  h += '<thead><tr>';
  const isMobileHeader = window.innerWidth <= 600;
  h += `<th class="${isMobileHeader ? 'col-jogo' : 'stat-col-jogo'}" style="text-align:left;">Jogo</th>`;
  h += '<th class="col-resultado" title="Placar oficial do jogo">' + (window.innerWidth <= 600 ? 'Result' : 'Resultado') + '</th>';
  h += '<th title="NÂº de apostadores que apostaram na vitÃ³ria do Time 1 (mandante)">Apostas T1</th>';
  h += '<th title="NÂº de apostadores que apostaram em empate">Apostas Emp</th>';
  h += '<th title="NÂº de apostadores que apostaram na vitÃ³ria do Time 2 (visitante)">Apostas T2</th>';
  h += '<th title="O placar mais apostado pelo grupo, com % dos que apostaram nele">Top Placar</th>';
  h += '<th title="Quantos apostadores acertaram o resultado (vitÃ³ria ou empate)">Acertos Res</th>';
  h += '<th title="Quantos apostadores acertaram o placar exato">Acertos Plac</th>';
  h += '<th style="width:12px;background:var(--fundo);border-left:1px solid var(--borda);border-right:1px solid var(--borda)"></th>';
  h += '<th title="Rating ELO do Time 1 â€” mede a forÃ§a histÃ³rica acumulada da seleÃ§Ã£o">Elo T1</th>';
  h += '<th title="Rating ELO do Time 2 â€” mede a forÃ§a histÃ³rica acumulada da seleÃ§Ã£o">Elo T2</th>';
  h += '<th title="Gols esperados do Time 1 estimados pelo modelo Dixon-Coles">xGols T1</th>';
  h += '<th title="Gols esperados do Time 2 estimados pelo modelo Dixon-Coles">xGols T2</th>';
  h += '<th title="Probabilidade de vitÃ³ria do Time 1 segundo o modelo">Prob T1</th>';
  h += '<th title="Probabilidade de empate segundo o modelo">Prob E</th>';
  h += '<th title="Probabilidade de vitÃ³ria do Time 2 segundo o modelo">Prob T2</th>';
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
    const strPlacarMais = mChutado ? `${mChutado[0]} <span style="font-size:.65rem;color:var(--texto2)">(${((mChutado[1] / totalBets) * 100).toFixed(1)}%)</span>` : 'â€”';

    // AI Prognosis (cached)
    const prog = _getCachedPrognose(hC, aC);

    const rowBg = temRes ? '' : ' opacity:0.65;';
    const isMobile = window.innerWidth <= 600;
    const dataHoraStr = formatarDataBRT(jogo.utc, false);
    const faseLbl = getFaseLabel(jogo);
    const dataHoraLbl = dataHoraStr + (faseLbl ? ", " + faseLbl : "");
    h += `<tr style="${rowBg}">`;
    h += `<td class="${isMobile ? 'col-jogo' : 'stat-col-jogo'}" onclick="PROGNOSE.abrirModal('${jogo.id}')" style="text-align:left;padding:6px 8px;cursor:pointer">
            <div style="font-size:.6rem;color:var(--texto2);margin-bottom:3px">${dataHoraLbl}</div>
            <div style="display:flex;align-items:center;gap:4px;font-weight:700;width:100%">
              ${htmlBandeira(hC, 14)} <span class="${isMobile ? 'compilacao-time-nome comp-sigla' : 'stat-time-nome'}">${isMobile ? getSigla(hC) : hName}</span> <span style="color:var(--texto2)">Ã—</span> <span class="${isMobile ? 'compilacao-time-nome comp-sigla' : 'stat-time-nome'}">${isMobile ? getSigla(aC) : aName}</span> ${htmlBandeira(aC, 14)}
            </div>
          </td>`;

    if (temRes) {
      let resHtml = `${r.homeGoals}x${r.awayGoals}`;
      if (r.foi_penaltis) {
        const ph = r.penaltis_home ?? 0; const pa = r.penaltis_away ?? 0;
        resHtml += `<div style="font-size:.58rem;color:var(--amber);margin-top:1px;font-weight:700">PEN ${ph}x${pa}</div>`;
      }
      h += `<td class="col-resultado" onclick="PROGNOSE.abrirModal('${jogo.id}')" style="color:var(--verde-ok);font-weight:800;vertical-align:middle;cursor:pointer">${resHtml}</td>`;
    } else {
      h += `<td class="col-resultado" onclick="PROGNOSE.abrirModal('${jogo.id}')" style="color:var(--texto2);cursor:pointer">â€“</td>`;
    }

    if (podeVer) {
      h += `<td>${formatNumPct(vH, totalBets)}</td>`;
      h += `<td>${formatNumPct(vD, totalBets)}</td>`;
      h += `<td>${formatNumPct(vA, totalBets)}</td>`;
      h += `<td><strong style="color:var(--verde-light)">${strPlacarMais}</strong></td>`;
      h += `<td>${temRes ? formatNumPct(aRes, totalBets, 'var(--verde-ok)') : 'â€”'}</td>`;
      h += `<td>${temRes ? formatNumPct(aPlac, totalBets, '#86efac') : 'â€”'}</td>`;
    } else {
      h += `<td colspan="6" style="color:var(--texto2);font-size:.75rem;letter-spacing:1px;opacity:0.6">ðŸ”’ ConteÃºdo bloqueado atÃ© o fechamento das apostas</td>`;
    }

    h += `<td style="background:var(--fundo);border-left:1px solid var(--borda);border-right:1px solid var(--borda)"></td>`;

    if (podeVer && prog) {
      h += `<td><span style="color:var(--texto2)">${Math.round(prog.eloH)}</span></td>`;
      h += `<td><span style="color:var(--texto2)">${Math.round(prog.eloA)}</span></td>`;
      h += `<td><strong style="color:var(--texto)">${prog.lH.toFixed(2)}</strong></td>`;
      h += `<td><strong style="color:var(--texto)">${prog.lA.toFixed(2)}</strong></td>`;
      h += `<td><div style="color:var(--verde-light);font-weight:700">${(prog.home * 100).toFixed(1)}%</div></td>`;
      h += `<td><div style="color:var(--texto2);font-weight:700">${(prog.draw * 100).toFixed(1)}%</div></td>`;
      h += `<td><div style="color:var(--verde-light);font-weight:700">${(prog.away * 100).toFixed(1)}%</div></td>`;
    } else if (!podeVer) {
      h += `<td colspan="7" style="color:var(--texto2);font-size:.7rem;opacity:0.6">ðŸ”’ PrevisÃ£o indisponÃ­vel</td>`;
    } else {
      h += `<td colspan="7" style="color:var(--texto2);font-size:.65rem">Sem dados do modelo</td>`;
    }
    h += `</tr>`;
  }
  h += '</tbody></table></div></div>';

  // Head-to-Head
  let aposHtH = [...apos];
  const modHtH = window.getModelo ? window.getModelo() : null;
  if (modHtH && APP._modeloCarregado) {
    aposHtH.push(modHtH);
  }

  let hthHtml = '';
  if (aposHtH.length >= 2) {
    hthHtml += '<div class="card"><div class="card-titulo">âš”ï¸ Head-to-Head</div>';
    if (APP._modoSimulacao) {
      hthHtml += '<div style="color:#f87171;font-size:.8rem;padding:10px 0;text-align:center">ðŸ”’ O Head-to-Head fica indisponÃ­vel no modo simulaÃ§Ã£o para proteger a privacidade dos palpites.</div></div>';
    } else {
      hthHtml += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">';
      hthHtml += '<select id="hth-a1" style="flex:1" onchange="renderHtH()"><option value="">Apostador 1</option>';
      for (const a of aposHtH) hthHtml += '<option value="' + a.id + '">' + (a.apelido || a.nome || a.token) + '</option>';
      hthHtml += '</select><span style="align-self:center">vs</span>';
      hthHtml += '<select id="hth-a2" style="flex:1" onchange="renderHtH()"><option value="">Apostador 2</option>';
      for (const a of aposHtH) hthHtml += '<option value="' + a.id + '">' + (a.apelido || a.nome || a.token) + '</option>';
      hthHtml += '</select></div>';
      hthHtml += '<div id="hth-resultado"></div></div>';
    }
  }

  tableContainer.innerHTML = h;
  if (hthContainer) hthContainer.innerHTML = hthHtml;

  // Tooltips + frozen header para o conteÃºdo deferred
  window.injetarTooltipsMobile(tableContainer);
  if (hthContainer) window.injetarTooltipsMobile(hthContainer);

  requestAnimationFrame(() => {
    const table = tableContainer.querySelector('.stat-full-table');
    const wrapper = tableContainer.querySelector('.stat-table-wrap');
    if (table && wrapper && window.registrarFrozenHeader) {
      window.registrarFrozenHeader(table, wrapper);
    }
  });
}

window.renderHtH = function () {
  const id1 = document.getElementById("hth-a1")?.value;
  const id2 = document.getElementById("hth-a2")?.value;
  const out = document.getElementById("hth-resultado");
  if (!out) return;
  if (APP._modoSimulacao) {
    out.innerHTML = '<p style="color:#f87171;font-size:.78rem;text-align:center">IndisponÃ­vel em simulaÃ§Ã£o.</p>';
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
    const tooltipH = '';
    const tooltipA = '';
    rows += '<tr><td class="' + (isMob ? 'col-jogo' : 'stat-col-jogo') + '" onclick="PROGNOSE.abrirModal(\'' + jogo.id + '\')" style="text-align:left;font-size:.73rem;position:sticky;left:0;background:var(--fundo);z-index:1;box-shadow:1px 0 0 0 #292d35, 2px 0 5px rgba(0,0,0,0.1);cursor:pointer">' +
      '<div style="display:flex;align-items:center;gap:4px;width:100%">' + htmlBandeira(hC, 14) + ' <span class="' + (isMob ? 'compilacao-time-nome comp-sigla' : 'stat-time-nome') + '"' + tooltipH + '>' + hDisplay + '</span> <span style="color:var(--texto2)">Ã—</span> <span class="' + (isMob ? 'compilacao-time-nome comp-sigla' : 'stat-time-nome') + '"' + tooltipA + '>' + aDisplay + '</span> ' + htmlBandeira(aC, 14) + '</div></td>' +
      '<td onclick="PROGNOSE.abrirModal(\'' + jogo.id + '\')" style="font-size:.72rem;cursor:pointer">' + r.homeGoals + 'Ã—' + r.awayGoals + '</td>' +
      '<td style="color:' + cor1 + ';font-weight:700">' + (p1 ? p1.homeGoals + 'Ã—' + p1.awayGoals + ' (' + v1 + 'pts)' : 'â€”') + '</td>' +
      '<td style="color:' + cor2 + ';font-weight:700">' + (p2 ? p2.homeGoals + 'Ã—' + p2.awayGoals + ' (' + v2 + 'pts)' : 'â€”') + '</td></tr>';
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
  h += '<div style="font-size:.8rem;color:var(--texto2)">' + ganhou1 + 'â€“' + empHtH + 'â€“' + ganhou2 + '</div>';
  h += '<div style="font-size:1.1rem;font-weight:900;color:' + corTot2 + '">' + pts2.toFixed(1) + ' pts<div style="font-size:.72rem;color:var(--texto2)">' + n2 + '</div></div></div>';
  h += '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table class="compilacao-table" style="min-width:350px"><thead><tr><th class="' + (window.innerWidth <= 600 ? 'col-jogo' : 'stat-col-jogo') + '" style="text-align:left;position:sticky;left:0;background:var(--card);z-index:1;box-shadow:1px 0 0 0 #292d35, 2px 0 5px rgba(0,0,0,0.1)">Jogo</th><th>Resultado</th><th>' + n1 + '</th><th>' + n2 + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  out.innerHTML = h;
};

function _dCard(icon, label, nome, sub, cor, key, tooltip) {
  const tipAttr = tooltip ? ` data-tooltip="${tooltip.replace(/"/g, '&quot;')}"` : '';
  const keyAttr = key ? ` data-card-key="${key}"` : '';
  const tipEl = tooltip
    ? `<div class="stat-tooltip">${tooltip}</div>`
    : '';
  let nomeHtml;
  if (Array.isArray(nome) && nome.length >= 2) {
    nomeHtml = `<div class="stat-d-nome stat-d-nome--tie" style="--cor-destaque: ${cor}">${nome[0]}<span class="stat-d-tie-sep"> &amp; </span>${nome[1]}</div>`;
  } else {
    const nomeStr = Array.isArray(nome) ? (nome[0] || 'â€”') : nome;
    nomeHtml = `<div class="stat-d-nome" style="--cor-destaque: ${cor}">${nomeStr}</div>`;
  }
  return `<div class="stat-d-card"${tipAttr}${keyAttr} onclick="window.abrirModalCard('${key || ''}')">
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
  const isMob = window.innerWidth <= 600;
  const hName = isMob ? getSigla(hC) : getShortName(hC);
  const aName = isMob ? getSigla(aC) : getShortName(aC);
  const tooltipH = !isMob ? ' title="' + nomeTime(hC).replace(/"/g, '&quot;') + '"' : '';
  const tooltipA = !isMob ? ' title="' + nomeTime(aC).replace(/"/g, '&quot;') + '"' : '';
  const placar = r.homeGoals + 'Ã—' + r.awayGoals;

  // Mobile: layout compacto com placar centralizado entre os times
  // [flag1 sigla1] [placar] [sigla2 flag2] | â–ˆâ–ˆâ–ˆâ–ˆâ–‘â–‘ | 12/20
  if (isMob) {
    return '<div onclick="PROGNOSE.abrirModal(\'' + jogoId + '\')" style="display:flex;align-items:center;gap:16px;padding:5px 6px;cursor:pointer;border-radius:6px;transition:background 0.15s" onmouseover="this.style.background=\'rgba(255,255,255,0.04)\'" onmouseout="this.style.background=\'\'">' +
      '<div style="display:flex;align-items:center;justify-content:center;gap:2px;min-width:0;width:115px;flex-shrink:0">' +
        '<div style="display:flex;align-items:center;gap:2px;justify-content:flex-end;flex:1;min-width:0">' +
          htmlBandeira(hC, 14) +
          '<span style="font-size:.65rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + hName + '</span>' +
        '</div>' +
        '<span style="font-size:.68rem;color:var(--texto2);font-weight:800;padding:0 3px;flex-shrink:0">' + placar + '</span>' +
        '<div style="display:flex;align-items:center;gap:2px;justify-content:flex-start;flex:1;min-width:0">' +
          '<span style="font-size:.65rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + aName + '</span>' +
          htmlBandeira(aC, 14) +
        '</div>' +
      '</div>' +
      '<div style="flex:1;background:var(--fundo2);border-radius:3px;height:6px;min-width:20px">' +
        '<div style="width:' + pct + '%;height:100%;background:' + cor + ';border-radius:3px"></div>' +
      '</div>' +
      '<span style="font-size:.67rem;color:' + cor + ';font-weight:700;min-width:34px;text-align:right;flex-shrink:0">' + acertos + '/' + total + '</span>' +
    '</div>';
  }

  // Desktop: layout com container fixo para alinhar barras verticalmente
  return '<div onclick="PROGNOSE.abrirModal(\'' + jogoId + '\')" onmouseover="this.style.background=\'rgba(255,255,255,0.04)\'" onmouseout="this.style.background=\'\'" style="display:flex;align-items:center;gap:12px;padding:6px 8px;cursor:pointer;border-radius:6px;transition:background 0.15s">' +
    '<div style="display:flex;align-items:center;gap:5px;width:320px;flex-shrink:0;font-size:.72rem">' +
      htmlBandeira(hC, 16) + '<span' + tooltipH + ' style="font-weight:600">' + hName + '</span> ' +
      '<span style="color:var(--texto2);font-weight:700">' + placar + '</span> ' +
      htmlBandeira(aC, 16) + '<span' + tooltipA + ' style="font-weight:600">' + aName + '</span>' +
    '</div>' +
    '<div style="flex:1;background:var(--fundo2);border-radius:3px;height:6px">' +
    '<div style="width:' + pct + '%;height:100%;background:' + cor + ';border-radius:3px"></div></div>' +
    '<span style="font-size:.7rem;color:' + cor + ';font-weight:700;min-width:40px;text-align:right">' + acertos + '/' + total + '</span></div>';
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CARD_CONFIGS: Mapeamento de cada card â†’ { icon, label, desc, getScore, higherIsWinner, format, isGoodCard, filterFn? }
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
window.CARD_CONFIGS = {
  pe_quente:     { icon: 'ðŸ”¥', label: 'PÃ© Quente',           desc: 'Manteve o radiador fervendo! Quem teve a maior sequÃªncia consecutiva de jogos acertando pelo menos o resultado (vitÃ³ria/empate) de cada partida. Calculado varrendo o histÃ³rico cronolÃ³gico de palpites do jogador na Copa e contando o tamanho mÃ¡ximo de acertos contÃ­nuos.', getScore: (r,c) => c.hotStreaks[r.participante.id] || 0,            higherIsWinner: true,  isGoodCard: true,  format: v => v + ' seguidos' },
  pe_frio:       { icon: 'ðŸ¥¶', label: 'PÃ© Frio',             desc: 'Zicou de vez! Quem teve a maior sequÃªncia consecutiva de jogos com pontuaÃ§Ã£o igual a zero (errou o vencedor e o empate). Calculado varrendo o histÃ³rico cronolÃ³gico e medindo a maior sequÃªncia contÃ­nua de erros completos.', getScore: (r,c) => c.coldStreaks[r.participante.id] || 0,           higherIsWinner: true,  isGoodCard: false, format: v => v + ' zerados' },
  mare_alta:     { icon: 'ðŸ„', label: 'MarÃ© Alta',            desc: 'Surfando na crista da onda! Quem estÃ¡ com a maior sequÃªncia ativa acertando o resultado neste exato momento. Diferente do PÃ© Quente, Ã© calculado medindo a sequÃªncia ininterrupta de acertos a partir do jogo mais recente em direÃ§Ã£o aos anteriores.', getScore: (r,c) => c.maresAltas[r.participante.id] || 0,           higherIsWinner: true,  isGoodCard: true,  format: v => v + ' em seq.', filterFn: s => s > 0 },
  mare_baixa:    { icon: 'ðŸŒŠ', label: 'MarÃ© Baixa',           desc: 'No fundo do poÃ§o! A maior sequÃªncia de jogos zerados em curso neste exato momento. Diferente do PÃ© Frio, Ã© calculado medindo a sequÃªncia ativa e ininterrupta de erros completos a partir do jogo mais recente.', getScore: (r,c) => c.maresBaixas[r.participante.id] || 0,         higherIsWinner: true,  isGoodCard: false, format: v => v + ' zerados', filterFn: s => s > 0 },
  escalando:     { icon: 'ðŸ§—', label: 'Escalando',            desc: 'Subindo feito foguete! Quem deu o maior salto de posiÃ§Ãµes no ranking ao longo das Ãºltimas 5 partidas realizadas. Calculado comparando a posiÃ§Ã£o atual com a posiÃ§Ã£o que o apostador ocupava exatamente 5 jogos atrÃ¡s.', getScore: (r,c) => c.saltos5[r.participante.id] || 0,             higherIsWinner: true,  isGoodCard: true,  format: v => '+' + v + ' pos.', filterFn: (s,r,c) => c.totalJogos >= 5 && s > 0 },
  queda_livre:   { icon: 'ðŸ“‰', label: 'Queda Livre',          desc: 'Sem paraquedas! Quem teve o maior tombo de posiÃ§Ãµes no ranking nas Ãºltimas 5 partidas realizadas. Calculado comparando a posiÃ§Ã£o que o apostador ocupava 5 jogos atrÃ¡s com a posiÃ§Ã£o que ele ocupa agora.', getScore: (r,c) => c.quedas5[r.participante.id] || 0,             higherIsWinner: true,  isGoodCard: false, format: v => 'âˆ’' + v + ' pos.', filterFn: (s,r,c) => c.totalJogos >= 5 && s > 0 },
  fenix:         { icon: 'ðŸ”„', label: 'FÃªnix',                desc: 'Ressurgiu das cinzas! O maior salto de posiÃ§Ãµes no ranking acumulado ao longo de um bloco de 20 partidas. Calculado comparando a posiÃ§Ã£o que o apostador ocupava 20 jogos atrÃ¡s com a posiÃ§Ã£o atual (mÃ­nimo 15 jogos realizados).', getScore: (r,c) => c.recuperacoes20[r.participante.id] || 0,       higherIsWinner: true,  isGoodCard: true,  format: v => '+' + v + ' pos.', filterFn: (s,r,c) => c.totalJogos >= 15 && s > 0 },
  derreteu:      { icon: 'ðŸ§ˆ', label: 'Derreteu',             desc: 'Ladeira abaixo! A maior queda de posiÃ§Ãµes no ranking nos Ãºltimos 20 jogos da Copa. Calculado comparando a posiÃ§Ã£o que o apostador ocupava 20 jogos atrÃ¡s com a sua posiÃ§Ã£o atual (mÃ­nimo 15 jogos realizados).', getScore: (r,c) => c.derreteuScores[r.participante.id] || 0,        higherIsWinner: true,  isGoodCard: false, format: v => 'âˆ’' + v + ' pos.', filterFn: (s,r,c) => c.totalJogos >= 15 && s > 0 },
  rei_colina:    { icon: 'ðŸ°', label: 'Rei da Colina',        desc: 'Dono do trono! Quem conseguiu passar mais rodadas consecutivas no topo geral do ranking (isolado ou empatado em 1Âº lugar). Calculado analisando a lideranÃ§a em cada snapshot acumulativo de rodadas.', getScore: (r,c) => c.reiScores[r.participante.id] || 0,            higherIsWinner: true,  isGoodCard: true,  format: v => v + ' rodadas', filterFn: s => s > 0 },
  tubarao:       { icon: 'ðŸ¦ˆ', label: 'TubarÃ£o Banguela',     desc: 'Morde mas nÃ£o machuca! Quem passou mais rodadas cumulativas dentro do Top 5 do ranking ao longo do campeonato, mas que atualmente estÃ¡ fora dele. Calculado contando a quantidade de rodadas no Top 5 e filtrando se a posiÃ§Ã£o atual Ã© pior que 5 (mÃ­nimo 10 jogos).', getScore: (r,c) => c.tubaraoScores[r.participante.id] || 0,        higherIsWinner: true,  isGoodCard: false, format: v => v + ' rodadas', filterFn: (s,r,c) => c.totalJogos >= 10 && s > 0 },
  montanha_russa:{ icon: 'ðŸŽ¢', label: 'Montanha Russa',       desc: 'Haja coraÃ§Ã£o! Quem teve a maior mÃ©dia de variaÃ§Ã£o absoluta de posiÃ§Ãµes por jogo. Calculado somando o valor absoluto da diferenÃ§a de posiÃ§Ãµes entre cada jogo (|Î”posiÃ§Ã£o|) e dividindo pelo total de rodadas (mÃ­nimo 5 jogos).', getScore: (r,c) => c.montanhaScores[r.participante.id] ?? -1,    higherIsWinner: true,  isGoodCard: true,  format: v => v.toFixed(2) + ' pos./jogo', filterFn: (s,r,c) => c.totalJogos >= 5 && s > 0 },
  tartaruga:     { icon: 'ðŸ¢', label: 'Tartaruga',            desc: 'Devagar e sempre! Quem teve a menor mÃ©dia de variaÃ§Ã£o de posiÃ§Ãµes por rodada. Calculado somando a diferenÃ§a absoluta de posiÃ§Ãµes a cada jogo (|Î”posiÃ§Ã£o|) e dividindo pelo total de rodadas (menor mÃ©dia vence, mÃ­nimo 5 jogos).', getScore: (r,c) => c.montanhaScores[r.participante.id] ?? Infinity, higherIsWinner: false, isGoodCard: true,  format: v => v.toFixed(2) + ' pos./jogo', filterFn: (s,r,c) => c.totalJogos >= 5 && s !== Infinity },
  vidente:       { icon: 'ðŸ”®', label: 'Vidente',              desc: 'PrevisÃµes certeiras! Quem mais acumulou acertos do desfecho final da partida (vitÃ³ria do time 1, empate ou vitÃ³ria do time 2). Calculado somando os acertos simples de resultado geral de todos os jogos, independentemente de bÃ´nus.', getScore: (r,c) => r.stats.acertos_resultado,                       higherIsWinner: true,  isGoodCard: true,  format: v => v + ' acertos' },
  onisciente:    { icon: 'ðŸª¬', label: 'Onisciente',           desc: 'Adivinho supremo! Quem acertou o placar exato do jogo que teve o maior nÃºmero total de gols da Copa inteira. Calculado encontrando o valor mÃ¡ximo de gols (gols mandante + gols visitante) entre todos os palpites de placar exato acertados pelo jogador.', getScore: (r,c) => c.oniscienteScores[r.participante.id] || 0,     higherIsWinner: true,  isGoodCard: true,  format: (v,r,c) => { const d = c.oniscienteDetalhes[r.participante.id]; return d ? d.games.join(', ') : 'â€”'; }, filterFn: s => s > 0 },
  atirador:      { icon: 'ðŸŽ¯', label: 'Atirador de Elite',    desc: 'Mira calibrada! Quem acumulou mais acertos de placares exatos. Ã‰ calculado somando os acertos de placar clÃ¡ssicos (bÃ´nus de +3) com os acertos de placares com 4 ou mais gols no total (bÃ´nus de +5).', getScore: (r,c) => r.stats.acertos_placar_exato + r.stats.acertos_placar_alto, higherIsWinner: true, isGoodCard: true, format: v => v + ' placares' },
  zebra_ouro:    { icon: 'ðŸ¦“', label: 'Zebra de Ouro',        desc: 'CaÃ§ador de zebras! Quem mais vezes acertou o resultado correto (vitÃ³ria/empate) de jogos onde menos de 20% de todos os participantes apostaram nessa mesma direÃ§Ã£o. Mede palpites audaciosos e corretos.', getScore: (r,c) => c.zebraScores[r.participante.id] || 0,          higherIsWinner: true,  isGoodCard: true,  format: v => v + ' zebras' },
  mestre_bonus:  { icon: 'ðŸ’Ž', label: 'Mestre dos BÃ´nus',     desc: 'Colecionador de bÃ´nus! Quem mais somou partidas pontuando com bÃ´nus. Ã‰ calculado somando os jogos com acertos de placar exato (+3 ou +5) e os jogos com bÃ´nus secundÃ¡rios (+1 por diferenÃ§a de gols ou gols de um time corretos).', getScore: (r,c) => r.stats.acertos_placar_exato + r.stats.acertos_placar_alto + r.stats.acertos_bonus1, higherIsWinner: true, isGoodCard: true, format: v => v + ' bÃ´nus' },
  pra_fora:      { icon: 'ðŸ™ˆ', label: 'Pra fora!',            desc: 'Mandou a bola na lua! O palpite de placar que ficou mais distante do placar real do jogo. Calculado pelo valor absoluto da diferenÃ§a de saldo de gols entre o chute e o resultado real: |(palpite_home âˆ’ palpite_away) âˆ’ (real_home âˆ’ real_away)|.', getScore: (r,c) => c.praForaScores[r.participante.id] ?? 0,       higherIsWinner: true,  isGoodCard: false, format: (v,r,c) => { const d = c.praForaDetalhes[r.participante.id]; return d ? `${d.game}: chute ${d.apost} (foi ${d.real})` : v; }, filterFn: s => s > 0 },
  centro_avante: { icon: 'âš½', label: 'Centro Avante',        desc: 'Otimismo ofensivo! Quem tem a maior mÃ©dia de gols totais apostados por partida. Calculado somando todos os gols chutados em seus palpites e dividindo pela quantidade de jogos apostados (mÃ­nimo 5 apostas).', getScore: (r,c) => c.mediasGols[r.participante.id] ?? -Infinity,   higherIsWinner: true,  isGoodCard: true,  format: v => v.toFixed(2) + ' gols/jogo', filterFn: s => s !== -Infinity },
  zagueirao:     { icon: 'ðŸ§±', label: 'ZagueirÃ£o',            desc: 'Retranqueiro de carteirinha! Quem tem a menor mÃ©dia de gols totais apostados por partida. Calculado somando todos os gols chutados em seus palpites e dividindo pelo nÃºmero de jogos apostados (mÃ­nimo 5 apostas).', getScore: (r,c) => c.mediasGols[r.participante.id] ?? Infinity,    higherIsWinner: false, isGoodCard: true,  format: v => v.toFixed(2) + ' gols/jogo', filterFn: s => s !== Infinity },
  destemido:     { icon: 'ðŸƒ', label: 'Destemido',             desc: 'Coragem pura! Quem mais apostou em resultados considerados improvÃ¡veis, onde menos de 20% do grupo escolheu aquela direÃ§Ã£o, independente de ter acertado ou nÃ£o. Mede a ousadia pura dos palpites.', getScore: (r,c) => c.zebraApostas[r.participante.id] || 0,        higherIsWinner: true,  isGoodCard: true,  format: v => v + ' apostas' },
  ovelha_negra:  { icon: 'ðŸ‘', label: 'Ovelha Negra',         desc: 'O do contra! Quem mais vezes errou palpites em partidas consideradas fÃ¡ceis, onde pelo menos 80% de todo o grupo acertou o resultado geral da partida. Errar o Ã³bvio do grupo!', getScore: (r,c) => c.ovelhaScores[r.participante.id] || 0,         higherIsWinner: true,  isGoodCard: false, format: v => v + ' erros', filterFn: s => s > 0 },
  clone:         { icon: 'ðŸªž', label: 'Clone',                desc: 'Sombra do grupo! O apostador que mais vezes palpitou o placar mais votado pelo grupo (consenso). Calculado comparando cada palpite individual com o placar de maior frequÃªncia do grupo naquele jogo.', getScore: (r,c) => c.cloneScores[r.participante.id] || 0,          higherIsWinner: true,  isGoodCard: true,  format: v => v + 'x' },
  pacifista:     { icon: 'ðŸ•Šï¸', label: 'Pacifista',             desc: 'Amante da paz! Quem mais vezes palpitou empate nas partidas. Calculado somando todos os palpites onde os gols previstos para o time da casa e visitante foram iguais.', getScore: (r,c) => c.pacifistaScores[r.participante.id] || 0,      higherIsWinner: true,  isGoodCard: true,  format: v => v + ' empates' },
  conservador:   { icon: 'ðŸ’¤', label: 'Conservador',           desc: 'Maria vai com as outras! Quem mais vezes escolheu a direÃ§Ã£o de resultado (vitÃ³ria 1, empate, vitÃ³ria 2) que concentrou pelo menos 50% de todos os palpites do grupo naquela rodada.', getScore: (r,c) => c.conservScores[r.participante.id] || 0,        higherIsWinner: true,  isGoodCard: true,  format: v => v + 'x consenso' },
  anarquista:    { icon: 'ðŸŽ²', label: 'Anarquista',            desc: 'Rebelde sem causa! Quem mais se distanciou do placar consensual (mais votado) do grupo. Calculado somando a distÃ¢ncia absoluta do chute em relaÃ§Ã£o ao top placar: |(chute_home âˆ’ chute_away) âˆ’ (top_home âˆ’ top_away)| dividido pelas apostas.', getScore: (r,c) => { const id = r.participante.id; return (c.anarqJogos[id] || 0) >= 3 ? (c.anarqScores[id] / c.anarqJogos[id]) : 0; }, higherIsWinner: true, isGoodCard: true, format: v => v.toFixed(1) + ' dist.', filterFn: s => s > 0 },
  metronomo:     { icon: 'âš–ï¸', label: 'MetrÃ´nomo',             desc: 'Reloginho suÃ­Ã§o! O pontuador mais regular rodada apÃ³s rodada. Calculado pelo desvio padrÃ£o (variaÃ§Ã£o em torno da mÃ©dia) dos pontos obtidos por jogo. Menor desvio padrÃ£o indica regularidade extrema (mÃ­nimo 10 jogos).', getScore: (r,c) => c.dps[r.participante.id] ?? Infinity,         higherIsWinner: false, isGoodCard: true,  format: v => 'Ïƒ ' + v.toFixed(2), filterFn: s => s !== Infinity },
  lanterninha:   { icon: 'ðŸ•¯ï¸', label: 'Lanterninha',           desc: 'Farol de cauda! Quem estÃ¡ segurando a lanterna da Copa com o menor total de pontos acumulados na classificaÃ§Ã£o geral. O importante Ã© participar e torcer!', getScore: (r,c) => r.stats.total,                                    higherIsWinner: false, isGoodCard: false, format: v => v.toFixed(1) + ' pts' },
  campeao_avesso:{ icon: 'ðŸ™ƒ', label: 'CampeÃ£o do Avesso',   desc: 'Bem-vindo ao Mundo Invertido! Aqui a pontuaÃ§Ã£o Ã© recalculada como se os resultados oficiais fossem espelhados: o placar do mandante vira do visitante e vice-versa. Se o jogo terminou 1Ã—0, conta como se tivesse sido 0Ã—1. Quem seria o campeÃ£o se a Copa fosse de cabeÃ§a pra baixo?', getScore: (r,c) => c.demogorgonScores[r.participante.id] || 0, higherIsWinner: true, isGoodCard: true, format: v => v.toFixed(1) + ' pts' },
  gemeos:        { icon: 'ðŸ‘¯', label: 'GÃªmeos',               desc: 'Quase telepatia! A dupla com os palpites mais parecidos da Copa inteira. Calculado comparando todos os pares possÃ­veis de apostadores, somando a distÃ¢ncia absoluta entre cada palpite (|golsA âˆ’ golsB| para mandante e visitante) e dividindo pelo nÃºmero de jogos em comum (mÃ­nimo 5 jogos apostados em comum). Parece que combinaram â€” mas juram que nÃ£o.', getScore: (r,c) => c.gemeosPerPerson[r.participante.id] ?? Infinity, higherIsWinner: false, isGoodCard: true, format: v => 'dist. ' + v.toFixed(2), filterFn: s => s !== Infinity, customRender: (cache) => { const pairs = cache.gemeosPairs || []; if (!pairs.length) return null; let h = ''; pairs.forEach((p, i) => { const n1 = p.a1.apelido || p.a1.nome, n2 = p.a2.apelido || p.a2.nome; const bg = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)'; const posColor = i < 3 ? ['#fbbf24','#c0c0c0','#cd7f32'][i] : 'var(--texto2)'; h += '<tr style="background:' + bg + '"><td style="text-align:center;padding:7px 6px;font-weight:800;color:' + posColor + '">' + (i+1) + '</td><td style="padding:7px 6px;font-weight:600;color:#fff;font-size:.76rem">' + n1 + ' <span style="color:var(--texto2)">&</span> ' + n2 + '</td><td style="text-align:right;padding:7px 6px;font-weight:700;color:var(--verde-light);white-space:nowrap">dist. ' + p.dist.toFixed(2) + '</td><td style="text-align:right;padding:7px 6px;color:var(--texto2)">' + p.nComum + ' jogos</td></tr>'; }); return h; } },
  polos_opostos: { icon: 'ðŸ§²', label: 'Polos Opostos',        desc: 'Nunca concordaram em nada! A dupla mais divergente da Copa inteira. Calculado da mesma forma que GÃªmeos, mas buscando a maior distÃ¢ncia mÃ©dia entre palpites ao invÃ©s da menor. Se um apostava em goleada, o outro chutava empate. Ou um estava certoâ€¦ ou o outro (mÃ­nimo 5 jogos em comum).', getScore: (r,c) => c.polosPerPerson[r.participante.id] ?? -1, higherIsWinner: true, isGoodCard: true, format: v => 'dist. ' + v.toFixed(2), filterFn: s => s >= 0, customRender: (cache) => { const pairs = cache.polosPairs || []; if (!pairs.length) return null; let h = ''; pairs.forEach((p, i) => { const n1 = p.a1.apelido || p.a1.nome, n2 = p.a2.apelido || p.a2.nome; const bg = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)'; const posColor = i < 3 ? ['#fbbf24','#c0c0c0','#cd7f32'][i] : 'var(--texto2)'; h += '<tr style="background:' + bg + '"><td style="text-align:center;padding:7px 6px;font-weight:800;color:' + posColor + '">' + (i+1) + '</td><td style="padding:7px 6px;font-weight:600;color:#fff;font-size:.76rem">' + n1 + ' <span style="color:var(--texto2)">&</span> ' + n2 + '</td><td style="text-align:right;padding:7px 6px;font-weight:700;color:var(--verde-light);white-space:nowrap">dist. ' + p.dist.toFixed(2) + '</td><td style="text-align:right;padding:7px 6px;color:var(--texto2)">' + p.nComum + ' jogos</td></tr>'; }); return h; } },
  pes_barro:     { icon: 'ðŸ—¿', label: 'PÃ©s de Barro',         desc: 'Gigante com os pÃ©s de barro! Quem mandou muito bem na fase de grupos mas desmoronou no mata-mata. Calculado comparando o aproveitamento percentual (pontos obtidos Ã· pontos mÃ¡ximos possÃ­veis) de cada fase. A maior diferenÃ§a positiva (grupos âˆ’ eliminatÃ³rias) vence. MÃ­nimo 4 jogos eliminatÃ³rios para garantir significÃ¢ncia.', getScore: (r,c) => c.pesBarroScores[r.participante.id] ?? -Infinity, higherIsWinner: true, isGoodCard: false, format: v => (v * 100).toFixed(1) + '% queda', filterFn: s => s !== -Infinity && s > 0 },
  dragao_adormecido:{ icon: 'ðŸ‰', label: 'DragÃ£o Adormecido', desc: 'Estava hibernando nos grupos e acordou furioso no mata-mata! Oposto do PÃ©s de Barro â€” quem melhorou o aproveitamento percentual na passagem da fase de grupos para as eliminatÃ³rias. A maior diferenÃ§a positiva (eliminatÃ³rias âˆ’ grupos) vence. MÃ­nimo 4 jogos eliminatÃ³rios.', getScore: (r,c) => c.dragaoScores[r.participante.id] ?? -Infinity, higherIsWinner: true, isGoodCard: true, format: v => '+' + (v * 100).toFixed(1) + '%', filterFn: s => s !== -Infinity && s > 0 },
  bilhete_premiado:{ icon: 'ðŸ€', label: 'Bilhete Premiado',   desc: 'Loteria premiada! Cravou o placar exato de um jogo que o modelo Dixon-Coles considerava quase impossÃ­vel. Calculado encontrando, dentre todos os acertos de placar exato do apostador, aquele cuja probabilidade estimada pelo modelo era a mais baixa. Quanto menor a probabilidade, mais impressionante o acerto.', getScore: (r,c) => c.loteriaScores[r.participante.id] || 0, higherIsWinner: true, isGoodCard: true, format: (v,r,c) => { const d = c.loteriaDetalhes[r.participante.id]; return d ? (d.prob * 100).toFixed(1) + '% (' + d.placar + ')' : 'â€”'; }, filterFn: s => s > 0 },
  tecnico_selecao:{ icon: 'ðŸŽ™ï¸', label: 'TÃ©cnico da SeleÃ§Ã£o',  desc: 'Escalou certo quando o Brasil entrou em campo! Soma dos pontos obtidos exclusivamente nos jogos em que a SeleÃ§Ã£o Brasileira participou. Quem mais acumulou pontos nas partidas do Brasil Ã© o verdadeiro tÃ©cnico de sofÃ¡ deste bolÃ£o.', getScore: (r,c) => c.tecnicoScores[r.participante.id] || 0, higherIsWinner: true, isGoodCard: true, format: v => v.toFixed(1) + ' pts', filterFn: (s,r,c) => c.jogosBRA.length > 0 },
  matador_canarinho:{ icon: 'ðŸª“', label: 'Matador de Canarinho', desc: 'Carrasco verde e amarelo! Acumulou mais dano apostando contra o Brasil em todos os jogos do Brasil no cronograma. Cada palpite de derrota brasileira soma 3 pontos de dano, cada empate soma 2 pontos. Considera todos os jogos apostados, independente de jÃ¡ terem resultado oficial.', getScore: (r,c) => c.matadorScores[r.participante.id] || 0, higherIsWinner: true, isGoodCard: false, format: v => v + ' pts dano' },
  discreto:      { icon: 'ðŸ¥·', label: 'Discreto',              desc: 'Mestre da invisibilidade! Passou a Copa inteira no anonimato: nunca apareceu no Top 5 nem caiu para o Bottom 5 do ranking em nenhuma rodada. Entre os elegÃ­veis, quem gravitou mais perto do centro exato da tabela vence. Calculado pela distÃ¢ncia mÃ©dia da posiÃ§Ã£o central ao longo de todos os snapshots (mÃ­nimo 15 jogos e 11 apostadores).', getScore: (r,c) => c.discretoScores[r.participante.id] ?? Infinity, higherIsWinner: false, isGoodCard: true, format: v => v.toFixed(2) + ' dist.', filterFn: s => s !== Infinity },
  faro_campeao:  { icon: 'ðŸ†', label: 'Faro de CampeÃ£o',      desc: 'Faro infalÃ­vel! Quem mais pontuou com os palpites especiais de campeÃ£o, vice-campeÃ£o e terceiro colocado. Calculado somando os pontos de bÃ´nus obtidos por acertar as seleÃ§Ãµes finalistas do torneio. Cada acerto rende pontos configurados nas regras do bolÃ£o.', getScore: (r,c) => c.faroScores[r.participante.id] || 0, higherIsWinner: true, isGoodCard: true, format: v => v + ' pts', filterFn: s => s > 0 },
  diplomata:     { icon: 'ðŸ¤', label: 'Diplomata',             desc: 'Mestre do equilÃ­brio! Quem mais vezes acertou que um jogo terminaria empatado quando de fato terminou em empate. Calculado contando quantas vezes o apostador palpitou empate (gols iguais) E o jogo real tambÃ©m terminou empatado. SÃ³ jogos jÃ¡ encerrados contam.', getScore: (r,c) => c.diplomataScores[r.participante.id] || 0, higherIsWinner: true, isGoodCard: true, format: v => v + ' empates', filterFn: (s,r,c) => c.jogosEmpate.length > 0 },
  gladiador:     { icon: 'âš”ï¸', label: 'Gladiador',             desc: 'Sangue de gladiador! Quem mais vezes acertou o lado vencedor em jogos que tiveram um vencedor definido (sem empate). Calculado contando os jogos onde o apostador palpitou vitÃ³ria do mesmo lado que realmente venceu, excluindo jogos empatados.', getScore: (r,c) => c.gladiadorScores[r.participante.id] || 0, higherIsWinner: true, isGoodCard: true, format: v => v + ' acertos', filterFn: (s,r,c) => c.jogosSemEmpate.length > 0 },
  frangueiro:    { icon: 'ðŸ”', label: 'Frangueiro',            desc: 'Sempre longe da realidade! Quem teve a maior mÃ©dia de distÃ¢ncia absoluta entre o saldo de gols apostado e o saldo real. Calculado por |(palpH âˆ’ palpA) âˆ’ (realH âˆ’ realA)| a cada jogo, somado e dividido pelo total de jogos apostados (mÃ­nimo 10 jogos).', getScore: (r,c) => c.franqueiroScores[r.participante.id] ?? -1, higherIsWinner: true, isGoodCard: false, format: v => v.toFixed(2) + ' dist./jogo', filterFn: s => s >= 0 },
  pe_anjo:       { icon: 'ðŸ‘¼', label: 'PÃ© de Anjo',            desc: 'Toque divino nos palpites! Mesmo quando errou o placar, ficou colado no saldo real de gols. Calculado pela menor mÃ©dia de |(palpH âˆ’ palpA) âˆ’ (realH âˆ’ realA)| por jogo. PrecisÃ£o cirÃºrgica no feeling do resultado, mesmo sem cravar o placar exato (mÃ­nimo 10 jogos).', getScore: (r,c) => c.franqueiroScores[r.participante.id] ?? Infinity, higherIsWinner: false, isGoodCard: true, format: v => v.toFixed(2) + ' dist./jogo', filterFn: s => s !== Infinity }
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Modal de Detalhes do Card
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
window.abrirModalCard = function(key) {
  if (!key) return;
  const cfg = window.CARD_CONFIGS[key];
  const cache = window.STATS_CACHE;
  if (!cfg || !cache) return;

  const ov = document.getElementById('modal-stat');
  const box = document.getElementById('modal-stat-body');
  if (!ov || !box) return;

  // Swipe-down para fechar (mobile) â€” setup Ãºnico
  if (!ov._swipeSetup) {
    ov._swipeSetup = true;
    let startY = 0, startScroll = 0;
    ov.addEventListener('touchstart', e => { startY = e.touches[0].clientY; startScroll = box.scrollTop; }, { passive: true });
    ov.addEventListener('touchmove', e => {
      const dy = e.touches[0].clientY - startY;
      if (dy > 0 && startScroll <= 0) { box.style.transform = `translateY(${Math.min(dy * 0.6, 160)}px)`; box.style.transition = 'none'; }
    }, { passive: true });
    ov.addEventListener('touchend', e => {
      const dy = e.changedTouches[0].clientY - startY;
      box.style.transition = ''; box.style.transform = '';
      if (dy > 80 && startScroll <= 0) window.fecharModalStat();
    }, { passive: true });
  }

  // Calcular ranking do card
  let candidatos = cache.ranking.map(r => {
    const score = cfg.getScore(r, cache);
    return { r, score };
  });

  if (cfg.filterFn) {
    candidatos = candidatos.filter(c => cfg.filterFn(c.score, c.r, cache));
  }

  candidatos.sort((a, b) => {
    const diff = cfg.higherIsWinner ? (b.score - a.score) : (a.score - b.score);
    if (Math.abs(diff) > 0.0001) return diff;
    if (cfg.isGoodCard) {
      if (b.r.stats.total !== a.r.stats.total) return b.r.stats.total - a.r.stats.total;
      return a.r.posicao - b.r.posicao;
    } else {
      if (a.r.stats.total !== b.r.stats.total) return a.r.stats.total - b.r.stats.total;
      return b.r.posicao - a.r.posicao;
    }
  });

  const top15 = candidatos.slice(0, 15);

  // Montar HTML do modal
  let h = '<button class="modal-close" onclick="window.fecharModalStat()">âœ•</button>';
  h += '<div style="text-align:center;margin-bottom:14px">';
  h += '<div style="font-size:1.8rem;margin-bottom:6px">' + cfg.icon + '</div>';
  h += '<div style="font-size:.95rem;font-weight:800;color:var(--texto)">' + cfg.label + '</div>';
  h += '<div style="font-size:.7rem;color:var(--texto2);max-width:100%;margin:4px auto 0">' + cfg.desc + '</div>';
  h += '</div>';

  const _hasCustomData = cfg.customRender ? cfg.customRender(cache) : null;
  if (!top15.length && !_hasCustomData) {
    h += '<div style="text-align:center;padding:24px;color:var(--texto2);font-size:.8rem">Sem dados suficientes para este card.</div>';
  } else {
    // Tabela Top 15
    h += '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch">';
    h += '<table style="width:100%;border-collapse:collapse;font-size:.76rem">';
    h += '<thead><tr>';
    h += '<th style="text-align:center;padding:8px 6px;border-bottom:1px solid var(--borda);color:var(--texto2);font-size:.65rem;width:32px">#</th>';
    h += '<th style="text-align:left;padding:8px 6px;border-bottom:1px solid var(--borda);color:var(--texto2);font-size:.65rem">' + (cfg.customRender ? 'Dupla' : 'Apelido') + '</th>';
    h += '<th style="text-align:right;padding:8px 6px;border-bottom:1px solid var(--borda);color:var(--texto2);font-size:.65rem">MÃ©trica</th>';
    h += '<th style="text-align:right;padding:8px 6px;border-bottom:1px solid var(--borda);color:var(--texto2);font-size:.65rem;width:50px">' + (cfg.customRender ? 'Jogos' : 'Pts') + '</th>';
    h += '</tr></thead><tbody>';

    let pos = 1;
    // Check if card has custom pair-based rendering (GÃªmeos / Polos)
    if (_hasCustomData) {
      h += _hasCustomData;
    } else {
    for (let i = 0; i < top15.length; i++) {
      const c = top15[i];
      if (i > 0 && Math.abs(c.score - top15[i-1].score) > 0.0001) pos = i + 1;
      const apelido = c.r.participante.apelido || c.r.participante.nome || c.r.participante.id;
      const metricaStr = typeof cfg.format === 'function' ? cfg.format(c.score, c.r, cache) : c.score;
      const isMedal = pos <= 3;
      const medalColors = ['#fbbf24', '#c0c0c0', '#cd7f32'];
      const rowBg = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)';
      const posColor = isMedal ? medalColors[pos - 1] : 'var(--texto2)';

      h += '<tr style="background:' + rowBg + '">';
      h += '<td style="text-align:center;padding:7px 6px;font-weight:800;color:' + posColor + '">' + pos + '</td>';
      const nome = (c.r.participante.nome || apelido).replace(/'/g, "\\'");
      const apelidoEsc = apelido.replace(/'/g, "\\'");
      const apoId = (c.r.participante.id || '').replace(/'/g, "\\'");
      const apoClk = "window.abrirModalApostador('" + nome + "','" + apelidoEsc + "'," + c.r.stats.total.toFixed(1) + ",'" + apoId + "')";
      h += '<td onclick="' + apoClk + '" style="text-align:left;padding:7px 6px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px;cursor:pointer">' + apelido + '</td>';
      h += '<td style="text-align:right;padding:7px 6px;font-weight:700;color:var(--verde-light);white-space:nowrap">' + metricaStr + '</td>';
      h += '<td style="text-align:right;padding:7px 6px;color:var(--texto2)">' + c.r.stats.total.toFixed(1) + '</td>';
      h += '</tr>';
    }
    }
    h += '</tbody></table></div>';

    // Legenda
    h += '<div style="font-size:.6rem;color:var(--texto2);text-align:center;margin-top:10px;opacity:.7">';
    if (cfg.customRender) {
      h += 'Ordenado por distÃ¢ncia mÃ©dia de palpites';
    } else {
      h += 'Desempate: ' + (cfg.isGoodCard ? 'mais pontos â†’ melhor posiÃ§Ã£o geral' : 'menos pontos â†’ pior posiÃ§Ã£o geral');
    }
    h += '</div>';
  }

  box.innerHTML = h;
  ov.classList.add('aberto');
  document.body.style.overflow = 'hidden';
};

window.fecharModalStat = function() {
  const ov = document.getElementById('modal-stat');
  if (ov) ov.classList.remove('aberto');
  document.body.style.overflow = '';
};