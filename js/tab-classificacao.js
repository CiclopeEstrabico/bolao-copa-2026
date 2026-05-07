/** tab-classificacao.js - Ranking com sparklines e movimento */
let _rankingAnterior = {};

window.renderClassificacao = function() {
  const el = document.getElementById("aba-classificacao");
  if (!el) return;
  const res = getResultados();
  const apos = APP.apostadores||[];
  const pals = APP.palpites||{};
  const esp = APP.especiais||{};

  const ranking = gerarRanking(pals, res, apos, esp);

  // Jogos realizados recentes (ultimos 5)
  const jogosFeitosIds = (window.SCHEDULE||[]).filter(j=>res[j.id]?.homeGoals!==undefined)
    .sort((a,b)=>new Date(b.utc)-new Date(a.utc)).slice(0,5).map(j=>j.id);

  // Header stats
  const totalJogos = (window.SCHEDULE||[]).filter(j=>res[j.id]?.homeGoals!==undefined).length;
  const totalPoss = (window.SCHEDULE||[]).length;
  let h = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px">';
  h += _statCard("Participantes", ranking.length, "👥");
  h += _statCard("Jogos Realizados", totalJogos+"/"+totalPoss, "⚽");
  const lider = ranking[0];
  h += _statCard("Líder", lider ? (lider.participante.apelido||lider.participante.nome||"?") : "—", "🏆");
  h += '</div>';

  // Tabela ranking
  h += '<div class="card" style="padding:0;overflow:hidden"><table class="tabela-detalhe">';
  h += '<thead><tr><th style="width:36px">Pos</th><th style="text-align:left">Apostador</th>';
  h += '<th title="Total de pontos">Pts</th><th title="Placares exatos">🎯</th>';
  h += '<th title="Acertos resultado">✓</th><th title="Aproveitamento">%</th>';
  h += '<th title="Últimos 5 jogos" style="min-width:70px">Últimos 5</th>';
  h += '</tr></thead><tbody>';

  ranking.forEach((item, i) => {
    const p = item.participante; const st = item.stats;
    const pos = item.posicao;
    const posAnterior = _rankingAnterior[p.id||p.token];
    const mov = posAnterior ? (posAnterior > pos ? '▲' : posAnterior < pos ? '▼' : '—') : '—';
    const movCor = mov==='▲'?'var(--verde-ok)':mov==='▼'?'#f87171':'var(--texto2)';
    const medalhao = pos===1?'🥇':pos===2?'🥈':pos===3?'🥉':'';

    // Sparkline: últimos 5 jogos
    let spark = '';
    for (const jId of jogosFeitosIds) {
      const jg = st.jogos?.find(x=>x.gameId===jId);
      if (!jg) { spark += '<span style="color:var(--texto2)">·</span>'; continue; }
      if (jg.acertou === null) { spark += '<span style="color:var(--texto2)">·</span>'; continue; }
      if (jg.bonus_tipo==="placar_exato") spark += '<span style="color:#86efac" title="Placar exato +'+jg.pontos+'pts">🟢</span>';
      else if (jg.acertou) spark += '<span style="color:#4ade80" title="Acertou +'+jg.pontos+'pts">✓</span>';
      else spark += '<span style="color:#f87171" title="Errou">✗</span>';
    }

    const aprov = st.aproveitamento_pct;
    const aprovCor = aprov>=70?'var(--verde-ok)':aprov>=45?'var(--dourado)':'#f87171';

    h += '<tr style="cursor:pointer" onclick="_toggleRankingDetalhe(\'rd-'+i+'\')">';
    h += '<td style="text-align:center;font-weight:900;font-size:.95rem">';
    h += (medalhao||pos)+'<span style="font-size:.65rem;color:'+movCor+'"> '+mov+'</span></td>';
    h += '<td style="text-align:left;font-weight:600">'+(p.apelido||p.nome||p.token?.substring(0,8)||"?")+'</td>';
    h += '<td style="font-weight:900;font-size:.95rem;color:var(--verde-light)">'+st.total.toFixed(1)+'</td>';
    h += '<td style="color:#86efac;font-weight:700">'+st.acertos_placar_exato+'</td>';
    h += '<td style="color:var(--verde-ok)">'+st.acertos_resultado+'</td>';
    h += '<td style="color:'+aprovCor+';font-weight:700">'+aprov+'%</td>';
    h += '<td style="letter-spacing:1px">'+spark+'</td></tr>';

    // Linha de detalhe expansível
    h += '<tr id="rd-'+i+'" style="display:none"><td colspan="7" style="padding:0">';
    h += '<div style="background:var(--fundo2);padding:10px 14px;font-size:.76rem">';
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px">';
    h += '<div><div style="color:var(--texto2)">Grupos</div><div style="font-weight:700">'+st.total_grupos.toFixed(1)+' pts</div></div>';
    h += '<div><div style="color:var(--texto2)">Eliminatórias</div><div style="font-weight:700">'+st.total_eliminatorias.toFixed(1)+' pts</div></div>';
    h += '<div><div style="color:var(--texto2)">Especiais</div><div style="font-weight:700">'+st.total_especiais+' pts</div></div>';
    h += '<div><div style="color:var(--texto2)">Erros</div><div style="font-weight:700;color:#f87171">'+st.erros+'</div></div>';
    h += '<div><div style="color:var(--texto2)">Sem palpite</div><div style="font-weight:700;color:var(--texto2)">'+st.sem_palpite+'</div></div>';
    h += '</div></div></td></tr>';
  });

  h += '</tbody></table></div>';

  // Guardar ranking para mostrar movimento
  ranking.forEach(item => { _rankingAnterior[item.participante.id||item.participante.token] = item.posicao; });

  el.innerHTML = h;
};

function _toggleRankingDetalhe(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = el.style.display==='none'?'':'none';
}

function _statCard(label, valor, icon) {
  return '<div style="background:var(--card);border:1px solid var(--borda);border-radius:var(--radius-sm);padding:12px;text-align:center">' +
    '<div style="font-size:1.4rem">'+icon+'</div>' +
    '<div style="font-size:1rem;font-weight:800;color:var(--texto)">'+valor+'</div>' +
    '<div style="font-size:.68rem;color:var(--texto2);margin-top:2px">'+label+'</div></div>';
}