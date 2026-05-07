/**
 * prognose.js - Motor Poisson + Modal com 3 abas: Previsão | Palpites | Estádio
 */

window.PROGNOSE = {

  lambda: function(deltaElo) {
    const DR = deltaElo / 1000;
    const cfg = window.ELO_CONFIG;
    const p = cfg.POLY;
    return Math.max(0.10, cfg.BASE_LAMBDA + p[1]*DR + p[2]*DR*DR + p[3]*DR*DR*DR);
  },

  poisson: function(lambda, k) {
    let e = Math.exp(-lambda), f = 1;
    for (let i = 1; i <= k; i++) { f *= i; }
    return e * Math.pow(lambda, k) / f;
  },

  calcular: function(homeCode, awayCode) {
    const eloH = window.ELO_RATINGS[homeCode] || 1500;
    const eloA = window.ELO_RATINGS[awayCode] || 1500;
    const lH = this.lambda(eloH - eloA);
    const lA = this.lambda(eloA - eloH);
    const N = (window.ELO_CONFIG?.MAX_GOLS || 5) + 1;
    const pH = Array.from({length:N}, (_,k) => this.poisson(lH, k));
    const pA = Array.from({length:N}, (_,k) => this.poisson(lA, k));
    let home=0, draw=0, away=0;
    const matrix = [];
    for (let i=0;i<N;i++) {
      matrix[i]=[];
      for (let j=0;j<N;j++) {
        const v=pH[i]*pA[j];
        matrix[i][j]=v;
        if(i>j) home+=v; else if(i===j) draw+=v; else away+=v;
      }
    }
    const tot=home+draw+away;
    return { lH, lA, home:home/tot, draw:draw/tot, away:away/tot, matrix, N,
      eloH, eloA, homeCode, awayCode };
  },

  statsPalpites: function(gameId) {
    const todos = APP.palpites || {};
    let home=0, draw=0, away=0, total=0;
    const placarCount = {};
    for (const apId of Object.keys(todos)) {
      const p = todos[apId]?.[gameId];
      if (!p || p.homeGoals === undefined) continue;
      total++;
      const hg=Number(p.homeGoals), ag=Number(p.awayGoals);
      if (hg>ag) home++; else if(hg<ag) away++; else draw++;
      const k=hg+"x"+ag;
      placarCount[k]=(placarCount[k]||0)+1;
    }
    return { total, home, draw, away,
      topPlacares: Object.entries(placarCount).sort((a,b)=>b[1]-a[1]).slice(0,5) };
  },

  abrirModal: function(gameId) {
    let ov = document.getElementById("prognose-overlay");
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "prognose-overlay";
      ov.className = "modal-overlay";
      ov.innerHTML = '<div class="modal-box" id="prognose-box"></div>';
      ov.addEventListener("click", e => { if(e.target===ov) this.fecharModal(); });
      document.body.appendChild(ov);
    }
    const box = document.getElementById("prognose-box");
    box.innerHTML = '<button class="modal-close" onclick="PROGNOSE.fecharModal()">✕</button>' + this.renderModal(gameId);
    ov.classList.add("aberto");
    document.body.style.overflow = "hidden";
    this._switchTab("prev");
  },

  fecharModal: function() {
    const ov = document.getElementById("prognose-overlay");
    if (ov) ov.classList.remove("aberto");
    document.body.style.overflow = "";
  },

  _switchTab: function(tab) {
    ["prev","pal","est"].forEach(t => {
      const c = document.getElementById("modal-content-"+t);
      const b = document.getElementById("mtab-"+t);
      if (c) c.style.display = t===tab?"":"none";
      if (b) b.classList.toggle("ativo", t===tab);
    });
  },

  renderModal: function(gameId) {
    const jogo = window.SCHEDULE_BY_ID?.[gameId];
    const b = APP.bracket?.[gameId]||{};
    const hC = b.home||jogo?.home; const aC = b.away||jogo?.away;
    const hName = window.TEAMS_BY_CODE?.[hC]?.name||hC||"?";
    const aName = window.TEAMS_BY_CODE?.[aC]?.name||aC||"?";
    const stats = this.statsPalpites(gameId);

    let h = '<div style="margin-bottom:12px">';
    h += '<div style="font-size:.72rem;color:var(--texto2);text-align:center;margin-bottom:6px">'+formatarDataBRT(jogo?.utc,true)+'</div>';
    h += '<div style="display:flex;align-items:center;justify-content:center;gap:10px;font-weight:800;font-size:.95rem">';
    h += htmlBandeira(hC,24)+' '+hName+' <span style="color:var(--texto2)">×</span> '+hName;
    h = h.slice(0,-hName.length-'</span> '.length) + aName;
    h += htmlBandeira(aC,24)+'</div></div>';

    h += '<div class="modal-tabs">';
    h += '<button class="modal-tab ativo" id="mtab-prev" onclick="PROGNOSE._switchTab(\'prev\')">📊 Previsão</button>';
    h += '<button class="modal-tab" id="mtab-pal" onclick="PROGNOSE._switchTab(\'pal\')">🗳 Palpites ('+stats.total+')</button>';
    h += '<button class="modal-tab" id="mtab-est" onclick="PROGNOSE._switchTab(\'est\')">🏟 Estádio</button>';
    h += '</div>';

    h += '<div id="modal-content-prev">'+this._renderPrevisao(gameId, hC, aC, hName, aName)+'</div>';
    h += '<div id="modal-content-pal" style="display:none">'+this._renderPalpites(gameId, stats, hName, aName)+'</div>';
    h += '<div id="modal-content-est" style="display:none">'+this._renderEstadio(jogo)+'</div>';
    return h;
  },

  _renderPrevisao: function(gameId, hC, aC, hName, aName) {
    if (!window.ELO_RATINGS?.[hC] || !window.ELO_RATINGS?.[aC]) {
      return '<p style="text-align:center;padding:30px;color:var(--texto2)">Dados ELO não disponíveis.</p>';
    }
    const c = this.calcular(hC, aC);
    const fmt = n => (n*100).toFixed(1)+"%";
    let h = '';
    // ELO
    h += '<div class="elo-box">';
    h += '<div class="elo-time">'+htmlBandeira(hC,28)+'<div class="elo-valor">'+c.eloH+'</div><div class="elo-nome">'+hName+'</div></div>';
    h += '<div class="elo-delta">Δ '+(c.eloH-c.eloA>0?"+":"")+(c.eloH-c.eloA)+'</div>';
    h += '<div class="elo-time">'+htmlBandeira(aC,28)+'<div class="elo-valor">'+c.eloA+'</div><div class="elo-nome">'+aName+'</div></div>';
    h += '</div>';
    // Probs
    h += '<div class="prob-barras">';
    h += '<div class="prob-item"><div class="prob-valor">'+fmt(c.home)+'</div><div class="prob-label">'+hName+' vence</div></div>';
    h += '<div class="prob-item"><div class="prob-valor">'+fmt(c.draw)+'</div><div class="prob-label">Empate</div></div>';
    h += '<div class="prob-item"><div class="prob-valor">'+fmt(c.away)+'</div><div class="prob-label">'+aName+' vence</div></div>';
    h += '</div>';
    // Gols esperados
    h += '<div style="text-align:center;font-size:.76rem;color:var(--texto2);margin-bottom:10px">Gols esperados: <strong style="color:var(--texto)">'+c.lH.toFixed(2)+'</strong> × <strong style="color:var(--texto)">'+c.lA.toFixed(2)+'</strong></div>';
    // Matriz
    h += '<div style="font-size:.7rem;font-weight:700;color:var(--texto2);margin-bottom:5px">Matriz de resultados (Poisson)</div>';
    h += '<div style="overflow-x:auto"><table class="matriz-poisson"><thead><tr><th></th>';
    for (let j=0;j<c.N;j++) h += '<th>'+aName.substring(0,3)+' '+j+'</th>';
    h += '</tr></thead><tbody>';
    const all = c.matrix.flat().sort((a,b)=>b-a);
    const top1=all[0], top5=all[4]||0;
    for (let i=0;i<c.N;i++) {
      h += '<tr><th>'+hName.substring(0,3)+' '+i+'</th>';
      for (let j=0;j<c.N;j++) {
        const v=c.matrix[i][j];
        const cls=v>=top1*0.8?"cell-hot":v>=top5?"cell-warm":v>=top1*0.2?"cell-mid":"cell-cold";
        h += '<td class="'+cls+(i===j?" cell-diag":"")+'">'+(v*100).toFixed(1)+'%</td>';
      }
      h += '</tr>';
    }
    h += '</tbody></table></div>';
    return h;
  },

  _renderPalpites: function(gameId, s, hName, aName) {
    if (!s.total) return '<p style="text-align:center;color:var(--texto2);padding:30px">Nenhum palpite registrado.</p>';
    const pHome=Math.round(s.home/s.total*100);
    const pDraw=Math.round(s.draw/s.total*100);
    const pAway=100-pHome-pDraw;
    let h = '<div style="text-align:center;font-size:.78rem;color:var(--texto2);margin-bottom:14px">'+s.total+' apostadores • '+((s.home+s.draw+s.away))+' palpites registrados</div>';
    for (const [lbl,pct,cor] of [[hName,pHome,"var(--verde-ok)"],["Empate",pDraw,"var(--texto2)"],[aName,pAway,"#f87171"]]) {
      h += '<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:.76rem;margin-bottom:3px"><span>'+lbl+'</span><span style="font-weight:800;color:'+cor+'">'+pct+'%</span></div>';
      h += '<div style="background:var(--fundo2);border-radius:4px;height:8px;overflow:hidden"><div style="width:'+pct+'%;height:100%;background:'+cor+';border-radius:4px;transition:width .5s ease"></div></div></div>';
    }
    if (s.topPlacares.length) {
      h += '<div style="font-size:.72rem;font-weight:700;color:var(--texto2);text-transform:uppercase;letter-spacing:.05em;margin:14px 0 8px">Top placares apostados</div>';
      const maxCt=s.topPlacares[0][1];
      const r=APP.resultados?.[gameId];
      s.topPlacares.forEach(([placar,ct])=>{
        const acertou=r&&r.homeGoals!==undefined&&placar===r.homeGoals+"x"+r.awayGoals;
        h+='<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--fundo2);border-radius:6px;margin-bottom:4px'+(acertou?";border:1px solid var(--verde-ok)":"")+'">';
        h+='<span style="font-weight:800;width:34px;text-align:center;'+(acertou?"color:var(--verde-ok)":"")+'">'+placar+'</span>';
        h+='<div style="flex:1;background:var(--card);border-radius:3px;height:6px"><div style="width:'+(ct/maxCt*100)+'%;height:100%;background:var(--verde);border-radius:3px"></div></div>';
        h+='<span style="font-size:.72rem;color:var(--texto2)">'+ct+'×'+(acertou?" ✓ Oficial":"")+'</span></div>';
      });
    }
    return h;
  },

  _renderEstadio: function(jogo) {
    if (!jogo?.cidade) return '<p style="text-align:center;color:var(--texto2);padding:30px">Informações não disponíveis.</p>';
    const v = window.VENUES?.[jogo.cidade];
    const data = new Intl.DateTimeFormat("pt-BR",{weekday:"long",day:"2-digit",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"}).format(new Date(jogo.utc));
    let h = '<div style="display:flex;flex-direction:column;gap:10px">';
    // Imagem placeholder via unsplash (busca por cidade)
    const query = encodeURIComponent((v?.estadio||jogo.cidade)+" stadium");
    h += '<div style="border-radius:var(--radius-sm);overflow:hidden;height:140px;background:var(--fundo2);display:flex;align-items:center;justify-content:center">';
    h += '<img src="https://source.unsplash.com/400x140/?'+query+',football+stadium" style="width:100%;height:140px;object-fit:cover;border-radius:var(--radius-sm)" onerror="this.style.display=\'none\'" loading="lazy">';
    h += '</div>';
    h += '<div style="display:grid;gap:8px">';
    if (v) {
      h += _infoRow("🏟", "Estádio", '<a href="'+v.link+'" target="_blank" rel="noopener" style="color:var(--verde-light);text-decoration:none">'+v.estadio+'</a>');
    }
    h += _infoRow("📍","Cidade", jogo.cidade + " · " + (jogo.pais==="USA"?"EUA":jogo.pais==="MEX"?"México":jogo.pais==="CAN"?"Canadá":jogo.pais||""));
    h += _infoRow("📅","Data & Hora", data+" (BRT)");
    if (jogo.fase==="grupos") h += _infoRow("🏆","Fase","Fase de Grupos — Grupo "+jogo.grupo);
    else h += _infoRow("🏆","Fase", {["32avos"]:"32 Avos de Final",oitavas:"Oitavas de Final",quartas:"Quartas de Final",semis:"Semifinais",terceiro:"Disputa de 3° Lugar",final:"FINAL"}[jogo.fase]||jogo.fase);
    h += '</div></div>';
    return h;
  }
};

function _infoRow(icon, label, valor) {
  return '<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;background:var(--fundo2);border-radius:6px">' +
    '<span style="font-size:1rem;flex-shrink:0">'+icon+'</span>' +
    '<div><div style="font-size:.65rem;color:var(--texto2);font-weight:600;text-transform:uppercase;letter-spacing:.04em">'+label+'</div>' +
    '<div style="font-size:.82rem;font-weight:600;margin-top:2px">'+valor+'</div></div></div>';
}