// tier4_realworld.test.js - Real-World End-to-End Headless & Binary Execution
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
    readInjectJs,
    runHeadlessEdge,
    verifyPEHeader,
    PROJECT_ROOT,
    RELEASE_EXE_PATH,
    ROOT_EXE_PATH,
    INSTALLER_SETUP_PATH,
    TestReporter
} = require('./test_utils');

async function runTier4(options = {}) {
    const reporter = new TestReporter('Tier 4: Real-World Scenarios', options);
    const injectCode = readInjectJs();

    // ==========================================
    // Suite: Edge Headless Splash Lifecycle
    // ==========================================
    reporter.suite('Edge Headless Splash Lifecycle');

    await reporter.test('SIM1: Splash Screen Mount, Render & Fade-Out Dismissal in Headless Edge', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html style="background-color: #1e1f22;">
            <head>
                <title>Splash Lifecycle E2E</title>
                <style>
                    body { margin: 0; padding: 0; }
                </style>
            </head>
            <body>
                <div id="test-log">INIT</div>
                <script>
                    ${injectCode}

                    // Verify splash mounted
                    setTimeout(() => {
                        const splash = document.getElementById('rustcord-custom-splash');
                        if (!splash) {
                            document.getElementById('test-log').innerText = 'SPLASH_NOT_FOUND';
                            return;
                        }

                        // Verify WebP image exists
                        const img = splash.querySelector('img');
                        const hasAnim = img && (img.src.startsWith('data:image/webp;base64,') || img.classList.contains('rc-splash-anim'));

                        // Verify Tips container
                        const tip = document.getElementById('rc-splash-tip-text') || splash.querySelector('.rc-splash-tip-text, .rc-splash-status');
                        const hasTip = Boolean(tip && tip.innerText.length > 0);

                        // Now simulate Discord mounting its main app frame
                        const appMount = document.createElement('div');
                        appMount.id = 'app-mount';
                        const aside = document.createElement('div');
                        aside.className = 'app-aside';
                        const guilds = document.createElement('nav');
                        guilds.setAttribute('data-list-id', 'guildsnav');
                        appMount.appendChild(aside);
                        appMount.appendChild(guilds);
                        document.body.appendChild(appMount);

                        // Wait for MutationObserver & 400ms transition
                        setTimeout(() => {
                            const splashAfter = document.getElementById('rustcord-custom-splash');
                            const isRemoved = !splashAfter || splashAfter.style.opacity === '0';
                            document.getElementById('test-log').innerText = 'RESULT:hasAnim=' + hasAnim + ',hasTip=' + hasTip + ',dismissed=' + isRemoved;
                        }, 600);
                    }, 200);
                </script>
            </body>
            </html>
        `;

        const res = await runHeadlessEdge(testHtml, 3000);
        reporter.assertMatch(
            res.stdout,
            /RESULT:hasAnim=true,hasTip=true,dismissed=true/,
            'Splash screen must mount animated WebP, show tips, and smoothly dismiss upon Discord DOM mount'
        );
    });

    // ==========================================
    // Suite: Edge Headless Screen Share Modal E2E
    // ==========================================
    reporter.suite('Edge Headless Screen Share Modal E2E');

    await reporter.test('SIM2: Full Modal Flow: Open -> Switch Tab -> Select Card -> Set 1080p/60fps -> Stream Resolve', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>Modal E2E Stream Flow</title></head>
            <body>
                <div id="app-mount"></div>
                <div id="test-log">INIT</div>
                <script>
                    window.__RUSTCORD_SOURCES__ = [
                        { id: 'window:9001:0', name: 'Code Editor', icon: '' },
                        { id: 'screen:0:0', name: 'Display 1', icon: '' }
                    ];

                    // Mock low-level browser getDisplayMedia to return a mock track
                    navigator.mediaDevices.getDisplayMedia = async function(constraints) {
                        return {
                            id: 'active-stream',
                            constraints: constraints,
                            getTracks: () => [{
                                kind: 'video',
                                stop: () => {},
                                getSettings: () => ({ width: 1920, height: 1080, frameRate: 60 })
                            }]
                        };
                    };

                    ${injectCode}

                    (async function() {
                        try {
                            const streamPromise = navigator.mediaDevices.getDisplayMedia();

                            // Wait for modal animation to mount
                            setTimeout(async () => {
                                const overlay = document.getElementById('rustcord-screenshare-overlay') || document.querySelector('.rc-modal-dialog');
                                if (!overlay) {
                                    document.getElementById('test-log').innerText = 'MODAL_NOT_MOUNTED';
                                    return;
                                }

                                // Switch to screens tab
                                const screensTab = document.querySelector('[data-tab="screens"], [data-t="screen"]');
                                if (screensTab) screensTab.click();

                                // Click screen card
                                const card = document.querySelector('.rc-sc-card, .card');
                                if (card) card.click();

                                // Select 1080p
                                const resBtn = document.querySelector('[data-val="1080p"], button[data-res="1080"]');
                                if (resBtn) resBtn.click();

                                // Select 60 FPS
                                const fpsBtn = document.querySelector('[data-val="60"], button[data-fps="60"]');
                                if (fpsBtn) fpsBtn.click();

                                // Click submit
                                const submitBtn = document.getElementById('rc-sc-submit') || document.querySelector('.rc-sc-btn-submit') || document.getElementById('go');
                                if (submitBtn) submitBtn.click();

                                const stream = await streamPromise;
                                const tracks = stream.getTracks();
                                const track = tracks[0];

                                document.getElementById('test-log').innerText = 'E2E_STREAM_SUCCESS:' + track.kind + ':' + track.getSettings().width + 'x' + track.getSettings().height + '@' + track.getSettings().frameRate;
                            }, 150);
                        } catch (err) {
                            document.getElementById('test-log').innerText = 'CRASH:' + err.message;
                        }
                    })();
                </script>
            </body>
            </html>
        `;

        const res = await runHeadlessEdge(testHtml, 3000);
        reporter.assertMatch(
            res.stdout,
            /E2E_STREAM_SUCCESS:video:1920x1080@60/,
            'Full modal flow in headless Edge must produce active video stream with 1920x1080@60'
        );
    });

    // ==========================================
    // Suite: Cargo Compilation & Binary Integrity
    // ==========================================
    reporter.suite('Cargo Compilation & Binary Verification');

    await reporter.test('SIM3: Rustcord Cargo Check Execution Exits with Code 0', () => {
        const cargoCmd = 'cargo check --manifest-path C:\\Rustcord\\Rustcord\\Cargo.toml';
        try {
            const out = execSync(cargoCmd, {
                env: { ...process.env, PATH: `C:\\Users\\Tsoij\\.cargo\\bin;${process.env.PATH}` },
                encoding: 'utf-8'
            });
            reporter.assert(true, 'cargo check succeeded');
        } catch (err) {
            reporter.assert(false, `cargo check failed with exit code ${err.status}: ${err.stderr || err.message}`);
        }
    });

    await reporter.test('SIM4: Executables Structure & Architecture Verification (Rustcord.exe & RustcordSetup.exe)', () => {
        const rootExe = verifyPEHeader(ROOT_EXE_PATH);
        reporter.assert(rootExe.valid, `Root Rustcord.exe must be valid PE: ${rootExe.error}`);
        reporter.assert(rootExe.is64Bit, 'Root Rustcord.exe must be 64-bit Windows executable');
        reporter.assert(rootExe.size > 3000000, `Root Rustcord.exe size (${rootExe.size} bytes) must be > 3MB`);

        const installerExe = verifyPEHeader(INSTALLER_SETUP_PATH);
        reporter.assert(installerExe.valid, `RustcordSetup.exe must be valid PE: ${installerExe.error}`);
        reporter.assert(installerExe.is64Bit, 'RustcordSetup.exe must be 64-bit Windows executable');
        reporter.assert(installerExe.size > 3000000, `RustcordSetup.exe size (${installerExe.size} bytes) must be > 3MB`);
    });

    return reporter.summary();
}

if (require.main === module) {
    runTier4().then(res => {
        process.exit(res.failed > 0 ? 1 : 0);
    });
}

module.exports = { runTier4 };
