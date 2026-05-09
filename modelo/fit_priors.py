"""
fit_priors.py
=============
Script 0 — Copa 2026 Modelling Pipeline

Fita 6 parâmetros globais via MLE Dixon-Coles ponderado por recência:
  a        — nível base de gols (intercepto log)
  b        — sensibilidade linear do delta ELO nos lambdas
  c        — curvatura quadrática (jogos muito desiguais)
  rho0_raw — intercepto de rho (escala livre, passa por tanh)
  rho1_raw — slope de rho em |delta_eff| / 400  (escala livre, passa por -softplus)
  home_adv — vantagem de mando em pts ELO (usada APENAS nos lambdas DC e no
             update ELO; o ELO bruto dos times é calculado sem ela)

Modelo de rho:
  rho(delta_eff) = RHO_MAX * tanh(rho0_raw + rho1_raw_neg * |delta_eff| / 400)
  onde rho1_raw_neg = -softplus(rho1_raw) garante slope ≤ 0
  (mais desequilíbrio → menor rho, monotonamente)

ELO:
  - Calculado desde 1872 sobre todos os jogos do CSV (sem corte de ano).
  - O update ELO usa home_adv para calcular We_h (como antes), mas o valor
    de home_adv usado no update é o HOME_ADV_INIT fixo (para o ELO ser
    independente da otimização DC). O home_adv fitado é exclusivo dos lambdas.
  - delta_elo_raw = elo_home_pre − elo_away_pre  (sem home_adv embutido).
  - A MLE filtra jogos a partir de min_year, mas o ELO já está "aquecido".

Outputs:
  prior_params.json    — parâmetros para usar nos demais scripts
  fit_priors_plots.png — painel de diagnóstico (12 painéis)

Uso:
  python fit_priors.py [--csv results_raw.csv] [--halflife 1095] [--min-year 1990]
"""

import argparse
import json
import math
import os
from datetime import datetime

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from scipy.optimize import minimize
from scipy.stats import poisson

# ─────────────────────────────────────────────────────────────────────
# PARÂMETROS PADRÃO
# ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR    = os.path.dirname(os.path.abspath(__file__))
ELO_START     = 1500
# home_adv usado no cálculo do ELO (fixo, não otimizado pelo DC)
ELO_HOME_ADV  = 100.0
HALFLIFE_DAYS = 4*365
MIN_YEAR      = 1990   # ELO aquece desde 1872; MLE usa a partir daqui
OUTPUT_DIR    = SCRIPT_DIR

# Amplitude máxima de rho (Dixon-Coles recomendam ~0.1–0.2)
RHO_MAX = 0.2

