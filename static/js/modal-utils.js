// Modal utility functions for alerts and confirmations

/**
 * Show an alert modal
 * @param {string} title - Modal title
 * @param {string} message - Modal message
 * @param {function} onOk - Callback function when OK is clicked (optional)
 */
function showModal(title, message, onOk) {
    const modal = document.getElementById('genericAlertModal');
    const titleEl = document.getElementById('alertModalTitle');
    const messageEl = document.getElementById('alertModalMessage');
    const okBtn = document.getElementById('alertModalOkBtn');

    titleEl.textContent = title;
    messageEl.textContent = message;

    // Update icon based on title
    const iconEl = document.getElementById('alertModalIcon');
    iconEl.className = 'modal-icon';

    if (title.toLowerCase().includes('error') || title.toLowerCase().includes('failed')) {
        iconEl.classList.add('error');
        iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>`;
    } else if (title.toLowerCase().includes('success')) {
        iconEl.classList.add('success');
        iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M9 12l2 2 4-4"></path>
        </svg>`;
    } else if (title.toLowerCase().includes('warning')) {
        iconEl.classList.add('warning');
        iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>`;
    } else {
        iconEl.classList.add('info');
        iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>`;
    }

    // Remove any existing event listeners
    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);

    // Add new event listener
    document.getElementById('alertModalOkBtn').addEventListener('click', function() {
        modal.classList.remove('active');
        if (onOk && typeof onOk === 'function') {
            onOk();
        }
    });

    modal.classList.add('active');
}

/**
 * Show a confirmation modal
 * @param {string} title - Modal title
 * @param {string} message - Modal message
 * @param {function} onConfirm - Callback function when Confirm is clicked
 * @param {function} onCancel - Callback function when Cancel is clicked (optional)
 */
function showConfirmModal(title, message, onConfirm, onCancel) {
    const modal = document.getElementById('genericConfirmModal');
    const titleEl = document.getElementById('confirmModalTitle');
    const messageEl = document.getElementById('confirmModalMessage');
    const confirmBtn = document.getElementById('confirmModalConfirmBtn');
    const cancelBtn = document.getElementById('confirmModalCancelBtn');

    titleEl.textContent = title;
    messageEl.textContent = message;

    // Remove any existing event listeners by cloning
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    // Add new event listeners
    document.getElementById('confirmModalConfirmBtn').addEventListener('click', function() {
        modal.classList.remove('active');
        if (onConfirm && typeof onConfirm === 'function') {
            onConfirm();
        }
    });

    document.getElementById('confirmModalCancelBtn').addEventListener('click', function() {
        modal.classList.remove('active');
        if (onCancel && typeof onCancel === 'function') {
            onCancel();
        }
    });

    modal.classList.add('active');
}

// Outside click to close modals is disabled
// Modals can only be closed using the action buttons
