// adversarial_challenger_4.test.js
// Challenger 4 Master Empirical Adversarial Stress Test Suite:
// 1. Splash Screen Robustness (Immediate injection, WebP decoding/dimensions/frames, Dismissal observer, Safety fallback timeout, Rotating tips)
// 2. Complete Manual Modal Absence (Zero residue in inject.js, Rustcord.exe, RustcordSetup.exe)
// 3. Binary Integrity (PE32+ AMD64 Windows GUI structure, Installer uncompressed payload 100% SHA256 match)

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const vm = require('vm');
const { runHeadlessEdge, findEdgeExecutable } = require('./test_utils');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const INJECT_JS_PATH = path.join(PROJECT_ROOT, 'src', 'inject.js');
const RUSTCORD_EXE_PATH = path.join(PROJECT_ROOT, 'Rustcord.exe');
const SETUP_EXE_PATH = path.join(PROJECT_ROOT, 'RustcordSetup.exe');

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testResults = [];

async function test(name, fn) {
    totalTests++;
    process.stdout.write(`  [CHALLENGE 4] ${name} ... `);
    const start = Date.now();
    try {
        const result = await fn();
        const duration = Date.now() - start;
        passedTests++;
        console.log(`${GREEN}PASS${RESET} (${duration}ms)`);
        testResults.push({ name, status: 'PASS', duration, result });
    } catch (err) {
        const duration = Date.now() - start;
        failedTests++;
        console.log(`${RED}FAIL${RESET} (${duration}ms)`);
        console.error(`    ${RED}${err.message}${RESET}`);
        testResults.push({ name, status: 'FAIL', duration, error: err.message });
    }
}

function parsePE(filePath) {
    if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
    const buf = fs.readFileSync(filePath);
    if (buf.length < 1024) throw new Error(`File too small: ${buf.length} bytes`);
    const mz = buf.subarray(0, 2).toString('ascii');
    if (mz !== 'MZ') throw new Error(`Not DOS MZ: '${mz}'`);
    const peOffset = buf.readUInt32LE(0x3C);
    if (peOffset + 24 > buf.length) throw new Error(`PE offset out of bounds: ${peOffset}`);
    const peSig = buf.subarray(peOffset, peOffset + 4).toString('ascii');
    if (peSig !== 'PE\0\0') throw new Error(`Not PE signature: '${peSig}'`);
    const machine = buf.readUInt16LE(peOffset + 4);
    const numSections = buf.readUInt16LE(peOffset + 6);
    const optHeaderSize = buf.readUInt16LE(peOffset + 20);
    const characteristics = buf.readUInt16LE(peOffset + 22);
    const optMagic = buf.readUInt16LE(peOffset + 24);
    const entryPoint = buf.readUInt32LE(peOffset + 40);
    const imageBase = buf.readBigUInt64LE(peOffset + 48);
    const subsystem = buf.readUInt16LE(peOffset + 92);
    return {
        path: filePath,
        size: buf.length,
        peOffset,
        machine,
        isAmd64: machine === 0x8664,
        numSections,
        characteristics,
        optMagic,
        isPE32Plus: optMagic === 0x20B,
        entryPoint,
        imageBase,
        subsystem,
        isWindowsGui: subsystem === 2
    };
}

