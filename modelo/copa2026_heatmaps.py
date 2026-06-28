#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
"""
copa2026_heatmaps.py
====================
Gerador offline de heatmaps Dixon-Coles para TODOS os jogos da Copa 2026.

Lê  k_factors_final.json  e  prior_params.json  de  modelo/results/
Gera PNGs em  modelo/results/heatmaps_all/<fase>/

Edite as listas de confrontos das fases eliminatórias conforme os jogos
forem se definindo. Jogos com qualquer time como "TBD" são ignorados.
"""

import os
import json
import itertools
import numpy as np
from scipy.stats import poisson
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────
MAX_GOALS = 9       # placares de 0 a 8
RHO_MAX   = 0.2

# Se True, ignora K_att/K_def do JSON e usa 1.0 (prior puro)
USE_FLAT_K = False

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
RESULTS_DIR = os.path.join(SCRIPT_DIR, "results")
OUTPUT_ROOT = os.path.join(RESULTS_DIR, "heatmaps_all")

HOSTS = {"United States", "Mexico", "Canada"}

# ─────────────────────────────────────────────────────────────────────────────
# SISTEMA DE PONTUAÇÃO
# ─────────────────────────────────────────────────────────────────────────────
FASE_FATORES = {
    "grupos":   1.0,
    "16avos":   1.2,
    "oitavas":  1.4,
    "quartas":  1.6,
    "semis":    1.8,
    "terceiro": 1.8,
    "final":    2.0,
}


def pontos_por_placar(h_real, a_real, h_pal, a_pal, fator=1.0):
    def res(h, a): return "H" if h > a else ("A" if a > h else "D")
    if res(h_pal, a_pal) != res(h_real, a_real):
        return 0.0
    total = h_real + a_real
    if h_pal == h_real and a_pal == a_real:
        bonus = 5 if total >= 4 else 3
        pts   = 3 + bonus
    elif abs(h_pal - a_pal) == abs(h_real - a_real):
        pts = 3 + 1
    elif h_pal == h_real or a_pal == a_real:
        pts = 3 + 1
    else:
        pts = 3
    return pts * fator


# ─────────────────────────────────────────────────────────────────────────────
# MODELO DIXON-COLES
# ─────────────────────────────────────────────────────────────────────────────

def lambda_base_dc(delta_elo: float, p: dict):
    d  = delta_elo
    lh = float(np.exp(p["a"] + p["b"] * d + p["c"] * d ** 2))
    la = float(np.exp(p["a"] - p["b"] * d + p["c"] * d ** 2))
    return lh, la


def rho_from_delta(delta_elo: float, p: dict) -> float:
    arg = p["rho0_raw"] - p["rho1_neg"] * abs(delta_elo) / 400.0
    return float(RHO_MAX * np.tanh(arg))


def dc_tau(x, y, la, lb, rho):
    if x == 0 and y == 0: return max(1e-9, 1 - la * lb * rho)
    if x == 1 and y == 0: return max(1e-9, 1 + la * rho)
    if x == 0 and y == 1: return max(1e-9, 1 + lb * rho)
    if x == 1 and y == 1: return max(1e-9, 1 - rho)
    return 1.0


def score_matrix(la, lb, rho, mg=MAX_GOALS):
    M = np.array(
        [[poisson.pmf(x, la) * poisson.pmf(y, lb) * dc_tau(x, y, la, lb, rho)
          for y in range(mg)]
         for x in range(mg)],
        dtype=np.float64,
    )
    M = np.clip(M, 0, None)
    s = M.sum()
    if s > 0:
        M /= s
    return M


def points_expectation_matrix(M, fator=1.0):
    mg = M.shape[0]
    E  = np.zeros((mg, mg), dtype=np.float64)
    for i in range(mg):
        for j in range(mg):
            ep = sum(M[x, y] * pontos_por_placar(x, y, i, j, fator)
                     for x in range(mg) for y in range(mg))
            E[i, j] = ep
    return E


def p_avanca_ko(M, la, lb):
    p_win_h = float(np.tril(M, -1).sum())
    p_draw  = float(np.trace(M))
    p_win_a = float(np.triu(M,  1).sum())
    p_pen_h = la / (la + lb) if (la + lb) > 0 else 0.5
    return p_win_h + p_draw * p_pen_h, p_win_a + p_draw * (1 - p_pen_h)


