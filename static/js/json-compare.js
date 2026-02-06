// JSON Comparison Tool JavaScript

// Current comparison state
let currentComparisonId = null;
let currentComparisonName = null;

function getPlainText(id) {
    return document.getElementById(id).value;
}

function setPlainText(id, text) {
    const el = document.getElementById(id);
    el.value = text;
    // If highlight overlay is visible, switch back to editor
    showEditor(id);
}

// Show the textarea editor, hide the highlight overlay
function showEditor(id) {
    const editor = document.getElementById(id);
    const highlight = document.getElementById(id + 'Highlight');
    editor.style.display = '';
    highlight.style.display = 'none';
}

// Show the highlight overlay, hide the textarea
function showHighlight(id) {
    const editor = document.getElementById(id);
    const highlight = document.getElementById(id + 'Highlight');
    editor.style.display = 'none';
    highlight.style.display = '';
}

function compareJSON() {
    try {
        const json1Text = getPlainText('json1').trim();
        const json2Text = getPlainText('json2').trim();

        if (!json1Text || !json2Text) {
            showModal('Error', 'Please enter JSON in both fields');
            return;
        }

        const obj1 = JSON.parse(json1Text);
        const obj2 = JSON.parse(json2Text);

        const differences = findDifferences(obj1, obj2);
        const stats = calculateStats(differences);

        // Create a map of differences for highlighting
        const diffMap = {};
        differences.forEach(diff => {
            diffMap[diff.path] = diff;
        });

        // Update stats
        document.getElementById('addedCount').textContent = stats.added;
        document.getElementById('removedCount').textContent = stats.removed;
        document.getElementById('changedCount').textContent = stats.changed;

        // Render highlighted JSON into overlay divs
        const highlightedJSON1 = highlightJSONWithTracking(obj1, diffMap, 'json1');
        const highlightedJSON2 = highlightJSONWithTracking(obj2, diffMap, 'json2');

        document.getElementById('json1Highlight').innerHTML = highlightedJSON1;
        document.getElementById('json2Highlight').innerHTML = highlightedJSON2;

        // Show the highlight overlays instead of textareas
        showHighlight('json1');
        showHighlight('json2');

        // Keep the textarea values in sync (formatted)
        document.getElementById('json1').value = JSON.stringify(obj1, null, 2);
        document.getElementById('json2').value = JSON.stringify(obj2, null, 2);

        // Display detailed differences
        const diffContainer = document.getElementById('diffContainer');
        diffContainer.innerHTML = '';

        if (differences.length === 0) {
            diffContainer.innerHTML = '<div class="diff-line diff-equal">No differences found - JSON objects are identical!</div>';
        } else {
            differences.forEach(diff => {
                const diffLine = document.createElement('div');
                diffLine.className = 'diff-line';

                if (diff.type === 'added') {
                    diffLine.classList.add('diff-added');
                    diffLine.textContent = `+ ${diff.path}: ${JSON.stringify(diff.value2)}`;
                } else if (diff.type === 'removed') {
                    diffLine.classList.add('diff-removed');
                    diffLine.textContent = `- ${diff.path}: ${JSON.stringify(diff.value1)}`;
                } else if (diff.type === 'changed') {
                    diffLine.classList.add('diff-changed');
                    diffLine.textContent = `± ${diff.path}: ${JSON.stringify(diff.value1)} → ${JSON.stringify(diff.value2)}`;
                }

                diffContainer.appendChild(diffLine);
            });
        }

        document.getElementById('results').style.display = 'block';
        document.getElementById('results').scrollIntoView({ behavior: 'smooth' });

    } catch (e) {
        showModal('Error', 'Error parsing JSON: ' + e.message);
    }
}

