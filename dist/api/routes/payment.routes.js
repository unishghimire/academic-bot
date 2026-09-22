import { Router } from 'express';
import { manualPaymentService } from '../../services/manual-payment.service.js';
import { paymentMethodService } from '../../services/payment-method.service.js';
import { errorLogger } from '../../services/error-logger.service.js';
export function createPaymentRouter(discordClient) {
    const router = Router();
    // Public endpoint for students to fetch active QR payment methods
    router.get('/methods', async (_req, res) => {
        try {
            const methods = await paymentMethodService.listActiveMethods();
            res.json({
                success: true,
                data: methods,
            });
        }
        catch (error) {
            res.json({
                success: true,
                data: [],
                warning: 'Database offline or no payment methods configured yet.',
            });
        }
    });
    // Public submission endpoint for students to submit manual payment proof
    router.post('/manual-submit', async (req, res) => {
        try {
            const { studentName, phoneNumber, email, discordId, transactionId, amount, currency, paymentMethod, proofUrl, notes, } = req.body;
            const payment = await manualPaymentService.submitPaymentProof({
                studentName,
                phoneNumber,
                email,
                discordId,
                transactionId,
                amount: parseFloat(amount),
                currency: currency || 'USD',
                paymentMethod: paymentMethod || 'Direct Transfer',
                proofUrl,
                notes,
            }, discordClient);
            res.status(201).json({
                success: true,
                message: 'Payment proof submitted successfully and is queued for staff review.',
                data: {
                    id: payment.id,
                    transactionId: payment.transactionId,
                    status: payment.status,
                    createdAt: payment.createdAt,
                },
            });
        }
        catch (error) {
            await errorLogger.report(discordClient ?? null, {
                module: 'PAYMENT_PROOF_API',
                action: 'SUBMIT_PROOF',
                error,
                metadata: req.body,
            });
            res.status(400).json({
                success: false,
                error: error.message || 'Failed to submit payment proof',
            });
        }
    });
    return router;
}
//# sourceMappingURL=payment.routes.js.map