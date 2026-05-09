# CLAUDE.md - Instruções para a IA neste Projeto

## REGRA CRÍTICA: SEJA SUCINTO

- **Não gere explicações longas antes de agir** - escreva o código diretamente.
- **Use as ferramentas apropriadas** para edição (replace_file_content, multi_replace_file_content).
- **1 tool call por arquivo** - não paralelize modificações em arquivos interdependentes.
- **Não re-explique** o que o código faz após escrever.

## Mobile-first

- O front-end deve ser otimizado para ser mostrado em celulares
- Tudo deve funcionar em browser do Android, Iphone e **Desktop também.**

## Stack e Restrições

- HTML + CSS + JS puro, sem npm/bundler/TypeScript.
- **Sem import/export** - tudo em `window.NOME` ou funções globais.
- Firebase incorporado nativamente.
- Modo offline obrigatório via `localStorage` - toda função que toca o Firebase deve checar `APP.modoOffline`.

## Estrutura de Arquivos

```text
data/          Estáticos: config.js, teams.js, schedule.js, tokens.js, elo.js
css/           style.css (dark theme, mobile-first, --roxo, --dourado)
js/
  app.js       NÚCLEO: Configuração do Firebase, APP global, roteador, utilitários
  scoring.js   Motor de pontos (funções puras sem DOM)
  bracket.js   Progressão do torneio (BRACKET.*)
  prognose.js  Poisson ELO e Estatísticas Específicas (PROGNOSE.*)
  tab-*.js     Renderização específica de cada aba (Aproveitamento fundido com Compilação)
  admin.js     Lógica de admin.html
  aposta.js    Lógica de aposta.html
assets/        favicon.svg, logo_verde.avif (Padrão de logo), mascote.svg, trofeu.svg
tests/         scoring.test.html
modelo/
  results/     Artefatos da simulação (CSV, JSON, PNG, PKL)
  *.py         Scripts de treinamento e simulação (Dixon-Coles, GRU)
```

## Estado Global (APP)

```javascript
APP.db              // Objeto Firestore | null (offline)
APP.modoOffline     // booleano
APP.modoSimulacao   // booleano
APP.resultados      // { gameId: {homeGoals, awayGoals, foi_penaltis, ...} }
APP.resultadosSim   // cópia temporária para cálculos de simulação
APP.palpites        // { apostadorId: { gameId: {homeGoals, awayGoals} } }
APP.apostadores     // array
APP.bracket         // resultado de BRACKET.preencherBracket()
```

## Funções Globais Críticas

```javascript
getResultados()                    // -> resultados efetivos (simulados ou oficiais)
gravarResultadoOficial(id,hg,ag)   // (obsoleta na nova estrutura - usar lógica de admin.js)
gravarPalpite(apoId,gameId,hg,ag)
gravarApostador(apostador)
simularResultado(id,hg,ag,foiPen,penVenc)
atualizarBracket()
renderAbaAtiva()
formatarDataBRT(utcStr, soHora)    // -> string de Data BRT
htmlBandeira(code, size)           // -> HTML da imagem/svg da bandeira
jogoAceita(jogoId)                 // -> booleano (prazo em aberto)
adminAutenticado()                 // -> booleano
PROGNOSE.abrirModal(gameId)
PROGNOSE.fecharModal()
BRACKET.preencherBracket(res)      // -> {gameId: {home, away, ...}}
BRACKET.calcularTodosOsGrupos(res) // -> {grupos, classificados, terceiros}
```

## IDs dos Jogos

- Grupos: `C_R1_BRA_MAR` (grupo_rodada_home_away)
- 32 Avos: `R32_1` a `R32_16`
- Oitavas: `R16_1` a `R16_8`
- Quartas: `QF_1` a `QF_4`
- Semis: `SF_1`, `SF_2`
- 3º Lugar: `TPL` | Final: `FNL`

## Pontuação

| Situação                | Pts brutos |
| ------------------------- | ---------- |
| Errou                     | 0          |
| Resultado Correto         | 3          |
| + diferença de gols      | 3+1=4      |
| + gols de um time         | 3+1=4      |
| Placar exato (total < 4)  | 3+3=6      |
| Placar exato (total >= 4) | 3+5=8      |

Fatores de Fase: Grupos (×1.0), 32 Avos (×1.2), Oitavas (×1.4), Quartas (×1.6), Semis (×1.8), 3º/Final (×2.0)
Bônus Especiais: Campeão (+7), Vice (+4), 3º (+2)

## Pênaltis

- Apenas fases eliminatórias (32 Avos em diante).
- Se Placar 90min + Prorrogação termina empatado, quem apostou empate no bolão ganha os pontos de acerto de resultado, ou seja, os pênaltis não contam para o bolão.
- Dados armazenados: `penaltis_home`, `penaltis_away` (empate não é permitido nos pênaltis).
- Extração automática de `penaltis_vencedor` dos placares.

## Firestore

```text
/config/global
/apostadores/{id}
/apostadores/{id}/palpites_jogos/{gameId}
/resultados_oficiais/{gameId}
```
