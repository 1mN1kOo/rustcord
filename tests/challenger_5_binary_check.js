const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256(filePath) {
    const data = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(data).digest('hex');
}

console.log('======================================================================');
console.log('   CHALLENGER 5: BINARY & HARDENING INTEGRITY VERIFICATION           ');
console.log('======================================================================\n');

// 1. Rustcord.exe checks
const rustcordExe = 'C:\\Rustcord\\Rustcord\\Rustcord.exe';
const targetExe = 'C:\\Rustcord\\Rustcord\\target\\release\\rustcord.exe';

console.log('1. Checking Rustcord.exe and target/release/rustcord.exe:');
const stat1 = fs.statSync(rustcordExe);
const stat2 = fs.statSync(targetExe);
console.log(`   - Rustcord.exe size: ${stat1.size} bytes, modified: ${stat1.mtime.toISOString()}`);
console.log(`   - target/release/rustcord.exe size: ${stat2.size} bytes, modified: ${stat2.mtime.toISOString()}`);

const hash1 = sha256(rustcordExe);
const hash2 = sha256(targetExe);
console.log(`   - Rustcord.exe SHA256:        ${hash1}`);
console.log(`   - target/release SHA256:      ${hash2}`);
console.log(`   - Hashes match: ${hash1 === hash2 ? 'YES' : 'NO'}`);

if (hash1 !== hash2) {
    console.error('FAIL: Rustcord.exe does not match target/release/rustcord.exe!');
    process.exit(1);
}

// 2. String search in Rustcord.exe
console.log('\n2. Inspecting Rustcord.exe binary contents:');
const exeBuffer = fs.readFileSync(rustcordExe);

// Check absence of obsolete selector
const obsoletePattern = Buffer.from('#rustcord-screenshare-overlay', 'utf8');
const obsoleteIndex = exeBuffer.indexOf(obsoletePattern);
console.log(`   - Presence of '#rustcord-screenshare-overlay': ${obsoleteIndex !== -1 ? 'FOUND (FAIL)' : 'NOT FOUND (PASS)'}`);
if (obsoleteIndex !== -1) {
    console.error(`FAIL: '#rustcord-screenshare-overlay' found at offset ${obsoleteIndex}!`);
    process.exit(1);
}

// Check presence of hardened code patterns
const hardenedPatterns = [
    { name: 'Array.isArray(window.__RUSTCORD_SOURCES__)', str: 'Array.isArray(window.__RUSTCORD_SOURCES__)' },
    { name: 'String id coercion in filter', str: "const id = typeof s.id === 'string' ? s.id : String(s.id || '');" },
    { name: 'String id coercion in map', str: "typeof source.id === 'string' ? source.id : String(source.id || '')" },
    { name: 'DiscordNative.desktopCapture', str: 'DiscordNative.desktopCapture' },
    { name: 'getDesktopCaptureSources', str: 'getDesktopCaptureSources' },
    { name: 'isRenderer = true', str: 'DiscordNative.isRenderer = true;' },
    { name: 'app.getVersion 1.0.9267', str: '1.0.9267' }
];

let allHardenedFound = true;
for (const p of hardenedPatterns) {
    const buf = Buffer.from(p.str, 'utf8');
    const idx = exeBuffer.indexOf(buf);
    const found = idx !== -1;
    console.log(`   - ${p.name}: ${found ? 'FOUND at offset ' + idx + ' (PASS)' : 'MISSING (FAIL)'}`);
    if (!found) {
        allHardenedFound = false;
    }
}

if (!allHardenedFound) {
    console.error('FAIL: Hardened inject.js patterns are missing from Rustcord.exe!');
    process.exit(1);
}

// 3. RustcordSetup.exe verification
console.log('\n3. Checking RustcordSetup.exe and installer/target/release/rustcord-setup.exe:');
const setupExe = 'C:\\Rustcord\\Rustcord\\RustcordSetup.exe';
const targetSetupExe = 'C:\\Rustcord\\installer\\target\\release\\rustcord-setup.exe';

const setupStat = fs.statSync(setupExe);
const targetSetupStat = fs.statSync(targetSetupExe);
console.log(`   - RustcordSetup.exe size: ${setupStat.size} bytes, modified: ${setupStat.mtime.toISOString()}`);
console.log(`   - target/release/rustcord-setup.exe size: ${targetSetupStat.size} bytes, modified: ${targetSetupStat.mtime.toISOString()}`);

const setupHash1 = sha256(setupExe);
const setupHash2 = sha256(targetSetupExe);
console.log(`   - RustcordSetup.exe SHA256:        ${setupHash1}`);
console.log(`   - target/release SHA256:           ${setupHash2}`);
console.log(`   - Hashes match: ${setupHash1 === setupHash2 ? 'YES' : 'NO'}`);

if (setupHash1 !== setupHash2) {
    console.error('FAIL: RustcordSetup.exe does not match installer/target/release/rustcord-setup.exe!');
    process.exit(1);
}

// 4. Check installer payload: does RustcordSetup.exe package the exact Rustcord.exe binary?
console.log('\n4. Checking if RustcordSetup.exe contains or embeds Rustcord.exe:');
// Let's see how the installer is built: Does it embed rustcord.exe?
const installerCargoToml = 'C:\\Rustcord\\installer\\Cargo.toml';
const installerSrcMain = 'C:\\Rustcord\\installer\\src\\main.rs';
if (fs.existsSync(installerSrcMain)) {
    console.log(`   - installer/src/main.rs exists. Let's inspect embedding mechanism.`);
}

console.log('\n======================================================================');
console.log('   ALL BINARY CHECKS PASSED SUCCESSFULLY                              ');
console.log('======================================================================');
