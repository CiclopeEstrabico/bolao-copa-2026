/** tab-estatisticas.js - Dashboard completo de estatísticas */
window.renderEstatisticas = function () {
  const el = document.getElementById("aba-estatisticas");
  if (!el) return;
  const res = getResultados();
  const apos = APP.apostadores || [];
  const pals = APP.palpites || {};
  const esp = APP.especiais || {};
  if (!apos.length) { el.innerHTML = '<div class="card"><p style="color:var(--texto2)">Nenhum apostador cadastrado.</p></div>'; return; }

  const ranking = gerarRanking(pals, res, apos, esp);
  const jogosFeitos = (window.SCHEDULE || [])
    .filter(j => res[j.id]?.homeGoals !== undefined)
    .sort((a, b) => new Date(a.utc) - new Date(b.utc));

  // Top performers
  const melhorPts = [...ranking].sort((a, b) => b.stats.total - a.stats.total)[0];
  const melhorRes = [...ranking].sort((a, b) => b.stats.acertos_resultado - a.stats.acertos_resultado)[0];
  const melhorExato = [...ranking].sort((a, b) => b.stats.acertos_placar_exato - a.stats.acertos_placar_exato)[0];

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
        if (!p) continue;
        const br = calcularPontosBrutos(p, r);
        if (br.acertou) zebraScores[a.id] = (zebraScores[a.id] || 0) + 1;
      }
    }
  }
  const melhorZebraId = Object.entries(zebraScores).sort((a, b) => b[1] - a[1])[0]?.[0];
  const melhorZebra = apos.find(a => a.id === melhorZebraId);
  const zebraCount = zebraScores[melhorZebraId] || 0;

  // --- Mestre dos Bônus ---
  const bonusRanking = ranking.map(r => {
    const s = r.stats;
    const cfg = window.CONFIG?.pontuacao || {};
    // Calculamos apenas os pontos vindos de bônus
    const ptsBonus = (s.acertos_placar_exato * (cfg.bonus_placar_exato_baixo || 3)) +
      (s.acertos_placar_alto * (cfg.bonus_placar_exato_alto || 5)) +
      (s.acertos_bonus1 * (cfg.bonus_1_gol_diferenca || 1));
    return { ...r, ptsBonus };
  }).sort((a, b) => b.ptsBonus - a.ptsBonus);
  const mestreBonus = bonusRanking[0];

  // --- Escalando (Últimos 5 jogos) ---
  const totalJogos = jogosFeitos.length;
  let escalandoApo = null, maiorSalto = -999;
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
      const posAtual = i + 1;
      const posAnt = rankingAnterior.findIndex(x => x.participante.id === aId) + 1;
      const salto = posAnt - posAtual;
      if (salto > maiorSalto) {
        maiorSalto = salto;
        escalandoApo = ranking[i].participante;
      }
    }
  }

  // --- Lanterninha ---
  const lanterninha = ranking[ranking.length - 1];

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
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 8px;
      }
    }
    .stat-d-card {
      background: var(--card2);
      border: 1px solid var(--borda);
      border-radius: var(--radius-sm);
      padding: 10px 4px;
      text-align: center;
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-height: 90px;
    }
    .stat-d-icon { font-size: 1.2rem; margin-bottom: 2px; }
    .stat-d-label { font-size: 0.58rem; color: var(--texto2); text-transform: uppercase; letter-spacing: 0.02em; margin-bottom: 2px; line-height: 1.1; }
    .stat-d-nome { font-size: 0.8rem; font-weight: 800; color: var(--cor-destaque); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 2px; }
    .stat-d-sub { font-size: 0.62rem; color: var(--texto2); margin-top: 2px; }
  </style>`;

  h += '<div class="stats-grid">';
  h += _dCard("🏆", "Líder", melhorPts?.participante.apelido || melhorPts?.participante.nome || "—", melhorPts?.stats.total.toFixed(1) + " pts", "var(--dourado)");
  h += _dCard("🔮", "Vidente", melhorRes?.participante.apelido || melhorRes?.participante.nome || "—", melhorRes?.stats.acertos_resultado + " acertos de resultados", "#86efac");
  h += _dCard("🎯", "Atirador de Elite", melhorExato?.participante.apelido || melhorExato?.participante.nome || "—", melhorExato?.stats.acertos_placar_exato + " acertos de placar", "var(--verde-ok)");
  h += _dCard("🦓", "Zebra de Ouro", melhorZebra?.apelido || melhorZebra?.nome || "—", zebraCount + " zebras domadas", "#fcd34d");

  h += _dCard("💎", "Mestre dos Bônus", mestreBonus?.participante.apelido || mestreBonus?.participante.nome || "—", mestreBonus?.ptsBonus + " pts extras", "#c084fc");
  h += _dCard("🧗", "Escalando", escalandoApo?.apelido || escalandoApo?.nome || "—", (maiorSalto > 0 ? "+" + maiorSalto : (maiorSalto === -999 ? "—" : maiorSalto)) + " posições", "#fb7185");
  h += _dCard("🕯️", "Lanterninha", lanterninha?.participante.apelido || lanterninha?.participante.nome || "—", lanterninha?.stats.total.toFixed(1) + " pts", "#94a3b8");
  h += _dCard("⚽", "Jogos Feitos", jogosFeitos.length + "/" + ((window.SCHEDULE || []).length), ((jogosFeitos.length / (window.SCHEDULE || [{ id: 1 }]).length * 100).toFixed(0) + "%"), "var(--texto2)");
  h += '</div>';

  // Jogo mais e menos acertado
  const jogoStats = jogosFeitos.map(jogo => {
    const r = res[jogo.id];
    let acertos = 0;
    for (const a of apos) {
      const p = pals[a.id]?.[jogo.id];
      if (!p || p.homeGoals === undefined) continue;
      const br = calcularPontosBrutos(p, r);
      if (br.acertou) acertos++;
    }
    return { jogo, acertos, pct: apos.length ? Math.round(acertos / apos.length * 100) : 0 };
  }).filter(x => x.acertos > 0).sort((a, b) => b.pct - a.pct);

  if (jogoStats.length) {
    h += '<div class="card"><div class="card-titulo">📊 Jogos por Acerto</div>';
    h += '<div style="display:grid;gap:6px">';
    const top3 = jogoStats.slice(0, 3);
    const bot3 = jogoStats.slice(-3).reverse();
    h += '<div style="font-size:.7rem;font-weight:700;color:var(--verde-ok);text-transform:uppercase;letter-spacing:.05em">Mais acertados</div>';
    for (const s of top3) {
      const b = APP.bracket?.[s.jogo.id] || {}; const hC = b.home || s.jogo.home; const aC = b.away || s.jogo.away;
      h += _jogoStatRow(hC, aC, res[s.jogo.id], s.acertos, apos.length, "var(--verde-ok)");
    }
    h += '<div style="font-size:.7rem;font-weight:700;color:#f87171;text-transform:uppercase;letter-spacing:.05em;margin-top:8px">Menos acertados (mais difíceis)</div>';
    for (const s of bot3) {
      const b = APP.bracket?.[s.jogo.id] || {}; const hC = b.home || s.jogo.home; const aC = b.away || s.jogo.away;
      h += _jogoStatRow(hC, aC, res[s.jogo.id], s.acertos, apos.length, "#f87171");
    }
    h += '</div></div>';
  }

  // Projeção campeão (% dos apostadores)
  const campVotos = {};
  for (const a of apos) {
    const c = esp[a.id]?.campeao || pals[a.id]?.campeao;
    if (!c) continue;
    campVotos[c] = (campVotos[c] || 0) + 1;
  }
  const sortedCamp = Object.entries(campVotos).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (sortedCamp.length) {
    h += '<div class="card"><div class="card-titulo">🏆 Favoritos dos Apostadores</div>';
    h += '<div style="display:grid;gap:6px">';
    const maxV = sortedCamp[0][1];
    for (const [code, ct] of sortedCamp) {
      const info = window.TEAMS_BY_CODE?.[code];
      const pct = apos.length ? Math.round(ct / apos.length * 100) : 0;
      const campeaoOficial = res["FNL"] && APP.bracket?.["FNL"]?.home === code;
      h += '<div style="display:flex;align-items:center;gap:8px;padding:5px 0">';
      h += htmlBandeira(code, 18) + '<span class="stat-time-nome" style="font-weight:600;flex:1">' + (info?.name || code) + '</span>';
      h += '<div style="width:80px;background:var(--fundo2);border-radius:3px;height:6px"><div style="width:' + (ct / maxV * 100) + '%;height:100%;background:var(--verde);border-radius:3px"></div></div>';
      h += '<span style="font-size:.72rem;color:var(--texto2);min-width:30px;text-align:right">' + ct + ' (' + pct + '%)</span>';
      if (campeaoOficial) h += '<span style="color:var(--dourado)">✓</span>';
      h += '</div>';
    }
    h += '</div></div>';
  }


  // Resumo Avançado de Todos os Jogos
  h += '<div class="card" style="padding:0;overflow:hidden"><div class="card-titulo" style="padding:16px 16px 0">📈 Estatísticas Avançadas por Jogo</div><div class="compilacao-wrap"><table class="compilacao-table stat-full-table" style="font-size:.7rem">';
  h += '<thead><tr>';
  h += '<th class="stat-col-jogo" style="text-align:left;position:sticky;left:0;background:var(--fundo2);z-index:2;box-shadow:2px 0 5px rgba(0,0,0,0.1)">Jogo</th>';
  h += '<th class="col-resultado">Resultado</th>';
  h += '<th>Apostas T1</th>';
  h += '<th>Apostas Emp</th>';
  h += '<th>Apostas T2</th>';
  h += '<th>Top Placar</th>';
  h += '<th>Acertos Res</th>';
  h += '<th>Acertos Plac</th>';
  h += '<th style="width:12px;background:var(--fundo);border-left:1px solid var(--borda);border-right:1px solid var(--borda)"></th>';
  h += '<th title="Elo T1">Elo T1</th>';
  h += '<th title="Elo T2">Elo T2</th>';
  h += '<th title="xGols T1">xGols T1</th>';
  h += '<th title="xGols T2">xGols T2</th>';
  h += '<th>Prob T1</th>';
  h += '<th>Prob E</th>';
  h += '<th>Prob T2</th>';
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
    const podeVer = (temRes && !jogoEhSimulado(jogo.id)) || (!temRes && !jogoAceita(jogo.id));

    const strPlacarMais = mChutado ? `${mChutado[0]} <span style="font-size:.65rem;color:var(--texto2)">(${((mChutado[1] / totalBets) * 100).toFixed(1)}%)</span>` : '—';

    // AI Prognosis
    let prog = null;
    if (window.PROGNOSE && typeof PROGNOSE.calcular === "function" && hC !== "TBD" && aC !== "TBD") {
      const isNeutral = !['USA', 'CAN', 'MEX'].includes(hC) && !['USA', 'CAN', 'MEX'].includes(aC);
      prog = PROGNOSE.calcular(hC, aC, isNeutral);
    }

    const rowBg = (r && r.homeGoals !== undefined) ? '' : ' opacity:0.65;';

    const isMobile = window.innerWidth <= 600;
    h += `<tr style="${rowBg}">`;
    h += `<td class="stat-col-jogo" style="text-align:left;position:sticky;left:0;background:var(--card2);padding:6px 8px;z-index:1;box-shadow:2px 0 5px rgba(0,0,0,0.1)">
            <div style="font-size:.6rem;color:var(--texto2);margin-bottom:3px">${formatarDataBRT(jogo.utc, false)}</div>
            <div style="display:flex;align-items:center;gap:4px;font-weight:700;width:100%">
              ${htmlBandeira(hC, 14)} <span class="stat-time-nome${isMobile ? ' stat-sigla' : ''}" title="${hName}">${isMobile ? getSigla(hC) : hName}</span> <span style="color:var(--texto2)">×</span> <span class="stat-time-nome${isMobile ? ' stat-sigla' : ''}" title="${aName}">${isMobile ? getSigla(aC) : aName}</span> ${htmlBandeira(aC, 14)}
            </div>
          </td>`;

    // Result column
    if (temRes) {
      let resHtml = `${r.homeGoals}x${r.awayGoals}`;
      if (r.foi_penaltis) {
        const ph = r.penaltis_home ?? 0; const pa = r.penaltis_away ?? 0;
        resHtml += `<div style="font-size:.58rem;color:var(--amber);margin-top:1px;font-weight:700">PEN ${ph}x${pa}</div>`;
      }
      h += `<td class="col-resultado" style="color:var(--verde-ok);font-weight:800;vertical-align:middle">${resHtml}</td>`;
    } else {
      h += `<td class="col-resultado" style="color:var(--texto2)">–</td>`;
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
  if (apos.length >= 2) {
    h += '<div class="card"><div class="card-titulo">⚔️ Head-to-Head</div>';
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">';
    h += '<select id="hth-a1" style="flex:1" onchange="renderHtH()"><option value="">Apostador 1</option>';
    for (const a of apos) h += '<option value="' + a.id + '">' + (a.apelido || a.nome || a.token) + '</option>';
    h += '</select><span style="align-self:center">vs</span>';
    h += '<select id="hth-a2" style="flex:1" onchange="renderHtH()"><option value="">Apostador 2</option>';
    for (const a of apos) h += '<option value="' + a.id + '">' + (a.apelido || a.nome || a.token) + '</option>';
    h += '</select></div>';
    h += '<div id="hth-resultado"></div></div>';
  }

  el.innerHTML = h;
};

window.renderHtH = function () {
  const id1 = document.getElementById("hth-a1")?.value;
  const id2 = document.getElementById("hth-a2")?.value;
  const out = document.getElementById("hth-resultado");
  if (!out) return;
  if (!id1 || !id2 || id1 === id2) { out.innerHTML = '<p style="color:var(--texto2);font-size:.78rem">Selecione dois apostadores diferentes.</p>'; return; }
  const res = getResultados();
  const pals = APP.palpites || {};
  const jogosFeitos = (window.SCHEDULE || []).filter(j => res[j.id]?.homeGoals !== undefined);
  let pts1 = 0, pts2 = 0, ganhou1 = 0, ganhou2 = 0, empHtH = 0;
  let rows = "";
  for (const jogo of jogosFeitos) {
    const r = res[jogo.id];
    const p1 = pals[id1]?.[jogo.id]; const p2 = pals[id2]?.[jogo.id];
    const br1 = p1?.homeGoals !== undefined ? calcularPontosBrutos(p1, r) : null;
    const br2 = p2?.homeGoals !== undefined ? calcularPontosBrutos(p2, r) : null;
    const v1 = br1 ? aplicarFator(br1.total_bruto, jogo.fase) : 0;
    const v2 = br2 ? aplicarFator(br2.total_bruto, jogo.fase) : 0;
    pts1 += v1; pts2 += v2;
    if (v1 > v2) ganhou1++; else if (v2 > v1) ganhou2++; else empHtH++;
    const b = APP.bracket?.[jogo.id] || {}; const hC = b.home || jogo.home; const aC = b.away || jogo.away;
    const cor1 = v1 > v2 ? "var(--verde-ok)" : v1 < v2 ? "#f87171" : "var(--texto2)";
    const cor2 = v2 > v1 ? "var(--verde-ok)" : v2 < v1 ? "#f87171" : "var(--texto2)";
    rows += '<tr><td class="stat-col-jogo" style="text-align:left;font-size:.73rem;position:sticky;left:0;background:var(--fundo);z-index:1;box-shadow:2px 0 5px rgba(0,0,0,0.1)">' +
      '<div style="display:flex;align-items:center;gap:4px;width:100%"><span class="stat-time-nome">' + getShortName(hC) + '</span> <span style="color:var(--texto2)">×</span> <span class="stat-time-nome">' + getShortName(aC) + '</span></div></td>' +
      '<td style="font-size:.72rem">' + r.homeGoals + '×' + r.awayGoals + '</td>' +
      '<td style="color:' + cor1 + ';font-weight:700">' + (p1 ? p1.homeGoals + '×' + p1.awayGoals + ' (' + v1 + 'pts)' : '—') + '</td>' +
      '<td style="color:' + cor2 + ';font-weight:700">' + (p2 ? p2.homeGoals + '×' + p2.awayGoals + ' (' + v2 + 'pts)' : '—') + '</td></tr>';
  }
  const a1 = APP.apostadores?.find(a => a.id === id1); const a2 = APP.apostadores?.find(a => a.id === id2);
  const n1 = a1?.apelido || a1?.nome || "A1"; const n2 = a2?.apelido || a2?.nome || "A2";
  const corTot1 = pts1 > pts2 ? "var(--verde-ok)" : "var(--texto2)"; const corTot2 = pts2 > pts1 ? "var(--verde-ok)" : "var(--texto2)";
  let h = '<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8px;text-align:center;margin-bottom:10px;align-items:center">';
  h += '<div style="font-size:1.1rem;font-weight:900;color:' + corTot1 + '">' + pts1.toFixed(1) + ' pts<div style="font-size:.72rem;color:var(--texto2)">' + n1 + '</div></div>';
  h += '<div style="font-size:.8rem;color:var(--texto2)">' + ganhou1 + '–' + empHtH + '–' + ganhou2 + '</div>';
  h += '<div style="font-size:1.1rem;font-weight:900;color:' + corTot2 + '">' + pts2.toFixed(1) + ' pts<div style="font-size:.72rem;color:var(--texto2)">' + n2 + '</div></div></div>';
  h += '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table class="compilacao-table" style="min-width:350px"><thead><tr><th class="stat-col-jogo" style="text-align:left;position:sticky;left:0;background:var(--card);z-index:1;box-shadow:2px 0 5px rgba(0,0,0,0.1)">Jogo</th><th>Resultado</th><th>' + n1 + '</th><th>' + n2 + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  out.innerHTML = h;
};

function _dCard(icon, label, nome, sub, cor) {
  return `<div class="stat-d-card">
    <div class="stat-d-icon">${icon}</div>
    <div class="stat-d-label">${label}</div>
    <div class="stat-d-nome" style="--cor-destaque: ${cor}">${nome}</div>
    <div class="stat-d-sub">${sub}</div>
  </div>`;
}

function _jogoStatRow(hC, aC, r, acertos, total, cor) {
  const pct = total ? Math.round(acertos / total * 100) : 0;
  return '<div style="display:flex;align-items:center;gap:8px;padding:5px 0">' +
    htmlBandeira(hC, 16) + ' <span class="stat-time-nome">' + getShortName(hC) + '</span>' +
    '<span style="font-size:.72rem;color:var(--texto2);font-weight:700">' + r.homeGoals + '×' + r.awayGoals + '</span>' +
    htmlBandeira(aC, 16) + ' <span class="stat-time-nome">' + getShortName(aC) + '</span>' +
    '<div style="flex:1;background:var(--fundo2);border-radius:3px;height:6px;margin:0 6px">' +
    '<div style="width:' + pct + '%;height:100%;background:' + cor + ';border-radius:3px"></div></div>' +
    '<span style="font-size:.7rem;color:' + cor + ';font-weight:700;min-width:40px;text-align:right">' + acertos + '/' + total + '</span></div>';
}