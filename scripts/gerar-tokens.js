/**
 * gerar-tokens.js - Script para gerar tokens de convite
 * Rodar no browser: abrir console e colar este codigo
 * Ou rodar com Node.js: node scripts/gerar-tokens.js
 */

const QUANTIDADE = 100; // quantos tokens gerar
const BASE_URL = "https://CiclopeEstrabico.github.io/bolao-copa-2026";

function gerarToken() {
  const arr = new Uint8Array(8);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    // Node.js fallback
    const c = require("crypto");
    const b = c.randomBytes(8);
    arr.set(b);
  }
  return Array.from(arr).map(b => b.toString(16).padStart(2,"0")).join("");
}

const tokens = [];
for (let i = 0; i < QUANTIDADE; i++) {
  tokens.push(gerarToken());
}

console.log("// Cole isto em data/tokens.js:");
console.log("window.TOKENS_DISPONIVEIS = [");
tokens.forEach(t => console.log(`  "${t}",`));
console.log("];");
console.log("\n// Links:");
tokens.forEach((t, i) => {
  console.log(`Token ${i+1}: ${BASE_URL}/aposta.html?token=${t}`);
});