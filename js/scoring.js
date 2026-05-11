/**
 * scoring.js - Motor de pontuacao do Bolao Copa 2026
 * Funcoes puras. Sem Firebase, sem DOM. Testavel isoladamente.
 * Depende de: data/config.js (window.CONFIG), data/schedule.js (window.SCHEDULE)
 */

/** Determina vencedor: "home" | "away" | "draw" */
function _vencedor(h, a) {
  return h > a ? "home" : h < a ? "away" : "draw";
}

/**
 * calcularPontosBrutos(palpite, resultado)
 * Calcula pontos brutos antes do fator de fase.
 *
 * Regra de penaltis:
 *   - O placar de 90min + prorrogacao termina empatado
 *   - Para efeito de apostas, o resultado e "empate"
 *   - Quem chutou empate = acertou resultado (3 pts + bonus se aplicavel)
 *   - Placar exato nao e possivel em jogo de penaltis
 *
 * @param {Object} palpite   {homeGoals:N, awayGoals:N}
 * @param {Object} resultado {homeGoals:N, awayGoals:N, foi_penaltis:bool, penaltis_vencedor:str}
 * @returns {Object} {total_bruto, base, bonus_pts, bonus_tipo, descricao, acertou}
 */
function calcularPontosBrutos(palpite, resultado) {
  const cfg = window.CONFIG.pontuacao;

  if (!resultado || resultado.homeGoals === undefined) {
    return { total_bruto: 0, base: 0, bonus_pts: 0, bonus_tipo: null, descricao: "Aguardando resultado", acertou: null };
  }

  const Hp = Number(palpite.homeGoals);
  const Ap = Number(palpite.awayGoals);
  const Hr = Number(resultado.homeGoals);
  const Ar = Number(resultado.awayGoals);

  // Com penaltis: para efeito de apostas o resultado efetivo e empate
  // (o jogo terminou empatado em 90+prorrogacao, penaltis nao contam)
  const res_ef = resultado.foi_penaltis ? "draw" : _vencedor(Hr, Ar);
  const res_pal = _vencedor(Hp, Ap);

  if (res_pal !== res_ef) {
    return { total_bruto: 0, base: 0, bonus_pts: 0, bonus_tipo: "erro", descricao: "Resultado errado", acertou: false };
  }

  // Placar exato: nao aplicavel em jogo de penaltis
  if (!resultado.foi_penaltis && Hp === Hr && Ap === Ar) {
    const total_gols = Hr + Ar;
    const bonus = total_gols >= cfg.limiar_placar_alto
      ? cfg.bonus_placar_exato_alto
      : cfg.bonus_placar_exato_baixo;
    return {
      total_bruto: cfg.resultado_base + bonus,
      base: cfg.resultado_base,
      bonus_pts: bonus,
      bonus_tipo: "placar_exato",
      descricao: "Placar exato " + Hr + "x" + Ar + " (+" + bonus + ")",
      acertou: true
    };
  }

  // Bonus de diferenca de gols e gols de um time
  // Nao aplicavel em penaltis (empate forcado)
  let bonus = 0;
  const tipos = [];
  if (!resultado.foi_penaltis) {
    const acertou_diff = Math.abs(Hp - Ap) === Math.abs(Hr - Ar);
    const acertou_gols = Hp === Hr || Ap === Ar;
    if (acertou_diff) { bonus = cfg.bonus_diferenca_gols; tipos.push("diferenca"); }
    else if (acertou_gols) { bonus = cfg.bonus_gols_um_time; tipos.push("gols"); }
  }

  return {
    total_bruto: cfg.resultado_base + bonus,
    base: cfg.resultado_base,
    bonus_pts: bonus,
    bonus_tipo: tipos.length ? tipos.join("+") : "apenas_resultado",
    descricao: tipos.length
      ? "Resultado + " + tipos.join("+") + " (+" + bonus + ")"
      : "Apenas resultado",
    acertou: true
  };
}

/**
 * aplicarFator(pontosBrutos, fase)
 * Aplica multiplicador da fase. Retorna Number com 1 decimal.
 */
function aplicarFator(pontosBrutos, fase) {
  const fator = (window.CONFIG.pontuacao.fatores_fase[fase]) || 1.0;
  return Math.round(pontosBrutos * fator * 10) / 10;
}

/**
 * calcularPontosEspeciais(participante, campeaoOf, viceOf, terceiroOf)
 */
