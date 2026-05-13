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
  const cfg = window.CONFIG?.pontuacao;
  if (!cfg) return { total_bruto: 0, base: 0, bonus_pts: 0, bonus_tipo: null, descricao: "Erro Config", acertou: false };

  if (!resultado || resultado.homeGoals === undefined) {
    return { total_bruto: 0, base: 0, bonus_pts: 0, bonus_tipo: null, descricao: "Aguardando resultado", acertou: null };
  }

  const Hp = Number(palpite.homeGoals);
  const Ap = Number(palpite.awayGoals);
  const Hr = Number(resultado.homeGoals);
  const Ar = Number(resultado.awayGoals);

  // Pênaltis são IGNORADOS para efeito de pontuação.
  // O placar considerado é sempre o de 90min + prorrogação (homeGoals x awayGoals).
  // foi_penaltis só serve para avançar o time correto no bracket — não muda nada aqui.
  const res_ef  = _vencedor(Hr, Ar);
  const res_pal = _vencedor(Hp, Ap);

  if (res_pal !== res_ef) {
    return { total_bruto: 0, base: 0, bonus_pts: 0, bonus_tipo: "erro", descricao: "Resultado errado", acertou: false };
  }

  // Placar exato
  if (Hp === Hr && Ap === Ar) {
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

  // Bônus de diferença de gols ou gols de um time
  const acertou_diff = Math.abs(Hp - Ap) === Math.abs(Hr - Ar);
  const acertou_gols = Hp === Hr || Ap === Ar;
  let bonus = 0;
  const tipos = [];
  if (acertou_diff) { bonus = cfg.bonus_diferenca_gols; tipos.push("diferenca"); }
  else if (acertou_gols) { bonus = cfg.bonus_gols_um_time; tipos.push("gols"); }

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
/**
 * calcularMaxPontosPossiveis(resultados)
 * Denominador das estatísticas individuais (pct_pontos, "% dos Pontos Possíveis").
 * Para cada jogo JÁ REALIZADO usa o bônus máximo real possível naquele jogo:
 *   - total de gols >= limiar_placar_alto → base + bonus_alto  (ex: 3+5 = 8 × fator)
 *   - total de gols <  limiar_placar_alto → base + bonus_baixo (ex: 3+3 = 6 × fator)
 * Jogos ainda não realizados NÃO entram — só o que já esteve em jogo conta.
 * Especiais entram apenas quando o resultado oficial existir.
 */
function calcularMaxPontosPossiveis(resultados) {
  let max = 0;
  const cfg = window.CONFIG?.pontuacao;
  if (!cfg) return 0;
  const limiar = cfg.limiar_placar_alto ?? 4;

  for (const jogo of (window.SCHEDULE || [])) {
    const r = resultados[jogo.id];
    if (!r || r.homeGoals === undefined) continue;
    // Pênaltis ignorados para pontuação — usa o placar de 90min+prorrogação normalmente.
    const totalGols = Number(r.homeGoals) + Number(r.awayGoals);
    const maxBruto = totalGols >= limiar
      ? cfg.resultado_base + cfg.bonus_placar_exato_alto
      : cfg.resultado_base + cfg.bonus_placar_exato_baixo;
    max += aplicarFator(maxBruto, jogo.fase);
  }

  // Especiais entram apenas quando oficializados
  const esp = cfg.extras || {};
  if (resultados["FNL"]?.homeGoals !== undefined) {
    max += (esp.primeiro_lugar ?? 0) + (esp.segundo_lugar ?? 0);
  }
  if (resultados["TPL"]?.homeGoals !== undefined) {
    max += (esp.terceiro_lugar ?? 0);
  }

  return Math.round(max * 10) / 10;
}

/**
 * calcularPontosAindaEmJogo(resultados)
 * Usado no card "Pontos em Jogo" da classificação.
 * Retorna tudo que AINDA PODE ser ganho: jogos sem resultado oficial
 * valem o máximo teórico (base + bonus_alto × fator) + especiais ainda
 * não oficializados (também ao máximo).
 */
function calcularPontosAindaEmJogo(resultados) {
  let emJogo = 0;
  const cfg = window.CONFIG?.pontuacao;
  if (!cfg) return 0;
  const maxBruto = cfg.resultado_base + cfg.bonus_placar_exato_alto;

  for (const jogo of (window.SCHEDULE || [])) {
    const r = resultados[jogo.id];
    if (r && r.homeGoals !== undefined) continue; // já realizado — fora
    emJogo += aplicarFator(maxBruto, jogo.fase);
  }

  // Especiais só entram se ainda não foram oficializados
  const esp = cfg.extras || {};
  if (!resultados["FNL"] || resultados["FNL"].homeGoals === undefined) {
    emJogo += (esp.primeiro_lugar ?? 0) + (esp.segundo_lugar ?? 0);
  }
  if (!resultados["TPL"] || resultados["TPL"].homeGoals === undefined) {
    emJogo += (esp.terceiro_lugar ?? 0);
  }

  return Math.round(emJogo * 10) / 10;
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
  // jogos_com_palpite: jogos realizados em que o apostador tinha palpite.
  // É o denominador correto para todas as porcentagens por jogo.
  let jogos_com_palpite = 0;
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

    jogos_com_palpite++;
    const brutos = calcularPontosBrutos(palpite, resultado);
    const pontos = aplicarFator(brutos.total_bruto, jogo.fase);

    if (brutos.acertou === false) {
      erros++;
    } else if (brutos.acertou === true) {
      acertos_resultado++; // Todo resultado correto conta
      if (brutos.bonus_tipo === "placar_exato") {
        if (brutos.bonus_pts === (window.CONFIG?.pontuacao?.bonus_placar_exato_alto)) {
          acertos_placar_alto++;
        } else {
          acertos_placar++;
        }
      } else {
        // acertos_bonus1: contagem de jogos onde o apostador acertou o resultado
        // E recebeu algum dos bônus+1 (diferença de gols ou gols de um time).
        // Os dois tipos de bônus+1 não se acumulam entre si.
        if (brutos.bonus_pts > 0) {
          acertos_bonus1++;
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

  // Porcentagens: denominador é jogos_com_palpite (exclui sem_palpite),
  // exceto pct_pontos que compara com o máximo teórico do campeonato.
  const maxPossivel = calcularMaxPontosPossiveis(resultados);
  const pct_pontos    = maxPossivel > 0 ? (total / maxPossivel) * 100 : 0;
  const pct_resultado = jogos_com_palpite > 0 ? (acertos_resultado / jogos_com_palpite) * 100 : 0;
  const pct_placar    = jogos_com_palpite > 0 ? (acertos_placar    / jogos_com_palpite) * 100 : 0;
  const pct_placar_alto = jogos_com_palpite > 0 ? (acertos_placar_alto / jogos_com_palpite) * 100 : 0;
  const pct_bonus1    = jogos_com_palpite > 0 ? (acertos_bonus1    / jogos_com_palpite) * 100 : 0;

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
    jogos_com_palpite,
    // Porcentagens padronizadas (denominador: jogos_com_palpite)
    pct_pontos:      Math.round(pct_pontos      * 10) / 10,
    pct_resultado:   Math.round(pct_resultado   * 10) / 10,
    pct_placar:      Math.round(pct_placar      * 10) / 10,
    pct_placar_alto: Math.round(pct_placar_alto * 10) / 10,
    pct_bonus1:      Math.round(pct_bonus1      * 10) / 10,
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
    if (i > 0) {
      const prev = stats[i - 1].stats;
      const cur  = item.stats;
      // Reaplica os mesmos 3 critérios do sort para decidir se a posição muda
      const mesmoPts    = cur.total === prev.total;
      const mesmoExatos = (cur.acertos_placar_exato + cur.acertos_placar_alto) ===
                          (prev.acertos_placar_exato + prev.acertos_placar_alto);
      const mesmoRes    = cur.acertos_resultado === prev.acertos_resultado;
      if (!(mesmoPts && mesmoExatos && mesmoRes)) pos = i + 1;
    }
    return { posicao: pos, ...item };
  });
}
// Expor funções internas necessárias para outros módulos
window.calcularPontosBrutos = calcularPontosBrutos;
window.aplicarFator = aplicarFator;
