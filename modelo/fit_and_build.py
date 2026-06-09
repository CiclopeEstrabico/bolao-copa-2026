"""
fit_and_build.py
================
Pipeline unificado — Copa 2026

Faz tudo em sequência:
  1. Carrega e limpa results_raw.csv
  2. Otimiza parâmetros ELO + Dixon-Coles (ou usa K_FACTORS/goal_factor legados)
  3. Recalcula ELO final com os parâmetros fitados
  4. Constrói sequências de forma e artefatos de treino/simulação
  5. Gera gráficos de diagnóstico

Modos
-----
Padrão — otimização conjunta ELO + DC (8 parâmetros):
  python fit_and_build.py

  Os parâmetros k0, gamma e home_adv são co-otimizados com os
  parâmetros Dixon-Coles (a, b, c, rho) via L-BFGS-B minimizando a NLL.
  Fórmula do update ELO:
      K_eff = k0 * w_i * (1 + |delta_gols|)^gamma   (Eq. 1, Robberechts & Davis)

Legado — K_FACTORS fixos por torneio (6 parâmetros DC apenas):
  python fit_and_build.py --legacy-elo

  Usa a tabela K_FACTORS e goal_factor() originais para o ELO.
  Apenas os parâmetros DC (a, b, c, rho, home_adv) são otimizados.

Outros flags:
  --csv          caminho para results_raw.csv  (padrão: mesmo diretório)
  --halflife     meia-vida em dias para peso temporal da MLE (padrão: 2920 = 8*365)
  --min-year     ano mínimo para a MLE (padrão: 1980; ELO aquece desde 1872)
  --no-plots     pula geração dos gráficos de diagnóstico

Outputs (pasta results/):
  prior_params.json          parâmetros fitados
  matches_with_elo.csv       histórico com ELO anotado
  training_sequences.pkl     sequências de forma para o GRU
  copa2026_state.pkl         ELOs e formas dos 48 times da Copa
  dataset_config.json        metadados do dataset
  fit_and_build_plots.png    painel de diagnóstico (se não --no-plots)
"""

import argparse
import json
import math
import os
import pickle
from collections import deque

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from scipy.optimize import minimize
from scipy.stats import poisson


# ─────────────────────────────────────────────────────────────────────
# CONSTANTES GLOBAIS
# ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "results")
os.makedirs(OUTPUT_DIR, exist_ok=True)

ELO_START    = 1500
ELO_HOME_ADV = 100.0   # home_adv fixo usado no modo --legacy-elo

# Meia-vida temporal para a MLE e ano mínimo do subconjunto de treino.
# ELO é calculado sobre TODA a série (desde 1872) para aquecer os ratings;
# a otimização MLE usa apenas jogos a partir de MIN_YEAR.
HALFLIFE_DAYS = 8 * 365   # 2920 dias ≈ 8 anos
MIN_YEAR      = 1980      # ELO aquece desde 1872; MLE usa a partir daqui

# k0 fixo (fator-K base do ELO parametrizado — não otimizado)
# Valor próximo ao K clássico FIFA (40); gamma continua sendo otimizado.
K0_FIXED      = 40.0
GAMMA_DEFAULT = 0.5

# Parâmetro de empate do modelo de Davidson (W/D/L).
# P(draw) = WDL_NU / (We_h² + We_a² + WDL_NU)
# Para um jogo equilibrado (delta_eff=0 → We_h=We_a=0.5):
#   WDL_NU=0.15 → P(draw) ≈ 23%   WDL_NU=0.20 → P(draw) ≈ 29%
# Taxa histórica em jogos internacionais fica em torno de 23-26%.
WDL_NU = 0.15

# Amplitude máxima de rho
RHO_MAX = 0.2

# Sequências de forma
SEQ_LEN              = 20
DECAY_HALFLIFE_GAMES = 15
DECAY_LAMBDA         = math.log(2) / DECAY_HALFLIFE_GAMES
FEAT_PER_GAME        = 6   # delta_elo, goals_scored, goals_conceded,
                            # tournament_weight, result, decay_weight

# Times e grupos oficiais da Copa 2026
OFFICIAL_GROUPS = {
    'A': ['Mexico', 'South Africa', 'South Korea', 'Czech Republic'],
    'B': ['Canada', 'Bosnia and Herzegovina', 'Qatar', 'Switzerland'],
    'C': ['Brazil', 'Morocco', 'Haiti', 'Scotland'],
    'D': ['United States', 'Paraguay', 'Australia', 'Turkey'],
    'E': ['Germany', 'Curaçao', 'Ivory Coast', 'Ecuador'],
    'F': ['Netherlands', 'Japan', 'Sweden', 'Tunisia'],
    'G': ['Belgium', 'Egypt', 'Iran', 'New Zealand'],
    'H': ['Spain', 'Cape Verde', 'Saudi Arabia', 'Uruguay'],
    'I': ['France', 'Senegal', 'Iraq', 'Norway'],
    'J': ['Argentina', 'Algeria', 'Austria', 'Jordan'],
    'K': ['Portugal', 'DR Congo', 'Uzbekistan', 'Colombia'],
    'L': ['England', 'Croatia', 'Ghana', 'Panama'],
}
HOSTS = ['United States', 'Mexico', 'Canada']


# ─────────────────────────────────────────────────────────────────────
# PESOS DE COMPETIÇÃO (w_i — fixos em ambos os modos)
# ─────────────────────────────────────────────────────────────────────
TOURNAMENT_WEIGHTS = {
    'FIFA World Cup':                          1.000,
    'UEFA Euro':                               0.850,
    'Copa América':                            0.850,
    'African Cup of Nations':                  0.850,
    'AFC Asian Cup':                           0.850,
    'Gold Cup':                                0.850,
    'Oceania Nations Cup':                     0.850,
    'CONCACAF Championship':                   0.850,
    'CCCF Championship':                       0.850,
    'Confederations Cup':                      0.850,
    'CONMEBOL\u2013UEFA Cup of Champions':     0.850,
    'Olympic Games':                           0.850,
    'FIFA World Cup qualification':            0.850,
    'UEFA Euro qualification':                 0.700,
    'Copa América qualification':              0.700,
    'African Cup of Nations qualification':    0.700,
    'AFC Asian Cup qualification':             0.700,
    'Gold Cup qualification':                  0.700,
    'Oceania Nations Cup qualification':       0.700,
    'CONCACAF Championship qualification':     0.700,
    'CONCACAF Nations League':                 0.700,
    'CONCACAF Nations League qualification':   0.700,
    'UEFA Nations League':                     0.700,
    'EAFF Championship':                       0.700,
    'EAFF Championship qualification':         0.700,
    'WAFF Championship':                       0.700,
    'SAFF Cup':                                0.700,
    'Gulf Cup':                                0.700,
    'CFU Caribbean Cup':                       0.700,
    'CFU Caribbean Cup qualification':         0.700,
    'AFF Championship':                        0.700,
    'AFF Championship qualification':          0.700,
    'ASEAN Championship':                      0.700,
    'ASEAN Championship qualification':        0.700,
    'UNCAF Cup':                               0.700,
    'UNIFFAC Cup':                             0.700,
    'CECAFA Cup':                              0.700,
    'COSAFA Cup':                              0.700,
    'COSAFA Cup qualification':                0.700,
    'CAFA Nations Cup':                        0.700,
    'Arab Cup':                                0.700,
    'Arab Cup qualification':                  0.700,
    'Pan American Championship':               0.700,
    'Superclásico de las Américas':            0.700,
    'AFC Challenge Cup':                       0.700,
    'AFC Challenge Cup qualification':         0.700,
    'AFC Solidarity Cup':                      0.700,
    'NAFC Championship':                       0.700,
    'NAFU Championship':                       0.700,
    'Melanesia Cup':                           0.700,
    'Pacific Games':                           0.700,
    'Pacific Mini Games':                      0.700,
    'South Pacific Games':                     0.700,
    'South Pacific Mini Games':                0.700,
    'Indian Ocean Island Games':               0.700,
    'Island Games':                            0.700,
    'Marianas Cup':                            0.700,
    "MSG Prime Minister's Cup":                0.700,
    'Friendly':                                0.500,
}
TW_DEFAULT = 0.5500   # torneios não mapeados

