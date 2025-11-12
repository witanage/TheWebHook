// Karate Feature File Generator JavaScript - Multiple Scenarios with Variable Chaining

let generatedFeature = '';
let scenarioCounter = 0;
let scenarios = [];
let envVariables = []; // Array of {name: 'userId', description: 'User ID for testing'}
let envVarCounter = 0;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Try to load saved work from database
    loadWork();


    // Environment URL checkbox handler
    const useEnvUrlCheckbox = document.getElementById('useEnvUrl');
    const envUrlConfig = document.getElementById('envUrlConfig');
    const envUrlDomain = document.getElementById('envUrlDomain');
    const domainPreview = document.getElementById('domainPreview');

    useEnvUrlCheckbox.addEventListener('change', function() {
        envUrlConfig.style.display = this.checked ? 'block' : 'none';
    });

    envUrlDomain.addEventListener('input', function() {
        domainPreview.textContent = this.value || '.abc.com/api';
    });

    // Environment variables checkbox handler
    const useEnvVariablesCheckbox = document.getElementById('useEnvVariables');
    const envVariablesSection = document.getElementById('envVariablesSection');

    useEnvVariablesCheckbox.addEventListener('change', function() {
        envVariablesSection.style.display = this.checked ? 'block' : 'none';
    });

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
    const scenarioData = data ? {
        ...data,
        id: id  // Always override with new unique ID
    } : {
        id: id,
        name: '',
        method: 'GET',
        endpoint: '',
        status: 200,
        request: '',
        response: '',
        extractVars: [], // Array of {varName: 'userId', jsonPath: 'response.id'}
        assertions: [], // Array of custom assertion strings
        tags: '', // Comma-separated tags like @ac0149,@smoke
        sourceScenarioId: null, // null means not a duplicate
        duplicateNumber: null   // null means not a duplicate
    };

    // Ensure duplicate tracking fields exist
    if (scenarioData.sourceScenarioId === undefined) {
        scenarioData.sourceScenarioId = null;
    }
    if (scenarioData.duplicateNumber === undefined) {
        scenarioData.duplicateNumber = null;
    }
    if (scenarioData.assertions === undefined) {
        scenarioData.assertions = [];
    }
    if (scenarioData.tags === undefined) {
        scenarioData.tags = '';
    }

    scenarios.push(scenarioData);

    const scenarioCard = createScenarioCard(scenarioData);

    // Create a wrapper for scenario card + add button
    const scenarioWrapper = document.createElement('div');
    scenarioWrapper.className = 'scenario-wrapper';
    scenarioWrapper.appendChild(scenarioCard);

    // Add "Add Scenario" button after the card
    const addScenarioBtn = document.createElement('div');
    addScenarioBtn.className = 'add-scenario-after';
    addScenarioBtn.innerHTML = `
        <button class="btn-add-scenario-after" onclick="addScenarioAfter(${id})" title="Add scenario after this one">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Add Scenario
        </button>
    `;
    scenarioWrapper.appendChild(addScenarioBtn);

    document.getElementById('scenariosList').appendChild(scenarioWrapper);

    // Show/hide empty state
    updateEmptyState();
}

// Add scenario after a specific scenario
function addScenarioAfter(afterId) {
    // Find the index of the scenario to insert after
    const afterIndex = scenarios.findIndex(s => s.id === afterId);
    if (afterIndex === -1) {
        // If not found, just append at the end
        addScenario();
        return;
    }

    // Create new scenario data
    const id = scenarioCounter++;
    const scenarioData = {
        id: id,
        name: '',
        method: 'GET',
        endpoint: '',
        status: 200,
        request: '',
        response: '',
        extractVars: [],
        assertions: [],
        tags: '',
        sourceScenarioId: null,
        duplicateNumber: null
    };

    // Insert into scenarios array after the specified index
    scenarios.splice(afterIndex + 1, 0, scenarioData);

    // Create the card
    const scenarioCard = createScenarioCard(scenarioData);

    // Create a wrapper for scenario card + add button
    const scenarioWrapper = document.createElement('div');
    scenarioWrapper.className = 'scenario-wrapper';
    scenarioWrapper.appendChild(scenarioCard);

    // Add "Add Scenario" button after the card
    const addScenarioBtn = document.createElement('div');
    addScenarioBtn.className = 'add-scenario-after';
    addScenarioBtn.innerHTML = `
        <button class="btn-add-scenario-after" onclick="addScenarioAfter(${id})" title="Add scenario after this one">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Add Scenario
        </button>
    `;
    scenarioWrapper.appendChild(addScenarioBtn);

    // Find the DOM element to insert after
    const scenariosList = document.getElementById('scenariosList');
    const wrappers = scenariosList.querySelectorAll('.scenario-wrapper');
    if (wrappers[afterIndex]) {
        // Insert after the found wrapper
        wrappers[afterIndex].insertAdjacentElement('afterend', scenarioWrapper);
    } else {
        // Fallback: append at the end
        scenariosList.appendChild(scenarioWrapper);
    }

    // Update scenario numbers
    updateScenarioNumbers();
    updateEmptyState();
}

