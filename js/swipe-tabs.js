/**
 * swipe-tabs.js — Swipe gestures para modais (mobile)
 *
 * Funcionalidades:
 * 1. Swipe horizontal no modal prognose → navega entre as 4 abas
 * 2. Swipe-up no modal prognose (perto do topo) → fecha o modal
 *
 * Só ativa em dispositivos touch.
 */
(function () {
  "use strict";

  const MIN_DIST = 30;
  const DEAD_ZONE = 8;
  const SWIPE_UP_DIST = 60;

  function isTouchDevice() {
    return "ontouchstart" in window || navigator.maxTouchPoints > 0;
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

  function isInsideScrollable(target) {
    let el = target;
    while (el && el.id !== "modal-prog-body" && el !== document.body) {
      try {
        const cs = getComputedStyle(el);
        // Só bloquear swipe horizontal se o elemento tiver scroll HORIZONTAL
        // Scroll vertical não deve impedir swipe entre abas
        if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 2) return true;
      } catch (e) { /* ignore */ }
      el = el.parentElement;
    }
    return false;
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
      if (isInsideScrollable(e.target)) { tracking = false; return; }

      tracking = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });

    box.addEventListener("touchmove", function (e) {
      if (!tracking) return;
      // Se o gesto se torna claramente vertical, desistir cedo para não conflitar
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
      if (Math.abs(dx) < MIN_DIST) return;
      if (Math.abs(dx) < Math.abs(dy) * 0.8) return; // gesto mais vertical que horizontal

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
  // INIT
  // ════════════════════════════════════════════════════════════════════════════
  function init() {
    if (!isTouchDevice()) return;

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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
