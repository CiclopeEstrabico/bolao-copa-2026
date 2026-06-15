/**
 * swipe-tabs.js — Detecção de swipe horizontal para trocar abas (mobile)
 *
 * Funcionalidades:
 * 1. Swipe no <main> para navegar entre abas (com exclusão de zonas de scroll-x)
 * 2. Swipe no modal prognose para navegar entre as 4 abas do modal
 * 3. Swipe-up no modal prognose (perto do topo) fecha o modal
 * 4. Feedback visual: barra verde do tab ativo se desloca lateralmente
 *
 * Só ativa em dispositivos touch. Desabilitado em desktop.
 */
(function () {
  "use strict";

  // ── Configuração ─────────────────────────────────────────────────────────
  const MIN_DIST = 50;      // px mínimos de arraste horizontal
  const ANGLE_RATIO = 1.8;  // dx deve ser >= 1.8× dy para ser swipe horizontal
  const SWIPE_UP_DIST = 60; // px mínimos de arraste vertical (modal close)

  // ── Detecção de touch device ─────────────────────────────────────────────
  function isTouchDevice() {
    return "ontouchstart" in window || navigator.maxTouchPoints > 0;
  }

  // ── Verifica se o toque está dentro de um container com scroll-x efetivo ─
  function isInsideHorizontalScroller(target) {
    let el = target;
    while (el && el !== document.body) {
      // Tabs-wrap em mobile portrait NÃO tem scroll-x (é unset), mas no desktop tem.
      // O check por scrollWidth > clientWidth garante que só bloqueia quando há scroll real.
      const style = getComputedStyle(el);
      const ox = style.overflowX;
      if ((ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 1) {
        return true;
      }
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

  // ════════════════════════════════════════════════════════════════════════════
  // 1. SWIPE PARA TROCAR ABAS PRINCIPAIS
  // ════════════════════════════════════════════════════════════════════════════
  function initMainSwipe() {
    const main = document.querySelector(".main");
    if (!main) return;

    let startX = 0, startY = 0, tracking = false, blocked = false;

    main.addEventListener("touchstart", function (e) {
      if (isModalOpen()) { blocked = true; return; }
      if (e.touches.length > 1) { blocked = true; return; } // multi-touch (pinch)
      if (isInsideHorizontalScroller(e.target)) { blocked = true; return; }

      blocked = false;
      tracking = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      // Limpa qualquer feedback visual pendente
      clearIndicator();
    }, { passive: true });

    main.addEventListener("touchmove", function (e) {
      if (blocked || !tracking) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;

      // Se o gesto é mais vertical que horizontal, desista
      if (Math.abs(dy) > 30 && Math.abs(dy) > Math.abs(dx) * 0.7) {
        tracking = false;
        clearIndicator();
        return;
      }

      // Feedback visual: mostrar indicador de progresso na barra de tabs
      if (Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy) * ANGLE_RATIO) {
        showIndicator(dx);
      }
    }, { passive: true });

    main.addEventListener("touchend", function (e) {
      clearIndicator();
      if (blocked || !tracking) { tracking = false; return; }
      tracking = false;

      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;

      // Verificar critérios de swipe
      if (Math.abs(dx) < MIN_DIST) return;
      if (Math.abs(dx) < Math.abs(dy) * ANGLE_RATIO) return;

      const abas = window.ABAS;
      const atual = window.getAbaAtiva ? window.getAbaAtiva() : window._abaAtiva;
      if (!abas || !atual) return;

      const idx = abas.indexOf(atual);
      if (idx === -1) return;

      let nextIdx;
      if (dx < 0) {
        // Swipe para a esquerda → próxima aba
        nextIdx = idx + 1;
      } else {
        // Swipe para a direita → aba anterior
        nextIdx = idx - 1;
      }

      // Sem wrap-around
      if (nextIdx < 0 || nextIdx >= abas.length) return;

      mudarAba(abas[nextIdx]);

      // Auto-scroll a barra de tabs para garantir que a aba ativa é visível
      scrollTabIntoView(abas[nextIdx]);
    }, { passive: true });

    main.addEventListener("touchcancel", function () {
      tracking = false;
      clearIndicator();
    }, { passive: true });
  }

  // ── Feedback visual: indicador na barra de tabs ──────────────────────────
  // Move a borda verde inferior do tab ativo lateralmente para indicar swipe
  function showIndicator(dx) {
    const tabsWrap = document.querySelector(".tabs-wrap");
    if (!tabsWrap) return;

    const abas = window.ABAS;
    const atual = window.getAbaAtiva ? window.getAbaAtiva() : window._abaAtiva;
    if (!abas || !atual) return;

    const idx = abas.indexOf(atual);
    // Verifica se há aba na direção do swipe
    if (dx < 0 && idx >= abas.length - 1) return;
    if (dx > 0 && idx <= 0) return;

    // Pega o botão ativo
    const activeBtn = tabsWrap.querySelector('.tab-btn.ativa');
    if (!activeBtn) return;

    // Cria/atualiza indicador flutuante
    let indicator = document.getElementById('_swipe-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = '_swipe-indicator';
      indicator.style.cssText = [
        'position:absolute',
        'bottom:0',
        'height:2px',
        'background:var(--verde-light)',
        'transition:none',
        'pointer-events:none',
        'z-index:95',
        'border-radius:1px',
        'opacity:0.6',
      ].join(';');
      tabsWrap.style.position = 'relative';
      tabsWrap.appendChild(indicator);
    }

    // Calcula a posição do indicador baseado no progresso do swipe
    const rect = activeBtn.getBoundingClientRect();
    const wrapRect = tabsWrap.getBoundingClientRect();

    // Posição base do indicador = posição do tab ativo
    const baseLeft = rect.left - wrapRect.left;
    const width = rect.width;

    // Deslocamento proporcional: map dx de 0..MIN_DIST para 0..width
    const maxShift = width; // desloca no máximo a largura de uma aba
    const progress = Math.min(Math.abs(dx) / (MIN_DIST * 1.5), 1);
    const shift = progress * maxShift * Math.sign(dx);

    indicator.style.left = (baseLeft + shift) + 'px';
    indicator.style.width = width + 'px';
    indicator.style.opacity = String(0.3 + 0.7 * progress);
    indicator.style.display = 'block';
  }

  function clearIndicator() {
    const indicator = document.getElementById('_swipe-indicator');
    if (indicator) {
      indicator.style.display = 'none';
    }
  }

  // ── Scroll da barra de tabs para a aba ativa ──────────────────────────────
  function scrollTabIntoView(tabName) {
    const tabsWrap = document.querySelector(".tabs-wrap");
    if (!tabsWrap) return;
    const btn = tabsWrap.querySelector(`[data-tab="${tabName}"]`);
    if (!btn) return;
    // Em mobile portrait, tabs não scrollam (overflow-x: unset), mas no landscape podem
    btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
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

    let startX = 0, startY = 0, tracking = false;

    box.addEventListener("touchstart", function (e) {
      if (e.touches.length > 1) { tracking = false; return; }
      // Não ativar swipe horizontal se estiver dentro de scroll-x (tabela matriz)
      if (isInsideHorizontalScroller(e.target)) { tracking = false; return; }
      tracking = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });

    box.addEventListener("touchmove", function (e) {
      // O modal já tem tratamento próprio de swipe-down, não interferimos aqui
    }, { passive: true });

    box.addEventListener("touchend", function (e) {
      if (!tracking) return;
      tracking = false;

      if (!ov.classList.contains("aberto")) return;

      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;

      // Swipe-up para fechar o modal (apenas se começou perto do topo: primeiros 120px)
      if (dy < -SWIPE_UP_DIST && Math.abs(dy) > Math.abs(dx) * ANGLE_RATIO) {
        // Verifica se o toque começou perto do topo do modal
        const boxRect = box.getBoundingClientRect();
        const touchStartRelY = startY - boxRect.top;
        if (touchStartRelY < 120 && box.scrollTop <= 0) {
          PROGNOSE.fecharModal();
          return;
        }
      }

      // Swipe horizontal para trocar abas do modal
      if (Math.abs(dx) < MIN_DIST) return;
      if (Math.abs(dx) < Math.abs(dy) * ANGLE_RATIO) return;

      const atual = getModalActiveTab();
      const idx = MODAL_TABS.indexOf(atual);
      if (idx === -1) return;

      let nextIdx;
      if (dx < 0) {
        nextIdx = idx + 1; // próxima
      } else {
        nextIdx = idx - 1; // anterior
      }

      // Sem wrap-around
      if (nextIdx < 0 || nextIdx >= MODAL_TABS.length) return;

      PROGNOSE._switchTab(MODAL_TABS[nextIdx]);
    }, { passive: true });

    box.addEventListener("touchcancel", function () {
      tracking = false;
    }, { passive: true });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // INIT
  // ════════════════════════════════════════════════════════════════════════════
  function init() {
    if (!isTouchDevice()) return;

    initMainSwipe();

    // O modal prognose pode não existir no DOM ainda; configuramos via MutationObserver
    // para inicializar o swipe assim que o modal for aberto pela primeira vez.
    const tryInitModal = () => {
      const ov = document.getElementById("modal-prog");
      if (ov && !ov._swipeTabsSetup) initModalSwipe();
    };

    // Tenta imediatamente
    tryInitModal();

    // Observa aberturas do modal (quando a classe "aberto" é adicionada)
    const observer = new MutationObserver(() => tryInitModal());
    const target = document.getElementById("modal-prog");
    if (target) {
      observer.observe(target, { attributes: true, attributeFilter: ["class"] });
    } else {
      // Se o modal ainda não existe, observa o body para quando for adicionado
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
