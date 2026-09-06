import { PrismaClient, PaymentMethod } from '@prisma/client';
import { AuditService } from './audit.service.js';
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
export declare class PaymentMethodService {
    private db;
    private auditor;
    constructor(db?: PrismaClient, auditor?: AuditService);
    private isOffline;
    /**
     * List all active payment methods for student checkout / proof submission
     */
    listActiveMethods(): Promise<PaymentMethod[]>;
    /**
     * List all payment methods for admin management
     */
    listAllMethods(): Promise<PaymentMethod[]>;
    /**
     * Get single payment method by ID
     */
    getMethodById(id: string): Promise<PaymentMethod | null>;
    /**
     * Create a new payment method with QR code
     */
    createMethod(input: CreatePaymentMethodInput): Promise<PaymentMethod>;
    /**
     * Update an existing payment method
     */
    updateMethod(id: string, input: UpdatePaymentMethodInput): Promise<PaymentMethod>;
    /**
     * Toggle active status of a payment method
     */
    toggleStatus(id: string, adminId?: string): Promise<PaymentMethod>;
    /**
     * Delete a payment method
     */
    deleteMethod(id: string, adminId?: string): Promise<PaymentMethod>;
}
export declare const paymentMethodService: PaymentMethodService;
