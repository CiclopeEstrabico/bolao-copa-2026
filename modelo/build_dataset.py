"""
build_dataset.py
================
Script 1 — Copa 2026 Modelling Pipeline
Lê results_raw.csv, calcula ELO cronológico, constrói sequências de
forma e salva os artefatos necessários para treino e simulação.

Mudanças v2 (K-att / K-def):
  - delta_elo salvo nas sequências é delta_elo_raw SEM home_adv
    (home_adv entra só no cálculo do lambda base via priors)
  - Cada entrada da sequência carrega decay_weight = exp(-λ * pos_from_end)
    onde pos_from_end é a posição em relação ao jogo mais recente
    (decaimento por número de jogos, não por tempo)
  - FEAT_PER_GAME passa de 5 → 6 (inclui decay_weight)
  - Campo is_neutral preservado no registro de treino
"""

import os
import pickle
import json
from collections import deque

import numpy as np
import pandas as pd

# ─────────────────────────────────────────────────────────────────────
# PARÂMETROS GERAIS
# ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
INPUT_CSV   = os.path.join(SCRIPT_DIR, "results_raw.csv")
OUTPUT_DIR  = os.path.join(SCRIPT_DIR, "results")
os.makedirs(OUTPUT_DIR, exist_ok=True)

ELO_START   = 1500
ELO_HOME_ADV = 100    # usado só no update ELO (fixo, não exportado no delta_elo_raw)

SEQ_LEN = 25          # jogos na janela de forma

# Decaimento por posição: w = exp(-DECAY_LAMBDA * pos_from_end)
# pos_from_end=0 → jogo mais recente, pos_from_end=SEQ_LEN-1 → jogo mais antigo
# Meia-vida de 7 jogos → lambda = ln(2)/7 ≈ 0.099
DECAY_HALFLIFE_GAMES = 7
DECAY_LAMBDA = np.log(2) / DECAY_HALFLIFE_GAMES   # ≈ 0.099

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

TOURNAMENT_WEIGHTS = {
    'Friendly':                     0.7,
}
TW_DEFAULT = 1.0

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

FEAT_PER_GAME = 6   # delta_elo, goals_scored, goals_conceded, tournament_weight, result, decay_weight


# ─────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────
def goal_factor(diff: int) -> float:
    d = abs(diff)
    if d < 2:  return 1.0
    if d == 2: return 1.5
    return (11 + d) / 8.0


def get_k(tournament: str) -> int:
    return K_FACTORS.get(tournament, K_DEFAULT)


def get_tw(tournament: str) -> float:
    return TOURNAMENT_WEIGHTS.get(tournament, TW_DEFAULT)


def add_decay_weights(seq: list) -> list:
    """
    Adiciona / atualiza 'decay_weight' em cada entrada da sequência.
    pos_from_end=0 → último jogo (mais recente) → weight=1.0
    pos_from_end=k → k jogos antes do mais recente → weight=exp(-λ*k)

    Retorna nova lista sem modificar a original.
    """
    n = len(seq)
    result = []
    for i, entry in enumerate(seq):
        pos_from_end = n - 1 - i    # 0 = mais recente
        w = float(np.exp(-DECAY_LAMBDA * pos_from_end))
        new_entry = dict(entry)
        new_entry['decay_weight'] = w
        result.append(new_entry)
    return result


# ─────────────────────────────────────────────────────────────────────
# 1.1  LIMPEZA DOS DADOS
# ─────────────────────────────────────────────────────────────────────
def load_and_clean(path: str) -> pd.DataFrame:
    print("[1/7] Carregando e limpando dados...")
    df = pd.read_csv(path)
    df['home_score'] = pd.to_numeric(df['home_score'], errors='coerce')
    df['away_score'] = pd.to_numeric(df['away_score'], errors='coerce')
    df = df.dropna(subset=['home_score', 'away_score']).copy()
    df['home_score'] = df['home_score'].astype(int)
    df['away_score'] = df['away_score'].astype(int)
    df['neutral']    = df['neutral'].fillna(False).astype(bool)
    df['date']       = pd.to_datetime(df['date'])
    df = df.sort_values('date').drop_duplicates().reset_index(drop=True)
    print(f"    >> {len(df):,} jogos válidos após limpeza (de 1872 até {df['date'].max().date()})")
    return df