# ── K_FACTORS legados (inteiros, usados apenas com --legacy-elo) ──────
K_FACTORS = {
    'FIFA World Cup':                          40,
    'UEFA Euro':                               34,
    'Copa América':                            34,
    'African Cup of Nations':                  34,
    'AFC Asian Cup':                           34,
    'Gold Cup':                                34,
    'Oceania Nations Cup':                     34,
    'CONCACAF Championship':                   34,
    'CCCF Championship':                       34,
    'Confederations Cup':                      34,
    'CONMEBOL\u2013UEFA Cup of Champions':     34,
    'Olympic Games':                           34,
    'FIFA World Cup qualification':            34,
    'UEFA Euro qualification':                 28,
    'Copa América qualification':              28,
    'African Cup of Nations qualification':    28,
    'AFC Asian Cup qualification':             28,
    'Gold Cup qualification':                  28,
    'Oceania Nations Cup qualification':       28,
    'CONCACAF Championship qualification':     28,
    'CONCACAF Nations League':                 28,
    'CONCACAF Nations League qualification':   28,
    'UEFA Nations League':                     28,
    'EAFF Championship':                       28,
    'EAFF Championship qualification':         28,
    'WAFF Championship':                       28,
    'SAFF Cup':                                28,
    'Gulf Cup':                                28,
    'CFU Caribbean Cup':                       28,
    'CFU Caribbean Cup qualification':         28,
    'AFF Championship':                        28,
    'AFF Championship qualification':          28,
    'ASEAN Championship':                      28,
    'ASEAN Championship qualification':        28,
    'UNCAF Cup':                               28,
    'UNIFFAC Cup':                             28,
    'CECAFA Cup':                              28,
    'COSAFA Cup':                              28,
    'COSAFA Cup qualification':                28,
    'CAFA Nations Cup':                        28,
    'Arab Cup':                                28,
    'Arab Cup qualification':                  28,
    'Pan American Championship':               28,
    'Superclásico de las Américas':            28,
    'AFC Challenge Cup':                       28,
    'AFC Challenge Cup qualification':         28,
    'AFC Solidarity Cup':                      28,
    'NAFC Championship':                       28,
    'NAFU Championship':                       28,
    'Melanesia Cup':                           28,
    'Pacific Games':                           28,
    'Pacific Mini Games':                      28,
    'South Pacific Games':                     28,
    'South Pacific Mini Games':                28,
    'Indian Ocean Island Games':               28,
    'Island Games':                            28,
    'Marianas Cup':                            28,
    "MSG Prime Minister's Cup":                28,
    'Friendly':                                20,
}
K_DEFAULT_LEGACY = 22


# ─────────────────────────────────────────────────────────────────────
# STEP 1 — LIMPEZA DOS DADOS
# ─────────────────────────────────────────────────────────────────────
def load_and_clean(csv_path: str) -> pd.DataFrame:
    print(f"[1] Carregando {csv_path}...")
    df = pd.read_csv(csv_path)
    df['home_score'] = pd.to_numeric(df['home_score'], errors='coerce')
    df['away_score'] = pd.to_numeric(df['away_score'], errors='coerce')
    df = df.dropna(subset=['home_score', 'away_score']).copy()
    df['home_score'] = df['home_score'].astype(int)
    df['away_score'] = df['away_score'].astype(int)
    df['neutral']    = df['neutral'].fillna(False).astype(bool)
    df['date']       = pd.to_datetime(df['date'])
    df = df.sort_values('date').drop_duplicates().reset_index(drop=True)
    print(f"    >> {len(df):,} jogos válidos (de {df['date'].min().date()} até {df['date'].max().date()})")
    return df


# ─────────────────────────────────────────────────────────────────────
# STEP 2 — OTIMIZAÇÃO DOS PARÂMETROS
# ─────────────────────────────────────────────────────────────────────

# ── Funções matemáticas ───────────────────────────────────────────────

LOG_FACT = [0.0] + [math.lgamma(i + 1) for i in range(1, 20)]

def log_poisson_pmf(k, lam):
    k = min(int(k), 19)
    return k * math.log(max(lam, 1e-9)) - lam - LOG_FACT[k]

def tau_dc(X, Y, lam_h, lam_a, rho):
    if X == 0 and Y == 0: return max(1 - lam_h * lam_a * rho, 1e-9)
    if X == 1 and Y == 0: return max(1 + lam_h * rho,         1e-9)
    if X == 0 and Y == 1: return max(1 + lam_a * rho,         1e-9)
    if X == 1 and Y == 1: return max(1 - rho,                 1e-9)
    return 1.0

def lambdas_from_params(delta_eff, a, b, c):
    """Lambda simétrico. Clamp em exp() para evitar overflow."""
    lam_h = math.exp(min(a + b * delta_eff + c * delta_eff ** 2, 4.0))
    lam_a = math.exp(min(a - b * delta_eff + c * delta_eff ** 2, 4.0))
    return lam_h, lam_a

def softplus(x):
    return math.log1p(math.exp(min(x, 30)))

def rho_from_delta(delta_eff, rho0_raw, rho1_neg):
    """rho monotonamente decrescente em |delta_eff|, limitado a ±RHO_MAX."""
    arg = rho0_raw - rho1_neg * abs(delta_eff) / 400.0
    return RHO_MAX * math.tanh(arg)

# ── Funções de goal_factor ────────────────────────────────────────────

def goal_factor_legacy(diff: int) -> float:
    """Fórmula original fixa."""
    d = abs(diff)
    if d < 2:  return 1.0
    if d == 2: return 1.5
    return (11 + d) / 8.0

def goal_factor_param(diff: int, gamma: float) -> float:
    """Fórmula parametrizada: G = (1 + |delta|)^gamma."""
    return (1.0 + abs(diff)) ** gamma

# ── Cálculo ELO sobre toda a série histórica ─────────────────────────

