import fs from 'fs';
import path from 'path';
import { PaymentMethod, ManualPayment, ManualPaymentStatus } from '@prisma/client';

export interface LocalLinkingCode {
  id: string;
  userId: string;
  discordId: string;
  code: string;
  expiresAt: string | Date;
  usedAt?: string | Date | null;
}

interface LocalData {
  paymentMethods: PaymentMethod[];
  manualPayments: ManualPayment[];
  auditLogs: any[];
  users?: any[];
  liveClasses?: any[];
  linkingCodes?: LocalLinkingCode[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'local_storage.json');

function ensureDataFile(): LocalData {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
      const initialData: LocalData = {
        paymentMethods: [
          {
            id: 'pm_default_1',
            title: 'eSewa Mobile Wallet',
            accountName: 'Academy Official',
            accountNumber: '9801234567',
            qrCodeUrl: '',
            instructions: 'Please include your Discord username or email in the remarks field.',
            active: true,
            orderIndex: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'pm_default_2',
            title: 'Bank Wire / Direct Transfer',
            accountName: 'The Elite Circle Academy',
            accountNumber: '01201000984210',
            qrCodeUrl: '',
            instructions: 'Transfer reference must match your transaction ID on this form.',
            active: true,
            orderIndex: 2,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        ],
        manualPayments: [],
        auditLogs: [],
      };
      fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
      return initialData;
    }
    const content = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { paymentMethods: [], manualPayments: [], auditLogs: [] };
  }
}

function saveData(data: LocalData): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save local JSON storage:', err);
  }
}

