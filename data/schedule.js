/**
 * schedule.js — 104 jogos da Copa do Mundo 2026
 * Todos os horários em UTC. Exibição em BRT feita pelo frontend.
 * BRT = UTC-3, portanto: UTC = horário_BRT + 3h
 *
 * IDs: grupos = {GRP}_R{ROUND}_{HOME}_{AWAY}
 *      eliminatórias = R32_{N}, R16_{N}, QF_{N}, SF_{N}, TPL, FNL
 *
 * fase: "grupos" | "16avos" | "oitavas" | "quartas" | "semis" | "terceiro" | "final"
 */
window.SCHEDULE = [

  // ══════════════════════════════════════════════════════════
  // FASE DE GRUPOS — 72 jogos
  // ══════════════════════════════════════════════════════════

  // ── GRUPO A ──
  { id: "A_R1_MEX_RSA", fase: "grupos", grupo: "A", rodada: 1, home: "MEX", away: "RSA", utc: "2026-06-11T19:00:00Z", cidade: "Cidade do México", pais: "MEX" },
  { id: "A_R1_KOR_CZE", fase: "grupos", grupo: "A", rodada: 1, home: "KOR", away: "CZE", utc: "2026-06-12T02:00:00Z", cidade: "Guadalajara", pais: "MEX" },
  { id: "A_R2_CZE_RSA", fase: "grupos", grupo: "A", rodada: 2, home: "CZE", away: "RSA", utc: "2026-06-18T16:00:00Z", cidade: "Atlanta", pais: "USA" },
  { id: "A_R2_MEX_KOR", fase: "grupos", grupo: "A", rodada: 2, home: "MEX", away: "KOR", utc: "2026-06-19T01:00:00Z", cidade: "Guadalajara", pais: "MEX" },
  { id: "A_R3_CZE_MEX", fase: "grupos", grupo: "A", rodada: 3, home: "CZE", away: "MEX", utc: "2026-06-25T01:00:00Z", cidade: "Cidade do México", pais: "MEX" },
  { id: "A_R3_RSA_KOR", fase: "grupos", grupo: "A", rodada: 3, home: "RSA", away: "KOR", utc: "2026-06-25T01:00:00Z", cidade: "Monterrey", pais: "MEX" },

  // ── GRUPO B ──
  { id: "B_R1_CAN_BIH", fase: "grupos", grupo: "B", rodada: 1, home: "CAN", away: "BIH", utc: "2026-06-12T19:00:00Z", cidade: "Toronto", pais: "CAN" },
  { id: "B_R1_QAT_SUI", fase: "grupos", grupo: "B", rodada: 1, home: "QAT", away: "SUI", utc: "2026-06-13T19:00:00Z", cidade: "San Francisco", pais: "USA" },
  { id: "B_R2_SUI_BIH", fase: "grupos", grupo: "B", rodada: 2, home: "SUI", away: "BIH", utc: "2026-06-18T19:00:00Z", cidade: "Los Angeles", pais: "USA" },
  { id: "B_R2_CAN_QAT", fase: "grupos", grupo: "B", rodada: 2, home: "CAN", away: "QAT", utc: "2026-06-18T22:00:00Z", cidade: "Vancouver", pais: "CAN" },
  { id: "B_R3_SUI_CAN", fase: "grupos", grupo: "B", rodada: 3, home: "SUI", away: "CAN", utc: "2026-06-24T19:00:00Z", cidade: "Vancouver", pais: "CAN" },
  { id: "B_R3_BIH_QAT", fase: "grupos", grupo: "B", rodada: 3, home: "BIH", away: "QAT", utc: "2026-06-24T19:00:00Z", cidade: "Seattle", pais: "USA" },

  // ── GRUPO C ──
  { id: "C_R1_BRA_MAR", fase: "grupos", grupo: "C", rodada: 1, home: "BRA", away: "MAR", utc: "2026-06-13T22:00:00Z", cidade: "Nova York", pais: "USA" },
  { id: "C_R1_HAI_SCO", fase: "grupos", grupo: "C", rodada: 1, home: "HAI", away: "SCO", utc: "2026-06-14T01:00:00Z", cidade: "Boston", pais: "USA" },
  { id: "C_R2_SCO_MAR", fase: "grupos", grupo: "C", rodada: 2, home: "SCO", away: "MAR", utc: "2026-06-19T22:00:00Z", cidade: "Boston", pais: "USA" },
  { id: "C_R2_BRA_HAI", fase: "grupos", grupo: "C", rodada: 2, home: "BRA", away: "HAI", utc: "2026-06-20T01:00:00Z", cidade: "Filadélfia", pais: "USA" },
  { id: "C_R3_SCO_BRA", fase: "grupos", grupo: "C", rodada: 3, home: "SCO", away: "BRA", utc: "2026-06-24T22:00:00Z", cidade: "Miami", pais: "USA" },
  { id: "C_R3_MAR_HAI", fase: "grupos", grupo: "C", rodada: 3, home: "MAR", away: "HAI", utc: "2026-06-24T22:00:00Z", cidade: "Atlanta", pais: "USA" },

  // ── GRUPO D ──
  { id: "D_R1_USA_PAR", fase: "grupos", grupo: "D", rodada: 1, home: "USA", away: "PAR", utc: "2026-06-13T01:00:00Z", cidade: "Los Angeles", pais: "USA" },
  { id: "D_R1_AUS_TUR", fase: "grupos", grupo: "D", rodada: 1, home: "AUS", away: "TUR", utc: "2026-06-13T04:00:00Z", cidade: "Vancouver", pais: "CAN" },
  { id: "D_R2_TUR_PAR", fase: "grupos", grupo: "D", rodada: 2, home: "TUR", away: "PAR", utc: "2026-06-19T04:00:00Z", cidade: "San Francisco", pais: "USA" },
  { id: "D_R2_USA_AUS", fase: "grupos", grupo: "D", rodada: 2, home: "USA", away: "AUS", utc: "2026-06-19T19:00:00Z", cidade: "Seattle", pais: "USA" },
  { id: "D_R3_TUR_USA", fase: "grupos", grupo: "D", rodada: 3, home: "TUR", away: "USA", utc: "2026-06-26T02:00:00Z", cidade: "Los Angeles", pais: "USA" },
  { id: "D_R3_PAR_AUS", fase: "grupos", grupo: "D", rodada: 3, home: "PAR", away: "AUS", utc: "2026-06-26T02:00:00Z", cidade: "San Francisco", pais: "USA" },

  // ── GRUPO E ──
  { id: "E_R1_GER_CUW", fase: "grupos", grupo: "E", rodada: 1, home: "GER", away: "CUW", utc: "2026-06-14T17:00:00Z", cidade: "Houston", pais: "USA" },
  { id: "E_R1_CIV_ECU", fase: "grupos", grupo: "E", rodada: 1, home: "CIV", away: "ECU", utc: "2026-06-14T23:00:00Z", cidade: "Filadélfia", pais: "USA" },
  { id: "E_R2_GER_CIV", fase: "grupos", grupo: "E", rodada: 2, home: "GER", away: "CIV", utc: "2026-06-20T20:00:00Z", cidade: "Toronto", pais: "CAN" },
  { id: "E_R2_ECU_CUW", fase: "grupos", grupo: "E", rodada: 2, home: "ECU", away: "CUW", utc: "2026-06-21T00:00:00Z", cidade: "Kansas City", pais: "USA" },
  { id: "E_R3_ECU_GER", fase: "grupos", grupo: "E", rodada: 3, home: "ECU", away: "GER", utc: "2026-06-25T20:00:00Z", cidade: "Nova York", pais: "USA" },
  { id: "E_R3_CUW_CIV", fase: "grupos", grupo: "E", rodada: 3, home: "CUW", away: "CIV", utc: "2026-06-25T20:00:00Z", cidade: "Filadélfia", pais: "USA" },

  // ── GRUPO F ──
  { id: "F_R1_NED_JPN", fase: "grupos", grupo: "F", rodada: 1, home: "NED", away: "JPN", utc: "2026-06-14T20:00:00Z", cidade: "Dallas", pais: "USA" },
  { id: "F_R1_SWE_TUN", fase: "grupos", grupo: "F", rodada: 1, home: "SWE", away: "TUN", utc: "2026-06-15T02:00:00Z", cidade: "Monterrey", pais: "MEX" },
  { id: "F_R2_NED_SWE", fase: "grupos", grupo: "F", rodada: 2, home: "NED", away: "SWE", utc: "2026-06-20T17:00:00Z", cidade: "Houston", pais: "USA" },
  { id: "F_R2_TUN_JPN", fase: "grupos", grupo: "F", rodada: 2, home: "TUN", away: "JPN", utc: "2026-06-21T04:00:00Z", cidade: "Monterrey", pais: "MEX" },
  { id: "F_R3_TUN_NED", fase: "grupos", grupo: "F", rodada: 3, home: "TUN", away: "NED", utc: "2026-06-25T23:00:00Z", cidade: "Kansas City", pais: "USA" },
  { id: "F_R3_JPN_SWE", fase: "grupos", grupo: "F", rodada: 3, home: "JPN", away: "SWE", utc: "2026-06-25T23:00:00Z", cidade: "Dallas", pais: "USA" },

  // ── GRUPO G ──
  { id: "G_R1_BEL_EGY", fase: "grupos", grupo: "G", rodada: 1, home: "BEL", away: "EGY", utc: "2026-06-15T19:00:00Z", cidade: "Seattle", pais: "USA" },
  { id: "G_R1_IRN_NZL", fase: "grupos", grupo: "G", rodada: 1, home: "IRN", away: "NZL", utc: "2026-06-16T01:00:00Z", cidade: "Los Angeles", pais: "USA" },
  { id: "G_R2_BEL_IRN", fase: "grupos", grupo: "G", rodada: 2, home: "BEL", away: "IRN", utc: "2026-06-21T19:00:00Z", cidade: "Los Angeles", pais: "USA" },
  { id: "G_R2_NZL_EGY", fase: "grupos", grupo: "G", rodada: 2, home: "NZL", away: "EGY", utc: "2026-06-22T01:00:00Z", cidade: "Vancouver", pais: "CAN" },
  { id: "G_R3_EGY_IRN", fase: "grupos", grupo: "G", rodada: 3, home: "EGY", away: "IRN", utc: "2026-06-27T03:00:00Z", cidade: "Seattle", pais: "USA" },
  { id: "G_R3_NZL_BEL", fase: "grupos", grupo: "G", rodada: 3, home: "NZL", away: "BEL", utc: "2026-06-27T03:00:00Z", cidade: "Vancouver", pais: "CAN" },

  // ── GRUPO H ──
  { id: "H_R1_ESP_CPV", fase: "grupos", grupo: "H", rodada: 1, home: "ESP", away: "CPV", utc: "2026-06-15T16:00:00Z", cidade: "Atlanta", pais: "USA" },
  { id: "H_R1_KSA_URU", fase: "grupos", grupo: "H", rodada: 1, home: "KSA", away: "URU", utc: "2026-06-15T22:00:00Z", cidade: "Miami", pais: "USA" },
  { id: "H_R2_ESP_KSA", fase: "grupos", grupo: "H", rodada: 2, home: "ESP", away: "KSA", utc: "2026-06-21T16:00:00Z", cidade: "Atlanta", pais: "USA" },
  { id: "H_R2_URU_CPV", fase: "grupos", grupo: "H", rodada: 2, home: "URU", away: "CPV", utc: "2026-06-21T22:00:00Z", cidade: "Miami", pais: "USA" },
  { id: "H_R3_URU_ESP", fase: "grupos", grupo: "H", rodada: 3, home: "URU", away: "ESP", utc: "2026-06-27T00:00:00Z", cidade: "Guadalajara", pais: "MEX" },
  { id: "H_R3_CPV_KSA", fase: "grupos", grupo: "H", rodada: 3, home: "CPV", away: "KSA", utc: "2026-06-27T00:00:00Z", cidade: "Houston", pais: "USA" },

  // ── GRUPO I ──
  { id: "I_R1_FRA_SEN", fase: "grupos", grupo: "I", rodada: 1, home: "FRA", away: "SEN", utc: "2026-06-16T19:00:00Z", cidade: "Nova York", pais: "USA" },
  { id: "I_R1_IRQ_NOR", fase: "grupos", grupo: "I", rodada: 1, home: "IRQ", away: "NOR", utc: "2026-06-16T22:00:00Z", cidade: "Boston", pais: "USA" },
  { id: "I_R2_FRA_IRQ", fase: "grupos", grupo: "I", rodada: 2, home: "FRA", away: "IRQ", utc: "2026-06-22T21:00:00Z", cidade: "Filadélfia", pais: "USA" },
  { id: "I_R2_NOR_SEN", fase: "grupos", grupo: "I", rodada: 2, home: "NOR", away: "SEN", utc: "2026-06-23T00:00:00Z", cidade: "Nova York", pais: "USA" },
  { id: "I_R3_NOR_FRA", fase: "grupos", grupo: "I", rodada: 3, home: "NOR", away: "FRA", utc: "2026-06-26T19:00:00Z", cidade: "Boston", pais: "USA" },
  { id: "I_R3_SEN_IRQ", fase: "grupos", grupo: "I", rodada: 3, home: "SEN", away: "IRQ", utc: "2026-06-26T19:00:00Z", cidade: "Toronto", pais: "CAN" },

  // ── GRUPO J ──
  { id: "J_R1_ARG_ALG", fase: "grupos", grupo: "J", rodada: 1, home: "ARG", away: "ALG", utc: "2026-06-17T01:00:00Z", cidade: "Kansas City", pais: "USA" },
  { id: "J_R1_AUT_JOR", fase: "grupos", grupo: "J", rodada: 1, home: "AUT", away: "JOR", utc: "2026-06-17T04:00:00Z", cidade: "San Francisco", pais: "USA" },
  { id: "J_R2_ARG_AUT", fase: "grupos", grupo: "J", rodada: 2, home: "ARG", away: "AUT", utc: "2026-06-22T17:00:00Z", cidade: "Dallas", pais: "USA" },
  { id: "J_R2_JOR_ALG", fase: "grupos", grupo: "J", rodada: 2, home: "JOR", away: "ALG", utc: "2026-06-23T03:00:00Z", cidade: "San Francisco", pais: "USA" },
  { id: "J_R3_JOR_ARG", fase: "grupos", grupo: "J", rodada: 3, home: "JOR", away: "ARG", utc: "2026-06-28T02:00:00Z", cidade: "Dallas", pais: "USA" },
  { id: "J_R3_ALG_AUT", fase: "grupos", grupo: "J", rodada: 3, home: "ALG", away: "AUT", utc: "2026-06-28T02:00:00Z", cidade: "Kansas City", pais: "USA" },

  // ── GRUPO K ──
  { id: "K_R1_POR_COD", fase: "grupos", grupo: "K", rodada: 1, home: "POR", away: "COD", utc: "2026-06-17T17:00:00Z", cidade: "Houston", pais: "USA" },
  { id: "K_R1_UZB_COL", fase: "grupos", grupo: "K", rodada: 1, home: "UZB", away: "COL", utc: "2026-06-18T02:00:00Z", cidade: "Cidade do México", pais: "MEX" },
  { id: "K_R2_POR_UZB", fase: "grupos", grupo: "K", rodada: 2, home: "POR", away: "UZB", utc: "2026-06-23T17:00:00Z", cidade: "Houston", pais: "USA" },
  { id: "K_R2_COL_COD", fase: "grupos", grupo: "K", rodada: 2, home: "COL", away: "COD", utc: "2026-06-24T02:00:00Z", cidade: "Guadalajara", pais: "MEX" },
  { id: "K_R3_COL_POR", fase: "grupos", grupo: "K", rodada: 3, home: "COL", away: "POR", utc: "2026-06-27T23:30:00Z", cidade: "Miami", pais: "USA" },
  { id: "K_R3_COD_UZB", fase: "grupos", grupo: "K", rodada: 3, home: "COD", away: "UZB", utc: "2026-06-27T23:30:00Z", cidade: "Atlanta", pais: "USA" },

  // ── GRUPO L ──
  { id: "L_R1_ENG_CRO", fase: "grupos", grupo: "L", rodada: 1, home: "ENG", away: "CRO", utc: "2026-06-17T20:00:00Z", cidade: "Dallas", pais: "USA" },
  { id: "L_R1_GHA_PAN", fase: "grupos", grupo: "L", rodada: 1, home: "GHA", away: "PAN", utc: "2026-06-17T23:00:00Z", cidade: "Toronto", pais: "CAN" },
  { id: "L_R2_ENG_GHA", fase: "grupos", grupo: "L", rodada: 2, home: "ENG", away: "GHA", utc: "2026-06-23T20:00:00Z", cidade: "Boston", pais: "USA" },
  { id: "L_R2_PAN_CRO", fase: "grupos", grupo: "L", rodada: 2, home: "PAN", away: "CRO", utc: "2026-06-23T23:00:00Z", cidade: "Toronto", pais: "CAN" },
  { id: "L_R3_PAN_ENG", fase: "grupos", grupo: "L", rodada: 3, home: "PAN", away: "ENG", utc: "2026-06-27T21:00:00Z", cidade: "Nova York", pais: "USA" },
  { id: "L_R3_CRO_GHA", fase: "grupos", grupo: "L", rodada: 3, home: "CRO", away: "GHA", utc: "2026-06-27T21:00:00Z", cidade: "Filadélfia", pais: "USA" },

  // ══════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════
  // 16 AVOS DE FINAL — 16 jogos (73 a 88)
  // ══════════════════════════════════════════════════════════
  { id: "R32_1", fase: "16avos", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-06-28T19:00:00Z", cidade: "Los Angeles", pais: "USA" }, // 73
  { id: "R32_2", fase: "16avos", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-06-29T20:30:00Z", cidade: "Boston", pais: "USA" }, // 74
  { id: "R32_3", fase: "16avos", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-06-30T01:00:00Z", cidade: "Monterrey", pais: "MEX" }, // 75
  { id: "R32_4", fase: "16avos", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-06-29T17:00:00Z", cidade: "Houston", pais: "USA" }, // 76
  { id: "R32_5", fase: "16avos", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-06-30T21:00:00Z", cidade: "Nova York", pais: "USA" }, // 77
  { id: "R32_6", fase: "16avos", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-06-30T17:00:00Z", cidade: "Dallas", pais: "USA" }, // 78
  { id: "R32_7", fase: "16avos", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-07-01T01:00:00Z", cidade: "Cidade do México", pais: "MEX" }, // 79
  { id: "R32_8", fase: "16avos", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-07-01T16:00:00Z", cidade: "Atlanta", pais: "USA" }, // 80
  { id: "R32_9", fase: "16avos", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-07-02T00:00:00Z", cidade: "Santa Clara", pais: "USA" }, // 81
  { id: "R32_10", fase: "16avos", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-07-01T20:00:00Z", cidade: "Seattle", pais: "USA" }, // 82
  { id: "R32_11", fase: "16avos", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-07-02T23:00:00Z", cidade: "Toronto", pais: "CAN" }, // 83
  { id: "R32_12", fase: "16avos", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-07-02T19:00:00Z", cidade: "Los Angeles", pais: "USA" }, // 84
  { id: "R32_13", fase: "16avos", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-07-03T03:00:00Z", cidade: "Vancouver", pais: "CAN" }, // 85
  { id: "R32_14", fase: "16avos", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-07-03T22:00:00Z", cidade: "Miami", pais: "USA" }, // 86
  { id: "R32_15", fase: "16avos", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-07-04T01:30:00Z", cidade: "Kansas City", pais: "USA" }, // 87
  { id: "R32_16", fase: "16avos", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-07-03T18:00:00Z", cidade: "Dallas", pais: "USA" }, // 88

  // ══════════════════════════════════════════════════════════
  // OITAVAS DE FINAL — 8 jogos (89 a 96)
  // ══════════════════════════════════════════════════════════
  { id: "R16_1", fase: "oitavas", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-07-04T21:00:00Z", cidade: "Filadélfia", pais: "USA" }, // 89
  { id: "R16_2", fase: "oitavas", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-07-04T17:00:00Z", cidade: "Houston", pais: "USA" }, // 90
  { id: "R16_3", fase: "oitavas", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-07-05T20:00:00Z", cidade: "Nova York", pais: "USA" }, // 91
  { id: "R16_4", fase: "oitavas", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-07-06T00:00:00Z", cidade: "Cidade do México", pais: "MEX" }, // 92
  { id: "R16_5", fase: "oitavas", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-07-06T19:00:00Z", cidade: "Dallas", pais: "USA" }, // 93
  { id: "R16_6", fase: "oitavas", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-07-07T00:00:00Z", cidade: "Seattle", pais: "USA" }, // 94
  { id: "R16_7", fase: "oitavas", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-07-07T16:00:00Z", cidade: "Atlanta", pais: "USA" }, // 95
  { id: "R16_8", fase: "oitavas", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-07-07T20:00:00Z", cidade: "Vancouver", pais: "CAN" }, // 96

  // ══════════════════════════════════════════════════════════
  // QUARTAS DE FINAL — 4 jogos (97 a 100)
  // ══════════════════════════════════════════════════════════
  { id: "QF_1", fase: "quartas", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-07-09T20:00:00Z", cidade: "Boston", pais: "USA" }, // 97
  { id: "QF_2", fase: "quartas", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-07-10T19:00:00Z", cidade: "Los Angeles", pais: "USA" }, // 98
  { id: "QF_3", fase: "quartas", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-07-11T21:00:00Z", cidade: "Miami", pais: "USA" }, // 99
  { id: "QF_4", fase: "quartas", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-07-12T01:00:00Z", cidade: "Kansas City", pais: "USA" }, // 100

  // ══════════════════════════════════════════════════════════
  // SEMIFINAIS — 2 jogos (101 e 102)
  // ══════════════════════════════════════════════════════════
  { id: "SF_1", fase: "semis", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-07-14T19:00:00Z", cidade: "Dallas", pais: "USA" }, // 101
  { id: "SF_2", fase: "semis", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-07-15T19:00:00Z", cidade: "Atlanta", pais: "USA" }, // 102

  // ══════════════════════════════════════════════════════════
  // DISPUTA DE 3.° LUGAR + FINAL (103 e 104)
  // ══════════════════════════════════════════════════════════
  { id: "TPL", fase: "terceiro", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-07-18T21:00:00Z", cidade: "Miami", pais: "USA" }, // 103
  { id: "FNL", fase: "final", grupo: null, rodada: null, home: "TBD", away: "TBD", utc: "2026-07-19T19:00:00Z", cidade: "Nova York", pais: "USA" }  // 104
];

// Lookup por id
window.SCHEDULE_BY_ID = Object.fromEntries(SCHEDULE.map(g => [g.id, g]));

// Grupos por letra
window.SCHEDULE_BY_GROUP = {};
SCHEDULE.filter(g => g.grupo).forEach(g => {
  if (!SCHEDULE_BY_GROUP[g.grupo]) SCHEDULE_BY_GROUP[g.grupo] = [];
  SCHEDULE_BY_GROUP[g.grupo].push(g);
});
