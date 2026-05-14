window.renderResultados = function() {
  const el = document.getElementById("aba-resultados");
  if (!el) return;
  const res = getResultados();
  const tg = window.BRACKET.calcularTodosOsGrupos(res);
  const isAdm = (typeof adminAutenticado === 'function') ? adminAutenticado() : false;
  // renderJogosComToggle ja cuida de mostrar grupos no topo ou com jogos
  el.innerHTML = renderJogosComToggle(res, tg, isAdm, null) + renderTabelaPodio(res, APP.bracket || {});
};