"""
simulate_copa.py
================
Script 3 — Copa 2026 Modelling Pipeline  (v2 — K-att / K-def)
Monte Carlo de N Copas usando pesos GRU em NumPy puro.
Roda no Pydroid SEM torch. Dependências: numpy, pandas.

Arquitetura v2:
  GRU compartilhada → [k_att_raw, k_def_raw] por time
  K_att = softplus(k_att_raw) + EPS_K
  K_def = softplus(k_def_raw) + EPS_K

  λ_home = λ_base(delta_eff) * K_att(home) * K_def(away)
  λ_away = λ_base(delta_eff) * K_att(away) * K_def(home)
  rho    = rho(delta_eff)   — tudo vindo de prior_params.json

CSV de saída enriquecido:
  ELO, K_att, K_def, lambda_mean_home, lambda_mean_away por time
  + probabilidades de cada fase

Arquivos necessários:
  copa2026_state.pkl   <- build_dataset.py
  model_best.pt        <- train_model.py
  model_config.json    <- train_model.py
  prior_params.json    <- fit_priors.py
"""

import os, json, math, pickle, zipfile, io, time
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap

# ─────────────────────────────────────────────────────────────────────
# PARÂMETROS
# ─────────────────────────────────────────────────────────────────────
N_SIMULATIONS = 10_000
CONFIDENCE_Z  = 1.96
MAX_GOALS     = 9       # placares 0..8
import os
SCRIPT_DIR    = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR    = os.path.join(SCRIPT_DIR, "results")
os.makedirs(OUTPUT_DIR, exist_ok=True)
RHO_MAX       = 0.2
EPS_K         = 1e-2

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

_LOG_FACT = np.array([math.lgamma(k + 1) for k in range(MAX_GOALS)], dtype=np.float64)


# ─────────────────────────────────────────────────────────────────────
# CARREGAR PESOS .pt → numpy (sem torch)
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
        'FloatStorage': np.float32, 'DoubleStorage': np.float64,
        'HalfStorage':  np.float16, 'LongStorage':   np.int64,
        'IntStorage':   np.int32,   'ShortStorage':  np.int16,
        'ByteStorage':  np.uint8,   'BFloat16Storage': np.float32,
    }

    class FakeStorage:
        def __init__(self, blob_id, dtype):
            raw = data_blobs.get(str(blob_id), b'')
            self._arr = np.frombuffer(raw, dtype=dtype).copy() if raw else np.array([], dtype=dtype)

    def rebuild_tensor(storage, offset, shape, stride, req_grad, hooks, *extra):
        if not isinstance(storage, FakeStorage) or storage._arr.size == 0:
            return np.zeros(shape or (1,), dtype=np.float32)
        total = int(np.prod(shape)) if shape else 1
        try:
            return storage._arr[offset: offset + total].reshape(shape).astype(np.float32)
        except Exception:
            return np.zeros(shape or (1,), dtype=np.float32)

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
# PRIORS — lambda base e rho em NumPy
# ─────────────────────────────────────────────────────────────────────
def lambda_base_np(delta_eff_pts: np.ndarray, p: dict) -> tuple:
    """delta_eff_pts em pontos ELO (não normalizado)."""
    de = delta_eff_pts
    lam_h = np.exp(p['a'] + p['b'] * de + p['c'] * de ** 2)
    lam_a = np.exp(p['a'] - p['b'] * de + p['c'] * de ** 2)
    return lam_h, lam_a


def rho_from_delta_np(delta_eff_pts: np.ndarray, p: dict) -> np.ndarray:
    arg = p['rho0_raw'] - p['rho1_neg'] * np.abs(delta_eff_pts) / 400.0
    return RHO_MAX * np.tanh(arg)


# ─────────────────────────────────────────────────────────────────────
# GRU BATCH em NumPy — arquitetura v2
# seq_batch: (B, T, F)  →  raw_k: (B, 2)
# ─────────────────────────────────────────────────────────────────────
def _sigmoid(x):
    return 1.0 / (1.0 + np.exp(-np.clip(x, -30, 30)))


def softplus_np(x):
    return np.log1p(np.exp(np.clip(x, -20, 20)))


