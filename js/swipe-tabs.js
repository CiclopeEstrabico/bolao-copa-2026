/**
 * swipe-tabs.js — Detecção de swipe horizontal para trocar abas (mobile)
 *
 * Funcionalidades:
 * 1. Swipe na página para navegar entre abas (com exclusão de zonas de scroll-x)
 * 2. Swipe no modal prognose para navegar entre as 4 abas do modal
 * 3. Swipe-up no modal prognose (perto do topo) fecha o modal
 * 4. Feedback visual: indicador desliza na barra de tabs
 *
 * Só ativa em dispositivos touch. Desabilitado em desktop.
 */
(function () {
  "use strict";

  // ── Configuração ─────────────────────────────────────────────────────────
  const MIN_DIST = 40;      // px mínimos de arraste horizontal para confirmar swipe
  const ANGLE_RATIO = 1.3;  // dx deve ser >= 1.3× dy para ser swipe horizontal
  const SWIPE_UP_DIST = 60; // px mínimos para swipe-up fechar modal
  const DEAD_ZONE = 12;     // px antes de começar a decidir direção

  // ── Detecção de touch device ─────────────────────────────────────────────
  function isTouchDevice() {
    return "ontouchstart" in window || navigator.maxTouchPoints > 0;
  }

  // ── Verifica se o toque está dentro de um container com scroll-x efetivo ─
  function isInsideHorizontalScroller(target) {
    let el = target;
    // Limite de subida: não passa de .main ou modal-box para performance
    const limit = document.querySelector(".main") || document.body;
    while (el && el !== limit && el !== document.body) {
      // Usa estilo inline + computado para detectar scroll horizontal
      const ox = el.style.overflowX || "";
      if (ox === "auto" || ox === "scroll") {
        if (el.scrollWidth > el.clientWidth + 2) return true;
      }
      // Também checa computed style (pega CSS externo)
      try {
        const cs = getComputedStyle(el);
        const cox = cs.overflowX;
        if ((cox === "auto" || cox === "scroll") && el.scrollWidth > el.clientWidth + 2) {
          return true;
        }
      } catch (e) { /* ignore */ }
      el = el.parentElement;
    }
    return false;
  }

  // ── Verifica se um modal está aberto ─────────────────────────────────────
  function isModalOpen() {
    const m1 = document.getElementById("modal-prog");
    const m2 = document.getElementById("modal-stat");
    return (m1 && m1.classList.contains("aberto")) ||
      (m2 && m2.classList.contains("aberto"));
  }

  // ── Verifica se o toque está na área "proibida" (header, tabs) ───────────
  function isInHeaderOrTabs(target) {
    return !!target.closest(".header, .tabs-wrap, .banner-simulacao");
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 1. SWIPE PARA TROCAR ABAS PRINCIPAIS
  // ════════════════════════════════════════════════════════════════════════════
  function initMainSwipe() {
    let startX = 0, startY = 0;
    let tracking = false;
    let decided = false;    // já decidimos se é horizontal ou vertical?
    let isHorizontal = false; // a decisão

    document.addEventListener("touchstart", function (e) {
      // Ignora se modal aberto, multi-touch, ou em header/tabs
      if (isModalOpen()) { tracking = false; return; }
      if (e.touches.length > 1) { tracking = false; return; }
      if (isInHeaderOrTabs(e.target)) { tracking = false; return; }
      // Ignora se dentro de scroller horizontal
      if (isInsideHorizontalScroller(e.target)) { tracking = false; return; }

      tracking = true;
      decided = false;
      isHorizontal = false;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      clearIndicator();
    }, { passive: true });

    document.addEventListener("touchmove", function (e) {
      if (!tracking) return;

      const cx = e.touches[0].clientX;
      const cy = e.touches[0].clientY;
      const dx = cx - startX;
      const dy = cy - startY;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);

      // Dentro da dead-zone, não decidimos ainda
      if (!decided && adx < DEAD_ZONE && ady < DEAD_ZONE) return;

      // Decidir direção uma única vez
      if (!decided) {
        decided = true;
        isHorizontal = adx > ady * 0.9; // Critério generoso na decisão inicial
        if (!isHorizontal) {
          tracking = false;
          clearIndicator();
          return;
        }
      }

      if (!isHorizontal) return;

      // Verifica se há aba na direção do swipe
      const abas = window.ABAS;
      const atual = window.getAbaAtiva ? window.getAbaAtiva() : null;
      if (!abas || !atual) return;
      const idx = abas.indexOf(atual);
      if (dx < 0 && idx >= abas.length - 1) return; // última aba, sem wrap
      if (dx > 0 && idx <= 0) return; // primeira aba, sem wrap

      // Feedback visual
      showIndicator(dx);
    }, { passive: true });

    document.addEventListener("touchend", function (e) {
      clearIndicator();
      if (!tracking || !decided || !isHorizontal) { tracking = false; return; }
      tracking = false;

      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;

      // Verificar critérios finais de swipe
      if (Math.abs(dx) < MIN_DIST) return;
      if (Math.abs(dx) < Math.abs(dy) * ANGLE_RATIO) return;

      const abas = window.ABAS;
      const atual = window.getAbaAtiva ? window.getAbaAtiva() : null;
      if (!abas || !atual) return;

      const idx = abas.indexOf(atual);
      if (idx === -1) return;

      const nextIdx = dx < 0 ? idx + 1 : idx - 1;

      // Sem wrap-around
      if (nextIdx < 0 || nextIdx >= abas.length) return;

      mudarAba(abas[nextIdx]);
      scrollTabIntoView(abas[nextIdx]);
    }, { passive: true });

    document.addEventListener("touchcancel", function () {
      tracking = false;
      clearIndicator();
    }, { passive: true });
  }

  // ── Feedback visual: indicador deslizante na barra de tabs ───────────────
  function showIndicator(dx) {
    const tabsWrap = document.querySelector(".tabs-wrap");
    if (!tabsWrap) return;

    const abas = window.ABAS;
    const atual = window.getAbaAtiva ? window.getAbaAtiva() : null;
    if (!abas || !atual) return;
    const idx = abas.indexOf(atual);

    // Direção: qual aba é o alvo?
    const targetIdx = dx < 0 ? idx + 1 : idx - 1;
    if (targetIdx < 0 || targetIdx >= abas.length) return;

    // Botões ativo e alvo
    const activeBtn = tabsWrap.querySelector('.tab-btn[data-tab="' + atual + '"]');
    const targetBtn = tabsWrap.querySelector('.tab-btn[data-tab="' + abas[targetIdx] + '"]');
    if (!activeBtn || !targetBtn) return;

    // Cria/atualiza indicador
    let indicator = document.getElementById("_swipe-ind");
    if (!indicator) {
      indicator = document.createElement("div");
      indicator.id = "_swipe-ind";
      Object.assign(indicator.style, {
        position: "absolute",
        bottom: "0",
        height: "2px",
        background: "var(--verde-light)",
        pointerEvents: "none",
        zIndex: "95",
        borderRadius: "1px",
        transition: "none",
      });
      tabsWrap.style.position = "relative";
      tabsWrap.appendChild(indicator);
    }

    const wrapRect = tabsWrap.getBoundingClientRect();
    const activeRect = activeBtn.getBoundingClientRect();
    const targetRect = targetBtn.getBoundingClientRect();

    // Posição do indicador: lerp entre ativo e alvo baseado no progresso
    const progress = Math.min(Math.abs(dx) / (MIN_DIST * 2), 1);
    const fromLeft = activeRect.left - wrapRect.left;
    const toLeft = targetRect.left - wrapRect.left;
    const fromW = activeRect.width;
    const toW = targetRect.width;

    const curLeft = fromLeft + (toLeft - fromLeft) * progress;
    const curW = fromW + (toW - fromW) * progress;

    indicator.style.left = curLeft + "px";
    indicator.style.width = curW + "px";
    indicator.style.opacity = String(0.4 + 0.6 * progress);
    indicator.style.display = "block";
  }

  function clearIndicator() {
    const ind = document.getElementById("_swipe-ind");
    if (ind) ind.style.display = "none";
  }

  // ── Scroll da barra de tabs ──────────────────────────────────────────────
  function scrollTabIntoView(tabName) {
    const tabsWrap = document.querySelector(".tabs-wrap");
    if (!tabsWrap) return;
    const btn = tabsWrap.querySelector('[data-tab="' + tabName + '"]');
    if (btn) btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 2. SWIPE NO MODAL PROGNOSE (trocar abas + swipe-up para fechar)
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
    let decided = false, isHoriz = false;

    box.addEventListener("touchstart", function (e) {
      if (e.touches.length > 1) { tracking = false; return; }
      if (isInsideHorizontalScroller(e.target)) { tracking = false; return; }
      // Não interceptar se o toque é dentro de [data-scroll-inner] (tabela com scroll-y)
      if (e.target.closest("[data-scroll-inner]")) { tracking = false; return; }

      tracking = true;
      decided = false;
      isHoriz = false;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });

    box.addEventListener("touchmove", function (e) {
      if (!tracking) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;

      if (!decided && Math.abs(dx) < DEAD_ZONE && Math.abs(dy) < DEAD_ZONE) return;
      if (!decided) {
        decided = true;
        isHoriz = Math.abs(dx) > Math.abs(dy) * 0.9;
        if (!isHoriz) { tracking = false; return; }
      }
    }, { passive: true });

    box.addEventListener("touchend", function (e) {
      if (!tracking) return;
      tracking = false;

      if (!ov.classList.contains("aberto")) return;

      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;

      // Swipe-up para fechar (apenas se começou perto do topo e scroll está em 0)
      if (!decided || !isHoriz) {
        if (dy < -SWIPE_UP_DIST && Math.abs(dy) > Math.abs(dx) * ANGLE_RATIO) {
          const boxRect = box.getBoundingClientRect();
          const relY = startY - boxRect.top;
          if (relY < 120 && box.scrollTop <= 0) {
            PROGNOSE.fecharModal();
            return;
          }
        }
        return;
      }

      // Swipe horizontal
      if (Math.abs(dx) < MIN_DIST) return;
      if (Math.abs(dx) < Math.abs(dy) * ANGLE_RATIO) return;

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

    initMainSwipe();

    // Modal prognose: inicializa via MutationObserver quando ele existir/abrir
    const tryInitModal = () => {
      const ov = document.getElementById("modal-prog");
      if (ov && !ov._swipeTabsSetup) initModalSwipe();
    };

    tryInitModal();

    // Observer genérico: detecta quando o modal aparece no DOM ou muda de classe
    const obs = new MutationObserver(() => tryInitModal());
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
