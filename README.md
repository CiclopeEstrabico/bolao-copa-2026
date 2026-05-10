# 🏆 Bolão Copa do Mundo 2026

![Status](https://img.shields.io/badge/Status-Produ%C3%A7%C3%A3o-success)
![Tech](https://img.shields.io/badge/Stack-HTML5%20%7C%20JS%20%7C%20Firebase-blue)
![Mobile](https://img.shields.io/badge/Mobile-First-orange)

Plataforma profissional para gerenciamento de bolão da Copa do Mundo 2026, com processamento estatístico (Dixon-Coles), ranking em tempo real e interface responsiva premium.

---

## 🔗 Páginas Principais

| Página | Descrição | Link |
| :--- | :--- | :--- |
| **Dashboard** | Painel público com resultados, classificação e compilação. | [index.html](index.html) |
| **Área de Apostas** | Espaço personalizado para o apostador preencher palpites. | [aposta.html](aposta.html) |
| **Painel Admin** | Controle de resultados, tokens e liberação de fases. | [admin.html](admin.html) |

---

## 📂 Estrutura do Projeto e Arquivos

### Raiz
- `index.html`: Ponto de entrada. Gerencia as abas de Resultados, Classificação, Tabela, Compilação, Estatísticas e Regras.
- `aposta.html`: Interface para usuários logados via Token. Permite salvar palpites de jogos e especiais.
- `admin.html`: Painel restrito para entrada de placares oficiais e gestão de usuários.
- `firebase-config.js`: Configurações de conexão com o Google Firebase.
- `firestore.rules`: Definições de segurança do banco de dados.

### `js/` (Lógica do Sistema)
- `app.js`: Inicialização, sincronização Firestore, roteador de abas e estado global.
- `scoring.js`: Motor de cálculo. Implementa a lógica 8/6/4/3 pontos e bônus não cumulativos.
- `ui-jogos.js`: Componente visual compartilhado para renderização de listas de jogos e filtros.
- `tab-compilacao.js`: Grade comparativa de todos os palpites, incluindo exportação JSON/CSV.
- `tab-classificacao.js`: Gerenciamento do ranking, desempates e visualização de detalhes do apostador.
- `bracket.js`: Lógica de progressão do torneio (standings, melhores 3ºs e chaveamento).
- `prognose.js`: Integração com o modelo estatístico para exibir probabilidades.

### `data/` (Dados Estáticos)
- `config.js`: **Única fonte de verdade** para bônus, multiplicadores de fase e prazos.
- `teams.js`: Dados das 48 seleções, grupos, bandeiras e ratings ELO iniciais.
- `schedule.js`: Calendário completo dos 104 jogos da Copa.
- `tokens.js`: Lista de identificadores únicos para acesso dos apostadores.

### `css/`
- `style.css`: Design system premium, dark mode, variáveis CSS e responsividade mobile-first.

---

## 🗄️ Banco de Dados (Firebase Firestore)

O sistema utiliza o Firestore como banco NoSQL em tempo real. Estrutura das coleções:

### `resultados_oficiais` (Coleção)
Documentos identificados pelo `gameId` (ex: `j1`).
- `homeGoals` (number): Gols do mandante.
- `awayGoals` (number): Gols do visitante.
- `foi_penaltis` (boolean): Indica se houve decisão por pênaltis.
- `penaltis_vencedor` (string): Código do time vencedor.

### `apostadores` (Coleção)
Documentos identificados pelo ID do apostador.
- `nome` / `apelido` (string): Identificação do usuário.
- `token` (string): Chave de acesso única.
- `especiais` (map): `{ campeao, vice, terceiro }`.
- **`palpites_jogos` (Sub-coleção)**:
    - Documentos ID: `gameId`.
    - `homeGoals` / `awayGoals` (number): Palpite do placar.
    - `fase` (string): Identificador da fase para filtros.

### `config` (Coleção)
- Documento `status`: Controla quais fases estão abertas para apostas (ex: `liberado_grupos: true`).

---

## 📊 Regras de Pontuação

| Situação | Pontos Brutos |
| :--- | :---: |
| **Placar Exato Alto** (Total gols ≥ 4) | **8** |
| **Placar Exato Baixo** (Total gols < 4) | **6** |
| **Resultado + 1 Bônus** (Diferença ou Gols) | **4** |
| **Apenas Resultado** (Vitória/Empate) | **3** |
| **Erro** | **0** |

*Os pontos brutos são multiplicados pelo fator da fase (ex: Final vale x2.0).*