// Get available variables from previous scenarios
function getAvailableVariables(currentScenarioId) {
    const variables = [];
    for (const scenario of scenarios) {
        if (scenario.id >= currentScenarioId) break;
        const data = collectScenarioData(scenario.id);
        if (data && data.extractVars) {
            data.extractVars.forEach(v => {
                if (v.varName && v.jsonPath) {
                    variables.push({
                        name: v.varName,
                        from: `Scenario #${scenario.id + 1}`,
                        path: v.jsonPath
                    });
                }
            });
        }
    }
    return variables;
}

// Create scenario card HTML
function createScenarioCard(data) {
    const card = document.createElement('div');
    card.className = 'scenario-card';
    card.dataset.scenarioId = data.id;

    // Get available variables from previous scenarios
    const availableVars = getAvailableVariables(data.id);
    const varsHint = availableVars.length > 0
        ? `<div class="variables-hint">💡 Available variables: ${availableVars.map(v => `<code>${v.name}</code>`).join(', ')}</div>`
        : '';

    // Create extract vars HTML
    const extractVarsHTML = (data.extractVars || []).map((v, idx) => `
        <div class="extract-var-item" data-var-index="${idx}">
            <input type="text"
                   class="extract-var-name"
                   placeholder="variableName"
                   value="${v.varName || ''}"
                   data-scenario-id="${data.id}"
                   data-var-index="${idx}">
            <span class="extract-arrow">←</span>
            <input type="text"
                   class="extract-var-path"
                   placeholder="response.id"
                   value="${v.jsonPath || ''}"
                   data-scenario-id="${data.id}"
                   data-var-index="${idx}">
            <button class="btn-remove-var" onclick="removeExtractVar(${data.id}, ${idx})" title="Remove">✕</button>
        </div>
    `).join('');

    // Create assertions HTML
    const assertionsHTML = (data.assertions || []).map((assertion, idx) => `
        <div class="assertion-item" data-assertion-index="${idx}">
            <input type="text"
                   class="assertion-input"
                   placeholder="match response.id == '#number'"
                   value="${assertion || ''}"
                   data-scenario-id="${data.id}"
                   data-assertion-index="${idx}">
            <button class="btn-remove-var" onclick="removeAssertion(${data.id}, ${idx})" title="Remove">✕</button>
        </div>
    `).join('');

    // Calculate scenario number text with duplicate tracking
    let scenarioNumberText;
    if (data.sourceScenarioId !== null && data.duplicateNumber !== null) {
        // This is a duplicate - find the display position of the source scenario
        const sourceScenarioIndex = scenarios.findIndex(s => s.id === data.sourceScenarioId);
        if (sourceScenarioIndex !== -1) {
            scenarioNumberText = `Scenario #${sourceScenarioIndex + 1} (Duplicate ${data.duplicateNumber})`;
        } else {
            // Source scenario was deleted, fall back to just showing it's a duplicate
            scenarioNumberText = `Scenario (Duplicate ${data.duplicateNumber})`;
        }
    } else {
        // Original scenario - find its display position
        const currentIndex = scenarios.findIndex(s => s.id === data.id);
        scenarioNumberText = `Scenario #${currentIndex + 1}`;
    }

    card.innerHTML = `
        <div class="scenario-card-header">
            <span class="scenario-number">${scenarioNumberText}</span>
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
                <label>Tags (optional)</label>
                <input type="text"
                       class="scenario-tags"
                       data-scenario-id="${data.id}"
                       placeholder="e.g., @smoke,@regression"
                       value="${data.tags || ''}">
                <small style="color: #666; font-size: 0.85em;">💡 Separate multiple tags with commas</small>
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
                <label>Endpoint Path ${varsHint}</label>
                <input type="text"
                       class="scenario-endpoint"
                       data-scenario-id="${data.id}"
                       placeholder="e.g., /api/users/123 or /api/users/#(userId)"
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
                    Request Payload (Optional) ${varsHint}
                    <button class="btn-icon" onclick="formatScenarioJSON(${data.id}, 'request')" title="Format">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="16 18 22 12 16 6"></polyline>
                            <polyline points="8 6 2 12 8 18"></polyline>
                        </svg>
                    </button>
                </label>
                <textarea class="scenario-request"
                          data-scenario-id="${data.id}"
                          placeholder='Use #(varName) syntax, e.g.: {"userId": "#(userId)"}'>${data.request}</textarea>
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

        <div class="extract-vars-section">
            <div class="extract-vars-header">
                <label>Extract Variables from Response (for use in later scenarios)</label>
                <button class="btn-add-var" onclick="addExtractVar(${data.id})" title="Add Variable">
                    ➕ Add Variable
                </button>
            </div>
            <div class="extract-vars-list" id="extractVarsList_${data.id}">
                ${extractVarsHTML || '<div class="empty-vars-hint">No variables to extract. Click "Add Variable" to extract values from this response.</div>'}
            </div>
            <div class="extract-vars-help">
                <small>💡 Examples: <code>userId</code> ← <code>response.id</code> or <code>authToken</code> ← <code>response.data.token</code></small>
            </div>
        </div>

        <div class="assertions-section">
            <div class="assertions-header">
                <label>Custom Assertions (optional)</label>
                <button class="btn-add-var" onclick="addAssertion(${data.id})" title="Add Assertion">
                    ➕ Add Assertion
                </button>
            </div>
            <div class="assertions-list" id="assertionsList_${data.id}">
                ${assertionsHTML || '<div class="empty-vars-hint">No custom assertions. Click "Add Assertion" to add validation rules.</div>'}
            </div>
            <div class="assertions-help">
                <small>💡 Examples: <code>match response.id == '#number'</code> or <code>match response.email == '#regex .+@.+'</code></small>
            </div>
        </div>
    `;

    return card;
}

