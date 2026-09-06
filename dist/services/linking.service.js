"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.linkingService = exports.LinkingService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const client_js_1 = require("../db/client.js");
const env_js_1 = require("../config/env.js");
const audit_service_js_1 = require("./audit.service.js");
const logger_js_1 = require("../utils/logger.js");
class LinkingService {
    db;
    constructor(db = client_js_1.prisma) {
        this.db = db;
    }
    /**
     * Generates a short-lived (15 min) 6-character linking code initiated from /link in Discord
     */
    async createLinkingCodeForDiscordUser(discordId) {
        // Check if user already exists or create temporary placeholder
        let user = await this.db.user.findUnique({
            where: { discordId },
        });
        if (!user) {
            user = await this.db.user.create({
                data: {
                    discordId,
                    accountId: `discord_pending_${discordId}`,
                    email: `pending_${discordId}@discord.academy.local`,
                    currentTier: 1,
                },
            });
        }
        // Generate random 6-character alphanumeric code
        const code = crypto_1.default.randomBytes(3).toString('hex').toUpperCase();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes validity
        // Invalidate prior unused codes for this user
        await this.db.linkingCode.deleteMany({
            where: {
                userId: user.id,
                usedAt: null,
            },
        });
        await this.db.linkingCode.create({
            data: {
                userId: user.id,
                code,
                expiresAt,
            },
        });
        const linkingUrl = `${env_js_1.env.ACADEMY_WEBSITE_URL}/link-account?code=${code}`;
        logger_js_1.logger.info({ discordId, userId: user.id, code }, 'Generated account linking code');
        return {
            code,
            expiresAt,
            linkingUrl,
        };
    }
    /**
     * Called by the website backend when an authenticated student enters the linking code.
     * Binds verified accountId and email to the Discord user.
     */
    async verifyAndLinkCode(code, verifiedAccountId, verifiedEmail) {
        const linkingCode = await this.db.linkingCode.findUnique({
            where: { code },
            include: { user: true },
        });
        if (!linkingCode) {
            throw new Error('Invalid linking code');
        }
        if (linkingCode.usedAt) {
            throw new Error('This linking code has already been used');
        }
        if (linkingCode.expiresAt < new Date()) {
            throw new Error('This linking code has expired. Please run /link again in Discord');
        }
        const discordUser = linkingCode.user;
        if (!discordUser.discordId) {
            throw new Error('Corrupt linking session: missing Discord ID');
        }
        // Check if there is already a paid user record with this verified accountId or email
        const paidUser = await this.db.user.findFirst({
            where: {
                OR: [
                    { accountId: verifiedAccountId },
                    { email: verifiedEmail },
                ],
            },
        });
        let targetUserId = discordUser.id;
        if (paidUser && paidUser.id !== discordUser.id) {
            // Merge: update the paid user with the discordId and remove placeholder
            await this.db.user.update({
                where: { id: paidUser.id },
                data: { discordId: discordUser.discordId },
            });
            // Cleanup placeholder user
            await this.db.user.delete({
                where: { id: discordUser.id },
            });
            targetUserId = paidUser.id;
        }
        else {
            // Upgrade discord placeholder with verified credentials
            await this.db.user.update({
                where: { id: discordUser.id },
                data: {
                    accountId: verifiedAccountId,
                    email: verifiedEmail,
                },
            });
        }
        // Mark code as used
        await this.db.linkingCode.update({
            where: { id: linkingCode.id },
            data: { usedAt: new Date() },
        });
        await audit_service_js_1.auditService.log({
            actorType: 'USER',
            actorId: discordUser.discordId,
            action: 'ACCOUNT_LINKED',
            targetType: 'USER',
            targetId: targetUserId,
            reason: `Successfully bound Discord ID ${discordUser.discordId} to verified Academy account ${verifiedAccountId} (${verifiedEmail})`,
            after: { discordId: discordUser.discordId, accountId: verifiedAccountId, email: verifiedEmail },
        });
        logger_js_1.logger.info({ userId: targetUserId, discordId: discordUser.discordId, accountId: verifiedAccountId }, 'Student account linked successfully');
        return {
            success: true,
            userId: targetUserId,
            discordId: discordUser.discordId,
        };
    }
}
exports.LinkingService = LinkingService;
exports.linkingService = new LinkingService();
//# sourceMappingURL=linking.service.js.map