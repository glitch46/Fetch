module.exports = {
  apps: [
    {
      name: 'fetch-backend',
      cwd: '/home/chad/Documents/Fetch/apps/backend',
      script: 'npx',
      args: 'tsx src/index.ts',
      env: {
        NODE_ENV: 'production',
      },
      // Load .env from monorepo root
      node_args: '--require dotenv/config',
      // Auto-restart on crash with backoff
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      // Watch for file changes (disable in production, enable for dev)
      watch: false,
      // Log rotation
      max_memory_restart: '500M',
      error_file: '/home/chad/Documents/Fetch/logs/fetch-backend-error.log',
      out_file: '/home/chad/Documents/Fetch/logs/fetch-backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};