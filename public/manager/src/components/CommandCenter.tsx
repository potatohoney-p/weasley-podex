import type { ReactNode } from 'react';
import { isElectron } from '../panels/desktop-bridge';

type CommandCenterProps = {
    title: ReactNode;
    search: ReactNode;
    actions: ReactNode;
    mobileMenuButton: ReactNode;
};

export function CommandCenter(props: CommandCenterProps) {
    const electron = isElectron();
    return (
        <div className={`command-center command-bar${electron ? ' is-electron-titlebar' : ''}`}>
            <div className="command-primary">
                {props.mobileMenuButton}
                <div className="command-title">{props.title}</div>
                <div className="command-search">{props.search}</div>
                <div className="command-actions">{props.actions}</div>
            </div>
        </div>
    );
}
