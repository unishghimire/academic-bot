"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProgressRouter = createProgressRouter;
const express_1 = require("express");
const auth_js_1 = require("../middleware/auth.js");
const progress_service_js_1 = require("../../services/progress.service.js");
const role_sync_service_js_1 = require("../../services/role-sync.service.js");
const error_logger_service_js_1 = require("../../services/error-logger.service.js");
const env_js_1 = require("../../config/env.js");
const embed_builder_js_1 = require("../../utils/embed-builder.js");
const client_js_1 = require("../../db/client.js");
function createProgressRouter(discordClient) {
    const router = (0, express_1.Router)();
    // Website video player reports watch percentage
    router.post('/watch', auth_js_1.requireAcademyAuth, async (req, res) => {
        const { userId, discordId, lessonId, watchPercent } = req.body;
        let targetUserId = userId;
        if (!targetUserId && discordId) {
            const user = await client_js_1.prisma.user.findUnique({ where: { discordId } });
            if (user)
                targetUserId = user.id;
        }
        if (!targetUserId || !lessonId || typeof watchPercent !== 'number') {
            res.status(400).json({ error: 'Missing or invalid userId (or discordId), lessonId, or watchPercent' });
            return;
        }
        try {
            const result = await progress_service_js_1.progressService.updateWatchProgress(targetUserId, lessonId, watchPercent);
            // If completing this lesson unlocked a new tier, announce and sync roles
            if (result.tierUnlocked && discordClient) {
                await role_sync_service_js_1.roleSyncService.syncUserRoles(userId, discordClient).catch(() => { });
                if (env_js_1.env.CHANNEL_ANNOUNCEMENTS) {
                    const channel = await discordClient.channels.fetch(env_js_1.env.CHANNEL_ANNOUNCEMENTS).catch(() => null);
                    if (channel && channel.isTextBased()) {
                        const embed = (0, embed_builder_js_1.createTierEmbed)(result.tierUnlocked, `🎉 Congratulations to student <@${result.userId}> for unlocking **Tier ${result.tierUnlocked}**!`);
                        await channel.send({ embeds: [embed] }).catch(() => { });
                    }
                }
            }
            res.status(200).json({
                success: true,
                data: result,
            });
        }
        catch (err) {
            await error_logger_service_js_1.errorLogger.report(discordClient ?? null, {
                module: 'PROGRESS_API',
                action: 'UPDATE_WATCH_PROGRESS',
                userId,
                error: err,
                metadata: { lessonId, watchPercent },
            });
            res.status(500).json({ error: err.message || 'Internal server error' });
        }
    });
    return router;
}
//# sourceMappingURL=progress.routes.js.map