function highlightJSONWithTracking(obj, diffMap, side, path = '', indent = 0) {
    if (obj === null) {
        return 'null';
    }

    if (typeof obj !== 'object') {
        return JSON.stringify(obj);
    }

    let result = '';
    const indentStr = '  '.repeat(indent);

    const isArray = Array.isArray(obj);
    result += isArray ? '[\n' : '{\n';

    const items = isArray ? obj : Object.keys(obj);
    const length = isArray ? obj.length : items.length;

    (isArray ? obj : items).forEach((item, index) => {
        const key = isArray ? index : item;
        const value = isArray ? item : obj[item];
        const currentPath = isArray ? `${path}[${index}]` : (path ? `${path}.${key}` : key);
        const diff = diffMap[currentPath];

        let highlightClass = '';
        if (diff) {
            if (diff.type === 'added') {
                highlightClass = side === 'json2' ? 'highlight-added' : '';
            } else if (diff.type === 'removed') {
                highlightClass = side === 'json1' ? 'highlight-removed' : '';
            } else if (diff.type === 'changed') {
                highlightClass = 'highlight-changed';
            }
        }

        const lineStart = indentStr + '  ' + (isArray ? '' : `"${key}": `);

        if (typeof value === 'object' && value !== null) {
            const nested = highlightJSONWithTracking(value, diffMap, side, currentPath, indent + 1);
            if (highlightClass) {
                result += `<span class="${highlightClass}">${escapeHtml(lineStart)}${nested}</span>`;
            } else {
                result += escapeHtml(lineStart) + nested;
            }
        } else {
            const valueStr = JSON.stringify(value);
            if (highlightClass) {
                result += `<span class="${highlightClass}">${escapeHtml(lineStart + valueStr)}</span>`;
            } else {
                result += escapeHtml(lineStart + valueStr);
            }
        }

        if (index < length - 1) {
            result += ',';
        }
        result += '\n';
    });

    result += indentStr + (isArray ? ']' : '}');
    return result;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function findDifferences(obj1, obj2, path = '') {
    const differences = [];

    // Handle array comparison
    if (Array.isArray(obj1) && Array.isArray(obj2)) {
        const maxLength = Math.max(obj1.length, obj2.length);
        for (let i = 0; i < maxLength; i++) {
            const currentPath = path ? `${path}[${i}]` : `[${i}]`;
            const val1 = obj1[i];
            const val2 = obj2[i];

            if (i >= obj2.length) {
                differences.push({
                    type: 'removed',
                    path: currentPath,
                    value1: val1
                });
            } else if (i >= obj1.length) {
                differences.push({
                    type: 'added',
                    path: currentPath,
                    value2: val2
                });
            } else if (typeof val1 === 'object' && val1 !== null &&
                       typeof val2 === 'object' && val2 !== null) {
                differences.push(...findDifferences(val1, val2, currentPath));
            } else if (JSON.stringify(val1) !== JSON.stringify(val2)) {
                differences.push({
                    type: 'changed',
                    path: currentPath,
                    value1: val1,
                    value2: val2
                });
            }
        }
        return differences;
    }

    // Handle object comparison
    const allKeys = new Set([
        ...Object.keys(obj1 || {}),
        ...Object.keys(obj2 || {})
    ]);

    allKeys.forEach(key => {
        const currentPath = path ? `${path}.${key}` : key;
        const val1 = obj1?.[key];
        const val2 = obj2?.[key];

        const has1 = obj1 && key in obj1;
        const has2 = obj2 && key in obj2;

        if (!has2) {
            differences.push({
                type: 'removed',
                path: currentPath,
                value1: val1
            });
        } else if (!has1) {
            differences.push({
                type: 'added',
                path: currentPath,
                value2: val2
            });
        } else if (typeof val1 === 'object' && val1 !== null &&
                   typeof val2 === 'object' && val2 !== null) {
            differences.push(...findDifferences(val1, val2, currentPath));
        } else if (JSON.stringify(val1) !== JSON.stringify(val2)) {
            differences.push({
                type: 'changed',
                path: currentPath,
                value1: val1,
                value2: val2
            });
        }
    });

    return differences;
}

function calculateStats(differences) {
    return {
        added: differences.filter(d => d.type === 'added').length,
        removed: differences.filter(d => d.type === 'removed').length,
        changed: differences.filter(d => d.type === 'changed').length
    };
}

function formatJSON() {
    try {
        const json1 = getPlainText('json1').trim();
        const json2 = getPlainText('json2').trim();

        if (json1) {
            const obj1 = JSON.parse(json1);
            setPlainText('json1', JSON.stringify(obj1, null, 2));
        }

        if (json2) {
            const obj2 = JSON.parse(json2);
            setPlainText('json2', JSON.stringify(obj2, null, 2));
        }
    } catch (e) {
        showModal('Error', 'Error formatting JSON: ' + e.message);
    }
}

function clearAll() {
    setPlainText('json1', '');
    setPlainText('json2', '');
    document.getElementById('results').style.display = 'none';
    clearCurrentComparison();
}

function loadSample() {
    const sample1 = {
        "name": "John Doe",
        "age": 30,
        "email": "john@example.com",
        "address": {
            "street": "123 Main St",
            "city": "New York",
            "zip": "10001"
        },
        "hobbies": ["reading", "gaming"]
    };

    const sample2 = {
        "name": "John Doe",
        "age": 31,
        "email": "john.doe@example.com",
        "address": {
            "street": "123 Main St",
            "city": "New York",
            "zip": "10001",
            "country": "USA"
        },
        "hobbies": ["reading", "gaming", "cooking"],
        "phone": "555-1234"
    };

    setPlainText('json1', JSON.stringify(sample1, null, 2));
    setPlainText('json2', JSON.stringify(sample2, null, 2));
}

// ==================== Save / Load Comparisons ====================

function updateCurrentComparisonUI() {
    const indicator = document.getElementById('currentComparison');
    const nameEl = document.getElementById('currentComparisonName');

    if (currentComparisonId && currentComparisonName) {
        nameEl.textContent = currentComparisonName;
        indicator.style.display = 'flex';
    } else {
        indicator.style.display = 'none';
    }
}

function clearCurrentComparison() {
    currentComparisonId = null;
    currentComparisonName = null;
    updateCurrentComparisonUI();
}

function openSaveModal() {
    const json1 = getPlainText('json1').trim();
    const json2 = getPlainText('json2').trim();

    if (!json1 && !json2) {
        showModal('Error', 'Nothing to save - both JSON fields are empty.');
        return;
    }

    const nameInput = document.getElementById('comparisonName');
    nameInput.value = currentComparisonName || '';
    document.getElementById('saveModal').classList.add('active');
    nameInput.focus();
}

function closeSaveModal() {
    document.getElementById('saveModal').classList.remove('active');
}

function saveComparison(event) {
    event.preventDefault();

    const comparisonName = document.getElementById('comparisonName').value.trim();
    if (!comparisonName) {
        showModal('Error', 'Please enter a name for the comparison.');
        return;
    }

    const json1 = getPlainText('json1').trim();
    const json2 = getPlainText('json2').trim();

    const payload = {
        comparison_name: comparisonName,
        json1: json1,
        json2: json2
    };

    if (currentComparisonId) {
        payload.comparison_id = currentComparisonId;
    }

    fetch('/api/json-compare/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            currentComparisonId = data.comparison_id;
            currentComparisonName = comparisonName;
            updateCurrentComparisonUI();
            closeSaveModal();
            showToast(data.message, 'success');
        } else {
            showModal('Error', data.error || 'Failed to save comparison.');
        }
    })
    .catch(error => {
        console.error('Save error:', error);
        showModal('Error', 'Failed to save comparison. Please try again.');
    });
}

