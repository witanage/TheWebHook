// JSON Comparison Tool JavaScript

function getPlainText(id) {
    const element = document.getElementById(id);
    return element.textContent || element.innerText || '';
}

function setPlainText(id, text) {
    const element = document.getElementById(id);
    element.textContent = text;
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

        // Highlight differences in both editors
        const highlightedJSON1 = highlightJSONWithTracking(obj1, diffMap, 'json1');
        const highlightedJSON2 = highlightJSONWithTracking(obj2, diffMap, 'json2');

        document.getElementById('json1').innerHTML = highlightedJSON1;
        document.getElementById('json2').innerHTML = highlightedJSON2;

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

// Initialize on page load
window.addEventListener('DOMContentLoaded', function() {
    const json1 = document.getElementById('json1');
    const json2 = document.getElementById('json2');

    if (!json1.textContent) {
        json1.textContent = '';
        json1.setAttribute('data-placeholder', 'Paste your first JSON here...');
    }
    if (!json2.textContent) {
        json2.textContent = '';
        json2.setAttribute('data-placeholder', 'Paste your second JSON here...');
    }

    // Auto-format on paste
    function handlePaste(e) {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        try {
            const obj = JSON.parse(text);
            const formatted = JSON.stringify(obj, null, 2);
            document.execCommand('insertText', false, formatted);
        } catch (err) {
            // If not valid JSON, just paste as is
            document.execCommand('insertText', false, text);
        }
    }

    json1.addEventListener('paste', handlePaste);
    json2.addEventListener('paste', handlePaste);

    // Synchronized scrolling
    let isSyncing = false;

    json1.addEventListener('scroll', function() {
        if (!isSyncing) {
            isSyncing = true;
            json2.scrollTop = json1.scrollTop;
            json2.scrollLeft = json1.scrollLeft;
            setTimeout(() => { isSyncing = false; }, 10);
        }
    });

    json2.addEventListener('scroll', function() {
        if (!isSyncing) {
            isSyncing = true;
            json1.scrollTop = json2.scrollTop;
            json1.scrollLeft = json2.scrollLeft;
            setTimeout(() => { isSyncing = false; }, 10);
        }
    });
});