/**
 * prognose.js - Motor Poisson + Modal com 3 abas: Previsão | Palpites | Estádio
 */

// Fallback de ratings caso o modelo JSON não carregue
window.ELO_RATINGS = {
  ARG:2169, FRA:2120, ENG:2045, BRA:2061, ESP:2182, POR:2025,
  BEL:1944, GER:1985, NED:2010, URU:1960, COL:2042, MEX:1927,
  SUI:1944, USA:1810, CRO:1981, AUS:1886, MAR:1967, SCO:1791,
  JPN:1983, SEN:1922, TUR:1928, SWE:1783, AUT:1888, NOR:1932,
  CZE:1782, ECU:1999, CAN:1884, KOR:1862, ALG:1861, IRN:1880,
  EGY:1791, PAR:1893, CIV:1798, GHA:1626, BIH:1651, TUN:1762,
  KSA:1670, CPV:1662, COD:1750, RSA:1645, PAN:1825, IRQ:1724,
  QAT:1554, UZB:1818, JOR:1763, NZL:1731, CUW:1586, HAI:1676
};

// Configurações do motor Poisson (Fallback V1)
window.ELO_CONFIG = {
  BASE_LAMBDA: 1.19,
  POLY: [0.0, 0.380, 0.0, 0.060],
  MAX_GOLS: 9
};

