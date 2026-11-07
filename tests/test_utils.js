// test_utils.js - Shared utilities, assertions, DOM environment, and Edge headless runner
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const INJECT_JS_PATH = path.join(PROJECT_ROOT, 'src', 'inject.js');
const ASSETS_PATH = path.join(PROJECT_ROOT, 'discord_assets');
const RELEASE_EXE_PATH = path.join(PROJECT_ROOT, 'target', 'release', 'rustcord.exe');
const ROOT_EXE_PATH = path.join(PROJECT_ROOT, 'Rustcord.exe');
const INSTALLER_SETUP_PATH = path.join(PROJECT_ROOT, 'RustcordSetup.exe');
const INSTALLER_DIR = path.resolve(PROJECT_ROOT, '..', 'installer');

// 1. File Readers
function readInjectJs() {
    if (!fs.existsSync(INJECT_JS_PATH)) {
        throw new Error(`inject.js not found at ${INJECT_JS_PATH}`);
    }
    return fs.readFileSync(INJECT_JS_PATH, 'utf-8');
}

// 2. WebP Header & Chunks Parser
function parseWebpHeader(buffer) {
    if (!buffer || buffer.length < 30) {
        return { valid: false, error: 'Buffer too small' };
    }
    const riff = buffer.subarray(0, 4).toString('ascii');
    const webp = buffer.subarray(8, 12).toString('ascii');
    if (riff !== 'RIFF' || webp !== 'WEBP') {
        return { valid: false, error: `Invalid RIFF/WEBP magic: riff='${riff}', webp='${webp}'` };
    }
    const chunkType = buffer.subarray(12, 16).toString('ascii');
    if (chunkType !== 'VP8X') {
        return { valid: false, error: `Expected VP8X header, got '${chunkType}'` };
    }
    const flags = buffer[20];
    const hasAnimation = Boolean(flags & 0x02);
    const hasAlpha = Boolean(flags & 0x10);
    const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
    const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));

    let frameCount = 0;
    let offset = 12;
    while (offset < buffer.length - 8) {
        const type = buffer.subarray(offset, offset + 4).toString('ascii');
        const size = buffer.readUInt32LE(offset + 4);
        if (type === 'ANMF') {
            frameCount++;
        }
        offset += 8 + size + (size % 2);
    }

    return {
        valid: true,
        width,
        height,
        hasAnimation,
        hasAlpha,
        frameCount,
        size: buffer.length
    };
}

// 3. PE Header Parser (Windows Executables)
function verifyPEHeader(filePath) {
    if (!fs.existsSync(filePath)) {
        return { valid: false, error: `File not found: ${filePath}` };
    }
    const stat = fs.statSync(filePath);
    if (stat.size < 1024) {
        return { valid: false, error: `File size too small: ${stat.size} bytes` };
    }
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(1024);
    fs.readSync(fd, buf, 0, 1024, 0);
    fs.closeSync(fd);

    const mz = buf.subarray(0, 2).toString('ascii');
    if (mz !== 'MZ') {
        return { valid: false, error: `Invalid DOS MZ signature: '${mz}'` };
    }
    const peOffset = buf.readUInt32LE(0x3C);
    if (peOffset + 24 > buf.length) {
        return { valid: false, error: `PE offset out of bounds: ${peOffset}` };
    }
    const peSig = buf.subarray(peOffset, peOffset + 4).toString('ascii');
    if (peSig !== 'PE\0\0') {
        return { valid: false, error: `Invalid PE signature: '${peSig}'` };
    }
    const machine = buf.readUInt16LE(peOffset + 4);
    const is64Bit = (machine === 0x8664);

    return {
        valid: true,
        size: stat.size,
        peOffset,
        machine: machine.toString(16),
        is64Bit
    };
}

// 4. Edge Executable Finder
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