function calcularPontosEspeciais(participante, campeaoOf, viceOf, terceiroOf) {
  const cfg = window.CONFIG.pontuacao.extras;
  // Os palpites especiais ficam em participante.especiais.{campeao,vice,terceiro}
  // gravados por gravarEspecialAposta() em aposta.js como código de time (ex: "BRA")
  const esp = participante.especiais || {};
  let total = 0;
  const detalhes = [];
  if (campeaoOf && esp.campeao === campeaoOf) { total += cfg.primeiro_lugar; detalhes.push("Campeao +" + cfg.primeiro_lugar); }
  if (viceOf && esp.vice === viceOf) { total += cfg.segundo_lugar; detalhes.push("Vice +" + cfg.segundo_lugar); }
  if (terceiroOf && esp.terceiro === terceiroOf) { total += cfg.terceiro_lugar; detalhes.push("3o lugar +" + cfg.terceiro_lugar); }
  return { total_especiais: total, detalhes };
}

/**
 * calcularMaxPontosPossiveis(resultados, bracket)
 * Soma o total de pontos que um apostador perfeito teria ganho até agora,
 * considerando os jogos que já tem resultado, os fatores de fase e os
 * palpites especiais (campeão, vice, 3º) proporcional ao que já foi definido.
 */
function calcularMaxPontosPossiveis(resultados, bracket) {
  let max = 0;
  for (const jogo of (window.SCHEDULE || [])) {
    const r = resultados[jogo.id];
    if (r && r.homeGoals !== undefined) {
      const cfg = window.CONFIG?.pontuacao || {};
      let maxBruto = cfg.resultado_base || 3;
      // Em jogo de penaltis o placar exato nao e possivel/pontuado
      if (!r.foi_penaltis) {
        const tGols = Number(r.homeGoals) + Number(r.awayGoals);
        const limiar = cfg.limiar_placar_alto || 4;
        const bonus = tGols >= limiar ? (cfg.bonus_placar_exato_alto || 5) : (cfg.bonus_placar_exato_baixo || 3);
        maxBruto += bonus;
      }
      max += aplicarFator(maxBruto, jogo.fase);
    }
  }

  // Adiciona pontos máximos dos especiais conforme os resultados forem oficializados
  const brk = bracket || APP.bracket || {};
  const esp = window.CONFIG?.pontuacao?.extras || {};
  const resF = resultados["FNL"];
  const resT = resultados["TPL"];
  if (resF && resF.homeGoals !== undefined) {
    // Final já jogada: campeão e vice já podem ser acertados
    max += (esp.primeiro_lugar || 7) + (esp.segundo_lugar || 4);
  }
  if (resT && resT.homeGoals !== undefined) {
    // Disputa de 3º lugar já jogada
    max += (esp.terceiro_lugar || 2);
  }

  return Math.round(max * 10) / 10;
}

/**
 * calcularMaxPontosTotais()
 * Calcula o total máximo de pontos possível no campeonato inteiro,
 * assumindo acerto de placar exato em todos os 104 jogos e bônus máximos.
 */
function calcularMaxPontosTotais() {
  let max = 0;
  const cfg = window.CONFIG?.pontuacao || {};
  const resBase = cfg.resultado_base || 3;
  const bonusMax = cfg.bonus_placar_exato_alto || 5;
  const maxBruto = resBase + bonusMax;

  for (const jogo of (window.SCHEDULE || [])) {
    max += aplicarFator(maxBruto, jogo.fase);
  }
  return Math.round(max * 10) / 10;
}

/**
 * calcularPontosApostador(palpites, resultados, participante, especiais)
 */
