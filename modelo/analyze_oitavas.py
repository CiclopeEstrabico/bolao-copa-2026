# -*- coding: utf-8 -*-
"""
analyze_oitavas.py
=================
Script 6 — Copa 2026 Modelling Pipeline  (v2 — K-att / K-def)
Analisa os 8 jogos das oitavas de final com o modelo Dixon-Coles/GRU.

Chaveamento oficial das oitavas de final usando apenas os nomes em inglês.
Preencha a lista RAW_CONFRONTOS conforme os confrontos forem se definindo e os jogos acontecendo.
"""

import os, sys, json, pickle, zipfile, io
import numpy as np
import pandas as pd
from scipy.stats import poisson
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

# Fix encoding no Windows (PowerShell cp1252)
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# ─────────────────────────────────────────────────────────────────────
# PARÂMETROS & CONFIGURAÇÃO
# ─────────────────────────────────────────────────────────────────────
MAX_GOALS = 8
RHO_MAX   = 0.2
EPS_K     = 1e-2

USE_K_FACTORS = True  # Mude para False para ignorar Katt e Kdef (fixa em 1.0)

# Vantagem de sede: defina um valor (ex: 100) para sobrescrever o prior fitado.
# Se None ou 0, usa o valor de home_adv do prior_params.json.
HOME_ADV: float | None = None

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
RESULTS_DIR = os.path.join(SCRIPT_DIR, "results")
HEATMAP_DIR = os.path.join(RESULTS_DIR, "heatmaps_oitavas")
os.makedirs(RESULTS_DIR, exist_ok=True)
os.makedirs(HEATMAP_DIR, exist_ok=True)

HOSTS = {'United States', 'Mexico', 'Canada'}

# ─────────────────────────────────────────────────────────────────────
# LISTA DE JOGOS (NOMES EM INGLÊS)
# Formato aceito por linha:
#   "Time A, Time B"            -> Jogo aguardando resultado
#   "Time A, Time B, golsA, golsB" -> Jogo finalizado (ex: "Brazil, Japan, 2, 1")
# Use "TBD" para adversários ainda indefinidos.
# ─────────────────────────────────────────────────────────────────────
RAW_CONFRONTOS = [
    "TBD, TBD",
    "TBD, TBD",
    "TBD, TBD",
    "TBD, TBD",
    "TBD, TBD",
    "TBD, TBD",
    "TBD, TBD",
    "TBD, TBD",
]

# ─────────────────────────────────────────────────────────────────────
# CARREGAR PESOS E METADADOS
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
# GRU + DIXON COLES MODEL
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
    x = np.maximum(0.0, w['head.0.weight'] @ hidden + w['head.0.bias'])
    return w['head.3.weight'] @ x + w['head.3.bias']

def encode_team(seq, weights):
    hidden = gru_forward(seq,
                         weights['gru.weight_ih_l0'],
                         weights['gru.weight_hh_l0'],
                         weights['gru.bias_ih_l0'],
                         weights['gru.bias_hh_l0'])
    raw_k  = head_forward(hidden, weights)
    K_att  = float(softplus_np(raw_k[0])) + EPS_K
    K_def  = float(softplus_np(raw_k[1])) + EPS_K
    return K_att, K_def

def lambda_base(delta_eff_pts: float, p: dict) -> tuple:
    de = delta_eff_pts
    lh = float(np.exp(p['a'] + p['b'] * de + p['c'] * de ** 2))
    la = float(np.exp(p['a'] - p['b'] * de + p['c'] * de ** 2))
    return lh, la

def rho_from_delta(delta_eff_pts: float, p: dict) -> float:
    arg = p['rho0_raw'] - p['rho1_neg'] * abs(delta_eff_pts) / 400.0
    return float(RHO_MAX * np.tanh(arg))

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

def p_avanca_ko(M, la, lb):
    p_win_home = float(np.sum(np.tril(M, -1)))
    p_draw     = float(np.trace(M))
    p_win_away = float(np.sum(np.triu(M,  1)))
    p_pen_home = la / (la + lb)
    p_adv_home = p_win_home + p_draw * p_pen_home
    p_adv_away = p_win_away + p_draw * (1 - p_pen_home)
    return p_adv_home, p_adv_away

