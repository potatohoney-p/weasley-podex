import { settings } from '../core/config.js';
import { getActiveChannel } from './runtime.js';
import type { MessengerChannel } from './types.js';

export type TransportCapability = {
    configured: boolean;
    activeInbound: boolean;
    sendCapable: boolean;
    reason?: string;
};

export type ChannelHealthSnapshot = {
    activeInbound: MessengerChannel;
    telegram: TransportCapability;
    discord: TransportCapability;
};

function telegramHasSendTarget(): boolean {
    const tg = settings["telegram"];
    if (tg?.allowedChatIds?.length) return true;
    const messaging = settings["messaging"] as Record<string, unknown> | undefined;
    const last = messaging?.['lastActive'] as Record<string, unknown> | undefined;
    const telegramLast = last?.['telegram'] as { targetId?: string } | undefined;
    return Boolean(telegramLast?.targetId);
}

function discordHasSendTarget(): boolean {
    const dc = settings["discord"];
    if (dc?.channelIds?.length) return true;
    const messaging = settings["messaging"] as Record<string, unknown> | undefined;
    const last = messaging?.['lastActive'] as Record<string, unknown> | undefined;
    const discordLast = last?.['discord'] as { targetId?: string } | undefined;
    return Boolean(discordLast?.targetId);
}

export function getTransportCapability(channel: MessengerChannel): TransportCapability {
    const activeInbound = getActiveChannel() === channel;
    if (channel === 'telegram') {
        const tg = settings["telegram"];
        const token = typeof tg?.token === 'string' ? tg.token.trim() : '';
        const configured = Boolean(tg?.enabled && token);
        if (!configured) {
            return { configured: false, activeInbound, sendCapable: false, reason: 'disabled' };
        }
        if (!telegramHasSendTarget()) {
            return { configured: true, activeInbound, sendCapable: false, reason: 'missing_chat_id' };
        }
        return { configured: true, activeInbound, sendCapable: true };
    }

    const dc = settings["discord"];
    const token = typeof dc?.token === 'string' ? dc.token.trim() : '';
    const guildId = typeof dc?.guildId === 'string' ? dc.guildId.trim() : '';
    const configured = Boolean(dc?.enabled && token && guildId);
    if (!configured) {
        return { configured: false, activeInbound, sendCapable: false, reason: 'disabled' };
    }
    if (!discordHasSendTarget()) {
        return { configured: true, activeInbound, sendCapable: false, reason: 'missing_channel_id' };
    }
    return { configured: true, activeInbound, sendCapable: true };
}

export function buildChannelHealthSnapshot(): ChannelHealthSnapshot {
    return {
        activeInbound: getActiveChannel(),
        telegram: getTransportCapability('telegram'),
        discord: getTransportCapability('discord'),
    };
}
