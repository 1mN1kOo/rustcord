// adversarial_challenger_2.test.js
// Master Empirical Adversarial Stress Test Suite for Screen Share Picker Modal in Rustcord inject.js
// Invocation: node tests\adversarial_challenger_2.test.js
// Author: Challenger 2 (Modal Adversarial Challenger)

const fs = require('fs');
const path = require('path');
const { runHeadlessEdge } = require('./test_utils');

const INJECT_JS_PATH = path.join(__dirname, '..', 'src', 'inject.js');
const injectCode = fs.readFileSync(INJECT_JS_PATH, 'utf-8');

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testDetails = [];

async function test(name, fn) {
    totalTests++;
    process.stdout.write(`  [ADVERSARIAL] ${name} ... `);
    const start = Date.now();
    try {
        const result = await fn();
        const duration = Date.now() - start;
        passedTests++;
        console.log(`${GREEN}PASS${RESET} (${duration}ms)`);
        testDetails.push({ name, status: 'PASS', duration, result });
    } catch (err) {
        const duration = Date.now() - start;
        failedTests++;
        console.log(`${RED}FAIL${RESET} (${duration}ms)`);
        console.error(`    ${RED}${err.message}${RESET}`);
        testDetails.push({ name, status: 'FAIL', duration, error: err.message });
    }
}

