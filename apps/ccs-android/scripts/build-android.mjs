import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const pkgDir = resolve(import.meta.dirname, '..');
const repoRoot = process.env.CCS_REPO_ROOT ? resolve(process.env.CCS_REPO_ROOT) : resolve(pkgDir, '../..');

loadEnvFile(join(repoRoot, '.env'));

// 1. Ensure web build exists
const webDistDir = join(repoRoot, 'dist', 'web');
if (!existsSync(join(webDistDir, 'index.html'))) {
  console.error('Web build not found at dist/web/. Run "pnpm ccs build web" first.');
  process.exit(1);
}

// 2. Detect Android SDK and JDK
const androidSdk = detectAndroidSdk();
const javaHome = detectJavaHome();
const prepareOnly = process.env.CCS_ANDROID_PREPARE_ONLY === '1' || process.argv.includes('--prepare-only');

const missingPrereqs = [];
if (!androidSdk) missingPrereqs.push('android-sdk');
if (!javaHome) missingPrereqs.push('jdk');

if (missingPrereqs.length > 0) {
  console.warn('');
  console.warn('========================================');
  console.warn('  Missing prerequisites for APK build:');
  console.warn(`  ${missingPrereqs.join(', ')}`);
  console.warn('========================================');
  if (missingPrereqs.includes('android-sdk')) {
    console.warn('  Android SDK: Set ANDROID_HOME to Google Android SDK root');
    console.warn('    (NOT DCloud offline SDK — a valid SDK has platform-tools/, build-tools/, platforms/)');
  }
  if (missingPrereqs.includes('jdk')) {
    console.warn('  JDK: Set JAVA_HOME to JDK 21 installation directory');
  }
  console.warn('  Will proceed with cap copy/sync only. Install prerequisites and re-run for APK.');
  console.warn('');
}

const appId = getFirstEnv('CCS_ANDROID_APPLICATION_ID', 'ANDROID_APPLICATION_ID') ?? 'com.huawei.ccps';
const appName = getFirstEnv('CCS_ANDROID_APP_NAME', 'ANDROID_APP_NAME') ?? '基建-云解决方案';

// 4. Generate capacitor.config.json from environment
const capConfig = {
  appId,
  appName,
  webDir: '../../dist/web',
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
    allowNavigation: ['localhost'],
    cleartext: true
  }
};
writeFileSync(join(pkgDir, 'capacitor.config.json'), JSON.stringify(capConfig, null, 2));

