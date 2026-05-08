/** tab-regras.js - Regras do Bolão Copa 2026 */
window.renderRegras = function () {
  const el = document.getElementById("aba-regras");
  if (!el) return;

  const cfg = window.CONFIG?.pontuacao;
  const base = cfg?.resultado_base ?? 3;
  const bDiff = cfg?.bonus_diferenca_gols ?? 1;
  const bGols = cfg?.bonus_gols_um_time ?? 1;
  const bBaixo = cfg?.bonus_placar_exato_baixo ?? 3;
  const bAlto = cfg?.bonus_placar_exato_alto ?? 5;
  const limiar = cfg?.limiar_placar_alto ?? 4;

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
  const fatores = cfg?.fatores_fase || { grupos: 1, "32avos": 1.2, oitavas: 1.4, quartas: 1.6, semis: 1.8, terceiro: 1.8, final: 2.0 };
  h += '<div style="margin-top:14px"><div style="font-size:.72rem;font-weight:700;color:var(--texto2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">× Multiplicador por Fase</div>';
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:6px">';
  for (const [nome, id] of [["Grupos", "grupos"], ["32 Avos", "32avos"], ["Oitavas", "oitavas"], ["Quartas", "quartas"], ["Semis", "semis"], ["3° Lugar", "terceiro"], ["Final", "final"]]) {
    const f = fatores[id] ?? 1;
    h += '<div style="text-align:center;padding:8px 6px;background:var(--fundo2);border-radius:var(--radius-sm)">';
    h += '<div style="font-size:.63rem;color:var(--texto2)">' + nome + '</div>';
    h += '<div style="font-size:1.1rem;font-weight:900;color:var(--verde-light)">×' + f + '</div>';
    // Exemplo: placar exato alto nessa fase
    h += '<div style="font-size:.6rem;color:var(--texto2)">Exato alto: ' + (Math.round((base + bAlto) * f * 10) / 10) + ' pts</div>';
    h += '</div>';
  }
  h += '</div></div></div>';

  // Especiais
  const ext = cfg?.extras || { primeiro_lugar: 7, segundo_lugar: 4, terceiro_lugar: 2 };
  h += '<div class="card"><div class="card-titulo">⭐ Palpites Especiais</div>';
  h += '<div style="display:grid;gap:6px">';
  for (const [ico, t, d, k] of [["🏆", "Campeão", "Acertou o campeão do mundial", "primeiro_lugar"], ["🥈", "Vice", "Acertou o vice-campeão", "segundo_lugar"], ["🥉", "3° Lugar", "Acertou o terceiro colocado", "terceiro_lugar"]]) {
    h += '<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--fundo2);border-radius:var(--radius-sm)">';
    h += '<span style="font-size:1.2rem">' + ico + '</span>';
    h += '<div style="flex:1"><div style="font-weight:700;font-size:.82rem">' + t + '</div>';
    h += '<div style="font-size:.72rem;color:var(--texto2)">' + d + '</div></div>';
    h += '<div style="font-weight:900;color:var(--dourado)">+' + (ext[k] || 0) + ' pts</div></div>';
  }
  h += '</div></div>';

  // FAQ
  h += '<div class="card"><div class="card-titulo">❓ Perguntas Frequentes</div><div style="display:grid;gap:5px">';
  const faqs = [
    ["O que é acertar o RESULTADO?",
      "Acertar o resultado significa adivinhar quem venceu — ou que empatou.<br><br>Ex: apostou Brasil 2×0 e saiu Brasil 3×1. Ambos são vitória do Brasil → <strong>resultado correto = " + base + " pts</strong>."],
    ["O que é acertar o PLACAR EXATO?",
      "Significa adivinhar o placar final com o número exato de gols de cada time.<br><br>Ex: apostou <strong>2×1</strong> e saiu <strong>2×1</strong>. Com menos de " + limiar + " gols no total = <strong>+" + (base + bBaixo) + " pts</strong>. Com " + limiar + " ou mais gols = <strong>+" + (base + bAlto) + " pts</strong>."],
    ["Como funciona a diferença de gols?",
      "Se você acertou quem ganhou E a diferença de gols (ex: apostou 2×1, saiu 3×2 — ambos por 1 gol), ganha " + base + "+" + bDiff + " = <strong>" + (base + bDiff) + " pts</strong>."],
    ["O que acontece se o jogo vai para a prorrogação?",
      "O placar considerado é o do tempo regulamentar mais a prorrogação. Se o jogo for para os pênaltis, acerta quem chutou o empate. Ou seja, os pênaltis não contam para o bolão."],
    ["Posso alterar meu palpite?",
      "Sim, até o prazo limite de cada fase. Após o prazo limite, os palpites daquela fase ficam bloqueados."],
    ["Como são os melhores terceiros?",
      "Na Copa 2026 com 12 grupos, os 8 melhores 3ºs colocados avançam. O critério é: pontos → saldo de gols → gols marcados."],
    ["Todos veem os palpites dos outros?",
      "Sim! Na aba Compilação você vê os palpites de todos. Faz parte da diversão! 😄"],
  ];
  for (const [q, a] of faqs) {
    h += '<details style="background:var(--fundo2);border-radius:var(--radius-sm);overflow:hidden">';
    h += '<summary style="padding:10px 14px;cursor:pointer;font-size:.81rem;font-weight:600;list-style:none;display:flex;justify-content:space-between">' + q + '<span style="color:var(--texto2)">＋</span></summary>';
    h += '<div style="padding:10px 14px 12px;font-size:.77rem;color:var(--texto2);line-height:1.65;border-top:1px solid var(--borda)">' + a + '</div></details>';
  }
  h += '</div></div>';

  // Premiação
  h += '<div class="card"><div class="card-titulo">🏅 Premiação</div>';
  h += '<div style="display:grid;gap:6px">';
  for (const [pos, desc, cor] of [["🥇 1° Lugar", "Campeão do Bolão", "var(--dourado)"], ["🥈 2° Lugar", "Vice-campeão", "#94A3B8"], ["🥉 3° Lugar", "3° Colocado", "#CD7C2F"]]) {
    h += '<div style="display:flex;align-items:center;gap:12px;padding:9px 12px;background:var(--fundo2);border-radius:var(--radius-sm);border-left:3px solid ' + cor + '">';
    h += '<span style="font-weight:800;color:' + cor + '">' + pos + '</span>';
    h += '<span style="font-size:.78rem;color:var(--texto2)">' + desc + '</span></div>';
  }
  h += '<div style="font-size:.71rem;color:var(--texto2);padding:8px 12px;background:var(--fundo2);border-radius:var(--radius-sm);margin-top:2px">💡 Valores definidos pelo organizador antes do torneio.</div>';
  h += '</div></div>';

  el.innerHTML = h;
};