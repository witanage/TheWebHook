// ===============================================
// TOTP Authenticator JavaScript
// ===============================================

let accounts = [];
let timers = {};
let currentEditId = null;
let currentDeleteId = null;

// TOTP code cache - stores codes fetched from backend
let totpCodeCache = {};  // { account_id: { code: '123456', time_remaining: 25, fetched_at: timestamp } }

// NTP time synchronization
let ntpTimeOffset = 0;  // Offset in milliseconds between local time and NTP time
let ntpLastSync = 0;     // Timestamp of last NTP sync
const NTP_SYNC_INTERVAL = 300000;  // Sync every 5 minutes (300000ms)

// ===============================================
// Initialization
// ===============================================
document.addEventListener('DOMContentLoaded', function() {
    syncNTPTime();  // Initial NTP sync
    loadAccounts();
    setupEventListeners();

    // Periodically sync with NTP
    setInterval(syncNTPTime, NTP_SYNC_INTERVAL);
});

// ===============================================
// NTP Time Synchronization
// ===============================================
async function syncNTPTime() {
    try {
        const localTime = Date.now();
        const response = await fetch('/api/totp/ntp-time');

        if (!response.ok) {
            throw new Error('Failed to fetch NTP time');
        }

        const data = await response.json();

        if (data.success) {
            // Calculate offset: NTP time - local time
            ntpTimeOffset = data.timestamp - localTime;
            ntpLastSync = localTime;

            console.log(`NTP sync successful. Offset: ${ntpTimeOffset}ms (${(ntpTimeOffset / 1000).toFixed(3)}s)`);

            if (data.fallback) {
                console.warn('NTP server unavailable, using system time as fallback');
            }

            // Regenerate all TOTP codes with updated time
            if (accounts.length > 0) {
                await fetchAllTOTPCodes();
                renderAccounts();
            }
        }
    } catch (error) {
        console.error('NTP sync failed:', error);
        // Continue using local time if NTP sync fails
    }
}

function getNTPTime() {
    // Return current time adjusted for NTP offset
    return Date.now() + ntpTimeOffset;
}

// ===============================================
// TOTP Code Generation (Backend API)
// ===============================================
async function fetchTOTPCode(accountId) {
    /**
     * Fetch TOTP code from backend using pyotp with NTP time.
     * This ensures the code matches standard authenticators.
     */
    try {
        const response = await fetch(`/api/totp/generate/${accountId}`);

        if (!response.ok) {
            throw new Error('Failed to fetch TOTP code');
        }

        const data = await response.json();

        if (data.success) {
            // Cache the code
            totpCodeCache[accountId] = {
                code: data.code,
                time_remaining: data.time_remaining,
                period: data.period,
                fetched_at: Date.now()
            };
            return data.code;
        } else {
            console.error('TOTP generation failed:', data.message);
            return '000000';
        }
    } catch (error) {
        console.error('Error fetching TOTP code:', error);
        return '000000';
    }
}

async function fetchAllTOTPCodes() {
    /**
     * Fetch TOTP codes for all accounts in parallel
     */
    const promises = accounts.map(account => fetchTOTPCode(account.id));
    await Promise.all(promises);
}

function getCachedTOTPCode(accountId, digits = 6) {
    /**
     * Get cached TOTP code or return placeholder
     */
    const cached = totpCodeCache[accountId];
    if (cached && cached.code) {
        return cached.code;
    }
    return '0'.repeat(digits);
}

// ===============================================
// Event Listeners
// ===============================================
function setupEventListeners() {
    // Add Account Button
    document.getElementById('addAccountBtn').addEventListener('click', openAddModal);

    // Account Form
    document.getElementById('accountForm').addEventListener('submit', handleSaveAccount);

    // Color Presets
    document.querySelectorAll('.color-preset').forEach(btn => {
        btn.addEventListener('click', function() {
            const color = this.getAttribute('data-color');
            document.getElementById('colorPicker').value = color;
        });
    });

    // Close account modal on outside click
    document.getElementById('accountModal').addEventListener('click', function(event) {
        if (event.target === this) {
            closeAccountModal();
        }
    });

    // OCR Secret Key Extraction
    document.getElementById('uploadImageBtn').addEventListener('click', handleUploadImage);
    document.getElementById('secretKeyImageUpload').addEventListener('change', handleImageSelect);

    // Paste from clipboard listener (Ctrl+V)
    document.addEventListener('paste', handleClipboardPaste);
}