K_FACTORS = {
    # ── K=60 · FIFA World Cup ──────────────────────────────────────────────────
    'FIFA World Cup':                                   40,
 
    # ── K=50 · Continental championships & major intercontinental ─────────────
    'UEFA Euro':                                        35,
    'Copa América':                                     35,
    'African Cup of Nations':                           35,
    'AFC Asian Cup':                                    35,
    'Gold Cup':                                         35,
    'Oceania Nations Cup':                              35,
    'CONCACAF Championship':                            35,
    'CCCF Championship':                                35,
    'Confederations Cup':                               35,
    'CONMEBOL\u2013UEFA Cup of Champions':              35,
    'Olympic Games':                                    35,
    'FIFA World Cup qualification':                     35,
    # ── K=40 · World Cup qualifiers, continental qualifiers & major tournaments  
    'UEFA Euro qualification':                          30,
    'Copa América qualification':                       30,
    'African Cup of Nations qualification':             30,
    'AFC Asian Cup qualification':                      30,
    'Gold Cup qualification':                           30,
    'Oceania Nations Cup qualification':                30,
    'CONCACAF Championship qualification':              30,
    'CONCACAF Nations League':                          30,
    'CONCACAF Nations League qualification':            30,
    'UEFA Nations League':                              30,
    'EAFF Championship':                                30,
    'EAFF Championship qualification':                  30,
    'WAFF Championship':                                30,
    'SAFF Cup':                                         30,
    'Gulf Cup':                                         30,
    'CFU Caribbean Cup':                                30,
    'CFU Caribbean Cup qualification':                  30,
    'AFF Championship':                                 30,
    'AFF Championship qualification':                   30,
    'ASEAN Championship':                               30,
    'ASEAN Championship qualification':                 30,
    'UNCAF Cup':                                        30,
    'UNIFFAC Cup':                                      30,
    'CECAFA Cup':                                       30,
    'COSAFA Cup':                                       30,
    'COSAFA Cup qualification':                         30,
    'CAFA Nations Cup':                                 30,
    'Arab Cup':                                         30,
    'Arab Cup qualification':                           30,
    'Pan American Championship':                        30,
    'Superclásico de las Américas':                     30,
    'AFC Challenge Cup':                                30,
    'AFC Challenge Cup qualification':                  30,
    'AFC Solidarity Cup':                               30,
    'NAFC Championship':                                30,
    'NAFU Championship':                                30,
    'Melanesia Cup':                                    30,
    'Pacific Games':                                    30,
    'Pacific Mini Games':                               30,
    'South Pacific Games':                              30,
    'South Pacific Mini Games':                         30,
    'Indian Ocean Island Games':                        30,
    'Island Games':                                     30,
    'Marianas Cup':                                     30,
    "MSG Prime Minister's Cup":                         30,
 
    # ── K=20 · Friendlies ─────────────────────────────────────────────────────
    'Friendly':                                         25,
}
K_DEFAULT = 28   # torneios não mapeados tratados como "outros torneios" (K=30)

# ─────────────────────────────────────────────────────────────────────
# ELO
# ─────────────────────────────────────────────────────────────────────
def goal_factor(diff):
    d = abs(diff)
    if d < 2:  return 1.0
    if d == 2: return 1.5
    return (11 + d) / 8.0


def compute_elo(df):
    """Calcula ELO cronológico sobre TODO o dataset (desde 1872).

    O home_adv aqui é ELO_HOME_ADV (constante fixa), usado apenas para
    calcular We_h no update — i.e. o ELO já "sabe" que jogar em casa vale
    ~100 pts. Os ratings resultantes são puramente de força de time.
    delta_elo_raw = elo_home_pre − elo_away_pre NÃO inclui home_adv.
    """
    ratings = {}
    elo_home_pre, elo_away_pre = [], []
    for _, row in df.iterrows():
        ht, at  = row['home_team'], row['away_team']
        hs, as_ = int(row['home_score']), int(row['away_score'])
        neutral = row['neutral']
        tour    = row['tournament']

        eh = ratings.get(ht, ELO_START)
        ea = ratings.get(at, ELO_START)
        elo_home_pre.append(eh)
        elo_away_pre.append(ea)

        # ELO_HOME_ADV entra aqui para calibrar We_h corretamente,
        # mas NÃO é exportado como parte do delta_elo_raw.
        adv   = 0 if neutral else ELO_HOME_ADV
        delta = eh - ea + adv
        We_h  = 1.0 / (1.0 + 10.0 ** (-delta / 400.0))
        diff  = hs - as_
        W     = 1.0 if diff > 0 else (0.0 if diff < 0 else 0.5)
        G     = goal_factor(diff)
        K     = K_FACTORS.get(tour, K_DEFAULT)

        ratings[ht] = eh + K * G * (W - We_h)
        ratings[at] = ea + K * G * ((1 - W) - (1 - We_h))

    df = df.copy()
    df['elo_home_pre'] = elo_home_pre
    df['elo_away_pre'] = elo_away_pre
    return df, ratings


