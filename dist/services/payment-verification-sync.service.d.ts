import { Client } from 'discord.js';
export interface SyncResult {
    totalFound: number;
    rolesAssigned: number;
    errors: number;
}
export declare class PaymentVerificationSyncService {
    /**
     * Sweeps the database for approved payment verifications and grants Discord roles to users
     */
    syncApprovedPayments(client: Client): Promise<SyncResult>;
    /**
     * Helper to resolve guild member by snowflake ID, username tag, or cached search
     */
    private resolveGuildMember;
    /**
     * Updates the verification record in Supabase / PostgreSQL
     */
    private markRecordVerified;
    /**
     * Sends a private DM to the student on Discord
     */
    private sendApprovalDM;
}
export declare const paymentVerificationSyncService: PaymentVerificationSyncService;
