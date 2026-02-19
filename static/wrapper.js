(function () {
  const api = window.sharkordDesktop;
  const sidebar = document.getElementById('sidebar');
  const container = document.getElementById('client-container');
  var IFRAME_ALLOW = 'camera; microphone; display-capture';

  window.addEventListener('message', function (e) {
    if (!e.data) return;
    if (e.data.type === 'sharkord-ptt' && typeof e.data.pressed === 'boolean' && api && api.pttState) {
      api.pttState(e.data.pressed);
    } else if (e.data.type === 'sharkord-add-server' && e.data.url) {
      handleAddServerFromCommunity(e.data);
    } else if (e.data.type === 'sharkord-request-communities-db' && e.data.url && api && api.fetchCommunitiesDatabase && e.source) {
      api.fetchCommunitiesDatabase(e.data.url).then(function (data) {
        try {
          e.source.postMessage({ type: 'sharkord-communities-db-response', data: data, lastRefreshed: new Date().toISOString() }, '*');
        } catch (_) {}
      }).catch(function () {
        try {
          e.source.postMessage({ type: 'sharkord-communities-db-response', data: null }, '*');
        } catch (_) {}
      });
    } else if (e.data.type === 'sharkord-refresh-communities' && api && api.refreshCommunitiesCache && communitiesFrameEl) {
      communitiesFrameEl.src = 'about:blank';
      setTimeout(function () {
        api.refreshCommunitiesCache().then(function (ok) {
          if (ok && api.getCommunitiesPageUrl && communitiesFrameEl) {
            api.getCommunitiesPageUrl().then(function (url) {
              if (url && communitiesFrameEl) communitiesFrameEl.src = url;
            });
          } else if (communitiesFrameEl) {
            communitiesFrameEl.src = 'communities/test.html';
          }
        });
      }, 100);
    } else if (e.data.type === 'sharkord-copy-to-clipboard' && typeof e.data.text === 'string') {
      openCopyTextModal(e.data.text);
    }
  });

  var pttKeyBinding = null;
  var pttKeyDownHandler = null;
  var pttKeyUpHandler = null;
  function setupPttKeyListeners() {
    if (!api || !api.getDevicePreferences || !api.pttState) return;
    if (pttKeyDownHandler) {
      document.removeEventListener('keydown', pttKeyDownHandler, true);
      document.removeEventListener('keyup', pttKeyUpHandler, true);
      pttKeyDownHandler = pttKeyUpHandler = null;
    }
    pttKeyBinding = null;
    api.getDevicePreferences().then(function (prefs) {
      var ptt = prefs && prefs.pttBinding;
      if (!ptt || String(ptt).indexOf('Key') !== 0) return;
      pttKeyBinding = ptt;
      pttKeyDownHandler = function (e) {
        if (e.code === pttKeyBinding) {
          e.preventDefault();
          e.stopPropagation();
          api.pttState(true);
        }
      };
      pttKeyUpHandler = function (e) {
        if (e.code === pttKeyBinding) {
          e.preventDefault();
          e.stopPropagation();
          api.pttState(false);
        }
      };
      document.addEventListener('keydown', pttKeyDownHandler, true);
      document.addEventListener('keyup', pttKeyUpHandler, true);
    });
  }

  if (api) setupPttKeyListeners();

  if (!api || !api.getServers || !api.getServerUrl) {
    var fallback = document.createElement('iframe');
    fallback.className = 'client-frame active';
    fallback.title = 'Sharkord';
    fallback.allow = IFRAME_ALLOW;
    fallback.src = 'https://demo.sharkord.com';
    container.appendChild(fallback);
    return;
  }

  let servers = [];
  let currentUrl = '';
  var activeServerId = null;
  var viewingCommunities = false;
  var communitiesFrameEl = null;

  function getOrigin(url) {
    try {
      return new URL(url).origin;
    } catch {
      return url;
    }
  }

  function isActive(server) {
    return server.id === activeServerId;
  }

  function getActiveServer() {
    if (!activeServerId) return null;
    return servers.find(function (s) { return s.id === activeServerId; });
  }

  function getDesiredIframeServerIds() {
    if (servers.length === 0) return [];
    var active = getActiveServer();
    if (!active) return [];
    var keep = servers.filter(function (s) { return s.id === activeServerId || s.keepConnected; }).map(function (s) { return s.id; });
    if (keep.indexOf(activeServerId) !== 0) {
      keep = keep.filter(function (id) { return id !== activeServerId; });
      keep.unshift(activeServerId);
    }
    return keep;
  }

  function ensureIframes() {
    if (servers.length === 0) {
      container.querySelectorAll('.client-frame').forEach(function (f) { f.remove(); });
      var existingEmpty = container.querySelector('.empty-state');
      if (existingEmpty) existingEmpty.remove();
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'There are no saved servers to connect to! Join a community using the plus icon located on the bottom of the server panel!';
      container.appendChild(empty);
      return;
    }
    var emptyState = container.querySelector('.empty-state');
    if (emptyState) emptyState.remove();
    var desiredIds = getDesiredIframeServerIds();
    var existing = Array.from(container.querySelectorAll('.client-frame')).filter(function (f) { return f.dataset.serverId; });

    if (desiredIds.length === 0) {
      var active = getActiveServer();
      container.querySelectorAll('.client-frame').forEach(function (f) { f.remove(); });
      var existingEmpty = container.querySelector('.empty-state');
      if (existingEmpty) existingEmpty.remove();
      var one = document.createElement('iframe');
      one.className = 'client-frame active';
      one.title = 'Sharkord';
      one.allow = IFRAME_ALLOW;
      one.src = active ? active.url : currentUrl;
      container.appendChild(one);
      return;
    }

    var desiredSet = {};
    desiredIds.forEach(function (id) { desiredSet[id] = true; });

    existing.forEach(function (frame) {
      var sid = frame.dataset.serverId;
      if (!desiredSet[sid]) {
        frame.remove();
      }
    });

    desiredIds.forEach(function (id) {
      var already = container.querySelector('.client-frame[data-server-id="' + id + '"]');
      if (already) {
        already.classList.toggle('active', id === activeServerId);
        return;
      }
      var server = servers.find(function (s) { return s.id === id; });
      if (!server) return;
      var frame = document.createElement('iframe');
      frame.className = 'client-frame' + (id === activeServerId ? ' active' : '');
      frame.title = server.name;
      frame.allow = IFRAME_ALLOW;
      frame.dataset.serverId = server.id;
      frame.src = server.url;
      container.appendChild(frame);
    });

    container.querySelectorAll('.client-frame').forEach(function (f) {
      f.classList.toggle('active', f.dataset.serverId === activeServerId);
    });
  }

  function showServer(server) {
    viewingCommunities = false;
    container.classList.remove('communities-active');
    currentUrl = server.url;
    activeServerId = server.id;
    pendingRippleServerId = server.id;
    api.setServerUrl(server.url);
    var frame = container.querySelector('.client-frame[data-server-id="' + server.id + '"]');
    if (frame) {
      container.querySelectorAll('.client-frame').forEach(function (f) {
        f.classList.toggle('active', f.dataset.serverId === server.id);
      });
    } else {
      ensureIframes();
    }
    renderList();
  }

  function playRippleOnActiveButton() {
    if (pendingRippleServerId === null) return;
    var activeBtn = sidebar.querySelector('.server-btn[data-server-id="' + pendingRippleServerId + '"]');
    if (!activeBtn) return;
    pendingRippleServerId = null;
    var ripple = document.createElement('span');
    ripple.className = 'ripple';
    activeBtn.insertBefore(ripple, activeBtn.firstChild);
    function finishRipple() {
      activeBtn.style.transition = 'none';
      activeBtn.style.background = '#3b82f6';
      ripple.style.opacity = '0';
      ripple.style.pointerEvents = 'none';
      activeBtn.offsetHeight;
      setTimeout(function () {
        if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
        activeBtn.classList.remove('ripple-pending');
        activeBtn.classList.add('active');
        activeBtn.style.transition = '';
      }, 120);
    }
    var anim = ripple.animate([
      { transform: 'translate(-50%, -50%) scale(0)' },
      { transform: 'translate(-50%, -50%) scale(2)' }
    ], { duration: 1000, easing: 'ease-out', fill: 'forwards' });
    anim.onfinish = finishRipple;
  }

  function getServerIcon(server) {
    if (server.icon && server.icon.trim()) return server.icon.trim();
    return (server.name || '?').charAt(0).toUpperCase();
  }

  function isIconImage(icon) {
    return typeof icon === 'string' && icon.indexOf('data:image/') === 0;
  }

  let contextMenuServerId = null;
  var pendingRemoveServerId = null;
  var changeIconServerId = null;
  var changeIconPendingImage = null;
  var ignoreNextServerClick = false;
  var pendingRippleServerId = null;
  var currentDragServerId = null;
  var dragVisualOrder = null;
  var dragDropHandled = false;
  var dragCloneEl = null;
  var emptyDragImage = null;
  var FLY_SEGMENT_MS = 80;

  function removeAllDragClones() {
    document.querySelectorAll('.server-btn-drag-clone').forEach(function (el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
  }

  function setClonePosition(clientX, clientY) {
    if (!dragCloneEl) return;
    var rect = sidebar.getBoundingClientRect();
    var firstSlotCenterY = rect.top + SIDEBAR_TOP_PADDING + 22;
    var cloneY = Math.max(clientY, firstSlotCenterY);
    dragCloneEl.style.left = clientX + 'px';
    dragCloneEl.style.top = cloneY + 'px';
  }

  function getSlotCenter(rect, slotIndex) {
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + SIDEBAR_TOP_PADDING + slotIndex * SERVER_SLOT_HEIGHT + 22
    };
  }

  function animateCloneThroughWaypoints(clone, waypoints, finishCallback) {
    if (!waypoints.length || waypoints.length === 1) {
      if (finishCallback) finishCallback();
      return;
    }
    clone.style.transition = 'left ' + (FLY_SEGMENT_MS / 1000) + 's ease-out, top ' + (FLY_SEGMENT_MS / 1000) + 's ease-out';
    var idx = 0;
    function runNext() {
      idx++;
      if (idx >= waypoints.length) {
        if (finishCallback) finishCallback();
        return;
      }
      var p = waypoints[idx];
      clone.style.left = p.x + 'px';
      clone.style.top = p.y + 'px';
      var segDone = false;
      function onSegEnd() {
        if (segDone) return;
        segDone = true;
        clone.removeEventListener('transitionend', onSegEnd);
        runNext();
      }
      clone.addEventListener('transitionend', onSegEnd);
      setTimeout(function () { if (!segDone) onSegEnd(); }, FLY_SEGMENT_MS + 30);
    }
    requestAnimationFrame(function () { runNext(); });
  }
  function getEmptyDragImage() {
    if (!emptyDragImage) {
      emptyDragImage = new Image();
      emptyDragImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    }
    return emptyDragImage;
  }
  var NUDGE_DURATION_MS = 250;

  function applyNudge(el, direction) {
    if (!el || el.dataset.serverId === currentDragServerId) return;
    el.classList.remove('nudge-down', 'nudge-up');
    void el.offsetWidth;
    el.classList.add(direction);
    setTimeout(function () {
      el.classList.remove('nudge-down', 'nudge-up');
    }, NUDGE_DURATION_MS);
  }

  function applyVisualOrder(orderIds, previousOrderIds) {
    if (!orderIds) return;
    var buttonsByOrder = [];
    sidebar.querySelectorAll('.server-btn').forEach(function (b) {
      var id = b.dataset.serverId;
      if (!id) return;
      var newIdx = orderIds.indexOf(id);
      b.style.order = String(newIdx >= 0 ? newIdx : 999);
      if (newIdx >= 0) buttonsByOrder[newIdx] = b;
    });
    if (previousOrderIds) {
      buttonsByOrder.forEach(function (b, newIdx) {
        if (!b) return;
        var id = b.dataset.serverId;
        if (id === currentDragServerId) return;
        var oldIdx = previousOrderIds.indexOf(id);
        if (oldIdx === -1 || oldIdx === newIdx) return;
        var direction = newIdx > oldIdx ? 'nudge-down' : 'nudge-up';
        applyNudge(b, direction);
        var aboveIdx = newIdx - 1;
        if (aboveIdx >= 0 && buttonsByOrder[aboveIdx]) {
          applyNudge(buttonsByOrder[aboveIdx], direction);
        }
      });
    }
  }
  function clearVisualOrder() {
    sidebar.querySelectorAll('.server-btn').forEach(function (b) { b.style.order = ''; });
  }
  var SIDEBAR_TOP_PADDING = 8;
  var SERVER_SLOT_HEIGHT = 48;

  function getSlotIndexFromY(clientY, n) {
    if (n <= 0) return 0;
    var rect = sidebar.getBoundingClientRect();
    var firstSlotTop = rect.top + SIDEBAR_TOP_PADDING;
    var lastSlotBottom = firstSlotTop + n * SERVER_SLOT_HEIGHT;
    if (clientY <= firstSlotTop) return 0;
    if (clientY >= lastSlotBottom) return n - 1;
    return Math.min(n - 1, Math.max(0, Math.floor((clientY - firstSlotTop) / SERVER_SLOT_HEIGHT)));
  }

  function getSlotIndexFromCursor(clientX, clientY, orderIds) {
    if (!orderIds || orderIds.length === 0) return 0;
    var buttons = Array.from(sidebar.querySelectorAll('.server-btn')).filter(function (b) {
      return b.dataset.serverId && !b.classList.contains('dragging');
    });
    if (buttons.length === 0) return getSlotIndexFromY(clientY, orderIds.length);
    buttons.sort(function (a, b) {
      return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
    });
    for (var i = 0; i < buttons.length; i++) {
      var r = buttons[i].getBoundingClientRect();
      if (clientY >= r.top && clientY <= r.bottom && clientX >= r.left && clientX <= r.right) {
        var id = buttons[i].dataset.serverId;
        var idx = orderIds.indexOf(id);
        return idx >= 0 ? idx : getSlotIndexFromY(clientY, orderIds.length);
      }
    }
    return getSlotIndexFromY(clientY, orderIds.length);
  }

  function updateOrderFromCursorY(clientX, clientY) {
    if (!currentDragServerId || !dragVisualOrder || dragVisualOrder.length === 0) return;
    var n = dragVisualOrder.length;
    var idx = getSlotIndexFromCursor(clientX, clientY, dragVisualOrder);
    var dragId = currentDragServerId;
    var fromIdx = dragVisualOrder.indexOf(dragId);
    if (fromIdx === -1) return;
    if (fromIdx === idx) return;
    var previousOrder = dragVisualOrder.slice();
    dragVisualOrder.splice(fromIdx, 1);
    dragVisualOrder.splice(idx, 0, dragId);
    applyVisualOrder(dragVisualOrder, previousOrder);
  }

  var scrollViewportEl = null;
  var scrollUpArrowEl = null;
  var scrollDownArrowEl = null;
  var scrollResizeObserver = null;
  function updateScrollArrows() {
    var v = scrollViewportEl;
    if (!v || !scrollUpArrowEl || !scrollDownArrowEl) return;
    var canScrollUp = v.scrollTop > 0;
    var canScrollDown = v.scrollTop + v.clientHeight < v.scrollHeight;
    scrollUpArrowEl.classList.toggle('visible', canScrollUp);
    scrollDownArrowEl.classList.toggle('visible', canScrollDown);
  }
  function renderList() {
    if (scrollResizeObserver && scrollViewportEl) {
      scrollResizeObserver.disconnect();
      scrollResizeObserver = null;
    }
    sidebar.innerHTML = '';
    scrollViewportEl = null;
    scrollUpArrowEl = null;
    scrollDownArrowEl = null;
    var upArrow = document.createElement('div');
    upArrow.className = 'sidebar-scroll-arrow';
    upArrow.setAttribute('aria-hidden', 'true');
    upArrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>';
    var viewport = document.createElement('div');
    viewport.className = 'sidebar-scroll-viewport';
    var downArrow = document.createElement('div');
    downArrow.className = 'sidebar-scroll-arrow';
    downArrow.setAttribute('aria-hidden', 'true');
    downArrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    scrollUpArrowEl = upArrow;
    scrollViewportEl = viewport;
    scrollDownArrowEl = downArrow;
    var scrollRegion = document.createElement('div');
    scrollRegion.className = 'sidebar-scroll-region';
    scrollRegion.appendChild(upArrow);
    scrollRegion.appendChild(viewport);
    scrollRegion.appendChild(downArrow);
    sidebar.appendChild(scrollRegion);
    servers.forEach(function (server) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.draggable = true;
      btn.dataset.serverId = server.id;
      var icon = getServerIcon(server);
      var isImage = isIconImage(icon);
      var isEmoji = !isImage && (icon.length > 1 || (icon.length === 1 && icon.charCodeAt(0) > 127));
      var useRipplePending = isActive(server) && pendingRippleServerId === server.id;
      btn.className = 'server-btn' + (useRipplePending ? ' ripple-pending' : (isActive(server) ? ' active' : '')) + (isEmoji ? ' icon-emoji' : '') + (isImage ? ' icon-image' : '');
      var parts = [];
      if (server.identity) parts.push('saved login');
      if (server.keepConnected) parts.push('keep connected');
      btn.title = server.name + (parts.length ? ' (' + parts.join(', ') + ')' : '') + ' — drag to reorder';
      if (isImage) {
        var img = document.createElement('img');
        img.src = icon;
        img.alt = server.name || '';
        img.className = 'server-btn-icon-img';
        btn.appendChild(img);
      } else {
        var iconSpan = document.createElement('span');
        iconSpan.className = 'server-btn-icon';
        iconSpan.textContent = icon;
        btn.appendChild(iconSpan);
      }
      btn.addEventListener('click', function () {
        if (ignoreNextServerClick) { ignoreNextServerClick = false; return; }
        if (server.id === activeServerId && !viewingCommunities) return;
        showServer(server);
      });
      var dragOverHandler = null;
      btn.addEventListener('dragstart', function (e) {
        currentDragServerId = server.id;
        dragVisualOrder = servers.map(function (s) { return s.id; });
        dragDropHandled = false;
        sidebar.classList.add('reordering');
        document.body.classList.add('sharkord-dragging');
        e.dataTransfer.setData('text/plain', server.id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setDragImage(getEmptyDragImage(), 0, 0);
        applyVisualOrder(dragVisualOrder);
        btn.classList.add('dragging');
        removeAllDragClones();
        var clone = btn.cloneNode(true);
        clone.classList.add('server-btn-drag-clone');
        clone.setAttribute('aria-hidden', 'true');
        clone.style.left = e.clientX + 'px';
        clone.style.top = e.clientY + 'px';
        document.body.appendChild(clone);
        dragCloneEl = clone;
        dragOverHandler = function (overEvent) {
          overEvent.preventDefault();
          overEvent.dataTransfer.dropEffect = 'move';
          updateOrderFromCursorY(overEvent.clientX, overEvent.clientY);
          setClonePosition(overEvent.clientX, overEvent.clientY);
        };
        document.addEventListener('dragover', dragOverHandler, true);
      });
      btn.addEventListener('dragend', function () {
        if (dragOverHandler) {
          document.removeEventListener('dragover', dragOverHandler, true);
          dragOverHandler = null;
        }
        setTimeout(function () {
          var left = document.querySelector('.server-btn-drag-clone');
          if (left) {
            removeAllDragClones();
            finishDrag();
          }
        }, 3000);
        function finishDrag() {
          if (!currentDragServerId) return;
          document.body.classList.remove('sharkord-dragging');
          if (dragCloneEl && dragCloneEl.parentNode) dragCloneEl.parentNode.removeChild(dragCloneEl);
          dragCloneEl = null;
          removeAllDragClones();
          if (!dragDropHandled && dragVisualOrder && dragVisualOrder.length && api.reorderServers) {
            api.reorderServers(dragVisualOrder.slice()).then(function (list) {
              servers = Array.isArray(list) ? list : servers;
              renderList();
            });
          }
          currentDragServerId = null;
          dragVisualOrder = null;
          dragDropHandled = false;
          sidebar.classList.remove('reordering');
          btn.classList.remove('dragging');
          sidebar.querySelectorAll('.server-btn').forEach(function (b) { b.classList.remove('drag-over'); });
          clearVisualOrder();
          ignoreNextServerClick = true;
          setTimeout(function () { ignoreNextServerClick = false; }, 200);
        }
        if (dragCloneEl && dragVisualOrder && currentDragServerId && !dragDropHandled) {
          var rect = sidebar.getBoundingClientRect();
          var n = dragVisualOrder.length;
          var cloneRect = dragCloneEl.getBoundingClientRect();
          var cloneCenterY = cloneRect.top + 22;
          var cloneCenterX = cloneRect.left + 22;
          var releaseSlot = getSlotIndexFromY(cloneCenterY, n);
          var targetIdx = dragVisualOrder.indexOf(currentDragServerId);
          if (targetIdx < 0) targetIdx = 0;
          var staleCloneAtBottom = (targetIdx === 0 && releaseSlot === n - 1);
          var staleCloneAtTop = (targetIdx === n - 1 && releaseSlot === 0);
          if (releaseSlot !== targetIdx && !staleCloneAtBottom && !staleCloneAtTop) {
            var prevOrder = dragVisualOrder.slice();
            var fromIdx = dragVisualOrder.indexOf(currentDragServerId);
            if (fromIdx !== -1) {
              dragVisualOrder.splice(fromIdx, 1);
              dragVisualOrder.splice(releaseSlot, 0, currentDragServerId);
              applyVisualOrder(dragVisualOrder, prevOrder);
            }
            targetIdx = releaseSlot;
          }
          var startSlot = getSlotIndexFromY(cloneCenterY, n);
          var waypoints = [{ x: cloneCenterX, y: cloneCenterY }];
          var i;
          if (startSlot < targetIdx) {
            for (i = startSlot + 1; i <= targetIdx; i++) waypoints.push(getSlotCenter(rect, i));
          } else if (startSlot > targetIdx) {
            for (i = startSlot - 1; i >= targetIdx; i--) waypoints.push(getSlotCenter(rect, i));
          } else {
            waypoints.push(getSlotCenter(rect, targetIdx));
          }
          animateCloneThroughWaypoints(dragCloneEl, waypoints, finishDrag);
          setTimeout(function () { if (dragCloneEl && dragCloneEl.parentNode) finishDrag(); }, 2500);
        } else {
          finishDrag();
        }
      });
      btn.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setClonePosition(e.clientX, e.clientY);
        var dragId = currentDragServerId;
        if (!dragId || dragId === server.id) return;
        btn.classList.add('drag-over');
        var ids = dragVisualOrder ? dragVisualOrder.slice() : servers.map(function (s) { return s.id; });
        var fromIdx = ids.indexOf(dragId);
        var toIdx = ids.indexOf(server.id);
        if (fromIdx === -1 || toIdx === -1) return;
        var previousOrder = ids.slice();
        ids.splice(fromIdx, 1);
        ids.splice(toIdx, 0, dragId);
        dragVisualOrder = ids;
        applyVisualOrder(dragVisualOrder, previousOrder);
      });
      btn.addEventListener('dragleave', function () { btn.classList.remove('drag-over'); });
      btn.addEventListener('drop', function (e) {
        e.preventDefault();
        btn.classList.remove('drag-over');
        var dragId = currentDragServerId || e.dataTransfer.getData('text/plain');
        if (!dragId || !api.reorderServers) return;
        dragDropHandled = true;
        var ids = (dragVisualOrder && dragVisualOrder.length) ? dragVisualOrder.slice() : servers.map(function (s) { return s.id; });
        api.reorderServers(ids).then(function (list) {
          servers = Array.isArray(list) ? list : servers;
          renderList();
        });
      });
      btn.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        contextMenuServerId = server.id;
        var menu = document.getElementById('server-context-menu');
        var keepBtn = document.getElementById('context-keep-connected');
        if (keepBtn) {
          keepBtn.textContent = server.keepConnected ? 'Keep connected ✓' : 'Keep connected';
        }
        menu.classList.add('open');
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
      });
      viewport.appendChild(btn);
    });
    viewport.addEventListener('scroll', updateScrollArrows);
    if (typeof ResizeObserver !== 'undefined') {
      scrollResizeObserver = new ResizeObserver(function () { updateScrollArrows(); });
      scrollResizeObserver.observe(viewport);
    }
    requestAnimationFrame(function () { updateScrollArrows(); });
    var footer = document.createElement('div');
    footer.className = 'sidebar-footer-actions';
    var trashBtn = document.createElement('div');
    trashBtn.className = 'drag-trash-btn';
    trashBtn.setAttribute('aria-hidden', 'true');
    trashBtn.title = 'Remove from list (drag server here)';
    trashBtn.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
    trashBtn.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      trashBtn.classList.add('drag-over-trash');
    });
    trashBtn.addEventListener('dragleave', function () {
      trashBtn.classList.remove('drag-over-trash');
    });
    trashBtn.addEventListener('drop', function (e) {
      e.preventDefault();
      trashBtn.classList.remove('drag-over-trash');
      var id = currentDragServerId || e.dataTransfer.getData('text/plain');
      if (!id || !api.removeServer) return;
      dragDropHandled = true;
      api.removeServer(id);
      loadServers();
    });
    footer.appendChild(trashBtn);
    var communitiesBtn = document.createElement('button');
    communitiesBtn.type = 'button';
    communitiesBtn.className = 'communities-btn' + (viewingCommunities ? ' active' : '');
    communitiesBtn.title = 'Communities';
    communitiesBtn.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/><path d="M7 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/><path d="M17 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/><path d="M12 12c-1.5 0-3 .8-3 2v2h6v-2c0-1.2-1.5-2-3-2z"/><path d="M7 14c-1 0-2 .5-2 1.5v1.5h4v-1.5c0-1-.5-1.5-2-1.5z"/><path d="M17 14c-1 0-2 .5-2 1.5v1.5h4v-1.5c0-1-.5-1.5-2-1.5z"/></svg>';
    communitiesBtn.addEventListener('click', openCommunities);
    footer.appendChild(communitiesBtn);
    var settingsBtn = document.createElement('button');
    settingsBtn.type = 'button';
    settingsBtn.id = 'sidebar-settings-btn';
    settingsBtn.className = 'settings-btn';
    settingsBtn.title = 'Media devices (microphone, speaker, camera)';
    settingsBtn.textContent = '\u2699';
    settingsBtn.addEventListener('click', openDeviceSettingsModal);
    footer.appendChild(settingsBtn);
    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'add-btn';
    addBtn.title = 'Add server';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', openAddServerModal);
    footer.appendChild(addBtn);
    sidebar.appendChild(footer);
  }

  function normalizeUrl(input) {
    var s = (input || '').trim();
    if (!s) return null;
    if (s.startsWith('http://') || s.startsWith('https://')) return s;
    return 'https://' + s;
  }

  function openAddServerModal() {
    var modal = document.getElementById('add-server-modal');
    var input = document.getElementById('add-server-input');
    input.value = '';
    modal.classList.add('open');
    input.focus();
  }

  function closeAddServerModal() {
    document.getElementById('add-server-modal').classList.remove('open');
  }

  function addServerFromInput() {
    var input = document.getElementById('add-server-input');
    var raw = (input.value || '').trim();
    var url = normalizeUrl(raw);
    if (!url) return;
    try {
      var name = new URL(url).hostname;
    } catch (e) {
      return;
    }
    closeAddServerModal();
    api.addServer({ url: url, name: name }).then(function (list) {
      servers = Array.isArray(list) ? list : [];
      var added = servers.find(function (s) { return getOrigin(s.url) === getOrigin(url); });
      if (added) {
        showServer(added);
      } else {
        loadServers();
      }
    });
  }

  var EMOJI_LIST = ['🐟','🦈','🐳','🔵','🟢','🟡','🟠','🔴','💜','🟣','🏠','⭐','🌙','☀️','🎮','💬','📁','🔒','🎵','🎤','📷','🚀','❤️','✨','🔥','💡','🎯','🌟','🎨','📌','🌈','⚡','🏆','🎪','🎭','😀','👍','🎉','🔔','📬','🌍','🛡️','⚙️','🔧'];

  function buildEmojiPickerGrid() {
    var grid = document.getElementById('change-icon-emoji-grid');
    if (grid.innerHTML) return;
    EMOJI_LIST.forEach(function (emoji) {
      var span = document.createElement('span');
      span.textContent = emoji;
      span.title = emoji;
      span.addEventListener('click', function () {
        changeIconPendingImage = null;
        var pw = document.getElementById('change-icon-preview-wrap');
        if (pw) pw.classList.remove('visible');
        document.getElementById('change-icon-input').value = emoji;
        document.getElementById('change-icon-emoji-picker').classList.remove('open');
      });
      grid.appendChild(span);
    });
  }

  function openChangeIconModal(serverId) {
    var server = servers.find(function (s) { return s.id === serverId; });
    if (!server) return;
    changeIconServerId = serverId;
    changeIconPendingImage = isIconImage(server.icon) ? server.icon : null;
    buildEmojiPickerGrid();
    var input = document.getElementById('change-icon-input');
    var previewWrap = document.getElementById('change-icon-preview-wrap');
    var previewImg = document.getElementById('change-icon-preview');
    var fileInput = document.getElementById('change-icon-file');
    if (fileInput) fileInput.value = '';
    if (changeIconPendingImage) {
      input.value = '';
      input.placeholder = 'Emoji or letter';
      if (previewWrap && previewImg) {
        previewImg.src = changeIconPendingImage;
        previewWrap.classList.add('visible');
      }
    } else {
      input.value = (server.icon && !isIconImage(server.icon)) ? server.icon : '';
      input.maxLength = 4;
      input.placeholder = 'Emoji or letter';
      if (previewWrap) previewWrap.classList.remove('visible');
    }
    document.getElementById('change-icon-modal').classList.add('open');
    document.getElementById('change-icon-emoji-picker').classList.remove('open');
    input.focus();
  }

  function closeChangeIconModal() {
    document.getElementById('change-icon-modal').classList.remove('open');
    document.getElementById('change-icon-emoji-picker').classList.remove('open');
    changeIconServerId = null;
    changeIconPendingImage = null;
    var previewWrap = document.getElementById('change-icon-preview-wrap');
    if (previewWrap) previewWrap.classList.remove('visible');
  }

  function saveChangeIcon() {
    if (!changeIconServerId) return;
    var input = document.getElementById('change-icon-input');
    var icon = changeIconPendingImage || (input.value || '').trim() || undefined;
    var idToUpdate = changeIconServerId;
    closeChangeIconModal();
    api.updateServer(idToUpdate, { icon: icon }).then(function () {
      loadServers();
    });
  }

  function closeContextMenu() {
    document.getElementById('server-context-menu').classList.remove('open');
    contextMenuServerId = null;
  }

  function openAdminTokenModal() {
    var modal = document.getElementById('admin-token-modal');
    var input = document.getElementById('admin-token-input');
    if (!modal || !input) return;
    input.value = '';
    modal.classList.add('open');
    input.focus();
  }

  function closeAdminTokenModal() {
    var modal = document.getElementById('admin-token-modal');
    if (modal) modal.classList.remove('open');
  }

  function submitAdminToken() {
    var input = document.getElementById('admin-token-input');
    var token = (input && input.value) ? input.value.trim() : '';
    closeAdminTokenModal();
    if (!token || !api.submitAdminToken) return;
    api.submitAdminToken(token, activeServerId).catch(function () {});
  }

  (function setupAdminTokenModal() {
    var modal = document.getElementById('admin-token-modal');
    var input = document.getElementById('admin-token-input');
    var cancelBtn = document.getElementById('admin-token-cancel');
    var submitBtn = document.getElementById('admin-token-submit');
    if (!modal || !input || !cancelBtn || !submitBtn) return;
    cancelBtn.addEventListener('click', closeAdminTokenModal);
    submitBtn.addEventListener('click', submitAdminToken);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitAdminToken();
      if (e.key === 'Escape') closeAdminTokenModal();
    });
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeAdminTokenModal();
    });
  })();

  if (api.onOpenAdminTokenDialog) {
    api.onOpenAdminTokenDialog(openAdminTokenModal);
  }

  function getCommunitiesFrame() {
    if (!communitiesFrameEl) {
      communitiesFrameEl = document.createElement('iframe');
      communitiesFrameEl.className = 'communities-frame';
      communitiesFrameEl.title = 'Communities';
      communitiesFrameEl.src = 'communities/test.html';
      container.appendChild(communitiesFrameEl);
      if (api && api.getCommunitiesPageUrl) {
        api.getCommunitiesPageUrl().then(function (url) {
          if (url && communitiesFrameEl) {
            communitiesFrameEl.src = url;
          }
        });
      }
    }
    return communitiesFrameEl;
  }

  function openCommunities() {
    viewingCommunities = true;
    var frame = getCommunitiesFrame();
    if (frame.src === 'about:blank') {
      frame.src = 'communities/test.html';
      if (api && api.getCommunitiesPageUrl) {
        api.getCommunitiesPageUrl().then(function (url) {
          if (url && frame) frame.src = url;
        });
      }
    }
    container.classList.add('communities-active');
    renderList();
  }

  function closeCommunitiesView() {
    viewingCommunities = false;
    container.classList.remove('communities-active');
    if (communitiesFrameEl) {
      communitiesFrameEl.remove();
      communitiesFrameEl = null;
    }
    renderList();
  }

  var addServerConfirmPending = null;

  function openAddServerConfirmModal(url, name) {
    addServerConfirmPending = { url: url, name: name };
    var text = document.getElementById('add-server-confirm-text');
    if (text) text.textContent = 'Would you like to add "' + name + '" (' + url + ') to your server panel?';
    document.getElementById('add-server-confirm-modal').classList.add('open');
  }

  function closeAddServerConfirmModal() {
    addServerConfirmPending = null;
    document.getElementById('add-server-confirm-modal').classList.remove('open');
  }

  function openCopyTextModal(text) {
    var input = document.getElementById('copy-text-input');
    var modal = document.getElementById('copy-text-modal');
    if (input) input.value = text || '';
    if (modal) modal.classList.add('open');
    if (input) {
      input.focus();
      input.select();
    }
  }

  function closeCopyTextModal() {
    document.getElementById('copy-text-modal').classList.remove('open');
  }

  function confirmAddServerFromCommunity() {
    var pending = addServerConfirmPending;
    closeAddServerConfirmModal();
    if (!pending || !api.addServer) return;
    closeCommunitiesView();
    api.addServer({ url: pending.url, name: pending.name }).then(function (list) {
      servers = Array.isArray(list) ? list : [];
      var added = servers.find(function (s) { return s.url === pending.url || getOrigin(s.url) === getOrigin(pending.url); });
      if (added) showServer(added);
      else loadServers();
    });
  }

  function handleAddServerFromCommunity(msg) {
    var url = msg.url;
    var name = msg.name || (url ? (function () { try { return new URL(url).hostname; } catch (e) { return 'Server'; } })() : 'Server');
    if (!url || !api.addServer) return;
    var u = url.startsWith('http://') || url.startsWith('https://') ? url : 'https://' + url;
    openAddServerConfirmModal(u, name);
  }

  function openDeviceSettingsModal() {
    var modal = document.getElementById('device-settings-modal');
    if (!modal) return;
    var sb = document.getElementById('sidebar-settings-btn');
    if (sb) sb.classList.add('active');
    stopAllDeviceTests();
    setTestPanel('device-input-test-panel', null);
    setTestPanel('device-webcam-test-panel', null);
    modal.classList.add('open');
    loadDevicesIntoModal();
  }

  function closeDeviceSettingsModal() {
    var sb = document.getElementById('sidebar-settings-btn');
    if (sb) sb.classList.remove('active');
    var modal = document.getElementById('device-settings-modal');
    if (modal) modal.classList.remove('open');
    stopAllDeviceTests();
    setupPttKeyListeners();
  }

  function fillSelect(selectId, devices, kind, savedId) {
    var sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '';
    var noneOpt = document.createElement('option');
    noneOpt.value = 'none';
    noneOpt.textContent = 'None';
    sel.appendChild(noneOpt);
    var defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Default';
    sel.appendChild(defaultOpt);
    devices.forEach(function (d) {
      var o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || (d.kind + ' ' + (sel.options.length));
      sel.appendChild(o);
    });
    if (savedId === 'none') sel.value = 'none';
    else if (savedId) sel.value = savedId;
    else sel.value = '';
  }

  var deviceInputVolumePct = 100;
  var deviceTestInputGainNode = null;
  var deviceTestActiveButton = null;

  function volumePctToLeft(pct) {
    return Math.max(0, Math.min(200, pct)) / 200 * 100;
  }

  function leftToVolumePct(leftPct) {
    return Math.round(Math.max(0, Math.min(200, (leftPct / 100) * 200)));
  }

  function setPuckPosition(puckId, volumePct, pctLabelId) {
    var puck = document.getElementById(puckId);
    if (!puck) return;
    puck.style.left = volumePctToLeft(volumePct) + '%';
    if (pctLabelId) {
      var label = document.getElementById(pctLabelId);
      if (label) label.textContent = volumePct + '%';
    }
  }

  function applyVolumeToLiveGain(key, pct) {
    if (key === 'audioInputVolume' && deviceTestInputGainNode) {
      deviceTestInputGainNode.gain.value = pct / 100;
    }
  }

  function saveVolumeToServer(key, valuePct) {
    if (!api.getDevicePreferences || !api.setDevicePreferences) return;
    api.getDevicePreferences().then(function (p) {
      p[key] = valuePct;
      api.setDevicePreferences(p);
      if (api.requestApplyDevicePreferences) api.requestApplyDevicePreferences();
    });
  }

  function setupVolumeTrack(trackId, puckId, fillId, pctLabelId, key, currentPctRef) {
    var track = document.getElementById(trackId);
    var puck = document.getElementById(puckId);
    var fill = document.getElementById(fillId);
    if (!track || !puck) return;
    setPuckPosition(puckId, currentPctRef.current, pctLabelId);

    function updateFromMouse(e) {
      var rect = track.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var pct = leftToVolumePct((x / rect.width) * 100);
      currentPctRef.current = pct;
      if (key === 'audioInputVolume') deviceInputVolumePct = pct;
      setPuckPosition(puckId, pct, pctLabelId);
      applyVolumeToLiveGain(key, pct);
      saveVolumeToServer(key, pct);
    }

    track.addEventListener('click', function (e) {
      if (e.target === puck) return;
      updateFromMouse(e);
    });

    var dragging = false;
    puck.addEventListener('mousedown', function (e) {
      e.preventDefault();
      dragging = true;
    });
    document.addEventListener('mousemove', function move(e) {
      if (!dragging) return;
      updateFromMouse(e);
    });
    document.addEventListener('mouseup', function up() {
      if (dragging) dragging = false;
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    });
  }

  var volumeTracksSetup = false;

  function setupVolumeTracks(prefs) {
    deviceInputVolumePct = prefs && (prefs.audioInputVolume != null) ? prefs.audioInputVolume : 100;
    setPuckPosition('device-input-puck', deviceInputVolumePct, 'device-input-volume-pct');
    if (volumeTracksSetup) return;
    volumeTracksSetup = true;
    var inputRef = { current: deviceInputVolumePct };
    setupVolumeTrack('device-input-track', 'device-input-puck', 'device-input-fill', 'device-input-volume-pct', 'audioInputVolume', inputRef);
  }

  function formatPttBindingDisplay(binding) {
    if (!binding) return 'Not set';
    if (binding.indexOf('Mouse') === 0) {
      var num = binding.slice(5);
      return 'Mouse ' + num;
    }
    if (binding.indexOf('Key') === 0) {
      var key = binding.slice(3);
      return key.length === 1 ? key : key;
    }
    return binding;
  }

  function updatePttDisplay() {
    var el = document.getElementById('device-ptt-display');
    if (!el) return;
    el.textContent = formatPttBindingDisplay(devicePttBinding);
    if (devicePttBinding) el.classList.add('is-set'); else el.classList.remove('is-set');
  }

  function savePttBindingToPrefs(binding) {
    devicePttBinding = binding || undefined;
    if (!api.getDevicePreferences || !api.setDevicePreferences) return;
    api.getDevicePreferences().then(function (p) {
      p.pttBinding = devicePttBinding;
      api.setDevicePreferences(p);
    });
  }

  function startPttListenMode() {
    var setBtn = document.getElementById('device-ptt-set');
    var display = document.getElementById('device-ptt-display');
    if (!setBtn || !display) return;
    setBtn.classList.add('listening');
    setBtn.textContent = 'Press key or button…';
    display.textContent = 'Listening…';

    function stopListening(result) {
      setBtn.classList.remove('listening');
      setBtn.textContent = 'Set key';
      if (result) {
        savePttBindingToPrefs(result);
        updatePttDisplay();
      } else {
        updatePttDisplay();
      }
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onMouse, true);
    }

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        stopListening(null);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      var code = e.code || (e.key.length === 1 ? 'Key' + e.key.toUpperCase() : e.key);
      if (code.indexOf('Key') === 0) stopListening(code);
    }

    function onMouse(e) {
      if (e.button === 0 || e.button === 2) return;
      e.preventDefault();
      e.stopPropagation();
      stopListening('Mouse' + e.button);
    }

    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onMouse, true);
  }

  var devicePttBinding = undefined;

  var deviceSettingsInitialSnapshot = null;

  function loadDevicesIntoModal() {
    if (!api.getDevicePreferences || !navigator.mediaDevices) return;
    api.getDevicePreferences().then(function (prefs) {
      devicePttBinding = (prefs && prefs.pttBinding) || undefined;
      deviceSettingsInitialSnapshot = {
        audioInput: prefs && prefs.audioInput,
        videoInput: prefs && prefs.videoInput,
        audioInputVolume: prefs && prefs.audioInputVolume != null ? prefs.audioInputVolume : 100,
        pttBinding: prefs && prefs.pttBinding
      };
      updatePttDisplay();
      setupVolumeTracks(prefs);
      var inputSel = document.getElementById('device-input');
      var webcamSel = document.getElementById('device-webcam');
      if (!inputSel || !webcamSel) return;
      function done(devices) {
        var audioIn = (devices || []).filter(function (d) { return d.kind === 'audioinput'; });
        var videoIn = (devices || []).filter(function (d) { return d.kind === 'videoinput'; });
        fillSelect('device-input', audioIn, 'audioinput', prefs && prefs.audioInput);
        fillSelect('device-webcam', videoIn, 'videoinput', prefs && prefs.videoInput);
      }
      navigator.mediaDevices.enumerateDevices().then(function (devices) {
        var needLabels = (devices || []).some(function (d) { return !d.label; });
        if (needLabels) {
          navigator.mediaDevices.getUserMedia({ audio: true, video: true }).then(function (stream) {
            stream.getTracks().forEach(function (t) { t.stop(); });
            navigator.mediaDevices.enumerateDevices().then(done).catch(function () { done(devices); });
          }).catch(function () { done(devices || []); });
        } else {
          done(devices || []);
        }
      }).catch(function () { done([]); });
    });
  }

  function inputSettingsChanged() {
    if (!deviceSettingsInitialSnapshot) return false;
    var inputSel = document.getElementById('device-input');
    var webcamSel = document.getElementById('device-webcam');
    var curInput = (inputSel && inputSel.value) || undefined;
    var curVideo = (webcamSel && webcamSel.value) || undefined;
    var curVol = deviceInputVolumePct;
    var curPtt = devicePttBinding;
    return curInput !== deviceSettingsInitialSnapshot.audioInput ||
      curVideo !== deviceSettingsInitialSnapshot.videoInput ||
      curVol !== deviceSettingsInitialSnapshot.audioInputVolume ||
      curPtt !== deviceSettingsInitialSnapshot.pttBinding;
  }

  function getSelectedLabel(sel) {
    if (!sel || !sel.value || sel.value === 'none' || !sel.options || !sel.options[sel.selectedIndex]) return undefined;
    var label = sel.options[sel.selectedIndex].textContent;
    return (label && label.trim()) || undefined;
  }

  var deviceTestStream = null;
  var deviceTestVideo = null;
  var deviceTestAudioCtx = null;
  var deviceTestAnimId = null;

  function revertTestButton() {
    if (deviceTestActiveButton) {
      deviceTestActiveButton.textContent = 'Test';
      deviceTestActiveButton.classList.remove('device-test-btn-stop');
      deviceTestActiveButton = null;
    }
  }

  function stopAllDeviceTests() {
    if (deviceTestStream) {
      deviceTestStream.getTracks().forEach(function (t) { t.stop(); });
      deviceTestStream = null;
    }
    if (deviceTestVideo && deviceTestVideo.srcObject) {
      deviceTestVideo.srcObject.getTracks().forEach(function (t) { t.stop(); });
      deviceTestVideo.srcObject = null;
    }
    if (deviceTestAudioCtx) {
      deviceTestAudioCtx.close().catch(function () {});
      deviceTestAudioCtx = null;
    }
    if (deviceTestAnimId) {
      cancelAnimationFrame(deviceTestAnimId);
      deviceTestAnimId = null;
    }
    deviceTestInputGainNode = null;
    var inputFill = document.getElementById('device-input-fill');
    if (inputFill) { inputFill.style.display = 'none'; inputFill.style.width = '0'; }
    revertTestButton();
  }

  function setTestPanel(id, content) {
    var panel = document.getElementById(id);
    if (!panel) return;
    panel.innerHTML = '';
    if (content && content.nodeType) panel.appendChild(content);
  }

  var DB_MIN = -60;
  var DB_MAX = 0;

  function levelToDb(linear) {
    if (linear <= 0) return DB_MIN;
    return Math.max(DB_MIN, 20 * Math.log10(linear));
  }

  function dbToX(db, width) {
    var t = (db - DB_MIN) / (DB_MAX - DB_MIN);
    return Math.max(0, Math.min(width, t * width));
  }

  function drawDbMeter(ctx, width, height, db, fillColor) {
    ctx.fillStyle = '#18181b';
    ctx.fillRect(0, 0, width, height);
    var x = dbToX(db, width);
    ctx.fillStyle = fillColor;
    ctx.fillRect(0, 0, x, height);
    ctx.strokeStyle = '#3f3f46';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);
  }

  function addVolumeSlider(panel, labelText, valuePct, onChange) {
    var row = document.createElement('div');
    row.className = 'device-test-volume-row';
    var label = document.createElement('label');
    label.textContent = labelText;
    row.appendChild(label);
    var slider = document.createElement('input');
    slider.type = 'range';
    slider.min = 0;
    slider.max = 200;
    slider.value = valuePct;
    slider.addEventListener('input', function () { onChange(Number(slider.value)); });
    row.appendChild(slider);
    var span = document.createElement('span');
    span.style.fontSize = '12px';
    span.style.color = '#a1a1aa';
    span.style.minWidth = '36px';
    span.textContent = valuePct + '%';
    slider.addEventListener('input', function () {
      var v = Number(slider.value);
      span.textContent = v + '%';
      onChange(v);
    });
    row.appendChild(span);
    panel.appendChild(row);
  }

  function addDbLabels(panel) {
    var div = document.createElement('div');
    div.className = 'device-test-db-labels';
    var left = document.createElement('span');
    left.textContent = DB_MIN + ' dB';
    var right = document.createElement('span');
    right.textContent = DB_MAX + ' dB';
    div.appendChild(left);
    div.appendChild(right);
    panel.appendChild(div);
  }

  function testInputDevice() {
    var btn = document.getElementById('device-input-test');
    var sel = document.getElementById('device-input');
    var panelId = 'device-input-test-panel';
    var fillEl = document.getElementById('device-input-fill');
    if (!sel || !navigator.mediaDevices) return;
    if (deviceTestActiveButton === btn) {
      stopAllDeviceTests();
      setTestPanel(panelId, null);
      return;
    }
    stopAllDeviceTests();
    if (sel.value === 'none' || sel.value === '') {
      setTestPanel(panelId, (function () {
        var p = document.createElement('p');
        p.className = 'device-test-msg';
        p.textContent = sel.value === 'none' ? 'None selected — no device to test.' : 'Select a device to test.';
        return p;
      })());
      return;
    }
    var constraints = { audio: sel.value ? { deviceId: { exact: sel.value } } : true };
    navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
      deviceTestStream = stream;
      var panel = document.getElementById(panelId);
      if (!panel) return;
      panel.innerHTML = '';
      if (fillEl) { fillEl.style.display = 'block'; fillEl.style.width = '0'; fillEl.style.backgroundColor = '#3b82f6'; }
      if (btn) {
        deviceTestActiveButton = btn;
        btn.textContent = 'Stop';
        btn.classList.add('device-test-btn-stop');
      }
      var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      deviceTestAudioCtx = audioCtx;
      var source = audioCtx.createMediaStreamSource(stream);
      var inputGainNode = audioCtx.createGain();
      inputGainNode.gain.value = deviceInputVolumePct / 100;
      deviceTestInputGainNode = inputGainNode;
      var analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(inputGainNode);
      inputGainNode.connect(analyser);
      var data = new Uint8Array(analyser.frequencyBinCount);
      var trackEl = document.getElementById('device-input-track');
      function draw() {
        if (!deviceTestStream) return;
        analyser.getByteFrequencyData(data);
        var sum = 0;
        for (var i = 0; i < data.length; i++) sum += data[i];
        var avg = sum / data.length / 255;
        var db = levelToDb(avg);
        if (fillEl && trackEl) {
          var w = trackEl.getBoundingClientRect().width;
          fillEl.style.width = dbToX(db, w) + 'px';
        }
        deviceTestAnimId = requestAnimationFrame(draw);
      }
      draw();
    }).catch(function (err) {
      setTestPanel(panelId, (function () {
        var p = document.createElement('p');
        p.className = 'device-test-msg';
        p.textContent = 'Could not access device: ' + (err.message || err.name || 'Unknown error');
        return p;
      })());
    });
  }

  function testCameraDevice() {
    var btn = document.getElementById('device-webcam-test');
    var sel = document.getElementById('device-webcam');
    var panelId = 'device-webcam-test-panel';
    if (!sel || !navigator.mediaDevices) return;
    if (deviceTestActiveButton === btn) {
      stopAllDeviceTests();
      setTestPanel(panelId, null);
      return;
    }
    stopAllDeviceTests();
    if (sel.value === 'none' || sel.value === '') {
      setTestPanel(panelId, (function () {
        var p = document.createElement('p');
        p.className = 'device-test-msg';
        p.textContent = sel.value === 'none' ? 'None selected — no device to test.' : 'Select a device to test.';
        return p;
      })());
      return;
    }
    var constraints = { video: sel.value ? { deviceId: { exact: sel.value } } : true };
    navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
      deviceTestStream = stream;
      var panel = document.getElementById(panelId);
      if (!panel) return;
      panel.innerHTML = '';
      if (btn) {
        deviceTestActiveButton = btn;
        btn.textContent = 'Stop';
        btn.classList.add('device-test-btn-stop');
      }
      var video = document.createElement('video');
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      deviceTestVideo = video;
      panel.appendChild(video);
    }).catch(function (err) {
      setTestPanel(panelId, (function () {
        var p = document.createElement('p');
        p.className = 'device-test-msg';
        p.textContent = 'Could not access camera: ' + (err.message || err.name || 'Unknown error');
        return p;
      })());
    });
  }

  function resetDeviceSettings() {
    if (!api.setDevicePreferences) return;
    stopAllDeviceTests();
    devicePttBinding = undefined;
    var prefs = {
      audioInput: undefined,
      videoInput: undefined,
      audioInputLabel: undefined,
      videoInputLabel: undefined,
      audioInputVolume: 100,
      pttBinding: undefined
    };
    api.setDevicePreferences(prefs);
    if (api.requestApplyDevicePreferences) api.requestApplyDevicePreferences();
    loadDevicesIntoModal();
  }

  function saveDeviceSettings() {
    if (!api.setDevicePreferences) return;
    var inputSel = document.getElementById('device-input');
    var webcamSel = document.getElementById('device-webcam');
    var prefs = {
      audioInput: (inputSel && inputSel.value) || undefined,
      videoInput: (webcamSel && webcamSel.value) || undefined,
      audioInputLabel: getSelectedLabel(inputSel),
      videoInputLabel: getSelectedLabel(webcamSel),
      audioInputVolume: deviceInputVolumePct,
      pttBinding: devicePttBinding
    };
    var shouldReconnect = inputSettingsChanged();
    closeDeviceSettingsModal();
    api.setDevicePreferences(prefs);
    if (api.requestApplyDevicePreferences) api.requestApplyDevicePreferences();
    if (shouldReconnect && window.confirm('Changes to input settings require a reconnect. Would you like to do that now?')) {
      var active = getActiveServer();
      if (active && active.url && container) {
        var frame = container.querySelector('.client-frame[data-server-id="' + active.id + '"]');
        if (frame) frame.src = active.url;
      }
    }
  }

  (function setupDeviceSettingsModal() {
    var modal = document.getElementById('device-settings-modal');
    var resetBtn = document.getElementById('device-settings-reset');
    var cancelBtn = document.getElementById('device-settings-cancel');
    var saveBtn = document.getElementById('device-settings-save');
    if (!modal || !cancelBtn || !saveBtn) return;
    if (resetBtn) resetBtn.addEventListener('click', resetDeviceSettings);
    cancelBtn.addEventListener('click', closeDeviceSettingsModal);
    saveBtn.addEventListener('click', saveDeviceSettings);
    var pttSetBtn = document.getElementById('device-ptt-set');
    var pttResetBtn = document.getElementById('device-ptt-reset');
    if (pttSetBtn) pttSetBtn.addEventListener('click', startPttListenMode);
    if (pttResetBtn) pttResetBtn.addEventListener('click', function () {
      savePttBindingToPrefs(undefined);
      updatePttDisplay();
    });
    var inputTest = document.getElementById('device-input-test');
    var webcamTest = document.getElementById('device-webcam-test');
    if (inputTest) inputTest.addEventListener('click', testInputDevice);
    if (webcamTest) webcamTest.addEventListener('click', testCameraDevice);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeDeviceSettingsModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('open')) closeDeviceSettingsModal();
    });
  })();

  (function setupAddServerModal() {
    var modal = document.getElementById('add-server-modal');
    var input = document.getElementById('add-server-input');
    var cancelBtn = document.getElementById('add-server-cancel');
    var addBtn = document.getElementById('add-server-add');
    cancelBtn.addEventListener('click', closeAddServerModal);
    addBtn.addEventListener('click', addServerFromInput);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') addServerFromInput();
      if (e.key === 'Escape') closeAddServerModal();
    });
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeAddServerModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('open')) closeAddServerModal();
    });
    if (api.onOpenAddServerModal) api.onOpenAddServerModal(openAddServerModal);
  })();

  (function setupAboutModal() {
    var modal = document.getElementById('about-modal');
    var closeBtn = document.getElementById('about-close');
    if (!modal || !closeBtn) return;
    function closeAboutModal() {
      modal.classList.remove('open');
    }
    closeBtn.addEventListener('click', closeAboutModal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeAboutModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('open')) closeAboutModal();
    });
    if (api.onOpenAboutModal) {
      api.onOpenAboutModal(function () {
        api.getAppVersion().then(function (v) {
          var el = document.getElementById('about-version');
          if (el) el.textContent = v ? 'Version ' + v : '';
          modal.classList.add('open');
        });
      });
    }
  })();

  (function setupAddServerConfirmModal() {
    var modal = document.getElementById('add-server-confirm-modal');
    var cancelBtn = document.getElementById('add-server-confirm-cancel');
    var addBtn = document.getElementById('add-server-confirm-add');
    if (!modal || !cancelBtn || !addBtn) return;
    cancelBtn.addEventListener('click', closeAddServerConfirmModal);
    addBtn.addEventListener('click', confirmAddServerFromCommunity);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeAddServerConfirmModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('open')) closeAddServerConfirmModal();
    });
  })();

  (function setupCopyTextModal() {
    var modal = document.getElementById('copy-text-modal');
    var closeBtn = document.getElementById('copy-text-close');
    var copyBtn = document.getElementById('copy-text-copy');
    var input = document.getElementById('copy-text-input');
    if (!modal || !closeBtn || !copyBtn || !input) return;
    closeBtn.addEventListener('click', closeCopyTextModal);
    copyBtn.addEventListener('click', function () {
      var text = input.value;
      if (text && api && api.copyToClipboard) api.copyToClipboard(text);
      closeCopyTextModal();
    });
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeCopyTextModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('open')) closeCopyTextModal();
    });
  })();

  (function setupClearServersModal() {
    var modal = document.getElementById('clear-servers-modal');
    var cancelBtn = document.getElementById('clear-servers-cancel');
    var confirmBtn = document.getElementById('clear-servers-confirm');
    if (!modal || !cancelBtn || !confirmBtn) return;
    function closeClearServersModal() {
      modal.classList.remove('open');
    }
    cancelBtn.addEventListener('click', closeClearServersModal);
    confirmBtn.addEventListener('click', function () {
      if (api && api.confirmClearServers) api.confirmClearServers();
      closeClearServersModal();
    });
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeClearServersModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('open')) closeClearServersModal();
    });
    if (api && api.onOpenClearServersModal) {
      api.onOpenClearServersModal(function () {
        modal.classList.add('open');
      });
    }
  })();

  (function setupRemoveServerModal() {
    var modal = document.getElementById('remove-server-modal');
    var cancelBtn = document.getElementById('remove-server-cancel');
    var confirmBtn = document.getElementById('remove-server-confirm');
    if (!modal || !cancelBtn || !confirmBtn) return;
    function closeRemoveServerModal() {
      modal.classList.remove('open');
      pendingRemoveServerId = null;
    }
    cancelBtn.addEventListener('click', closeRemoveServerModal);
    confirmBtn.addEventListener('click', function () {
      var id = pendingRemoveServerId;
      closeRemoveServerModal();
      if (id && api && api.removeServer) {
        api.removeServer(id);
        loadServers();
      }
    });
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeRemoveServerModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('open')) closeRemoveServerModal();
    });
  })();

  (function setupChangeIconModal() {
    var modal = document.getElementById('change-icon-modal');
    var input = document.getElementById('change-icon-input');
    var emojiBtn = document.getElementById('change-icon-emoji-btn');
    var emojiPopover = document.getElementById('change-icon-emoji-picker');
    var imageBtn = document.getElementById('change-icon-image-btn');
    var fileInput = document.getElementById('change-icon-file');
    var previewWrap = document.getElementById('change-icon-preview-wrap');
    var previewImg = document.getElementById('change-icon-preview');
    var clearImageBtn = document.getElementById('change-icon-clear-image');
    document.getElementById('change-icon-cancel').addEventListener('click', closeChangeIconModal);
    document.getElementById('change-icon-save').addEventListener('click', saveChangeIcon);
    if (imageBtn && fileInput) {
      imageBtn.addEventListener('click', function () { fileInput.click(); });
      fileInput.addEventListener('change', function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        var reader = new FileReader();
        reader.onload = function () {
          changeIconPendingImage = reader.result;
          if (previewWrap && previewImg) {
            previewImg.src = changeIconPendingImage;
            previewWrap.classList.add('visible');
          }
          input.value = '';
        };
        reader.readAsDataURL(file);
        fileInput.value = '';
      });
    }
    if (clearImageBtn && previewWrap) {
      clearImageBtn.addEventListener('click', function () {
        changeIconPendingImage = null;
        previewWrap.classList.remove('visible');
        if (previewImg) previewImg.removeAttribute('src');
        input.placeholder = 'Emoji or letter';
        input.focus();
      });
    }
    emojiBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      emojiPopover.classList.toggle('open');
    });
    document.addEventListener('click', function () {
      emojiPopover.classList.remove('open');
    });
    emojiPopover.addEventListener('click', function (e) {
      e.stopPropagation();
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') saveChangeIcon();
      if (e.key === 'Escape') closeChangeIconModal();
    });
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeChangeIconModal();
    });
  })();

  (function setupContextMenu() {
    var menu = document.getElementById('server-context-menu');
    document.getElementById('context-change-icon').addEventListener('click', function () {
      var id = contextMenuServerId;
      closeContextMenu();
      if (id) openChangeIconModal(id);
    });
    document.getElementById('context-keep-connected').addEventListener('click', function () {
      var id = contextMenuServerId;
      closeContextMenu();
      if (!id) return;
      var server = servers.find(function (s) { return s.id === id; });
      if (!server) return;
      api.updateServer(id, { keepConnected: !server.keepConnected }).then(function (list) {
        if (Array.isArray(list)) {
          servers = list;
          ensureIframes();
          renderList();
        } else {
          loadServers();
        }
      });
    });
    document.getElementById('context-remove').addEventListener('click', function () {
      var id = contextMenuServerId;
      closeContextMenu();
      if (!id) return;
      var server = servers.find(function (s) { return s.id === id; });
      if (!server) return;
      var textEl = document.getElementById('remove-server-confirm-text');
      if (textEl) textEl.textContent = 'Remove "' + (server.name || 'Server') + '" from list?';
      pendingRemoveServerId = id;
      var removeModal = document.getElementById('remove-server-modal');
      if (removeModal) removeModal.classList.add('open');
    });
    document.addEventListener('click', closeContextMenu);
  })();

  function loadServers() {
    api.getServers().then(function (list) {
      servers = Array.isArray(list) ? list : [];
      var wasActive = activeServerId;
      if (servers.length === 0) {
        activeServerId = null;
        currentUrl = 'https://demo.sharkord.com';
        api.setServerUrl(currentUrl);
      } else if (!wasActive || !servers.find(function (s) { return s.id === wasActive; })) {
        activeServerId = servers[0].id;
        currentUrl = servers[0].url;
        api.setServerUrl(servers[0].url);
      }
      ensureIframes();
      renderList();
    });
  }

  function init() {
    (api.getServerUrl ? api.getServerUrl() : Promise.resolve('https://demo.sharkord.com')).then(function (url) {
      currentUrl = url || 'https://demo.sharkord.com';
      api.getServers().then(function (list) {
        servers = Array.isArray(list) ? list : [];
        if (servers.length > 0) {
          var match = servers.find(function (s) { return getOrigin(s.url) === getOrigin(currentUrl); });
          if (match) {
            activeServerId = match.id;
            currentUrl = match.url;
          } else {
            activeServerId = servers[0].id;
            currentUrl = servers[0].url;
            api.setServerUrl(servers[0].url);
          }
        } else {
          activeServerId = null;
        }
        ensureIframes();
        renderList();
      });
    });
  }

  init();

  if (api.onNavigate) {
    api.onNavigate(function (url) {
      currentUrl = url;
      var match = servers.find(function (s) { return getOrigin(s.url) === getOrigin(url); });
      if (match) {
        activeServerId = match.id;
        ensureIframes();
      } else {
        ensureIframes();
      }
      renderList();
      playRippleOnActiveButton();
    });
  }
})();
