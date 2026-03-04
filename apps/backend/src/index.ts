// Fastify server entry point — owned by Architect Agent (scaffold), extended by Backend Agent (routes)
// Registers all route plugins, CORS, JWT, and starts the cron scheduler

// IMPORTANT: dotenv must be loaded BEFORE any module that reads process.env.
// ES module imports are hoisted, so we use dynamic imports for everything that
// depends on env vars (routes, cron, etc.) to guarantee load order.

import dotenv from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

// Load .env from the monorepo root.
// When running via `npm run dev` from apps/backend/, cwd is apps/backend/.
// The .env lives at the monorepo root (two levels up).
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

// Now that env vars are loaded, dynamically import everything that depends on them.
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
  const { startCronJobs } = await import('./cron/dogSync.js');

  const PORT = parseInt(process.env.PORT || '3000', 10);
  const fastify = Fastify({ logger: true });

  await fastify.register(cors, { origin: true });
  await fastify.register(jwt, { secret: process.env.JWT_SECRET! });

  // Register routes
  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(dogsRoutes, { prefix: '/dogs' });
  await fastify.register(swipesRoutes, { prefix: '/swipes' });
  await fastify.register(matchesRoutes, { prefix: '/matches' });
  await fastify.register(usersRoutes, { prefix: '/me' });
  await fastify.register(notificationsRoutes, { prefix: '/notifications' });

  // Health check
  fastify.get('/health', async () => ({ status: 'ok' }));

  // Start cron jobs
  startCronJobs();

  await fastify.listen({ port: PORT, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