def compute_elo_full(df_rows, legacy: bool,
                     k0=None, gamma=None, home_adv=ELO_HOME_ADV):
    """Recalcula ELO sobre todos os jogos (desde 1872).

    Args:
        df_rows  : lista de tuplas (ht, at, hs, as_, neutral, tournament)
        legacy   : True → usa K_FACTORS + goal_factor_legacy + home_adv fixo
                   False → usa k0 * w_i * (1+|δ|)^gamma + home_adv fitado
        k0       : fator-K base (modo conjunto)
        gamma    : expoente margem de gols (modo conjunto)
        home_adv : vantagem de mando em pts ELO

    Returns:
        deltas   : list[float] — delta_elo_raw (elo_h_pre − elo_a_pre) por jogo
        ratings  : dict[str, float] — ratings finais
    """
    ratings = {}
    deltas  = []

    for (ht, at, hs, as_, neutral, tour) in df_rows:
        eh = ratings.get(ht, ELO_START)
        ea = ratings.get(at, ELO_START)
        delta_raw = eh - ea
        deltas.append(delta_raw)

        adv           = 0.0 if neutral else home_adv
        delta_clamped = max(-700.0, min(700.0, delta_raw + adv))
        We_h          = 1.0 / (1.0 + 10.0 ** (-delta_clamped / 400.0))

        diff = hs - as_
        W    = 1.0 if diff > 0 else (0.0 if diff < 0 else 0.5)

        if legacy:
            G = goal_factor_legacy(diff)
            K = K_FACTORS.get(tour, K_DEFAULT_LEGACY) * G
        else:
            G = goal_factor_param(diff, gamma)
            K = k0 * TOURNAMENT_WEIGHTS.get(tour, TW_DEFAULT) * G

        ratings[ht] = eh + K * (W - We_h)
        ratings[at] = ea + K * ((1 - W) - (1 - We_h))

    return deltas, ratings

# ── NLL modo legado (6 parâmetros, ELO fixo) ─────────────────────────

def nll_legacy(params, df_arr):
    """df_arr: lista de (delta_raw, neutral, X, Y, peso)."""
    a, b, c, rho0_raw, rho1_raw, home_adv = params
    rho1_neg = softplus(rho1_raw)
    total = 0.0
    for delta_raw, neutral, X, Y, peso in df_arr:
        delta_eff    = delta_raw + home_adv * (0.0 if neutral else 1.0)
        lam_h, lam_a = lambdas_from_params(delta_eff, a, b, c)
        rho          = rho_from_delta(delta_eff, rho0_raw, rho1_neg)
        log_p = (log_poisson_pmf(X, lam_h)
               + log_poisson_pmf(Y, lam_a)
               + math.log(tau_dc(X, Y, lam_h, lam_a, rho)))
        total += peso * log_p
    return -total

# ─────────────────────────────────────────────────────────────────────
# ETAPA 1 — NLL W/D/L  (calibra k0 e/ou gamma do ELO)
# ─────────────────────────────────────────────────────────────────────

def _wdl_log_prob(delta_eff: float, result: float) -> float:
    """Log-verossimilhança W/D/L via modelo de Davidson (empate explícito).

    P(home) = We_h²  / (We_h² + We_a² + nu)
    P(away) = We_a²  / (We_h² + We_a² + nu)
    P(draw) = nu      / (We_h² + We_a² + nu)

    onde nu = WDL_NU  (parâmetro de empate fixo, calibrado empiricamente).
    We_h = 1 / (1 + 10^(-delta_eff/400))

    result: 1.0 = vitória mandante, 0.5 = empate, 0.0 = vitória visitante.
    """
    We_h  = 1.0 / (1.0 + 10.0 ** (max(-700.0, min(700.0, -delta_eff)) / 400.0))
    We_a  = 1.0 - We_h
    denom = We_h ** 2 + We_a ** 2 + WDL_NU
    if result == 1.0:
        p = We_h ** 2 / denom
    elif result == 0.0:
        p = We_a ** 2 / denom
    else:
        p = WDL_NU / denom
    return math.log(max(p, 1e-12))


def nll_wdl(params, all_rows, mle_indices, pesos, fix_k0: bool, fix_gamma: bool):
    """NLL W/D/L — otimiza k0 e/ou gamma do ELO.

    Vetor params depende das flags:
      fix_k0=F, fix_gamma=F  →  [k0_raw, gamma_raw, home_adv]  (3 params)
      fix_k0=T, fix_gamma=F  →  [gamma_raw, home_adv]           (2 params)
      fix_k0=F, fix_gamma=T  →  [k0_raw, home_adv]              (2 params)
      fix_k0=T, fix_gamma=T  →  [home_adv]                      (1 param)
    """
    idx = 0
    if not fix_k0:
        k0    = softplus(params[idx]); idx += 1
    else:
        k0    = K0_FIXED
    if not fix_gamma:
        gamma = softplus(params[idx]); idx += 1
    else:
        gamma = GAMMA_DEFAULT
    home_adv = params[idx]

    deltas_all, _ = compute_elo_full(all_rows, legacy=False,
                                     k0=k0, gamma=gamma, home_adv=home_adv)
    total = 0.0
    for i, peso in zip(mle_indices, pesos):
        ht, at, hs, as_, neutral, tour = all_rows[i]
        delta_eff = deltas_all[i] + home_adv * (0.0 if neutral else 1.0)
        result    = 1.0 if hs > as_ else (0.0 if hs < as_ else 0.5)
        total    += peso * _wdl_log_prob(delta_eff, result)
    return -total


# ─────────────────────────────────────────────────────────────────────
# ETAPA 2 — NLL placar Dixon-Coles  (calibra a, b, c, rho, home_adv)
# ─────────────────────────────────────────────────────────────────────

def nll_dc(params, deltas_mle, mle_rows, pesos):
    """NLL placar Dixon-Coles com ELO fixo (deltas já calculados).

    Parâmetros (6): a, b, c, rho0_raw, rho1_raw, home_adv
    deltas_mle: lista de delta_elo_raw para cada jogo MLE (sem home_adv).
    """
    a, b, c, rho0_raw, rho1_raw, home_adv = params
    rho1_neg = softplus(rho1_raw)
    total = 0.0
    for delta_raw, (ht, at, X, Y, neutral, tour), peso in zip(deltas_mle, mle_rows, pesos):
        delta_eff    = delta_raw + home_adv * (0.0 if neutral else 1.0)
        lam_h, lam_a = lambdas_from_params(delta_eff, a, b, c)
        rho          = rho_from_delta(delta_eff, rho0_raw, rho1_neg)
        log_p = (log_poisson_pmf(X, lam_h)
               + log_poisson_pmf(Y, lam_a)
               + math.log(tau_dc(X, Y, lam_h, lam_a, rho)))
        total += peso * log_p
    return -total


# ─────────────────────────────────────────────────────────────────────
# FITTING — duas etapas sequenciais
# ─────────────────────────────────────────────────────────────────────

