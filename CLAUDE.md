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
- **Firebase**: Uso nativo do Firebase SDK v10 (compat mode). Firestore como banco principal.
- **Cache de Leituras**: Otimização profunda de cotas Firestore utilizando `sessionStorage` persistente para anti-F5 (bloqueando reads duplicados) e invalidação inteligente via timestamps comparados de `config/status`.

## Estrutura de Arquivos

- `index.html`: Dashboard principal (Roteador de abas: Resultados, Classificação, Gráfico, Tabela, Compilação, Estatísticas, Regras).
- `aposta.html`: Área do apostador (Acesso via `?token=XXXX`).
- `admin.html`: Painel administrativo (Gestão de resultados e usuários).
- `firebase-config.js`: Inicialização e configuração do SDK do Firebase.
- `js/`:
  - `app.js`: Núcleo do sistema, listeners do Firestore e gerenciamento de cache `sessionStorage` anti-F5.
  - `admin.js`: Gerenciamento de resultados, usuários, controle de travas e compilação de caches.
  - `aposta.js`: Interface do apostador para entrada de palpites e cadastro de token.
  - `atualizar_modelo.js`: Pipeline estatístico de atualização e gerenciamento do apostador Modelo.
  - `bracket.js`: Lógica de chaveamento (fases eliminatórias) e standings de grupos.
  - `prognose.js`: Motor Dixon-Coles para cálculo de probabilidades de jogos e modal analítico.
  - `scoring.js`: Motor de pontuação e regras de bônus do bolão.
  - `tab-classificacao.js`: Ranking (leaderboard) e detalhes de pontuação.
  - `tab-compilacao.js`: Grade comparativa de palpites e exportação CSV/JSON.
  - `tab-estatisticas.js`: Visualização de tendências e agregados de palpites.
  - `tab-grafico.js`: Gráficos de desempenho e evolução da pontuação.
  - `tab-regras.js`: Renderização das regras do bolão.
  - `tab-resultados.js`: Listagem simples de resultados oficiais.
  - `tab-tabela.js`: Classificação automática dos grupos da Copa.
  - `ui-jogos.js`: Componente mestre de renderização de cards de jogos com filtro e simulação.
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
APP.resultados      // { gameId: { homeGoals, awayGoals, foi_penaltis... } }
APP.resultadosSim   // null ou { gameId: { homeGoals, awayGoals } } (Simulação)
APP.palpites        // { apostadorId: { gameId: { homeGoals, awayGoals } } }
APP.apostadores     // array [{ id, nome, apelido, token, especiais... }] (Sem MODELO)
APP.configStatus    // { liberado_grupos: true, ... }
APP.modelo          // { nome, apelido, especiais, tipo } (Dados do Apostador Modelo)
APP.palpitesModelo  // { gameId: { homeGoals, awayGoals } } (Palpites do Apostador Modelo)
```

## **Firestore (v10 SDK compat)** - Estrutura principal de dados (Formato Compacto)

- **`resultados_oficiais`**:
  - `dados` (Doc Único): `{ [gameId]: { gameId, homeGoals, awayGoals, foi_penaltis, penaltis_vencedor, penaltis_home, penaltis_away, inserido_em, inserido_por } }`
- **`apostadores`**:
  - `id` (Doc): `{ id, nome, apelido, token, criado_em, isModelo }` *(Nota: Pontuações e ranking são calculados em tempo real no cliente).*
  - **`dados`** (Sub-coleção) -> `palpites` (Doc Único):
    - `{ especiais: { campeao, vice, terceiro }, [gameId]: "homeGoals-awayGoals" }` (Nota: palpites de apostadores **nunca** salvam pênaltis no banco, apenas gols regulamentares. Os pênaltis de palpites são voláteis na interface para estimativa visual local de avanço de bracket).
- **`cache`**:
  - `palpites_grupos` (Doc): `{ gerado_em, palpites: { [apostadorId]: { [gameId]: { hg, ag } } }, apostadores: [ { id, nome, apelido, ordem, especiais, token, isModelo } ] }`
  - `palpites_eliminatorias` (Doc): `{ gerado_em, palpites: { [apostadorId]: { [gameId]: { hg, ag } } } }`
  - `tokens` (Doc): `{ [tokenDocId]: { id, numero, token, ativo, nome, apelido, criado_em, pago } }`
- **`config`**:
  - `status` (Doc): `{ liberado_grupos, liberado_16avos, liberado_oitavas, liberado_quartas, liberado_semis, liberado_final, liberado_terceiro, cache_res_ts, cache_grupos_ts, cache_elim_ts }`
- **`tokens`**:
  - `id` (Doc): `{ id, numero, token, ativo, nome, apelido, criado_em, pago }`

## ⚠️ DIRETRIZES CRÍTICAS DE COTAS E DESENVOLVIMENTO (MANDATÓRIO)

1.  **Minimização Absoluta de Reads no Firestore:**
    *   **NUNCA** faça queries globais ou loops de carregamento (`.get()`) de múltiplos documentos de apostadores na UI pública (index.html). Todo o painel deve ser alimentado em **1 ou 2 Reads** a partir dos snapshots compactados em `cache/palpites_grupos` e `cache/palpites_eliminatorias`.
    *   A tela do apostador (`aposta.html`) deve ler **apenas** o documento compacto específico daquele participante em `dados/palpites` (1 Read).
    *   Sempre use `sessionStorage` como primeira camada antes de requisitar qualquer dado ao Firestore.
2.  **Minimização Absoluta de Writes (Gravações):**
    *   Use debounces no input de gols e **nunca** ative saves automáticos direto no banco a cada caractere digitado nas caixas de palpites. Os palpites do usuário devem ser salvos apenas quando ele clicar explicitamente no botão de salvar ("💾 SALVAR PALPITES").
3.  **Segurança e Validação Administrativa:**
    *   Todas as ações administrativas destrutivas (`limparResultado`, `toggleStatusFase`, `gerarCachePalpites`) no painel de admin **devem** obrigatoriamente exigir diálogos claros de confirmação (`confirm(...)`) para evitar cliques acidentais e alertar o administrador sobre o impacto na cota de leitura diária do Firebase.
4.  **Consistência de Abas (Mobile-First):**
    *   Toda a interface deve ser desenvolvida priorizando o layout Mobile-First, utilizando HSL nos estilos e variáveis CSS consistentes do Design System de `style.css`.
    *   Navegações de abas devem re-renderizar componentes usando `window.renderAbaAtiva()` sem dar refresh na página ou perder estados visuais de simulação.
5.  **Apostador MODELO como Referência:**
    *   O participante estatístico com `isModelo: true` (apelido `"MODELO"`) serve como benchmark de desempenho de IA. Ele **deve** aparecer nas tabelas de classificação (leaderboard), compilados de palpites e gráficos de evolução misturado aos outros apostadores para fins de comparação direta de performance.
    *   No entanto, ele **nunca** deve ser contabilizado em estatísticas administrativas ou de controle financeiro humano (como contagem de tokens reais, cadastros ativos de apostadores de verdade ou controles de pagamento).
    *   Utilize a função `window.getModelo()` para extrair de forma isolada seus dados de compatibilidade e palpites nos componentes cliente (`tab-*.js` e `aposta.js`).

## 🔒 SEGURANÇA E PREVENÇÃO DE VAZAMENTOS (CRÍTICO)

1.  **Privacidade e Não-Vazamento de Tokens de Usuários:**
    *   **Risco Crítico:** O `token` individual é a chave única de autenticação de cada apostador. Qualquer pessoa que obtenha o token de outro participante pode acessar a URL `aposta.html?token=XXXX` e adulterar ou fraudar seus palpites.
    *   **Diretriz de Mitigação:** NUNCA exponha os tokens dos apostadores em interfaces públicas, cabeçalhos de visualização ou exportações comparativas de dados (como arquivos CSV/JSON). Nas views públicas do painel principal (`index.html`), garanta que os tokens de terceiros permaneçam inacessíveis por meio de inspeção direta de DOM ou console.
2.  **Proteção contra Vazamento de Palpites Ativos (Prevenção de Plágio e Espionagem):**
    *   **Risco Crítico:** Se os palpites de um jogo ativo forem divulgados enquanto a janela de apostas daquele jogo (ou de sua fase correspondente) ainda estiver aberta, outros concorrentes poderão copiar os mesmos resultados ou alterar seus próprios palpites de forma oportunista/estratégica para neutralizar adversários diretos.
    *   **Diretriz de Mitigação:** As visualizações comparativas e listagens completas (`tab-compilacao.js` e `tab-estatisticas.js`) **devem** ocultar os palpites de outros concorrentes (exibindo obrigatoriamente um cadeado `🔒` ou omitindo os dados) se:
        *   O jogo ainda estiver aceitando apostas (`jogoAceita(jogoId) === true`).
        *   O jogo ainda não possuir resultado oficial publicado (`temRes === false`).
    *   **Exceção de Acesso:** Palpites de concorrentes só podem ficar visíveis na grade comparativa quando a respectiva janela de palpites para a partida for bloqueada (fechada) ou após o lançamento do resultado oficial.

## Funções Críticas

### Lógica e Cálculos

- `gerarRanking(todosOsPalpites, resultados, participantes, especiais)`: Gera o leaderboard ordenado com critérios de desempate.
- `calcularTodosOsGrupos(resultados)`: Calcula classificação de todos os grupos e define os melhores 3ºs colocados.
- `preencherBracket(resultados)`: Resolve todos os confrontos do mata-mata com base nos resultados inseridos.
- `calcularPontosBrutos(palpite, resultado)`: Retorna `{total_bruto, bonus_pts, bonus_tipo}`.
- `aplicarFator(pontos, fase)`: Multiplica pontos pelo peso da fase (ex: final x2.0).

### Persistência e Estado

- `salvarTodosPalpites()`: Persiste todos os palpites compactados do apostador logado em `dados/palpites` (1 Write total).
- `gravarResultadoOficial(gameId, ...)` / `gravarTudoAdmin()`: Persiste resultados oficiais (Admin).
- `simularResultado(gameId, hg, ag, ...)`: Ativa modo de simulação e atualiza o estado visual local sem persistir.
- `jogoAceita(jogoId)`: Verifica se a janela de apostas para o jogo está aberta via `APP.configStatus`.

### Gerenciamento da IA Modelo

- `MODELO_MANAGER.atualizar()`: Aciona Dixon-Coles estatístico para gerar o palpite de máxima expectativa de pontos da próxima fase elegível aberta do MODELO.
- `MODELO_MANAGER.limparFase(faseKey)`: Exclui palpites do MODELO para determinada fase do banco e do cache.
- `MODELO_MANAGER.limparTodas()`: Limpa todos os palpites e apostas especiais do MODELO de forma definitiva.

### Renderização e UI

- `window.renderAbaAtiva(resetScroll)`: Re-renderiza a aba atual com os dados mais recentes, preservando scroll/foco.
- `renderJogosComToggle(res, tg, isAdm, palApo)`: Componente mestre que renderiza a lista de jogos com filtros e mini-tabelas.
- `PROGNOSE.calcular(hCode, aCode)`: Motor estatístico Poisson/Dixon-Coles para probabilidades de placar.
- `PROGNOSE.abrirModal(gameId)`: Abre o modal de detalhes, estatísticas e estádio de um jogo.
