/** tab-compilacao.js - Heatmap de palpites */
window.renderCompilacao = function() {
  const el = document.getElementById("aba-compilacao");
  if (!el) return;
  const res = getResultados();
  const apos = APP.apostadores||[];
  const pals = APP.palpites||{};
  if (!apos.length) { el.innerHTML='<div class="card"><p style="color:var(--texto2)">Nenhum apostador cadastrado.</p></div>'; return; }

  // Filtros de fase
  const fases = ["todos","grupos","32avos","oitavas","quartas","semis","terceiro","final"];
  const faseAtiva = window._compFase||"grupos";
  const nomesFase = {todos:"Todos",grupos:"Grupos","32avos":"32 Avos",oitavas:"Oitavas",quartas:"Quartas",semis:"Semis",terceiro:"3o Lugar",final:"Final"};

  let h = '<div class="toggle-bar" style="margin-bottom:10px">';
  h += '<span class="toggle-label">Fase:</span>';
  for (const f of fases) {
    h += '<button class="btn-toggle'+(faseAtiva===f?" ativo":"")+'" onclick="window._compFase=\''+f+'\';renderAbaAtiva()">'+nomesFase[f]+'</button>';
  }
  h += '</div>';

  // Filtros de Ordenação
  const ordemStr = window._compOrdem || "pts";
  h += '<div class="toggle-bar" style="margin-bottom:15px;flex-wrap:wrap">';
  h += '<span class="toggle-label">Ordenar por:</span>';
  h += '<button class="btn-toggle'+(ordemStr==="alfa"?" ativo":"")+'" onclick="window._compOrdem=\'alfa\';renderAbaAtiva()">A-Z</button>';
  h += '<button class="btn-toggle'+(ordemStr==="pts"?" ativo":"")+'" onclick="window._compOrdem=\'pts\';renderAbaAtiva()">Pontos</button>';
  h += '<button class="btn-toggle'+(ordemStr==="res"?" ativo":"")+'" onclick="window._compOrdem=\'res\';renderAbaAtiva()">Resultados</button>';
  h += '<button class="btn-toggle'+(ordemStr==="placar"?" ativo":"")+'" onclick="window._compOrdem=\'placar\';renderAbaAtiva()">Placar</button>';
  h += '</div>';

  const jogos = (window.SCHEDULE||[]).filter(j => faseAtiva==="todos" || j.fase===faseAtiva)
    .sort((a,b)=>new Date(a.utc)-new Date(b.utc));
  if (!jogos.length) { el.innerHTML = h+'<div class="card"><p style="color:var(--texto2)">Sem jogos nesta fase.</p></div>'; return; }

  // Ranking lateral: ordenar apostadores
  const ranking = apos.map(a => {
    const st = calcularPontosApostador(pals[a.id]||{}, res, a, {});
    return { ...a, pts: st.total, placar: st.acertos_placar_exato, res: st.acertos_resultado };
  }).sort((a,b) => {
    if (ordemStr === "alfa") return (a.apelido||a.nome||"").localeCompare(b.apelido||b.nome||"");
    if (ordemStr === "res") return b.res - a.res;
    if (ordemStr === "placar") return b.placar - a.placar;
    return b.pts - a.pts; // Default pts
  });

  h += '<div class="compilacao-wrap"><table class="compilacao-table"><thead><tr>';
  h += '<th class="col-jogo" style="position:sticky;left:0;background:var(--fundo2);z-index:2">Jogo</th>';
  h += '<th class="col-resultado" style="z-index:1">Resultado</th>';
  for (const a of ranking) h += '<th title="'+a.nome+'" style="z-index:1;max-width:50px;overflow:hidden;text-overflow:ellipsis;padding:4px 2px">'+(a.apelido||a.nome||"?").substring(0,10)+'</th>';
  h += '</tr></thead><tbody>';

  for (const jogo of jogos) {
    const r = res[jogo.id];
    const temRes = r && r.homeGoals !== undefined;
    const b = APP.bracket?.[jogo.id]||{};
    const hC = b.home||jogo.home; const aC = b.away||jogo.away;
    const hN = window.TEAMS_BY_CODE[hC]?.name||hC;
    const aN = window.TEAMS_BY_CODE[aC]?.name||aC;
    const dataHora = formatarDataBRT(jogo.utc, false);
    h += '<tr><td class="col-jogo" style="position:sticky;left:0;background:var(--card2);white-space:nowrap;padding:6px 8px;z-index:1">';
    h += '<div style="font-size:.6rem;color:var(--texto2);margin-bottom:3px">'+dataHora+'</div>';
    h += '<div style="display:flex;align-items:center;gap:4px;font-size:.75rem">'+htmlBandeira(hC,14)+' <span style="font-weight:600">'+hC+'</span> <span style="color:var(--texto2)">×</span> <span style="font-weight:600">'+aC+'</span> '+htmlBandeira(aC,14)+'</div></td>';
    // Resultado oficial
    if (temRes) {
      const pen = r.foi_penaltis ? ' <span style="font-size:.6rem;color:var(--amber)">PEN</span>' : '';
      h += '<td class="col-resultado" style="color:var(--verde-ok)">'+r.homeGoals+'x'+r.awayGoals+pen+'</td>';
    } else {
      h += '<td class="col-resultado" style="color:var(--texto2)">–</td>';
    }
    // Palpites de cada apostador
    for (const a of ranking) {
      const p = pals[a.id]?.[jogo.id];
      if (!p || p.homeGoals === undefined) { h += '<td class="celula-sem">·</td>'; continue; }
      if (!temRes) { h += '<td class="celula-futuro">'+p.homeGoals+'x'+p.awayGoals+'</td>'; continue; }
      const br = calcularPontosBrutos(p, r);
      const pts = aplicarFator(br.total_bruto, jogo.fase);
      let cls = "celula-erro";
      if (br.bonus_tipo==="placar_exato") cls="celula-placar";
      else if (br.acertou) cls="celula-res";
      h += '<td class="'+cls+'" title="'+pts+'pts">'+p.homeGoals+'x'+p.awayGoals+'</td>';
    }
    h += '</tr>';
  }

  // Estatisticas de Aproveitamento (Linhas Finais)
  let maxPtsGeral = 0;
  let jogosRealizados = 0;
  for (const jogo of (window.SCHEDULE||[])) {
    const r = res[jogo.id];
    if (r && r.homeGoals !== undefined) {
      jogosRealizados++;
      let maxBruto = window.CONFIG?.pontuacao?.resultado_base || 3;
      if (!r.foi_penaltis) {
         const tGols = Number(r.homeGoals) + Number(r.awayGoals);
         const cfg = window.CONFIG.pontuacao;
         const limiar = cfg.limiar_placar_alto || 4;
         const bonus = tGols >= limiar ? (cfg.bonus_placar_exato_alto||5) : (cfg.bonus_placar_exato_baixo||3);
         maxBruto += bonus;
      }
      maxPtsGeral += aplicarFator(maxBruto, jogo.fase);
    }
  }

  const lbls = [
    { title: "Qtd. de Acertos (Resultado)", val: a => a.res, cor: "var(--texto)" },
    { title: "Qtd. de Placar Exato", val: a => a.placar, cor: "var(--texto)" },
    { title: "% Resultado Correto", val: a => jogosRealizados ? ((a.res/jogosRealizados)*100).toFixed(1)+"%" : "0.0%", cor: "var(--texto2)" },
    { title: "% Placar Exato", val: a => jogosRealizados ? ((a.placar/jogosRealizados)*100).toFixed(1)+"%" : "0.0%", cor: "var(--texto2)" },
    { title: "Pontos Totais Alcançados", val: a => a.pts.toFixed(1), cor: "var(--dourado)" },
    { title: "% dos Pontos Possíveis", val: a => maxPtsGeral ? ((a.pts/maxPtsGeral)*100).toFixed(1)+"%" : "0.0%", cor: "var(--dourado)" }
  ];

  for (const L of lbls) {
    h += '<tr><td class="col-jogo" style="position:sticky;left:0;background:var(--fundo2);font-weight:700;font-size:.7rem;border-top:1px solid var(--borda)">'+L.title+'</td>';
    h += '<td class="col-resultado" style="background:var(--fundo2);border-top:1px solid var(--borda)"></td>';
    for (const a of ranking) {
      h += '<td style="font-weight:800;color:'+L.cor+';font-size:.75rem;background:var(--fundo2);border-top:1px solid var(--borda)">'+L.val(a)+'</td>';
    }
    h += '</tr>';
  }
  h += '</tbody></table></div>';
  el.innerHTML = h;
};