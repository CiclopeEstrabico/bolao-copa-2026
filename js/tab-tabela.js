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
    return `<div class="bracket-card" title="Ver prognose e detalhes do jogo" onclick="PROGNOSE.abrirModal('${gameId}')">
      <div class="bracket-data">${data}</div>
      <div class="bracket-time ${hWin?'winner':aWin?'loser':''}">${htmlBandeira(hC,14)}<span title="${hN}">${hN}</span><span class="bracket-gol">${placarH}</span></div>
      <div class="bracket-time ${aWin?'winner':hWin?'loser':''}">${htmlBandeira(aC,14)}<span title="${aN}">${aN}</span><span class="bracket-gol">${placarA}</span></div>
    </div>`;
  }

  // Derivar a ordem dos 16avos a partir de quem alimenta cada oitava
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
      h += card(r32a);
      h += '<div class="bracket-spacer" style="height:4px"></div>';
      h += card(r32b);
    }
    return h;
  }

  function colOitavas() {
    let h = '';
    for (const [r16a, r16b] of r16Order) {
      h += card(r16a);
      h += card(r16b);
    }
    return h;
  }

  function colQuartas() {
    let h = '';
    for (const [qfa, qfb] of sfOrder) {
      h += card(qfa);
      h += card(qfb);
    }
    return h;
  }

  let h = '<div class="bracket-scroll">';

  // 16 avos
  h += '<div class="bracket-fase"><div class="bracket-fase-label">16 Avos</div><div class="bracket-coluna">';
  h += col16avos();
  h += '</div></div>';

  // Oitavas
  h += '<div class="bracket-fase"><div class="bracket-fase-label">Oitavas</div><div class="bracket-coluna">';
  h += colOitavas();
  h += '</div></div>';

  // Quartas
  h += '<div class="bracket-fase"><div class="bracket-fase-label">Quartas</div><div class="bracket-coluna bracket-coluna-qf">';
  h += colQuartas();
  h += '</div></div>';

  // Semis
  h += '<div class="bracket-fase"><div class="bracket-fase-label">Semis</div><div class="bracket-coluna bracket-coluna-sf">';
  h += card('SF_1');
  h += card('SF_2');
  h += '</div></div>';

  // Final + 3o: duas colunas separadas, cada uma centralizada no meio das semis
  h += '<div class="bracket-fase bracket-fase-final"><div class="bracket-fase-label">Final</div><div class="bracket-coluna bracket-coluna-final">';
  h += card('FNL');
  h += '</div></div>';

  h += '<div class="bracket-fase bracket-fase-terceiro"><div class="bracket-fase-label">3° Lugar</div><div class="bracket-coluna bracket-coluna-final">';
  h += card('TPL');
  h += '</div></div>';

  h += '</div>'; // bracket-scroll

  // Hint de scroll — aparece só em mobile, some ao primeiro scroll
  h += '<div id="bracket-scroll-hint" style="display:none;text-align:center;font-size:.68rem;color:var(--texto2);padding:4px 0 8px;letter-spacing:.03em">← deslize para ver todas as fases →</div>';

  // Fase de grupos compacta acima
  h = '<details style="margin-bottom:10px"><summary title="Expanda para ver a classificação atual de cada grupo da fase de grupos" style="cursor:pointer;padding:8px 12px;background:var(--fundo2);border-radius:var(--radius-sm);font-size:.78rem;font-weight:700">Ver classificação dos grupos ▼</summary>' +
    '<div class="card" style="margin-top:6px;padding:10px">' +
    renderGruposGrid(window.BRACKET.calcularTodosOsGrupos(res), res) +
    '</div></details>' + h;

  el.innerHTML = h;

  // Tooltip unificado (hover desktop + toque mobile)
  window.injetarTooltipsMobile(el);

  // Exibe hint só em mobile e esconde ao scrollar
  const scroll = el.querySelector(".bracket-scroll");
  if (window.innerWidth < 768) {
    const hint = document.getElementById("bracket-scroll-hint");
    if (hint && scroll) {
      hint.style.display = "block";
      scroll.addEventListener("scroll", () => { hint.style.display = "none"; }, { once: true, passive: true });
    }
  }

  // Frozen bracket phase labels on mobile
  if (window.innerWidth <= 600 && scroll) {
    requestAnimationFrame(() => {
      // Remover frozen anterior
      const old = document.getElementById('frozen-bracket-labels');
      if (old) old.remove();

      const frozen = document.createElement('div');
      frozen.id = 'frozen-bracket-labels';
      frozen.style.cssText = 'position:fixed;left:0;right:0;z-index:50;display:none;overflow:hidden;' +
        'background:var(--fundo2);border-bottom:1px solid var(--verde-light);box-shadow:0 2px 8px rgba(0,0,0,.3);padding-top:8px;';

      // Criar barra com as mesmas labels
      const innerBar = document.createElement('div');
      innerBar.style.cssText = 'display:flex;gap:0;width:' + scroll.scrollWidth + 'px;background:transparent;';
      const fases = scroll.querySelectorAll('.bracket-fase');
      fases.forEach(fase => {
        const label = fase.querySelector('.bracket-fase-label');
        const clone = document.createElement('div');
        clone.className = 'bracket-fase-label';
        clone.style.cssText = 'width:' + (fase.offsetWidth - 8) + 'px;flex-shrink:0;box-sizing:border-box;margin:0 4px;';
        clone.textContent = label ? label.textContent : '';
        innerBar.appendChild(clone);
      });
      frozen.appendChild(innerBar);
      document.body.appendChild(frozen);

      // Sync horizontal scroll
      scroll.addEventListener('scroll', () => {
        if (frozen.style.display !== 'none') {
          innerBar.style.transform = 'translateX(' + (-scroll.scrollLeft) + 'px)';
        }
      }, { passive: true });

      // Show/hide on vertical scroll
      const update = () => {
        const currentFrozen = document.getElementById('frozen-bracket-labels');
        if (!currentFrozen) return;

        const abaTabela = document.getElementById("aba-tabela");
        if (!abaTabela || abaTabela.classList.contains("hidden")) {
          currentFrozen.style.display = 'none';
          return;
        }

        // Medir dinamicamente a altura acumulada do cabeçalho + abas
        let stickyTop = 0;
        const header = document.querySelector('.header');
        const tabs = document.querySelector('.tabs-wrap');
        if (header) stickyTop += header.getBoundingClientRect().height;
        if (tabs) stickyTop += tabs.getBoundingClientRect().height;

        // Medir dinamicamente a posição do contêiner de chaves
        const rect = scroll.getBoundingClientRect();
        const bracketTop = rect.top + window.scrollY;
        const bracketHeight = rect.height;

        const labelEl = scroll.querySelector('.bracket-fase-label');
        const labelHeight = labelEl ? labelEl.offsetHeight : 25;

        const scrollTop = window.scrollY;
        // Começa a fixar assim que a linha de labels original é ultrapassada
        const labelsGone = scrollTop + stickyTop > bracketTop + 8; // offset do padding-top do bracket-scroll
        const tableVisible = scrollTop + stickyTop < bracketTop + bracketHeight - labelHeight;

        if (labelsGone && tableVisible) {
          currentFrozen.style.display = 'block';
          currentFrozen.style.top = (stickyTop - 1) + 'px';
          innerBar.style.transform = 'translateX(' + (-scroll.scrollLeft) + 'px)';
        } else {
          currentFrozen.style.display = 'none';
        }
      };

      // Inicializar: aguardar o scrollTo(0,0) de renderAbaAtiva() tomar efeito
      setTimeout(() => {
        update();
      }, 50);

      let ticking = false;
      window.addEventListener('scroll', () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(() => {
            update();
            ticking = false;
          });
        }
      }, { passive: true });
    });
  }
};