function openLoadModal() {
    document.getElementById('loadModal').classList.add('active');
    loadComparisonsList();
}

function closeLoadModal() {
    document.getElementById('loadModal').classList.remove('active');
}

function loadComparisonsList() {
    const listEl = document.getElementById('savedComparisonsList');
    listEl.innerHTML = '<div class="loading-message">Loading saved comparisons...</div>';

    fetch('/api/json-compare/list')
    .then(response => response.json())
    .then(data => {
        if (data.success && data.comparisons.length > 0) {
            listEl.innerHTML = '';
            data.comparisons.forEach(function(comp) {
                const item = document.createElement('div');
                item.className = 'saved-comparison-item';

                const updatedDate = comp.updated_at
                    ? new Date(comp.updated_at).toLocaleString()
                    : 'Unknown';

                item.innerHTML =
                    '<div class="saved-comparison-info">' +
                        '<div class="saved-comparison-name">' + escapeHtml(comp.name) + '</div>' +
                        '<div class="saved-comparison-date">Updated: ' + updatedDate + '</div>' +
                    '</div>' +
                    '<div class="saved-comparison-actions">' +
                        '<button class="btn-load-item" data-id="' + comp.id + '">Load</button>' +
                        '<button class="btn-delete-item" data-id="' + comp.id + '" data-name="' + escapeHtml(comp.name) + '">Delete</button>' +
                    '</div>';

                listEl.appendChild(item);
            });

            // Bind load buttons
            listEl.querySelectorAll('.btn-load-item').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    loadComparison(this.getAttribute('data-id'));
                });
            });

            // Bind delete buttons
            listEl.querySelectorAll('.btn-delete-item').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var id = this.getAttribute('data-id');
                    var name = this.getAttribute('data-name');
                    deleteComparison(id, name);
                });
            });
        } else {
            listEl.innerHTML =
                '<div class="no-comparisons-message">' +
                    '<p>No saved comparisons yet.</p>' +
                    '<p>Use the Save button to store your comparisons.</p>' +
                '</div>';
        }
    })
    .catch(function(error) {
        console.error('List error:', error);
        listEl.innerHTML =
            '<div class="no-comparisons-message">' +
                '<p>Failed to load comparisons.</p>' +
            '</div>';
    });
}

