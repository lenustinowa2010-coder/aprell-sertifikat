import { DurableObject } from 'cloudflare:workers';
import { CounterError, readCounter, reserveNumber } from './counter-core.mjs';

export class CertificateCounter extends DurableObject {
  async read() { return readCounter(this.ctx.storage); }
  async reserve(body) { return reserveNumber(this.ctx.storage, body); }
  async fetch(request) {
    try {
      return Response.json(request.method === 'GET'
        ? await this.read() : await this.reserve(await request.json()));
    } catch (error) {
      return Response.json({ error: error instanceof CounterError ? error.message : 'Не удалось сохранить номер.' },
        { status: error instanceof CounterError ? error.status : 500 });
    }
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const headers = {
      'Access-Control-Allow-Origin': 'https://lenustinowa2010-coder.github.io',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store', 'Vary': 'Origin',
    };
    const reply = (body, status) => Response.json(body, { status, headers });
    if (origin && origin !== headers['Access-Control-Allow-Origin']) return reply({ error: 'Доступ запрещён.' }, 403);
    if (new URL(request.url).pathname !== '/counter') return reply({ error: 'Не найдено.' }, 404);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (!['GET', 'POST'].includes(request.method)) return reply({ error: 'Метод не поддерживается.' }, 405);
    const stub = env.COUNTER.get(env.COUNTER.idFromName('aprell-certificates'));
    try {
      if (request.method === 'POST' && (await request.clone().text()).length > 1024) return reply({ error: 'Запрос слишком большой.' }, 413);
      const result = await stub.fetch(request);
      return new Response(result.body, { status: result.status, headers: { ...headers, 'Content-Type': 'application/json' } });
    } catch {
      return reply({ error: 'Общее хранилище временно недоступно. Повторите запрос.' }, 503);
    }
  }
};
