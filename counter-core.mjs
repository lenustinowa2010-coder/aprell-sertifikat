// Storage must provide a serializable transaction(callback) with get/put.
export const INITIAL_NUMBER = 585;
export const formatNumber = number => String(number).padStart(4, '0');

export class CounterError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function readCounter(storage) {
  const value = (await storage.get('last')) ?? INITIAL_NUMBER;
  return { last: formatNumber(value) };
}

export async function reserveNumber(storage, request) {
  if (!request || !/^[0-9a-f-]{36}$/i.test(request.requestId || '')) {
    throw new CounterError('Некорректный идентификатор запроса.', 400);
  }
  if (!['next', 'reserve'].includes(request.action)) {
    throw new CounterError('Неизвестное действие.', 400);
  }
  if (request.action === 'reserve' && !/^\d{1,9}$/.test(request.number || '')) {
    throw new CounterError('Укажите номер цифрами, не более 9 знаков.', 400);
  }
  const fingerprint = JSON.stringify([request.action, request.number ?? null]);
  return storage.transaction(async transaction => {
    const key = 'request:' + request.requestId;
    const existing = await transaction.get(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new CounterError('Этот запрос уже использован для другого номера.', 409);
      }
      return existing.result;
    }
    const current = (await transaction.get('last')) ?? INITIAL_NUMBER;
    const next = request.action === 'next' ? current + 1 : Number(request.number);
    if (next <= current) {
      throw new CounterError('Номер уже занят. Последний общий номер: ' + formatNumber(current), 409);
    }
    if (next > 999999999) throw new CounterError('Достигнут предел номеров.', 409);
    const result = { number: formatNumber(next), last: formatNumber(next) };
    await transaction.put('last', next);
    await transaction.put(key, { fingerprint, result });
    return result;
  });
}
