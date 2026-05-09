"""
train_model.py
==============
Script 2 — Copa 2026 Modelling Pipeline  (v2 — K-att / K-def)
Treina rede GRU que aprende, para cada time, dois fatores multiplicativos:

  K_att : o quanto o time marca acima/abaixo do esperado pelo delta_elo
  K_def : o quanto o time concede acima/abaixo do esperado

Lambdas finais:
  λ_home = λ_base(delta_eff) · K_att(home) · K_def(away)
  λ_away = λ_base(delta_eff) · K_att(away) · K_def(home)

onde λ_base vem dos priors fitados em fit_priors.py (prior_params.json).

Rho também vem dos priors (função do delta_eff) — não é output da rede.

Decaimento: por número de jogos na sequência (não por tempo).
  decay_weight já está pré-computado nas sequências (feat index 5).

Otimizações de memória para GPU 6 GB VRAM:
  - Gradients de checkpoint podem ser ativados (USE_GRAD_CKPT)
  - BATCH_SIZE padrão 256 (ajuste se necessário)
  - GRU compartilhada (home e away usam os mesmos pesos)
  - mixed precision (AMP) automático se CUDA disponível

Outputs:
  model_best.pt
  model_config.json
  training_log.csv
  k_factors_final.csv   ← K_att e K_def por time (interpretabilidade)
"""

import os
import json
import pickle
import math

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader

# ─────────────────────────────────────────────────────────────────────
# HIPERPARÂMETROS
# ─────────────────────────────────────────────────────────────────────
SEQ_LEN           = 25          # jogos na janela de forma
FEAT_PER_GAME     = 6     # delta_elo, goals_scored, goals_conceded, tw, result, decay_weight
GRU_HIDDEN        = 48    # ligeiramente maior que v1 (mais capacidade para K-att/K-def)
DROPOUT           = 0.25
LEARNING_RATE     = 2e-4
BATCH_SIZE        = 256   # seguro para 6 GB VRAM
EPOCHS            = 250
MIN_GAMES_TEAM    = 5
PATIENCE_ES       = 25
PATIENCE_LR       = 12
VAL_SPLIT         = 0.10
K_REG_WEIGHT      = 1e-1  # L2 sobre log(K_att) e log(K_def)
USE_GRAD_CKPT     = False  # ativar se OOM mesmo com batch=256
USE_AMP           = True   # mixed precision (desativa automaticamente se não CUDA)

NORM_DELTA_ELO = 400.0
NORM_GOALS     = 3.0
EPS_K          = 1e-2     # K nunca abaixo de EPS_K (evita lambda=0)

import os
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = SCRIPT_DIR

# Parâmetros dos priors (carregados do JSON em runtime)
_PRIORS = None


def load_priors(path=None):
    if path is None: path = os.path.join(SCRIPT_DIR, "prior_params.json")
    global _PRIORS
    with open(path, "r") as f:
        _PRIORS = json.load(f)
    print(f"    >> Priors carregados: a={_PRIORS['a']:.4f} b={_PRIORS['b']:.6f} "
          f"c={_PRIORS['c']:.2e} home_adv={_PRIORS['home_adv']:.1f}")
    print(f"    >> rho0_raw={_PRIORS['rho0_raw']:.4f} rho1_neg={_PRIORS['rho1_neg']:.4f}")
    return _PRIORS


# ─────────────────────────────────────────────────────────────────────
# LAMBDA BASE E RHO (priors — sem gradiente)
# ─────────────────────────────────────────────────────────────────────
RHO_MAX = 0.2

def lambda_base_torch(delta_eff: torch.Tensor) -> tuple:
    """
    Calcula λ_base_home e λ_base_away a partir dos parâmetros dos priors.
    Operação diferenciável, mas priors são constantes (sem gradiente).
    """
    a = _PRIORS['a']
    b = _PRIORS['b']
    c = _PRIORS['c']
    lam_h = torch.exp(torch.tensor(a, dtype=torch.float32, device=delta_eff.device)
                      + torch.tensor(b, dtype=torch.float32, device=delta_eff.device) * delta_eff
                      + torch.tensor(c, dtype=torch.float32, device=delta_eff.device) * delta_eff ** 2)
    lam_a = torch.exp(torch.tensor(a, dtype=torch.float32, device=delta_eff.device)
                      - torch.tensor(b, dtype=torch.float32, device=delta_eff.device) * delta_eff
                      + torch.tensor(c, dtype=torch.float32, device=delta_eff.device) * delta_eff ** 2)
    return lam_h, lam_a


