// Patches the android/ project that `npx expo prebuild` just generated so
// `gradlew assembleRelease` produces an APK signed with the EAS keystore —
// the same signature as the APKs EAS built, so it installs OVER them and the
// save (a file inside the app's data) survives. Run by
// .github/workflows/build-apk.yml; never touches the repo's own files.
//
//   node scripts/ci/prepare-android-release.js <versionCode> <abis>
//
// The keystore path and passwords are read by Gradle from the environment
// (ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS,
// ANDROID_KEY_PASSWORD), so nothing secret is written to disk here.
const fs = require('fs');
const path = require('path');

const [versionCode, abis] = process.argv.slice(2);
if (!/^\d+$/.test(versionCode || '')) throw new Error(`versionCode inválido: ${versionCode}`);

const root = path.join(__dirname, '..', '..', 'android');
const gradleFile = path.join(root, 'app', 'build.gradle');
let gradle = fs.readFileSync(gradleFile, 'utf8');

const replaceOnce = (label, from, to) => {
    const next = gradle.replace(from, to);
    if (next === gradle) throw new Error(`Não achei ${label} em android/app/build.gradle — o template do prebuild mudou?`);
    gradle = next;
};

// 1. A release signing config next to the template's debug one.
replaceOnce('signingConfigs {', /signingConfigs \{\n/, `signingConfigs {
        release {
            storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))
            storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
            keyAlias System.getenv('ANDROID_KEY_ALIAS')
            keyPassword System.getenv('ANDROID_KEY_PASSWORD')
        }
`);

// 2. The release build type signs with it (the template signs with debug).
replaceOnce(
    'a assinatura do build release',
    /(buildTypes \{[\s\S]*?release \{[\s\S]*?)signingConfig signingConfigs\.debug/,
    '$1signingConfig signingConfigs.release',
);

// 3. versionCode: Android refuses an update with a lower one than installed.
replaceOnce('versionCode', /versionCode \d+/, `versionCode ${versionCode}`);

fs.writeFileSync(gradleFile, gradle);

// 4. Only the ABIs asked for (arm64-v8a alone halves the build and the APK).
if (abis) {
    const propsFile = path.join(root, 'gradle.properties');
    let props = fs.readFileSync(propsFile, 'utf8');
    if (!/^reactNativeArchitectures=.*$/m.test(props)) throw new Error('reactNativeArchitectures não encontrado em gradle.properties');
    props = props.replace(/^reactNativeArchitectures=.*$/m, `reactNativeArchitectures=${abis}`);
    // The template's 2 GB heap runs out on a release build of this app.
    props = props.replace(/^org\.gradle\.jvmargs=.*$/m, 'org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m');
    fs.writeFileSync(propsFile, props);
}

console.log(`android/ pronto: assinatura release, versionCode ${versionCode}, ABIs ${abis || '(padrão)'}`);
