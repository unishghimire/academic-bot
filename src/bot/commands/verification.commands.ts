import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import { ManualPaymentStatus } from '@prisma/client';
import { manualPaymentService } from '../../services/manual-payment.service.js';
import { paymentMethodService } from '../../services/payment-method.service.js';
import { requireInstructor } from '../middleware/permissions.js';
import { createSuccessEmbed, createInfoEmbed, createWarningEmbed, createErrorEmbed } from '../../utils/embed-builder.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export const verifyProofCommand = {
  data: new SlashCommandBuilder()
    .setName('verify-proof')
    .setDescription('Review, approve, or reject student payment proofs (Staff only)')
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('List all pending submitted payment proofs awaiting verification')
    )
    .addSubcommand(sub =>
      sub
        .setName('approve')
        .setDescription('Approve a payment proof and activate student subscriber role')
        .addStringOption(opt =>
          opt.setName('payment_id').setDescription('Payment proof ID (e.g. mp_... or UUID)').setRequired(true)
        )
        .addIntegerOption(opt =>
          opt
            .setName('tier')
            .setDescription('Tier level to grant (default: 1)')
            .setRequired(false)
            .addChoices(
              { name: 'Tier 1: Fundamentals', value: 1 },
              { name: 'Tier 2: Advanced', value: 2 },
              { name: 'Tier 3: Mastery', value: 3 }
            )
        )
        .addIntegerOption(opt =>
          opt
            .setName('days')
            .setDescription('Subscription duration in days (default: 30)')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('notes').setDescription('Optional administrative approval note').setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('reject')
        .setDescription('Reject a payment proof and notify the student with a reason')
        .addStringOption(opt =>
          opt.setName('payment_id').setDescription('Payment proof ID to reject').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('reason').setDescription('Mandatory reason for rejection (sent to student)').setRequired(true)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const isAllowed = await requireInstructor(interaction);
    if (!isAllowed) return;

    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      await interaction.deferReply({ ephemeral: true });

      try {
        const payments = await manualPaymentService.listPayments({
          status: ManualPaymentStatus.PENDING,
        });

        if (!payments || payments.length === 0) {
          await interaction.editReply({
            embeds: [
              createInfoEmbed(
                '🧾 Pending Payment Proofs',
                'No pending payment proofs found! All submitted proofs have been reviewed.'
              ),
            ],
          });
          return;
        }

        const items = payments
          .map((p, idx) => {
            const discordMention = p.discordId ? `<@${p.discordId}>` : '*Not provided*';
            const proofLink = p.proofUrl ? `[View Proof Screenshot](${p.proofUrl})` : '*No proof URL*';
            return (
              `**${idx + 1}. \`${p.id}\`** • **$${p.amount.toFixed(2)} ${p.currency}** via **${p.paymentMethod}**\n` +
              `• **Student:** ${p.studentName} (${p.email})\n` +
              `• **Discord:** ${discordMention}\n` +
              `• **TxID:** \`${p.transactionId}\`\n` +
              `• **Proof:** ${proofLink}\n`
            );
          })
          .join('\n');

        const embed = createInfoEmbed(
          `🧾 Pending Payment Proofs (${payments.length} Total)`,
          items +
            `\n👉 **To approve:** \`/verify-proof approve payment_id:<id>\`\n` +
            `👉 **To reject:** \`/verify-proof reject payment_id:<id> reason:<why>\``
        );

        await interaction.editReply({ embeds: [embed] });
      } catch (err: any) {
        logger.error({ err }, 'Failed to list pending payments');
        await interaction.editReply({
          embeds: [createErrorEmbed('Error', err.message || 'Failed to list payment proofs.')],
        });
      }
    } else if (sub === 'approve') {
      await interaction.deferReply({ ephemeral: true });

      const paymentId = interaction.options.getString('payment_id', true);
      const tier = interaction.options.getInteger('tier') || 1;
      const durationDays = interaction.options.getInteger('days') || 30;
      const notes = interaction.options.getString('notes') || undefined;

      try {
        const result = await manualPaymentService.approvePayment(
          paymentId,
          {
            adminId: interaction.user.id,
            tier,
            durationDays,
            notes,
          },
          interaction.client
        );

        const student = result.user;
        const discordTag = student.discordId ? `<@${student.discordId}>` : student.email;
        const expiryDate = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

        await interaction.editReply({
          embeds: [
            createSuccessEmbed(
              'Payment Approved & Role Granted! 🎉',
              `Payment \`${paymentId}\` has been approved successfully.\n\n` +
              `• **Student:** ${discordTag}\n` +
              `• **Granted Tier:** **Tier ${tier}**\n` +
              `• **Duration:** **${durationDays} days** (Expires: ${expiryDate.toDateString()})\n` +
              `• **Discord Roles:** Subscriber role synced & activated\n` +
              `• **Notification:** Confirmation DM sent to student.`
            ),
          ],
        });
      } catch (err: any) {
        logger.error({ err, paymentId }, 'Failed to approve payment proof');
        await interaction.editReply({
          embeds: [createErrorEmbed('Approval Failed', err.message || 'Could not approve payment.')],
        });
      }
    } else if (sub === 'reject') {
      await interaction.deferReply({ ephemeral: true });

      const paymentId = interaction.options.getString('payment_id', true);
      const reason = interaction.options.getString('reason', true);

      try {
        await manualPaymentService.rejectPayment(
          paymentId,
          {
            adminId: interaction.user.id,
            reason,
          }
        );

        await interaction.editReply({
          embeds: [
            createWarningEmbed(
              'Payment Proof Rejected',
              `Payment \`${paymentId}\` has been marked as **REJECTED**.\n\n` +
              `• **Reason:** ${reason}\n` +
              `• **Notification:** Student received a private DM with this reason and re-submission guidance.`
            ),
          ],
        });
      } catch (err: any) {
        logger.error({ err, paymentId }, 'Failed to reject payment proof');
        await interaction.editReply({
          embeds: [createErrorEmbed('Rejection Failed', err.message || 'Could not reject payment.')],
        });
      }
    }
  },
};