def rho_from_delta_torch(delta_eff: torch.Tensor) -> torch.Tensor:
    """
    rho = RHO_MAX * tanh(rho0_raw - rho1_neg * |delta_eff| / 400)
    Idêntico à fórmula de fit_priors.py, mas em torch.
    """
    rho0  = _PRIORS['rho0_raw']
    rho1  = _PRIORS['rho1_neg']
    arg   = rho0 - rho1 * delta_eff.abs() / 400.0
    return RHO_MAX * torch.tanh(arg)


# ─────────────────────────────────────────────────────────────────────
# DATASET
# ─────────────────────────────────────────────────────────────────────
def pad_sequence(seq: list) -> np.ndarray:
    """
    Converte lista de dicts → array (SEQ_LEN, FEAT_PER_GAME).
    Padding à esquerda (zeros). decay_weight já está em cada entry.
    Feat: [delta_elo/nd, goals_scored/ng, goals_conceded/ng, tw, result, decay_weight]
    """
    arr = np.zeros((SEQ_LEN, FEAT_PER_GAME), dtype=np.float32)
    n   = min(len(seq), SEQ_LEN)
    if n == 0:
        return arr
    start = SEQ_LEN - n
    for i, entry in enumerate(seq[-n:]):
        arr[start + i, 0] = entry['delta_elo']        / NORM_DELTA_ELO
        arr[start + i, 1] = entry['goals_scored']     / NORM_GOALS
        arr[start + i, 2] = entry['goals_conceded']   / NORM_GOALS
        arr[start + i, 3] = entry['tournament_weight']
        arr[start + i, 4] = entry['result']
        arr[start + i, 5] = entry.get('decay_weight', 1.0)  # compatível com v1
    return arr


USE_FIXED_ELO = False  # Se True, usa o ELO final do time para todos os cálculos de delta no dataset alvo

class FootballDataset(Dataset):
    def __init__(self, records: list, final_elos: dict = None):
        self.records = records
        self.final_elos = final_elos

    def __len__(self):
        return len(self.records)

    def __getitem__(self, idx):
        r = self.records[idx]
        seq_h = pad_sequence(r['seq_home'])
        seq_a = pad_sequence(r['seq_away'])

        # delta_elo_raw SEM home_adv (compatível com v2 do build_dataset)
        if USE_FIXED_ELO and self.final_elos:
            ht, at = r.get('home_team'), r.get('away_team')
            h_elo = self.final_elos.get(ht, 1500)
            a_elo = self.final_elos.get(at, 1500)
            delta_raw = np.float32((h_elo - a_elo) / NORM_DELTA_ELO)
        else:
            delta_raw = np.float32(r.get('delta_elo_raw', r.get('delta_elo', 0)) / NORM_DELTA_ELO)
        is_neutral = np.float32(1.0 if r.get('is_neutral', r.get('neutral', False)) else 0.0)
        tw         = np.float32(r['tournament_weight'])
        hs         = np.int64(r['home_score'])
        as_        = np.int64(r['away_score'])

        return (
            torch.from_numpy(seq_h),
            torch.from_numpy(seq_a),
            torch.tensor(delta_raw),
            torch.tensor(is_neutral),
            torch.tensor(tw),
            torch.tensor(hs),
            torch.tensor(as_),
        )


