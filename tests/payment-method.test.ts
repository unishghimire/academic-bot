import { describe, it, expect, vi } from 'vitest';
import { PaymentMethodService } from '../src/services/payment-method.service.js';

describe('PaymentMethodService — QR Payment Method Management', () => {
  it('creates a new payment method with QR code and account details', async () => {
    const mockDb: any = {
      paymentMethod: {
        create: vi.fn().mockImplementation(args => Promise.resolve({ id: 'pm_1', ...args.data })),
      },
    };

    const mockAuditor: any = { log: vi.fn().mockResolvedValue({}) };
    const service = new PaymentMethodService(mockDb, mockAuditor);

    const method = await service.createMethod({
      title: 'eSewa Mobile Wallet',
      accountName: 'The Elite Circle',
      accountNumber: '9800000000',
      qrCodeUrl: 'data:image/png;base64,mock_qr_data',
      instructions: 'Please put your Discord username in payment remarks',
      active: true,
      adminId: 'admin_123',
    });

    expect(method.id).toBe('pm_1');
    expect(method.title).toBe('eSewa Mobile Wallet');
    expect(method.accountName).toBe('The Elite Circle');
    expect(method.accountNumber).toBe('9800000000');
    expect(method.qrCodeUrl).toBe('data:image/png;base64,mock_qr_data');
    expect(method.active).toBe(true);
    expect(mockAuditor.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PAYMENT_METHOD_CREATED',
        actorId: 'admin_123',
      })
    );
  });

  it('rejects creation when title or account number is empty', async () => {
    const mockDb: any = { paymentMethod: { create: vi.fn() } };
    const service = new PaymentMethodService(mockDb, {} as any);

    await expect(
      service.createMethod({
        title: '',
        accountNumber: '9800000000',
      })
    ).rejects.toThrow('Payment method title is required');

    await expect(
      service.createMethod({
        title: 'Bank Transfer',
        accountNumber: '',
      })
    ).rejects.toThrow('Account number or wallet address is required');
  });

  it('lists only active payment methods for student portal', async () => {
    const activeMethods = [
      { id: 'pm_1', title: 'Bank Transfer', accountNumber: '12345', active: true },
      { id: 'pm_2', title: 'eSewa', accountNumber: '98000', active: true },
    ];

    const mockDb: any = {
      paymentMethod: {
        findMany: vi.fn().mockResolvedValue(activeMethods),
      },
    };

    const service = new PaymentMethodService(mockDb, {} as any);
    const result = await service.listActiveMethods();

    expect(result).toHaveLength(2);
    expect(mockDb.paymentMethod.findMany).toHaveBeenCalledWith({
      where: { active: true },
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
    });
  });

  it('toggles payment method active status', async () => {
    const existing = { id: 'pm_1', title: 'Zelle', accountNumber: 'zelle@example.com', active: true };
    const mockDb: any = {
      paymentMethod: {
        findUnique: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...existing, ...data })),
      },
    };

    const mockAuditor: any = { log: vi.fn().mockResolvedValue({}) };
    const service = new PaymentMethodService(mockDb, mockAuditor);

    const toggled = await service.toggleStatus('pm_1', 'admin_1');

    expect(toggled.active).toBe(false);
    expect(mockAuditor.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PAYMENT_METHOD_TOGGLED',
        after: { active: false },
      })
    );
  });

  it('deletes a payment method and logs audit trail', async () => {
    const existing = { id: 'pm_1', title: 'Old Method' };
    const mockDb: any = {
      paymentMethod: {
        findUnique: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(existing),
      },
    };

    const mockAuditor: any = { log: vi.fn().mockResolvedValue({}) };
    const service = new PaymentMethodService(mockDb, mockAuditor);

    const deleted = await service.deleteMethod('pm_1', 'admin_1');

    expect(deleted.id).toBe('pm_1');
    expect(mockAuditor.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PAYMENT_METHOD_DELETED',
      })
    );
  });
});
