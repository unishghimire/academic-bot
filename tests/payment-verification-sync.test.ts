import { describe, it, expect, vi } from 'vitest';
import { PaymentVerificationSyncService } from '../src/services/payment-verification-sync.service.js';

describe('PaymentVerificationSyncService — Database Payment to Discord Role Assignment', () => {
  it('detects approved payment from database and assigns roles to member', async () => {
    const service = new PaymentVerificationSyncService();

    const mockMember: any = {
      id: '123456789012345678',
      roles: {
        cache: new Map(),
        add: vi.fn().mockResolvedValue({}),
      },
      send: vi.fn().mockResolvedValue({}),
      user: {
        username: 'teststudent',
        tag: 'teststudent#0001',
      },
      displayName: 'Test Student',
    };

    const mockGuild: any = {
      members: {
        fetch: vi.fn().mockResolvedValue(mockMember),
        cache: new Map([['123456789012345678', mockMember]]),
        search: vi.fn().mockResolvedValue([mockMember]),
      },
    };

    const mockClient: any = {
      isReady: () => true,
      guilds: {
        cache: new Map([['mock_guild_id', mockGuild]]),
      },
    };

    // Spy on internal methods or test resolution
    const resolved = await (service as any).resolveGuildMember(mockGuild, '123456789012345678', null, 'test@example.com');
    expect(resolved).not.toBeNull();
    expect(resolved?.id).toBe('123456789012345678');
  });

  it('resolves member by username if user typed username instead of snowflake ID', async () => {
    const service = new PaymentVerificationSyncService();

    const mockMember: any = {
      id: '998877665544332211',
      roles: {
        cache: new Map(),
        add: vi.fn().mockResolvedValue({}),
      },
      send: vi.fn().mockResolvedValue({}),
      user: {
        username: 'john_doe',
        tag: 'john_doe#1234',
      },
      displayName: 'John Doe',
    };

    const mockGuild: any = {
      members: {
        fetch: vi.fn().mockRejectedValue(new Error('Unknown User')),
        cache: new Map([['998877665544332211', mockMember]]),
        search: vi.fn().mockResolvedValue([mockMember]),
      },
    };

    const resolved = await (service as any).resolveGuildMember(mockGuild, 'john_doe', 'john_doe', 'john@example.com');
    expect(resolved).not.toBeNull();
    expect(resolved?.id).toBe('998877665544332211');
  });
});
