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

  const secao = (ids) => ids.map(id => card(id)).join('<div class="bracket-spacer"></div>');

  let h = '<div class="bracket-scroll">';

  // 32 avos
  h += '<div class="bracket-fase"><div class="bracket-fase-label">32 Avos</div><div class="bracket-coluna">';
  h += secao(Array.from({length:16},(_,i)=>'R32_'+(i+1)));
  h += '</div></div>';

  // Oitavas
  h += '<div class="bracket-fase"><div class="bracket-fase-label">Oitavas</div><div class="bracket-coluna">';
  h += secao(Array.from({length:8},(_,i)=>'R16_'+(i+1)));
  h += '</div></div>';

  // Quartas
  h += '<div class="bracket-fase"><div class="bracket-fase-label">Quartas</div><div class="bracket-coluna">';
  h += secao(['QF_1','QF_2','QF_3','QF_4']);
  h += '</div></div>';

  // Semis
  h += '<div class="bracket-fase"><div class="bracket-fase-label">Semis</div><div class="bracket-coluna">';
  h += secao(['SF_1','SF_2']);
  h += '</div></div>';

  // Final + 3o
  h += '<div class="bracket-fase"><div class="bracket-fase-label">Final</div><div class="bracket-coluna">';
  h += card('FNL');
  h += '<div class="bracket-spacer"></div><div class="bracket-spacer"></div>';
  h += '<div style="font-size:.65rem;color:var(--texto2);text-align:center;margin:4px 0">3° Lugar</div>';
  h += card('TPL');
  h += '</div></div>';

  h += '</div>'; // bracket-scroll

  // Fase de grupos compacta acima
  h = '<details style="margin-bottom:10px"><summary style="cursor:pointer;padding:8px 12px;background:var(--fundo2);border-radius:var(--radius-sm);font-size:.78rem;font-weight:700">Ver classificação dos grupos ▼</summary>' +
    '<div class="card" style="margin-top:6px;padding:10px">' +
    renderGruposGrid(window.BRACKET.calcularTodosOsGrupos(res), res) +
    '</div></details>' + h;

  el.innerHTML = h;
};