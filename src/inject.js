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
                        <div class="rc-modal-container">
                            <!-- Header Tabs -->
                            <div class="rc-modal-tabs">
                                <button class="rc-tab-btn active" data-tab="applications">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;"><path d="M4 3h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm0 4v12h16V7H4zm2-2h2v1H6V5zm4 0h2v1h-2V5zm4 0h2v1h-2V5z"/></svg>
                                    Приложения
                                </button>
                                <button class="rc-tab-btn" data-tab="screens">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;"><path d="M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h6v2H8v2h8v-2h-2v-2h6a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 12H4V5h16v10z"/></svg>
                                    Весь экран
                                </button>
                                <button class="rc-tab-btn" data-tab="devices">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>
                                    Устройства
                                </button>
                            </div>

                            <!-- Source Cards Grid -->
                            <div class="rc-cards-grid" id="rc-sources-list">
                                <!-- Cards injected dynamically -->
                            </div>

                            <!-- Bottom Bar -->
                            <div class="rc-modal-footer">
                                <div class="rc-quality-info">
                                    <div class="rc-quality-title">Пользовательские</div>
                                    <div class="rc-quality-desc">· 720p &nbsp; 30fps</div>
                                </div>
                                <div class="rc-footer-actions">
                                    <button class="rc-gear-btn" title="Настройки качества">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
                                    </button>
                                    <button class="rc-cancel-btn" id="rc-cancel">Отмена</button>
                                    <button class="rc-golive-btn" id="rc-submit">Прямой эфир</button>
                                </div>
                            </div>
                        </div>
                    `;

                    document.body.appendChild(overlay);

                    let currentTab = "applications";
                    let selectedSourceId = null;

                    function renderCards() {
                        const list = document.getElementById("rc-sources-list");
                        if (!list) return;
                        list.innerHTML = "";

                        const allSources = window.__RUSTCORD_SOURCES__ || [];
                        let filtered = [];

                        if (currentTab === "applications") {
                            filtered = allSources.filter(s => s.id.startsWith("window:"));
                        } else if (currentTab === "screens") {
                            filtered = allSources.filter(s => s.id.startsWith("screen:"));
                        } else {
                            // Devices tab
                            filtered = [];
                        }

                        if (filtered.length === 0) {
                            list.innerHTML = `
                                <div style="grid-column: span 2; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 260px; color: #949ba4;">
                                    <div style="font-size: 32px; margin-bottom: 8px;">🔍</div>
                                    <div style="font-weight: 600; font-size: 15px;">${currentTab === 'devices' ? 'Устройства захвата не найдены' : 'Окна не найдены'}</div>
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
                            card.className = "rc-source-card" + (isSelected ? " selected" : "");
                            
                            // Determine application icon based on name
                            let iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="#5865F2"><path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02-2.72 4.07-3.47 8.03-3.1 11.95 0 .02.01.04.03.05 1.8 1.32 3.53 2.12 5.24 2.65.03.01.06 0 .07-.02.4-.55.76-1.13 1.07-1.74.02-.04 0-.08-.04-.09-.57-.22-1.11-.48-1.64-.78-.04-.02-.04-.08-.01-.11.11-.08.22-.17.33-.25.02-.02.05-.02.07-.01 3.44 1.57 7.15 1.57 10.55 0 .02-.01.05-.01.07.01.11.09.22.17.33.26.04.03.04.09-.01.11-.52.31-1.07.56-1.64.78-.04.01-.05.06-.04.09.32.61.68 1.19 1.07 1.74.03.01.06.02.09.01 1.72-.53 3.45-1.33 5.25-2.65.02-.01.03-.03.03-.05.44-4.53-.73-8.46-3.1-11.95-.01-.01-.02-.02-.04-.02z"/></svg>`;
                            const nameLower = source.name.toLowerCase();
                            if (nameLower.includes("fortnite")) {
                                iconSvg = `<div style="width: 18px; height: 18px; background: #0078F2; color: #fff; font-weight: 900; font-size: 12px; display: flex; align-items: center; justify-content: center; border-radius: 3px;">F</div>`;
                            } else if (nameLower.includes("rustcord") || nameLower.includes("discord")) {
                                iconSvg = `<div style="width: 18px; height: 18px; background: #5865F2; color: #fff; display: flex; align-items: center; justify-content: center; border-radius: 3px;">🎮</div>`;
                            } else if (nameLower.includes("antigravity")) {
                                iconSvg = `<div style="width: 18px; height: 18px; background: #EA4335; color: #fff; font-weight: 900; font-size: 11px; display: flex; align-items: center; justify-content: center; border-radius: 3px;">▲</div>`;
                            }

                            card.innerHTML = `
                                <div class="rc-thumb-wrapper">
                                    <img src="${source.url}" class="rc-thumb-img" alt="${source.name}" />
                                </div>
                                <div class="rc-card-caption">
                                    <div class="rc-card-icon">${iconSvg}</div>
                                    <div class="rc-card-title" title="${source.name}">${source.name}</div>
                                </div>
                            `;

                            card.addEventListener("click", () => {
                                selectedSourceId = source.id;
                                renderCards();
                            });

                            list.appendChild(card);
                        });
                    }

                    // Tab switching
                    overlay.querySelectorAll(".rc-tab-btn").forEach(btn => {
                        btn.addEventListener("click", () => {
                            overlay.querySelectorAll(".rc-tab-btn").forEach(b => b.classList.remove("active"));
                            btn.classList.add("active");
                            currentTab = btn.getAttribute("data-tab");
                            renderCards();
                        });
                    });

                    // Hook source updates
                    window.__UPDATE_RUSTCORD_SOURCES__ = () => {
                        renderCards();
                    };

                    renderCards();

                    // Close / Cancel actions
                    const cleanup = () => {
                        window.__UPDATE_RUSTCORD_SOURCES__ = null;
                        overlay.remove();
                    };

                    document.getElementById("rc-cancel").addEventListener("click", () => {
                        cleanup();
                        reject(new DOMException("Permission denied by user", "NotAllowedError"));
                    });

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
                    document.getElementById("rc-submit").addEventListener("click", async () => {
                        cleanup();
                        window.removeEventListener("keydown", escHandler);
                        try {
                            const constraints = {
                                video: {
                                    frameRate: { ideal: 60, max: 60 },
                                    width: { ideal: 1920, max: 3840 },
                                    height: { ideal: 1080, max: 2160 }
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
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                z-index: 999999;
                background: linear-gradient(90deg, #5865F2, #8A2BE2);
                color: #FFFFFF;
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 10px 20px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 14px;
                font-weight: 600;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
                animation: slideDown 0.3s ease-out;
            }
            @keyframes slideDown {
                from { transform: translateY(-100%); }
                to { transform: translateY(0); }
            }
            .rustcord-btn {
                background: #FFFFFF;
                color: #111214;
                border: none;
                padding: 6px 14px;
                border-radius: 16px;
                font-weight: 700;
                font-size: 13px;
                cursor: pointer;
                margin-left: 10px;
                transition: opacity 0.2s;
            }
            .rustcord-btn:hover {
                opacity: 0.9;
            }
            .rustcord-close {
                background: transparent;
                border: none;
                color: rgba(255, 255, 255, 0.8);
                font-size: 18px;
                cursor: pointer;
                margin-left: 12px;
                line-height: 1;
            }
            .rustcord-close:hover {
                color: #FFFFFF;
            }

            /* Authentic Discord In-App Screen Sharing Modal (Image 2) */
            #rustcord-screenshare-overlay {
                position: fixed !important;
                inset: 0 !important;
                background: rgba(0, 0, 0, 0.75) !important;
                backdrop-filter: blur(5px) !important;
                z-index: 9999999 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                font-family: "gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif !important;
                animation: rcFadeIn 0.15s ease-out;
            }
            @keyframes rcFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            .rc-modal-container {
                width: 740px !important;
                max-width: 95vw !important;
                height: 580px !important;
                max-height: 90vh !important;
                background: #313338 !important;
                border-radius: 12px !important;
                box-shadow: 0 16px 48px rgba(0, 0, 0, 0.8) !important;
                display: flex !important;
                flex-direction: column !important;
                padding: 24px !important;
                box-sizing: border-box !important;
                overflow: hidden !important;
                animation: rcScaleIn 0.18s cubic-bezier(0.18, 0.89, 0.32, 1.28);
            }
            @keyframes rcScaleIn {
                from { transform: scale(0.96); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
            }
            .rc-modal-tabs {
                display: flex !important;
                gap: 12px !important;
                background: #1e1f22 !important;
                padding: 4px !important;
                border-radius: 8px !important;
                margin-bottom: 20px !important;
            }
            .rc-tab-btn {
                flex: 1 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                background: transparent !important;
                border: none !important;
                color: #949ba4 !important;
                font-size: 14px !important;
                font-weight: 600 !important;
                padding: 8px 16px !important;
                border-radius: 6px !important;
                cursor: pointer !important;
                transition: all 0.15s ease !important;
            }
            .rc-tab-btn:hover {
                color: #dbdee1 !important;
            }
            .rc-tab-btn.active {
                background: #313338 !important;
                color: #ffffff !important;
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3) !important;
            }
            .rc-cards-grid {
                flex: 1 !important;
                display: grid !important;
                grid-template-columns: repeat(2, 1fr) !important;
                gap: 16px !important;
                overflow-y: auto !important;
                padding-right: 4px !important;
            }
            .rc-source-card {
                background: #2b2d31 !important;
                border: 2px solid transparent !important;
                border-radius: 8px !important;
                cursor: pointer !important;
                overflow: hidden !important;
                transition: all 0.15s ease !important;
                display: flex !important;
                flex-direction: column !important;
            }
            .rc-source-card:hover {
                border-color: #4752c4 !important;
                transform: translateY(-2px) !important;
            }
            .rc-source-card.selected {
                border-color: #5865f2 !important;
                box-shadow: 0 0 16px rgba(88, 101, 242, 0.45) !important;
            }
            .rc-thumb-wrapper {
                width: 100% !important;
                height: 155px !important;
                background: #111214 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                overflow: hidden !important;
            }
            .rc-thumb-img {
                width: 100% !important;
                height: 100% !important;
                object-fit: cover !important;
                display: block !important;
            }
            .rc-card-caption {
                padding: 10px 14px !important;
                background: #232428 !important;
                display: flex !important;
                align-items: center !important;
                gap: 10px !important;
            }
            .rc-card-icon {
                flex-shrink: 0 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
            }
            .rc-card-title {
                color: #f2f3f5 !important;
                font-size: 13.5px !important;
                font-weight: 600 !important;
                white-space: nowrap !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
            }
            .rc-modal-footer {
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                padding-top: 18px !important;
                margin-top: 14px !important;
                border-top: 1px solid #3f4147 !important;
            }
            .rc-quality-info {
                display: flex !important;
                flex-direction: column !important;
                gap: 2px !important;
            }
            .rc-quality-title {
                color: #ffffff !important;
                font-size: 14px !important;
                font-weight: 700 !important;
            }
            .rc-quality-desc {
                color: #949ba4 !important;
                font-size: 12px !important;
            }
            .rc-footer-actions {
                display: flex !important;
                align-items: center !important;
                gap: 12px !important;
            }
            .rc-gear-btn {
                background: #383a40 !important;
                color: #b5bac1 !important;
                border: none !important;
                border-radius: 6px !important;
                padding: 8px 10px !important;
                cursor: pointer !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                transition: color 0.15s, background 0.15s !important;
            }
            .rc-gear-btn:hover {
                color: #ffffff !important;
                background: #404249 !important;
            }
            .rc-cancel-btn {
                background: transparent !important;
                border: none !important;
                color: #f2f3f5 !important;
                font-size: 14px !important;
                font-weight: 600 !important;
                padding: 10px 18px !important;
                cursor: pointer !important;
                border-radius: 4px !important;
                transition: text-decoration 0.15s !important;
            }
            .rc-cancel-btn:hover {
                text-decoration: underline !important;
            }
            .rc-golive-btn {
                background: #5865f2 !important;
                color: #ffffff !important;
                border: none !important;
                border-radius: 4px !important;
                font-size: 14px !important;
                font-weight: 600 !important;
                padding: 10px 24px !important;
                cursor: pointer !important;
                box-shadow: 0 4px 12px rgba(88, 101, 242, 0.4) !important;
                transition: background 0.15s, transform 0.1s !important;
            }
            .rc-golive-btn:hover {
                background: #4752c4 !important;
            }
            .rc-golive-btn:active {
                transform: scale(0.98) !important;
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

    // 8. Auto-updater check (can be disabled in localStorage: rustcord_auto_update = 'false')
    const checkUpdates = async () => {
        const autoUpdateEnabled = localStorage.getItem("rustcord_auto_update") !== "false";
        if (!autoUpdateEnabled) {
            console.log("[Rustcord] Auto-update check is disabled by user setting.");
            return;
        }

        try {
            const res = await originalFetch("https://rustcord.mollra.xyz/rustcord/version.json?t=" + Date.now());
            if (!res.ok) return;
            const data = await res.json();
            
            if (data && data.version && data.version !== CURRENT_VERSION) {
                // Render modern Discord update notification banner
                const bar = document.createElement("div");
                bar.id = "rustcord-update-bar";
                bar.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span>🚀</span>
                        <span>Доступна новая версия <strong>Rustcord v${data.version}</strong>!</span>
                    </div>
                    <div style="display: flex; align-items: center;">
                        <button class="rustcord-btn" id="rustcord-update-btn">Обновить</button>
                        <button class="rustcord-close" id="rustcord-close-btn" title="Закрыть">✕</button>
                    </div>
                `;
                document.body.appendChild(bar);

                document.getElementById("rustcord-update-btn").addEventListener("click", () => {
                    window.open(data.downloadUrl || "https://rustcord.mollra.xyz", "_blank");
                });
                document.getElementById("rustcord-close-btn").addEventListener("click", () => {
                    bar.remove();
                });
            }
        } catch (_) {}
    };

    // Run update check after 3 seconds of startup
    setTimeout(checkUpdates, 3000);
})();
