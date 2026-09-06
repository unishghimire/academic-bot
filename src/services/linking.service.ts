import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma, isPostgresOnline } from '../db/client.js';
import { env } from '../config/env.js';
import { auditService } from './audit.service.js';
import { logger } from '../utils/logger.js';
import { localStore } from '../db/local-store.js';
import { getSupabaseClient } from '../db/supabase.js';

export interface GeneratedLinkCode {
  code: string;
  expiresAt: Date;
  linkingUrl: string;
}

export class LinkingService {
  constructor(private db: PrismaClient = defaultPrisma) {}

  private isOffline(): boolean {
    return this.db === defaultPrisma && !isPostgresOnline();
  }

  /**
   * Generates a short-lived (15 min) 6-character linking code initiated from /link in Discord
   */
  async createLinkingCodeForDiscordUser(discordId: string): Promise<GeneratedLinkCode> {
    const code = crypto.randomBytes(3).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes validity
    const portalBase = env.STUDENT_PORTAL_URL || env.ACADEMY_WEBSITE_URL || 'https://academic-student-portal.vercel.app';
    const linkingUrl = `${portalBase}/link-account?code=${code}`;

    // Cloud / Supabase / Local storage mode (bypasses PostgreSQL localhost)
    if (this.isOffline()) {
      let user = localStore.findUserByDiscordId(discordId);
      if (!user) {
        user = localStore.saveUser({
          id: `usr_${discordId}`,
          discordId,
          accountId: `discord_pending_${discordId}`,
          email: `pending_${discordId}@discord.academy.local`,
          currentTier: 1,
          subscriptionStatus: 'INACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      localStore.saveLinkingCode({
        id: `code_${Date.now()}`,
        userId: user.id,
        discordId,
        code,
        expiresAt,
        usedAt: null,
      });

      logger.info({ discordId, userId: user.id, code }, 'Generated account linking code (cloud/local storage)');

      return {
        code,
        expiresAt,
        linkingUrl,
      };
    }

    // Direct PostgreSQL path (only if remote PostgreSQL is online)
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

    logger.info({ discordId, userId: user.id, code }, 'Generated account linking code (PostgreSQL)');

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
  async verifyAndLinkCode(code: string, verifiedAccountId: string, verifiedEmail: string): Promise<{ success: boolean; userId: string; discordId: string }> {
    // Cloud / Supabase / Local storage mode (bypasses PostgreSQL localhost)
    if (this.isOffline()) {
      const linkingCode = localStore.findLinkingCode(code);
      if (!linkingCode) {
        throw new Error('Invalid linking code');
      }

      if (linkingCode.usedAt) {
        throw new Error('This linking code has already been used');
      }

      if (new Date(linkingCode.expiresAt) < new Date()) {
        throw new Error('This linking code has expired. Please run /link again in Discord');
      }

      const discordId = linkingCode.discordId;
      let user = localStore.findUserByDiscordId(discordId) || localStore.findUserById(linkingCode.userId);
      if (!user) {
        user = {
          id: linkingCode.userId || `usr_${discordId}`,
          discordId,
        };
      }

      user.accountId = verifiedAccountId;
      user.email = verifiedEmail;
      user.updatedAt = new Date();
      localStore.saveUser(user);

      localStore.markLinkingCodeUsed(code);

      // Also update Supabase payment_verifications if matching email exists
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          await supabase
            .from('payment_verifications')
            .update({ discord_id: discordId, is_discord_verified: true })
            .ilike('email', verifiedEmail);
        } catch (err) {
          logger.warn({ err }, 'Could not update Supabase on link verification');
        }
      }

      await auditService.log({
        actorType: 'USER',
        actorId: discordId,
        action: 'ACCOUNT_LINKED',
        targetType: 'USER',
        targetId: user.id,
        reason: `Successfully bound Discord ID ${discordId} to verified Academy account ${verifiedAccountId} (${verifiedEmail})`,
        after: { discordId, accountId: verifiedAccountId, email: verifiedEmail },
      });

      logger.info(
        { userId: user.id, discordId, accountId: verifiedAccountId },
        'Student account linked successfully (cloud mode)'
      );

      return {
        success: true,
        userId: user.id,
        discordId,
      };
    }

    // Direct PostgreSQL path
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
    } else {
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

    await auditService.log({
      actorType: 'USER',
      actorId: discordUser.discordId,
      action: 'ACCOUNT_LINKED',
      targetType: 'USER',
      targetId: targetUserId,
      reason: `Successfully bound Discord ID ${discordUser.discordId} to verified Academy account ${verifiedAccountId} (${verifiedEmail})`,
      after: { discordId: discordUser.discordId, accountId: verifiedAccountId, email: verifiedEmail },
    });

    logger.info(
      { userId: targetUserId, discordId: discordUser.discordId, accountId: verifiedAccountId },
      'Student account linked successfully'
    );

    return {
      success: true,
      userId: targetUserId,
      discordId: discordUser.discordId,
    };
  }
}

export const linkingService = new LinkingService();