def gru_forward_batch(seq_batch, W_ih, W_hh, b_ih, b_hh):
    """
    seq_batch : (B, T, F)
    Retorna   : (B, H) — hidden state do último timestep
    """
    B, T, _ = seq_batch.shape
    H = W_ih.shape[0] // 3
    h = np.zeros((B, H), dtype=np.float32)

    for t in range(T):
        x_t = seq_batch[:, t, :]            # (B, F)
        gi  = x_t @ W_ih.T + b_ih          # (B, 3H)
        gh  = h   @ W_hh.T + b_hh          # (B, 3H)
        r   = _sigmoid(gi[:, :H]     + gh[:, :H])
        z   = _sigmoid(gi[:, H:2*H] + gh[:, H:2*H])
        n   = np.tanh(gi[:, 2*H:]   + r * gh[:, 2*H:])
        h   = (1 - z) * n + z * h

    return h  # (B, H)


def head_forward_batch(hidden, w):
    """
    Cabeça linear: (B, H) → (B, 2)
    Mapeamento de chaves: head.0 = Linear(H,32) ReLU, head.3 = Linear(32,2)
    """
    # Camada 0: Linear + ReLU
    x = np.maximum(0.0, hidden @ w['head.0.weight'].T + w['head.0.bias'])
    # Camada 3: Linear (saída)
    return x @ w['head.3.weight'].T + w['head.3.bias']   # (B, 2)


def encode_teams_batch(seq_batch, weights):
    """
    seq_batch: (B, T, F)
    Retorna K_att (B,), K_def (B,)
    """
    hidden  = gru_forward_batch(
        seq_batch,
        weights['gru.weight_ih_l0'],
        weights['gru.weight_hh_l0'],
        weights['gru.bias_ih_l0'],
        weights['gru.bias_hh_l0'],
    )
    raw_k   = head_forward_batch(hidden, weights)  # (B, 2)
    K_att   = softplus_np(raw_k[:, 0]) + EPS_K
    K_def   = softplus_np(raw_k[:, 1]) + EPS_K
    return K_att, K_def


# ─────────────────────────────────────────────────────────────────────
# PAD SEQUÊNCIA
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


# ─────────────────────────────────────────────────────────────────────
# MATRIZ DE PLACARES
# ─────────────────────────────────────────────────────────────────────
def build_score_matrix(la: float, lb: float, rho: float) -> np.ndarray:
    k    = np.arange(MAX_GOALS, dtype=np.float64)
    lp_a = k * math.log(max(la, 1e-9)) - la - _LOG_FACT
    lp_b = k * math.log(max(lb, 1e-9)) - lb - _LOG_FACT
    M    = np.exp(lp_a[:, None] + lp_b[None, :])
    M[0, 0] *= max(1e-9, 1 - la * lb * rho)
    M[1, 0] *= max(1e-9, 1 + la * rho)
    M[0, 1] *= max(1e-9, 1 + lb * rho)
    M[1, 1] *= max(1e-9, 1 - rho)
    M  = np.clip(M, 0, None)
    M /= M.sum()
    return M


