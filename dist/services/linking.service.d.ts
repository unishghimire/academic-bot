import { PrismaClient } from '@prisma/client';
export interface GeneratedLinkCode {
    code: string;
    expiresAt: Date;
    linkingUrl: string;
}
export declare class LinkingService {
    private db;
    constructor(db?: PrismaClient);
    /**
     * Generates a short-lived (15 min) 6-character linking code initiated from /link in Discord
     */
    createLinkingCodeForDiscordUser(discordId: string): Promise<GeneratedLinkCode>;
    /**
     * Called by the website backend when an authenticated student enters the linking code.
     * Binds verified accountId and email to the Discord user.
     */
    verifyAndLinkCode(code: string, verifiedAccountId: string, verifiedEmail: string): Promise<{
        success: boolean;
        userId: string;
        discordId: string;
    }>;
}
export declare const linkingService: LinkingService;
