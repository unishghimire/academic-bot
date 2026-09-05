import { PrismaClient, ManualPaymentStatus, SubscriptionStatus } from '@prisma/client';
import { prisma as defaultPrisma, isDatabaseOnline } from '../db/client.js';
import { auditService, AuditService } from './audit.service.js';
import { roleSyncService, RoleSyncService } from './role-sync.service.js';
import { logger } from '../utils/logger.js';
import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { COLORS, EMBED_FOOTER } from '../config/constants.js';
import { env } from '../config/env.js';
import { localStore } from '../db/local-store.js';

export interface SubmitPaymentProofDto {
  studentName: string;
  phoneNumber: string;
  email: string;
  discordId?: string;
  transactionId: string;
  amount: number;
  currency?: string;
  paymentMethod: string;
  proofUrl?: string;
  notes?: string;
}

export interface ApprovePaymentDto {
  adminId: string;
  durationDays?: number; // default 30 days
  tier?: number;         // default Tier 1
  notes?: string;
}

export interface RejectPaymentDto {
  adminId: string;
  reason: string;
}

export class ManualPaymentService {
  constructor(
    private db: PrismaClient = defaultPrisma,
    private auditor: AuditService = auditService,
    private roleSync: RoleSyncService = roleSyncService
  ) {}

  private isOffline(): boolean {
    return this.db === defaultPrisma && !isDatabaseOnline();
  }