# ─────────────────────────────────────────────────────────────────────
# MODELO — GRU compartilhada → K_att, K_def por time
# ─────────────────────────────────────────────────────────────────────
class FootballGRU(nn.Module):
    """
    Uma única GRU compartilhada processa a sequência de qualquer time.
    Saída: 2 escalares por time — k_att_raw e k_def_raw.
    K_att = softplus(k_att_raw) + EPS_K   (centrado em 1.0 via init)
    K_def = softplus(k_def_raw) + EPS_K

    lambda_home = lambda_base_home * K_att(home) * K_def(away)
    lambda_away = lambda_base_away * K_att(away) * K_def(home)
    """

    def __init__(self):
        super().__init__()

        # GRU compartilhada (mesmos pesos para home e away → generalização melhor)
        self.gru = nn.GRU(
            input_size=FEAT_PER_GAME,
            hidden_size=GRU_HIDDEN,
            num_layers=1,
            batch_first=True,
            dropout=0.0,
        )

        # Cabeça de saída: hidden → [k_att_raw, k_def_raw]
        self.head = nn.Sequential(
            nn.Linear(GRU_HIDDEN, 32),
            nn.ReLU(),
            nn.Dropout(DROPOUT),
            nn.Linear(32, 2),
        )

        # Inicialização: bias da cabeça em softplus⁻¹(1 - EPS_K) ≈ 0.541
        # para que K comece próximo de 1.0
        init_bias = math.log(math.exp(1.0 - EPS_K) - 1.0)   # softplus⁻¹(1 - EPS_K)
        with torch.no_grad():
            self.head[-1].bias.fill_(init_bias)

    def _encode(self, seq: torch.Tensor) -> torch.Tensor:
        """
        seq: (B, T, F) — processa com a GRU compartilhada.
        Retorna (B, 2): [k_att_raw, k_def_raw]
        """
        out, _ = self.gru(seq)        # (B, T, H)
        last   = out[:, -1, :]        # (B, H) — último timestep (mais recente, padding à esquerda)
        return self.head(last)        # (B, 2)

    def forward(self, seq_h, seq_a, delta_raw, is_neutral):
        """
        delta_raw  : (B,) — delta_elo_raw / NORM_DELTA_ELO (SEM home_adv)
        is_neutral : (B,) — 1.0 se jogo neutro, 0.0 se mandante tem vantagem

        Retorna: lam_home (B,), lam_away (B,), rho (B,)
        """
        # K-att e K-def para cada time
        raw_h = self._encode(seq_h)   # (B, 2)
        raw_a = self._encode(seq_a)   # (B, 2)

        K_att_h = torch.nn.functional.softplus(raw_h[:, 0]) + EPS_K  # (B,)
        K_def_h = torch.nn.functional.softplus(raw_h[:, 1]) + EPS_K
        K_att_a = torch.nn.functional.softplus(raw_a[:, 0]) + EPS_K
        K_def_a = torch.nn.functional.softplus(raw_a[:, 1]) + EPS_K

        # delta_eff incorpora home_adv dos priors (em pontos ELO normalizados)
        home_adv_norm = _PRIORS['home_adv'] / NORM_DELTA_ELO
        delta_eff = delta_raw + home_adv_norm * (1.0 - is_neutral)   # (B,)
        delta_eff_elo = delta_eff * NORM_DELTA_ELO                   # de volta a pts ELO

        # Lambda base dos priors (constante — sem gradiente necessário)
        with torch.no_grad():
            lam_base_h, lam_base_a = lambda_base_torch(delta_eff_elo)
            rho = rho_from_delta_torch(delta_eff_elo)

        # Lambdas finais com multiplicadores K
        lam_home = lam_base_h * K_att_h * K_def_a
        lam_away = lam_base_a * K_att_a * K_def_h

        return lam_home, lam_away, rho, K_att_h, K_def_h, K_att_a, K_def_a

    def encode_team(self, seq: torch.Tensor) -> tuple:
        """Interface para inferência: retorna (K_att, K_def) de um time."""
        raw = self._encode(seq)   # (B, 2)
        K_att = torch.nn.functional.softplus(raw[:, 0]) + EPS_K
        K_def = torch.nn.functional.softplus(raw[:, 1]) + EPS_K
        return K_att, K_def


# ─────────────────────────────────────────────────────────────────────
# LOSS — NLL DIXON-COLES + regularização sobre K
# ─────────────────────────────────────────────────────────────────────
LOG_FACTORIAL = [0.0] + [math.lgamma(i + 1) for i in range(1, 30)]


