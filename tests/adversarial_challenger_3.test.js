// adversarial_challenger_3.test.js
// Master Empirical Adversarial Stress Test Suite for DiscordNative & DesktopCapture Emulation Bridge
// Invocation: node C:\Rustcord\Rustcord\tests\adversarial_challenger_3.test.js
// Author: Challenger 3 (DiscordNative & DesktopCapture Adversarial Challenger)

const fs = require('fs');
const path = require('path');
const vm = require('vm');
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
        testDetails.push({ name, status: 'FAIL', duration, error: err.message, stack: err.stack });
    }
}

function createTestEnvironment(customSetup = {}) {
    let lastGetUserMediaArgs = null;
    let lastGetDisplayMediaArgs = null;
    let getUserMediaCallCount = 0;
    let getDisplayMediaCallCount = 0;

    const mockOrigGetUserMedia = async function(constraints) {
        getUserMediaCallCount++;
        lastGetUserMediaArgs = constraints;
        return {
            id: 'mock-user-media-stream',
            getTracks: () => [{ kind: 'video', stop: () => {} }]
        };
    };

    const mockOrigGetDisplayMedia = async function(constraints) {
        getDisplayMediaCallCount++;
        lastGetDisplayMediaArgs = constraints;
        return {
            id: 'mock-display-media-stream',
            getTracks: () => [{ kind: 'video', stop: () => {}, getConstraints: () => constraints }]
        };
    };

    const domElements = new Map();

    const mockDocument = {
        documentElement: { style: {} },
        createElement: (tag) => {
            const el = {
                tagName: tag.toUpperCase(),
                id: '',
                className: '',
                style: {},
                children: [],
                parentNode: null,
                appendChild: (ch) => { ch.parentNode = el; el.children.push(ch); return ch; },
                remove: () => {
                    if (el.parentNode && el.parentNode.children) {
                        const idx = el.parentNode.children.indexOf(el);
                        if (idx !== -1) el.parentNode.children.splice(idx, 1);
                    }
                    if (el.id) domElements.delete(el.id);
                },
                querySelector: () => null,
                querySelectorAll: () => [],
                addEventListener: () => {}
            };
            return el;
        },
        getElementById: (id) => domElements.get(id) || null,
        querySelector: (sel) => {
            if (sel.startsWith('#')) return domElements.get(sel.slice(1)) || null;
            return null;
        },
        querySelectorAll: () => [],
        head: { appendChild: (el) => { if (el && el.id) domElements.set(el.id, el); } },
        body: { appendChild: (el) => { if (el && el.id) domElements.set(el.id, el); } },
        addEventListener: () => {},
        readyState: 'complete'
    };

    const mockNavigator = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        mediaDevices: {
            getUserMedia: mockOrigGetUserMedia,
            getDisplayMedia: mockOrigGetDisplayMedia
        },
        clipboard: {
            writeText: async () => {},
            readText: async () => 'mock-clipboard-content'
        }
    };

    const mockWindow = {
        document: mockDocument,
        navigator: mockNavigator,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => {},
        location: { reload: () => {} },
        __RUSTCORD_SOURCES__: customSetup.initialSources !== undefined ? customSetup.initialSources : []
    };

    const sandbox = {
        window: mockWindow,
        document: mockDocument,
        navigator: mockNavigator,
        Notification: {
            permission: 'default',
            requestPermission: async () => 'granted'
        },
        XMLHttpRequest: function() {
            this.open = () => {};
            this.send = () => {};
        },
        Response: function() {},
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        Promise,
        console,
        Buffer,
        Array,
        Object,
        String,
        Number,
        Boolean,
        Map,
        Set,
        Error,
        TypeError
    };

    const context = vm.createContext(sandbox);

    // Run injectCode in this context
    vm.runInContext(injectCode, context);

    return {
        context,
        sandbox,
        mockWindow,
        getCalls: () => ({
            getUserMediaCount: getUserMediaCallCount,
            lastGetUserMediaArgs,
            getDisplayMediaCount: getDisplayMediaCallCount,
            lastGetDisplayMediaArgs
        }),
        domElements
    };
}