# ─────────────────────────────────────────────────────────────────────
# CÁLCULO EXPECTATIVA DE PONTOS
# ─────────────────────────────────────────────────────────────────────
def compute_expected_points(M, fase_key="oitavas"):
    fatores = {
        'grupos': 1.0,
        '16avos': 1.2,
        'oitavas': 1.4,
        'quartas': 1.6,
        'semis': 1.8,
        'terceiro': 1.8,
        'final': 2.0
    }
    fator = fatores.get(fase_key, 1.0)
    mg = M.shape[0]
    EV = np.zeros((mg, mg), dtype=np.float64)
    
    for Hp in range(mg):
        for Ap in range(mg):
            val_ev = 0.0
            for Hr in range(mg):
                for Ar in range(mg):
                    p_real = M[Hr, Ar]
                    if p_real < 1e-9:
                        continue
                    
                    pts = 0
                    res_ef = 1 if Hr > Ar else (-1 if Hr < Ar else 0)
                    res_pal = 1 if Hp > Ap else (-1 if Hp < Ap else 0)
                    
                    if res_pal == res_ef:
                        pts = 3 # base
                        if Hp == Hr and Ap == Ar:
                            gols = Hr + Ar
                            if gols >= 4:
                                pts += 5 # bonus_alto
                            else:
                                pts += 3 # bonus_baixo
                        elif abs(Hp - Ap) == abs(Hr - Ar):
                            pts += 1
                        elif Hp == Hr or Ap == Ar:
                            pts += 1
                            
                    val_ev += p_real * (pts * fator)
            EV[Hp, Ap] = val_ev
    return EV

