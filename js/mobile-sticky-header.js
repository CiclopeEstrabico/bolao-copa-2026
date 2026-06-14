/**
 * mobile-sticky-header.js
 * ───────────────────────────────────────
 * Fix for mobile: CSS position:sticky on <thead> doesn't work
 * when the table is inside a wrapper with overflow-x:auto.
 * 
 * This JS clones the <thead> into a fixed-position element that
 * sticks below the header+tabs bar, and syncs horizontal scroll.
 * Uses a cached-position system to run layout-safe, zero-reflow updates.
 */
(function () {
  if (typeof window === 'undefined') return;

  const MOBILE_BREAKPOINT = 600;

  /** altura do header + tabs (medida dinamicamente) */
  function getStickyTop() {
    const header = document.querySelector('.header');
    const tabs = document.querySelector('.tabs-wrap');
    let h = 0;
    if (header) h += header.getBoundingClientRect().height;
    if (tabs) h += tabs.getBoundingClientRect().height;
    return h;
  }

  /** Retorna a posição do topo absoluto de um elemento na página */
  function getAbsoluteTop(element) {
    let top = 0;
    while (element) {
      top += element.offsetTop;
      element = element.offsetParent;
    }
    return top;
  }

  /** Cria ou atualiza o header fixo para uma tabela */
  function setupFrozenHeader(table, wrapper) {
    if (!table || !wrapper) return null;
    const thead = table.querySelector('thead');
    if (!thead) return null;

    // Criar container fixo
    let frozen = wrapper._frozenHeader;
    if (!frozen) {
      frozen = document.createElement('div');
      frozen.className = 'frozen-thead';
      frozen.style.cssText =
        'position:fixed;left:0;right:0;z-index:50;overflow:hidden;pointer-events:none;display:none;' +
        'background:var(--fundo2);border-bottom:2px solid var(--verde-light);box-shadow:0 2px 8px rgba(0,0,0,.3);';
      document.body.appendChild(frozen);
      wrapper._frozenHeader = frozen;
    }

    // Clonar thead numa tabela com mesmas larguras de coluna
    const cloneTable = document.createElement('table');
    cloneTable.className = table.className;
    cloneTable.style.cssText = 'width:' + table.offsetWidth + 'px;table-layout:fixed;border-collapse:collapse;';

    // Copiar larguras das colunas
    const colgroup = document.createElement('colgroup');
    const ths = thead.querySelectorAll('th');
    ths.forEach(th => {
      const col = document.createElement('col');
      col.style.width = th.offsetWidth + 'px';
      colgroup.appendChild(col);
    });
    cloneTable.appendChild(colgroup);

    const clonedThead = thead.cloneNode(true);
    // Permitir cliques no clone (para tooltips etc)
    clonedThead.style.pointerEvents = 'auto';
    cloneTable.appendChild(clonedThead);

    frozen.innerHTML = '';
    frozen.appendChild(cloneTable);

    return { frozen, wrapper, table, thead };
  }

  function updateCachedPositions() {
    _instances.forEach(inst => {
      if (!inst) return;
      const { table, thead } = inst;
      if (table && thead) {
        inst.tableTop = getAbsoluteTop(table);
        inst.tableHeight = table.offsetHeight;
        inst.theadHeight = thead.offsetHeight;
      }
    });
  }

  /** Atualiza a visibilidade e posição de todos os frozen headers (zero-reflow) */
  function updateAll() {
    if (window.innerWidth > MOBILE_BREAKPOINT) {
      // Desktop: esconde todos os frozen headers
      document.querySelectorAll('.frozen-thead').forEach(f => f.style.display = 'none');
      return;
    }

    const stickyTop = getStickyTop();
    const scrollTop = window.scrollY;

    _instances.forEach(inst => {
      if (!inst) return;
      const { frozen, wrapper } = inst;
      if (!frozen || !wrapper) return;

      // Se a aba está oculta (display:none), esconder frozen
      if (!wrapper.offsetParent) {
        frozen.style.display = 'none';
        return;
      }

      const tableTop = inst.tableTop || 0;
      const tableHeight = inst.tableHeight || 0;
      const theadHeight = inst.theadHeight || 0;

      // Mostrar frozen header quando o thead original está acima do stickyTop
      // e a tabela ainda está parcialmente visível
      const theadHidden = scrollTop + stickyTop > tableTop + theadHeight;
      const tableStillVisible = scrollTop + stickyTop < tableTop + tableHeight;

      if (theadHidden && tableStillVisible) {
        frozen.style.display = 'block';
        frozen.style.top = stickyTop + 'px';
        // Sincronizar scroll horizontal
        const innerTable = frozen.querySelector('table');
        if (innerTable) {
          innerTable.style.transform = 'translateX(' + (-wrapper.scrollLeft) + 'px)';
        }
      } else {
        frozen.style.display = 'none';
      }
    });
  }

  const _instances = [];

  /** API pública: registrar uma tabela para frozen header */
  window.registrarFrozenHeader = function (tableSelector, wrapperSelector) {
    if (window.innerWidth > MOBILE_BREAKPOINT) return; // skip on desktop

    const table = typeof tableSelector === 'string' ? document.querySelector(tableSelector) : tableSelector;
    const wrapper = typeof wrapperSelector === 'string' ? document.querySelector(wrapperSelector) : wrapperSelector;
    if (!table || !wrapper) return;

    // Remover instância antiga para este wrapper
    for (let i = _instances.length - 1; i >= 0; i--) {
      if (_instances[i] && _instances[i].wrapper === wrapper) {
        if (_instances[i].frozen) _instances[i].frozen.remove();
        _instances.splice(i, 1);
      }
    }

    const inst = setupFrozenHeader(table, wrapper);
    if (inst) {
      _instances.push(inst);

      // Calcular posições no próximo frame para garantir layout estabelecido
      requestAnimationFrame(() => {
        inst.tableTop = getAbsoluteTop(table);
        inst.tableHeight = table.offsetHeight;
        inst.theadHeight = table.querySelector('thead')?.offsetHeight || 40;
        updateAll();
      });

      // Sync horizontal scroll
      wrapper.addEventListener('scroll', () => {
        if (inst.frozen && inst.frozen.style.display !== 'none') {
          const innerTable = inst.frozen.querySelector('table');
          if (innerTable) {
            innerTable.style.transform = 'translateX(' + (-wrapper.scrollLeft) + 'px)';
          }
        }
      }, { passive: true });
    }
  };

  /** API pública: limpar instâncias (quando aba muda) */
  window.limparFrozenHeaders = function () {
    _instances.forEach(inst => {
      if (inst && inst.frozen) inst.frozen.remove();
    });
    _instances.length = 0;

    const oldBracket = document.getElementById('frozen-bracket-labels');
    if (oldBracket) oldBracket.remove();
  };

  // Listener global de scroll (zero-reflow)
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(() => {
        updateAll();
        ticking = false;
      });
    }
  }, { passive: true });

  // Listener de resize (pra recalcular posições e limpar em transição mobile→desktop)
  window.addEventListener('resize', () => {
    updateCachedPositions();
    requestAnimationFrame(updateAll);
  }, { passive: true });
})();
