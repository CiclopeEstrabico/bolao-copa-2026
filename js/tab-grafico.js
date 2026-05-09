/** tab-grafico.js - Gráfico de barras dos apostadores */
window.renderGrafico = function() {
  const el = document.getElementById("aba-grafico");
  if (!el) return;
  const res = getResultados();
  const apos = APP.apostadores || [];
  const pals = APP.palpites || {};
  if (!apos.length) { el.innerHTML = '<div class="card"><p style="color:var(--texto2)">Nenhum apostador cadastrado.</p></div>'; return; }

  // Filtros de Métrica
  const metricaAtiva = window._graficoMetrica || "pts";

  let h = '<div class="toggle-bar" style="margin-bottom:15px;flex-wrap:wrap;justify-content:center">';
  h += '<span class="toggle-label">Métrica:</span>';
  h += '<button class="btn-toggle'+(metricaAtiva==="pts"?" ativo":"")+'" onclick="window._graficoMetrica=\'pts\';renderAbaAtiva()">Pontos</button>';
  h += '<button class="btn-toggle'+(metricaAtiva==="pct"?" ativo":"")+'" onclick="window._graficoMetrica=\'pct\';renderAbaAtiva()">Aproveitamento (%)</button>';
  h += '<button class="btn-toggle'+(metricaAtiva==="res"?" ativo":"")+'" onclick="window._graficoMetrica=\'res\';renderAbaAtiva()">Acertos Res.</button>';
  h += '<button class="btn-toggle'+(metricaAtiva==="placar"?" ativo":"")+'" onclick="window._graficoMetrica=\'placar\';renderAbaAtiva()">Placar Exato</button>';
  h += '</div>';

  // Obter stats
  let ranking = apos.map(a => {
    const st = calcularPontosApostador(pals[a.id]||{}, res, a, {});
    return { 
      nome: (a.apelido || a.nome || "?").substring(0, 12),
      pts: st.total, 
      placar: st.acertos_placar_exato, 
      res: st.acertos_resultado,
      pct: st.aproveitamento_pct
    };
  });

  // Ordenar pela métrica ativa (sempre do maior pro menor)
  ranking.sort((a,b) => b[metricaAtiva] - a[metricaAtiva]);

  // Achar o valor máximo e a média para as barras
  const maxVal = Math.max(1, ...ranking.map(a => a[metricaAtiva]));
  const avgVal = ranking.reduce((acc, curr) => acc + curr[metricaAtiva], 0) / Math.max(1, ranking.length);
  const avgPerc = (avgVal / maxVal) * 100;

  // Render do Gráfico CSS
  h += '<div class="card" style="padding:20px 10px; overflow-x:auto;">';
  h += '<div style="display:flex; align-items:flex-end; gap:12px; height:280px; min-width:min-content; padding-bottom:10px; border-bottom:1px solid var(--borda); margin-bottom:80px; position:relative;">';
  
  // Linha da média
  h += '<div style="position:absolute; bottom:10px; left:0; right:0; height:'+avgPerc+'%; border-top:1px dashed var(--texto2); opacity:0.6; pointer-events:none; z-index:0;">';
  h += '<span style="position:absolute; top:-18px; left:0; font-size:.65rem; color:var(--texto2); font-weight:700">Média: '+(metricaAtiva==="pct"?avgVal.toFixed(1)+"%":avgVal.toFixed(1))+'</span></div>';

  for (let i = 0; i < ranking.length; i++) {
    const a = ranking[i];
    const val = a[metricaAtiva];
    const perc = (val / maxVal) * 100;
    
    // Calcular a cor de Degradê (do Verde 120 ao Vermelho 0)
    const ratio = ranking.length > 1 ? i / (ranking.length - 1) : 0;
    const hue = Math.round(120 * (1 - ratio));
    const barColor = `hsl(${hue}, 80%, 45%)`;
    const barColorGlow = `hsl(${hue}, 80%, 60%)`;
    
    // Formatar texto
    let valStr = val;
    if (metricaAtiva === "pct") valStr = val + "%";
    else if (metricaAtiva === "pts") valStr = val.toFixed(1);

    h += '<div style="display:flex; flex-direction:column; align-items:center; flex:1; min-width:40px; position:relative; height:100%; justify-content:flex-end; z-index:1;">';
    
    // Valor em cima da barra
    h += '<div style="font-size:.7rem; font-weight:800; color:var(--texto); margin-bottom:4px;">' + valStr + '</div>';
    
    // A barra em si
    h += '<div style="width:28px; background:linear-gradient(to top, '+barColor+', '+barColorGlow+'); border-radius:4px 4px 0 0; height:' + Math.max(2, perc) + '%; transition:height 0.4s ease; box-shadow: 0 -2px 10px '+barColor+'40;"></div>';
    
    // Nome do apostador
    h += '<div style="position:absolute; top:calc(100% + 8px); left:50%; transform: translateX(-50%); writing-mode: vertical-rl; transform: rotate(180deg); font-size:.68rem; color:var(--texto2); font-weight:600; white-space:nowrap;">' + a.nome + '</div>';
    
    h += '</div>'; // fim da coluna
  }

  h += '</div>'; // fim do grafico flex
  h += '</div>'; // fim do card

  el.innerHTML = h;
};
