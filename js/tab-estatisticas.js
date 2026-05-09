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
  const jogosFeitos = (window.SCHEDULE || []).filter(j => res[j.id]?.homeGoals !== undefined);

  // Top performers
  const melhorPts = [...ranking].sort((a, b) => b.stats.total - a.stats.total)[0];
  const melhorExato = [...ranking].sort((a, b) => b.stats.acertos_placar_exato - a.stats.acertos_placar_exato)[0];
  const melhorAprov = [...ranking].sort((a, b) => b.stats.aproveitamento_pct - a.stats.aproveitamento_pct)[0];

  let h = "";

  // Cards de destaque
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:12px">';
  h += _dCard("🏆", "Líder", melhorPts?.participante.apelido || melhorPts?.participante.nome || "—", melhorPts?.stats.total.toFixed(1) + " pts", "var(--dourado)");
  h += _dCard("🎯", "Mais Placares Exatos", melhorExato?.participante.apelido || melhorExato?.participante.nome || "—", melhorExato?.stats.acertos_placar_exato + " exatos", "var(--verde-ok)");
  h += _dCard("📈", "Melhor Aproveitamento", melhorAprov?.participante.apelido || melhorAprov?.participante.nome || "—", melhorAprov?.stats.aproveitamento_pct + "%", "#86efac");
  h += _dCard("⚽", "Jogos Realizados", jogosFeitos.length + "/" + ((window.SCHEDULE || []).length), ((jogosFeitos.length / (window.SCHEDULE || [{ id: 1 }]).length * 100).toFixed(0) + "% da Copa"), "var(--texto2)");
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
  h += '<div class="card"><div class="card-titulo">📈 Estatísticas Avançadas por Jogo</div>';
  h += '<div class="compilacao-wrap"><table class="compilacao-table" style="min-width:1400px; font-size:.72rem">';
  h += '<thead><tr>';
  h += '<th class="stat-col-jogo" style="text-align:left;position:sticky;left:0;background:var(--fundo2);z-index:2;box-shadow:2px 0 5px rgba(0,0,0,0.1)">Jogo</th>';
  h += '<th class="col-resultado">Resultado</th>';
  h += '<th>Apostas Time 1</th>';
  h += '<th>Apostas Empate</th>';
  h += '<th>Apostas Time 2</th>';
  h += '<th>Placar Mais Chutado</th>';
  h += '<th>Acertos Result.</th>';
  h += '<th>Acertos Placar</th>';
  h += '<th style="width:20px;background:var(--fundo);border-left:1px solid var(--borda);border-right:1px solid var(--borda)"></th>';
  h += '<th title="Elo do Modelo">Elo T1</th>';
  h += '<th title="Elo do Modelo">Elo T2</th>';
  h += '<th title="Gols Esperados">xG T1</th>';
  h += '<th title="Gols Esperados">xG T2</th>';
  h += '<th>Prob T1</th>';
  h += '<th>Prob Emp</th>';
  h += '<th>Prob T2</th>';
  h += '</tr></thead><tbody>';

  const formatPct = (val, tot) => tot > 0 ? `<div style="font-size:.65rem;color:var(--texto2)">${((val / tot) * 100).toFixed(1)}%</div>` : '';
  const formatNumPct = (val, tot, color = "var(--texto)") => `<div style="color:${color};font-weight:700">${val}</div>` + formatPct(val, tot);

  for (const jogo of (window.SCHEDULE || [])) {
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
    const strPlacarMais = mChutado ? `${mChutado[0]} <span style="font-size:.65rem;color:var(--texto2)">(${((mChutado[1] / totalBets) * 100).toFixed(1)}%)</span>` : '—';

    // AI Prognosis
    let prog = null;
    if (window.PROGNOSE && typeof PROGNOSE.calcular === "function" && hC !== "TBD" && aC !== "TBD") {
      const isNeutral = !['USA', 'CAN', 'MEX'].includes(hC) && !['USA', 'CAN', 'MEX'].includes(aC);
      prog = PROGNOSE.calcular(hC, aC, isNeutral);
    }

    const rowBg = (r && r.homeGoals !== undefined) ? '' : ' opacity:0.65;';

    h += `<tr style="${rowBg}">`;
    h += `<td class="stat-col-jogo" style="text-align:left;position:sticky;left:0;background:var(--card2);padding:6px 8px;z-index:1;box-shadow:2px 0 5px rgba(0,0,0,0.1)">
            <div style="font-size:.6rem;color:var(--texto2);margin-bottom:3px">${formatarDataBRT(jogo.utc, false)}</div>
            <div style="display:flex;align-items:center;gap:4px;font-weight:700;width:100%">
              ${htmlBandeira(hC,14)} <span class="stat-time-nome">${hName}</span> <span style="color:var(--texto2)">×</span> <span class="stat-time-nome">${aName}</span> ${htmlBandeira(aC,14)}
            </div>
          </td>`;

    // New Result column
    if (r && r.homeGoals !== undefined) {
      let resHtml = `${r.homeGoals}x${r.awayGoals}`;
      if (r.foi_penaltis) {
        const ph = r.penaltis_home ?? 0; const pa = r.penaltis_away ?? 0;
        resHtml += `<div style="font-size:.58rem;color:var(--amber);margin-top:1px;font-weight:700">PEN ${ph}x${pa}</div>`;
      }
      h += `<td class="col-resultado" style="color:var(--verde-ok);font-weight:800;vertical-align:middle">${resHtml}</td>`;
    } else {
      h += `<td class="col-resultado" style="color:var(--texto2)">–</td>`;
    }

    h += `<td>${formatNumPct(vH, totalBets)}</td>`;
    h += `<td>${formatNumPct(vD, totalBets)}</td>`;
    h += `<td>${formatNumPct(vA, totalBets)}</td>`;
    h += `<td><strong style="color:var(--verde-light)">${strPlacarMais}</strong></td>`;
    h += `<td>${r ? formatNumPct(aRes, totalBets, 'var(--verde-ok)') : '—'}</td>`;
    h += `<td>${r ? formatNumPct(aPlac, totalBets, '#86efac') : '—'}</td>`;

    h += `<td style="background:var(--fundo);border-left:1px solid var(--borda);border-right:1px solid var(--borda)"></td>`; // gap

    if (prog) {
      h += `<td><span style="color:var(--texto2)">${Math.round(prog.eloH)}</span></td>`;
      h += `<td><span style="color:var(--texto2)">${Math.round(prog.eloA)}</span></td>`;
      h += `<td><strong style="color:var(--texto)">${prog.lH.toFixed(2)}</strong></td>`;
      h += `<td><strong style="color:var(--texto)">${prog.lA.toFixed(2)}</strong></td>`;
      h += `<td><div style="color:var(--verde-light);font-weight:700">${(prog.home * 100).toFixed(1)}%</div></td>`;
      h += `<td><div style="color:var(--texto2);font-weight:700">${(prog.draw * 100).toFixed(1)}%</div></td>`;
      h += `<td><div style="color:var(--verde-light);font-weight:700">${(prog.away * 100).toFixed(1)}%</div></td>`;
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
    rows += '<tr><td class="stat-col-jogo" style="text-align:left;font-size:.73rem;position:sticky;left:0;background:var(--fundo);z-index:1;box-shadow:2px 0 5px rgba(0,0,0,0.1)">'+
      '<div style="display:flex;align-items:center;gap:4px;width:100%"><span class="stat-time-nome">'+getShortName(hC)+'</span> <span style="color:var(--texto2)">×</span> <span class="stat-time-nome">'+getShortName(aC)+'</span></div></td>'+
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
  return '<div style="background:var(--card2);border:1px solid var(--borda);border-radius:var(--radius-sm);padding:12px;text-align:center">' +
    '<div style="font-size:1.4rem">' + icon + '</div>' +
    '<div style="font-size:.65rem;color:var(--texto2);text-transform:uppercase;letter-spacing:.04em;margin:4px 0 2px">' + label + '</div>' +
    '<div style="font-size:.88rem;font-weight:800;color:' + cor + '">' + nome + '</div>' +
    '<div style="font-size:.7rem;color:var(--texto2);margin-top:2px">' + sub + '</div></div>';
}

function _jogoStatRow(hC, aC, r, acertos, total, cor) {
  const pct = total ? Math.round(acertos / total * 100) : 0;
  return '<div style="display:flex;align-items:center;gap:8px;padding:5px 0">'+
    htmlBandeira(hC,16)+' <span class="stat-time-nome">'+getShortName(hC)+'</span>'+
    '<span style="font-size:.72rem;color:var(--texto2);font-weight:700">'+r.homeGoals+'×'+r.awayGoals+'</span>'+
    htmlBandeira(aC,16)+' <span class="stat-time-nome">'+getShortName(aC)+'</span>'+
    '<div style="flex:1;background:var(--fundo2);border-radius:3px;height:6px;margin:0 6px">' +
    '<div style="width:' + pct + '%;height:100%;background:' + cor + ';border-radius:3px"></div></div>' +
    '<span style="font-size:.7rem;color:' + cor + ';font-weight:700;min-width:40px;text-align:right">' + acertos + '/' + total + '</span></div>';
}