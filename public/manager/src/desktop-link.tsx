import { useEffect, useState } from 'react';
import { isElectron } from './panels/desktop-bridge';

type DesktopStatus = {
    inDesktop: boolean;
    version: string;
    downloadUrl: string;
};

async function fetchDesktopStatus(): Promise<DesktopStatus> {
    const response = await fetch('/api/dashboard/desktop-status');
    if (!response.ok) throw new Error(`desktop status failed: ${response.status}`);
    return await response.json() as DesktopStatus;
}

function openCurrentDashboardPath(): void {
    const path = window.location.pathname + window.location.search;
    window.location.href = `weasley-podex://open?path=${encodeURIComponent(path)}`;
}

export function DesktopLink() {
    const inElectron = isElectron();
    const [status, setStatus] = useState<DesktopStatus | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (inElectron) return;
        let cancelled = false;
        fetchDesktopStatus()
            .then((next) => {
                if (!cancelled) setStatus(next);
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, [inElectron]);

    if (inElectron) return null;

    if (status?.inDesktop) {
        return (
            <span className="desktop-status-badge" title={`Weasley Podex Desktop ${status.version}`}>
                Running in Weasley Podex Desktop
            </span>
        );
    }

    if (!status && !failed) return null;

    return (
        <button
            type="button"
            className="desktop-open-button"
            onClick={openCurrentDashboardPath}
            title={status?.downloadUrl || 'Open this dashboard path in Weasley Podex Desktop'}
        >
            Open in Desktop App
        </button>
    );
}