# ─────────────────────────────────────────────────────────────────────
# PLOT DUAL HEATMAPS
# ─────────────────────────────────────────────────────────────────────
def save_heatmap(M, EV, ta, tb, match_id, filepath,
                 la, lb, rho, p_win_a, p_draw, p_win_b,
                 p_adv_home, p_adv_away,
                 k_att_a, k_def_a, k_att_b, k_def_b,
                 lb_a, lb_b, delta_elo, resultado=None):
    mg  = M.shape[0]
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(9, 15))

    # Subplot 1: Probabilidade do Placar
    im1 = ax1.imshow(M * 100, cmap='YlOrRd', aspect='auto',
                     vmin=0, vmax=max(1.0, float(M.max() * 100)))

    ax1.set_xticks(range(mg));  ax1.set_yticks(range(mg))
    ax1.set_xticklabels(range(mg), fontsize=10)
    ax1.set_yticklabels(range(mg), fontsize=10)
    ax1.set_xlabel(f'Goals  {tb}', fontsize=11, fontweight='bold')
    ax1.set_ylabel(f'Goals  {ta}', fontsize=11, fontweight='bold')

    max_prob_idx = np.unravel_index(np.argmax(M), M.shape)

    for i in range(mg):
        for j in range(mg):
            val   = M[i, j] * 100
            color = 'white' if val > M.max() * 100 * 0.55 else 'black'
            ax1.text(j, i, f'{val:.1f}%', ha='center', va='center',
                     fontsize=8, color=color, fontweight='bold')

    # Marca o resultado oficial (se disponível)
    if resultado is not None:
        rh, ra = resultado
        if 0 <= rh < mg and 0 <= ra < mg:
            ax1.add_patch(plt.Rectangle((ra - 0.5, rh - 0.5), 1, 1,
                                       fill=False, edgecolor='blue',
                                       linewidth=3, linestyle='-'))
            ax1.text(ra, rh, f'★ {rh}-{ra}', ha='center', va='center',
                     fontsize=9, color='blue', fontweight='bold')

    # Destaca o mais provável
    ax1.add_patch(plt.Rectangle((max_prob_idx[1] - 0.5, max_prob_idx[0] - 0.5), 1, 1,
                               fill=False, edgecolor='green',
                               linewidth=3, linestyle='-'))

    for k in range(mg):
        ax1.add_patch(plt.Rectangle((k - 0.5, k - 0.5), 1, 1,
                                   fill=False, edgecolor='royalblue',
                                   linewidth=1.5, linestyle='--'))

    cbar1 = fig.colorbar(im1, ax=ax1, shrink=0.7)
    cbar1.set_label('Probability (%)', fontsize=9)

    res_str = f"  [RESULTADO: {resultado[0]}-{resultado[1]}]" if resultado else ""
    ax1.set_title(
        f'{match_id}  |  {ta}  vs  {tb}{res_str}\n'
        f'Score Probability Distribution (%)\n'
        f'Most likely score: {max_prob_idx[0]}x{max_prob_idx[1]} ({M[max_prob_idx]*100:.1f}%)',
        fontsize=11, fontweight='bold', pad=8
    )

    # Subplot 2: Expectativa de Pontos (EV)
    im2 = ax2.imshow(EV, cmap='YlGn', aspect='auto',
                     vmin=0, vmax=max(1.0, float(EV.max())))

    ax2.set_xticks(range(mg));  ax2.set_yticks(range(mg))
    ax2.set_xticklabels(range(mg), fontsize=10)
    ax2.set_yticklabels(range(mg), fontsize=10)
    ax2.set_xlabel(f'Guess Goals  {tb}', fontsize=11, fontweight='bold')
    ax2.set_ylabel(f'Guess Goals  {ta}', fontsize=11, fontweight='bold')

    max_ev_idx = np.unravel_index(np.argmax(EV), EV.shape)

    for i in range(mg):
        for j in range(mg):
            val   = EV[i, j]
            color = 'white' if val > EV.max() * 0.55 else 'black'
            ax2.text(j, i, f'{val:.2f}', ha='center', va='center',
                     fontsize=8, color=color, fontweight='bold')

    # Destaca o melhor palpite matemático
    ax2.add_patch(plt.Rectangle((max_ev_idx[1] - 0.5, max_ev_idx[0] - 0.5), 1, 1,
                               fill=False, edgecolor='darkorange',
                               linewidth=3, linestyle='-'))

    for k in range(mg):
        ax2.add_patch(plt.Rectangle((k - 0.5, k - 0.5), 1, 1,
                                   fill=False, edgecolor='royalblue',
                                   linewidth=1.5, linestyle='--'))

    cbar2 = fig.colorbar(im2, ax=ax2, shrink=0.7)
    cbar2.set_label('Expected Points (EV)', fontsize=9)

    ax2.set_title(
        f'Expected Points per Guess (EV)\n'
        f'Best Mathematical Guess: {max_ev_idx[0]}x{max_ev_idx[1]} ({EV[max_ev_idx]:.2f} pts)',
        fontsize=11, fontweight='bold', pad=8
    )

    # Legendas
    k_str = (f'{ta}: K_att={k_att_a:.3f}, K_def={k_def_a:.3f}   '
             f'{tb}: K_att={k_att_b:.3f}, K_def={k_def_b:.3f}')
    model_str = (f'λ_A={la:.2f} (base={lb_a:.2f})  λ_B={lb:.2f} (base={lb_b:.2f})  '
                 f'ρ={rho:.3f}  ΔELO={delta_elo:+.0f}')
    fig.text(0.5, 0.05, k_str, ha='center', fontsize=9, color='#333333', fontweight='bold')
    fig.text(0.5, 0.035, model_str, ha='center', fontsize=9, color='#555555')

    footer = (f'P({ta} wins) = {p_win_a*100:.1f}%     '
              f'P(draw 90m) = {p_draw*100:.1f}%     '
              f'P({tb} wins) = {p_win_b*100:.1f}%\n'
              f'P(to advance) → {ta}: {p_adv_home*100:.1f}%   {tb}: {p_adv_away*100:.1f}%')
    fig.text(0.5, 0.01, footer, ha='center', fontsize=10,
             color='#111111', style='italic', fontweight='bold')

    plt.tight_layout(rect=[0, 0.07, 1, 1])
    plt.savefig(filepath, dpi=130, bbox_inches='tight')
    plt.close(fig)

