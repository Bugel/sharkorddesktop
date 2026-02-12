(function () {
  const api = window.sharkordDesktop;
  const sidebar = document.getElementById('sidebar');
  const container = document.getElementById('client-container');
  var IFRAME_ALLOW = 'camera; microphone; display-capture';

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
      container.innerHTML = '';
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
      container.innerHTML = '';
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
    currentUrl = server.url;
    activeServerId = server.id;
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

  function getServerIcon(server) {
    if (server.icon && server.icon.trim()) return server.icon.trim();
    return (server.name || '?').charAt(0).toUpperCase();
  }

  let contextMenuServerId = null;
  var changeIconServerId = null;

  function renderList() {
    sidebar.innerHTML = '';
    servers.forEach(function (server) {
      const btn = document.createElement('button');
      btn.type = 'button';
      var icon = getServerIcon(server);
      var isEmoji = icon.length > 1 || (icon.length === 1 && icon.charCodeAt(0) > 127);
      btn.className = 'server-btn' + (isActive(server) ? ' active' : '') + (isEmoji ? ' icon-emoji' : '');
      var parts = [];
      if (server.identity) parts.push('saved login');
      if (server.keepConnected) parts.push('keep connected');
      btn.title = server.name + (parts.length ? ' (' + parts.join(', ') + ')' : '');
      btn.textContent = icon;
      btn.addEventListener('click', function () {
        if (server.id === activeServerId) return;
        showServer(server);
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
      sidebar.appendChild(btn);
    });
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'add-btn';
    addBtn.title = 'Add server';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', openAddServerModal);
    sidebar.appendChild(addBtn);
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
    buildEmojiPickerGrid();
    var input = document.getElementById('change-icon-input');
    input.value = server.icon || '';
    input.maxLength = 4;
    document.getElementById('change-icon-modal').classList.add('open');
    document.getElementById('change-icon-emoji-picker').classList.remove('open');
    input.focus();
  }

  function closeChangeIconModal() {
    document.getElementById('change-icon-modal').classList.remove('open');
    document.getElementById('change-icon-emoji-picker').classList.remove('open');
    changeIconServerId = null;
  }

  function saveChangeIcon() {
    if (!changeIconServerId) return;
    var input = document.getElementById('change-icon-input');
    var icon = (input.value || '').trim();
    var idToUpdate = changeIconServerId;
    closeChangeIconModal();
    api.updateServer(idToUpdate, { icon: icon || undefined }).then(function () {
      loadServers();
    });
  }

  function closeContextMenu() {
    document.getElementById('server-context-menu').classList.remove('open');
    contextMenuServerId = null;
  }

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
  })();

  (function setupChangeIconModal() {
    var modal = document.getElementById('change-icon-modal');
    var input = document.getElementById('change-icon-input');
    var emojiBtn = document.getElementById('change-icon-emoji-btn');
    var emojiPopover = document.getElementById('change-icon-emoji-picker');
    document.getElementById('change-icon-cancel').addEventListener('click', closeChangeIconModal);
    document.getElementById('change-icon-save').addEventListener('click', saveChangeIcon);
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
      if (server && confirm('Remove "' + server.name + '" from list?')) {
        api.removeServer(id);
        loadServers();
      }
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
    });
  }
})();
