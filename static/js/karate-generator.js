// Karate Feature File Generator JavaScript - Multiple Scenarios Support

let generatedFeature = '';
let scenarioCounter = 0;
let scenarios = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Add first scenario by default
    addScenario();

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            generateKarateFeature();
        }
    });
});

// Add new scenario
function addScenario(data = null) {
    const id = scenarioCounter++;
    const scenarioData = data || {
        id: id,
        name: '',
        method: 'GET',
        endpoint: '',
        status: 200,
        request: '',
        response: ''
    };

    scenarios.push(scenarioData);

    const scenarioCard = createScenarioCard(scenarioData);
    document.getElementById('scenariosList').appendChild(scenarioCard);

    // Show/hide empty state
    updateEmptyState();
}

// Create scenario card HTML
function createScenarioCard(data) {
    const card = document.createElement('div');
    card.className = 'scenario-card';
    card.dataset.scenarioId = data.id;

    card.innerHTML = `
        <div class="scenario-card-header">
            <span class="scenario-number">Scenario #${data.id + 1}</span>
            <div class="scenario-actions">
                <button class="btn-duplicate" onclick="duplicateScenario(${data.id})" title="Duplicate">
                    📋 Duplicate
                </button>
                <button class="btn-remove" onclick="removeScenario(${data.id})" title="Remove">
                    🗑 Remove
                </button>
            </div>
        </div>

        <div class="scenario-config">
            <div class="form-group">
                <label>Scenario Name</label>
                <input type="text"
                       class="scenario-name"
                       data-scenario-id="${data.id}"
                       placeholder="e.g., Get user details"
                       value="${data.name}">
            </div>

            <div class="form-group">
                <label>HTTP Method</label>
                <select class="scenario-method" data-scenario-id="${data.id}">
                    <option value="GET" ${data.method === 'GET' ? 'selected' : ''}>GET</option>
                    <option value="POST" ${data.method === 'POST' ? 'selected' : ''}>POST</option>
                    <option value="PUT" ${data.method === 'PUT' ? 'selected' : ''}>PUT</option>
                    <option value="DELETE" ${data.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
                    <option value="PATCH" ${data.method === 'PATCH' ? 'selected' : ''}>PATCH</option>
                </select>
            </div>

            <div class="form-group">
                <label>Endpoint Path</label>
                <input type="text"
                       class="scenario-endpoint"
                       data-scenario-id="${data.id}"
                       placeholder="e.g., /api/users/123"
                       value="${data.endpoint}">
            </div>

            <div class="form-group">
                <label>Expected Status</label>
                <input type="number"
                       class="scenario-status"
                       data-scenario-id="${data.id}"
                       min="100"
                       max="599"
                       value="${data.status}">
            </div>
        </div>

        <div class="scenario-payloads">
            <div class="scenario-payload-group">
                <label>
                    Request Payload (Optional)
                    <button class="btn-icon" onclick="formatScenarioJSON(${data.id}, 'request')" title="Format">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="16 18 22 12 16 6"></polyline>
                            <polyline points="8 6 2 12 8 18"></polyline>
                        </svg>
                    </button>
                </label>
                <textarea class="scenario-request"
                          data-scenario-id="${data.id}"
                          placeholder='{"key": "value"}'>${data.request}</textarea>
            </div>

            <div class="scenario-payload-group">
                <label>
                    Response Payload
                    <button class="btn-icon" onclick="formatScenarioJSON(${data.id}, 'response')" title="Format">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="16 18 22 12 16 6"></polyline>
                            <polyline points="8 6 2 12 8 18"></polyline>
                        </svg>
                    </button>
                </label>
                <textarea class="scenario-response"
                          data-scenario-id="${data.id}"
                          placeholder='{"id": 123, "status": "success"}'>${data.response}</textarea>
            </div>
        </div>
    `;

    return card;
}

// Duplicate scenario
function duplicateScenario(id) {
    const scenario = scenarios.find(s => s.id === id);
    if (!scenario) return;

    const scenarioData = collectScenarioData(id);
    if (!scenarioData) return;

    // Create new scenario with same data but different name
    addScenario({
        ...scenarioData,
        name: scenarioData.name + ' (Copy)'
    });

    showModal('Success', 'Scenario duplicated successfully!');
}

