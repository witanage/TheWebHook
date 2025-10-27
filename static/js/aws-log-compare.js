// AWS Log Comparison Tool JavaScript

let file1Data = null;
let file2Data = null;
let comparisonResults = null;
let keyColumnIndex = null;

// Initialize event listeners when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // File upload handlers
    document.getElementById('file1').addEventListener('change', function(e) {
        handleFileUpload(e, 1);
    });

    document.getElementById('file2').addEventListener('change', function(e) {
        handleFileUpload(e, 2);
    });

    // Compare button handler
    document.getElementById('compareBtn').addEventListener('click', function() {
        document.getElementById('loading').style.display = 'block';
        document.getElementById('results').style.display = 'none';
        document.getElementById('stats').style.display = 'none';

        setTimeout(() => {
            compareLogs();
            document.getElementById('loading').style.display = 'none';
        }, 100);
    });

    // Clear button handler
    document.getElementById('clearBtn').addEventListener('click', clearAll);

    // Export button handler
    document.getElementById('exportBtn').addEventListener('click', exportResults);

    // Filter change handlers
    document.getElementById('showAdded').addEventListener('change', () => {
        if (comparisonResults) displayResults(comparisonResults);
    });

    document.getElementById('showRemoved').addEventListener('change', () => {
        if (comparisonResults) displayResults(comparisonResults);
    });

    document.getElementById('showModified').addEventListener('change', () => {
        if (comparisonResults) displayResults(comparisonResults);
    });

    document.getElementById('showUnchanged').addEventListener('change', () => {
        if (comparisonResults) displayResults(comparisonResults);
    });

    // Keyboard shortcuts for paste areas
    document.getElementById('pasteText1').addEventListener('keydown', function(e) {
        if (e.ctrlKey && e.key === 'Enter') {
            applyPastedData(1);
        } else if (e.key === 'Escape') {
            cancelPaste(1);
        }
    });

    document.getElementById('pasteText2').addEventListener('keydown', function(e) {
        if (e.ctrlKey && e.key === 'Enter') {
            applyPastedData(2);
        } else if (e.key === 'Escape') {
            cancelPaste(2);
        }
    });
});

// Show paste area
function showPasteArea(fileNum) {
    const pasteArea = document.getElementById(`pasteArea${fileNum}`);
    pasteArea.style.display = 'block';
    document.getElementById(`pasteText${fileNum}`).focus();
}

// Cancel paste
function cancelPaste(fileNum) {
    const pasteArea = document.getElementById(`pasteArea${fileNum}`);
    const textArea = document.getElementById(`pasteText${fileNum}`);
    pasteArea.style.display = 'none';
    textArea.value = '';
}

// Apply pasted data
function applyPastedData(fileNum) {
    const textArea = document.getElementById(`pasteText${fileNum}`);
    const csvContent = textArea.value.trim();

    if (!csvContent) {
        showAlert('Error', 'Please paste some CSV data first');
        return;
    }

    try {
        const data = parseCSV(csvContent);

        if (data.rows.length === 0) {
            showAlert('Error', 'No valid data rows found in the pasted content');
            return;
        }

        if (fileNum === 1) {
            file1Data = data;
            document.getElementById('fileName1').textContent = 'Pasted data (' + data.rows.length + ' rows)';
            document.getElementById('upload1').classList.add('active');
            updateKeyColumnOptions(data.headers);
        } else {
            file2Data = data;
            document.getElementById('fileName2').textContent = 'Pasted data (' + data.rows.length + ' rows)';
            document.getElementById('upload2').classList.add('active');
        }

        // Hide paste area after successful paste
        cancelPaste(fileNum);
        checkCompareButton();

    } catch (error) {
        showAlert('Error', 'Error parsing CSV data: ' + error.message);
    }
}

// Handle file upload
function handleFileUpload(e, fileNum) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const csv = event.target.result;
            try {
                const data = parseCSV(csv);

                if (fileNum === 1) {
                    file1Data = data;
                    document.getElementById('fileName1').textContent = file.name;
                    document.getElementById('upload1').classList.add('active');
                    updateKeyColumnOptions(data.headers);
                } else {
                    file2Data = data;
                    document.getElementById('fileName2').textContent = file.name;
                    document.getElementById('upload2').classList.add('active');
                }

                checkCompareButton();
            } catch (error) {
                showAlert('Error', 'Error parsing CSV file: ' + error.message);
            }
        };
        reader.readAsText(file);
    }
}

// Update key column dropdown options
function updateKeyColumnOptions(headers) {
    const select = document.getElementById('keyColumn');
    select.innerHTML = '<option value="auto">Auto-detect Key Column</option>';

    headers.forEach((header, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = header;
        select.appendChild(option);
    });
}

