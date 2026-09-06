"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAdminRouter = createAdminRouter;
const express_1 = require("express");
const client_js_1 = require("../../db/client.js");
const local_store_js_1 = require("../../db/local-store.js");
const env_js_1 = require("../../config/env.js");
const manual_payment_service_js_1 = require("../../services/manual-payment.service.js");
const payment_method_service_js_1 = require("../../services/payment-method.service.js");
const tier_engine_service_js_1 = require("../../services/tier-engine.service.js");
const role_sync_service_js_1 = require("../../services/role-sync.service.js");
const error_logger_service_js_1 = require("../../services/error-logger.service.js");
const payment_verification_sync_service_js_1 = require("../../services/payment-verification-sync.service.js");
const client_1 = require("@prisma/client");
function createAdminRouter(discordClient) {
    const router = (0, express_1.Router)();
    // Admin authentication middleware
    function requireAdminAuth(req, res, next) {
        const authHeader = req.headers['x-admin-key'];
        const queryKey = req.query.key;
        const token = authHeader || queryKey;
        const cleanToken = (token || '').trim().replace(/^["']|["']$/g, '');
        const cleanKey = (env_js_1.env.ADMIN_PANEL_KEY || '').trim().replace(/^["']|["']$/g, '');
        if (!cleanToken || cleanToken !== cleanKey) {
            res.status(401).json({ error: 'Unauthorized: Invalid Admin Panel Access Key' });
            return;
        }
        next();
    }
    router.use(requireAdminAuth);
    // 0. Verify access key without requiring database
    router.get('/verify', (_req, res) => {
        res.json({ success: true, message: 'Admin access key verified successfully' });
    });
    // 1. Dashboard Overview Stats
    router.get('/stats', async (_req, res) => {
        if (!(0, client_js_1.isDatabaseOnline)()) {
            const pending = local_store_js_1.localStore.getManualPayments('PENDING');
            const approved = local_store_js_1.localStore.getManualPayments('APPROVED');
            const revenue = approved.reduce((sum, p) => sum + (p.amount || 0), 0);
            res.json({
                success: true,
                stats: {
                    totalUsers: local_store_js_1.localStore.getUsers().length,
                    activeSubscribers: local_store_js_1.localStore.getUsers().filter(u => u.subscriptionStatus === 'ACTIVE').length,
                    pendingPayments: pending.length,
                    approvedPayments: approved.length,
                    totalManualRevenue: revenue,
                    tierDistribution: { tier1: 0, tier2: 0, tier3: 0, graduates: 0 },
                    auditLogsCount: local_store_js_1.localStore.getAuditLogs().length,
                    botOnline: discordClient?.isReady() ?? false,
                    dbConnected: false,
                    warning: 'PostgreSQL database is currently disconnected. System active in local resilient storage mode.',
                },
            });
            return;
        }
        try {
            const [totalUsers, activeSubscribers, pendingPayments, approvedPayments, tier1, tier2, tier3, graduates, recentAuditCount,] = await Promise.all([
                client_js_1.prisma.user.count(),
                client_js_1.prisma.user.count({ where: { subscriptionStatus: client_1.SubscriptionStatus.ACTIVE } }),
                client_js_1.prisma.manualPayment.count({ where: { status: client_1.ManualPaymentStatus.PENDING } }),
                client_js_1.prisma.manualPayment.count({ where: { status: client_1.ManualPaymentStatus.APPROVED } }),
                client_js_1.prisma.user.count({ where: { currentTier: 1 } }),
                client_js_1.prisma.user.count({ where: { currentTier: 2 } }),
                client_js_1.prisma.user.count({ where: { currentTier: 3 } }),
                client_js_1.prisma.user.count({ where: { currentTier: 4 } }),
                client_js_1.prisma.auditLog.count(),
            ]);
            const revenueAggregate = await client_js_1.prisma.manualPayment.aggregate({
                where: { status: client_1.ManualPaymentStatus.APPROVED },
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
                    dbConnected: true,
                },
            });
        }
        catch (error) {
            // Graceful fallback if database is not reachable yet
            res.json({
                success: true,
                stats: {
                    totalUsers: 0,
                    activeSubscribers: 0,
                    pendingPayments: 0,
                    approvedPayments: 0,
                    totalManualRevenue: 0,
                    tierDistribution: { tier1: 0, tier2: 0, tier3: 0, graduates: 0 },
                    auditLogsCount: 0,
                    botOnline: discordClient?.isReady() ?? false,
                    dbConnected: false,
                    warning: 'PostgreSQL database is currently disconnected. Update DATABASE_URL password in .env.',
                },
            });
        }
    });
    // 2. Manual Payment Proofs List & Filter
    router.get('/manual-payments', async (req, res) => {
        try {
            const status = req.query.status;
            const search = req.query.search;
            const payments = await manual_payment_service_js_1.manualPaymentService.listPayments({
                status: status || 'ALL',
                search,
            });
            res.json({ success: true, data: payments });
        }
        catch (error) {
            res.json({ success: true, data: [], error: error.message });
        }
    });
    // 3. Approve Manual Payment Proof
    router.post('/manual-payments/:id/approve', async (req, res) => {
        const paymentId = req.params.id;
        const { adminId, durationDays, tier, notes } = req.body;
        try {
            const result = await manual_payment_service_js_1.manualPaymentService.approvePayment(paymentId, {
                adminId: adminId || 'web_admin',
                durationDays: durationDays ? parseInt(durationDays, 10) : 30,
                tier: tier ? parseInt(tier, 10) : 1,
                notes,
            }, discordClient);
            res.json({
                success: true,
                message: 'Payment approved. Subscription activated and Discord roles synced.',
                data: result,
            });
        }
        catch (error) {
            await error_logger_service_js_1.errorLogger.report(discordClient ?? null, {
                module: 'ADMIN_API',
                action: 'APPROVE_MANUAL_PAYMENT',
                error,
                metadata: { paymentId, body: req.body },
            });
            res.status(400).json({ error: error.message });
        }
    });
    // Trigger immediate database payment verification sync
    router.post('/sync-verifications', async (req, res) => {
        try {
            if (discordClient) {
                const result = await payment_verification_sync_service_js_1.paymentVerificationSyncService.syncApprovedPayments(discordClient);
                res.json({ success: true, result });
            }
            else {
                res.json({ success: false, message: 'Discord client not connected' });
            }
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    // 4. Reject Manual Payment Proof
    router.post('/manual-payments/:id/reject', async (req, res) => {
        const paymentId = req.params.id;
        const { adminId, reason } = req.body;
        if (!reason || !reason.trim()) {
            res.status(400).json({ error: 'Mandatory rejection reason is required' });
            return;
        }
        try {
            const result = await manual_payment_service_js_1.manualPaymentService.rejectPayment(paymentId, {
                adminId: adminId || 'web_admin',
                reason: reason.trim(),
            });
            res.json({
                success: true,
                message: 'Payment rejected.',
                data: result,
            });
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
    // 5. Admin Direct Payment Entry (record offline payment on the spot)
    router.post('/manual-payments/create-direct', async (req, res) => {
        try {
            const { studentName, phoneNumber, email, discordId, transactionId, amount, paymentMethod, durationDays, tier, notes, adminId, } = req.body;
            // Submit as proof
            const payment = await manual_payment_service_js_1.manualPaymentService.submitPaymentProof({
                studentName,
                phoneNumber,
                email,
                discordId,
                transactionId: transactionId || `DIRECT_${Date.now()}`,
                amount: parseFloat(amount),
                paymentMethod: paymentMethod || 'Cash / Direct Wire',
                notes: notes || 'Direct manual entry by admin',
            }, discordClient);
            // Instantly approve
            const result = await manual_payment_service_js_1.manualPaymentService.approvePayment(payment.id, {
                adminId: adminId || 'web_admin',
                durationDays: durationDays ? parseInt(durationDays, 10) : 30,
                tier: tier ? parseInt(tier, 10) : 1,
                notes: notes || 'Instantly approved via Admin Panel direct entry',
            }, discordClient);
            res.status(201).json({
                success: true,
                message: 'Direct payment recorded and subscription activated immediately.',
                data: result,
            });
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
    // 6. List Students & Manage Tiers
    router.get('/users', async (req, res) => {
        if (!(0, client_js_1.isDatabaseOnline)()) {
            res.json({ success: true, data: local_store_js_1.localStore.getUsers() });
            return;
        }
        try {
            const search = req.query.search;
            const where = {};
            if (search && search.trim()) {
                const q = search.trim();
                where.OR = [
                    { email: { contains: q, mode: 'insensitive' } },
                    { discordId: { contains: q, mode: 'insensitive' } },
                    { accountId: { contains: q, mode: 'insensitive' } },
                ];
            }
            const users = await client_js_1.prisma.user.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: 100,
                include: {
                    subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 },
                    manualPayments: { orderBy: { createdAt: 'desc' }, take: 1 },
                },
            });
            res.json({ success: true, data: users });
        }
        catch (error) {
            res.json({ success: true, data: [], error: error.message });
        }
    });
    // 7. Student Tier Override
    router.post('/users/:id/tier', async (req, res) => {
        const userId = req.params.id;
        const { tier, reason, adminId } = req.body;
        if (!reason || !reason.trim()) {
            res.status(400).json({ error: 'Mandatory reason is required for tier override' });
            return;
        }
        try {
            await tier_engine_service_js_1.tierEngine.applyAdminOverride(userId, parseInt(tier, 10), adminId || 'web_admin', reason.trim());
            if (discordClient) {
                await role_sync_service_js_1.roleSyncService.syncUserRoles(userId, discordClient);
            }
            res.json({ success: true, message: `User tier updated to Tier ${tier} and roles synced.` });
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
    // 8. View Audit Logs
    router.get('/audit-logs', async (req, res) => {
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
        if (!(0, client_js_1.isDatabaseOnline)()) {
            res.json({ success: true, data: local_store_js_1.localStore.getAuditLogs(limit) });
            return;
        }
        try {
            const logs = await client_js_1.prisma.auditLog.findMany({
                orderBy: { createdAt: 'desc' },
                take: limit,
            });
            res.json({ success: true, data: logs });
        }
        catch (error) {
            res.json({ success: true, data: [], error: error.message });
        }
    });
    // 9. Payment Methods Management (Admin QR Uploads & Settings)
    router.get('/payment-methods', async (_req, res) => {
        try {
            const methods = await payment_method_service_js_1.paymentMethodService.listAllMethods();
            res.json({ success: true, data: methods });
        }
        catch (error) {
            res.json({ success: true, data: [], error: error.message });
        }
    });
    router.post('/payment-methods', async (req, res) => {
        try {
            const { title, accountName, accountNumber, qrCodeUrl, instructions, active, adminId } = req.body;
            const created = await payment_method_service_js_1.paymentMethodService.createMethod({
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
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
    router.put('/payment-methods/:id', async (req, res) => {
        try {
            const id = req.params.id;
            const { title, accountName, accountNumber, qrCodeUrl, instructions, active, orderIndex, adminId } = req.body;
            const updated = await payment_method_service_js_1.paymentMethodService.updateMethod(id, {
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
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
    router.patch('/payment-methods/:id/toggle', async (req, res) => {
        try {
            const id = req.params.id;
            const adminId = req.body?.adminId || 'admin';
            const toggled = await payment_method_service_js_1.paymentMethodService.toggleStatus(id, adminId);
            res.json({
                success: true,
                message: `Payment method ${toggled.active ? 'activated' : 'deactivated'}`,
                data: toggled,
            });
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
    router.delete('/payment-methods/:id', async (req, res) => {
        try {
            const id = req.params.id;
            const adminId = req.query?.adminId || 'admin';
            const deleted = await payment_method_service_js_1.paymentMethodService.deleteMethod(id, adminId);
            res.json({
                success: true,
                message: 'Payment method deleted successfully',
                data: deleted,
            });
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
    return router;
}
//# sourceMappingURL=admin.routes.js.map