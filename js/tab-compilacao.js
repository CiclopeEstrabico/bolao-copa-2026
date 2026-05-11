/** tab-compilacao.js - Heatmap de palpites */
window.renderCompilacao = function () {
  const el = document.getElementById("aba-compilacao");
  if (!el) return;
  const res = getResultados();
  const apos = APP.apostadores || [];
  const pals = APP.palpites || {};
  if (!apos.length) { el.innerHTML = '<div class="card"><p style="color:var(--texto2)">Nenhum apostador cadastrado.</p></div>'; return; }

  // Filtros de fase
  const fases = ["todos", "grupos", "32avos", "oitavas", "quartas", "semis", "terceiro", "final"];
  const faseAtiva = window._compFase || "grupos";
  const nomesFase = { todos: "Todos", grupos: "Grupos", "32avos": "32 Avos", oitavas: "Oitavas", quartas: "Quartas", semis: "Semis", terceiro: "3o Lugar", final: "Final" };

  let h = '<div class="toggle-bar" style="margin-bottom:15px">';
  h += '<span class="toggle-label">Fase:</span>';
  for (const f of fases) {
    h += '<button class="btn-toggle' + (faseAtiva === f ? " ativo" : "") + '" onclick="window._compFase=\'' + f + '\';renderAbaAtiva()">' + nomesFase[f] + '</button>';
  }

  h += '<div class="toggle-sep"></div>';

  const ordemStr = window._compOrdem || "pts";
  h += '<span class="toggle-label">Ordenar por:</span>';
  h += '<button class="btn-toggle' + (ordemStr === "alfa" ? " ativo" : "") + '" onclick="window._compOrdem=\'alfa\';renderAbaAtiva()">A-Z</button>';
  h += '<button class="btn-toggle' + (ordemStr === "pts" ? " ativo" : "") + '" onclick="window._compOrdem=\'pts\';renderAbaAtiva()">Pontos</button>';
  h += '<button class="btn-toggle' + (ordemStr === "res" ? " ativo" : "") + '" onclick="window._compOrdem=\'res\';renderAbaAtiva()">Resultados</button>';
  h += '<button class="btn-toggle' + (ordemStr === "placar" ? " ativo" : "") + '" onclick="window._compOrdem=\'placar\';renderAbaAtiva()">Placar</button>';
  h += '</div>';

  const jogos = (window.SCHEDULE || []).filter(j => faseAtiva === "todos" || j.fase === faseAtiva)
    .sort((a, b) => new Date(a.utc) - new Date(b.utc));
  if (!jogos.length) { el.innerHTML = h + '<div class="card"><p style="color:var(--texto2)">Sem jogos nesta fase.</p></div>'; return; }

  // Ranking lateral: ordenar apostadores
  const ranking = apos.map(a => {
    const st = calcularPontosApostador(pals[a.id] || {}, res, a, {});
    return { ...a, pts: st.total, placar: st.acertos_placar_exato, res: st.acertos_resultado };
  }).sort((a, b) => {
    if (ordemStr === "alfa") return (a.apelido || a.nome || "").localeCompare(b.apelido || b.nome || "");
    if (ordemStr === "res") return b.res - a.res;
    if (ordemStr === "placar") return b.placar - a.placar;
    return b.pts - a.pts; // Default pts
  });

  h += '<div class="compilacao-wrap"><table class="compilacao-table"><thead><tr>';
  h += '<th class="col-jogo" style="position:sticky;left:0;background:var(--fundo2);z-index:2;box-shadow:2px 0 5px rgba(0,0,0,0.1)">Jogo</th>';
  h += '<th class="col-resultado" style="z-index:1">Resultado</th>';
  for (const a of ranking) h += '<th title="' + a.nome + '" style="z-index:1;max-width:50px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:4px 2px">' + (a.apelido || a.nome || "?") + '</th>';
  h += '</tr></thead><tbody>';

  for (const jogo of jogos) {
    const r = res[jogo.id];
    const temRes = r && r.homeGoals !== undefined;
    const b = APP.bracket?.[jogo.id] || {};
    const hC = b.home || jogo.home; const aC = b.away || jogo.away;
    const hN = getShortName(hC);
    const aN = getShortName(aC);
    const isMobile = window.innerWidth <= 600;
    const hDisplay = isMobile ? getSigla(hC) : hN;
    const aDisplay = isMobile ? getSigla(aC) : aN;
    const dataHora = formatarDataBRT(jogo.utc, false);
    h += '<tr><td class="col-jogo" style="position:sticky;left:0;background:var(--card2);padding:6px 8px;z-index:1;box-shadow:2px 0 5px rgba(0,0,0,0.1)">';
    h += '<div style="font-size:.6rem;color:var(--texto2);margin-bottom:3px">' + dataHora + '</div>';
    h += '<div style="display:flex;align-items:center;gap:4px;font-weight:700;width:100%">' + htmlBandeira(hC, 14) + ' <span class="compilacao-time-nome' + (isMobile ? ' comp-sigla' : '') + '" title="' + hN + '">' + hDisplay + '</span> <span style="color:var(--texto2)">×</span> <span class="compilacao-time-nome' + (isMobile ? ' comp-sigla' : '') + '" title="' + aN + '">' + aDisplay + '</span> ' + htmlBandeira(aC, 14) + '</div></td>';
    // Resultado oficial
    if (temRes) {
      let resHtml = r.homeGoals + 'x' + r.awayGoals;
      if (r.foi_penaltis) {
        const ph = r.penaltis_home ?? 0; const pa = r.penaltis_away ?? 0;
        resHtml += '<div style="font-size:.58rem;color:var(--amber);margin-top:1px;font-weight:700">PEN ' + ph + 'x' + pa + '</div>';
      }
      h += '<td class="col-resultado" style="color:var(--verde-ok);vertical-align:middle">' + resHtml + '</td>';
    } else {
      h += '<td class="col-resultado" style="color:var(--texto2)">–</td>';
    }
    // Palpites de cada apostador
    for (const a of ranking) {
      const p = pals[a.id]?.[jogo.id];
      if (!p || p.homeGoals === undefined) { h += '<td class="celula-sem">·</td>'; continue; }
      
      // REGRA DE VISIBILIDADE: só mostra se tem resultado OU se a fase está travada (não aceita mais apostas)
      const apostasAbertas = jogoAceita(jogo.id);
      const podeVer = (temRes && !jogoEhSimulado(jogo.id)) || (!temRes && !apostasAbertas);
      
      if (!podeVer) {
        h += '<td class="celula-futuro" style="color:var(--texto2);opacity:0.3" title="Palpite oculto até o fechamento das apostas">🔒</td>';
        continue;
      }

      if (!temRes) { h += '<td class="celula-futuro">' + p.homeGoals + 'x' + p.awayGoals + '</td>'; continue; }
      const br = calcularPontosBrutos(p, r);
      const pts = aplicarFator(br.total_bruto, jogo.fase);
      let cls = "celula-erro";
      if (br.acertou) {
        const b = br.total_bruto;
        if (b >= 8) cls = "celula-pts-8";
        else if (b >= 6) cls = "celula-pts-6"; // Para o Placar Baixo (6 pts)
        else if (b >= 4) cls = "celula-pts-4";
        else cls = "celula-pts-3";
      }
      h += '<td class="' + cls + '" title="' + pts + 'pts">' + p.homeGoals + 'x' + p.awayGoals + '</td>';
    }
    h += '</tr>';
  }

  // --- Linhas de Especiais (Campeão, Vice, 3º) ---
  const brk = APP.bracket || {};
  const resOficialEsp = {
    campeao: brk.campeao || "",
    vice: brk.vice || "",
    terceiro: brk.terceiro || ""
  };

  const rowsEsp = [
    { label: "🏆 Campeão", key: "campeao" },
    { label: "🥈 Vice", key: "vice" },
    { label: "🥉 3º Lugar", key: "terceiro" }
  ];

  for (const rowE of rowsEsp) {
    h += '<tr style="background:rgba(234,179,8,0.05)"><td class="col-jogo" style="position:sticky;left:0;background:var(--card2);z-index:1;font-weight:700;font-size:.68rem">' + rowE.label + '</td>';
    
    // Resultado Oficial do Especial
    const escOf = resOficialEsp[rowE.key];
    const nomeOf = window.TEAMS_BY_CODE[escOf]?.name || "—";
    h += '<td class="col-resultado" style="font-weight:700;font-size:.65rem;color:var(--dourado)">' + nomeOf + '</td>';

    for (const a of ranking) {
      const palE = (a.especiais && a.especiais[rowE.key]) || "";
      const nomePal = window.TEAMS_BY_CODE[palE]?.name || "—";
      const acertou = escOf && palE === escOf;
      const cor = acertou ? "var(--verde-ok)" : (escOf ? "var(--texto2)" : "var(--texto)");
      h += '<td style="font-size:.62rem;text-align:center;color:' + cor + ';font-weight:' + (acertou ? 700 : 400) + '">' + nomePal + '</td>';
    }
    h += '</tr>';
  }

  // Estatisticas de Aproveitamento (Linhas Finais)
  let maxPtsGeral = 0;
  let jogosRealizados = 0;
  for (const jogo of (window.SCHEDULE || [])) {
    const r = res[jogo.id];
    if (r && r.homeGoals !== undefined) {
      jogosRealizados++;
      let maxBruto = window.CONFIG?.pontuacao?.resultado_base || 3;
      if (!r.foi_penaltis) {
        const tGols = Number(r.homeGoals) + Number(r.awayGoals);
        const cfg = window.CONFIG.pontuacao;
        const limiar = cfg.limiar_placar_alto || 4;
        const bonus = tGols >= limiar ? (cfg.bonus_placar_exato_alto || 5) : (cfg.bonus_placar_exato_baixo || 3);
        maxBruto += bonus;
      }
      maxPtsGeral += aplicarFator(maxBruto, jogo.fase);
    }
  }

  const lbls = [
    { title: "Qtd. de Acertos (Resultado)", val: a => a.res, cor: "var(--texto)" },
    { title: "Qtd. de Placar Exato", val: a => a.placar, cor: "var(--texto)" },
    { title: "% Resultado Correto", val: a => jogosRealizados ? ((a.res / jogosRealizados) * 100).toFixed(1) + "%" : "0.0%", cor: "var(--texto2)" },
    { title: "% Placar Exato", val: a => jogosRealizados ? ((a.placar / jogosRealizados) * 100).toFixed(1) + "%" : "0.0%", cor: "var(--texto2)" },
    { title: "Pontos Totais Alcançados", val: a => a.pts.toFixed(1), cor: "var(--dourado)" },
    { title: "% dos Pontos Possíveis", val: a => maxPtsGeral ? ((a.pts / maxPtsGeral) * 100).toFixed(1) + "%" : "0.0%", cor: "var(--dourado)" }
  ];

  for (const L of lbls) {
    h += '<tr><td class="col-jogo" style="position:sticky;left:0;background:var(--fundo2);font-weight:700;font-size:.7rem;border-top:1px solid var(--borda)">' + L.title + '</td>';
    h += '<td class="col-resultado" style="background:var(--fundo2);border-top:1px solid var(--borda)"></td>';
    for (const a of ranking) {
      h += '<td style="font-weight:800;color:' + L.cor + ';font-size:.75rem;background:var(--fundo2);border-top:1px solid var(--borda)">' + L.val(a) + '</td>';
    }
    h += '</tr>';
  }
  h += '</tbody></table></div>';

  h += '<div style="display:flex;justify-content:center;gap:12px;margin-top:20px;margin-bottom:10px">';
  h += '<button class="btn btn-secundario" onclick="exportarCompilacaoCsv()">📊 Exportar CSV</button>';
  h += '<button class="btn btn-secundario" onclick="exportarCompilacaoJson()">📥 Exportar JSON</button>';
  h += '</div>';

  el.innerHTML = h;
};

