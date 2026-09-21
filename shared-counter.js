(() => {
  const status = $('counter-status');
  const nextButton = $('next');
  const download = $('download');
  const endpoint = window.APRELL_COUNTER_URL;
  let ready = false;
  let busy = false;
  let reservedNumber = '';
  let pending = null;
  let revision = 0;

  function message(text) { status.textContent = text; }
  function controls() {
    elNum.disabled = !ready || busy;
    nextButton.disabled = !ready || busy;
    // Export the displayed card, including an existing number after reload.
    // Reserving a new number is a separate operation and must not block export.
    download.disabled = !imgReady || !elNum.value.trim();
  }
  async function api(body) {
    if (!endpoint) throw new Error('Общее хранилище ещё не подключено.');
    const response = await fetch(endpoint + '/counter', {
      method: body ? 'POST' : 'GET', cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || 'Не удалось получить общий номер.');
      error.status = response.status;
      throw error;
    }
    if (!/^\d{4,9}$/.test(data.last || '')) throw new Error('Хранилище вернуло некорректный номер.');
    return data;
  }
  function failure(error) {
    message(error.name === 'TimeoutError' || error instanceof TypeError
      ? 'Нет связи с общим счётчиком. Номер не подтверждён; повторите то же действие.'
      : error.message);
  }
  async function refresh() {
    if (!ready || busy || document.hidden) return;
    const startedAt = revision;
    try {
      const data = await api();
      if (busy || revision !== startedAt) return;
      const previousLast = lastNum;
      lastNum = data.last;
      if (!reservedNumber && !pending && document.activeElement !== elNum && elNum.value === previousLast) {
        elNum.value = lastNum;
        draw();
      }
      // Do not overwrite an active certificate or a manager's unfinished input.
      message('Последний общий номер: ' + lastNum + (reservedNumber ? '. Ваш номер: ' + reservedNumber + '.' : '. Нажмите «Следующий номер».'));
    } catch (error) { failure(error); }
    controls();
  }
  async function initialize() {
    if (busy) return;
    busy = true; controls();
    try {
      const data = await api();
      lastNum = data.last;
      elNum.value = lastNum;
      reservedNumber = '';
      ready = true;
      message('Последний общий номер: ' + lastNum + '. Нажмите «Следующий номер».');
      draw();
    } catch (error) { failure(error); }
    finally { busy = false; controls(); }
  }
  async function reserve(action) {
    if (!ready || busy) return;
    const number = elNum.value.trim();
    if (action === 'reserve' && number === reservedNumber) return;
    if (action === 'reserve' && !/^\d{1,9}$/.test(number)) {
      reservedNumber = ''; message('Укажите номер цифрами, не более 9 знаков.'); controls(); return;
    }
    const fingerprint = JSON.stringify([action, action === 'reserve' ? number : null]);
    if (pending && pending.fingerprint !== fingerprint) {
      message('Предыдущий запрос не подтверждён. Повторите то же действие, чтобы узнать его результат.');
      return;
    }
    if (!pending) pending = { fingerprint, body: { action, requestId: crypto.randomUUID(), ...(action === 'reserve' ? { number } : {}) } };
    busy = true; revision++; reservedNumber = ''; controls();
    message('Сохраняем номер в общем хранилище…');
    try {
      const data = await api(pending.body);
      if (!/^\d{4,9}$/.test(data.number || '')) throw new Error('Хранилище не подтвердило номер.');
      reservedNumber = data.number;
      elNum.value = reservedNumber;
      lastNum = data.last;
      pending = null;
      message('Номер ' + reservedNumber + ' закреплён за этой картой и сохранён для всех.');
      draw();
    } catch (error) {
      if (error.status && error.status < 500) pending = null;
      failure(error);
    } finally { busy = false; revision++; controls(); }
  }
  elNum.addEventListener('input', () => {
    reservedNumber = '';
    controls();
    message('Номер изменён. Нажмите Enter или выйдите из поля, чтобы сохранить его для всех.');
  });
  elNum.addEventListener('change', () => reserve('reserve'));
  elNum.addEventListener('keydown', event => { if (event.key === 'Enter') reserve('reserve'); });
  nextButton.addEventListener('click', () => reserve('next'));
  download.addEventListener('click', () => {
    const number = elNum.value.trim();
    if (!imgReady || !number) return;
    draw();
    const link = document.createElement('a');
    link.download = 'APRELL_сертификат_' + number.replace(/[^\w.-]/g, '_') + '.jpg';
    link.href = cv.toDataURL('image/jpeg', 0.95);
    link.click();
  });
  img.addEventListener('load', controls);
  function sync() { if (!document.hidden) return ready ? refresh() : initialize(); }
  window.addEventListener('focus', sync);
  document.addEventListener('visibilitychange', sync);
  setInterval(sync, 15000);
  message('Загружаем последний общий номер…');
  controls();
  initialize();
})();
