import cron from 'node-cron';
import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import { env } from '../../config/env.js';
import { COLORS, EMBED_FOOTER } from '../../config/constants.js';
import { logger } from '../../utils/logger.js';
import { resolveDisciplineChannel } from '../../utils/channel.utils.js';
import { localStore } from '../../db/local-store.js';

export interface MotivationQuote {
  quote: string;
  author: string;
  tag: string;
  challenge: string;
}

export const MOTIVATION_QUOTES: MotivationQuote[] = [
  {
    quote: "You have power over your mind - not outside events. Realize this, and you will find strength.",
    author: "Marcus Aurelius",
    tag: "#Stoicism #MentalToughness",
    challenge: "Identify one thing outside your control right now and stop giving it mental energy. Focus 100% on execution."
  },
  {
    quote: "Discipline equals freedom.",
    author: "Jocko Willink",
    tag: "#Discipline #Ownership",
    challenge: "Commit to completing your most difficult creative or business task in the next 60 minutes without stopping."
  },
  {
    quote: "We don't rise to the level of our expectations, we fall to the level of our training.",
    author: "Archilochus",
    tag: "#Standard #Preparation",
    challenge: "Refine your workflow. Don't rely on hype or motivation; rely on your daily schedule."
  },
  {
    quote: "Don't count the days, make the days count.",
    author: "Muhammad Ali",
    tag: "#Relentless #Execution",
    challenge: "Treat this exact hour as the turning point of your week. Win the next 60 minutes."
  },
  {
    quote: "You do not rise to the level of your goals. You fall to the level of your systems.",
    author: "James Clear",
    tag: "#AtomicHabits #Consistency",
    challenge: "Fix one broken step in your daily routine today so good habits become effortless."
  },
  {
    quote: "The only person you are destined to become is the person you decide to be.",
    author: "Ralph Waldo Emerson",
    tag: "#Identity #Growth",
    challenge: "Act like the 7-figure creator or business builder you want to become for the rest of today."
  },
  {
    quote: "Great things are not done by impulse, but by a series of small things brought together.",
    author: "Vincent van Gogh",
    tag: "#Craftsmanship #Patience",
    challenge: "Master the fundamentals: test one new hook, refine one headline, or produce one quality cut."
  },
  {
    quote: "Most people overestimate what they can do in a day, and underestimate what they can do in a year.",
    author: "Bill Gates",
    tag: "#Compounding #Vision",
    challenge: "Stay consistent today even if results aren't immediate. The compound effect is working."
  },
  {
    quote: "The impediment to action advances action. What stands in the way becomes the way.",
    author: "Marcus Aurelius",
    tag: "#ObstacleIsTheWay #Stoic",
    challenge: "Take the biggest obstacle or objection you're facing and turn it into your key selling point or learning lesson."
  },
  {
    quote: "It's not about motivation. It's about drive. Motivation comes and goes; drive stays when the feeling leaves.",
    author: "David Goggins",
    tag: "#NoExcuses #Relentless",
    challenge: "When you feel like quitting or taking an early break, push for 15 more minutes of focused work."
  },
  {
    quote: "I fear not the man who has practiced 10,000 kicks once, but I fear the man who has practiced one kick 10,000 times.",
    author: "Bruce Lee",
    tag: "#Mastery #Repetition",
    challenge: "Master your primary skill. Repetition of the basics is where true greatness lies."
  },
  {
    quote: "Quality is not an act, it is a habit.",
    author: "Aristotle",
    tag: "#Excellence #Habit",
    challenge: "Never submit sloppy work. Polish your current asset until it meets world-class standards."
  },
  {
    quote: "The secret of getting ahead is getting started.",
    author: "Mark Twain",
    tag: "#Action #Momentum",
    challenge: "Close all distraction tabs. Open your work project and write the first sentence or edit the first cut right now."
  },
  {
    quote: "If you really want to do something, you'll find a way. If you don't, you'll find an excuse.",
    author: "Jim Rohn",
    tag: "#Accountability #Results",
    challenge: "Eliminate your favorite excuse. Take total responsibility for your production output today."
  },
  {
    quote: "Success is the sum of small efforts, repeated day in and day out.",
    author: "Robert Collier",
    tag: "#Consistency #Grit",
    challenge: "Show up today even if you're tired. True professionals work regardless of their mood."
  },
  {
    quote: "Action will delineate and define you.",
    author: "Thomas Jefferson",
    tag: "#Execution #Clarity",
    challenge: "Stop overthinking and strategizing in circles. Test your hypothesis in the market today."
  },
  {
    quote: "Doubt kills more dreams than failure ever will.",
    author: "Suzy Kassem",
    tag: "#Confidence #Action",
    challenge: "Take that bold step you've been delaying out of fear of rejection or critique."
  },
  {
    quote: "He who has a why to live can bear almost any how.",
    author: "Friedrich Nietzsche",
    tag: "#Purpose #Endurance",
    challenge: "Remind yourself why you started. Anchor your focus in the family, freedom, and future you're building."
  },
  {
    quote: "Simplicity is the ultimate sophistication.",
    author: "Leonardo da Vinci",
    tag: "#Design #Clarity",
    challenge: "Cut out the unnecessary fluff in your script, offer, or video edit. Keep it simple and punchy."
  },
  {
    quote: "Do not wait to strike till the iron is hot; but make it hot by striking.",
    author: "William Butler Yeats",
    tag: "#Proactivity #Initiative",
    challenge: "Create your own opportunity today instead of waiting for ideal conditions."
  },
  {
    quote: "Amateurs sit and wait for inspiration, the rest of us just get up and go to work.",
    author: "Stephen King",
    tag: "#Professionalism #Routine",
    challenge: "Sit in your chair and do the work right now. Inspiration follows action, not vice versa."
  },
  {
    quote: "Hard choices, easy life. Easy choices, hard life.",
    author: "Jerzy Gregorek",
    tag: "#Discipline #Standards",
    challenge: "Choose the hard choice this hour: deep work, zero snacks, zero social media scroll."
  },
  {
    quote: "A warrior does not give up what he loves, he finds the love in what he does.",
    author: "Dan Millman",
    tag: "#WarriorMindset #Focus",
    challenge: "Find deep satisfaction in the tedious, difficult parts of your craft."
  },
  {
    quote: "Energy flows where attention goes.",
    author: "Tony Robbins",
    tag: "#Focus #DirectAction",
    challenge: "Direct 100% of your mental energy on your primary revenue-driving task."
  },
  {
    quote: "The man who moves a mountain begins by carrying away small stones.",
    author: "Confucius",
    tag: "#StepByStep #Persistence",
    challenge: "Break down your big daunting project into the immediate next 15-minute chunk."
  }
];