window.exportarCompilacaoJson = function () {
  const res = getResultados();
  const apos = APP.apostadores || [];
  const pals = APP.palpites || {};

  const ranking = apos.map(a => {
    const st = window.calcularPontosApostador(pals[a.id] || {}, res, a, {});
    
    // Filtra palpites para não vazar no JSON se a fase ainda estiver aberta e sem resultado
    const palpitesFiltrados = {};
    const meusPals = pals[a.id] || {};
    for (const jId of Object.keys(meusPals)) {
      const temRes = res[jId] && res[jId].homeGoals !== undefined;
      if (temRes || !jogoAceita(jId)) {
        palpitesFiltrados[jId] = meusPals[jId];
      }
    }

    return {
      id: a.id,
      nome: a.nome,
      apelido: a.apelido,
      pts: st.total,
      placar_exato: st.acertos_placar_exato,
      resultado_correto: st.acertos_resultado,
      palpites: palpitesFiltrados,
      especiais: a.especiais || {}
    };
  }).sort((a, b) => b.pts - a.pts);

  const brk = APP.bracket || {};
  const exportData = {
    timestamp: new Date().toISOString(),
    status_apostas: APP.configStatus?.apostas_liberadas ? "LIBERADAS" : "TRAVADAS",
    resultados_oficiais: res,
    especiais_oficiais: {
      campeao: brk.campeao || "",
      vice: brk.vice || "",
      terceiro: brk.terceiro || ""
    },
    ranking_e_palpites: ranking
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
  const el = document.createElement('a');
  el.setAttribute("href", dataStr);
  el.setAttribute("download", "bolao_copa_export_" + new Date().toISOString().replace(/[:.]/g, "-") + ".json");
  document.body.appendChild(el);
  el.click();
  el.remove();
};

window.exportarCompilacaoCsv = function () {
  const res = getResultados();
  const apos = APP.apostadores || [];
  const pals = APP.palpites || {};
  const jogos = window.SCHEDULE || [];

  if (!apos.length || !jogos.length) return;

  const ranking = apos.map(a => {
    const st = window.calcularPontosApostador(pals[a.id] || {}, res, a, {});
    return { ...a, pts: st.total };
  }).sort((a, b) => b.pts - a.pts);

  let csvContent = "\uFEFF"; // BOM para forçar UTF-8 no Excel

  const headers = ["ID Jogo", "Fase", "Data", "Mandante", "Visitante", "Resultado Oficial"];
  for (const a of ranking) {
    headers.push(`"${a.nome} (${a.apelido || ''})"`);
  }
  csvContent += headers.join(";") + "\r\n";

  for (const jogo of jogos) {
    const r = res[jogo.id];
    const temRes = r && r.homeGoals !== undefined;

    const hN = window.TEAMS_BY_CODE[jogo.home]?.name || jogo.home;
    const aN = window.TEAMS_BY_CODE[jogo.away]?.name || jogo.away;
    const dataHora = window.formatarDataBRT ? window.formatarDataBRT(jogo.utc, false) : jogo.utc;

    let resOficial = "";
    if (temRes) {
      resOficial = `${r.homeGoals}x${r.awayGoals}`;
      if (r.foi_penaltis) resOficial += " (PEN)";
    }

    const row = [
      jogo.id,
      jogo.fase,
      `"${dataHora}"`,
      `"${hN}"`,
      `"${aN}"`,
      `"${resOficial}"`
    ];

    for (const a of ranking) {
      const p = pals[a.id]?.[jogo.id];
      if (p && p.homeGoals !== undefined) {
        // Regra de visibilidade no CSV
        const podeVer = temRes || !jogoAceita(jogo.id);
        row.push(podeVer ? `${p.homeGoals}x${p.awayGoals}` : "🔒");
      } else {
        row.push("");
      }
    }

    csvContent += row.join(";") + "\r\n";
  }

  // --- Linhas de Especiais no CSV ---
  const brk = APP.bracket || {};
  const espOf = { campeao: brk.campeao, vice: brk.vice, terceiro: brk.terceiro };
  const labelsEsp = { campeao: "🏆 Campeão", vice: "🥈 Vice", terceiro: "🥉 3º Lugar" };

  for (const key of ["campeao", "vice", "terceiro"]) {
    const nomeOf = window.TEAMS_BY_CODE[espOf[key]]?.name || "";
    const row = [ "ESP", "especial", "", `"${labelsEsp[key]}"`, "", `"${nomeOf}"` ];
    for (const a of ranking) {
      const palE = (a.especiais && a.especiais[key]) || "";
      const nomePal = window.TEAMS_BY_CODE[palE]?.name || "";
      // Visibilidade: se tem resultado oficial OU se as apostas finais travaram
      const podeVer = espOf[key] || !jogoAceita("final");
      row.push(podeVer ? `"${nomePal}"` : "🔒");
    }
    csvContent += row.join(";") + "\r\n";
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const el = document.createElement('a');
  el.setAttribute("href", url);
  el.setAttribute("download", "bolao_copa_export_" + new Date().toISOString().replace(/[:.]/g, "-") + ".csv");
  document.body.appendChild(el);
  el.click();
  el.remove();
  URL.revokeObjectURL(url);
};