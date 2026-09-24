import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  postHourlyMotivation,
  MOTIVATION_QUOTES,
} from '../src/bot/jobs/hourly-motivation.job.js';
import { resolveDisciplineChannel } from '../src/utils/channel.utils.js';
import { localStore } from '../src/db/local-store.js';
import { env } from '../src/config/env.js';

describe('Hourly Motivation & Discipline System', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('contains a robust pool of high-impact motivational quotes', () => {
    expect(MOTIVATION_QUOTES.length).toBeGreaterThanOrEqual(20);
    for (const item of MOTIVATION_QUOTES) {
      expect(item.quote.length).toBeGreaterThan(5);
      expect(item.author.length).toBeGreaterThan(1);
      expect(item.challenge.length).toBeGreaterThan(10);
      expect(item.tag).toContain('#');
    }
  });

  it('resolves discipline channel by matching name with discipline or emoji prefix', async () => {
    const mockChannel = {
      id: 'chan_discipline_123',
      name: '🗿・discipline',
      isTextBased: () => true,
    };

    const mockGuild: any = {
      channels: {
        cache: new Map([
          ['chan_general', { id: 'chan_general', name: 'general', isTextBased: () => true }],
          ['chan_discipline_123', mockChannel],
        ]),
      },
    };

    const resolved = await resolveDisciplineChannel(mockGuild);
    expect(resolved).not.toBeNull();
    expect(resolved?.id).toBe('chan_discipline_123');
  });

  it('successfully posts an hourly motivation embed to the channel and updates state', async () => {
    const mockSend = vi.fn().mockResolvedValue({});
    const mockDisciplineChannel = {
      id: 'chan_discipline_999',
      name: '🗿・discipline',
      isTextBased: () => true,
      send: mockSend,
    };

    const mockGuild: any = {
      id: env.DISCORD_GUILD_ID,
      channels: {
        cache: new Map([['chan_discipline_999', mockDisciplineChannel]]),
      },
    };

    const mockClient: any = {
      isReady: () => true,
      guilds: {
        cache: new Map([[env.DISCORD_GUILD_ID, mockGuild]]),
      },
    };

    vi.spyOn(localStore, 'getMotivationState').mockReturnValue({ lastIndex: 0 });
    const setMotivationStateSpy = vi.spyOn(localStore, 'setMotivationState').mockImplementation(() => {});

    const res = await postHourlyMotivation(mockClient);

    expect(res.success).toBe(true);
    expect(res.channelId).toBe('chan_discipline_999');
    expect(res.quote).toBeDefined();
    expect(res.quote?.author).toBe(MOTIVATION_QUOTES[1].author);

    // Verify embed was sent
    expect(mockSend).toHaveBeenCalled();
    const sendArgs = mockSend.mock.calls[0][0];
    expect(sendArgs.embeds[0].data.title).toBe('🗿 Hourly Discipline & Mindset');
    expect(sendArgs.embeds[0].data.description).toContain(MOTIVATION_QUOTES[1].quote);

    // Verify local state was updated to next index
    expect(setMotivationStateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        lastIndex: 1,
        lastSentAt: expect.any(String),
      })
    );
  });

  it('gracefully reports error if channel is not found', async () => {
    const mockGuild: any = {
      id: env.DISCORD_GUILD_ID,
      channels: {
        cache: new Map(),
      },
    };

    const mockClient: any = {
      isReady: () => true,
      guilds: {
        cache: new Map([[env.DISCORD_GUILD_ID, mockGuild]]),
      },
    };

    const res = await postHourlyMotivation(mockClient);
    expect(res.success).toBe(false);
    expect(res.error).toContain('No suitable discipline channel found');
  });
});
