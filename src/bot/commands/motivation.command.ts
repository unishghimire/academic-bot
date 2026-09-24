import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  TextChannel,
  ChannelType,
} from 'discord.js';
import { requireInstructor } from '../middleware/permissions.js';
import {
  createSuccessEmbed,
  createInfoEmbed,
  createErrorEmbed,
} from '../../utils/embed-builder.js';
import { safeDeferReply } from '../../utils/interaction.utils.js';
import {
  postHourlyMotivation,
  MOTIVATION_QUOTES,
} from '../jobs/hourly-motivation.job.js';
import { resolveDisciplineChannel } from '../../utils/channel.utils.js';
import { localStore } from '../../db/local-store.js';

export const motivationCommand = {
  data: new SlashCommandBuilder()
    .setName('motivation')
    .setDescription('Manage or trigger automated discipline and mindset broadcasts (Staff only)')
    .addSubcommand(sub =>
      sub
        .setName('post')
        .setDescription('Immediately trigger a motivation quote broadcast (Staff only)')
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Channel to post to (defaults to #🗿・discipline)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('status')
        .setDescription('Check automated hourly motivation system status and next quote')
    )
    .addSubcommand(sub =>
      sub
        .setName('preview')
        .setDescription('Preview the upcoming quote in the rotation')
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const isAllowed = await requireInstructor(interaction);
    if (!isAllowed) return;

    if (!(await safeDeferReply(interaction, true))) return;

    const sub = interaction.options.getSubcommand();

    if (sub === 'post') {
      const channel = interaction.options.getChannel('channel') as TextChannel | null;
      const res = await postHourlyMotivation(interaction.client, channel?.id);

      if (res.success && res.quote) {
        await interaction.editReply({
          embeds: [
            createSuccessEmbed(
              'Discipline Broadcast Sent! 🗿',
              `Successfully broadcasted quote to <#${res.channelId}>!\n\n` +
              `• **Author:** ${res.quote.author}\n` +
              `• **Quote:** *“${res.quote.quote}”*\n` +
              `• **Schedule:** Automated cron runs every hour on the hour (\`0 * * * *\`).`
            ),
          ],
        });
      } else {
        await interaction.editReply({
          embeds: [
            createErrorEmbed(
              'Broadcast Failed',
              res.error || 'Could not send discipline quote to the channel.'
            ),
          ],
        });
      }
    } else if (sub === 'status') {
      const guild = interaction.guild;
      let targetChannel = null;
      if (guild) {
        targetChannel = await resolveDisciplineChannel(guild);
      }

      const state = localStore.getMotivationState();
      const nextIndex = (state.lastIndex + 1) % MOTIVATION_QUOTES.length;
      const lastSentTime = state.lastSentAt
        ? `<t:${Math.floor(new Date(state.lastSentAt).getTime() / 1000)}:R>`
        : 'Never (will trigger at top of hour)';

      await interaction.editReply({
        embeds: [
          createInfoEmbed(
            '⚙️ Hourly Motivation Worker Status',
            `• **Interval:** Every hour on the hour (\`0 * * * *\`)\n` +
            `• **Target Channel:** ${targetChannel ? `<#${targetChannel.id}>` : 'Not found (check channel name for "discipline")'}\n` +
            `• **Last Sent:** ${lastSentTime}\n` +
            `• **Quote Pool Size:** ${MOTIVATION_QUOTES.length} curated quotes\n` +
            `• **Next Quote Index:** #${nextIndex + 1}/${MOTIVATION_QUOTES.length}\n\n` +
            `👉 *Use \`/motivation post\` to broadcast one immediately.*`
          ),
        ],
      });
    } else if (sub === 'preview') {
      const state = localStore.getMotivationState();
      const nextIndex = (state.lastIndex + 1) % MOTIVATION_QUOTES.length;
      const quote = MOTIVATION_QUOTES[nextIndex];

      await interaction.editReply({
        embeds: [
          createInfoEmbed(
            `👀 Next Quote Preview (#${nextIndex + 1}/${MOTIVATION_QUOTES.length})`,
            `> *"“${quote.quote}”"*\n\n` +
            `— **${quote.author}** • \`${quote.tag}\`\n\n` +
            `🎯 **Hourly Challenge:**\n${quote.challenge}`
          ),
        ],
      });
    }
  },
};
