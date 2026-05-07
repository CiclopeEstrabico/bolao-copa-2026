/**
 * tab-aproveitamento.js - Aba 6: Aproveitamento individual por apostador
 * Dependencias: scoring.js, app.js
 */
window.renderAproveitamento = function() {
  const el = document.getElementById("aba-aproveitamento");
  if (!el) return;
  const apostadores = APP.apostadores;
  if (!apostadores.length) {
    el.innerHTML = "<div class='card'><p style='color:var(--cinza);text-align:center;padding:40px'>Nenhum apostador cadastrado ainda.</p></div>";
    return;
  }
  const res = getResultados();
  const ranking = gerarRanking(APP.palpites, res, apostadores);
  let h = "<div class='card'><div class='card-titulo'>Aproveitamento por Apostador</div>";
  const medalhas = ["ouro","prata","bronze"];
  for (const item of ranking) {
    const s = item.stats;
    const nome = item.participante.apelido || item.participante.nome || item.participante.id || "Apostador";
    const jogosApostados = s.acertos_placar_exato + s.acertos_resultado + s.erros;
    const pctPlacar = jogosApostados ? Math.round(s.acertos_placar_exato / jogosApostados * 100) : 0;
    const pctRes    = jogosApostados ? Math.round((s.acertos_placar_exato + s.acertos_resultado) / jogosApostados * 100) : 0;
    const medal = item.posicao <= 3 ? ["<span class='medalha'>🥇</span>","<span class='medalha'>🥈</span>","<span class='medalha'>🥉</span>"][item.posicao-1] : "";
    const posClass = medalhas[item.posicao - 1] || "";
    h += `<div style="margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid var(--borda)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-weight:700;font-size:.95rem">${medal} ${item.posicao}. ${nome}</span>
        <span style="font-weight:800;color:var(--roxo);font-size:1.05rem">${s.total} pts</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-bottom:8px">
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px">
          <div style="background:var(--fundo);border-radius:6px;padding:8px;text-align:center">
            <div style="font-size:1.2rem;font-weight:800;color:var(--verde-ok)">${s.acertos_placar_exato}</div>
            <div style="font-size:.72rem;color:var(--texto2)">Placar exato</div>
          </div>
          <div style="background:var(--fundo);border-radius:6px;padding:8px;text-align:center">
            <div style="font-size:1.2rem;font-weight:800;color:#388e3c">${s.acertos_resultado}</div>
            <div style="font-size:.72rem;color:var(--texto2)">Resultado</div>
          </div>
          <div style="background:var(--fundo);border-radius:6px;padding:8px;text-align:center">
            <div style="font-size:1.2rem;font-weight:800;color:var(--vermelho-err)">${s.erros}</div>
            <div style="font-size:.72rem;color:var(--texto2)">Erros</div>
          </div>
          <div style="background:var(--fundo);border-radius:6px;padding:8px;text-align:center">
            <div style="font-size:1.2rem;font-weight:800;color:var(--cinza)">${s.sem_palpite}</div>
            <div style="font-size:.72rem;color:var(--texto2)">Sem palpite</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;justify-content:center;gap:8px">
          <div>
            <div style="display:flex;justify-content:space-between;font-size:.75rem;margin-bottom:3px">
              <span>Acerto resultado</span><span style="font-weight:700">${pctRes}%</span>
            </div>
            <div class="bar-fundo"><div class="bar-fill" style="width:${pctRes}%;background:linear-gradient(90deg,#2e7d32,#66bb6a)"></div></div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;font-size:.75rem;margin-bottom:3px">
              <span>Placar exato</span><span style="font-weight:700">${pctPlacar}%</span>
            </div>
            <div class="bar-fundo"><div class="bar-fill" style="width:${pctPlacar}%"></div></div>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:12px;font-size:.78rem;color:var(--texto2);flex-wrap:wrap">
        <span>Grupos: <strong>${s.total_grupos}</strong> pts</span>
        <span>Eliminatorias: <strong>${s.total_eliminatorias}</strong> pts</span>
        <span>Especiais: <strong>${s.total_especiais}</strong> pts</span>
        <span>${s.jogos_realizados} jogos realizados</span>
      </div>
    </div>`;
  }
  h += "</div>";
  el.innerHTML = h;
};