  /**
   * Submits a manual payment proof for review
   */
  async submitPaymentProof(
    data: SubmitPaymentProofDto,
    discordClient?: Client | null
  ) {
    // Validate inputs
    if (!data.studentName || !data.phoneNumber || !data.email || !data.transactionId) {
      throw new Error('Missing required payment proof fields: Name, Phone Number, Email, or Transaction ID');
    }

    if (typeof data.amount !== 'number' || data.amount <= 0) {
      throw new Error('Valid payment amount is required');
    }

    // Check for existing duplicate transaction reference
    let existing: any = null;
    if (this.isOffline()) {
      existing = localStore.findPaymentByTxId(data.transactionId.trim());
    } else {
      try {
        existing = await this.db.manualPayment.findUnique({
          where: { transactionId: data.transactionId.trim() },
        });
      } catch {
        existing = localStore.findPaymentByTxId(data.transactionId.trim());
      }
    }

    if (existing) {
      throw new Error(`Transaction ID "${data.transactionId}" has already been submitted (Status: ${existing.status}).`);
    }

    let payment: any;

    if (this.isOffline()) {
      payment = {
        id: `mp_${Date.now()}`,
        studentName: data.studentName.trim(),
        phoneNumber: data.phoneNumber.trim(),
        email: data.email.trim().toLowerCase(),
        discordId: data.discordId ? data.discordId.trim() : null,
        transactionId: data.transactionId.trim(),
        amount: data.amount,
        currency: data.currency || 'USD',
        paymentMethod: data.paymentMethod.trim(),
        proofUrl: data.proofUrl ? data.proofUrl.trim() : null,
        notes: data.notes ? data.notes.trim() : null,
        status: ManualPaymentStatus.PENDING,
        reviewedBy: null,
        reviewedAt: null,
        rejectionReason: null,
        userId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      localStore.saveManualPayment(payment);
    } else {
      // Attempt to link to an existing user record if matching email or discordId
      let matchingUser: any = null;
      try {
        matchingUser = await this.db.user.findFirst({
          where: {
            OR: [
              { email: data.email.trim().toLowerCase() },
              ...(data.discordId ? [{ discordId: data.discordId.trim() }] : []),
            ],
          },
        });
      } catch {
        // Ignore if DB unreachable
      }

      try {
        payment = await this.db.manualPayment.create({
          data: {
            studentName: data.studentName.trim(),
            phoneNumber: data.phoneNumber.trim(),
            email: data.email.trim().toLowerCase(),
            discordId: data.discordId ? data.discordId.trim() : null,
            transactionId: data.transactionId.trim(),
            amount: data.amount,
            currency: data.currency || 'USD',
            paymentMethod: data.paymentMethod.trim(),
            proofUrl: data.proofUrl ? data.proofUrl.trim() : null,
            notes: data.notes ? data.notes.trim() : null,
            status: ManualPaymentStatus.PENDING,
            userId: matchingUser ? matchingUser.id : null,
          },
        });
      } catch {
        payment = {
          id: `mp_${Date.now()}`,
          studentName: data.studentName.trim(),
          phoneNumber: data.phoneNumber.trim(),
          email: data.email.trim().toLowerCase(),
          discordId: data.discordId ? data.discordId.trim() : null,
          transactionId: data.transactionId.trim(),
          amount: data.amount,
          currency: data.currency || 'USD',
          paymentMethod: data.paymentMethod.trim(),
          proofUrl: data.proofUrl ? data.proofUrl.trim() : null,
          notes: data.notes ? data.notes.trim() : null,
          status: ManualPaymentStatus.PENDING,
          reviewedBy: null,
          reviewedAt: null,
          rejectionReason: null,
          userId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        localStore.saveManualPayment(payment);
      }
    }

    await this.auditor.log({
      actorType: 'USER',
      actorId: data.discordId || data.email,
      action: 'MANUAL_PAYMENT_SUBMITTED',
      targetType: 'MANUAL_PAYMENT',
      targetId: payment.id,
      reason: `Student ${data.studentName} submitted payment proof via ${data.paymentMethod}. TxID: ${data.transactionId}`,
      after: {
        studentName: data.studentName,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        transactionId: data.transactionId,
      },
    });

    logger.info(
      { paymentId: payment.id, studentName: data.studentName, txId: data.transactionId },
      'Manual payment proof submitted'
    );

    // Notify staff channel on Discord if available
    if (discordClient && env.CHANNEL_AUDIT_LOGS) {
      try {
        const channel = await discordClient.channels.fetch(env.CHANNEL_AUDIT_LOGS).catch(() => null);
        if (channel && channel.isTextBased()) {
          const embed = new EmbedBuilder()
            .setTitle('🧾 New Manual Payment Proof Submitted')
            .setColor(COLORS.GOLD)
            .addFields(
              { name: 'Student Name', value: `\`${data.studentName}\``, inline: true },
              { name: 'Phone Number', value: `\`${data.phoneNumber}\``, inline: true },
              { name: 'Amount Paid', value: `**$${data.amount.toFixed(2)} ${payment.currency}**`, inline: true },
              { name: 'Payment Method', value: `\`${data.paymentMethod}\``, inline: true },
              { name: 'Transaction ID', value: `\`${data.transactionId}\``, inline: true },
              { name: 'Email / Discord', value: `${data.email} ${data.discordId ? `(<@${data.discordId}>)` : ''}`, inline: true }
            )
            .setFooter(EMBED_FOOTER)
            .setTimestamp();

          if (data.proofUrl) {
            embed.addFields({ name: 'Proof URL / Screenshot', value: `[View Payment Proof](${data.proofUrl})` });
          }

          await (channel as TextChannel).send({ embeds: [embed] }).catch(() => {});
        }
      } catch (err) {
        logger.error({ err }, 'Failed to send payment alert to Discord staff channel');
      }
    }

    return payment;
  }

  /**
   * Lists manual payments with optional status and search filters
   */
  async listPayments(options?: {
    status?: ManualPaymentStatus | 'ALL';
    search?: string;
    limit?: number;
  }) {
    if (this.isOffline()) {
      let payments = localStore.getManualPayments(options?.status as string);
      if (options?.search && options.search.trim()) {
        const q = options.search.trim().toLowerCase();
        payments = payments.filter(
          p =>
            p.studentName.toLowerCase().includes(q) ||
            p.phoneNumber.toLowerCase().includes(q) ||
            p.transactionId.toLowerCase().includes(q) ||
            p.email.toLowerCase().includes(q) ||
            (p.discordId && p.discordId.toLowerCase().includes(q))
        );
      }
      return payments;
    }

    const where: any = {};

    if (options?.status && options.status !== 'ALL') {
      where.status = options.status;
    }

    if (options?.search && options.search.trim()) {
      const q = options.search.trim();
      where.OR = [
        { studentName: { contains: q, mode: 'insensitive' } },
        { phoneNumber: { contains: q, mode: 'insensitive' } },
        { transactionId: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { discordId: { contains: q, mode: 'insensitive' } },
      ];
    }

    try {
      const payments = await this.db.manualPayment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options?.limit || 100,
        include: {
          user: {
            select: {
              id: true,
              discordId: true,
              currentTier: true,
              subscriptionStatus: true,
            },
          },
        },
      });

      return payments;
    } catch {
      return localStore.getManualPayments(options?.status as string);
    }
  }

  /**
   * Approves a manual payment proof and synchronizes the student subscription & Discord roles
   */
  async approvePayment(
    paymentId: string,
    params: ApprovePaymentDto,
    discordClient?: Client | null
  ) {
    let payment: any = null;
    if (this.isOffline()) {
      payment = localStore.findPaymentById(paymentId);
    } else {
      try {
        payment = await this.db.manualPayment.findUnique({
          where: { id: paymentId },
          include: { user: true },
        });
      } catch {
        payment = localStore.findPaymentById(paymentId);
      }
    }

    if (!payment) {
      throw new Error(`Manual payment with ID "${paymentId}" not found`);
    }

    if (payment.status === ManualPaymentStatus.APPROVED) {
      throw new Error('This payment has already been approved');
    }

    const durationDays = params.durationDays || 30;
    const tier = params.tier || 1;
    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

    if (this.isOffline()) {
      const updatedPayment = localStore.updatePaymentStatus(paymentId, ManualPaymentStatus.APPROVED, params.adminId);
      const targetUser = {
        id: `usr_${Date.now()}`,
        email: payment.email,
        discordId: payment.discordId || null,
        currentTier: tier,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      };
      localStore.saveUser(targetUser);

      await this.auditor.log({
        actorType: 'ADMIN',
        actorId: params.adminId,
        action: 'MANUAL_PAYMENT_APPROVED',
        targetType: 'MANUAL_PAYMENT',
        targetId: paymentId,
        reason: params.notes || `Manual payment of $${payment.amount} approved for ${durationDays} days (Tier ${tier})`,
        before: { status: payment.status },
        after: {
          status: ManualPaymentStatus.APPROVED,
          userId: targetUser.id,
          durationDays,
          expiresAt,
        },
      }).catch(() => null);

      if (discordClient && targetUser.discordId) {
        await this.roleSync.syncUserRoles(targetUser.id, discordClient).catch(() => null);
      }

      return { payment: updatedPayment, user: targetUser };
    }

    // 1. Find or create the verified student User in database
    let targetUser = payment.user;

    try {
      if (!targetUser) {
        targetUser = await this.db.user.findFirst({
          where: {
            OR: [
              { email: payment.email },
              ...(payment.discordId ? [{ discordId: payment.discordId }] : []),
            ],
          },
        });
      }

      let updatedPayment: any;
      try {
        if (!targetUser) {
          targetUser = await this.db.user.create({
            data: {
              email: payment.email,
              discordId: payment.discordId || null,
              accountId: `manual_acc_${Date.now()}`,
              subscriptionStatus: SubscriptionStatus.ACTIVE,
              subscriptionExpiresAt: expiresAt,
              currentTier: tier,
            },
          });
        } else {
          targetUser = await this.db.user.update({
            where: { id: targetUser.id },
            data: {
              subscriptionStatus: SubscriptionStatus.ACTIVE,
              subscriptionExpiresAt: expiresAt,
              currentTier: Math.max(targetUser.currentTier, tier),
              discordId: payment.discordId || targetUser.discordId,
            },
          });
        }

        const providerRef = `manual_${payment.transactionId}`;
        await this.db.subscription.upsert({
          where: { providerRef },
          create: {
            userId: targetUser.id,
            plan: `manual_access_${durationDays}d`,
            status: SubscriptionStatus.ACTIVE,
            providerRef,
            startedAt: new Date(),
            expiresAt,
            renewedAt: new Date(),
          },
          update: {
            status: SubscriptionStatus.ACTIVE,
            expiresAt,
            renewedAt: new Date(),
          },
        });

        updatedPayment = await this.db.manualPayment.update({
          where: { id: paymentId },
          data: {
            status: ManualPaymentStatus.APPROVED,
            reviewedBy: params.adminId,
            reviewedAt: new Date(),
            userId: targetUser.id,
          },
        });
      } catch {
        updatedPayment = localStore.updatePaymentStatus(paymentId, ManualPaymentStatus.APPROVED, params.adminId);
        targetUser = targetUser || {
          id: `usr_${Date.now()}`,
          email: payment.email,
          discordId: payment.discordId || null,
          currentTier: tier,
          subscriptionStatus: SubscriptionStatus.ACTIVE,
        };
      }

      // 4. Record in Audit Log
      await this.auditor.log({
        actorType: 'ADMIN',
        actorId: params.adminId,
        action: 'MANUAL_PAYMENT_APPROVED',
        targetType: 'MANUAL_PAYMENT',
        targetId: paymentId,
        reason: params.notes || `Manual payment of $${payment.amount} approved for ${durationDays} days (Tier ${tier})`,
        before: { status: payment.status },
        after: {
          status: ManualPaymentStatus.APPROVED,
          userId: targetUser.id,
          durationDays,
          expiresAt,
        },
      }).catch(() => null);

      logger.info(
        { paymentId, userId: targetUser.id, admin: params.adminId },
        'Manual payment approved.'
      );

      // 5. Trigger immediate Discord role synchronization
      if (discordClient && targetUser.discordId) {
        await this.roleSync.syncUserRoles(targetUser.id, discordClient).catch(err => {
          logger.error({ err, userId: targetUser?.id }, 'Failed to trigger Discord role sync after manual approval');
        });

        // Send confirmation DM to student
        try {
          const discordUser = await discordClient.users.fetch(targetUser.discordId).catch(() => null);
          if (discordUser) {
            const embed = new EmbedBuilder()
              .setTitle('🎉 Payment Verified & Access Activated!')
              .setColor(COLORS.SUCCESS)
              .setDescription(
                `Hello **${payment.studentName}**, your payment proof of **$${payment.amount.toFixed(2)}** (Tx: \`${payment.transactionId}\`) has been **approved** by staff!\n\n` +
                `• **Membership:** Premium Active (${durationDays} days)\n` +
                `• **Tier Access:** Tier ${tier}\n` +
                `• **Expires:** <t:${Math.floor(expiresAt.getTime() / 1000)}:F>\n\n` +
                `Your Discord roles have been synchronized automatically. Use \`/subscription\` or \`/continue\` to begin learning!`
              )
              .setFooter(EMBED_FOOTER)
              .setTimestamp();

            await discordUser.send({ embeds: [embed] }).catch(() => {});
          }
        } catch {
          // Ignore DM failure
        }
      }

      return {
        payment: updatedPayment,
        user: targetUser,
      };
    } catch (err: any) {
      throw err;
    }
  }

  /**
   * Rejects a manual payment proof with feedback note
   */
  async rejectPayment(paymentId: string, params: RejectPaymentDto) {
    let payment: any = null;
    if (this.isOffline()) {
      payment = localStore.findPaymentById(paymentId);
    } else {
      try {
        payment = await this.db.manualPayment.findUnique({
          where: { id: paymentId },
        });
      } catch {
        payment = localStore.findPaymentById(paymentId);
      }
    }

    if (!payment) {
      throw new Error(`Manual payment with ID "${paymentId}" not found`);
    }

    if (payment.status === ManualPaymentStatus.APPROVED) {
      throw new Error('Cannot reject a payment that has already been approved');
    }

    let updated: any;
    if (this.isOffline()) {
      updated = localStore.updatePaymentStatus(paymentId, ManualPaymentStatus.REJECTED, params.adminId, params.reason);
      if (!updated) {
        updated = { id: paymentId, status: ManualPaymentStatus.REJECTED };
      }
    } else {
      try {
        updated = await this.db.manualPayment.update({
          where: { id: paymentId },
          data: {
            status: ManualPaymentStatus.REJECTED,
            reviewedBy: params.adminId,
            reviewedAt: new Date(),
            rejectionReason: params.reason,
          },
        });
      } catch {
        updated = localStore.updatePaymentStatus(paymentId, ManualPaymentStatus.REJECTED, params.adminId, params.reason);
        if (!updated) {
          updated = { id: paymentId, status: ManualPaymentStatus.REJECTED };
        }
      }
    }

    await this.auditor.log({
      actorType: 'ADMIN',
      actorId: params.adminId,
      action: 'MANUAL_PAYMENT_REJECTED',
      targetType: 'MANUAL_PAYMENT',
      targetId: paymentId,
      reason: params.reason,
      before: { status: payment.status },
      after: { status: ManualPaymentStatus.REJECTED, reason: params.reason },
    }).catch(() => null);

    logger.info({ paymentId, admin: params.adminId }, 'Manual payment proof rejected');
    return updated;
  }
}

export const manualPaymentService = new ManualPaymentService();