// 5. Headless Edge Runner with Virtual Time
function runHeadlessEdge(htmlContent, virtualTimeBudget = 2500) {
    return new Promise((resolve, reject) => {
        const edgePath = findEdgeExecutable();
        if (!edgePath) {
            return reject(new Error('Microsoft Edge executable not found'));
        }
        const tempDir = path.join(process.env.TEMP || '.', 'rustcord_edge_tests');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        const tempFile = path.join(tempDir, `test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.html`);
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

        const timeoutLimit = Math.max(20000, virtualTimeBudget + 15000);
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

// 6. Sandboxed Mock DOM Environment for In-Memory Unit / Contract Testing
class MockElement {
    constructor(tagName, id = '') {
        this.tagName = (tagName || 'div').toUpperCase();
        this.id = id;
        this.className = '';
        this.attributes = new Map();
        this.children = [];
        this.parentNode = null;
        this.textContent = '';
        this.innerHTML_val = '';
        this.listeners = new Map();
        this.style = {};
    }

    get innerHTML() {
        return this.innerHTML_val;
    }
    set innerHTML(val) {
        this.innerHTML_val = val;
        this.children = [];
    }

    getAttribute(name) {
        return this.attributes.get(name) || null;
    }
    setAttribute(name, val) {
        this.attributes.set(name, String(val));
    }
    hasAttribute(name) {
        return this.attributes.has(name);
    }
    removeAttribute(name) {
        this.attributes.delete(name);
    }

    get classList() {
        const self = this;
        return {
            contains: cls => self.className.split(/\s+/).includes(cls),
            add: (...classes) => {
                const current = new Set(self.className.split(/\s+/).filter(Boolean));
                for (const c of classes) current.add(c);
                self.className = Array.from(current).join(' ');
            },
            remove: (...classes) => {
                const set = new Set(classes);
                self.className = self.className.split(/\s+/).filter(c => !set.has(c)).join(' ');
            },
            toggle: (cls, force) => {
                const has = self.classList.contains(cls);
                const shouldAdd = force !== undefined ? force : !has;
                if (shouldAdd) self.classList.add(cls);
                else self.classList.remove(cls);
                return shouldAdd;
            }
        };
    }

    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
    }

    removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) {
            this.children.splice(idx, 1);
            child.parentNode = null;
        }
        return child;
    }

    remove() {
        if (this.parentNode) {
            this.parentNode.removeChild(this);
        }
    }

    addEventListener(event, handler) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(handler);
    }

    removeEventListener(event, handler) {
        if (!this.listeners.has(event)) return;
        const list = this.listeners.get(event).filter(h => h !== handler);
        this.listeners.set(event, list);
    }

    dispatchEvent(evt) {
        evt.target = this;
        const handlers = this.listeners.get(evt.type) || [];
        for (const h of handlers) {
            try { h.call(this, evt); } catch (e) { console.error(e); }
        }
        if (this.parentNode && !evt._stopped) {
            this.parentNode.dispatchEvent(evt);
        }
        return true;
    }

    click() {
        this.dispatchEvent({
            type: 'click',
            target: this,
            preventDefault: () => {},
            stopPropagation: function() { this._stopped = true; }
        });
    }

    getElementById(id) {
        if (this.id === id) return this;
        for (const child of this.children) {
            const found = child.getElementById(id);
            if (found) return found;
        }
        return null;
    }

    querySelectorAll(selector) {
        const results = [];
        const match = el => {
            if (selector.startsWith('#')) {
                if (el.id === selector.slice(1)) results.push(el);
            } else if (selector.startsWith('.')) {
                if (el.classList.contains(selector.slice(1))) results.push(el);
            } else if (selector.startsWith('[') && selector.includes('=')) {
                const m = selector.match(/\[([a-zA-Z0-9_-]+)="?([^"\]]+)"?\]/);
                if (m && el.getAttribute(m[1]) === m[2]) results.push(el);
            } else if (el.tagName.toLowerCase() === selector.toLowerCase()) {
                results.push(el);
            }
            for (const child of el.children) {
                match(child);
            }
        };
        for (const child of this.children) {
            match(child);
        }
        return results;
    }

    querySelector(selector) {
        const res = this.querySelectorAll(selector);
        return res.length > 0 ? res[0] : null;
    }
}