# ─────────────────────────────────────────────────────────────────────
# PREPARAÇÃO
# ─────────────────────────────────────────────────────────────────────
def load_and_prepare(csv_path, halflife_days, min_year):
    print(f"[1/4] Carregando {csv_path}...")
    df = pd.read_csv(csv_path)
    df['home_score'] = pd.to_numeric(df['home_score'], errors='coerce')
    df['away_score'] = pd.to_numeric(df['away_score'], errors='coerce')
    df = df.dropna(subset=['home_score', 'away_score']).copy()
    df['home_score'] = df['home_score'].astype(int)
    df['away_score'] = df['away_score'].astype(int)
    df['neutral']    = df['neutral'].fillna(False).astype(bool)
    df['date']       = pd.to_datetime(df['date'])
    df = df.sort_values('date').drop_duplicates().reset_index(drop=True)
    print(f"    >> {len(df):,} jogos totais após limpeza")

    # ELO calculado sobre TODOS os jogos (desde 1872) para aquecer os ratings
    print("[2/4] Calculando ELO cronológico (desde 1872)...")
    df, final_ratings = compute_elo(df)
    print(f"    >> ELO calculado sobre {len(df):,} jogos históricos")

    # Filtra apenas para a MLE — ELO já está aquecido
    df = df[df['date'].dt.year >= min_year].copy()
    print(f"    >> {len(df):,} jogos usados na MLE (a partir de {min_year})")

    ref_date         = df['date'].max()
    df['dias_atras'] = (ref_date - df['date']).dt.days
    decay_lambda     = math.log(2) / halflife_days
    df['peso']       = np.exp(-decay_lambda * df['dias_atras'])

    # delta_elo_raw = força do mandante − força do visitante (SEM home_adv)
    # O home_adv é tratado separadamente como parâmetro DC fitado
    df['delta_elo_raw'] = df['elo_home_pre'] - df['elo_away_pre']

    print(f"    >> Referência: {ref_date.date()}  |  meia-vida: {halflife_days} dias")
    print(f"    >> Equiv. jogos uniformes: {df['peso'].sum():.0f}")
    return df, final_ratings


# ─────────────────────────────────────────────────────────────────────
# MODELO
# ─────────────────────────────────────────────────────────────────────
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
    """Lambdas simétricos: λ_h(δ) = λ_a(−δ). Simetria preservada."""
    lam_h = math.exp(a + b * delta_eff + c * delta_eff ** 2)
    lam_a = math.exp(a - b * delta_eff + c * delta_eff ** 2)
    return lam_h, lam_a


def softplus(x):
    """log(1 + exp(x)), numericamente estável."""
    return math.log1p(math.exp(min(x, 30)))


def rho_from_delta(delta_eff, rho0_raw, rho1_neg):
    """Rho como função monotonamente decrescente de |delta_eff|.

    Parametrização:
      rho = RHO_MAX * tanh(rho0_raw - rho1_neg * |delta_eff| / 400)

    onde rho1_neg = softplus(rho1_raw) ≥ 0, garantindo slope ≤ 0.

    Garantias:
      - |rho| < RHO_MAX  (tau nunca viola positivity para lambdas razoáveis)
      - rho decresce (ou mantém) com |delta_eff|: confrontos equilibrados
        têm maior correção de baixos placares
      - Diferenciável em todo ponto → L-BFGS-B funciona bem
    """
    arg = rho0_raw - rho1_neg * abs(delta_eff) / 400.0
    return RHO_MAX * math.tanh(arg)


# ─────────────────────────────────────────────────────────────────────
# NLL
# ─────────────────────────────────────────────────────────────────────
def neg_log_likelihood(params, df_arr):
    """
    Parâmetros (6):
      a, b, c       — lambdas Dixon-Coles
      rho0_raw      — intercepto de rho (livre, passa por tanh)
      rho1_raw      — slope bruto; rho1_neg = softplus(rho1_raw) ≥ 0
      home_adv      — pts ELO de vantagem de mando (APENAS nos lambdas)

    delta_elo_raw = elo_home − elo_away  (sem home_adv; calculado a priori)
    delta_eff = delta_elo_raw + home_adv  (para jogos não-neutros)
    """
    a, b, c, rho0_raw, rho1_raw, home_adv = params
    rho1_neg = softplus(rho1_raw)   # ≥ 0 → garante slope ≤ 0 no rho

    total = 0.0
    for delta_raw, neutral, X, Y, peso in df_arr:
        delta_eff    = delta_raw + home_adv * (0 if neutral else 1)
        lam_h, lam_a = lambdas_from_params(delta_eff, a, b, c)
        rho          = rho_from_delta(delta_eff, rho0_raw, rho1_neg)
        log_p = (log_poisson_pmf(X, lam_h)
               + log_poisson_pmf(Y, lam_a)
               + math.log(tau_dc(X, Y, lam_h, lam_a, rho)))
        total += peso * log_p

    return -total


