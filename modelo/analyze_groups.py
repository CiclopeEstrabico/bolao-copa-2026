"""
analyze_groups.py
=================
Script 4 — Copa 2026 Modelling Pipeline  (v2 — K-att / K-def)
Roda a rede uma vez para cada jogo da fase de grupos (72 jogos).
Gera CSV analítico rico e heatmaps de probabilidade de placar.

Mudanças v2:
  - Usa prior_params.json para calcular λ_base e rho (não outputs diretos da rede)
  - Exibe K_att e K_def de cada time no CSV e nos heatmaps
  - λ_home = λ_base * K_att(home) * K_def(away)
  - Colunas extras: k_att_a, k_def_a, k_att_b, k_def_b,
    lambda_base_a, lambda_base_b, rho
  - Seção de resumo por time ao final

Roda sem torch. Dependências: numpy, pandas, scipy, matplotlib.

Arquivos necessários:
  copa2026_state.pkl   <- build_dataset.py
  model_best.pt        <- train_model.py
  model_config.json    <- train_model.py
  prior_params.json    <- fit_priors.py
"""

import os, json, pickle, zipfile, io, itertools
import numpy as np
import pandas as pd
from scipy.stats import poisson
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

HOME_ADV  = 100
MAX_GOALS = 8
RHO_MAX   = 0.2
EPS_K     = 1e-2

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RESULTS_DIR = os.path.join(SCRIPT_DIR, "results")
HEATMAP_DIR = os.path.join(RESULTS_DIR, "heatmaps")
os.makedirs(RESULTS_DIR, exist_ok=True)
os.makedirs(HEATMAP_DIR, exist_ok=True)
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
HOSTS     = ['United States', 'Mexico', 'Canada']
# HEATMAP_DIR já definido acima


# ─────────────────────────────────────────────────────────────────────
# CARREGAR PESOS .pt → numpy
# ─────────────────────────────────────────────────────────────────────
def load_pt_weights(path: str) -> dict:
    try:
        import torch
        sd = torch.load(path, map_location='cpu', weights_only=True)
        return {k: v.numpy().astype(np.float32) for k, v in sd.items()}
    except ImportError:
        pass

    if not zipfile.is_zipfile(path):
        raise RuntimeError(f"{path}: não é um arquivo ZIP/PT válido.")

    with zipfile.ZipFile(path, 'r') as zf:
        names    = zf.namelist()
        pkl_name = next((n for n in names if n.endswith('.pkl')), None)
        if pkl_name is None:
            raise RuntimeError("Formato .pt sem .pkl interno.")
        with zf.open(pkl_name) as pf:
            raw_pkl = pf.read()
        data_blobs = {}
        for n in names:
            if '/data/' in n:
                with zf.open(n) as df_:
                    data_blobs[n.split('/')[-1]] = df_.read()

    import pickle as _pk

    dtype_map = {
        'FloatStorage':    np.float32,  'DoubleStorage':   np.float64,
        'HalfStorage':     np.float16,  'LongStorage':     np.int64,
        'IntStorage':      np.int32,    'ShortStorage':    np.int16,
        'ByteStorage':     np.uint8,    'BFloat16Storage': np.float32,
    }

    class FakeStorage:
        def __init__(self, blob_id, dtype):
            raw       = data_blobs.get(str(blob_id), b'')
            self._arr = np.frombuffer(raw, dtype=dtype).copy() if raw else np.array([], dtype=dtype)

    def rebuild_tensor(storage, offset, shape, stride, req_grad, hooks, *extra):
        if not isinstance(storage, FakeStorage) or storage._arr.size == 0:
            return np.zeros(shape if shape else (1,), dtype=np.float32)
        total = int(np.prod(shape)) if shape else 1
        try:
            return storage._arr[offset: offset + total].reshape(shape).astype(np.float32)
        except Exception:
            return np.zeros(shape if shape else (1,), dtype=np.float32)

    class PTUnpickler(_pk.Unpickler):
        def find_class(self, module, name):
            if module == 'torch._utils' and name == '_rebuild_tensor_v2':
                return rebuild_tensor
            if name in dtype_map and 'torch' in module:
                return dtype_map[name]
            if module == 'collections' and name == 'OrderedDict':
                from collections import OrderedDict
                return OrderedDict
            if module == '_codecs' and name == 'encode':
                return lambda s, enc: s.encode(enc)
            return super().find_class(module, name)

        def persistent_load(self, pid):
            if isinstance(pid, tuple) and len(pid) >= 3:
                dtype = dtype_map.get(getattr(pid[1], '__name__', ''), np.float32)
                return FakeStorage(pid[2], dtype)
            raise _pk.UnpicklingError(f"persistent_load não reconhecido: {pid}")

    result = PTUnpickler(io.BytesIO(raw_pkl)).load()
    return {k: v for k, v in result.items() if isinstance(v, np.ndarray)}