// 5. Ensure Android project exists
const androidDir = join(pkgDir, 'android');
if (!existsSync(androidDir)) {
  console.log('Initializing Capacitor Android project...');
  const initResult = spawnSync('npx', ['cap', 'add', 'android'], {
    cwd: pkgDir,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (initResult.status !== 0) process.exit(initResult.status ?? 1);
}

// 6. Write local.properties
if (androidSdk) {
  writeFileSync(join(androidDir, 'local.properties'), `sdk.dir=${androidSdk.replace(/\\/g, '\\\\')}\n`);
}

// 7. Handle signing configuration
if (androidSdk) writeSigningConfig(androidDir);

// 8. Capacitor copy + sync
console.log('Copying web assets to Android project...');
const copyResult = spawnSync('npx', ['cap', 'copy', 'android'], {
  cwd: pkgDir,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});
if (copyResult.status !== 0) process.exit(copyResult.status ?? 1);

const syncResult = spawnSync('npx', ['cap', 'sync', 'android'], {
  cwd: pkgDir,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});
if (syncResult.status !== 0) process.exit(syncResult.status ?? 1);

if (prepareOnly || missingPrereqs.length > 0) {
  console.log('');
  console.log('Android project prepared successfully (web assets copied).');
  if (missingPrereqs.length > 0) {
    console.log(`To build the APK, install: ${missingPrereqs.join(', ')} and re-run.`);
  } else {
    console.log('Set ANDROID_HOME and JAVA_HOME to JDK 21 and re-run to build the APK.');
  }
  process.exit(0);
}

// 9. Gradle build
// Use debug build when no keystore is configured (debug APK is auto-signed with SDK debug key)
// Use release build when keystore is configured (release APK is signed with user's key)
const hasKeystore = !!getFirstEnv('CCS_ANDROID_KEYSTORE_FILE', 'ANDROID_KEYSTORE_FILE');
const buildType = hasKeystore ? 'assembleRelease' : 'assembleDebug';
const buildVariant = hasKeystore ? 'release' : 'debug';

console.log(`Building Android APK (${buildVariant})...`);
const gradleCmd = process.platform === 'win32' ? join(androidDir, 'gradlew.bat') : join(androidDir, 'gradlew');

if (process.platform === 'win32') {
  // On Windows, use cmd.exe inline set to ensure JAVA_HOME propagates to gradlew
  const gradleResult = spawnSync(`set "JAVA_HOME=${javaHome}" && set "ANDROID_HOME=${androidSdk}" && set "ANDROID_SDK_ROOT=${androidSdk}" && "${gradleCmd}" clean ${buildType}`, [], {
    cwd: androidDir,
    stdio: 'inherit',
    shell: true
  });
  if (gradleResult.status !== 0) process.exit(gradleResult.status ?? 1);
} else {
  const gradleResult = spawnSync(gradleCmd, ['clean', buildType], {
    cwd: androidDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      ANDROID_HOME: androidSdk,
      ANDROID_SDK_ROOT: androidSdk,
      JAVA_HOME: javaHome
    }
  });
  if (gradleResult.status !== 0) process.exit(gradleResult.status ?? 1);
}

// 10. Collect APK
const outDir = join(repoRoot, 'dist', 'android');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const apkDir = join(androidDir, 'app', 'build', 'outputs', 'apk');
const apkFiles = findFiles(apkDir, (f) => {
  if (!f.endsWith('.apk') || f.includes('unaligned')) return false;
  // Only pick APKs matching the current build variant
  if (buildVariant === 'debug') return f.includes('debug');
  return f.includes('release');
});

if (apkFiles.length === 0) {
  console.error('No APK found after build.');
  process.exit(1);
}

for (const apk of apkFiles) {
  const outName = hasKeystore ? 'ccps-release.apk' : 'ccps-debug.apk';
  copyFileSync(apk, join(outDir, outName));
}

writeFileSync(
  join(outDir, 'manifest.json'),
  JSON.stringify(
    {
      name: 'ccs-android',
      target: 'android',
      buildVariant,
      generatedAt: new Date().toISOString()
    },
    null,
    2
  )
);

if (!hasKeystore) {
  console.log('');
  console.log('Note: Debug APK built with SDK debug key. For production, configure keystore:');
  console.log('  CCS_ANDROID_KEYSTORE_FILE=path/to/keystore.jks');
  console.log('  CCS_ANDROID_KEYSTORE_ALIAS=key-alias');
  console.log('  CCS_ANDROID_KEYSTORE_PASSWORD=password');
}

console.log(`APK output: ${outDir}`);

// --- Helpers ---

function detectAndroidSdk() {
  // 1. Check environment variables
  const fromEnv = getFirstEnv('CCS_ANDROID_SDK', 'ANDROID_HOME', 'ANDROID_SDK_ROOT', 'ANDROID_SDK');
  if (fromEnv && isRealAndroidSdk(fromEnv)) return resolve(fromEnv);

  // 2. Check common Windows locations
  const home = homedir();
  const candidates = [join(home, 'AppData', 'Local', 'Android', 'Sdk'), join(home, 'AppData', 'Local', 'Android', 'android-sdk'), 'C:\\Android\\Sdk', 'D:\\Android\\Sdk', join(home, 'Android', 'Sdk')];

  for (const candidate of candidates) {
    if (isRealAndroidSdk(candidate)) return resolve(candidate);
  }

  // 3. Try to find via adb (if on PATH)
  const whichResult = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['adb'], {
    stdio: 'pipe',
    shell: process.platform === 'win32'
  });
  if (whichResult.status === 0 && whichResult.stdout) {
    const adbPath = whichResult.stdout.toString().trim().split(/\r?\n/)[0];
    const sdkFromAdb = resolve(adbPath, '..', '..');
    if (isRealAndroidSdk(sdkFromAdb)) return resolve(sdkFromAdb);
  }

  return undefined;
}

function isRealAndroidSdk(dir) {
  if (!existsSync(dir)) return false;
  // A real Google Android SDK must have at least one of these directories
  return existsSync(join(dir, 'platform-tools')) || existsSync(join(dir, 'build-tools')) || existsSync(join(dir, 'platforms'));
}

