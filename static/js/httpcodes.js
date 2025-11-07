// ==================== MODAL FUNCTIONS ====================

function showModal(title, message, onConfirm, isDanger = false) {
    const modal = document.getElementById('confirmModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const confirmBtn = document.getElementById('modalConfirmBtn');

    modalTitle.textContent = title;
    modalMessage.textContent = message;

    // Remove any existing event listeners by cloning
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    // Set danger styling
    if (isDanger) {
        newConfirmBtn.classList.add('danger');
    } else {
        newConfirmBtn.classList.remove('danger');
    }

    // Add new event listener
    newConfirmBtn.addEventListener('click', () => {
        onConfirm();
        closeModal();
    });

    modal.classList.add('show');

    // Close on overlay click
    const overlay = modal.querySelector('.modal-overlay');
    overlay.onclick = closeModal;

    // Close on escape key
    document.addEventListener('keydown', handleEscapeKey);
}

function closeModal() {
    const modal = document.getElementById('confirmModal');
    modal.classList.remove('show');
    document.removeEventListener('keydown', handleEscapeKey);
}

function handleEscapeKey(e) {
    if (e.key === 'Escape') {
        closeModal();
    }
}

function showAlert(title, message) {
    const modal = document.getElementById('confirmModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const footer = modal.querySelector('.modal-footer');

    modalTitle.textContent = title;
    modalMessage.textContent = message;

    // Hide confirm button, show only close
    footer.innerHTML = '<button class="modal-btn modal-btn-confirm" onclick="closeModal()">OK</button>';

    modal.classList.add('show');

    const overlay = modal.querySelector('.modal-overlay');
    overlay.onclick = closeModal;
    document.addEventListener('keydown', handleEscapeKey);
}

// Copy functionality
document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const url = window.location.origin + btn.dataset.url;
        navigator.clipboard.writeText(url).then(() => {
            const originalText = btn.textContent;
            btn.textContent = '✅';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 1200);
        });
    });
});

// Live test functionality
async function testHttpCode() {
    const statusCode = document.getElementById('statusCode').value;
    const httpMethod = document.getElementById('httpMethod').value;
    const resultDiv = document.getElementById('testResult');

    resultDiv.style.display = 'block';
    resultDiv.innerHTML = 'Testing...';

    try {
        const response = await fetch(`/httpcode/${statusCode}`, {
            method: httpMethod,
            headers: {
                'Content-Type': 'application/json'
            },
            body: httpMethod !== 'GET' ? JSON.stringify({ test: 'data' }) : null
        });

        const data = await response.json();
        resultDiv.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;

        // Apply syntax highlighting
        if (typeof Prism !== 'undefined') {
            Prism.highlightAll();
        }
    } catch (error) {
        resultDiv.innerHTML = `<span style="color: var(--danger-color)">Error: ${error.message}</span>`;
    }
}

// Theme-aware Prism switching
document.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
                const theme = document.documentElement.getAttribute('data-theme');
                const darkTheme = document.getElementById('prism-dark-theme');
                const lightTheme = document.getElementById('prism-light-theme');

                if (theme === 'light') {
                    darkTheme.disabled = true;
                    lightTheme.disabled = false;
                } else {
                    darkTheme.disabled = false;
                    lightTheme.disabled = true;
                }

                // Re-highlight code
                if (typeof Prism !== 'undefined') {
                    Prism.highlightAll();
                }
            }
        });
    });

    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
    });

    // Load sequence endpoints on page load
    initSequenceEndpoints();
});


// ==================== SEQUENCE ENDPOINTS ====================

let sequenceStepCounter = 0;

// Initialize sequence endpoints
async function initSequenceEndpoints() {
    await loadSequenceEndpoints();

    // Add first step by default
    addSequenceStep();

    // Event listener for add step button
    document.getElementById('addSequenceStep').addEventListener('click', addSequenceStep);

    // Event listener for form submission
    document.getElementById('sequenceEndpointForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await createSequenceEndpoint();
    });
}

