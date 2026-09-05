import { Router, Request, Response } from 'express';
import { requireAcademyAuth } from '../middleware/auth.js';
import { progressService } from '../../services/progress.service.js';
import { roleSyncService } from '../../services/role-sync.service.js';
import { errorLogger } from '../../services/error-logger.service.js';
import { Client, TextChannel } from 'discord.js';
import { env } from '../../config/env.js';
import { createSuccessEmbed, createTierEmbed } from '../../utils/embed-builder.js';

export function createProgressRouter(discordClient?: Client | null): Router {
  const router = Router();

  // Website video player reports watch percentage
  router.post('/watch', requireAcademyAuth, async (req: Request, res: Response) => {
    const { userId, lessonId, watchPercent } = req.body;

    if (!userId || !lessonId || typeof watchPercent !== 'number') {
      res.status(400).json({ error: 'Missing or invalid userId, lessonId, or watchPercent' });
      return;
    }

    try {
      const result = await progressService.updateWatchProgress(userId, lessonId, watchPercent);

      // If completing this lesson unlocked a new tier, announce and sync roles
      if (result.tierUnlocked && discordClient) {
        await roleSyncService.syncUserRoles(userId, discordClient).catch(() => {});

        if (env.CHANNEL_ANNOUNCEMENTS) {
          const channel = await discordClient.channels.fetch(env.CHANNEL_ANNOUNCEMENTS).catch(() => null);
          if (channel && channel.isTextBased()) {
            const embed = createTierEmbed(
              result.tierUnlocked,
              `🎉 Congratulations to student <@${result.userId}> for unlocking **Tier ${result.tierUnlocked}**!`
            );
            await (channel as TextChannel).send({ embeds: [embed] }).catch(() => {});
          }
        }
      }

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      await errorLogger.report(discordClient ?? null, {
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
