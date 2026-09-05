import { Router, Request, Response } from 'express';
import { requireAcademyAuth } from '../middleware/auth.js';
import { linkingService } from '../../services/linking.service.js';
import { roleSyncService } from '../../services/role-sync.service.js';
import { errorLogger } from '../../services/error-logger.service.js';
import { createSuccessEmbed } from '../../utils/embed-builder.js';
import { Client } from 'discord.js';

export function createLinkRouter(discordClient?: Client | null): Router {
  const router = Router();

  router.post('/verify', requireAcademyAuth, async (req: Request, res: Response) => {
    const { code, accountId, email } = req.body;

    if (!code || !accountId || !email) {
      res.status(400).json({ error: 'Missing code, accountId, or email' });
      return;
    }

    try {
      const result = await linkingService.verifyAndLinkCode(code, accountId, email);

      // Trigger immediate role sync and send confirmation DM
      if (discordClient) {
        await roleSyncService.syncUserRoles(result.userId, discordClient).catch(() => {});

        try {
          const user = await discordClient.users.fetch(result.discordId);
          if (user) {
            const embed = createSuccessEmbed(
              'Academy Account Linked!',
              `Your Discord account has been successfully verified and connected to **${email}**.\n\n` +
              `Your Premium & Tier roles have been synchronized. Use \`/subscription\` to view your membership, or \`/continue\` to jump straight into your lessons!`
            );
            await user.send({ embeds: [embed] }).catch(() => {});
          }
        } catch {
          // Ignore DM closed errors
        }
      }

      res.status(200).json({
        success: true,
        userId: result.userId,
        discordId: result.discordId,
      });
    } catch (err: any) {
      await errorLogger.report(discordClient ?? null, {
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
