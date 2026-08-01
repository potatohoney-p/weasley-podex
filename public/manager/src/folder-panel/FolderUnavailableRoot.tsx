type FolderUnavailableRootProps = {
    path: string;
    error: string;
    onOpenFolder: () => void;
    onClear: () => void;
};

export function FolderUnavailableRoot(props: FolderUnavailableRootProps) {
    return (
        <div className="folder-unavailable">
            <div className="folder-unavailable__title">Folder unavailable</div>
            <div className="folder-unavailable__path" title={props.path}>{props.path}</div>
            <div className="folder-unavailable__error">{props.error}</div>
            <div className="folder-unavailable__actions">
                <button type="button" className="folder-action-btn" onClick={props.onOpenFolder}>Open Folder</button>
                <button type="button" className="folder-action-btn" onClick={props.onClear}>Clear</button>
            </div>
        </div>
    );
}
