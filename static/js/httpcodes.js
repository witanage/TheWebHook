// Fallback copy function for browsers that don't support clipboard API
function fallbackCopyTextToClipboard(text, btn) {
    const textArea = document.createElement("textarea");
    textArea.value = text;

    // Avoid scrolling to bottom
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        const successful = document.execCommand('copy');
        if (successful) {
            console.log('✅ Fallback: Successfully copied to clipboard:', text);
            const originalText = btn.textContent;
            btn.textContent = '✅';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 1200);
        } else {
            console.error('❌ Fallback copy failed');
            btn.textContent = '❌';
            setTimeout(() => {
                btn.textContent = '📋';
            }, 1200);
        }
    } catch (err) {
        console.error('❌ Fallback copy error:', err);
        btn.textContent = '❌';
        setTimeout(() => {
            btn.textContent = '📋';
        }, 1200);
    }

    document.body.removeChild(textArea);
}

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
    // Copy functionality - using event delegation to handle dynamically created buttons
    document.addEventListener('click', (e) => {
        // Check if clicked element is a copy button or inside one
        const copyBtn = e.target.closest('.copy-btn');
        if (copyBtn) {
            console.log('=== COPY BUTTON CLICKED ===');
            console.log('Button element:', copyBtn);
            console.log('data-url:', copyBtn.dataset.url);
            console.log('Has data-url:', copyBtn.hasAttribute('data-url'));

            if (copyBtn.dataset.url) {
                e.preventDefault();
                e.stopPropagation();

                const url = window.location.origin + copyBtn.dataset.url;
                console.log('Attempting to copy:', url);

                // Try modern clipboard API first
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(url).then(() => {
                        console.log('✅ Successfully copied to clipboard:', url);
                        const originalText = copyBtn.textContent;
                        copyBtn.textContent = '✅';
                        setTimeout(() => {
                            copyBtn.textContent = originalText;
                        }, 1200);
                    }).catch(err => {
                        console.error('❌ Clipboard API failed:', err);
                        // Fallback to legacy method
                        fallbackCopyTextToClipboard(url, copyBtn);
                    });
                } else {
                    // Browser doesn't support clipboard API, use fallback
                    console.log('Using fallback copy method');
                    fallbackCopyTextToClipboard(url, copyBtn);
                }
            } else {
                console.warn('⚠️ Copy button has no data-url attribute');
            }
        }
    });

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

// Track previous states for change detection and animations
let previousEndpointStates = new Map();

async function initSequenceEndpoints() {
    // Verify userId is available
    if (!window.userId) {
        console.error('userId is not defined');
        return;
    }

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

    // Event listener for refresh button
    const refreshBtn = document.getElementById('refreshSequenceEndpoints');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.disabled = true;
            refreshBtn.textContent = '🔄 Refreshing...';
            await loadSequenceEndpoints();
            refreshBtn.disabled = false;
            refreshBtn.textContent = '🔄 Refresh';
        });
    }
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
            showModal('Cannot Remove Step', 'You must have at least one step in the sequence.');
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
        showModal('Missing Steps', 'Please add at least one step to the sequence.');
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
                showModal('Invalid JSON', 'Invalid JSON payload in one of the steps. Please check your JSON syntax.');
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
            showModal('Success', 'Sequence endpoint created successfully!');
            document.getElementById('sequenceEndpointForm').reset();

            // Clear and re-add default step
            document.getElementById('sequenceStepsList').innerHTML = '';
            sequenceStepCounter = 0;
            addSequenceStep();

            await loadSequenceEndpoints();
        } else {
            showModal('Error', `Error: ${data.error}`);
        }
    } catch (error) {
        showModal('Error', `Error creating sequence endpoint: ${error.message}`);
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

    // Detect changes for animation
    const changedEndpoints = new Set();
    endpoints.forEach(endpoint => {
        const prevState = previousEndpointStates.get(endpoint.id);
        if (prevState && prevState.current_index !== endpoint.current_index) {
            changedEndpoints.add(endpoint.id);
        }
        previousEndpointStates.set(endpoint.id, {
            current_index: endpoint.current_index,
            is_active: endpoint.is_active
        });
    });

    tbody.innerHTML = endpoints.map(endpoint => {
        const hasChanged = changedEndpoints.has(endpoint.id);
        const sequence = typeof endpoint.sequence_config === 'string'
            ? JSON.parse(endpoint.sequence_config)
            : endpoint.sequence_config;

        // Remove animation class after animation completes
        if (hasChanged) {
            setTimeout(() => {
                const row = document.querySelector(`tr[data-endpoint-id="${endpoint.id}"]`);
                if (row) row.classList.remove('step-changed');
            }, 1000);
        }

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

        const description = endpoint.description ? `<div class="endpoint-desc">${endpoint.description}</div>` : '';

        return `
            <tr class="seq-row ${endpoint.is_active ? 'active' : 'inactive'} ${hasChanged ? 'step-changed' : ''}" data-endpoint-id="${endpoint.id}" data-current-index="${endpoint.current_index}">
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
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${((endpoint.current_index + 1) / sequence.length * 100).toFixed(1)}%"></div>
                        </div>
                    </div>
                </td>
                <td class="col-actions">
                    <div class="action-btns">
                        <button class="action-btn copy-btn" data-url="/sequence-endpoint/${window.userId}/${endpoint.endpoint_name}" title="Copy URL">📋</button>
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
    showConfirmModal('Reset Sequence', 'Reset this sequence to the beginning?', async () => {
        try {
            const response = await fetch(`/api/sequence-endpoints/${endpointId}/reset`, {
                method: 'POST'
            });

            const data = await response.json();

            if (data.success) {
                await loadSequenceEndpoints();

                // Show appropriate message based on response
                if (data.message) {
                    const title = data.message.includes('already') ? 'Info' : 'Success';
                    showModal(title, data.message);
                }
            } else {
                showModal('Error', data.error);
            }
        } catch (error) {
            showModal('Error', `Error resetting sequence endpoint: ${error.message}`);
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
            showModal('Error', data.error);
        }
    } catch (error) {
        showModal('Error', `Error toggling sequence endpoint: ${error.message}`);
    }
}

// Delete sequence endpoint
async function deleteSequenceEndpoint(endpointId) {
    showConfirmModal('Delete Endpoint', 'Are you sure you want to delete this sequence endpoint? This action cannot be undone.', async () => {
        try {
            const response = await fetch(`/api/sequence-endpoints/${endpointId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                await loadSequenceEndpoints();
            } else {
                showModal('Error', data.error);
            }
        } catch (error) {
            showModal('Error', `Error deleting sequence endpoint: ${error.message}`);
        }
    });
}

