# CLAUDE.md - Instruções para a IA neste Projeto

## REGRA CRÍTICA: SEJA SUCINTO
- **Não gere explicações longas antes de agir** - escreva o código diretamente.
- **Use as ferramentas apropriadas** para edição (`replace_file_content`, `multi_replace_file_content`).
- **Não re-explique** o que o código faz após escrever.
- Mantenha o padrão **Premium & Mobile-First**.

## Stack e Arquitetura
- **Core**: HTML5 + Vanilla CSS + Vanilla JS (ES6).
- **Sem Bundlers**: Não use `import/export`. Tudo é global via `window` ou funções declaradas no escopo global.
- **Firebase**: Uso nativo do Firebase SDK (v8). Firestore como banco principal.
- **Modo Offline**: Sincronização automática com `localStorage` via `carregarDadosLocais()` e `_persistirLocal()` em `app.js`.

## Estrutura de Arquivos
- `index.html`: Dashboard principal (Roteador de abas: Resultados, Classificação, Gráfico, Tabela, Compilação, Estatísticas, Regras).
- `aposta.html`: Área do apostador (Acesso via `?token=XXXX`).
- `admin.html`: Painel administrativo (Gestão de resultados e usuários).
- `js/`:
    - `app.js`: Núcleo, listeners Firestore, estado global `APP`.
    - `scoring.js`: Motor de pontos. Funções puras (`calcularPontosBrutos`).
    - `ui-jogos.js`: Componente mestre de renderização de jogos e filtros.
    - `tab-compilacao.js`: Grade comparativa + exportação JSON/CSV.
    - `tab-classificacao.js`: Ranking e detalhes do apostador.
    - `bracket.js`: Lógica de chaveamento e standings.
    - `prognose.js`: Probabilidades Dixon-Coles.
- `data/`:
    - `config.js`: Regras de bônus, multiplicadores e prazos.
    - `teams.js`: Dados das seleções e bandeiras.
    - `schedule.js`: Calendário oficial (104 jogos).
- `modelo/`: Artefatos da simulação estatística (Dixon-Coles).

## Estado Global (APP)
```javascript
APP.db              // Instância Firestore
APP.modoOffline     // boolean
APP.resultados      // { gameId: {homeGoals, awayGoals, foi_penaltis...} }
APP.palpites        // { apostadorId: { gameId: {homeGoals, awayGoals} } }
APP.apostadores     // array [{id, nome, apelido, token, especiais...}]
APP.configStatus    // { liberado_grupos: true, ... }
```

## Pontuação e Bônus (NÃO CUMULATIVOS)
O cálculo segue uma escala rígida de pontos brutos multiplicada pelo fator da fase:
- **8 pts**: Placar Exato Alto (Total gols ≥ 4).
- **6 pts**: Placar Exato Baixo (Total gols < 4).
- **4 pts**: Acerto de Resultado + 1 Bônus (Diferença de Gols OU Gols de um time).
- **3 pts**: Apenas Resultado (Vitória/Empate).
- **0 pts**: Erro.

**Regra de Bônus**: Se o apostador acerta a diferença de gols, o bônus de "gols de um time" é ignorado (não acumula). Placar exato mata todos os bônus anteriores e entrega os 6 ou 8 pontos diretamente.

## UI & Design
- **Paleta de Cores (Compilação)**:
    - 8 pts: Indigo Profundo (`rgba(49, 46, 129, 0.4)`)
    - 6 pts: Sky Blue Suave (`rgba(186, 230, 253, 0.12)`)
    - 4 pts: Teal / Verde-Água (`rgba(20, 184, 166, 0.18)`)
    - 3 pts: Verde Sóbrio (`rgba(21, 128, 61, 0.12)`)
    - Erro: Vermelho Suave (`rgba(239, 68, 68, 0.06)`)
- **Privacidade**: Palpites de terceiros são exibidos como cadeado `🔒` se o jogo ainda não teve resultado oficial.

## Funções Críticas
- `window.renderAbaAtiva()`: Re-renderiza a aba atual com os dados mais recentes.
- `calcularPontosBrutos(palpite, resultado)`: Retorna `{total_bruto, bonus_pts, bonus_tipo}`.
- `aplicarFator(pontos, fase)`: Multiplica pontos pelo peso da fase (ex: final x2.0).
- `jogoAceita(jogoId)`: Verifica se o prazo de aposta para o jogo está aberto.