// ===============================================
// Load Accounts
// ===============================================
async function loadAccounts(showLoading = false) {
    const grid = document.getElementById('accountsGrid');
    const emptyState = document.getElementById('emptyState');

    // Show loading state if requested
    if (showLoading && accounts.length > 0) {
        grid.style.opacity = '0.5';
        grid.style.pointerEvents = 'none';
    }

    try {
        const response = await fetch('/api/totp/accounts');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const data = await response.json();
        if (data.success) {
            accounts = data.accounts;
            console.log(`Loaded ${accounts.length} accounts`);

            // Fetch TOTP codes for all accounts
            await fetchAllTOTPCodes();

            renderAccounts();
            startAllTimers();
        } else {
            console.error('Failed to load accounts:', data.message);
            showToast('Failed to load accounts', 'error');
        }
    } catch (error) {
        console.error('Error loading accounts:', error);
        showToast('Failed to load accounts', 'error');
    } finally {
        // Restore grid state
        grid.style.opacity = '1';
        grid.style.pointerEvents = 'auto';
    }
}

// ===============================================
// Render Accounts
// ===============================================
function renderAccounts() {
    const grid = document.getElementById('accountsGrid');
    const emptyState = document.getElementById('emptyState');

    console.log(`Rendering ${accounts.length} accounts`);

    if (accounts.length === 0) {
        grid.innerHTML = '';
        emptyState.classList.add('show');
        console.log('Empty state shown');
        return;
    }

    emptyState.classList.remove('show');

    // Clear grid first
    grid.innerHTML = '';

    // Force a reflow to ensure the clear is applied
    grid.offsetHeight;

    // Render all account cards
    grid.innerHTML = accounts.map(account => createAccountCard(account)).join('');
    console.log(`${accounts.length} account cards rendered to DOM`);

    // Force another reflow to ensure rendering is complete
    grid.offsetHeight;

    // Add event listeners to dynamically created elements
    accounts.forEach(account => {
        // Copy code on click
        const codeElement = document.getElementById(`code-${account.id}`);
        if (codeElement) {
            codeElement.addEventListener('click', () => copyCode(account.id));
        }

        // Copy button
        const copyBtn = document.getElementById(`copy-${account.id}`);
        if (copyBtn) {
            copyBtn.addEventListener('click', () => copyCode(account.id));
        }

        // Edit button
        const editBtn = document.getElementById(`edit-${account.id}`);
        if (editBtn) {
            editBtn.addEventListener('click', () => openEditModal(account.id));
        }

        // Delete button
        const deleteBtn = document.getElementById(`delete-${account.id}`);
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => openDeleteModal(account.id));
        }
    });

    console.log('Event listeners attached to all account cards');
}

// ===============================================
// Create Account Card HTML
// ===============================================
function createAccountCard(account) {
    // Use cached TOTP code from backend (generated with NTP time)
    const code = getCachedTOTPCode(account.id, account.digits);
    const timeRemaining = getTimeRemaining(account.period);
    const progress = (timeRemaining / account.period) * 100;

    return `
        <div class="account-card" data-account-id="${account.id}" style="--account-color: ${account.color}">
            <div class="account-header">
                <div class="account-info">
                    <h3 class="account-service">${escapeHtml(account.service_name)}</h3>
                    ${account.account_identifier ? `<p class="account-identifier">${escapeHtml(account.account_identifier)}</p>` : ''}
                </div>
                <div class="account-actions">
                    <button class="icon-btn" id="edit-${account.id}" title="Edit">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="icon-btn delete" id="delete-${account.id}" title="Delete">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>

            <div class="totp-code-wrapper">
                <h2 class="totp-code" id="code-${account.id}" title="Click to copy">${formatCode(code, account.digits)}</h2>
            </div>

            <div class="progress-wrapper">
                <div class="progress-label">
                    <span>Time remaining</span>
                    <span id="timer-${account.id}">${timeRemaining}s</span>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar ${getProgressClass(progress)}" id="progress-${account.id}" style="width: ${progress}%"></div>
                </div>
            </div>

            <button class="btn-primary copy-btn" id="copy-${account.id}">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                Copy Code
            </button>
        </div>
    `;
}

