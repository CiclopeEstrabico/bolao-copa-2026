/**
 * teams.js — 48 seleções da Copa do Mundo 2026
 * Grupos A–L conforme sorteio oficial.
 * Bandeiras via flagicons.lipis.dev (MIT license).
 */

// Helper para montar URL da bandeira
const _flag = code => `https://flagicons.lipis.dev/flags/4x3/${code}.svg`;

window.TEAMS = [
  // ── GRUPO A ──────────────────────────────────────────────────────────────
  { code: "MEX", name: "México", flag: _flag("mx"), group: "A", confederation: "CONCACAF" },
  { code: "RSA", name: "África do Sul", flag: _flag("za"), group: "A", confederation: "CAF" },
  { code: "KOR", name: "Coreia do Sul", flag: _flag("kr"), group: "A", confederation: "AFC" },
  { code: "CZE", name: "República Tcheca", flag: _flag("cz"), group: "A", confederation: "UEFA" },

  // ── GRUPO B ──────────────────────────────────────────────────────────────
  { code: "CAN", name: "Canadá", flag: _flag("ca"), group: "B", confederation: "CONCACAF" },
  { code: "BIH", name: "Bósnia", flag: _flag("ba"), group: "B", confederation: "UEFA" },
  { code: "QAT", name: "Qatar", flag: _flag("qa"), group: "B", confederation: "AFC" },
  { code: "SUI", name: "Suíça", flag: _flag("ch"), group: "B", confederation: "UEFA" },

  // ── GRUPO C ──────────────────────────────────────────────────────────────
  { code: "BRA", name: "Brasil", flag: _flag("br"), group: "C", confederation: "CONMEBOL" },
  { code: "MAR", name: "Marrocos", flag: _flag("ma"), group: "C", confederation: "CAF" },
  { code: "HAI", name: "Haiti", flag: _flag("ht"), group: "C", confederation: "CONCACAF" },
  { code: "SCO", name: "Escócia", flag: _flag("gb-sct"), group: "C", confederation: "UEFA" },

  // ── GRUPO D ──────────────────────────────────────────────────────────────
  { code: "USA", name: "Estados Unidos", flag: _flag("us"), group: "D", confederation: "CONCACAF" },
  { code: "PAR", name: "Paraguai", flag: _flag("py"), group: "D", confederation: "CONMEBOL" },
  { code: "AUS", name: "Austrália", flag: _flag("au"), group: "D", confederation: "AFC" },
  { code: "TUR", name: "Turquia", flag: _flag("tr"), group: "D", confederation: "UEFA" },

  // ── GRUPO E ──────────────────────────────────────────────────────────────
  { code: "GER", name: "Alemanha", flag: _flag("de"), group: "E", confederation: "UEFA" },
  { code: "CUW", name: "Curaçao", flag: _flag("cw"), group: "E", confederation: "CONCACAF" },
  { code: "CIV", name: "Costa do Marfim", flag: _flag("ci"), group: "E", confederation: "CAF" },
  { code: "ECU", name: "Equador", flag: _flag("ec"), group: "E", confederation: "CONMEBOL" },

  // ── GRUPO F ──────────────────────────────────────────────────────────────
  { code: "NED", name: "Holanda", flag: _flag("nl"), group: "F", confederation: "UEFA" },
  { code: "JPN", name: "Japão", flag: _flag("jp"), group: "F", confederation: "AFC" },
  { code: "SWE", name: "Suécia", flag: _flag("se"), group: "F", confederation: "UEFA" },
  { code: "TUN", name: "Tunísia", flag: _flag("tn"), group: "F", confederation: "CAF" },

  // ── GRUPO G ──────────────────────────────────────────────────────────────
  { code: "BEL", name: "Bélgica", flag: _flag("be"), group: "G", confederation: "UEFA" },
  { code: "EGY", name: "Egito", flag: _flag("eg"), group: "G", confederation: "CAF" },
  { code: "IRN", name: "Irã", flag: _flag("ir"), group: "G", confederation: "AFC" },
  { code: "NZL", name: "Nova Zelândia", flag: _flag("nz"), group: "G", confederation: "OFC" },

  // ── GRUPO H ──────────────────────────────────────────────────────────────
  { code: "ESP", name: "Espanha", flag: _flag("es"), group: "H", confederation: "UEFA" },
  { code: "CPV", name: "Cabo Verde", flag: _flag("cv"), group: "H", confederation: "CAF" },
  { code: "KSA", name: "Arábia Saudita", flag: _flag("sa"), group: "H", confederation: "AFC" },
  { code: "URU", name: "Uruguai", flag: _flag("uy"), group: "H", confederation: "CONMEBOL" },

  // ── GRUPO I ──────────────────────────────────────────────────────────────
  { code: "FRA", name: "França", flag: _flag("fr"), group: "I", confederation: "UEFA" },
  { code: "SEN", name: "Senegal", flag: _flag("sn"), group: "I", confederation: "CAF" },
  { code: "IRQ", name: "Iraque", flag: _flag("iq"), group: "I", confederation: "AFC" },
  { code: "NOR", name: "Noruega", flag: _flag("no"), group: "I", confederation: "UEFA" },

  // ── GRUPO J ──────────────────────────────────────────────────────────────
  { code: "ARG", name: "Argentina", flag: _flag("ar"), group: "J", confederation: "CONMEBOL" },
  { code: "ALG", name: "Argélia", flag: _flag("dz"), group: "J", confederation: "CAF" },
  { code: "AUT", name: "Áustria", flag: _flag("at"), group: "J", confederation: "UEFA" },
  { code: "JOR", name: "Jordânia", flag: _flag("jo"), group: "J", confederation: "AFC" },

  // ── GRUPO K ──────────────────────────────────────────────────────────────
  { code: "POR", name: "Portugal", flag: _flag("pt"), group: "K", confederation: "UEFA" },
  { code: "COD", name: "R. Congo", flag: _flag("cd"), group: "K", confederation: "CAF" },
  { code: "UZB", name: "Uzbequistão", flag: _flag("uz"), group: "K", confederation: "AFC" },
  { code: "COL", name: "Colômbia", flag: _flag("co"), group: "K", confederation: "CONMEBOL" },

  // ── GRUPO L ──────────────────────────────────────────────────────────────
  { code: "ENG", name: "Inglaterra", flag: _flag("gb-eng"), group: "L", confederation: "UEFA" },
  { code: "CRO", name: "Croácia", flag: _flag("hr"), group: "L", confederation: "UEFA" },
  { code: "GHA", name: "Gana", flag: _flag("gh"), group: "L", confederation: "CAF" },
  { code: "PAN", name: "Panamá", flag: _flag("pa"), group: "L", confederation: "CONCACAF" },
];

// Alias para exibição compacta (Mobile/Tabelas)
window.TEAM_ALIASES = {
  "República Tcheca": "R. Tcheca",
  "Coreia do Sul": "S. Coreia",
  "África do Sul": "S. África",
  "Estados Unidos": "E. Unidos",
  "Costa do Marfim": "C. Marfim",
  "Nova Zelândia": "N. Zelândia",
  "Arábia Saudita": "A. Saudita",
  "Uzbequistão": "Uzbequist."
};

window.getShortName = function (code) {
  const team = window.TEAMS_BY_CODE[code];
  if (!team) return code;
  // Se for desktop, retorna o nome completo
  if (window.innerWidth > 600) return team.name;
  // Se for mobile, retorna o alias se existir
  return window.TEAM_ALIASES[team.name] || team.name;
};

// Lookup rápido por código
window.TEAMS_BY_CODE = Object.fromEntries(TEAMS.map(t => [t.code, t]));
