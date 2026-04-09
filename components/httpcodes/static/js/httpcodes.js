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
                <label>Response Type</label>
                <select class="step-response-type" onchange="toggleSequenceStepResponseFields(${stepNumber})">
                    <option value="json">JSON Response</option>
                    <option value="image">Stored Image</option>
                </select>
            </div>
            <div class="form-group form-group-full step-json-field">
                <label>Custom JSON Payload (Optional - Only for HTTP 200)</label>
                <textarea class="step-payload" rows="3" placeholder='{"key": "value"}'></textarea>
            </div>
            <div class="form-group form-group-full step-image-field" style="display: none;">
                <label>Select Stored Image</label>
                <select class="step-image-id">
                    <option value="">Loading images...</option>
                </select>
            </div>
        </div>
    `;

    stepsList.appendChild(stepDiv);

    // Populate the image dropdown for this step
    populateImageDropdown(stepNumber);
}

// Toggle between JSON and image fields for sequence steps
function toggleSequenceStepResponseFields(stepNumber) {
    const step = document.querySelector(`.sequence-step[data-step-id="${stepNumber}"]`);
    if (!step) return;

    const responseType = step.querySelector('.step-response-type').value;
    const jsonField = step.querySelector('.step-json-field');
    const imageField = step.querySelector('.step-image-field');

    if (responseType === 'image') {
        jsonField.style.display = 'none';
        imageField.style.display = 'block';
    } else {
        jsonField.style.display = 'block';
        imageField.style.display = 'none';
    }
}

// Populate image dropdown for a specific step
async function populateImageDropdown(stepNumber) {
    const step = document.querySelector(`.sequence-step[data-step-id="${stepNumber}"]`);
    if (!step) return;

    const select = step.querySelector('.step-image-id');

    try {
        const response = await fetch('/api/http-images');
        const data = await response.json();

        if (data.success && data.images.length > 0) {
            select.innerHTML = '<option value="">-- No Image (JSON Response) --</option>';
            data.images.forEach(img => {
                const option = document.createElement('option');
                option.value = img.id;
                option.textContent = `${img.name} (${img.width}×${img.height})`;
                select.appendChild(option);
            });
        } else {
            select.innerHTML = '<option value="">No images available - Upload one first</option>';
        }
    } catch (error) {
        select.innerHTML = '<option value="">Error loading images</option>';
        console.error('Error loading images for dropdown:', error);
    }
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
        const responseType = stepElement.querySelector('.step-response-type').value;
        const payloadText = stepElement.querySelector('.step-payload').value.trim();
        const imageIdSelect = stepElement.querySelector('.step-image-id');
        const imageId = imageIdSelect ? parseInt(imageIdSelect.value) : null;

        let payload = null;
        if (responseType === 'json' && payloadText) {
            try {
                payload = JSON.parse(payloadText);
            } catch (e) {
                showModal('Invalid JSON', 'Invalid JSON payload in one of the steps. Please check your JSON syntax.');
                return;
            }
        }

        const step = {
            http_code: httpCode,
            delay_ms: delayMs
        };

        // Only add payload if it's not null/undefined
        if (payload) {
            step.payload = payload;
        }

        // Only add image_id if it's selected and valid
        if (responseType === 'image' && imageId && !isNaN(imageId)) {
            step.image_id = imageId;
        }

        steps.push(step);
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
            const hasImage = step.image_id ? '🖼️ ' : '';
            const stepText = delay ? `${hasImage}${code}<span class="delay-text">${delay}</span>` : `${hasImage}${code}`;
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


// ==================== IMAGE RESPONSE HANDLING ====================

// Handle image upload form submission (one-time use)
document.addEventListener('DOMContentLoaded', function() {
    const imageUploadForm = document.getElementById('imageUploadForm');
    if (imageUploadForm) {
        imageUploadForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const fileInput = document.getElementById('imageFile');
            const statusCode = document.getElementById('imageStatusCode').value;
            const resultDiv = document.getElementById('imageTestResult');
            const resultImg = document.getElementById('imageResultPreview');
            const resultStatus = document.getElementById('imageResultStatus');

            if (!fileInput.files || fileInput.files.length === 0) {
                showModal('Error', 'Please select an image file to upload.');
                return;
            }

            const formData = new FormData();
            formData.append('image', fileInput.files[0]);

            try {
                resultDiv.style.display = 'block';
                resultStatus.textContent = 'Uploading...';
                resultStatus.style.color = 'var(--text-color)';
                resultImg.src = '';

                const response = await fetch(`/httpcode/${statusCode}`, {
                    method: 'POST',
                    body: formData
                });

                // Get the image blob from response
                const blob = await response.blob();
                const imageUrl = URL.createObjectURL(blob);

                resultImg.src = imageUrl;
                resultStatus.textContent = `✅ Response received with status code: ${response.status}`;
                resultStatus.style.color = 'var(--success-color)';

                console.log('Image upload successful:', {
                    status: response.status,
                    contentType: response.headers.get('Content-Type'),
                    size: blob.size
                });

            } catch (error) {
                resultStatus.textContent = `❌ Error: ${error.message}`;
                resultStatus.style.color = 'var(--danger-color)';
                console.error('Image upload error:', error);
            }
        });
    }
});


// ==================== IMAGE LIBRARY MANAGEMENT ====================

// Save image to library
document.addEventListener('DOMContentLoaded', function() {
    const imageSaveForm = document.getElementById('imageSaveForm');
    if (imageSaveForm) {
        imageSaveForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const fileInput = document.getElementById('saveImageFile');
            const nameInput = document.getElementById('saveImageName');
            const resultDiv = document.getElementById('imageSaveResult');

            if (!fileInput.files || fileInput.files.length === 0) {
                showModal('Error', 'Please select an image file to save.');
                return;
            }

            const formData = new FormData();
            formData.append('image', fileInput.files[0]);
            if (nameInput.value.trim()) {
                formData.append('name', nameInput.value.trim());
            }

            try {
                resultDiv.style.display = 'block';
                resultDiv.textContent = 'Saving image...';
                resultDiv.style.color = 'var(--text-color)';

                const response = await fetch('/api/http-images', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                if (data.success) {
                    resultDiv.textContent = `✅ Image saved successfully: ${data.image.name}`;
                    resultDiv.style.color = 'var(--success-color)';

                    // Clear form
                    fileInput.value = '';
                    nameInput.value = '';

                    // Refresh image library
                    await loadImageLibrary();

                    setTimeout(() => {
                        resultDiv.style.display = 'none';
                    }, 3000);
                } else {
                    resultDiv.textContent = `❌ Error: ${data.error}`;
                    resultDiv.style.color = 'var(--danger-color)';
                }

            } catch (error) {
                resultDiv.textContent = `❌ Error: ${error.message}`;
                resultDiv.style.color = 'var(--danger-color)';
                console.error('Image save error:', error);
            }
        });
    }

    // Refresh button
    const refreshBtn = document.getElementById('refreshImageLibrary');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadImageLibrary);
    }

    // Load image library on page load
    loadImageLibrary();
});

// Load and display image library
async function loadImageLibrary() {
    const container = document.getElementById('imageLibraryContainer');
    if (!container) return;

    container.innerHTML = '<div class="loading-message">Loading images...</div>';

    try {
        const response = await fetch('/api/http-images');
        const data = await response.json();

        if (data.success) {
            if (data.images.length === 0) {
                container.innerHTML = `
                    <div class="empty-library-message">
                        <h3>No Images Yet</h3>
                        <p>Upload an image above to get started with your image library.</p>
                    </div>
                `;
            } else {
                displayImageLibrary(data.images);
            }
        } else {
            container.innerHTML = `<div class="loading-message" style="color: var(--danger-color);">Error: ${data.error}</div>`;
        }
    } catch (error) {
        container.innerHTML = `<div class="loading-message" style="color: var(--danger-color);">Error loading images: ${error.message}</div>`;
        console.error('Error loading image library:', error);
    }
}

// Display image library grid
function displayImageLibrary(images) {
    const container = document.getElementById('imageLibraryContainer');

    const grid = document.createElement('div');
    grid.className = 'image-library-grid';

    images.forEach(img => {
        const card = document.createElement('div');
        card.className = 'image-card';

        const fileSize = formatFileSize(img.file_size);
        const createdDate = new Date(img.created_at).toLocaleDateString();

        card.innerHTML = `
            <img src="/api/http-images/${img.id}"
                 alt="${img.name}"
                 class="image-preview"
                 onclick="showImageModal(${img.id}, '${escapeHtml(img.name)}')">
            <div class="image-info">
                <div class="image-name" title="${escapeHtml(img.name)}">${escapeHtml(img.name)}</div>
                <div class="image-meta">${img.width} × ${img.height} | ${fileSize}</div>
                <div class="image-meta">Added: ${createdDate}</div>

                <div class="image-status-form" id="useForm-${img.id}">
                    <input type="number"
                           class="image-status-input"
                           id="statusCode-${img.id}"
                           min="100"
                           max="599"
                           value="200"
                           placeholder="Status">
                    <button class="image-action-btn btn-use" onclick="useStoredImage(${img.id})">
                        🚀 Use
                    </button>
                </div>

                <div class="image-actions">
                    <button class="image-action-btn btn-copy-url" onclick="copyImageUrl(${img.id})">
                        📋 Copy URL
                    </button>
                    <button class="image-action-btn btn-delete" onclick="deleteStoredImage(${img.id})">
                        🗑️ Delete
                    </button>
                </div>
            </div>
        `;

        grid.appendChild(card);
    });

    container.innerHTML = '';
    container.appendChild(grid);
}

// Use a stored image with a status code
async function useStoredImage(imageId) {
    const statusInput = document.getElementById(`statusCode-${imageId}`);
    const statusCode = statusInput.value;

    if (statusCode < 100 || statusCode > 599) {
        showModal('Invalid Status Code', 'Please enter a status code between 100 and 599.');
        return;
    }

    const url = `/httpcode/${statusCode}/image/${imageId}`;

    // Open in new tab
    window.open(url, '_blank');
}

// Copy image URL to clipboard
async function copyImageUrl(imageId) {
    const statusInput = document.getElementById(`statusCode-${imageId}`);
    const statusCode = statusInput.value || '200';
    const url = `${window.location.origin}/httpcode/${statusCode}/image/${imageId}`;

    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(url);
            showModal('Copied!', `URL copied to clipboard:\n${url}`);
        } else {
            // Fallback
            const textArea = document.createElement('textarea');
            textArea.value = url;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showModal('Copied!', `URL copied to clipboard:\n${url}`);
        }
    } catch (error) {
        showModal('Error', `Failed to copy URL: ${error.message}`);
    }
}

// Delete a stored image
async function deleteStoredImage(imageId) {
    showConfirmModal('Delete Image', 'Are you sure you want to delete this image? This action cannot be undone.', async () => {
        try {
            const response = await fetch(`/api/http-images/${imageId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                await loadImageLibrary();
                showModal('Success', 'Image deleted successfully.');
            } else {
                showModal('Error', data.error);
            }
        } catch (error) {
            showModal('Error', `Failed to delete image: ${error.message}`);
        }
    });
}

// Show image in modal (for preview)
function showImageModal(imageId, imageName) {
    const url = `/api/http-images/${imageId}`;
    const modalContent = `
        <img src="${url}" alt="${imageName}" style="max-width: 100%; max-height: 70vh; border-radius: 8px;">
    `;
    showModal(imageName, modalContent, true);
}

// Helper function to format file size
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

