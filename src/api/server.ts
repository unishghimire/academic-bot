import express, { Express } from 'express';
import cors from 'cors';
import path from 'path';
import { Client } from 'discord.js';
import { createStripeRouter } from './routes/stripe.routes.js';
import { createProgressRouter } from './routes/progress.routes.js';
import { createLinkRouter } from './routes/link.routes.js';
import { createPaymentRouter } from './routes/payment.routes.js';
import { createAdminRouter } from './routes/admin.routes.js';
import { checkDbConnection } from '../db/client.js';

export function createApiServer(discordClient?: Client | null): Express {
  const app = express();

  app.use(cors());

  // Raw body for Stripe webhook signature verification
  app.use(
    '/webhooks',
    express.raw({ type: 'application/json' }),
    createStripeRouter(discordClient)
  );

  // Support up to 15MB JSON & form bodies for QR code and receipt image uploads
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // Serve static UI assets (Admin Panel & Payment Proof portal)
  app.use(express.static(path.join(process.cwd(), 'public')));

  app.get('/admin', (_req, res) => {
    res.redirect('/admin/index.html');
  });

  app.get('/health', async (_req, res) => {
    const dbOk = await checkDbConnection();
    res.status(dbOk ? 200 : 503).json({
      status: dbOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      database: dbOk ? 'connected' : 'disconnected',
      discord: discordClient?.isReady() ? 'connected' : 'disconnected',
    });
  });

  app.use('/api/progress', createProgressRouter(discordClient));
  app.use('/api/link', createLinkRouter(discordClient));
  app.use('/api/payments', createPaymentRouter(discordClient));
  app.use('/api/admin', createAdminRouter(discordClient));

  return app;
}
