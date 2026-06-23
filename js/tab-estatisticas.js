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

  // Cache: evita re-renderizar quando nada mudou (mesma lógica do compilação)
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

  // --- Mestre dos Bônus ---
  const destMestreBonus = obterDestaques(r => r.stats.acertos_placar_exato + r.stats.acertos_placar_alto + r.stats.acertos_bonus1, true, true);
  const mestreBonus = destMestreBonus.bestApo;
  const _mestreBonusArr = destMestreBonus.bestArr;

  const totalJogos = jogosFeitos.length;
  const jogosOrdenadosSeq = [...jogosFeitos].sort((a, b) => new Date(a.utc) - new Date(b.utc));

  // --- Pé Frio / Pé Quente (recordes históricos) ---
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

  // --- Maré Alta / Maré Baixa (sequências ATUAIS) ---
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

  // --- Escalando / Queda Livre (Últimos 5 jogos) ---
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

  // --- Fênix + Derreteu: compartilham o MESMO ranking sem os últimos 20 jogos ---
  // Otimização: unifica dois gerarRanking() em um só (economia ~20k calcularPontosBrutos com 80 jogos)
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
      recuperacoes20[aId] = posAnt - posAtual;   // positivo = subiu (Fênix)
      derreteuScores[aId] = posAtual - posAnt;   // positivo = caiu (Derreteu)
    }
  }
  const destFenix = obterDestaques(r => recuperacoes20[r.participante.id] || 0, true, true, score => totalJogos >= 15 && score > 0);
  const recuperApo = destFenix.bestApo;
  const _recuperArr = destFenix.bestArr;
  const maiorRecup = destFenix.bestScore;

  // --- Snapshots progressivos de ranking (reutilizados por 5 cards) ---
  // OTIMIZAÇÃO: Scoring incremental O(J×N) em vez de O(J²×N).
  // Com 80 jogos e 20 apostadores, reduz de ~166.000 para ~1.600 iterações de scoring.
  let snapshots = [];
  if (totalJogos >= 2) {
    // Inicializa acumuladores por apostador
    const _accum = {};
    for (const a of apos) {
      _accum[a.id] = { total: 0, placarExato: 0, placarAlto: 0, resultado: 0 };
    }
    // Pré-calcular pontos especiais (não mudam entre snapshots)
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

      // Gerar snapshot-ranking a partir dos acumuladores (sort rápido, sem re-scoring)
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

  // Pré-indexar posições por apostador para evitar O(N) .find() em cada snapshot
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

  // --- Montanha Russa: maior Σ|Δposição| / nJogos (mín 5 jogos) ---
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
      // Média por jogo (divisão pelo número de snapshots – 1 = número de intervalos)
      montanhaScores[aId] = snapshots.length > 1 ? soma / (snapshots.length - 1) : 0;
    }
  }
  const destMontanha = obterDestaques(r => montanhaScores[r.participante.id] !== undefined ? montanhaScores[r.participante.id] : -1, true, true, score => totalJogos >= 5 && score > 0);
  const _montanhaArr = destMontanha.bestArr;
  const montanhaScore = destMontanha.bestScore;

  // --- Tartaruga: menor Σ|Δposição| (mín 5 jogos) ---
  const destTartaruga = obterDestaques(r => montanhaScores[r.participante.id] !== undefined ? montanhaScores[r.participante.id] : Infinity, true, false, score => totalJogos >= 5 && score !== Infinity);
  const _tartarugaArr = destTartaruga.bestArr;
  const tartarugaScore = destTartaruga.bestScore;

  // --- Rei da Colina: maior sequência consecutiva em 1º (usa snapshots) ---
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

  // --- Tubarão Banguela: mais snapshots no Top 5 e atualmente fora (mín 10 jogos) ---
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

  // --- Derreteu: já calculado junto com Fênix (otimização: mesmo gerarRanking) ---
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
          return getSigla(hC) + ' ' + rv.homeGoals + '×' + rv.awayGoals + ' ' + getSigla(aC);
        })
      };
    } else {
      oniscienteScores[a.id] = 0;
    }
  }
  const destOnisciente = obterDestaques(r => oniscienteScores[r.participante.id] || 0, true, true, score => score > 0);
  const _oniscienteArr = destOnisciente.bestArr;
  let oniscienteSubStr = '—';
  if (destOnisciente.bestApo) {
    const det = oniscienteDetalhes[destOnisciente.bestApo.participante.id];
    if (det) {
      oniscienteSubStr = det.goals + ' gols (' + det.games[0] + ')';
    }
  }

  // --- Centro Avante / Zagueirão: maior/menor média de gols apostados ---
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

  // --- Clone: mais apostas idênticas ao placar mais votado pelo grupo ---
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

  // --- Ovelha Negra: mais erros em jogos que ≥80% acertou ---
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

  // --- Anarquista: maior distância média do placar mais votado ---
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
  const anarqMedia = destAnarquista.bestScore ? destAnarquista.bestScore.toFixed(1) : "—";

  // --- Metrônomo: menor desvio padrão de pts/jogo (mín 10 jogos) ---
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

  // --- Pra fora! (pior palpite de cada jogador, maior distância por jogador) ---
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
          game: getSigla(hC) + '×' + getSigla(aC),
          apost: p.homeGoals + '×' + p.awayGoals,
          real: r2.homeGoals + '×' + r2.awayGoals
        };
      }
    }
  }
  const destPraFora = obterDestaques(r => praForaScores[r.participante.id] ?? 0, false, true, score => score > 0);
  const _praForaArr = destPraFora.bestArr;
  const praForaTopId = destPraFora.bestApo?.participante?.id;
  const praForaSub = praForaTopId && praForaDetalhes[praForaTopId]
    ? praForaDetalhes[praForaTopId].game + ': ' + praForaDetalhes[praForaTopId].apost + ' (foi ' + praForaDetalhes[praForaTopId].real + ')'
    : '—';

  // --- Lanterninha ---
  const lanterninha = ranking[ranking.length - 1];
  const lanterninhaPos = lanterninha.posicao;
  const empatadosLanterna = ranking.filter(r => r.posicao === lanterninhaPos);
  let _lanterninhaArr;
  if (empatadosLanterna.length <= 2) {
    // Empate simples: mostrar todos (1 ou 2)
    _lanterninhaArr = empatadosLanterna;
  } else {
    // Empate triplo+: desempate pelos piores (card ruim = menos pontos na frente, pior posição)
    empatadosLanterna.sort((a, b) => {
      if (Math.abs(a.stats.total - b.stats.total) > 0.0001) return a.stats.total - b.stats.total;
      return b.posicao - a.posicao;
    });
    _lanterninhaArr = [empatadosLanterna[0], empatadosLanterna[1]];
  }

  // ── 14 novos cálculos ──────────────────────────────────────────────────────
  // Campeão do Avesso (palpites espelhados homeGoals↔awayGoals)
  const demogorgonScores = {};
  for (const a of apos) { let t = 0; for (const jogo of jogosFeitos) { const p = pals[a.id]?.[jogo.id]; if (!p || p.homeGoals === undefined) continue; t += aplicarFator(calcularPontosBrutos({ homeGoals: p.awayGoals, awayGoals: p.homeGoals }, res[jogo.id]).total_bruto, jogo.fase); } demogorgonScores[a.id] = t; }
  const destDemogorgon = obterDestaques(r => demogorgonScores[r.participante.id] || 0, true, true);
  const _demogorgonArr = destDemogorgon.bestArr;

  // Gêmeos + Polos Opostos (loop triangular, todos os jogos apostados)
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

  // Pés de Barro + Dragão Adormecido (aproveitamento grupos vs eliminatórias)
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
      if (prob > 0 && prob < minProb) { minProb = prob; bestGame = { jogo, prob, placar: rv.homeGoals + '×' + rv.awayGoals, hC: _hL, aC: _aL }; }
    }
    if (minProb < Infinity) { loteriaScores[a.id] = 1 / minProb; loteriaDetalhes[a.id] = bestGame; }
  }
  const destLoteria = obterDestaques(r => loteriaScores[r.participante.id] || 0, true, true, s => s > 0);
  const _loteriaArr = destLoteria.bestArr;
  let _loteriaSub = '—';
  if (destLoteria.bestApo) { const _dL = loteriaDetalhes[destLoteria.bestApo.participante.id]; if (_dL) _loteriaSub = (_dL.prob * 100).toFixed(1) + '% prob. (' + getSigla(_dL.hC) + ' ' + _dL.placar + ' ' + getSigla(_dL.aC) + ')'; }

  // Técnico da Seleção (pontos nos jogos do Brasil)
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

  // Discreto (nunca Top 5 nem Bottom 5, menor distância do centro)
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

  // Faro de Campeão (pontos de palpites especiais)
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

  // Frangueiro + Pé de Anjo (distância média do saldo de gols)
  const franqueiroScores = {};
  for (const a of apos) { let soma = 0, n = 0; for (const jogo of jogosFeitos) { const p = pals[a.id]?.[jogo.id]; if (!p || p.homeGoals === undefined) continue; const rv = res[jogo.id]; soma += Math.abs((parseInt(p.homeGoals) - parseInt(p.awayGoals)) - (rv.homeGoals - rv.awayGoals)); n++; } if (n >= 10) franqueiroScores[a.id] = soma / n; }
  const destFrangueiro = obterDestaques(r => franqueiroScores[r.participante.id] ?? -1, false, true, s => s >= 0);
  const _franqueiroArr = destFrangueiro.bestArr;
  const destPeAnjo = obterDestaques(r => franqueiroScores[r.participante.id] ?? Infinity, true, false, s => s !== Infinity);
  const _peAnjoArr = destPeAnjo.bestArr;

  let h = "";

  // ─── CSS: Grid 7 colunas desktop, 2 colunas mobile ────────────────────────
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

  // ─── 42 Cards em 6 linhas × 7 colunas ─────────────────────────────────────
  // L1: Sequências | L2: Trajetória | L3: Precisão | L4: Calibração | L5: Perfil | L6: Especiais
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

  // Ordenação visual CSS: 6 linhas × 7 colunas
  const _cardOrder = ['pe_quente','pe_frio','mare_alta','mare_baixa','escalando','queda_livre','fenix','derreteu','rei_colina','tubarao','montanha_russa','tartaruga','pes_barro','dragao_adormecido','vidente','atirador','zebra_ouro','mestre_bonus','diplomata','gladiador','discreto','onisciente','pra_fora','ovelha_negra','frangueiro','pe_anjo','bilhete_premiado','lanterninha','centro_avante','zagueirao','pacifista','destemido','conservador','clone','anarquista','metronomo','campeao_avesso','gemeos','polos_opostos','tecnico_selecao','matador_canarinho','faro_campeao'];
  h += '<style>' + _cardOrder.map((k,i) => '.stat-d-card[data-card-key="' + k + '"]{order:' + (i+1) + '}').join('') + '</style>';
  h += '<div class="stats-grid">';

  // ── Linha 1 ──────────────────────────────────────────────────────────────
  h += _dCard("🔥", "Pé Quente",
    jogosFeitos.length === 0 ? '—' : _tieName(_peQuenteArr),
    jogosFeitos.length === 0 ? '— (sem jogos)' : (!peQuenteApo || maiorSeqQuente === 0 ? '—' : maiorSeqQuente + ' resultados seguidos'),
    "#fdba74", "pe_quente", "Quem teve a maior sequência seguida acertando pelo menos o resultado (vitória/empate) em cada jogo — o recorde de fase boa da Copa.");

  h += _dCard("🥶", "Pé Frio",
    jogosFeitos.length === 0 ? '—' : _tieName(_peFrioArr),
    jogosFeitos.length === 0 ? '— (sem jogos)' : (!peFrioApo || maiorSeqFria === 0 ? '—' : maiorSeqFria + ' zerados seguidos'),
    "#7dd3fc", "pe_frio", "Quem teve a maior sequência seguida de jogos com zero pontos — o recorde de fase ruim da Copa.");

  h += _dCard("🏄", "Maré Alta",
    jogosFeitos.length === 0 ? '—' : (_maraAltaArr ? _tieName(_maraAltaArr) : '—'),
    jogosFeitos.length === 0 ? '— (sem jogos)' : (!_maraAltaArr || maraAltaScore === 0 ? '—' : maraAltaScore + ' em sequência agora'),
    "#34d399", "mare_alta", "Quem está na maior sequência atual acertando pelo menos o resultado. Diferente do Pé Quente (recorde histórico): conta só o que está acontecendo agora.");

  h += _dCard("🌊", "Maré Baixa",
    jogosFeitos.length === 0 ? '—' : (_mareBaixaArr ? _tieName(_mareBaixaArr) : '—'),
    jogosFeitos.length === 0 ? '— (sem jogos)' : (!_mareBaixaArr || mareBaixaScore === 0 ? '—' : mareBaixaScore + ' zerados agora'),
    "#93c5fd", "mare_baixa", "Quem está na maior sequência atual de jogos com zero pontos. Diferente do Pé Frio (recorde histórico): conta só a seca em curso agora.");

  h += _dCard("🧗", "Escalando",
    totalJogos < 5 ? '—' : _tieName(_escalandoArr),
    totalJogos < 5 ? '— (< 5 jogos)' : (escalandoApo && maiorSalto > 0 ? '+' + maiorSalto + ' posições' : '—'),
    "#fb7185", "escalando", "Quem mais subiu no ranking nos últimos 5 jogos. Compara a posição atual com a de antes desses 5 jogos.");

  h += _dCard("📉", "Queda Livre",
    totalJogos < 5 ? '—' : _tieName(_tombArr),
    totalJogos < 5 ? '— (< 5 jogos)' : (tombApo && maiorTombo > 0 ? '−' + maiorTombo + ' posições' : '—'),
    "#f87171", "queda_livre", "Quem mais caiu no ranking nos últimos 5 jogos. Compara a posição atual com a de antes desses 5 jogos.");

  h += _dCard("🔄", "Fênix",
    totalJogos < 15 ? '—' : _tieName(_recuperArr),
    totalJogos < 15 ? '— (< 15 jogos)' : (recuperApo && maiorRecup > 0 ? '+' + maiorRecup + ' posições' : '—'),
    "#38bdf8", "fenix", "Quem mais subiu no ranking nos últimos 20 jogos. Começa a ser calculado a partir do 15º jogo da Copa.");

  // ── Linha 2 ──────────────────────────────────────────────────────────────
  h += _dCard("🧈", "Derreteu",
    totalJogos < 15 ? '—' : (_derreteuArr ? _tieName(_derreteuArr) : '—'),
    totalJogos < 15 ? '— (< 15 jogos)' : (!_derreteuArr || derreteuScore === 0 ? '—' : '−' + derreteuScore + ' posições'),
    "#f97316", "derreteu", "Quem mais caiu no ranking nos últimos 20 jogos. Oposto do Fênix. Começa a ser calculado a partir do 15º jogo da Copa.");

  h += _dCard("🏰", "Rei da Colina",
    _reiArr ? _tieName(_reiArr) : '—',
    !_reiArr || reiScore === 0 ? '—' : reiScore + ' rodadas na liderança',
    "#fbbf24", "rei_colina", "Quem ficou mais rodadas consecutivas em 1º lugar. Conta a maior sequência contínua na liderança, não o tempo total.");

  h += _dCard("🦈", "Tubarão Banguela",
    totalJogos < 10 ? '—' : (_tubaraoArr ? _tieName(_tubaraoArr) : '—'),
    totalJogos < 10 ? '— (< 10 jogos)' : (!_tubaraoArr || tubaraoScore === 0 ? '—' : tubaraoScore + ' rodadas no Top 5'),
    "#94a3b8", "tubarao", "Quem passou mais rodadas no Top 5 mas está fora dessa zona agora. Era temido, perdeu o faro. Mínimo 10 jogos.");

  h += _dCard("🎢", "Montanha Russa",
    totalJogos < 5 ? '—' : (_montanhaArr ? _tieName(_montanhaArr) : '—'),
    totalJogos < 5 ? '— (< 5 jogos)' : (!_montanhaArr || montanhaScore === 0 ? '—' : montanhaScore.toFixed(2) + ' pos./jogo'),
    "#e879f9", "montanha_russa", "Quem mais oscilou de posição no ranking: média de |Δposição| por jogo. Mínimo 5 jogos.");

  h += _dCard("🐢", "Tartaruga",
    totalJogos < 5 ? '—' : (_tartarugaArr ? _tieName(_tartarugaArr) : '—'),
    totalJogos < 5 ? '— (< 5 jogos)' : (!_tartarugaArr ? '—' : tartarugaScore.toFixed(2) + ' pos./jogo'),
    "#84cc16", "tartaruga", "Quem menos oscilou de posição — sempre no mesmo lugar. Média de |Δposição| por jogo, o menor valor vence. Mínimo 5 jogos.");

  h += _dCard("🔮", "Vidente",
    jogosFeitos.length === 0 ? '—' : _tieName(_melhorResArr),
    jogosFeitos.length === 0 ? '— (sem jogos)' : (melhorRes ? melhorRes.stats.acertos_resultado + ' resultados acertados' : '—'),
    "#86efac", "vidente", "Quem mais acertou o desfecho dos jogos — vitória do time da casa, empate ou vitória do visitante — sem precisar acertar o placar exato.");

  h += _dCard("🪬", "Onisciente",
    jogosFeitos.length === 0 ? '—' : (_oniscienteArr ? _tieName(_oniscienteArr) : '—'),
    jogosFeitos.length === 0 ? '— (sem jogos)' : (!_oniscienteArr ? '—' : oniscienteSubStr),
    "#c084fc", "onisciente", "Acertou o placar exato do jogo com mais gols da Copa — o mais difícil de prever pelo volume de gols.");

  // ── Linha 3 ──────────────────────────────────────────────────────────────
  h += _dCard("🎯", "Atirador de Elite",
    jogosFeitos.length === 0 ? '—' : _tieName(_melhorExatoArr),
    jogosFeitos.length === 0 ? '— (sem jogos)' : (melhorExato ? melhorExatoCount + ' placares exatos' : '—'),
    "var(--verde-ok)", "atirador", "Quem mais acertou o placar exato. Placares normais dão +3 pts de bônus; placares com 4 ou mais gols no total dão +5 pts.");

  h += _dCard("🦓", "Zebra de Ouro",
    jogosFeitos.length === 0 ? '—' : _tieName(_zebraArr),
    jogosFeitos.length === 0 ? '— (sem jogos)' : (melhorZebra ? zebraCount + ' zebras domadas' : '—'),
    "#fcd34d", "zebra_ouro", "Quem mais acertou resultados que menos de 20% do grupo havia apostado — palpites raros E corretos. Coragem com precisão.");

  h += _dCard("💎", "Mestre dos Bônus",
    jogosFeitos.length === 0 ? '—' : _tieName(_mestreBonusArr),
    jogosFeitos.length === 0 ? '— (sem jogos)' : (mestreBonus ? destMestreBonus.bestScore + ' jogos com bônus' : '—'),
    "#a78bfa", "mestre_bonus", "Quem somou mais jogos com algum bônus: placar exato (+3 ou +5 pts), diferença de gols correta (+1 pt) ou gols de um time corretos (+1 pt).");

  h += _dCard("🙈", "Pra fora!",
    _tieName(_praForaArr),
    praForaSub,
    "#fb923c", "pra_fora", "O palpite mais distante do resultado real na Copa inteira, medido pela diferença de gols: |(palH−palA) − (resH−resA)|. Ex: resultado 1×0, chute 0×4 → |(−4) − 1| = 5.");

  h += _dCard("⚽", "Centro Avante",
    _centroAvanteArr ? _tieName(_centroAvanteArr) : '—',
    !_centroAvanteArr || centroAvanteScore === -Infinity ? '— (< 5 apostas)' : centroAvanteScore.toFixed(2) + ' gols/jogo',
    "#fb923c", "centro_avante", "Quem aposta em mais gols por jogo em média. O otimista ofensivo do bolão. Mínimo 5 apostas.");

  h += _dCard("🧱", "Zagueirão",
    _zagueiroArr ? _tieName(_zagueiroArr) : '—',
    !_zagueiroArr || zagueiroScore === Infinity ? '— (< 5 apostas)' : zagueiroScore.toFixed(2) + ' gols/jogo',
    "#64748b", "zagueirao", "Quem aposta em menos gols por jogo em média. Acredita em defesas, resultados magros e jogos travados. Mínimo 5 apostas.");

  h += _dCard("🃏", "Destemido",
    _tieName(_chutZebraArr),
    !chutZebraApo ? '—' : chutZebraCount + ' palpites improváveis',
    "#f59e0b", "destemido", "Quem mais apostou em resultados que menos de 20% do grupo escolheu — independente de acertar. Diferente da Zebra de Ouro, que só conta quando o palpite improvável estava certo.");

  // ── Linha 4 ──────────────────────────────────────────────────────────────
  h += _dCard("🐑", "Ovelha Negra",
    _ovelhaArr ? _tieName(_ovelhaArr) : '—',
    !_ovelhaArr || ovelhaScore === 0 ? '—' : ovelhaScore + ' erros em jogos fáceis',
    "#f43f5e", "ovelha_negra", "Quem mais errou em jogos que 80% ou mais do grupo acertou. Errar o que todo mundo acertou é uma arte.");

  h += _dCard("🪞", "Clone",
    _cloneArr ? _tieName(_cloneArr) : '—',
    !_cloneArr || cloneScore === 0 ? '—' : cloneScore + 'x no placar do grupo',
    "#a5f3fc", "clone", "Quem mais vezes apostou exatamente o placar mais votado pelo grupo. Só conta quando ao menos 2 pessoas apostaram o mesmo placar.");

  h += _dCard("🕊️", "Pacifista",
    _pacifistaArr ? _tieName(_pacifistaArr) : '—',
    !_pacifistaArr || pacifistaScore === 0 ? '—' : pacifistaScore + ' empates apostados',
    "#bae6fd", "pacifista", "Quem mais apostou em empate ao longo do bolão. O resultado mais raro em Copas do Mundo, apostado com convicção.");

  h += _dCard("💤", "Conservador",
    _tieName(_conservArr),
    !conservApo ? '— (sem consenso)' : conservCount + 'x no consenso',
    "#94a3b8", "conservador", "Quem mais apostou igual à maioria: o resultado escolhido tinha pelo menos 50% dos palpites do grupo naquela direção.");

  h += _dCard("🎲", "Anarquista",
    _tieName(_anarqArr),
    !anarqApo ? '— (< 3 apostas)' : 'dist. média ' + anarqMedia + ' gols',
    "#a78bfa", "anarquista", "Quem mais diverge do placar mais votado pelo grupo em cada jogo apostado. A distância é medida por |(palH−palA) − (topH−topA)|. Mínimo 3 apostas.");

  h += _dCard("⚖️", "Metrônomo",
    jogosFeitos.length < 10 ? '—' : _tieName(_consistArr),
    jogosFeitos.length < 10 || !consistApo ? '— (< 10 jogos)' : 'desvio ' + menorDP.toFixed(2) + ' pts/jogo',
    "#34d399", "metronomo", "Quem pontua de forma mais consistente jogo a jogo, com menor variação entre rodadas boas e ruins. Calculado pelo desvio padrão dos pontos por jogo (mínimo 10 jogos).");

  h += _dCard("🕯️", "Lanterninha",
    jogosFeitos.length === 0 ? '—' : _tieName(_lanterninhaArr),
    jogosFeitos.length === 0 ? '— (sem jogos)' : (_lanterninhaArr?.[0] ? _lanterninhaArr[0].stats.total.toFixed(1) + ' pts' : '—'),
    "#94a3b8", "lanterninha", "Quem está com menos pontos acumulados até agora. A lanterna da Copa.");

  // ── Novos Cards ────────────────────────────────────────────────────────────
  h += _dCard("🥷", "Discreto",
    totalJogos < 15 || apos.length < 11 ? '—' : (_discretoArr ? _tieName(_discretoArr) : '—'),
    totalJogos < 15 ? '— (< 15 jogos)' : (apos.length < 11 ? '— (poucos apost.)' : (!_discretoArr ? '—' : destDiscreto.bestScore.toFixed(2) + ' dist. média')),
    "#64748b", "discreto", "Passou a Copa inteira no anonimato. Nunca Top 5 nem Bottom 5, gravitou no centro exato da tabela. O mestre da mediocridade estratégica.");

  h += _dCard("🗿", "Pés de Barro",
    !_pesBarroArr ? '—' : _tieName(_pesBarroArr),
    !_pesBarroArr ? '— (< 4 jogos elim.)' : (destPesBarro.bestScore * 100).toFixed(1) + '% de queda',
    "#a8a29e", "pes_barro", "Gigante com os pés de barro! Mandou bem nos grupos, desmoronou no mata-mata. Mín. 4 jogos eliminatórios.");

  h += _dCard("🤝", "Diplomata",
    jogosEmpate.length === 0 ? '—' : (_diplomataArr ? _tieName(_diplomataArr) : '—'),
    jogosEmpate.length === 0 ? '— (sem empates)' : (!_diplomataArr || destDiplomata.bestScore === 0 ? '—' : destDiplomata.bestScore + ' empates acertados'),
    "#7dd3fc", "diplomata", "Mestre do equilíbrio! Quem mais acertou jogos que terminaram empatados de verdade.");

  h += _dCard("⚔️", "Gladiador",
    jogosSemEmpate.length === 0 ? '—' : (_gladiadorArr ? _tieName(_gladiadorArr) : '—'),
    jogosSemEmpate.length === 0 ? '— (sem decisivos)' : (!_gladiadorArr || destGladiador.bestScore === 0 ? '—' : destGladiador.bestScore + ' vencedores acertados'),
    "#ef4444", "gladiador", "Sangue de gladiador! Quem mais acertou o lado vencedor em jogos sem empate.");

  h += _dCard("🐉", "Dragão Adormecido",
    !_dragaoArr ? '—' : _tieName(_dragaoArr),
    !_dragaoArr ? '— (< 4 jogos elim.)' : '+' + (destDragao.bestScore * 100).toFixed(1) + '% de melhora',
    "#22d3ee", "dragao_adormecido", "Estava quieto nos grupos, acordou no mata-mata e virou o jogo! Mín. 4 jogos eliminatórios.");

  h += _dCard("🐔", "Frangueiro",
    jogosFeitos.length < 10 ? '—' : (_franqueiroArr ? _tieName(_franqueiroArr) : '—'),
    jogosFeitos.length < 10 ? '— (< 10 jogos)' : (!_franqueiroArr ? '—' : destFrangueiro.bestScore.toFixed(2) + ' gols dist./jogo'),
    "#f97316", "frangueiro", "Sempre longe da realidade! Maior média de distância entre o saldo apostado e o real. Mín. 10 jogos.");

  h += _dCard("👼", "Pé de Anjo",
    jogosFeitos.length < 10 ? '—' : (_peAnjoArr ? _tieName(_peAnjoArr) : '—'),
    jogosFeitos.length < 10 ? '— (< 10 jogos)' : (!_peAnjoArr ? '—' : destPeAnjo.bestScore.toFixed(2) + ' gols dist./jogo'),
    "#34d399", "pe_anjo", "Toque divino! Mesmo errando o placar, fica colado no saldo real de gols. Precisão de craque. Mín. 10 jogos.");

  h += _dCard("🍀", "Bilhete Premiado",
    !_loteriaArr ? '—' : _tieName(_loteriaArr),
    !_loteriaArr ? '— (sem acertos exatos)' : _loteriaSub,
    "#fbbf24", "bilhete_premiado", "Acertou o inacertável! Cravou um placar exato que o modelo Dixon-Coles considerava quase impossível.");

  h += _dCard("🙃", "Campeão do Avesso",
    jogosFeitos.length === 0 ? '—' : (_demogorgonArr ? _tieName(_demogorgonArr) : '—'),
    jogosFeitos.length === 0 ? '—' : (!_demogorgonArr || destDemogorgon.bestScore === 0 ? '—' : destDemogorgon.bestScore.toFixed(1) + ' pts invertidos'),
    "#c084fc", "campeao_avesso", "Bem-vindo ao Mundo Invertido! Pontuação recalculada como se os resultados fossem espelhados: o placar do mandante vira do visitante e vice-versa. O campeão de cabeça pra baixo.");

  h += _dCard("👯", "Gêmeos",
    _gemeosNomes || '—',
    !_gemeosNomes ? '— (< 5 jogos comuns)' : 'dist. média ' + gemeosBest.dist.toFixed(2),
    "#a78bfa", "gemeos", "Quase telepatia! A dupla com os palpites mais parecidos da Copa inteira. Parece que combinaram — mas juram que não.");

  h += _dCard("🧲", "Polos Opostos",
    _polosNomes || '—',
    !_polosNomes ? '— (< 5 jogos comuns)' : 'dist. média ' + polosBest.dist.toFixed(2),
    "#f43f5e", "polos_opostos", "Nunca concordaram em nada! A dupla mais divergente da Copa inteira. Ou um estava certo... ou o outro.");

  h += _dCard("🎙️", "Técnico da Seleção",
    jogosBRA.length === 0 ? '—' : (_tecnicoArr ? _tieName(_tecnicoArr) : '—'),
    jogosBRA.length === 0 ? '— (sem jogos BRA)' : (!_tecnicoArr || destTecnico.bestScore === 0 ? '—' : destTecnico.bestScore.toFixed(1) + ' pts jogos BRA'),
    "#009c3b", "tecnico_selecao", "Escalou certo quando o Brasil entrou em campo! O apostador que mais pontuou nos jogos da Seleção.");

  h += _dCard("🪓", "Matador de Canarinho",
    _matadorArr ? _tieName(_matadorArr) : '—',
    !_matadorArr || destMatador.bestScore === 0 ? '—' : destMatador.bestScore + ' pts contra BRA',
    "#dc2626", "matador_canarinho", "Carrasco verde e amarelo! Acumulou dano apostando contra o Brasil: derrota = 3 pts, empate = 2 pts.");

  h += _dCard("🏆", "Faro de Campeão",
    _faroArr ? _tieName(_faroArr) : '—',
    !_faroArr || destFaro.bestScore === 0 ? '— (sem especiais)' : destFaro.bestScore + ' pts especiais',
    "#fbbf24", "faro_campeao", "Aposta especial impecável! Quem mais pontuou nos palpites de campeão, vice e terceiro colocado.");

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
    h += '<div class="card"><div class="card-titulo">📊 Jogos por Acerto</div>';
    h += '<div style="display:grid;gap:6px">';
    const top5 = jogoStats.slice(0, 5);
    const bot5 = jogoStats.slice(-5).reverse();
    h += '<div style="font-size:.7rem;font-weight:700;color:var(--verde-ok);text-transform:uppercase;letter-spacing:.05em">Mais acertados</div>';
    for (const s of top5) {
      const b = APP.bracket?.[s.jogo.id] || {}; const hC = b.home || s.jogo.home; const aC = b.away || s.jogo.away;
      h += _jogoStatRow(s.jogo.id, hC, aC, res[s.jogo.id], s.acertos, s.totalApostas, "var(--verde-ok)");
    }
    h += '<div style="font-size:.7rem;font-weight:700;color:#f87171;text-transform:uppercase;letter-spacing:.05em;margin-top:8px">Menos acertados (mais difíceis)</div>';
    for (const s of bot5) {
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
      const isMobFav = window.innerWidth <= 600;
      const favNameW = isMobFav ? '115px' : '320px';
      h += '<div style="display:flex;align-items:center;gap:' + (isMobFav ? '16' : '12') + 'px;padding:' + (isMobFav ? '3px 6px' : '4px 8px') + ';border-radius:6px">';
      h += '<div style="display:flex;align-items:center;gap:6px;font-weight:600;width:' + favNameW + ';flex-shrink:0;font-size:' + (isMobFav ? '.65' : '.72') + 'rem;min-width:0">' +
           htmlBandeira(code, isMobFav ? 14 : 18) +
           '<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (info?.name || code) + '</span>' +
           (campeaoOficial ? '<span style="color:var(--dourado);margin-left:2px" title="Campeão Confirmado">✓</span>' : '') +
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


  // OTIMIZAÇÃO: Render cards imediatamente, defer tabela + HtH para o próximo frame
  // Isso faz os 42 cards aparecerem instantaneamente no mobile.
  h += '<div id="stat-table-deferred"><div class="card" style="text-align:center;padding:20px;color:var(--texto2)"><div class="spinner" style="margin:0 auto 8px"></div>Carregando tabela avançada...</div></div>';
  h += '<div id="stat-hth-deferred"></div>';

  el.innerHTML = h;
  el.dataset.rendered = '1';

  // Tooltip unificado (hover desktop + toque mobile) em todos os [title] da aba
  window.injetarTooltipsMobile(el);

  // Defer: tabela avançada + HtH aparecem no próximo frame, liberando o thread principal
  requestAnimationFrame(() => {
    _renderStatsTabelaDeferred(el, res, apos, pals, esp);
  });
};