# ─────────────────────────────────────────────────────────────────────
# FITTING
# ─────────────────────────────────────────────────────────────────────
def fit_params(df):
    print("[3/4] Optimizando parâmetros (L-BFGS-B)...")

    df_arr = df[['delta_elo_raw', 'neutral',
                 'home_score', 'away_score', 'peso']].values.tolist()

    # x0: [a, b, c, rho0_raw, rho1_raw, home_adv]
    x0     = [0.2, 0.0008, -1e-7, 0.5, 0.0, 100.0]
    bounds = [
        (-1.0,  1.0),      # a
        (0.0,   0.005),    # b
        (-1e-5, 1e-5),     # c
        (-4.0,  4.0),      # rho0_raw
        (-10.0, 10.0),     # rho1_raw  (softplus → rho1_neg ≥ 0)
        (0.0,   300.0),    # home_adv
    ]

    result = minimize(
        neg_log_likelihood,
        x0=x0,
        args=(df_arr,),
        method='L-BFGS-B',
        bounds=bounds,
        options={'maxiter': 2000, 'ftol': 1e-12, 'gtol': 1e-8},
    )

    a, b, c, rho0_raw, rho1_raw, home_adv = result.x
    rho1_neg  = softplus(rho1_raw)
    rho_eq    = rho_from_delta(0,   rho0_raw, rho1_neg)   # confronto equilibrado
    rho_400   = rho_from_delta(400, rho0_raw, rho1_neg)   # diferença de 400 pts
    lam_base  = math.exp(a)

    print(f"    >> Convergiu: {result.success}  |  NLL: {result.fun:.4f}")
    print(f"    >> a={a:.4f}  b={b:.6f}  c={c:.2e}  home_adv={home_adv:.1f}")
    print(f"    >> rho0_raw={rho0_raw:.4f}  rho1_neg={rho1_neg:.4f}")
    print(f"    >> rho(Δ=0)={rho_eq:.4f}  rho(Δ=400)={rho_400:.4f}")
    print(f"    >> lambda base (confronto 50/50, neutro): {lam_base:.3f} gols/time")

    return {
        'a': a, 'b': b, 'c': c,
        'rho0_raw': rho0_raw,
        'rho1_raw': rho1_raw,
        'rho1_neg': rho1_neg,
        'rho_at_delta0':   rho_eq,
        'rho_at_delta400': rho_400,
        'home_adv': home_adv,
        'nll_final': result.fun,
        'converged': bool(result.success),
        'lambda_base': lam_base,
    }


# ─────────────────────────────────────────────────────────────────────
# GRÁFICOS
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