// Add a new sequence step to the form
function addSequenceStep() {
    const stepsList = document.getElementById('sequenceStepsList');
    const stepNumber = sequenceStepCounter++;

    const stepDiv = document.createElement('div');
    stepDiv.className = 'sequence-step';
    stepDiv.dataset.stepId = stepNumber;

    stepDiv.innerHTML = `
        <div class="step-header">
            <span class="step-number">Step ${stepNumber + 1}</span>
            <button type="button" class="btn-remove-step" onclick="removeSequenceStep(${stepNumber})">✕</button>
        </div>
        <div class="step-fields">
            <div class="form-group">
                <label>HTTP Code</label>
                <input type="number" class="step-http-code" min="100" max="599" value="200" required>
            </div>
            <div class="form-group">
                <label>Delay (ms)</label>
                <input type="number" class="step-delay" min="0" max="60000" value="0" required>
            </div>
            <div class="form-group form-group-full">
                <label>Custom JSON Payload (Optional - Only for HTTP 200)</label>
                <textarea class="step-payload" rows="3" placeholder='{"key": "value"}'></textarea>
            </div>
        </div>
    `;

    stepsList.appendChild(stepDiv);
}

// Remove a sequence step
function removeSequenceStep(stepId) {
    const step = document.querySelector(`.sequence-step[data-step-id="${stepId}"]`);
    if (step) {
        const stepsList = document.getElementById('sequenceStepsList');
        if (stepsList.querySelectorAll('.sequence-step').length > 1) {
            step.remove();
            updateStepNumbers();
        } else {
            showAlert('Cannot Remove Step', 'You must have at least one step in the sequence.');
        }
    }
}

// Update step numbers after removal
function updateStepNumbers() {
    const steps = document.querySelectorAll('.sequence-step');
    steps.forEach((step, index) => {
        const stepNumber = step.querySelector('.step-number');
        if (stepNumber) {
            stepNumber.textContent = `Step ${index + 1}`;
        }
    });
}

// Create new sequence endpoint
async function createSequenceEndpoint() {
    const endpointName = document.getElementById('sequenceEndpointName').value.trim();
    const description = document.getElementById('sequenceDescription').value.trim();

    // Collect all steps
    const steps = [];
    const stepElements = document.querySelectorAll('.sequence-step');

    if (stepElements.length === 0) {
        showAlert('Missing Steps', 'Please add at least one step to the sequence.');
        return;
    }

    for (const stepElement of stepElements) {
        const httpCode = parseInt(stepElement.querySelector('.step-http-code').value);
        const delayMs = parseInt(stepElement.querySelector('.step-delay').value);
        const payloadText = stepElement.querySelector('.step-payload').value.trim();

        let payload = null;
        if (payloadText) {
            try {
                payload = JSON.parse(payloadText);
            } catch (e) {
                showAlert('Invalid JSON', 'Invalid JSON payload in one of the steps. Please check your JSON syntax.');
                return;
            }
        }

        steps.push({
            http_code: httpCode,
            delay_ms: delayMs,
            payload: payload
        });
    }

    try {
        const response = await fetch('/api/sequence-endpoints', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                endpoint_name: endpointName,
                description: description,
                sequence_config: steps
            })
        });

        const data = await response.json();

        if (data.success) {
            showAlert('Success', 'Sequence endpoint created successfully!');
            document.getElementById('sequenceEndpointForm').reset();

            // Clear and re-add default step
            document.getElementById('sequenceStepsList').innerHTML = '';
            sequenceStepCounter = 0;
            addSequenceStep();

            await loadSequenceEndpoints();
        } else {
            showAlert('Error', `Error: ${data.error}`);
        }
    } catch (error) {
        showAlert('Error', `Error creating sequence endpoint: ${error.message}`);
    }
}

// Load and display sequence endpoints
async function loadSequenceEndpoints() {
    try {
        const response = await fetch('/api/sequence-endpoints');
        const data = await response.json();

        if (data.success) {
            displaySequenceEndpoints(data.endpoints);
        } else {
            console.error('Error loading sequence endpoints:', data.error);
        }
    } catch (error) {
        console.error('Error loading sequence endpoints:', error);
    }
}

