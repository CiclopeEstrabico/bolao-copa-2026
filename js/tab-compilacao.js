/** tab-compilacao.js - Heatmap de palpites */

window.abrirModalApostador = function (nome, apelido, pts, apostadorId) {
  // Calcular stats reais se tivermos o ID do apostador
  let st = null;
  if (apostadorId && apostadorId !== '__modelo__') {
    const a = (APP.apostadores || []).find(x => x.id === apostadorId);
    if (a) {
      const res = getResultados();
      const esp = window.BRACKET?.extrairEspeciaisOficiais?.(res, APP.bracket || {}) || {};
      st = calcularPontosApostador(APP.palpites?.[a.id] || {}, res, a, esp);
    }
  } else if (apostadorId === '__modelo__' && window.getModelo && APP._modeloCarregado) {
    const modeloA = window.getModelo();
    if (modeloA) {
      const res = getResultados();
      const esp = window.BRACKET?.extrairEspeciaisOficiais?.(res, APP.bracket || {}) || {};
      st = calcularPontosApostador(APP.palpitesModelo || {}, res, modeloA, esp);
    }
  }

  const nomeCompleto = nome || apelido || '';
  const apelidoDisplay = apelido || nome || '';

  // Remover popup anterior se existir
  const existing = document.getElementById('popup-apostador-detalhe');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.id = 'popup-apostador-detalhe';
  div.style.cssText = 'position:fixed;inset:0;z-index:300;background:rgba(0,0,0,.65);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px';

  let inner = '';
  inner += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">';
  inner += '<div>';
  inner += '<div style="font-size:1rem;font-weight:800;color:var(--texto)">' + apelidoDisplay + '</div>';
  if (nomeCompleto && nomeCompleto !== apelidoDisplay) {
    inner += '<div style="font-size:.72rem;color:var(--texto2);margin-top:2px">' + nomeCompleto + '</div>';
  }
  inner += '</div>';
  inner += '<button onclick="document.getElementById(\'popup-apostador-detalhe\')?.remove()" style="background:rgba(255,255,255,.08);border:none;border-radius:50%;width:28px;height:28px;color:var(--texto2);font-size:.9rem;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>';
  inner += '</div>';

  if (st) {
    const _card = function(label, valor, cor) {
      return '<div style="background:var(--fundo2);border-radius:8px;padding:10px;text-align:center">' +
        '<div style="font-size:.55rem;color:var(--texto2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px">' + label + '</div>' +
        '<div style="font-size:1.2rem;font-weight:900;color:' + cor + '">' + valor + '</div></div>';
    };
    inner += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:10px">';
    inner += _card('Pontos Totais', st.total.toFixed(1), 'var(--verde-light)');
    inner += _card('Acertos Resultado', st.acertos_resultado, '#22c55e');
    inner += _card('Grupos', st.total_grupos.toFixed(1) + ' pts', 'var(--texto)');
    inner += _card('Eliminatórias', st.total_eliminatorias.toFixed(1) + ' pts', 'var(--texto)');
    inner += '</div>';

    const _mini = function(label, valor, cor) {
      return '<div style="background:var(--fundo2);border-radius:8px;padding:8px 4px;text-align:center">' +
        '<div style="font-size:.5rem;color:var(--texto2);text-transform:uppercase;letter-spacing:.02em;margin-bottom:2px">' + label + '</div>' +
        '<div style="font-size:.9rem;font-weight:800;color:' + cor + '">' + valor + '</div></div>';
    };
    inner += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">';
    inner += _mini('Bônus+1', st.acertos_bonus1, '#9bf73e');
    inner += _mini('Placar+3', st.acertos_placar_exato, '#ffff66');
    inner += _mini('Placar+5', st.acertos_placar_alto, '#fb923c');
    inner += '</div>';
  } else {
    inner += '<div style="text-align:center;padding:10px 0">';
    inner += '<div style="font-size:.68rem;color:var(--texto2);text-transform:uppercase;letter-spacing:.06em;font-weight:700">Pontos Totais</div>';
    inner += '<div style="font-size:2rem;font-weight:900;color:var(--dourado);margin-top:4px">' + Number(pts).toFixed(1) + '</div>';
    inner += '</div>';
  }

  inner += '<div style="margin-top:10px;font-size:.65rem;color:var(--texto2);text-align:center">Toque fora para fechar</div>';

  div.innerHTML = '<div style="width:100%;max-width:400px;background:var(--card);border-radius:var(--radius);padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.4)">' + inner + '</div>';
  div.addEventListener('click', e => { if (e.target === div) div.remove(); });
  document.body.appendChild(div);
};