// Remove scenario
function removeScenario(id) {
    if (scenarios.length === 1) {
        showModal('Cannot Remove', 'You must have at least one scenario.');
        return;
    }

    showConfirmModal('Remove Scenario', 'Are you sure you want to remove this scenario?', () => {
        // Remove from array
        scenarios = scenarios.filter(s => s.id !== id);

        // Remove from DOM
        const card = document.querySelector(`.scenario-card[data-scenario-id="${id}"]`);
        if (card) {
            card.remove();
        }

        // Update scenario numbers
        updateScenarioNumbers();
        updateEmptyState();
    });
}

// Update scenario numbers after removal
function updateScenarioNumbers() {
    document.querySelectorAll('.scenario-card').forEach((card, index) => {
        const numberSpan = card.querySelector('.scenario-number');
        if (numberSpan) {
            numberSpan.textContent = `Scenario #${index + 1}`;
        }
    });
}

// Update empty state visibility
function updateEmptyState() {
    const list = document.getElementById('scenariosList');
    const existingEmpty = list.querySelector('.empty-state');

    if (scenarios.length === 0) {
        if (!existingEmpty) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.innerHTML = `
                <p>No scenarios added yet.</p>
                <button class="btn-add-scenario" onclick="addScenario()">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Add Your First Scenario
                </button>
            `;
            list.appendChild(emptyState);
        }
    } else if (existingEmpty) {
        existingEmpty.remove();
    }
}

// Collect scenario data from form
function collectScenarioData(id) {
    const name = document.querySelector(`.scenario-name[data-scenario-id="${id}"]`)?.value.trim();
    const method = document.querySelector(`.scenario-method[data-scenario-id="${id}"]`)?.value;
    const endpoint = document.querySelector(`.scenario-endpoint[data-scenario-id="${id}"]`)?.value.trim();
    const status = document.querySelector(`.scenario-status[data-scenario-id="${id}"]`)?.value;
    const request = document.querySelector(`.scenario-request[data-scenario-id="${id}"]`)?.value.trim();
    const response = document.querySelector(`.scenario-response[data-scenario-id="${id}"]`)?.value.trim();

    return {
        id,
        name,
        method,
        endpoint,
        status: parseInt(status),
        request,
        response
    };
}

// Format JSON in scenario
function formatScenarioJSON(id, type) {
    const textarea = document.querySelector(`.scenario-${type}[data-scenario-id="${id}"]`);
    if (!textarea) return;

    const input = textarea.value.trim();
    if (!input) {
        showModal('Info', `${type.charAt(0).toUpperCase() + type.slice(1)} payload is empty`);
        return;
    }

    try {
        const parsed = JSON.parse(input);
        textarea.value = JSON.stringify(parsed, null, 2);
    } catch (e) {
        showModal('JSON Error', 'Invalid JSON: ' + e.message);
    }
}

