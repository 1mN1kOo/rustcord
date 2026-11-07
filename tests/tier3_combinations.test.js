// tier3_combinations.test.js - Cross-Feature Combinations & State Transitions
const {
    readInjectJs,
    createDOMSimulation,
    runHeadlessEdge,
    TestReporter
} = require('./test_utils');

async function runTier3(options = {}) {
    const reporter = new TestReporter('Tier 3: Cross-Feature Combinations', options);
    const injectCode = readInjectJs();

    reporter.suite('Cross-Feature Combinations');

    await reporter.test('XF1: Resolution & FPS Constraint Propagation to getDisplayMedia', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>Constraint Propagation Test</title></head>
            <body>
                <div id="app-mount"></div>
                <div id="test-output">INIT</div>
                <script>
                    window.__CAPTURED_CONSTRAINTS__ = null;
                    // Mock underlying browser getDisplayMedia
                    navigator.mediaDevices.getDisplayMedia = async function(c) {
                        window.__CAPTURED_CONSTRAINTS__ = c;
                        return {
                            id: 'mock-stream',
                            getTracks: () => [{ kind: 'video', stop: () => {} }]
                        };
                    };

                    window.__RUSTCORD_SOURCES__ = [
                        { id: 'screen:0:0', name: 'Primary Screen', icon: '' }
                    ];

                    ${injectCode}

                    (async function() {
                        try {
                            const p = navigator.mediaDevices.getDisplayMedia();
                            
                            // 1. Select the source card
                            const card = document.querySelector('.rc-sc-card, .card');
                            if (card) card.click();

                            // 2. Select 1080p
                            const resBtn1080 = document.querySelector('[data-val="1080p"], button[data-res="1080"]');
                            if (resBtn1080) resBtn1080.click();

                            // 3. Select 60 FPS
                            const fpsBtn60 = document.querySelector('[data-val="60"], button[data-fps="60"]');
                            if (fpsBtn60) fpsBtn60.click();

                            // 4. Submit
                            const submitBtn = document.getElementById('rc-sc-submit') || document.querySelector('.rc-sc-btn-submit') || document.getElementById('go');
                            if (submitBtn) submitBtn.click();

                            await p;

                            const c = window.__CAPTURED_CONSTRAINTS__;
                            if (!c || !c.video) {
                                document.getElementById('test-output').innerText = 'NO_VIDEO_CONSTRAINTS';
                                return;
                            }
                            const w = (c.video.width && c.video.width.ideal) || (c.video.width && c.video.width.max) || c.video.width;
                            const h = (c.video.height && c.video.height.ideal) || (c.video.height && c.video.height.max) || c.video.height;
                            const fps = (c.video.frameRate && c.video.frameRate.ideal) || (c.video.frameRate && c.video.frameRate.max) || c.video.frameRate;

                            document.getElementById('test-output').innerText = 'CONSTRAINTS:' + w + 'x' + h + '@' + fps;
                        } catch (err) {
                            document.getElementById('test-output').innerText = 'CRASH:' + err.message;
                        }
                    })();
                </script>
            </body>
            </html>
        `;
        const res = await runHeadlessEdge(testHtml, 2500);
        reporter.assertMatch(
            res.stdout,
            /CONSTRAINTS:(?:1920x1080|3840x2160)@60/,
            '1080p @ 60 FPS selection must propagate 1920/1080 and 60 fps constraints to getDisplayMedia'
        );
    });

    await reporter.test('XF2: Tab Switching with Source Selection Transition', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>Tab Switching Source Selection</title></head>
            <body>
                <div id="app-mount"></div>
                <div id="test-output">INIT</div>
                <script>
                    window.__RUSTCORD_SOURCES__ = [
                        { id: 'window:101:0', name: 'App Window 1', icon: '' },
                        { id: 'screen:0:0', name: 'Entire Screen', icon: '' }
                    ];

                    ${injectCode}

                    try {
                        navigator.mediaDevices.getDisplayMedia().catch(() => {});
                        
                        // Switch to Screens tab
                        const screensTab = document.querySelector('[data-tab="screens"], [data-t="screen"]');
                        if (screensTab) screensTab.click();

                        const cards = document.querySelectorAll('.rc-sc-card, .card');
                        const screenCard = Array.from(cards).find(c => c.innerText.includes('Entire Screen') || c.getAttribute('data-id') === 'screen:0:0');
                        
                        if (screenCard) {
                            screenCard.click();
                            const isSelected = screenCard.classList.contains('selected') || screenCard.classList.contains('sel');
                            document.getElementById('test-output').innerText = isSelected ? 'SCREEN_CARD_SELECTED' : 'SELECTION_CLASS_MISSING';
                        } else {
                            document.getElementById('test-output').innerText = 'SCREEN_CARD_NOT_FOUND';
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
            /SCREEN_CARD_SELECTED/,
            'Switching to Screens tab and clicking screen card must select screen source'
        );
    });

    await reporter.test('XF3: Live Source Updates (__UPDATE_RUSTCORD_SOURCES__) Preserves Modal Settings', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>Live Source Update Test</title></head>
            <body>
                <div id="app-mount"></div>
                <div id="test-output">INIT</div>
                <script>
                    window.__RUSTCORD_SOURCES__ = [
                        { id: 'window:101:0', name: 'Original Window', icon: '' }
                    ];

                    ${injectCode}

                    try {
                        navigator.mediaDevices.getDisplayMedia().catch(() => {});

                        // Select 720p
                        const btn720 = document.querySelector('[data-val="720p"], button[data-res="720"]');
                        if (btn720) btn720.click();

                        // Backend pushes updated sources
                        window.__RUSTCORD_SOURCES__ = [
                            { id: 'window:101:0', name: 'Original Window', icon: '' },
                            { id: 'window:102:0', name: 'New Window Added', icon: '' }
                        ];
                        if (window.__UPDATE_RUSTCORD_SOURCES__) {
                            window.__UPDATE_RUSTCORD_SOURCES__();
                        }

                        // Check if 720p is still active and new card rendered
                        const btn720Active = btn720 && (btn720.classList.contains('active') || btn720.classList.contains('sel'));
                        const hasNewCard = document.body.innerHTML.includes('New Window Added');

                        if (btn720Active && hasNewCard) {
                            document.getElementById('test-output').innerText = 'LIVE_UPDATE_SUCCESS';
                        } else {
                            document.getElementById('test-output').innerText = 'STATE_LOST: 720Active=' + btn720Active + ' hasNewCard=' + hasNewCard;
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
            /LIVE_UPDATE_SUCCESS/,
            'Live sources refresh must render newly added windows while preserving active quality settings'
        );
    });

    await reporter.test('XF4: Re-Opening Modal After Dismissal Cycles Cleanly', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>Modal Reopening Test</title></head>
            <body>
                <div id="app-mount"></div>
                <div id="test-output">INIT</div>
                <script>
                    window.__RUSTCORD_SOURCES__ = [{ id: 'screen:0:0', name: 'Screen', icon: '' }];
                    ${injectCode}

                    (async function() {
                        try {
                            // 1st open
                            let p1 = navigator.mediaDevices.getDisplayMedia().catch(() => {});
                            const cancel1 = document.getElementById('rc-sc-cancel') || document.querySelector('.rc-sc-btn-cancel') || document.getElementById('rc-cancel');
                            if (cancel1) cancel1.click();
                            await p1;

                            // 2nd open
                            let p2 = navigator.mediaDevices.getDisplayMedia().catch(() => {});
                            const overlay = document.getElementById('rustcord-screenshare-overlay') || document.querySelector('.rc-modal-dialog');
                            
                            if (overlay) {
                                document.getElementById('test-output').innerText = 'REOPEN_SUCCESS';
                            } else {
                                document.getElementById('test-output').innerText = 'OVERLAY_MISSING_ON_REOPEN';
                            }
                        } catch (err) {
                            document.getElementById('test-output').innerText = 'CRASH:' + err.message;
                        }
                    })();
                </script>
            </body>
            </html>
        `;
        const res = await runHeadlessEdge(testHtml, 2000);
        reporter.assertMatch(
            res.stdout,
            /REOPEN_SUCCESS/,
            'Modal must successfully re-open after being canceled previously'
        );
    });

    return reporter.summary();
}

if (require.main === module) {
    runTier3().then(res => {
        process.exit(res.failed > 0 ? 1 : 0);
    });
}

module.exports = { runTier3 };