window.PROGNOSE = {

  loadData: async function () {
    try {
      const p1 = fetch('modelo/results/prior_params.json').then(r => r.json());
      const p2 = fetch('modelo/results/k_factors_final.json').then(r => r.json());
      const [priors, kFactors] = await Promise.all([p1, p2]);
      window.MODELO_DATA = { priors, kFactors };
    } catch (e) {
      console.warn("Erro ao carregar modelo v2 (JSONs). Usando fallback v1.", e);
    }
  },

  CODE_TO_EN_NAME: {
    "MEX": "Mexico", "RSA": "South Africa", "KOR": "South Korea", "CZE": "Czech Republic",
    "CAN": "Canada", "BIH": "Bosnia and Herzegovina", "QAT": "Qatar", "SUI": "Switzerland",
    "BRA": "Brazil", "MAR": "Morocco", "HAI": "Haiti", "SCO": "Scotland",
    "USA": "United States", "PAR": "Paraguay", "AUS": "Australia", "TUR": "Turkey",
    "GER": "Germany", "CUW": "Curaçao", "CIV": "Ivory Coast", "ECU": "Ecuador",
    "NED": "Netherlands", "JPN": "Japan", "SWE": "Sweden", "TUN": "Tunisia",
    "BEL": "Belgium", "EGY": "Egypt", "IRN": "Iran", "NZL": "New Zealand",
    "ESP": "Spain", "CPV": "Cape Verde", "KSA": "Saudi Arabia", "URU": "Uruguay",
    "FRA": "France", "SEN": "Senegal", "IRQ": "Iraq", "NOR": "Norway",
    "ARG": "Argentina", "ALG": "Algeria", "AUT": "Austria", "JOR": "Jordan",
    "POR": "Portugal", "COD": "DR Congo", "UZB": "Uzbekistan", "COL": "Colombia",
    "ENG": "England", "CRO": "Croatia", "GHA": "Ghana", "PAN": "Panama"
  },

  calcularV2: function (homeCode, awayCode, isNeutral = false) {
    if (!window.MODELO_DATA || !window.MODELO_DATA.priors || !window.MODELO_DATA.kFactors) return null;
    const priors = window.MODELO_DATA.priors;
    const kf = window.MODELO_DATA.kFactors;

    const hN = this.CODE_TO_EN_NAME[homeCode] || homeCode;
    const aN = this.CODE_TO_EN_NAME[awayCode] || awayCode;

    const eloH = kf[hN]?.elo || window.ELO_RATINGS[homeCode] || 1500;
    const eloA = kf[aN]?.elo || window.ELO_RATINGS[awayCode] || 1500;
    const K_att_h = kf[hN]?.K_att || 1.0;
    const K_def_h = kf[hN]?.K_def || 1.0;
    const K_att_a = kf[aN]?.K_att || 1.0;
    const K_def_a = kf[aN]?.K_def || 1.0;

    let delta_eff_elo = eloH - eloA;
    const hosts = ['USA', 'MEX', 'CAN'];

    // A vantagem de casa (Home Advantage) só se aplica se um dos times for anfitrião (EUA, MEX, CAN)
    if (hosts.includes(homeCode)) {
      delta_eff_elo += priors.home_adv;
    }
    if (hosts.includes(awayCode)) {
      delta_eff_elo -= priors.home_adv;
    }

    const lam_base_h = Math.exp(priors.a + priors.b * delta_eff_elo + priors.c * Math.pow(delta_eff_elo, 2));
    const lam_base_a = Math.exp(priors.a - priors.b * delta_eff_elo + priors.c * Math.pow(delta_eff_elo, 2));

    const lH = lam_base_h * K_att_h * K_def_a;
    const lA = lam_base_a * K_att_a * K_def_h;

    const rho0 = priors.rho0_raw;
    const rho1 = priors.rho1_neg;
    const arg = rho0 - rho1 * Math.abs(delta_eff_elo) / 400.0;
    const rho = 0.2 * Math.tanh(arg);

    return { lH, lA, rho, eloH, eloA };
  },

  dixonColesTau: function (x, y, lamA, lamB, rho) {
    if (x === 0 && y === 0) return Math.max(1e-6, 1 - lamA * lamB * rho);
    if (x === 1 && y === 0) return Math.max(1e-6, 1 + lamA * rho);
    if (x === 0 && y === 1) return Math.max(1e-6, 1 + lamB * rho);
    if (x === 1 && y === 1) return Math.max(1e-6, 1 - rho);
    return 1.0;
  },

  lambda: function (deltaElo) {
    const DR = deltaElo / 1000;
    const cfg = window.ELO_CONFIG;
    const p = cfg.POLY;
    return Math.max(0.10, cfg.BASE_LAMBDA + p[1] * DR + p[2] * DR * DR + p[3] * DR * DR * DR);
  },

  poisson: function (lambda, k) {
    let e = Math.exp(-lambda), f = 1;
    for (let i = 1; i <= k; i++) { f *= i; }
    return e * Math.pow(lambda, k) / f;
  },

  calcular: function (homeCode, awayCode, isNeutral = false) {
    let lH, lA, rho, eloH, eloA;
    const v2 = this.calcularV2(homeCode, awayCode, isNeutral);
    if (v2) {
      lH = v2.lH; lA = v2.lA; rho = v2.rho; eloH = v2.eloH; eloA = v2.eloA;
    } else {
      eloH = window.ELO_RATINGS[homeCode] || 1500;
      eloA = window.ELO_RATINGS[awayCode] || 1500;
      lH = this.lambda(eloH - eloA);
      lA = this.lambda(eloA - eloH);
      rho = 0;
    }

    const N = 7; // 0 até 6+
    const matrix = [];
    let tot = 0;

    for (let i = 0; i < N; i++) {
      matrix[i] = [];
      for (let j = 0; j < N; j++) {
        let p_i = i === N - 1 ? 1 - Array.from({ length: N - 1 }, (_, x) => this.poisson(lH, x)).reduce((a, b) => a + b, 0) : this.poisson(lH, i);
        let p_j = j === N - 1 ? 1 - Array.from({ length: N - 1 }, (_, x) => this.poisson(lA, x)).reduce((a, b) => a + b, 0) : this.poisson(lA, j);

        let v = p_i * p_j;
        if (i <= 1 && j <= 1) {
          v *= this.dixonColesTau(i, j, lH, lA, rho);
        }
        matrix[i][j] = v;
        tot += v;
      }
    }

    let home = 0, draw = 0, away = 0;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        matrix[i][j] /= tot;
        let v = matrix[i][j];
        if (i > j) home += v; else if (i === j) draw += v; else away += v;
      }
    }
    return { lH, lA, home, draw, away, matrix, N, eloH, eloA, homeCode, awayCode, rho };
  },

  statsPalpites: function (gameId) {
    const todos = APP.palpites || {};
    let home = 0, draw = 0, away = 0, total = 0;
    const placarCount = {};
    for (const apId of Object.keys(todos)) {
      const p = todos[apId]?.[gameId];
      if (!p || p.homeGoals === undefined) continue;
      total++;
      const hg = Number(p.homeGoals), ag = Number(p.awayGoals);
      if (hg > ag) home++; else if (hg < ag) away++; else draw++;
      const k = hg + "x" + ag;
      placarCount[k] = (placarCount[k] || 0) + 1;
    }
    return {
      total, home, draw, away,
      topPlacares: Object.entries(placarCount).sort((a, b) => b[1] - a[1]).slice(0, 5)
    };
  },

  abrirModal: function (gameId) {
    let ov = document.getElementById("modal-prog");
    let box = document.getElementById("modal-prog-body");
    
    if (!ov || !box) {
      // Fallback se o HTML não tiver os IDs (embora index.html tenha)
      ov = document.getElementById("prognose-overlay");
      if (!ov) {
        ov = document.createElement("div");
        ov.id = "prognose-overlay";
        ov.className = "modal-overlay";
        ov.innerHTML = '<div class="modal-box" id="prognose-box"></div>';
        document.body.appendChild(ov);
      }
      box = ov.querySelector(".modal-box");
    }

    // Configura eventos de fechar se ainda não configurados
    if (!ov._clickEv) {
      ov.addEventListener("click", e => { if (e.target === ov) this.fecharModal(); });
      ov._clickEv = true;

      // Swipe down para fechar (mobile)
      let startY = 0, startScroll = 0;
      ov.addEventListener("touchstart", e => {
        startY = e.touches[0].clientY;
        startScroll = box.scrollTop;
      }, { passive: true });
      ov.addEventListener("touchmove", e => {
        const dy = e.touches[0].clientY - startY;
        if (dy > 0 && startScroll <= 0) {
          box.style.transform = `translateY(${Math.min(dy * 0.6, 160)}px)`;
          box.style.transition = "none";
        }
      }, { passive: true });
      ov.addEventListener("touchend", e => {
        const dy = e.changedTouches[0].clientY - startY;
        box.style.transition = "";
        box.style.transform = "";
        if (dy > 80 && startScroll <= 0) this.fecharModal();
      }, { passive: true });
    }

    box.innerHTML = '<button class="modal-close" onclick="PROGNOSE.fecharModal()">✕</button>' + this.renderModal(gameId);
    ov.classList.add("aberto");
    document.body.style.overflow = "hidden";
    this._switchTab("prev");
  },

  fecharModal: function () {
    const ov = document.getElementById("modal-prog") || document.getElementById("prognose-overlay");
    if (ov) ov.classList.remove("aberto");
    document.body.style.overflow = "";
  },

  _switchTab: function (tab) {
    ["prev", "pal", "est"].forEach(t => {
      const c = document.getElementById("modal-content-" + t);
      const b = document.getElementById("mtab-" + t);
      if (c) c.style.display = t === tab ? "" : "none";
      if (b) b.classList.toggle("ativo", t === tab);
    });
  },

  renderModal: function (gameId) {
    const jogo = window.SCHEDULE_BY_ID?.[gameId];
    const b = APP.bracket?.[gameId] || {};
    const hC = b.home || jogo?.home; const aC = b.away || jogo?.away;
    const hName = window.TEAMS_BY_CODE?.[hC]?.name || hC || "?";
    const aName = window.TEAMS_BY_CODE?.[aC]?.name || aC || "?";
    const stats = this.statsPalpites(gameId);

    let h = '';
    h += '<div class="modal-tabs" style="display:flex;justify-content:center;gap:6px">';
    h += '<button class="modal-tab ativo" id="mtab-prev" onclick="PROGNOSE._switchTab(\'prev\')">📊 Previsão</button>';
    h += '<button class="modal-tab" id="mtab-pal" onclick="PROGNOSE._switchTab(\'pal\')">🗳 Palpites (' + stats.total + ')</button>';
    h += '<button class="modal-tab" id="mtab-est" onclick="PROGNOSE._switchTab(\'est\')">🏟 Estádio</button>';
    h += '</div>';

    h += '<div id="modal-content-prev">' + this._renderPrevisao(gameId, hC, aC, hName, aName) + '</div>';
    h += '<div id="modal-content-pal" style="display:none">' + this._renderPalpites(gameId, stats, hName, aName) + '</div>';
    h += '<div id="modal-content-est" style="display:none">' + this._renderEstadio(jogo) + '</div>';
    return h;
  },

  _renderPrevisao: function (gameId, hC, aC, hName, aName) {
    if (!window.ELO_RATINGS?.[hC] || !window.ELO_RATINGS?.[aC]) {
      return '<p style="text-align:center;padding:30px;color:var(--texto2)">Dados não disponíveis.</p>';
    }
    const res = getResultados();
    const jogoInfo = window.SCHEDULE_BY_ID?.[gameId];
    const isNeutral = jogoInfo ? (jogoInfo.pais !== hC && jogoInfo.pais !== aC) : true;
    const c = this.calcular(hC, aC, isNeutral);
    const temRes = res[gameId] && res[gameId].homeGoals !== undefined;
    const apostasAbertas = jogoAceita(gameId);
    const podeVer = temRes || !apostasAbertas;

    // Simulação: bloquear se o jogo foi digitado pelo usuário E apostas ainda abertas
    if (jogoEhSimulado(gameId) && apostasAbertas) {
      return '<div style="text-align:center;padding:30px 20px;background:rgba(0,0,0,0.2);border-radius:10px;margin-bottom:15px;border:1px dashed var(--borda)">' +
        '<div style="font-size:2rem;margin-bottom:12px">🎭</div>' +
        '<div style="font-size:.9rem;font-weight:700;color:var(--dourado)">Simulação Ativa</div>' +
        '<div style="font-size:.75rem;color:var(--texto2);margin-top:6px;max-width:260px;margin-left:auto;margin-right:auto">Estatísticas e prognósticos não são revelados para jogos simulados com apostas ainda abertas.</div>' +
        '</div>';
    }

    const fmt = (v) => (v * 100).toFixed(1) + "%";
    let h = "";

    if (!podeVer) {
      h += '<div style="text-align:center;padding:30px 20px;background:rgba(0,0,0,0.2);border-radius:10px;margin-bottom:15px;border:1px dashed var(--borda)">';
      h += '<div style="font-size:2rem;margin-bottom:12px">🔒</div>';
      h += '<div style="font-size:.9rem;font-weight:700">Previsão Bloqueada</div>';
      h += '<div style="font-size:.75rem;color:var(--texto2);margin-top:6px;max-width:260px;margin-left:auto;margin-right:auto">Os dados do modelo e as tendências coletivas ficam ocultos até o fechamento das apostas para este jogo.</div>';
      h += '</div>';
      return h;
    }

    // ELO
    h += '<div class="elo-box">';
    h += '<div class="elo-time">' + htmlBandeira(hC, 28) + '<div class="elo-valor">' + Math.round(c.eloH) + '</div><div class="elo-nome">' + hName + '</div></div>';
    const deltaElo = Math.round(c.eloH) - Math.round(c.eloA);
    h += '<div class="elo-delta">Δ ' + (deltaElo > 0 ? "+" : "") + deltaElo + '</div>';
    h += '<div class="elo-time">' + htmlBandeira(aC, 28) + '<div class="elo-valor">' + Math.round(c.eloA) + '</div><div class="elo-nome">' + aName + '</div></div>';
    h += '</div>';
    // Probs
    h += '<div class="prob-barras">';
    h += '<div class="prob-item"><div class="prob-valor">' + fmt(c.home) + '</div><div class="prob-label">' + hName + ' vence</div></div>';
    h += '<div class="prob-item"><div class="prob-valor">' + fmt(c.draw) + '</div><div class="prob-label">Empate</div></div>';
    h += '<div class="prob-item"><div class="prob-valor">' + fmt(c.away) + '</div><div class="prob-label">' + aName + ' vence</div></div>';
    h += '</div>';
    // Gols esperados
    h += '<div style="text-align:center;font-size:.76rem;color:var(--texto2);margin-bottom:10px">Gols esperados: <strong style="color:var(--texto)">' + c.lH.toFixed(2) + '</strong> × <strong style="color:var(--texto)">' + c.lA.toFixed(2) + '</strong></div>';
    // Matriz
    h += '<div style="font-size:.7rem;font-weight:700;color:var(--texto2);margin-bottom:5px">Matriz de resultados (Poisson)</div>';
    h += '<div style="overflow-x:auto"><table class="matriz-poisson"><thead><tr><th></th>';
    for (let j = 0; j < c.N; j++) h += '<th>' + aName.substring(0, 3) + ' ' + (j === 6 ? "6+" : j) + '</th>';
    h += '</tr></thead><tbody>';
    const all = c.matrix.flat().sort((a, b) => b - a);
    const top1 = all[0] || 1;
    for (let i = 0; i < c.N; i++) {
      h += '<tr><th>' + hName.substring(0, 3) + ' ' + (i === 6 ? "6+" : i) + '</th>';
      for (let j = 0; j < c.N; j++) {
        const v = c.matrix[i][j];
        const p = Math.max(0, Math.min(1, v / top1));

        // Heatmap: Vermelho (hue=0) para prob alta, Amarelo (hue=60) para prob baixa
        const hue = 60 * (1 - p);
        const alpha = 0.1 + 0.6 * p;
        const bg = `hsla(${hue}, 100%, 50%, ${alpha})`;

        const fw = p > 0.8 ? '800' : (p > 0.4 ? '600' : '400');
        const color = p > 0.5 ? '#fff' : 'var(--texto2)';
        const border = i === j ? 'outline:1px solid rgba(255,255,255,0.2);outline-offset:-1px;' : '';

        h += `<td style="background:${bg};color:${color};font-weight:${fw};${border}">${(v * 100).toFixed(1)}%</td>`;
      }
      h += '</tr>';
    }
    h += '</tbody></table></div>';
    return h;
  },

  _renderPalpites: function (gameId, s, hName, aName) {
    const res = getResultados();
    const temRes = res[gameId] && res[gameId].homeGoals !== undefined;
    const apostasAbertas = jogoAceita(gameId);
    const podeVer = temRes || !apostasAbertas;

    // Simulação: bloquear se o jogo foi digitado pelo usuário E apostas ainda abertas
    if (jogoEhSimulado(gameId) && apostasAbertas) {
      return '<div style="text-align:center;padding:40px 20px;color:var(--texto2)">' +
             '<div style="font-size:2rem;margin-bottom:10px">🎭</div>' +
             '<div style="font-weight:700;color:var(--dourado)">Simulação Ativa</div>' +
             '<div style="font-size:.75rem;margin-top:5px">Apostas dos outros participantes não são reveladas para jogos simulados com apostas ainda abertas.</div></div>';
    }

    if (!podeVer) {
      return '<div style="text-align:center;padding:40px 20px;color:var(--texto2)">' +
             '<div style="font-size:2rem;margin-bottom:10px">🔒</div>' +
             '<div style="font-weight:700;color:var(--texto)">Palpites Ocultos</div>' +
             '<div style="font-size:.75rem;margin-top:5px">A tendência das apostas dos outros participantes só será revelada após o fechamento do mercado para este jogo.</div></div>';
    }

    if (!s.total) return '<p style="text-align:center;color:var(--texto2);padding:30px">Nenhum palpite registrado.</p>';
    const pHome = Math.round(s.home / s.total * 100);
    const pDraw = Math.round(s.draw / s.total * 100);
    const pAway = 100 - pHome - pDraw;
    let h = '<div style="text-align:center;font-size:.78rem;color:var(--texto2);margin-bottom:14px">' + s.total + ' apostadores • ' + ((s.home + s.draw + s.away)) + ' palpites registrados</div>';
    for (const [lbl, pct, cor] of [[hName, pHome, "var(--verde-ok)"], ["Empate", pDraw, "var(--texto2)"], [aName, pAway, "#f87171"]]) {
      h += '<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:.76rem;margin-bottom:3px"><span>' + lbl + '</span><span style="font-weight:800;color:' + cor + '">' + pct + '%</span></div>';
      h += '<div style="background:var(--fundo2);border-radius:4px;height:8px;overflow:hidden"><div style="width:' + pct + '%;height:100%;background:' + cor + ';border-radius:4px;transition:width .5s ease"></div></div></div>';
    }
    if (s.topPlacares.length) {
      h += '<div style="font-size:.72rem;font-weight:700;color:var(--texto2);text-transform:uppercase;letter-spacing:.05em;margin:14px 0 8px">Top placares apostados</div>';
      const maxCt = s.topPlacares[0][1];
      const r = res[gameId];
      s.topPlacares.forEach(([placar, ct]) => {
        const acertou = r && r.homeGoals !== undefined && placar === r.homeGoals + "x" + r.awayGoals;
        h += '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--fundo2);border-radius:6px;margin-bottom:4px' + (acertou ? ";border:1px solid var(--verde-ok)" : "") + '">';
        h += '<span style="font-weight:800;width:34px;text-align:center;' + (acertou ? "color:var(--verde-ok)" : "") + '">' + placar + '</span>';
        h += '<div style="flex:1;background:var(--card);border-radius:3px;height:6px"><div style="width:' + (ct / maxCt * 100) + '%;height:100%;background:var(--verde);border-radius:3px"></div></div>';
        h += '<span style="font-size:.72rem;color:var(--texto2)">' + ct + '×' + (acertou ? " ✓ Oficial" : "") + '</span></div>';
      });
    }
    return h;
  },

  _renderEstadio: function (jogo) {
    if (!jogo?.cidade) return '<p style="text-align:center;color:var(--texto2);padding:30px">Informações não disponíveis.</p>';
    const v = window.VENUES?.[jogo.cidade];
    const data = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(jogo.utc));
    let h = '<div style="display:flex;flex-direction:column;gap:10px">';
    if (v && v.img) {
      h += '<div style="border-radius:var(--radius-sm);overflow:hidden;height:140px;background:var(--fundo2);display:flex;align-items:center;justify-content:center">';
      h += '<img src="' + v.img + '" style="width:100%;height:140px;object-fit:cover;border-radius:var(--radius-sm)">';
      h += '</div>';
    }
    h += '<div style="display:grid;gap:8px">';
    if (v) {
      h += _infoRow("🏟", "Estádio", '<a href="' + v.link + '" target="_blank" rel="noopener" style="color:var(--verde-light);text-decoration:none">' + v.estadio + '</a>');
    }
    h += _infoRow("📍", "Cidade", jogo.cidade + " · " + (jogo.pais === "USA" ? "EUA" : jogo.pais === "MEX" ? "México" : jogo.pais === "CAN" ? "Canadá" : jogo.pais || ""));
    h += _infoRow("📅", "Data & Hora", data + " (BRT)");
    if (jogo.fase === "grupos") h += _infoRow("🏆", "Fase", "Fase de Grupos — Grupo " + jogo.grupo);
    else h += _infoRow("🏆", "Fase", { ["32avos"]: "32 Avos de Final", oitavas: "Oitavas de Final", quartas: "Quartas de Final", semis: "Semifinais", terceiro: "Disputa de 3° Lugar", final: "FINAL" }[jogo.fase] || jogo.fase);
    h += '</div></div>';
    return h;
  }
};

function _infoRow(icon, label, valor) {
  return '<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;background:var(--fundo2);border-radius:6px">' +
    '<span style="font-size:1rem;flex-shrink:0">' + icon + '</span>' +
    '<div><div style="font-size:.65rem;color:var(--texto2);font-weight:600;text-transform:uppercase;letter-spacing:.04em">' + label + '</div>' +
    '<div style="font-size:.82rem;font-weight:600;margin-top:2px">' + valor + '</div></div></div>';
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.PROGNOSE && PROGNOSE.loadData) PROGNOSE.loadData();
});