/**
 * bracket.js — Lógica de progressão do torneio
 *
 * Responsabilidades:
 *   1. Calcular classificação de cada grupo (A–L)
 *   2. Determinar os 8 melhores 3.°s classificados
 *   3. Preencher automaticamente os confrontos dos 32 avos → oitavas → quartas → semis → final
 *
 * Exporta: window.BRACKET (objeto com todas as funções e estado)
 * Depende de: data/schedule.js, data/teams.js
 *
 * ─── Regras de classificação da fase de grupos (FIFA 2026) ────────────────
 *   1. Pontos (V=3, E=1, D=0)
 *   2. Saldo de gols
 *   3. Gols marcados
 *   4. Confronto direto (pontos → saldo → gols pró)
 *   5. Fair play (não implementado — critério manual)
 *
 * ─── Bracket dos 32 avos (template FIFA 2026) ────────────────────────────
 *   O bracket abaixo é baseado na estrutura oficial divulgada pela FIFA.
 *   Cada entrada: [pos_grupo_home, pos_grupo_away]
 *   Onde "1A" = 1.° do Grupo A, "2B" = 2.° do Grupo B,
 *         "3X" = best 3rd (posição definida após grupos)
 */

window.BRACKET = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  // Template do bracket dos 32 avos de final
  // Formato: { gameId: { home: "posição", away: "posição" } }
  // Será atualizado com o bracket oficial da FIFA quando publicado.
  // ══════════════════════════════════════════════════════════════════════════
  const BRACKET_TEMPLATE_R32 = {
    R32_1:  { home: "2A", away: "2B"  }, // Jogo 73
    R32_2:  { home: "1E", away: "3X1" }, // Jogo 74
    R32_3:  { home: "1F", away: "2C"  }, // Jogo 75
    R32_4:  { home: "1C", away: "2F"  }, // Jogo 76
    R32_5:  { home: "1I", away: "3X2" }, // Jogo 77
    R32_6:  { home: "2E", away: "2I"  }, // Jogo 78
    R32_7:  { home: "1A", away: "3X3" }, // Jogo 79
    R32_8:  { home: "1L", away: "3X4" }, // Jogo 80
    R32_9:  { home: "1D", away: "3X5" }, // Jogo 81
    R32_10: { home: "1G", away: "3X6" }, // Jogo 82
    R32_11: { home: "2K", away: "2L"  }, // Jogo 83
    R32_12: { home: "1H", away: "2J"  }, // Jogo 84
    R32_13: { home: "1B", away: "3X7" }, // Jogo 85
    R32_14: { home: "1J", away: "2H"  }, // Jogo 86
    R32_15: { home: "1K", away: "3X8" }, // Jogo 87
    R32_16: { home: "2D", away: "2G"  }, // Jogo 88
  };

  const BRACKET_TEMPLATE_R16 = {
    R16_1: { home: "WR32_2",  away: "WR32_5"  }, // Jogo 89
    R16_2: { home: "WR32_1",  away: "WR32_3"  }, // Jogo 90
    R16_3: { home: "WR32_4",  away: "WR32_6"  }, // Jogo 91
    R16_4: { home: "WR32_7",  away: "WR32_8"  }, // Jogo 92
    R16_5: { home: "WR32_11", away: "WR32_12" }, // Jogo 93
    R16_6: { home: "WR32_9",  away: "WR32_10" }, // Jogo 94
    R16_7: { home: "WR32_14", away: "WR32_16" }, // Jogo 95
    R16_8: { home: "WR32_13", away: "WR32_15" }, // Jogo 96
  };

  const BRACKET_TEMPLATE_QF = {
    QF_1: { home: "WR16_1", away: "WR16_2" }, // Jogo 97
    QF_2: { home: "WR16_5", away: "WR16_6" }, // Jogo 98
    QF_3: { home: "WR16_3", away: "WR16_4" }, // Jogo 99
    QF_4: { home: "WR16_7", away: "WR16_8" }, // Jogo 100
  };

  const BRACKET_TEMPLATE_SF = {
    SF_1: { home: "WQF_1", away: "WQF_2" }, // Jogo 101
    SF_2: { home: "WQF_3", away: "WQF_4" }, // Jogo 102
  };

  const BRACKET_TEMPLATE_FINAL = {
    TPL: { home: "LSF_1", away: "LSF_2" }, // Jogo 103
    FNL: { home: "WSF_1", away: "WSF_2" }, // Jogo 104
  };

  // ══════════════════════════════════════════════════════════════════════════
  // Calcular classificação de um grupo
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * calcularClassificacaoGrupo(grupo, resultados)
   * @param {string} grupo     - letra do grupo (A–L)
   * @param {Object} resultados - { gameId: { homeGoals, awayGoals } }
   * @returns {Array} times ordenados com stats
   */
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

      const hStats = statsMap[jogo.home];
      const aStats = statsMap[jogo.away];
      if (!hStats || !aStats) continue;

      const hg = res.homeGoals, ag = res.awayGoals;
      hStats.J++; aStats.J++;
      hStats.GP += hg; hStats.GC += ag; hStats.SG += (hg - ag);
      aStats.GP += ag; aStats.GC += hg; aStats.SG += (ag - hg);

      if (hg > ag)      { hStats.V++; hStats.Pts += 3; aStats.D++; }
      else if (hg < ag) { aStats.V++; aStats.Pts += 3; hStats.D++; }
      else              { hStats.E++; hStats.Pts += 1; aStats.E++; aStats.Pts += 1; }
    }

    // Passo 1: Separar em grupos por pontos para aplicar o confronto direto
    const timesByPts = {};
    for (const t of times) {
       if (!timesByPts[t.Pts]) timesByPts[t.Pts] = [];
       timesByPts[t.Pts].push(t);
    }

    // Calcular estatísticas da mini-liga (confronto direto) para times empatados em pontos
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
             const hT = tied.find(x => x.code === jogo.home);
             const aT = tied.find(x => x.code === jogo.away);
             hT.GP_CD += hg; hT.SG_CD += (hg - ag);
             aT.GP_CD += ag; aT.SG_CD += (ag - hg);
             if (hg > ag) { hT.Pts_CD += 3; }
             else if (hg < ag) { aT.Pts_CD += 3; }
             else { hT.Pts_CD += 1; aT.Pts_CD += 1; }
          }
       }
    }

    // Ordenar: Pts → Confronto Direto (Pts, SG, GP) → Global (SG, GP)
    const sorted = [...times].sort((a, b) => {
      if (b.Pts !== a.Pts) return b.Pts - a.Pts;
      if (b.Pts_CD !== a.Pts_CD) return b.Pts_CD - a.Pts_CD;
      if (b.SG_CD !== a.SG_CD) return b.SG_CD - a.SG_CD;
      if (b.GP_CD !== a.GP_CD) return b.GP_CD - a.GP_CD;
      if (b.SG  !== a.SG)  return b.SG  - a.SG;
      if (b.GP  !== a.GP)  return b.GP  - a.GP;
      return 0;
    });

    return sorted.map((t, i) => ({ ...t, posicao: i + 1, grupo }));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Calcular classificados de todos os grupos
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * calcularTodosOsGrupos(resultados)
   * @returns {Object} {
   *   grupos: { A: [...times com stats], B: [...], ... },
   *   classificados: { "1A": "BRA", "2A": "MAR", ... },
   *   terceiros: [ { code, grupo, Pts, SG, GP }, ... ordenados ],
   *   melhoresTerceiros: [ 8 times ] (se grupos todos terminados)
   * }
   */
  function calcularTodosOsGrupos(resultados) {
    const grupos = {};
    const classificados = {};
    const terceiros = [];

    for (const letra of "ABCDEFGHIJKL".split("")) {
      const standing = calcularClassificacaoGrupo(letra, resultados);
      grupos[letra] = standing;

      // SO classifica quando TODOS os 6 jogos do grupo estao com resultado
      const jogosGrupo = window.SCHEDULE.filter(j => j.grupo === letra);
      const grupoCompleto = jogosGrupo.length === 6 &&
        jogosGrupo.every(j => resultados[j.id] && resultados[j.id].homeGoals !== undefined);

      if (grupoCompleto) {
        if (standing[0]) classificados[`1${letra}`] = standing[0].code;
        if (standing[1]) classificados[`2${letra}`] = standing[1].code;
        if (standing[2]) terceiros.push({ ...standing[2], grupo: letra });
      }
    }

    // Ordenar terceiros: Pts → SG → GP
    terceiros.sort((a, b) => {
      if (b.Pts !== a.Pts) return b.Pts - a.Pts;
      if (b.SG  !== a.SG)  return b.SG  - a.SG;
      return b.GP - a.GP;
    });

    const melhoresTerceiros = terceiros.slice(0, 8);

    // Mapear melhores 3.°s como 3X1, 3X2... para o bracket
    melhoresTerceiros.forEach((t, i) => {
      classificados[`3X${i + 1}`] = t.code;
    });

    return { grupos, classificados, terceiros, melhoresTerceiros };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Preencher bracket completo
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * preencherBracket(resultados)
   * Retorna um objeto com os times resolvidos para cada jogo eliminatório.
   * Usado pela UI para exibir os confrontos — NÃO grava no Firestore.
   *
   * @param {Object} resultados - { gameId: { homeGoals, awayGoals, ... } }
   * @returns {Object} { gameId: { home: "BRA", away: "ARG", homeResolved: true/false } }
   */
  function preencherBracket(resultados) {
    const { classificados } = calcularTodosOsGrupos(resultados);
    const bracket = {}; // gameId → { home, away }

    // Resolver posição para código de time
    function resolverPos(pos, bracket) {
      if (classificados[pos]) return { code: classificados[pos], resolved: true };
      // Tentar resolver vencedor/perdedor de jogo anterior
      if (pos.startsWith("W") || pos.startsWith("L")) {
        const prefix = pos[0];
        const gameId = pos.slice(1); // ex: "R32_1", "R16_2", "QF_1", "SF_1"
        const res = resultados[gameId];
        if (res && res.homeGoals !== undefined) {
          const jogoRef = bracket[gameId];
          if (!jogoRef) return { code: null, resolved: false };
          const hg = res.homeGoals, ag = res.awayGoals;
          // Com pênaltis: vencedor = penaltis_vencedor
          let winner, loser;
          if (res.foi_penaltis) {
            winner = res.penaltis_vencedor === "home" ? jogoRef.home : jogoRef.away;
            loser  = res.penaltis_vencedor === "home" ? jogoRef.away : jogoRef.home;
          } else {
            winner = hg >= ag ? jogoRef.home : jogoRef.away;
            loser  = hg >= ag ? jogoRef.away : jogoRef.home;
          }
          return { code: prefix === "W" ? winner : loser, resolved: true };
        }
        return { code: null, resolved: false };
      }
      return { code: null, resolved: false };
    }

    // Processar cada fase em ordem
    const templates = [
      { template: BRACKET_TEMPLATE_R32,   fase: "32avos"   },
      { template: BRACKET_TEMPLATE_R16,   fase: "oitavas"  },
      { template: BRACKET_TEMPLATE_QF,    fase: "quartas"  },
      { template: BRACKET_TEMPLATE_SF,    fase: "semis"    },
      { template: BRACKET_TEMPLATE_FINAL, fase: "final"    },
    ];

    for (const { template } of templates) {
      for (const [gameId, { home: homePos, away: awayPos }] of Object.entries(template)) {
        const h = resolverPos(homePos, bracket);
        const a = resolverPos(awayPos, bracket);
        bracket[gameId] = {
          home: h.code,
          away: a.code,
          homePos,
          awayPos,
          homeResolved: h.resolved,
          awayResolved: a.resolved,
        };
      }
    }

    return bracket;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Utilitários públicos
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * getTimeInfo(code)
   * Retorna dados do time pelo código (shortcut para TEAMS_BY_CODE).
   */
  function getTimeInfo(code) {
    return window.TEAMS_BY_CODE[code] || { code, name: code, flag: "" };
  }

  /**
   * descricaoPosicao(pos)
   * Converte "1A" → "1.° Grupo A", "WR32_1" → "Vencedor 32avos #1", etc.
   */
  function descricaoPosicao(pos) {
    if (!pos) return "A definir";
    const grupoMatch = pos.match(/^([12])([A-L])$/);
    if (grupoMatch) {
      const ord = grupoMatch[1] === "1" ? "1.°" : "2.°";
      return `${ord} Grupo ${grupoMatch[2]}`;
    }
    const tercMatch = pos.match(/^3X(\d+)$/);
    if (tercMatch) return `${tercMatch[1]}.° melhor 3.° lugar`;
    if (pos.startsWith("WR32_")) return `Venc. 32avos #${pos.slice(5)}`;
    if (pos.startsWith("WR16_")) return `Venc. Oitavas #${pos.slice(5)}`;
    if (pos.startsWith("WQF_")) return `Venc. Quartas #${pos.slice(4)}`;
    if (pos.startsWith("WSF_")) return `Venc. Semi #${pos.slice(4)}`;
    if (pos.startsWith("LSF_")) return `Perdedor Semi #${pos.slice(4)}`;
    return pos;
  }

  return {
    calcularClassificacaoGrupo,
    calcularTodosOsGrupos,
    preencherBracket,
    getTimeInfo,
    descricaoPosicao,
    BRACKET_TEMPLATE_R32,
    BRACKET_TEMPLATE_R16,
    BRACKET_TEMPLATE_QF,
    BRACKET_TEMPLATE_SF,
    BRACKET_TEMPLATE_FINAL,
  };
})();