def log_poisson(k: torch.Tensor, lam: torch.Tensor) -> torch.Tensor:
    k_int = k.long().clamp(0, 28)
    lf = torch.tensor(
        [LOG_FACTORIAL[i] for i in k_int.cpu().tolist()],
        dtype=torch.float32, device=lam.device
    )
    return k.float() * torch.log(lam.clamp(min=1e-9)) - lam - lf


def dixon_coles_tau(X, Y, lam_A, lam_B, rho):
    """Fator de correção Dixon-Coles para placares baixos."""
    tau = torch.ones_like(lam_A)
    is_00 = (X == 0) & (Y == 0)
    is_10 = (X == 1) & (Y == 0)
    is_01 = (X == 0) & (Y == 1)
    is_11 = (X == 1) & (Y == 1)
    tau = torch.where(is_00, (1 - lam_A * lam_B * rho).clamp(min=1e-6), tau)
    tau = torch.where(is_10, (1 + lam_A * rho).clamp(min=1e-6),         tau)
    tau = torch.where(is_01, (1 + lam_B * rho).clamp(min=1e-6),         tau)
    tau = torch.where(is_11, (1 - rho).clamp(min=1e-6),                 tau)
    return tau


def dc_nll_loss(lam_A, lam_B, rho, X, Y, weights,
                K_att_h, K_def_h, K_att_a, K_def_a):
    """
    NLL Dixon-Coles ponderada por tournament_weight
    + regularização L2 sobre log(K) para manter K próximo de 1.0
    (times com pouco histórico convergem para K≈1 naturalmente)
    """
    log_p_x = log_poisson(X, lam_A)
    log_p_y = log_poisson(Y, lam_B)
    tau      = dixon_coles_tau(X, Y, lam_A, lam_B, rho)
    log_tau  = torch.log(tau)
    nll      = -(log_p_x + log_p_y + log_tau)
    main_loss = (nll * weights).mean()

    # Regularização: penaliza desvios de K=1.0  (log(K)≠0)
    reg = (torch.log(K_att_h).pow(2) + torch.log(K_def_h).pow(2)
         + torch.log(K_att_a).pow(2) + torch.log(K_def_a).pow(2)).mean()

    return main_loss + K_REG_WEIGHT * reg, main_loss.item()


# ─────────────────────────────────────────────────────────────────────
# CARREGAMENTO
# ─────────────────────────────────────────────────────────────────────
def load_records():
    print("[1/6] Carregando training_sequences.pkl...")
    with open(os.path.join(SCRIPT_DIR, "training_sequences.pkl"), "rb") as f:
        records = pickle.load(f)

    filtered = [
        r for r in records
        if len(r['seq_home']) >= MIN_GAMES_TEAM and len(r['seq_away']) >= MIN_GAMES_TEAM
    ]
    print(f"    >> {len(records):,} registros totais -> {len(filtered):,} após filtro")

    split      = int(len(filtered) * (1 - VAL_SPLIT))
    train_recs = filtered[:split]
    val_recs   = filtered[split:]
    print(f"    >> Treino: {len(train_recs):,}  |  Validação: {len(val_recs):,}")
    return train_recs, val_recs


# ─────────────────────────────────────────────────────────────────────
# EXTRAÇÃO DE K-FACTORS PARA INTERPRETABILIDADE
# ─────────────────────────────────────────────────────────────────────
@torch.no_grad()
def extract_k_factors(model, state_path=None, device="cpu"):
    """
    Roda a GRU uma vez para cada time da Copa 2026 e retorna K_att, K_def.
    """
    if state_path is None: state_path = os.path.join(SCRIPT_DIR, "copa2026_state.pkl")
    with open(state_path, "rb") as f:
        state = pickle.load(f)

    model.eval()
    rows = []
    for team, form in state['team_forms'].items():
        seq = pad_sequence(form)
        seq_t = torch.from_numpy(seq).unsqueeze(0).to(device)   # (1, T, F)
        K_att, K_def = model.encode_team(seq_t)
        rows.append({
            'team':    team,
            'elo':     round(state['team_elos'].get(team, 1500), 1),
            'K_att':   round(float(K_att[0].cpu()), 4),
            'K_def':   round(float(K_def[0].cpu()), 4),
            'n_games': len(form),
        })

    import pandas as pd
    df = pd.DataFrame(rows).sort_values('K_att', ascending=False).reset_index(drop=True)
    return df