def fit_params(df: pd.DataFrame, all_rows: list, mle_indices: list,
               legacy: bool, halflife_days: int,
               fix_k0: bool = False, fix_gamma: bool = False) -> dict:
    """Otimização em duas etapas:

    Etapa 1 (ELO)  — NLL W/D/L → calibra k0 e/ou gamma (flags fix_k0, fix_gamma)
    Etapa 2 (DC)   — NLL placar → calibra a, b, c, rho0, rho1, home_adv
                     (com ELO fixo dos parâmetros da etapa 1)

    Modo --legacy-elo pula a etapa 1 (ELO já calculado externamente).
    """
    print("[2] Otimizando parâmetros...")

    ref_date  = df['date'].max()
    decay_lam = math.log(2) / halflife_days
    pesos     = np.exp(-decay_lam * (ref_date - df['date']).dt.days.values).tolist()

    print(f"    >> Ref: {ref_date.date()}  |  meia-vida: {halflife_days} dias  "
          f"|  equiv. {sum(pesos):.0f} jogos uniformes")

    def inv_softplus(x):
        return math.log(math.exp(max(x, 0.1)) - 1.0)

    # ── Modo legado: pula etapa 1, usa ELO fixo pré-calculado ────────
    if legacy:
        k0    = K0_FIXED
        gamma = GAMMA_DEFAULT
        df_arr = list(zip(
            df['delta_elo_raw'].tolist(),
            df['neutral'].tolist(),
            df['home_score'].tolist(),
            df['away_score'].tolist(),
            pesos,
        ))
        x0 = [0.2, 0.0008, -1e-7, 0.5, 0.0, 100.0]
        bounds = [
            (-1.0,  1.0),    # a
            (0.0,   0.005),  # b
            (-1e-5, 1e-5),   # c
            (-4.0,  4.0),    # rho0_raw
            (-10.0, 10.0),   # rho1_raw
            (0.0,   300.0),  # home_adv
        ]
        res = minimize(nll_legacy, x0=x0, args=(df_arr,),
                       method='L-BFGS-B', bounds=bounds,
                       options={'maxiter': 2000, 'ftol': 1e-12, 'gtol': 1e-8})
        a, b, c, rho0_raw, rho1_raw, home_adv = res.x
        nll_elo_val = float('nan')
        nll_dc_val  = res.fun
        converged   = bool(res.success)
        mode        = 'legacy'

    else:
        # ── ETAPA 1: NLL W/D/L → k0 e/ou gamma ──────────────────────
        fix_str = []
        if fix_k0:    fix_str.append(f"k0={K0_FIXED}")
        if fix_gamma: fix_str.append(f"gamma={GAMMA_DEFAULT}")
        fix_label = "fixos: " + ", ".join(fix_str) if fix_str else "todos livres"
        n_elo_params = (0 if fix_k0 else 1) + (0 if fix_gamma else 1) + 1  # +1 home_adv
        print(f"\n[2a] Etapa ELO (NLL W/D/L) — {n_elo_params} parâmetro(s)  [{fix_label}]")
        print(f"     {len(all_rows):,} jogos (ELO) × {len(mle_indices):,} jogos (MLE)")

        x0_elo, bounds_elo = [], []
        if not fix_k0:
            x0_elo.append(inv_softplus(K0_FIXED))
            bounds_elo.append((-2.0, 8.0))      # k0_raw → k0 ∈ (~0.1, ~3000); prático: (1, 300)
        if not fix_gamma:
            x0_elo.append(inv_softplus(GAMMA_DEFAULT))
            bounds_elo.append((-5.0, 3.0))      # gamma_raw → gamma ∈ (0.007, ~20)
        x0_elo.append(100.0)
        bounds_elo.append((0.0, 300.0))         # home_adv

        res_elo = minimize(
            nll_wdl, x0=x0_elo,
            args=(all_rows, mle_indices, pesos, fix_k0, fix_gamma),
            method='L-BFGS-B', bounds=bounds_elo,
            options={'maxiter': 2000, 'ftol': 1e-11, 'gtol': 1e-7},
        )

        # Extrai resultados da etapa 1
        idx = 0
        k0       = K0_FIXED    if fix_k0    else softplus(res_elo.x[idx]); idx += (0 if fix_k0    else 1)
        gamma    = GAMMA_DEFAULT if fix_gamma else softplus(res_elo.x[idx]); idx += (0 if fix_gamma else 1)
        home_adv_elo = res_elo.x[idx]   # home_adv provisório (será re-otimizado na etapa 2)
        nll_elo_val  = res_elo.fun

        print(f"     Convergiu: {res_elo.success}  |  NLL W/D/L: {nll_elo_val:.4f}")
        print(f"     k0={k0:.3f}  gamma={gamma:.4f}  home_adv={home_adv_elo:.1f}")

        # ── ETAPA 2: NLL placar DC → a, b, c, rho, home_adv ─────────
        print(f"\n[2b] Etapa DC (NLL placar) — 6 parâmetros")

        # Recalcula ELO com k0/gamma fitados e extrai deltas para o subconjunto MLE
        deltas_all, _ = compute_elo_full(all_rows, legacy=False,
                                         k0=k0, gamma=gamma, home_adv=home_adv_elo)
        deltas_mle = [deltas_all[i] for i in mle_indices]
        mle_rows   = [all_rows[i]   for i in mle_indices]

        x0_dc = [0.2, 0.0008, -1e-7, 0.5, 0.0, home_adv_elo]
        bounds_dc = [
            (-1.0,  1.0),    # a
            (0.0,   0.005),  # b
            (-1e-5, 1e-5),   # c
            (-4.0,  4.0),    # rho0_raw
            (-10.0, 10.0),   # rho1_raw
            (0.0,   300.0),  # home_adv
        ]
        res_dc = minimize(
            nll_dc, x0=x0_dc,
            args=(deltas_mle, mle_rows, pesos),
            method='L-BFGS-B', bounds=bounds_dc,
            options={'maxiter': 2000, 'ftol': 1e-12, 'gtol': 1e-8},
        )
        a, b, c, rho0_raw, rho1_raw, home_adv = res_dc.x
        nll_dc_val = res_dc.fun
        converged  = bool(res_elo.success and res_dc.success)
        mode       = 'two-stage'

    # ── Parâmetros derivados ──────────────────────────────────────────
    rho1_neg = softplus(rho1_raw)
    rho_eq   = rho_from_delta(0,   rho0_raw, rho1_neg)
    rho_400  = rho_from_delta(400, rho0_raw, rho1_neg)

    print(f"\n    >> Modo: {mode}  |  Convergiu: {converged}")
    if not math.isnan(nll_elo_val):
        print(f"    >> NLL W/D/L (etapa ELO): {nll_elo_val:.4f}")
    print(f"    >> NLL placar (etapa DC):  {nll_dc_val:.4f}")
    print(f"    >> k0={k0:.3f}  gamma={gamma:.4f}  home_adv={home_adv:.1f}")
    print(f"    >> a={a:.4f}  b={b:.6f}  c={c:.2e}")
    print(f"    >> rho(Δ=0)={rho_eq:.4f}  rho(Δ=400)={rho_400:.4f}")
    print(f"    >> lambda_base={math.exp(a):.3f} gols/time")

    return {
        'k0': k0, 'gamma': gamma,
        'a': a, 'b': b, 'c': c,
        'rho0_raw':      rho0_raw,
        'rho1_raw':      rho1_raw,
        'rho1_neg':      rho1_neg,
        'rho_at_delta0':   rho_eq,
        'rho_at_delta400': rho_400,
        'home_adv':      home_adv,
        'nll_wdl':       nll_elo_val,
        'nll_dc':        nll_dc_val,
        'nll_final':     nll_dc_val,   # compatibilidade com código downstream
        'converged':     converged,
        'lambda_base':   math.exp(a),
        'mode':          mode,
        'fix_k0':        fix_k0,
        'fix_gamma':     fix_gamma,
    }


# ─────────────────────────────────────────────────────────────────────
# STEP 3 — ELO FINAL com parâmetros fitados
# ─────────────────────────────────────────────────────────────────────

