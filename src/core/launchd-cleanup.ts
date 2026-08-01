/**
 * Legacy podex LaunchAgent plist 판별 — 순수 함수.
 * 구 버전 `jaw_launchd.sh` 또는 legacy installer 산물을 탐지.
 *
 * 현재 Weasley 포맷에 대응하는 이전 `com.podex.*` label만 안전하게 이전하고,
 * 다른 hashed multi-instance label은 그대로 보존한다.
 * 해시 없는 `podex-<port>`만 구버전으로 취급.
 */
export function findLegacyPODEXLabels(files: string[], currentLabel: string): string[] {
    const matchingLegacyLabel = currentLabel.startsWith('com.weasley.podex.')
        ? currentLabel.replace(/^com\.weasley\.podex\./, 'com.podex.')
        : null;
    return files
        .filter(f => f.startsWith('com.podex.') && f.endsWith('.plist'))
        .map(f => f.replace(/\.plist$/, ''))
        .filter(label => label !== currentLabel && (
            label === matchingLegacyLabel ||
            label === 'com.podex.local' ||
            /^com\.podex\.podex-\d+$/.test(label)
        ));
}


