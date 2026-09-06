"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentMethodService = exports.PaymentMethodService = void 0;
const client_1 = require("@prisma/client");
const client_js_1 = require("../db/client.js");
const audit_service_js_1 = require("./audit.service.js");
const local_store_js_1 = require("../db/local-store.js");
class PaymentMethodService {
    db;
    auditor;
    constructor(db = client_js_1.prisma, auditor = audit_service_js_1.auditService) {
        this.db = db;
        this.auditor = auditor;
    }
    isOffline() {
        return this.db === client_js_1.prisma && !(0, client_js_1.isDatabaseOnline)();
    }
    /**
     * List all active payment methods for student checkout / proof submission
     */
    async listActiveMethods() {
        if (this.isOffline()) {
            return local_store_js_1.localStore.getPaymentMethods(true);
        }
        try {
            return await this.db.paymentMethod.findMany({
                where: { active: true },
                orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
            });
        }
        catch {
            return local_store_js_1.localStore.getPaymentMethods(true);
        }
    }
    /**
     * List all payment methods for admin management
     */
    async listAllMethods() {
        if (this.isOffline()) {
            return local_store_js_1.localStore.getPaymentMethods(false);
        }
        try {
            return await this.db.paymentMethod.findMany({
                orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
            });
        }
        catch {
            return local_store_js_1.localStore.getPaymentMethods(false);
        }
    }
    /**
     * Get single payment method by ID
     */
    async getMethodById(id) {
        if (this.isOffline()) {
            const all = local_store_js_1.localStore.getPaymentMethods(false);
            return all.find(m => m.id === id) || null;
        }
        try {
            return await this.db.paymentMethod.findUnique({
                where: { id },
            });
        }
        catch {
            const all = local_store_js_1.localStore.getPaymentMethods(false);
            return all.find(m => m.id === id) || null;
        }
    }
    /**
     * Create a new payment method with QR code
     */
    async createMethod(input) {
        if (!input.title || !input.title.trim()) {
            throw new Error('Payment method title is required (e.g. eSewa, Bank Transfer, Zelle)');
        }
        if (!input.accountNumber || !input.accountNumber.trim()) {
            throw new Error('Account number or wallet address is required');
        }
        let method;
        if (this.isOffline()) {
            method = {
                id: `pm_${Date.now()}`,
                title: input.title.trim(),
                accountName: input.accountName?.trim() || null,
                accountNumber: input.accountNumber.trim(),
                qrCodeUrl: input.qrCodeUrl || null,
                instructions: input.instructions?.trim() || null,
                active: input.active !== undefined ? input.active : true,
                orderIndex: input.orderIndex !== undefined ? input.orderIndex : 0,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            local_store_js_1.localStore.savePaymentMethod(method);
        }
        else {
            try {
                method = await this.db.paymentMethod.create({
                    data: {
                        title: input.title.trim(),
                        accountName: input.accountName?.trim() || null,
                        accountNumber: input.accountNumber.trim(),
                        qrCodeUrl: input.qrCodeUrl || null,
                        instructions: input.instructions?.trim() || null,
                        active: input.active !== undefined ? input.active : true,
                        orderIndex: input.orderIndex !== undefined ? input.orderIndex : 0,
                    },
                });
            }
            catch {
                method = {
                    id: `pm_${Date.now()}`,
                    title: input.title.trim(),
                    accountName: input.accountName?.trim() || null,
                    accountNumber: input.accountNumber.trim(),
                    qrCodeUrl: input.qrCodeUrl || null,
                    instructions: input.instructions?.trim() || null,
                    active: input.active !== undefined ? input.active : true,
                    orderIndex: input.orderIndex !== undefined ? input.orderIndex : 0,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
                local_store_js_1.localStore.savePaymentMethod(method);
            }
        }
        await this.auditor.log({
            actorType: client_1.ActorType.ADMIN,
            action: 'PAYMENT_METHOD_CREATED',
            actorId: input.adminId || 'admin',
            targetType: 'PAYMENT_METHOD',
            targetId: method.id,
            after: {
                title: method.title,
                accountNumber: method.accountNumber,
                hasQrCode: Boolean(method.qrCodeUrl),
            },
        }).catch(() => null);
        return method;
    }
    /**
     * Update an existing payment method
     */
    async updateMethod(id, input) {
        if (this.isOffline()) {
            const all = local_store_js_1.localStore.getPaymentMethods(false);
            const existing = all.find(m => m.id === id);
            if (!existing) {
                throw new Error(`Payment method with ID ${id} not found`);
            }
            if (input.title !== undefined)
                existing.title = input.title.trim();
            if (input.accountName !== undefined)
                existing.accountName = input.accountName?.trim() || null;
            if (input.accountNumber !== undefined)
                existing.accountNumber = input.accountNumber.trim();
            if (input.qrCodeUrl !== undefined)
                existing.qrCodeUrl = input.qrCodeUrl || null;
            if (input.instructions !== undefined)
                existing.instructions = input.instructions?.trim() || null;
            if (input.active !== undefined)
                existing.active = input.active;
            existing.updatedAt = new Date();
            return local_store_js_1.localStore.savePaymentMethod(existing);
        }
        try {
            const existing = await this.db.paymentMethod.findUnique({ where: { id } });
            if (!existing) {
                throw new Error(`Payment method with ID ${id} not found`);
            }
            const updated = await this.db.paymentMethod.update({
                where: { id },
                data: {
                    title: input.title !== undefined ? input.title.trim() : undefined,
                    accountName: input.accountName !== undefined ? (input.accountName ? input.accountName.trim() : null) : undefined,
                    accountNumber: input.accountNumber !== undefined ? input.accountNumber.trim() : undefined,
                    qrCodeUrl: input.qrCodeUrl !== undefined ? input.qrCodeUrl : undefined,
                    instructions: input.instructions !== undefined ? (input.instructions ? input.instructions.trim() : null) : undefined,
                    active: input.active !== undefined ? input.active : undefined,
                    orderIndex: input.orderIndex !== undefined ? input.orderIndex : undefined,
                },
            });
            return updated;
        }
        catch {
            const all = local_store_js_1.localStore.getPaymentMethods(false);
            const existing = all.find(m => m.id === id);
            if (!existing) {
                throw new Error(`Payment method with ID ${id} not found`);
            }
            if (input.title !== undefined)
                existing.title = input.title.trim();
            if (input.accountName !== undefined)
                existing.accountName = input.accountName?.trim() || null;
            if (input.accountNumber !== undefined)
                existing.accountNumber = input.accountNumber.trim();
            if (input.qrCodeUrl !== undefined)
                existing.qrCodeUrl = input.qrCodeUrl || null;
            if (input.instructions !== undefined)
                existing.instructions = input.instructions?.trim() || null;
            if (input.active !== undefined)
                existing.active = input.active;
            existing.updatedAt = new Date();
            return local_store_js_1.localStore.savePaymentMethod(existing);
        }
    }
    /**
     * Toggle active status of a payment method
     */
    async toggleStatus(id, adminId) {
        let updated;
        if (this.isOffline()) {
            const all = local_store_js_1.localStore.getPaymentMethods(false);
            const existing = all.find(m => m.id === id);
            if (!existing) {
                throw new Error(`Payment method with ID ${id} not found`);
            }
            existing.active = !existing.active;
            existing.updatedAt = new Date();
            updated = local_store_js_1.localStore.savePaymentMethod(existing);
        }
        else {
            try {
                const existing = await this.db.paymentMethod.findUnique({ where: { id } });
                if (!existing) {
                    throw new Error(`Payment method with ID ${id} not found`);
                }
                updated = await this.db.paymentMethod.update({
                    where: { id },
                    data: { active: !existing.active },
                });
            }
            catch {
                const all = local_store_js_1.localStore.getPaymentMethods(false);
                const existing = all.find(m => m.id === id);
                if (!existing) {
                    throw new Error(`Payment method with ID ${id} not found`);
                }
                existing.active = !existing.active;
                existing.updatedAt = new Date();
                updated = local_store_js_1.localStore.savePaymentMethod(existing);
            }
        }
        await this.auditor.log({
            actorType: client_1.ActorType.ADMIN,
            action: 'PAYMENT_METHOD_TOGGLED',
            actorId: adminId || 'admin',
            targetType: 'PAYMENT_METHOD',
            targetId: id,
            after: { active: updated.active },
        }).catch(() => null);
        return updated;
    }
    /**
     * Delete a payment method
     */
    async deleteMethod(id, adminId) {
        let deleted = null;
        if (this.isOffline()) {
            deleted = local_store_js_1.localStore.deletePaymentMethod(id);
            if (!deleted) {
                throw new Error(`Payment method with ID ${id} not found`);
            }
        }
        else {
            try {
                const existing = await this.db.paymentMethod.findUnique({ where: { id } });
                if (!existing) {
                    throw new Error(`Payment method with ID ${id} not found`);
                }
                deleted = await this.db.paymentMethod.delete({
                    where: { id },
                });
            }
            catch {
                deleted = local_store_js_1.localStore.deletePaymentMethod(id);
                if (!deleted) {
                    throw new Error(`Payment method with ID ${id} not found`);
                }
            }
        }
        await this.auditor.log({
            actorType: client_1.ActorType.ADMIN,
            action: 'PAYMENT_METHOD_DELETED',
            actorId: adminId || 'admin',
            targetType: 'PAYMENT_METHOD',
            targetId: id,
            after: { title: deleted.title },
        }).catch(() => null);
        return deleted;
    }
}
exports.PaymentMethodService = PaymentMethodService;
exports.paymentMethodService = new PaymentMethodService();
//# sourceMappingURL=payment-method.service.js.map