# ─────────────────────────────────────────────────────────────────────
# MOTOR DE SIMULAÇÃO
# ─────────────────────────────────────────────────────────────────────
class CopaSim:
    def __init__(self, state, weights, config, priors):
        self.groups  = state['copa_groups']
        self.hosts   = set(state['hosts'])
        self.w       = weights
        self.p       = priors
        self.nd      = config['NORM_DELTA_ELO']
        self.ng      = config['NORM_GOALS']
        self.sl      = config['SEQ_LEN']
        self.ft      = config['FEAT_PER_GAME']

        # Lista ordenada de times — índice = ID global
        self.teams   = [t for g in self.groups.values() for t in g]
        self.t2i     = {t: i for i, t in enumerate(self.teams)}
        self.n_teams = len(self.teams)

        elos          = state['team_elos']
        self.elo      = np.array([elos.get(t, 1500) for t in self.teams], dtype=np.float64)
        self.is_host  = np.array([t in self.hosts  for t in self.teams], dtype=np.float64)

        self.group_keys = list(self.groups.keys())
        self.group_idx  = [
            np.array([self.t2i[t] for t in self.groups[g]], dtype=np.int32)
            for g in self.group_keys
        ]

        # ── GRU em batch para todos os 48 times ──
        print("    >> Rodando GRU em batch para todos os times...")
        seq_batch = np.stack([
            pad_seq(state['team_forms'].get(t, []), self.sl, self.ft, self.nd, self.ng)
            for t in self.teams
        ])  # (48, T, F)
        self.K_att, self.K_def = encode_teams_batch(seq_batch, weights)  # (48,), (48,)

        print(f"    >> K_att: min={self.K_att.min():.3f}  max={self.K_att.max():.3f}  "
              f"mean={self.K_att.mean():.3f}")
        print(f"    >> K_def: min={self.K_def.min():.3f}  max={self.K_def.max():.3f}  "
              f"mean={self.K_def.mean():.3f}")

        # ── Lambdas para todos os pares (N×N) ──
        print("    >> Pré-computando lambda para todos os pares...")
        self._precompute_all_lambdas()

        # ── Matrizes de placar ──
        print("    >> Pré-computando matrizes de placar...")
        self._precompute_score_matrices()

    def _precompute_all_lambdas(self):
        N        = self.n_teams
        home_adv = self.p['home_adv']

        # Para cada par (i=mandante, j=visitante):
        # delta_eff = elo_i - elo_j + home_adv * is_host_i - home_adv * is_host_j
        elo_i    = np.repeat(self.elo,     N)
        elo_j    = np.tile(self.elo,       N)
        host_i   = np.repeat(self.is_host, N)
        host_j   = np.tile(self.is_host,   N)
        K_att_i  = np.repeat(self.K_att,   N)
        K_def_i  = np.repeat(self.K_def,   N)
        K_att_j  = np.tile(self.K_att,     N)
        K_def_j  = np.tile(self.K_def,     N)

        delta_eff = elo_i - elo_j + home_adv * host_i - home_adv * host_j  # (N*N,)

        lam_base_h, lam_base_a = lambda_base_np(delta_eff, self.p)
        rho = rho_from_delta_np(delta_eff, self.p)

        # λ_home = λ_base_home * K_att(home) * K_def(away)
        lam_h = lam_base_h * K_att_i * K_def_j
        lam_a = lam_base_a * K_att_j * K_def_i

        self.lam_A = lam_h.reshape(N, N)
        self.lam_B = lam_a.reshape(N, N)
        self.rho   = rho.reshape(N, N)

    def _precompute_score_matrices(self):
        N       = self.n_teams
        n_cells = MAX_GOALS * MAX_GOALS
        self.flat_p = np.zeros((N, N, n_cells), dtype=np.float64)
        for i in range(N):
            for j in range(N):
                if i == j:
                    continue
                M = build_score_matrix(
                    float(self.lam_A[i, j]),
                    float(self.lam_B[i, j]),
                    float(self.rho[i, j])
                )
                self.flat_p[i, j] = M.flatten()

    def _sim_n(self, i, j, n):
        idx = np.random.choice(MAX_GOALS * MAX_GOALS, size=n, p=self.flat_p[i, j])
        return idx // MAX_GOALS, idx % MAX_GOALS

    def _ko_n(self, i, j, n):
        """True = time i vence."""
        ga, gb = self._sim_n(i, j, n)
        tied   = ga == gb
        p_i    = float(self.lam_A[i, j]) / (float(self.lam_A[i, j]) + float(self.lam_B[i, j]))
        pen    = np.random.random(n) < p_i
        return np.where(tied, pen, ga > gb)

    def _sim_groups_vectorized(self, n):
        group_rank = []
        group_pts  = []
        pairs_6    = [(0,1),(0,2),(0,3),(1,2),(1,3),(2,3)]

        for gidx in self.group_idx:
            nteams  = len(gidx)
            pts     = np.zeros((n, nteams), dtype=np.int32)
            gf      = np.zeros((n, nteams), dtype=np.int32)
            gd      = np.zeros((n, nteams), dtype=np.int32)
            h2h_pts = np.zeros((n, nteams, nteams), dtype=np.int32)
            h2h_gd  = np.zeros((n, nteams, nteams), dtype=np.int32)

            for m, k_ in pairs_6:
                ti = int(gidx[m]); tj = int(gidx[k_])
                ga, gb = self._sim_n(ti, tj, n)
                gf[:, m]  += ga;  gf[:, k_] += gb
                gd[:, m]  += ga - gb; gd[:, k_] -= ga - gb
                win_i = ga > gb; draw = ga == gb; win_j = gb > ga
                pts[:, m]  += 3 * win_i + draw
                pts[:, k_] += 3 * win_j + draw
                h2h_pts[:, m,  k_] += 3 * win_i + draw
                h2h_pts[:, k_, m]  += 3 * win_j + draw
                h2h_gd[:, m,  k_]  += ga - gb
                h2h_gd[:, k_, m]   -= ga - gb

            h2h_pts_sum = h2h_pts.sum(axis=2)
            h2h_gd_sum  = h2h_gd.sum(axis=2)
            rand_noise  = np.random.random((n, nteams)) * 1e-4

            score = (pts          * 1e9
                     + h2h_pts_sum * 1e6
                     + h2h_gd_sum  * 1e3
                     + gd          * 10
                     + gf
                     + rand_noise)

            rank = np.argsort(-score, axis=1)
            group_rank.append(rank)
            group_pts.append(pts)

        return group_rank, group_pts

    def _play_round(self, pairs_arr):
        n_, K, _ = pairs_arr.shape
        winners  = np.zeros((n_, K), dtype=np.int32)
        for k in range(K):
            ti_arr = pairs_arr[:, k, 0]
            tj_arr = pairs_arr[:, k, 1]
            unique_pairs, inv = np.unique(
                np.stack([ti_arr, tj_arr], axis=1), axis=0, return_inverse=True
            )
            result = np.zeros(n_, dtype=bool)
            for up_idx, (ui, uj) in enumerate(unique_pairs):
                mask = inv == up_idx
                cnt  = int(mask.sum())
                if cnt == 0:
                    continue
                result[mask] = self._ko_n(int(ui), int(uj), cnt)
            winners[:, k] = np.where(result, ti_arr, tj_arr)
        return winners

    def run(self, n=N_SIMULATIONS):
        N = self.n_teams
        C = {k: np.zeros(N, dtype=np.int32)
             for k in ('groups', 'r32', 'r16', 'qf', 'sf', 'final', 'title')}

        print(f"[3/4] Simulando {n:,} Copas (vetorizado)...")
        t0 = time.time()

        group_rank, group_pts = self._sim_groups_vectorized(n)

        group_global = []
        for rank, gidx in zip(group_rank, self.group_idx):
            group_global.append(gidx[rank])

        for g_i in range(12):
            for pos in range(3):
                np.add.at(C['groups'], group_global[g_i][:, pos], 1)

        thirds_team  = np.stack([group_global[g][:, 2] for g in range(12)], axis=1)
        thirds_pts   = np.stack([
            group_pts[g][np.arange(n), group_rank[g][:, 2]] for g in range(12)
        ], axis=1)
        thirds_noise = np.random.random((n, 12)) * 1e-4
        thirds_order = np.argsort(-(thirds_pts + thirds_noise), axis=1)[:, :8]
        best8        = thirds_team[np.arange(n)[:, None], thirds_order]

        def first(g):  return group_global[g][:, 0]
        def second(g): return group_global[g][:, 1]

        bracket_pairs = np.stack([
            np.stack([second(0), second(1)],  axis=1), # Jogo 73: 2A x 2B
            np.stack([first(4),  best8[:,0]], axis=1), # Jogo 74: 1E x 3X1
            np.stack([first(5),  second(2)],  axis=1), # Jogo 75: 1F x 2C
            np.stack([first(2),  second(5)],  axis=1), # Jogo 76: 1C x 2F
            np.stack([first(8),  best8[:,1]], axis=1), # Jogo 77: 1I x 3X2
            np.stack([second(4), second(8)],  axis=1), # Jogo 78: 2E x 2I
            np.stack([first(0),  best8[:,2]], axis=1), # Jogo 79: 1A x 3X3
            np.stack([first(11), best8[:,3]], axis=1), # Jogo 80: 1L x 3X4
            np.stack([first(3),  best8[:,4]], axis=1), # Jogo 81: 1D x 3X5
            np.stack([first(6),  best8[:,5]], axis=1), # Jogo 82: 1G x 3X6
            np.stack([second(10),second(11)], axis=1), # Jogo 83: 2K x 2L
            np.stack([first(7),  second(9)],  axis=1), # Jogo 84: 1H x 2J
            np.stack([first(1),  best8[:,6]], axis=1), # Jogo 85: 1B x 3X7
            np.stack([first(9),  second(7)],  axis=1), # Jogo 86: 1J x 2H
            np.stack([first(10), best8[:,7]], axis=1), # Jogo 87: 1K x 3X8
            np.stack([second(3), second(6)],  axis=1), # Jogo 88: 2D x 2G
        ], axis=1)

        for k in range(16):
            np.add.at(C['r32'], bracket_pairs[:, k, 0], 1)
            np.add.at(C['r32'], bracket_pairs[:, k, 1], 1)

        r16 = self._play_round(bracket_pairs)
        for k in range(16): np.add.at(C['r16'], r16[:, k], 1)

        r16_pairs = np.stack([
            np.stack([r16[:, 1], r16[:, 4]], axis=1), # Jogo 89: W74 x W77
            np.stack([r16[:, 0], r16[:, 2]], axis=1), # Jogo 90: W73 x W75
            np.stack([r16[:, 3], r16[:, 5]], axis=1), # Jogo 91: W76 x W78
            np.stack([r16[:, 6], r16[:, 7]], axis=1), # Jogo 92: W79 x W80
            np.stack([r16[:, 10],r16[:, 11]],axis=1), # Jogo 93: W83 x W84
            np.stack([r16[:, 8], r16[:, 9]], axis=1), # Jogo 94: W81 x W82
            np.stack([r16[:, 13],r16[:, 15]],axis=1), # Jogo 95: W86 x W88
            np.stack([r16[:, 12],r16[:, 14]],axis=1), # Jogo 96: W85 x W87
        ], axis=1)

        qf = self._play_round(r16_pairs)
        for k in range(8): np.add.at(C['qf'], qf[:, k], 1)

        qf_pairs = np.stack([
            np.stack([qf[:, 0], qf[:, 1]], axis=1), # Jogo 97: W89 x W90
            np.stack([qf[:, 4], qf[:, 5]], axis=1), # Jogo 98: W93 x W94
            np.stack([qf[:, 2], qf[:, 3]], axis=1), # Jogo 99: W91 x W92
            np.stack([qf[:, 6], qf[:, 7]], axis=1), # Jogo 100:W95 x W96
        ], axis=1)

        sf = self._play_round(qf_pairs)
        for k in range(4): np.add.at(C['sf'], sf[:, k], 1)

        sf_pairs = np.stack([
            np.stack([sf[:, 0], sf[:, 1]], axis=1), # Jogo 101: W97 x W98
            np.stack([sf[:, 2], sf[:, 3]], axis=1), # Jogo 102: W99 x W100
        ], axis=1)

        final = self._play_round(sf_pairs)
        for k in range(2): np.add.at(C['final'], final[:, k], 1)

        final_pairs = np.stack([
            np.stack([final[:, 0], final[:, 1]], axis=1) # Jogo 104
        ], axis=1)

        champ = self._play_round(final_pairs)[:, 0]
        np.add.at(C['title'], champ, 1)

        elapsed = time.time() - t0
        print(f"    >> Concluído em {elapsed:.1f}s  ({elapsed/n*1000:.1f}ms/simulação)")

        return {k: {self.teams[i]: int(v) for i, v in enumerate(arr)}
                for k, arr in C.items()}

    def get_team_stats(self) -> dict:
        """
        Retorna dict com ELO, K_att, K_def e lambdas médios por time.
        lambda_mean_home e lambda_mean_away = média dos jogos de grupo
        para dar uma referência interpretável.
        """
        stats = {}
        home_adv = self.p['home_adv']
        for i, team in enumerate(self.teams):
            # lambda médio contra um oponente "médio" (delta_eff = home_adv se é sede)
            adv = home_adv if team in self.hosts else 0.0
            de  = adv  # vs oponente com mesmo ELO
            lh, la = lambda_base_np(np.array([de]), self.p)
            lh_f = float(lh[0]) * float(self.K_att[i])   # K_def do oponente médio = 1
            la_f = float(la[0]) * float(self.K_def[i])   # como atacante em viagem
            stats[team] = {
                'elo':              round(float(self.elo[i]), 1),
                'K_att':            round(float(self.K_att[i]), 4),
                'K_def':            round(float(self.K_def[i]), 4),
                'lambda_atk_ref':   round(lh_f, 4),   # gols esperados marcando vs par de mesmo ELO
                'lambda_def_ref':   round(la_f, 4),   # gols concedidos em viagem vs par
            }
        return stats


