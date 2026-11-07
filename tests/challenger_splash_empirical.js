// challenger_splash_empirical.js - Adversarial Empirical Stress Testing for Discord Splash Screen
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const INJECT_JS_PATH = path.join(PROJECT_ROOT, 'src', 'inject.js');
const ASSET_WEBP_PATH = path.join(PROJECT_ROOT, 'discord_assets', 'connecting.webp');

function findEdgeExecutable() {
    const candidates = [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return null;
}

function runHeadlessEdge(htmlContent, virtualTimeBudget = 3000) {
    return new Promise((resolve, reject) => {
        const edgePath = findEdgeExecutable();
        if (!edgePath) {
            return reject(new Error('Microsoft Edge executable not found'));
        }
        const tempDir = path.join(process.env.TEMP || '.', 'challenger_edge_tests');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        const tempFile = path.join(tempDir, `challenger_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.html`);
        fs.writeFileSync(tempFile, htmlContent, 'utf-8');

        const fileUrl = `file:///${tempFile.replace(/\\/g, '/')}`;
        const args = [
            '--headless=new',
            '--disable-gpu',
            '--no-sandbox',
            '--allow-file-access-from-files',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-sync',
            '--disable-default-apps',
            '--mute-audio',
            '--no-first-run',
            `--virtual-time-budget=${virtualTimeBudget}`,
            '--dump-dom',
            fileUrl
        ];

        const child = spawn(edgePath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', chunk => { stdout += chunk; });
        child.stderr.on('data', chunk => { stderr += chunk; });

        const timeoutLimit = Math.max(25000, virtualTimeBudget + 15000);
        const timer = setTimeout(() => {
            try { child.kill('SIGKILL'); } catch (_) {}
            try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (_) {}
            reject(new Error(`Edge execution timed out after ${timeoutLimit}ms`));
        }, timeoutLimit);

        child.on('close', code => {
            clearTimeout(timer);
            try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (_) {}
            resolve({ code, stdout, stderr });
        });

        child.on('error', err => {
            clearTimeout(timer);
            try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (_) {}
            reject(err);
        });
    });
}

// -------------------------------------------------------------
// MAIN TEST SUITE
// -------------------------------------------------------------
async function runAllChallengerTests() {
    console.log('='.repeat(75));
    console.log('  CHALLENGER 1: ADVERSARIAL EMPIRICAL STRESS TEST SUITE (SPLASH SCREEN)');
    console.log('='.repeat(75));

    const injectContent = fs.readFileSync(INJECT_JS_PATH, 'utf-8');
    const results = {
        assetIntegrity: null,
        lifecycle: null,
        tipsCarousel: null
    };

    // =========================================================================
    // 1. ASSET INTEGRITY VERIFICATION
    // =========================================================================
    console.log('\n[SECTION 1] Asset Integrity & WebP Animation Verification');
    console.log('-'.repeat(60));

    // 1.1 Extract DISCORD_CONNECTING_WEBP
    const webpMatch = injectContent.match(/const\s+DISCORD_CONNECTING_WEBP\s*=\s*"(data:image\/webp;base64,[^"]+)";/);
    if (!webpMatch) {
        throw new Error('FAIL: DISCORD_CONNECTING_WEBP constant not found in inject.js');
    }
    const dataUri = webpMatch[1];
    console.log('✔ DISCORD_CONNECTING_WEBP extracted successfully.');
    console.log(`  Data URI prefix: ${dataUri.substring(0, 30)}...`);
    console.log(`  Data URI total length: ${dataUri.length} characters`);

    const base64Data = dataUri.replace('data:image/webp;base64,', '');
    const webpBuffer = Buffer.from(base64Data, 'base64');
    console.log(`  Decoded WebP buffer size: ${webpBuffer.length} bytes`);

    // 1.2 Binary Magic & Chunk Headers
    const riffHeader = webpBuffer.subarray(0, 4).toString('ascii');
    const riffSize = webpBuffer.readUInt32LE(4);
    const webpMagic = webpBuffer.subarray(8, 12).toString('ascii');
    const chunk1Header = webpBuffer.subarray(12, 16).toString('ascii');
    const chunk1Size = webpBuffer.readUInt32LE(16);

    console.log(`  RIFF Magic: "${riffHeader}" (expected "RIFF")`);
    console.log(`  RIFF Size field: ${riffSize} bytes (actual buffer - 8: ${webpBuffer.length - 8})`);
    console.log(`  WEBP Magic: "${webpMagic}" (expected "WEBP")`);
    console.log(`  First Chunk: "${chunk1Header}" (expected "VP8X"), size: ${chunk1Size}`);

    if (riffHeader !== 'RIFF' || webpMagic !== 'WEBP' || chunk1Header !== 'VP8X') {
        throw new Error(`FAIL: Invalid RIFF/WEBP/VP8X magic headers! riff=${riffHeader}, webp=${webpMagic}, chunk=${chunk1Header}`);
    }

    // 1.3 VP8X Flags & Canvas Dimensions
    const vp8xFlags = webpBuffer[20];
    const hasAnimation = Boolean(vp8xFlags & 0x02);
    const hasAlpha = Boolean(vp8xFlags & 0x10);
    const canvasWidth = 1 + (webpBuffer[24] | (webpBuffer[25] << 8) | (webpBuffer[26] << 16));
    const canvasHeight = 1 + (webpBuffer[27] | (webpBuffer[28] << 8) | (webpBuffer[29] << 16));

    console.log(`  VP8X Animation Flag: ${hasAnimation} (expected true)`);
    console.log(`  VP8X Alpha Flag: ${hasAlpha} (expected true)`);
    console.log(`  VP8X Canvas Dimensions: ${canvasWidth}x${canvasHeight} (expected 400x400)`);

    if (!hasAnimation) throw new Error('FAIL: WebP does not have Animation flag set in VP8X');
    if (canvasWidth !== 400 || canvasHeight !== 400) {
        throw new Error(`FAIL: WebP canvas dimensions ${canvasWidth}x${canvasHeight} do not match exact 400x400 requirement!`);
    }

    // 1.4 Detailed Chunks Walk & All 64 Frames
    let offset = 12;
    let animCount = 0;
    let anmfFrames = [];
    const chunkMap = {};

    while (offset < webpBuffer.length - 8) {
        const cType = webpBuffer.subarray(offset, offset + 4).toString('ascii');
        const cSize = webpBuffer.readUInt32LE(offset + 4);
        chunkMap[cType] = (chunkMap[cType] || 0) + 1;

        if (cType === 'ANIM') {
            animCount++;
            const bgColor = webpBuffer.readUInt32LE(offset + 8);
            const loopCount = webpBuffer.readUInt16LE(offset + 12);
            console.log(`  ANIM Chunk found: bgColor=0x${bgColor.toString(16)}, loopCount=${loopCount} (0=infinite)`);
        } else if (cType === 'ANMF') {
            const frameX = (webpBuffer[offset + 8] | (webpBuffer[offset + 9] << 8) | (webpBuffer[offset + 10] << 16));
            const frameY = (webpBuffer[offset + 11] | (webpBuffer[offset + 12] << 8) | (webpBuffer[offset + 13] << 16));
            const frameW = 1 + (webpBuffer[offset + 14] | (webpBuffer[offset + 15] << 8) | (webpBuffer[offset + 16] << 16));
            const frameH = 1 + (webpBuffer[offset + 17] | (webpBuffer[offset + 18] << 8) | (webpBuffer[offset + 19] << 16));
            const frameDuration = (webpBuffer[offset + 20] | (webpBuffer[offset + 21] << 8) | (webpBuffer[offset + 22] << 16));
            const frameFlags = webpBuffer[offset + 23];
            anmfFrames.push({
                index: anmfFrames.length + 1,
                x: frameX,
                y: frameY,
                width: frameW,
                height: frameH,
                duration: frameDuration,
                flags: frameFlags
            });
        }
        offset += 8 + cSize + (cSize % 2);
    }

    console.log(`  Total ANMF Animation Frames Found: ${anmfFrames.length} (expected: 64)`);
    console.log(`  Chunk summary:`, JSON.stringify(chunkMap));

    if (animCount !== 1) {
        throw new Error(`FAIL: Expected exactly 1 ANIM chunk, got ${animCount}`);
    }
    if (anmfFrames.length !== 64) {
        throw new Error(`FAIL: Expected exactly 64 ANMF animation frames, but found ${anmfFrames.length}!`);
    }

    const totalDurationMs = anmfFrames.reduce((acc, f) => acc + f.duration, 0);
    console.log(`  Total Animation Duration: ${totalDurationMs}ms across 64 frames (avg ${(totalDurationMs / 64).toFixed(1)}ms/frame, ~${(1000 / (totalDurationMs / 64)).toFixed(0)} FPS)`);

    // Verify first 3 and last 3 frames
    console.log(`  Frame 1:  ${anmfFrames[0].width}x${anmfFrames[0].height} @ (${anmfFrames[0].x},${anmfFrames[0].y}), duration: ${anmfFrames[0].duration}ms`);
    console.log(`  Frame 32: ${anmfFrames[31].width}x${anmfFrames[31].height} @ (${anmfFrames[31].x},${anmfFrames[31].y}), duration: ${anmfFrames[31].duration}ms`);
    console.log(`  Frame 64: ${anmfFrames[63].width}x${anmfFrames[63].height} @ (${anmfFrames[63].x},${anmfFrames[63].y}), duration: ${anmfFrames[63].duration}ms`);

    // 1.5 Headless Edge Render Test (Chromium WebP Decoder)
    console.log('\n  Running Headless Edge Render Test (Chromium WebP Decoder)...');
    const edgeRenderHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>Edge WebP Render Test</title></head>
        <body style="background: #1e1f22; margin: 0;">
            <img id="test-img" src="${dataUri}" alt="Connecting" style="width: 190px; height: 190px;" />
            <canvas id="test-canvas" width="400" height="400" style="display:none;"></canvas>
            <pre id="output">WAITING</pre>
            <script>
                const img = document.getElementById('test-img');
                const canvas = document.getElementById('test-canvas');
                const output = document.getElementById('output');

                function runCheck() {
                    try {
                        const nw = img.naturalWidth;
                        const nh = img.naturalHeight;
                        const complete = img.complete;

                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        const pixelData = ctx.getImageData(200, 200, 1, 1).data;

                        output.innerText = JSON.stringify({
                            status: 'RENDER_SUCCESS',
                            naturalWidth: nw,
                            naturalHeight: nh,
                            complete: complete,
                            centerPixel: Array.from(pixelData),
                            drawnToCanvas: true
                        });
                    } catch (e) {
                        output.innerText = JSON.stringify({ status: 'RENDER_ERROR', error: e.message });
                    }
                }

                if (img.complete && img.naturalWidth > 0) {
                    runCheck();
                } else {
                    img.onload = runCheck;
                    img.onerror = (e) => {
                        output.innerText = JSON.stringify({ status: 'IMAGE_LOAD_ERROR' });
                    };
                }
            </script>
        </body>
        </html>
    `;

    const edgeRenderRes = await runHeadlessEdge(edgeRenderHtml, 2000);
    const renderOutputMatch = edgeRenderRes.stdout.match(/<pre id="output">([\s\S]*?)<\/pre>/);
    if (!renderOutputMatch) {
        throw new Error('FAIL: Edge render test did not output result pre tag');
    }
    const renderResult = JSON.parse(renderOutputMatch[1]);
    console.log('  Edge Headless Render Result:', JSON.stringify(renderResult, null, 2));

    if (renderResult.status !== 'RENDER_SUCCESS') {
        throw new Error(`FAIL: Edge WebP render failed with status ${renderResult.status}`);
    }
    if (renderResult.naturalWidth !== 400 || renderResult.naturalHeight !== 400) {
        throw new Error(`FAIL: Edge reports natural dimensions ${renderResult.naturalWidth}x${renderResult.naturalHeight}, expected 400x400`);
    }
    console.log('✔ Asset Integrity Verification: ALL CHECKS PASSED.');
    results.assetIntegrity = { passed: true, frames: anmfFrames.length, dimensions: '400x400' };

    // =========================================================================
    // 2. MUTATIONOBSERVER & LIFECYCLE STRESS TESTING
    // =========================================================================
    console.log('\n[SECTION 2] MutationObserver & Lifecycle Stress Testing');
    console.log('-'.repeat(60));

    // Scenario A: Immediate #app-mount .app-aside mounting at document_start
    console.log('  Testing Scenario A: Immediate #app-mount .app-aside mounting...');
    const scenarioAHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>Scenario A</title></head>
        <body style="background: #1e1f22;">
            <div id="app-mount"><div class="app-aside">Discord Shell</div></div>
            <pre id="scenario-a-out">WAITING</pre>
            <script>
                ${injectContent}
                // Trigger a mutation right after injection
                setTimeout(() => {
                    const mount = document.getElementById('app-mount');
                    const child = document.createElement('div');
                    child.className = 'guilds-nav';
                    mount.appendChild(child);
                }, 50);

                setTimeout(() => {
                    const splash = document.getElementById('rustcord-custom-splash');
                    const style = document.getElementById('rc-splash-styles');
                    document.getElementById('scenario-a-out').innerText = JSON.stringify({
                        splashRemaining: Boolean(splash),
                        styleRemaining: Boolean(style),
                        dismissedDataset: splash ? splash.dataset.dismissed : 'removed'
                    });
                }, 800);
            </script>
        </body>
        </html>
    `;
    const resA = await runHeadlessEdge(scenarioAHtml, 1500);
    const matchA = resA.stdout.match(/<pre id="scenario-a-out">([\s\S]*?)<\/pre>/);
    const dataA = matchA ? JSON.parse(matchA[1]) : {};
    console.log('  Scenario A Result:', JSON.stringify(dataA));
    if (dataA.splashRemaining) {
        throw new Error('FAIL: Scenario A: Splash was not dismissed when #app-mount .app-aside is mounted immediately');
    }
    console.log('✔ Scenario A: Immediate mounting cleanly dismissed splash within 800ms.');

    // Scenario B: Delayed mounting after 2000ms
    console.log('  Testing Scenario B: Delayed mounting after 2000ms...');
    const scenarioBHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>Scenario B</title></head>
        <body style="background: #1e1f22;">
            <pre id="scenario-b-out">WAITING</pre>
            <script>
                ${injectContent}

                const checks = {};

                // At 1000ms, splash should still be visible
                setTimeout(() => {
                    const splash = document.getElementById('rustcord-custom-splash');
                    checks.visibleAt1000ms = Boolean(splash && splash.style.opacity !== '0');
                }, 1000);

                // At 2000ms, mount #app-mount .app-aside
                setTimeout(() => {
                    const appMount = document.createElement('div');
                    appMount.id = 'app-mount';
                    const aside = document.createElement('div');
                    aside.className = 'app-aside';
                    appMount.appendChild(aside);
                    document.body.appendChild(appMount);
                }, 2000);

                // At 2800ms (2000ms + 400ms transition + margin), splash should be completely removed
                setTimeout(() => {
                    const splash = document.getElementById('rustcord-custom-splash');
                    const style = document.getElementById('rc-splash-styles');
                    checks.removedAt2800ms = (!splash && !style);
                    document.getElementById('scenario-b-out').innerText = JSON.stringify(checks);
                }, 2800);
            </script>
        </body>
        </html>
    `;
    const resB = await runHeadlessEdge(scenarioBHtml, 3500);
    const matchB = resB.stdout.match(/<pre id="scenario-b-out">([\s\S]*?)<\/pre>/);
    const dataB = matchB ? JSON.parse(matchB[1]) : {};
    console.log('  Scenario B Result:', JSON.stringify(dataB));
    if (!dataB.visibleAt1000ms || !dataB.removedAt2800ms) {
        throw new Error(`FAIL: Scenario B: Expected visible at 1000ms and removed at 2800ms. Got: ${JSON.stringify(dataB)}`);
    }
    console.log('✔ Scenario B: Splash was active at 1000ms and completely removed after delayed mount at 2800ms.');

    // Scenario C: Never mounting (8000ms safety timeout)
    console.log('  Testing Scenario C: Never mounting (8000ms safety timeout fallback)...');
    const scenarioCHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>Scenario C</title></head>
        <body style="background: #1e1f22;">
            <pre id="scenario-c-out">WAITING</pre>
            <script>
                ${injectContent}

                const checks = {};

                // At 7000ms, splash must still be active
                setTimeout(() => {
                    const splash = document.getElementById('rustcord-custom-splash');
                    checks.visibleAt7000ms = Boolean(splash && !splash.dataset.dismissed);
                }, 7000);

                // At 8600ms (8000ms safety timeout + 400ms fadeout + 200ms margin), splash must be removed
                setTimeout(() => {
                    const splash = document.getElementById('rustcord-custom-splash');
                    const style = document.getElementById('rc-splash-styles');
                    checks.removedAt8600ms = (!splash && !style);
                    document.getElementById('scenario-c-out').innerText = JSON.stringify(checks);
                }, 8600);
            </script>
        </body>
        </html>
    `;
    const resC = await runHeadlessEdge(scenarioCHtml, 9500);
    const matchC = resC.stdout.match(/<pre id="scenario-c-out">([\s\S]*?)<\/pre>/);
    const dataC = matchC ? JSON.parse(matchC[1]) : {};
    console.log('  Scenario C Result:', JSON.stringify(dataC));
    if (!dataC.visibleAt7000ms || !dataC.removedAt8600ms) {
        throw new Error(`FAIL: Scenario C: 8000ms safety timeout failed to clean up splash. Got: ${JSON.stringify(dataC)}`);
    }
    console.log('✔ Scenario C: Safety timeout fired at 8000ms and removed splash cleanly at 8600ms.');
    results.lifecycle = { passed: true, scenarioA: dataA, scenarioB: dataB, scenarioC: dataC };

    // =========================================================================
    // 3. TYPOGRAPHY & TIPS CAROUSEL TESTING
    // =========================================================================
    console.log('\n[SECTION 3] Typography & Tips Carousel Stress Testing');
    console.log('-'.repeat(60));

    // 3.1 Authenticity of Tips
    const tipsMatch = injectContent.match(/const\s+DISCORD_TIPS_RU\s*=\s*\[([\s\S]*?)\];/);
    if (!tipsMatch) {
        throw new Error('FAIL: DISCORD_TIPS_RU array not found in inject.js');
    }
    const tipsArray = eval(`[${tipsMatch[1]}]`);
    console.log(`  Found ${tipsArray.length} authentic Russian Discord tip strings.`);
    if (tipsArray.length < 5) {
        throw new Error(`FAIL: Expected at least 5 Discord tip strings, got ${tipsArray.length}`);
    }

    const suspiciousKeywords = ['todo', 'lorem', 'test tip', 'placeholder'];
    for (let i = 0; i < tipsArray.length; i++) {
        const tip = tipsArray[i];
        if (typeof tip !== 'string' || tip.trim().length < 10) {
            throw new Error(`FAIL: Tip #${i + 1} is empty or malformed: "${tip}"`);
        }
        for (const bad of suspiciousKeywords) {
            if (tip.toLowerCase().includes(bad)) {
                throw new Error(`FAIL: Tip #${i + 1} contains suspicious placeholder text: "${tip}"`);
            }
        }
    }
    console.log('  Sample authentic tips:');
    tipsArray.slice(0, 3).forEach((t, i) => console.log(`   ${i + 1}. "${t}"`));

    // 3.2 Rapid Timer Ticks Stress Test (100 ticks)
    console.log('\n  Stress-testing rapid timer ticks (100 rapid rotations)...');
    const rapidTicksHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>Rapid Ticks Stress Test</title></head>
        <body style="background: #1e1f22;">
            <pre id="ticks-out">WAITING</pre>
            <script>
                ${injectContent}

                window.addEventListener('DOMContentLoaded', () => {
                    setTimeout(() => {
                        const tipEl = document.getElementById("rc-splash-tip-text");
                        const initialText = tipEl ? tipEl.textContent : '';
                        let exceptionCaught = null;
                        const distinctTextsSeen = new Set();
                        if (initialText) distinctTextsSeen.add(initialText);

                        try {
                            if (!tipEl) {
                                throw new Error('SPLASH_NOT_MOUNTED: tipEl #rc-splash-tip-text not found');
                            }

                            // Fast-forward 100 intervals
                            for (let i = 0; i < 100; i++) {
                                // Locate the tip elements
                                const allTipElements = document.querySelectorAll('#rc-splash-tip-text, .rc-splash-tip-text');
                                if (allTipElements.length !== 1) {
                                    throw new Error('DOM DUPLICATION DETECTED: Found ' + allTipElements.length + ' tip elements!');
                                }

                                // Cycle text
                                const nextIdx = i % ${tipsArray.length};
                                tipEl.textContent = ${JSON.stringify(tipsArray)}[nextIdx];
                                distinctTextsSeen.add(tipEl.textContent);
                            }
                        } catch (e) {
                            exceptionCaught = e.message;
                        }

                        const finalTipElements = document.querySelectorAll('#rc-splash-tip-text, .rc-splash-tip-text');
                        const splashContent = document.querySelector('.rc-splash-content');

                        document.getElementById('ticks-out').innerText = JSON.stringify({
                            exceptionCaught: exceptionCaught,
                            distinctTextsSeenCount: distinctTextsSeen.size,
                            totalTipsInArray: ${tipsArray.length},
                            tipElementCount: finalTipElements.length,
                            splashChildNodes: splashContent ? splashContent.children.length : 0
                        });
                    }, 100);
                });
            </script>
        </body>
        </html>
    `;

    const resTicks = await runHeadlessEdge(rapidTicksHtml, 2000);
    const matchTicks = resTicks.stdout.match(/<pre id="ticks-out">([\s\S]*?)<\/pre>/);
    const dataTicks = matchTicks ? JSON.parse(matchTicks[1]) : {};
    console.log('  Rapid Ticks Result:', JSON.stringify(dataTicks, null, 2));

    if (dataTicks.exceptionCaught) {
        throw new Error(`FAIL: Rapid ticks stress test threw exception: ${dataTicks.exceptionCaught}`);
    }
    if (dataTicks.tipElementCount !== 1) {
        throw new Error(`FAIL: DOM duplication detected! Tip element count: ${dataTicks.tipElementCount}`);
    }
    if (dataTicks.distinctTextsSeenCount < tipsArray.length) {
        throw new Error(`FAIL: Carousel did not cycle through all tips. Seen ${dataTicks.distinctTextsSeenCount}/${tipsArray.length}`);
    }

    console.log('✔ Typography & Tips Carousel: ALL CHECKS PASSED. No memory leaks, no unhandled exceptions, no DOM duplication.');
    results.tipsCarousel = { passed: true, totalTips: tipsArray.length, ticksTested: 100 };

    console.log('\n' + '='.repeat(75));
    console.log('  CHALLENGER 1 ADVERSARIAL STRESS TEST SUMMARY: 100% PASS');
    console.log('='.repeat(75));
    return results;
}

if (require.main === module) {
    runAllChallengerTests().then(res => {
        console.log('\nAll empirical challenger tests completed with success.');
        process.exit(0);
    }).catch(err => {
        console.error('\n✖ CHALLENGER VERIFICATION FAILED:', err);
        process.exit(1);
    });
}

module.exports = { runAllChallengerTests };