// Check if compare button should be enabled
function checkCompareButton() {
    const btn = document.getElementById('compareBtn');
    btn.disabled = !(file1Data && file2Data);
}

// Detect key column automatically
function detectKeyColumn(headers, rows) {
    // Try to find common key column names
    const keyNames = ['id', 'ID', 'requestId', 'RequestId', 'messageId', 'MessageId',
                    'timestamp', 'Timestamp', '@timestamp', 'time', 'Time'];

    for (let name of keyNames) {
        const index = headers.indexOf(name);
        if (index !== -1) {
            return index;
        }
    }

    // If no common key found, use first column
    return 0;
}

// Compare logs
function compareLogs() {
    const keyColValue = document.getElementById('keyColumn').value;

    if (keyColValue === 'auto') {
        keyColumnIndex = detectKeyColumn(file1Data.headers, file1Data.rows);
    } else {
        keyColumnIndex = parseInt(keyColValue);
    }

    const keyColumn = file1Data.headers[keyColumnIndex];

    // Create maps for efficient comparison
    const map1 = new Map();
    const map2 = new Map();

    file1Data.rows.forEach(row => {
        const key = row[keyColumn] || JSON.stringify(row);
        map1.set(key, row);
    });

    file2Data.rows.forEach(row => {
        const key = row[keyColumn] || JSON.stringify(row);
        map2.set(key, row);
    });

    const results = {
        added: [],
        removed: [],
        modified: [],
        unchanged: []
    };

    // Find removed and modified/unchanged
    map1.forEach((row, key) => {
        if (!map2.has(key)) {
            results.removed.push(row);
        } else {
            const newRow = map2.get(key);
            const changes = findChanges(row, newRow);

            if (changes.length > 0) {
                results.modified.push({
                    old: row,
                    new: newRow,
                    changes: changes
                });
            } else {
                results.unchanged.push(row);
            }
        }
    });

    // Find added
    map2.forEach((row, key) => {
        if (!map1.has(key)) {
            results.added.push(row);
        }
    });

    comparisonResults = results;
    displayResults(results);
    updateStats(results);
}

// Find changes between two rows
function findChanges(oldRow, newRow) {
    const changes = [];
    const allKeys = new Set([...Object.keys(oldRow), ...Object.keys(newRow)]);

    allKeys.forEach(key => {
        if (oldRow[key] !== newRow[key]) {
            changes.push({
                column: key,
                oldValue: oldRow[key] || '',
                newValue: newRow[key] || ''
            });
        }
    });

    return changes;
}

// Update statistics display
function updateStats(results) {
    document.getElementById('addedCount').textContent = results.added.length;
    document.getElementById('removedCount').textContent = results.removed.length;
    document.getElementById('modifiedCount').textContent = results.modified.length;
    document.getElementById('unchangedCount').textContent = results.unchanged.length;
    document.getElementById('stats').style.display = 'flex';
}

