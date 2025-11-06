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

    // Load special endpoints and rotating endpoints on page load
    loadSpecialEndpoints();
    loadRotatingEndpoints();
});


// ========================
// Special Endpoints Management
// ========================

// Load all special endpoints for the current user
async function loadSpecialEndpoints() {
    const endpointsList = document.getElementById('endpointsList');

    try {
        const response = await fetch('/api/special-endpoints');
        const data = await response.json();

        if (data.success && data.endpoints.length > 0) {
            endpointsList.innerHTML = data.endpoints.map(endpoint => createEndpointRow(endpoint)).join('');
        } else if (data.success && data.endpoints.length === 0) {
            endpointsList.innerHTML = '<tr><td colspan="7" class="empty-message">No special endpoints yet. Create one above!</td></tr>';
        } else {
            endpointsList.innerHTML = `<tr><td colspan="7" class="error-message">Error: ${data.error || 'Failed to load endpoints'}</td></tr>`;
        }
    } catch (error) {
        endpointsList.innerHTML = `<tr><td colspan="7" class="error-message">Error loading endpoints: ${error.message}</td></tr>`;
    }
}

// Create HTML table row for an endpoint
function createEndpointRow(endpoint) {
    const isActive = endpoint.is_active === 1;
    const statusClass = isActive ? 'active' : 'inactive';
    const fullUrl = `${window.location.origin}/special-endpoint/${window.userId || 'USER_ID'}/${endpoint.endpoint_name}`;

    return `
        <tr class="endpoint-row ${statusClass}" data-id="${endpoint.id}">
            <td>
                <span class="status-badge badge-${statusClass}">${isActive ? 'Active' : 'Inactive'}</span>
            </td>
            <td><strong>${endpoint.endpoint_name}</strong></td>
            <td><code class="inline-code">${endpoint.http_code}</code></td>
            <td><code class="inline-code">${endpoint.delay_ms}</code></td>
            <td>${endpoint.description || '-'}</td>
            <td><code class="inline-code url-cell">${fullUrl}</code></td>
            <td class="actions-cell">
                <button class="icon-btn" onclick="copyEndpointUrl('${fullUrl}')" title="Copy URL">📋</button>
                <button class="icon-btn" onclick="toggleEndpointStatus(${endpoint.id}, ${endpoint.is_active})" title="Toggle Active/Inactive">
                    ${isActive ? '⏸️' : '▶️'}
                </button>
                <button class="icon-btn edit-btn" onclick="editEndpoint(${endpoint.id})" title="Edit">✏️</button>
                <button class="icon-btn delete-btn" onclick="deleteEndpoint(${endpoint.id}, '${endpoint.endpoint_name}')" title="Delete">🗑️</button>
            </td>
        </tr>
    `;
}

// Create a new special endpoint
async function createSpecialEndpoint() {
    const endpointName = document.getElementById('endpointName').value.trim();
    const httpCode = parseInt(document.getElementById('httpCode').value);
    const delayMs = parseInt(document.getElementById('delayMs').value);
    const description = document.getElementById('description').value.trim();
    const responsePayload = document.getElementById('responsePayload').value.trim();
    const messageDiv = document.getElementById('createMessage');

    // Validate endpoint name
    if (!endpointName) {
        showMessage(messageDiv, 'Endpoint name is required', 'error');
        return;
    }

    if (!/^[a-z0-9-]+$/.test(endpointName)) {
        showMessage(messageDiv, 'Endpoint name can only contain lowercase letters, numbers, and hyphens', 'error');
        return;
    }

    // Validate HTTP code
    if (httpCode < 100 || httpCode > 599) {
        showMessage(messageDiv, 'HTTP code must be between 100 and 599', 'error');
        return;
    }

    // Validate delay
    if (delayMs < 0) {
        showMessage(messageDiv, 'Delay must be a positive number', 'error');
        return;
    }

    // Validate JSON payload if provided
    let parsedPayload = null;
    if (responsePayload) {
        try {
            parsedPayload = JSON.parse(responsePayload);
        } catch (e) {
            showMessage(messageDiv, 'Invalid JSON payload format', 'error');
            return;
        }
    }

    try {
        const response = await fetch('/api/special-endpoints', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                endpoint_name: endpointName,
                http_code: httpCode,
                delay_ms: delayMs,
                description: description,
                response_payload: parsedPayload,
                is_active: 1
            })
        });

        const data = await response.json();

        if (data.success) {
            showMessage(messageDiv, 'Endpoint created successfully!', 'success');
            // Clear form
            document.getElementById('endpointName').value = '';
            document.getElementById('httpCode').value = '200';
            document.getElementById('delayMs').value = '1000';
            document.getElementById('description').value = '';
            document.getElementById('responsePayload').value = '';
            // Reload list
            loadSpecialEndpoints();
        } else {
            showMessage(messageDiv, `Error: ${data.error}`, 'error');
        }
    } catch (error) {
        showMessage(messageDiv, `Error: ${error.message}`, 'error');
    }
}

