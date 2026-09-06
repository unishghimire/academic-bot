import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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

      const portalUrl = env.STUDENT_PORTAL_URL || 'https://academic-student-portal.vercel.app';

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel('💳 Open Student Payment Portal')
          .setStyle(ButtonStyle.Link)
          .setURL(portalUrl)
      );

      const embed = createInfoEmbed(
        '💳 Academy Payment Methods & Subscription Instructions',
        `To gain instant access to subscriber roles and private channels, make your payment through any of the verified channels below:\n\n` +
        methodBlocks.join('\n') +
        `\n📌 **After Payment:**\n` +
        `1. Upload your screenshot/receipt at: **[Student Payment Portal](${portalUrl})**\n` +
        `2. Our staff will verify your proof in the admin panel.\n` +
        `3. Your Discord roles (@Tier-1, @Premium) and private channel access are assigned automatically!\n\n` +
        `👉 Click the button below to open the payment portal directly:`
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (err: any) {
      logger.error({ err }, 'Failed to fetch payment methods');
      await interaction.editReply({
        embeds: [createErrorEmbed('Error', 'Unable to retrieve payment methods at this time.')],
      });
    }
  },
};

export const portalCommand = {
  data: new SlashCommandBuilder()
    .setName('portal')
    .setDescription('Direct link to open the Academy Student Payment & Verification Portal'),

  async execute(interaction: ChatInputCommandInteraction) {
    const portalUrl = env.STUDENT_PORTAL_URL || 'https://academic-student-portal.vercel.app';

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('💳 Open Student Payment Portal')
        .setStyle(ButtonStyle.Link)
        .setURL(portalUrl)
    );

    const embed = createInfoEmbed(
      '⚡ Academy Student Payment Portal',
      `Welcome to **The Elite Circle Academy** official payment & verification portal!\n\n` +
      `• **Enroll & Checkout:** Choose your subscription tier (Tier 1, Tier 2, Tier 3, Lifetime).\n` +
      `• **Local & International Payments:** Pay via eSewa, Khalti, Bank Transfer, or QR.\n` +
      `• **Automated Role Verification:** Upload your payment proof on the portal and receive verified Discord roles automatically upon approval.\n\n` +
      `🌐 Portal Link: **[${portalUrl}](${portalUrl})**`
    );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  },
};