async function main() {
    console.log(`${BOLD}${CYAN}======================================================================${RESET}`);
    console.log(`${BOLD}${CYAN}   CHALLENGER 3: DISCORDNATIVE & DESKTOPCAPTURE ADVERSARIAL SUITE     ${RESET}`);
    console.log(`${BOLD}${CYAN}======================================================================${RESET}\n`);

    // =========================================================================
    // SUITE 1: window.DiscordNative.desktopCapture.getDesktopCaptureSources(options)
    // =========================================================================
    console.log(`${BOLD}--- Suite 1: getDesktopCaptureSources Adversarial Input Stress Testing ---${RESET}`);

    await test('1.1 Call with no arguments `getDesktopCaptureSources()` returns all sources matching schema', async () => {
        const env = createTestEnvironment({
            initialSources: [
                { id: 'screen:0:0', name: 'Primary Display', url: 'data:image/svg+xml;1', icon: 'data:image/png;1' },
                { id: 'window:1234:0', name: 'Visual Studio Code', url: 'data:image/svg+xml;2', icon: 'data:image/png;2' }
            ]
        });

        const sources = await env.sandbox.window.DiscordNative.desktopCapture.getDesktopCaptureSources();
        if (!Array.isArray(sources)) throw new Error('Result is not an array');
        if (sources.length !== 2) throw new Error(`Expected 2 sources, got ${sources.length}`);

        for (const s of sources) {
            if (typeof s.id !== 'string') throw new Error(`Source id must be string, got ${typeof s.id}`);
            if (typeof s.name !== 'string') throw new Error(`Source name must be string, got ${typeof s.name}`);
            if (typeof s.url !== 'string') throw new Error(`Source url must be string, got ${typeof s.url}`);
            if (s.icon !== undefined && typeof s.icon !== 'string') throw new Error(`Source icon must be string or undefined`);
        }
    });

    await test('1.2 Call with empty options object `getDesktopCaptureSources({})` defaults to screen + window', async () => {
        const env = createTestEnvironment({
            initialSources: [
                { id: 'screen:0:0', name: 'Screen 1', url: 'url1' },
                { id: 'window:42:0', name: 'Firefox', url: 'url2' }
            ]
        });

        const sources = await env.sandbox.window.DiscordNative.desktopCapture.getDesktopCaptureSources({});
        if (sources.length !== 2) throw new Error(`Expected 2 sources, got ${sources.length}`);
        if (sources[0].id !== 'screen:0:0' || sources[1].id !== 'window:42:0') {
            throw new Error(`Unexpected sources: ${JSON.stringify(sources)}`);
        }
    });

    await test('1.3 Call with `types: ["screen"]` filters strictly to screen sources only', async () => {
        const env = createTestEnvironment({
            initialSources: [
                { id: 'screen:0:0', name: 'Display 1', url: 'url1' },
                { id: 'screen:1:0', name: 'Display 2', url: 'url2' },
                { id: 'window:99:0', name: 'Terminal', url: 'url3' }
            ]
        });

        const sources = await env.sandbox.window.DiscordNative.desktopCapture.getDesktopCaptureSources({ types: ['screen'] });
        if (sources.length !== 2) throw new Error(`Expected 2 screen sources, got ${sources.length}`);
        if (!sources.every(s => s.id.startsWith('screen:'))) {
            throw new Error(`Contained non-screen source: ${JSON.stringify(sources)}`);
        }
    });

    await test('1.4 Call with `types: ["window"]` filters strictly to window sources only and does NOT inject fallback screen', async () => {
        const env = createTestEnvironment({
            initialSources: [
                { id: 'screen:0:0', name: 'Display 1', url: 'url1' },
                { id: 'window:99:0', name: 'Terminal', url: 'url2' },
                { id: 'window:100:0', name: 'Telegram', url: 'url3' }
            ]
        });

        const sources = await env.sandbox.window.DiscordNative.desktopCapture.getDesktopCaptureSources({ types: ['window'] });
        if (sources.length !== 2) throw new Error(`Expected 2 window sources, got ${sources.length}`);
        if (!sources.every(s => s.id.startsWith('window:'))) {
            throw new Error(`Contained non-window source: ${JSON.stringify(sources)}`);
        }
    });

    await test('1.5 Case insensitivity: `types: ["SCREEN", "WiNdOw"]` correctly matches both screens and windows', async () => {
        const env = createTestEnvironment({
            initialSources: [
                { id: 'screen:0:0', name: 'Display 1', url: 'url1' },
                { id: 'window:99:0', name: 'Terminal', url: 'url2' }
            ]
        });

        const sources = await env.sandbox.window.DiscordNative.desktopCapture.getDesktopCaptureSources({ types: ['SCREEN', 'WiNdOw'] });
        if (sources.length !== 2) throw new Error(`Expected 2 sources, got ${sources.length}`);
    });

    await test('1.6 Unsupported types `types: ["unknown", "virtual"]` returns empty array [] without throwing or injecting screen fallback', async () => {
        const env = createTestEnvironment({
            initialSources: [
                { id: 'screen:0:0', name: 'Display 1', url: 'url1' },
                { id: 'window:99:0', name: 'Terminal', url: 'url2' }
            ]
        });

        const sources = await env.sandbox.window.DiscordNative.desktopCapture.getDesktopCaptureSources({ types: ['unknown', 'virtual'] });
        if (!Array.isArray(sources) || sources.length !== 0) {
            throw new Error(`Expected empty array [], got ${JSON.stringify(sources)}`);
        }
    });

    await test('1.7 Empty types array `types: []` returns empty array []', async () => {
        const env = createTestEnvironment({
            initialSources: [
                { id: 'screen:0:0', name: 'Display 1', url: 'url1' }
            ]
        });

        const sources = await env.sandbox.window.DiscordNative.desktopCapture.getDesktopCaptureSources({ types: [] });
        if (!Array.isArray(sources) || sources.length !== 0) {
            throw new Error(`Expected empty array [], got ${JSON.stringify(sources)}`);
        }
    });

    await test('1.8 Fallback behavior when __RUSTCORD_SOURCES__ is empty `[]` produces primary screen fallback (screen:0:0, "Весь экран")', async () => {
        const env = createTestEnvironment({ initialSources: [] });

        const sources = await env.sandbox.window.DiscordNative.desktopCapture.getDesktopCaptureSources();
        if (sources.length !== 1) throw new Error(`Expected 1 fallback source, got ${sources.length}`);
        const fallback = sources[0];
        if (fallback.id !== 'screen:0:0') throw new Error(`Fallback id must be screen:0:0, got ${fallback.id}`);
        if (fallback.name !== 'Весь экран') throw new Error(`Fallback name must be 'Весь экран', got ${fallback.name}`);
        if (!fallback.url.startsWith('data:image/svg+xml')) throw new Error(`Fallback url must be SVG data URI`);
    });

    await test('1.9 Fallback behavior when __RUSTCORD_SOURCES__ is null or undefined handles gracefully without TypeError', async () => {
        const envNull = createTestEnvironment({ initialSources: null });
        const sourcesNull = await envNull.sandbox.window.DiscordNative.desktopCapture.getDesktopCaptureSources();
        if (sourcesNull.length !== 1 || sourcesNull[0].id !== 'screen:0:0') {
            throw new Error(`Null sources failed fallback: ${JSON.stringify(sourcesNull)}`);
        }

        const envUndef = createTestEnvironment({ initialSources: undefined });
        const sourcesUndef = await envUndef.sandbox.window.DiscordNative.desktopCapture.getDesktopCaptureSources();
        if (sourcesUndef.length !== 1 || sourcesUndef[0].id !== 'screen:0:0') {
            throw new Error(`Undefined sources failed fallback: ${JSON.stringify(sourcesUndef)}`);
        }
    });

    await test('1.10 Malformed source items in __RUSTCORD_SOURCES__ (null, undefined, missing fields) filtered safely', async () => {
        const env = createTestEnvironment({
            initialSources: [
                null,
                undefined,
                {},
                { id: null },
                { id: undefined },
                { id: '' },
                { name: 'Missing ID' },
                { id: 'screen:valid:0', name: undefined, url: null, icon: null },
                { id: 'window:valid:0' }
            ]
        });

        const sources = await env.sandbox.window.DiscordNative.desktopCapture.getDesktopCaptureSources();
        if (sources.length !== 2) throw new Error(`Expected 2 valid sources, got ${sources.length}`);

        const screenSrc = sources.find(s => s.id === 'screen:valid:0');
        if (!screenSrc) throw new Error('screen:valid:0 not found');
        if (screenSrc.name !== 'Unknown Window') throw new Error(`Expected default name 'Unknown Window', got '${screenSrc.name}'`);
        if (screenSrc.url !== '') throw new Error(`Expected default url '', got '${screenSrc.url}'`);
        if (screenSrc.icon !== undefined) throw new Error(`Expected undefined icon for null input, got ${screenSrc.icon}`);

        const winSrc = sources.find(s => s.id === 'window:valid:0');
        if (!winSrc) throw new Error('window:valid:0 not found');
        if (winSrc.name !== 'Unknown Window') throw new Error(`Expected 'Unknown Window', got ${winSrc.name}`);
    });

    await test('1.11 Adversarial non-string ID objects in __RUSTCORD_SOURCES__ (numbers, booleans, objects)', async () => {
        // Test how robust the filter is when non-string IDs are passed
        const env = createTestEnvironment({
            initialSources: [
                { id: 12345, name: 'Numeric ID' },
                { id: true, name: 'Boolean ID' },
                { id: {}, name: 'Object ID' },
                { id: 'window:safe:0', name: 'Safe Window' }
            ]
        });

        let thrown = false;
        let sources = null;
        try {
            sources = await env.sandbox.window.DiscordNative.desktopCapture.getDesktopCaptureSources();
        } catch (e) {
            thrown = true;
            // Documenting if non-string IDs trigger startsWith error
            throw new Error(`Adversarial failure: non-string id crashed getDesktopCaptureSources: ${e.message}`);
        }
        if (!sources || sources.length !== 1 || sources[0].id !== 'window:safe:0') {
            throw new Error(`Unexpected result with non-string IDs: ${JSON.stringify(sources)}`);
        }
    });

    await test('1.12 Dynamic startup race: __RUSTCORD_SOURCES__ populated after 250ms during retry loop resolves with new sources', async () => {
        const env = createTestEnvironment({ initialSources: [] });

        // Launch call while sources are empty
        const promise = env.sandbox.window.DiscordNative.desktopCapture.getDesktopCaptureSources();

        // Simulate windows_capture.rs delivering sources after 250ms
        setTimeout(() => {
            env.sandbox.window.__RUSTCORD_SOURCES__ = [
                { id: 'screen:0:0', name: 'Late Captured Display', url: 'late-url' }
            ];
        }, 250);

        const sources = await promise;
        if (sources.length !== 1) throw new Error(`Expected 1 source, got ${sources.length}`);
        if (sources[0].name !== 'Late Captured Display') {
            throw new Error(`Expected 'Late Captured Display', got '${sources[0].name}'`);
        }
    });

    await test('1.13 High-concurrency stress: 50 simultaneous calls to getDesktopCaptureSources while mutating __RUSTCORD_SOURCES__', async () => {
        const env = createTestEnvironment({
            initialSources: [
                { id: 'screen:0:0', name: 'Screen 0', url: 'u0' },
                { id: 'window:1:0', name: 'Window 1', url: 'u1' }
            ]
        });

        const promises = [];
        for (let i = 0; i < 50; i++) {
            // Rapidly mutate sources array mid-flight
            if (i % 5 === 0) {
                env.sandbox.window.__RUSTCORD_SOURCES__ = [
                    { id: 'screen:0:0', name: `Screen Mutation ${i}`, url: `u${i}` },
                    { id: `window:${i}:0`, name: `Window ${i}`, url: `uw${i}` }
                ];
            }
            promises.push(env.sandbox.window.DiscordNative.desktopCapture.getDesktopCaptureSources());
        }

        const results = await Promise.all(promises);
        if (results.length !== 50) throw new Error(`Expected 50 results, got ${results.length}`);
        for (const res of results) {
            if (!Array.isArray(res) || res.length === 0) {
                throw new Error(`One of the concurrent calls returned invalid result: ${JSON.stringify(res)}`);
            }
        }
    });

    await test('1.14 Adversarial non-array __RUSTCORD_SOURCES__ (e.g. object, string, number)', async () => {
        const env = createTestEnvironment({ initialSources: { corrupt: true } });
        try {
            await env.sandbox.window.DiscordNative.desktopCapture.getDesktopCaptureSources();
        } catch (e) {
            throw new Error(`Adversarial failure: non-array __RUSTCORD_SOURCES__ crashed getDesktopCaptureSources: ${e.message}`);
        }
    });

    // =========================================================================
    // SUITE 2: WebRTC Interceptors (getUserMedia & getDisplayMedia)
    // =========================================================================
    console.log(`\n${BOLD}--- Suite 2: WebRTC Interceptors Adversarial Stress Testing ---${RESET}`);

    await test('2.1 getUserMedia desktop capture detection via video.mandatory.chromeMediaSource === "desktop"', async () => {
        const env = createTestEnvironment({});
        const constraints = {
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    maxWidth: 2560,
                    maxHeight: 1440,
                    maxFrameRate: 30
                }
            },
            audio: true
        };

        const stream = await env.sandbox.navigator.mediaDevices.getUserMedia(constraints);
        const calls = env.getCalls();

        if (calls.getDisplayMediaCount !== 1) {
            throw new Error(`Expected getDisplayMedia to be called once, got ${calls.getDisplayMediaCount}`);
        }
        if (calls.getUserMediaCount !== 0) {
            throw new Error(`Expected getUserMedia not to be called, got ${calls.getUserMediaCount}`);
        }

        const effective = calls.lastGetDisplayMediaArgs;
        if (!effective || !effective.video) throw new Error('Missing forwarded display constraints');
        if (effective.video.width.ideal !== 2560 || effective.video.width.max !== 2560) {
            throw new Error(`Width mismatch: ${JSON.stringify(effective.video.width)}`);
        }
        if (effective.video.height.ideal !== 1440 || effective.video.height.max !== 1440) {
            throw new Error(`Height mismatch: ${JSON.stringify(effective.video.height)}`);
        }
        if (effective.video.frameRate.ideal !== 30 || effective.video.frameRate.max !== 30) {
            throw new Error(`FrameRate mismatch: ${JSON.stringify(effective.video.frameRate)}`);
        }
        if (effective.audio !== true || effective.systemAudio !== 'include') {
            throw new Error(`Audio constraints mismatch: ${JSON.stringify(effective)}`);
        }
    });

    await test('2.2 getUserMedia desktop capture detection via top-level video.chromeMediaSource === "desktop"', async () => {
        const env = createTestEnvironment({});
        const constraints = {
            video: {
                chromeMediaSource: 'desktop',
                width: 1280,
                height: 720,
                frameRate: 60
            },
            audio: false
        };

        await env.sandbox.navigator.mediaDevices.getUserMedia(constraints);
        const calls = env.getCalls();

        if (calls.getDisplayMediaCount !== 1) {
            throw new Error(`Expected getDisplayMedia to be called, got ${calls.getDisplayMediaCount}`);
        }
        const effective = calls.lastGetDisplayMediaArgs;
        if (effective.video.width.ideal !== 1280 || effective.video.height.ideal !== 720 || effective.video.frameRate.ideal !== 60) {
            throw new Error(`Constraints mismatch: ${JSON.stringify(effective)}`);
        }
        if (effective.audio !== false) {
            throw new Error(`Audio should be false, got ${effective.audio}`);
        }
    });

    await test('2.3 getUserMedia non-desktop constraints pass through to origGetUserMedia unmodified', async () => {
        const env = createTestEnvironment({});

        // Standard camera + mic
        const camConstraints = { video: true, audio: true };
        await env.sandbox.navigator.mediaDevices.getUserMedia(camConstraints);

        // Audio only
        const micConstraints = { audio: { echoCancellation: true } };
        await env.sandbox.navigator.mediaDevices.getUserMedia(micConstraints);

        const calls = env.getCalls();
        if (calls.getUserMediaCount !== 2) {
            throw new Error(`Expected 2 calls to origGetUserMedia, got ${calls.getUserMediaCount}`);
        }
        if (calls.getDisplayMediaCount !== 0) {
            throw new Error(`Expected 0 calls to origGetDisplayMedia, got ${calls.getDisplayMediaCount}`);
        }
    });

    await test('2.4 getUserMedia edge cases (null, undefined, empty object) pass through without throwing', async () => {
        const env = createTestEnvironment({});

        await env.sandbox.navigator.mediaDevices.getUserMedia(null);
        await env.sandbox.navigator.mediaDevices.getUserMedia(undefined);
        await env.sandbox.navigator.mediaDevices.getUserMedia({});

        const calls = env.getCalls();
        if (calls.getUserMediaCount !== 3) {
            throw new Error(`Expected 3 calls to origGetUserMedia, got ${calls.getUserMediaCount}`);
        }
    });

    await test('2.5 getDisplayMedia passes through to origGetDisplayMedia directly and NEVER creates #rustcord-screenshare-overlay', async () => {
        const env = createTestEnvironment({});

        // Check DOM before
        if (env.sandbox.document.getElementById('rustcord-screenshare-overlay')) {
            throw new Error('Overlay DOM existed before call');
        }

        const customConstraints = {
            video: { width: 1920, height: 1080, frameRate: 60 },
            audio: true
        };

        const stream = await env.sandbox.navigator.mediaDevices.getDisplayMedia(customConstraints);
        const calls = env.getCalls();

        if (calls.getDisplayMediaCount !== 1) {
            throw new Error(`Expected 1 call to origGetDisplayMedia, got ${calls.getDisplayMediaCount}`);
        }
        if (calls.lastGetDisplayMediaArgs !== customConstraints) {
            throw new Error('Custom constraints were not passed through directly');
        }

        // Check DOM during / after
        if (env.sandbox.document.getElementById('rustcord-screenshare-overlay')) {
            throw new Error('VIOLATION: #rustcord-screenshare-overlay was injected into DOM during getDisplayMedia');
        }
    });

    await test('2.6 getDisplayMedia with no arguments supplies default 1080p60 effective constraints', async () => {
        const env = createTestEnvironment({});

        await env.sandbox.navigator.mediaDevices.getDisplayMedia();
        const calls = env.getCalls();

        const effective = calls.lastGetDisplayMediaArgs;
        if (!effective || !effective.video) throw new Error('Missing default constraints');
        if (effective.video.width.ideal !== 1920 || effective.video.width.max !== 3840) {
            throw new Error(`Default width mismatch: ${JSON.stringify(effective.video.width)}`);
        }
        if (effective.video.height.ideal !== 1080 || effective.video.height.max !== 2160) {
            throw new Error(`Default height mismatch: ${JSON.stringify(effective.video.height)}`);
        }
        if (effective.video.frameRate.ideal !== 60 || effective.video.frameRate.max !== 60) {
            throw new Error(`Default frameRate mismatch: ${JSON.stringify(effective.video.frameRate)}`);
        }
        if (effective.audio !== true || effective.systemAudio !== 'include') {
            throw new Error(`Default audio mismatch: ${JSON.stringify(effective)}`);
        }
    });

    // =========================================================================
    // SUITE 3: Platform Properties & DiscordNative API Surface
    // =========================================================================
    console.log(`\n${BOLD}--- Suite 3: Platform Properties & DiscordNative API Surface ---${RESET}`);

    await test('3.1 window.DiscordNative sentinel exists, is an object, and isRenderer === true', async () => {
        const env = createTestEnvironment({});
        const dn = env.sandbox.window.DiscordNative;
        if (!dn || typeof dn !== 'object') throw new Error('window.DiscordNative is not an object');
        if (dn.isRenderer !== true) throw new Error(`Expected isRenderer === true, got ${dn.isRenderer}`);
    });

    await test('3.2 DiscordNative.app conforms to Discord Desktop 1.0.9267 contract', async () => {
        const env = createTestEnvironment({});
        const app = env.sandbox.window.DiscordNative.app;
        if (!app) throw new Error('DiscordNative.app is missing');

        if (app.getVersion() !== '1.0.9267') throw new Error(`Expected '1.0.9267', got '${app.getVersion()}'`);
        if (app.getReleaseChannel() !== 'stable') throw new Error(`Expected 'stable', got '${app.getReleaseChannel()}'`);
        if (app.getBuildNumber() !== 9267) throw new Error(`Expected 9267, got ${app.getBuildNumber()}`);

        const dbl = await app.getDefaultDoubleClickAction();
        if (dbl !== 'Maximize') throw new Error(`Expected 'Maximize', got '${dbl}'`);

        if (typeof app.relaunch !== 'function') throw new Error('app.relaunch is not a function');
        if (typeof app.setBadge !== 'function') throw new Error('app.setBadge is not a function');
        if (!app.dock || typeof app.dock.setBadge !== 'function' || typeof app.dock.bounce !== 'function') {
            throw new Error('app.dock stubs missing');
        }
    });

    await test('3.3 DiscordNative.process satisfies platform detection (platform: "win32", arch: "x64")', async () => {
        const env = createTestEnvironment({});
        const proc = env.sandbox.window.DiscordNative.process;
        if (!proc) throw new Error('DiscordNative.process is missing');
        if (proc.platform !== 'win32') throw new Error(`Expected 'win32', got '${proc.platform}'`);
        if (proc.arch !== 'x64') throw new Error(`Expected 'x64', got '${proc.arch}'`);
        if (typeof proc.env !== 'object') throw new Error('proc.env must be an object');
    });

    await test('3.4 DiscordNative.os satisfies OS detection (release: "10.0.19045", arch: "x64")', async () => {
        const env = createTestEnvironment({});
        const os = env.sandbox.window.DiscordNative.os;
        if (!os) throw new Error('DiscordNative.os is missing');
        if (os.release !== '10.0.19045') throw new Error(`Expected '10.0.19045', got '${os.release}'`);
        if (os.arch !== 'x64') throw new Error(`Expected 'x64', got '${os.arch}'`);
        if (os.appArch !== 'x64') throw new Error(`Expected 'x64', got '${os.appArch}'`);
        if (os.systemVersion !== '10.0.19045') throw new Error(`Expected '10.0.19045', got '${os.systemVersion}'`);
    });

    await test('3.5 DiscordNative.settings satisfies get/set promises', async () => {
        const env = createTestEnvironment({});
        const settings = env.sandbox.window.DiscordNative.settings;
        if (!settings) throw new Error('DiscordNative.settings is missing');

        const val = await settings.get('test_key', 'fallback_val');
        if (val !== 'fallback_val') throw new Error(`Expected 'fallback_val', got '${val}'`);

        const setVal = await settings.set('test_key', 'new_val');
        if (setVal !== 'new_val') throw new Error(`Expected 'new_val', got '${setVal}'`);
    });

    await test('3.6 DiscordNative.gpuSettings returns hardware acceleration true', async () => {
        const env = createTestEnvironment({});
        const gpu = env.sandbox.window.DiscordNative.gpuSettings;
        if (!gpu) throw new Error('DiscordNative.gpuSettings is missing');
        if (typeof gpu.setChromiumSwitches !== 'function') throw new Error('setChromiumSwitches missing');
        if (gpu.getEnableHardwareAcceleration() !== true) throw new Error('getEnableHardwareAcceleration should be true');
    });

    await test('3.7 DiscordNative.window stubs exist and getMediaSourceId() returns null', async () => {
        const env = createTestEnvironment({});
        const win = env.sandbox.window.DiscordNative.window;
        if (!win) throw new Error('DiscordNative.window is missing');

        const sourceId = await win.getMediaSourceId();
        if (sourceId !== null) throw new Error(`Expected null, got ${sourceId}`);

        const fns = ['flashFrame', 'setProgressBar', 'minimize', 'maximize', 'restore', 'close', 'focus'];
        for (const fn of fns) {
            if (typeof win[fn] !== 'function') throw new Error(`DiscordNative.window.${fn} is not a function`);
        }
    });

    await test('3.8 DiscordNative.ipc stubs exist and invoke() returns null', async () => {
        const env = createTestEnvironment({});
        const ipc = env.sandbox.window.DiscordNative.ipc;
        if (!ipc) throw new Error('DiscordNative.ipc is missing');
        if (typeof ipc.send !== 'function') throw new Error('ipc.send is not a function');
        if (typeof ipc.on !== 'function') throw new Error('ipc.on is not a function');

        const res = await ipc.invoke('test');
        if (res !== null) throw new Error(`Expected null, got ${res}`);
    });

    await test('3.9 DiscordNative.features supports() returns false', async () => {
        const env = createTestEnvironment({});
        const feat = env.sandbox.window.DiscordNative.features;
        if (!feat) throw new Error('DiscordNative.features is missing');
        if (feat.supports('ANY_FEATURE') !== false) throw new Error('supports() should return false');
        if (typeof feat.declareSupported !== 'function') throw new Error('declareSupported should be a function');
    });

    await test('3.10 DiscordNative.powerSaveBlocker blockDisplaySleep returns integer handle', async () => {
        const env = createTestEnvironment({});
        const psb = env.sandbox.window.DiscordNative.powerSaveBlocker;
        if (!psb) throw new Error('DiscordNative.powerSaveBlocker is missing');
        const handle = psb.blockDisplaySleep();
        if (typeof handle !== 'number' || handle <= 0) throw new Error(`Expected positive number handle, got ${handle}`);
    });

    await test('3.11 DiscordNative.nativeModules correctly provides discord_utils stubs', async () => {
        const env = createTestEnvironment({});
        const nm = env.sandbox.window.DiscordNative.nativeModules;
        if (!nm) throw new Error('DiscordNative.nativeModules is missing');
        if (nm.hasUpdater !== false) throw new Error('hasUpdater should be false');
        if (nm.canLoadNativeModules !== false) throw new Error('canLoadNativeModules should be false');

        const utils = nm.requireModule('discord_utils');
        if (!utils) throw new Error('requireModule("discord_utils") returned null');
        if (utils.isSystemDarkMode() !== true) throw new Error('isSystemDarkMode should be true');
        if (utils.getDiscordIsElevated() !== false) throw new Error('getDiscordIsElevated should be false');
        if (utils.shouldDisplayNotifications() !== false) throw new Error('shouldDisplayNotifications should be false');

        const unknown = nm.requireModule('non_existent');
        if (unknown !== null) throw new Error(`Expected null for unknown module, got ${unknown}`);
    });

    await test('3.12 DiscordNative.clipboard copy and read stubs exist and operate safely', async () => {
        const env = createTestEnvironment({});
        const clip = env.sandbox.window.DiscordNative.clipboard;
        if (!clip) throw new Error('DiscordNative.clipboard is missing');
        clip.copy('test text');
        const text = await clip.read();
        if (typeof text !== 'string') throw new Error(`Expected string from clipboard.read, got ${typeof text}`);
    });

    // =========================================================================
    // SUITE 4: Real Microsoft Edge Headless E2E Execution
    // =========================================================================
    console.log(`\n${BOLD}--- Suite 4: Real Microsoft Edge Headless E2E Verification ---${RESET}`);

    await test('4.1 Real Headless Edge: inject.js evaluates without syntax errors and exposes DiscordNative on window', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>Edge DiscordNative Verification</title></head>
            <body>
                <div id="test-output">PENDING</div>
                <script>
                    ${injectCode}

                    (async function() {
                        try {
                            const dn = window.DiscordNative;
                            if (!dn) {
                                document.getElementById('test-output').innerText = 'FAIL_NO_DISCORDNATIVE';
                                return;
                            }
                            const ver = dn.app.getVersion();
                            const platform = dn.process.platform;
                            const isRenderer = dn.isRenderer;
                            const hasCapture = typeof dn.desktopCapture.getDesktopCaptureSources === 'function';

                            if (ver === '1.0.9267' && platform === 'win32' && isRenderer === true && hasCapture) {
                                document.getElementById('test-output').innerText = 'SUCCESS_EDGE_DISCORDNATIVE';
                            } else {
                                document.getElementById('test-output').innerText = 'FAIL_VALUES: ' + ver + ', ' + platform + ', ' + isRenderer;
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
        if (!res.stdout.includes('SUCCESS_EDGE_DISCORDNATIVE')) {
            throw new Error(`Edge DiscordNative verification failed: ${res.stdout}`);
        }
    });

    await test('4.2 Real Headless Edge: getDesktopCaptureSources() returns fallback screen:0:0 when sources empty', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>Edge DesktopCapture Sources Fallback</title></head>
            <body>
                <div id="test-output">PENDING</div>
                <script>
                    window.__RUSTCORD_SOURCES__ = [];
                    ${injectCode}

                    (async function() {
                        try {
                            const sources = await window.DiscordNative.desktopCapture.getDesktopCaptureSources();
                            if (sources.length === 1 && sources[0].id === 'screen:0:0' && sources[0].name === 'Весь экран') {
                                document.getElementById('test-output').innerText = 'SUCCESS_EDGE_SOURCES_FALLBACK';
                            } else {
                                document.getElementById('test-output').innerText = 'FAIL_SOURCES: ' + JSON.stringify(sources);
                            }
                        } catch (err) {
                            document.getElementById('test-output').innerText = 'CRASH:' + err.message;
                        }
                    })();
                </script>
            </body>
            </html>
        `;

        const res = await runHeadlessEdge(testHtml, 3500);
        if (!res.stdout.includes('SUCCESS_EDGE_SOURCES_FALLBACK')) {
            throw new Error(`Edge sources fallback failed: ${res.stdout}`);
        }
    });

    await test('4.3 Real Headless Edge: navigator.mediaDevices.getDisplayMedia() does NOT inject #rustcord-screenshare-overlay into DOM', async () => {
        const testHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>Edge GetDisplayMedia DOM Cleanliness</title></head>
            <body>
                <div id="test-output">PENDING</div>
                <script>
                    // Mock origGetDisplayMedia in browser context
                    const origGDM = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
                    navigator.mediaDevices.getDisplayMedia = async function(c) {
                        return { id: 'mock-stream', getTracks: () => [] };
                    };

                    ${injectCode}

                    (async function() {
                        try {
                            await navigator.mediaDevices.getDisplayMedia();
                            const overlay = document.getElementById('rustcord-screenshare-overlay');
                            if (overlay === null) {
                                document.getElementById('test-output').innerText = 'SUCCESS_EDGE_NO_OVERLAY';
                            } else {
                                document.getElementById('test-output').innerText = 'FAIL_OVERLAY_DETECTED';
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
        if (!res.stdout.includes('SUCCESS_EDGE_NO_OVERLAY')) {
            throw new Error(`Edge getDisplayMedia DOM check failed: ${res.stdout}`);
        }
    });

    // =========================================================================
    // FINAL REPORT & SUMMARY
    // =========================================================================
    console.log(`\n${BOLD}${CYAN}======================================================================${RESET}`);
    console.log(`${BOLD}${CYAN}   CHALLENGER 3 ADVERSARIAL TEST SUMMARY                              ${RESET}`);
    console.log(`${BOLD}${CYAN}======================================================================${RESET}`);
    console.log(`  Total Adversarial Tests: ${totalTests}`);
    console.log(`  Passed:                  ${GREEN}${passedTests}${RESET}`);
    console.log(`  Failed:                  ${failedTests > 0 ? RED : GREEN}${failedTests}${RESET}`);
    console.log(`${BOLD}${CYAN}======================================================================${RESET}\n`);

    if (failedTests > 0) {
        console.error(`${RED}One or more adversarial tests failed! Details above.${RESET}`);
        process.exit(1);
    } else {
        console.log(`${GREEN}All adversarial tests passed with flying colors!${RESET}`);
        process.exit(0);
    }
}

main().catch(err => {
    console.error(`Fatal suite error: ${err.message}`);
    process.exit(1);
});
