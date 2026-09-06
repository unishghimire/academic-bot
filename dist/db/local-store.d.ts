import { PaymentMethod, ManualPayment, ManualPaymentStatus } from '@prisma/client';
export interface LocalLinkingCode {
    id: string;
    userId: string;
    discordId: string;
    code: string;
    expiresAt: string | Date;
    usedAt?: string | Date | null;
}
export declare const localStore: {
    getPaymentMethods(onlyActive?: boolean): PaymentMethod[];
    savePaymentMethod(method: PaymentMethod): PaymentMethod;
    deletePaymentMethod(id: string): PaymentMethod | null;
    getManualPayments(status?: string): ManualPayment[];
    saveManualPayment(payment: ManualPayment): ManualPayment;
    findPaymentById(id: string): ManualPayment | null;
    findPaymentByTxId(txId: string): ManualPayment | null;
    updatePaymentStatus(id: string, status: ManualPaymentStatus, reviewedBy?: string, rejectionReason?: string): ManualPayment | null;
    getAuditLogs(limit?: number): any[];
    saveAuditLog(log: any): void;
    getUsers(): any[];
    saveUser(user: any): any;
    findUserById(id: string): any | null;
    findUserByDiscordId(discordId: string): any | null;
    getLiveClasses(): any[];
    saveLiveClass(meeting: any): any;
    findLiveClassById(id: string): any | null;
    deleteLiveClass(id: string): boolean;
    getLinkingCodes(): LocalLinkingCode[];
    saveLinkingCode(linkingCode: LocalLinkingCode): LocalLinkingCode;
    findLinkingCode(code: string): LocalLinkingCode | null;
    markLinkingCodeUsed(code: string): boolean;
};
