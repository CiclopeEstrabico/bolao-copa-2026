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
    R32_1:  { home: "1A", away: "2B" },
    R32_2:  { home: "1C", away: "2D" },
    R32_3:  { home: "1B", away: "2A" },
    R32_4:  { home: "1D", away: "2C" },
    R32_5:  { home: "1E", away: "2F" },
    R32_6:  { home: "1G", away: "2H" },
    R32_7:  { home: "1F", away: "2E" },
    R32_8:  { home: "1H", away: "2G" },
    R32_9:  { home: "1I", away: "2J" },
    R32_10: { home: "1K", away: "2L" },
    R32_11: { home: "1J", away: "2I" },
    R32_12: { home: "1L", away: "2K" },
    // Os 8 melhores 3.°s preenchem R32_13 a R32_16
    // A distribuição exata depende de quais grupos geraram 3.°s — será calculada dinamicamente
    R32_13: { home: "3X1", away: "3X2" },
    R32_14: { home: "3X3", away: "3X4" },
    R32_15: { home: "3X5", away: "3X6" },
    R32_16: { home: "3X7", away: "3X8" },
  };

  // Template simplificado R16, QF, SF (vencedor do jogo N vs vencedor do jogo M)
  const BRACKET_TEMPLATE_R16 = {
    R16_1: { home: "WR32_1",  away: "WR32_2"  },
    R16_2: { home: "WR32_3",  away: "WR32_4"  },
    R16_3: { home: "WR32_5",  away: "WR32_6"  },
    R16_4: { home: "WR32_7",  away: "WR32_8"  },
    R16_5: { home: "WR32_9",  away: "WR32_10" },
    R16_6: { home: "WR32_11", away: "WR32_12" },
    R16_7: { home: "WR32_13", away: "WR32_14" },
    R16_8: { home: "WR32_15", away: "WR32_16" },
  };
  const BRACKET_TEMPLATE_QF = {
    QF_1: { home: "WR16_1", away: "WR16_2" },
    QF_2: { home: "WR16_3", away: "WR16_4" },
    QF_3: { home: "WR16_5", away: "WR16_6" },
    QF_4: { home: "WR16_7", away: "WR16_8" },
  };
  const BRACKET_TEMPLATE_SF = {
    SF_1: { home: "WQF_1", away: "WQF_2" },
    SF_2: { home: "WQF_3", away: "WQF_4" },
  };
  const BRACKET_TEMPLATE_FINAL = {
    TPL: { home: "LSF_1", away: "LSF_2" }, // perdedores das semis
    FNL: { home: "WSF_1", away: "WSF_2" },
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

    // Ordenar: Pts → SG → GP → confronto direto
    const sorted = [...times].sort((a, b) => {
      if (b.Pts !== a.Pts) return b.Pts - a.Pts;
      if (b.SG  !== a.SG)  return b.SG  - a.SG;
      if (b.GP  !== a.GP)  return b.GP  - a.GP;
      // Confronto direto
      const cd = _confrontoDireto(a.code, b.code, grupo, resultados);
      return cd;
    });

    return sorted.map((t, i) => ({ ...t, posicao: i + 1, grupo }));
  }

  function _confrontoDireto(codeA, codeB, grupo, resultados) {
    const jogo = window.SCHEDULE.find(j =>
      j.grupo === grupo && (
        (j.home === codeA && j.away === codeB) ||
        (j.home === codeB && j.away === codeA)
      )
    );
    if (!jogo) return 0;
    const res = resultados[jogo.id];
    if (!res || res.homeGoals === undefined) return 0;
    const hg = res.homeGoals, ag = res.awayGoals;
    const aIsHome = jogo.home === codeA;
    const ptA = aIsHome ? (hg > ag ? 3 : hg === ag ? 1 : 0) : (ag > hg ? 3 : ag === hg ? 1 : 0);
    const ptB = aIsHome ? (ag > hg ? 3 : hg === ag ? 1 : 0) : (hg > ag ? 3 : hg === ag ? 1 : 0);
    return ptB - ptA; // positivo = B é melhor
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