export const localStore = {
  // Payment Methods
  getPaymentMethods(onlyActive = false): PaymentMethod[] {
    const data = ensureDataFile();
    const methods = data.paymentMethods || [];
    if (onlyActive) {
      return methods.filter(m => m.active);
    }
    return methods;
  },

  savePaymentMethod(method: PaymentMethod): PaymentMethod {
    const data = ensureDataFile();
    const index = data.paymentMethods.findIndex(m => m.id === method.id);
    if (index >= 0) {
      data.paymentMethods[index] = method;
    } else {
      data.paymentMethods.push(method);
    }
    saveData(data);
    return method;
  },

  deletePaymentMethod(id: string): PaymentMethod | null {
    const data = ensureDataFile();
    const index = data.paymentMethods.findIndex(m => m.id === id);
    if (index >= 0) {
      const deleted = data.paymentMethods.splice(index, 1)[0];
      saveData(data);
      return deleted;
    }
    return null;
  },

  // Manual Payments
  getManualPayments(status?: string): ManualPayment[] {
    const data = ensureDataFile();
    let payments = data.manualPayments || [];
    if (status && status !== 'ALL') {
      payments = payments.filter(p => p.status === status);
    }
    return payments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  saveManualPayment(payment: ManualPayment): ManualPayment {
    const data = ensureDataFile();
    const index = data.manualPayments.findIndex(p => p.id === payment.id || p.transactionId === payment.transactionId);
    if (index >= 0) {
      data.manualPayments[index] = payment;
    } else {
      data.manualPayments.unshift(payment);
    }
    saveData(data);
    return payment;
  },

  findPaymentById(id: string): ManualPayment | null {
    const data = ensureDataFile();
    return data.manualPayments.find(p => p.id === id) || null;
  },

  findPaymentByTxId(txId: string): ManualPayment | null {
    const data = ensureDataFile();
    return data.manualPayments.find(p => p.transactionId.toLowerCase() === txId.toLowerCase()) || null;
  },

  updatePaymentStatus(id: string, status: ManualPaymentStatus, reviewedBy?: string, rejectionReason?: string): ManualPayment | null {
    const data = ensureDataFile();
    const payment = data.manualPayments.find(p => p.id === id);
    if (payment) {
      payment.status = status;
      payment.reviewedBy = reviewedBy || null;
      payment.reviewedAt = new Date();
      if (rejectionReason) payment.rejectionReason = rejectionReason;
      payment.updatedAt = new Date();
      saveData(data);
      return payment;
    }
    return null;
  },

  // Audit Logs
  getAuditLogs(limit = 50): any[] {
    const data = ensureDataFile();
    const logs = data.auditLogs || [];
    return logs
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  },

  saveAuditLog(log: any): void {
    const data = ensureDataFile();
    if (!data.auditLogs) data.auditLogs = [];
    data.auditLogs.unshift({
      id: `audit_${Date.now()}`,
      createdAt: new Date(),
      ...log,
    });
    if (data.auditLogs.length > 200) data.auditLogs = data.auditLogs.slice(0, 200);
    saveData(data);
  },

  // Users
  getUsers(): any[] {
    const data = ensureDataFile();
    return (data as any).users || [];
  },

  saveUser(user: any): any {
    const data = ensureDataFile();
    if (!(data as any).users) (data as any).users = [];
    const idx = (data as any).users.findIndex((u: any) => u.id === user.id || u.email === user.email);
    if (idx >= 0) {
      (data as any).users[idx] = { ...(data as any).users[idx], ...user };
    } else {
      (data as any).users.unshift(user);
    }
    saveData(data);
    return user;
  },

  findUserById(id: string): any | null {
    const data = ensureDataFile();
    return ((data as any).users || []).find((u: any) => u.id === id) || null;
  },

  findUserByDiscordId(discordId: string): any | null {
    const data = ensureDataFile();
    return ((data as any).users || []).find((u: any) => u.discordId === discordId) || null;
  },

  // Live Classes / Meetings
  getLiveClasses(): any[] {
    const data = ensureDataFile();
    return (data as any).liveClasses || [];
  },

  saveLiveClass(meeting: any): any {
    const data = ensureDataFile();
    if (!(data as any).liveClasses) (data as any).liveClasses = [];
    const idx = (data as any).liveClasses.findIndex((m: any) => m.id === meeting.id);
    if (idx >= 0) {
      (data as any).liveClasses[idx] = { ...(data as any).liveClasses[idx], ...meeting };
    } else {
      (data as any).liveClasses.unshift(meeting);
    }
    saveData(data);
    return meeting;
  },

  findLiveClassById(id: string): any | null {
    const data = ensureDataFile();
    return ((data as any).liveClasses || []).find((m: any) => m.id === id) || null;
  },

  deleteLiveClass(id: string): boolean {
    const data = ensureDataFile();
    if (!(data as any).liveClasses) return false;
    const idx = (data as any).liveClasses.findIndex((m: any) => m.id === id);
    if (idx >= 0) {
      (data as any).liveClasses.splice(idx, 1);
      saveData(data);
      return true;
    }
    return false;
  },

  // Account Linking Codes
  getLinkingCodes(): LocalLinkingCode[] {
    const data = ensureDataFile();
    return data.linkingCodes || [];
  },

  saveLinkingCode(linkingCode: LocalLinkingCode): LocalLinkingCode {
    const data = ensureDataFile();
    if (!data.linkingCodes) data.linkingCodes = [];
    // Invalidate existing unused codes for this discordId
    data.linkingCodes = data.linkingCodes.filter(
      c => c.discordId !== linkingCode.discordId || c.usedAt != null
    );
    data.linkingCodes.push(linkingCode);
    saveData(data);
    return linkingCode;
  },

  findLinkingCode(code: string): LocalLinkingCode | null {
    const data = ensureDataFile();
    const codes = data.linkingCodes || [];
    return codes.find(c => c.code.toUpperCase() === code.toUpperCase()) || null;
  },

  markLinkingCodeUsed(code: string): boolean {
    const data = ensureDataFile();
    if (!data.linkingCodes) return false;
    const item = data.linkingCodes.find(c => c.code.toUpperCase() === code.toUpperCase());
    if (item) {
      item.usedAt = new Date();
      saveData(data);
      return true;
    }
    return false;
  }
};