# ─────────────────────────────────────────────────────────────────────
# GRU + CABEÇA K-att/K-def em NumPy
# ─────────────────────────────────────────────────────────────────────
def _sigmoid(x):
    return 1.0 / (1.0 + np.exp(-np.clip(x, -30, 30)))


def softplus_np(x):
    return np.log1p(np.exp(np.clip(x, -20, 20)))


def gru_forward(seq, W_ih, W_hh, b_ih, b_hh):
    H = W_ih.shape[0] // 3
    h = np.zeros(H, dtype=np.float32)
    for t in range(seq.shape[0]):
        x_t = seq[t]
        gi  = W_ih @ x_t + b_ih
        gh  = W_hh @ h   + b_hh
        r   = _sigmoid(gi[:H]    + gh[:H])
        z   = _sigmoid(gi[H:2*H] + gh[H:2*H])
        n   = np.tanh(gi[2*H:]   + r * gh[2*H:])
        h   = (1 - z) * n + z * h
    return h


def head_forward(hidden, w):
    """(H,) → (2,) via head.0 (Linear+ReLU) e head.3 (Linear)"""
    x = np.maximum(0.0, w['head.0.weight'] @ hidden + w['head.0.bias'])
    return w['head.3.weight'] @ x + w['head.3.bias']


def encode_team(seq, weights):
    """Retorna K_att (float), K_def (float) para um time."""
    hidden = gru_forward(seq,
                         weights['gru.weight_ih_l0'],
                         weights['gru.weight_hh_l0'],
                         weights['gru.bias_ih_l0'],
                         weights['gru.bias_hh_l0'])
    raw_k  = head_forward(hidden, weights)
    K_att  = float(softplus_np(raw_k[0])) + EPS_K
    K_def  = float(softplus_np(raw_k[1])) + EPS_K
    return K_att, K_def


# ─────────────────────────────────────────────────────────────────────
# PRIORS
# ─────────────────────────────────────────────────────────────────────
def lambda_base(delta_eff_pts: float, p: dict) -> tuple:
    de   = delta_eff_pts
    lh   = float(np.exp(p['a'] + p['b'] * de + p['c'] * de ** 2))
    la   = float(np.exp(p['a'] - p['b'] * de + p['c'] * de ** 2))
    return lh, la


def rho_from_delta(delta_eff_pts: float, p: dict) -> float:
    arg = p['rho0_raw'] - p['rho1_neg'] * abs(delta_eff_pts) / 400.0
    return float(RHO_MAX * np.tanh(arg))


# ─────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────
def pad_seq(seq, sl, feat, nd, ng):
    arr = np.zeros((sl, feat), dtype=np.float32)
    n   = min(len(seq), sl)
    if n == 0:
        return arr
    s = sl - n
    for i, e in enumerate(seq[-n:]):
        arr[s+i, 0] = e['delta_elo']        / nd
        arr[s+i, 1] = e['goals_scored']     / ng
        arr[s+i, 2] = e['goals_conceded']   / ng
        arr[s+i, 3] = e['tournament_weight']
        arr[s+i, 4] = e['result']
        arr[s+i, 5] = e.get('decay_weight', 1.0)
    return arr


def dc_tau(x, y, la, lb, rho):
    if x == 0 and y == 0: return max(1e-6, 1 - la*lb*rho)
    if x == 1 and y == 0: return max(1e-6, 1 + la*rho)
    if x == 0 and y == 1: return max(1e-6, 1 + lb*rho)
    if x == 1 and y == 1: return max(1e-6, 1 - rho)
    return 1.0