window.renderCompilacao = function () {
  const el = document.getElementById("aba-compilacao");
  if (!el) return;
  const res = getResultados();
  const apos = APP.apostadores || [];
  const pals = APP.palpites || {};
  if (!apos.length) { el.innerHTML = '<div class="card"><p style="color:var(--texto2)">Nenhum apostador cadastrado.</p></div>'; return; }

  // Cache: evita re-renderizar quando nada mudou (BONUS: melhora performance mobile)
  const cacheKey = JSON.stringify({ fase: window._compFase, ordem: window._compOrdem, resKeys: Object.keys(res).join(','), apLen: apos.length });
  if (window._compilacaoCacheKey === cacheKey && el.dataset.rendered === '1') {
    // Mesmo sem re-renderizar o HTML, se o frozen-thead foi limpo (ao mudar de aba e voltar), precisamos registrar novamente!
    if (window.innerWidth <= 600 && window.registrarFrozenHeader) {
      const table = el.querySelector(".compilacao-table");
      const wrapper = el.querySelector(".compilacao-wrap");
      if (table && wrapper && (!wrapper._frozenHeader || !document.body.contains(wrapper._frozenHeader))) {
        wrapper._frozenHeader = null;
        window.registrarFrozenHeader(table, wrapper);
      }
    }
    return;
  }
  window._compilacaoCacheKey = cacheKey;


  // Filtros de fase
  const fases = ["todos", "grupos", "16avos", "oitavas", "quartas", "semis", "terceiro", "final"];
  const faseAtiva = window._compFase || "todos";
  const nomesFase = { todos: "Todos", grupos: "Grupos", "16avos": "16 Avos", oitavas: "Oitavas", quartas: "Quartas", semis: "Semis", terceiro: "3o Lugar", final: "Final" };
  const ordemStr = window._compOrdem || "pts";

  let toggleBarHtml = '<div class="toggle-bar" style="margin-top:15px;margin-bottom:15px;justify-content:center">';
  toggleBarHtml += '<span class="toggle-label">Fase:</span>';
  for (const f of fases) {
    toggleBarHtml += '<button class="btn-toggle' + (faseAtiva === f ? " ativo" : "") + '" onclick="window._compFase=\'' + f + '\';renderAbaAtiva()">' + nomesFase[f] + '</button>';
  }

  toggleBarHtml += '<div class="toggle-sep"></div>';

  toggleBarHtml += '<span class="toggle-label">Ordenar por:</span>';
  toggleBarHtml += '<button class="btn-toggle' + (ordemStr === "alfa" ? " ativo" : "") + '" onclick="window._compOrdem=\'alfa\';renderAbaAtiva()">A-Z</button>';
  toggleBarHtml += '<button class="btn-toggle' + (ordemStr === "pts" ? " ativo" : "") + '" onclick="window._compOrdem=\'pts\';renderAbaAtiva()">Pontos</button>';
  toggleBarHtml += '<button class="btn-toggle' + (ordemStr === "res" ? " ativo" : "") + '" onclick="window._compOrdem=\'res\';renderAbaAtiva()">Resultados</button>';
  toggleBarHtml += '<button class="btn-toggle' + (ordemStr === "placar" ? " ativo" : "") + '" onclick="window._compOrdem=\'placar\';renderAbaAtiva()">Placar</button>';
  toggleBarHtml += '</div>';

  const jogos = (window.SCHEDULE || []).filter(j => faseAtiva === "todos" || j.fase === faseAtiva)
    .sort((a, b) => new Date(a.utc) - new Date(b.utc));
  if (!jogos.length) { el.innerHTML = '<div class="card"><p style="color:var(--texto2)">Sem jogos nesta fase.</p></div>' + toggleBarHtml; return; }

  // Ranking lateral: ordenar apostadores
  // Passa especiais oficiais para que pontos totais incluam campeão/vice/3º
  const espOficiaisComp = window.BRACKET.extrairEspeciaisOficiais(res, APP.bracket || {});
  const rankingBase = apos.map(a => {
    const st = calcularPontosApostador(pals[a.id] || {}, res, a, espOficiaisComp);
    return {
      ...a,
      pts:    st.total,
      placar: st.acertos_placar_exato + st.acertos_placar_alto,
      res:    st.acertos_resultado,
      jogos_com_palpite: st.jogos_com_palpite,
      _st: st,
      isModelo: false,
    };
  });

  // Inserir MODELO na posição correta por pontos
  const modeloComp = window.getModelo ? window.getModelo() : null;
  if (modeloComp && APP._modeloCarregado) {
    const stModelo = calcularPontosApostador(APP.palpitesModelo || {}, res, modeloComp, espOficiaisComp);
    rankingBase.push({
      ...modeloComp,
      pts:    stModelo.total,
      placar: stModelo.acertos_placar_exato + stModelo.acertos_placar_alto,
      res:    stModelo.acertos_resultado,
      jogos_com_palpite: stModelo.jogos_com_palpite,
      _st: stModelo,
      isModelo: true,
    });
  }

  const ranking = rankingBase.sort((a, b) => {
    if (ordemStr === "alfa") {
      if (a.isModelo) return 1;
      if (b.isModelo) return -1;
      return (a.apelido || a.nome || "").localeCompare(b.apelido || b.nome || "");
    }
    if (ordemStr === "res") return b.res - a.res;
    if (ordemStr === "placar") return b.placar - a.placar;
    return b.pts - a.pts; // Default pts
  });

  let h = '';
  h += '<div class="compilacao-wrap"><table class="compilacao-table"><thead><tr>';
  h += '<th class="col-jogo">Jogo</th>';
  h += '<th class="col-resultado">' + (window.innerWidth <= 600 ? 'Result' : 'Resultado') + '</th>';
  for (const a of ranking) {
    const nomeA = a.apelido || a.nome || "?";
    const nomeEscaped = (a.nome || nomeA).replace(/'/g, "\\'");
    const apelidoEscaped = (a.apelido || "").replace(/'/g, "\\'");
    if (a.isModelo) {
      h += '<th onclick="window.abrirModalApostador(\'Modelo Estat\u00edstico\', \'Modelo\', ' + a.pts + ', \'__modelo__\')" title="Modelo — Refer\u00eancia Estat\u00edstica (Clique para ver detalhes)" style="max-width:50px;overflow:hidden;text-overflow:clip;white-space:nowrap;padding:4px 2px;font-weight:normal;color:#7ba4c9;cursor:pointer">' +
           'Modelo' + '</th>';
    } else {
      const idEscaped = (a.id || '').replace(/'/g, "\\'");
      h += '<th onclick="window.abrirModalApostador(\'' + nomeEscaped + '\', \'' + apelidoEscaped + '\', ' + a.pts + ', \'' + idEscaped + '\')" title="' + (a.nome || nomeA) + ' (Clique para ver detalhes)" style="max-width:50px;overflow:hidden;text-overflow:clip;white-space:nowrap;padding:4px 2px;cursor:pointer">' + nomeA + '</th>';
    }
  }
  h += '</tr></thead><tbody>';

  for (const jogo of jogos) {
    const r = res[jogo.id];
    const temRes = r && r.homeGoals !== undefined;
    const b = APP.bracket?.[jogo.id] || {};
    const hC = b.home || jogo.home; const aC = b.away || jogo.away;
    const hDisplay = getSigla(hC);
    const aDisplay = getSigla(aC);
    const dataHoraStr = formatarDataBRT(jogo.utc, false);
    const faseLbl = getFaseLabel(jogo);
    const dataHora = dataHoraStr + (faseLbl ? ", " + faseLbl : "");
    const gameFullName = nomeTime(hC) + ' x ' + nomeTime(aC);
    h += '<tr><td class="col-jogo" onclick="PROGNOSE.abrirModal(\'' + jogo.id + '\')" title="' + gameFullName + '" style="position:sticky;left:0;background:var(--card2);padding:6px 8px;z-index:1;box-shadow:2px 0 5px rgba(0,0,0,0.1);cursor:pointer">';
    h += '<div style="font-size:.6rem;color:var(--texto2);margin-bottom:3px">' + dataHora + '</div>';
    h += '<div style="display:flex;align-items:center;gap:4px;font-weight:700;width:100%">' + htmlBandeira(hC, 14) + ' <span class="compilacao-time-nome comp-sigla">' + hDisplay + '</span> <span style="color:var(--texto2)">×</span> <span class="compilacao-time-nome comp-sigla">' + aDisplay + '</span> ' + htmlBandeira(aC, 14) + '</div></td>';
    // Resultado oficial
    if (temRes) {
      let resHtml = r.homeGoals + 'x' + r.awayGoals;
      if (r.foi_penaltis) {
        const ph = r.penaltis_home ?? 0; const pa = r.penaltis_away ?? 0;
        resHtml += '<div style="font-size:.58rem;color:var(--amber);margin-top:1px;font-weight:700">PEN ' + ph + 'x' + pa + '</div>';
      }
      h += '<td class="col-resultado" onclick="PROGNOSE.abrirModal(\'' + jogo.id + '\')" style="background:var(--fundo2);color:var(--texto);vertical-align:middle;cursor:pointer">' + resHtml + '</td>';
    } else {
      h += '<td class="col-resultado" onclick="PROGNOSE.abrirModal(\'' + jogo.id + '\')" style="background:var(--fundo2);color:var(--texto2);cursor:pointer">–</td>';
    }
    // Palpites de cada apostador (incluindo MODELO)
    for (const a of ranking) {
      const meusPals = a.isModelo ? (APP.palpitesModelo || {}) : (pals[a.id] || {});
      const p = meusPals[jogo.id];
      if (!p || p.homeGoals === undefined) { h += '<td class="celula-sem">·</td>'; continue; }

      // REGRA DE VISIBILIDADE: mesma regra aplicada a todos, incluindo MODELO
      const apostasAbertas = jogoAceita(jogo.id);
      const podeVer = (temRes && !jogoEhSimulado(jogo.id)) || !apostasAbertas;

      if (!podeVer) {
        h += '<td class="celula-futuro" style="color:var(--texto2);opacity:0.3" title="Palpite oculto até o fechamento das apostas">🔒</td>';
        continue;
      }

      const cellStyle = '';

      if (!temRes) { h += '<td class="celula-futuro" style="' + cellStyle + '">' + p.homeGoals + 'x' + p.awayGoals + '</td>'; continue; }
      const br = calcularPontosBrutos(p, r);
      const pts = aplicarFator(br.total_bruto, jogo.fase);
      let cls = "celula-erro";
      if (br.acertou) {
        const bv = br.total_bruto;
        if (bv >= 8) cls = "celula-pts-8";
        else if (bv >= 6) cls = "celula-pts-6";
        else if (bv >= 4) cls = "celula-pts-4";
        else cls = "celula-pts-3";
      }
      h += '<td class="' + cls + '" style="' + cellStyle + '" title="' + pts + 'pts">' + p.homeGoals + 'x' + p.awayGoals + '</td>';
    }
    h += '</tr>';
  }

  // --- Linhas de Especiais (Campeão, Vice, 3º) ---
  // Derivados automaticamente do bracket (igual à aba Classificação)
  const brk = APP.bracket || {};
  const resOficialEsp = window.BRACKET.extrairEspeciaisOficiais(res, brk);

  const rowsEsp = [
    { label: "🏆 Campeão", key: "campeao" },
    { label: "🥈 Vice",    key: "vice" },
    { label: "🥉 3º Lugar", key: "terceiro" }
  ];

  // Visibilidade dos especiais: exibe se grupos travados OU resultado oficial real conhecido.
  // Nunca exibe resultado simulado como se fosse oficial.
  // Campeão e Vice dependem do jogo FNL; 3º Lugar depende do jogo TPL.
  const gruposTravados = !(window.APP?.configStatus?.liberado_grupos);
  const _resOficiais = getResultados();
  const fnlOficial = !!_resOficiais["FNL"] && _resOficiais["FNL"].homeGoals !== undefined && !jogoEhSimulado("FNL");
  const tplOficial = !!_resOficiais["TPL"] && _resOficiais["TPL"].homeGoals !== undefined && !jogoEhSimulado("TPL");
  const _jogoOficialPorKey = { campeao: fnlOficial, vice: fnlOficial, terceiro: tplOficial };

  for (const rowE of rowsEsp) {
    h += '<tr style="background:rgba(234,179,8,0.05)"><td class="col-jogo" style="position:sticky;left:0;background:var(--card2);z-index:1;font-weight:700;font-size:.68rem">' + rowE.label + '</td>';

    // Resultado oficial derivado automaticamente — só considerado "real" se o jogo
    // específico de cada posição já tiver resultado oficial (não simulado).
    const escOf = resOficialEsp[rowE.key] || "";
    const resultadoOficialReal = escOf && _jogoOficialPorKey[rowE.key];
    const nomeOf = window.TEAMS_BY_CODE?.[escOf]?.name || (escOf ? escOf : "—");
    const siglaOf = escOf ? getSigla(escOf) : "—";
    const displayOf = (window.innerWidth <= 600) ? siglaOf : nomeOf;
    const tooltipOf = (window.innerWidth <= 600 && escOf) ? `title="${nomeOf}"` : '';
    h += '<td class="col-resultado" ' + tooltipOf + ' style="background:var(--fundo2);font-weight:700;font-size:.65rem;color:var(--dourado)">' + (resultadoOficialReal ? displayOf : (gruposTravados ? displayOf : "—")) + '</td>';

    for (const a of ranking) {
      const espA = a.isModelo ? (window.getModelo ? window.getModelo() : a)?.especiais || {} : (a.especiais || {});
      const palE = (espA && espA[rowE.key]) || "";
      const nomePal = window.TEAMS_BY_CODE?.[palE]?.name || (palE ? palE : "—");
      const siglaPal = palE ? getSigla(palE) : "—";
      const displayPal = (window.innerWidth <= 600) ? siglaPal : nomePal;
      const tooltipPal = (window.innerWidth <= 600 && palE) ? `title="${nomePal}"` : '';
      const acertou = resultadoOficialReal && palE === escOf;
      const podeVerEsp = resultadoOficialReal || gruposTravados;
      const cellStyle = '';

      if (!podeVerEsp) {
        h += '<td style="font-size:.62rem;text-align:center;color:var(--texto2);opacity:0.3" title="Palpite oculto até o fechamento dos grupos">🔒</td>';
        continue;
      }
      if (acertou) {
        h += '<td class="celula-pts-8" ' + tooltipPal + ' style="font-size:.62rem;' + cellStyle + '">' + displayPal + '</td>';
      } else {
        const cor = escOf ? "var(--texto2)" : "var(--texto)";
        h += '<td ' + tooltipPal + ' style="font-size:.62rem;text-align:center;color:' + cor + ';' + cellStyle + '">' + displayPal + '</td>';
      }
    }
    h += '</tr>';
  }


  // Estatisticas de Aproveitamento (Linhas Finais)
  // maxPtsGeral: mesmo critério de scoring.js — base(3) + bonus_alto(5) × fator,
  // para todos os jogos já realizados. Consistente com calcularMaxPontosPossiveis.
  const maxPtsGeral = calcularMaxPontosPossiveis(res);

  const lbls = [
    { title: "Qtd. de Acertos (Resultado)", val: a => a.res,    cor: "var(--texto)" },
    { title: "Qtd. de Placar Exato",        val: a => a.placar, cor: "var(--texto)" },
    { title: "% Resultado Correto", val: a => a.jogos_com_palpite ? ((a.res    / a.jogos_com_palpite) * 100).toFixed(1) + "%" : "0.0%", cor: "var(--texto2)" },
    { title: "% Placar Exato",      val: a => a.jogos_com_palpite ? ((a.placar / a.jogos_com_palpite) * 100).toFixed(1) + "%" : "0.0%", cor: "var(--texto2)" },
    { title: "Pontos Totais Alcançados", val: a => a.pts.toFixed(1), cor: "var(--dourado)" },
    { title: "% dos Pontos Possíveis",  val: a => maxPtsGeral ? ((a.pts / maxPtsGeral) * 100).toFixed(1) + "%" : "0.0%", cor: "var(--dourado)" }
  ];

  for (const L of lbls) {
    h += '<tr><td class="col-jogo" style="position:sticky;left:0;background:var(--fundo2);font-weight:700;font-size:.7rem;border-top:1px solid var(--borda)">' + L.title + '</td>';
    h += '<td class="col-resultado" style="background:var(--fundo2);border-top:1px solid var(--borda)"></td>';
    for (const a of ranking) {
      const cellStyle = 'background:var(--fundo2);';
      h += '<td style="font-weight:800;color:' + L.cor + ';font-size:.75rem;' + cellStyle + 'border-top:1px solid var(--borda)">' + L.val(a) + '</td>';
    }
    h += '</tr>';
  }
  h += '</tbody></table></div>';
  h += toggleBarHtml;

  h += '<div style="display:flex;justify-content:center;gap:12px;margin-top:20px;margin-bottom:10px">';
  h += '<button class="btn btn-secundario" onclick="exportarCompilacaoCsv()">📊 Exportar CSV</button>';
  h += '<button class="btn btn-secundario" onclick="exportarCompilacaoJson()">📥 Exportar JSON</button>';
  h += '</div>';

  el.innerHTML = h;
  el.dataset.rendered = '1'; // marca como renderizado para o cache

  // Registrar cabeçalho fixo no mobile para a tabela de palpites
  if (window.innerWidth <= 600 && window.registrarFrozenHeader) {
    const table = el.querySelector(".compilacao-table");
    const wrapper = el.querySelector(".compilacao-wrap");
    if (table && wrapper) {
      window.registrarFrozenHeader(table, wrapper);
    }
  }

  // Tooltip unificado (hover desktop + toque mobile) — cobre os <th> dos apostadores
  window.injetarTooltipsMobile(el);
};

window.exportarCompilacaoJson = function () {
  // ① Bloqueia exportação em modo simulação
  if (APP.modoSimulacao) {
    alert('⚠️ Você está em modo de simulação. Saia da simulação antes de exportar para não misturar dados simulados com resultados reais.');
    return;
  }

  const res = getResultados();
  const apos = APP.apostadores || [];
  const pals = APP.palpites || {};
  const brk = APP.bracket || {};

  // ② Jogos em ordem cronológica
  const jogosOrdenados = (window.SCHEDULE || []).sort((a, b) => new Date(a.utc) - new Date(b.utc));

  const espOficiaisExp = window.BRACKET.extrairEspeciaisOficiais(res, brk);

  // Verifica se ao menos uma fase está liberada (sem depender de apostas_liberadas,
  // que só existe em modo offline — removido)
  const _cfgSt = APP.configStatus || {};
  const _algumaLiberada = Object.keys(_cfgSt).some(k => k.startsWith("liberado_") && _cfgSt[k]);

  const ranking = apos.map(a => {
    const st = calcularPontosApostador(pals[a.id] || {}, res, a, espOficiaisExp);
    // Filtra palpites para não vazar no JSON se a fase ainda estiver aberta e sem resultado
    const palpitesFiltrados = {};
    const meusPals = pals[a.id] || {};
    for (const jId of Object.keys(meusPals)) {
      const temRes = res[jId] && res[jId].homeGoals !== undefined;
      if (temRes || !jogoAceita(jId)) {
        const p = meusPals[jId];
        palpitesFiltrados[jId] = {
          homeGoals: p.homeGoals,
          awayGoals: p.awayGoals
        };
      }
    }
    const esp = a.especiais || {};
    return {
      id: a.id,
      nome: a.nome,
      apelido: a.apelido,
      pts: st.total,
      placar_exato: st.acertos_placar_exato,
      resultado_correto: st.acertos_resultado,
      palpites: palpitesFiltrados,
      _espRaw: esp
    };
  }).sort((a, b) => b.pts - a.pts);

  // Inserir MODELO no export (como participante normal, com mesmas regras de visibilidade)
  const modeloExpJson = window.getModelo ? window.getModelo() : null;
  if (modeloExpJson && APP._modeloCarregado) {
    const stMod = calcularPontosApostador(APP.palpitesModelo || {}, res, modeloExpJson, espOficiaisExp);
    const palpitesFiltradosMod = {};
    for (const jId of Object.keys(APP.palpitesModelo || {})) {
      const temRes = res[jId] && res[jId].homeGoals !== undefined;
      if (temRes || !jogoAceita(jId)) {
        const p = (APP.palpitesModelo || {})[jId];
        palpitesFiltradosMod[jId] = { homeGoals: p.homeGoals, awayGoals: p.awayGoals };
      }
    }
    ranking.push({
      id: "MODELO",
      nome: "Modelo Estatístico",
      apelido: "MODELO",
      pts: stMod.total,
      placar_exato: stMod.acertos_placar_exato,
      resultado_correto: stMod.acertos_resultado,
      palpites: palpitesFiltradosMod,
      _espRaw: modeloExpJson.especiais || {},
      isModelo: true,
    });
    ranking.sort((a, b) => b.pts - a.pts);
  }

  // ④ Resultados com nomes reais dos times (resolvidos via bracket)
  const resultadosExport = {};
  for (const jogo of jogosOrdenados) {
    const r = res[jogo.id];
    if (!r || r.homeGoals === undefined) continue;
    const hC = brk[jogo.id]?.home || jogo.home;
    const aC = brk[jogo.id]?.away || jogo.away;
    resultadosExport[jogo.id] = {
      ...r,
      home: window.TEAMS_BY_CODE?.[hC]?.name || hC,
      away: window.TEAMS_BY_CODE?.[aC]?.name || aC,
    };
  }

  // ⑤ Resultado oficial dos especiais: só expõe se o jogo específico é oficial não-simulado,
  // OU se os grupos já estão travados. Campeão/Vice ← FNL; 3º lugar ← TPL.
  const _gruposTravadosJson = !_algumaLiberada || !(_cfgSt.liberado_grupos);
  const _fnlOficialJson = !!res["FNL"] && res["FNL"].homeGoals !== undefined && !jogoEhSimulado("FNL");
  const _tplOficialJson = !!res["TPL"] && res["TPL"].homeGoals !== undefined && !jogoEhSimulado("TPL");
  const _podeExpEsp = {
    campeao:  _fnlOficialJson || _gruposTravadosJson,
    vice:     _fnlOficialJson || _gruposTravadosJson,
    terceiro: _tplOficialJson || _gruposTravadosJson,
  };
  const exportData = {
    timestamp: new Date().toISOString(),
    status_apostas: _algumaLiberada ? "LIBERADAS" : "TRAVADAS",
    resultados_oficiais: resultadosExport,
    especiais_oficiais: {
      campeao:  _podeExpEsp.campeao  ? (window.TEAMS_BY_CODE?.[espOficiaisExp.campeao]?.name  || espOficiaisExp.campeao  || "") : "",
      vice:     _podeExpEsp.vice     ? (window.TEAMS_BY_CODE?.[espOficiaisExp.vice]?.name     || espOficiaisExp.vice     || "") : "",
      terceiro: _podeExpEsp.terceiro ? (window.TEAMS_BY_CODE?.[espOficiaisExp.terceiro]?.name || espOficiaisExp.terceiro || "") : ""
    },
    ranking_e_palpites: ranking.map(a => {
      const esp = a._espRaw || {};
      const r = Object.assign({}, a);
      delete r._espRaw;
      r.especiais = {
        campeao:  _podeExpEsp.campeao  ? (esp.campeao  || "") : "🔒",
        vice:     _podeExpEsp.vice     ? (esp.vice     || "") : "🔒",
        terceiro: _podeExpEsp.terceiro ? (esp.terceiro || "") : "🔒",
      };
      return r;
    })
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
  const el = document.createElement('a');
  el.setAttribute("href", dataStr);
  el.setAttribute("download", "bolao_copa_export_" + new Date().toISOString().replace(/[:.]/g, "-") + ".json");
  document.body.appendChild(el);
  el.click();
  el.remove();
};

window.exportarCompilacaoCsv = function () {
  // ① Bloqueia exportação em modo simulação
  if (APP.modoSimulacao) {
    alert('⚠️ Você está em modo de simulação. Saia da simulação antes de exportar para não misturar dados simulados com resultados reais.');
    return;
  }

  const res = getResultados();
  const apos = APP.apostadores || [];
  const pals = APP.palpites || {};
  const brk = APP.bracket || {};

  // ② Ordem cronológica
  const jogos = (window.SCHEDULE || []).slice().sort((a, b) => new Date(a.utc) - new Date(b.utc));

  if (!apos.length || !jogos.length) return;

  const espOficiaisCsv = window.BRACKET.extrairEspeciaisOficiais(res, brk);

  const ranking = apos.map(a => {
    const st = calcularPontosApostador(pals[a.id] || {}, res, a, espOficiaisCsv);
    const esp = a.especiais || {};
    return {
      id: a.id, nome: a.nome, apelido: a.apelido, pts: st.total,
      especiais: { campeao: esp.campeao || "", vice: esp.vice || "", terceiro: esp.terceiro || "" },
      isModelo: false,
    };
  }).sort((a, b) => b.pts - a.pts);

  // Inserir MODELO no CSV
  const modeloExpCsv = window.getModelo ? window.getModelo() : null;
  if (modeloExpCsv && APP._modeloCarregado) {
    const stMod = calcularPontosApostador(APP.palpitesModelo || {}, res, modeloExpCsv, espOficiaisCsv);
    const espMod = modeloExpCsv.especiais || {};
    ranking.push({
      id: "MODELO", nome: "Modelo Estatístico", apelido: "MODELO", pts: stMod.total,
      especiais: { campeao: espMod.campeao || "", vice: espMod.vice || "", terceiro: espMod.terceiro || "" },
      isModelo: true,
    });
    ranking.sort((a, b) => b.pts - a.pts);
  }

  let csvContent = "\uFEFF"; // BOM para forçar UTF-8 no Excel

  // ③ Sem token na lista de cabeçalho
  const headers = ["ID Jogo", "Fase", "Data", "Mandante", "Visitante", "Resultado Oficial"];
  for (const a of ranking) {
    headers.push(`"${a.nome} (${a.apelido || ''})"`);
  }
  csvContent += headers.join(";") + "\r\n";

  for (const jogo of jogos) {
    const r = res[jogo.id];
    const temRes = r && r.homeGoals !== undefined;

    // ④ Nomes reais dos times — resolve via bracket (cobre fases eliminatórias)
    const hC = brk[jogo.id]?.home || jogo.home;
    const aC = brk[jogo.id]?.away || jogo.away;
    const hN = window.TEAMS_BY_CODE?.[hC]?.name || hC;
    const aN = window.TEAMS_BY_CODE?.[aC]?.name || aC;
    const dataHora = window.formatarDataBRT ? window.formatarDataBRT(jogo.utc, false) : jogo.utc;

    // ⑤ Formato de resultado: "1-1 (PEN) 5-4" quando há pênaltis
    let resOficial = "";
    if (temRes) {
      resOficial = `${r.homeGoals}-${r.awayGoals}`;
      if (r.foi_penaltis) {
        const ph = r.penaltis_home ?? 0;
        const pa = r.penaltis_away ?? 0;
        resOficial += ` (PEN) ${ph}-${pa}`;
      }
    }

    const row = [
      jogo.id,
      jogo.fase,
      `"${dataHora}"`,
      `"${hN}"`,
      `"${aN}"`,
      `"${resOficial}"`
    ];

    for (const a of ranking) {
      const meusPalsCSV = a.isModelo ? (APP.palpitesModelo || {}) : (pals[a.id] || {});
      const p = meusPalsCSV[jogo.id];
      if (p && p.homeGoals !== undefined) {
        const podeVer = temRes || !jogoAceita(jogo.id);
        row.push(podeVer ? `${p.homeGoals}x${p.awayGoals}` : "🔒");
      } else {
        row.push("");
      }
    }

    csvContent += row.join(";") + "\r\n";
  }

  // --- Linhas de Especiais no CSV ---
  // ⑥ Resultados oficiais (Campeão, Vice, 3º) automáticos do bracket
  const labelsEsp = { campeao: "🏆 Campeão", vice: "🥈 Vice", terceiro: "🥉 3º Lugar" };
  const gruposTravadosCSV = !(window.APP?.configStatus?.liberado_grupos);
  const _resCsv = getResultados();
  const fnlOficialCSV = !!_resCsv["FNL"] && _resCsv["FNL"].homeGoals !== undefined && !jogoEhSimulado("FNL");
  const tplOficialCSV = !!_resCsv["TPL"] && _resCsv["TPL"].homeGoals !== undefined && !jogoEhSimulado("TPL");
  const _jogoOficialCSV = { campeao: fnlOficialCSV, vice: fnlOficialCSV, terceiro: tplOficialCSV };

  for (const key of ["campeao", "vice", "terceiro"]) {
    const ofCode = espOficiaisCsv[key] || "";
    const nomeOf = window.TEAMS_BY_CODE?.[ofCode]?.name || (ofCode || "");
    const row = [ "ESP", "especial", "", `"${labelsEsp[key]}"`, "", `"${nomeOf}"` ];
    const resultadoOficialRealCSV = ofCode && _jogoOficialCSV[key];
    const podeVerEspCSV = resultadoOficialRealCSV || gruposTravadosCSV;
    for (const a of ranking) {
      const palE = (a.especiais && a.especiais[key]) || "";
      const nomePal = window.TEAMS_BY_CODE?.[palE]?.name || "";
      row.push(podeVerEspCSV ? `"${nomePal}"` : "🔒");
    }
    csvContent += row.join(";") + "\r\n";
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const el = document.createElement('a');
  el.setAttribute("href", url);
  el.setAttribute("download", "bolao_copa_export_" + new Date().toISOString().replace(/[:.]/g, "-") + ".csv");
  document.body.appendChild(el);
  el.click();
  el.remove();
  URL.revokeObjectURL(url);
};