/** tab-regras.js - Regras do Bolão Copa 2026 */
window.renderRegras = function () {
  const el = document.getElementById("aba-regras");
  if (!el) return;

  const cfg = window.CONFIG?.pontuacao;
  if (!cfg) {
    el.innerHTML = '<div class="card" style="padding:20px;text-align:center;color:var(--vermelho)">Erro: Configurações de pontuação não encontradas (config.js).</div>';
    return;
  }
  const base = cfg.resultado_base;
  const bDiff = cfg.bonus_diferenca_gols;
  const bGols = cfg.bonus_gols_um_time;
  const bBaixo = cfg.bonus_placar_exato_baixo;
  const bAlto = cfg.bonus_placar_exato_alto;
  const limiar = cfg.limiar_placar_alto;

  let h = '<div class="card">';
  h += '<div class="card-titulo">📐 Sistema de Pontuação</div>';
  h += '<div style="display:grid;gap:6px">';

  const items = [
    {
      icon: "✅", cor: "var(--verde-ok)", pts: (base + bBaixo + bAlto) + "", label: "Placar Exato (≥" + limiar + " gols)",
      desc: "Acertou o placar exato E o jogo teve " + limiar + " ou mais gols no total. Ex: apostou 3×2, saiu 3×2.",
      pts_real: String(base + bAlto)
    },
    {
      icon: "🎯", cor: "#86efac", pts: "", label: "Placar Exato (<" + limiar + " gols)",
      desc: "Acertou o placar exato. Ex: apostou 1×0, saiu 1×0.",
      pts_real: String(base + bBaixo)
    },
    {
      icon: "⚡", cor: "var(--dourado)", pts: "", label: "Resultado + Diferença de Gols",
      desc: "Acertou quem ganhou (ou empate) E a diferença de gols. Ex: apostou 2×1, saiu 4×3 (ambos vitória por 1 gol de diferença).",
      pts_real: String(base + bDiff)
    },
    {
      icon: "⚡", cor: "var(--dourado)", pts: "", label: "Resultado + Gols de um Time",
      desc: "Acertou quem ganhou E os gols de um dos times. Ex: apostou 2×1, saiu 2×0 (mandante fez 2 em ambos).",
      pts_real: String(base + bGols)
    },
    {
      icon: "✓", cor: "#94A3B8", pts: "", label: "Resultado Certo",
      desc: "Acertou apenas quem ganhou (ou que empatou). Não acertou gols nem diferença.",
      pts_real: String(base)
    },
    {
      icon: "❌", cor: "#f87171", pts: "", label: "Errou",
      desc: "Resultado diferente do apostado.",
      pts_real: "0"
    },
  ];

  for (const it of items) {
    h += '<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--fundo2);border-radius:var(--radius-sm);border-left:3px solid ' + it.cor + '">';
    h += '<span style="font-size:1.2rem;flex-shrink:0">' + it.icon + '</span>';
    h += '<div style="flex:1"><div style="font-weight:700;font-size:.83rem;color:' + it.cor + '">' + it.label + '</div>';
    h += '<div style="font-size:.72rem;color:var(--texto2);margin-top:2px">' + it.desc + '</div></div>';
    h += '<div style="font-size:1.1rem;font-weight:900;color:' + it.cor + ';min-width:40px;text-align:right">' + it.pts_real + ' pts</div></div>';
  }


  h += '</div>';

  // Multiplicadores
  const fatores = cfg.fatores_fase;
  h += '<div style="margin-top:14px"><div style="font-size:.72rem;font-weight:700;color:var(--texto2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">× Multiplicador por Fase</div>';
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:6px">';
  for (const [nome, id] of [["Grupos", "grupos"], ["32 Avos", "32avos"], ["Oitavas", "oitavas"], ["Quartas", "quartas"], ["Semis", "semis"], ["3° Lugar", "terceiro"], ["Final", "final"]]) {
    const f = fatores[id] ?? 1;
    h += '<div style="text-align:center;padding:8px 6px;background:var(--fundo2);border-radius:var(--radius-sm)">';
    h += '<div style="font-size:.63rem;color:var(--texto2)">' + nome + '</div>';
    h += '<div style="font-size:1.1rem;font-weight:900;color:var(--verde-light)">×' + Number(f).toFixed(1) + '</div>';
    // Exemplo: placar exato alto nessa fase

    h += '</div>';
  }
  h += '</div></div>';

  // Especiais — subseção dentro do card de Pontuação
  const ext = cfg.extras;
  h += '<div style="margin-top:16px;padding-top:2px">';
  h += '<div style="font-size:.72rem;font-weight:700;color:var(--texto2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">⭐ Palpites Especiais (bônus único)</div>';
  h += '<div style="display:grid;gap:6px">';
  for (const [ico, t, d, k] of [["🏆", "Campeão", "Acertou o campeão do mundial", "primeiro_lugar"], ["🥈", "Vice", "Acertou o vice-campeão", "segundo_lugar"], ["🥉", "3° Lugar", "Acertou o terceiro colocado", "terceiro_lugar"]]) {
    h += '<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--fundo2);border-radius:var(--radius-sm)">';
    h += '<span style="font-size:1.2rem">' + ico + '</span>';
    h += '<div style="flex:1"><div style="font-weight:700;font-size:.82rem">' + t + '</div>';
    h += '<div style="font-size:.72rem;color:var(--texto2)">' + d + '</div></div>';
    h += '<div style="font-weight:900;color:var(--dourado)">+' + (ext[k]) + ' pts</div></div>';
  }
  h += '</div></div>';

  h += '</div>';

  // Premiação
  const premiacoes = [
    { pos: 1, emoji: "🥇", label: "1° Lugar", desc: "Campeão do Bolão", pct: 40, cor: "#F5C842" },
    { pos: 2, emoji: "🥈", label: "2° Lugar", desc: "Vice-campeão", pct: 25, cor: "#94A3B8" },
    { pos: 3, emoji: "🥉", label: "3° Lugar", desc: "3° Colocado", pct: 18, cor: "#CD7C2F" },
    { pos: 4, emoji: "🏅", label: "4° Lugar", desc: "4° Colocado", pct: 10, cor: "#B87333" },
    { pos: 5, emoji: "🎖️", label: "5° Lugar", desc: "5° Colocado", pct: 7, cor: "#8B9DC3" },
  ];
  h += '<div class="card"><div class="card-titulo">🏅 Premiação</div>';
  h += '<div style="display:grid;gap:6px">';
  for (const pr of premiacoes) {
    h += '<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--fundo2);border-radius:var(--radius-sm);border-left:4px solid ' + pr.cor + '">';
    h += '<span style="font-size:1.3rem;flex-shrink:0">' + pr.emoji + '</span>';
    h += '<div style="flex:1">';
    h += '<div style="font-weight:800;font-size:.85rem;color:' + pr.cor + '">' + pr.label + '</div>';
    h += '<div style="font-size:.72rem;color:var(--texto2);margin-top:2px">' + pr.desc + '</div>';
    h += '</div>';
    h += '<div style="text-align:right;flex-shrink:0">';
    h += '<div style="font-size:1.15rem;font-weight:900;color:' + pr.cor + '">' + pr.pct + '%</div>';
    h += '<div style="font-size:.62rem;color:var(--texto2);margin-top:1px">do montante</div>';
    h += '</div>';
    h += '</div>';
  }
  h += '<div style="font-size:.71rem;color:var(--texto2);padding:10px 14px;background:var(--fundo2);border-radius:var(--radius-sm);margin-top:2px;line-height:1.6">';
  h += '💡 Os prêmios são calculados sobre o <strong>montante total arrecadado</strong> pelo bolão.<br><br>';
  h += '🔢 <strong>Critérios de desempate</strong> (em ordem): 1. Total de placares exatos &nbsp;·&nbsp; 2. Total de resultados corretos. Se persistir o empate, os apostadores dividem o prêmio das posições empatadas em partes iguais.';
  h += '</div>';
  h += '</div></div>';

  // FAQ
  h += '<div class="card"><div class="card-titulo">❓ Perguntas Frequentes</div><div style="display:grid;gap:5px">';
  const faqs = [
    // --- PONTUAÇÃO ---
    ["Como faço para entrar no bolão e apostar?",
      "Entre em contato com um admin ou tesoureiro. Após pagar, você receberá um <strong>token personalizado</strong> enviado pelo administrador do bolão. Basta abrir o link de apostas, colocar seu token e preencher seus palpites. Não é necessário criar conta ou senha.<br><br>" +
      "🔗 <a href=\"https://ciclopeestrabico.github.io/bolao-copa-2026/aposta.html\" target=\"_blank\" style=\"color:var(--verde-light)\">ciclopeestrabico.github.io/bolao-copa-2026/aposta.html</a>"],
    ["O que é acertar o RESULTADO?",
      "Acertar o resultado significa adivinhar quem venceu — ou que empatou.<br><br>Ex: apostou Brasil 2×0 e saiu Brasil 3×1. Ambos são vitória do Brasil → <strong>resultado correto = " + base + " pts</strong>."],
    ["O que é acertar o PLACAR EXATO?",
      "Significa adivinhar o placar final com o número exato de gols de cada time.<br><br>Ex: apostou <strong>2×1</strong> e saiu <strong>2×1</strong>. Com menos de " + limiar + " gols no total = <strong>" + (base + bBaixo) + " pts</strong>. Com " + limiar + " ou mais gols = <strong>" + (base + bAlto) + " pts</strong>."],
    ["Como funciona o bônus por diferença de gols?",
      "Se você acertou quem ganhou E a diferença de gols (ex: apostou 2×1, saiu 3×2 — ambos por 1 gol), ganha " + base + "+" + bDiff + " = <strong>" + (base + bDiff) + " pts</strong>." +
      "<br><br>Veja que se você acertou um empate, mas sem ser placar exato, essa regra também se aplica e você recebe 1 ponto de bônus =  4pts."],
    ["Como funciona o bônus por gols de um time?",
      "Se você acertou quem ganhou E o número de gols de um time (ex: apostou 2×1, saiu 3×1 — ambos com 1 gol do visitante), ganha " + base + "+" + bDiff + " = <strong>" + (base + bDiff) + " pts</strong>."],
    ["Os bônus se somam? Posso acumular diferença de gols + gols de um time?",
      "Não. Os bônus são <strong>excludentes</strong> — você recebe apenas o maior bônus alcançado.<br><br>" +
      "Se acertou a diferença de gols E os gols de um time ao mesmo tempo, isso significa que você acertou o <strong>placar exato</strong>. O sistema reconhece automaticamente e aplica o bônus de placar exato (maior), não dois bônus separados."],
    ["O que acontece se o jogo vai para a prorrogação? E para os pênaltis?",
      "O placar considerado é o do tempo regulamentar mais a prorrogação. Se o jogo for para os pênaltis, acerta quem chutou o empate. Ou seja, os pênaltis não contam para o bolão."],
    ["Quais os critérios de DESEMPATE para premiação do bolão?",
      "Caso dois ou mais apostadores terminem com a mesma pontuação, os critérios de desempate são:<br><br>" +
      "1. <strong>Total de Placares Exatos</strong> (soma de acertos com bônus +3 e +5).<br>" +
      "2. <strong>Total de Resultados Corretos</strong> (vitória/empate acertados).<br><br>" +
      "Se o empate persistir após esses critérios, os apostadores dividem a mesma posição."],
    // --- APOSTAS E PRAZOS ---
    ["Tenho que apostar todos os jogos logo no começo do bolão?",
      "Não! Somente a <strong>fase de grupos</strong> e os <strong>palpites especiais</strong> (campeão, vice e 3º lugar) precisam ser preenchidos antes do início da Copa.<br><br>" +
      "As apostas das demais fases eliminatórias serão abertas gradualmente: os administradores liberam cada fase (32 avos, oitavas, quartas, semifinais, finais) em horário predeterminado, antes do início dos jogos daquela fase."],
    ["Quais são as fases de apostas?",
      "São <strong>6 fases</strong> no total: Grupos, 32 Avos de Final, Oitavas de Final, Quartas de Final, Semifinais e Finais.<br><br>" +
      "Além disso, os <strong>palpites especiais</strong> (campeão, vice, 3º lugar) são preenchidos separadamente, junto com a fase de grupos."],
    ["Como funcionam os palpites especiais (campeão, vice, 3° lugar)?",
      "Os palpites especiais são apostas únicas feitas <strong>junto com a fase de grupos</strong> — e não podem ser alterados depois que as apostas de grupos forem encerradas.<br><br>" +
      "Você escolhe qual seleção será campeã, vice-campeã e terceiro colocado. Se acertar, ganha pontos bônus conforme a tabela da seção Palpites Especiais.<br><br>" +
      "Assim que o admin encerrar as apostas da fase de grupos, os especiais também ficam bloqueados. Palpites especiais não preenchidos valem <strong>zero pontos</strong>."],
    ["Posso alterar meu palpite?",
      "Sim, até o prazo limite de cada fase. Após o prazo limite, os palpites daquela fase ficam bloqueados. Fique atento aos prazos determinados pelo administrador do bolão."],
    ["Esqueci de preencher algum jogo. E agora?",
      "Se as apostas da fase <strong>ainda estiverem abertas</strong>, você pode entrar no link da sua aposta e preencher normalmente a qualquer momento.<br><br>" +
      "Se o prazo já encerrou, não é possível mais alterar — os palpites não preenchidos valem <strong>zero pontos</strong> naquele jogo."],
    ["Perdi meu token. E agora?",
      "Fale com um dos <strong>administradores do bolão</strong>. Eles conseguem acessar o painel admin e recuperar o link da sua aposta com o seu token."],
    // --- PARTICIPAÇÃO ---
    ["Todos veem os palpites dos outros?",
      "Sim! Na aba Compilação você vê os palpites de todos — mas apenas dos jogos cujas apostas <strong>já foram encerradas</strong>. Enquanto as apostas estão abertas, os palpites ficam ocultos (🔒) para manter o jogo justo."],
    // --- COPA 2026 ---
    ["Como são os melhores terceiros na classificação de grupos? É novidade isso para essa copa?",
      "Sim! Na Copa 2026 com 12 grupos, os 8 melhores 3ºs colocados avançam. O critério é: pontos → saldo de gols → gols marcados."],
    ["Por que existe a fase de '32 Avos de Final'? Nunca vi isso em Copas anteriores.",
      "A Copa do Mundo de 2026 tem um formato novo: <strong>48 seleções</strong> participam, divididas em <strong>12 grupos de 4 times</strong>.<br><br>" +
      "Os 2 melhores de cada grupo avançam automaticamente (24 classificados), mais os <strong>8 melhores terceiros colocados</strong> — totalizando <strong>32 times</strong> na fase eliminatória.<br><br>" +
      "Como são 32 times nessa rodada, ela se chama <strong>32 Avos de Final</strong> (cada time disputa 1/32 da fase eliminatória). A partir daí o formato é o clássico: Oitavas → Quartas → Semifinais → Final."],
    // --- MULTIPLICADORES ---
    ["Como funciona o multiplicador de fase?",
      "Cada fase tem um multiplicador que <strong>amplifica</strong> os pontos ganhos nos jogos daquela fase. A pontuação bruta (resultado, bônus etc.) é multiplicada por esse fator.<br><br>" +
      "Exemplo: você acertou o placar exato nas Oitavas de Final, que vale " + (base + bBaixo) + " pts base. Com o multiplicador ×" + Number(cfg.fatores_fase?.oitavas ?? 1).toFixed(1) + ", você recebe " + (base + bBaixo) + " × " + Number(cfg.fatores_fase?.oitavas ?? 1).toFixed(1) + " = <strong>" + ((base + bBaixo) * (cfg.fatores_fase?.oitavas ?? 1)).toFixed(1) + " pts</strong>.<br><br>" +
      "Os multiplicadores estão na tabela da seção de Pontuação. Quanto mais avançada a fase, maior o multiplicador — tornando os jogos finais muito mais decisivos para a classificação."],
    // --- TRANSPARÊNCIA ---
    ["Como garanto que algum admin não vai mudar alguma aposta minha ou de outro jogador?",
      "Os botões de <strong>Exportar CSV</strong> e <strong>Exportar JSON</strong> na aba Compilação estão disponíveis exatamente para isso.<br><br>" +
      "Antes de cada fase começar — quando as apostas já estiverem bloqueadas — todos os participantes podem salvar uma cópia dos palpites para conferência e backup. Guarde seus exports e compare ao final se tiver dúvidas."],
    // --- MODELO ---
    ["O que é esse apostador \"MODELO\"? Ele está competindo?",
      "Não. O MODELO é uma <strong>referência estatística</strong> e não participa da classificação do bolão — seus palpites não valem pontos reais nem afetam a posição de ninguém.<br><br>" +
      "Ele serve como régua de comparação: se você estiver acima do MODELO, está se saindo bem; abaixo, talvez valha revisar suas estratégias. 😄<br><br>" +
      "Os palpites do MODELO são gerados automaticamente antes de cada fase, com base em três camadas combinadas:<br>" +
      "<ul style=\"margin:8px 0 0 16px;padding:0;list-style:disc\">" +
      "<li style=\"margin-bottom:4px\"><strong>ELO Rating</strong> — força histórica de cada seleção atualizada jogo a jogo, usada como prior para estimar a probabilidade de vitória.</li>" +
      "<li style=\"margin-bottom:4px\"><strong>Rede Neural GRU</strong> — aprende padrões temporais de desempenho recente das seleções para ajustar os ratings puros de ELO.</li>" +
      "<li><strong>Distribuição Dixon-Coles</strong> — modelo estatístico de contagem de gols que gera uma matriz de probabilidade para cada placar possível, corrigindo o viés de empates de 0×0.</li>" +
      "</ul><br>" +
      "A partir dessa matriz, o MODELO escolhe para cada jogo o placar que <em>maximiza o valor esperado de pontos</em> no sistema de pontuação do bolão — não necessariamente o placar mais provável."],
  ];
  for (const [q, a] of faqs) {
    h += '<details style="background:var(--fundo2);border-radius:var(--radius-sm);overflow:hidden">';
    h += '<summary style="padding:10px 14px;cursor:pointer;font-size:.81rem;font-weight:600;list-style:none;display:flex;justify-content:space-between">' + q + '<span style="color:var(--texto2)">＋</span></summary>';
    h += '<div style="padding:10px 14px 12px;font-size:.77rem;color:var(--texto2);line-height:1.65;border-top:1px solid var(--borda)">' + a + '</div></details>';
  }
  h += '</div></div>';

  el.innerHTML = h;
};