def build_annotated(df: pd.DataFrame, params: dict, legacy: bool) -> tuple:
    """Reconstrói ELO com os parâmetros definitivos e monta DataFrame anotado."""
    print("[3] Recalculando ELO final com parâmetros fitados...")

    k0       = params['k0']
    gamma    = params['gamma']
    home_adv = params['home_adv']

    rows = list(zip(
        df['home_team'], df['away_team'],
        df['home_score'].astype(int), df['away_score'].astype(int),
        df['neutral'].astype(bool), df['tournament'],
    ))

    deltas, ratings = compute_elo_full(rows, legacy=legacy,
                                       k0=k0, gamma=gamma, home_adv=home_adv)

    records = []
    for pos, (_, row) in enumerate(df.iterrows()):
        ht, at     = row['home_team'], row['away_team']
        hs, as_    = int(row['home_score']), int(row['away_score'])
        neutral    = bool(row['neutral'])
        tour       = row['tournament']
        delta_raw  = deltas[pos]   # deltas é lista 0..N-1, alinhar por posição

        diff = hs - as_
        if legacy:
            G  = goal_factor_legacy(diff)
            K  = K_FACTORS.get(tour, K_DEFAULT_LEGACY) * G
            tw = 1.0 if tour != 'Friendly' else 0.7
        else:
            G  = goal_factor_param(diff, gamma)
            K  = k0 * TOURNAMENT_WEIGHTS.get(tour, TW_DEFAULT) * G
            tw = TOURNAMENT_WEIGHTS.get(tour, TW_DEFAULT)

        records.append({
            'date':              row['date'],
            'home_team':         ht,
            'away_team':         at,
            'home_score':        hs,
            'away_score':        as_,
            'tournament':        tour,
            'neutral':           neutral,
            'delta_elo_raw':     delta_raw,
            'tournament_weight': tw,
            'K_used':            K,
            'G_used':            G,
        })

    annotated = pd.DataFrame(records)
    print(f"    >> ELO final calculado. Médio: {np.mean(list(ratings.values())):.1f}")
    for team, min_elo in [('Brazil', 1750), ('France', 1750), ('Argentina', 1750)]:
        if team in ratings:
            v    = ratings[team]
            flag = 'OK' if v > min_elo else '!!'
            print(f"    {flag}  {team}: {v:.0f}")

    return annotated, ratings


# ─────────────────────────────────────────────────────────────────────
# STEP 4 — SEQUÊNCIAS DE FORMA
# ─────────────────────────────────────────────────────────────────────

def add_decay_weights(seq: list) -> list:
    """Adiciona decay_weight por posição (0 = mais recente → weight 1.0)."""
    n      = len(seq)
    result = []
    for i, entry in enumerate(seq):
        pos_from_end = n - 1 - i
        w = float(math.exp(-DECAY_LAMBDA * pos_from_end))
        new_entry = dict(entry)
        new_entry['decay_weight'] = w
        result.append(new_entry)
    return result


def build_sequences(annotated: pd.DataFrame) -> tuple:
    print("[4] Construindo sequências de forma...")
    forms    = {}
    training = []

    for _, row in annotated.iterrows():
        ht, at = row['home_team'], row['away_team']

        seq_h = add_decay_weights(list(forms.get(ht, deque(maxlen=SEQ_LEN))))
        seq_a = add_decay_weights(list(forms.get(at, deque(maxlen=SEQ_LEN))))

        training.append({
            'date':              str(row['date'].date()),
            'home_team':         ht,
            'away_team':         at,
            'home_score':        row['home_score'],
            'away_score':        row['away_score'],
            'delta_elo_raw':     row['delta_elo_raw'],
            'is_neutral':        bool(row['neutral']),
            'tournament_weight': row['tournament_weight'],
            'seq_home':          seq_h,
            'seq_away':          seq_a,
        })

        diff     = row['home_score'] - row['away_score']
        result_h = 1.0 if diff > 0 else (0.0 if diff < 0 else 0.5)

        entry_h = {
            'delta_elo':         row['delta_elo_raw'],
            'goals_scored':      float(row['home_score']),
            'goals_conceded':    float(row['away_score']),
            'tournament_weight': row['tournament_weight'],
            'result':            result_h,
        }
        entry_a = {
            'delta_elo':         -row['delta_elo_raw'],
            'goals_scored':      float(row['away_score']),
            'goals_conceded':    float(row['home_score']),
            'tournament_weight': row['tournament_weight'],
            'result':            1.0 - result_h,
        }

        if ht not in forms: forms[ht] = deque(maxlen=SEQ_LEN)
        if at not in forms: forms[at] = deque(maxlen=SEQ_LEN)
        forms[ht].append(entry_h)
        forms[at].append(entry_a)

    print(f"    >> {len(training):,} registros  |  FEAT_PER_GAME={FEAT_PER_GAME}  "
          f"|  decay meia-vida={DECAY_HALFLIFE_GAMES} jogos")
    return training, forms


# ─────────────────────────────────────────────────────────────────────
# STEP 5 — SALVAR ARTEFATOS
# ─────────────────────────────────────────────────────────────────────

def save_artifacts(annotated, training, forms, ratings, params):
    print("[5] Salvando artefatos...")

    # matches_with_elo.csv
    p = os.path.join(OUTPUT_DIR, 'matches_with_elo.csv')
    annotated.to_csv(p, index=False)
    print(f"    >> {p}  ({len(annotated):,} linhas)")

    # training_sequences.pkl
    p = os.path.join(OUTPUT_DIR, 'training_sequences.pkl')
    with open(p, 'wb') as f:
        pickle.dump(training, f)
    print(f"    >> {p}  ({len(training):,} registros)")

    # copa2026_state.pkl
    all_teams = [t for g in OFFICIAL_GROUPS.values() for t in g]
    missing   = [t for t in all_teams if t not in ratings]
    if missing:
        print(f"    !!  Times sem histórico (ELO={ELO_START}): {missing}")
        for t in missing:
            ratings[t] = ELO_START

    team_forms = {
        t: add_decay_weights(list(forms.get(t, deque(maxlen=SEQ_LEN))))
        for t in all_teams
    }
    state = {
        'team_elos':            ratings,
        'team_forms':           team_forms,
        'copa_groups':          OFFICIAL_GROUPS,
        'hosts':                HOSTS,
        'feat_per_game':        FEAT_PER_GAME,
        'seq_len':              SEQ_LEN,
        'decay_lambda':         DECAY_LAMBDA,
        'decay_halflife_games': DECAY_HALFLIFE_GAMES,
        'elo_mode':             params['mode'],
        'k0':                   params['k0'],
        'gamma':                params['gamma'],
        'home_adv':             params['home_adv'],
    }
    p = os.path.join(OUTPUT_DIR, 'copa2026_state.pkl')
    with open(p, 'wb') as f:
        pickle.dump(state, f)
    print(f"    >> {p}")

    # prior_params.json
    p = os.path.join(OUTPUT_DIR, 'prior_params.json')
    with open(p, 'w') as f:
        json.dump(params, f, indent=2)
    print(f"    >> {p}")

    # dataset_config.json
    cfg = {
        'FEAT_PER_GAME':        FEAT_PER_GAME,
        'SEQ_LEN':              SEQ_LEN,
        'DECAY_LAMBDA':         DECAY_LAMBDA,
        'DECAY_HALFLIFE_GAMES': DECAY_HALFLIFE_GAMES,
        'features':             ['delta_elo', 'goals_scored', 'goals_conceded',
                                 'tournament_weight', 'result', 'decay_weight'],
        'elo_mode':             params['mode'],
    }
    p = os.path.join(OUTPUT_DIR, 'dataset_config.json')
    with open(p, 'w') as f:
        json.dump(cfg, f, indent=2)
    print(f"    >> {p}")

    # Ranking ELO da Copa
    print("[6] ELO final — times da Copa 2026:")
    ranking = sorted([(t, ratings[t]) for t in all_teams], key=lambda x: -x[1])
    for rank, (team, elo) in enumerate(ranking, 1):
        host_tag = ' [H]' if team in HOSTS else ''
        n_games  = len(list(forms.get(team, [])))
        print(f"    {rank:>2}. {team:<30} {elo:>7.1f}  ({n_games} jogos históricos){host_tag}")


