import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../db/client.js';
import { env } from '../../config/env.js';
import { manualPaymentService } from '../../services/manual-payment.service.js';
import { paymentMethodService } from '../../services/payment-method.service.js';
import { tierEngine } from '../../services/tier-engine.service.js';
import { roleSyncService } from '../../services/role-sync.service.js';
import { auditService } from '../../services/audit.service.js';
import { errorLogger } from '../../services/error-logger.service.js';
import { Client } from 'discord.js';
import { ManualPaymentStatus, SubscriptionStatus } from '@prisma/client';

export function createAdminRouter(discordClient?: Client | null): Router {
  const router = Router();

  // Admin authentication middleware
  function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers['x-admin-key'] as string;
    const queryKey = req.query.key as string;
    const token = authHeader || queryKey;

    if (!token || token !== env.ADMIN_PANEL_KEY) {
      res.status(401).json({ error: 'Unauthorized: Invalid Admin Panel Access Key' });
      return;
    }

    next();
  }

  router.use(requireAdminAuth);

  // 1. Dashboard Overview Stats
  router.get('/stats', async (_req: Request, res: Response) => {
    try {
      const [
        totalUsers,
        activeSubscribers,
        pendingPayments,
        approvedPayments,
        tier1,
        tier2,
        tier3,
        graduates,
        recentAuditCount,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { subscriptionStatus: SubscriptionStatus.ACTIVE } }),
        prisma.manualPayment.count({ where: { status: ManualPaymentStatus.PENDING } }),
        prisma.manualPayment.count({ where: { status: ManualPaymentStatus.APPROVED } }),
        prisma.user.count({ where: { currentTier: 1 } }),
        prisma.user.count({ where: { currentTier: 2 } }),
        prisma.user.count({ where: { currentTier: 3 } }),
        prisma.user.count({ where: { currentTier: 4 } }),
        prisma.auditLog.count(),
      ]);

      const revenueAggregate = await prisma.manualPayment.aggregate({
        where: { status: ManualPaymentStatus.APPROVED },
        _sum: { amount: true },
      });

      res.json({
        success: true,
        stats: {
          totalUsers,
          activeSubscribers,
          pendingPayments,
          approvedPayments,
          totalManualRevenue: revenueAggregate._sum.amount || 0,
          tierDistribution: { tier1, tier2, tier3, graduates },
          auditLogsCount: recentAuditCount,
          botOnline: discordClient?.isReady() ?? false,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 2. Manual Payment Proofs List & Filter
  router.get('/manual-payments', async (req: Request, res: Response) => {
    try {
      const status = req.query.status as ManualPaymentStatus | 'ALL' | undefined;
      const search = req.query.search as string | undefined;

      const payments = await manualPaymentService.listPayments({
        status: status || 'ALL',
        search,
      });

      res.json({ success: true, data: payments });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 3. Approve Manual Payment Proof
  router.post('/manual-payments/:id/approve', async (req: Request, res: Response) => {
    const paymentId = req.params.id;
    const { adminId, durationDays, tier, notes } = req.body;

    try {
      const result = await manualPaymentService.approvePayment(
        paymentId,
        {
          adminId: adminId || 'web_admin',
          durationDays: durationDays ? parseInt(durationDays, 10) : 30,
          tier: tier ? parseInt(tier, 10) : 1,
          notes,
        },
        discordClient
      );

      res.json({
        success: true,
        message: 'Payment approved. Subscription activated and Discord roles synced.',
        data: result,
      });
    } catch (error: any) {
      await errorLogger.report(discordClient ?? null, {
        module: 'ADMIN_API',
        action: 'APPROVE_MANUAL_PAYMENT',
        error,
        metadata: { paymentId, body: req.body },
      });
      res.status(400).json({ error: error.message });
    }
  });

  // 4. Reject Manual Payment Proof
  router.post('/manual-payments/:id/reject', async (req: Request, res: Response) => {
    const paymentId = req.params.id;
    const { adminId, reason } = req.body;

    if (!reason || !reason.trim()) {
      res.status(400).json({ error: 'Mandatory rejection reason is required' });
      return;
    }

    try {
      const result = await manualPaymentService.rejectPayment(paymentId, {
        adminId: adminId || 'web_admin',
        reason: reason.trim(),
      });

      res.json({
        success: true,
        message: 'Payment rejected.',
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // 5. Admin Direct Payment Entry (record offline payment on the spot)
  router.post('/manual-payments/create-direct', async (req: Request, res: Response) => {
    try {
      const {
        studentName,
        phoneNumber,
        email,
        discordId,
        transactionId,
        amount,
        paymentMethod,
        durationDays,
        tier,
        notes,
        adminId,
      } = req.body;

      // Submit as proof
      const payment = await manualPaymentService.submitPaymentProof(
        {
          studentName,
          phoneNumber,
          email,
          discordId,
          transactionId: transactionId || `DIRECT_${Date.now()}`,
          amount: parseFloat(amount),
          paymentMethod: paymentMethod || 'Cash / Direct Wire',
          notes: notes || 'Direct manual entry by admin',
        },
        discordClient
      );

      // Instantly approve
      const result = await manualPaymentService.approvePayment(
        payment.id,
        {
          adminId: adminId || 'web_admin',
          durationDays: durationDays ? parseInt(durationDays, 10) : 30,
          tier: tier ? parseInt(tier, 10) : 1,
          notes: notes || 'Instantly approved via Admin Panel direct entry',
        },
        discordClient
      );

      res.status(201).json({
        success: true,
        message: 'Direct payment recorded and subscription activated immediately.',
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // 6. List Students & Manage Tiers
  router.get('/users', async (req: Request, res: Response) => {
    try {
      const search = req.query.search as string | undefined;
      const where: any = {};

      if (search && search.trim()) {
        const q = search.trim();
        where.OR = [
          { email: { contains: q, mode: 'insensitive' } },
          { discordId: { contains: q, mode: 'insensitive' } },
          { accountId: { contains: q, mode: 'insensitive' } },
        ];
      }

      const users = await prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 },
          manualPayments: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });

      res.json({ success: true, data: users });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 7. Student Tier Override
  router.post('/users/:id/tier', async (req: Request, res: Response) => {
    const userId = req.params.id;
    const { tier, reason, adminId } = req.body;

    if (!reason || !reason.trim()) {
      res.status(400).json({ error: 'Mandatory reason is required for tier override' });
      return;
    }

    try {
      await tierEngine.applyAdminOverride(
        userId,
        parseInt(tier, 10),
        adminId || 'web_admin',
        reason.trim()
      );

      if (discordClient) {
        await roleSyncService.syncUserRoles(userId, discordClient);
      }

      res.json({ success: true, message: `User tier updated to Tier ${tier} and roles synced.` });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // 8. View Audit Logs
  router.get('/audit-logs', async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const logs = await prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      res.json({ success: true, data: logs });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 9. Payment Methods Management (Admin QR Uploads & Settings)
  router.get('/payment-methods', async (_req: Request, res: Response) => {
    try {
      const methods = await paymentMethodService.listAllMethods();
      res.json({ success: true, data: methods });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/payment-methods', async (req: Request, res: Response) => {
    try {
      const { title, accountName, accountNumber, qrCodeUrl, instructions, active, adminId } = req.body;
      const created = await paymentMethodService.createMethod({
        title,
        accountName,
        accountNumber,
        qrCodeUrl,
        instructions,
        active: active !== undefined ? Boolean(active) : true,
        adminId: adminId || 'admin',
      });

      res.status(201).json({
        success: true,
        message: 'Payment method created successfully',
        data: created,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.put('/payment-methods/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const { title, accountName, accountNumber, qrCodeUrl, instructions, active, orderIndex, adminId } = req.body;
      const updated = await paymentMethodService.updateMethod(id, {
        title,
        accountName,
        accountNumber,
        qrCodeUrl,
        instructions,
        active,
        orderIndex,
        adminId: adminId || 'admin',
      });

      res.json({
        success: true,
        message: 'Payment method updated successfully',
        data: updated,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.patch('/payment-methods/:id/toggle', async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const adminId = (req.body?.adminId as string) || 'admin';
      const toggled = await paymentMethodService.toggleStatus(id, adminId);

      res.json({
        success: true,
        message: `Payment method ${toggled.active ? 'activated' : 'deactivated'}`,
        data: toggled,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.delete('/payment-methods/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const adminId = (req.query?.adminId as string) || 'admin';
      const deleted = await paymentMethodService.deleteMethod(id, adminId);

      res.json({
        success: true,
        message: 'Payment method deleted successfully',
        data: deleted,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  return router;
}
