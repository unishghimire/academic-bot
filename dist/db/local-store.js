import fs from 'fs';
import path from 'path';
const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'local_storage.json');
let cachedData = null;
function ensureDataFile() {
    if (cachedData) {
        return cachedData;
    }
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        if (!fs.existsSync(DATA_FILE)) {
            const initialData = {
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
            cachedData = initialData;
            return cachedData;
        }
        const content = fs.readFileSync(DATA_FILE, 'utf-8');
        cachedData = JSON.parse(content);
        return cachedData;
    }
    catch {
        cachedData = { paymentMethods: [], manualPayments: [], auditLogs: [] };
        return cachedData;
    }
}
function saveData(data) {
    cachedData = data;
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    }
    catch (err) {
        console.error('Failed to save local JSON storage:', err);
    }
}
export const localStore = {
    // Payment Methods
    getPaymentMethods(onlyActive = false) {
        const data = ensureDataFile();
        const methods = data.paymentMethods || [];
        if (onlyActive) {
            return methods.filter(m => m.active);
        }
        return methods;
    },
    savePaymentMethod(method) {
        const data = ensureDataFile();
        const index = data.paymentMethods.findIndex(m => m.id === method.id);
        if (index >= 0) {
            data.paymentMethods[index] = method;
        }
        else {
            data.paymentMethods.push(method);
        }
        saveData(data);
        return method;
    },
    deletePaymentMethod(id) {
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
    getManualPayments(status) {
        const data = ensureDataFile();
        let payments = data.manualPayments || [];
        if (status && status !== 'ALL') {
            payments = payments.filter(p => p.status === status);
        }
        return payments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
    saveManualPayment(payment) {
        const data = ensureDataFile();
        const index = data.manualPayments.findIndex(p => p.id === payment.id || p.transactionId === payment.transactionId);
        if (index >= 0) {
            data.manualPayments[index] = payment;
        }
        else {
            data.manualPayments.unshift(payment);
        }
        saveData(data);
        return payment;
    },
    findPaymentById(id) {
        const data = ensureDataFile();
        return data.manualPayments.find(p => p.id === id) || null;
    },
    findPaymentByTxId(txId) {
        const data = ensureDataFile();
        return data.manualPayments.find(p => p.transactionId.toLowerCase() === txId.toLowerCase()) || null;
    },
    updatePaymentStatus(id, status, reviewedBy, rejectionReason) {
        const data = ensureDataFile();
        const payment = data.manualPayments.find(p => p.id === id);
        if (payment) {
            payment.status = status;
            payment.reviewedBy = reviewedBy || null;
            payment.reviewedAt = new Date();
            if (rejectionReason)
                payment.rejectionReason = rejectionReason;
            payment.updatedAt = new Date();
            saveData(data);
            return payment;
        }
        return null;
    },
    // Audit Logs
    getAuditLogs(limit = 50) {
        const data = ensureDataFile();
        const logs = data.auditLogs || [];
        return logs
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, limit);
    },
    saveAuditLog(log) {
        const data = ensureDataFile();
        if (!data.auditLogs)
            data.auditLogs = [];
        data.auditLogs.unshift({
            id: `audit_${Date.now()}`,
            createdAt: new Date(),
            ...log,
        });
        if (data.auditLogs.length > 200)
            data.auditLogs = data.auditLogs.slice(0, 200);
        saveData(data);
    },
    // Users
    getUsers() {
        const data = ensureDataFile();
        return data.users || [];
    },
    saveUser(user) {
        const data = ensureDataFile();
        if (!data.users)
            data.users = [];
        const idx = data.users.findIndex((u) => u.id === user.id || u.email === user.email);
        if (idx >= 0) {
            data.users[idx] = { ...data.users[idx], ...user };
        }
        else {
            data.users.unshift(user);
        }
        saveData(data);
        return user;
    },
    findUserById(id) {
        const data = ensureDataFile();
        return (data.users || []).find((u) => u.id === id) || null;
    },
    findUserByDiscordId(discordId) {
        const data = ensureDataFile();
        return (data.users || []).find((u) => u.discordId === discordId) || null;
    },
    // Live Classes / Meetings
    getLiveClasses() {
        const data = ensureDataFile();
        return data.liveClasses || [];
    },
    saveLiveClass(meeting) {
        const data = ensureDataFile();
        if (!data.liveClasses)
            data.liveClasses = [];
        const idx = data.liveClasses.findIndex((m) => m.id === meeting.id);
        if (idx >= 0) {
            data.liveClasses[idx] = { ...data.liveClasses[idx], ...meeting };
        }
        else {
            data.liveClasses.unshift(meeting);
        }
        saveData(data);
        return meeting;
    },
    findLiveClassById(id) {
        const data = ensureDataFile();
        return (data.liveClasses || []).find((m) => m.id === id) || null;
    },
    deleteLiveClass(id) {
        const data = ensureDataFile();
        if (!data.liveClasses)
            return false;
        const idx = data.liveClasses.findIndex((m) => m.id === id);
        if (idx >= 0) {
            data.liveClasses.splice(idx, 1);
            saveData(data);
            return true;
        }
        return false;
    },
    // Account Linking Codes
    getLinkingCodes() {
        const data = ensureDataFile();
        return data.linkingCodes || [];
    },
    saveLinkingCode(linkingCode) {
        const data = ensureDataFile();
        if (!data.linkingCodes)
            data.linkingCodes = [];
        // Invalidate existing unused codes for this discordId
        data.linkingCodes = data.linkingCodes.filter(c => c.discordId !== linkingCode.discordId || c.usedAt != null);
        data.linkingCodes.push(linkingCode);
        saveData(data);
        return linkingCode;
    },
    findLinkingCode(code) {
        const data = ensureDataFile();
        const codes = data.linkingCodes || [];
        return codes.find(c => c.code.toUpperCase() === code.toUpperCase()) || null;
    },
    markLinkingCodeUsed(code) {
        const data = ensureDataFile();
        if (!data.linkingCodes)
            return false;
        const item = data.linkingCodes.find(c => c.code.toUpperCase() === code.toUpperCase());
        if (item) {
            item.usedAt = new Date();
            saveData(data);
            return true;
        }
        return false;
    },
    // Expiry Warnings & Notices Tracking
    hasWarningBeenSent(userId, expiresAt) {
        const data = ensureDataFile();
        const warnings = data.warningsSent || {};
        const key = `warning_3d:${userId}:${new Date(expiresAt).toISOString().split('T')[0]}`;
        return Boolean(warnings[key]);
    },
    markWarningSent(userId, expiresAt) {
        const data = ensureDataFile();
        if (!data.warningsSent)
            data.warningsSent = {};
        const key = `warning_3d:${userId}:${new Date(expiresAt).toISOString().split('T')[0]}`;
        data.warningsSent[key] = new Date().toISOString();
        saveData(data);
    },
    hasExpiredNoticeBeenSent(userId, expiresAt) {
        const data = ensureDataFile();
        const warnings = data.warningsSent || {};
        const dateStr = expiresAt ? new Date(expiresAt).toISOString().split('T')[0] : 'general';
        const key = `expired_notice:${userId}:${dateStr}`;
        return Boolean(warnings[key]);
    },
    markExpiredNoticeSent(userId, expiresAt) {
        const data = ensureDataFile();
        if (!data.warningsSent)
            data.warningsSent = {};
        const dateStr = expiresAt ? new Date(expiresAt).toISOString().split('T')[0] : 'general';
        const key = `expired_notice:${userId}:${dateStr}`;
        data.warningsSent[key] = new Date().toISOString();
        saveData(data);
    },
    // Hourly Motivation State Tracking
    getMotivationState() {
        const data = ensureDataFile();
        return data.motivationState || { lastIndex: -1 };
    },
    setMotivationState(state) {
        const data = ensureDataFile();
        data.motivationState = state;
        saveData(data);
    }
};
//# sourceMappingURL=local-store.js.map