# ─────────────────────────────────────────────────────────────────────
# STEP 6 — GRÁFICOS DE DIAGNÓSTICO
# ─────────────────────────────────────────────────────────────────────

DARK_BG  = '#0f1117'
PANEL_BG = '#1a1d27'
TEXT     = '#e0e0e0'
ACCENT   = '#4fc3f7'
ACCENT2  = '#ef5350'
ACCENT3  = '#66bb6a'
ACCENT4  = '#ffa726'
GRID_CLR = '#2a2d3a'

def style_ax(ax, title):
    ax.set_facecolor(PANEL_BG)
    ax.tick_params(colors=TEXT, labelsize=8)
    ax.xaxis.label.set_color(TEXT)
    ax.yaxis.label.set_color(TEXT)
    ax.title.set_color(TEXT)
    ax.set_title(title, fontsize=10, fontweight='bold', pad=8)
    for spine in ax.spines.values():
        spine.set_edgecolor(GRID_CLR)
    ax.grid(True, color=GRID_CLR, linewidth=0.5, alpha=0.7)


def make_plots(df_mle: pd.DataFrame, params: dict, out_path: str):
    print("[7] Gerando gráficos de diagnóstico...")

    a        = params['a']
    b        = params['b']
    c        = params['c']
    rho0_raw = params['rho0_raw']
    rho1_neg = params['rho1_neg']
    home_adv = params['home_adv']
    k0       = params['k0']
    gamma    = params['gamma']

    rho_ref = rho_from_delta(0, rho0_raw, rho1_neg)

    fig = plt.figure(figsize=(18, 22))
    fig.patch.set_facecolor(DARK_BG)
    gs  = gridspec.GridSpec(4, 3, figure=fig, hspace=0.48, wspace=0.35)

    deltas      = np.linspace(-700, 700, 300)
    lam_h_curve = np.exp(np.clip(a + b * deltas + c * deltas**2, -10, 4))
    lam_a_curve = np.exp(np.clip(a - b * deltas + c * deltas**2, -10, 4))
    delta_bins  = np.arange(-800, 850, 100)
    max_g       = 7

    # 1. Curvas λ vs Δ ELO
    ax = fig.add_subplot(gs[0, 0])
    ax.plot(deltas, lam_h_curve, color=ACCENT,  lw=2, label='λ mandante')
    ax.plot(deltas, lam_a_curve, color=ACCENT2, lw=2, label='λ visitante')
    ax.axvline(0, color=TEXT, lw=0.8, ls='--', alpha=0.4)
    ax.axhline(math.exp(a), color=ACCENT3, lw=0.8, ls=':',
               alpha=0.6, label=f'λ base={math.exp(a):.2f}')
    ax.set_xlabel('Δ ELO (sem home_adv)')
    ax.set_ylabel('Gols esperados')
    ax.legend(fontsize=7, facecolor=PANEL_BG, labelcolor=TEXT)
    style_ax(ax, 'Curva λ × Δ ELO (neutro)')

    # 2. Gols observados vs modelo por bin
    ax = fig.add_subplot(gs[0, 1])
    df2 = df_mle.copy()
    df2['delta_bin'] = pd.cut(df2['delta_elo_raw'], bins=delta_bins)
    grp = df2.groupby('delta_bin', observed=True).agg(
        gols_h=('home_score', 'mean'),
        gols_a=('away_score', 'mean'),
        n=('home_score', 'count')
    ).dropna()
    bin_mids = [iv.mid for iv in grp.index]
    ax.scatter(bin_mids, grp['gols_h'], color=ACCENT,  s=grp['n']/5+10,
               alpha=0.85, label='obs mandante', zorder=3)
    ax.scatter(bin_mids, grp['gols_a'], color=ACCENT2, s=grp['n']/5+10,
               alpha=0.85, label='obs visitante', zorder=3)
    ax.plot(deltas, lam_h_curve, color=ACCENT,  lw=1.5, ls='--', alpha=0.6)
    ax.plot(deltas, lam_a_curve, color=ACCENT2, lw=1.5, ls='--', alpha=0.6)
    ax.set_xlabel('Δ ELO raw')
    ax.set_ylabel('Gols médios')
    ax.legend(fontsize=7, facecolor=PANEL_BG, labelcolor=TEXT)
    style_ax(ax, 'Gols Observados vs Modelo')

    # 3. Home advantage
    ax = fig.add_subplot(gs[0, 2])
    df_home = df_mle[~df_mle['neutral']].copy()
    df_home['delta_bin'] = pd.cut(df_home['delta_elo_raw'], bins=delta_bins)
    grp3 = df_home.groupby('delta_bin', observed=True).apply(
        lambda g: pd.Series({'win_rate': (g['home_score'] > g['away_score']).mean(),
                             'n': len(g)})
    ).dropna()
    bin_mids3 = [iv.mid for iv in grp3.index]

    def win_prob(delta_raw, hadv):
        delta_eff = delta_raw + hadv
        lh, la    = lambdas_from_params(delta_eff, a, b, c)
        return sum(poisson.pmf(gh, lh) * poisson.cdf(gh - 1, la) for gh in range(10))

    ax.scatter(bin_mids3, grp3['win_rate'], color=ACCENT3,
               s=grp3['n']/5+10, alpha=0.85, label='observado', zorder=3)
    ax.plot(bin_mids3, [win_prob(m, home_adv) for m in bin_mids3],
            color=ACCENT,  lw=2, label=f'modelo (hadv={home_adv:.0f})')
    ax.plot(bin_mids3, [win_prob(m, 0) for m in bin_mids3],
            color=ACCENT2, lw=1.5, ls='--', alpha=0.6, label='modelo (hadv=0)')
    ax.set_xlabel('Δ ELO raw')
    ax.set_ylabel('Taxa vitória mandante')
    ax.legend(fontsize=7, facecolor=PANEL_BG, labelcolor=TEXT)
    style_ax(ax, f'Home Advantage = {home_adv:.1f} pts ELO')

    # 4. Heatmap placar observado
    ax = fig.add_subplot(gs[1, 0])
    score_obs = np.zeros((max_g, max_g))
    for _, row in df_mle.iterrows():
        h  = min(int(row['home_score']), max_g - 1)
        a_ = min(int(row['away_score']), max_g - 1)
        score_obs[h, a_] += 1
    score_obs /= score_obs.sum()
    im = ax.imshow(score_obs, cmap='YlOrRd', aspect='auto', vmin=0)
    lbls = [str(i) if i < max_g - 1 else f'{max_g-1}+' for i in range(max_g)]
    ax.set_xticks(range(max_g)); ax.set_yticks(range(max_g))
    ax.set_xticklabels(lbls, fontsize=7); ax.set_yticklabels(lbls, fontsize=7)
    ax.set_xlabel('Gols visitante'); ax.set_ylabel('Gols mandante')
    for i in range(max_g):
        for j in range(max_g):
            ax.text(j, i, f'{score_obs[i,j]:.3f}', ha='center', va='center',
                    fontsize=5.5, color='black')
    plt.colorbar(im, ax=ax)
    style_ax(ax, 'Placar Observado')

    # 5. Heatmap placar modelo (Δ=0, neutro)
    ax = fig.add_subplot(gs[1, 1])
    lh0, la0  = lambdas_from_params(0, a, b, c)
    score_mod = np.zeros((max_g, max_g))
    for i in range(max_g):
        for j in range(max_g):
            score_mod[i, j] = (poisson.pmf(i, lh0) * poisson.pmf(j, la0)
                               * tau_dc(i, j, lh0, la0, rho_ref))
    score_mod /= score_mod.sum()
    im = ax.imshow(score_mod, cmap='YlOrRd', aspect='auto', vmin=0)
    ax.set_xticks(range(max_g)); ax.set_yticks(range(max_g))
    ax.set_xticklabels(lbls, fontsize=7); ax.set_yticklabels(lbls, fontsize=7)
    ax.set_xlabel('Gols visitante'); ax.set_ylabel('Gols mandante')
    for i in range(max_g):
        for j in range(max_g):
            ax.text(j, i, f'{score_mod[i,j]:.3f}', ha='center', va='center',
                    fontsize=5.5, color='black')
    plt.colorbar(im, ax=ax)
    style_ax(ax, 'Placar Modelo (Δ=0, neutro)')

    # 6. Resíduo
    ax = fig.add_subplot(gs[1, 2])
    residuo = score_obs - score_mod
    vmax    = max(abs(residuo.min()), abs(residuo.max()))
    im = ax.imshow(residuo, cmap='RdBu_r', aspect='auto', vmin=-vmax, vmax=vmax)
    ax.set_xticks(range(max_g)); ax.set_yticks(range(max_g))
    ax.set_xticklabels(lbls, fontsize=7); ax.set_yticklabels(lbls, fontsize=7)
    ax.set_xlabel('Gols visitante'); ax.set_ylabel('Gols mandante')
    for i in range(max_g):
        for j in range(max_g):
            clr = 'black' if abs(residuo[i, j]) < vmax * 0.6 else 'white'
            ax.text(j, i, f'{residuo[i,j]:+.3f}', ha='center', va='center',
                    fontsize=5.5, color=clr)
    plt.colorbar(im, ax=ax)
    style_ax(ax, 'Resíduo: Observado − Modelo')

    # 7. Total de gols por jogo
    ax = fig.add_subplot(gs[2, 0])
    df_mle_copy = df_mle.copy()
    df_mle_copy['total'] = df_mle_copy['home_score'] + df_mle_copy['away_score']
    max_tot = 10
    obs_tot = np.array([(df_mle_copy['total'] == g).sum() for g in range(max_tot + 1)],
                       dtype=float)
    obs_tot /= obs_tot.sum()
    lam_tot = lh0 + la0
    mod_tot = np.array([poisson.pmf(g, lam_tot) for g in range(max_tot + 1)])
    x_tot   = np.arange(max_tot + 1)
    w_bar   = 0.35
    ax.bar(x_tot - w_bar/2, obs_tot, width=w_bar, color=ACCENT,  alpha=0.8, label='observado')
    ax.bar(x_tot + w_bar/2, mod_tot, width=w_bar, color=ACCENT2, alpha=0.8, label='modelo')
    ax.set_xlabel('Total de gols'); ax.set_ylabel('Frequência')
    ax.legend(fontsize=7, facecolor=PANEL_BG, labelcolor=TEXT)
    style_ax(ax, 'Distribuição Total de Gols por Jogo')

    # 8. Curva rho vs |Δ ELO|
    ax = fig.add_subplot(gs[2, 1])
    dr_abs    = np.linspace(0, 700, 300)
    rho_curve = np.array([rho_from_delta(d, rho0_raw, rho1_neg) for d in dr_abs])
    ax.plot(dr_abs, rho_curve, color=ACCENT4, lw=2.5)
    ax.axhline(0, color=TEXT, lw=0.8, ls='--', alpha=0.4)
    ax.axhline( RHO_MAX, color=ACCENT3, lw=0.8, ls=':', alpha=0.5, label=f'±RHO_MAX={RHO_MAX}')
    ax.axhline(-RHO_MAX, color=ACCENT3, lw=0.8, ls=':', alpha=0.5)
    ax.fill_between(dr_abs, rho_curve, 0, alpha=0.15, color=ACCENT4)
    for ref_d in [0, 200, 400]:
        rv = rho_from_delta(ref_d, rho0_raw, rho1_neg)
        ax.scatter([ref_d], [rv], color=ACCENT2, s=50, zorder=5)
        ax.annotate(f'Δ={ref_d}\nρ={rv:.3f}', (ref_d, rv),
                    textcoords='offset points', xytext=(6, 6), fontsize=7, color=TEXT)
    ax.set_xlabel('|Δ ELO efetivo|'); ax.set_ylabel('ρ')
    ax.set_ylim(-RHO_MAX * 1.1, RHO_MAX * 1.1)
    ax.legend(fontsize=7, facecolor=PANEL_BG, labelcolor=TEXT)
    style_ax(ax, f'ρ(|Δ ELO|)')

    # 9. Calibração vitórias
    ax = fig.add_subplot(gs[2, 2])
    p_wins, obs_wins = [], []
    for _, row in df_mle.iterrows():
        delta_eff = row['delta_elo_raw'] + home_adv * (0.0 if row['neutral'] else 1.0)
        lh, la    = lambdas_from_params(delta_eff, a, b, c)
        p_win     = sum(poisson.pmf(gh, lh) * poisson.cdf(gh - 1, la) for gh in range(10))
        p_wins.append(p_win)
        obs_wins.append(1 if row['home_score'] > row['away_score'] else 0)
    p_wins   = np.array(p_wins)
    obs_wins = np.array(obs_wins)
    bins_cal = np.linspace(0, 1, 11)
    bin_idx  = np.digitize(p_wins, bins_cal) - 1
    cal_pred, cal_obs, cal_n = [], [], []
    for i in range(len(bins_cal) - 1):
        mask = bin_idx == i
        if mask.sum() > 20:
            cal_pred.append(p_wins[mask].mean())
            cal_obs.append(obs_wins[mask].mean())
            cal_n.append(mask.sum())
    ax.scatter(cal_pred, cal_obs, s=[n / 5 for n in cal_n], color=ACCENT3, alpha=0.85, zorder=3)
    ax.plot([0, 1], [0, 1], color=TEXT, lw=1, ls='--', alpha=0.5, label='calibração perfeita')
    ax.set_xlabel('P(vitória) prevista'); ax.set_ylabel('Taxa observada')
    ax.set_xlim(0, 1); ax.set_ylim(0, 1)
    ax.legend(fontsize=7, facecolor=PANEL_BG, labelcolor=TEXT)
    style_ax(ax, 'Calibração: Vitórias Previstas vs Observadas')

    # 10. goal_factor vs margem de gols
    ax = fig.add_subplot(gs[3, 0])
    diffs = np.arange(0, 8)
    gf_legacy = [goal_factor_legacy(d) for d in diffs]
    gf_param  = [goal_factor_param(d, gamma) for d in diffs]
    ax.plot(diffs, gf_legacy, color=ACCENT2, lw=2, marker='o', ms=5, label='legado (fixo)')
    ax.plot(diffs, gf_param,  color=ACCENT,  lw=2, marker='s', ms=5,
            label=f'parametrizado (γ={gamma:.3f})')
    ax.set_xlabel('|Δ gols|'); ax.set_ylabel('G (goal_factor)')
    ax.legend(fontsize=7, facecolor=PANEL_BG, labelcolor=TEXT)
    style_ax(ax, 'Goal Factor: Legado vs Parametrizado')

    # 11. Gols esperados — confrontos típicos
    ax = fig.add_subplot(gs[3, 1])
    confrontos = [
        ('Brasil\nvs Haiti\n(Δ=+500)',       500, True),
        ('Brasil\nvs França\n(Δ=+50, neutro)', 50, True),
        ('EUA vs México\n(Δ=0, casa EUA)',      0, False),
        ('Alemanha\nvs Suíça\n(Δ=+200)',      200, True),
        ('Argentina\nvs Senegal\n(Δ=+300)',   300, True),
    ]
    labels_c, lams_h_c, lams_a_c = [], [], []
    for label, delta_raw, neut in confrontos:
        delta_eff = delta_raw + home_adv * (0 if neut else 1)
        lh, la    = lambdas_from_params(delta_eff, a, b, c)
        labels_c.append(label); lams_h_c.append(lh); lams_a_c.append(la)
    x_c = np.arange(len(confrontos))
    w_c = 0.35
    ax.bar(x_c - w_c/2, lams_h_c, width=w_c, color=ACCENT,  alpha=0.85, label='λ mandante')
    ax.bar(x_c + w_c/2, lams_a_c, width=w_c, color=ACCENT2, alpha=0.85, label='λ visitante')
    ax.set_xticks(x_c); ax.set_xticklabels(labels_c, fontsize=6.5)
    ax.set_ylabel('Gols esperados')
    ax.legend(fontsize=7, facecolor=PANEL_BG, labelcolor=TEXT)
    style_ax(ax, 'Gols Esperados — Confrontos Típicos')

    # 12. Tabela de parâmetros
    ax = fig.add_subplot(gs[3, 2])
    ax.axis('off')
    rows_tbl = [
        ['Modo',       params['mode'],                          ''],
        ['k0',         f"{k0:.3f}",                             'fator-K base'],
        ['gamma',      f"{gamma:.4f}",                          'expoente margem gols'],
        ['home_adv',   f"{home_adv:.1f}",                       'pts ELO mando'],
        ['a',          f"{a:.4f}",                              f"λ base={math.exp(a):.3f} gols"],
        ['b',          f"{b:.6f}",                              'sensib. linear Δ ELO'],
        ['c',          f"{c:.2e}",                              'curvatura quadrática'],
        ['rho(Δ=0)',   f"{params['rho_at_delta0']:.4f}",        ''],
        ['rho(Δ=400)', f"{params['rho_at_delta400']:.4f}",      ''],
        ['NLL',        f"{params['nll_final']:.2f}",            ''],
        ['Convergiu',  str(params['converged']),                 ''],
    ]
    tbl = ax.table(cellText=rows_tbl,
                   colLabels=['Parâmetro', 'Valor', 'Notas'],
                   cellLoc='center', loc='center', bbox=[0, 0, 1, 1])
    tbl.auto_set_font_size(False); tbl.set_fontsize(8)
    for (r, c_), cell in tbl.get_celld().items():
        cell.set_facecolor('#2a2d3a' if r == 0 else PANEL_BG)
        cell.set_text_props(color=TEXT)
        cell.set_edgecolor(GRID_CLR)
    style_ax(ax, 'Parâmetros Fitados')

    fig.suptitle(f'fit_and_build.py — Diagnóstico  [{params["mode"]}]',
                 fontsize=14, fontweight='bold', color=TEXT, y=0.995)
    plt.savefig(out_path, dpi=150, bbox_inches='tight', facecolor=DARK_BG)
    plt.close()
    print(f"    >> {out_path}")


