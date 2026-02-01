// Tauri Window Controls
// Wait for the window to fully load to ensure Tauri API is injected
window.addEventListener('load', () => {
    initWindowControls();
});

// Also try on DOMContentLoaded as a fallback
document.addEventListener('DOMContentLoaded', () => {
    // Small delay to ensure Tauri API is fully injected
    setTimeout(() => {
        initWindowControls();
    }, 100);
});

let controlsInitialized = false;

function initWindowControls() {
    // Prevent double initialization
    if (controlsInitialized) return;

    // Check if Tauri API is available
    if (typeof window.__TAURI__ === 'undefined') {
        console.log('[Window Controls] Tauri not detected, hiding titlebar');
        const titlebar = document.querySelector('.titlebar');
        if (titlebar) {
            titlebar.style.display = 'none';
        }
        return;
    }

    controlsInitialized = true;
    console.log('[Window Controls] Tauri detected, initializing controls');

    const appWindow = window.__TAURI__.window.appWindow;

    const minimizeBtn = document.getElementById('titlebar-minimize');
    const maximizeBtn = document.getElementById('titlebar-maximize');
    const closeBtn = document.getElementById('titlebar-close');

    if (minimizeBtn) {
        minimizeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('[Window Controls] Minimize clicked');
            appWindow.minimize();
        });
    }

    if (maximizeBtn) {
        maximizeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('[Window Controls] Maximize clicked');
            appWindow.toggleMaximize();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('[Window Controls] Close clicked');
            appWindow.close();
        });
    }

    console.log('[Window Controls] All controls initialized successfully');
}
