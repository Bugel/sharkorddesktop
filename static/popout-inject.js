// Injected into Sharkord server frames by the desktop app (see injectDevicePrefsIntoFrame in
// src/main.ts). Adds a "Pop out" button over any live video (screen share or webcam) that opens
// it in its own window, so it can sit on another monitor while chat stays usable.
// Hooks <video> elements generically instead of Sharkord class names, so client updates don't break it.
(function () {
  if (window.__sharkordPopoutInstalled) return;
  window.__sharkordPopoutInstalled = true;

  var WINDOW_NAME_PREFIX = 'sharkord-popout-'; // must match POPOUT_WINDOW_PREFIX in src/main.ts
  var MIN_WIDTH = 160;
  var MIN_HEIGHT = 90;
  var popouts = []; // { win, source, stream }
  var counter = 0;

  function hasLiveVideo(stream) {
    return (
      stream instanceof MediaStream &&
      stream.getVideoTracks().some(function (t) { return t.readyState === 'live'; })
    );
  }

  var button = document.createElement('button');
  button.type = 'button';
  button.textContent = '↗ Pop out';
  button.title = 'Open this stream in its own window';
  button.style.cssText = [
    'position:fixed', 'z-index:2147483647', 'display:none', 'padding:4px 10px',
    'border:1px solid rgba(255,255,255,0.2)', 'border-radius:6px', 'background:rgba(0,0,0,0.75)',
    'color:#fff', 'font:500 12px system-ui,sans-serif', 'cursor:pointer'
  ].join(';');

  var hovered = null;
  var pending = false;
  var lastPoint = null;

  function hideButton() {
    hovered = null;
    button.style.display = 'none';
  }

  function updateButton() {
    pending = false;
    if (!lastPoint) return;
    var els = document.elementsFromPoint(lastPoint.x, lastPoint.y);
    var video = null;
    for (var i = 0; i < els.length; i++) {
      if (els[i].tagName === 'VIDEO') { video = els[i]; break; }
    }
    if (!video || !hasLiveVideo(video.srcObject)) return hideButton();
    var r = video.getBoundingClientRect();
    if (r.width < MIN_WIDTH || r.height < MIN_HEIGHT) return hideButton();
    hovered = video;
    // Top-left: Sharkord's own card controls sit top-right.
    button.style.left = Math.round(r.left + 8) + 'px';
    button.style.top = Math.round(r.top + 8) + 'px';
    button.style.display = 'block';
  }

  document.addEventListener('pointermove', function (e) {
    lastPoint = { x: e.clientX, y: e.clientY };
    if (!pending) {
      pending = true;
      requestAnimationFrame(updateButton);
    }
  }, true);
  document.addEventListener('pointerleave', hideButton);
  window.addEventListener('blur', hideButton);

  button.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (hovered) popOut(hovered);
    hideButton();
  });

  function mount() {
    if (document.body && !button.isConnected) document.body.appendChild(button);
  }
  mount();
  document.addEventListener('DOMContentLoaded', mount);

  function popOut(source) {
    var stream = source.srcObject;
    for (var i = 0; i < popouts.length; i++) {
      if (!popouts[i].win.closed && popouts[i].stream === stream) {
        popouts[i].win.focus();
        return;
      }
    }

    var win = window.open('', WINDOW_NAME_PREFIX + ++counter);
    if (!win) return;

    var doc = win.document;
    doc.title = 'Sharkord — Pop-out';
    var style = doc.createElement('style');
    style.textContent =
      'html,body{margin:0;height:100%;background:#000;overflow:hidden}' +
      'video{width:100%;height:100%;object-fit:contain;display:block}' +
      '#msg{position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
      'color:#bbb;font:14px system-ui,sans-serif}' +
      '#hint{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);padding:4px 10px;' +
      'border-radius:6px;background:rgba(0,0,0,.6);color:#ddd;font:12px system-ui,sans-serif;' +
      'opacity:0;transition:opacity .2s;pointer-events:none}' +
      'body:hover #hint{opacity:1}';
    doc.head.appendChild(style);

    var video = doc.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true; // audio keeps playing from the main window
    video.srcObject = stream;
    doc.body.appendChild(video);

    var msg = doc.createElement('div');
    msg.id = 'msg';
    msg.textContent = 'Stream ended';
    doc.body.appendChild(msg);

    var hint = doc.createElement('div');
    hint.id = 'hint';
    hint.textContent = 'Double-click or F11 for fullscreen';
    doc.body.appendChild(hint);

    function toggleFullscreen() {
      if (doc.fullscreenElement) doc.exitFullscreen().catch(function () {});
      else doc.documentElement.requestFullscreen().catch(function () {});
    }
    video.addEventListener('dblclick', toggleFullscreen);
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'F11' || e.key === 'f') {
        e.preventDefault();
        toggleFullscreen();
      }
    });

    video.play().catch(function () {});

    var entry = { win: win, source: source, stream: stream };
    popouts.push(entry);

    // Follow the source if Sharkord swaps its stream (e.g. a re-share), and close once the
    // stream has been gone for a while.
    var endedSince = 0;
    var timer = setInterval(function () {
      if (win.closed) {
        clearInterval(timer);
        popouts.splice(popouts.indexOf(entry), 1);
        return;
      }
      var next = entry.source.isConnected ? entry.source.srcObject : null;
      if (next !== entry.stream && hasLiveVideo(next)) {
        entry.stream = next;
        video.srcObject = next;
        video.play().catch(function () {});
      }
      if (hasLiveVideo(entry.stream)) {
        endedSince = 0;
        msg.style.display = 'none';
      } else {
        if (!endedSince) endedSince = Date.now();
        msg.style.display = 'flex';
        if (Date.now() - endedSince > 5000) win.close();
      }
    }, 1000);
  }

  // Streams die with this page, so take the pop-outs with it.
  window.addEventListener('pagehide', function () {
    popouts.forEach(function (p) { if (!p.win.closed) p.win.close(); });
  });
})();
