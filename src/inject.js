// Rustcord Native App Enforcer, Permissions Auto-Grant, Telemetry Blocker & Auto-Updater
(function() {
    const CURRENT_VERSION = "1.1.3";

    // 0. Force dark background immediately to kill white flashbang forever
    try {
        if (document.documentElement) {
            document.documentElement.style.backgroundColor = "#1e1f22";
            document.documentElement.style.color = "#dbdee1";
        }
    } catch (_) {}

    // 0.1 Custom Native Rustcord Splash & Loading Animation (replacing generic web spinner)
    function setupCustomSplash() {
        try {
            if (document.getElementById("rustcord-custom-splash")) return;

            const style = document.createElement("style");
            style.id = "rc-splash-styles";
            style.textContent = `
                #rustcord-custom-splash {
                    position: fixed !important;
                    inset: 0 !important;
                    width: 100vw !important;
                    height: 100vh !important;
                    background: #1e1f22 !important;
                    z-index: 2147483647 !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    font-family: "gg sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                    transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1), transform 0.4s cubic-bezier(0.4, 0, 0.2, 1) !important;
                    user-select: none !important;
                }
                .rc-splash-container {
                    display: flex !important;
                    flex-direction: column !important;
                    align-items: center !important;
                    justify-content: center !important;
                }
                .rc-splash-logo-wrapper {
                    position: relative !important;
                    width: 110px !important;
                    height: 110px !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    margin-bottom: 24px !important;
                }
                .rc-splash-orbit {
                    position: absolute !important;
                    inset: -6px !important;
                    border-radius: 50% !important;
                    border: 2px solid transparent !important;
                    border-top-color: #5865F2 !important;
                    border-right-color: #EB459E !important;
                    animation: rcOrbit 1.4s cubic-bezier(0.5, 0.1, 0.5, 0.9) infinite !important;
                }
                .rc-splash-pulse {
                    position: absolute !important;
                    inset: -12px !important;
                    border-radius: 50% !important;
                    background: radial-gradient(circle, rgba(88, 101, 242, 0.25) 0%, rgba(235, 69, 158, 0) 70%) !important;
                    animation: rcPulse 2s ease-in-out infinite !important;
                }
                .rc-splash-logo {
                    z-index: 2 !important;
                    animation: rcLogoFloat 2.5s ease-in-out infinite !important;
                    filter: drop-shadow(0 4px 16px rgba(88, 101, 242, 0.5)) !important;
                }
                .rc-splash-title {
                    color: #ffffff !important;
                    font-size: 24px !important;
                    font-weight: 800 !important;
                    letter-spacing: 3px !important;
                    margin-bottom: 6px !important;
                    background: linear-gradient(135deg, #ffffff 30%, #b5bac1 100%) !important;
                    -webkit-background-clip: text !important;
                    -webkit-text-fill-color: transparent !important;
                }
                .rc-splash-version {
                    color: #949ba4 !important;
                    font-size: 13px !important;
                    font-weight: 500 !important;
                    margin-bottom: 26px !important;
                }
                .rc-splash-loader {
                    display: flex !important;
                    align-items: center !important;
                    gap: 8px !important;
                    margin-bottom: 16px !important;
                }
                .rc-loader-dot {
                    width: 10px !important;
                    height: 10px !important;
                    border-radius: 50% !important;
                    background: #5865F2 !important;
                    animation: rcDotBounce 1.4s ease-in-out infinite !important;
                }
                .rc-loader-dot:nth-child(2) {
                    animation-delay: 0.2s !important;
                    background: #7289DA !important;
                }
                .rc-loader-dot:nth-child(3) {
                    animation-delay: 0.4s !important;
                    background: #EB459E !important;
                }
                .rc-splash-status {
                    color: #dbdee1 !important;
                    font-size: 13.5px !important;
                    font-weight: 500 !important;
                    min-height: 20px !important;
                    transition: opacity 0.2s !important;
                }
                @keyframes rcOrbit {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                @keyframes rcPulse {
                    0%, 100% { transform: scale(0.95); opacity: 0.5; }
                    50% { transform: scale(1.15); opacity: 0.9; }
                }
                @keyframes rcLogoFloat {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-4px); }
                }
                @keyframes rcDotBounce {
                    0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
                    40% { transform: scale(1.15); opacity: 1; }
                }
            `;

            const splash = document.createElement("div");
            splash.id = "rustcord-custom-splash";
            splash.innerHTML = `
                <div class="rc-splash-container">
                    <div class="rc-splash-logo-wrapper">
                        <div class="rc-splash-orbit"></div>
                        <div class="rc-splash-pulse"></div>
                        <svg class="rc-splash-logo" viewBox="0 0 128 128" width="76" height="76">
                            <defs>
                                <linearGradient id="rcLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stop-color="#5865F2" />
                                    <stop offset="50%" stop-color="#7289DA" />
                                    <stop offset="100%" stop-color="#EB459E" />
                                </linearGradient>
                            </defs>
                            <circle cx="64" cy="64" r="56" fill="#1e1f22" stroke="url(#rcLogoGrad)" stroke-width="4"/>
                            <path d="M88.5 39.5c-6.1-2.8-12.7-4.8-19.6-5.8-.8 1.5-1.8 3.5-2.5 5.1-7.4-1.1-14.8-1.1-22.1 0-.7-1.6-1.7-3.6-2.5-5.1-6.9 1-13.5 3-19.6 5.8-12.4 18.5-15.8 36.5-14.1 54.3 8.2 6.1 16.2 9.8 24 12.2 2-2.7 3.7-5.6 5.2-8.6-2.8-1.1-5.5-2.4-8-4 .7-.5 1.4-1 2-1.6 15.6 7.2 32.5 7.2 47.9 0 .7.5 1.4 1.1 2 1.6-2.5 1.6-5.2 2.9-8 4 1.5 3 3.3 5.9 5.2 8.6 7.9-2.4 15.9-6.1 24.1-12.2 2-20.7-3.4-38.6-14.1-54.3zm-35.3 41.2c-4.7 0-8.6-4.3-8.6-9.6s3.8-9.6 8.6-9.6c4.9 0 8.7 4.4 8.6 9.6 0 5.3-3.8 9.6-8.6 9.6zm23.6 0c-4.7 0-8.6-4.3-8.6-9.6s3.8-9.6 8.6-9.6c4.9 0 8.7 4.4 8.6 9.6 0 5.3-3.7 9.6-8.6 9.6z" fill="url(#rcLogoGrad)"/>
                        </svg>
                    </div>
                    <div class="rc-splash-title">RUSTCORD</div>
                    <div class="rc-splash-version">v${CURRENT_VERSION} · Нативное ядро на Rust</div>
                    
                    <div class="rc-splash-loader">
                        <div class="rc-loader-dot"></div>
                        <div class="rc-loader-dot"></div>
                        <div class="rc-loader-dot"></div>
                    </div>

                    <div class="rc-splash-status" id="rc-splash-status-text">Инициализация нативного ядра...</div>
                </div>
            `;

            const target = document.body || document.documentElement;
            if (target) {
                target.appendChild(style);
                target.appendChild(splash);
            }

            const messages = [
                "Инициализация нативного ядра Rustcord...",
                "Подключение модулей захвата экрана...",
                "Оптимизация сетевых потоков WebRTC...",
                "Загрузка серверов и сообщений..."
            ];
            let msgIdx = 0;
            const statusEl = document.getElementById("rc-splash-status-text");
            const interval = setInterval(() => {
                msgIdx = (msgIdx + 1) % messages.length;
                if (statusEl) {
                    statusEl.style.opacity = "0";
                    setTimeout(() => {
                        statusEl.innerText = messages[msgIdx];
                        statusEl.style.opacity = "1";
                    }, 200);
                }
            }, 1200);

            function dismissSplash() {
                clearInterval(interval);
                splash.style.opacity = "0";
                splash.style.transform = "scale(1.02)";
                setTimeout(() => {
                    try { splash.remove(); } catch(_) {}
                    try { style.remove(); } catch(_) {}
                }, 400);
            }

            const observer = new MutationObserver(() => {
                const ready = document.querySelector('[class*="guilds"], [data-list-id="guildsnav"], [class*="channels_"], [class*="chat"]');
                if (ready) {
                    observer.disconnect();
                    dismissSplash();
                }
            });
            observer.observe(document.documentElement, { childList: true, subtree: true });

            setTimeout(() => {
                observer.disconnect();
                dismissSplash();
            }, 6000);
        } catch (_) {}
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", setupCustomSplash);
    } else {
        setupCustomSplash();
    }

    // 0.2 Discord Internal Webpack Interceptor & Bridge
    let discordWebpack = null;
    let discordModalApi = null;
    let discordStreamModal = null;

    function hookDiscordWebpack() {
        if (!window.webpackChunkdiscord_app) return;
        try {
            window.webpackChunkdiscord_app.push([
                [Symbol("rustcord_hook")],
                {},
                (req) => {
                    discordWebpack = req;
                    console.log("[Rustcord] Successfully hooked Discord Webpack chunk repository!");

                    for (const id in req.c) {
                        const m = req.c[id]?.exports;
                        if (!m) continue;

                        if (!discordModalApi && m.openModal && m.closeModal) {
                            discordModalApi = m;
                        }

                        if (!discordStreamModal) {
                            if (m.StreamSourceSelectModal || m.default?.displayName === "StreamSourceSelectModal") {
                                discordStreamModal = m.StreamSourceSelectModal || m.default;
                            }
                        }
                    }
                }
            ]);
        } catch (e) {
            console.warn("[Rustcord] Webpack hook notice:", e);
        }
    }

    hookDiscordWebpack();
    let hookAttempts = 0;
    const hookTimer = setInterval(() => {
        hookAttempts++;
        if (discordWebpack || hookAttempts > 25) {
            clearInterval(hookTimer);
        } else {
            hookDiscordWebpack();
        }
    }, 300);

    console.log("%c[Rustcord v" + CURRENT_VERSION + "]%c Native Desktop Engine Activated", 
        "color: #5865F2; font-weight: bold; font-size: 14px;", "color: #23A55A; font-weight: bold;");

    // Native Discord Bridge
    window.__RUSTCORD_SOURCES__ = window.__RUSTCORD_SOURCES__ || [];

    // 1. Auto-grant all permissions (Microphone, Camera, Screen Capture, Notifications, Audio)
    try {
        if (navigator.permissions && navigator.permissions.query) {
            const origQuery = navigator.permissions.query.bind(navigator.permissions);
            navigator.permissions.query = function(param) {
                if (param && ['microphone', 'camera', 'notifications', 'clipboard-read', 'clipboard-write', 'speaker-selection', 'display-capture'].includes(param.name)) {
                    return Promise.resolve({
                        state: 'granted',
                        status: 'granted',
                        name: param.name,
                        onchange: null
                    });
                }
                return origQuery(param);
            };
        }
    } catch(_) {}

    try {
        Object.defineProperty(Notification, 'permission', {
            get: () => 'granted',
            configurable: true
        });
        Notification.requestPermission = () => Promise.resolve('granted');
    } catch(_) {}

    // 2. Authentic Discord In-App Screen Sharing Modal (Replacing Chromium Edge Browser Picker Dialog)
    try {
        if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
            const origGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);

            function showDiscordScreenShareModal() {
                return new Promise((resolve, reject) => {
                    const existing = document.getElementById("rustcord-screenshare-overlay");
                    if (existing) existing.remove();

                    const overlay = document.createElement("div");
                    overlay.id = "rustcord-screenshare-overlay";
                    overlay.innerHTML = `
                        <div class="dlg rc-modal-dialog">
                            <div class="tabs" role="tablist">
                                <button class="tab on" data-t="apps">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="M10 4v4"/><path d="M2 8h20"/></svg>
                                    Приложения
                                </button>
                                <button class="tab" data-t="screen">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>
                                    Весь экран
                                </button>
                                <button class="tab" data-t="dev">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>
                                    Устройства
                                </button>
                            </div>

                            <div class="grid" id="grid"></div>

                            <div class="foot">
                                <div>
                                    <div style="font-size: 16px; font-weight: 500; color: #ffffff;">Пользовательские</div>
                                    <div class="meta">• <span id="res">720p</span> &nbsp;• <span id="fps">30fps</span></div>
                                </div>
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <button class="rc-cancel-flat" id="rc-cancel" style="background: transparent; border: none; color: #9a9aa3; font-size: 14px; font-weight: 500; cursor: pointer; padding: 10px 14px; border-radius: 8px;">Отмена</button>
                                    <button class="go" id="go">Начать трансляцию</button>
                                    <button class="gear" aria-label="Настройки качества" id="gear" title="Переключить качество">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;

                    document.body.appendChild(overlay);

                    let currentTab = "apps";
                    let selectedSourceId = null;
                    const resList = ["720p", "1080p", "480p"];
                    const fpsList = ["30fps", "60fps", "15fps"];
                    let qualityIndex = 0;

                    const gearBtn = document.getElementById("gear");
                    if (gearBtn) {
                        gearBtn.addEventListener("click", () => {
                            qualityIndex = (qualityIndex + 1) % resList.length;
                            document.getElementById("res").textContent = resList[qualityIndex];
                            document.getElementById("fps").textContent = fpsList[qualityIndex];
                        });
                    }

                    function renderCards() {
                        const grid = document.getElementById("grid");
                        if (!grid) return;
                        grid.innerHTML = "";

                        const allSources = window.__RUSTCORD_SOURCES__ || [];
                        let filtered = [];

                        if (currentTab === "apps") {
                            filtered = allSources.filter(s => s.id.startsWith("window:"));
                        } else if (currentTab === "screen") {
                            filtered = allSources.filter(s => s.id.startsWith("screen:"));
                        } else {
                            filtered = [];
                        }

                        if (filtered.length === 0) {
                            grid.innerHTML = `
                                <div style="grid-column: span 2; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 260px; color: #9a9aa3;">
                                    <div style="font-size: 32px; margin-bottom: 8px;">🔍</div>
                                    <div style="font-weight: 500; font-size: 14px;">${currentTab === 'dev' ? 'Устройства захвата не найдены' : 'Источники не найдены'}</div>
                                </div>
                            `;
                            return;
                        }

                        if (!selectedSourceId && filtered.length > 0) {
                            selectedSourceId = filtered[0].id;
                        }

                        filtered.forEach(source => {
                            const isSelected = source.id === selectedSourceId;
                            const card = document.createElement("div");
                            card.className = "card" + (isSelected ? " sel" : "");

                            let iconBg = "#5865f2";
                            let iconChar = "🎮";
                            const nameLower = source.name.toLowerCase();
                            if (nameLower.includes("folder") || nameLower.includes("проводник") || nameLower.includes("explorer")) {
                                iconBg = "#d9a520";
                                iconChar = "📁";
                            } else if (nameLower.includes("code") || nameLower.includes("rust") || nameLower.includes("studio")) {
                                iconBg = "#2f6fed";
                                iconChar = "💻";
                            } else if (nameLower.includes("chrome") || nameLower.includes("edge") || nameLower.includes("браузер")) {
                                iconBg = "#ea4335";
                                iconChar = "🌐";
                            }

                            card.innerHTML = `
                                <div class="thumb">
                                    <img src="${source.url}" style="width: 100%; height: 100%; object-fit: cover; display: block;" alt="${source.name}" />
                                </div>
                                <div class="name">
                                    <span class="ic" style="background: ${iconBg};">${iconChar}</span>
                                    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${source.name}">${source.name}</span>
                                </div>
                            `;

                            card.addEventListener("click", () => {
                                selectedSourceId = source.id;
                                renderCards();
                            });

                            grid.appendChild(card);
                        });
                    }

                    // Tab switching
                    overlay.querySelectorAll(".tab").forEach(tab => {
                        tab.addEventListener("click", () => {
                            overlay.querySelectorAll(".tab").forEach(t => t.classList.remove("on"));
                            tab.classList.add("on");
                            currentTab = tab.getAttribute("data-t");
                            renderCards();
                        });
                    });

                    window.__UPDATE_RUSTCORD_SOURCES__ = () => {
                        renderCards();
                    };
                    renderCards();

                    const cleanup = () => {
                        window.__UPDATE_RUSTCORD_SOURCES__ = null;
                        overlay.remove();
                    };

                    const handleCancel = () => {
                        cleanup();
                        reject(new DOMException("Permission denied by user", "NotAllowedError"));
                    };

                    document.getElementById("rc-cancel").addEventListener("click", handleCancel);

                    // Close on backdrop click
                    overlay.addEventListener("click", (e) => {
                        if (e.target === overlay) {
                            cleanup();
                            reject(new DOMException("Permission denied by user", "NotAllowedError"));
                        }
                    });

                    // Escape key closes modal
                    const escHandler = (e) => {
                        if (e.key === "Escape") {
                            window.removeEventListener("keydown", escHandler);
                            cleanup();
                            reject(new DOMException("Permission denied by user", "NotAllowedError"));
                        }
                    };
                    window.addEventListener("keydown", escHandler);

                    // Confirm and Go Live
                    document.getElementById("go").addEventListener("click", async () => {
                        const goBtn = document.getElementById("go");
                        if (!selectedSourceId) {
                            goBtn.textContent = "Выберите источник";
                            setTimeout(() => { goBtn.textContent = "Начать трансляцию"; }, 1500);
                            return;
                        }

                        cleanup();
                        window.removeEventListener("keydown", escHandler);

                        try {
                            const resMap = { "480p": [854, 480], "720p": [1280, 720], "1080p": [1920, 1080] };
                            const fpsMap = { "15fps": 15, "30fps": 30, "60fps": 60 };
                            const curRes = resList[qualityIndex] || "720p";
                            const curFps = fpsList[qualityIndex] || "30fps";
                            const [w, h] = resMap[curRes] || [1280, 720];
                            const frameRate = fpsMap[curFps] || 30;

                            const constraints = {
                                video: {
                                    frameRate: { ideal: frameRate, max: frameRate },
                                    width: { ideal: w, max: w * 2 },
                                    height: { ideal: h, max: h * 2 }
                                },
                                audio: true,
                                systemAudio: "include"
                            };
                            const stream = await origGetDisplayMedia(constraints);
                            resolve(stream);
                        } catch (err) {
                            reject(err);
                        }
                    });
                });
            }

            navigator.mediaDevices.getDisplayMedia = function(constraints) {
                return showDiscordScreenShareModal();
            };
        }
    } catch(_) {}

    // 3. Block tracking, telemetry, and analytics endpoints
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

    // 4. Disable ALL browser-specific keyboard shortcuts
    window.addEventListener("keydown", function(e) {
        const key = e.key.toLowerCase();

        // Reload (allowed)
        if ((e.ctrlKey && key === "r") || e.key === "F5") {
            window.location.reload();
            return;
        }

        // Block Print, Save, View Source, History, Downloads, Find Dialog
        if (e.ctrlKey && ["p", "s", "u", "f", "h", "j", "o"].includes(key)) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }

        // Block browser history navigation via Alt+Left / Alt+Right
        if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }

        // Block browser function keys (F1 Help, F3 Find, F7 Caret browsing)
        if (["f1", "f3", "f7"].includes(key)) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }, true);

    // 5. Disable zoom gestures via Ctrl + Wheel
    window.addEventListener("wheel", function(e) {
        if (e.ctrlKey) {
            e.preventDefault();
        }
    }, { passive: false });

    // 6. Disable default browser right-click context menu
    window.addEventListener("contextmenu", function(e) {
        const isEditable = e.target.closest("input, textarea, [contenteditable='true']");
        if (!isEditable) {
            setTimeout(() => {
                const nativeMenu = document.querySelector('[role="menu"]');
                if (!nativeMenu) {
                    e.preventDefault();
                }
            }, 0);
        }
    }, false);

    // 7. Inject native styles & hide browser artifacts
    const applyStyles = () => {
        const style = document.createElement("style");
        style.id = "rustcord-native-styles";
        style.textContent = `
            html, body {
                background-color: #1e1f22 !important;
                overscroll-behavior: none !important;
            }
            [class*="downloadAppButton"],
            [class*="appDownloadNotice"],
            [class*="notice_"] button[class*="download"],
            [class*="browserNotice"],
            a[href*="/download"] {
                display: none !important;
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
            #rustcord-update-bar {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                z-index: 999999 !important;
                background: linear-gradient(90deg, #5865f2, #4752c4) !important;
                color: #ffffff !important;
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                padding: 8px 18px !important;
                font-family: "gg sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                font-size: 13.5px !important;
                font-weight: 600 !important;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4) !important;
                animation: slideDown 0.25s ease-out !important;
            }
            @keyframes slideDown {
                from { transform: translateY(-100%); }
                to { transform: translateY(0); }
            }
            .rustcord-btn {
                background: #ffffff !important;
                color: #111214 !important;
                border: none !important;
                padding: 6px 14px !important;
                border-radius: 16px !important;
                font-weight: 700 !important;
                font-size: 13px !important;
                cursor: pointer !important;
                margin-left: 8px !important;
                transition: transform 0.1s, opacity 0.2s !important;
            }
            .rustcord-btn:hover {
                opacity: 0.9 !important;
                transform: scale(1.02) !important;
            }
            .rustcord-btn:active {
                transform: scale(0.98) !important;
            }
            .rustcord-btn-secondary {
                background: rgba(255, 255, 255, 0.15) !important;
                color: #ffffff !important;
                border: 1px solid rgba(255, 255, 255, 0.3) !important;
                padding: 6px 12px !important;
                border-radius: 16px !important;
                font-weight: 600 !important;
                font-size: 12.5px !important;
                cursor: pointer !important;
                margin-left: 8px !important;
                transition: background 0.15s !important;
            }
            .rustcord-btn-secondary:hover {
                background: rgba(255, 255, 255, 0.25) !important;
            }
            .rustcord-close {
                background: transparent !important;
                border: none !important;
                color: rgba(255, 255, 255, 0.8) !important;
                font-size: 18px !important;
                cursor: pointer !important;
                margin-left: 12px !important;
                line-height: 1 !important;
            }
            .rustcord-close:hover {
                color: #ffffff !important;
            }

            /* Settings Modal & Toast */
            #rustcord-settings-overlay {
                position: fixed !important;
                inset: 0 !important;
                background: rgba(0, 0, 0, 0.72) !important;
                backdrop-filter: blur(4px) !important;
                z-index: 10000000 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                font-family: "gg sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                animation: rcFadeIn 0.15s ease-out !important;
            }
            .rc-settings-box {
                width: 480px !important;
                max-width: 92vw !important;
                background: #313338 !important;
                border-radius: 12px !important;
                padding: 24px !important;
                box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6) !important;
                box-sizing: border-box !important;
                animation: rcScaleIn 0.18s cubic-bezier(0.18, 0.89, 0.32, 1.28) !important;
            }
            .rc-settings-header {
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                padding-bottom: 16px !important;
                border-bottom: 1px solid #3f4147 !important;
                margin-bottom: 20px !important;
            }
            .rc-settings-title {
                font-size: 18px !important;
                font-weight: 700 !important;
                color: #f2f3f5 !important;
                display: flex !important;
                align-items: center !important;
                gap: 8px !important;
            }
            .rc-settings-row {
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                padding: 12px 14px !important;
                background: #2b2d31 !important;
                border-radius: 8px !important;
                margin-bottom: 14px !important;
            }
            .rc-toggle-switch {
                width: 44px !important;
                height: 24px !important;
                background: #4e5058 !important;
                border-radius: 12px !important;
                cursor: pointer !important;
                position: relative !important;
                transition: background 0.2s !important;
                flex-shrink: 0 !important;
            }
            .rc-toggle-switch.active {
                background: #23a55a !important;
            }
            .rc-toggle-knob {
                width: 18px !important;
                height: 18px !important;
                background: #ffffff !important;
                border-radius: 50% !important;
                position: absolute !important;
                top: 3px !important;
                left: 3px !important;
                transition: transform 0.2s cubic-bezier(0.18, 0.89, 0.32, 1.28) !important;
            }
            .rc-toggle-switch.active .rc-toggle-knob {
                transform: translateX(20px) !important;
            }
            .rc-toast {
                position: fixed !important;
                bottom: 24px !important;
                right: 24px !important;
                background: #232428 !important;
                border: 1px solid #3f4147 !important;
                color: #f2f3f5 !important;
                padding: 12px 20px !important;
                border-radius: 8px !important;
                font-family: "gg sans", sans-serif !important;
                font-size: 14px !important;
                font-weight: 600 !important;
                z-index: 10000001 !important;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5) !important;
                animation: rcSlideUp 0.2s ease-out !important;
            }
            @keyframes rcSlideUp {
                from { transform: translateY(20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }

            /* Native Screen Sharing Picker Dialog (Custom Pixel-Perfect Match) */
            #rustcord-screenshare-overlay {
                position: fixed !important;
                inset: 0 !important;
                background: rgba(0, 0, 0, 0.75) !important;
                backdrop-filter: blur(6px) !important;
                z-index: 9999999 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                font-family: var(--font-sans), "gg sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                animation: rcFadeIn 0.15s ease-out;
            }
            @keyframes rcFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            .dlg {
                background: #0e0e10 !important;
                border: 0.5px solid #2a2a2e !important;
                border-radius: 16px !important;
                padding: 20px !important;
                color: #e6e6ea !important;
                width: 680px !important;
                max-width: 95vw !important;
                max-height: 90vh !important;
                box-shadow: 0 16px 48px rgba(0, 0, 0, 0.8) !important;
                display: flex !important;
                flex-direction: column !important;
                box-sizing: border-box !important;
                animation: rcScaleIn 0.18s cubic-bezier(0.18, 0.89, 0.32, 1.28) !important;
            }
            @keyframes rcScaleIn {
                from { transform: scale(0.96); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
            }
            .rc-dlg-header {
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                gap: 12px !important;
            }
            .tabs {
                flex: 1 !important;
                display: flex !important;
                background: #050506 !important;
                border-radius: 12px !important;
                padding: 4px !important;
                gap: 4px !important;
            }
            .tab {
                flex: 1 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                gap: 8px !important;
                padding: 12px 8px !important;
                border-radius: 8px !important;
                font-size: 14px !important;
                font-weight: 500 !important;
                color: #9a9aa3 !important;
                cursor: pointer !important;
                border: none !important;
                background: transparent !important;
                transition: color 0.15s, background 0.15s !important;
            }
            .tab:hover {
                color: #e6e6ea !important;
            }
            .tab.on {
                background: #17171a !important;
                color: #ffffff !important;
            }
            .rc-dlg-close {
                background: transparent !important;
                border: none !important;
                color: #9a9aa3 !important;
                font-size: 20px !important;
                cursor: pointer !important;
                padding: 6px 10px !important;
                border-radius: 8px !important;
                transition: color 0.15s, background 0.15s !important;
            }
            .rc-dlg-close:hover {
                color: #ffffff !important;
                background: #17171a !important;
            }
            .grid {
                display: grid !important;
                grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
                gap: 16px !important;
                margin-top: 20px !important;
                max-height: 380px !important;
                overflow-y: auto !important;
                padding-right: 4px !important;
            }
            .card {
                cursor: pointer !important;
                border-radius: 10px !important;
                padding: 4px !important;
                border: 1.5px solid transparent !important;
                transition: background 0.15s, border-color 0.15s !important;
            }
            .card:hover {
                background: #17171a !important;
            }
            .card.sel {
                border-color: #5865f2 !important;
                background: #17171a !important;
            }
            .thumb {
                aspect-ratio: 16/9 !important;
                background: #050506 !important;
                border-radius: 8px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                color: #3a3a40 !important;
                font-size: 32px !important;
                overflow: hidden !important;
            }
            .name {
                display: flex !important;
                align-items: center !important;
                gap: 8px !important;
                margin-top: 8px !important;
                font-size: 14px !important;
                font-weight: 500 !important;
                padding: 0 2px !important;
                color: #e6e6ea !important;
            }
            .ic {
                width: 20px !important;
                height: 20px !important;
                border-radius: 6px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                font-size: 12px !important;
                color: #ffffff !important;
                flex-shrink: 0 !important;
            }
            .foot {
                display: flex !important;
                justify-content: space-between !important;
                align-items: flex-end !important;
                margin-top: 20px !important;
                padding-top: 14px !important;
                border-top: 0.5px solid #2a2a2e !important;
            }
            .gear {
                width: 40px !important;
                height: 40px !important;
                border-radius: 8px !important;
                background: #1c1c20 !important;
                border: 0.5px solid #2a2a2e !important;
                color: #e6e6ea !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                font-size: 20px !important;
                padding: 0 !important;
                cursor: pointer !important;
                transition: background 0.15s, border-color 0.15s !important;
            }
            .gear:hover {
                background: #2a2a30 !important;
                border-color: #3f4147 !important;
            }
            .go {
                background: #5865f2 !important;
                color: #ffffff !important;
                border: none !important;
                border-radius: 8px !important;
                padding: 10px 18px !important;
                font-size: 14px !important;
                font-weight: 500 !important;
                cursor: pointer !important;
                transition: background 0.15s, opacity 0.15s !important;
            }
            .go:hover {
                background: #4752c4 !important;
            }
            .meta {
                font-size: 13px !important;
                color: #9a9aa3 !important;
                margin-top: 2px !important;
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

    // 8. Native Bridge IPC for Seamless Headless Auto-Updates
    let rustcordSettings = { auto_update: true, check_interval_mins: 30 };

    function sendToNative(action, params = {}) {
        try {
            const query = Object.keys(params)
                .map(k => encodeURIComponent(k) + "=" + encodeURIComponent(params[k]))
                .join("&");
            const iframe = document.createElement("iframe");
            iframe.style.display = "none";
            iframe.src = "https://rustcord.local/" + action + (query ? "?" + query : "");
            document.body.appendChild(iframe);
            setTimeout(() => {
                try { iframe.remove(); } catch(_) {}
            }, 250);
        } catch (err) {
            console.error("[Rustcord] Native IPC error:", err);
        }
    }

    function showToast(message, duration = 3500) {
        const existing = document.querySelector(".rc-toast");
        if (existing) existing.remove();

        const toast = document.createElement("div");
        toast.className = "rc-toast";
        toast.innerHTML = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            try { toast.remove(); } catch(_) {}
        }, duration);
    }

    function showRustcordSettingsModal() {
        const existing = document.getElementById("rustcord-settings-overlay");
        if (existing) {
            existing.remove();
            return;
        }

        const overlay = document.createElement("div");
        overlay.id = "rustcord-settings-overlay";
        overlay.innerHTML = `
            <div class="rc-settings-box">
                <div class="rc-settings-header">
                    <div class="rc-settings-title">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="#5865f2"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
                        Настройки Rustcord
                    </div>
                    <button class="rustcord-close" id="rc-modal-close" title="Закрыть">✕</button>
                </div>

                <div class="rc-settings-row">
                    <div>
                        <div style="color: #f2f3f5; font-size: 14px; font-weight: 600;">Автоматическое обновление</div>
                        <div style="color: #949ba4; font-size: 12px; margin-top: 2px;">Фоновая проверка и автоматическая установка обновлений</div>
                    </div>
                    <div class="rc-toggle-switch ${rustcordSettings.auto_update ? 'active' : ''}" id="rc-toggle-autoupdate">
                        <div class="rc-toggle-knob"></div>
                    </div>
                </div>

                <div style="background: #2b2d31; border-radius: 8px; padding: 14px; margin-bottom: 18px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="color: #f2f3f5; font-size: 14px; font-weight: 600;">Версия приложения</div>
                            <div style="color: #23a55a; font-size: 12px; margin-top: 2px;">Rustcord v${CURRENT_VERSION} · Сборка на Rust/Tauri</div>
                        </div>
                        <button class="rustcord-btn" id="rc-btn-check-now" style="margin: 0; padding: 7px 16px;">
                            Проверить сейчас
                        </button>
                    </div>
                    <div id="rc-check-status" style="margin-top: 8px; font-size: 12px; color: #949ba4; display: none;"></div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px solid #3f4147;">
                    <a href="https://rustcord.mollra.xyz" target="_blank" style="color: #5865f2; font-size: 12px; text-decoration: none;">
                        Сайт: rustcord.mollra.xyz
                    </a>
                    <a href="https://github.com/1mN1kOo/rustcord" target="_blank" style="color: #949ba4; font-size: 12px; text-decoration: none;">
                        GitHub Репозиторий
                    </a>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const closeBtn = document.getElementById("rc-modal-close");
        const toggleBtn = document.getElementById("rc-toggle-autoupdate");
        const checkBtn = document.getElementById("rc-btn-check-now");
        const statusText = document.getElementById("rc-check-status");

        const closeHandler = () => overlay.remove();
        closeBtn.addEventListener("click", closeHandler);
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) closeHandler();
        });

        toggleBtn.addEventListener("click", () => {
            rustcordSettings.auto_update = !rustcordSettings.auto_update;
            toggleBtn.classList.toggle("active", rustcordSettings.auto_update);
            sendToNative("set-auto-update", { enabled: rustcordSettings.auto_update });
            showToast(rustcordSettings.auto_update ? "✓ Автообновление включено" : "⚠️ Автообновление отключено", 2000);
        });

        checkBtn.addEventListener("click", () => {
            checkBtn.disabled = true;
            checkBtn.innerText = "Проверка...";
            statusText.style.display = "block";
            statusText.style.color = "#949ba4";
            statusText.innerText = "Подключение к серверу обновлений...";
            sendToNative("check-update");
            setTimeout(() => {
                checkBtn.disabled = false;
                checkBtn.innerText = "Проверить сейчас";
            }, 3000);
        });
    }

    window.__RUSTCORD_INIT_SETTINGS__ = function(settings) {
        if (settings) {
            rustcordSettings = settings;
            const toggle = document.getElementById("rc-toggle-autoupdate");
            if (toggle) {
                toggle.classList.toggle("active", Boolean(rustcordSettings.auto_update));
            }
        }
    };

    window.__RUSTCORD_SET_AUTOUPDATE__ = function(enabled) {
        rustcordSettings.auto_update = Boolean(enabled);
        const toggle = document.getElementById("rc-toggle-autoupdate");
        if (toggle) {
            toggle.classList.toggle("active", rustcordSettings.auto_update);
        }
        showToast(rustcordSettings.auto_update ? "✓ Автообновление включено" : "⚠️ Автообновление отключено", 2500);
    };

    window.__RUSTCORD_HANDLE_UPDATE_CHECK__ = function(info, isManual) {
        const statusText = document.getElementById("rc-check-status");
        if (statusText) {
            statusText.style.display = "block";
            if (info && info.has_update) {
                statusText.style.color = "#5865f2";
                statusText.innerText = "Доступна новая версия: v" + info.version;
            } else {
                statusText.style.color = "#23a55a";
                statusText.innerText = "У вас установлена самая актуальная версия v" + CURRENT_VERSION;
            }
        }

        if (info && info.has_update) {
            const existing = document.getElementById("rustcord-update-bar");
            if (existing) existing.remove();

            const bar = document.createElement("div");
            bar.id = "rustcord-update-bar";
            bar.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 16px;">🚀</span>
                    <span>Доступна новая версия <strong>Rustcord v${info.version}</strong>!</span>
                </div>
                <div style="display: flex; align-items: center;">
                    <button class="rustcord-btn" id="rustcord-update-btn">Обновить сейчас</button>
                    <button class="rustcord-btn-secondary" id="rustcord-settings-btn">⚙ Настройки</button>
                    <button class="rustcord-close" id="rustcord-close-btn" title="Закрыть">✕</button>
                </div>
            `;
            document.body.appendChild(bar);

            const updateBtn = document.getElementById("rustcord-update-btn");
            const settingsBtn = document.getElementById("rustcord-settings-btn");
            const closeBtn = document.getElementById("rustcord-close-btn");

            updateBtn.addEventListener("click", () => {
                bar.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 16px; animation: spin 1s infinite linear;">⚡</span>
                        <span>Загрузка и бесшовная установка <strong>Rustcord v${info.version}</strong>... Приложение перезапустится через несколько секунд.</span>
                    </div>
                `;
                sendToNative("download-and-apply", { url: info.downloadUrl || "" });
            });

            settingsBtn.addEventListener("click", () => {
                showRustcordSettingsModal();
            });

            closeBtn.addEventListener("click", () => {
                bar.remove();
            });
        } else if (isManual) {
            showToast("✓ У вас установлена последняя версия <strong>Rustcord v" + CURRENT_VERSION + "</strong>");
        }
    };

    window.__RUSTCORD_UPDATE_ERROR__ = function(err) {
        showToast("❌ Ошибка при установке обновления: " + err, 5000);
        const bar = document.getElementById("rustcord-update-bar");
        if (bar) {
            bar.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span>⚠️</span>
                    <span>Не удалось обновить автоматически: ${err}</span>
                </div>
                <div>
                    <a href="https://rustcord.mollra.xyz/RustcordSetup.exe" target="_blank" class="rustcord-btn" style="text-decoration: none; display: inline-block;">Скачать установщик</a>
                    <button class="rustcord-close" onclick="this.closest('#rustcord-update-bar').remove()">✕</button>
                </div>
            `;
        }
    };

    // Load initial settings and trigger update check on launch
    setTimeout(() => {
        sendToNative("get-settings");
        sendToNative("check-update");
    }, 2500);
})();