function loadComparison(comparisonId) {
    fetch('/api/json-compare/load?comparison_id=' + comparisonId)
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const comp = data.data;
            setPlainText('json1', comp.json1 || '');
            setPlainText('json2', comp.json2 || '');

            currentComparisonId = comp.comparison_id;
            currentComparisonName = comp.comparison_name;
            updateCurrentComparisonUI();

            // Hide old results
            document.getElementById('results').style.display = 'none';

            closeLoadModal();
            showToast('Loaded: ' + comp.comparison_name, 'success');
        } else {
            showModal('Error', data.error || 'Failed to load comparison.');
        }
    })
    .catch(function(error) {
        console.error('Load error:', error);
        showModal('Error', 'Failed to load comparison. Please try again.');
    });
}

function deleteComparison(comparisonId, comparisonName) {
    showConfirmModal(
        'Delete Comparison',
        'Are you sure you want to delete "' + comparisonName + '"?',
        function() {
            fetch('/api/json-compare/delete/' + comparisonId, {
                method: 'DELETE'
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // If we just deleted the currently loaded comparison, clear it
                    if (currentComparisonId == comparisonId) {
                        clearCurrentComparison();
                    }
                    loadComparisonsList();
                    showToast('Comparison deleted', 'success');
                } else {
                    showModal('Error', data.error || 'Failed to delete comparison.');
                }
            })
            .catch(function(error) {
                console.error('Delete error:', error);
                showModal('Error', 'Failed to delete comparison. Please try again.');
            });
        }
    );
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', function() {
    const json1 = document.getElementById('json1');
    const json2 = document.getElementById('json2');

    // Auto-format on paste
    function handlePaste(e) {
        var textarea = e.target;
        // Let the browser insert the text natively first, then format
        setTimeout(function() {
            var text = textarea.value.trim();
            try {
                var obj = JSON.parse(text);
                textarea.value = JSON.stringify(obj, null, 2);
            } catch (err) {
                // Not valid JSON, leave as-is
            }
        }, 0);
    }

    json1.addEventListener('paste', handlePaste);
    json2.addEventListener('paste', handlePaste);

    // Click on highlight overlay to switch back to editor
    document.getElementById('json1Highlight').addEventListener('click', function() {
        showEditor('json1');
        json1.focus();
    });
    document.getElementById('json2Highlight').addEventListener('click', function() {
        showEditor('json2');
        json2.focus();
    });

    // Synchronized scrolling for textareas
    let isSyncing = false;

    json1.addEventListener('scroll', function() {
        if (!isSyncing) {
            isSyncing = true;
            json2.scrollTop = json1.scrollTop;
            json2.scrollLeft = json1.scrollLeft;
            setTimeout(function() { isSyncing = false; }, 10);
        }
    });

    json2.addEventListener('scroll', function() {
        if (!isSyncing) {
            isSyncing = true;
            json1.scrollTop = json2.scrollTop;
            json1.scrollLeft = json2.scrollLeft;
            setTimeout(function() { isSyncing = false; }, 10);
        }
    });

    // Sync scroll for highlight overlays too
    var highlight1 = document.getElementById('json1Highlight');
    var highlight2 = document.getElementById('json2Highlight');

    highlight1.addEventListener('scroll', function() {
        if (!isSyncing) {
            isSyncing = true;
            highlight2.scrollTop = highlight1.scrollTop;
            highlight2.scrollLeft = highlight1.scrollLeft;
            setTimeout(function() { isSyncing = false; }, 10);
        }
    });

    highlight2.addEventListener('scroll', function() {
        if (!isSyncing) {
            isSyncing = true;
            highlight1.scrollTop = highlight2.scrollTop;
            highlight1.scrollLeft = highlight2.scrollLeft;
            setTimeout(function() { isSyncing = false; }, 10);
        }
    });
});