# ─────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description='Pipeline unificado Copa 2026: fit priors + build dataset.')
    parser.add_argument('--csv',        default=os.path.join(SCRIPT_DIR, 'results_raw.csv'),
                        help='Caminho para results_raw.csv')
    parser.add_argument('--halflife',   type=int, default=HALFLIFE_DAYS,
                        help=f'Meia-vida em dias para peso temporal na MLE (padrão: {HALFLIFE_DAYS} = 8*365)')
    parser.add_argument('--min-year',   type=int, default=MIN_YEAR,
                        help=f'Ano mínimo para a MLE (ELO aquece desde 1872, padrão: {MIN_YEAR})')
    parser.add_argument('--legacy-elo', action='store_true',
                        help='Usa K_FACTORS e goal_factor() fixos (modo original). '
                             'Se omitido, k0 e gamma são co-otimizados com os parâmetros DC.')
    parser.add_argument('--no-plots',   action='store_true',
                        help='Pula a geração dos gráficos de diagnóstico')
    args = parser.parse_args()

    legacy = args.legacy_elo

    print('=' * 62)
    if legacy:
        print('  fit_and_build.py — Copa 2026  [MODO LEGADO]')
    else:
        print('  fit_and_build.py — Copa 2026  [MODO CONJUNTO ELO + DC]')
    print('=' * 62)

    # ── 1. Carrega dados ──────────────────────────────────────────────
    df = load_and_clean(args.csv)

    # ── 2. Prepara estruturas para otimização ─────────────────────────
    all_rows = list(zip(
        df['home_team'], df['away_team'],
        df['home_score'].astype(int), df['away_score'].astype(int),
        df['neutral'].astype(bool), df['tournament'],
    ))

    df_mle = df[df['date'].dt.year >= args.min_year].copy()
    print(f"    >> MLE sobre {len(df_mle):,} jogos (a partir de {args.min_year})")

    if legacy:
        # Calcula ELO legado uma vez e salva delta_elo_raw no df_mle
        print("[1b] Calculando ELO legado para inicializar MLE...")
        deltas_legacy, _ = compute_elo_full(all_rows, legacy=True,
                                             home_adv=ELO_HOME_ADV)
        df['delta_elo_raw'] = deltas_legacy
        df_mle = df[df['date'].dt.year >= args.min_year].copy()

    mle_indices = df_mle.index.tolist()

    # ── 3. Otimiza parâmetros ─────────────────────────────────────────
    params = fit_params(df_mle, all_rows, mle_indices, legacy, args.halflife)

    # ── 4. Reconstrói ELO final e monta DataFrame anotado ────────────
    annotated, ratings = build_annotated(df, params, legacy)

    # ── 5. Sequências de forma ────────────────────────────────────────
    training, forms = build_sequences(annotated)

    # ── 6. Salva todos os artefatos ───────────────────────────────────
    save_artifacts(annotated, training, forms, ratings, params)

    # ── 7. Gráficos ───────────────────────────────────────────────────
    if not args.no_plots:
        # annotated tem delta_elo_raw calculado com os parâmetros finais;
        # filtra pelo mesmo min_year usado na MLE para os gráficos de diagnóstico.
        annotated_mle = annotated[annotated['date'].dt.year >= args.min_year].copy()
        make_plots(annotated_mle, params,
                   os.path.join(OUTPUT_DIR, 'fit_and_build_plots.png'))

    print('\n=== fit_and_build.py concluído ===')
    print('Outputs em results/:')
    print('  prior_params.json')
    print('  matches_with_elo.csv')
    print('  training_sequences.pkl')
    print('  copa2026_state.pkl')
    print('  dataset_config.json')
    if not args.no_plots:
        print('  fit_and_build_plots.png')


if __name__ == '__main__':
    main()