// ══════════════════════════════════════════════════════════════════════════════
// DEFERRED: Tabela Avançada + Head-to-Head (renderizados após os 42 cards)
// Otimização: libera o thread principal para que os cards apareçam instantaneamente
// ══════════════════════════════════════════════════════════════════════════════
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

  let h = '<div class="card card-sem-padding"><div class="card-titulo">📈 Estatísticas Avançadas por Jogo</div><div class="compilacao-wrap stat-table-wrap"><table class="compilacao-table stat-full-table" style="font-size:.7rem">';
  h += '<thead><tr>';
  const isMobileHeader = window.innerWidth <= 600;
  h += `<th class="${isMobileHeader ? 'col-jogo' : 'stat-col-jogo'}" style="text-align:left;">Jogo</th>`;
  h += '<th class="col-resultado" title="Placar oficial do jogo">' + (window.innerWidth <= 600 ? 'Result' : 'Resultado') + '</th>';
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
              ${htmlBandeira(hC, 14)} <span class="${isMobile ? 'compilacao-time-nome comp-sigla' : 'stat-time-nome'}">${isMobile ? getSigla(hC) : hName}</span> <span style="color:var(--texto2)">×</span> <span class="${isMobile ? 'compilacao-time-nome comp-sigla' : 'stat-time-nome'}">${isMobile ? getSigla(aC) : aName}</span> ${htmlBandeira(aC, 14)}
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
      h += `<td colspan="7" style="color:var(--texto2);font-size:.7rem;opacity:0.6">🔒 Previsão indisponível</td>`;
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
    hthHtml += '<div class="card"><div class="card-titulo">⚔️ Head-to-Head</div>';
    if (APP._modoSimulacao) {
      hthHtml += '<div style="color:#f87171;font-size:.8rem;padding:10px 0;text-align:center">🔒 O Head-to-Head fica indisponível no modo simulação para proteger a privacidade dos palpites.</div></div>';
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

  // Tooltips + frozen header para o conteúdo deferred
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
    const tooltipH = '';
    const tooltipA = '';
    rows += '<tr><td class="' + (isMob ? 'col-jogo' : 'stat-col-jogo') + '" onclick="PROGNOSE.abrirModal(\'' + jogo.id + '\')" style="text-align:left;font-size:.73rem;position:sticky;left:0;background:var(--fundo);z-index:1;box-shadow:1px 0 0 0 #292d35, 2px 0 5px rgba(0,0,0,0.1);cursor:pointer">' +
      '<div style="display:flex;align-items:center;gap:4px;width:100%">' + htmlBandeira(hC, 14) + ' <span class="' + (isMob ? 'compilacao-time-nome comp-sigla' : 'stat-time-nome') + '"' + tooltipH + '>' + hDisplay + '</span> <span style="color:var(--texto2)">×</span> <span class="' + (isMob ? 'compilacao-time-nome comp-sigla' : 'stat-time-nome') + '"' + tooltipA + '>' + aDisplay + '</span> ' + htmlBandeira(aC, 14) + '</div></td>' +
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
    const nomeStr = Array.isArray(nome) ? (nome[0] || '—') : nome;
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
  const placar = r.homeGoals + '×' + r.awayGoals;

  // Mobile: layout compacto com placar centralizado entre os times
  // [flag1 sigla1] [placar] [sigla2 flag2] | ████░░ | 12/20
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

// ══════════════════════════════════════════════════════════════════════════════
// CARD_CONFIGS: Mapeamento de cada card → { icon, label, desc, getScore, higherIsWinner, format, isGoodCard, filterFn? }
// ══════════════════════════════════════════════════════════════════════════════
window.CARD_CONFIGS = {
  pe_quente:     { icon: '🔥', label: 'Pé Quente',           desc: 'Manteve o radiador fervendo! Quem teve a maior sequência consecutiva de jogos acertando pelo menos o resultado (vitória/empate) de cada partida. Calculado varrendo o histórico cronológico de palpites do jogador na Copa e contando o tamanho máximo de acertos contínuos.', getScore: (r,c) => c.hotStreaks[r.participante.id] || 0,            higherIsWinner: true,  isGoodCard: true,  format: v => v + ' seguidos' },
  pe_frio:       { icon: '🥶', label: 'Pé Frio',             desc: 'Zicou de vez! Quem teve a maior sequência consecutiva de jogos com pontuação igual a zero (errou o vencedor e o empate). Calculado varrendo o histórico cronológico e medindo a maior sequência contínua de erros completos.', getScore: (r,c) => c.coldStreaks[r.participante.id] || 0,           higherIsWinner: true,  isGoodCard: false, format: v => v + ' zerados' },
  mare_alta:     { icon: '🏄', label: 'Maré Alta',            desc: 'Surfando na crista da onda! Quem está com a maior sequência ativa acertando o resultado neste exato momento. Diferente do Pé Quente, é calculado medindo a sequência ininterrupta de acertos a partir do jogo mais recente em direção aos anteriores.', getScore: (r,c) => c.maresAltas[r.participante.id] || 0,           higherIsWinner: true,  isGoodCard: true,  format: v => v + ' em seq.', filterFn: s => s > 0 },
  mare_baixa:    { icon: '🌊', label: 'Maré Baixa',           desc: 'No fundo do poço! A maior sequência de jogos zerados em curso neste exato momento. Diferente do Pé Frio, é calculado medindo a sequência ativa e ininterrupta de erros completos a partir do jogo mais recente.', getScore: (r,c) => c.maresBaixas[r.participante.id] || 0,         higherIsWinner: true,  isGoodCard: false, format: v => v + ' zerados', filterFn: s => s > 0 },
  escalando:     { icon: '🧗', label: 'Escalando',            desc: 'Subindo feito foguete! Quem deu o maior salto de posições no ranking ao longo das últimas 5 partidas realizadas. Calculado comparando a posição atual com a posição que o apostador ocupava exatamente 5 jogos atrás.', getScore: (r,c) => c.saltos5[r.participante.id] || 0,             higherIsWinner: true,  isGoodCard: true,  format: v => '+' + v + ' pos.', filterFn: (s,r,c) => c.totalJogos >= 5 && s > 0 },
  queda_livre:   { icon: '📉', label: 'Queda Livre',          desc: 'Sem paraquedas! Quem teve o maior tombo de posições no ranking nas últimas 5 partidas realizadas. Calculado comparando a posição que o apostador ocupava 5 jogos atrás com a posição que ele ocupa agora.', getScore: (r,c) => c.quedas5[r.participante.id] || 0,             higherIsWinner: true,  isGoodCard: false, format: v => '−' + v + ' pos.', filterFn: (s,r,c) => c.totalJogos >= 5 && s > 0 },
  fenix:         { icon: '🔄', label: 'Fênix',                desc: 'Ressurgiu das cinzas! O maior salto de posições no ranking acumulado ao longo de um bloco de 20 partidas. Calculado comparando a posição que o apostador ocupava 20 jogos atrás com a posição atual (mínimo 15 jogos realizados).', getScore: (r,c) => c.recuperacoes20[r.participante.id] || 0,       higherIsWinner: true,  isGoodCard: true,  format: v => '+' + v + ' pos.', filterFn: (s,r,c) => c.totalJogos >= 15 && s > 0 },
  derreteu:      { icon: '🧈', label: 'Derreteu',             desc: 'Ladeira abaixo! A maior queda de posições no ranking nos últimos 20 jogos da Copa. Calculado comparando a posição que o apostador ocupava 20 jogos atrás com a sua posição atual (mínimo 15 jogos realizados).', getScore: (r,c) => c.derreteuScores[r.participante.id] || 0,        higherIsWinner: true,  isGoodCard: false, format: v => '−' + v + ' pos.', filterFn: (s,r,c) => c.totalJogos >= 15 && s > 0 },
  rei_colina:    { icon: '🏰', label: 'Rei da Colina',        desc: 'Dono do trono! Quem conseguiu passar mais rodadas consecutivas no topo geral do ranking (isolado ou empatado em 1º lugar). Calculado analisando a liderança em cada snapshot acumulativo de rodadas.', getScore: (r,c) => c.reiScores[r.participante.id] || 0,            higherIsWinner: true,  isGoodCard: true,  format: v => v + ' rodadas', filterFn: s => s > 0 },
  tubarao:       { icon: '🦈', label: 'Tubarão Banguela',     desc: 'Morde mas não machuca! Quem passou mais rodadas cumulativas dentro do Top 5 do ranking ao longo do campeonato, mas que atualmente está fora dele. Calculado contando a quantidade de rodadas no Top 5 e filtrando se a posição atual é pior que 5 (mínimo 10 jogos).', getScore: (r,c) => c.tubaraoScores[r.participante.id] || 0,        higherIsWinner: true,  isGoodCard: false, format: v => v + ' rodadas', filterFn: (s,r,c) => c.totalJogos >= 10 && s > 0 },
  montanha_russa:{ icon: '🎢', label: 'Montanha Russa',       desc: 'Haja coração! Quem teve a maior média de variação absoluta de posições por jogo. Calculado somando o valor absoluto da diferença de posições entre cada jogo (|Δposição|) e dividindo pelo total de rodadas (mínimo 5 jogos).', getScore: (r,c) => c.montanhaScores[r.participante.id] ?? -1,    higherIsWinner: true,  isGoodCard: true,  format: v => v.toFixed(2) + ' pos./jogo', filterFn: (s,r,c) => c.totalJogos >= 5 && s > 0 },
  tartaruga:     { icon: '🐢', label: 'Tartaruga',            desc: 'Devagar e sempre! Quem teve a menor média de variação de posições por rodada. Calculado somando a diferença absoluta de posições a cada jogo (|Δposição|) e dividindo pelo total de rodadas (menor média vence, mínimo 5 jogos).', getScore: (r,c) => c.montanhaScores[r.participante.id] ?? Infinity, higherIsWinner: false, isGoodCard: true,  format: v => v.toFixed(2) + ' pos./jogo', filterFn: (s,r,c) => c.totalJogos >= 5 && s !== Infinity },
  vidente:       { icon: '🔮', label: 'Vidente',              desc: 'Previsões certeiras! Quem mais acumulou acertos do desfecho final da partida (vitória do time 1, empate ou vitória do time 2). Calculado somando os acertos simples de resultado geral de todos os jogos, independentemente de bônus.', getScore: (r,c) => r.stats.acertos_resultado,                       higherIsWinner: true,  isGoodCard: true,  format: v => v + ' acertos' },
  onisciente:    { icon: '🪬', label: 'Onisciente',           desc: 'Adivinho supremo! Quem acertou o placar exato do jogo que teve o maior número total de gols da Copa inteira. Calculado encontrando o valor máximo de gols (gols mandante + gols visitante) entre todos os palpites de placar exato acertados pelo jogador.', getScore: (r,c) => c.oniscienteScores[r.participante.id] || 0,     higherIsWinner: true,  isGoodCard: true,  format: (v,r,c) => { const d = c.oniscienteDetalhes[r.participante.id]; return d ? d.games.join(', ') : '—'; }, filterFn: s => s > 0 },
  atirador:      { icon: '🎯', label: 'Atirador de Elite',    desc: 'Mira calibrada! Quem acumulou mais acertos de placares exatos. É calculado somando os acertos de placar clássicos (bônus de +3) com os acertos de placares com 4 ou mais gols no total (bônus de +5).', getScore: (r,c) => r.stats.acertos_placar_exato + r.stats.acertos_placar_alto, higherIsWinner: true, isGoodCard: true, format: v => v + ' placares' },
  zebra_ouro:    { icon: '🦓', label: 'Zebra de Ouro',        desc: 'Caçador de zebras! Quem mais vezes acertou o resultado correto (vitória/empate) de jogos onde menos de 20% de todos os participantes apostaram nessa mesma direção. Mede palpites audaciosos e corretos.', getScore: (r,c) => c.zebraScores[r.participante.id] || 0,          higherIsWinner: true,  isGoodCard: true,  format: v => v + ' zebras' },
  mestre_bonus:  { icon: '💎', label: 'Mestre dos Bônus',     desc: 'Colecionador de bônus! Quem mais somou partidas pontuando com bônus. É calculado somando os jogos com acertos de placar exato (+3 ou +5) e os jogos com bônus secundários (+1 por diferença de gols ou gols de um time corretos).', getScore: (r,c) => r.stats.acertos_placar_exato + r.stats.acertos_placar_alto + r.stats.acertos_bonus1, higherIsWinner: true, isGoodCard: true, format: v => v + ' bônus' },
  pra_fora:      { icon: '🙈', label: 'Pra fora!',            desc: 'Mandou a bola na lua! O palpite de placar que ficou mais distante do placar real do jogo. Calculado pelo valor absoluto da diferença de saldo de gols entre o chute e o resultado real: |(palpite_home − palpite_away) − (real_home − real_away)|.', getScore: (r,c) => c.praForaScores[r.participante.id] ?? 0,       higherIsWinner: true,  isGoodCard: false, format: (v,r,c) => { const d = c.praForaDetalhes[r.participante.id]; return d ? `${d.game}: chute ${d.apost} (foi ${d.real})` : v; }, filterFn: s => s > 0 },
  centro_avante: { icon: '⚽', label: 'Centro Avante',        desc: 'Otimismo ofensivo! Quem tem a maior média de gols totais apostados por partida. Calculado somando todos os gols chutados em seus palpites e dividindo pela quantidade de jogos apostados (mínimo 5 apostas).', getScore: (r,c) => c.mediasGols[r.participante.id] ?? -Infinity,   higherIsWinner: true,  isGoodCard: true,  format: v => v.toFixed(2) + ' gols/jogo', filterFn: s => s !== -Infinity },
  zagueirao:     { icon: '🧱', label: 'Zagueirão',            desc: 'Retranqueiro de carteirinha! Quem tem a menor média de gols totais apostados por partida. Calculado somando todos os gols chutados em seus palpites e dividindo pelo número de jogos apostados (mínimo 5 apostas).', getScore: (r,c) => c.mediasGols[r.participante.id] ?? Infinity,    higherIsWinner: false, isGoodCard: true,  format: v => v.toFixed(2) + ' gols/jogo', filterFn: s => s !== Infinity },
  destemido:     { icon: '🃏', label: 'Destemido',             desc: 'Coragem pura! Quem mais apostou em resultados considerados improváveis, onde menos de 20% do grupo escolheu aquela direção, independente de ter acertado ou não. Mede a ousadia pura dos palpites.', getScore: (r,c) => c.zebraApostas[r.participante.id] || 0,        higherIsWinner: true,  isGoodCard: true,  format: v => v + ' apostas' },
  ovelha_negra:  { icon: '🐑', label: 'Ovelha Negra',         desc: 'O do contra! Quem mais vezes errou palpites em partidas consideradas fáceis, onde pelo menos 80% de todo o grupo acertou o resultado geral da partida. Errar o óbvio do grupo!', getScore: (r,c) => c.ovelhaScores[r.participante.id] || 0,         higherIsWinner: true,  isGoodCard: false, format: v => v + ' erros', filterFn: s => s > 0 },
  clone:         { icon: '🪞', label: 'Clone',                desc: 'Sombra do grupo! O apostador que mais vezes palpitou o placar mais votado pelo grupo (consenso). Calculado comparando cada palpite individual com o placar de maior frequência do grupo naquele jogo.', getScore: (r,c) => c.cloneScores[r.participante.id] || 0,          higherIsWinner: true,  isGoodCard: true,  format: v => v + 'x' },
  pacifista:     { icon: '🕊️', label: 'Pacifista',             desc: 'Amante da paz! Quem mais vezes palpitou empate nas partidas. Calculado somando todos os palpites onde os gols previstos para o time da casa e visitante foram iguais.', getScore: (r,c) => c.pacifistaScores[r.participante.id] || 0,      higherIsWinner: true,  isGoodCard: true,  format: v => v + ' empates' },
  conservador:   { icon: '💤', label: 'Conservador',           desc: 'Maria vai com as outras! Quem mais vezes escolheu a direção de resultado (vitória 1, empate, vitória 2) que concentrou pelo menos 50% de todos os palpites do grupo naquela rodada.', getScore: (r,c) => c.conservScores[r.participante.id] || 0,        higherIsWinner: true,  isGoodCard: true,  format: v => v + 'x consenso' },
  anarquista:    { icon: '🎲', label: 'Anarquista',            desc: 'Rebelde sem causa! Quem mais se distanciou do placar consensual (mais votado) do grupo. Calculado somando a distância absoluta do chute em relação ao top placar: |(chute_home − chute_away) − (top_home − top_away)| dividido pelas apostas.', getScore: (r,c) => { const id = r.participante.id; return (c.anarqJogos[id] || 0) >= 3 ? (c.anarqScores[id] / c.anarqJogos[id]) : 0; }, higherIsWinner: true, isGoodCard: true, format: v => v.toFixed(1) + ' dist.', filterFn: s => s > 0 },
  metronomo:     { icon: '⚖️', label: 'Metrônomo',             desc: 'Reloginho suíço! O pontuador mais regular rodada após rodada. Calculado pelo desvio padrão (variação em torno da média) dos pontos obtidos por jogo. Menor desvio padrão indica regularidade extrema (mínimo 10 jogos).', getScore: (r,c) => c.dps[r.participante.id] ?? Infinity,         higherIsWinner: false, isGoodCard: true,  format: v => 'σ ' + v.toFixed(2), filterFn: s => s !== Infinity },
  lanterninha:   { icon: '🕯️', label: 'Lanterninha',           desc: 'Farol de cauda! Quem está segurando a lanterna da Copa com o menor total de pontos acumulados na classificação geral. O importante é participar e torcer!', getScore: (r,c) => r.stats.total,                                    higherIsWinner: false, isGoodCard: false, format: v => v.toFixed(1) + ' pts' },
  campeao_avesso:{ icon: '🙃', label: 'Campeão do Avesso',   desc: 'Bem-vindo ao Mundo Invertido! Aqui a pontuação é recalculada como se os resultados oficiais fossem espelhados: o placar do mandante vira do visitante e vice-versa. Se o jogo terminou 1×0, conta como se tivesse sido 0×1. Quem seria o campeão se a Copa fosse de cabeça pra baixo?', getScore: (r,c) => c.demogorgonScores[r.participante.id] || 0, higherIsWinner: true, isGoodCard: true, format: v => v.toFixed(1) + ' pts' },
  gemeos:        { icon: '👯', label: 'Gêmeos',               desc: 'Quase telepatia! A dupla com os palpites mais parecidos da Copa inteira. Calculado comparando todos os pares possíveis de apostadores, somando a distância absoluta entre cada palpite (|golsA − golsB| para mandante e visitante) e dividindo pelo número de jogos em comum (mínimo 5 jogos apostados em comum). Parece que combinaram — mas juram que não.', getScore: (r,c) => c.gemeosPerPerson[r.participante.id] ?? Infinity, higherIsWinner: false, isGoodCard: true, format: v => 'dist. ' + v.toFixed(2), filterFn: s => s !== Infinity, customRender: (cache) => { const pairs = cache.gemeosPairs || []; if (!pairs.length) return null; let h = ''; pairs.forEach((p, i) => { const n1 = p.a1.apelido || p.a1.nome, n2 = p.a2.apelido || p.a2.nome; const bg = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)'; const posColor = i < 3 ? ['#fbbf24','#c0c0c0','#cd7f32'][i] : 'var(--texto2)'; h += '<tr style="background:' + bg + '"><td style="text-align:center;padding:7px 6px;font-weight:800;color:' + posColor + '">' + (i+1) + '</td><td style="padding:7px 6px;font-weight:600;color:#fff;font-size:.76rem">' + n1 + ' <span style="color:var(--texto2)">&</span> ' + n2 + '</td><td style="text-align:right;padding:7px 6px;font-weight:700;color:var(--verde-light);white-space:nowrap">dist. ' + p.dist.toFixed(2) + '</td><td style="text-align:right;padding:7px 6px;color:var(--texto2)">' + p.nComum + '</td></tr>'; }); return h; } },
  polos_opostos: { icon: '🧲', label: 'Polos Opostos',        desc: 'Nunca concordaram em nada! A dupla mais divergente da Copa inteira. Calculado da mesma forma que Gêmeos, mas buscando a maior distância média entre palpites ao invés da menor. Se um apostava em goleada, o outro chutava empate. Ou um estava certo… ou o outro (mínimo 5 jogos em comum).', getScore: (r,c) => c.polosPerPerson[r.participante.id] ?? -1, higherIsWinner: true, isGoodCard: true, format: v => 'dist. ' + v.toFixed(2), filterFn: s => s >= 0, customRender: (cache) => { const pairs = cache.polosPairs || []; if (!pairs.length) return null; let h = ''; pairs.forEach((p, i) => { const n1 = p.a1.apelido || p.a1.nome, n2 = p.a2.apelido || p.a2.nome; const bg = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)'; const posColor = i < 3 ? ['#fbbf24','#c0c0c0','#cd7f32'][i] : 'var(--texto2)'; h += '<tr style="background:' + bg + '"><td style="text-align:center;padding:7px 6px;font-weight:800;color:' + posColor + '">' + (i+1) + '</td><td style="padding:7px 6px;font-weight:600;color:#fff;font-size:.76rem">' + n1 + ' <span style="color:var(--texto2)">&</span> ' + n2 + '</td><td style="text-align:right;padding:7px 6px;font-weight:700;color:var(--verde-light);white-space:nowrap">dist. ' + p.dist.toFixed(2) + '</td><td style="text-align:right;padding:7px 6px;color:var(--texto2)">' + p.nComum + '</td></tr>'; }); return h; } },
  pes_barro:     { icon: '🗿', label: 'Pés de Barro',         desc: 'Gigante com os pés de barro! Quem mandou muito bem na fase de grupos mas desmoronou no mata-mata. Calculado comparando o aproveitamento percentual (pontos obtidos ÷ pontos máximos possíveis) de cada fase. A maior diferença positiva (grupos − eliminatórias) vence. Mínimo 4 jogos eliminatórios para garantir significância.', getScore: (r,c) => c.pesBarroScores[r.participante.id] ?? -Infinity, higherIsWinner: true, isGoodCard: false, format: v => (v * 100).toFixed(1) + '% queda', filterFn: s => s !== -Infinity && s > 0 },
  dragao_adormecido:{ icon: '🐉', label: 'Dragão Adormecido', desc: 'Estava hibernando nos grupos e acordou furioso no mata-mata! Oposto do Pés de Barro — quem melhorou o aproveitamento percentual na passagem da fase de grupos para as eliminatórias. A maior diferença positiva (eliminatórias − grupos) vence. Mínimo 4 jogos eliminatórios.', getScore: (r,c) => c.dragaoScores[r.participante.id] ?? -Infinity, higherIsWinner: true, isGoodCard: true, format: v => '+' + (v * 100).toFixed(1) + '%', filterFn: s => s !== -Infinity && s > 0 },
  bilhete_premiado:{ icon: '🍀', label: 'Bilhete Premiado',   desc: 'Loteria premiada! Cravou o placar exato de um jogo que o modelo Dixon-Coles considerava quase impossível. Calculado encontrando, dentre todos os acertos de placar exato do apostador, aquele cuja probabilidade estimada pelo modelo era a mais baixa. Quanto menor a probabilidade, mais impressionante o acerto.', getScore: (r,c) => c.loteriaScores[r.participante.id] || 0, higherIsWinner: true, isGoodCard: true, format: (v,r,c) => { const d = c.loteriaDetalhes[r.participante.id]; return d ? (d.prob * 100).toFixed(1) + '% (' + getSigla(d.hC) + ' ' + d.placar + ' ' + getSigla(d.aC) + ')' : '—'; }, filterFn: s => s > 0 },
  tecnico_selecao:{ icon: '🎙️', label: 'Técnico da Seleção',  desc: 'Escalou certo quando o Brasil entrou em campo! Soma dos pontos obtidos exclusivamente nos jogos em que a Seleção Brasileira participou. Quem mais acumulou pontos nas partidas do Brasil é o verdadeiro técnico de sofá deste bolão.', getScore: (r,c) => c.tecnicoScores[r.participante.id] || 0, higherIsWinner: true, isGoodCard: true, format: v => v.toFixed(1) + ' pts', filterFn: (s,r,c) => c.jogosBRA.length > 0 },
  matador_canarinho:{ icon: '🪓', label: 'Matador de Canarinho', desc: 'Carrasco verde e amarelo! Acumulou mais dano apostando contra o Brasil em todos os jogos do Brasil no cronograma. Cada palpite de derrota brasileira soma 3 pontos de dano, cada empate soma 2 pontos. Considera todos os jogos apostados, independente de já terem resultado oficial.', getScore: (r,c) => c.matadorScores[r.participante.id] || 0, higherIsWinner: true, isGoodCard: false, format: v => v + ' pts dano' },
  discreto:      { icon: '🥷', label: 'Discreto',              desc: 'Mestre da invisibilidade! Passou a Copa inteira no anonimato: nunca apareceu no Top 5 nem caiu para o Bottom 5 do ranking em nenhuma rodada. Entre os elegíveis, quem gravitou mais perto do centro exato da tabela vence. Calculado pela distância média da posição central ao longo de todos os snapshots (mínimo 15 jogos e 11 apostadores).', getScore: (r,c) => c.discretoScores[r.participante.id] ?? Infinity, higherIsWinner: false, isGoodCard: true, format: v => v.toFixed(2) + ' dist.', filterFn: s => s !== Infinity },
  faro_campeao:  { icon: '🏆', label: 'Faro de Campeão',      desc: 'Faro infalível! Quem mais pontuou com os palpites especiais de campeão, vice-campeão e terceiro colocado. Calculado somando os pontos de bônus obtidos por acertar as seleções finalistas do torneio. Cada acerto rende pontos configurados nas regras do bolão.', getScore: (r,c) => c.faroScores[r.participante.id] || 0, higherIsWinner: true, isGoodCard: true, format: v => v + ' pts', filterFn: s => s > 0 },
  diplomata:     { icon: '🤝', label: 'Diplomata',             desc: 'Mestre do equilíbrio! Quem mais vezes acertou que um jogo terminaria empatado quando de fato terminou em empate. Calculado contando quantas vezes o apostador palpitou empate (gols iguais) E o jogo real também terminou empatado. Só jogos já encerrados contam.', getScore: (r,c) => c.diplomataScores[r.participante.id] || 0, higherIsWinner: true, isGoodCard: true, format: v => v + ' empates', filterFn: (s,r,c) => c.jogosEmpate.length > 0 },
  gladiador:     { icon: '⚔️', label: 'Gladiador',             desc: 'Sangue de gladiador! Quem mais vezes acertou o lado vencedor em jogos que tiveram um vencedor definido (sem empate). Calculado contando os jogos onde o apostador palpitou vitória do mesmo lado que realmente venceu, excluindo jogos empatados.', getScore: (r,c) => c.gladiadorScores[r.participante.id] || 0, higherIsWinner: true, isGoodCard: true, format: v => v + ' acertos', filterFn: (s,r,c) => c.jogosSemEmpate.length > 0 },
  frangueiro:    { icon: '🐔', label: 'Frangueiro',            desc: 'Sempre longe da realidade! Quem teve a maior média de distância absoluta entre o saldo de gols apostado e o saldo real. Calculado por |(palpH − palpA) − (realH − realA)| a cada jogo, somado e dividido pelo total de jogos apostados (mínimo 10 jogos).', getScore: (r,c) => c.franqueiroScores[r.participante.id] ?? -1, higherIsWinner: true, isGoodCard: false, format: v => v.toFixed(2) + ' dist./jogo', filterFn: s => s >= 0 },
  pe_anjo:       { icon: '👼', label: 'Pé de Anjo',            desc: 'Toque divino nos palpites! Mesmo quando errou o placar, ficou colado no saldo real de gols. Calculado pela menor média de |(palpH − palpA) − (realH − realA)| por jogo. Precisão cirúrgica no feeling do resultado, mesmo sem cravar o placar exato (mínimo 10 jogos).', getScore: (r,c) => c.franqueiroScores[r.participante.id] ?? Infinity, higherIsWinner: false, isGoodCard: true, format: v => v.toFixed(2) + ' dist./jogo', filterFn: s => s !== Infinity }
};

// ══════════════════════════════════════════════════════════════════════════════
// Modal de Detalhes do Card
// ══════════════════════════════════════════════════════════════════════════════
window.abrirModalCard = function(key) {
  if (!key) return;
  const cfg = window.CARD_CONFIGS[key];
  const cache = window.STATS_CACHE;
  if (!cfg || !cache) return;

  const ov = document.getElementById('modal-stat');
  const box = document.getElementById('modal-stat-body');
  if (!ov || !box) return;

  // Swipe-down para fechar (mobile) — setup único
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
  let h = '<button class="modal-close" onclick="window.fecharModalStat()">✕</button>';
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
    h += '<th style="text-align:right;padding:8px 6px;border-bottom:1px solid var(--borda);color:var(--texto2);font-size:.65rem">Métrica</th>';
    h += '<th style="text-align:right;padding:8px 6px;border-bottom:1px solid var(--borda);color:var(--texto2);font-size:.65rem;width:50px">' + (cfg.customRender ? 'Jogos' : 'Pts') + '</th>';
    h += '</tr></thead><tbody>';

    let pos = 1;
    // Check if card has custom pair-based rendering (Gêmeos / Polos)
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
      h += 'Ordenado por distância média de palpites';
    } else {
      h += 'Desempate: ' + (cfg.isGoodCard ? 'mais pontos → melhor posição geral' : 'menos pontos → pior posição geral');
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