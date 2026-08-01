import type { BottomPanelTab } from './types';

const TAB_LABELS: Record<BottomPanelTab, string> = {
    activity: 'Activity',
    terminal: 'Terminal',
    browser: 'Browser',
    logs: 'Logs',
};

type BottomPanelTabBarProps = {
    tabs: BottomPanelTab[];
    activeTab: BottomPanelTab | null;
    onActivate: (tab: BottomPanelTab) => void;
    onClose: (tab: BottomPanelTab) => void;
    onCollapse: () => void;
};

export function BottomPanelTabBar(props: BottomPanelTabBarProps) {
    function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
        const tabs = props.tabs;
        const idx = props.activeTab ? tabs.indexOf(props.activeTab) : -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            const dir = e.key === 'ArrowRight' ? 1 : -1;
            const next = tabs[(idx + dir + tabs.length) % tabs.length];
            if (next) props.onActivate(next);
        } else if (e.key === 'Home') {
            e.preventDefault();
            if (tabs[0]) props.onActivate(tabs[0]);
        } else if (e.key === 'End') {
            e.preventDefault();
            const last = tabs[tabs.length - 1];
            if (last) props.onActivate(last);
        }
    }

    return (
        <div className="bottom-tab-bar" role="tablist" onKeyDown={handleKeyDown}>
            {props.tabs.map(tab => (
                <div
                    key={tab}
                    className={`bottom-tab-item ${tab === props.activeTab ? 'is-active' : ''}`}
                    role="presentation"
                >
                    <button
                        type="button"
                        role="tab"
                        className={`bottom-tab ${tab === props.activeTab ? 'is-active' : ''}`}
                        aria-selected={tab === props.activeTab}
                        tabIndex={tab === props.activeTab ? 0 : -1}
                        onClick={() => props.onActivate(tab)}
                    >
                        <span>{TAB_LABELS[tab]}</span>
                    </button>
                    <button
                        type="button"
                        className="bottom-tab-close"
                        aria-label={`Close ${TAB_LABELS[tab]}`}
                        title={`Close ${TAB_LABELS[tab]}`}
                        onClick={() => props.onClose(tab)}
                    >
                        ×
                    </button>
                </div>
            ))}
            <button type="button" className="bottom-collapse-button" aria-label="Collapse panel" onClick={props.onCollapse}>
                ▼
            </button>
        </div>
    );
}