// Display comparison results
function displayResults(results) {
    const container = document.getElementById('results');
    const showAdded = document.getElementById('showAdded').checked;
    const showRemoved = document.getElementById('showRemoved').checked;
    const showModified = document.getElementById('showModified').checked;
    const showUnchanged = document.getElementById('showUnchanged').checked;

    let html = '';

    const hasChanges = results.added.length > 0 || results.removed.length > 0 ||
                      results.modified.length > 0 || (showUnchanged && results.unchanged.length > 0);

    if (!hasChanges) {
        html = '<div class="no-changes">No changes found between the log files.</div>';
    } else {
        html = '<div style="overflow-x: auto; max-height: 600px; overflow-y: auto;"><table class="result-table"><thead><tr>';
        html += '<th>Status</th>';

        // Get all possible headers from both files
        const allHeaders = [...new Set([...file1Data.headers, ...file2Data.headers])];
        allHeaders.forEach(header => {
            html += `<th>${escapeHtml(header)}</th>`;
        });

        html += '</tr></thead><tbody>';

        // Display added rows
        if (showAdded) {
            results.added.forEach(row => {
                html += '<tr class="row-added">';
                html += '<td><span class="change-badge badge-added">Added</span></td>';
                allHeaders.forEach(header => {
                    html += `<td>${escapeHtml(row[header] || '')}</td>`;
                });
                html += '</tr>';
            });
        }

        // Display removed rows
        if (showRemoved) {
            results.removed.forEach(row => {
                html += '<tr class="row-removed">';
                html += '<td><span class="change-badge badge-removed">Removed</span></td>';
                allHeaders.forEach(header => {
                    html += `<td>${escapeHtml(row[header] || '')}</td>`;
                });
                html += '</tr>';
            });
        }

        // Display modified rows
        if (showModified) {
            results.modified.forEach(item => {
                html += '<tr class="row-modified">';
                html += '<td><span class="change-badge badge-modified">Modified</span></td>';
                allHeaders.forEach(header => {
                    const change = item.changes.find(c => c.column === header);
                    if (change) {
                        html += '<td><div class="cell-diff">';
                        html += `<span class="old-value">${escapeHtml(change.oldValue)}</span>`;
                        html += `<span class="new-value">${escapeHtml(change.newValue)}</span>`;
                        html += '</div></td>';
                    } else {
                        html += `<td>${escapeHtml(item.new[header] || '')}</td>`;
                    }
                });
                html += '</tr>';
            });
        }

        // Display unchanged rows
        if (showUnchanged) {
            results.unchanged.forEach(row => {
                html += '<tr>';
                html += '<td><span class="change-badge" style="background: var(--accent-color); color: white;">Unchanged</span></td>';
                allHeaders.forEach(header => {
                    html += `<td>${escapeHtml(row[header] || '')}</td>`;
                });
                html += '</tr>';
            });
        }

        html += '</tbody></table></div>';
    }

    container.innerHTML = html;
    container.style.display = 'block';
    document.getElementById('exportSection').style.display = hasChanges ? 'block' : 'none';
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Clear all data
function clearAll() {
    file1Data = null;
    file2Data = null;
    comparisonResults = null;

    document.getElementById('file1').value = '';
    document.getElementById('file2').value = '';
    document.getElementById('fileName1').textContent = '';
    document.getElementById('fileName2').textContent = '';
    document.getElementById('upload1').classList.remove('active');
    document.getElementById('upload2').classList.remove('active');
    document.getElementById('results').style.display = 'none';
    document.getElementById('stats').style.display = 'none';
    document.getElementById('exportSection').style.display = 'none';
    document.getElementById('compareBtn').disabled = true;

    // Clear paste areas
    document.getElementById('pasteText1').value = '';
    document.getElementById('pasteText2').value = '';
    document.getElementById('pasteArea1').style.display = 'none';
    document.getElementById('pasteArea2').style.display = 'none';

    // Reset key column selector
    document.getElementById('keyColumn').innerHTML = '<option value="auto">Auto-detect Key Column</option>';
}

// Export comparison results to CSV
function exportResults() {
    if (!comparisonResults) return;

    const allHeaders = [...new Set([...file1Data.headers, ...file2Data.headers])];
    let csv = 'Status,' + allHeaders.map(h => `"${h}"`).join(',') + ',Changes\n';

    // Add rows
    comparisonResults.added.forEach(row => {
        csv += 'Added,';
        allHeaders.forEach(header => {
            csv += `"${(row[header] || '').replace(/"/g, '""')}",`;
        });
        csv += '\n';
    });

    comparisonResults.removed.forEach(row => {
        csv += 'Removed,';
        allHeaders.forEach(header => {
            csv += `"${(row[header] || '').replace(/"/g, '""')}",`;
        });
        csv += '\n';
    });

    comparisonResults.modified.forEach(item => {
        csv += 'Modified,';
        allHeaders.forEach(header => {
            const change = item.changes.find(c => c.column === header);
            if (change) {
                csv += `"Old: ${change.oldValue.replace(/"/g, '""')} | New: ${change.newValue.replace(/"/g, '""')}",`;
            } else {
                csv += `"${(item.new[header] || '').replace(/"/g, '""')}",`;
            }
        });
        csv += `"${item.changes.map(c => c.column).join(', ')}"\n`;
    });

    // Create download link
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'log_comparison_results.csv';
    a.click();
    window.URL.revokeObjectURL(url);
}

// Auto-detect TSV (tab-separated) format
function detectDelimiter(text) {
    const firstLine = text.split('\n')[0];
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    return tabCount > commaCount ? '\t' : ',';
}

// Parse CSV/TSV content
function parseCSV(csv) {
    const delimiter = detectDelimiter(csv);
    const lines = csv.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
        throw new Error('No data found in file');
    }

    const headers = parseCSVLine(lines[0], delimiter);
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i], delimiter);
        if (values.length === headers.length) {
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index];
            });
            rows.push(row);
        }
    }

    return { headers, rows };
}

// Parse a single CSV/TSV line
function parseCSVLine(line, delimiter = ',') {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === delimiter && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    result.push(current.trim());
    return result;
}

// Show alert modal (using global function from base.html if available)
function showAlert(title, message) {
    if (typeof showAlertModal === 'function') {
        showAlertModal(title, message);
    } else {
        alert(message);
    }
}