function calcularPontosApostador(palpites, resultados, participante, especiais) {
  especiais = especiais || {};
  let total = 0, total_grupos = 0, total_elim = 0;
  let acertos_placar = 0, acertos_placar_alto = 0;
  let acertos_resultado = 0, acertos_bonus1 = 0;
  let erros = 0, sem_palpite = 0, jogos_realizados = 0;
  const jogos = [];

  for (const jogo of (window.SCHEDULE || [])) {
    const resultado = resultados[jogo.id];
    if (!resultado || resultado.homeGoals === undefined) continue;
    jogos_realizados++;

    const palpite = palpites ? palpites[jogo.id] : null;
    if (!palpite || palpite.homeGoals === undefined) {
      sem_palpite++;
      jogos.push({ gameId: jogo.id, fase: jogo.fase, pontos: 0, bonus_tipo: "sem_palpite", detalhe: "Sem palpite", acertou: null });
      continue;
    }

    const brutos = calcularPontosBrutos(palpite, resultado);
    const pontos = aplicarFator(brutos.total_bruto, jogo.fase);

    if (brutos.acertou === false) {
      erros++;
    } else if (brutos.acertou === true) {
      acertos_resultado++; // Todo resultado correto conta
      if (brutos.bonus_tipo === "placar_exato") {
        if (brutos.bonus_pts === (window.CONFIG?.pontuacao?.bonus_placar_exato_alto || 5)) {
          acertos_placar_alto++;
        } else {
          acertos_placar++;
        }
      } else {
        if (brutos.bonus_pts > 0) {
          acertos_bonus1 += brutos.bonus_pts;
        }
      }
    }

    total += pontos;
    if (jogo.fase === "grupos") total_grupos += pontos;
    else total_elim += pontos;

    jogos.push({
      gameId: jogo.id, fase: jogo.fase, pontos,
      total_bruto: brutos.total_bruto,
      bonus_tipo: brutos.bonus_tipo,
      bonus_pts: brutos.bonus_pts,
      detalhe: brutos.descricao,
      acertou: brutos.acertou
    });
  }

  const esp = calcularPontosEspeciais(participante, especiais.campeao, especiais.vice, especiais.terceiro);
  total += esp.total_especiais;

  // Cálculos de porcentagem baseados nos jogos realizados
  const maxPossivel = calcularMaxPontosPossiveis(resultados);
  const pct_pontos = maxPossivel > 0 ? (total / maxPossivel) * 100 : 0;
  const pct_resultado = jogos_realizados > 0 ? (acertos_resultado / jogos_realizados) * 100 : 0;
  const pct_placar = jogos_realizados > 0 ? (acertos_placar / jogos_realizados) * 100 : 0;
  const pct_placar_alto = jogos_realizados > 0 ? (acertos_placar_alto / jogos_realizados) * 100 : 0;
  const pct_bonus1 = jogos_realizados > 0 ? (acertos_bonus1 / jogos_realizados) * 100 : 0;

  return {
    apostadorId: participante.id || participante.token,
    total: Math.round(total * 10) / 10,
    total_grupos: Math.round(total_grupos * 10) / 10,
    total_eliminatorias: Math.round(total_elim * 10) / 10,
    total_especiais: esp.total_especiais,
    especiais_detalhes: esp.detalhes,
    acertos_placar_exato: acertos_placar,
    acertos_placar_alto: acertos_placar_alto,
    acertos_resultado,
    acertos_bonus1,
    erros,
    sem_palpite,
    jogos_realizados,
    // Novos campos de porcentagem padronizados
    pct_pontos: Math.round(pct_pontos * 10) / 10,
    pct_resultado: Math.round(pct_resultado * 10) / 10,
    pct_placar: Math.round(pct_placar * 10) / 10,
    pct_placar_alto: Math.round(pct_placar_alto * 10) / 10,
    pct_bonus1: Math.round(pct_bonus1 * 10) / 10,
    jogos
  };
}

/**
 * gerarRanking(todosOsPalpites, resultados, participantes, especiais)
 * Retorna array ordenado com posicao.
 */
function gerarRanking(todosOsPalpites, resultados, participantes, especiais) {
  especiais = especiais || {};
  const stats = (participantes || []).map(p => ({
    participante: p,
    stats: calcularPontosApostador(todosOsPalpites[p.id] || todosOsPalpites[p.token] || {}, resultados, p, especiais)
  }));

  stats.sort((a, b) => {
    if (b.stats.total !== a.stats.total) return b.stats.total - a.stats.total;
    const totA = a.stats.acertos_placar_exato + a.stats.acertos_placar_alto;
    const totB = b.stats.acertos_placar_exato + b.stats.acertos_placar_alto;
    if (totB !== totA) return totB - totA;
    return b.stats.acertos_resultado - a.stats.acertos_resultado;
  });

  let pos = 1;
  return stats.map((item, i) => {
    if (i > 0 && item.stats.total < stats[i - 1].stats.total) pos = i + 1;
    return { posicao: pos, ...item };
  });
}
// Expor funções internas necessárias para outros módulos
window.calcularPontosBrutos = calcularPontosBrutos;
window.aplicarFator = aplicarFator;
