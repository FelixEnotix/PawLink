/**
 * Embed PawLink icon into the Windows .exe after pack.
 * Used because winCodeSign extraction may fail on machines without symlink privilege,
 * while we still need a branded .exe / desktop shortcut icon.
 */
const fs = require('node:fs');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  const iconPath = path.join(__dirname, '..', 'build', 'icon.ico');

  if (!fs.existsSync(exePath)) {
    console.warn(`[after-pack] exe not found: ${exePath}`);
    return;
  }
  if (!fs.existsSync(iconPath)) {
    console.warn(`[after-pack] icon not found: ${iconPath}`);
    return;
  }

  const { rcedit } = require('rcedit');
  await rcedit(exePath, {
    icon: iconPath,
    // TUN/Wintun needs admin; embed so Windows prompts UAC before process start.
    // (win.signAndEditExecutable=false skips electron-builder's own rcedit pass.)
    'requested-execution-level': 'requireAdministrator',
    'version-string': {
      ProductName: 'PawLink',
      FileDescription: 'PawLink',
      CompanyName: 'PawLink',
      LegalCopyright: 'Copyright © PawLink',
    },
  });
  console.log(`[after-pack] icon + requireAdministrator applied → ${exeName}`);
};
