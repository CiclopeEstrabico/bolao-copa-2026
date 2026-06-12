# 🏆 Bolão Copa do Mundo 2026

![Status](https://img.shields.io/badge/Status-Produ%C3%A7%C3%A3o-success)
![Tech](https://img.shields.io/badge/Stack-HTML5%20%7C%20JS%20%7C%20Firebase-blue)
![Mobile](https://img.shields.io/badge/Mobile-First-orange)

Plataforma profissional para gerenciamento de bolão da Copa do Mundo 2026, com processamento estatístico (Dixon-Coles), ranking em tempo real e interface responsiva premium.

---

## 🔗 Páginas Principais

| Página                    | Descrição                                                     | Link                                                                       |
| :------------------------- | :-------------------------------------------------------------- | :------------------------------------------------------------------------- |
| **Dashboard**        | Painel público com resultados, classificação e compilação. | [index.html](https://ciclopeestrabico.github.io/bolao-copa-2026/)             |
| **Área de Apostas** | Espaço personalizado para o apostador preencher palpites.      | [aposta.html](https://ciclopeestrabico.github.io/bolao-copa-2026/aposta.html) |
| **Painel Admin**     | Controle de resultados, tokens e liberação de fases.          | [admin.html](https://ciclopeestrabico.github.io/bolao-copa-2026/admin.html)   |

---

## 📂 Estrutura do Projeto e Arquivos

### Raiz

- `index.html`: Ponto de entrada. Gerencia as abas de Resultados, Classificação, Tabela, Compilação, Estatísticas e Regras.
- `aposta.html`: Interface para usuários logados via Token. Permite salvar palpites de jogos e especiais.
- `admin.html`: Painel restrito para entrada de placares oficiais e gestão de usuários.
- `firebase-config.js`: Configurações de conexão com o Google Firebase.

### `js/` (Lógica do Sistema)

- `app.js`: Núcleo do sistema, listeners do Firestore e persistência `localStorage`.
- `admin.js`: Gerenciamento de resultados, usuários e controle de travas.
- `aposta.js`: Interface do apostador para entrada de palpites.
- `atualizar_modelo.js`: Pipeline de atualização e simulação automática do apostador Modelo (rodado via Cron/Node).
- `bracket.js`: Lógica de chaveamento (fases eliminatórias) e standings.
- `prognose.js`: Motor Dixon-Coles para cálculo de probabilidades de jogos.
- `scoring.js`: Motor de pontuação e regras de bônus não cumulativos.
- `tab-classificacao.js`: Ranking (leaderboard) e detalhes de pontuação.
- `tab-compilacao.js`: Grade comparativa de palpites e exportação CSV/JSON.
- `tab-estatisticas.js`: Visualização de tendências e agregados de palpites.
- `tab-grafico.js`: Gráficos de desempenho e evolução.
- `tab-regras.js`: Renderização das regras do bolão.
- `tab-resultados.js`: Listagem simples de resultados oficiais.
- `tab-tabela.js`: Classificação automática dos grupos da Copa.
- `ui-jogos.js`: Componente mestre de renderização de cards de jogos.

### `data/` (Dados Estáticos)

- `config.js`: **Única fonte de verdade** para bônus, multiplicadores de fase e prazos.
- `teams.js`: Dados das 48 seleções, grupos, bandeiras e ratings ELO iniciais.
- `schedule.js`: Calendário completo dos 104 jogos da Copa.
- `venues.js`: Lista de estádios e cidades-sede.

### `modelo/` (Estatística e Simulação)

- `build_dataset.py`: Processa `results_raw.csv` e gera ELO cronológico.
- `fit_priors.py`: Otimiza parâmetros globais Dixon-Coles via MLE.
- `train_model.py`: Treina rede GRU para fatores K-att/K-def por time.
- `analyze_groups.py`: Gera heatmaps e CSV analítico da fase de grupos.
- `simulate_copa.py`: Simulação Monte Carlo de todo o torneio.
- `/results`: Artefatos (JSON/CSV) gerados pelas simulações que alimentam a UI.

### `css/`

- `style.css`: Design system premium, dark mode, variáveis CSS e responsividade mobile-first.

---

## 🗄️ Banco de Dados (Firebase Firestore)

O sistema utiliza o Firestore como banco NoSQL em tempo real (SDK v10.12.0 em Compatibility Mode). Estrutura das coleções e documentos exatos:

### `resultados_oficiais` (Coleção)

- Documento `dados`: Único documento (CQRS-lite) contendo o mapa de todos os resultados oficiais.
  - Chave `[gameId]` (ex: `J001`): `{ gameId, homeGoals, awayGoals, foi_penaltis, penaltis_vencedor, penaltis_home, penaltis_away, inserido_em, inserido_por }`

### `apostadores` (Coleção)

Documentos raiz identificados pelo ID do apostador (ex: `tok_1716...` ou `MODELO`).

- `id` (string): ID único do participante (mesmo do documento).
- `nome` (string): Nome completo do usuário.
- `apelido` (string): Apelido de exibição pública.
- `token` (string): Chave de acesso única vinculada.
- `criado_em` (string): ISOString do momento de cadastro.
- `isModelo` (boolean, opcional): `true` se for o Apostador Modelo da IA.
  *(Nota: Pontuações, acertos e ranking não são salvos individualmente no documento para evitar redundâncias, sendo calculados em tempo real no cliente).*
- **`dados`** (Sub-coleção):
  - Documento `palpites`: Único documento consolidado com todas as apostas do usuário.
    - `especiais` (map): `{ campeao, vice, terceiro }`.
    - Chave `[gameId]`: Salvo compactado como string `"homeGoals-awayGoals"` (ex: `"2-1"`). Pênaltis **nunca** são salvos nos palpites do apostador (são calculados on-demand apenas locais na interface para a simulação do bracket).
- **`palpites_jogos`** (Sub-coleção Legada / Em Depreciação):
  - Mantida por dual-write em fase de transição. Documentos identificados por `[gameId]` contendo `{ apostadorId, gameId, homeGoals, awayGoals, fase, token, atualizado_em }`.

### `cache` (Coleção)

- Documento `palpites_grupos`: Snapshot consolidado contendo a matriz de todos os palpites da fase de grupos de todos os apostadores.
  - Campos: `{ gerado_em, palpites: { [apostadorId]: { [gameId]: { hg, ag } } }, apostadores: [ { id, nome, apelido, ordem, especiais, token, isModelo } ] }`
- Documento `palpites_eliminatorias`: Snapshot consolidado contendo a matriz de todos os palpites da fase eliminatória de todos os apostadores.
  - Campos: `{ gerado_em, palpites: { [apostadorId]: { [gameId]: { hg, ag } } } }`
- Documento `tokens`: Mapa consolidado de todos os tokens e metadados de autenticação rápida.
  - Campos: `{ [tokenDocId]: { id, numero, token, ativo, nome, apelido, criado_em, pago } }`

### `config` (Coleção)

- Documento `status`: Configurações de liberação de fases e metadados.
  - Campos: `{ liberado_grupos, liberado_16avos, liberado_oitavas, liberado_quartas, liberado_semis, liberado_final, liberado_terceiro, cache_res_ts, cache_grupos_ts, cache_elim_ts }`.

### `tokens` (Coleção)

Documentos identificados por ID único (auto-ID).

- `token` (string): O código alfanumérico de login.
- `ativo` (boolean): Se o token é válido para uso.
- `pago` (boolean/string): Indica se o token está pago (`true` ou `""`).
- `criado_em` (string): Timestamp de criação.
- `apelido` (string): Apelido associado para sincronização.

---

## 📊 Regras Detalhadas de Pontuação

> [!IMPORTANT]
> **REGRAS DE PRORROGAÇÃO E PÊNALTIS:**
>
> - O placar oficial que conta para a pontuação de um jogo é **estritamente o placar do Tempo Regulamentar + Prorrogação (se houver)**.
> - **A disputa de Pênaltis NUNCA é computada para o placar de pontuação dos palpites!** Se o jogo terminar em empate e ir para os pênaltis, os pontos do palpite serão computados sobre o placar de empate (ex: 1x1 ou 2x2).
> - Em jogos de mata-mata, os pênaltis oficiais servem **única e exclusivamente** para o sistema decidir quem avança no chaveamento (bracket) do torneio.

O sistema utiliza uma lógica de **pontos brutos** que são posteriormente multiplicados pelo peso da fase. Os bônus **não são cumulativos** entre si (aplica-se apenas o maior bônus alcançado).

### 1. Pontuação por Jogo (Fase de Grupos)

|   Pontos   | Critério de Acerto          | Descrição Detalhada                                                                                                                    |
| :---------: | :--------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------- |
| **8** | **Placar Exato Alto**  | Acerto do placar exato em jogos com 4 ou mais gols (ex: 2x2, 3x1, 4x0).                                                                  |
| **6** | **Placar Exato Baixo** | Acerto do placar exato em jogos com menos de 4 gols (ex: 1x0, 2x1, 0x0).                                                                 |
| **4** | **Resultado + Bônus** | Acertou o vencedor ou empate, errou o placar, mas acertou a **Diferença de Gols** OU acertou os **Gols de um dos times**. |
| **3** | **Apenas Resultado**   | Acertou apenas o vencedor ou que seria empate, errando o placar e os bônus acima.                                                       |
| **0** | **Erro Total**         | Errou o vencedor ou o fato de ser empate.                                                                                                |

### 2. Multiplicadores de Fase

Os pontos acima são multiplicados conforme a importância da fase:

- **Grupos**: x1.0
- **32-avos**: x1.2
- **Oitavas**: x1.4
- **Quartas**: x1.6
- **Semis / 3º Lugar**: x1.8
- **Final**: x2.0

### 3. Palpites Especiais

Pontuação fixa (não multiplicada) para palpites realizados antes do início da Copa:

- **Campeão**: +7 pontos
- **Vice-Campeão**: +4 pontos
- **3º Lugar**: +2 pontos
