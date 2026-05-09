# Bolao Aeronautica - Copa do Mundo 2026

Sistema web para bolao da Copa 2026. Hospedagem gratuita: GitHub Pages + Firebase Firestore.

## Testar offline (sem internet)
1. Abra `index.html` diretamente no navegador
2. Sistema detecta ausencia de Firebase e entra em modo offline
3. Dados salvos no localStorage do navegador

## Estrutura
```
index.html        Painel publico (6 abas)
aposta.html       Palpites do apostador (?token=XXXX)
admin.html        Insercao de resultados (senha: #bolao2026#)
firebase-config.js Credenciais Firebase (preencher antes do deploy)
firestore.rules   Regras de seguranca
CLAUDE.md         Instrucoes para AI assistente
deploy.md         Guia de deploy passo a passo

data/
  config.js       Regras de pontuacao, 6 prazos, senha admin
  teams.js        48 selecoes (grupos A-L, bandeiras, ELO)
  schedule.js     104 jogos em UTC com IDs
  tokens.js       200 tokens pre-gerados para apostadores
  elo.js          Ratings ELO + parametros do modelo Poisson

css/
  style.css       Tema escuro premium, mobile-first

js/
  app.js          Nucleo: Firebase, estado global, roteador, utilitarios
  scoring.js      Motor de pontuacao (funcoes puras)
  bracket.js      Progressao do torneio (standings, melhores 3os, bracket)
  prognose.js     Motor Poisson + modal de prognostico estatistico
  tab-resultados.js  Aba 1: resultados, tabelas de grupos, simulacao
  tab-classificacao.js Aba 2+3: grafico e tabela detalhada
  tab-compilacao.js   Aba 4: grade de palpites x apostadores
  tab-estatisticas.js Aba 5: % de apostas por resultado
  tab-aproveitamento.js Aba 6: aproveitamento individual
  aposta.js       Logica de aposta.html
  admin.js        Logica de admin.html

assets/
  favicon.svg, mascote.svg, trofeu.svg

tests/
  scoring.test.html  Suite de testes (abrir no browser)

scripts/
  gerar-tokens.js Script para gerar novos tokens

modelo/
  results/        Artefatos da simulação (CSV, JSON, PNG, PKL)
  *.py            Scripts de treinamento e simulação (Dixon-Coles, GRU)
```

## Pontuacao
| Situacao | Pts base |
|---|---|
| Errou o resultado | 0 |
| Apenas resultado | 3 |
| + diferenca de gols | +1 |
| + gols de um time | +1 |
| Placar exato (total < 4) | 6 |
| Placar exato (total >= 4) | 8 |

Fases: grupos×1.0, 32avos×1.2, oitavas×1.4, quartas×1.6, semis×1.8, 3o/final×2.0
Especiais (antes do 1o jogo): campeao+7, vice+4, 3o+2

## Fluxo de uso
1. Admin gera tokens → envia links `aposta.html?token=XXX` para cada apostador
2. Apostadores preenchem palpites da fase de grupos + especiais (antes do prazo)
3. Copa começa → admin insere resultados via `admin.html`
4. Ranking atualiza automaticamente em tempo real
5. A cada nova fase, abre-se o prazo de palpites para aquela fase

## Para o deploy
Ver `deploy.md` para instrucoes completas passo a passo.