# ─────────────────────────────────────────────────────────────────────
# MAIN EXECUTION
# ─────────────────────────────────────────────────────────────────────
def main():
    print("=" * 65)
    print("  analyze_oitavas.py — Copa 2026 Oitavas de Final  ")
    print("=" * 65)

    print("[1/4] Carregando artefatos...")
    with open(os.path.join(RESULTS_DIR, "copa2026_state.pkl"), "rb") as f:
        state = pickle.load(f)
    with open(os.path.join(RESULTS_DIR, "model_config.json"), "r") as f:
        config = json.load(f)
    with open(os.path.join(RESULTS_DIR, "prior_params.json"), "r") as f:
        priors = json.load(f)

    if HOME_ADV:
        priors['home_adv'] = float(HOME_ADV)
        print(f"    >> home_adv OVERRIDE: {HOME_ADV} (prior original: ignorado)")
    else:
        print(f"    >> home_adv (prior fitado): {priors['home_adv']:.1f}")

    weights = load_pt_weights(os.path.join(RESULTS_DIR, "model_best.pt"))
    print(f"    >> {len(weights)} tensores carregados")

    kf_path = os.path.join(RESULTS_DIR, "k_factors_final.json")
    if os.path.exists(kf_path):
        with open(kf_path, "r") as f:
            k_factors = json.load(f)
        print(f"    >> k_factors_final.json carregado ({len(k_factors)} times)")
    else:
        k_factors = {}
        print("    !! k_factors_final.json não encontrado — usando ELO do state.pkl")

    if config.get('FEAT_PER_GAME', 5) < 6:
        config['FEAT_PER_GAME'] = 6

    elos   = state['team_elos']
    forms  = state['team_forms']
    hosts  = set(state['hosts'])
    nd     = config['NORM_DELTA_ELO']
    ng     = config['NORM_GOALS']
    sl     = config['SEQ_LEN']
    ft     = config['FEAT_PER_GAME']

    print("[2/4] Calculando K_att / K_def para todos os times...")
    all_teams = list(elos.keys())
    team_K    = {}
    for t in all_teams:
        seq = pad_seq(forms.get(t, []), sl, ft, nd, ng)
        K_att, K_def = encode_team(seq, weights)
        if not USE_K_FACTORS:
            K_att, K_def = 1.0, 1.0
        team_K[t] = (K_att, K_def)

    def get_elo(team_en):
        if team_en in k_factors:
            return float(k_factors[team_en]['elo'])
        return float(elos.get(team_en, 1500))

    print("\n[3/4] Analisando 8 jogos das oitavas...")
    rows = []

    for idx, line in enumerate(RAW_CONFRONTOS, 1):
        parts = [p.strip() for p in line.split(',') if p.strip()]
        if len(parts) < 2:
            print(f"  [{idx:>2}/8] Linha inválida: {line}")
            continue
        
        ta = parts[0]
        tb = parts[1]
        
        resultado = None
        if len(parts) >= 4:
            try:
                resultado = (int(parts[2]), int(parts[3]))
            except ValueError:
                pass

        ta_known = ta in elos and ta != "TBD"
        tb_known = tb in elos and tb != "TBD"

        if not ta_known and not tb_known:
            print(f"  [{idx:>2}/8] R16_{idx}: {ta} vs {tb}  → Ambos TBD, pulando")
            continue

        if not ta_known:
            print(f"  [{idx:>2}/8] R16_{idx}: {ta} TBD — usando ELO/K padrão")
            elo_a = 1500.0
            K_att_a = K_def_a = 1.0
        else:
            elo_a   = get_elo(ta)
            K_att_a, K_def_a = team_K.get(ta, (1.0, 1.0))

        if not tb_known:
            print(f"  [{idx:>2}/8] R16_{idx}: {tb} TBD — usando ELO/K padrão")
            elo_b = 1500.0
            K_att_b = K_def_b = 1.0
        else:
            elo_b   = get_elo(tb)
            K_att_b, K_def_b = team_K.get(tb, (1.0, 1.0))

        d_raw = elo_a - elo_b
        if ta in hosts: d_raw += priors['home_adv']
        if tb in hosts: d_raw -= priors['home_adv']

        lb_home, lb_away = lambda_base(d_raw, priors)
        rho    = rho_from_delta(d_raw, priors)

        la = lb_home * K_att_a * K_def_b
        lb = lb_away * K_att_b * K_def_a

        M = score_matrix(la, lb, rho)
        p_win_a, p_draw, p_win_b = match_probs(M)
        p_adv_home, p_adv_away   = p_avanca_ko(M, la, lb)
        EV = compute_expected_points(M, "oitavas")

        score_probs = {}
        for x in range(MAX_GOALS):
            for y in range(MAX_GOALS):
                score_probs[f'P_{x}_{y}'] = round(float(M[x, y]) * 100, 3)

        row = {
            'id':              f"R16_{idx}",
            'home':            ta,
            'away':            tb,
            'elo_home':        round(elo_a, 1),
            'elo_away':        round(elo_b, 1),
            'delta_elo':       round(elo_a - elo_b, 1),
            'delta_eff':       round(d_raw, 1),
            'k_att_home':      round(K_att_a, 4),
            'k_def_home':      round(K_def_a, 4),
            'k_att_away':      round(K_att_b, 4),
            'k_def_away':      round(K_def_b, 4),
            'lambda_home':     round(la, 4),
            'lambda_away':     round(lb, 4),
            'rho':             round(rho, 4),
            'p_win_home':      round(p_win_a * 100, 2),
            'p_draw':          round(p_draw  * 100, 2),
            'p_win_away':      round(p_win_b * 100, 2),
            'p_avanca_home':   round(p_adv_home * 100, 2),
            'p_avanca_away':   round(p_adv_away * 100, 2),
            'resultado_home':  resultado[0] if resultado else None,
            'resultado_away':  resultado[1] if resultado else None,
        }
        row.update(score_probs)
        rows.append(row)

        status = f"  RESULT: {resultado[0]}-{resultado[1]}" if resultado else "  (TBD)"
        print(f"  [{idx:>2}/8] R16_{idx}  {ta} vs {tb}{status}")
        print(f"         lam={la:.2f} vs {lb:.2f}  "
              f"W={p_win_a*100:.0f}% D={p_draw*100:.0f}% L={p_win_b*100:.0f}%  "
              f"P(adv): {p_adv_home*100:.1f}% / {p_adv_away*100:.1f}%")

        # Heatmap
        safe_a = ta.replace(' ', '_').replace('/', '-')
        safe_b = tb.replace(' ', '_').replace('/', '-')
        fname  = f"R16_{idx}_{safe_a}_vs_{safe_b}.png"
        save_heatmap(M, EV, ta, tb, f"R16_{idx}",
                     os.path.join(HEATMAP_DIR, fname),
                     la, lb, rho,
                     p_win_a, p_draw, p_win_b,
                     p_adv_home, p_adv_away,
                     K_att_a, K_def_a, K_att_b, K_def_b,
                     lb_home, lb_away, elo_a - elo_b, resultado)

    print("\n[4/4] Salvando CSV...")
    df = pd.DataFrame(rows)
    if not df.empty:
        score_cols = [c for c in df.columns if c.startswith('P_')]
        main_cols  = [c for c in df.columns if not c.startswith('P_')]
        df = df[main_cols + sorted(score_cols, key=lambda c: (int(c.split('_')[1]), int(c.split('_')[2])))]
    out_csv = os.path.join(RESULTS_DIR, "oitavas_analysis.csv")
    df.to_csv(out_csv, index=False)
    print(f"    >> {out_csv}")

    if not df.empty:
        print("\n" + "=" * 72)
        print(f"  {'Jogo':<8}  {'Home':<18}  {'Away':<18}  "
              f"{'Win%':>5}  {'Drw%':>5}  {'Los%':>5}  {'Av.H%':>6}  {'Av.A%':>6}  Res")
        print("  " + "-" * 70)
        for _, r in df.iterrows():
            res_str = (f"{int(r['resultado_home'])}-{int(r['resultado_away'])}"
                       if r['resultado_home'] is not None and not (
                           isinstance(r['resultado_home'], float) and np.isnan(r['resultado_home']))
                       else "  TBD")
            print(f"  {r['id']:<8}  {r['home']:<18}  {r['away']:<18}  "
                  f"{r['p_win_home']:>5.1f}  {r['p_draw']:>5.1f}  {r['p_win_away']:>5.1f}  "
                  f"{r['p_avanca_home']:>6.1f}  {r['p_avanca_away']:>6.1f}  {res_str}")
        print("=" * 72)

if __name__ == "__main__":
    main()
