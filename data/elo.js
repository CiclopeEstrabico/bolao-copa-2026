/**
 * elo.js - Ratings ELO das 48 selecoes + Motor de Prognostico Poisson
 * Baseado no modelo Gaga_Zambrano do Excel de referencia.
 *
 * Modelo:
 *   DR = ELO_home - ELO_away
 *   lambda_home = BASE_LAMBDA + POLY[1]*DR + POLY[2]*DR^2 + POLY[3]*DR^3
 *   lambda_away = BASE_LAMBDA - POLY[1]*DR + POLY[2]*DR^2 - POLY[3]*DR^3
 *   P(home=i, away=j) = poisson(lambda_home,i) * poisson(lambda_away,j)
 */

// Ratings ELO aproximados Copa 2026 (World Football ELO - Jan 2026)
window.ELO_RATINGS = {
  ARG:2090, FRA:2005, ENG:1975, BRA:1970, ESP:1965, POR:1960,
  BEL:1950, GER:1940, NED:1920, URU:1870, COL:1855, MEX:1825,
  SUI:1815, USA:1800, CRO:1800, AUS:1792, MAR:1790, SCO:1782,
  JPN:1762, SEN:1760, TUR:1758, SWE:1742, AUT:1750, NOR:1732,
  CZE:1730, ECU:1722, CAN:1720, KOR:1702, ALG:1700, IRN:1682,
  EGY:1680, PAR:1672, CIV:1660, GHA:1652, BIH:1650, TUN:1642,
  KSA:1640, CPV:1630, COD:1622, RSA:1602, PAN:1600, IRQ:1592,
  QAT:1590, UZB:1582, JOR:1572, NZL:1562, CUW:1502, HAI:1402
};

// Coeficientes do polinomio (calibrados para futebol internacional)
// lambda = BASE + c1*DR + c2*DR^2 + c3*DR^3  (DR = delta_elo / 1000)
// Calibracao: DR=0 -> lambda=1.19; DR=0.5 -> lambda~1.45; DR=-0.5 -> lambda~0.96
window.ELO_CONFIG = {
  BASE_LAMBDA: 1.19,
  POLY: [0.0, 0.380, 0.0, 0.060],   // [constante(=BASE), c1, c2, c3]
  MAX_GOLS: 9   // tamanho da matriz
};