// Generate Karate Feature File
function generateKarateFeature() {
    // Get feature-level configuration
    const featureName = document.getElementById('featureName').value.trim();
    const baseUrl = document.getElementById('baseUrl').value.trim();
    const includeHeaders = document.getElementById('includeHeaders').checked;
    const includeAuth = document.getElementById('includeAuth').checked;
    const strictValidation = document.getElementById('strictValidation').checked;
    const includeComments = document.getElementById('includeComments').checked;

    // Validate feature name
    if (!featureName) {
        showModal('Validation Error', 'Feature name is required');
        return;
    }

    // Collect all scenarios
    const scenarioDataList = [];
    for (const scenario of scenarios) {
        const data = collectScenarioData(scenario.id);

        // Validate scenario
        if (!data.name) {
            showModal('Validation Error', `Scenario #${scenario.id + 1} name is required`);
            return;
        }

        if (!data.endpoint) {
            showModal('Validation Error', `Scenario #${scenario.id + 1} endpoint is required`);
            return;
        }

        if (!data.response) {
            showModal('Validation Error', `Scenario #${scenario.id + 1} response payload is required`);
            return;
        }

        // Validate JSON
        let requestJson = null;
        let responseJson = null;

        if (data.request) {
            try {
                requestJson = JSON.parse(data.request);
            } catch (e) {
                showModal('JSON Error', `Scenario #${scenario.id + 1} invalid request JSON: ${e.message}`);
                return;
            }
        }

        try {
            responseJson = JSON.parse(data.response);
        } catch (e) {
            showModal('JSON Error', `Scenario #${scenario.id + 1} invalid response JSON: ${e.message}`);
            return;
        }

        scenarioDataList.push({
            ...data,
            requestJson,
            responseJson
        });
    }

    // Generate the feature file
    generatedFeature = buildKarateFeature({
        featureName,
        baseUrl,
        includeHeaders,
        includeAuth,
        strictValidation,
        includeComments,
        scenarios: scenarioDataList
    });

    // Display the result
    document.getElementById('karateOutput').textContent = generatedFeature;
    document.getElementById('outputSection').style.display = 'block';

    // Scroll to output
    document.getElementById('outputSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Build Karate Feature File Content
function buildKarateFeature(config) {
    let feature = '';

    // Feature header
    feature += `Feature: ${config.featureName}\n\n`;

    if (config.includeComments) {
        feature += `  # This feature file was auto-generated by Karate Feature Generator\n`;
        feature += `  # Date: ${new Date().toISOString().split('T')[0]}\n`;
        feature += `  # Scenarios: ${config.scenarios.length}\n\n`;
    }

    // Background (optional)
    if (config.baseUrl || config.includeHeaders || config.includeAuth) {
        feature += `Background:\n`;

        if (config.baseUrl) {
            feature += `  * url '${config.baseUrl}'\n`;
        }

        if (config.includeHeaders) {
            feature += `  * configure headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' }\n`;
        }

        if (config.includeAuth) {
            if (config.includeComments) {
                feature += `  # Configure authentication - update with your auth method\n`;
            }
            feature += `  * header Authorization = 'Bearer YOUR_TOKEN_HERE'\n`;
        }

        feature += `\n`;
    }

    // Generate each scenario
    config.scenarios.forEach((scenario, index) => {
        if (index > 0) {
            feature += `\n`;
        }

        feature += `Scenario: ${scenario.name}\n`;

        if (config.includeComments) {
            feature += `  # Arrange: Set up the request\n`;
        }

        // Set path
        feature += `  * def endpoint = '${scenario.endpoint}'\n`;

        // Set request body if present
        if (scenario.requestJson) {
            feature += `  * def requestBody =\n`;
            feature += `    """\n`;
            feature += indentJSON(scenario.requestJson, 4);
            feature += `    """\n`;
        }

        if (config.includeComments) {
            feature += `\n  # Act: Make the API call\n`;
        }

        // Make the request
        if (scenario.requestJson && ['POST', 'PUT', 'PATCH'].includes(scenario.method)) {
            feature += `  Given path endpoint\n`;
            feature += `  And request requestBody\n`;
            feature += `  When method ${scenario.method}\n`;
        } else {
            feature += `  Given path endpoint\n`;
            feature += `  When method ${scenario.method}\n`;
        }

        if (config.includeComments) {
            feature += `\n  # Assert: Validate the response\n`;
        }

        // Validate status code
        feature += `  Then status ${scenario.status}\n`;

        // Validate response schema
        if (config.strictValidation) {
            feature += `  And match response ==\n`;
            feature += `    """\n`;
            feature += indentJSON(scenario.responseJson, 4);
            feature += `    """\n`;
        } else {
            feature += `  And match response contains\n`;
            feature += `    """\n`;
            feature += indentJSON(scenario.responseJson, 4);
            feature += `    """\n`;
        }

        // Add schema validation examples for first scenario only
        if (index === 0 && config.includeComments) {
            feature += `\n  # Additional validation examples (uncomment as needed):\n`;
            feature += `  # And match response.id == '#number'\n`;
            feature += `  # And match response.name == '#string'\n`;
            feature += `  # And match response.email == '#regex [a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}'\n`;
            feature += `  # And match each response.items == { id: '#number', name: '#string' }\n`;
        }
    });

    return feature;
}

// Indent JSON for pretty printing in feature file
function indentJSON(json, spaces) {
    const jsonString = JSON.stringify(json, null, 2);
    const lines = jsonString.split('\n');
    return lines.map(line => ' '.repeat(spaces) + line).join('\n') + '\n';
}

// Clear All
function clearAll() {
    showConfirmModal('Clear All', 'Are you sure you want to clear all scenarios and configuration?', () => {
        document.getElementById('featureName').value = 'API Test';
        document.getElementById('baseUrl').value = '';
        document.getElementById('includeHeaders').checked = true;
        document.getElementById('includeAuth').checked = false;
        document.getElementById('strictValidation').checked = true;
        document.getElementById('includeComments').checked = true;

        // Clear all scenarios
        scenarios = [];
        scenarioCounter = 0;
        document.getElementById('scenariosList').innerHTML = '';

        // Add one empty scenario
        addScenario();

        // Hide output
        document.getElementById('outputSection').style.display = 'none';
        generatedFeature = '';
    });
}

// Load Sample Data
function loadSampleData() {
    document.getElementById('featureName').value = 'User Management API';
    document.getElementById('baseUrl').value = 'https://api.example.com';

    // Clear existing scenarios
    scenarios = [];
    scenarioCounter = 0;
    document.getElementById('scenariosList').innerHTML = '';

    // Add sample scenario 1 - Create User
    addScenario({
        id: 0,
        name: 'Create a new user',
        method: 'POST',
        endpoint: '/api/users',
        status: 201,
        request: JSON.stringify({
            "name": "John Doe",
            "email": "john.doe@example.com",
            "age": 30,
            "role": "developer"
        }, null, 2),
        response: JSON.stringify({
            "id": 12345,
            "name": "John Doe",
            "email": "john.doe@example.com",
            "age": 30,
            "role": "developer",
            "status": "active",
            "createdAt": "2024-01-15T10:30:00Z"
        }, null, 2)
    });

    // Add sample scenario 2 - Get User
    addScenario({
        id: 1,
        name: 'Get user by ID',
        method: 'GET',
        endpoint: '/api/users/12345',
        status: 200,
        request: '',
        response: JSON.stringify({
            "id": 12345,
            "name": "John Doe",
            "email": "john.doe@example.com",
            "age": 30,
            "role": "developer",
            "status": "active",
            "createdAt": "2024-01-15T10:30:00Z",
            "updatedAt": "2024-01-15T10:30:00Z"
        }, null, 2)
    });

    // Add sample scenario 3 - Update User
    addScenario({
        id: 2,
        name: 'Update user details',
        method: 'PUT',
        endpoint: '/api/users/12345',
        status: 200,
        request: JSON.stringify({
            "age": 31,
            "role": "senior developer"
        }, null, 2),
        response: JSON.stringify({
            "id": 12345,
            "name": "John Doe",
            "email": "john.doe@example.com",
            "age": 31,
            "role": "senior developer",
            "status": "active",
            "updatedAt": "2024-01-16T14:20:00Z"
        }, null, 2)
    });

    showModal('Success', 'Sample data with 3 scenarios loaded! Click "Generate Feature File" to see the result.');
}

// Copy to Clipboard
function copyToClipboard() {
    if (!generatedFeature) {
        showModal('Error', 'No feature file generated yet');
        return;
    }

    navigator.clipboard.writeText(generatedFeature).then(() => {
        showModal('Success', 'Feature file copied to clipboard!');
    }).catch(err => {
        showModal('Error', 'Failed to copy to clipboard: ' + err.message);
    });
}

// Download Feature File
function downloadFeatureFile() {
    if (!generatedFeature) {
        showModal('Error', 'No feature file generated yet');
        return;
    }

    const featureName = document.getElementById('featureName').value.trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

    const filename = `${featureName || 'test'}.feature`;

    const blob = new Blob([generatedFeature], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    showModal('Success', `Feature file downloaded as ${filename}`);
}