# ─────────────────────────────────────────────────────────────────────────────
# GERAÇÃO DE HEATMAP (dark mode, dois subplots)
# ─────────────────────────────────────────────────────────────────────────────

def make_heatmap(game_label, home_name, away_name, k_factors, priors,
                 fase, output_dir, resultado=None, is_ko=False):
    """
    game_label : string (ex: "G01", "R32_01", "Final")
    home_name  : nome em inglês (chave em k_factors)
    away_name  : nome em inglês
    fase       : chave em FASE_FATORES
    resultado  : (gols_home, gols_away) ou None
    is_ko      : True → exibe P(avança) no rodapé
    """
    if home_name not in k_factors:
        print(f"  [AVISO] '{home_name}' não encontrado em k_factors — pulando")
        return
    if away_name not in k_factors:
        print(f"  [AVISO] '{away_name}' não encontrado em k_factors — pulando")
        return

    hd = k_factors[home_name]
    ad = k_factors[away_name]
    elo_h = float(hd["elo"])
    elo_a = float(ad["elo"])

    if USE_FLAT_K:
        k_att_h = k_def_h = k_att_a = k_def_a = 1.0
    else:
        k_att_h = float(hd.get("K_att", 1.0))
        k_def_h = float(hd.get("K_def", 1.0))
        k_att_a = float(ad.get("K_att", 1.0))
        k_def_a = float(ad.get("K_def", 1.0))

    delta = elo_h - elo_a
    if home_name in HOSTS: delta += float(priors.get("home_adv", 80))
    if away_name in HOSTS: delta -= float(priors.get("home_adv", 80))

    lb_h, lb_a = lambda_base_dc(delta, priors)
    rho = rho_from_delta(delta, priors)
    la  = lb_h * k_att_h * k_def_a
    lb  = lb_a * k_att_a * k_def_h

    M   = score_matrix(la, lb, rho, MAX_GOALS)
    fator = FASE_FATORES.get(fase, 1.0)
    E   = points_expectation_matrix(M, fator)

    p_hw = float(np.tril(M, -1).sum())
    p_d  = float(np.trace(M))
    p_aw = float(np.triu(M, 1).sum())
    p_adv_h, p_adv_a = p_avanca_ko(M, la, lb)

    # ── figura ──────────────────────────────────────────────────────────
    N    = MAX_GOALS
    CELL = 0.60
    CB_W = 0.35
    ML   = 0.75; MR = CB_W + 0.35; MT = 0.55; MB = 0.60
    HDR  = 1.15; GAP = 0.50

    fig_w = ML + N * CELL + MR
    fig_h = HDR + MT + N * CELL + MB + GAP + MT + N * CELL + MB

    fig = plt.figure(figsize=(fig_w, fig_h))
    fig.patch.set_facecolor("#0d1117")

    fy = lambda y_in: y_in / fig_h
    fx = lambda x_in: x_in / fig_w

    # cabeçalho
    ax_hdr = fig.add_axes([0, fy(fig_h - HDR), 1, fy(HDR)])
    ax_hdr.set_facecolor("#0d1117"); ax_hdr.axis("off")
    fase_label = fase.capitalize()
    meta = (f"{game_label}  —  {fase_label}  |  "
            f"ρ={rho:.3f}  Δelo={delta:+.0f}  [K: {'flat' if USE_FLAT_K else 'GRU'}]")
    ax_hdr.text(0.5, 0.97, meta, ha="center", va="top",
                transform=ax_hdr.transAxes, fontsize=9, color="#8b949e",
                family="monospace")
    match_line = (f"{home_name}  ({elo_h:.0f} | λ={la:.3f})"
                  f"   ×   "
                  f"({lb:.3f}=λ | {elo_a:.0f})  {away_name}")
    ax_hdr.text(0.5, 0.62, match_line, ha="center", va="top",
                transform=ax_hdr.transAxes, fontsize=13, color="#e6edf3",
                fontweight="bold")

    if is_ko:
        footer = (f"P({home_name} wins) = {p_hw:.1%}     "
                  f"P(draw 90') = {p_d:.1%}     "
                  f"P({away_name} wins) = {p_aw:.1%}\n"
                  f"P(advance) → {home_name}: {p_adv_h:.1%}   {away_name}: {p_adv_a:.1%}")
    else:
        footer = (f"P({home_name} wins) = {p_hw:.1%}     "
                  f"P(draw) = {p_d:.1%}     "
                  f"P({away_name} wins) = {p_aw:.1%}")
    ax_hdr.text(0.5, 0.08, footer, ha="center", va="bottom",
                transform=ax_hdr.transAxes, fontsize=9.5, color="#58a6ff",
                multialignment="center")

    # helper heatmap
    labels = [str(g) for g in range(N)]

    def place_hm(bottom_inch, data, cmap, vmin, vmax, title, xlabel, ylabel, fmt_fn, col_fn):
        ax = fig.add_axes([fx(ML), fy(bottom_inch + MB), fx(N * CELL), fy(N * CELL)])
        ax.set_facecolor("#161b22")
        im = ax.imshow(data, aspect="equal", cmap=cmap,
                       vmin=vmin, vmax=vmax, interpolation="nearest")

        max_idx = np.unravel_index(np.argmax(data), data.shape)
        for xi in range(N):
            for yi in range(N):
                val = data[xi, yi]
                ax.text(yi, xi, fmt_fn(val), ha="center", va="center",
                        fontsize=7.5, color=col_fn(val))

        # borda verde no máximo
        ax.add_patch(plt.Rectangle(
            (max_idx[1] - 0.5, max_idx[0] - 0.5), 1, 1,
            fill=False, edgecolor="lime", linewidth=2.0))
        # diagonais (empate) em azul tracejado
        for k in range(N):
            ax.add_patch(plt.Rectangle(
                (k - 0.5, k - 0.5), 1, 1,
                fill=False, edgecolor="royalblue", linewidth=1.0, linestyle="--"))
        # resultado real (se disponível)
        if resultado is not None:
            rh, ra = resultado
            if 0 <= rh < N and 0 <= ra < N:
                ax.add_patch(plt.Rectangle(
                    (ra - 0.5, rh - 0.5), 1, 1,
                    fill=False, edgecolor="deepskyblue", linewidth=2.5))

        ax.set_xticks(range(N)); ax.set_xticklabels(labels, color="#8b949e", fontsize=7.5)
        ax.set_yticks(range(N)); ax.set_yticklabels(labels, color="#8b949e", fontsize=7.5)
        ax.set_xlabel(xlabel, color="#8b949e", fontsize=8.5, labelpad=3)
        ax.set_ylabel(ylabel, color="#8b949e", fontsize=8.5, labelpad=3)
        ax.set_title(title,   color="#c9d1d9", fontsize=9,   pad=5)
        ax.tick_params(colors="#8b949e", length=0)
        for sp in ax.spines.values(): sp.set_edgecolor("#30363d")

        ax_cb = fig.add_axes([fx(ML + N * CELL + 0.10), fy(bottom_inch + MB),
                               fx(0.18), fy(N * CELL)])
        fig.colorbar(im, cax=ax_cb)
        ax_cb.yaxis.set_tick_params(color="#8b949e", labelcolor="#8b949e", labelsize=6.5)

    # ── heatmap superior: probabilidade do placar
    m100     = M * 100
    m100_max = max(1.0, m100.max())
    place_hm(
        bottom_inch = GAP + MB + N * CELL + MT,
        data        = m100,
        cmap        = "RdYlGn",
        vmin        = 0, vmax = m100_max,
        title       = "Score Probability (%)",
        xlabel      = f"Goals  {away_name}",
        ylabel      = f"Goals  {home_name}",
        fmt_fn      = lambda v: f"{v:.2f}%",
        col_fn      = lambda v: "white" if v < m100_max * 0.45 else "#111",
    )

    # ── heatmap inferior: expectativa de pontos
    e_max = max(1.0, E.max())
    e_min = E.min()
    place_hm(
        bottom_inch = 0,
        data        = E,
        cmap        = "RdYlGn",
        vmin        = e_min, vmax = e_max,
        title       = f"Expected Points (EV)  [phase factor = {fator:.1f}×]",
        xlabel      = f"Guess Goals  {away_name}",
        ylabel      = f"Guess Goals  {home_name}",
        fmt_fn      = lambda v: f"{v:.2f}",
        col_fn      = lambda v: "white" if v < (e_min + (e_max - e_min) * 0.45) else "#111",
    )

    os.makedirs(output_dir, exist_ok=True)
    safe_h = home_name.replace(" ", "_").replace("/", "-")
    safe_a = away_name.replace(" ", "_").replace("/", "-")
    fname  = f"{game_label}_{safe_h}_vs_{safe_a}.png"
    fpath  = os.path.join(output_dir, fname)
    fig.savefig(fpath, dpi=140, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    print(f"  {game_label:<10}  {home_name:<22} vs {away_name:<22}  "
          f"λ={la:.2f}/{lb:.2f}  W/D/L={p_hw:.0%}/{p_d:.0%}/{p_aw:.0%}  → {fname}")


# ─────────────────────────────────────────────────────────────────────────────
# FASE DE GRUPOS
# ─────────────────────────────────────────────────────────────────────────────
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

# ─────────────────────────────────────────────────────────────────────────────
# FASE ELIMINATÓRIA — edite os nomes quando os confrontos forem definidos
# Formato: "Home, Away"  ou  "Home, Away, gols_home, gols_away"
# Use "TBD" para adversários indefinidos (jogo será ignorado).
# ─────────────────────────────────────────────────────────────────────────────

R32_CONFRONTOS = [
    "South Africa, Canada",       # 28/06 - Los Angeles
    "Brazil, Japan",              # 29/06 - Houston
    "Germany, Paraguay",          # 29/06 - Boston
    "Netherlands, Morocco",       # 29/06 - Monterrey
    "Ivory Coast, Norway",        # 30/06 - Dallas
    "France, Sweden",             # 30/06 - Nova York
    "Mexico, Ecuador",            # 30/06 - Cidade do México
    "England, DR Congo",          # 01/07 - Atlanta
    "Belgium, Senegal",           # 01/07 - Seattle
    "United States, Bosnia",      # 01/07 - Santa Clara
    "Spain, Austria",             # 02/07 - Los Angeles
    "Portugal, Croatia",          # 02/07 - Toronto
    "Switzerland, Algeria",       # 03/07 - Vancouver
    "Australia, Egypt",           # 03/07 - Dallas
    "Argentina, Cape Verde",      # 03/07 - Miami
    "Colombia, Ghana",            # 03/07 - Kansas City
]

R16_CONFRONTOS = [   # Oitavas de final (8 jogos)
    "TBD, TBD",
    "TBD, TBD",
    "TBD, TBD",
    "TBD, TBD",
    "TBD, TBD",
    "TBD, TBD",
    "TBD, TBD",
    "TBD, TBD",
]

QF_CONFRONTOS = [    # Quartas de final (4 jogos)
    "TBD, TBD",
    "TBD, TBD",
    "TBD, TBD",
    "TBD, TBD",
]

SF_CONFRONTOS = [    # Semifinais (2 jogos)
    "TBD, TBD",
    "TBD, TBD",
]

FINAIS_CONFRONTOS = [  # linha 1 = Final, linha 2 = 3º Lugar
    "TBD, TBD",
    "TBD, TBD",
]


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def parse_confronto(line):
    """Retorna (home, away, resultado_ou_None). Retorna None se ambos TBD."""
    parts = [p.strip() for p in line.split(",") if p.strip()]
    if len(parts) < 2:
        return None
    ta, tb = parts[0], parts[1]
    resultado = None
    if len(parts) >= 4:
        try:
            resultado = (int(parts[2]), int(parts[3]))
        except ValueError:
            pass
    return ta, tb, resultado


def run_phase(confrontos, prefix, fase, k_factors, priors, out_dir, is_ko=False):
    skipped = 0
    for idx, line in enumerate(confrontos, 1):
        parsed = parse_confronto(line)
        if parsed is None:
            continue
        ta, tb, resultado = parsed
        if ta == "TBD" or tb == "TBD":
            skipped += 1
            continue
        label = f"{prefix}{idx:02d}"
        make_heatmap(label, ta, tb, k_factors, priors, fase,
                     out_dir, resultado=resultado, is_ko=is_ko)
    if skipped:
        print(f"  ({skipped} jogo(s) ignorado(s) por TBD)")


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main():
    kf_path     = os.path.join(RESULTS_DIR, "k_factors_final.json")
    priors_path = os.path.join(RESULTS_DIR, "prior_params.json")

    if not os.path.isfile(kf_path):
        raise FileNotFoundError(f"Não encontrado: {kf_path}")
    if not os.path.isfile(priors_path):
        raise FileNotFoundError(f"Não encontrado: {priors_path}")

    with open(kf_path,     "r", encoding="utf-8") as f: k_factors = json.load(f)
    with open(priors_path, "r", encoding="utf-8") as f: priors    = json.load(f)

    print("=" * 70)
    print("  Copa do Mundo 2026 — Heatmaps (todos os jogos)")
    print("=" * 70)
    print(f"  k_factors  : {kf_path}")
    print(f"  prior_params: {priors_path}")
    print(f"  Modo K     : {'flat (K=1)' if USE_FLAT_K else 'GRU (K_att/K_def)'}")
    print(f"  Output root: {OUTPUT_ROOT}")

    total = 0

    # ── FASE DE GRUPOS ──────────────────────────────────────────────────
    print("\n--- Fase de Grupos ---------------------------------------------------")
    out_grupos = os.path.join(OUTPUT_ROOT, "grupos")
    g_num = 0
    for grp, teams in OFFICIAL_GROUPS.items():
        for ta, tb in itertools.combinations(teams, 2):
            g_num += 1
            label = f"G{grp}{g_num:02d}"
            make_heatmap(label, ta, tb, k_factors, priors,
                         "grupos", out_grupos, is_ko=False)
            total += 1

    # -- 16-AVOS DE FINAL --------------------------------------------------
    print("\n--- 16-avos de Final ------------------------------------------------")
    out_r32 = os.path.join(OUTPUT_ROOT, "16avos")
    run_phase(R32_CONFRONTOS, "R32_", "16avos", k_factors, priors, out_r32, is_ko=True)
    total += sum(1 for l in R32_CONFRONTOS
                 if parse_confronto(l) and parse_confronto(l)[0] != "TBD" and parse_confronto(l)[1] != "TBD")

    # -- OITAVAS DE FINAL --------------------------------------------------
    print("\n--- Oitavas de Final ------------------------------------------------")
    out_r16 = os.path.join(OUTPUT_ROOT, "oitavas")
    run_phase(R16_CONFRONTOS, "R16_", "oitavas", k_factors, priors, out_r16, is_ko=True)

    # -- QUARTAS DE FINAL --------------------------------------------------
    print("\n--- Quartas de Final ------------------------------------------------")
    out_qf = os.path.join(OUTPUT_ROOT, "quartas")
    run_phase(QF_CONFRONTOS, "QF_", "quartas", k_factors, priors, out_qf, is_ko=True)

    # -- SEMIFINAIS --------------------------------------------------------
    print("\n--- Semifinais -------------------------------------------------------")
    out_sf = os.path.join(OUTPUT_ROOT, "semis")
    run_phase(SF_CONFRONTOS, "SF_", "semis", k_factors, priors, out_sf, is_ko=True)

    # -- FINAIS ------------------------------------------------------------
    print("\n--- Finais (Final & 3o Lugar) ----------------------------------------")
    out_fin = os.path.join(OUTPUT_ROOT, "finais")
    fases_finais = ["final", "terceiro"]
    labels_finais = ["Final", "3rd_Place"]
    for idx, (line, fase_key, lbl) in enumerate(zip(FINAIS_CONFRONTOS, fases_finais, labels_finais), 1):
        parsed = parse_confronto(line)
        if parsed is None:
            continue
        ta, tb, resultado = parsed
        if ta == "TBD" or tb == "TBD":
            print(f"  ({lbl} ignorado — TBD)")
            continue
        make_heatmap(lbl, ta, tb, k_factors, priors, fase_key,
                     out_fin, resultado=resultado, is_ko=True)
        total += 1

    print(f"\n{'=' * 70}")
    print(f"  Concluído! PNGs em {OUTPUT_ROOT}")
    print(f"{'=' * 70}")


if __name__ == "__main__":
    main()
