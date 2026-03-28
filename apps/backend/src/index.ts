// Fastify server entry point
// Registers all route plugins, CORS, and JWT

import dotenv from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

const candidates = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '..', '..', '.env'),
  resolve(process.cwd(), '..', '.env'),
];
const envPath = candidates.find((p) => existsSync(p));
if (envPath) {
  dotenv.config({ path: envPath });
} else {
  console.warn('[WARN] No .env file found. Checked:', candidates.join(', '));
}

async function main() {
  const Fastify = (await import('fastify')).default;
  const cors = (await import('@fastify/cors')).default;
  const jwt = (await import('@fastify/jwt')).default;
  const { authRoutes } = await import('./routes/auth.js');
  const { dogsRoutes } = await import('./routes/dogs.js');
  const { swipesRoutes } = await import('./routes/swipes.js');
  const { matchesRoutes } = await import('./routes/matches.js');
  const { usersRoutes } = await import('./routes/users.js');
  const { notificationsRoutes } = await import('./routes/notifications.js');

  const PORT = parseInt(process.env.PORT || '3000', 10);
  const fastify = Fastify({ logger: true });

  await fastify.register(cors, { origin: true });
  await fastify.register(jwt, { secret: process.env.JWT_SECRET! });

  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(dogsRoutes, { prefix: '/dogs' });
  await fastify.register(swipesRoutes, { prefix: '/swipes' });
  await fastify.register(matchesRoutes, { prefix: '/matches' });
  await fastify.register(usersRoutes, { prefix: '/me' });
  await fastify.register(notificationsRoutes, { prefix: '/notifications' });

  fastify.get('/health', async () => ({ status: 'ok' }));

  await fastify.listen({ port: PORT, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});