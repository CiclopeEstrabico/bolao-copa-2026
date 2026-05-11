/** tab-resultados.js - usa ui-jogos.js (renderJogosComToggle controla os grupos) */
window.renderResultados = function() {
  const el = document.getElementById("aba-resultados");
  if (!el) return;
  const res = getResultados();
  const tg = window.BRACKET.calcularTodosOsGrupos(res);
  const isAdm = adminAutenticado();
  // renderJogosComToggle ja cuida de mostrar grupos no topo ou com jogos
  el.innerHTML = renderJogosComToggle(res, tg, isAdm, null) + renderTabelaPodio(res, APP.bracket || {});
};

/**
 * renderTabelaPodio(res, bracket)
 * Retorna HTML com a tabela de 1º, 2º e 3º lugar,
 * derivada automaticamente dos resultados da Final (FNL) e da Disputa de 3º (TPL).
 * Mostra os pontos configurados em CONFIG.pontuacao.extras.
 */
window.renderTabelaPodio = function(res, bracket) {
  const esp = _extrairEspeciaisOficiais(res, bracket);
  const cfg = window.CONFIG?.pontuacao?.extras || { primeiro_lugar: 7, segundo_lugar: 4, terceiro_lugar: 2 };
  const algumDefinido = esp.campeao || esp.vice || esp.terceiro;

  // Só mostra o card se ao menos um jogo final foi jogado
  if (!algumDefinido) return '';

  const _line = (pos, icon, key, cfgKey, pts) => {
    const code = esp[key];
    const info = window.TEAMS_BY_CODE?.[code];
    if (!code) return '';
    return `
      <tr>
        <td style="padding:10px 14px;font-size:1.3rem;text-align:center;width:44px">${icon}</td>
        <td style="padding:10px 8px">
          <div style="display:flex;align-items:center;gap:10px">
            ${htmlBandeira(code, 24)}
            <div>
              <div style="font-weight:800;font-size:.92rem">${info?.name || code}</div>
              <div style="font-size:.65rem;color:var(--texto2);margin-top:1px">${pos}. lugar</div>
            </div>
          </div>
        </td>
        <td style="padding:10px 14px;text-align:right;white-space:nowrap">
          <span style="background:rgba(245,166,35,.12);color:var(--dourado);border:1px solid rgba(245,166,35,.25);border-radius:20px;padding:2px 10px;font-size:.75rem;font-weight:800">${cfg[cfgKey]} pts especiais</span>
        </td>
      </tr>`;
  };

  return `
    <div class="card" style="margin-top:10px">
      <div class="card-titulo">🏆 Pódio da Copa</div>
      <table style="width:100%;border-collapse:collapse">
        ${_line('1º', '🥇', 'campeao',  'primeiro_lugar')}
        ${_line('2º', '🥈', 'vice',     'segundo_lugar')}
        ${_line('3º', '🥉', 'terceiro', 'terceiro_lugar')}
      </table>
      <div style="font-size:.67rem;color:var(--texto2);margin-top:10px;padding-top:8px;border-top:1px solid var(--borda)">
        Quem apostou nesses times durante a fase de grupos recebe os pontos especiais indicados.
      </div>
    </div>`;
};