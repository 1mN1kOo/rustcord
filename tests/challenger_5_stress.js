const vm = require('vm');
const fs = require('fs');

const injectCode = fs.readFileSync('C:\\Rustcord\\Rustcord\\src\\inject.js', 'utf8');

function setupSandbox(initialSources = []) {
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
                remove: () => {},
                querySelector: () => null,
                querySelectorAll: () => [],
                addEventListener: () => {}
            };
            return el;
        },
        getElementById: (id) => domElements.get(id) || null,
        querySelector: () => null,
        querySelectorAll: () => [],
        head: { appendChild: () => {} },
        body: { appendChild: () => {} },
        addEventListener: () => {},
        readyState: 'complete'
    };

    const mockNavigator = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        mediaDevices: {
            getUserMedia: async () => ({ id: 'stream' }),
            getDisplayMedia: async () => ({ id: 'display' })
        },
        clipboard: { writeText: async () => {}, readText: async () => '' }
    };

    function MockXHR() {}
    MockXHR.prototype.open = function() {};
    MockXHR.prototype.send = function() {};

    const mockWindow = {
        document: mockDocument,
        navigator: mockNavigator,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => {},
        location: { reload: () => {} },
        __RUSTCORD_SOURCES__: initialSources
    };

    const sandbox = {
        window: mockWindow,
        document: mockDocument,
        navigator: mockNavigator,
        Notification: { permission: 'default', requestPermission: async () => 'granted' },
        XMLHttpRequest: MockXHR,
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
    vm.runInContext(injectCode, context);
    return sandbox;
}

async function runAdversarialStress() {
    console.log('--- Challenger 5 Extended Adversarial Stress Suite ---');
    const sb = setupSandbox();
    const getSources = sb.window.DiscordNative.desktopCapture.getDesktopCaptureSources;

    const testCases = [
        { desc: 'null options', opt: null },
        { desc: 'undefined options', opt: undefined },
        { desc: 'string options', opt: 'not-an-object' },
        { desc: 'number options', opt: 42 },
        { desc: 'function options', opt: () => {} },
        { desc: 'options with types as non-array object', opt: { types: { length: 2, 0: 'screen' } } },
        { desc: 'options with types containing non-strings', opt: { types: [null, undefined, 123, true, {}] } },
        { desc: 'options with types containing symbol', opt: { types: [Symbol('screen')] } },
    ];

    for (const tc of testCases) {
        sb.window.__RUSTCORD_SOURCES__ = [
            { id: 'screen:0:0', name: 'Primary' },
            { id: 'window:123:0', name: 'App' }
        ];
        try {
            const res = await getSources(tc.opt);
            console.log(`[PASS] Case: ${tc.desc} -> Returned ${res.length} sources`);
        } catch (e) {
            console.error(`[FAIL] Case: ${tc.desc} threw:`, e.message);
            process.exit(1);
        }
    }

    const sourceEdgeCases = [
        { desc: '__RUSTCORD_SOURCES__ = null', src: null },
        { desc: '__RUSTCORD_SOURCES__ = undefined', src: undefined },
        { desc: '__RUSTCORD_SOURCES__ = "invalid string"', src: "invalid string" },
        { desc: '__RUSTCORD_SOURCES__ = 12345', src: 12345 },
        { desc: '__RUSTCORD_SOURCES__ = {}', src: {} },
        { desc: '__RUSTCORD_SOURCES__ = { length: 5 }', src: { length: 5 } },
        { desc: '__RUSTCORD_SOURCES__ = [null, undefined, false, 0, "", {}]', src: [null, undefined, false, 0, "", {}] },
        { desc: '__RUSTCORD_SOURCES__ = [{ id: Symbol("screen:0:0") }]', src: [{ id: Symbol("screen:0:0") }] },
        { desc: '__RUSTCORD_SOURCES__ with circular reference object', src: (() => { const o = { id: 1 }; o.self = o; return [o]; })() },
        { desc: '__RUSTCORD_SOURCES__ with custom primitive symbol', src: [{ id: { [Symbol.toPrimitive]: () => "screen:0:0" }, name: "Custom Primitive" }] },
    ];

    for (const sc of sourceEdgeCases) {
        sb.window.__RUSTCORD_SOURCES__ = sc.src;
        try {
            const res = await getSources({ types: ['screen', 'window'] });
            console.log(`[PASS] Source Case: ${sc.desc} -> Returned ${res.length} sources`);
        } catch (e) {
            console.error(`[FAIL] Source Case: ${sc.desc} threw:`, e.message);
            process.exit(1);
        }
    }

    console.log('\n======================================================================');
    console.log('   ALL EXTENDED ADVERSARIAL CASES PASSED 100%!                        ');
    console.log('======================================================================');
    process.exit(0);
}

runAdversarialStress();
