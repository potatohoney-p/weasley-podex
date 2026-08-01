import type { ReactElement } from 'react';
import type { DashboardDiffMode, DashboardDiffRootPolicy, DashboardLocale, DashboardRegistryUi } from '../types';

type Props = {
    locale: DashboardLocale;
    ui: DashboardRegistryUi;
    onUiPatch: (patch: Partial<DashboardRegistryUi>) => void;
};

const COPY = {
    ko: {
        title: '개발 도구',
        description: 'Diff 패널이 선택된 인스턴스의 repo root와 기본 비교 방식을 고르는 기준입니다.',
        rootPolicy: ['Repo root 우선순위', 'Diff panel', '선택된 인스턴스에서 어떤 경로를 먼저 git repo로 볼지 정합니다.'],
        diffMode: ['기본 diff 모드', 'Diff panel', '처음 열 때 사용할 비교 범위입니다.'],
        baseRef: ['기본 base ref', 'Base ref 모드', 'origin/master, main, HEAD 같은 기준 ref입니다.'],
        untracked: ['Untracked 포함', 'Diff summary', '아직 git에 추가되지 않은 파일도 목록에 표시합니다.'],
    },
    en: {
        title: 'Developer tools',
        description: 'Defaults used by the Diff panel when it resolves a repo root from the selected instance.',
        rootPolicy: ['Repo root priority', 'Diff panel', 'Choose which selected-instance path is tried first as a git repository.'],
        diffMode: ['Default diff mode', 'Diff panel', 'Comparison scope used when the panel opens.'],
        baseRef: ['Default base ref', 'Base ref mode', 'Reference used for base comparisons, such as origin/master, main, or HEAD.'],
        untracked: ['Include untracked', 'Diff summary', 'Show files that are not yet tracked by git.'],
    },
    zh: {
        title: '开发工具',
        description: 'Diff 面板从已选实例解析 repo root 与默认比较方式时使用的设置。',
        rootPolicy: ['Repo root 优先级', 'Diff panel', '决定优先把已选实例中的哪个路径当作 git repo。'],
        diffMode: ['默认 diff 模式', 'Diff panel', '面板打开时使用的比较范围。'],
        baseRef: ['默认 base ref', 'Base ref 模式', '例如 origin/master、main 或 HEAD。'],
        untracked: ['包含 untracked', 'Diff summary', '显示尚未被 git 跟踪的文件。'],
    },
    ja: {
        title: '開発ツール',
        description: 'Diff パネルが選択中インスタンスから repo root と比較方式を決めるときの既定値です。',
        rootPolicy: ['Repo root の優先順位', 'Diff panel', '選択中インスタンスのどのパスを先に git repo として扱うかを決めます。'],
        diffMode: ['既定の diff モード', 'Diff panel', 'パネルを開いたときの比較範囲です。'],
        baseRef: ['既定の base ref', 'Base ref モード', 'origin/master、main、HEAD などの基準 ref です。'],
        untracked: ['Untracked を含める', 'Diff summary', 'git で未追跡のファイルも一覧に表示します。'],
    },
} as const;

const ROOT_POLICIES: Array<{ value: DashboardDiffRootPolicy; label: string }> = [
    { value: 'project-first', label: 'Project dirs first' },
    { value: 'working-dir-first', label: 'Working dir first' },
    { value: 'manual', label: 'Pinned root first' },
];

const DIFF_MODES: Array<{ value: DashboardDiffMode; label: string }> = [
    { value: 'unstaged', label: 'Unstaged' },
    { value: 'staged', label: 'Staged' },
    { value: 'head', label: 'HEAD' },
    { value: 'base', label: 'Base ref' },
];

function row(id: string, text: readonly [string, string, string], control: ReactElement): ReactElement {
    return (
        <div className="dashboard-settings-row">
            <div className="dashboard-settings-row-main">
                <label className="dashboard-settings-row-heading" htmlFor={id}>
                    <span>{text[0]}</span>
                    <span className="dashboard-settings-row-scope">{text[1]}</span>
                </label>
                <p className="dashboard-settings-row-description">{text[2]}</p>
            </div>
            <div className="dashboard-settings-row-control">{control}</div>
        </div>
    );
}

export function DashboardDeveloperSettingsSection(props: Props): ReactElement {
    const copy = COPY[props.locale] || COPY.ko;
    return (
        <section className="dashboard-settings-section">
            <header>
                <h3>{copy.title}</h3>
                <p>{copy.description}</p>
            </header>
            <div className="dashboard-settings-field-list">
                {row('dashboard-diff-root-policy', copy.rootPolicy, (
                    <select
                        id="dashboard-diff-root-policy"
                        className="dashboard-settings-select"
                        value={props.ui.diffRootPolicy}
                        onChange={(event) => props.onUiPatch({ diffRootPolicy: event.currentTarget.value as DashboardDiffRootPolicy })}
                    >
                        {ROOT_POLICIES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                ))}
                {row('dashboard-diff-default-mode', copy.diffMode, (
                    <select
                        id="dashboard-diff-default-mode"
                        className="dashboard-settings-select"
                        value={props.ui.diffDefaultMode}
                        onChange={(event) => props.onUiPatch({ diffDefaultMode: event.currentTarget.value as DashboardDiffMode })}
                    >
                        {DIFF_MODES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                ))}
                {row('dashboard-diff-base-ref', copy.baseRef, (
                    <input
                        id="dashboard-diff-base-ref"
                        className="dashboard-settings-shortcut-input"
                        type="text"
                        value={props.ui.diffBaseRef}
                        onChange={(event) => props.onUiPatch({ diffBaseRef: event.currentTarget.value })}
                    />
                ))}
                {row('dashboard-diff-include-untracked', copy.untracked, (
                    <input
                        id="dashboard-diff-include-untracked"
                        className="dashboard-settings-toggle"
                        type="checkbox"
                        checked={props.ui.diffIncludeUntracked}
                        onChange={(event) => props.onUiPatch({ diffIncludeUntracked: event.currentTarget.checked })}
                    />
                ))}
            </div>
        </section>
    );
}