# ─────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("  simulate_copa.py — Copa 2026 v2 (K-att/K-def)  ")
    print("=" * 60)

    print("[1/4] Carregando artefatos...")
    with open(os.path.join(OUTPUT_DIR, "copa2026_state.pkl"), "rb") as f:
        state = pickle.load(f)
    with open(os.path.join(OUTPUT_DIR, "model_config.json"), "r") as f:
        config = json.load(f)
    with open(os.path.join(OUTPUT_DIR, "prior_params.json"), "r") as f:
        priors = json.load(f)
    print("    Lendo pesos do modelo (.pt)...")
    weights = load_pt_weights(os.path.join(OUTPUT_DIR, "model_best.pt"))
    print(f"    >> {len(weights)} tensores carregados")
    print(f"    >> Priors: a={priors['a']:.4f}  b={priors['b']:.6f}  "
          f"home_adv={priors['home_adv']:.1f}")

    # Garante retrocompatibilidade: se o config não tem FEAT_PER_GAME=6, injeta
    if config.get('FEAT_PER_GAME', 5) < 6:
        print("    !! model_config antigo (FEAT_PER_GAME<6) — forçando 6")
        config['FEAT_PER_GAME'] = 6

    print("[2/4] Pré-computando...")
    sim = CopaSim(state, weights, config, priors)

    C = sim.run(N_SIMULATIONS)

    print("[4/4] Exportando...")
    all_teams = [t for g in OFFICIAL_GROUPS.values() for t in g]
    team_stats = sim.get_team_stats()

    rows = []
    for team in all_teams:
        p      = C['title'].get(team, 0) / N_SIMULATIONS
        e      = CONFIDENCE_Z * math.sqrt(p * (1 - p) / N_SIMULATIONS)
        st     = team_stats[team]
        group  = next(g for g, ts in OFFICIAL_GROUPS.items() if team in ts)
        rows.append({
            'Team':            team,
            'Group':           group,
            'ELO':             st['elo'],
            'K_att':           st['K_att'],
            'K_def':           st['K_def'],
            'lambda_atk_ref':  st['lambda_atk_ref'],
            'lambda_def_ref':  st['lambda_def_ref'],
            'P_champion':      round(p * 100, 2),
            'IC_95':           round(e * 100, 2),
            'P_final':         round(C['final'].get(team, 0)  / N_SIMULATIONS * 100, 2),
            'P_semis':         round(C['sf'].get(team, 0)     / N_SIMULATIONS * 100, 2),
            'P_quarters':      round(C['qf'].get(team, 0)     / N_SIMULATIONS * 100, 2),
            'P_r16':           round(C['r16'].get(team, 0)    / N_SIMULATIONS * 100, 2),
            'P_r32':           round(C['r32'].get(team, 0)    / N_SIMULATIONS * 100, 2),
            'Host':            team in HOSTS,
        })

    df = pd.DataFrame(rows).sort_values('P_champion', ascending=False).reset_index(drop=True)
    df.to_csv(os.path.join(OUTPUT_DIR, "copa2026_results.csv"), index=False)

    # ── Geração dos Gráficos ──
    print("    >> Gerando gráficos...")
    # 1) Gráfico de Barras - Probabilidade de Ganhar a Copa
    plt.figure(figsize=(18, 8))
    cmap = LinearSegmentedColormap.from_list("green_to_red", ["red", "yellow", "green"])
    norm = plt.Normalize(df['P_champion'].min(), df['P_champion'].max())
    colors = [cmap(norm(val)) for val in df['P_champion']]

    # Pegamos os top 32 para não ficar tão ilegível
    top_df = df.head(32)
    plt.bar(top_df['Team'], top_df['P_champion'], color=colors[:32])
    plt.xticks(rotation=90, fontsize=10)
    plt.title("Probabilidade de Ganhar a Copa 2026 (%) - Top 32", fontsize=14, pad=15)
    plt.ylabel("Probabilidade (%)")
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, "probabilidade_campeao.png"), dpi=150)
    plt.close()

    # 2) Heatmap de Probabilidade de Avanço
    plt.figure(figsize=(12, 14))
    phases = ['P_r32', 'P_r16', 'P_quarters', 'P_semis', 'P_final', 'P_champion']
    phase_labels = ['32-Avos', 'Oitavas', 'Quartas', 'Semi', 'Final', 'Campeão']
    
    heatmap_df = df.set_index('Team')[phases].copy()
    data = heatmap_df.values
    
    fig, ax = plt.subplots(figsize=(10, 16))
    cax = ax.imshow(data, cmap="RdYlGn", aspect='auto')
    
    # Adicionar barra de cores
    cbar = fig.colorbar(cax, ax=ax, fraction=0.046, pad=0.04)
    cbar.set_label('Probabilidade (%)')

    # Configurar eixos
    ax.set_xticks(np.arange(len(phase_labels)))
    ax.set_yticks(np.arange(len(heatmap_df.index)))
    ax.set_xticklabels(phase_labels)
    ax.set_yticklabels(heatmap_df.index)

    # Rotacionar labels
    plt.setp(ax.get_xticklabels(), rotation=45, ha="right", rotation_mode="anchor")

    # Adicionar anotações de texto em cada célula
    for i in range(len(heatmap_df.index)):
        for j in range(len(phase_labels)):
            val = data[i, j]
            color = "white" if (val < 20 or val > 80) else "black"
            ax.text(j, i, f"{val:.1f}", ha="center", va="center", color=color, fontsize=8)

    ax.set_title("Heatmap: Probabilidade de Avançar para cada Fase (%)", fontsize=14, pad=15)
    fig.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, "probabilidade_fases_heatmap.png"), dpi=150)
    plt.close('all')

    # ── Resumo console ──
    lines = [
        "=" * 75,
        f"  COPA 2026 — {N_SIMULATIONS:,} simulações  (modelo K-att/K-def v2)",
        "=" * 75, "",
        f"{'#':<4}{'Time':<33}{'ELO':>6}  {'K_att':>6}  {'K_def':>6}  "
        f"{'%Camp':>6}  {'+-':>5}  {'%Final':>7}",
        "-" * 75,
    ]
    for rank, row in df.head(24).iterrows():
        h = " [H]" if row['Host'] else "    "
        lines.append(
            f"{rank+1:<4}{row['Team']+h:<37}{row['ELO']:>6.0f}  "
            f"{row['K_att']:>6.4f}  {row['K_def']:>6.4f}  "
            f"{row['P_champion']:>5.2f}%  {row['IC_95']:>4.2f}%  "
            f"{row['P_final']:>6.2f}%"
        )

    lines += ["", "-- SANITY CHECKS --"]
    lines.append(f"  Soma campeão: {df['P_champion'].sum():.2f}% (esperado ~100%)")
    for t in ['Argentina', 'Brazil', 'France', 'Spain', 'England']:
        r = df[df['Team'] == t]
        if not r.empty:
            row = r.iloc[0]
            lines.append(f"  {'OK' if row['P_champion'] > 1 else '!!'} "
                         f"{t}: {row['P_champion']:.2f}%  "
                         f"K_att={row['K_att']:.4f}  K_def={row['K_def']:.4f}")

    # K-factors ordenados
    lines += ["", "-- TOP 10 POR K_att (ataque acima do esperado) --"]
    df_k = df.sort_values('K_att', ascending=False)
    for _, row in df_k.head(10).iterrows():
        lines.append(f"  {row['Team']:<30} K_att={row['K_att']:.4f}  "
                     f"K_def={row['K_def']:.4f}  ELO={row['ELO']:.0f}")

    lines += ["", "-- TOP 10 POR K_def (defesa abaixo do esperado = melhor) --"]
    df_kd = df.sort_values('K_def')
    for _, row in df_kd.head(10).iterrows():
        lines.append(f"  {row['Team']:<30} K_def={row['K_def']:.4f}  "
                     f"K_att={row['K_att']:.4f}  ELO={row['ELO']:.0f}")

    summary = "\n".join(lines)
    print("\n" + summary)
    with open(os.path.join(OUTPUT_DIR, "copa2026_summary.txt"), "w", encoding="utf-8") as f:
        f.write(summary)

    print("\n=== Concluído ===")
    print("  copa2026_results.csv  (ELO, K_att, K_def, lambdas ref, probabilidades)")
    print("  copa2026_summary.txt")


if __name__ == "__main__":
    main()
