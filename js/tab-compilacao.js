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
  // Passa especiais oficiais para que pontos totais incluam campeão/vice/3º
  const espOficiaisComp = window.BRACKET.extrairEspeciaisOficiais(res, APP.bracket || {});
  const ranking = apos.map(a => {
    const st = calcularPontosApostador(pals[a.id] || {}, res, a, espOficiaisComp);
    return {
      ...a,
      pts:    st.total,
      // placar: soma placares exatos baixos + altos para sort consistente com classificação
      placar: st.acertos_placar_exato + st.acertos_placar_alto,
      res:    st.acertos_resultado,
      jogos_com_palpite: st.jogos_com_palpite,
    };
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
  // Derivados automaticamente do bracket (igual à aba Classificação)
  const brk = APP.bracket || {};
  const resOficialEsp = window.BRACKET.extrairEspeciaisOficiais(res, brk);

  const rowsEsp = [
    { label: "🏆 Campeão", key: "campeao" },
    { label: "🥈 Vice",    key: "vice" },
    { label: "🥉 3º Lugar", key: "terceiro" }
  ];

  for (const rowE of rowsEsp) {
    h += '<tr style="background:rgba(234,179,8,0.05)"><td class="col-jogo" style="position:sticky;left:0;background:var(--card2);z-index:1;font-weight:700;font-size:.68rem">' + rowE.label + '</td>';

    // Resultado oficial derivado automaticamente
    const escOf = resOficialEsp[rowE.key] || "";
    const nomeOf = window.TEAMS_BY_CODE?.[escOf]?.name || (escOf ? escOf : "—");
    h += '<td class="col-resultado" style="font-weight:700;font-size:.65rem;color:var(--dourado)">' + nomeOf + '</td>';

    for (const a of ranking) {
      const palE = (a.especiais && a.especiais[rowE.key]) || "";
      const nomePal = window.TEAMS_BY_CODE?.[palE]?.name || (palE ? palE : "—");
      const acertou = escOf && palE === escOf;
      // Acerto: azul escuro (mesma cor do placar+5). Erro com resultado definido: texto esmaecido.
      if (acertou) {
        h += '<td class="celula-pts-8" style="font-size:.62rem">' + nomePal + '</td>';
      } else {
        const cor = escOf ? "var(--texto2)" : "var(--texto)";
        h += '<td style="font-size:.62rem;text-align:center;color:' + cor + '">' + nomePal + '</td>';
      }
    }
    h += '</tr>';
  }

  // Estatisticas de Aproveitamento (Linhas Finais)
  // maxPtsGeral: mesmo critério de scoring.js — base(3) + bonus_alto(5) × fator,
  // para todos os jogos já realizados. Consistente com calcularMaxPontosPossiveis.
  const maxPtsGeral = calcularMaxPontosPossiveis(res);

  const lbls = [
    { title: "Qtd. de Acertos (Resultado)", val: a => a.res,    cor: "var(--texto)" },
    { title: "Qtd. de Placar Exato",        val: a => a.placar, cor: "var(--texto)" },
    // % usa jogos_com_palpite por apostador como denominador (exclui jogos sem palpite)
    { title: "% Resultado Correto", val: a => a.jogos_com_palpite ? ((a.res    / a.jogos_com_palpite) * 100).toFixed(1) + "%" : "0.0%", cor: "var(--texto2)" },
    { title: "% Placar Exato",      val: a => a.jogos_com_palpite ? ((a.placar / a.jogos_com_palpite) * 100).toFixed(1) + "%" : "0.0%", cor: "var(--texto2)" },
    { title: "Pontos Totais Alcançados", val: a => a.pts.toFixed(1), cor: "var(--dourado)" },
    { title: "% dos Pontos Possíveis",  val: a => maxPtsGeral ? ((a.pts / maxPtsGeral) * 100).toFixed(1) + "%" : "0.0%", cor: "var(--dourado)" }
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
  // ① Bloqueia exportação em modo simulação
  if (APP.modoSimulacao) {
    alert('⚠️ Você está em modo de simulação. Saia da simulação antes de exportar para não misturar dados simulados com resultados reais.');
    return;
  }

  const res = getResultados();
  const apos = APP.apostadores || [];
  const pals = APP.palpites || {};
  const brk = APP.bracket || {};

  // ② Jogos em ordem cronológica
  const jogosOrdenados = (window.SCHEDULE || []).sort((a, b) => new Date(a.utc) - new Date(b.utc));

  const espOficiaisExp = window.BRACKET.extrairEspeciaisOficiais(res, brk);

  const ranking = apos.map(a => {
    const st = window.calcularPontosApostador(pals[a.id] || {}, res, a, espOficiaisExp);
    // Filtra palpites para não vazar no JSON se a fase ainda estiver aberta e sem resultado
    const palpitesFiltrados = {};
    const meusPals = pals[a.id] || {};
    for (const jId of Object.keys(meusPals)) {
      const temRes = res[jId] && res[jId].homeGoals !== undefined;
      if (temRes || !jogoAceita(jId)) {
        const p = meusPals[jId];
        // Strip token and other internal fields
        palpitesFiltrados[jId] = {
          homeGoals: p.homeGoals,
          awayGoals: p.awayGoals
        };
      }
    }

    // ③ Não exportar o token do apostador
    const esp = a.especiais || {};
    return {
      id: a.id,
      nome: a.nome,
      apelido: a.apelido,
      pts: st.total,
      placar_exato: st.acertos_placar_exato,
      resultado_correto: st.acertos_resultado,
      palpites: palpitesFiltrados,
      especiais: {
        campeao: esp.campeao || "",
        vice: esp.vice || "",
        terceiro: esp.terceiro || ""
      }
    };
  }).sort((a, b) => b.pts - a.pts);

  // ④ Resultados com nomes reais dos times (resolvidos via bracket)
  const resultadosExport = {};
  for (const jogo of jogosOrdenados) {
    const r = res[jogo.id];
    if (!r || r.homeGoals === undefined) continue;
    const hC = brk[jogo.id]?.home || jogo.home;
    const aC = brk[jogo.id]?.away || jogo.away;
    resultadosExport[jogo.id] = {
      ...r,
      home: window.TEAMS_BY_CODE?.[hC]?.name || hC,
      away: window.TEAMS_BY_CODE?.[aC]?.name || aC,
    };
  }

  // ⑤ Resultado oficial dos especiais derivado automaticamente do bracket
  const exportData = {
    timestamp: new Date().toISOString(),
    status_apostas: APP.configStatus?.apostas_liberadas ? "LIBERADAS" : "TRAVADAS",
    resultados_oficiais: resultadosExport,
    especiais_oficiais: {
      campeao:  espOficiaisExp.campeao  ? (window.TEAMS_BY_CODE?.[espOficiaisExp.campeao]?.name  || espOficiaisExp.campeao)  : "",
      vice:     espOficiaisExp.vice     ? (window.TEAMS_BY_CODE?.[espOficiaisExp.vice]?.name     || espOficiaisExp.vice)     : "",
      terceiro: espOficiaisExp.terceiro ? (window.TEAMS_BY_CODE?.[espOficiaisExp.terceiro]?.name || espOficiaisExp.terceiro) : ""
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
  // ① Bloqueia exportação em modo simulação
  if (APP.modoSimulacao) {
    alert('⚠️ Você está em modo de simulação. Saia da simulação antes de exportar para não misturar dados simulados com resultados reais.');
    return;
  }

  const res = getResultados();
  const apos = APP.apostadores || [];
  const pals = APP.palpites || {};
  const brk = APP.bracket || {};

  // ② Ordem cronológica
  const jogos = (window.SCHEDULE || []).slice().sort((a, b) => new Date(a.utc) - new Date(b.utc));

  if (!apos.length || !jogos.length) return;

  const espOficiaisCsv = window.BRACKET.extrairEspeciaisOficiais(res, brk);

  const ranking = apos.map(a => {
    const st = window.calcularPontosApostador(pals[a.id] || {}, res, a, espOficiaisCsv);
    const esp = a.especiais || {};
    return {
      id: a.id, nome: a.nome, apelido: a.apelido, pts: st.total,
      especiais: { campeao: esp.campeao || "", vice: esp.vice || "", terceiro: esp.terceiro || "" }
    };
  }).sort((a, b) => b.pts - a.pts);

  let csvContent = "\uFEFF"; // BOM para forçar UTF-8 no Excel

  // ③ Sem token na lista de cabeçalho
  const headers = ["ID Jogo", "Fase", "Data", "Mandante", "Visitante", "Resultado Oficial"];
  for (const a of ranking) {
    headers.push(`"${a.nome} (${a.apelido || ''})"`);
  }
  csvContent += headers.join(";") + "\r\n";

  for (const jogo of jogos) {
    const r = res[jogo.id];
    const temRes = r && r.homeGoals !== undefined;

    // ④ Nomes reais dos times — resolve via bracket (cobre fases eliminatórias)
    const hC = brk[jogo.id]?.home || jogo.home;
    const aC = brk[jogo.id]?.away || jogo.away;
    const hN = window.TEAMS_BY_CODE?.[hC]?.name || hC;
    const aN = window.TEAMS_BY_CODE?.[aC]?.name || aC;
    const dataHora = window.formatarDataBRT ? window.formatarDataBRT(jogo.utc, false) : jogo.utc;

    // ⑤ Formato de resultado: "1-1 (PEN) 5-4" quando há pênaltis
    let resOficial = "";
    if (temRes) {
      resOficial = `${r.homeGoals}-${r.awayGoals}`;
      if (r.foi_penaltis) {
        const ph = r.penaltis_home ?? 0;
        const pa = r.penaltis_away ?? 0;
        resOficial += ` (PEN) ${ph}-${pa}`;
      }
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
        const podeVer = temRes || !jogoAceita(jogo.id);
        row.push(podeVer ? `${p.homeGoals}x${p.awayGoals}` : "🔒");
      } else {
        row.push("");
      }
    }

    csvContent += row.join(";") + "\r\n";
  }

  // --- Linhas de Especiais no CSV ---
  // ⑥ Resultados oficiais (Campeão, Vice, 3º) automáticos do bracket
  const labelsEsp = { campeao: "🏆 Campeão", vice: "🥈 Vice", terceiro: "🥉 3º Lugar" };

  for (const key of ["campeao", "vice", "terceiro"]) {
    const ofCode = espOficiaisCsv[key] || "";
    const nomeOf = window.TEAMS_BY_CODE?.[ofCode]?.name || (ofCode || "");
    const row = [ "ESP", "especial", "", `"${labelsEsp[key]}"`, "", `"${nomeOf}"` ];
    for (const a of ranking) {
      const palE = (a.especiais && a.especiais[key]) || "";
      const nomePal = window.TEAMS_BY_CODE?.[palE]?.name || "";
      const podeVer = ofCode || !jogoAceita("final");
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