# ─────────────────────────────────────────────────────────────────────
# 1.2  CÁLCULO ELO
# ─────────────────────────────────────────────────────────────────────
def compute_elo(df: pd.DataFrame):
    print("[2/7] Calculando ELO cronológico...")
    ratings: dict = {}

    records = []
    for _, row in df.iterrows():
        ht, at     = row['home_team'], row['away_team']
        hs, as_    = row['home_score'], row['away_score']
        neutral    = row['neutral']
        tournament = row['tournament']

        elo_h = ratings.get(ht, ELO_START)
        elo_a = ratings.get(at, ELO_START)

        # delta_elo_raw NÃO inclui home_adv — compatível com fit_priors.py
        delta_elo_raw = elo_h - elo_a

        # No update do ELO usamos home_adv fixo (ELO_HOME_ADV),
        # separado do home_adv fitado pelos priors DC
        adv_elo = 0 if neutral else ELO_HOME_ADV
        delta_for_we = delta_elo_raw + adv_elo
        We_h  = 1.0 / (1.0 + 10.0 ** (-delta_for_we / 400.0))

        diff  = hs - as_
        W     = 1.0 if diff > 0 else (0.0 if diff < 0 else 0.5)
        G     = goal_factor(diff)
        K     = get_k(tournament)
        tw    = get_tw(tournament)

        records.append({
            'date':              row['date'],
            'home_team':         ht,
            'away_team':         at,
            'home_score':        hs,
            'away_score':        as_,
            'tournament':        tournament,
            'neutral':           neutral,
            'elo_home_pre':      elo_h,
            'elo_away_pre':      elo_a,
            'delta_elo_raw':     delta_elo_raw,   # SEM home_adv
            'tournament_weight': tw,
            'K_used':            K,
            'G_used':            G,
        })

        We_a = 1.0 - We_h
        ratings[ht] = elo_h + K * G * (W - We_h)
        ratings[at] = elo_a + K * G * ((1 - W) - We_a)

    annotated = pd.DataFrame(records)
    print(f"    >> ELO calculado. Médio global final: {np.mean(list(ratings.values())):.1f}")
    for team, expected_min in [('Brazil', 1750), ('France', 1750), ('Argentina', 1750)]:
        if team in ratings:
            v = ratings[team]
            flag = "OK" if v > expected_min else "!!"
            print(f"    {flag}  {team}: {v:.0f}")
    return annotated, ratings


# ─────────────────────────────────────────────────────────────────────
# 1.3  SEQUÊNCIAS DE FORMA (com decay_weight por posição)
# ─────────────────────────────────────────────────────────────────────
def build_sequences(annotated: pd.DataFrame):
    print("[3/7] Construindo sequências de forma com decay por posição...")
    forms: dict = {}
    training = []

    for _, row in annotated.iterrows():
        ht, at = row['home_team'], row['away_team']

        # Snapshot das sequências ANTES do jogo (para treino)
        raw_seq_h = list(forms.get(ht, deque(maxlen=SEQ_LEN)))
        raw_seq_a = list(forms.get(at, deque(maxlen=SEQ_LEN)))

        # Adiciona decay_weight baseado na posição dentro da sequência
        seq_h = add_decay_weights(raw_seq_h)
        seq_a = add_decay_weights(raw_seq_a)

        training.append({
            'date':              str(row['date'].date()),
            'home_team':         ht,
            'away_team':         at,
            'home_score':        row['home_score'],
            'away_score':        row['away_score'],
            'delta_elo_raw':     row['delta_elo_raw'],   # SEM home_adv
            'is_neutral':        bool(row['neutral']),
            'tournament_weight': row['tournament_weight'],
            'seq_home':          seq_h,
            'seq_away':          seq_a,
        })

        diff     = row['home_score'] - row['away_score']
        result_h = 1.0 if diff > 0 else (0.0 if diff < 0 else 0.5)

        # Entrada sem decay_weight (será calculado dinamicamente em add_decay_weights)
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

        if ht not in forms:
            forms[ht] = deque(maxlen=SEQ_LEN)
        if at not in forms:
            forms[at] = deque(maxlen=SEQ_LEN)

        forms[ht].append(entry_h)
        forms[at].append(entry_a)

    print(f"    >> {len(training):,} registros de treino construídos")
    print(f"    >> FEAT_PER_GAME={FEAT_PER_GAME} (inclui decay_weight por posição)")
    print(f"    >> Decaimento: meia-vida={DECAY_HALFLIFE_GAMES} jogos  lambda={DECAY_LAMBDA:.4f}")
    return training, forms


