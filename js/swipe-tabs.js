/**
 * swipe-tabs.js — Swipe horizontal na BARRA DE ABAS para trocar de aba (mobile)
 *
 * Funcionalidades:
 * 1. Swipe na barra de abas (.tabs-wrap) troca de aba
 * 2. Swipe no modal prognose navega entre as 4 abas do modal
 * 3. Swipe-up no modal prognose (perto do topo) fecha o modal
 * 4. Feedback visual: indicador verde desliza entre abas
 *
 * Só ativa em dispositivos touch. Desabilitado em desktop.
 */
(function () {
  "use strict";

  const MIN_DIST = 30;      // px mínimos para confirmar swipe
  const DEAD_ZONE = 8;      // px antes de decidir direção
  const SWIPE_UP_DIST = 60; // px para swipe-up fechar modal

  function isTouchDevice() {
    return "ontouchstart" in window || navigator.maxTouchPoints > 0;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 1. SWIPE NA BARRA DE ABAS
  // ════════════════════════════════════════════════════════════════════════════
  function initTabBarSwipe() {
    const tabsWrap = document.querySelector(".tabs-wrap");
    if (!tabsWrap) return;

    let startX = 0, startY = 0;
    let tracking = false, decided = false, isHoriz = false;

    tabsWrap.addEventListener("touchstart", function (e) {
      if (e.touches.length > 1) { tracking = false; return; }
      tracking = true;
      decided = false;
      isHoriz = false;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      clearIndicator();
    }, { passive: true });

    tabsWrap.addEventListener("touchmove", function (e) {
      if (!tracking) return;

      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);

      if (!decided && adx < DEAD_ZONE && ady < DEAD_ZONE) return;

      if (!decided) {
        decided = true;
        isHoriz = adx > ady;
        if (!isHoriz) {
          tracking = false;
          clearIndicator();
          return;
        }
      }

      if (isHoriz) showIndicator(tabsWrap, dx);
    }, { passive: true });

    tabsWrap.addEventListener("touchend", function (e) {
      clearIndicator();
      if (!tracking || !decided || !isHoriz) { tracking = false; return; }
      tracking = false;

      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) < MIN_DIST) return;

      const abas = window.ABAS;
      const atual = window.getAbaAtiva ? window.getAbaAtiva() : null;
      if (!abas || !atual) return;

      const idx = abas.indexOf(atual);
      if (idx === -1) return;

      const nextIdx = dx < 0 ? idx + 1 : idx - 1;
      if (nextIdx < 0 || nextIdx >= abas.length) return;

      mudarAba(abas[nextIdx]);
    }, { passive: true });

    tabsWrap.addEventListener("touchcancel", function () {
      tracking = false;
      clearIndicator();
    }, { passive: true });
  }

  // ── Feedback visual ──────────────────────────────────────────────────────
  // O indicador é um div posicionado fixed (não absolute!) para não quebrar
  // o position:sticky do .tabs-wrap.
  function showIndicator(tabsWrap, dx) {
    const abas = window.ABAS;
    const atual = window.getAbaAtiva ? window.getAbaAtiva() : null;
    if (!abas || !atual) return;
    const idx = abas.indexOf(atual);

    const targetIdx = dx < 0 ? idx + 1 : idx - 1;
    if (targetIdx < 0 || targetIdx >= abas.length) return;

    const activeBtn = tabsWrap.querySelector('.tab-btn[data-tab="' + atual + '"]');
    const targetBtn = tabsWrap.querySelector('.tab-btn[data-tab="' + abas[targetIdx] + '"]');
    if (!activeBtn || !targetBtn) return;

    let ind = document.getElementById("_swipe-ind");
    if (!ind) {
      ind = document.createElement("div");
      ind.id = "_swipe-ind";
      Object.assign(ind.style, {
        position: "fixed",
        height: "2px",
        background: "var(--verde-light)",
        pointerEvents: "none",
        zIndex: "9999",
        borderRadius: "1px",
        transition: "none",
      });
      document.body.appendChild(ind);
    }

    const activeRect = activeBtn.getBoundingClientRect();
    const targetRect = targetBtn.getBoundingClientRect();

    // Progresso: 0 = no ativo, 1 = no alvo
    const progress = Math.min(Math.abs(dx) / (MIN_DIST * 2.5), 1);

    const curLeft = activeRect.left + (targetRect.left - activeRect.left) * progress;
    const curW = activeRect.width + (targetRect.width - activeRect.width) * progress;
    // Bottom da barra de abas
    const bottom = activeRect.bottom;

    ind.style.left = curLeft + "px";
    ind.style.width = curW + "px";
    ind.style.top = (bottom - 2) + "px";
    ind.style.opacity = String(0.4 + 0.6 * progress);
    ind.style.display = "block";
  }

  function clearIndicator() {
    const ind = document.getElementById("_swipe-ind");
    if (ind) ind.style.display = "none";
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 2. SWIPE NO MODAL PROGNOSE
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
        if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 2) return true;
        if ((cs.overflowY === "auto" || cs.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 2) return true;
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
    let tracking = false, decided = false, isHoriz = false;

    box.addEventListener("touchstart", function (e) {
      if (e.touches.length > 1) { tracking = false; return; }
      if (isInsideScrollable(e.target)) { tracking = false; return; }

      tracking = true;
      decided = false;
      isHoriz = false;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });

    box.addEventListener("touchmove", function (e) {
      if (!tracking) return;
      if (decided) return;

      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (Math.abs(dx) < DEAD_ZONE && Math.abs(dy) < DEAD_ZONE) return;

      decided = true;
      isHoriz = Math.abs(dx) > Math.abs(dy);
      if (!isHoriz) tracking = false;
    }, { passive: true });

    box.addEventListener("touchend", function (e) {
      if (!tracking) return;
      tracking = false;
      if (!ov.classList.contains("aberto")) return;

      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;

      // Swipe-up para fechar (se não decidiu horizontal E o toque foi perto do topo)
      if (!isHoriz && dy < -SWIPE_UP_DIST && Math.abs(dy) > Math.abs(dx) * 1.3) {
        const boxRect = box.getBoundingClientRect();
        if ((startY - boxRect.top) < 120 && box.scrollTop <= 0) {
          PROGNOSE.fecharModal();
          return;
        }
      }

      // Swipe horizontal para trocar aba do modal
      if (!decided || !isHoriz) return;
      if (Math.abs(dx) < MIN_DIST) return;

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

    initTabBarSwipe();

    // Modal: inicializa quando existir
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
