import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import { z } from 'zod';
import { env } from './config';

const COOKIE = 'session';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const PUBLIC_PATHS = new Set(['/api/health', '/api/session', '/api/login', '/api/logout']);

// Simple brute-force protection: lock an IP for a minute after 5 failed attempts.
const failures = new Map<string, { count: number; until: number }>();

function passwordMatches(input: string): boolean {
  const a = createHash('sha256').update(input).digest();
  const b = createHash('sha256').update(env.adminPassword).digest();
  return timingSafeEqual(a, b);
}

export function isAuthenticated(req: FastifyRequest): boolean {
  const raw = req.cookies[COOKIE];
  if (!raw) return false;
  const result = req.unsignCookie(raw);
  return result.valid && Number(result.value) > Date.now();
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  await app.register(cookie, { secret: env.sessionSecret });

  app.addHook('onRequest', async (req, reply) => {
    const path = req.url.split('?')[0];
    if (!path.startsWith('/api/') || PUBLIC_PATHS.has(path)) return;
    if (!isAuthenticated(req)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });

  app.get('/api/session', async (req) => ({ authenticated: isAuthenticated(req) }));

  app.post('/api/login', async (req, reply) => {
    const body = z.object({ password: z.string() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_request' });

    const entry = failures.get(req.ip);
    if (entry && entry.until > Date.now()) {
      return reply.code(429).send({ error: 'too_many_attempts' });
    }

    if (!env.adminPassword || !passwordMatches(body.data.password)) {
      const count = (entry?.count ?? 0) + 1;
      failures.set(req.ip, { count, until: count >= 5 ? Date.now() + 60_000 : 0 });
      return reply.code(401).send({ error: 'invalid_password' });
    }

    failures.delete(req.ip);
    reply.setCookie(COOKIE, String(Date.now() + SESSION_MS), {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      secure: env.cookieSecure,
      path: '/',
      maxAge: SESSION_MS / 1000,
    });
    return { authenticated: true };
  });

  app.post('/api/logout', async (_req, reply) => {
    reply.clearCookie(COOKIE, { path: '/' });
    return { authenticated: false };
  });
}
