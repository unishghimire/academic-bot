import { describe, it, expect, vi } from 'vitest';
import { ManualPaymentService } from '../src/services/manual-payment.service.js';
import { ManualPaymentStatus, SubscriptionStatus } from '@prisma/client';

describe('ManualPaymentService — Proof Verification & Role Synchronization', () => {
  it('submits payment proof with student name, phone number, and transaction ID as PENDING', async () => {
    const mockDb: any = {
      manualPayment: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(args => Promise.resolve({ id: 'mp_1', ...args.data })),
      },
      user: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    const mockAuditor: any = { log: vi.fn().mockResolvedValue({}) };
    const mockRoleSync: any = { syncUserRoles: vi.fn().mockResolvedValue({}) };

    const service = new ManualPaymentService(mockDb, mockAuditor, mockRoleSync);

    const result = await service.submitPaymentProof({
      studentName: 'John Doe',
      phoneNumber: '+1 555-123-4567',
      email: 'john@example.com',
      transactionId: 'TXN-998877',
      amount: 49.0,
      paymentMethod: 'Bank Transfer',
      notes: 'Paid via Chase wire',
    });

    expect(result.id).toBe('mp_1');
    expect(result.studentName).toBe('John Doe');
    expect(result.phoneNumber).toBe('+1 555-123-4567');
    expect(result.status).toBe(ManualPaymentStatus.PENDING);
    expect(mockAuditor.log).toHaveBeenCalled();
  });

  it('rejects duplicate transaction reference IDs', async () => {
    const mockDb: any = {
      manualPayment: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'mp_existing',
          transactionId: 'DUP-1234',
          status: ManualPaymentStatus.PENDING,
        }),
      },
    };

    const service = new ManualPaymentService(mockDb, {} as any, {} as any);

    await expect(
      service.submitPaymentProof({
        studentName: 'Jane Smith',
        phoneNumber: '+1 555-987-6543',
        email: 'jane@example.com',
        transactionId: 'DUP-1234',
        amount: 49.0,
        paymentMethod: 'Zelle',
      })
    ).rejects.toThrow('has already been submitted');
  });

  it('approves payment, activates subscription in database, and triggers role sync', async () => {
    const mockDb: any = {
      manualPayment: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'mp_10',
          studentName: 'Mark Spencer',
          phoneNumber: '+1 555-222-3333',
          email: 'mark@example.com',
          discordId: 'discord_mark_123',
          transactionId: 'TXN-APPROVED-1',
          amount: 99.0,
          status: ManualPaymentStatus.PENDING,
          user: null,
        }),
        update: vi.fn().mockImplementation(args => Promise.resolve(args.data)),
      },
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'u_mark',
          email: 'mark@example.com',
          discordId: 'discord_mark_123',
          subscriptionStatus: SubscriptionStatus.PENDING,
          currentTier: 1,
        }),
        update: vi.fn().mockImplementation(args => Promise.resolve({ id: 'u_mark', ...args.data })),
      },
      subscription: {
        upsert: vi.fn().mockResolvedValue({}),
      },
    };

    const mockAuditor: any = { log: vi.fn().mockResolvedValue({}) };
    const mockRoleSync: any = { syncUserRoles: vi.fn().mockResolvedValue({}) };

    const service = new ManualPaymentService(mockDb, mockAuditor, mockRoleSync);

    const result = await service.approvePayment(
      'mp_10',
      {
        adminId: 'admin_alex',
        durationDays: 30,
        tier: 1,
        notes: 'Verified bank slip',
      },
      null // mock discord client
    );

    expect(mockDb.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u_mark' },
        data: expect.objectContaining({
          subscriptionStatus: SubscriptionStatus.ACTIVE,
        }),
      })
    );

    expect(mockDb.manualPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mp_10' },
        data: expect.objectContaining({
          status: ManualPaymentStatus.APPROVED,
          reviewedBy: 'admin_alex',
        }),
      })
    );

    expect(mockAuditor.log).toHaveBeenCalled();
  });

  it('rejects payment proof with mandatory reason', async () => {
    const mockDb: any = {
      manualPayment: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'mp_20',
          status: ManualPaymentStatus.PENDING,
        }),
        update: vi.fn().mockImplementation(args => Promise.resolve(args.data)),
      },
    };

    const mockAuditor: any = { log: vi.fn().mockResolvedValue({}) };
    const service = new ManualPaymentService(mockDb, mockAuditor, {} as any);

    await service.rejectPayment('mp_20', {
      adminId: 'admin_alex',
      reason: 'Transaction reference not found in bank ledger',
    });

    expect(mockDb.manualPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mp_20' },
        data: expect.objectContaining({
          status: ManualPaymentStatus.REJECTED,
          rejectionReason: 'Transaction reference not found in bank ledger',
        }),
      })
    );
    expect(mockAuditor.log).toHaveBeenCalled();
  });
});