# ─────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("  train_model.py — Copa 2026 Pipeline v2 (K-att/K-def)  ")
    print("=" * 60)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"    Dispositivo: {device}")
    if device.type == "cuda":
        props = torch.cuda.get_device_properties(0)
        print(f"    GPU: {props.name}  |  VRAM: {props.total_memory / 1e9:.1f} GB")

    amp_enabled = USE_AMP and device.type == "cuda"
    scaler = torch.cuda.amp.GradScaler() if amp_enabled else None
    print(f"    Mixed precision (AMP): {'ON' if amp_enabled else 'OFF'}")

    print("[2/6] Carregando priors...")
    load_priors()

    train_recs, val_recs = load_records()

    state_path = os.path.join(SCRIPT_DIR, "copa2026_state.pkl")
    final_elos = {}
    if os.path.exists(state_path):
        with open(state_path, "rb") as f:
            st = pickle.load(f)
            final_elos = st.get('team_elos', {})

    train_ds = FootballDataset(train_recs, final_elos)
    val_ds   = FootballDataset(val_recs, final_elos)
    # pin_memory=True acelera transferência CPU→GPU
    pin = device.type == "cuda"
    train_dl = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True,
                          num_workers=2, pin_memory=pin, persistent_workers=True)
    val_dl   = DataLoader(val_ds,   batch_size=BATCH_SIZE, shuffle=False,
                          num_workers=2, pin_memory=pin, persistent_workers=True)

    print("[3/6] Instanciando modelo...")
    model    = FootballGRU().to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"    >> Parâmetros: {n_params:,}")
    print(f"    >> GRU_HIDDEN={GRU_HIDDEN}  FEAT_PER_GAME={FEAT_PER_GAME}")
    print(f"    >> K_REG_WEIGHT={K_REG_WEIGHT}  EPS_K={EPS_K}")

    optimizer = optim.AdamW(model.parameters(), lr=LEARNING_RATE, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode='min', patience=PATIENCE_LR, factor=0.5, verbose=True
    )

    best_val_nll     = float('inf')
    patience_counter = 0
    log              = []

    print(f"[4/6] Treinando por até {EPOCHS} épocas (early stop patience={PATIENCE_ES})...")

    for epoch in range(1, EPOCHS + 1):
        # ── Treino ──
        model.train()
        train_loss = 0.0
        train_nll  = 0.0
        for batch in train_dl:
            seq_h, seq_a, delta_raw, is_neutral, tw, hs, as_ = [b.to(device) for b in batch]

            if amp_enabled:
                with torch.cuda.amp.autocast():
                    lam_h, lam_a, rho, Kah, Kdh, Kaa, Kda = model(
                        seq_h, seq_a, delta_raw, is_neutral)
                    loss, nll = dc_nll_loss(lam_h, lam_a, rho, hs, as_, tw,
                                            Kah, Kdh, Kaa, Kda)
                optimizer.zero_grad()
                scaler.scale(loss).backward()
                scaler.unscale_(optimizer)
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                scaler.step(optimizer)
                scaler.update()
            else:
                lam_h, lam_a, rho, Kah, Kdh, Kaa, Kda = model(
                    seq_h, seq_a, delta_raw, is_neutral)
                loss, nll = dc_nll_loss(lam_h, lam_a, rho, hs, as_, tw,
                                        Kah, Kdh, Kaa, Kda)
                optimizer.zero_grad()
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                optimizer.step()

            train_loss += loss.item()
            train_nll  += nll

        train_loss /= len(train_dl)
        train_nll  /= len(train_dl)

        # ── Validação ──
        model.eval()
        val_loss = 0.0
        val_nll  = 0.0
        with torch.no_grad():
            for batch in val_dl:
                seq_h, seq_a, delta_raw, is_neutral, tw, hs, as_ = [b.to(device) for b in batch]
                lam_h, lam_a, rho, Kah, Kdh, Kaa, Kda = model(
                    seq_h, seq_a, delta_raw, is_neutral)
                loss, nll = dc_nll_loss(lam_h, lam_a, rho, hs, as_, tw,
                                        Kah, Kdh, Kaa, Kda)
                val_loss += loss.item()
                val_nll  += nll

        val_loss /= len(val_dl)
        val_nll  /= len(val_dl)

        scheduler.step(val_nll)   # scheduler baseado na NLL pura (sem reg)

        cur_lr = optimizer.param_groups[0]['lr']
        log.append({
            'epoch':      epoch,
            'loss_train': round(train_loss, 6),
            'nll_train':  round(train_nll, 6),
            'loss_val':   round(val_loss, 6),
            'nll_val':    round(val_nll, 6),
            'lr':         cur_lr,
        })

        if epoch % 10 == 0 or epoch == 1:
            print(f"  Época {epoch:>4}  |  "
                  f"train_nll={train_nll:.4f}  val_nll={val_nll:.4f}  "
                  f"lr={cur_lr:.2e}")

        if val_nll < best_val_nll:
            best_val_nll     = val_nll
            patience_counter = 0
            torch.save(model.state_dict(), os.path.join(OUTPUT_DIR, "model_best.pt"))
        else:
            patience_counter += 1
            if patience_counter >= PATIENCE_ES:
                print(f"  Early stopping na época {epoch}")
                break

    print(f"[5/6] Melhor val NLL: {best_val_nll:.4f}")

    # ── Recarrega melhor modelo para extrair K-factors ──
    model.load_state_dict(torch.load(os.path.join(OUTPUT_DIR, "model_best.pt"),
                                      map_location=device))

    print("[6/6] Salvando artefatos...")

    config = {
        'SEQ_LEN':           SEQ_LEN,
        'FEAT_PER_GAME':     FEAT_PER_GAME,
        'GRU_HIDDEN':        GRU_HIDDEN,
        'DROPOUT':           DROPOUT,
        'NORM_DELTA_ELO':    NORM_DELTA_ELO,
        'NORM_GOALS':        NORM_GOALS,
        'EPS_K':             EPS_K,
        'K_REG_WEIGHT':      K_REG_WEIGHT,
        'best_val_nll':      best_val_nll,
        'architecture':      'GRU_K_att_K_def_v2',
        'prior_params_file': 'prior_params.json',
    }
    with open(os.path.join(OUTPUT_DIR, "model_config.json"), 'w') as f:
        json.dump(config, f, indent=2)

    import pandas as pd
    pd.DataFrame(log).to_csv(os.path.join(OUTPUT_DIR, "training_log.csv"), index=False)

    # K-factors por time (interpretabilidade)
    state_path = os.path.join(SCRIPT_DIR, "copa2026_state.pkl")
    if os.path.exists(state_path):
        print("    >> Extraindo K_att / K_def por time...")
        df_k = extract_k_factors(model, state_path, device=device)
        df_k.to_csv(os.path.join(OUTPUT_DIR, "k_factors_final.csv"), index=False)
        
        # Output JSON as requested
        # Format: { "BRA": { "elo": 1970, "K_att": 1.02, "K_def": 0.98 }, ... }
        k_json = {}
        for _, row in df_k.iterrows():
            k_json[row['team']] = {
                'elo': row['elo'],
                'K_att': row['K_att'],
                'K_def': row['K_def']
            }
        with open(os.path.join(OUTPUT_DIR, "k_factors_final.json"), 'w') as f:
            json.dump(k_json, f, indent=2)
            
        print("\n  Top 10 times por K_att (ataque acima do esperado):")
        print(f"  {'Time':<30} {'ELO':>6}  {'K_att':>6}  {'K_def':>6}  {'jogos':>6}")
        print("  " + "-" * 60)
        for _, row in df_k.head(10).iterrows():
            print(f"  {row['team']:<30} {row['elo']:>6.0f}  "
                  f"{row['K_att']:>6.4f}  {row['K_def']:>6.4f}  {int(row['n_games']):>6}")
    else:
        print("    !! copa2026_state.pkl não encontrado — k_factors_final.csv/json não gerado")

    print("\n=== train_model.py concluído ===")
    print("Outputs:")
    print("  model_best.pt")
    print("  model_config.json")
    print("  training_log.csv")
    print("  k_factors_final.csv")


if __name__ == "__main__":
    main()
