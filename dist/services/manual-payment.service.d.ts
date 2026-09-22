import { PrismaClient, ManualPaymentStatus } from '@prisma/client';
import { AuditService } from './audit.service.js';
import { RoleSyncService } from './role-sync.service.js';
import { Client } from 'discord.js';
export interface SubmitPaymentProofDto {
    studentName: string;
    phoneNumber: string;
    email: string;
    discordId?: string;
    transactionId: string;
    amount: number;
    currency?: string;
    paymentMethod: string;
    proofUrl?: string;
    notes?: string;
}
export interface ApprovePaymentDto {
    adminId: string;
    durationDays?: number;
    tier?: number;
    notes?: string;
}
export interface RejectPaymentDto {
    adminId: string;
    reason: string;
}
export declare class ManualPaymentService {
    private db;
    private auditor;
    private roleSync;
    constructor(db?: PrismaClient, auditor?: AuditService, roleSync?: RoleSyncService);
    private isOffline;
    /**
     * Submits a manual payment proof for review
     */
    submitPaymentProof(data: SubmitPaymentProofDto, discordClient?: Client | null): Promise<any>;
    /**
     * Lists manual payments with optional status and search filters
     */
    listPayments(options?: {
        status?: ManualPaymentStatus | 'ALL';
        search?: string;
        limit?: number;
    }): Promise<{
        status: import(".prisma/client").$Enums.ManualPaymentStatus;
        paymentMethod: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        studentName: string;
        phoneNumber: string;
        email: string;
        discordId: string | null;
        transactionId: string;
        amount: number;
        currency: string;
        proofUrl: string | null;
        notes: string | null;
        reviewedBy: string | null;
        reviewedAt: Date | null;
        rejectionReason: string | null;
        userId: string | null;
    }[]>;
    /**
     * Approves a manual payment proof and synchronizes the student subscription & Discord roles
     */
    approvePayment(paymentId: string, params: ApprovePaymentDto, discordClient?: Client | null): Promise<{
        payment: any;
        user: any;
    }>;
    /**
     * Rejects a manual payment proof with feedback note
     */
    rejectPayment(paymentId: string, params: RejectPaymentDto): Promise<any>;
    /**
     * Dispatches a rich welcome DM with interactive Student Portal button upon payment approval
     */
    sendWelcomeApprovalDM(discordClient: Client, discordId: string, studentName: string, amount: number, currency: string, txId: string, durationDays: number, tier: number, expiresAt: Date): Promise<void>;
}
export declare const manualPaymentService: ManualPaymentService;
