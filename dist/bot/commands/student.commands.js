"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.continueCommand = exports.progressCommand = exports.subscriptionCommand = exports.linkCommand = void 0;
const discord_js_1 = require("discord.js");
const linking_service_js_1 = require("../../services/linking.service.js");
const progress_service_js_1 = require("../../services/progress.service.js");
const client_js_1 = require("../../db/client.js");
const local_store_js_1 = require("../../db/local-store.js");
const supabase_js_1 = require("../../db/supabase.js");
const embed_builder_js_1 = require("../../utils/embed-builder.js");
const env_js_1 = require("../../config/env.js");
exports.linkCommand = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('link')
        .setDescription('Connect your Discord account to your verified Academy subscription'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        try {
            const linkData = await linking_service_js_1.linkingService.createLinkingCodeForDiscordUser(interaction.user.id);
            const portalUrl = env_js_1.env.STUDENT_PORTAL_URL || 'https://academic-student-portal.vercel.app';
            const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
                .setLabel('🔗 Open Portal to Link Account')
                .setStyle(discord_js_1.ButtonStyle.Link)
                .setURL(portalUrl));
            const embed = (0, embed_builder_js_1.createInfoEmbed)('🔗 Account Verification & Linking', `To link your Academy account and activate your roles:\n\n` +
                `1. Click the button below to open the official Student Portal:\n` +
                `👉 **[Student Portal Link](${portalUrl})**\n\n` +
                `2. Your 6-digit linking verification code:\n` +
                `\`\`\`\n${linkData.code}\n\`\`\`\n` +
                `⏱️ *This code is valid for 15 minutes. Verification happens directly against the payment database.*`);
            await interaction.editReply({ embeds: [embed], components: [row] });
        }
        catch (error) {
            await interaction.editReply({
                embeds: [(0, embed_builder_js_1.createWarningEmbed)('Linking Error', error.message || 'Unable to generate linking code')],
            });
        }
    },
};
exports.subscriptionCommand = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('subscription')
        .setDescription('View your current Academy membership, plan, and renewal date'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        let user = null;
        // 1. Check PostgreSQL if online
        if ((0, client_js_1.isDatabaseOnline)()) {
            try {
                user = await client_js_1.prisma.user.findUnique({
                    where: { discordId: interaction.user.id },
                    include: { subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 } },
                });
            }
            catch {
                // Fallback
            }
        }
        // 2. Check localStore
        if (!user) {
            user = local_store_js_1.localStore.findUserByDiscordId(interaction.user.id);
        }
        // 3. Check Supabase payment_verifications
        if (!user) {
            const supabase = (0, supabase_js_1.getSupabaseClient)();
            if (supabase) {
                try {
                    const { data } = await supabase
                        .from('payment_verifications')
                        .select('*')
                        .or(`discord_id.eq.${interaction.user.id},discord_username.ilike.%${interaction.user.username}%`)
                        .in('status', ['verified', 'approved', 'Verified', 'Approved', 'VERIFIED', 'APPROVED'])
                        .order('created_at', { ascending: false })
                        .limit(1);
                    if (data && data.length > 0) {
                        const rec = data[0];
                        user = {
                            email: rec.email || `${interaction.user.username}@discord.local`,
                            subscriptionStatus: 'ACTIVE',
                            currentTier: rec.tier_number || 1,
                            subscriptionExpiresAt: new Date(new Date(rec.created_at).getTime() + (rec.access_duration_days || 30) * 24 * 60 * 60 * 1000),
                            subscriptions: [{ plan: rec.plan_name || `Tier ${rec.tier_number || 1}` }],
                        };
                    }
                }
                catch {
                    // Ignore
                }
            }
        }
        if (!user) {
            await interaction.editReply({
                embeds: [(0, embed_builder_js_1.createWarningEmbed)('Not Linked', 'No Academy account is linked to this Discord profile. Use `/link` to connect.')],
            });
            return;
        }
        const latestSub = user.subscriptions[0];
        const expiresDate = user.subscriptionExpiresAt
            ? `<t:${Math.floor(user.subscriptionExpiresAt.getTime() / 1000)}:F> (<t:${Math.floor(user.subscriptionExpiresAt.getTime() / 1000)}:R>)`
            : '*No expiration set*';
        const portalUrl = env_js_1.env.STUDENT_PORTAL_URL || 'https://academic-student-portal.vercel.app';
        const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
            .setLabel('⚡ Manage Subscription / Renew')
            .setStyle(discord_js_1.ButtonStyle.Link)
            .setURL(portalUrl));
        const embed = (0, embed_builder_js_1.createInfoEmbed)('💳 Subscription & Access Status', `**Student Email:** \`${user.email}\`\n` +
            `**Current Status:** \`${user.subscriptionStatus}\`\n` +
            `**Current Tier:** **Tier ${user.currentTier}**\n` +
            `**Plan:** \`${latestSub?.plan || 'Standard'}\`\n` +
            `**Expires/Renews:** ${expiresDate}\n\n` +
            `*Source of Truth: PostgreSQL Database. Synchronized via Academy Admin Payments.*`);
        await interaction.editReply({ embeds: [embed], components: [row] });
    },
};
exports.progressCommand = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('progress')
        .setDescription('View your detailed course completion, XP, and streak'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const user = await client_js_1.prisma.user.findUnique({
            where: { discordId: interaction.user.id },
        });
        if (!user) {
            await interaction.editReply({
                embeds: [(0, embed_builder_js_1.createWarningEmbed)('Not Linked', 'Please run `/link` first to connect your Academy account.')],
            });
            return;
        }
        const summary = await progress_service_js_1.progressService.getUserProgressSummary(user.id);
        const embed = (0, embed_builder_js_1.createSuccessEmbed)('📊 Your Academy Progress', `**Overall Completion:** **${summary.overallPercentage}%** (${summary.totalCompleted}/${summary.totalLessons} lessons)\n` +
            `**Total XP:** **${summary.totalXp.toLocaleString()} XP**\n` +
            `**Learning Streak:** 🔥 **${summary.streakCount} day(s)**\n` +
            `**Active Tier:** **Tier ${summary.currentTier}**\n\n` +
            `**Tier Breakdown:**\n` +
            summary.tierStats
                .map(ts => `• **Tier ${ts.tier}:** ${ts.percentage}% completed (${ts.completedLessons}/${ts.totalLessons} lessons)`)
                .join('\n'));
        await interaction.editReply({ embeds: [embed] });
    },
};
exports.continueCommand = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('continue')
        .setDescription('Resume exactly where you left off in your lessons'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const user = await client_js_1.prisma.user.findUnique({
            where: { discordId: interaction.user.id },
            include: { lessonProgress: true },
        });
        if (!user) {
            await interaction.editReply({
                embeds: [(0, embed_builder_js_1.createWarningEmbed)('Not Linked', 'Please run `/link` first.')],
            });
            return;
        }
        const completedLessonIds = new Set(user.lessonProgress.filter(p => p.completed).map(p => p.lessonId));
        // Find first incomplete lesson in user's accessible tiers
        const nextLesson = await client_js_1.prisma.lesson.findFirst({
            where: {
                tier: { lte: user.currentTier },
                id: { notIn: Array.from(completedLessonIds) },
            },
            orderBy: [{ tier: 'asc' }, { module: 'asc' }, { orderIndex: 'asc' }],
        });
        if (!nextLesson) {
            await interaction.editReply({
                embeds: [(0, embed_builder_js_1.createSuccessEmbed)('All Caught Up!', `You have completed all available lessons for your current tier (Tier ${user.currentTier})! Check your final project requirements or wait for the next tier unlock.`)],
            });
            return;
        }
        const embed = (0, embed_builder_js_1.createInfoEmbed)(`▶️ Next Up: ${nextLesson.title}`, `**Tier ${nextLesson.tier} • Module ${nextLesson.module} • Lesson ${nextLesson.orderIndex}**\n\n` +
            `${nextLesson.description}\n\n` +
            `**Requirements:** Lesson Study (Video/Docs) ${nextLesson.requiresAssignment ? '+ Practical Assignment' : ''}\n\n` +
            `👉 **Access Materials in Discord:**\n` +
            `• 🎬 Video upload: **#tier-${nextLesson.tier}-lessons**\n` +
            `• 📄 Lesson docs: **#tier-${nextLesson.tier}-resources**\n\n` +
            `Run \`/course lesson lesson_id:${nextLesson.id}\` to view full details and mark progress!`);
        await interaction.editReply({ embeds: [embed] });
    },
};
//# sourceMappingURL=student.commands.js.map