/**
 * swipe-tabs.js — Swipe gestures para modais e tabs principais (mobile)
 *
 * Funcionalidades:
 * 1. Swipe horizontal no modal prognose → navega entre as 4 abas
 * 2. Swipe-up no modal prognose (perto do topo) → fecha o modal
 * 3. Swipe horizontal na página principal (mobile only) → navega entre as abas do index.html
 *
 * Só ativa em dispositivos touch.
 */
(function () {
  "use strict";

  const MIN_DIST_MODAL = 30;
  const MIN_DIST_MAIN  = 50;   // Mais conservador para a página principal
  const SWIPE_UP_DIST  = 60;
  const MOBILE_BP      = 600;

  function isTouchDevice() {
    return "ontouchstart" in window || navigator.maxTouchPoints > 0;
  }

  /**
   * Checa se o target está dentro de um container com scroll horizontal ativo.
   * Usado por ambos os swipe handlers para evitar interferência.
   */
  function isInsideHScrollable(target, boundary) {
    let el = target;
    while (el && el !== boundary && el !== document.body) {
      try {
        const cs = getComputedStyle(el);
        if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 2) return true;
      } catch (e) { /* ignore */ }
      el = el.parentElement;
    }
    return false;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SWIPE NO MODAL PROGNOSE
  // ════════════════════════════════════════════════════════════════════════════
  const MODAL_TABS = ["prev", "pal", "listpal", "est"];

  function getModalActiveTab() {
    for (const t of MODAL_TABS) {
      const btn = document.getElementById("mtab-" + t);
      if (btn && btn.classList.contains("ativo")) return t;
    }
    return MODAL_TABS[0];
  }

  function initModalSwipe() {
    const ov = document.getElementById("modal-prog");
    if (!ov || ov._swipeTabsSetup) return;
    ov._swipeTabsSetup = true;

    const box = document.getElementById("modal-prog-body");
    if (!box) return;

    let startX = 0, startY = 0;
    let tracking = false;

    box.addEventListener("touchstart", function (e) {
      if (e.touches.length > 1) { tracking = false; return; }
      if (isInsideHScrollable(e.target, box)) { tracking = false; return; }

      tracking = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });

    box.addEventListener("touchmove", function (e) {
      if (!tracking) return;
      const dx = Math.abs(e.touches[0].clientX - startX);
      const dy = Math.abs(e.touches[0].clientY - startY);
      if (dy > 60 && dy > dx * 2.5) { tracking = false; }
    }, { passive: true });

    box.addEventListener("touchend", function (e) {
      if (!tracking) return;
      tracking = false;
      if (!ov.classList.contains("aberto")) return;

      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;

      // Swipe-up para fechar
      if (dy < -SWIPE_UP_DIST && Math.abs(dy) > Math.abs(dx) * 1.3) {
        const boxRect = box.getBoundingClientRect();
        if ((startY - boxRect.top) < 120 && box.scrollTop <= 0) {
          PROGNOSE.fecharModal();
          return;
        }
      }

      // Swipe horizontal para trocar aba — exige dx dominante
      if (Math.abs(dx) < MIN_DIST_MODAL) return;
      if (Math.abs(dx) < Math.abs(dy) * 0.8) return;

      const atual = getModalActiveTab();
      const idx = MODAL_TABS.indexOf(atual);
      if (idx === -1) return;

      const nextIdx = dx < 0 ? idx + 1 : idx - 1;
      if (nextIdx < 0 || nextIdx >= MODAL_TABS.length) return;

      PROGNOSE._switchTab(MODAL_TABS[nextIdx]);
    }, { passive: true });

    box.addEventListener("touchcancel", function () { tracking = false; }, { passive: true });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SWIPE NAS ABAS PRINCIPAIS (index.html — mobile only)
  // ════════════════════════════════════════════════════════════════════════════
  const MAIN_TABS = ["resultados", "classificacao", "tabela", "compilacao", "estatisticas", "grafico", "regras"];

  function getMainActiveTab() {
    const hash = location.hash.replace("#", "");
    return MAIN_TABS.includes(hash) ? hash : "resultados";
  }

  function initMainSwipe() {
    if (document.body._mainSwipeSetup) return;
    document.body._mainSwipeSetup = true;

    let startX = 0, startY = 0;
    let tracking = false;
    let decided = false;   // já decidimos se é swipe horizontal ou scroll vertical
    let isHSwipe = false;  // se decidido, é horizontal?

    // Área de conteúdo principal — exclui header e tabs bar
    function getContentArea() {
      return document.querySelector(".main") || document.body;
    }

    // Checa se um modal está aberto (prognose, apostador, stat, etc)
    function isModalOpen() {
      const prog = document.getElementById("modal-prog");
      if (prog && prog.classList.contains("aberto")) return true;
      const stat = document.getElementById("modal-stat");
      if (stat && stat.classList.contains("aberto")) return true;
      // Dynamically created apostador modal
      const apostador = document.querySelector(".modal-overlay.aberto");
      if (apostador) return true;
      return false;
    }

    document.addEventListener("touchstart", function (e) {
      // Só mobile
      if (window.innerWidth > MOBILE_BP) return;
      // Não ativa durante modal
      if (isModalOpen()) return;
      // Multi-touch
      if (e.touches.length > 1) { tracking = false; return; }

      const content = getContentArea();
      // Só aceita toques dentro da área de conteúdo (não no header/tabs)
      if (content && !content.contains(e.target)) { tracking = false; return; }

      // Se está dentro de um container com scroll horizontal, não rastreia
      if (isInsideHScrollable(e.target, content || document.body)) { tracking = false; return; }

      tracking = true;
      decided = false;
      isHSwipe = false;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener("touchmove", function (e) {
      if (!tracking) return;
      if (window.innerWidth > MOBILE_BP) { tracking = false; return; }

      const cx = e.touches[0].clientX;
      const cy = e.touches[0].clientY;
      const dx = Math.abs(cx - startX);
      const dy = Math.abs(cy - startY);

      if (!decided) {
        // Espera um mínimo de movimento para decidir a intenção
        if (dx < 8 && dy < 8) return;

        if (dy > dx * 1.2) {
          // Gesto vertical → abortar, deixar scroll normal
          tracking = false;
          return;
        }
        if (dx > dy * 1.5 && dx > 12) {
          // Gesto horizontal → swipe de aba
          decided = true;
          isHSwipe = true;
        }
      }

      // Se ainda não decidiu e o gesto está ficando grande, abortar
      if (!decided && (dx > 30 || dy > 30)) {
        tracking = false;
      }
    }, { passive: true });

    document.addEventListener("touchend", function (e) {
      if (!tracking) return;
      tracking = false;
      if (window.innerWidth > MOBILE_BP) return;
      if (!decided || !isHSwipe) return;

      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;

      // Exige distância mínima e dominância horizontal
      if (Math.abs(dx) < MIN_DIST_MAIN) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.2) return;

      const atual = getMainActiveTab();
      const idx = MAIN_TABS.indexOf(atual);
      if (idx === -1) return;

      const nextIdx = dx < 0 ? idx + 1 : idx - 1;
      if (nextIdx < 0 || nextIdx >= MAIN_TABS.length) return;

      // Usar mudarAba se disponível (preserva scroll-to-top e frozen header cleanup)
      if (typeof window.mudarAba === "function") {
        window.mudarAba(MAIN_TABS[nextIdx]);
      } else {
        // Fallback: simular click no botão da aba
        const btn = document.querySelector('[data-tab="' + MAIN_TABS[nextIdx] + '"]');
        if (btn) btn.click();
      }
    }, { passive: true });

    document.addEventListener("touchcancel", function () { tracking = false; }, { passive: true });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // INIT
  // ════════════════════════════════════════════════════════════════════════════
  function init() {
    if (!isTouchDevice()) return;

    // Modal swipe
    const tryInitModal = () => {
      const ov = document.getElementById("modal-prog");
      if (ov && !ov._swipeTabsSetup) initModalSwipe();
    };
    tryInitModal();

    const obs = new MutationObserver(() => tryInitModal());
    const target = document.getElementById("modal-prog");
    if (target) {
      obs.observe(target, { attributes: true, attributeFilter: ["class"] });
    } else {
      obs.observe(document.body, { childList: true, subtree: true });
    }

    // Main tab swipe (mobile only)
    initMainSwipe();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