/**
 * Dispatches an hourly discipline/motivation embed to the designated channel.
 */
export async function postHourlyMotivation(
  client: Client,
  forceChannelId?: string | null
): Promise<{ success: boolean; channelId?: string; quote?: MotivationQuote; error?: string }> {
  if (!client.isReady()) {
    return { success: false, error: 'Client is not ready' };
  }

  try {
    const guild = client.guilds.cache.get(env.DISCORD_GUILD_ID);
    if (!guild) {
      return { success: false, error: `Guild ${env.DISCORD_GUILD_ID} not found` };
    }

    // 1. Resolve discipline channel (#🗿・discipline)
    const targetChannel = await resolveDisciplineChannel(guild, forceChannelId);
    if (!targetChannel) {
      logger.warn('Could not locate a discipline channel to post hourly motivation');
      return { success: false, error: 'No suitable discipline channel found' };
    }

    // 2. Select next quote sequentially from pool
    const state = localStore.getMotivationState();
    const nextIndex = (state.lastIndex + 1) % MOTIVATION_QUOTES.length;
    const selectedQuote = MOTIVATION_QUOTES[nextIndex];

    // 3. Build sleek discipline embed
    const embed = new EmbedBuilder()
      .setTitle('🗿 Hourly Discipline & Mindset')
      .setColor(COLORS.GOLD)
      .setDescription(
        `> *"“${selectedQuote.quote}”"*\n\n` +
        `— **${selectedQuote.author}** • \`${selectedQuote.tag}\`\n\n` +
        `🎯 **Hourly Challenge:**\n${selectedQuote.challenge}`
      )
      .setFooter({
        text: `${EMBED_FOOTER.text} • Quote #${nextIndex + 1}/${MOTIVATION_QUOTES.length}`,
        iconURL: EMBED_FOOTER.iconURL,
      })
      .setTimestamp();

    await targetChannel.send({ embeds: [embed] });

    // 4. Update state tracking
    localStore.setMotivationState({
      lastIndex: nextIndex,
      lastSentAt: new Date().toISOString(),
    });

    logger.info(
      { channelId: targetChannel.id, quoteIndex: nextIndex, author: selectedQuote.author },
      '📢 Hourly motivation broadcast successfully sent'
    );

    return {
      success: true,
      channelId: targetChannel.id,
      quote: selectedQuote,
    };
  } catch (err: any) {
    logger.error({ err: err?.message }, 'Failed to broadcast hourly motivation');
    return { success: false, error: err?.message || 'Unknown error' };
  }
}

/**
 * Initializes the automated hourly motivation worker.
 * Runs at the top of every hour (0 * * * *).
 */
export function initHourlyMotivationJob(client: Client): void {
  logger.info('Initializing automated Hourly Discipline & Motivation worker (every hour on the hour)...');

  // Initial check on startup: if no motivation was sent in the last 60 minutes, post one after 15s
  setTimeout(() => {
    try {
      const state = localStore.getMotivationState();
      const lastSentTime = state.lastSentAt ? new Date(state.lastSentAt).getTime() : 0;
      const oneHourAgo = Date.now() - 60 * 60 * 1000;

      if (!state.lastSentAt || lastSentTime < oneHourAgo) {
        logger.info('Startup hourly motivation check: Posting initial hourly mindset quote...');
        postHourlyMotivation(client).catch(err => {
          logger.warn({ err: err?.message }, 'Startup motivation post failed');
        });
      }
    } catch (err: any) {
      logger.warn({ err: err?.message }, 'Error in startup motivation check');
    }
  }, 15000);

  // Scheduled cron running at minute 0 of every hour: '0 * * * *'
  cron.schedule('0 * * * *', () => {
    logger.info('⏰ Hourly motivation cron triggered! Broadcasting mindset quote...');
    postHourlyMotivation(client).catch(err => {
      logger.error({ err: err?.message }, 'Scheduled hourly motivation post failed');
    });
  });
}