def score_matrix(la, lb, rho, mg=MAX_GOALS):
    M = np.array(
        [[poisson.pmf(x, la) * poisson.pmf(y, lb) * dc_tau(x, y, la, lb, rho)
          for y in range(mg)] for x in range(mg)],
        dtype=np.float64
    )
    M = np.clip(M, 0, None)
    M /= M.sum()
    return M


def match_probs(M):
    p_win_a = float(np.sum(np.tril(M, -1)))
    p_draw  = float(np.trace(M))
    p_win_b = float(np.sum(np.triu(M,  1)))
    return p_win_a, p_draw, p_win_b


# ─────────────────────────────────────────────────────────────────────
# HEATMAP
# ─────────────────────────────────────────────────────────────────────
def save_heatmap(M, ta, tb, group, filepath, la, lb, rho,
                 p_win_a, p_draw, p_win_b,
                 k_att_a, k_def_a, k_att_b, k_def_b,
                 lb_a, lb_b, delta_elo):
    mg  = M.shape[0]
    fig, ax = plt.subplots(figsize=(9, 7.5))

    im = ax.imshow(M * 100, cmap='YlOrRd', aspect='auto',
                   vmin=0, vmax=max(1.0, float(M.max() * 100)))

    ax.set_xticks(range(mg));  ax.set_yticks(range(mg))
    ax.set_xticklabels(range(mg), fontsize=11)
    ax.set_yticklabels(range(mg), fontsize=11)
    ax.set_xlabel(f'Gols  {tb}', fontsize=12, fontweight='bold')
    ax.set_ylabel(f'Gols  {ta}', fontsize=12, fontweight='bold')

    for i in range(mg):
        for j in range(mg):
            val   = M[i, j] * 100
            color = 'white' if val > M.max() * 100 * 0.55 else 'black'
            ax.text(j, i, f'{val:.1f}%', ha='center', va='center',
                    fontsize=8, color=color, fontweight='bold')

    for k in range(mg):
        ax.add_patch(plt.Rectangle((k - 0.5, k - 0.5), 1, 1,
                                   fill=False, edgecolor='royalblue',
                                   linewidth=2, linestyle='--'))

    cbar = fig.colorbar(im, ax=ax, shrink=0.8)
    cbar.set_label('Probabilidade (%)', fontsize=10)

    ax.set_title(
        f'Grupo {group}  |  {ta}  vs  {tb}\n'
        f'$\\lambda_A$={la:.2f} (base={lb_a:.2f})  '
        f'$\\lambda_B$={lb:.2f} (base={lb_b:.2f})  '
        f'$\\rho$={rho:.3f}  $\\Delta$ELO={delta_elo:+.0f}',
        fontsize=11, fontweight='bold', pad=12
    )

    k_str = (f'{ta}: K_att={k_att_a:.3f}, K_def={k_def_a:.3f}   '
             f'{tb}: K_att={k_att_b:.3f}, K_def={k_def_b:.3f}')
    fig.text(0.5, 0.13, k_str, ha='center', fontsize=9, color='#444444')

    footer = (f'P({ta} vence) = {p_win_a*100:.1f}%     '
              f'P(empate) = {p_draw*100:.1f}%     '
              f'P({tb} vence) = {p_win_b*100:.1f}%')
    fig.text(0.5, 0.02, footer, ha='center', fontsize=10,
             color='#333333', style='italic')

    plt.tight_layout(rect=[0, 0.07, 1, 1])
    plt.savefig(filepath, dpi=130, bbox_inches='tight')
    plt.close(fig)


