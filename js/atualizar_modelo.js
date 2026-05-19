/**
 * atualizar_modelo.js — Geração e gerenciamento do MODELO estatístico
 * Depende de: window.SCHEDULE, window.BRACKET, window.CONFIG, window.PROGNOSE,
 *             window.ELO_RATINGS, APP.db, APP.resultados, APP.bracket
 *             window.calcularPontosBrutos, window.aplicarFator (scoring.js)
 */

const _FASES_ORDEM = ["grupos", "32avos", "oitavas", "quartas", "semis", "finais"];

const _FASES_MAPA = {
  grupos:  ["grupos"],
  "32avos": ["32avos"],
  oitavas: ["oitavas"],
  quartas: ["quartas"],
  semis:   ["semis"],
  finais:  ["final", "terceiro"],
};

function _faseEstaAberta(faseKey) {
  const st = APP.configStatus || {};
  if (faseKey === "grupos")  return !!st.liberado_grupos;
  if (faseKey === "32avos")  return !!st.liberado_32avos;
  if (faseKey === "oitavas") return !!st.liberado_oitavas;
  if (faseKey === "quartas") return !!st.liberado_quartas;
  if (faseKey === "semis")   return !!st.liberado_semis;
  if (faseKey === "finais")  return !!st.liberado_finais;
  return false;
}

function _estadoFases(resultados) {
  const estado = {};
  for (const faseKey of _FASES_ORDEM) {
    const fasesReais = _FASES_MAPA[faseKey];
    const jogos = (window.SCHEDULE || []).filter(j => fasesReais.includes(j.fase));
    const total = jogos.length;
    const comResultado = jogos.filter(j =>
      resultados[j.id] && resultados[j.id].homeGoals !== undefined
    ).length;
    estado[faseKey] = {
      total,
      comResultado,
      completa: total > 0 && comResultado === total,
      iniciada: comResultado > 0,
      zerada:   comResultado === 0,
    };
  }
  return estado;
}

function _faseElegivel(estado) {
  for (let i = 0; i < _FASES_ORDEM.length; i++) {
    const faseKey = _FASES_ORDEM[i];
    const st = estado[faseKey];
    if (!st.zerada) continue;
    if (i === 0) return faseKey;
    const anterior = _FASES_ORDEM[i - 1];
    if (estado[anterior].completa) return faseKey;
    return null;
  }
  return null;
}

function _confrontosDefinidos(faseKey, bracket) {
  if (faseKey === "grupos") return true;
  const fasesReais = _FASES_MAPA[faseKey];
  const jogos = (window.SCHEDULE || []).filter(j => fasesReais.includes(j.fase));
  for (const jogo of jogos) {
    const entry = bracket[jogo.id];
    if (!entry || !entry.home || !entry.away) return false;
  }
  return true;
}

function _melhorPlacar(homeCode, awayCode, faseReal) {
  const prog = window.PROGNOSE.calcular(homeCode, awayCode, faseReal !== "grupos");
  if (!prog || !prog.matrix) return { homeGoals: 1, awayGoals: 0, esperado: 0 };
  const N = prog.N;
  const cfg = window.CONFIG.pontuacao;
  let melhorEsperado = -Infinity;
  let melhorH = 1, melhorA = 0;

  for (let h = 0; h < N; h++) {
    for (let a = 0; a < N; a++) {
      let esperado = 0;
      for (let rh = 0; rh < N; rh++) {
        for (let ra = 0; ra < N; ra++) {
          const pReal = prog.matrix[rh][ra];
          if (pReal < 1e-9) continue;
          const palpiteSimulado = { homeGoals: h, awayGoals: a };
          const resultadoSimulado = { homeGoals: rh, awayGoals: ra, foi_penaltis: false };
          const brutos = window.calcularPontosBrutos(palpiteSimulado, resultadoSimulado);
          const pts = window.aplicarFator(brutos.total_bruto, faseReal);
          esperado += pReal * pts;
        }
      }
      if (esperado > melhorEsperado) {
        melhorEsperado = esperado;
        melhorH = h;
        melhorA = a;
      }
    }
  }
  return { homeGoals: melhorH, awayGoals: melhorA, esperado: melhorEsperado };
}

