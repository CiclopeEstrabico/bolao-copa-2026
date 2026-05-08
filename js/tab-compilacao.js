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

  const jogos = (window.SCHEDULE||[]).filter(j => faseAtiva==="todos" || j.fase===faseAtiva)
    .sort((a,b)=>new Date(a.utc)-new Date(b.utc));
  if (!jogos.length) { el.innerHTML = h+'<div class="card"><p style="color:var(--texto2)">Sem jogos nesta fase.</p></div>'; return; }

  // Ranking lateral: ordenar apostadores por pontos
  const ranking = apos.map(a => {
    const st = calcularPontosApostador(pals[a.id]||{}, res, a, {});
    return { ...a, pts: st.total, placar: st.acertos_placar_exato, res: st.acertos_resultado };
  }).sort((a,b)=>b.pts-a.pts);

  h += '<div class="compilacao-wrap"><table class="compilacao-table"><thead><tr>';
  h += '<th class="col-jogo" style="position:sticky;left:0;background:var(--fundo2)">Jogo</th>';
  h += '<th class="col-resultado">Resultado</th>';
  for (const a of ranking) h += '<th title="'+a.nome+'">'+(a.apelido||a.nome||"?").substring(0,8)+'</th>';
  h += '</tr></thead><tbody>';

  for (const jogo of jogos) {
    const r = res[jogo.id];
    const temRes = r && r.homeGoals !== undefined;
    const b = APP.bracket?.[jogo.id]||{};
    const hC = b.home||jogo.home; const aC = b.away||jogo.away;
    const hN = window.TEAMS_BY_CODE[hC]?.name||hC;
    const aN = window.TEAMS_BY_CODE[aC]?.name||aC;
    const dataHora = formatarDataBRT(jogo.utc, false);
    h += '<tr><td class="col-jogo" style="position:sticky;left:0;background:var(--card2);white-space:nowrap;padding:6px 8px">';
    h += '<div style="font-size:.6rem;color:var(--texto2);margin-bottom:3px">'+dataHora+'</div>';
    h += '<div style="display:flex;align-items:center;gap:4px;font-size:.75rem">'+htmlBandeira(hC,14)+' <span style="font-weight:600">'+hN+'</span> <span style="color:var(--texto2)">×</span> '+htmlBandeira(aC,14)+' <span style="font-weight:600">'+aN+'</span></div></td>';
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

  // Linha de totais
  h += '<tr style="position:sticky;bottom:0"><td class="col-jogo" style="position:sticky;left:0;background:var(--fundo2);font-weight:700;font-size:.72rem">TOTAL</td>';
  h += '<td></td>';
  for (const a of ranking) h += '<td style="font-weight:800;color:var(--dourado);font-size:.8rem">'+a.pts.toFixed(1)+'</td>';
  h += '</tr>';
  h += '</tbody></table></div>';
  el.innerHTML = h;
};