// Display sequence endpoints in table
function displaySequenceEndpoints(endpoints) {
    const tbody = document.querySelector('#sequenceEndpointsTable tbody');

    if (endpoints.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="no-data">No sequence endpoints yet. Create one above!</td></tr>';
        return;
    }

    tbody.innerHTML = endpoints.map(endpoint => {
        const sequence = typeof endpoint.sequence_config === 'string'
            ? JSON.parse(endpoint.sequence_config)
            : endpoint.sequence_config;

        // Build sequence display with better formatting
        const sequenceDisplay = sequence.map((step, idx) => {
            const isNext = idx === endpoint.current_index;
            const code = step.http_code;
            const delay = step.delay_ms > 0 ? `+${step.delay_ms}ms` : '';
            const stepText = delay ? `${code}<span class="delay-text">${delay}</span>` : code;
            return isNext ? `<span class="step-current">${stepText}</span>` : `<span class="step-normal">${stepText}</span>`;
        }).join('<span class="step-arrow">→</span>');

        const currentStep = sequence[endpoint.current_index];
        const stepInfo = `Step ${endpoint.current_index + 1}/${sequence.length}: ${currentStep.http_code}`;
        const delayInfo = currentStep.delay_ms > 0 ? ` (+${currentStep.delay_ms}ms)` : '';

        const statusIcon = endpoint.is_active ? '●' : '○';
        const statusClass = endpoint.is_active ? 'status-active' : 'status-inactive';

        const url = `${window.location.origin}/sequence-endpoint/${userId}/${endpoint.endpoint_name}`;
        const description = endpoint.description ? `<div class="endpoint-desc">${endpoint.description}</div>` : '';

        return `
            <tr class="seq-row ${endpoint.is_active ? 'active' : 'inactive'}">
                <td class="col-status">
                    <span class="${statusClass}">${statusIcon}</span>
                </td>
                <td class="col-name">
                    <div class="endpoint-info">
                        <div class="endpoint-name">${endpoint.endpoint_name}</div>
                        ${description}
                    </div>
                </td>
                <td class="col-sequence">
                    <div class="sequence-display">${sequenceDisplay}</div>
                </td>
                <td class="col-progress">
                    <div class="current-info">
                        <div class="step-info">${stepInfo}${delayInfo}</div>
                    </div>
                </td>
                <td class="col-actions">
                    <div class="action-btns">
                        <button class="action-btn copy-btn" onclick="copySequenceEndpointUrl('${url}')" title="Copy URL">📋</button>
                        <button class="action-btn" onclick="resetSequenceEndpoint(${endpoint.id})" title="Reset">🔄</button>
                        <button class="action-btn" onclick="toggleSequenceEndpoint(${endpoint.id}, ${endpoint.is_active ? 0 : 1})" title="${endpoint.is_active ? 'Deactivate' : 'Activate'}">
                            ${endpoint.is_active ? '⏸' : '▶'}
                        </button>
                        <button class="action-btn delete-btn" onclick="deleteSequenceEndpoint(${endpoint.id})" title="Delete">🗑</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Reset sequence endpoint counter
async function resetSequenceEndpoint(endpointId) {
    showModal('Reset Sequence', 'Reset this sequence to the beginning?', async () => {
        try {
            const response = await fetch(`/api/sequence-endpoints/${endpointId}/reset`, {
                method: 'POST'
            });

            const data = await response.json();

            if (data.success) {
                await loadSequenceEndpoints();
            } else {
                showAlert('Error', data.error);
            }
        } catch (error) {
            showAlert('Error', `Error resetting sequence endpoint: ${error.message}`);
        }
    });
}

// Toggle sequence endpoint active status
async function toggleSequenceEndpoint(endpointId, isActive) {
    try {
        const response = await fetch(`/api/sequence-endpoints/${endpointId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: isActive })
        });

        const data = await response.json();

        if (data.success) {
            await loadSequenceEndpoints();
        } else {
            showAlert('Error', data.error);
        }
    } catch (error) {
        showAlert('Error', `Error toggling sequence endpoint: ${error.message}`);
    }
}

// Delete sequence endpoint
async function deleteSequenceEndpoint(endpointId) {
    showModal('Delete Endpoint', 'Are you sure you want to delete this sequence endpoint? This action cannot be undone.', async () => {
        try {
            const response = await fetch(`/api/sequence-endpoints/${endpointId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                await loadSequenceEndpoints();
            } else {
                showAlert('Error', data.error);
            }
        } catch (error) {
            showAlert('Error', `Error deleting sequence endpoint: ${error.message}`);
        }
    }, true);
}

// Copy sequence endpoint URL to clipboard
function copySequenceEndpointUrl(url) {
    navigator.clipboard.writeText(url).then(() => {
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = '✅ Copied!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 1200);
    });
}