import { PrismaClient, PaymentMethod, ActorType } from '@prisma/client';
import { prisma as defaultPrisma } from '../db/client.js';
import { auditService as defaultAuditService, AuditService } from './audit.service.js';

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

  /**
   * List all active payment methods for student checkout / proof submission
   */
  async listActiveMethods(): Promise<PaymentMethod[]> {
    return this.db.paymentMethod.findMany({
      where: { active: true },
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * List all payment methods for admin management
   */
  async listAllMethods(): Promise<PaymentMethod[]> {
    return this.db.paymentMethod.findMany({
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Get single payment method by ID
   */
  async getMethodById(id: string): Promise<PaymentMethod | null> {
    return this.db.paymentMethod.findUnique({
      where: { id },
    });
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

    const method = await this.db.paymentMethod.create({
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

    await this.auditor.log({
      actorType: ActorType.ADMIN,
      action: 'PAYMENT_METHOD_UPDATED',
      actorId: input.adminId || 'admin',
      targetType: 'PAYMENT_METHOD',
      targetId: id,
      after: { changes: input as any },
    }).catch(() => null);

    return updated;
  }

  /**
   * Toggle active status of a payment method
   */
  async toggleStatus(id: string, adminId?: string): Promise<PaymentMethod> {
    const existing = await this.db.paymentMethod.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`Payment method with ID ${id} not found`);
    }

    const updated = await this.db.paymentMethod.update({
      where: { id },
      data: { active: !existing.active },
    });

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
    const existing = await this.db.paymentMethod.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`Payment method with ID ${id} not found`);
    }

    const deleted = await this.db.paymentMethod.delete({
      where: { id },
    });

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