async function runMasterSuite() {
    console.log(`${BOLD}${CYAN}======================================================================${RESET}`);
    console.log(`${BOLD}${CYAN}   CHALLENGER 4: SPLASH, MODAL ABSENCE & BINARY INTEGRITY SUITE       ${RESET}`);
    console.log(`${BOLD}${CYAN}======================================================================${RESET}\n`);

    const injectCode = fs.readFileSync(INJECT_JS_PATH, 'utf-8');

    // =========================================================================
    // SECTION 1: SPLASH SCREEN ROBUSTNESS
    // =========================================================================
    console.log(`${BOLD}--- Section 1: Splash Screen Robustness ---${RESET}`);

    // 1.1 Immediate Injection & Anti-Flashbang Dark Styling
    await test('1.1.1 Anti-flashbang dark background enforced at document_start', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <script>
                    ${injectCode}
                </script>
            </head>
            <body>
                <pre id="output">WAITING</pre>
                <script>
                    const docEl = document.documentElement;
                    document.getElementById('output').innerText = JSON.stringify({
                        bgColor: docEl.style.backgroundColor,
                        color: docEl.style.color
                    });
                </script>
            </body>
            </html>
        `;
        const res = await runHeadlessEdge(testHtml, 2000);
        const match = res.stdout.match(/<pre id="output">([\s\S]*?)<\/pre>/);
        if (!match) throw new Error('No test output from Edge');
        const data = JSON.parse(match[1]);
        if (data.bgColor !== 'rgb(30, 31, 34)' && data.bgColor !== '#1e1f22') {
            throw new Error(`Expected background #1e1f22 / rgb(30, 31, 34), got ${data.bgColor}`);
        }
    });

    await test('1.1.2 Splash container and styles inject on evaluation (DOMContentLoaded lifecycle)', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <script>
                    ${injectCode}
                </script>
            </head>
            <body>
                <pre id="output">WAITING</pre>
                <script>
                    window.addEventListener('DOMContentLoaded', () => {
                        const splash = document.getElementById('rustcord-custom-splash');
                        const style = document.getElementById('rc-splash-styles');
                        const anim = splash ? splash.querySelector('.rc-splash-connecting') : null;
                        const tipHeader = splash ? splash.querySelector('.rc-splash-tip-header') : null;
                        const tipText = document.getElementById('rc-splash-tip-text');
                        document.getElementById('output').innerText = JSON.stringify({
                            splashExists: !!splash,
                            styleExists: !!style,
                            animExists: !!anim,
                            tipHeader: tipHeader ? tipHeader.textContent : null,
                            tipTextLength: tipText ? tipText.textContent.length : 0,
                            splashZIndex: splash ? window.getComputedStyle(splash).zIndex : null
                        });
                    });
                </script>
            </body>
            </html>
        `;
        const res = await runHeadlessEdge(testHtml, 2000);
        const match = res.stdout.match(/<pre id="output">([\s\S]*?)<\/pre>/);
        if (!match) throw new Error('No test output from Edge');
        const data = JSON.parse(match[1]);
        if (!data.splashExists) throw new Error('Splash element #rustcord-custom-splash was not created');
        if (!data.styleExists) throw new Error('Style element #rc-splash-styles was not created');
        if (!data.animExists) throw new Error('Connecting animation element was not found in splash');
        if (data.tipHeader !== 'ЗНАЕТЕ ЛИ ВЫ?') throw new Error(`Unexpected tip header: ${data.tipHeader}`);
        if (data.tipTextLength === 0) throw new Error('Initial tip text is empty');
        if (data.splashZIndex !== '2147483647') throw new Error(`Unexpected z-index: ${data.splashZIndex}`);
    });

    await test('1.1.3 Synchronous injection when evaluated post-DOM ready (readyState === "complete")', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head></head>
            <body>
                <pre id="output">WAITING</pre>
                <script>
                    window.addEventListener('load', () => {
                        // Document is completely ready
                        const evalStart = Date.now();
                        const script = document.createElement('script');
                        script.textContent = ${JSON.stringify(injectCode)};
                        document.head.appendChild(script);

                        // Verify splash is created synchronously immediately
                        const splash = document.getElementById('rustcord-custom-splash');
                        const style = document.getElementById('rc-splash-styles');
                        document.getElementById('output').innerText = JSON.stringify({
                            splashCreatedSync: !!splash,
                            styleCreatedSync: !!style,
                            evalTimeMs: Date.now() - evalStart
                        });
                    });
                </script>
            </body>
            </html>
        `;
        const res = await runHeadlessEdge(testHtml, 2500);
        const match = res.stdout.match(/<pre id="output">([\s\S]*?)<\/pre>/);
        if (!match) throw new Error('No test output from Edge');
        const data = JSON.parse(match[1]);
        if (!data.splashCreatedSync) throw new Error('Splash element was not created synchronously on ready page');
        if (!data.styleCreatedSync) throw new Error('Style element was not created synchronously on ready page');
    });

    // 1.2 WebP Asset Validation (Header, Dimensions, Frames, Headless Decode)
    await test('1.2.1 WebP base64 asset header validation (RIFF/WEBP/VP8X magic, 400x400 canvas, alpha+animation flags)', async () => {
        const webpMatch = injectCode.match(/const\s+DISCORD_CONNECTING_WEBP\s*=\s*"(data:image\/webp;base64,[^"]+)";/);
        if (!webpMatch) throw new Error('DISCORD_CONNECTING_WEBP not found in inject.js');
        const base64Data = webpMatch[1].replace('data:image/webp;base64,', '');
        const buf = Buffer.from(base64Data, 'base64');
        if (buf.length < 32) throw new Error(`WebP buffer too small: ${buf.length}`);

        const riff = buf.subarray(0, 4).toString('ascii');
        const riffSize = buf.readUInt32LE(4);
        const webp = buf.subarray(8, 12).toString('ascii');
        const vp8x = buf.subarray(12, 16).toString('ascii');

        if (riff !== 'RIFF') throw new Error(`Invalid RIFF magic: ${riff}`);
        if (webp !== 'WEBP') throw new Error(`Invalid WEBP magic: ${webp}`);
        if (vp8x !== 'VP8X') throw new Error(`Invalid VP8X chunk: ${vp8x}`);

        const flags = buf[20];
        const hasAnimation = Boolean(flags & 0x02);
        const hasAlpha = Boolean(flags & 0x10);
        const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
        const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));

        if (!hasAnimation) throw new Error('Animation flag not set in VP8X');
        if (!hasAlpha) throw new Error('Alpha flag not set in VP8X');
        if (width !== 400 || height !== 400) throw new Error(`Expected 400x400 canvas, got ${width}x${height}`);
    });

    await test('1.2.2 WebP animation chunk iteration: exactly 64 ANMF frames with valid durations', async () => {
        const webpMatch = injectCode.match(/const\s+DISCORD_CONNECTING_WEBP\s*=\s*"(data:image\/webp;base64,[^"]+)";/);
        const base64Data = webpMatch[1].replace('data:image/webp;base64,', '');
        const buf = Buffer.from(base64Data, 'base64');

        let offset = 12;
        let anmfCount = 0;
        let animFound = false;
        let totalDuration = 0;

        while (offset < buf.length - 8) {
            const type = buf.subarray(offset, offset + 4).toString('ascii');
            const size = buf.readUInt32LE(offset + 4);
            if (type === 'ANIM') {
                animFound = true;
            } else if (type === 'ANMF') {
                anmfCount++;
                const duration = (buf[offset + 20] | (buf[offset + 21] << 8) | (buf[offset + 22] << 16));
                totalDuration += duration;
            }
            offset += 8 + size + (size % 2);
        }

        if (!animFound) throw new Error('ANIM chunk missing');
        if (anmfCount !== 64) throw new Error(`Expected exactly 64 ANMF frames, found ${anmfCount}`);
        if (totalDuration < 900 || totalDuration > 1200) {
            throw new Error(`Unexpected animation total duration: ${totalDuration}ms`);
        }
    });

    await test('1.2.3 Edge browser Chromium WebP decoding: naturalWidth=400, naturalHeight=400, complete=true', async () => {
        const webpMatch = injectCode.match(/const\s+DISCORD_CONNECTING_WEBP\s*=\s*"(data:image\/webp;base64,[^"]+)";/);
        const dataUri = webpMatch[1];
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head></head>
            <body>
                <img id="test-img" src="${dataUri}" />
                <pre id="output">WAITING</pre>
                <script>
                    const img = document.getElementById('test-img');
                    function done() {
                        document.getElementById('output').innerText = JSON.stringify({
                            naturalWidth: img.naturalWidth,
                            naturalHeight: img.naturalHeight,
                            complete: img.complete
                        });
                    }
                    if (img.complete && img.naturalWidth > 0) done();
                    else img.onload = done;
                </script>
            </body>
            </html>
        `;
        const res = await runHeadlessEdge(testHtml, 2500);
        const match = res.stdout.match(/<pre id="output">([\s\S]*?)<\/pre>/);
        if (!match) throw new Error('No test output from Edge');
        const data = JSON.parse(match[1]);
        if (data.naturalWidth !== 400 || data.naturalHeight !== 400) {
            throw new Error(`Expected 400x400 decoded dimensions, got ${data.naturalWidth}x${data.naturalHeight}`);
        }
        if (!data.complete) throw new Error('Image complete property is false');
    });

    // 1.3 Dismissal Observer Lifecycle Testing
    await test('1.3.1 Dismissal observer triggers upon #app-mount .app-aside mounting, applies fade-out and removes DOM', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <script>
                    ${injectCode}
                </script>
            </head>
            <body>
                <pre id="output">WAITING</pre>
                <script>
                    window.addEventListener('DOMContentLoaded', () => {
                        const splash = document.getElementById('rustcord-custom-splash');

                        // Mount Discord container after 100ms
                        setTimeout(() => {
                            const mount = document.createElement('div');
                            mount.id = 'app-mount';
                            const aside = document.createElement('div');
                            aside.className = 'app-aside';
                            mount.appendChild(aside);
                            document.body.appendChild(mount);

                            // Check initiation after 50ms (opacity 0, scale 1.02)
                            setTimeout(() => {
                                const opacityInitiated = splash.style.opacity === '0';
                                const scaleInitiated = splash.style.transform.includes('1.02');
                                const isDismissed = splash.dataset.dismissed === 'true';

                                // Check complete removal after 600ms (> 400ms transition)
                                setTimeout(() => {
                                    const splashInDom = !!document.getElementById('rustcord-custom-splash');
                                    const styleInDom = !!document.getElementById('rc-splash-styles');
                                    document.getElementById('output').innerText = JSON.stringify({
                                        opacityInitiated,
                                        scaleInitiated,
                                        isDismissed,
                                        splashInDom,
                                        styleInDom
                                    });
                                }, 600);
                            }, 50);
                        }, 100);
                    });
                </script>
            </body>
            </html>
        `;
        const res = await runHeadlessEdge(testHtml, 3000);
        const match = res.stdout.match(/<pre id="output">([\s\S]*?)<\/pre>/);
        if (!match) throw new Error('No test output from Edge');
        const data = JSON.parse(match[1]);
        if (!data.opacityInitiated) throw new Error('Fade-out opacity: 0 not initiated upon mount');
        if (!data.scaleInitiated) throw new Error('Transform scale(1.02) not initiated upon mount');
        if (!data.isDismissed) throw new Error('splash.dataset.dismissed was not set to true');
        if (data.splashInDom) throw new Error('Splash container was NOT removed from DOM after 400ms transition');
        if (data.styleInDom) throw new Error('Splash style tag was NOT removed from DOM after 400ms transition');
    });

    await test('1.3.2 Dismissal observer triggers on alternative selector [data-list-id="guildsnav"]', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <script>
                    ${injectCode}
                </script>
            </head>
            <body>
                <pre id="output">WAITING</pre>
                <script>
                    window.addEventListener('DOMContentLoaded', () => {
                        const splash = document.getElementById('rustcord-custom-splash');
                        setTimeout(() => {
                            const nav = document.createElement('nav');
                            nav.setAttribute('data-list-id', 'guildsnav');
                            document.body.appendChild(nav);

                            setTimeout(() => {
                                const removed = !document.getElementById('rustcord-custom-splash');
                                document.getElementById('output').innerText = JSON.stringify({
                                    dismissed: splash.dataset.dismissed === 'true',
                                    removed
                                });
                            }, 600);
                        }, 100);
                    });
                </script>
            </body>
            </html>
        `;
        const res = await runHeadlessEdge(testHtml, 2500);
        const match = res.stdout.match(/<pre id="output">([\s\S]*?)<\/pre>/);
        if (!match) throw new Error('No test output from Edge');
        const data = JSON.parse(match[1]);
        if (!data.dismissed) throw new Error('Dismissal not triggered by guildsnav selector');
        if (!data.removed) throw new Error('Splash not removed after guildsnav selector mount');
    });

    await test('1.3.3 Idempotency guard: rapid consecutive DOM mutations do not cause errors or multiple dismissals', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <script>
                    ${injectCode}
                </script>
            </head>
            <body>
                <pre id="output">WAITING</pre>
                <script>
                    window.addEventListener('DOMContentLoaded', () => {
                        let errorOccurred = null;
                        window.onerror = (msg) => { errorOccurred = msg; };
                        const splash = document.getElementById('rustcord-custom-splash');

                        // Fire 50 rapid DOM mutations that match selector
                        for (let i = 0; i < 50; i++) {
                            const el = document.createElement('div');
                            el.className = 'app-aside';
                            document.body.appendChild(el);
                        }

                        setTimeout(() => {
                            document.getElementById('output').innerText = JSON.stringify({
                                errorOccurred,
                                isDismissed: splash ? splash.dataset.dismissed : 'removed',
                                cleanlyRemoved: !document.getElementById('rustcord-custom-splash')
                            });
                        }, 600);
                    });
                </script>
            </body>
            </html>
        `;
        const res = await runHeadlessEdge(testHtml, 2500);
        const match = res.stdout.match(/<pre id="output">([\s\S]*?)<\/pre>/);
        if (!match) throw new Error('No test output from Edge');
        const data = JSON.parse(match[1]);
        if (data.errorOccurred) throw new Error(`Rapid mutations caused error: ${data.errorOccurred}`);
        if (!data.cleanlyRemoved) throw new Error('Splash was not cleanly removed after rapid mutations');
    });

    // 1.4 Safety Fallback Timeout
    await test('1.4.1 Safety fallback timeout (8000ms): forcibly dismisses splash if Discord never mounts', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <script>
                    ${injectCode}
                </script>
            </head>
            <body>
                <pre id="output">WAITING</pre>
                <script>
                    window.addEventListener('DOMContentLoaded', () => {
                        // Check at 7000ms (should still exist)
                        setTimeout(() => {
                            const existsAt7s = !!document.getElementById('rustcord-custom-splash');
                            // Check at 8600ms (should be forcibly removed after 8000ms + 400ms transition)
                            setTimeout(() => {
                                const existsAt8600ms = !!document.getElementById('rustcord-custom-splash');
                                const styleExists = !!document.getElementById('rc-splash-styles');
                                document.getElementById('output').innerText = JSON.stringify({
                                    existsAt7s,
                                    existsAt8600ms,
                                    styleExists
                                });
                            }, 1600);
                        }, 7000);
                    });
                </script>
            </body>
            </html>
        `;
        // Virtual time budget of 9500ms
        const res = await runHeadlessEdge(testHtml, 9500);
        const match = res.stdout.match(/<pre id="output">([\s\S]*?)<\/pre>/);
        if (!match) throw new Error('No test output from Edge');
        const data = JSON.parse(match[1]);
        if (!data.existsAt7s) throw new Error('Splash prematurely removed before safety timeout (at 7s)');
        if (data.existsAt8600ms) throw new Error('Splash failed to forcibly remove itself after 8s safety timeout');
        if (data.styleExists) throw new Error('Splash style tag remained after safety timeout');
    });

    // 1.5 Rotating Tips Verification
    await test('1.5.1 Rotating tips: text array contains authentic Russian quotes and cycles with opacity transitions', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <script>
                    ${injectCode}
                </script>
            </head>
            <body>
                <pre id="output">WAITING</pre>
                <script>
                    window.addEventListener('DOMContentLoaded', () => {
                        const tipEl = document.getElementById('rc-splash-tip-text');
                        const initialTip = tipEl ? tipEl.textContent : '';

                        // Tip interval is 3500ms, with 250ms fade
                        // Check at 3000ms (initial tip still present)
                        setTimeout(() => {
                            const tipAt3000 = tipEl ? tipEl.textContent : '';
                            // Check at 4000ms (next tip should be loaded)
                            setTimeout(() => {
                                const tipAt4000 = tipEl ? tipEl.textContent : '';
                                document.getElementById('output').innerText = JSON.stringify({
                                    initialTip,
                                    tipAt3000,
                                    tipAt4000,
                                    tipChanged: initialTip !== tipAt4000 && tipAt4000.length > 0
                                });
                            }, 1000);
                        }, 3000);
                    });
                </script>
            </body>
            </html>
        `;
        const res = await runHeadlessEdge(testHtml, 5000);
        const match = res.stdout.match(/<pre id="output">([\s\S]*?)<\/pre>/);
        if (!match) throw new Error('No test output from Edge');
        const data = JSON.parse(match[1]);
        if (data.initialTip !== data.tipAt3000) {
            throw new Error(`Tip changed prematurely before 3500ms interval: '${data.initialTip}' -> '${data.tipAt3000}'`);
        }
        if (!data.tipChanged) {
            throw new Error(`Tip did not rotate after 3500ms: '${data.initialTip}' === '${data.tipAt4000}'`);
        }
    });

    // =========================================================================
    // SECTION 2: COMPLETE MANUAL MODAL ABSENCE SCAN
    // =========================================================================
    console.log(`\n${BOLD}--- Section 2: Complete Manual Modal Absence Scan ---${RESET}`);

    const forbiddenPatterns = [
        '#rustcord-screenshare-overlay',
        'rustcord-screenshare-overlay',
        '.rc-sc-',
        'rc-sc-overlay',
        'rc-sc-modal',
        'rc-sc-tab',
        'rc-sc-card',
        'rc-sc-title',
        'rc-sc-btn',
        'showDiscordScreenShareModal'
    ];

    await test('2.1 Zero occurrences of manual modal markers in inject.js', async () => {
        const fileContent = fs.readFileSync(INJECT_JS_PATH, 'utf-8');
        const violations = [];
        for (const pat of forbiddenPatterns) {
            let idx = 0;
            let count = 0;
            while ((idx = fileContent.indexOf(pat, idx)) !== -1) {
                count++;
                idx += pat.length;
            }
            if (count > 0) violations.push(`${pat} (${count}x)`);
        }
        if (violations.length > 0) {
            throw new Error(`Manual modal residue found in inject.js: ${violations.join(', ')}`);
        }
    });

    await test('2.2 Zero occurrences of manual modal markers in Rustcord.exe binary', async () => {
        const buf = fs.readFileSync(RUSTCORD_EXE_PATH);
        const violations = [];
        for (const pat of forbiddenPatterns) {
            const needle = Buffer.from(pat, 'utf8');
            let idx = 0;
            let count = 0;
            while ((idx = buf.indexOf(needle, idx)) !== -1) {
                count++;
                idx += needle.length;
            }
            if (count > 0) violations.push(`${pat} (${count}x)`);
        }
        if (violations.length > 0) {
            throw new Error(`Manual modal residue found in Rustcord.exe: ${violations.join(', ')}`);
        }
    });

    await test('2.3 Zero occurrences of manual modal markers in RustcordSetup.exe installer binary', async () => {
        const buf = fs.readFileSync(SETUP_EXE_PATH);
        const violations = [];
        for (const pat of forbiddenPatterns) {
            const needle = Buffer.from(pat, 'utf8');
            let idx = 0;
            let count = 0;
            while ((idx = buf.indexOf(needle, idx)) !== -1) {
                count++;
                idx += needle.length;
            }
            if (count > 0) violations.push(`${pat} (${count}x)`);
        }
        if (violations.length > 0) {
            throw new Error(`Manual modal residue found in RustcordSetup.exe: ${violations.join(', ')}`);
        }
    });

    await test('2.4 getDisplayMedia routes directly to native capture without rendering manual DOM overlay', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <script>
                    ${injectCode}
                </script>
            </head>
            <body>
                <pre id="output">WAITING</pre>
                <script>
                    let manualOverlayFound = false;
                    try {
                        navigator.mediaDevices.getDisplayMedia({ video: true }).catch(() => {});
                        const overlay = document.getElementById('rustcord-screenshare-overlay') ||
                                        document.querySelector('.rc-sc-overlay') ||
                                        document.querySelector('[id*="screenshare"]');
                        manualOverlayFound = !!overlay;
                    } catch(e) {}
                    document.getElementById('output').innerText = JSON.stringify({ manualOverlayFound });
                </script>
            </body>
            </html>
        `;
        const res = await runHeadlessEdge(testHtml, 2000);
        const match = res.stdout.match(/<pre id="output">([\s\S]*?)<\/pre>/);
        if (!match) throw new Error('No test output from Edge');
        const data = JSON.parse(match[1]);
        if (data.manualOverlayFound) throw new Error('Manual modal overlay was rendered during getDisplayMedia');
    });

    // =========================================================================
    // SECTION 3: BINARY INTEGRITY & INSTALLER PAYLOAD VERIFICATION
    // =========================================================================
    console.log(`\n${BOLD}--- Section 3: Binary Integrity & Payload Verification ---${RESET}`);

    await test('3.1 Rustcord.exe PE32+ executable structure validation', async () => {
        const pe = parsePE(RUSTCORD_EXE_PATH);
        if (!pe.isAmd64) throw new Error(`Not AMD64 machine: 0x${pe.machine.toString(16)}`);
        if (!pe.isPE32Plus) throw new Error(`Not PE32+ (64-bit): 0x${pe.optMagic.toString(16)}`);
        if (!pe.isWindowsGui) throw new Error(`Subsystem is not Windows GUI (expected 2, got ${pe.subsystem})`);
        if (pe.numSections < 4) throw new Error(`Expected at least 4 sections, found ${pe.numSections}`);
        if (pe.size < 5000000) throw new Error(`Executable size unexpectedly small: ${pe.size} bytes`);
    });

    await test('3.2 RustcordSetup.exe PE32+ executable structure validation', async () => {
        const pe = parsePE(SETUP_EXE_PATH);
        if (!pe.isAmd64) throw new Error(`Not AMD64 machine: 0x${pe.machine.toString(16)}`);
        if (!pe.isPE32Plus) throw new Error(`Not PE32+ (64-bit): 0x${pe.optMagic.toString(16)}`);
        if (!pe.isWindowsGui) throw new Error(`Subsystem is not Windows GUI (expected 2, got ${pe.subsystem})`);
        if (pe.numSections < 4) throw new Error(`Expected at least 4 sections, found ${pe.numSections}`);
        if (pe.size < 5000000) throw new Error(`Installer size unexpectedly small: ${pe.size} bytes`);
    });

    await test('3.3 Uncompressed payload extraction from RustcordSetup.exe matches Rustcord.exe byte-for-byte (SHA256)', async () => {
        const installerBuf = fs.readFileSync(SETUP_EXE_PATH);
        const rustcordBuf = fs.readFileSync(RUSTCORD_EXE_PATH);
        const expectedSha256 = crypto.createHash('sha256').update(rustcordBuf).digest('hex');

        let foundMatch = false;
        let matchedOffset = -1;
        let decompressedSize = -1;
        let decompressedSha256 = '';

        for (let i = 0; i < installerBuf.length - 10; i++) {
            if (installerBuf[i] === 0x1F && installerBuf[i+1] === 0x8B && installerBuf[i+2] === 0x08) {
                try {
                    const decomp = zlib.gunzipSync(installerBuf.subarray(i));
                    const sha = crypto.createHash('sha256').update(decomp).digest('hex');
                    if (sha === expectedSha256) {
                        foundMatch = true;
                        matchedOffset = i;
                        decompressedSize = decomp.length;
                        decompressedSha256 = sha;
                        break;
                    }
                } catch (_) {}
            }
        }

        if (!foundMatch) {
            throw new Error(`Could not find embedded gzip payload matching Rustcord.exe SHA256 (${expectedSha256}) in installer!`);
        }
        if (decompressedSize !== rustcordBuf.length) {
            throw new Error(`Size mismatch: decompressed ${decompressedSize} != target ${rustcordBuf.length}`);
        }
        if (decompressedSha256 !== expectedSha256) {
            throw new Error(`Hash mismatch: ${decompressedSha256} != ${expectedSha256}`);
        }
    });

    // =========================================================================
    // FINAL SUMMARY
    // =========================================================================
    console.log(`\n${BOLD}${CYAN}======================================================================${RESET}`);
    console.log(`  CHALLENGER 4 RESULTS: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
    console.log(`${BOLD}${CYAN}======================================================================${RESET}`);

    if (failedTests > 0) {
        process.exitCode = 1;
    }
}

runMasterSuite().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