function createDOMSimulation() {
    const documentRoot = new MockElement('html');
    const head = new MockElement('head');
    const body = new MockElement('body');
    documentRoot.appendChild(head);
    documentRoot.appendChild(body);

    const eventListeners = new Map();

    const mockMutationObservers = [];
    class MockMutationObserver {
        constructor(callback) {
            this.callback = callback;
            this.target = null;
            this.config = null;
            this.disconnected = false;
            mockMutationObservers.push(this);
        }
        observe(target, config) {
            this.target = target;
            this.config = config;
        }
        disconnect() {
            this.disconnected = true;
        }
        trigger(mutations = []) {
            if (!this.disconnected) {
                this.callback(mutations, this);
            }
        }
    }

    let nextTimerId = 1;
    const activeTimers = new Map();
    const activeIntervals = new Map();

    const customGetDisplayMedia = async function(constraints) {
        return {
            id: 'mock-media-stream-' + Math.random().toString(36).substring(2, 6),
            getTracks: () => [{
                kind: 'video',
                label: 'Mock Screen Capture Track',
                stop: () => {},
                getConstraints: () => constraints
            }]
        };
    };

    const sandbox = {
        console,
        Buffer,
        setTimeout: (fn, delay) => {
            const id = nextTimerId++;
            activeTimers.set(id, { fn, delay, created: Date.now() });
            return id;
        },
        clearTimeout: id => { activeTimers.delete(id); },
        setInterval: (fn, delay) => {
            const id = nextTimerId++;
            activeIntervals.set(id, { fn, delay });
            return id;
        },
        clearInterval: id => { activeIntervals.delete(id); },
        MutationObserver: MockMutationObserver,
        document: {
            readyState: 'complete',
            documentElement: documentRoot,
            head,
            body,
            createElement: tagName => new MockElement(tagName),
            getElementById: id => documentRoot.getElementById(id),
            querySelector: sel => documentRoot.querySelector(sel),
            querySelectorAll: sel => documentRoot.querySelectorAll(sel),
            addEventListener: (evt, fn) => {
                if (!eventListeners.has(evt)) eventListeners.set(evt, []);
                eventListeners.get(evt).push(fn);
            },
            removeEventListener: (evt, fn) => {
                if (!eventListeners.has(evt)) return;
                eventListeners.set(evt, eventListeners.get(evt).filter(h => h !== fn));
            }
        },
        window: {
            __RUSTCORD_SOURCES__: [],
            __UPDATE_RUSTCORD_SOURCES__: null,
            __RUSTCORD_TOAST__: null,
            addEventListener: (evt, fn) => {
                if (!eventListeners.has(evt)) eventListeners.set(evt, []);
                eventListeners.get(evt).push(fn);
            },
            removeEventListener: (evt, fn) => {
                if (!eventListeners.has(evt)) return;
                eventListeners.set(evt, eventListeners.get(evt).filter(h => h !== fn));
            },
            dispatchEvent: evt => {
                const handlers = eventListeners.get(evt.type) || [];
                for (const h of handlers) {
                    try { h(evt); } catch (e) { console.error(e); }
                }
            }
        },
        navigator: {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            mediaDevices: {
                getDisplayMedia: customGetDisplayMedia
            }
        },
        DOMException: class DOMException extends Error {
            constructor(message, name) {
                super(message);
                this.name = name || 'Error';
            }
        }
    };

    sandbox.window.document = sandbox.document;
    sandbox.window.navigator = sandbox.navigator;

    const context = vm.createContext(sandbox);

    return {
        context,
        sandbox,
        mockMutationObservers,
        activeTimers,
        activeIntervals,
        fastForwardTimers(ms) {
            for (const [id, timer] of Array.from(activeTimers.entries())) {
                if (timer.delay <= ms) {
                    activeTimers.delete(id);
                    timer.fn();
                }
            }
        },
        fastForwardIntervals(count = 1) {
            for (let i = 0; i < count; i++) {
                for (const [, intv] of Array.from(activeIntervals.entries())) {
                    intv.fn();
                }
            }
        }
    };
}

