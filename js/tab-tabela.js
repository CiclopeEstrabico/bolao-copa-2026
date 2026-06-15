/** tab-tabela.js - Bracket visual do torneio */
window.renderTabela = function() {
  const el = document.getElementById("aba-tabela");
  if (!el) return;
  const res = getResultados();
  const br = APP.bracket || {};
  const isMob = window.innerWidth <= 600;

  /* ── Helpers de texto curto para posições ── */
  function posShort(pos) {
    if (!pos) return "?";
    // "1A" → "1°A", "2B" → "2°B"
    const gm = pos.match(/^([12])([A-L])$/);
    if (gm) return gm[1] + "°" + gm[2];
    // "3X1"→"3°" (slot genérico de terceiro colocado)
    if (/^3X\d$/.test(pos)) return "3°";
    // Later rounds: WR32_5 → "?"  (obvious from positioning)
    if (pos.startsWith("W") || pos.startsWith("L")) return "?";
    return pos;
  }

  /* ── Card: desktop (full) ── */
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
    return `<div class="bracket-card" title="Ver prognose e detalhes do jogo" onclick="PROGNOSE.abrirModal('${gameId}')">
      <div class="bracket-data">${data}</div>
      <div class="bracket-time ${hWin?'winner':aWin?'loser':''}">${htmlBandeira(hC,14)}<span title="${hN}">${hN}</span><span class="bracket-gol">${placarH}</span></div>
      <div class="bracket-time ${aWin?'winner':hWin?'loser':''}">${htmlBandeira(aC,14)}<span title="${aN}">${aN}</span><span class="bracket-gol">${placarA}</span></div>
    </div>`;
  }

  /* ── Card: mobile (compact) — flag + code + score ── */
  function cardMob(gameId) {
    const b = br[gameId]||{};
    const r = res[gameId];
    const hC = b.home; const aC = b.away;
    // Display: 3-letter code if team is known, else short position
    const hLabel = hC ? (window.TEAMS_BY_CODE[hC]?.code || hC) : posShort(b.homePos);
    const aLabel = aC ? (window.TEAMS_BY_CODE[aC]?.code || aC) : posShort(b.awayPos);
    const temRes = r && r.homeGoals !== undefined;
    let hWin=false, aWin=false;
    if (temRes) {
      if (r.homeGoals>r.awayGoals||r.penaltis_vencedor==="home") hWin=true;
      else if (r.awayGoals>r.homeGoals||r.penaltis_vencedor==="away") aWin=true;
    }
    const placarH = temRes ? r.homeGoals : "";
    const placarA = temRes ? r.awayGoals : "";
    const hFull = window.TEAMS_BY_CODE[hC]?.name || hLabel;
    const aFull = window.TEAMS_BY_CODE[aC]?.name || aLabel;
    return `<div class="bracket-card-mob" onclick="PROGNOSE.abrirModal('${gameId}')">
      <div class="bracket-time-mob ${hWin?'winner':aWin?'loser':''}">${htmlBandeira(hC,12)}<span class="bm-code" title="${hFull}">${hLabel}</span><span class="bm-gol">${placarH}</span></div>
      <div class="bracket-time-mob ${aWin?'winner':hWin?'loser':''}">${htmlBandeira(aC,12)}<span class="bm-code" title="${aFull}">${aLabel}</span><span class="bm-gol">${placarA}</span></div>
    </div>`;
  }

  const c = isMob ? cardMob : card;

  // Derivar a ordem dos 16avos a partir de quem alimenta cada oitava
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

  // Ordem dos 16avos: para cada R16 na ordem acima, extrair os dois R32 que o alimentam
  const r32Order = [];
  for (const [h16, a16] of r16Order) {
    for (const r16Id of [h16, a16]) {
      const r16 = r16Template[r16Id];
      r32Order.push([r16.home.replace('WR32_','R32_'), r16.away.replace('WR32_','R32_')]);
    }
  }

  function col16avos() {
    let h = '';
    for (let i = 0; i < r32Order.length; i++) {
      const [r32a, r32b] = r32Order[i];
      if (i > 0) h += '<div class="bracket-spacer"></div>';
      h += c(r32a);
      h += '<div class="bracket-spacer" style="height:4px"></div>';
      h += c(r32b);
    }
    return h;
  }

  function colOitavas() {
    let h = '';
    for (const [r16a, r16b] of r16Order) {
      h += c(r16a);
      h += c(r16b);
    }
    return h;
  }

  function colQuartas() {
    let h = '';
    for (const [qfa, qfb] of sfOrder) {
      h += c(qfa);
      h += c(qfb);
    }
    return h;
  }

  // Phase labels
  const lbl16 = '16avos';
  const lbl8  = 'Oitavas';
  const lblQF = 'Quartas';
  const lblSF = 'Semi';

  let h = '<div class="bracket-scroll">';

  // 16 avos
  h += '<div class="bracket-fase"><div class="bracket-fase-label">' + lbl16 + '</div><div class="bracket-coluna">';
  h += col16avos();
  h += '</div></div>';

  // Oitavas
  h += '<div class="bracket-fase"><div class="bracket-fase-label">' + lbl8 + '</div><div class="bracket-coluna">';
  h += colOitavas();
  h += '</div></div>';

  // Quartas
  h += '<div class="bracket-fase"><div class="bracket-fase-label">' + lblQF + '</div><div class="bracket-coluna bracket-coluna-qf">';
  h += colQuartas();
  h += '</div></div>';

  // Semis
  h += '<div class="bracket-fase"><div class="bracket-fase-label">' + lblSF + '</div><div class="bracket-coluna bracket-coluna-sf">';
  h += c('SF_1');
  h += c('SF_2');
  h += '</div></div>';

  if (isMob) {
    // Mobile: merge Final + 3° lugar into one column
    h += '<div class="bracket-fase"><div class="bracket-fase-label">Finais</div><div class="bracket-coluna bracket-coluna-final">';
    h += '<div class="bracket-fase-label bracket-fase-label-inline">Final</div>';
    h += c('FNL');
    h += '<div class="bracket-spacer" style="height:6px"></div>';
    h += '<div class="bracket-fase-label bracket-fase-label-inline">3° Lugar</div>';
    h += c('TPL');
    h += '</div></div>';
  } else {
    // Desktop: separate columns
    h += '<div class="bracket-fase bracket-fase-final"><div class="bracket-fase-label">Final</div><div class="bracket-coluna bracket-coluna-final">';
    h += c('FNL');
    h += '</div></div>';

    h += '<div class="bracket-fase bracket-fase-terceiro"><div class="bracket-fase-label">3° Lugar</div><div class="bracket-coluna bracket-coluna-final">';
    h += c('TPL');
    h += '</div></div>';
  }

  h += '</div>'; // bracket-scroll

  if (!isMob) {
    // Hint de scroll — desktop/tablet only now
    h += '<div id="bracket-scroll-hint" style="display:none;text-align:center;font-size:.68rem;color:var(--texto2);padding:4px 0 8px;letter-spacing:.03em">← deslize para ver todas as fases →</div>';
  }

  // Fase de grupos compacta acima
  h = '<details style="margin-bottom:10px"><summary title="Expanda para ver a classificação atual de cada grupo da fase de grupos" style="cursor:pointer;padding:8px 12px;background:var(--fundo2);border-radius:var(--radius-sm);font-size:.78rem;font-weight:700">Ver classificação dos grupos ▼</summary>' +
    '<div class="card" style="margin-top:6px;padding:10px">' +
    renderGruposGrid(window.BRACKET.calcularTodosOsGrupos(res), res) +
    '</div></details>' + h;

  el.innerHTML = h;

  // Tooltip unificado (hover desktop + toque mobile)
  window.injetarTooltipsMobile(el);

  // Exibe hint só em tablet (768px) e esconde ao scrollar — mobile doesn't scroll now
  const scroll = el.querySelector(".bracket-scroll");
  if (!isMob && window.innerWidth < 768) {
    const hint = document.getElementById("bracket-scroll-hint");
    if (hint && scroll) {
      hint.style.display = "block";
      scroll.addEventListener("scroll", () => { hint.style.display = "none"; }, { once: true, passive: true });
    }
  }

};