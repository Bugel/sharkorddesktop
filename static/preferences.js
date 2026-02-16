(function () {
  const input = document.getElementById('server-url');
  const cancelBtn = document.getElementById('cancel');
  const saveBtn = document.getElementById('save');

  window.sharkordDesktop.getServerUrl().then(function (url) {
    input.value = url || '';
    input.focus();
    input.select();
  });

  function save() {
    const url = input.value.trim();
    window.sharkordDesktop.setServerUrl(url);
  }

  cancelBtn.addEventListener('click', function () {
    window.sharkordDesktop.closePreferences();
  });

  saveBtn.addEventListener('click', save);

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') window.sharkordDesktop.closePreferences();
  });
})();
