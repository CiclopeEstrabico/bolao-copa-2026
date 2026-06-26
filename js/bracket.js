/**
 * bracket.js — Lógica de progressão do torneio
 */

window.BRACKET = (() => {

  const BRACKET_TEMPLATE_R32 = {
    R32_1: { home: "2A", away: "2B" }, R32_2: { home: "1E", away: "3X1" },
    R32_3: { home: "1F", away: "2C" }, R32_4: { home: "1C", away: "2F" },
    R32_5: { home: "1I", away: "3X2" }, R32_6: { home: "2E", away: "2I" },
    R32_7: { home: "1A", away: "3X3" }, R32_8: { home: "1L", away: "3X4" },
    R32_9: { home: "1D", away: "3X5" }, R32_10: { home: "1G", away: "3X6" },
    R32_11: { home: "2K", away: "2L" }, R32_12: { home: "1H", away: "2J" },
    R32_13: { home: "1B", away: "3X7" }, R32_14: { home: "1J", away: "2H" },
    R32_15: { home: "1K", away: "3X8" }, R32_16: { home: "2D", away: "2G" },
  };

  const BRACKET_TEMPLATE_R16 = {
    R16_1: { home: "WR32_2", away: "WR32_5" }, R16_2: { home: "WR32_1", away: "WR32_3" },
    R16_3: { home: "WR32_4", away: "WR32_6" }, R16_4: { home: "WR32_7", away: "WR32_8" },
    R16_5: { home: "WR32_11", away: "WR32_12" }, R16_6: { home: "WR32_9", away: "WR32_10" },
    R16_7: { home: "WR32_14", away: "WR32_16" }, R16_8: { home: "WR32_13", away: "WR32_15" },
  };

  const BRACKET_TEMPLATE_QF = {
    QF_1: { home: "WR16_1", away: "WR16_2" }, QF_2: { home: "WR16_5", away: "WR16_6" },
    QF_3: { home: "WR16_3", away: "WR16_4" }, QF_4: { home: "WR16_7", away: "WR16_8" },
  };

  const BRACKET_TEMPLATE_SF = {
    SF_1: { home: "WQF_1", away: "WQF_2" }, SF_2: { home: "WQF_3", away: "WQF_4" },
  };

  const BRACKET_TEMPLATE_FINAL = {
    TPL: { home: "LSF_1", away: "LSF_2" }, FNL: { home: "WSF_1", away: "WSF_2" },
  };

  /**
   * _calcularCD(subset, jogos)
   * Calcula Pts_CD / SG_CD / GP_CD para cada time em `subset`
   * considerando apenas os jogos entre os times do próprio subset.
   * Não modifica os objetos — retorna um Map<code, {Pts_CD, SG_CD, GP_CD}>.
   */
  function _calcularCD(subset, jogos) {
    const codes = new Set(subset.map(t => t.code));
    const stats = new Map(subset.map(t => [t.code, { Pts_CD: 0, SG_CD: 0, GP_CD: 0 }]));
    for (const jogo of jogos) {
      if (!codes.has(jogo.home) || !codes.has(jogo.away)) continue;
      const res = jogo._res;
      if (!res) continue;
      const hg = res.homeGoals, ag = res.awayGoals;
      const h = stats.get(jogo.home), a = stats.get(jogo.away);
      h.GP_CD += hg; h.SG_CD += (hg - ag);
      a.GP_CD += ag; a.SG_CD += (ag - hg);
      if (hg > ag)      { h.Pts_CD += 3; }
      else if (hg < ag) { a.Pts_CD += 3; }
      else              { h.Pts_CD += 1; a.Pts_CD += 1; }
    }
    return stats;
  }

  /**
   * _ordenarEmpatados(subset, jogos, depth)
   * Ordena `subset` (todos com mesmo Pts geral) aplicando Step 1→Step 2 do Art.13.
   * - Step 1: critérios a/b/c no confronto direto entre TODOS do subset.
   * - Step 2 (Art.13 iterativo): para os que ainda ficarem empatados após Step 1,
   *   reaplica a/b/c entre ELES SOMENTE, recursivamente.
   *   Só entra na recursão se o subgrupo tiver ≥2 times e for estritamente menor
   *   que o conjunto atual (garantia de terminação).
   * - Após esgotar os critérios de confronto direto, usa SG/GP gerais.
   * - depth limita a recursão (máx 3 para 4 times; na prática nunca passa de 2).
   *
   * Retorna array ordenado (não modifica o original).
   */
  function _ordenarEmpatados(subset, jogos, depth) {
    // Barreiras de segurança:
    // - 1 time: trivial, devolve direto
    // - profundidade > 3 ou subset >= 5: improvável em grupo de 4, mas protege
    if (subset.length <= 1) return [...subset];
    if (depth > 3 || subset.length > 4) {
      // Fallback: SG geral → GP geral (estável)
      return [...subset].sort((a, b) => b.SG - a.SG || b.GP - a.GP);
    }

    const cd = _calcularCD(subset, jogos);

    // Comparador Step 1: Pts_CD → SG_CD → GP_CD
    const cmpCD = (a, b) => {
      const ca = cd.get(a.code), cb = cd.get(b.code);
      return (cb.Pts_CD - ca.Pts_CD) || (cb.SG_CD - ca.SG_CD) || (cb.GP_CD - ca.GP_CD);
    };

    const sorted = [...subset].sort(cmpCD);

    // Reagrupar times que ficaram empatados nos 3 critérios de confronto direto
    const result = [];
    let i = 0;
    while (i < sorted.length) {
      let j = i + 1;
      // Avança j enquanto sorted[j] empatar com sorted[i] em todos os critérios CD
      while (j < sorted.length && cmpCD(sorted[i], sorted[j]) === 0) j++;
      const bloco = sorted.slice(i, j);
      if (bloco.length === 1) {
        // Já separado — sem recursão
        result.push(bloco[0]);
      } else if (bloco.length < subset.length) {
        // Step 2: subgrupo é estritamente menor → recursão segura
        const subOrdenados = _ordenarEmpatados(bloco, jogos, depth + 1);
        result.push(...subOrdenados);
      } else {
        // bloco.length === subset.length: confronto direto não diferenciou ninguém.
        // Step 2 não se aplica (reaplica sobre o mesmo conjunto = loop infinito).
        // Cai direto para SG/GP gerais como desempate final.
        const porGlobal = [...bloco].sort((a, b) => b.SG - a.SG || b.GP - a.GP);
        result.push(...porGlobal);
      }
      i = j;
    }
    return result;
  }

  function calcularClassificacaoGrupo(grupo, resultados) {
    const jogos = window.SCHEDULE.filter(j => j.grupo === grupo);

    // Pré-anexa o resultado em cada jogo para evitar lookups repetidos
    const jogosComRes = jogos.map(j => ({ ...j, _res: (() => {
      const r = resultados[j.id];
      return (r && r.homeGoals !== undefined) ? r : null;
    })() }));

    const times = window.TEAMS.filter(t => t.group === grupo).map(t => ({
      code: t.code, name: t.name, flag: t.flag,
      J: 0, V: 0, E: 0, D: 0, GP: 0, GC: 0, SG: 0, Pts: 0
    }));
    const statsMap = Object.fromEntries(times.map(t => [t.code, t]));

    for (const jogo of jogosComRes) {
      const res = jogo._res;
      if (!res) continue;
      const hStats = statsMap[jogo.home], aStats = statsMap[jogo.away];
      if (!hStats || !aStats) continue;
      const hg = res.homeGoals, ag = res.awayGoals;
      hStats.J++; aStats.J++;
      hStats.GP += hg; hStats.GC += ag; hStats.SG += (hg - ag);
      aStats.GP += ag; aStats.GC += hg; aStats.SG += (ag - hg);
      if (hg > ag) { hStats.V++; hStats.Pts += 3; aStats.D++; }
      else if (hg < ag) { aStats.V++; aStats.Pts += 3; hStats.D++; }
      else { hStats.E++; hStats.Pts += 1; aStats.E++; aStats.Pts += 1; }
    }

    // Agrupa times por pontuação geral
    const timesByPts = {};
    for (const t of times) {
      if (!timesByPts[t.Pts]) timesByPts[t.Pts] = [];
      timesByPts[t.Pts].push(t);
    }

    // Ordena cada bolsão de empatados usando Step 1 + Step 2 iterativo (Art.13)
    const sorted = [];
    for (const pts of Object.keys(timesByPts).sort((a, b) => b - a)) {
      const tied = timesByPts[pts];
      if (tied.length === 1) {
        sorted.push(tied[0]);
      } else {
        sorted.push(..._ordenarEmpatados(tied, jogosComRes, 0));
      }
    }

    return sorted.map((t, i) => ({ ...t, posicao: i + 1, grupo }));
  }

  function calcularTodosOsGrupos(resultados) {
    const grupos = {}, classificados = {}, terceiros = [];
    let gruposCompletos = 0;
    for (const letra of "ABCDEFGHIJKL".split("")) {
      const standing = calcularClassificacaoGrupo(letra, resultados);
      grupos[letra] = standing;
      const jogosGrupo = window.SCHEDULE.filter(j => j.grupo === letra);
      const grupoCompleto = jogosGrupo.length === 6 && jogosGrupo.every(j => resultados[j.id] && resultados[j.id].homeGoals !== undefined);
      if (grupoCompleto) {
        gruposCompletos++;
        if (standing[0]) classificados[`1${letra}`] = standing[0].code;
        if (standing[1]) classificados[`2${letra}`] = standing[1].code;
        if (standing[2]) terceiros.push({ ...standing[2], grupo: letra });
      }
    }
    // Melhores terceiros SÓ são definidos quando TODOS os 12 grupos estiverem completos.
    // Antes disso, cada grupo coleta seu 3° interno mas a seleção dos 8 melhores
    // (e os slots 3X1..3X8 no bracket) ficam vazios — evitando rankings incorretos
    // quando dados mistos (oficiais + palpites/simulação) fecham grupos fora de ordem.
    let melhoresTerceiros = [];
    if (gruposCompletos === 12) {
      terceiros.sort((a, b) => {
        if (b.Pts !== a.Pts) return b.Pts - a.Pts;
        if (b.SG !== a.SG) return b.SG - a.SG;
        return b.GP - a.GP;
      });
      melhoresTerceiros = terceiros.slice(0, 8);

      // Determine which 8 groups produced the best third-placed teams
      const gruposDos8 = melhoresTerceiros.map(t => t.grupo).sort().join(",");

      // Lookup FIFA Annex C allocation table
      // Slots 3X1..3X8 correspond to R32 games: 3X1→R32_2(1E), 3X2→R32_5(1I),
      // 3X3→R32_7(1A), 3X4→R32_8(1L), 3X5→R32_9(1D), 3X6→R32_10(1G),
      // 3X7→R32_13(1B), 3X8→R32_15(1K)
      const slotParaColuna = {
        "3X1": "1E", "3X2": "1I", "3X3": "1A", "3X4": "1L",
        "3X5": "1D", "3X6": "1G", "3X7": "1B", "3X8": "1K"
      };
      const alocacao = window.FIFA_THIRD_PLACE_COMBINATIONS && window.FIFA_THIRD_PLACE_COMBINATIONS[gruposDos8];
      if (alocacao) {
        for (const [slot, coluna] of Object.entries(slotParaColuna)) {
          const grupoOrigem = alocacao[coluna]; // e.g. "3E"
          const letraGrupo = grupoOrigem[1];    // "E"
          const terceiroDoGrupo = melhoresTerceiros.find(t => t.grupo === letraGrupo);
          if (terceiroDoGrupo) classificados[slot] = terceiroDoGrupo.code;
        }
      } else {
        // Fallback: sequential assignment (should not occur with valid data)
        melhoresTerceiros.forEach((t, i) => { classificados[`3X${i + 1}`] = t.code; });
      }
    }
    return { grupos, classificados, terceiros, melhoresTerceiros };
  }

  function preencherBracket(resultados, optClassificados) {
    const classificados = optClassificados || calcularTodosOsGrupos(resultados).classificados;
    const bracket = {};

    function resolverPos(pos, bracket) {
      if (classificados[pos]) return { code: classificados[pos], resolved: true };
      if (pos.startsWith("W") || pos.startsWith("L")) {
        const prefix = pos[0], gameId = pos.slice(1), res = resultados[gameId];
        if (res && res.homeGoals !== undefined) {
          const jogoRef = bracket[gameId];
          if (!jogoRef) return { code: null, resolved: false };
          let winner, loser;
          if (res.foi_penaltis) {
            winner = res.penaltis_vencedor === "home" ? jogoRef.home : jogoRef.away;
            loser = res.penaltis_vencedor === "home" ? jogoRef.away : jogoRef.home;
          } else {
            winner = res.homeGoals >= res.awayGoals ? jogoRef.home : jogoRef.away;
            loser = res.homeGoals >= res.awayGoals ? jogoRef.away : jogoRef.home;
          }
          return { code: prefix === "W" ? winner : loser, resolved: true };
        }
      }
      return { code: null, resolved: false };
    }

    const templates = [
      { template: BRACKET_TEMPLATE_R32 }, { template: BRACKET_TEMPLATE_R16 },
      { template: BRACKET_TEMPLATE_QF }, { template: BRACKET_TEMPLATE_SF },
      { template: BRACKET_TEMPLATE_FINAL },
    ];
    for (const { template } of templates) {
      for (const [gameId, { home: homePos, away: awayPos }] of Object.entries(template)) {
        const h = resolverPos(homePos, bracket), a = resolverPos(awayPos, bracket);
        bracket[gameId] = { home: h.code, away: a.code, homePos, awayPos, homeResolved: h.resolved, awayResolved: a.resolved };
      }
    }
    return bracket;
  }

  function getTimeInfo(code) { return window.TEAMS_BY_CODE[code] || { code, name: code, flag: "" }; }

  function descricaoPosicao(pos) {
    if (!pos) return "A definir";
    const grupoMatch = pos.match(/^([12])([A-L])$/);
    if (grupoMatch) return grupoMatch[1] + "º " + grupoMatch[2];
    const tercMatch = pos.match(/^3X(\d+)$/);
    if (tercMatch) return "3º #" + tercMatch[1];
    if (pos.startsWith("WR32_")) return "V. 16avos #" + pos.slice(5);
    if (pos.startsWith("WR16_")) return "V. Oitavas #" + pos.slice(5);
    if (pos.startsWith("WQF_")) return "V. QF #" + pos.slice(4);
    if (pos.startsWith("WSF_")) return "V. SF #" + pos.slice(4);
    if (pos.startsWith("LSF_")) return "P. SF #" + pos.slice(4);
    return pos;
  }

  function extrairEspeciaisOficiais(res, bracket) {
    const out = { campeao: null, vice: null, terceiro: null };
    const rFinal = res["FNL"];
    if (rFinal && rFinal.homeGoals !== undefined) {
      const bFinal = bracket["FNL"] || {};
      let winner, loser;
      if (rFinal.foi_penaltis) {
        winner = rFinal.penaltis_vencedor === "home" ? bFinal.home : bFinal.away;
        loser = rFinal.penaltis_vencedor === "home" ? bFinal.away : bFinal.home;
      } else {
        winner = rFinal.homeGoals > rFinal.awayGoals ? bFinal.home : bFinal.away;
        loser = rFinal.homeGoals > rFinal.awayGoals ? bFinal.away : bFinal.home;
      }
      out.campeao = winner; out.vice = loser;
    }
    const rTpl = res["TPL"];
    if (rTpl && rTpl.homeGoals !== undefined) {
      const bTpl = bracket["TPL"] || {};
      out.terceiro = rTpl.foi_penaltis
        ? (rTpl.penaltis_vencedor === "home" ? bTpl.home : bTpl.away)
        : (rTpl.homeGoals > rTpl.awayGoals ? bTpl.home : bTpl.away);
    }
    return out;
  }

  return {
    calcularClassificacaoGrupo, calcularTodosOsGrupos, preencherBracket,
    getTimeInfo, descricaoPosicao, extrairEspeciaisOficiais,
    BRACKET_TEMPLATE_R32, BRACKET_TEMPLATE_R16, BRACKET_TEMPLATE_QF, BRACKET_TEMPLATE_SF, BRACKET_TEMPLATE_FINAL
  };
})();