// Add variable extraction field
function addExtractVar(scenarioId) {
    const scenario = scenarios.find(s => s.id === scenarioId);
    if (!scenario) return;

    const data = collectScenarioData(scenarioId);
    if (!data.extractVars) data.extractVars = [];

    const varIndex = data.extractVars.length;
    data.extractVars.push({ varName: '', jsonPath: '' });

    const list = document.getElementById(`extractVarsList_${scenarioId}`);

    // Remove empty hint if it exists
    const emptyHint = list.querySelector('.empty-vars-hint');
    if (emptyHint) emptyHint.remove();

    const varItem = document.createElement('div');
    varItem.className = 'extract-var-item';
    varItem.dataset.varIndex = varIndex;
    varItem.innerHTML = `
        <input type="text"
               class="extract-var-name"
               placeholder="variableName"
               data-scenario-id="${scenarioId}"
               data-var-index="${varIndex}">
        <span class="extract-arrow">←</span>
        <input type="text"
               class="extract-var-path"
               placeholder="response.id"
               data-scenario-id="${scenarioId}"
               data-var-index="${varIndex}">
        <button class="btn-remove-var" onclick="removeExtractVar(${scenarioId}, ${varIndex})" title="Remove">✕</button>
    `;
    list.appendChild(varItem);
}

// Remove variable extraction field
function removeExtractVar(scenarioId, varIndex) {
    const list = document.getElementById(`extractVarsList_${scenarioId}`);
    const item = list.querySelector(`[data-var-index="${varIndex}"]`);
    if (item) {
        item.remove();
    }

    // Show empty hint if no variables left
    if (list.querySelectorAll('.extract-var-item').length === 0) {
        list.innerHTML = '<div class="empty-vars-hint">No variables to extract. Click "Add Variable" to extract values from this response.</div>';
    }
}

// Add custom assertion field
function addAssertion(scenarioId) {
    const scenario = scenarios.find(s => s.id === scenarioId);
    if (!scenario) return;

    const data = collectScenarioData(scenarioId);
    if (!data.assertions) data.assertions = [];

    const assertionIndex = data.assertions.length;
    data.assertions.push('');

    const list = document.getElementById(`assertionsList_${scenarioId}`);

    // Remove empty hint if it exists
    const emptyHint = list.querySelector('.empty-vars-hint');
    if (emptyHint) emptyHint.remove();

    const assertionItem = document.createElement('div');
    assertionItem.className = 'assertion-item';
    assertionItem.dataset.assertionIndex = assertionIndex;
    assertionItem.innerHTML = `
        <input type="text"
               class="assertion-input"
               placeholder="match response.id == '#number'"
               data-scenario-id="${scenarioId}"
               data-assertion-index="${assertionIndex}">
        <button class="btn-remove-var" onclick="removeAssertion(${scenarioId}, ${assertionIndex})" title="Remove">✕</button>
    `;
    list.appendChild(assertionItem);
}

// Remove custom assertion field
function removeAssertion(scenarioId, assertionIndex) {
    const list = document.getElementById(`assertionsList_${scenarioId}`);
    const item = list.querySelector(`[data-assertion-index="${assertionIndex}"]`);
    if (item) {
        item.remove();
    }

    // Show empty hint if no assertions left
    if (list.querySelectorAll('.assertion-item').length === 0) {
        list.innerHTML = '<div class="empty-vars-hint">No custom assertions. Click "Add Assertion" to add validation rules.</div>';
    }
}

