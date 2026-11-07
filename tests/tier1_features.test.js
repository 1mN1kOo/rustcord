// tier1_features.test.js - Comprehensive Feature Coverage (F1 to F16)
const path = require('path');
const fs = require('fs');
const {
    readInjectJs,
    parseWebpHeader,
    verifyPEHeader,
    runHeadlessEdge,
    createDOMSimulation,
    RELEASE_EXE_PATH,
    ROOT_EXE_PATH,
    INSTALLER_SETUP_PATH,
    TestReporter
} = require('./test_utils');

async function runTier1(options = {}) {
    const reporter = new TestReporter('Tier 1: Feature Coverage (F1-F16)', options);
    let injectCode = '';
    try {
        injectCode = readInjectJs();
    } catch (e) {
        console.error('Failed to read inject.js:', e);
    }

    // ==========================================
    // Suite: Splash Screen Loader & Assets (F1-F6)
    // ==========================================
    reporter.suite('Splash Screen & Assets');

    await reporter.test('F1: Discard Orbit Loader (.rc-splash-orbit, .rc-splash-pulse, .rc-loader-dot removed)', () => {
        reporter.assertNotMatch(injectCode, /\.rc-splash-orbit\b/, 'Obsolete orbit loader class (.rc-splash-orbit) must be removed');
        reporter.assertNotMatch(injectCode, /\.rc-splash-pulse\b/, 'Obsolete pulse loader class (.rc-splash-pulse) must be removed');
        reporter.assertNotMatch(injectCode, /\.rc-loader-dot\b/, 'Obsolete loader dots (.rc-loader-dot) must be removed');
        reporter.assertNotMatch(injectCode, /@keyframes\s+rcOrbit\b/, 'rcOrbit keyframe animation must be removed');
        reporter.assertNotMatch(injectCode, /@keyframes\s+rcPulse\b/, 'rcPulse keyframe animation must be removed');
        reporter.assertNotMatch(injectCode, /@keyframes\s+rcDotBounce\b/, 'rcDotBounce keyframe animation must be removed');
    });

    await reporter.test('F2: Official connecting.webp Asset Embedded as Valid Base64 URI (400x400, 64 frames)', async () => {
        const match = injectCode.match(/data:image\/webp;base64,([A-Za-z0-9+/=]+)/);
        reporter.assert(Boolean(match), 'inject.js must contain a base64 data URI for connecting.webp (data:image/webp;base64,...)');
        
        const base64Data = match[1];
        reporter.assert(base64Data.length > 50000, `Base64 string too small (${base64Data.length} chars) - expected ~412 KB`);
        
        const webpBuf = Buffer.from(base64Data, 'base64');
        const parsed = parseWebpHeader(webpBuf);
        reporter.assert(parsed.valid, `WebP header must be valid: ${parsed.error}`);
        reporter.assertEqual(parsed.width, 400, 'WebP canvas width must be exactly 400px');
        reporter.assertEqual(parsed.height, 400, 'WebP canvas height must be exactly 400px');
        reporter.assert(parsed.hasAnimation, 'WebP VP8X flags must indicate animated image');
        reporter.assertEqual(parsed.frameCount, 64, 'WebP animation must contain exactly 64 ANMF frames');

        // Verify in Headless Edge WebView2 runtime
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>WebP Asset Verification</title></head>
            <body>
                <img id="test-webp" src="data:image/webp;base64,${base64Data}" />
                <div id="result">WAITING</div>
                <script>
                    const img = document.getElementById('test-webp');
                    img.onload = () => {
                        document.getElementById('result').innerText = 'LOADED:' + img.naturalWidth + 'x' + img.naturalHeight;
                    };
                    img.onerror = () => {
                        document.getElementById('result').innerText = 'ERROR';
                    };
                </script>
            </body>
            </html>
        `;
        const res = await runHeadlessEdge(testHtml, 2000);
        reporter.assertMatch(res.stdout, /LOADED:400x400/, 'Edge WebView2 must render connecting.webp with natural dimensions 400x400');
    });

    await reporter.test('F3: Splash Styling (Background #1e1f22, Centered, Width 180px-200px)', () => {
        reporter.assertMatch(injectCode, /#1e1f22/i, 'Splash styling must specify Discord background color #1e1f22');
        reporter.assertMatch(
            injectCode,
            /(?:align-items:\s*center|justify-content:\s*center)/i,
            'Splash container must use flex/grid centering'
        );
        reporter.assertMatch(
            injectCode,
            /(?:180px|185px|190px|192px|195px|200px)/,
            'Connecting spinner must display with width between 180px and 200px'
        );
    });

    await reporter.test('F4: Typography Stack (gg sans, Noto Sans, Helvetica Neue, Helvetica, Arial, sans-serif)', () => {
        reporter.assertMatch(injectCode, /gg\s*sans/i, 'Font stack must include "gg sans"');
        reporter.assertMatch(injectCode, /Noto\s*Sans/i, 'Font stack must include "Noto Sans"');
        reporter.assertMatch(injectCode, /Helvetica\s*Neue/i, 'Font stack must include "Helvetica Neue"');
        reporter.assertMatch(injectCode, /sans-serif/i, 'Font stack must include generic sans-serif fallback');
    });

    await reporter.test('F5: Russian Tip Quotes Carousel ("Знаете ли вы...")', () => {
        reporter.assertMatch(injectCode, /Знаете ли вы/i, 'Must contain authentic Discord Russian tips ("Знаете ли вы...")');
        reporter.assertMatch(injectCode, /rc-splash-tip|rc-splash-status/i, 'Must have tip container element or class');
        reporter.assertMatch(injectCode, /setInterval|setTimeout/, 'Must feature rotating carousel mechanism');
    });

    await reporter.test('F6: MutationObserver on #app-mount, .app-aside with Smooth Fade-Out', () => {
        reporter.assertMatch(injectCode, /MutationObserver/, 'Must instantiate MutationObserver for Discord app load detection');
        reporter.assertMatch(injectCode, /#app-mount|\.app-aside|guildsnav|channels_/i, 'Observer must detect #app-mount, .app-aside, or guild navigation');
        reporter.assertMatch(injectCode, /scale\(1\.02\)/, 'Dismissal animation must trigger scale(1.02) zoom effect');
        reporter.assertMatch(injectCode, /opacity\s*:\s*0|opacity\s*=\s*["']0["']/, 'Dismissal must transition opacity to 0');
    });

    // ==========================================
    // Suite: Screen Share Picker Modal (F7-F13)
    // ==========================================
    reporter.suite('Screen Share Picker Modal');

    await reporter.test('F7: Modal Header (Title "Демонстрация экрана", Subtitle, Close SVG X)', () => {
        reporter.assertMatch(injectCode, /Демонстрация экрана/, 'Modal header must have title "Демонстрация экрана"');
        reporter.assertMatch(injectCode, /Выберите приложение или экран/, 'Modal header must have subtitle "Выберите приложение или экран"');
        reporter.assertMatch(injectCode, /<svg|<path/i, 'Close button must use SVG icon');
    });

    await reporter.test('F8: Segmented Pill Tabs ("Приложения" & "Экраны", Active #35373c, Text #ffffff)', () => {
        reporter.assertMatch(injectCode, /Приложения/, 'Tab bar must include "Приложения"');
        reporter.assertMatch(injectCode, /Экраны/, 'Tab bar must include "Экраны"');
        reporter.assertMatch(injectCode, /#35373c/i, 'Active pill tab must use background #35373c');
        reporter.assertMatch(injectCode, /#ffffff|#fff/i, 'Active pill tab must use white text');
    });

    await reporter.test('F9: 2-Column Grid with Cards (#2b2d31, Hover #404249, Selected 2px solid #5865f2, 16:9)', () => {
        reporter.assertMatch(injectCode, /grid-template-columns:\s*repeat\(2/i, 'Source grid must be 2 columns');
        reporter.assertMatch(injectCode, /#2b2d31/i, 'Source cards must have background #2b2d31');
        reporter.assertMatch(injectCode, /#404249/i, 'Source cards must have hover border #404249');
        reporter.assertMatch(injectCode, /#5865f2/i, 'Selected card must have blurple border #5865f2');
        reporter.assertMatch(injectCode, /aspect-ratio:\s*16\s*\/\s*9/i, 'Thumbnail preview must enforce 16:9 aspect ratio');
    });

    await reporter.test('F10: Stream Quality Strip ("КАЧЕСТВО СТРИМА", 720p/1080p, 30/60 FPS)', () => {
        reporter.assertMatch(injectCode, /КАЧЕСТВО СТРИМА/, 'Quality section must contain label "КАЧЕСТВО СТРИМА"');
        reporter.assertMatch(injectCode, /720p/i, 'Quality strip must include 720p button');
        reporter.assertMatch(injectCode, /1080p/i, 'Quality strip must include 1080p button');
        reporter.assertMatch(injectCode, /30\s*(?:FPS)?/i, 'Quality strip must include 30 FPS button');
        reporter.assertMatch(injectCode, /60\s*(?:FPS)?/i, 'Quality strip must include 60 FPS button');
    });

    await reporter.test('F11: Modal Action Buttons ("Отмена" Flat & "Прямой эфир" Blurple #5865f2, #4752c4 Hover)', () => {
        reporter.assertMatch(injectCode, /Отмена/, 'Modal footer must include "Отмена" button');
        reporter.assertMatch(injectCode, /Прямой эфир/, 'Modal footer must include "Прямой эфир" button');
        reporter.assertMatch(injectCode, /#5865f2/i, 'Submit button must use blurple #5865f2');
        reporter.assertMatch(injectCode, /#4752c4/i, 'Submit button must have hover #4752c4');
        reporter.assertMatch(injectCode, /border-radius:\s*4px/i, 'Submit button must have 4px border radius');
    });

    await reporter.test('F12: Accessibility & Zoom-in Animation (ESC, Backdrop Click, scale(0.95)->scale(1))', () => {
        reporter.assertMatch(injectCode, /Escape|keydown/i, 'Must handle Escape key for modal dismissal');
        reporter.assertMatch(injectCode, /scale\(0\.95\)/, 'Modal entry animation must scale from scale(0.95)');
        reporter.assertMatch(injectCode, /scale\(1\)/, 'Modal entry animation must finish at scale(1)');
    });

    await reporter.test('F13: IPC Hook (window.__RUSTCORD_TOAST__ bound to showToast)', () => {
        reporter.assertMatch(injectCode, /window\.__RUSTCORD_TOAST__\s*=/, 'window.__RUSTCORD_TOAST__ must be exposed globally');
    });

    // ==========================================
    // Suite: Build & Packaging Verification (F14-F16)
    // ==========================================
    reporter.suite('Build & Packaging Verification');

    await reporter.test('F14: Rustcord Release Binary Exists and is Valid PE', () => {
        reporter.assert(fs.existsSync(RELEASE_EXE_PATH), `Release binary does not exist at ${RELEASE_EXE_PATH}`);
        const pe = verifyPEHeader(RELEASE_EXE_PATH);
        reporter.assert(pe.valid, `Release binary must be valid PE: ${pe.error}`);
        reporter.assert(pe.is64Bit, 'Release binary must be 64-bit Windows executable (x64)');
        reporter.assert(pe.size > 2000000, `Binary size (${pe.size} bytes) should be > 2MB`);
    });

    await reporter.test('F15: Root Executable Rustcord.exe Exists and Matches PE Specs', () => {
        reporter.assert(fs.existsSync(ROOT_EXE_PATH), `Root executable does not exist at ${ROOT_EXE_PATH}`);
        const pe = verifyPEHeader(ROOT_EXE_PATH);
        reporter.assert(pe.valid, `Root executable must be valid PE: ${pe.error}`);
        reporter.assert(pe.is64Bit, 'Root executable must be 64-bit Windows executable');
        reporter.assert(pe.size > 2000000, `Root executable size (${pe.size} bytes) should be > 2MB`);
    });

    await reporter.test('F16: Installer Binary RustcordSetup.exe Exists and Matches PE Specs', () => {
        reporter.assert(fs.existsSync(INSTALLER_SETUP_PATH), `Installer binary does not exist at ${INSTALLER_SETUP_PATH}`);
        const pe = verifyPEHeader(INSTALLER_SETUP_PATH);
        reporter.assert(pe.valid, `Installer binary must be valid PE: ${pe.error}`);
        reporter.assert(pe.is64Bit, 'Installer binary must be 64-bit Windows executable');
        reporter.assert(pe.size > 2000000, `Installer binary size (${pe.size} bytes) should be > 2MB`);
    });

    return reporter.summary();
}

if (require.main === module) {
    runTier1().then(res => {
        process.exit(res.failed > 0 ? 1 : 0);
    });
}

module.exports = { runTier1 };