// ===============================================
// TOTP Generation (Client-side)
// ===============================================
function generateTOTP(secret, digits = 6, period = 30) {
    try {
        // Use NTP-synchronized time instead of local time
        const epoch = Math.floor(getNTPTime() / 1000);
        const counter = Math.floor(epoch / period);

        // Decode base32 secret
        const key = base32Decode(secret.replace(/\s/g, '').toUpperCase());

        // Generate HMAC-SHA1
        const hmac = hmacSHA1(key, intToBytes(counter));

        // Dynamic truncation
        const offset = hmac[hmac.length - 1] & 0x0f;
        const code = (
            ((hmac[offset] & 0x7f) << 24) |
            ((hmac[offset + 1] & 0xff) << 16) |
            ((hmac[offset + 2] & 0xff) << 8) |
            (hmac[offset + 3] & 0xff)
        );

        // Generate OTP
        const otp = code % Math.pow(10, digits);
        return String(otp).padStart(digits, '0');
    } catch (error) {
        console.error('TOTP generation error:', error);
        return '000000';
    }
}

// ===============================================
// Crypto Helper Functions
// ===============================================
function base32Decode(encoded) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';

    for (let i = 0; i < encoded.length; i++) {
        const val = alphabet.indexOf(encoded.charAt(i).toUpperCase());
        if (val === -1) continue;
        bits += val.toString(2).padStart(5, '0');
    }

    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.substr(i, 8), 2));
    }

    return new Uint8Array(bytes);
}

function hmacSHA1(key, message) {
    const blockSize = 64;

    if (key.length > blockSize) {
        key = sha1(key);
    }

    if (key.length < blockSize) {
        const paddedKey = new Uint8Array(blockSize);
        paddedKey.set(key);
        key = paddedKey;
    }

    const oKeyPad = new Uint8Array(blockSize);
    const iKeyPad = new Uint8Array(blockSize);

    for (let i = 0; i < blockSize; i++) {
        oKeyPad[i] = key[i] ^ 0x5c;
        iKeyPad[i] = key[i] ^ 0x36;
    }

    const innerHash = sha1(concatArrays(iKeyPad, message));
    return sha1(concatArrays(oKeyPad, innerHash));
}