function _calcularEspeciais() {
  const kf = window.MODELO_DATA?.kFactors || {};

  const timesNoTorneio = new Set();
  (window.SCHEDULE || []).forEach(j => {
    const teams = [j.home, j.away].filter(t => t && !t.startsWith("W") && !t.startsWith("L") && !t.includes("_"));
    teams.forEach(t => timesNoTorneio.add(t));
  });

  const codeToEnName = window.PROGNOSE?.CODE_TO_EN_NAME || {};
  const nameToCode = {};
  for (const [code, name] of Object.entries(codeToEnName)) {
    nameToCode[name] = code;
  }

  const elosDeTimes = [];
  for (const code of timesNoTorneio) {
    const enName = codeToEnName[code];
    const eloKf = enName ? kf[enName]?.elo : undefined;
    const elo = eloKf || window.ELO_RATINGS?.[code] || 1500;
    elosDeTimes.push({ code, elo });
  }
  elosDeTimes.sort((a, b) => b.elo - a.elo);

  const campeao  = elosDeTimes[0]?.code || "ESP";
  const vice     = elosDeTimes[1]?.code || "ARG";
  const terceiro = elosDeTimes[2]?.code || "FRA";

  return { campeao, vice, terceiro };
}

window.MODELO_MANAGER = {

  atualizar: async function() {
    if (!_adminAutenticado()) return alert("Não autorizado.");
    const res = APP.resultados || {};
    const estado = _estadoFases(res);
    const faseKey = _faseElegivel(estado);

    if (!faseKey) {
      const alguma = _FASES_ORDEM.find(f => !estado[f].completa && estado[f].iniciada);
      if (alguma) {
        alert(`⚠️ A fase "${alguma}" já possui resultado(s) oficial(is). O MODELO não pode mais atualizar essa fase.`);
      } else {
        const incompleta = _FASES_ORDEM.find(f => !estado[f].completa);
        if (incompleta) {
          const idx = _FASES_ORDEM.indexOf(incompleta);
          if (idx > 0) alert(`⚠️ A fase "${_FASES_ORDEM[idx-1]}" ainda não foi concluída oficialmente. Aguarde todos os resultados antes de atualizar.`);
          else alert(`⚠️ A fase "${incompleta}" ainda não tem condições para ser atualizada.`);
        } else {
          alert("✅ Todas as fases já foram completadas com resultados oficiais. Nada a atualizar.");
        }
      }
      return;
    }

    if (!_confrontosDefinidos(faseKey, APP.bracket || {})) {
      alert(`⚠️ Ainda existem confrontos indefinidos na fase "${faseKey}". Aguarde o chaveamento ser completado.`);
      return;
    }

    // Guarda: a fase precisa estar aberta para apostas no configStatus
    const _faseAberta = _faseEstaAberta(faseKey);
    if (!_faseAberta) {
      alert(`⚠️ A fase "${faseKey}" ainda não está aberta para apostas.\n\nAbra a fase no painel de configurações antes de atualizar o Modelo.`);
      return;
    }

    const fasesReais = _FASES_MAPA[faseKey];
    const jogosTotal = (window.SCHEDULE || []).filter(j => fasesReais.includes(j.fase)).length;
    if (!confirm(`🤖 ATUALIZAR MODELO\n\nO MODELO irá gerar palpites para TODOS os ${jogosTotal} jogo(s) da fase "${faseKey}".\n\nIsso sobrescreverá quaisquer palpites anteriores do MODELO para esta fase.\n\nDeseja continuar?`)) return;

    const palpitesGerados = [];
    const bracket = APP.bracket || {};
    for (const faseReal of fasesReais) {
      const jogos = (window.SCHEDULE || []).filter(j => j.fase === faseReal);
      for (const jogo of jogos) {
        const entry = bracket[jogo.id] || {};
        // Para grupos, home/away já são códigos reais; para eliminatórias, resolver via bracket
        const homeCode = (faseReal === "grupos" ? jogo.home : entry.home) || jogo.home;
        const awayCode = (faseReal === "grupos" ? jogo.away : entry.away) || jogo.away;
        const melhor = _melhorPlacar(homeCode, awayCode, faseReal);
        palpitesGerados.push({
          gameId: jogo.id,
          homeGoals: melhor.homeGoals,
          awayGoals: melhor.awayGoals,
          fase: faseReal,
          apostadorId: "MODELO",
          atualizado_em: new Date().toISOString(),
        });
      }
    }

    let especiais = null;
    if (faseKey === "grupos") {
      especiais = _calcularEspeciais();
    }

    const db = APP.db;
    try {
      // Cria/Atualiza o perfil na coleção apostadores
      const dadosModelo = {
        id: "MODELO", nome: "Modelo Estatístico", apelido: "MODELO", tipo: "modelo",
        especial: true, criadoAutomaticamente: true, isModelo: true, ordem: 9999,
        ultimaAtualizacao: new Date().toISOString(),
        faseAtualizada: faseKey,
      };
      await db.collection("apostadores").doc("MODELO").set(dadosModelo, { merge: true });

      // Atualiza o documento compacto
      const docRef = db.collection("apostadores").doc("MODELO").collection("dados").doc("palpites");
      const snap = await docRef.get();
      const mapaCompacto = snap.exists ? snap.data() : {};
      
      for (const p of palpitesGerados) {
        mapaCompacto[p.gameId] = p.homeGoals + "-" + p.awayGoals;
      }
      if (especiais) {
        mapaCompacto.especiais = especiais;
      }

      await docRef.set(mapaCompacto);
    } catch (e) {
      alert("❌ Erro ao salvar no banco: " + e.message);
      return;
    }

    APP.modelo = APP.modelo || {};
    if (especiais) APP.modelo.especiais = especiais;
    APP.palpitesModelo = APP.palpitesModelo || {};
    for (const p of palpitesGerados) APP.palpitesModelo[p.gameId] = p;

    // Dispara auto-save do cache para que a UI global veja imediatamente as mudanças
    if (window.gerarCachePalpites) {
      setTimeout(() => {
        const tipoCache = faseKey === "grupos" ? "grupos" : "eliminatorias";
        window.gerarCachePalpites(tipoCache, true);
      }, 500);
    } else {
      alert(`✅ MODELO atualizado!\n\nFase: ${faseKey}\nJogos: ${palpitesGerados.length}${especiais ? `\nEspeciais: ✅ ${especiais.campeao} / ${especiais.vice} / ${especiais.terceiro}` : ""}\n\n⚠️ Lembre-se de clicar em "Cache ${faseKey}" para publicar.`);
      renderAbaAtiva();
    }
  },

  limparFase: async function(faseKey) {
    if (!_adminAutenticado()) return alert("Não autorizado.");
    const fasesReais = _FASES_MAPA[faseKey] || [faseKey];
    const jogos = (window.SCHEDULE || []).filter(j => fasesReais.includes(j.fase));
    if (!confirm(`🗑 LIMPAR MODELO\n\nApagar palpites do MODELO para "${faseKey}" (${jogos.length} jogo(s))?\n\nConfirmar?`)) return;

    const db = APP.db;
    try {
      const docRef = db.collection("apostadores").doc("MODELO").collection("dados").doc("palpites");
      const snap = await docRef.get();
      if (snap.exists) {
        const mapa = snap.data();
        const idsParaLimpar = new Set(jogos.map(j => j.id));
        const mapaFiltrado = {};
        for (const [k, v] of Object.entries(mapa)) {
          if (!idsParaLimpar.has(k)) mapaFiltrado[k] = v;
        }
        if (faseKey === "grupos") {
           mapaFiltrado.especiais = {};
           if (APP.modelo) APP.modelo.especiais = {};
        }
        await docRef.set(mapaFiltrado);
      }
      
      for (const j of jogos) {
        if (APP.palpitesModelo) delete APP.palpitesModelo[j.id];
      }
    } catch (e) {
      alert("❌ Erro ao limpar: " + e.message);
      return;
    }
    
    if (window.gerarCachePalpites) {
      setTimeout(() => {
        window.gerarCachePalpites(faseKey === "grupos" ? "grupos" : "eliminatorias");
      }, 500);
    } else {
      alert("✅ Palpites do MODELO apagados.\n\n⚠️ Lembre-se de atualizar o cache.");
      renderAbaAtiva();
    }
  },

  limparTodas: async function() {
    if (!_adminAutenticado()) return alert("Não autorizado.");
    if (!confirm("🗑 LIMPAR TUDO DO MODELO\n\nIsso apaga TODOS os palpites e especiais do MODELO.\n\nConfirmar?")) return;
    const db = APP.db;
    try {
      await db.collection("apostadores").doc("MODELO").collection("dados").doc("palpites").set({});
      if (APP.palpitesModelo) APP.palpitesModelo = {};
      if (APP.modelo) APP.modelo.especiais = {};
    } catch (e) {
      alert("❌ Erro: " + e.message);
      return;
    }
    
    if (window.gerarCachePalpites) {
      setTimeout(() => {
        window.gerarCachePalpites("grupos");
        setTimeout(() => window.gerarCachePalpites("eliminatorias"), 3000);
      }, 500);
    } else {
      alert("✅ TUDO apagado.\n\n⚠️ Lembre-se de atualizar o cache.");
      renderAbaAtiva();
    }
  },
};
