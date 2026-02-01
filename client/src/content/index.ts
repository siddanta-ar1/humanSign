/**
 * Content script entry point.
 *
 * Initializes keystroke tracking with manual control.
 * Works with all editors including Google Docs, Notion, etc.
 */

import { keystrokeTracker } from './keystroke-tracker';

// Listen for control messages from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'CONTENT_START_TRACKING') {
        keystrokeTracker.start()
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true; // Async response
    }

    if (message.type === 'CONTENT_STOP_TRACKING') {
        keystrokeTracker.stop()
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (message.type === 'CONTENT_GET_TEXT') {
        // Try to capture text from active element or selection
        const text = captureText();
        sendResponse({ success: true, text });
        return true;
    }

    return false;
});

/**
 * Capture text from the current page/editor
 * Priority: Known editors > Active element > Selection > Full page scan
 */
function captureText(): string {
    // Priority 1: Check for ProseMirror/Tiptap editor first (most common)
    const proseMirror = document.querySelector('.ProseMirror');
    if (proseMirror) {
        const text = proseMirror.textContent?.trim() || '';
        if (text.length > 0) {
            console.log('[HumanSign] Captured text from ProseMirror:', text.length, 'chars');
            return text;
        }
    }

    // Priority 2: Check for Monaco editor
    const monacoLines = document.querySelectorAll('.monaco-editor .view-line');
    if (monacoLines.length > 0) {
        const lines: string[] = [];
        monacoLines.forEach(line => {
            lines.push(line.textContent || '');
        });
        const text = lines.join('\n').trim();
        if (text.length > 0) {
            console.log('[HumanSign] Captured text from Monaco:', text.length, 'chars');
            return text;
        }
    }

    // Priority 3: Check active element
    const active = document.activeElement as HTMLElement | null;
    if (active) {
        if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) {
            if (active.value.length > 0) {
                console.log('[HumanSign] Captured text from input/textarea:', active.value.length, 'chars');
                return active.value;
            }
        }
        if (active.isContentEditable || active.getAttribute('contenteditable') === 'true') {
            const text = active.textContent?.trim() || '';
            if (text.length > 0) {
                console.log('[HumanSign] Captured text from contenteditable:', text.length, 'chars');
                return text;
            }
        }
    }

    // Priority 4: Check selection
    const selection = window.getSelection()?.toString()?.trim();
    if (selection && selection.length > 0) {
        console.log('[HumanSign] Captured text from selection:', selection.length, 'chars');
        return selection;
    }

    // Priority 5: Scan for known editor selectors
    const editorSelectors = [
        '.docs-texteventtarget-iframe', // Google Docs
        '.notion-page-content', // Notion
        '[contenteditable="true"]',
        'textarea',
        '#editor',
        '.editor'
    ];

    for (const selector of editorSelectors) {
        const el = document.querySelector(selector);
        if (el) {
            if (el instanceof HTMLIFrameElement) {
                try {
                    const iframeDoc = el.contentDocument || el.contentWindow?.document;
                    const text = iframeDoc?.body?.textContent?.trim() || '';
                    if (text.length > 0) {
                        console.log('[HumanSign] Captured text from iframe:', text.length, 'chars');
                        return text;
                    }
                } catch {
                    continue; // Cross-origin
                }
            }
            const text = el.textContent?.trim() || (el as HTMLTextAreaElement).value || '';
            if (text.length > 0) {
                console.log('[HumanSign] Captured text from', selector, ':', text.length, 'chars');
                return text;
            }
        }
    }

    console.log('[HumanSign] No text content captured');
    return '';
}

// Log initialization
console.log('[HumanSign] Content script loaded - waiting for manual start');

// Verify on form submission
document.addEventListener('submit', () => {
    void keystrokeTracker.verify();
});

// Auto-stop on page unload
window.addEventListener('beforeunload', () => {
    void keystrokeTracker.stop();
});
