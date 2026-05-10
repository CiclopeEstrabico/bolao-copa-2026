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

### `modelo/` (Estatística e Simulação)
- `/results`: Contém os artefatos (JSON/CSV) gerados pelas simulações de Monte Carlo (Dixon-Coles).
- **Utilidade**: Esses dados alimentam o motor de prognósticos na interface, permitindo que os apostadores vejam as probabilidades de vitória/empate para cada jogo baseadas em modelos matemáticos.

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

## 📊 Regras Detalhadas de Pontuação

O sistema utiliza uma lógica de **pontos brutos** que são posteriormente multiplicados pelo peso da fase. Os bônus **não são cumulativos** entre si (aplica-se apenas o maior bônus alcançado).

### 1. Pontuação por Jogo (Fase de Grupos)
| Pontos | Critério de Acerto | Descrição Detalhada |
| :---: | :--- | :--- |
| **8** | **Placar Exato Alto** | Acerto do placar exato em jogos com 4 ou mais gols (ex: 2x2, 3x1, 4x0). |
| **6** | **Placar Exato Baixo** | Acerto do placar exato em jogos com menos de 4 gols (ex: 1x0, 2x1, 0x0). |
| **4** | **Resultado + Bônus** | Acertou o vencedor ou empate, errou o placar, mas acertou a **Diferença de Gols** (ex: apostou 2x0, foi 3x1) OU acertou os **Gols de um dos times**. |
| **3** | **Apenas Resultado** | Acertou apenas o vencedor ou que seria empate, errando o placar e os bônus acima. |
| **0** | **Erro Total** | Errou o vencedor ou o fato de ser empate. |

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