// Toggle endpoint active/inactive status
async function toggleEndpointStatus(endpointId, currentStatus) {
    const newStatus = currentStatus === 1 ? 0 : 1;

    try {
        const response = await fetch(`/api/special-endpoints/${endpointId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                is_active: newStatus
            })
        });

        const data = await response.json();

        if (data.success) {
            loadSpecialEndpoints();
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

// Edit an endpoint (simplified version - shows prompt)
async function editEndpoint(endpointId) {
    const row = document.querySelector(`tr[data-id="${endpointId}"]`);
    if (!row) return;

    // Get current values from the table row
    const currentHttpCode = row.cells[2].textContent;
    const currentDelay = row.cells[3].textContent;
    const currentDescription = row.cells[4].textContent;

    const newHttpCode = prompt('Enter new HTTP code:', currentHttpCode);
    if (!newHttpCode) return;

    const newDelay = prompt('Enter new delay (ms):', currentDelay);
    if (!newDelay) return;

    const newDescription = prompt('Enter new description (optional):', currentDescription === '-' ? '' : currentDescription);

    try {
        const response = await fetch(`/api/special-endpoints/${endpointId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                http_code: parseInt(newHttpCode),
                delay_ms: parseInt(newDelay),
                description: newDescription
            })
        });

        const data = await response.json();

        if (data.success) {
            loadSpecialEndpoints();
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

// Delete an endpoint
async function deleteEndpoint(endpointId, endpointName) {
    if (!confirm(`Are you sure you want to delete "${endpointName}"?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/special-endpoints/${endpointId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            loadSpecialEndpoints();
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

// Copy endpoint URL to clipboard
function copyEndpointUrl(url) {
    navigator.clipboard.writeText(url).then(() => {
        // Show a temporary success message
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = '✅';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 1200);
    });
}

// Show message helper
function showMessage(element, message, type) {
    element.textContent = message;
    element.className = `message message-${type}`;
    element.style.display = 'block';

    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
}


// ========================
// Rotating Endpoints Management
// ========================

// Load all rotating endpoints for the current user
async function loadRotatingEndpoints() {
    const endpointsList = document.getElementById('rotatingEndpointsList');

    try {
        const response = await fetch('/api/rotating-endpoints');
        const data = await response.json();

        if (data.success && data.endpoints.length > 0) {
            endpointsList.innerHTML = data.endpoints.map(endpoint => createRotatingEndpointRow(endpoint)).join('');
        } else if (data.success && data.endpoints.length === 0) {
            endpointsList.innerHTML = '<tr><td colspan="7" class="empty-message">No rotating endpoints yet. Create one above!</td></tr>';
        } else {
            endpointsList.innerHTML = `<tr><td colspan="7" class="error-message">Error: ${data.error || 'Failed to load endpoints'}</td></tr>`;
        }
    } catch (error) {
        endpointsList.innerHTML = `<tr><td colspan="7" class="error-message">Error loading rotating endpoints: ${error.message}</td></tr>`;
    }
}

// Create HTML table row for a rotating endpoint
function createRotatingEndpointRow(endpoint) {
    const isActive = endpoint.is_active === 1;
    const statusClass = isActive ? 'active' : 'inactive';
    const fullUrl = `${window.location.origin}/rotating-endpoint/${window.userId || 'USER_ID'}/${endpoint.endpoint_name}`;

    // Parse http_codes if it's a string
    const httpCodes = typeof endpoint.http_codes === 'string' ? JSON.parse(endpoint.http_codes) : endpoint.http_codes;
    const codesDisplay = httpCodes.join(' → ');
    const currentIndex = endpoint.current_index || 0;
    const nextCode = httpCodes[currentIndex];

    return `
        <tr class="endpoint-row ${statusClass}" data-id="${endpoint.id}">
            <td>
                <span class="status-badge badge-${statusClass}">${isActive ? 'Active' : 'Inactive'}</span>
            </td>
            <td><strong>${endpoint.endpoint_name}</strong></td>
            <td><code class="codes-sequence-inline">${codesDisplay}</code></td>
            <td>
                <code class="inline-code highlight-code">${nextCode}</code>
                <span class="hint-text">(${currentIndex + 1}/${httpCodes.length})</span>
            </td>
            <td>${endpoint.description || '-'}</td>
            <td><code class="inline-code url-cell">${fullUrl}</code></td>
            <td class="actions-cell">
                <button class="icon-btn" onclick="copyRotatingEndpointUrl('${fullUrl}')" title="Copy URL">📋</button>
                <button class="icon-btn" onclick="resetRotatingEndpoint(${endpoint.id})" title="Reset Counter">🔄</button>
                <button class="icon-btn" onclick="toggleRotatingEndpointStatus(${endpoint.id}, ${endpoint.is_active})" title="Toggle Active/Inactive">
                    ${isActive ? '⏸️' : '▶️'}
                </button>
                <button class="icon-btn edit-btn" onclick="editRotatingEndpoint(${endpoint.id})" title="Edit">✏️</button>
                <button class="icon-btn delete-btn" onclick="deleteRotatingEndpoint(${endpoint.id}, '${endpoint.endpoint_name}')" title="Delete">🗑️</button>
            </td>
        </tr>
    `;
}

// Create a new rotating endpoint
async function createRotatingEndpoint() {
    const endpointName = document.getElementById('rotatingEndpointName').value.trim();
    const httpCodesInput = document.getElementById('httpCodesInput').value.trim();
    const description = document.getElementById('rotatingDescription').value.trim();
    const responsePayload = document.getElementById('rotatingResponsePayload').value.trim();
    const messageDiv = document.getElementById('rotatingCreateMessage');

    // Validate endpoint name
    if (!endpointName) {
        showMessage(messageDiv, 'Endpoint name is required', 'error');
        return;
    }

    if (!/^[a-z0-9-]+$/.test(endpointName)) {
        showMessage(messageDiv, 'Endpoint name can only contain lowercase letters, numbers, and hyphens', 'error');
        return;
    }

    // Validate and parse HTTP codes
    if (!httpCodesInput) {
        showMessage(messageDiv, 'HTTP codes are required', 'error');
        return;
    }

    const httpCodes = httpCodesInput.split(',').map(code => code.trim()).filter(code => code);

    if (httpCodes.length === 0) {
        showMessage(messageDiv, 'At least one HTTP code is required', 'error');
        return;
    }

    // Validate each code
    for (const code of httpCodes) {
        const codeNum = parseInt(code);
        if (isNaN(codeNum) || codeNum < 100 || codeNum > 599) {
            showMessage(messageDiv, `Invalid HTTP code: ${code}. Must be between 100 and 599`, 'error');
            return;
        }
    }

    // Validate JSON payload if provided
    let parsedPayload = null;
    if (responsePayload) {
        try {
            parsedPayload = JSON.parse(responsePayload);
        } catch (e) {
            showMessage(messageDiv, 'Invalid JSON payload format', 'error');
            return;
        }
    }

    try {
        const response = await fetch('/api/rotating-endpoints', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                endpoint_name: endpointName,
                http_codes: httpCodes.map(code => parseInt(code)),
                description: description,
                response_payload: parsedPayload,
                is_active: 1
            })
        });

        const data = await response.json();

        if (data.success) {
            showMessage(messageDiv, 'Rotating endpoint created successfully!', 'success');
            // Clear form
            document.getElementById('rotatingEndpointName').value = '';
            document.getElementById('httpCodesInput').value = '';
            document.getElementById('rotatingDescription').value = '';
            document.getElementById('rotatingResponsePayload').value = '';
            // Reload list
            loadRotatingEndpoints();
        } else {
            showMessage(messageDiv, `Error: ${data.error}`, 'error');
        }
    } catch (error) {
        showMessage(messageDiv, `Error: ${error.message}`, 'error');
    }
}

// Toggle rotating endpoint active/inactive status
async function toggleRotatingEndpointStatus(endpointId, currentStatus) {
    const newStatus = currentStatus === 1 ? 0 : 1;

    try {
        const response = await fetch(`/api/rotating-endpoints/${endpointId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                is_active: newStatus
            })
        });

        const data = await response.json();

        if (data.success) {
            loadRotatingEndpoints();
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

// Reset rotating endpoint counter
async function resetRotatingEndpoint(endpointId) {
    try {
        const response = await fetch(`/api/rotating-endpoints/${endpointId}/reset`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            loadRotatingEndpoints();
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

// Edit a rotating endpoint
async function editRotatingEndpoint(endpointId) {
    const row = document.querySelector(`tr[data-id="${endpointId}"]`);
    if (!row) return;

    // Get current values from the table row
    const currentCodes = row.cells[2].textContent.replace(/\s*→\s*/g, ',');
    const currentDescription = row.cells[4].textContent;

    const newCodes = prompt('Enter new HTTP codes (comma-separated):', currentCodes);
    if (newCodes === null) return;

    const newDescription = prompt('Enter new description (optional):', currentDescription === '-' ? '' : currentDescription);

    // Validate codes
    const httpCodes = newCodes.split(',').map(code => code.trim()).filter(code => code);
    for (const code of httpCodes) {
        const codeNum = parseInt(code);
        if (isNaN(codeNum) || codeNum < 100 || codeNum > 599) {
            alert(`Invalid HTTP code: ${code}`);
            return;
        }
    }

    try {
        const response = await fetch(`/api/rotating-endpoints/${endpointId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                http_codes: httpCodes.map(code => parseInt(code)),
                description: newDescription
            })
        });

        const data = await response.json();

        if (data.success) {
            loadRotatingEndpoints();
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

// Delete a rotating endpoint
async function deleteRotatingEndpoint(endpointId, endpointName) {
    if (!confirm(`Are you sure you want to delete "${endpointName}"?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/rotating-endpoints/${endpointId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            loadRotatingEndpoints();
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

// Copy rotating endpoint URL to clipboard
function copyRotatingEndpointUrl(url) {
    navigator.clipboard.writeText(url).then(() => {
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = '✅';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 1200);
    });
}