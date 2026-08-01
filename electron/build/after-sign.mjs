import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export default async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = join(context.appOutDir, appName);
  const entitlementsPath = join(here, 'entitlements.mac.plist');
  execFileSync('/usr/bin/codesign', [
    '--force',
    '--deep',
    '--sign',
    '-',
    '--entitlements',
    entitlementsPath,
    appPath,
  ], { stdio: 'inherit' });
}