# ─────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("  build_dataset.py — Copa 2026 Pipeline v2 (K-att/K-def)  ")
    print("=" * 60)

    df = load_and_clean(INPUT_CSV)
    annotated, final_ratings = compute_elo(df)

    print("[4/7] Salvando matches_with_elo.csv...")
    out_elo = os.path.join(OUTPUT_DIR, "matches_with_elo.csv")
    annotated.to_csv(out_elo, index=False)
    print(f"    >> {out_elo}  ({len(annotated):,} linhas)")

    training, forms = build_sequences(annotated)

    print("[5/7] Salvando training_sequences.pkl...")
    out_train = os.path.join(OUTPUT_DIR, "training_sequences.pkl")
    with open(out_train, 'wb') as f:
        pickle.dump(training, f)
    print(f"    >> {out_train}  ({len(training):,} registros)")

    print("[6/7] Montando copa2026_state.pkl...")
    all_copa_teams = [t for group in OFFICIAL_GROUPS.values() for t in group]
    missing = [t for t in all_copa_teams if t not in final_ratings]
    if missing:
        print(f"    !!  Times sem histórico (ELO=1500): {missing}")
        for t in missing:
            final_ratings[t] = ELO_START

    # Salva forms com decay_weight já calculado (para inferência rápida)
    team_forms = {}
    for team in all_copa_teams:
        raw = list(forms.get(team, deque(maxlen=SEQ_LEN)))
        team_forms[team] = add_decay_weights(raw)

    state = {
        'team_elos':         final_ratings,
        'team_forms':        team_forms,
        'copa_groups':       OFFICIAL_GROUPS,
        'hosts':             HOSTS,
        'feat_per_game':     FEAT_PER_GAME,
        'seq_len':           SEQ_LEN,
        'decay_lambda':      DECAY_LAMBDA,
        'decay_halflife_games': DECAY_HALFLIFE_GAMES,
    }
    out_state = os.path.join(OUTPUT_DIR, "copa2026_state.pkl")
    with open(out_state, 'wb') as f:
        pickle.dump(state, f)
    print(f"    >> {out_state}")

    # Salva config de dataset separado para referência dos outros scripts
    dataset_config = {
        'FEAT_PER_GAME':          FEAT_PER_GAME,
        'SEQ_LEN':                SEQ_LEN,
        'DECAY_LAMBDA':           DECAY_LAMBDA,
        'DECAY_HALFLIFE_GAMES':   DECAY_HALFLIFE_GAMES,
        'features':               ['delta_elo', 'goals_scored', 'goals_conceded',
                                   'tournament_weight', 'result', 'decay_weight'],
    }
    with open(os.path.join(OUTPUT_DIR, "dataset_config.json"), 'w') as f:
        json.dump(dataset_config, f, indent=2)
    print("    >> dataset_config.json")

    print("[7/7] ELO atual dos times da Copa 2026:")
    elo_copa = sorted(
        [(t, final_ratings.get(t, ELO_START)) for t in all_copa_teams],
        key=lambda x: -x[1]
    )
    for rank, (team, elo) in enumerate(elo_copa, 1):
        host_tag = " [H]" if team in HOSTS else ""
        n_games  = len(list(forms.get(team, [])))
        print(f"    {rank:>2}. {team:<30} {elo:>7.1f}  ({n_games} jogos históricos){host_tag}")

    print("\n=== build_dataset.py concluído ===")
    print("Outputs:")
    print("  matches_with_elo.csv")
    print("  training_sequences.pkl")
    print("  copa2026_state.pkl")
    print("  dataset_config.json")


if __name__ == "__main__":
    main()
