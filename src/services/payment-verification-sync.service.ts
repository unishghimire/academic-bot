import { Client, Guild, GuildMember, TextChannel, EmbedBuilder } from 'discord.js';
import { getSupabaseClient } from '../db/supabase.js';
import { prisma, isDatabaseOnline } from '../db/client.js';
import { env } from '../config/env.js';
import { COLORS, EMBED_FOOTER, TIER_LEVELS } from '../config/constants.js';
import { logger } from '../utils/logger.js';
import { auditService } from './audit.service.js';

export interface SyncResult {
  totalFound: number;
  rolesAssigned: number;
  errors: number;
}

export class PaymentVerificationSyncService {
  /**
   * Sweeps the database for approved payment verifications and grants Discord roles to users
   */
  async syncApprovedPayments(client: Client): Promise<SyncResult> {
    const result: SyncResult = { totalFound: 0, rolesAssigned: 0, errors: 0 };

    if (!client.isReady()) {
      return result;
    }

    const guild = client.guilds.cache.get(env.DISCORD_GUILD_ID);
    if (!guild) {
      logger.warn({ guildId: env.DISCORD_GUILD_ID }, 'Guild not found for payment verification sync');
      return result;
    }

    const supabase = getSupabaseClient();
    let pendingApprovals: any[] = [];

    // 1. Fetch unverified approved rows from Supabase
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('payment_verifications')
          .select('*')
          .in('status', ['verified', 'approved'])
          .or('is_discord_verified.is.null,is_discord_verified.eq.false');

        if (!error && data) {
          pendingApprovals = data;
        } else if (error) {
          logger.warn({ err: error }, 'Supabase query for approved payments encountered an issue');
        }
      } catch (err) {
        logger.warn({ err }, 'Failed to query Supabase payment_verifications');
      }
    }

    // 2. Fallback to Prisma raw query if PostgreSQL is online and Supabase returned empty
    if (pendingApprovals.length === 0 && isDatabaseOnline()) {
      try {
        const rows = await prisma.$queryRaw<any[]>`
          SELECT * FROM public.payment_verifications 
          WHERE LOWER(status) IN ('verified', 'approved') 
            AND (is_discord_verified IS FALSE OR is_discord_verified IS NULL)
          ORDER BY created_at ASC
          LIMIT 20
        `;
        if (rows && rows.length > 0) {
          pendingApprovals = rows;
        }
      } catch {
        // Table might not be created or offline
      }
    }

    if (pendingApprovals.length === 0) {
      return result;
    }

    result.totalFound = pendingApprovals.length;
    logger.info({ count: pendingApprovals.length }, 'Found approved payment verifications requiring Discord role grant');

    for (const record of pendingApprovals) {
      try {
        const member = await this.resolveGuildMember(guild, record.discord_id, record.discord_username, record.email);

        if (!member) {
          logger.warn(
            { recordId: record.id, student: record.student_name, discordId: record.discord_id },
            'Student member not found in Discord server yet. Will retry on next sweep.'
          );
          continue;
        }

        // Determine roles to assign
        const tier = record.tier_number || 1;
        const rolesToAdd: string[] = [];

        if (env.ROLE_PREMIUM && !member.roles.cache.has(env.ROLE_PREMIUM)) {
          rolesToAdd.push(env.ROLE_PREMIUM);
        }

        if (tier >= 1 && env.ROLE_TIER_1 && !member.roles.cache.has(env.ROLE_TIER_1)) {
          rolesToAdd.push(env.ROLE_TIER_1);
        }
        if (tier >= 2 && env.ROLE_TIER_2 && !member.roles.cache.has(env.ROLE_TIER_2)) {
          rolesToAdd.push(env.ROLE_TIER_2);
        }
        if (tier >= 3 && env.ROLE_TIER_3 && !member.roles.cache.has(env.ROLE_TIER_3)) {
          rolesToAdd.push(env.ROLE_TIER_3);
        }

        if (rolesToAdd.length > 0) {
          await member.roles.add(rolesToAdd);
          logger.info(
            { memberId: member.id, roles: rolesToAdd, tier },
            'Assigned Discord subscriber roles after admin database approval'
          );
        }

        // Mark record as verified in database
        await this.markRecordVerified(record.id, member.id);

        // Send congratulatory Discord DM to student
        await this.sendApprovalDM(member, record, tier);

        // Record in audit log
        await auditService.log({
          actorType: 'SYSTEM',
          actorId: 'PAYMENT_VERIFICATION_SYNC',
          action: 'ADMIN_PANEL_PAYMENT_VERIFIED',
          targetType: 'USER',
          targetId: member.id,
          reason: `Admin approved payment proof on website ($${record.amount} ${record.currency || 'NPR'}). Discord roles assigned.`,
          after: {
            paymentVerificationId: record.id,
            rolesGranted: rolesToAdd,
            tier,
          },
        }).catch(() => null);

        result.rolesAssigned++;
      } catch (err) {
        logger.error({ err, recordId: record.id }, 'Error processing approved payment record');
        result.errors++;
      }
    }

    return result;
  }

  /**
   * Helper to resolve guild member by snowflake ID, username tag, or cached search
   */
  private async resolveGuildMember(
    guild: Guild,
    discordId?: string | null,
    discordUsername?: string | null,
    email?: string | null
  ): Promise<GuildMember | null> {
    // 1. Direct Snowflake ID lookup (17-20 digits)
    if (discordId && /^\d{17,20}$/.test(discordId.trim())) {
      try {
        const member = await guild.members.fetch(discordId.trim());
        if (member) return member;
      } catch {
        // Not found by ID
      }
    }

    // 2. Search by Discord Username
    const queryName = (discordId || discordUsername || '').trim().toLowerCase().replace(/^@/, '');
    if (queryName) {
      const cacheMembers = typeof (guild.members.cache as any).find === 'function'
        ? (guild.members.cache as any)
        : Array.from((guild.members.cache as any).values?.() || []);

      const cached = cacheMembers.find(
        (m: any) =>
          m?.user?.username?.toLowerCase() === queryName ||
          m?.user?.tag?.toLowerCase() === queryName ||
          m?.displayName?.toLowerCase() === queryName
      );
      if (cached) return cached;

      try {
        const fetched = await guild.members.search({ query: queryName, limit: 5 });
        const fetchedMembers = Array.isArray(fetched) ? fetched : Array.from(fetched.values?.() || []);
        const match = fetchedMembers.find(
          (m: any) =>
            m?.user?.username?.toLowerCase() === queryName ||
            m?.user?.tag?.toLowerCase() === queryName
        );
        if (match) return match;
      } catch {
        // Ignore search errors
      }
    }

    return null;
  }

  /**
   * Updates the verification record in Supabase / PostgreSQL
   */
  private async markRecordVerified(recordId: any, verifiedDiscordId: string): Promise<void> {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase
          .from('payment_verifications')
          .update({
            is_discord_verified: true,
            discord_id: verifiedDiscordId,
          })
          .eq('id', recordId);
        return;
      } catch (err) {
        logger.warn({ err }, 'Failed to mark record verified via Supabase');
      }
    }

    if (isDatabaseOnline()) {
      try {
        await prisma.$executeRaw`
          UPDATE public.payment_verifications 
          SET is_discord_verified = true, discord_id = ${verifiedDiscordId}
          WHERE id = ${recordId}
        `;
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Sends a private DM to the student on Discord
   */
  private async sendApprovalDM(member: GuildMember, record: any, tier: number): Promise<void> {
    try {
      const durationDays = record.access_duration_days || 30;
      const embed = new EmbedBuilder()
        .setTitle('🎉 Payment Verified & Access Activated!')
        .setColor(COLORS.SUCCESS)
        .setDescription(
          `Hello **${record.student_name}**, your payment proof of **${record.amount} ${record.currency || 'NPR'}** has been **approved** by our administration!\n\n` +
          `• **Granted Access:** **Tier ${tier}** + Academy Member\n` +
          `• **Duration:** **${durationDays} Days**\n` +
          `• **Transaction Reference:** \`${record.transaction_id}\`\n\n` +
          `Your Discord roles have been assigned automatically. You now have access to your private channels and live classes!\n\n` +
          `👉 Check upcoming live sessions with: \`/meeting list\`\n` +
          `👉 View your subscription status with: \`/subscription\``
        )
        .setFooter(EMBED_FOOTER)
        .setTimestamp();

      await member.send({ embeds: [embed] }).catch(() => {
        logger.info({ memberId: member.id }, 'Could not deliver DM (user has DMs closed)');
      });
    } catch {
      // Ignore DM failures
    }
  }
}

export const paymentVerificationSyncService = new PaymentVerificationSyncService();