function detectJavaHome() {
  if (process.platform === 'darwin') {
    const javaHome21 = spawnSync('/usr/libexec/java_home', ['-v', '21'], { stdio: 'pipe' });
    if (javaHome21.status === 0 && javaHome21.stdout) {
      const jdkPath = javaHome21.stdout.toString().trim();
      if (isJdkDir(jdkPath)) return resolve(jdkPath);
    }
  }

  const fromEnv = getFirstEnv('JAVA_HOME', 'JDK_HOME');
  if (fromEnv && isJdkDir(fromEnv)) return resolve(fromEnv);

  const foundJdks = [];

  // 2. Check common Windows locations
  const home = homedir();
  const candidates = [
    'C:\\Program Files\\Eclipse Adoptium',
    'C:\\Program Files\\AdoptOpenJDK',
    'C:\\Program Files\\Java',
    'C:\\Program Files\\BellSoft',
    'C:\\Program Files\\Zulu',
    'C:\\Program Files\\Microsoft\\jdk-*',
    join(home, '.jdks')
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    // Search one level deeper for the actual JDK home
    for (const entry of readdirSync(candidate)) {
      const jdkPath = join(candidate, entry);
      if (isJdkDir(jdkPath)) foundJdks.push(jdkPath);
    }
  }

  // 3. Try to find via java command (if on PATH)
  const whichResult = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['java'], {
    stdio: 'pipe',
    shell: process.platform === 'win32'
  });
  if (whichResult.status === 0 && whichResult.stdout) {
    const javaPath = whichResult.stdout.toString().trim().split(/\r?\n/)[0];
    // java.exe is typically at <jdk>/bin/java.exe
    const jdkFromJava = resolve(javaPath, '..', '..');
    if (isJdkDir(jdkFromJava) && !foundJdks.includes(jdkFromJava)) {
      foundJdks.push(jdkFromJava);
    }
  }

  if (foundJdks.length === 0) return undefined;

  // Prefer JDK 21+ (required by AGP 8.13+), then fall back to the first found JDK
  const javaExe = process.platform === 'win32' ? 'bin\\java.exe' : 'bin/java';
  for (const jdk of foundJdks) {
    const javaBin = join(jdk, javaExe);
    if (!existsSync(javaBin)) continue;
    const verResult = spawnSync(javaBin, ['-version'], { stdio: 'pipe' });
    // java -version writes to stderr
    const verOutput = (verResult.stdout?.toString() ?? '') + (verResult.stderr?.toString() ?? '');
    const verMatch = verOutput.match(/version\s+"(\d+)/);
    if (verMatch && parseInt(verMatch[1], 10) >= 21) {
      return resolve(jdk);
    }
  }

  // Fallback: log a warning and use the first available JDK
  console.warn(`Warning: No JDK 21+ found among detected JDKs. Using ${foundJdks[0]}. Build may fail.`);
  return resolve(foundJdks[0]);
}

function isJdkDir(dir) {
  if (!existsSync(dir)) return false;
  // A JDK must have bin/java (or bin/java.exe on Windows)
  const javaExe = process.platform === 'win32' ? 'java.exe' : 'java';
  return existsSync(join(dir, 'bin', javaExe));
}

function writeSigningConfig(androidDir) {
  const keystoreFile = getFirstEnv('CCS_ANDROID_KEYSTORE_FILE', 'ANDROID_KEYSTORE_FILE');
  if (!keystoreFile) return;

  const keystoreAlias = getFirstEnv('CCS_ANDROID_KEYSTORE_ALIAS', 'ANDROID_KEYSTORE_ALIAS');
  const keystorePassword = getFirstEnv('CCS_ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEYSTORE_PASSWORD');
  const keyPassword = getFirstEnv('CCS_ANDROID_KEY_PASSWORD', 'ANDROID_KEY_PASSWORD') ?? keystorePassword;

  if (!keystoreAlias || !keystorePassword) {
    console.error('Keystore alias and password are required when keystore file is set.');
    process.exit(1);
  }

  const signingProps = [`storeFile=${resolve(keystoreFile).replace(/\\/g, '/')}`, `storePassword=${keystorePassword}`, `keyAlias=${keystoreAlias}`, `keyPassword=${keyPassword}`].join('\n') + '\n';

  writeFileSync(join(androidDir, 'keystore.properties'), signingProps);

  // Patch build.gradle to read signing config
  const buildGradlePath = join(androidDir, 'app', 'build.gradle');
  if (existsSync(buildGradlePath) && !readFile(buildGradlePath).includes('keystoreProperties')) {
    const gradle = readFile(buildGradlePath);
    const signingBlock = `
// CCS signing config (auto-generated)
def keystorePropertiesFile = rootProject.file("keystore.properties")
if (keystorePropertiesFile.exists()) {
    def keystoreProperties = new Properties()
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
    android.signingConfigs {
        ccsRelease {
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
            storeFile file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
        }
    }
    android.buildTypes.release.signingConfig android.signingConfigs.ccsRelease
}
`;
    const insertPoint = gradle.lastIndexOf('\n}');
    if (insertPoint > 0) {
      writeFileSync(buildGradlePath, gradle.slice(0, insertPoint) + signingBlock + gradle.slice(insertPoint));
    }
  }
}

function findFiles(dir, predicate, results = []) {
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const file = join(dir, entry);
    if (statSync(file).isDirectory()) findFiles(file, predicate, results);
    else if (predicate(file)) results.push(file);
  }
  return results;
}

function getFirstEnv(...names) {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  return undefined;
}

function readFile(path) {
  return readFileSync(path, 'utf-8');
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}
