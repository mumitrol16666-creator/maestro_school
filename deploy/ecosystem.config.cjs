/** @type {import('pm2').StartOptions[]} */
module.exports = {
  apps: [
    {
      name: "maestro-api",
      cwd: "/var/www/maestro_school/backend",
      script: "dist/main.js",
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "maestro-web",
      cwd: "/var/www/maestro_school/web_app",
      script: "node_modules/next/dist/bin/next",
      args: "start -H 0.0.0.0 -p 3000",
      instances: 1,
      autorestart: true,
      max_memory_restart: "768M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
