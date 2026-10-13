/**
 * 把扩展 ID 写进三份部署文件：`com.microsoft.Edge.plist`、`com.google.Chrome.plist`、`ccs.reg`。
 *
 * 为什么是生成而不是手写：扩展 ID 由 CRX 私钥（`keys/extension.pem`）决定，重建私钥就是换 ID。
 * ID 写死的旧做法在换 key 之后会静默失配——forcelist 指到一个不存在的扩展（装不上）、
 * allowlist 放行了别的 ID、ExtensionSettings 对真正安装的扩展不生效。
 * 本脚本从私钥推导 ID、从 `config.json` 的 `manifest.update_url` 取更新地址（与打包脚本同源，
 * 避免出现 `update.xml` / `updates.xml` 这类两处写法不一致的死链），一并生成三份文件。
 *
 * `pnpm crx:key` 与 `pnpm build:crx` 都会先跑本脚本；改完请重跑 `pnpm mobileconfig` 刷新描述文件。
 *
 * 注意：plist 的偏好域来自文件名（`mcxToProfile.py` 的 `getDomainFromPlist`），文件名是接口，不要改。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extensionIdFromPem } from './crx.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const keyPath = resolve(root, 'keys/extension.pem');
let pem;
try {
  pem = readFileSync(keyPath, 'utf8');
} catch {
  console.error(`Key file not found: ${keyPath}. Create it first with: pnpm crx:key`);
  process.exit(1);
}
const id = extensionIdFromPem(pem);

const config = JSON.parse(readFileSync(resolve(root, 'config.json'), 'utf8'));
const updateUrl = config?.manifest?.update_url;
if (typeof updateUrl !== 'string' || updateUrl === '') {
  console.error('config.json has no manifest.update_url; it is required for ExtensionInstallForcelist.');
  process.exit(1);
}

const banner = '本文件由 scripts/writePolicyFiles.mjs 生成（pnpm policy:write），扩展 ID 与更新地址自动同步，勿手改';

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- ${banner} -->
    <key>ExtensionInstallForcelist</key>
    <array>
        <!-- 格式：扩展ID;更新URL -->
        <string>${id};${updateUrl}</string>
    </array>
    <key>ExtensionInstallAllowlist</key>
    <array>
        <string>${id}</string>
    </array>
    <key>ExtensionSettings</key>
    <dict>
        <!-- 允许扩展导航（tabs.create/update）到 file:// URL；不影响详情页「允许访问文件 URL」开关 -->
        <key>${id}</key>
        <dict>
            <key>file_url_navigation_allowed</key>
            <true/>
        </dict>
    </dict>
</dict>
</plist>
`;

const reg = `Windows Registry Editor Version 5.00

; ${banner}
[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Google\\Chrome\\ExtensionInstallAllowlist]
"66"="${id}"

[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Edge\\ExtensionInstallAllowlist]
"66"="${id}"
`;

function writeIfChanged(name, content) {
  const path = resolve(root, name);
  let previous;
  try {
    previous = readFileSync(path, 'utf8');
  } catch {
    previous = undefined;
  }
  if (previous === content) {
    console.log(`${name}: unchanged`);
    return;
  }
  writeFileSync(path, content);
  console.log(`${name}: written`);
}

console.log(`Extension ID: ${id}`);
console.log(`Update URL  : ${updateUrl}`);
writeIfChanged('com.microsoft.Edge.plist', plist);
writeIfChanged('com.google.Chrome.plist', plist);
writeIfChanged('ccs.reg', reg);