// Add environment variable
function addEnvVariable() {
    const id = envVarCounter++;
    envVariables.push({ id, name: '', description: '' });

    const list = document.getElementById('envVariablesList');

    // Remove empty hint if it exists
    const emptyHint = list.querySelector('.empty-vars-hint');
    if (emptyHint) emptyHint.remove();

    const varItem = document.createElement('div');
    varItem.className = 'env-var-item';
    varItem.dataset.envVarId = id;
    varItem.innerHTML = `
        <input type="text"
               class="env-var-name"
               placeholder="Variable name (e.g., userId)"
               data-env-var-id="${id}">
        <input type="text"
               class="env-var-description"
               placeholder="Description (e.g., Test user ID)"
               data-env-var-id="${id}">
        <button class="btn-remove-var" onclick="removeEnvVariable(${id})" title="Remove">✕</button>
    `;
    list.appendChild(varItem);
}

// Remove environment variable
function removeEnvVariable(id) {
    envVariables = envVariables.filter(v => v.id !== id);

    const list = document.getElementById('envVariablesList');
    const item = list.querySelector(`[data-env-var-id="${id}"]`);
    if (item) {
        item.remove();
    }

    // Show empty hint if no variables left
    if (list.querySelectorAll('.env-var-item').length === 0) {
        list.innerHTML = '<div class="empty-vars-hint">No environment variables defined. Click "Add Variable" to define variables that change per environment.</div>';
    }
}

// Collect environment variables from form
function collectEnvVariables() {
    const variables = [];
    const nameInputs = document.querySelectorAll('.env-var-name');
    const descriptionInputs = document.querySelectorAll('.env-var-description');

    nameInputs.forEach((nameInput, idx) => {
        const name = nameInput.value.trim();
        const description = descriptionInputs[idx]?.value.trim() || '';
        if (name) {
            variables.push({ name, description });
        }
    });

    return variables;
}

// Duplicate scenario
function duplicateScenario(id) {
    const scenario = scenarios.find(s => s.id === id);
    if (!scenario) return;

    const scenarioData = collectScenarioData(id);
    if (!scenarioData) return;

    // Determine the source scenario ID (handle duplicating a duplicate)
    const sourceId = scenario.sourceScenarioId !== null ? scenario.sourceScenarioId : id;

    // Count existing duplicates of this source
    const existingDuplicates = scenarios.filter(s => s.sourceScenarioId === sourceId);
    const nextDuplicateNumber = existingDuplicates.length + 1;

    // Create new scenario with duplicate metadata
    addScenario({
        ...scenarioData,
        sourceScenarioId: sourceId,
        duplicateNumber: nextDuplicateNumber
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

        // Remove from DOM (remove the wrapper which contains the card and add button)
        const card = document.querySelector(`.scenario-card[data-scenario-id="${id}"]`);
        if (card) {
            const wrapper = card.closest('.scenario-wrapper');
            if (wrapper) {
                wrapper.remove();
            } else {
                card.remove();
            }
        }

        // Update scenario numbers
        updateScenarioNumbers();
        updateEmptyState();
    });
}