async function main() {
    console.log(`${BOLD}${CYAN}======================================================================${RESET}`);
    console.log(`${BOLD}${CYAN}   CHALLENGER 2: SCREEN SHARE PICKER MODAL ADVERSARIAL SUITE          ${RESET}`);
    console.log(`${BOLD}${CYAN}======================================================================${RESET}\n`);

    // =========================================================================
    // SUITE 1: Modal Dismissal & Keyboard Accessibility Testing
    // =========================================================================
    console.log(`${BOLD}--- Suite 1: Modal Dismissal & Keyboard Accessibility (4 Pathways) ---${RESET}`);

    await test('1.1 ESC key dismissal in capture phase rejects with DOMException(NotAllowedError), removes DOM, and cleans up window keydown listener', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>ESC Key Dismissal Test</title></head>
            <body>
                <div id="app-mount"></div>
                <div id="test-output">PENDING</div>
                <script>
                    window.__RUSTCORD_SOURCES__ = [{ id: 'screen:0:0', name: 'Main Display', icon: '' }];

                    // Instrument window event listeners to track capture-phase keydown listeners
                    let captureKeydownAdded = 0;
                    let captureKeydownRemoved = 0;
                    const origAdd = window.addEventListener;
                    const origRemove = window.removeEventListener;

                    window.addEventListener = function(type, fn, opts) {
                        const isCapture = (opts === true || (opts && opts.capture === true));
                        if (type === 'keydown' && isCapture) {
                            captureKeydownAdded++;
                        }
                        return origAdd.apply(this, arguments);
                    };

                    window.removeEventListener = function(type, fn, opts) {
                        const isCapture = (opts === true || (opts && opts.capture === true));
                        if (type === 'keydown' && isCapture) {
                            captureKeydownRemoved++;
                        }
                        return origRemove.apply(this, arguments);
                    };

                    ${injectCode}

                    (async function() {
                        try {
                            const p = navigator.mediaDevices.getDisplayMedia();
                            const overlayBefore = document.getElementById('rustcord-screenshare-overlay');
                            if (!overlayBefore) {
                                document.getElementById('test-output').innerText = 'FAIL: Overlay not mounted';
                                return;
                            }

                            if (captureKeydownAdded !== 1) {
                                document.getElementById('test-output').innerText = 'FAIL: Capture keydown listener not registered: ' + captureKeydownAdded;
                                return;
                            }

                            // Trigger Escape key
                            const escEvent = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true });
                            window.dispatchEvent(escEvent);

                            let rejected = false;
                            let errName = '';
                            let errMsg = '';
                            let isDomException = false;
                            try {
                                await p;
                            } catch (err) {
                                rejected = true;
                                errName = err.name;
                                errMsg = err.message;
                                isDomException = (err instanceof DOMException) || (err.name === 'NotAllowedError');
                            }

                            const overlayAfter = document.getElementById('rustcord-screenshare-overlay');
                            const netListeners = captureKeydownAdded - captureKeydownRemoved;

                            if (rejected && errName === 'NotAllowedError' && errMsg.includes('Permission denied') && !overlayAfter && netListeners === 0) {
                                document.getElementById('test-output').innerText = 'SUCCESS_ESC_DISMISSAL';
                            } else {
                                document.getElementById('test-output').innerText = 'FAIL: rejected=' + rejected + ' err=' + errName + ' msg=' + errMsg + ' overlayAfter=' + Boolean(overlayAfter) + ' netListeners=' + netListeners;
                            }
                        } catch (e) {
                            document.getElementById('test-output').innerText = 'CRASH:' + e.message;
                        }
                    })();
                </script>
            </body>
            </html>
        `;

        const res = await runHeadlessEdge(testHtml, 2500);
        if (!res.stdout.includes('SUCCESS_ESC_DISMISSAL')) {
            throw new Error(`ESC dismissal failed: ${res.stdout}`);
        }
    });

    await test('1.2 Backdrop click (#rustcord-screenshare-overlay) rejects with NotAllowedError, removes DOM, and tears down keydown listener', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>Backdrop Click Dismissal Test</title></head>
            <body>
                <div id="app-mount"></div>
                <div id="test-output">PENDING</div>
                <script>
                    window.__RUSTCORD_SOURCES__ = [{ id: 'screen:0:0', name: 'Main Display', icon: '' }];

                    let captureKeydownAdded = 0;
                    let captureKeydownRemoved = 0;
                    const origAdd = window.addEventListener;
                    const origRemove = window.removeEventListener;

                    window.addEventListener = function(type, fn, opts) {
                        if (type === 'keydown' && (opts === true || (opts && opts.capture === true))) {
                            captureKeydownAdded++;
                        }
                        return origAdd.apply(this, arguments);
                    };

                    window.removeEventListener = function(type, fn, opts) {
                        if (type === 'keydown' && (opts === true || (opts && opts.capture === true))) {
                            captureKeydownRemoved++;
                        }
                        return origRemove.apply(this, arguments);
                    };

                    ${injectCode}

                    (async function() {
                        try {
                            const p = navigator.mediaDevices.getDisplayMedia();
                            const overlay = document.getElementById('rustcord-screenshare-overlay');
                            if (!overlay) {
                                document.getElementById('test-output').innerText = 'FAIL: Overlay missing';
                                return;
                            }

                            // Click backdrop directly
                            overlay.click();

                            let rejected = false;
                            let errName = '';
                            try {
                                await p;
                            } catch (err) {
                                rejected = true;
                                errName = err.name;
                            }

                            const overlayAfter = document.getElementById('rustcord-screenshare-overlay');
                            const netListeners = captureKeydownAdded - captureKeydownRemoved;

                            if (rejected && errName === 'NotAllowedError' && !overlayAfter && netListeners === 0) {
                                document.getElementById('test-output').innerText = 'SUCCESS_BACKDROP_DISMISSAL';
                            } else {
                                document.getElementById('test-output').innerText = 'FAIL: rejected=' + rejected + ' err=' + errName + ' overlayAfter=' + Boolean(overlayAfter) + ' netListeners=' + netListeners;
                            }
                        } catch (e) {
                            document.getElementById('test-output').innerText = 'CRASH:' + e.message;
                        }
                    })();
                </script>
            </body>
            </html>
        `;

        const res = await runHeadlessEdge(testHtml, 2500);
        if (!res.stdout.includes('SUCCESS_BACKDROP_DISMISSAL')) {
            throw new Error(`Backdrop dismissal failed: ${res.stdout}`);
        }
    });

    await test('1.3 Close SVG button (#rc-sc-close) rejects with NotAllowedError, removes DOM, and tears down keydown listener', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>Close Button Dismissal Test</title></head>
            <body>
                <div id="app-mount"></div>
                <div id="test-output">PENDING</div>
                <script>
                    window.__RUSTCORD_SOURCES__ = [{ id: 'screen:0:0', name: 'Main Display', icon: '' }];

                    let captureKeydownAdded = 0;
                    let captureKeydownRemoved = 0;
                    const origAdd = window.addEventListener;
                    const origRemove = window.removeEventListener;

                    window.addEventListener = function(type, fn, opts) {
                        if (type === 'keydown' && (opts === true || (opts && opts.capture === true))) {
                            captureKeydownAdded++;
                        }
                        return origAdd.apply(this, arguments);
                    };

                    window.removeEventListener = function(type, fn, opts) {
                        if (type === 'keydown' && (opts === true || (opts && opts.capture === true))) {
                            captureKeydownRemoved++;
                        }
                        return origRemove.apply(this, arguments);
                    };

                    ${injectCode}

                    (async function() {
                        try {
                            const p = navigator.mediaDevices.getDisplayMedia();
                            const overlay = document.getElementById('rustcord-screenshare-overlay');
                            const closeBtn = document.getElementById('rc-sc-close') || overlay.querySelector('.rc-sc-close-btn');
                            if (!closeBtn) {
                                document.getElementById('test-output').innerText = 'FAIL: Close button not found';
                                return;
                            }

                            closeBtn.click();

                            let rejected = false;
                            let errName = '';
                            try {
                                await p;
                            } catch (err) {
                                rejected = true;
                                errName = err.name;
                            }

                            const overlayAfter = document.getElementById('rustcord-screenshare-overlay');
                            const netListeners = captureKeydownAdded - captureKeydownRemoved;

                            if (rejected && errName === 'NotAllowedError' && !overlayAfter && netListeners === 0) {
                                document.getElementById('test-output').innerText = 'SUCCESS_CLOSE_BTN_DISMISSAL';
                            } else {
                                document.getElementById('test-output').innerText = 'FAIL: rejected=' + rejected + ' err=' + errName + ' overlayAfter=' + Boolean(overlayAfter) + ' netListeners=' + netListeners;
                            }
                        } catch (e) {
                            document.getElementById('test-output').innerText = 'CRASH:' + e.message;
                        }
                    })();
                </script>
            </body>
            </html>
        `;

        const res = await runHeadlessEdge(testHtml, 2500);
        if (!res.stdout.includes('SUCCESS_CLOSE_BTN_DISMISSAL')) {
            throw new Error(`Close button dismissal failed: ${res.stdout}`);
        }
    });

    await test('1.4 Flat "Отмена" button (#rc-sc-cancel) rejects with NotAllowedError, removes DOM, and tears down keydown listener', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>Cancel Button Dismissal Test</title></head>
            <body>
                <div id="app-mount"></div>
                <div id="test-output">PENDING</div>
                <script>
                    window.__RUSTCORD_SOURCES__ = [{ id: 'screen:0:0', name: 'Main Display', icon: '' }];

                    let captureKeydownAdded = 0;
                    let captureKeydownRemoved = 0;
                    const origAdd = window.addEventListener;
                    const origRemove = window.removeEventListener;

                    window.addEventListener = function(type, fn, opts) {
                        if (type === 'keydown' && (opts === true || (opts && opts.capture === true))) {
                            captureKeydownAdded++;
                        }
                        return origAdd.apply(this, arguments);
                    };

                    window.removeEventListener = function(type, fn, opts) {
                        if (type === 'keydown' && (opts === true || (opts && opts.capture === true))) {
                            captureKeydownRemoved++;
                        }
                        return origRemove.apply(this, arguments);
                    };

                    ${injectCode}

                    (async function() {
                        try {
                            const p = navigator.mediaDevices.getDisplayMedia();
                            const overlay = document.getElementById('rustcord-screenshare-overlay');
                            const cancelBtn = document.getElementById('rc-sc-cancel') || overlay.querySelector('.rc-sc-btn-cancel');
                            if (!cancelBtn) {
                                document.getElementById('test-output').innerText = 'FAIL: Cancel button not found';
                                return;
                            }

                            cancelBtn.click();

                            let rejected = false;
                            let errName = '';
                            try {
                                await p;
                            } catch (err) {
                                rejected = true;
                                errName = err.name;
                            }

                            const overlayAfter = document.getElementById('rustcord-screenshare-overlay');
                            const netListeners = captureKeydownAdded - captureKeydownRemoved;

                            if (rejected && errName === 'NotAllowedError' && !overlayAfter && netListeners === 0) {
                                document.getElementById('test-output').innerText = 'SUCCESS_CANCEL_BTN_DISMISSAL';
                            } else {
                                document.getElementById('test-output').innerText = 'FAIL: rejected=' + rejected + ' err=' + errName + ' overlayAfter=' + Boolean(overlayAfter) + ' netListeners=' + netListeners;
                            }
                        } catch (e) {
                            document.getElementById('test-output').innerText = 'CRASH:' + e.message;
                        }
                    })();
                </script>
            </body>
            </html>
        `;

        const res = await runHeadlessEdge(testHtml, 2500);
        if (!res.stdout.includes('SUCCESS_CANCEL_BTN_DISMISSAL')) {
            throw new Error(`Cancel button dismissal failed: ${res.stdout}`);
        }
    });

    await test('1.5 Negative Dismissal & Re-entry Stress: Clicking dialog body keeps modal open; 20 sequential open/close cycles show zero listener leak', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>Dismissal Stress Test</title></head>
            <body>
                <div id="app-mount"></div>
                <div id="test-output">PENDING</div>
                <script>
                    window.__RUSTCORD_SOURCES__ = [{ id: 'screen:0:0', name: 'Main Display', icon: '' }];

                    let captureKeydownAdded = 0;
                    let captureKeydownRemoved = 0;
                    const origAdd = window.addEventListener;
                    const origRemove = window.removeEventListener;

                    window.addEventListener = function(type, fn, opts) {
                        if (type === 'keydown' && (opts === true || (opts && opts.capture === true))) {
                            captureKeydownAdded++;
                        }
                        return origAdd.apply(this, arguments);
                    };

                    window.removeEventListener = function(type, fn, opts) {
                        if (type === 'keydown' && (opts === true || (opts && opts.capture === true))) {
                            captureKeydownRemoved++;
                        }
                        return origRemove.apply(this, arguments);
                    };

                    ${injectCode}

                    (async function() {
                        try {
                            // Negative check: Click dialog content does NOT dismiss
                            let pNegative = navigator.mediaDevices.getDisplayMedia().catch(() => {});
                            const overlay = document.getElementById('rustcord-screenshare-overlay');
                            const header = overlay.querySelector('.rc-sc-header');
                            header.click();

                            if (!document.getElementById('rustcord-screenshare-overlay')) {
                                document.getElementById('test-output').innerText = 'FAIL_NEGATIVE_DISMISSAL';
                                return;
                            }
                            // Dismiss with cancel
                            document.getElementById('rc-sc-cancel').click();
                            await pNegative;

                            // 20 sequential cycles alternating pathways
                            const pathways = ['esc', 'backdrop', 'close', 'cancel'];
                            for (let i = 0; i < 20; i++) {
                                const mode = pathways[i % 4];
                                const p = navigator.mediaDevices.getDisplayMedia().catch(() => {});
                                const curOverlay = document.getElementById('rustcord-screenshare-overlay');

                                if (mode === 'esc') {
                                    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                                } else if (mode === 'backdrop') {
                                    curOverlay.click();
                                } else if (mode === 'close') {
                                    document.getElementById('rc-sc-close').click();
                                } else if (mode === 'cancel') {
                                    document.getElementById('rc-sc-cancel').click();
                                }
                                await p;
                            }

                            const finalNetListeners = captureKeydownAdded - captureKeydownRemoved;
                            const finalOverlay = document.getElementById('rustcord-screenshare-overlay');

                            if (finalNetListeners === 0 && !finalOverlay) {
                                document.getElementById('test-output').innerText = 'STRESS_CYCLES_PASS_ZERO_LEAK';
                            } else {
                                document.getElementById('test-output').innerText = 'FAIL_STRESS: netListeners=' + finalNetListeners;
                            }
                        } catch (err) {
                            document.getElementById('test-output').innerText = 'CRASH:' + err.message;
                        }
                    })();
                </script>
            </body>
            </html>
        `;

        const res = await runHeadlessEdge(testHtml, 3000);
        if (!res.stdout.includes('STRESS_CYCLES_PASS_ZERO_LEAK')) {
            throw new Error(`Stress cycle failed: ${res.stdout}`);
        }
    });

    // =========================================================================
    // SUITE 2: Source Selection & Rapid State Transition Testing
    // =========================================================================
    console.log(`\n${BOLD}--- Suite 2: Source Selection & Rapid State Transition ---${RESET}`);

    await test('2.1 Rapid tab switching: 50 rapid alternating clicks between "Приложения" and "Экраны"', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>50 Tab Switches Test</title></head>
            <body>
                <div id="app-mount"></div>
                <div id="test-output">PENDING</div>
                <script>
                    window.__RUSTCORD_SOURCES__ = [
                        { id: 'screen:0:0', name: 'Primary Display', icon: '' },
                        { id: 'window:101:0', name: 'Code Editor', icon: '' }
                    ];
                    ${injectCode}

                    (async function() {
                        try {
                            navigator.mediaDevices.getDisplayMedia().catch(() => {});
                            const overlay = document.getElementById('rustcord-screenshare-overlay');
                            const tabs = overlay.querySelectorAll('.rc-sc-tab, [data-tab]');
                            if (tabs.length < 2) {
                                document.getElementById('test-output').innerText = 'FAIL_TABS_NOT_FOUND';
                                return;
                            }

                            for (let i = 0; i < 50; i++) {
                                tabs[i % 2].click();
                            }

                            const activeTabs = overlay.querySelectorAll('.rc-sc-tab.active, [data-tab].active');
                            const lastClicked = tabs[49];
                            const lastTabName = lastClicked.getAttribute('data-tab');

                            const grid = document.getElementById('rc-sc-grid');
                            const cards = grid.querySelectorAll('.rc-sc-card');

                            if (activeTabs.length === 1 && lastClicked.classList.contains('active') && cards.length === 1) {
                                document.getElementById('test-output').innerText = 'SUCCESS_50_TAB_SWITCHES';
                            } else {
                                document.getElementById('test-output').innerText = 'FAIL: activeCount=' + activeTabs.length + ' cardsCount=' + cards.length;
                            }
                        } catch (err) {
                            document.getElementById('test-output').innerText = 'CRASH:' + err.message;
                        }
                    })();
                </script>
            </body>
            </html>
        `;

        const res = await runHeadlessEdge(testHtml, 2500);
        if (!res.stdout.includes('SUCCESS_50_TAB_SWITCHES')) {
            throw new Error(`50 tab switches failed: ${res.stdout}`);
        }
    });

    await test('2.2 Dynamic source refresh: __UPDATE_RUSTCORD_SOURCES__() called mid-session updates cards and preserves state', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>Dynamic Source Refresh Test</title></head>
            <body>
                <div id="app-mount"></div>
                <div id="test-output">PENDING</div>
                <script>
                    window.__RUSTCORD_SOURCES__ = [
                        { id: 'window:101:0', name: 'App Window 1', icon: '' }
                    ];
                    ${injectCode}

                    (async function() {
                        try {
                            navigator.mediaDevices.getDisplayMedia().catch(() => {});
                            const overlay = document.getElementById('rustcord-screenshare-overlay');
                            const grid = document.getElementById('rc-sc-grid');

                            const initialCount = grid.querySelectorAll('.rc-sc-card').length;

                            // Update global sources array while modal is open
                            window.__RUSTCORD_SOURCES__ = [
                                { id: 'window:101:0', name: 'App Window 1', icon: '' },
                                { id: 'window:202:0', name: 'App Window 2', icon: '' },
                                { id: 'window:303:0', name: 'App Window 3', icon: '' }
                            ];

                            if (typeof window.__UPDATE_RUSTCORD_SOURCES__ !== 'function') {
                                document.getElementById('test-output').innerText = 'FAIL_NO_HOOK';
                                return;
                            }

                            window.__UPDATE_RUSTCORD_SOURCES__();

                            const updatedCards = grid.querySelectorAll('.rc-sc-card');
                            if (initialCount === 1 && updatedCards.length === 3) {
                                document.getElementById('test-output').innerText = 'SUCCESS_LIVE_UPDATE';
                            } else {
                                document.getElementById('test-output').innerText = 'FAIL: initial=' + initialCount + ' updated=' + updatedCards.length;
                            }
                        } catch (err) {
                            document.getElementById('test-output').innerText = 'CRASH:' + err.message;
                        }
                    })();
                </script>
            </body>
            </html>
        `;

        const res = await runHeadlessEdge(testHtml, 2500);
        if (!res.stdout.includes('SUCCESS_LIVE_UPDATE')) {
            throw new Error(`Dynamic update failed: ${res.stdout}`);
        }
    });

    await test('2.3 Empty sources array ([]) gracefully displays empty state without exceptions', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>Empty Sources Test</title></head>
            <body>
                <div id="app-mount"></div>
                <div id="test-output">PENDING</div>
                <script>
                    window.__RUSTCORD_SOURCES__ = [];
                    ${injectCode}

                    (async function() {
                        try {
                            navigator.mediaDevices.getDisplayMedia().catch(() => {});
                            const overlay = document.getElementById('rustcord-screenshare-overlay');
                            const grid = document.getElementById('rc-sc-grid');

                            if (grid && grid.innerText.includes('Источники не найдены')) {
                                document.getElementById('test-output').innerText = 'SUCCESS_EMPTY_STATE';
                            } else {
                                document.getElementById('test-output').innerText = 'FAIL: gridText=' + (grid ? grid.innerText : 'null');
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
        if (!res.stdout.includes('SUCCESS_EMPTY_STATE')) {
            throw new Error(`Empty sources state failed: ${res.stdout}`);
        }
    });

    await test('2.4 Malformed source objects ({ id: null }, { id: undefined }, {}) filtered out safely without throwing', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>Malformed Sources Test</title></head>
            <body>
                <div id="app-mount"></div>
                <div id="test-output">PENDING</div>
                <script>
                    window.__RUSTCORD_SOURCES__ = [
                        {},
                        { id: null },
                        { id: undefined },
                        { id: "" },
                        { name: 'Missing ID' },
                        { id: 'window:valid:0', name: 'Valid Window', icon: '' },
                        { id: 'screen:valid:0', name: 'Valid Screen', icon: '' }
                    ];
                    ${injectCode}

                    (async function() {
                        try {
                            navigator.mediaDevices.getDisplayMedia().catch(() => {});
                            const overlay = document.getElementById('rustcord-screenshare-overlay');
                            const grid = document.getElementById('rc-sc-grid');

                            // In apps tab, should only have 1 card
                            const appCards = grid.querySelectorAll('.rc-sc-card');
                            
                            // Switch to screens tab
                            const screenTab = overlay.querySelector('[data-tab="screens"], [data-t="screens"]');
                            screenTab.click();
                            const screenCards = grid.querySelectorAll('.rc-sc-card');

                            if (appCards.length === 1 && screenCards.length === 1) {
                                document.getElementById('test-output').innerText = 'SUCCESS_MALFORMED_HANDLED';
                            } else {
                                document.getElementById('test-output').innerText = 'FAIL: appCount=' + appCards.length + ' screenCount=' + screenCards.length;
                            }
                        } catch (err) {
                            document.getElementById('test-output').innerText = 'CRASH:' + err.message;
                        }
                    })();
                </script>
            </body>
            </html>
        `;

        const res = await runHeadlessEdge(testHtml, 2500);
        if (!res.stdout.includes('SUCCESS_MALFORMED_HANDLED')) {
            throw new Error(`Malformed sources test failed: ${res.stdout}`);
        }
    });

    await test('2.5 Clicking "Прямой эфир" without source selection displays inline warning "Выберите источник" and does NOT submit', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>No Selection Submit Test</title></head>
            <body>
                <div id="app-mount"></div>
                <div id="test-output">PENDING</div>
                <script>
                    let underlyingCalled = false;
                    navigator.mediaDevices.getDisplayMedia = async function() {
                        underlyingCalled = true;
                        return {};
                    };

                    window.__RUSTCORD_SOURCES__ = [{ id: 'screen:0:0', name: 'Main Display', icon: '' }];
                    ${injectCode}

                    (async function() {
                        try {
                            let resolved = false;
                            navigator.mediaDevices.getDisplayMedia().then(() => { resolved = true; });

                            const submitBtn = document.getElementById('rc-sc-submit');
                            const initialText = submitBtn.textContent;

                            // Click submit before picking a source
                            submitBtn.click();

                            const warningText = submitBtn.textContent;
                            const overlay = document.getElementById('rustcord-screenshare-overlay');

                            if (warningText === 'Выберите источник' && !underlyingCalled && !resolved && Boolean(overlay)) {
                                document.getElementById('test-output').innerText = 'SUCCESS_NO_SELECTION_WARNING';
                            } else {
                                document.getElementById('test-output').innerText = 'FAIL: warningText=' + warningText + ' underlyingCalled=' + underlyingCalled + ' resolved=' + resolved;
                            }
                        } catch (err) {
                            document.getElementById('test-output').innerText = 'CRASH:' + err.message;
                        }
                    })();
                </script>
            </body>
            </html>
        `;

        const res = await runHeadlessEdge(testHtml, 2500);
        if (!res.stdout.includes('SUCCESS_NO_SELECTION_WARNING')) {
            throw new Error(`No selection warning failed: ${res.stdout}`);
        }
    });

    // =========================================================================
    // SUITE 3: WebRTC Constraint Propagation Testing
    // =========================================================================
    console.log(`\n${BOLD}--- Suite 3: WebRTC Constraint Propagation (All 4 Permutations) ---${RESET}`);

    const permutations = [
        { res: '720p', fps: '30', expW: 1280, expMaxW: 2560, expH: 720, expMaxH: 1440, expFps: 30 },
        { res: '720p', fps: '60', expW: 1280, expMaxW: 2560, expH: 720, expMaxH: 1440, expFps: 60 },
        { res: '1080p', fps: '30', expW: 1920, expMaxW: 3840, expH: 1080, expMaxH: 2160, expFps: 30 },
        { res: '1080p', fps: '60', expW: 1920, expMaxW: 3840, expH: 1080, expMaxH: 2160, expFps: 60 }
    ];

    for (const p of permutations) {
        await test(`3.1-${p.res}@${p.fps}: Exact constraint propagation to origGetDisplayMedia (${p.expW}x${p.expH} @ ${p.expFps} FPS)`, async () => {
            const testHtml = `
                <!DOCTYPE html>
                <html>
                <head><title>Constraint Test ${p.res}@${p.fps}</title></head>
                <body>
                    <div id="app-mount"></div>
                    <div id="test-output">PENDING</div>
                    <script>
                        window.__CAPTURED_CONSTRAINTS__ = null;
                        navigator.mediaDevices.getDisplayMedia = async function(c) {
                            window.__CAPTURED_CONSTRAINTS__ = c;
                            return { id: 'stream', getTracks: () => [{ stop: () => {} }] };
                        };

                        window.__RUSTCORD_SOURCES__ = [{ id: 'screen:0:0', name: 'Display 1', icon: '' }];
                        ${injectCode}

                        (async function() {
                            try {
                                const prom = navigator.mediaDevices.getDisplayMedia();
                                const overlay = document.getElementById('rustcord-screenshare-overlay');

                                // 1. Select card
                                const card = overlay.querySelector('.rc-sc-card');
                                card.click();

                                // 2. Select resolution
                                const resBtn = overlay.querySelector('#rc-sc-res-group [data-val="${p.res}"]');
                                if (resBtn) resBtn.click();

                                // 3. Select FPS
                                const fpsBtn = overlay.querySelector('#rc-sc-fps-group [data-val="${p.fps}"]');
                                if (fpsBtn) fpsBtn.click();

                                // 4. Submit
                                document.getElementById('rc-sc-submit').click();

                                await prom;

                                const c = window.__CAPTURED_CONSTRAINTS__;
                                if (!c || !c.video) {
                                    document.getElementById('test-output').innerText = 'FAIL_NO_CONSTRAINTS';
                                    return;
                                }

                                const v = c.video;
                                const wOk = (v.width.ideal === ${p.expW} && v.width.max === ${p.expMaxW});
                                const hOk = (v.height.ideal === ${p.expH} && v.height.max === ${p.expMaxH});
                                const fpsOk = (v.frameRate.ideal === ${p.expFps} && v.frameRate.max === ${p.expFps});
                                const audioOk = (c.audio === true && c.systemAudio === 'include');

                                if (wOk && hOk && fpsOk && audioOk) {
                                    document.getElementById('test-output').innerText = 'SUCCESS_CONSTRAINTS_EXACT';
                                } else {
                                    document.getElementById('test-output').innerText = 'FAIL_MISMATCH: ' + JSON.stringify(c);
                                }
                            } catch (err) {
                                document.getElementById('test-output').innerText = 'CRASH:' + err.message;
                            }
                        })();
                    </script>
                </body>
                </html>
            `;

            const res = await runHeadlessEdge(testHtml, 2500);
            if (!res.stdout.includes('SUCCESS_CONSTRAINTS_EXACT')) {
                throw new Error(`Constraints mismatch for ${p.res}@${p.fps}: ${res.stdout}`);
            }
        });
    }

    // =========================================================================
    // FINAL TEST SUITE SUMMARY
    // =========================================================================
    console.log(`\n${BOLD}${CYAN}======================================================================${RESET}`);
    console.log(`${BOLD}   CHALLENGER 2 ADVERSARIAL TEST RESULTS   ${RESET}`);
    console.log(`${BOLD}${CYAN}======================================================================${RESET}`);
    console.log(`  Total Adversarial Checks: ${totalTests}`);
    console.log(`  Passed:                   ${GREEN}${passedTests}${RESET}`);
    console.log(`  Failed:                   ${failedTests > 0 ? RED : GREEN}${failedTests}${RESET}`);
    console.log(`${BOLD}${CYAN}======================================================================${RESET}`);

    if (failedTests > 0) {
        console.log(`\n${BOLD}${RED}✖ ${failedTests} ADVERSARIAL CHECK(S) FAILED.${RESET}\n`);
        process.exit(1);
    } else {
        console.log(`\n${BOLD}${GREEN}✔ 100% ADVERSARIAL EMPIRICAL TESTS PASSED PERFECTLY IN CHROMIUM WEBVIEW2!${RESET}\n`);
        process.exit(0);
    }
}

main().catch(err => {
    console.error('Fatal error running adversarial test runner:', err);
    process.exit(2);
});
