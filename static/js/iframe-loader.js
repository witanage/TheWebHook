// iFrame Loader - Load and preview external web pages

(function() {
    'use strict';

    // DOM Elements
    const urlInput = document.getElementById('urlInput');
    const loadBtn = document.getElementById('loadBtn');
    const clearBtn = document.getElementById('clearBtn');
    const iframeToolbar = document.getElementById('iframeToolbar');
    const refreshBtn = document.getElementById('refreshBtn');
    const newTabBtn = document.getElementById('newTabBtn');
    const copyUrlBtn = document.getElementById('copyUrlBtn');
    const closeIframeBtn = document.getElementById('closeIframeBtn');
    const toolbarUrl = document.getElementById('toolbarUrl');
    const iframeLoading = document.getElementById('iframeLoading');
    const iframeWrapper = document.getElementById('iframeWrapper');
    const contentFrame = document.getElementById('contentFrame');
    const emptyState = document.getElementById('emptyState');
    const errorState = document.getElementById('errorState');
    const errorMessage = document.getElementById('errorMessage');
    const retryBtn = document.getElementById('retryBtn');

    let currentUrl = '';

    // Normalize URL - add https:// if no protocol specified
    function normalizeUrl(url) {
        url = url.trim();
        if (!url) return '';
        if (!/^https?:\/\//i.test(url)) {
            url = 'https://' + url;
        }
        return url;
    }

    // Validate URL format
    function isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    // Show a specific state panel and hide others
    function showState(state) {
        emptyState.style.display = 'none';
        iframeWrapper.style.display = 'none';
        errorState.style.display = 'none';
        iframeLoading.style.display = 'none';

        switch (state) {
            case 'empty':
                emptyState.style.display = 'flex';
                iframeToolbar.style.display = 'none';
                break;
            case 'loading':
                iframeLoading.style.display = 'flex';
                iframeToolbar.style.display = 'flex';
                break;
            case 'loaded':
                iframeWrapper.style.display = 'block';
                iframeToolbar.style.display = 'flex';
                break;
            case 'error':
                errorState.style.display = 'flex';
                iframeToolbar.style.display = 'none';
                break;
        }
    }

    // Load URL into iframe
    function loadUrl(url) {
        url = normalizeUrl(url);

        if (!url) {
            if (typeof showModal === 'function') {
                showModal('Error', 'Please enter a URL to load.');
            }
            urlInput.focus();
            return;
        }

        if (!isValidUrl(url)) {
            if (typeof showModal === 'function') {
                showModal('Error', 'Please enter a valid URL.');
            }
            urlInput.focus();
            return;
        }

        currentUrl = url;
        urlInput.value = url;
        toolbarUrl.textContent = url;
        showState('loading');

        // Set a timeout for loading
        const loadTimeout = setTimeout(function() {
            showState('error');
            errorMessage.textContent = 'The page took too long to load. It may be blocking embedded frames.';
        }, 15000);

        contentFrame.onload = function() {
            clearTimeout(loadTimeout);
            showState('loaded');
        };

        contentFrame.onerror = function() {
            clearTimeout(loadTimeout);
            showState('error');
            errorMessage.textContent = 'Failed to load the page. The site may block embedding or the URL may be unreachable.';
        };

        contentFrame.src = url;
    }

    // Close the iframe and return to empty state
    function closeIframe() {
        contentFrame.src = 'about:blank';
        currentUrl = '';
        urlInput.value = '';
        showState('empty');
        urlInput.focus();
    }

    // Copy URL to clipboard
    function copyUrl() {
        if (!currentUrl) return;

        navigator.clipboard.writeText(currentUrl).then(function() {
            if (typeof showToast === 'function') {
                showToast('URL copied to clipboard', 'success');
            }
        }).catch(function() {
            // Fallback for older browsers
            urlInput.select();
            document.execCommand('copy');
            if (typeof showToast === 'function') {
                showToast('URL copied to clipboard', 'success');
            }
        });
    }

    // Toggle clear button visibility
    function updateClearButton() {
        clearBtn.style.display = urlInput.value.length > 0 ? 'flex' : 'none';
    }

    // Event Listeners
    loadBtn.addEventListener('click', function() {
        loadUrl(urlInput.value);
    });

    urlInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            loadUrl(urlInput.value);
        }
    });

    urlInput.addEventListener('input', updateClearButton);

    clearBtn.addEventListener('click', function() {
        urlInput.value = '';
        updateClearButton();
        urlInput.focus();
    });

    refreshBtn.addEventListener('click', function() {
        if (currentUrl) {
            loadUrl(currentUrl);
        }
    });

    newTabBtn.addEventListener('click', function() {
        if (currentUrl) {
            window.open(currentUrl, '_blank');
        }
    });

    copyUrlBtn.addEventListener('click', copyUrl);

    closeIframeBtn.addEventListener('click', closeIframe);

    retryBtn.addEventListener('click', function() {
        if (currentUrl) {
            loadUrl(currentUrl);
        }
    });

    // Quick link buttons
    document.querySelectorAll('.quick-link-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var url = this.getAttribute('data-url');
            urlInput.value = url;
            updateClearButton();
            loadUrl(url);
        });
    });

    // Keyboard shortcut: Escape to close iframe
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && currentUrl) {
            closeIframe();
        }
    });

    // Focus the URL input on page load
    urlInput.focus();
})();
