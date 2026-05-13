# CLAUDE.md - Instruções para a IA neste Projeto

## Seja Sucinto e aplique Mobile-First

- **Não gere explicações longas antes de agir** - escreva o código diretamente.
- **Use as ferramentas apropriadas** para edição (`replace_file_content`, `multi_replace_file_content`).
- **Não re-explique** o que o código faz após escrever.
- Mantenha o padrão **Premium & Mobile-First**.
- Deve funcionar em Android, Iphone e Desktop.
- NUNCA suba firestore.rules para o github

## Stack e Arquitetura

- **Core**: HTML5 + Vanilla CSS + Vanilla JS (ES6).
- **Sem Bundlers**: Não use `import/export`. Tudo é global via `window` ou funções declaradas no escopo global.
- **Firebase**: Uso nativo do Firebase SDK (v8). Firestore como banco principal.
- **Modo Offline**: Sincronização automática com `localStorage` via `carregarDadosLocais()` e `_persistirLocal()` em `app.js`.

## Estrutura de Arquivos

- `index.html`: Dashboard principal (Roteador de abas: Resultados, Classificação, Gráfico, Tabela, Compilação, Estatísticas, Regras).
- `aposta.html`: Área do apostador (Acesso via `?token=XXXX`).
- `admin.html`: Painel administrativo (Gestão de resultados e usuários).
- `firebase-config.js`: Inicialização e configuração do SDK do Firebase.
- `js/`:
  - `app.js`: Núcleo do sistema, listeners do Firestore e persistência `localStorage`.
  - `admin.js`: Gerenciamento de resultados, usuários e controle de travas.
  - `aposta.js`: Interface do apostador para entrada de palpites.
  - `bracket.js`: Lógica de chaveamento (fases eliminatórias) e standings.
  - `prognose.js`: Motor Dixon-Coles para cálculo de probabilidades de jogos.
  - `scoring.js`: Motor de pontuação e regras de bônus.
  - `tab-classificacao.js`: Ranking (leaderboard) e detalhes de pontuação.
  - `tab-compilacao.js`: Grade comparativa de palpites e exportação CSV/JSON.
  - `tab-estatisticas.js`: Visualização de tendências e agregados de palpites.
  - `tab-grafico.js`: Gráficos de desempenho e evolução.
  - `tab-regras.js`: Renderização das regras do bolão.
  - `tab-resultados.js`: Listagem simples de resultados oficiais.
  - `tab-tabela.js`: Classificação automática dos grupos da Copa.
  - `ui-jogos.js`: Componente mestre de renderização de cards de jogos.
- `data/`:
  - `config.js`: Constantes de prazos, multiplicadores e bônus.
  - `schedule.js`: Calendário oficial (104 jogos) com IDs e sedes.
  - `teams.js`: Dados das seleções (nomes, grupos, bandeiras).
  - `venues.js`: Lista de estádios e cidades-sede.
- `modelo/` (Pipeline Estatístico):
  - `build_dataset.py`: Processa `results_raw.csv` e gera ELO cronológico.
  - `fit_priors.py`: Otimiza parâmetros globais Dixon-Coles via MLE.
  - `train_model.py`: Treina rede GRU para fatores K-att/K-def por time.
  - `analyze_groups.py`: Gera heatmaps e CSV analítico da fase de grupos.
  - `simulate_copa.py`: Simulação Monte Carlo de todo o torneio.
- `css/`:
  - `style.css`: Design System completo, tokens e layout Mobile-First.

## Estado Global (APP)

```javascript
APP.db              // Instância Firestore
APP.modoOffline     // boolean
APP.resultados      // { gameId: {homeGoals, awayGoals, foi_penaltis...} }
APP.palpites        // { apostadorId: { gameId: {homeGoals, awayGoals} } }
APP.apostadores     // array [{id, nome, apelido, token, especiais...}]
APP.configStatus    // { liberado_grupos: true, ... }
```

## **Firestore (v8 SDK)** - Estrutura principal de dados

- **`resultados_oficiais`**:
  - `gameId`: `{ homeGoals, awayGoals, foi_penaltis, penaltis_vencedor, penaltis_home, penaltis_away }`
- **`apostadores`**:
  - `id`: `{ nome, apelido, token, especiais: { campeao, vice, terceiro }, pontos_total, saldo_gols }`
  - **`palpites_jogos`** (Sub-coleção):
    - `gameId`: `{ homeGoals, awayGoals, fase, apostadorId, atualizado_em }`
- **`config`**:
  - `status`: `{ liberado_grupos, liberado_32avos, ..., liberado_finais }`
- **`tokens`**:
  - `id`: `{ token, ativo, criado_em }`

## Funções Críticas

### Lógica e Cálculos

- `gerarRanking(todosOsPalpites, resultados, participantes, especiais)`: Gera o leaderboard ordenado com critérios de desempate.
- `calcularTodosOsGrupos(resultados)`: Calcula classificação de todos os grupos e define os melhores 3ºs colocados.
- `preencherBracket(resultados)`: Resolve todos os confrontos do mata-mata com base nos resultados inseridos.
- `calcularPontosBrutos(palpite, resultado)`: Retorna `{total_bruto, bonus_pts, bonus_tipo}`.
- `aplicarFator(pontos, fase)`: Multiplica pontos pelo peso da fase (ex: final x2.0).

### Persistência e Estado

- `gravarPalpite(apostadorId, gameId, homeGoals, awayGoals)`: Salva aposta no Firestore ou localStorage.
- `gravarResultadoOficial(gameId, ...)` / `gravarTudoAdmin()`: Persiste resultados oficiais (Admin).
- `simularResultado(gameId, hg, ag, ...)`: Ativa modo de simulação e atualiza o estado visual sem persistir.
- `jogoAceita(jogoId)`: Verifica se a janela de apostas para o jogo está aberta via `APP.configStatus`.

### Renderização e UI

- `window.renderAbaAtiva(resetScroll)`: Re-renderiza a aba atual com os dados mais recentes, preservando scroll/foco.
- `renderJogosComToggle(res, tg, isAdm, palApo)`: Componente mestre que renderiza a lista de jogos com filtros e mini-tabelas.
- `PROGNOSE.calcular(hCode, aCode)`: Motor estatístico Poisson/Dixon-Coles para probabilidades de placar.
- `PROGNOSE.abrirModal(gameId)`: Abre o modal de detalhes, estatísticas e estádio de um jogo.
