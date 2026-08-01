import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const serverTypesSource = readFileSync('src/manager/types.ts', 'utf8');
const registrySource = readFileSync('src/manager/registry.ts', 'utf8');
const publicTypesSource = readFileSync('public/manager/src/types.ts', 'utf8');
const useDashboardViewSource = readFileSync('public/manager/src/hooks/useDashboardView.ts', 'utf8');
const dashboardSettingsSource = readFileSync('public/manager/src/dashboard-settings/dashboard-settings-ui.ts', 'utf8');
const appSource = readFileSync('public/manager/src/App.tsx', 'utf8');
const sidebarSource = readFileSync('public/manager/src/SidebarRailRouter.tsx', 'utf8');

test('dashboard registry stores the right FolderPanel root as UI state', () => {
    assert.ok(serverTypesSource.includes('rightFolderRootPath: string | null'), 'server registry UI type must include rightFolderRootPath');
    assert.ok(publicTypesSource.includes('rightFolderRootPath: string | null'), 'public registry UI type must include rightFolderRootPath');
    assert.ok(registrySource.includes('rightFolderRootPath: null'), 'default registry UI must start without a persisted right root');
    assert.ok(registrySource.includes('readString(input["rightFolderRootPath"]) ?? fallback.rightFolderRootPath'), 'registry normalize must preserve or accept persisted root path');
});

test('dashboard view hydrates and patches the right FolderPanel root', () => {
    assert.ok(useDashboardViewSource.includes('const [rightFolderRootPath, setRightFolderRootPath]'), 'dashboard view hook must own right root state');
    assert.ok(dashboardSettingsSource.includes('rightFolderRootPath: view.rightFolderRootPath'), 'settings payload must serialize right root state');
    assert.ok(appSource.includes('view.setRightFolderRootPath(ui.rightFolderRootPath)'), 'registry initialize must hydrate right root');
    assert.ok(appSource.includes('if (ui.rightFolderRootPath !== undefined) view.setRightFolderRootPath(ui.rightFolderRootPath)'), 'settings patch handler must update live view state');
    assert.ok(sidebarSource.includes('props.onDashboardSettingsPatch({ rightFolderRootPath: path })'), 'right panel root changes must persist through settings patch');
});