def make_plots(df, params, out_path):
    print("[4/4] Gerando gráficos de diagnóstico...")

    a, b, c  = params['a'], params['b'], params['c']
    rho0_raw = params['rho0_raw']
    rho1_neg = params['rho1_neg']
    home_adv = params['home_adv']

    # rho escalar em Δ=0 (neutro) para heatmaps de referência
    rho_ref  = rho_from_delta(0, rho0_raw, rho1_neg)

    fig = plt.figure(figsize=(18, 22))
    fig.patch.set_facecolor(DARK_BG)
    gs  = gridspec.GridSpec(4, 3, figure=fig, hspace=0.48, wspace=0.35)

    deltas      = np.linspace(-700, 700, 300)
    lam_h_curve = np.exp(a + b * deltas + c * deltas**2)
    lam_a_curve = np.exp(a - b * deltas + c * deltas**2)
    delta_bins  = np.arange(-800, 850, 100)
    max_g       = 7

    # ── 1. Curvas λ vs Δ ELO ─────────────────────────────────────────
    ax = fig.add_subplot(gs[0, 0])
    ax.plot(deltas, lam_h_curve, color=ACCENT,  lw=2, label='λ mandante')
    ax.plot(deltas, lam_a_curve, color=ACCENT2, lw=2, label='λ visitante')
    ax.axvline(0, color=TEXT, lw=0.8, ls='--', alpha=0.4)
    ax.axhline(math.exp(a), color=ACCENT3, lw=0.8, ls=':',
               alpha=0.6, label=f'λ base={math.exp(a):.2f}')
    ax.set_xlabel('Δ ELO (home − away, sem home_adv)')
    ax.set_ylabel('Gols esperados')
    ax.legend(fontsize=7, facecolor=PANEL_BG, labelcolor=TEXT)
    style_ax(ax, 'Curva λ × Δ ELO (neutro)')

    # ── 2. Gols médios observados vs modelo por bin ───────────────────
    ax = fig.add_subplot(gs[0, 1])
    df2 = df.copy()
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
    style_ax(ax, 'Gols Observados vs Modelo (por bin Δ ELO)')

    # ── 3. Home advantage ─────────────────────────────────────────────
    ax = fig.add_subplot(gs[0, 2])
    df_home = df[~df['neutral']].copy()
    df_home['delta_bin'] = pd.cut(df_home['delta_elo_raw'], bins=delta_bins)
    grp3 = df_home.groupby('delta_bin', observed=True).apply(
        lambda g: pd.Series({
            'win_rate': (g['home_score'] > g['away_score']).mean(),
            'n': len(g)
        })
    ).dropna()
    bin_mids3 = [iv.mid for iv in grp3.index]

    def win_prob(delta_raw, hadv):
        delta_eff    = delta_raw + hadv
        lh, la       = lambdas_from_params(delta_eff, a, b, c)
        return sum(poisson.pmf(g_h, lh) * poisson.cdf(g_h - 1, la) for g_h in range(10))

    exp_had = [win_prob(m, home_adv) for m in bin_mids3]
    exp_no  = [win_prob(m, 0)        for m in bin_mids3]
    ax.scatter(bin_mids3, grp3['win_rate'], color=ACCENT3,
               s=grp3['n']/5+10, alpha=0.85, label='observado', zorder=3)
    ax.plot(bin_mids3, exp_had, color=ACCENT,  lw=2,
            label=f'modelo (hadv={home_adv:.0f})')
    ax.plot(bin_mids3, exp_no,  color=ACCENT2, lw=1.5, ls='--',
            alpha=0.6, label='modelo (hadv=0)')
    ax.set_xlabel('Δ ELO raw')
    ax.set_ylabel('Taxa vitória mandante')
    ax.legend(fontsize=7, facecolor=PANEL_BG, labelcolor=TEXT)
    style_ax(ax, f'Home Advantage = {home_adv:.1f} pts ELO')

    # ── 4. Heatmap placar observado ───────────────────────────────────
    ax = fig.add_subplot(gs[1, 0])
    score_obs = np.zeros((max_g, max_g))
    for _, row in df.iterrows():
        h  = min(int(row['home_score']), max_g-1)
        a_ = min(int(row['away_score']), max_g-1)
        score_obs[h, a_] += row['peso']
    score_obs /= score_obs.sum()
    im = ax.imshow(score_obs, cmap='YlOrRd', aspect='auto', vmin=0)
    ax.set_xlabel('Gols visitante'); ax.set_ylabel('Gols mandante')
    ax.set_xticks(range(max_g)); ax.set_yticks(range(max_g))
    lbls = [str(i) if i < max_g-1 else f'{max_g-1}+' for i in range(max_g)]
    ax.set_xticklabels(lbls, fontsize=7); ax.set_yticklabels(lbls, fontsize=7)
    for i in range(max_g):
        for j in range(max_g):
            ax.text(j, i, f'{score_obs[i,j]:.3f}', ha='center', va='center',
                    fontsize=5.5, color='black')
    plt.colorbar(im, ax=ax)
    style_ax(ax, 'Distribuição Placar Observada (ponderada)')

    # ── 5. Heatmap placar modelo (Δ=0, neutro) ───────────────────────
    ax = fig.add_subplot(gs[1, 1])
    lh0, la0 = lambdas_from_params(0, a, b, c)
    score_mod = np.zeros((max_g, max_g))
    for i in range(max_g):
        for j in range(max_g):
            score_mod[i, j] = (poisson.pmf(i, lh0) * poisson.pmf(j, la0)
                                * tau_dc(i, j, lh0, la0, rho_ref))
    score_mod /= score_mod.sum()
    im = ax.imshow(score_mod, cmap='YlOrRd', aspect='auto', vmin=0)
    ax.set_xlabel('Gols visitante'); ax.set_ylabel('Gols mandante')
    ax.set_xticks(range(max_g)); ax.set_yticks(range(max_g))
    ax.set_xticklabels(lbls, fontsize=7); ax.set_yticklabels(lbls, fontsize=7)
    for i in range(max_g):
        for j in range(max_g):
            ax.text(j, i, f'{score_mod[i,j]:.3f}', ha='center', va='center',
                    fontsize=5.5, color='black')
    plt.colorbar(im, ax=ax)
    style_ax(ax, 'Distribuição Placar Modelo (Δ=0, neutro)')

    # ── 6. Resíduo obs − modelo ───────────────────────────────────────
    ax = fig.add_subplot(gs[1, 2])
    residuo = score_obs - score_mod
    vmax    = max(abs(residuo.min()), abs(residuo.max()))
    im = ax.imshow(residuo, cmap='RdBu_r', aspect='auto', vmin=-vmax, vmax=vmax)
    ax.set_xlabel('Gols visitante'); ax.set_ylabel('Gols mandante')
    ax.set_xticks(range(max_g)); ax.set_yticks(range(max_g))
    ax.set_xticklabels(lbls, fontsize=7); ax.set_yticklabels(lbls, fontsize=7)
    for i in range(max_g):
        for j in range(max_g):
            clr = 'black' if abs(residuo[i,j]) < vmax*0.6 else 'white'
            ax.text(j, i, f'{residuo[i,j]:+.3f}', ha='center', va='center',
                    fontsize=5.5, color=clr)
    plt.colorbar(im, ax=ax)
    style_ax(ax, 'Resíduo: Observado − Modelo')

    # ── 7. Total de gols por jogo ─────────────────────────────────────
    ax = fig.add_subplot(gs[2, 0])
    df['total_goals'] = df['home_score'] + df['away_score']
    max_tot  = 10
    obs_tot  = np.array([(df['total_goals'] == g).sum() for g in range(max_tot+1)], dtype=float)
    obs_tot /= obs_tot.sum()
    lam_tot  = lh0 + la0
    mod_tot  = np.array([poisson.pmf(g, lam_tot) for g in range(max_tot+1)])
    x_tot    = np.arange(max_tot+1)
    w_bar    = 0.35
    ax.bar(x_tot - w_bar/2, obs_tot, width=w_bar, color=ACCENT,  alpha=0.8, label='observado')
    ax.bar(x_tot + w_bar/2, mod_tot, width=w_bar, color=ACCENT2, alpha=0.8, label='modelo')
    ax.set_xlabel('Total de gols'); ax.set_ylabel('Frequência')
    ax.legend(fontsize=7, facecolor=PANEL_BG, labelcolor=TEXT)
    style_ax(ax, 'Distribuição Total de Gols por Jogo')

    # ── 8. Curva rho vs |Δ ELO efetivo| ─────────────────────────────
    ax = fig.add_subplot(gs[2, 1])
    dr_abs   = np.linspace(0, 700, 300)
    rho_curve = np.array([rho_from_delta(d, rho0_raw, rho1_neg) for d in dr_abs])
    ax.plot(dr_abs, rho_curve, color=ACCENT4, lw=2.5, label='ρ(|Δ|)')
    ax.axhline(0, color=TEXT, lw=0.8, ls='--', alpha=0.4)
    ax.axhline( RHO_MAX, color=ACCENT3, lw=0.8, ls=':', alpha=0.5, label=f'±RHO_MAX={RHO_MAX}')
    ax.axhline(-RHO_MAX, color=ACCENT3, lw=0.8, ls=':', alpha=0.5)
    ax.fill_between(dr_abs, rho_curve, 0, alpha=0.15, color=ACCENT4)
    ax.set_xlabel('|Δ ELO efetivo|')
    ax.set_ylabel('ρ')
    ax.set_ylim(-RHO_MAX * 1.1, RHO_MAX * 1.1)
    # Pontos de referência
    for ref_d, lbl in [(0, 'Δ=0'), (200, 'Δ=200'), (400, 'Δ=400')]:
        rv = rho_from_delta(ref_d, rho0_raw, rho1_neg)
        ax.scatter([ref_d], [rv], color=ACCENT2, s=50, zorder=5)
        ax.annotate(f'{lbl}\nρ={rv:.3f}', (ref_d, rv),
                    textcoords='offset points', xytext=(6, 6),
                    fontsize=7, color=TEXT)
    ax.legend(fontsize=7, facecolor=PANEL_BG, labelcolor=TEXT)
    style_ax(ax, f'ρ(|Δ ELO|) — rho0={params["rho0_raw"]:.3f}, rho1_neg={rho1_neg:.3f}')

    # ── 9. Calibração vitórias ────────────────────────────────────────
    ax = fig.add_subplot(gs[2, 2])
    p_wins, obs_wins = [], []
    for _, row in df.iterrows():
        delta_eff    = row['delta_elo_raw'] + home_adv * (0 if row['neutral'] else 1)
        lh, la       = lambdas_from_params(delta_eff, a, b, c)
        rho_game     = rho_from_delta(delta_eff, rho0_raw, rho1_neg)
        p_win        = sum(
            poisson.pmf(g_h, lh) * poisson.cdf(g_h-1, la)
            for g_h in range(10)
        )
        p_wins.append(p_win)
        obs_wins.append(1 if row['home_score'] > row['away_score'] else 0)
    p_wins   = np.array(p_wins)
    obs_wins = np.array(obs_wins)
    bins_cal = np.linspace(0, 1, 11)
    bin_idx  = np.digitize(p_wins, bins_cal) - 1
    cal_pred, cal_obs, cal_n = [], [], []
    for i in range(len(bins_cal)-1):
        mask = bin_idx == i
        if mask.sum() > 20:
            cal_pred.append(p_wins[mask].mean())
            cal_obs.append(obs_wins[mask].mean())
            cal_n.append(mask.sum())
    ax.scatter(cal_pred, cal_obs, s=[n/5 for n in cal_n],
               color=ACCENT3, alpha=0.85, zorder=3)
    ax.plot([0, 1], [0, 1], color=TEXT, lw=1, ls='--', alpha=0.5,
            label='calibração perfeita')
    ax.set_xlabel('P(vitória) prevista'); ax.set_ylabel('Taxa observada')
    ax.set_xlim(0, 1); ax.set_ylim(0, 1)
    ax.legend(fontsize=7, facecolor=PANEL_BG, labelcolor=TEXT)
    style_ax(ax, 'Calibração: Vitórias Previstas vs Observadas')

    # ── 10. Pesos temporais ───────────────────────────────────────────
    ax = fig.add_subplot(gs[3, 0])
    df_s = df.sort_values('date')
    ax.fill_between(df_s['date'], df_s['peso'], color=ACCENT, alpha=0.45)
    ax.plot(df_s['date'], df_s['peso'], color=ACCENT, lw=0.8)
    ax.set_xlabel('Data'); ax.set_ylabel('Peso')
    ax.tick_params(axis='x', rotation=30)
    style_ax(ax, 'Pesos Temporais (decaimento exponencial)')

    # ── 11. Gols esperados — confrontos típicos ───────────────────────
    ax = fig.add_subplot(gs[3, 1])
    confrontos = [
        ('Brasil\nvs Haiti\n(Δ=+500)',        500, True),
        ('Brasil\nvs França\n(Δ=+50, neutro)',  50, True),
        ('EUA vs México\n(Δ=0, casa EUA)',       0, False),
        ('Alemanha\nvs Suíça\n(Δ=+200)',       200, True),
        ('Argentina\nvs Senegal\n(Δ=+300)',    300, True),
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
    ax.set_xticks(x_c)
    ax.set_xticklabels(labels_c, fontsize=6.5, rotation=0, ha='center')
    ax.set_ylabel('Gols esperados')
    ax.legend(fontsize=7, facecolor=PANEL_BG, labelcolor=TEXT)
    style_ax(ax, 'Gols Esperados — Confrontos Típicos')

    # ── 12. Tabela de parâmetros ──────────────────────────────────────
    ax = fig.add_subplot(gs[3, 2])
    ax.axis('off')
    rows = [
        ['a',          f"{params['a']:.4f}",             f"λ base = {params['lambda_base']:.3f} gols"],
        ['b',          f"{params['b']:.6f}",              'sensib. linear Δ ELO'],
        ['c',          f"{params['c']:.2e}",               'curvatura quadrática'],
        ['rho0_raw',   f"{params['rho0_raw']:.4f}",       f"ρ(Δ=0) = {params['rho_at_delta0']:.4f}"],
        ['rho1_neg',   f"{params['rho1_neg']:.4f}",       f"slope ρ; ρ(Δ=400) = {params['rho_at_delta400']:.4f}"],
        ['home_adv',   f"{params['home_adv']:.1f}",      'pts ELO mando (só DC)'],
        ['NLL',        f"{params['nll_final']:.2f}",      ''],
        ['OK?',        str(params['converged']),           ''],
    ]
    tbl = ax.table(
        cellText=rows,
        colLabels=['Parâmetro', 'Valor', 'Interpretação'],
        cellLoc='center', loc='center', bbox=[0, 0, 1, 1],
    )
    tbl.auto_set_font_size(False); tbl.set_fontsize(8)
    for (r, c_), cell in tbl.get_celld().items():
        cell.set_facecolor('#2a2d3a' if r == 0 else PANEL_BG)
        cell.set_text_props(color=TEXT)
        cell.set_edgecolor(GRID_CLR)
    style_ax(ax, 'Parâmetros Fitados')

    fig.suptitle(
        'fit_priors.py — Diagnóstico Dixon-Coles Global',
        fontsize=14, fontweight='bold', color=TEXT, y=0.995,
    )
    plt.savefig(out_path, dpi=150, bbox_inches='tight', facecolor=DARK_BG)
    plt.close()
    print(f"    >> {out_path}")


# ─────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--csv',      default=os.path.join(SCRIPT_DIR, 'results_raw.csv'))
    parser.add_argument('--halflife', type=int, default=HALFLIFE_DAYS)
    parser.add_argument('--min-year', type=int, default=MIN_YEAR)
    args = parser.parse_args()

    print("=" * 60)
    print("  fit_priors.py — Copa 2026 Pipeline  ")
    print("=" * 60)

    df, _ = load_and_prepare(args.csv, args.halflife, args.min_year)
    params = fit_params(df)

    out_json = os.path.join(OUTPUT_DIR, 'prior_params.json')
    with open(out_json, 'w') as f:
        json.dump(params, f, indent=2)
    print(f"\n    >> {out_json} salvo")

    make_plots(df, params, os.path.join(OUTPUT_DIR, 'fit_priors_plots.png'))

    print("\n=== fit_priors.py concluido ===")
    print("Outputs:")
    print("  prior_params.json")
    print("  fit_priors_plots.png")
    print("\nParâmetros fitados:")
    for k, v in params.items():
        print(f"  {k:18s}: {v}")


if __name__ == '__main__':
    main()