# ─────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────
def main():
    print("=" * 65)
    print("  analyze_groups.py — Copa 2026 Fase de Grupos (v2 K-att/K-def)  ")
    print("=" * 65)

    print("[1/5] Carregando artefatos...")
    with open(os.path.join(RESULTS_DIR, "copa2026_state.pkl"), "rb") as f:
        state = pickle.load(f)
    with open(os.path.join(RESULTS_DIR, "model_config.json"), "r") as f:
        config = json.load(f)
    with open(os.path.join(RESULTS_DIR, "prior_params.json"), "r") as f:
        priors = json.load(f)
    print("    Lendo pesos do modelo (.pt)...")
    weights = load_pt_weights(os.path.join(RESULTS_DIR, "model_best.pt"))
    print(f"    >> {len(weights)} tensores carregados")
    print(f"    >> Priors: a={priors['a']:.4f}  b={priors['b']:.6f}  "
          f"home_adv={priors['home_adv']:.1f}")

    if config.get('FEAT_PER_GAME', 5) < 6:
        print("    !! model_config antigo (FEAT_PER_GAME<6) — forçando 6")
        config['FEAT_PER_GAME'] = 6

    elos   = state['team_elos']
    forms  = state['team_forms']
    hosts  = state['hosts']
    nd     = config['NORM_DELTA_ELO']
    ng     = config['NORM_GOALS']
    sl     = config['SEQ_LEN']
    ft     = config['FEAT_PER_GAME']

    all_teams = [t for g in OFFICIAL_GROUPS.values() for t in g]

    # Pré-computa sequências e K-factors para todos os times
    print("[2/5] Calculando K_att / K_def para todos os times...")
    team_seqs = {}
    team_K    = {}   # {team: (K_att, K_def)}
    for t in all_teams:
        seq        = pad_seq(forms.get(t, []), sl, ft, nd, ng)
        team_seqs[t] = seq
        K_att, K_def = encode_team(seq, weights)
        team_K[t]  = (K_att, K_def)

    print(f"  {'Time':<30} {'ELO':>6}  {'K_att':>6}  {'K_def':>6}  {'jogos':>6}")
    print("  " + "-" * 58)
    for t in sorted(all_teams, key=lambda x: -team_K[x][0]):
        ka, kd = team_K[t]
        n_games = len(forms.get(t, []))
        h = " [H]" if t in hosts else ""
        print(f"  {t+h:<30} {elos.get(t,1500):>6.0f}  {ka:>6.4f}  {kd:>6.4f}  {n_games:>6}")

    os.makedirs(HEATMAP_DIR, exist_ok=True)

    print("\n[3/5] Analisando 72 jogos da fase de grupos...")
    rows     = []
    game_num = 0

    for group, teams in OFFICIAL_GROUPS.items():
        for i, j in itertools.combinations(range(len(teams)), 2):
            ta, tb   = teams[i], teams[j]
            game_num += 1

            elo_a = elos.get(ta, 1500)
            elo_b = elos.get(tb, 1500)
            d_raw = elo_a - elo_b
            if ta in hosts: d_raw += priors['home_adv']
            if tb in hosts: d_raw -= priors['home_adv']

            # Lambda base dos priors
            lb_home, lb_away = lambda_base(d_raw, priors)
            rho = rho_from_delta(d_raw, priors)

            # K-factors da rede
            K_att_a, K_def_a = team_K[ta]
            K_att_b, K_def_b = team_K[tb]

            # Lambdas finais
            la = lb_home * K_att_a * K_def_b
            lb = lb_away * K_att_b * K_def_a

            M = score_matrix(la, lb, rho)
            p_win_a, p_draw, p_win_b = match_probs(M)

            score_probs = {}
            for x in range(MAX_GOALS):
                for y in range(MAX_GOALS):
                    score_probs[f'P_{x}_{y}'] = round(float(M[x, y]) * 100, 3)

            delta_raw_pure = elos.get(ta, 1500) - elos.get(tb, 1500)
            row = {
                'group':          group,
                'game':           game_num,
                'team_a':         ta,
                'team_b':         tb,
                'elo_a':          round(elo_a, 1),
                'elo_b':          round(elo_b, 1),
                'delta_elo':      round(delta_raw_pure, 1),
                'delta_eff':      round(d_raw, 1),
                'k_att_a':        round(K_att_a, 4),
                'k_def_a':        round(K_def_a, 4),
                'k_att_b':        round(K_att_b, 4),
                'k_def_b':        round(K_def_b, 4),
                'lambda_base_a':  round(lb_home, 4),
                'lambda_base_b':  round(lb_away, 4),
                'lambda_a':       round(la, 4),
                'lambda_b':       round(lb, 4),
                'rho':            round(rho, 4),
                'p_win_a':        round(p_win_a * 100, 2),
                'p_draw':         round(p_draw  * 100, 2),
                'p_win_b':        round(p_win_b * 100, 2),
                'expected_goals_a': round(la, 3),
                'expected_goals_b': round(lb, 3),
            }
            row.update(score_probs)
            rows.append(row)

            # Heatmap
            safe_a = ta.replace(' ', '_').replace('/', '-')
            safe_b = tb.replace(' ', '_').replace('/', '-')
            fname  = f"Grupo_{group}_{safe_a}_vs_{safe_b}.png"
            save_heatmap(M, ta, tb, group,
                         os.path.join(HEATMAP_DIR, fname),
                         la, lb, rho,
                         p_win_a, p_draw, p_win_b,
                         K_att_a, K_def_a, K_att_b, K_def_b,
                         lb_home, lb_away, delta_raw_pure)

            print(f"  [{game_num:>2}/72] Grupo {group}: {ta:<28} vs {tb:<28}  "
                  f"LA={la:.2f}(base={lb_home:.2f},K={K_att_a:.2f})  "
                  f"LB={lb:.2f}(base={lb_away:.2f},K={K_att_b:.2f})  "
                  f"W={p_win_a*100:.0f}% D={p_draw*100:.0f}% L={p_win_b*100:.0f}%")

    print("\n[4/5] Salvando CSV...")
    df = pd.DataFrame(rows)
    score_cols = [c for c in df.columns if c.startswith('P_')]
    main_cols  = [c for c in df.columns if not c.startswith('P_')]
    df = df[main_cols + sorted(score_cols, key=lambda c: (int(c.split('_')[1]), int(c.split('_')[2])))]
    df.to_csv(os.path.join(RESULTS_DIR, "group_stage_analysis.csv"), index=False)
    print("    >> group_stage_analysis.csv")

    # Resumo por time (agregando como time A nos seus jogos)
    print("\n[5/5] Resumo por time (média dos seus 3 jogos de grupo):")
    team_summary = []
    for t in all_teams:
        games_a = df[df['team_a'] == t]
        games_b = df[df['team_b'] == t]
        xg_for  = list(games_a['lambda_a']) + list(games_b['lambda_b'])
        xg_ag   = list(games_a['lambda_b']) + list(games_b['lambda_a'])
        pw      = list(games_a['p_win_a']) + list(games_b['p_win_b'])
        ka, kd  = team_K[t]
        team_summary.append({
            'team':      t,
            'group':     next(g for g, ts in OFFICIAL_GROUPS.items() if t in ts),
            'elo':       round(elos.get(t, 1500), 1),
            'K_att':     round(ka, 4),
            'K_def':     round(kd, 4),
            'xg_for_avg':  round(np.mean(xg_for), 3) if xg_for else 0.0,
            'xg_ag_avg':   round(np.mean(xg_ag),  3) if xg_ag  else 0.0,
            'win_pct_avg': round(np.mean(pw),       1) if pw     else 0.0,
        })

    df_ts = pd.DataFrame(team_summary).sort_values('win_pct_avg', ascending=False)
    df_ts.to_csv(os.path.join(RESULTS_DIR, "team_summary_analysis.csv"), index=False)
    print("    >> team_summary_analysis.csv")
    print(f"\n  {'Time':<30} {'Gr':>3}  {'ELO':>6}  {'K_att':>6}  {'K_def':>6}  "
          f"{'xG_for':>7}  {'xG_ag':>7}  {'Win%':>5}")
    print("  " + "-" * 80)
    for _, r in df_ts.iterrows():
        print(f"  {r['team']:<30} {r['group']:>3}  {r['elo']:>6.0f}  "
              f"{r['K_att']:>6.4f}  {r['K_def']:>6.4f}  "
              f"{r['xg_for_avg']:>7.3f}  {r['xg_ag_avg']:>7.3f}  "
              f"{r['win_pct_avg']:>5.1f}%")

    print(f"\n=== Concluído ===")
    print(f"  group_stage_analysis.csv   ({len(rows)} jogos × {len(df.columns)} colunas)")
    print(f"  team_summary_analysis.csv  ({len(team_summary)} times)")
    print(f"  heatmaps/  ({len(rows)} arquivos PNG)")


if __name__ == "__main__":
    main()
