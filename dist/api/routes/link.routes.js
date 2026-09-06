"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLinkRouter = createLinkRouter;
const express_1 = require("express");
const auth_js_1 = require("../middleware/auth.js");
const linking_service_js_1 = require("../../services/linking.service.js");
const role_sync_service_js_1 = require("../../services/role-sync.service.js");
const error_logger_service_js_1 = require("../../services/error-logger.service.js");
const embed_builder_js_1 = require("../../utils/embed-builder.js");
function createLinkRouter(discordClient) {
    const router = (0, express_1.Router)();
    router.post('/verify', auth_js_1.requireAcademyAuth, async (req, res) => {
        const { code, accountId, email } = req.body;
        if (!code || !accountId || !email) {
            res.status(400).json({ error: 'Missing code, accountId, or email' });
            return;
        }
        try {
            const result = await linking_service_js_1.linkingService.verifyAndLinkCode(code, accountId, email);
            // Trigger immediate role sync and send confirmation DM
            if (discordClient) {
                await role_sync_service_js_1.roleSyncService.syncUserRoles(result.userId, discordClient).catch(() => { });
                try {
                    const user = await discordClient.users.fetch(result.discordId);
                    if (user) {
                        const embed = (0, embed_builder_js_1.createSuccessEmbed)('Academy Account Linked!', `Your Discord account has been successfully verified and connected to **${email}**.\n\n` +
                            `Your Premium & Tier roles have been synchronized. Use \`/subscription\` to view your membership, or \`/continue\` to jump straight into your lessons!`);
                        await user.send({ embeds: [embed] }).catch(() => { });
                    }
                }
                catch {
                    // Ignore DM closed errors
                }
            }
            res.status(200).json({
                success: true,
                userId: result.userId,
                discordId: result.discordId,
            });
        }
        catch (err) {
            await error_logger_service_js_1.errorLogger.report(discordClient ?? null, {
                module: 'LINKING_API',
                action: 'VERIFY_LINK_CODE',
                error: err,
                metadata: { code, accountId, email },
            });
            res.status(400).json({ error: err.message || 'Failed to verify linking code' });
        }
    });
    return router;
}
//# sourceMappingURL=link.routes.js.map