// 7. Minimalist Test Reporter Framework
class TestReporter {
    constructor(tierName, options = {}) {
        this.tierName = tierName;
        this.silent = Boolean(options.silent);
        this.currentSuite = '';
        this.tests = [];
        this.startTime = Date.now();
    }

    suite(name) {
        this.currentSuite = name;
        if (!this.silent) {
            console.log(`\n\x1b[1m\x1b[36m=== Suite: ${name} ===\x1b[0m`);
        }
    }

    async test(name, fn) {
        const fullTitle = this.currentSuite ? `[${this.currentSuite}] ${name}` : name;
        const start = Date.now();
        try {
            await fn();
            const dur = Date.now() - start;
            this.tests.push({ title: fullTitle, passed: true, duration: dur });
            if (!this.silent) {
                console.log(`  \x1b[32m✔ PASS\x1b[0m: ${name} \x1b[90m(${dur}ms)\x1b[0m`);
            }
        } catch (err) {
            const dur = Date.now() - start;
            this.tests.push({ title: fullTitle, passed: false, duration: dur, error: err });
            if (!this.silent) {
                console.log(`  \x1b[31m✖ FAIL\x1b[0m: ${name} \x1b[90m(${dur}ms)\x1b[0m`);
                console.log(`    \x1b[31m${err.message || err}\x1b[0m`);
                if (err.stack && !err.isAssertion) {
                    const stackLines = err.stack.split('\n').slice(1, 3).join('\n');
                    console.log(`    \x1b[90m${stackLines}\x1b[0m`);
                }
            }
        }
    }

    assert(condition, message) {
        if (!condition) {
            const err = new Error(message || 'Assertion failed');
            err.isAssertion = true;
            throw err;
        }
    }

    assertEqual(actual, expected, message) {
        if (actual !== expected) {
            const err = new Error(`${message || 'Assertion failed'}: expected '${expected}', got '${actual}'`);
            err.isAssertion = true;
            throw err;
        }
    }

    assertNotEqual(actual, unexpected, message) {
        if (actual === unexpected) {
            const err = new Error(`${message || 'Assertion failed'}: expected not to equal '${unexpected}'`);
            err.isAssertion = true;
            throw err;
        }
    }

    assertMatch(str, regex, message) {
        if (!regex.test(str)) {
            const err = new Error(`${message || 'Regex match failed'}: pattern ${regex} did not match input`);
            err.isAssertion = true;
            throw err;
        }
    }

    assertNotMatch(str, regex, message) {
        if (regex.test(str)) {
            const err = new Error(`${message || 'Regex negative match failed'}: pattern ${regex} unexpectedly matched`);
            err.isAssertion = true;
            throw err;
        }
    }

    summary() {
        const total = this.tests.length;
        const passed = this.tests.filter(t => t.passed).length;
        const failed = this.tests.filter(t => !t.passed).length;
        const elapsed = Date.now() - this.startTime;

        if (!this.silent) {
            console.log(`\n\x1b[1mSummary for ${this.tierName}:\x1b[0m`);
            console.log(`  Total:  ${total}`);
            console.log(`  Passed: \x1b[32m${passed}\x1b[0m`);
            console.log(`  Failed: \x1b[${failed > 0 ? '31' : '32'}m${failed}\x1b[0m`);
            console.log(`  Time:   ${elapsed}ms\n`);
        }

        return {
            tier: this.tierName,
            total,
            passed,
            failed,
            duration: elapsed,
            tests: this.tests
        };
    }
}

module.exports = {
    PROJECT_ROOT,
    INJECT_JS_PATH,
    ASSETS_PATH,
    RELEASE_EXE_PATH,
    ROOT_EXE_PATH,
    INSTALLER_SETUP_PATH,
    INSTALLER_DIR,
    readInjectJs,
    parseWebpHeader,
    verifyPEHeader,
    findEdgeExecutable,
    runHeadlessEdge,
    createDOMSimulation,
    TestReporter
};