// Update scenario numbers after removal
function updateScenarioNumbers() {
    document.querySelectorAll('.scenario-card').forEach((card) => {
        const scenarioId = parseInt(card.dataset.scenarioId);
        const scenario = scenarios.find(s => s.id === scenarioId);
        if (!scenario) return;

        const numberSpan = card.querySelector('.scenario-number');
        if (numberSpan) {
            let scenarioNumberText;
            if (scenario.sourceScenarioId !== null && scenario.duplicateNumber !== null) {
                // This is a duplicate
                const sourceScenarioIndex = scenarios.findIndex(s => s.id === scenario.sourceScenarioId);
                if (sourceScenarioIndex !== -1) {
                    scenarioNumberText = `Scenario #${sourceScenarioIndex + 1} (Duplicate ${scenario.duplicateNumber})`;
                } else {
                    // Source scenario was deleted
                    scenarioNumberText = `Scenario (Duplicate ${scenario.duplicateNumber})`;
                }
            } else {
                // Original scenario
                const currentIndex = scenarios.findIndex(s => s.id === scenario.id);
                scenarioNumberText = `Scenario #${currentIndex + 1}`;
            }
            numberSpan.textContent = scenarioNumberText;
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
    const tags = document.querySelector(`.scenario-tags[data-scenario-id="${id}"]`)?.value.trim();
    const method = document.querySelector(`.scenario-method[data-scenario-id="${id}"]`)?.value;
    const endpoint = document.querySelector(`.scenario-endpoint[data-scenario-id="${id}"]`)?.value.trim();
    const status = document.querySelector(`.scenario-status[data-scenario-id="${id}"]`)?.value;
    const request = document.querySelector(`.scenario-request[data-scenario-id="${id}"]`)?.value.trim();
    const response = document.querySelector(`.scenario-response[data-scenario-id="${id}"]`)?.value.trim();

    // Collect extract variables
    const extractVars = [];
    const varNames = document.querySelectorAll(`.extract-var-name[data-scenario-id="${id}"]`);
    const varPaths = document.querySelectorAll(`.extract-var-path[data-scenario-id="${id}"]`);

    varNames.forEach((nameInput, idx) => {
        const varName = nameInput.value.trim();
        const jsonPath = varPaths[idx]?.value.trim();
        if (varName && jsonPath) {
            extractVars.push({ varName, jsonPath });
        }
    });

    // Collect assertions
    const assertions = [];
    const assertionInputs = document.querySelectorAll(`.assertion-input[data-scenario-id="${id}"]`);

    assertionInputs.forEach((input) => {
        const assertion = input.value.trim();
        if (assertion) {
            assertions.push(assertion);
        }
    });

    return {
        id,
        name,
        tags,
        method,
        endpoint,
        status: parseInt(status),
        request,
        response,
        extractVars,
        assertions
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
        // Handle Karate variable syntax - preserve #(anything) patterns
        // Store all Karate variables and replace with placeholders
        // Supports both single and double quotes
        const karateVars = [];
        const preserved = input.replace(/["']#\([^)]+\)["']/g, (match) => {
            const index = karateVars.length;
            karateVars.push(match.slice(1, -1)); // Remove the quotes
            return `"__KARATE_VAR_${index}__"`;
        });

        const parsed = JSON.parse(preserved);
        let formatted = JSON.stringify(parsed, null, 2);

        // Restore Karate variables
        formatted = formatted.replace(/"__KARATE_VAR_(\d+)__"/g, (match, index) => {
            return `"${karateVars[parseInt(index)]}"`;
        });

        textarea.value = formatted;
    } catch (e) {
        showModal('JSON Error', 'Invalid JSON: ' + e.message);
    }
}

// Generate Karate Feature File
function generateKarateFeature() {
    // Get feature-level configuration
    const featureName = document.getElementById('featureName').value.trim();
    const baseUrl = document.getElementById('baseUrl').value.trim();
    const useEnvUrl = document.getElementById('useEnvUrl').checked;
    const envUrlDomain = document.getElementById('envUrlDomain').value.trim();
    const includeHeaders = document.getElementById('includeHeaders').checked;
    const includeAuth = document.getElementById('includeAuth').checked;
    const strictValidation = document.getElementById('strictValidation').checked;
    const includeComments = document.getElementById('includeComments').checked;

    // Validate feature name
    if (!featureName) {
        showModal('Validation Error', 'Feature name is required');
        return;
    }

    // Validate environment URL configuration
    if (useEnvUrl && !envUrlDomain) {
        showModal('Validation Error', 'URL Pattern is required when using environment-based URL');
        return;
    }

    // Collect environment variables
    const useEnvVariables = document.getElementById('useEnvVariables').checked;
    const envVars = useEnvVariables ? collectEnvVariables() : [];

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

        // Validate JSON (skip validation for fields with Karate variables)
        let requestJson = null;
        let responseJson = null;

        if (data.request) {
            try {
                // Temporarily replace Karate variables for validation
                // Handles #(varName), #(obj.prop), #(array[0]), etc.
                // Supports both single and double quotes
                const tempRequest = data.request.replace(/["']#\([^)]+\)["']/g, '"__TEMP__"');
                requestJson = JSON.parse(tempRequest);
            } catch (e) {
                showModal('JSON Error', `Scenario #${scenario.id + 1} invalid request JSON: ${e.message}`);
                return;
            }
        }

        try {
            // Temporarily replace Karate variables for validation
            // Handles #(varName), #(obj.prop), #(array[0]), etc.
            // Supports both single and double quotes
            const tempResponse = data.response.replace(/["']#\([^)]+\)["']/g, '"__TEMP__"');
            responseJson = JSON.parse(tempResponse);
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
        useEnvUrl,
        envUrlDomain,
        useEnvVariables,
        envVariables: envVars,
        includeHeaders,
        includeAuth,
        strictValidation,
        includeComments,
        scenarios: scenarioDataList
    });

    // Display the result
    document.getElementById('karateOutput').textContent = generatedFeature;
    document.getElementById('outputSection').style.display = 'block';

    // Auto-save after successful generation
    saveWork();

    // Scroll to output
    document.getElementById('outputSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Convert JSON values to Karate schema matchers
function convertToSchemaMatchers(obj) {
    if (obj === null) {
        return '#null';
    }

    if (Array.isArray(obj)) {
        if (obj.length === 0) {
            return '#array';
        }
        // Convert first element to show schema for array items
        return [convertToSchemaMatchers(obj[0])];
    }

    if (typeof obj === 'object') {
        const result = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                result[key] = convertToSchemaMatchers(obj[key]);
            }
        }
        return result;
    }

    if (typeof obj === 'string') {
        // Check if it's a Karate variable pattern like #(varName)
        if (/^#\([^)]+\)$/.test(obj)) {
            return obj; // Preserve Karate variables as-is
        }
        return '#string';
    }

    if (typeof obj === 'number') {
        return '#number';
    }

    if (typeof obj === 'boolean') {
        return '#boolean';
    }

    return obj;
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

    // Add karate-config.js instructions for environment variables
    if (config.useEnvVariables && config.envVariables && config.envVariables.length > 0 && config.includeComments) {
        feature += `  # Configure environment-specific variables in karate-config.js:\n`;
        feature += `  # function fn() {\n`;
        feature += `  #   var env = karate.properties['env'] || 'dev';\n`;
        feature += `  #   var config = {\n`;
        config.envVariables.forEach(v => {
            const comment = v.description ? ` // ${v.description}` : '';
            feature += `  #     ${v.name}: karate.properties['${v.name}'] || getDefault${v.name}(env),${comment}\n`;
        });
        feature += `  #   };\n`;
        feature += `  #   return config;\n`;
        feature += `  # }\n\n`;
    }

    // Background (optional)
    if (config.useEnvUrl || config.baseUrl || config.useEnvVariables || config.includeHeaders || config.includeAuth) {
        feature += `Background:\n`;

        // Environment-based URL or static URL
        if (config.useEnvUrl && config.envUrlDomain) {
            feature += `  * def env = karate.properties['env']\n`;
            feature += `  Given url 'https://' + env + '${config.envUrlDomain}'\n`;
        } else if (config.baseUrl) {
            feature += `  * url '${config.baseUrl}'\n`;
        }

        // Environment-specific variables
        if (config.useEnvVariables && config.envVariables && config.envVariables.length > 0) {
            if (config.includeComments) {
                feature += `  # Read environment-specific variables from karate-config.js\n`;
            }
            config.envVariables.forEach(v => {
                const comment = v.description ? ` # ${v.description}` : '';
                feature += `  * def ${v.name} = karate.get('${v.name}')${comment}\n`;
            });
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

        // Add tags if present
        if (scenario.tags && scenario.tags.trim()) {
            // Split by comma, trim whitespace, ensure @ prefix
            const tags = scenario.tags
                .split(',')
                .map(tag => tag.trim())
                .filter(tag => tag.length > 0)
                .map(tag => tag.startsWith('@') ? tag : '@' + tag)
                .join(' ');
            feature += `  ${tags}\n`;
        }

        feature += `  Scenario: ${scenario.name}\n`;

        // Get variables from previous scenarios that are used in this scenario
        const availableVars = getPreviousExtractedVars(config.scenarios, index);
        const usedVars = getUsedVariablesInScenario(scenario, availableVars);

        // Note: Variables defined in previous scenarios are automatically available
        // No need to use karate.get() within the same feature file

        if (config.includeComments) {
            feature += `  # Arrange: Set up the request\n`;
        }

        // Set request body if present
        if (scenario.request) {
            feature += `  * def requestBody =\n`;
            feature += `    """\n`;
            feature += indentText(scenario.request, 4);
            feature += `    """\n`;
        }

        if (config.includeComments) {
            feature += `\n  # Act: Make the API call\n`;
        }

        // Make the request
        // Handle endpoint path - use it directly to allow Karate variable interpolation
        if (scenario.request && ['POST', 'PUT', 'PATCH'].includes(scenario.method)) {
            feature += `  Given path '${scenario.endpoint}'\n`;
            feature += `  And request requestBody\n`;
            feature += `  When method ${scenario.method}\n`;
        } else {
            feature += `  Given path '${scenario.endpoint}'\n`;
            feature += `  When method ${scenario.method}\n`;
        }

        if (config.includeComments) {
            feature += `\n  # Assert: Validate the response\n`;
        }

        // Validate status code
        feature += `  Then status ${scenario.status}\n`;

        // Validate response schema using schema matchers (validates types, not exact values)
        const schemaResponse = convertToSchemaMatchers(scenario.responseJson);
        if (config.strictValidation) {
            feature += `  And match response ==\n`;
            feature += `    """\n`;
            feature += indentJSON(schemaResponse, 4);
            feature += `    """\n`;
        } else {
            feature += `  And match response contains\n`;
            feature += `    """\n`;
            feature += indentJSON(schemaResponse, 4);
            feature += `    """\n`;
        }

        // Extract variables
        if (scenario.extractVars && scenario.extractVars.length > 0) {
            if (config.includeComments) {
                feature += `\n  # Extract variables for use in subsequent scenarios\n`;
            }
            scenario.extractVars.forEach(v => {
                feature += `  * def ${v.varName} = ${v.jsonPath}\n`;
            });
        }

        // Custom assertions
        if (scenario.assertions && scenario.assertions.length > 0) {
            if (config.includeComments) {
                feature += `\n  # Custom assertions\n`;
            }
            scenario.assertions.forEach(assertion => {
                feature += `  And ${assertion}\n`;
            });
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

// Indent text (for request payloads that might have Karate syntax)
function indentText(text, spaces) {
    const lines = text.split('\n');
    return lines.map(line => ' '.repeat(spaces) + line).join('\n') + '\n';
}

// Get all variable names extracted in previous scenarios
function getPreviousExtractedVars(scenarios, currentIndex) {
    const extractedVars = [];
    for (let i = 0; i < currentIndex; i++) {
        const scenario = scenarios[i];
        if (scenario.extractVars && scenario.extractVars.length > 0) {
            scenario.extractVars.forEach(v => {
                if (v.varName && !extractedVars.includes(v.varName)) {
                    extractedVars.push(v.varName);
                }
            });
        }
    }
    return extractedVars;
}

// Detect which variables from previous scenarios are used in current scenario
function getUsedVariablesInScenario(scenario, availableVars) {
    const usedVars = [];
    const varPattern = /#\((\w+)\)/g;

    // Check endpoint
    if (scenario.endpoint) {
        let match;
        while ((match = varPattern.exec(scenario.endpoint)) !== null) {
            const varName = match[1];
            if (availableVars.includes(varName) && !usedVars.includes(varName)) {
                usedVars.push(varName);
            }
        }
    }

    // Check request payload
    if (scenario.request) {
        varPattern.lastIndex = 0; // Reset regex
        let match;
        while ((match = varPattern.exec(scenario.request)) !== null) {
            const varName = match[1];
            if (availableVars.includes(varName) && !usedVars.includes(varName)) {
                usedVars.push(varName);
            }
        }
    }

    return usedVars;
}

// Clear All
function clearAll() {
    showConfirmModal('Clear All', 'Are you sure you want to clear all scenarios and configuration?', () => {
        document.getElementById('featureName').value = 'API Test';
        document.getElementById('baseUrl').value = '';
        document.getElementById('useEnvUrl').checked = false;
        document.getElementById('envUrlDomain').value = '';
        document.getElementById('envUrlConfig').style.display = 'none';
        document.getElementById('includeHeaders').checked = true;
        document.getElementById('includeAuth').checked = false;
        document.getElementById('strictValidation').checked = true;
        document.getElementById('includeComments').checked = true;
        document.getElementById('useEnvVariables').checked = false;
        document.getElementById('envVariablesSection').style.display = 'none';

        // Clear all scenarios
        scenarios = [];
        scenarioCounter = 0;
        document.getElementById('scenariosList').innerHTML = '';

        // Clear environment variables
        envVariables = [];
        envVarCounter = 0;
        document.getElementById('envVariablesList').innerHTML = '<div class="empty-vars-hint">No environment variables defined. Click "Add Variable" to define variables that change per environment.</div>';

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

    // Add sample scenario 1 - Create User (extracts userId)
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
        }, null, 2),
        extractVars: [
            { varName: 'userId', jsonPath: 'response.id' }
        ]
    });

    // Add sample scenario 2 - Get User (uses userId from scenario 1)
    addScenario({
        id: 1,
        name: 'Get user by ID',
        method: 'GET',
        endpoint: '/api/users/#(userId)',
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
        }, null, 2),
        extractVars: []
    });

    // Add sample scenario 3 - Update User (uses userId from scenario 1)
    addScenario({
        id: 2,
        name: 'Update user details',
        method: 'PUT',
        endpoint: '/api/users/#(userId)',
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
        }, null, 2),
        extractVars: []
    });

    showModal('Success', 'Sample data with variable chaining loaded! Notice how userId from Scenario 1 is used in Scenarios 2 & 3.');
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

// Save work to database
function saveWork() {
    // Collect all current data
    const featureConfig = {
        featureName: document.getElementById('featureName').value.trim(),
        baseUrl: document.getElementById('baseUrl').value.trim(),
        useEnvUrl: document.getElementById('useEnvUrl').checked,
        envUrlDomain: document.getElementById('envUrlDomain').value.trim(),
        includeHeaders: document.getElementById('includeHeaders').checked,
        includeAuth: document.getElementById('includeAuth').checked,
        strictValidation: document.getElementById('strictValidation').checked,
        includeComments: document.getElementById('includeComments').checked,
        useEnvVariables: document.getElementById('useEnvVariables').checked
    };

    // Collect all scenarios data
    const scenariosData = scenarios.map(scenario => collectScenarioData(scenario.id));

    // Collect environment variables
    const envVars = collectEnvVariables();

    // Send to server
    fetch('/api/karate-generator/save', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            work_name: 'My Karate Work',
            feature_config: featureConfig,
            scenarios_data: scenariosData,
            env_variables: envVars
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showModal('Success', 'Your work has been saved successfully!');
            updateLastSavedDisplay(data.saved_at);
        } else {
            showModal('Error', 'Failed to save work: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('Error saving work:', error);
        showModal('Error', 'Failed to save work: ' + error.message);
    });
}

// Load work from database
function loadWork() {
    fetch('/api/karate-generator/load')
    .then(response => {
        if (response.status === 404) {
            // No saved work found, start with empty scenario
            addScenario();
            return null;
        }
        if (!response.ok) {
            throw new Error('Failed to load saved work');
        }
        return response.json();
    })
    .then(result => {
        if (!result) return; // No saved work

        if (result.success && result.data) {
            const { feature_config, scenarios_data, env_variables, saved_at } = result.data;

            // Restore feature configuration
            if (feature_config) {
                document.getElementById('featureName').value = feature_config.featureName || 'API Test';
                document.getElementById('baseUrl').value = feature_config.baseUrl || '';
                document.getElementById('useEnvUrl').checked = feature_config.useEnvUrl || false;
                document.getElementById('envUrlDomain').value = feature_config.envUrlDomain || '';
                document.getElementById('includeHeaders').checked = feature_config.includeHeaders !== undefined ? feature_config.includeHeaders : true;
                document.getElementById('includeAuth').checked = feature_config.includeAuth || false;
                document.getElementById('strictValidation').checked = feature_config.strictValidation !== undefined ? feature_config.strictValidation : true;
                document.getElementById('includeComments').checked = feature_config.includeComments !== undefined ? feature_config.includeComments : true;
                document.getElementById('useEnvVariables').checked = feature_config.useEnvVariables || false;

                // Trigger visibility updates
                document.getElementById('envUrlConfig').style.display = feature_config.useEnvUrl ? 'block' : 'none';
                document.getElementById('envVariablesSection').style.display = feature_config.useEnvVariables ? 'block' : 'none';
            }

            // Restore environment variables
            if (env_variables && env_variables.length > 0) {
                envVariables = [];
                envVarCounter = 0;
                const envVarsList = document.getElementById('envVariablesList');
                envVarsList.innerHTML = '';

                env_variables.forEach(envVar => {
                    const id = envVarCounter++;
                    envVariables.push({ id, name: envVar.name, description: envVar.description });

                    const varItem = document.createElement('div');
                    varItem.className = 'env-var-item';
                    varItem.dataset.envVarId = id;
                    varItem.innerHTML = `
                        <input type="text"
                               class="env-var-name"
                               placeholder="Variable name (e.g., userId)"
                               value="${envVar.name || ''}"
                               data-env-var-id="${id}">
                        <input type="text"
                               class="env-var-description"
                               placeholder="Description (e.g., Test user ID)"
                               value="${envVar.description || ''}"
                               data-env-var-id="${id}">
                        <button class="btn-remove-var" onclick="removeEnvVariable(${id})" title="Remove">✕</button>
                    `;
                    envVarsList.appendChild(varItem);
                });
            }

            // Restore scenarios
            if (scenarios_data && scenarios_data.length > 0) {
                scenarios = [];
                scenarioCounter = 0;
                document.getElementById('scenariosList').innerHTML = '';

                scenarios_data.forEach(scenarioData => {
                    addScenario(scenarioData);
                });

                showModal('Success', 'Your saved work has been loaded!');
                updateLastSavedDisplay(saved_at);
            } else {
                addScenario();
            }
        }
    })
    .catch(error => {
        console.error('Error loading work:', error);
        // Start with empty scenario on error
        addScenario();
    });
}

// Update last saved display
function updateLastSavedDisplay(timestamp) {
    const lastSavedDiv = document.getElementById('lastSaved');
    if (timestamp) {
        const date = new Date(timestamp);
        const timeString = date.toLocaleTimeString();
        lastSavedDiv.textContent = `Last saved: ${timeString}`;
    }
}
