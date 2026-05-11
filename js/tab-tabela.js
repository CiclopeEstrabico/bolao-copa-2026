/** tab-tabela.js - Bracket visual do torneio */
window.renderTabela = function() {
  const el = document.getElementById("aba-tabela");
  if (!el) return;
  const res = getResultados();
  const br = APP.bracket || {};

  function card(gameId) {
    const b = br[gameId]||{};
    const j = window.SCHEDULE_BY_ID[gameId]||{};
    const r = res[gameId];
    const hC = b.home; const aC = b.away;
    const hN = window.TEAMS_BY_CODE[hC]?.name || window.BRACKET.descricaoPosicao(b.homePos||"") || "?";
    const aN = window.TEAMS_BY_CODE[aC]?.name || window.BRACKET.descricaoPosicao(b.awayPos||"") || "?";
    const temRes = r && r.homeGoals !== undefined;
    let hWin=false, aWin=false;
    if (temRes) {
      if (r.homeGoals>r.awayGoals||r.penaltis_vencedor==="home") hWin=true;
      else if (r.awayGoals>r.homeGoals||r.penaltis_vencedor==="away") aWin=true;
    }
    const placarH = temRes ? r.homeGoals : "–";
    const placarA = temRes ? r.awayGoals : "–";
    const data = j.utc ? formatarDataBRT(j.utc,false) : "";
    return `<div class="bracket-card" onclick="PROGNOSE.abrirModal('${gameId}')">
      <div class="bracket-data">${data}</div>
      <div class="bracket-time ${hWin?'winner':aWin?'loser':''}">${htmlBandeira(hC,14)}<span>${hN}</span><span class="bracket-gol">${placarH}</span></div>
      <div class="bracket-time ${aWin?'winner':hWin?'loser':''}">${htmlBandeira(aC,14)}<span>${aN}</span><span class="bracket-gol">${placarA}</span></div>
    </div>`;
  }

  // Derivar a ordem dos 32avos a partir de quem alimenta cada oitava
  // R16_1: WR32_2, WR32_5 → R32_2 e R32_5 ficam alinhados com R16_1
  const r16Template = window.BRACKET.BRACKET_TEMPLATE_R16;
  const r8Template  = window.BRACKET.BRACKET_TEMPLATE_QF;
  const r4Template  = window.BRACKET.BRACKET_TEMPLATE_SF;

  // Ordem das oitavas agrupadas por quarta
  const r16Order = [];
  for (const qfId of ['QF_1','QF_2','QF_3','QF_4']) {
    const qf = r8Template[qfId];
    r16Order.push([qf.home.replace('WR16_','R16_'), qf.away.replace('WR16_','R16_')]);
  }

  // Ordem das quartas agrupadas por semi
  const sfOrder = [];
  for (const sfId of ['SF_1','SF_2']) {
    const sf = r4Template[sfId];
    sfOrder.push([sf.home.replace('WQF_','QF_'), sf.away.replace('WQF_','QF_')]);
  }

  // Ordem dos 32avos: para cada R16 na ordem acima, extrair os dois R32 que o alimentam
  const r32Order = [];
  for (const [h16, a16] of r16Order) {
    for (const r16Id of [h16, a16]) {
      const r16 = r16Template[r16Id];
      r32Order.push([r16.home.replace('WR32_','R32_'), r16.away.replace('WR32_','R32_')]);
    }
  }

  function col32avos() {
    let h = '';
    for (let i = 0; i < r32Order.length; i++) {
      const [r32a, r32b] = r32Order[i];
      if (i > 0) h += '<div class="bracket-spacer"></div>';
      h += card(r32a);
      h += '<div class="bracket-spacer" style="height:4px"></div>';
      h += card(r32b);
    }
    return h;
  }

  function colOitavas() {
    let h = '';
    for (let i = 0; i < r16Order.length; i++) {
      const [r16a, r16b] = r16Order[i];
      if (i > 0) h += '<div class="bracket-spacer"></div>';
      h += card(r16a);
      h += '<div class="bracket-spacer" style="height:4px"></div>';
      h += card(r16b);
    }
    return h;
  }

  function colQuartas() {
    let h = '';
    for (let i = 0; i < sfOrder.length; i++) {
      const [qfa, qfb] = sfOrder[i];
      if (i > 0) h += '<div class="bracket-spacer"></div>';
      h += card(qfa);
      h += '<div class="bracket-spacer" style="height:4px"></div>';
      h += card(qfb);
    }
    return h;
  }

  let h = '<div class="bracket-scroll">';

  // 32 avos
  h += '<div class="bracket-fase"><div class="bracket-fase-label">32 Avos</div><div class="bracket-coluna">';
  h += col32avos();
  h += '</div></div>';

  // Oitavas
  h += '<div class="bracket-fase"><div class="bracket-fase-label">Oitavas</div><div class="bracket-coluna">';
  h += colOitavas();
  h += '</div></div>';

  // Quartas
  h += '<div class="bracket-fase"><div class="bracket-fase-label">Quartas</div><div class="bracket-coluna">';
  h += colQuartas();
  h += '</div></div>';

  // Semis
  h += '<div class="bracket-fase"><div class="bracket-fase-label">Semis</div><div class="bracket-coluna">';
  h += card('SF_1');
  h += '<div class="bracket-spacer"></div>';
  h += card('SF_2');
  h += '</div></div>';

  // Final + 3o
  h += '<div class="bracket-fase"><div class="bracket-fase-label">Final</div><div class="bracket-coluna">';
  h += card('FNL');
  h += '<div class="bracket-spacer"></div><div class="bracket-spacer"></div>';
  h += '<div style="font-size:.65rem;color:var(--texto2);text-align:center;margin:4px 0">3° Lugar</div>';
  h += card('TPL');
  h += '</div></div>';

  h += '</div>'; // bracket-scroll

  // Hint de scroll — aparece só em mobile, some ao primeiro scroll
  h += '<div id="bracket-scroll-hint" style="display:none;text-align:center;font-size:.68rem;color:var(--texto2);padding:4px 0 8px;letter-spacing:.03em">← deslize para ver todas as fases →</div>';

  // Fase de grupos compacta acima
  h = '<details style="margin-bottom:10px"><summary style="cursor:pointer;padding:8px 12px;background:var(--fundo2);border-radius:var(--radius-sm);font-size:.78rem;font-weight:700">Ver classificação dos grupos ▼</summary>' +
    '<div class="card" style="margin-top:6px;padding:10px">' +
    renderGruposGrid(window.BRACKET.calcularTodosOsGrupos(res), res) +
    '</div></details>' + h;

  el.innerHTML = h;

  // Exibe hint só em mobile e esconde ao scrollar
  if (window.innerWidth < 768) {
    const hint = document.getElementById("bracket-scroll-hint");
    const scroll = el.querySelector(".bracket-scroll");
    if (hint && scroll) {
      hint.style.display = "block";
      scroll.addEventListener("scroll", () => { hint.style.display = "none"; }, { once: true, passive: true });
    }
  }
};