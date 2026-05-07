/**
 * config.js — Configuração central do Bolão Copa 2026
 * ÚNICA fonte de verdade para regras de pontuação e prazos.
 * Todos os cálculos em scoring.js importam daqui.
 */
window.CONFIG = {

  bolao_nome: "Bolão Aeronáutica Copa 2026",
  versao: "1.0",

  // ─── Pontuação ────────────────────────────────────────────────────────────
  pontuacao: {
    resultado_base: 3,           // acertou apenas o resultado (vitória/empate)
    bonus_diferenca_gols: 1,     // acertou a diferença de gols (não cumulativo c/ placar exato)
    bonus_gols_um_time: 1,       // acertou gols de um dos times (não cumulativo c/ placar exato)
    bonus_placar_exato_baixo: 3, // placar exato com total de gols < 4 (ex: 1×0, 2×1)
    bonus_placar_exato_alto: 5,  // placar exato com total de gols >= 4 (ex: 2×2, 3×1)
    limiar_placar_alto: 4,       // a partir deste total de gols, usar bonus_alto

    // Multiplicadores por fase — pontos_finais = pontos_brutos × fator
    fatores_fase: {
      grupos:   1.0,
      "32avos": 1.2,
      oitavas:  1.4,
      quartas:  1.6,
      semis:    1.8,
      terceiro: 1.8,
      final:    2.0
    },

    // Palpites especiais (campeão / vice / 3.° lugar)
    extras: {
      primeiro_lugar: 7,
      segundo_lugar:  4,
      terceiro_lugar: 2
    }
  },

  // ─── 6 Fases de Apostas ───────────────────────────────────────────────────
  // Cada fase tem um prazo (deadline_utc) e define quais jogos aceita palpites.
  // O admin abre manualmente cada fase após a anterior terminar.
  fases_apostas: [
    {
      id: "grupos",
      nome: "Fase de Grupos + Palpites Especiais",
      descricao: "Palpites para todos os 72 jogos da fase de grupos e para campeão, vice e 3.° lugar",
      deadline_utc: "2026-06-11T18:30:00Z",  // 30 min antes do jogo de abertura (19:00 UTC)
      fases_cobertas: ["grupos"],
      inclui_especiais: true
    },
    {
      id: "32avos",
      nome: "32 Avos de Final",
      descricao: "Palpites para os 16 jogos das oitavas (fase de 32 avos)",
      deadline_utc: "2026-06-28T15:30:00Z",  // 30 min antes do jogo 73
      fases_cobertas: ["32avos"],
      inclui_especiais: false
    },
    {
      id: "oitavas",
      nome: "Oitavas de Final",
      descricao: "Palpites para os 8 jogos das oitavas de final",
      deadline_utc: "2026-07-04T13:30:00Z",  // 30 min antes do jogo 89
      fases_cobertas: ["oitavas"],
      inclui_especiais: false
    },
    {
      id: "quartas",
      nome: "Quartas de Final",
      descricao: "Palpites para os 4 jogos das quartas de final",
      deadline_utc: "2026-07-09T16:30:00Z",  // 30 min antes do jogo 97
      fases_cobertas: ["quartas"],
      inclui_especiais: false
    },
    {
      id: "semis",
      nome: "Semifinais",
      descricao: "Palpites para os 2 jogos das semifinais",
      deadline_utc: "2026-07-14T15:30:00Z",  // 30 min antes do jogo 101
      fases_cobertas: ["semis"],
      inclui_especiais: false
    },
    {
      id: "final",
      nome: "Disputa de 3.° Lugar e Grande Final",
      descricao: "Palpites para a disputa do 3.° lugar e para a final",
      deadline_utc: "2026-07-18T17:30:00Z",  // 30 min antes do jogo 103
      fases_cobertas: ["terceiro", "final"],
      inclui_especiais: false
    }
  ],

  // ─── Admin ────────────────────────────────────────────────────────────────
  // Senha usada por ~3 admins para inserir/corrigir resultados oficiais.
  // Também gravada em /config/global no Firestore para validação nas Security Rules.
  admin_senha: "#bolao2026#",

  // ─── Comportamento ────────────────────────────────────────────────────────
  // Timezone de exibição (todos os horários UTC são convertidos para este fuso na UI)
  display_timezone: "America/Sao_Paulo",  // BRT = UTC-3

  // Minutos antes do jogo para bloquear apostas individuais
  // (além do deadline global da fase)
  deadline_min_antes_jogo: 30
};
