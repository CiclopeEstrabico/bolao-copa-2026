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

  function calcularClassificacaoGrupo(grupo, resultados) {
    const jogos = window.SCHEDULE.filter(j => j.grupo === grupo);
    const times = window.TEAMS.filter(t => t.group === grupo).map(t => ({
      code: t.code, name: t.name, flag: t.flag,
      J: 0, V: 0, E: 0, D: 0, GP: 0, GC: 0, SG: 0, Pts: 0
    }));
    const statsMap = Object.fromEntries(times.map(t => [t.code, t]));

    for (const jogo of jogos) {
      const res = resultados[jogo.id];
      if (!res || res.homeGoals === undefined) continue;
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

    const timesByPts = {};
    for (const t of times) {
      if (!timesByPts[t.Pts]) timesByPts[t.Pts] = [];
      timesByPts[t.Pts].push(t);
    }

    for (const pts of Object.keys(timesByPts)) {
      const tied = timesByPts[pts];
      for (const t of tied) { t.Pts_CD = 0; t.SG_CD = 0; t.GP_CD = 0; }
      if (tied.length > 1) {
        const tiedCodes = tied.map(t => t.code);
        const jogosMini = jogos.filter(j => tiedCodes.includes(j.home) && tiedCodes.includes(j.away));
        for (const jogo of jogosMini) {
          const res = resultados[jogo.id];
          if (!res || res.homeGoals === undefined) continue;
          const hg = res.homeGoals, ag = res.awayGoals;
          const hT = tied.find(x => x.code === jogo.home), aT = tied.find(x => x.code === jogo.away);
          hT.GP_CD += hg; hT.SG_CD += (hg - ag);
          aT.GP_CD += ag; aT.SG_CD += (ag - hg);
          if (hg > ag) { hT.Pts_CD += 3; }
          else if (hg < ag) { aT.Pts_CD += 3; }
          else { hT.Pts_CD += 1; aT.Pts_CD += 1; }
        }
      }
    }

    const sorted = [...times].sort((a, b) => {
      if (b.Pts !== a.Pts) return b.Pts - a.Pts;
      if (b.Pts_CD !== a.Pts_CD) return b.Pts_CD - a.Pts_CD;
      if (b.SG_CD !== a.SG_CD) return b.SG_CD - a.SG_CD;
      if (b.GP_CD !== a.GP_CD) return b.GP_CD - a.GP_CD;
      if (b.SG !== a.SG) return b.SG - a.SG;
      if (b.GP !== a.GP) return b.GP - a.GP;
      return 0;
    });

    return sorted.map((t, i) => ({ ...t, posicao: i + 1, grupo }));
  }

  function calcularTodosOsGrupos(resultados) {
    const grupos = {}, classificados = {}, terceiros = [];
    for (const letra of "ABCDEFGHIJKL".split("")) {
      const standing = calcularClassificacaoGrupo(letra, resultados);
      grupos[letra] = standing;
      const jogosGrupo = window.SCHEDULE.filter(j => j.grupo === letra);
      const grupoCompleto = jogosGrupo.length === 6 && jogosGrupo.every(j => resultados[j.id] && resultados[j.id].homeGoals !== undefined);
      if (grupoCompleto) {
        if (standing[0]) classificados[`1${letra}`] = standing[0].code;
        if (standing[1]) classificados[`2${letra}`] = standing[1].code;
        if (standing[2]) terceiros.push({ ...standing[2], grupo: letra });
      }
    }
    terceiros.sort((a, b) => {
      if (b.Pts !== a.Pts) return b.Pts - a.Pts;
      if (b.SG !== a.SG) return b.SG - a.SG;
      return b.GP - a.GP;
    });
    const melhoresTerceiros = terceiros.slice(0, 8);
    melhoresTerceiros.forEach((t, i) => { classificados[`3X${i + 1}`] = t.code; });
    return { grupos, classificados, terceiros, melhoresTerceiros };
  }

  function preencherBracket(resultados) {
    const { classificados } = calcularTodosOsGrupos(resultados);
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
    if (grupoMatch) return (grupoMatch[1] === "1" ? "1.°" : "2.°") + ` Grupo ${grupoMatch[2]}`;
    const tercMatch = pos.match(/^3X(\d+)$/);
    if (tercMatch) return `${tercMatch[1]}.° melhor 3.° lugar`;
    if (pos.startsWith("WR32_")) return `Venc. 32avos #${pos.slice(5)}`;
    if (pos.startsWith("WR16_")) return `Venc. Oitavas #${pos.slice(5)}`;
    if (pos.startsWith("WQF_")) return `Venc. Quartas #${pos.slice(4)}`;
    if (pos.startsWith("WSF_")) return `Venc. Semi #${pos.slice(4)}`;
    if (pos.startsWith("LSF_")) return `Perdedor Semi #${pos.slice(4)}`;
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
        loser  = rFinal.penaltis_vencedor === "home" ? bFinal.away : bFinal.home;
      } else {
        winner = rFinal.homeGoals >= rFinal.awayGoals ? bFinal.home : bFinal.away;
        loser  = rFinal.homeGoals >= rFinal.awayGoals ? bFinal.away : bFinal.home;
      }
      out.campeao = winner; out.vice = loser;
    }
    const rTpl = res["TPL"];
    if (rTpl && rTpl.homeGoals !== undefined) {
      const bTpl = bracket["TPL"] || {};
      out.terceiro = rTpl.foi_penaltis 
        ? (rTpl.penaltis_vencedor === "home" ? bTpl.home : bTpl.away)
        : (rTpl.homeGoals >= rTpl.awayGoals ? bTpl.home : bTpl.away);
    }
    return out;
  }

  return {
    calcularClassificacaoGrupo, calcularTodosOsGrupos, preencherBracket,
    getTimeInfo, descricaoPosicao, extrairEspeciaisOficiais,
    BRACKET_TEMPLATE_R32, BRACKET_TEMPLATE_R16, BRACKET_TEMPLATE_QF, BRACKET_TEMPLATE_SF, BRACKET_TEMPLATE_FINAL
  };
})();
