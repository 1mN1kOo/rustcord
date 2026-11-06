// Rustcord Performance & Telemetry Blocker Script
(function() {
    // 0. Force dark background immediately to kill white flashbang forever
    try {
        if (document.documentElement) {
            document.documentElement.style.backgroundColor = "#1e1f22";
            document.documentElement.style.color = "#dbdee1";
        }
    } catch (_) {}

    console.log("%c[Rustcord]%c Native Tauri WebView2 Engine (Zero Electron Bloat!)", 
        "color: #5865F2; font-weight: bold; font-size: 14px;", "color: #23A55A; font-weight: bold;");

    // 1. Block tracking, telemetry, and analytics endpoints
    const BLOCKED_DOMAINS = [
        "/api/v9/science",
        "/api/v10/science",
        "/api/v9/track",
        "/api/v10/track",
        "sentry.io",
        "google-analytics.com",
        "statsigapi.net"
    ];

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const url = String(args[0] || "");
        for (const blocked of BLOCKED_DOMAINS) {
            if (url.includes(blocked)) {
                return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
            }
        }
        return originalFetch.apply(this, args);
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        const urlStr = String(url || "");
        for (const blocked of BLOCKED_DOMAINS) {
            if (urlStr.includes(blocked)) {
                this.isBlocked = true;
                break;
            }
        }
        return originalOpen.apply(this, arguments);
    };

    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
        if (this.isBlocked) {
            Object.defineProperty(this, "readyState", { value: 4 });
            Object.defineProperty(this, "status", { value: 200 });
            Object.defineProperty(this, "responseText", { value: "{}" });
            return;
        }
        return originalSend.apply(this, arguments);
    };

    // 2. Keyboard shortcuts (Ctrl+R, F5)
    window.addEventListener("keydown", function(e) {
        if ((e.ctrlKey && e.key === "r") || e.key === "F5") {
            window.location.reload();
        }
    }, true);

    // 3. Inject dark styles and smooth scroll
    const applyStyles = () => {
        const style = document.createElement("style");
        style.id = "rustcord-styles";
        style.textContent = `
            html, body {
                background-color: #1e1f22 !important;
            }
            * {
                scroll-behavior: smooth !important;
            }
            ::-webkit-scrollbar {
                width: 8px !important;
                height: 8px !important;
            }
            ::-webkit-scrollbar-thumb {
                background: #202225 !important;
                border-radius: 4px !important;
            }
            ::-webkit-scrollbar-thumb:hover {
                background: #2f3136 !important;
            }
        `;
        if (document.head) {
            document.head.appendChild(style);
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", applyStyles);
    } else {
        applyStyles();
    }
})();
