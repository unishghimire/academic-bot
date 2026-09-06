import { PrismaClient, PaymentMethod, ActorType } from '@prisma/client';
import { prisma as defaultPrisma, isPostgresOnline } from '../db/client.js';
import { auditService as defaultAuditService, AuditService } from './audit.service.js';
import { localStore } from '../db/local-store.js';

export interface CreatePaymentMethodInput {
  title: string;
  accountName?: string;
  accountNumber: string;
  qrCodeUrl?: string;
  instructions?: string;
  active?: boolean;
  orderIndex?: number;
  adminId?: string;
}

export interface UpdatePaymentMethodInput {
  title?: string;
  accountName?: string;
  accountNumber?: string;
  qrCodeUrl?: string;
  instructions?: string;
  active?: boolean;
  orderIndex?: number;
  adminId?: string;
}

export class PaymentMethodService {
  private db: PrismaClient;
  private auditor: AuditService;

  constructor(db: PrismaClient = defaultPrisma, auditor: AuditService = defaultAuditService) {
    this.db = db;
    this.auditor = auditor;
  }

  private isOffline(): boolean {
    return this.db === defaultPrisma && !isPostgresOnline();
  }

  /**
   * List all active payment methods for student checkout / proof submission
   */
  async listActiveMethods(): Promise<PaymentMethod[]> {
    if (this.isOffline()) {
      return localStore.getPaymentMethods(true);
    }
    try {
      return await this.db.paymentMethod.findMany({
        where: { active: true },
        orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
      });
    } catch {
      return localStore.getPaymentMethods(true);
    }
  }

  /**
   * List all payment methods for admin management
   */
  async listAllMethods(): Promise<PaymentMethod[]> {
    if (this.isOffline()) {
      return localStore.getPaymentMethods(false);
    }
    try {
      return await this.db.paymentMethod.findMany({
        orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
      });
    } catch {
      return localStore.getPaymentMethods(false);
    }
  }

  /**
   * Get single payment method by ID
   */
  async getMethodById(id: string): Promise<PaymentMethod | null> {
    if (this.isOffline()) {
      const all = localStore.getPaymentMethods(false);
      return all.find(m => m.id === id) || null;
    }
    try {
      return await this.db.paymentMethod.findUnique({
        where: { id },
      });
    } catch {
      const all = localStore.getPaymentMethods(false);
      return all.find(m => m.id === id) || null;
    }
  }

  /**
   * Create a new payment method with QR code
   */
  async createMethod(input: CreatePaymentMethodInput): Promise<PaymentMethod> {
    if (!input.title || !input.title.trim()) {
      throw new Error('Payment method title is required (e.g. eSewa, Bank Transfer, Zelle)');
    }
    if (!input.accountNumber || !input.accountNumber.trim()) {
      throw new Error('Account number or wallet address is required');
    }

    let method: PaymentMethod;

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
      localStore.savePaymentMethod(method);
    } else {
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
      } catch {
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
        localStore.savePaymentMethod(method);
      }
    }

    await this.auditor.log({
      actorType: ActorType.ADMIN,
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
  async updateMethod(id: string, input: UpdatePaymentMethodInput): Promise<PaymentMethod> {
    if (this.isOffline()) {
      const all = localStore.getPaymentMethods(false);
      const existing = all.find(m => m.id === id);
      if (!existing) {
        throw new Error(`Payment method with ID ${id} not found`);
      }
      if (input.title !== undefined) existing.title = input.title.trim();
      if (input.accountName !== undefined) existing.accountName = input.accountName?.trim() || null;
      if (input.accountNumber !== undefined) existing.accountNumber = input.accountNumber.trim();
      if (input.qrCodeUrl !== undefined) existing.qrCodeUrl = input.qrCodeUrl || null;
      if (input.instructions !== undefined) existing.instructions = input.instructions?.trim() || null;
      if (input.active !== undefined) existing.active = input.active;
      existing.updatedAt = new Date();
      return localStore.savePaymentMethod(existing);
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
    } catch {
      const all = localStore.getPaymentMethods(false);
      const existing = all.find(m => m.id === id);
      if (!existing) {
        throw new Error(`Payment method with ID ${id} not found`);
      }
      if (input.title !== undefined) existing.title = input.title.trim();
      if (input.accountName !== undefined) existing.accountName = input.accountName?.trim() || null;
      if (input.accountNumber !== undefined) existing.accountNumber = input.accountNumber.trim();
      if (input.qrCodeUrl !== undefined) existing.qrCodeUrl = input.qrCodeUrl || null;
      if (input.instructions !== undefined) existing.instructions = input.instructions?.trim() || null;
      if (input.active !== undefined) existing.active = input.active;
      existing.updatedAt = new Date();
      return localStore.savePaymentMethod(existing);
    }
  }

  /**
   * Toggle active status of a payment method
   */
  async toggleStatus(id: string, adminId?: string): Promise<PaymentMethod> {
    let updated: PaymentMethod;

    if (this.isOffline()) {
      const all = localStore.getPaymentMethods(false);
      const existing = all.find(m => m.id === id);
      if (!existing) {
        throw new Error(`Payment method with ID ${id} not found`);
      }
      existing.active = !existing.active;
      existing.updatedAt = new Date();
      updated = localStore.savePaymentMethod(existing);
    } else {
      try {
        const existing = await this.db.paymentMethod.findUnique({ where: { id } });
        if (!existing) {
          throw new Error(`Payment method with ID ${id} not found`);
        }

        updated = await this.db.paymentMethod.update({
          where: { id },
          data: { active: !existing.active },
        });
      } catch {
        const all = localStore.getPaymentMethods(false);
        const existing = all.find(m => m.id === id);
        if (!existing) {
          throw new Error(`Payment method with ID ${id} not found`);
        }
        existing.active = !existing.active;
        existing.updatedAt = new Date();
        updated = localStore.savePaymentMethod(existing);
      }
    }

    await this.auditor.log({
      actorType: ActorType.ADMIN,
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
  async deleteMethod(id: string, adminId?: string): Promise<PaymentMethod> {
    let deleted: PaymentMethod | null = null;

    if (this.isOffline()) {
      deleted = localStore.deletePaymentMethod(id);
      if (!deleted) {
        throw new Error(`Payment method with ID ${id} not found`);
      }
    } else {
      try {
        const existing = await this.db.paymentMethod.findUnique({ where: { id } });
        if (!existing) {
          throw new Error(`Payment method with ID ${id} not found`);
        }

        deleted = await this.db.paymentMethod.delete({
          where: { id },
        });
      } catch {
        deleted = localStore.deletePaymentMethod(id);
        if (!deleted) {
          throw new Error(`Payment method with ID ${id} not found`);
        }
      }
    }

    await this.auditor.log({
      actorType: ActorType.ADMIN,
      action: 'PAYMENT_METHOD_DELETED',
      actorId: adminId || 'admin',
      targetType: 'PAYMENT_METHOD',
      targetId: id,
      after: { title: deleted.title },
    }).catch(() => null);

    return deleted;
  }
}

export const paymentMethodService = new PaymentMethodService();
