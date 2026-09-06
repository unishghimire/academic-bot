"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.localStore = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DATA_DIR = path_1.default.join(process.cwd(), 'data');
const DATA_FILE = path_1.default.join(DATA_DIR, 'local_storage.json');
function ensureDataFile() {
    try {
        if (!fs_1.default.existsSync(DATA_DIR)) {
            fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
        }
        if (!fs_1.default.existsSync(DATA_FILE)) {
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
            fs_1.default.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
            return initialData;
        }
        const content = fs_1.default.readFileSync(DATA_FILE, 'utf-8');
        return JSON.parse(content);
    }
    catch {
        return { paymentMethods: [], manualPayments: [], auditLogs: [] };
    }
}
function saveData(data) {
    try {
        if (!fs_1.default.existsSync(DATA_DIR)) {
            fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs_1.default.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    }
    catch (err) {
        console.error('Failed to save local JSON storage:', err);
    }
}
exports.localStore = {
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
    }
};
//# sourceMappingURL=local-store.js.map