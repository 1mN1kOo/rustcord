// tier2_boundaries.test.js - Boundary & Corner Cases
const {
    readInjectJs,
    createDOMSimulation,
    runHeadlessEdge,
    TestReporter
} = require('./test_utils');

async function runTier2(options = {}) {
    const reporter = new TestReporter('Tier 2: Boundary & Corner Cases', options);
    const injectCode = readInjectJs();

    reporter.suite('Boundary & Corner Cases');

    await reporter.test('BC1: Empty Sources List Handling (window.__RUSTCORD_SOURCES__ = [])', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>Empty Sources Test</title></head>
            <body>
                <div id="app-mount"></div>
                <div id="test-output">INIT</div>
                <script>
                    window.__RUSTCORD_SOURCES__ = [];
                    ${injectCode}
                    try {
                        if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
                            navigator.mediaDevices.getDisplayMedia().catch(() => {});
                            const grid = document.getElementById('rc-sc-grid') || document.querySelector('.rc-sc-grid') || document.getElementById('grid');
                            if (grid) {
                                document.getElementById('test-output').innerText = 'GRID_RENDERED_NO_CRASH';
                            } else {
                                document.getElementById('test-output').innerText = 'NO_GRID_ELEMENT';
                            }
                        } else {
                            document.getElementById('test-output').innerText = 'NO_GET_DISPLAY_MEDIA';
                        }
                    } catch (err) {
                        document.getElementById('test-output').innerText = 'CRASH:' + err.message;
                    }
                </script>
            </body>
            </html>
        `;
        const res = await runHeadlessEdge(testHtml, 2000);
        reporter.assertMatch(
            res.stdout,
            /GRID_RENDERED_NO_CRASH/,
            'Modal grid must render gracefully without crashing when window.__RUSTCORD_SOURCES__ is empty'
        );
    });

    await reporter.test('BC2: Rapid Tab Switching (50 clicks within burst)', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>Rapid Tab Switching Test</title></head>
            <body>
                <div id="app-mount"></div>
                <div id="test-output">INIT</div>
                <script>
                    window.__RUSTCORD_SOURCES__ = [
                        { id: 'screen:0:0', name: 'Screen 1', icon: '' },
                        { id: 'window:1234:0', name: 'App 1', icon: '' }
                    ];
                    ${injectCode}
                    try {
                        navigator.mediaDevices.getDisplayMedia().catch(() => {});
                        const tabs = document.querySelectorAll('.rc-sc-tab, [data-tab]');
                        if (tabs.length >= 2) {
                            for (let i = 0; i < 50; i++) {
                                tabs[i % 2].click();
                            }
                            const activeTabs = document.querySelectorAll('.rc-sc-tab.active, [data-tab].active');
                            if (activeTabs.length === 1) {
                                document.getElementById('test-output').innerText = 'RAPID_TAB_STABLE';
                            } else {
                                document.getElementById('test-output').innerText = 'MULTIPLE_ACTIVE_TABS:' + activeTabs.length;
                            }
                        } else {
                            document.getElementById('test-output').innerText = 'TABS_NOT_FOUND';
                        }
                    } catch (err) {
                        document.getElementById('test-output').innerText = 'CRASH:' + err.message;
                    }
                </script>
            </body>
            </html>
        `;
        const res = await runHeadlessEdge(testHtml, 2000);
        reporter.assertMatch(
            res.stdout,
            /RAPID_TAB_STABLE/,
            'Rapid tab switching (50x) must maintain exactly 1 active tab without exception'
        );
    });

    await reporter.test('BC3: Rapid Modal Dismissal via ESC and Backdrop Click', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>Rapid Dismissal Test</title></head>
            <body>
                <div id="app-mount"></div>
                <div id="test-output">INIT</div>
                <script>
                    window.__RUSTCORD_SOURCES__ = [{ id: 'screen:0:0', name: 'Screen 1', icon: '' }];
                    ${injectCode}
                    (async function() {
                        let rejectedProperly = false;
                        const p = navigator.mediaDevices.getDisplayMedia();
                        p.catch(err => {
                            if (err && (err.name === 'NotAllowedError' || err.message.includes('Permission denied'))) {
                                rejectedProperly = true;
                            }
                        });

                        // Simulate immediate ESC keypress
                        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                        
                        setTimeout(() => {
                            const overlay = document.getElementById('rustcord-screenshare-overlay') || document.querySelector('.rc-modal-dialog');
                            const isDismissed = !overlay || overlay.style.display === 'none';
                            if (rejectedProperly && isDismissed) {
                                document.getElementById('test-output').innerText = 'DISMISSED_CLEANLY';
                            } else {
                                document.getElementById('test-output').innerText = 'FAILED: rejected=' + rejectedProperly + ', dismissed=' + isDismissed;
                            }
                        }, 100);
                    })();
                </script>
            </body>
            </html>
        `;
        const res = await runHeadlessEdge(testHtml, 2000);
        reporter.assertMatch(
            res.stdout,
            /DISMISSED_CLEANLY/,
            'ESC key must immediately dismiss modal and reject promise with NotAllowedError'
        );
    });

    await reporter.test('BC4: Safety Timeout Fallback (8000ms) for Splash Screen', () => {
        reporter.assertMatch(
            injectCode,
            /(?:8000|6000)\s*(?:\/\*|\)|;)/,
            'Safety timeout must be defined (8000ms or 6000ms) to prevent permanent stuck splash screen'
        );
        reporter.assertMatch(
            injectCode,
            /dismissSplash\(\)/,
            'Timeout callback must invoke dismissSplash()'
        );
    });

    await reporter.test('BC5: Invalid Input & Malformed Source Rejection', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>Malformed Sources Test</title></head>
            <body>
                <div id="app-mount"></div>
                <div id="test-output">INIT</div>
                <script>
                    // Malformed source entries
                    window.__RUSTCORD_SOURCES__ = [
                        null,
                        undefined,
                        {},
                        { id: 123 },
                        { name: 'No ID' },
                        { id: 'screen:0:0', name: 'Valid Screen', icon: null }
                    ];
                    ${injectCode}
                    try {
                        navigator.mediaDevices.getDisplayMedia().catch(() => {});
                        if (window.__UPDATE_RUSTCORD_SOURCES__) {
                            window.__UPDATE_RUSTCORD_SOURCES__();
                        }
                        document.getElementById('test-output').innerText = 'MALFORMED_HANDLED_SAFELY';
                    } catch (err) {
                        document.getElementById('test-output').innerText = 'CRASH:' + err.message;
                    }
                </script>
            </body>
            </html>
        `;
        const res = await runHeadlessEdge(testHtml, 2000);
        reporter.assertMatch(
            res.stdout,
            /MALFORMED_HANDLED_SAFELY/,
            'Grid renderer and source updater must ignore malformed items without crashing'
        );
    });

    await reporter.test('BC6: Clicking "Прямой эфир" Without Source Selection Does Not Crash or Corrupt', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>No Selection Test</title></head>
            <body>
                <div id="app-mount"></div>
                <div id="test-output">INIT</div>
                <script>
                    window.__RUSTCORD_SOURCES__ = [
                        { id: 'screen:0:0', name: 'Primary Screen', icon: '' }
                    ];
                    ${injectCode}
                    try {
                        navigator.mediaDevices.getDisplayMedia().catch(() => {});
                        const submitBtn = document.getElementById('rc-sc-submit') || document.querySelector('.rc-sc-btn-submit') || document.getElementById('go');
                        if (submitBtn) {
                            // Click submit before choosing any card
                            submitBtn.click();
                            // Modal should still be present or disabled, not crashed
                            const overlay = document.getElementById('rustcord-screenshare-overlay');
                            document.getElementById('test-output').innerText = overlay ? 'HANDLED_SAFELY' : 'MODAL_CLOSED_PREMATURELY';
                        } else {
                            document.getElementById('test-output').innerText = 'SUBMIT_BTN_NOT_FOUND';
                        }
                    } catch (err) {
                        document.getElementById('test-output').innerText = 'CRASH:' + err.message;
                    }
                </script>
            </body>
            </html>
        `;
        const res = await runHeadlessEdge(testHtml, 2000);
        reporter.assertMatch(
            res.stdout,
            /HANDLED_SAFELY/,
            'Clicking submit without selecting a source must be handled safely without crashing'
        );
    });

    return reporter.summary();
}

if (require.main === module) {
    runTier2().then(res => {
        process.exit(res.failed > 0 ? 1 : 0);
    });
}

module.exports = { runTier2 };