function sha1(data) {
    // Simple SHA1 implementation
    const dataArray = Array.from(data);

    // Pad message
    const msgLen = dataArray.length * 8;
    dataArray.push(0x80);

    while ((dataArray.length % 64) !== 56) {
        dataArray.push(0);
    }

    // Append length
    for (let i = 7; i >= 0; i--) {
        dataArray.push((msgLen >>> (i * 8)) & 0xff);
    }

    // Initialize hash values
    let h0 = 0x67452301;
    let h1 = 0xEFCDAB89;
    let h2 = 0x98BADCFE;
    let h3 = 0x10325476;
    let h4 = 0xC3D2E1F0;

    // Process message in 512-bit chunks
    for (let chunk = 0; chunk < dataArray.length; chunk += 64) {
        const w = new Array(80);

        for (let i = 0; i < 16; i++) {
            w[i] = (dataArray[chunk + i * 4] << 24) |
                   (dataArray[chunk + i * 4 + 1] << 16) |
                   (dataArray[chunk + i * 4 + 2] << 8) |
                   dataArray[chunk + i * 4 + 3];
        }

        for (let i = 16; i < 80; i++) {
            w[i] = leftRotate(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
        }

        let a = h0, b = h1, c = h2, d = h3, e = h4;

        for (let i = 0; i < 80; i++) {
            let f, k;

            if (i < 20) {
                f = (b & c) | (~b & d);
                k = 0x5A827999;
            } else if (i < 40) {
                f = b ^ c ^ d;
                k = 0x6ED9EBA1;
            } else if (i < 60) {
                f = (b & c) | (b & d) | (c & d);
                k = 0x8F1BBCDC;
            } else {
                f = b ^ c ^ d;
                k = 0xCA62C1D6;
            }

            const temp = (leftRotate(a, 5) + f + e + k + w[i]) >>> 0;
            e = d;
            d = c;
            c = leftRotate(b, 30);
            b = a;
            a = temp;
        }

        h0 = (h0 + a) >>> 0;
        h1 = (h1 + b) >>> 0;
        h2 = (h2 + c) >>> 0;
        h3 = (h3 + d) >>> 0;
        h4 = (h4 + e) >>> 0;
    }

    const result = new Uint8Array(20);
    for (let i = 0; i < 5; i++) {
        const h = [h0, h1, h2, h3, h4][i];
        result[i * 4] = (h >>> 24) & 0xff;
        result[i * 4 + 1] = (h >>> 16) & 0xff;
        result[i * 4 + 2] = (h >>> 8) & 0xff;
        result[i * 4 + 3] = h & 0xff;
    }

    return result;
}

function leftRotate(n, bits) {
    return ((n << bits) | (n >>> (32 - bits))) >>> 0;
}

function intToBytes(num) {
    const bytes = new Uint8Array(8);
    for (let i = 7; i >= 0; i--) {
        bytes[i] = num & 0xff;
        num = num >>> 8;
    }
    return bytes;
}

function concatArrays(a, b) {
    const result = new Uint8Array(a.length + b.length);
    result.set(a, 0);
    result.set(b, a.length);
    return result;
}

// ===============================================
// Time and Progress Functions
// ===============================================
function getTimeRemaining(period = 30) {
    // Use NTP-synchronized time instead of local time
    const epoch = Math.floor(getNTPTime() / 1000);
    return period - (epoch % period);
}

function getProgressClass(progress) {
    if (progress <= 20) return 'danger';
    if (progress <= 50) return 'warning';
    return '';
}

function formatCode(code, digits = 6) {
    // Format code with space in middle for readability
    const half = Math.floor(digits / 2);
    return code.substring(0, half) + ' ' + code.substring(half);
}

// ===============================================
// Update Timers
// ===============================================
function startAllTimers() {
    // Clear existing timers
    Object.values(timers).forEach(timer => clearInterval(timer));
    timers = {};

    // Start new timers for each account
    accounts.forEach(account => {
        timers[account.id] = setInterval(() => updateAccountTimer(account.id), 1000);
    });
}

async function updateAccountTimer(accountId) {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;

    const timeRemaining = getTimeRemaining(account.period);
    const progress = (timeRemaining / account.period) * 100;

    // Update timer display
    const timerElement = document.getElementById(`timer-${accountId}`);
    if (timerElement) {
        timerElement.textContent = `${timeRemaining}s`;
    }

    // Update progress bar
    const progressElement = document.getElementById(`progress-${accountId}`);
    if (progressElement) {
        progressElement.style.width = `${progress}%`;
        progressElement.className = `progress-bar ${getProgressClass(progress)}`;
    }

    // Regenerate code when period expires (fetch from backend)
    if (timeRemaining === account.period) {
        const code = await fetchTOTPCode(accountId);
        const codeElement = document.getElementById(`code-${accountId}`);
        if (codeElement) {
            codeElement.textContent = formatCode(code, account.digits);
            codeElement.classList.remove('copied');
        }
    }
}

// ===============================================
// Copy Code
// ===============================================
function copyCode(accountId) {
    const codeElement = document.getElementById(`code-${accountId}`);
    if (!codeElement) return;

    const code = codeElement.textContent.replace(/\s/g, '');

    navigator.clipboard.writeText(code).then(() => {
        codeElement.classList.add('copied');
        showToast('Code copied to clipboard', 'success');

        setTimeout(() => {
            codeElement.classList.remove('copied');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
        showToast('Failed to copy code', 'error');
    });
}

// ===============================================
// Modal Functions
// ===============================================
function openAddModal() {
    currentEditId = null;
    document.getElementById('modalTitle').textContent = 'Add Account';
    document.getElementById('accountForm').reset();
    document.getElementById('accountId').value = '';
    document.getElementById('colorPicker').value = '#007bff';
    document.getElementById('accountModal').classList.add('active');
}

function openEditModal(accountId) {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;

    currentEditId = accountId;
    document.getElementById('modalTitle').textContent = 'Edit Account';
    document.getElementById('accountId').value = account.id;
    document.getElementById('serviceName').value = account.service_name;
    document.getElementById('accountIdentifier').value = account.account_identifier || '';
    document.getElementById('secretKey').value = account.secret_key;
    document.getElementById('issuer').value = account.issuer || '';
    document.getElementById('digits').value = account.digits;
    document.getElementById('period').value = account.period;
    document.getElementById('colorPicker').value = account.color;
    document.getElementById('accountModal').classList.add('active');
}

function closeAccountModal() {
    const modal = document.getElementById('accountModal');
    const form = document.getElementById('accountForm');
    const saveBtn = document.getElementById('saveAccountBtn');

    // Close modal immediately
    modal.classList.remove('active');

    // Reset state after a short delay to allow modal animation
    setTimeout(() => {
        // Reset form
        form.reset();

        // Reset button state
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Account';

        // Clear edit state
        currentEditId = null;
    }, 100);
}

function openDeleteModal(accountId) {
    currentDeleteId = accountId;
    const account = accounts.find(a => a.id === accountId);
    const serviceName = account ? account.service_name : 'this account';

    showConfirmModal(
        'Delete Account',
        `Are you sure you want to delete "${serviceName}"? This action cannot be undone.`,
        handleDeleteAccount
    );
}

// ===============================================
// Save Account
// ===============================================
async function handleSaveAccount(e) {
    e.preventDefault();

    const accountData = {
        service_name: document.getElementById('serviceName').value.trim(),
        account_identifier: document.getElementById('accountIdentifier').value.trim(),
        secret_key: document.getElementById('secretKey').value.replace(/\s/g, '').toUpperCase(),
        issuer: document.getElementById('issuer').value.trim(),
        digits: parseInt(document.getElementById('digits').value),
        period: parseInt(document.getElementById('period').value),
        color: document.getElementById('colorPicker').value
    };

    // Validate secret key
    if (!isValidBase32(accountData.secret_key)) {
        showToast('Invalid secret key format. Please use Base32 characters only.', 'error');
        return;
    }

    const url = currentEditId ? `/api/totp/accounts/${currentEditId}` : '/api/totp/accounts';
    const method = currentEditId ? 'PUT' : 'POST';
    const saveBtn = document.getElementById('saveAccountBtn');
    const originalText = saveBtn.innerHTML;
    const isEdit = currentEditId !== null;

    // Show loading state
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<svg class="spinner" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10" opacity="0.75"></path></svg> Saving...';

    try {
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(accountData)
        });

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const data = await response.json();
        console.log('Save response:', data);

        if (data.success) {
            console.log(`Account ${isEdit ? 'updated' : 'created'} successfully, ID: ${data.account_id || currentEditId}`);

            // Close modal first
            closeAccountModal();

            // Wait for accounts to reload
            console.log('Reloading accounts...');
            await loadAccounts(false);

            // Show success message after accounts are loaded and rendered
            showToast(isEdit ? 'Account updated successfully' : 'Account added successfully', 'success');
            console.log('UI updated successfully');
        } else {
            console.error('Save failed:', data.message);
            showToast(data.message || 'Failed to save account', 'error');

            // Restore button state on error
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
        }
    } catch (error) {
        console.error('Error saving account:', error);
        showToast('Failed to save account', 'error');

        // Restore button state on error
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
    }
}

// ===============================================
// Delete Account
// ===============================================
async function handleDeleteAccount() {
    if (!currentDeleteId) return;

    const deleteId = currentDeleteId;
    currentDeleteId = null;

    // Optimistically remove from UI
    const cardToRemove = document.querySelector(`[data-account-id="${deleteId}"]`);
    if (cardToRemove) {
        cardToRemove.style.opacity = '0.5';
        cardToRemove.style.pointerEvents = 'none';
    }

    try {
        const response = await fetch(`/api/totp/accounts/${deleteId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const data = await response.json();
        console.log('Delete response:', data);

        if (data.success) {
            console.log(`Account ${deleteId} deleted successfully`);

            // Wait for accounts to reload
            console.log('Reloading accounts after delete...');
            await loadAccounts();

            // Show success message after UI is updated
            showToast('Account deleted successfully', 'success');
            console.log('UI updated after deletion');
        } else {
            console.error('Delete failed:', data.message);
            showToast(data.message || 'Failed to delete account', 'error');

            // Restore the card on error
            if (cardToRemove) {
                cardToRemove.style.opacity = '1';
                cardToRemove.style.pointerEvents = 'auto';
            }
        }
    } catch (error) {
        console.error('Error deleting account:', error);
        showToast('Failed to delete account', 'error');

        // Restore the card on error
        if (cardToRemove) {
            cardToRemove.style.opacity = '1';
            cardToRemove.style.pointerEvents = 'auto';
        }
    }
}

// ===============================================
// Validation Functions
// ===============================================
function isValidBase32(str) {
    return /^[A-Z2-7]+=*$/.test(str);
}

// ===============================================
// OCR Secret Key Extraction
// ===============================================
function handleUploadImage() {
    document.getElementById('secretKeyImageUpload').click();
}

async function handleClipboardPaste(event) {
    // Only process if modal is open and secret key field is focused
    const modal = document.getElementById('accountModal');
    if (!modal.classList.contains('active')) return;

    const items = event.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
        if (item.type.startsWith('image/')) {
            event.preventDefault();
            const blob = item.getAsFile();
            await processImageForOCR(blob);
            return;
        }
    }
}

async function handleImageSelect(event) {
    const file = event.target.files[0];
    if (file) {
        await processImageForOCR(file);
    }
}

async function processImageForOCR(imageFile) {
    const statusDiv = document.getElementById('ocrStatus');
    const secretKeyInput = document.getElementById('secretKey');

    // Show processing status
    statusDiv.style.display = 'flex';
    statusDiv.className = 'ocr-status processing';
    statusDiv.innerHTML = `
        <svg class="spinner" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" opacity="0.25"></circle>
            <path d="M12 2a10 10 0 0 1 10 10" opacity="0.75"></path>
        </svg>
        <span>Extracting text from image...</span>
    `;

    try {
        console.log('Starting OCR processing...');

        // Use Tesseract.js to perform OCR
        const result = await Tesseract.recognize(
            imageFile,
            'eng',
            {
                logger: info => {
                    try {
                        if (info.status === 'recognizing text') {
                            const progress = Math.round(info.progress * 100);
                            const spanElement = statusDiv.querySelector('span');
                            if (spanElement) {
                                spanElement.textContent = `Processing image... ${progress}%`;
                            }
                        }
                    } catch (logError) {
                        console.error('Progress update error:', logError);
                        // Continue processing even if progress update fails
                    }
                }
            }
        );

        const text = result.data.text;
        console.log('OCR extracted text:', text);

        // Extract secret key from text
        const secretKey = extractSecretKey(text);
        console.log('Extracted secret key:', secretKey);

        if (secretKey) {
            secretKeyInput.value = secretKey;
            statusDiv.className = 'ocr-status success';
            statusDiv.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span>Secret key extracted successfully!</span>
            `;
            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 3000);
            showToast('Secret key extracted successfully!', 'success');
        } else {
            statusDiv.className = 'ocr-status error';
            statusDiv.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
                <span>No secret key found in image. Please try a clearer screenshot.</span>
            `;
            showToast('No secret key found in image', 'error');
        }
    } catch (error) {
        console.error('OCR processing error:', error);
        console.error('Error details:', error.message, error.stack);
        statusDiv.className = 'ocr-status error';
        statusDiv.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
            <span>Failed to process image. Error: ${error.message || 'Unknown error'}</span>
        `;
        showToast(`OCR failed: ${error.message || 'Please try again'}`, 'error');
    }
}

function extractSecretKey(text) {
    /**
     * Extract TOTP secret key from OCR text.
     * Looks for base32 patterns (uppercase letters A-Z and digits 2-7).
     * Common patterns:
     * - "Secret: ABCD1234..."
     * - "Key: ABCD1234..."
     * - Standalone keys with 16+ characters
     */

    // Remove all whitespace and newlines
    const cleanedText = text.replace(/\s+/g, '');

    // Pattern 1: Look for "secret" or "key" followed by base32 string
    const secretPattern = /(?:secret|key|code)[:=\s]*([A-Z2-7]{16,})/i;
    let match = text.match(secretPattern);
    if (match) {
        return match[1].toUpperCase().replace(/\s/g, '');
    }

    // Pattern 2: Look for standalone base32 strings (16-64 characters)
    const base32Pattern = /\b([A-Z2-7]{16,64})\b/g;
    const matches = [...text.matchAll(base32Pattern)];

    if (matches.length > 0) {
        // Return the longest match (most likely the secret key)
        const longestMatch = matches.reduce((longest, current) =>
            current[1].length > longest[1].length ? current : longest
        );
        return longestMatch[1].toUpperCase().replace(/\s/g, '');
    }

    // Pattern 3: Look in cleaned text (no spaces) for long base32 sequences
    const cleanedPattern = /([A-Z2-7]{16,64})/;
    match = cleanedText.match(cleanedPattern);
    if (match) {
        return match[1].toUpperCase();
    }

    return null;
}

// ===============================================
// Utility Functions
// ===============================================
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// ===============================================
// Toast Notification
// ===============================================
function showToast(message, type = 'info') {
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}
