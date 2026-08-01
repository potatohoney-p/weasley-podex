/**
 * #233 follow-up — native project-root picker for a worker instance.
 * Wraps the long-lived /project/pick proxy call (the OS dialog blocks until
 * the user answers) with single-flight busy state.
 */

import { useState } from 'react';
import { pickInstanceProjectFolder } from '../api';

export type ProjectPickerApi = {
    busyPort: number | null;
    pick: (port: number) => Promise<void>;
};

export function useProjectPicker(
    onPicked: (port: number) => Promise<void> | void,
    onError: (message: string) => void,
): ProjectPickerApi {
    const [busyPort, setBusyPort] = useState<number | null>(null);

    async function pick(port: number): Promise<void> {
        if (busyPort != null) return;
        setBusyPort(port);
        try {
            const result = await pickInstanceProjectFolder(port);
            if (!result.cancelled) await onPicked(port);
        } catch (err) {
            onError((err as Error).message);
        } finally {
            setBusyPort(null);
        }
    }

    return { busyPort, pick };
}
