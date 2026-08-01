import type { DashboardInstance } from './types';

function compactGeneratedInstanceName(value: string, port: number): string {
    const rawName = value.split('/').filter(Boolean).pop() || value;
    const withoutHash = rawName
        .replace(/^\.?podex$/i, 'Weasley Podex')
        .replace(/^\.?podex-(\d+)-[a-f0-9]{7,}$/i, 'Weasley Podex $1')
        .replace(/^\.?podex-(\d+)$/i, 'Weasley Podex $1')
        .replace(/^\.?weasley-podex-(\d+)-[a-f0-9]{7,}$/i, 'Weasley Podex $1')
        .replace(/^\.?weasley-podex-(\d+)$/i, 'Weasley Podex $1');
    return withoutHash || `Weasley Podex ${port}`;
}

export function instanceLabel(instance: DashboardInstance): string {
    if (instance.label) return instance.label;
    const rawLabel = instance.instanceId || instance.homeDisplay || '';
    const rawName = rawLabel.split('/').filter(Boolean).pop() || rawLabel;
    return compactGeneratedInstanceName(rawName, instance.port);
}

export function formatUptime(seconds: number | null): string {
    if (seconds == null) return 'n/a';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 1) return `${Math.round(seconds)}s`;
    const hours = Math.floor(minutes / 60);
    if (hours < 1) return `${minutes}m`;
    return `${hours}h ${minutes % 60}m`;
}

