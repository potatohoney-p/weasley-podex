import type { FolderPanelEntry } from './folder-sources';

type FolderMoveConfirmDialogProps = {
    source: FolderPanelEntry;
    target: FolderPanelEntry;
    busy: boolean;
    skipChecked: boolean;
    onSkipCheckedChange: (checked: boolean) => void;
    onCancel: () => void;
    onConfirm: () => void;
};

export function FolderMoveConfirmDialog(props: FolderMoveConfirmDialogProps) {
    return (
        <div className="folder-move-confirm" role="dialog" aria-label="Confirm folder move">
            <div className="folder-move-confirm__title">Move "{props.source.name}" into "{props.target.name}"?</div>
            <label className="folder-move-confirm__option">
                <input
                    type="checkbox"
                    checked={props.skipChecked}
                    onChange={event => props.onSkipCheckedChange(event.target.checked)}
                />
                Don't ask again for internal moves this session
            </label>
            <div className="folder-move-confirm__actions">
                <button type="button" className="folder-action-btn" disabled={props.busy} onClick={props.onCancel}>Cancel</button>
                <button type="button" className="folder-action-btn is-primary" disabled={props.busy} onClick={props.onConfirm}>
                    {props.busy ? 'Moving...' : 'Move'}
                </button>
            </div>
        </div>
    );
}