export const paymentMethodsCommand = {
  data: new SlashCommandBuilder()
    .setName('payment-methods')
    .setDescription('View official payment methods and instructions to subscribe'),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const methods = await paymentMethodService.listActiveMethods();

      if (!methods || methods.length === 0) {
        await interaction.editReply({
          embeds: [
            createInfoEmbed(
              '💳 Official Payment Methods',
              'Payment methods are currently being configured by administration.\n\nPlease contact staff in `#support` for direct assistance.'
            ),
          ],
        });
        return;
      }

      const methodBlocks = methods.map((m, idx) => {
        let block = `**${idx + 1}. ${m.title}**\n`;
        if (m.accountName) block += `• **Account Name:** \`${m.accountName}\`\n`;
        block += `• **Account / Number:** \`${m.accountNumber}\`\n`;
        if (m.instructions) block += `• **Note:** ${m.instructions}\n`;
        if (m.qrCodeUrl) block += `• **QR Code:** [Click to View QR](${m.qrCodeUrl})\n`;
        return block;
      });

      const portalUrl = `http://localhost:${env.PORT}/submit-proof.html`;

      const embed = createInfoEmbed(
        '💳 Academy Payment Methods & Subscription Instructions',
        `To gain instant access to subscriber roles and private channels, make your payment through any of the verified channels below:\n\n` +
        methodBlocks.join('\n') +
        `\n📌 **After Payment:**\n` +
        `1. Upload your screenshot/receipt at: **[Student Payment Portal](${portalUrl})**\n` +
        `2. Or run \`/link\` with your student email.\n` +
        `3. Our staff will verify your proof and your role will be assigned automatically!`
      );

      await interaction.editReply({ embeds: [embed] });
    } catch (err: any) {
      logger.error({ err }, 'Failed to fetch payment methods');
      await interaction.editReply({
        embeds: [createErrorEmbed('Error', 'Unable to retrieve payment methods at this time.')],
      });
    }
  },
};
