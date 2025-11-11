// AWS Log Comparison Tool JavaScript - Enhanced with Intelligence

let file1Data = null;
let file2Data = null;
let comparisonResults = null;
let keyColumnIndex = null;
let intelligentInsights = null;

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

// Enhanced intelligent key column detection with scoring algorithm
function detectKeyColumn(headers, rows) {
    if (rows.length === 0) return 0;

    // Score each column based on multiple criteria
    const columnScores = headers.map((header, index) => {
        let score = 0;

        // 1. Check for common key column name patterns (high priority)
        const keyPatterns = [
            /^id$/i, /^.*id$/i, /^request.*id$/i, /^message.*id$/i,
            /^transaction.*id$/i, /^.*key$/i, /^.*identifier$/i,
            /^.*uuid$/i, /^.*guid$/i
        ];

        for (let pattern of keyPatterns) {
            if (pattern.test(header)) {
                score += 100;
                break;
            }
        }

        // 2. Calculate uniqueness ratio
        const values = rows.map(row => row[header]);
        const uniqueValues = new Set(values.filter(v => v !== null && v !== undefined && v !== ''));
        const uniquenessRatio = uniqueValues.size / values.length;

        // Perfect uniqueness gets high score
        if (uniquenessRatio === 1.0) {
            score += 80;
        } else if (uniquenessRatio > 0.9) {
            score += 60;
        } else if (uniquenessRatio > 0.7) {
            score += 30;
        }

        // 3. Check for sequential numbers (likely an ID)
        const numericValues = values.filter(v => !isNaN(v) && v !== '').map(Number);
        if (numericValues.length > values.length * 0.8) {
            const isSequential = numericValues.length > 2 &&
                               numericValues.every((val, i, arr) => i === 0 || val > arr[i-1]);
            if (isSequential) score += 40;
        }

        // 4. Penalize columns with many nulls/empty values
        const nullCount = values.filter(v => v === null || v === undefined || v === '').length;
        const nullRatio = nullCount / values.length;
        score -= (nullRatio * 50);

        // 5. Check data format patterns (UUIDs, timestamps, etc.)
        const sampleValue = values.find(v => v !== null && v !== undefined && v !== '');
        if (sampleValue) {
            // UUID pattern
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sampleValue)) {
                score += 60;
            }
            // Timestamp pattern
            if (/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}/.test(sampleValue)) {
                score += 30;
            }
        }

        return { index, header, score, uniquenessRatio };
    });

    // Sort by score and return best match
    columnScores.sort((a, b) => b.score - a.score);

    console.log('Key column detection scores:', columnScores);

    return columnScores[0].index;
}

// Calculate similarity between two strings (Levenshtein distance-based)
function calculateStringSimilarity(str1, str2) {
    if (str1 === str2) return 1.0;
    if (!str1 || !str2) return 0.0;

    str1 = String(str1).toLowerCase();
    str2 = String(str2).toLowerCase();

    const len1 = str1.length;
    const len2 = str2.length;
    const maxLen = Math.max(len1, len2);

    if (maxLen === 0) return 1.0;

    // Levenshtein distance
    const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));

    for (let i = 0; i <= len1; i++) matrix[0][i] = i;
    for (let j = 0; j <= len2; j++) matrix[j][0] = j;

    for (let j = 1; j <= len2; j++) {
        for (let i = 1; i <= len1; i++) {
            const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1,
                matrix[j - 1][i] + 1,
                matrix[j - 1][i - 1] + indicator
            );
        }
    }

    const distance = matrix[len2][len1];
    return 1 - (distance / maxLen);
}

// Calculate row similarity score (for fuzzy matching)
function calculateRowSimilarity(row1, row2, headers) {
    let totalSimilarity = 0;
    let comparedFields = 0;

    for (let header of headers) {
        const val1 = row1[header];
        const val2 = row2[header];

        if (val1 !== undefined && val2 !== undefined) {
            totalSimilarity += calculateStringSimilarity(val1, val2);
            comparedFields++;
        }
    }

    return comparedFields > 0 ? totalSimilarity / comparedFields : 0;
}

// Enhanced compare logs with fuzzy matching and intelligent analysis
function compareLogs() {
    const keyColValue = document.getElementById('keyColumn').value;
    const useFuzzyMatching = document.getElementById('useFuzzyMatching')?.checked || false;
    const fuzzyThreshold = 0.85; // 85% similarity threshold

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
        unchanged: [],
        fuzzyMatched: []
    };

    const allHeaders = [...new Set([...file1Data.headers, ...file2Data.headers])];

    // Track which rows from map2 have been matched
    const matched2 = new Set();

    // Find removed and modified/unchanged
    map1.forEach((row, key) => {
        if (!map2.has(key)) {
            // Try fuzzy matching if enabled
            if (useFuzzyMatching) {
                let bestMatch = null;
                let bestSimilarity = 0;

                map2.forEach((candidateRow, candidateKey) => {
                    if (!matched2.has(candidateKey)) {
                        const similarity = calculateRowSimilarity(row, candidateRow, allHeaders);
                        if (similarity >= fuzzyThreshold && similarity > bestSimilarity) {
                            bestMatch = candidateRow;
                            bestSimilarity = similarity;
                        }
                    }
                });

                if (bestMatch) {
                    // Found a fuzzy match
                    const changes = findChanges(row, bestMatch);
                    results.fuzzyMatched.push({
                        old: row,
                        new: bestMatch,
                        changes: changes,
                        similarity: bestSimilarity
                    });
                    matched2.add(JSON.stringify(bestMatch));
                } else {
                    results.removed.push(row);
                }
            } else {
                results.removed.push(row);
            }
        } else {
            const newRow = map2.get(key);
            matched2.add(key);
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

    // Find added (not matched in map2)
    map2.forEach((row, key) => {
        if (!matched2.has(key)) {
            results.added.push(row);
        }
    });

    comparisonResults = results;

    // Generate intelligent insights
    intelligentInsights = generateIntelligentInsights(results, file1Data, file2Data);

    displayResults(results);
    updateStats(results);
    displayInsights(intelligentInsights);
}

// Find changes between two rows with semantic awareness
function findChanges(oldRow, newRow) {
    const changes = [];
    const allKeys = new Set([...Object.keys(oldRow), ...Object.keys(newRow)]);

    allKeys.forEach(key => {
        const oldVal = oldRow[key];
        const newVal = newRow[key];

        // Normalize values for comparison (trim whitespace, handle nulls)
        const normalizedOld = (oldVal || '').toString().trim();
        const normalizedNew = (newVal || '').toString().trim();

        if (normalizedOld !== normalizedNew) {
            // Calculate change type
            let changeType = 'modified';
            let changeDetail = '';

            // Numeric change detection
            if (!isNaN(oldVal) && !isNaN(newVal) && oldVal !== '' && newVal !== '') {
                const numOld = parseFloat(oldVal);
                const numNew = parseFloat(newVal);
                const diff = numNew - numOld;
                const percentChange = numOld !== 0 ? ((diff / numOld) * 100).toFixed(2) : 'N/A';

                if (diff > 0) {
                    changeType = 'increased';
                    changeDetail = `+${diff} (+${percentChange}%)`;
                } else if (diff < 0) {
                    changeType = 'decreased';
                    changeDetail = `${diff} (${percentChange}%)`;
                }
            }

            // Date/timestamp change detection
            const dateOld = new Date(oldVal);
            const dateNew = new Date(newVal);
            if (!isNaN(dateOld) && !isNaN(dateNew)) {
                const timeDiff = dateNew - dateOld;
                const hoursDiff = (timeDiff / (1000 * 60 * 60)).toFixed(2);
                if (Math.abs(hoursDiff) > 0.1) {
                    changeType = 'time_shifted';
                    changeDetail = `${hoursDiff > 0 ? '+' : ''}${hoursDiff} hours`;
                }
            }

            changes.push({
                column: key,
                oldValue: oldVal || '',
                newValue: newVal || '',
                changeType: changeType,
                changeDetail: changeDetail
            });
        }
    });

    return changes;
}

// Generate intelligent insights from comparison results
function generateIntelligentInsights(results, file1Data, file2Data) {
    const insights = {
        summary: '',
        patterns: [],
        dataQuality: [],
        recommendations: [],
        statistics: {}
    };

    const totalRows = file1Data.rows.length;
    const changePercentage = ((results.added.length + results.removed.length + results.modified.length) / totalRows * 100).toFixed(1);

    // Summary
    insights.summary = `Compared ${totalRows} records. ${changePercentage}% of data changed.`;

    // Pattern detection
    detectPatterns(results, insights);

    // Data quality analysis
    analyzeDataQuality(file1Data, file2Data, insights);

    // Generate recommendations
    generateRecommendations(results, insights);

    // Statistics
    insights.statistics = {
        totalRecords: totalRows,
        changePercentage: changePercentage,
        addedCount: results.added.length,
        removedCount: results.removed.length,
        modifiedCount: results.modified.length,
        unchangedCount: results.unchanged.length,
        fuzzyMatchedCount: results.fuzzyMatched?.length || 0
    };

    return insights;
}

// Detect patterns in changes
function detectPatterns(results, insights) {
    const allModified = [...results.modified, ...(results.fuzzyMatched || [])];

    if (allModified.length === 0) return;

    // Track which columns change frequently
    const columnChangeFrequency = {};
    const columnChangeTypes = {};

    allModified.forEach(item => {
        item.changes.forEach(change => {
            // Count frequency
            columnChangeFrequency[change.column] = (columnChangeFrequency[change.column] || 0) + 1;

            // Track change types
            if (!columnChangeTypes[change.column]) {
                columnChangeTypes[change.column] = [];
            }
            columnChangeTypes[change.column].push(change.changeType || 'modified');
        });
    });

    // Identify columns with consistent change patterns
    Object.keys(columnChangeTypes).forEach(column => {
        const types = columnChangeTypes[column];
        const frequency = columnChangeFrequency[column];
        const changeRate = ((frequency / allModified.length) * 100).toFixed(1);

        if (changeRate > 50) {
            // More than 50% of modified records have this column changed
            const uniqueTypes = [...new Set(types)];

            if (uniqueTypes.length === 1 && uniqueTypes[0] !== 'modified') {
                insights.patterns.push({
                    type: 'consistent_pattern',
                    description: `Column "${column}" consistently ${uniqueTypes[0]} across ${changeRate}% of modified records`,
                    severity: 'info'
                });
            } else if (changeRate > 80) {
                insights.patterns.push({
                    type: 'frequent_change',
                    description: `Column "${column}" changed in ${changeRate}% of modified records`,
                    severity: 'warning'
                });
            }
        }
    });

    // Detect bulk operations
    if (results.added.length > allModified.length * 2) {
        insights.patterns.push({
            type: 'bulk_insert',
            description: `Large number of records added (${results.added.length}) - possible bulk insert operation`,
            severity: 'info'
        });
    }

    if (results.removed.length > allModified.length * 2) {
        insights.patterns.push({
            type: 'bulk_delete',
            description: `Large number of records removed (${results.removed.length}) - possible bulk delete operation`,
            severity: 'warning'
        });
    }

    // Detect field renaming
    const headers1 = new Set(file1Data.headers);
    const headers2 = new Set(file2Data.headers);
    const removedHeaders = [...headers1].filter(h => !headers2.has(h));
    const addedHeaders = [...headers2].filter(h => !headers1.has(h));

    if (removedHeaders.length > 0 || addedHeaders.length > 0) {
        const possibleRenames = [];
        removedHeaders.forEach(oldHeader => {
            addedHeaders.forEach(newHeader => {
                const similarity = calculateStringSimilarity(oldHeader, newHeader);
                if (similarity > 0.7) {
                    possibleRenames.push(`"${oldHeader}" → "${newHeader}" (${(similarity * 100).toFixed(0)}% similar)`);
                }
            });
        });

        if (possibleRenames.length > 0) {
            insights.patterns.push({
                type: 'field_rename',
                description: `Possible field rename detected: ${possibleRenames.join(', ')}`,
                severity: 'info'
            });
        }
    }
}

// Analyze data quality
function analyzeDataQuality(file1Data, file2Data, insights) {
    // Check for duplicates in key column
    const keyColumn = file1Data.headers[keyColumnIndex];

    function checkDuplicates(data, label) {
        const keyValues = data.rows.map(row => row[keyColumn]);
        const uniqueKeys = new Set(keyValues);

        if (keyValues.length !== uniqueKeys.size) {
            const duplicateCount = keyValues.length - uniqueKeys.size;
            insights.dataQuality.push({
                type: 'duplicates',
                description: `Found ${duplicateCount} duplicate key values in ${label}`,
                severity: 'error'
            });
        }
    }

    checkDuplicates(file1Data, 'original data');
    checkDuplicates(file2Data, 'new data');

    // Check for null/empty values
    function checkNullValues(data, label) {
        const nullCounts = {};
        data.headers.forEach(header => {
            const nullCount = data.rows.filter(row =>
                row[header] === null || row[header] === undefined || row[header] === ''
            ).length;

            if (nullCount > data.rows.length * 0.1) { // More than 10% null
                nullCounts[header] = ((nullCount / data.rows.length) * 100).toFixed(1);
            }
        });

        if (Object.keys(nullCounts).length > 0) {
            const details = Object.entries(nullCounts)
                .map(([col, pct]) => `${col} (${pct}%)`)
                .join(', ');
            insights.dataQuality.push({
                type: 'null_values',
                description: `High null/empty rates in ${label}: ${details}`,
                severity: 'warning'
            });
        }
    }

    checkNullValues(file1Data, 'original data');
    checkNullValues(file2Data, 'new data');

    // Data type consistency check
    file1Data.headers.forEach(header => {
        if (file2Data.headers.includes(header)) {
            const types1 = new Set();
            const types2 = new Set();

            file1Data.rows.slice(0, 100).forEach(row => {
                if (row[header]) types1.add(typeof row[header]);
            });

            file2Data.rows.slice(0, 100).forEach(row => {
                if (row[header]) types2.add(typeof row[header]);
            });

            if (types1.size === 1 && types2.size === 1 && [...types1][0] !== [...types2][0]) {
                insights.dataQuality.push({
                    type: 'type_mismatch',
                    description: `Data type changed for column "${header}": ${[...types1][0]} → ${[...types2][0]}`,
                    severity: 'warning'
                });
            }
        }
    });
}

// Generate recommendations
function generateRecommendations(results, insights) {
    const allModified = [...results.modified, ...(results.fuzzyMatched || [])];

    // Recommendation based on change volume
    if (results.added.length > results.removed.length * 2) {
        insights.recommendations.push({
            type: 'data_growth',
            message: 'Significant data growth detected. Consider reviewing storage and indexing strategies.',
            action: 'Review database capacity planning'
        });
    }

    if (results.removed.length > results.added.length * 2) {
        insights.recommendations.push({
            type: 'data_reduction',
            message: 'Significant data reduction detected. Verify this is intentional.',
            action: 'Confirm data retention policies'
        });
    }

    // Recommendation based on patterns
    if (insights.patterns.some(p => p.type === 'field_rename')) {
        insights.recommendations.push({
            type: 'schema_change',
            message: 'Schema changes detected. Update documentation and client code.',
            action: 'Document schema changes and notify dependent systems'
        });
    }

    // Recommendation based on data quality
    if (insights.dataQuality.some(d => d.severity === 'error')) {
        insights.recommendations.push({
            type: 'data_quality',
            message: 'Critical data quality issues found. Address before deployment.',
            action: 'Run data validation and cleanup processes'
        });
    }

    // Fuzzy matching recommendation
    if ((results.fuzzyMatched?.length || 0) > 0) {
        insights.recommendations.push({
            type: 'fuzzy_matches',
            message: `${results.fuzzyMatched.length} records matched using fuzzy matching. Review for accuracy.`,
            action: 'Verify fuzzy-matched records manually'
        });
    }
}

// Display intelligent insights
function displayInsights(insights) {
    const insightsContainer = document.getElementById('insights');
    if (!insightsContainer) return;

    let html = '<div class="insights-panel">';

    // Summary
    html += `<div class="insight-section summary">
        <h3>📊 Summary</h3>
        <p>${insights.summary}</p>
    </div>`;

    // Patterns
    if (insights.patterns.length > 0) {
        html += '<div class="insight-section patterns">';
        html += '<h3>🔍 Detected Patterns</h3><ul>';
        insights.patterns.forEach(pattern => {
            const icon = pattern.severity === 'warning' ? '⚠️' : pattern.severity === 'error' ? '❌' : 'ℹ️';
            html += `<li class="insight-item ${pattern.severity}">${icon} ${escapeHtml(pattern.description)}</li>`;
        });
        html += '</ul></div>';
    }

    // Data Quality
    if (insights.dataQuality.length > 0) {
        html += '<div class="insight-section data-quality">';
        html += '<h3>🏥 Data Quality</h3><ul>';
        insights.dataQuality.forEach(quality => {
            const icon = quality.severity === 'warning' ? '⚠️' : quality.severity === 'error' ? '❌' : 'ℹ️';
            html += `<li class="insight-item ${quality.severity}">${icon} ${escapeHtml(quality.description)}</li>`;
        });
        html += '</ul></div>';
    }

    // Recommendations
    if (insights.recommendations.length > 0) {
        html += '<div class="insight-section recommendations">';
        html += '<h3>💡 Recommendations</h3><ul>';
        insights.recommendations.forEach(rec => {
            html += `<li class="insight-item recommendation">
                <strong>${escapeHtml(rec.message)}</strong><br>
                <small>Action: ${escapeHtml(rec.action)}</small>
            </li>`;
        });
        html += '</ul></div>';
    }

    html += '</div>';

    insightsContainer.innerHTML = html;
    insightsContainer.style.display = 'block';
}

// Update statistics display
function updateStats(results) {
    document.getElementById('addedCount').textContent = results.added.length;
    document.getElementById('removedCount').textContent = results.removed.length;
    document.getElementById('modifiedCount').textContent = results.modified.length + (results.fuzzyMatched?.length || 0);
    document.getElementById('unchangedCount').textContent = results.unchanged.length;
    document.getElementById('stats').style.display = 'flex';
}

// Display comparison results with enhanced visualization
function displayResults(results) {
    const container = document.getElementById('results');
    const showAdded = document.getElementById('showAdded').checked;
    const showRemoved = document.getElementById('showRemoved').checked;
    const showModified = document.getElementById('showModified').checked;
    const showUnchanged = document.getElementById('showUnchanged').checked;

    let html = '';

    const hasFuzzyMatches = results.fuzzyMatched && results.fuzzyMatched.length > 0;
    const hasChanges = results.added.length > 0 || results.removed.length > 0 ||
                      results.modified.length > 0 || hasFuzzyMatches ||
                      (showUnchanged && results.unchanged.length > 0);

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
                html += '<td><span class="change-badge badge-added">➕ Added</span></td>';
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
                html += '<td><span class="change-badge badge-removed">➖ Removed</span></td>';
                allHeaders.forEach(header => {
                    html += `<td>${escapeHtml(row[header] || '')}</td>`;
                });
                html += '</tr>';
            });
        }

        // Display modified rows with enhanced change details
        if (showModified) {
            results.modified.forEach(item => {
                html += '<tr class="row-modified">';
                html += '<td><span class="change-badge badge-modified">✏️ Modified</span></td>';
                allHeaders.forEach(header => {
                    const change = item.changes.find(c => c.column === header);
                    if (change) {
                        html += '<td><div class="cell-diff">';
                        html += `<span class="old-value">❌ ${escapeHtml(change.oldValue)}</span>`;
                        html += `<span class="new-value">✅ ${escapeHtml(change.newValue)}</span>`;

                        // Show change detail if available (e.g., +10%, +5 hours)
                        if (change.changeDetail) {
                            html += `<span class="change-detail">${escapeHtml(change.changeDetail)}</span>`;
                        }
                        html += '</div></td>';
                    } else {
                        html += `<td>${escapeHtml(item.new[header] || '')}</td>`;
                    }
                });
                html += '</tr>';
            });

            // Display fuzzy matched rows
            if (hasFuzzyMatches) {
                results.fuzzyMatched.forEach(item => {
                    html += '<tr class="row-fuzzy">';
                    html += `<td><span class="change-badge badge-fuzzy">🔍 Fuzzy Match (${(item.similarity * 100).toFixed(0)}%)</span></td>`;
                    allHeaders.forEach(header => {
                        const change = item.changes.find(c => c.column === header);
                        if (change) {
                            html += '<td><div class="cell-diff">';
                            html += `<span class="old-value">❌ ${escapeHtml(change.oldValue)}</span>`;
                            html += `<span class="new-value">✅ ${escapeHtml(change.newValue)}</span>`;
                            if (change.changeDetail) {
                                html += `<span class="change-detail">${escapeHtml(change.changeDetail)}</span>`;
                            }
                            html += '</div></td>';
                        } else {
                            html += `<td>${escapeHtml(item.new[header] || '')}</td>`;
                        }
                    });
                    html += '</tr>';
                });
            }
        }

        // Display unchanged rows
        if (showUnchanged) {
            results.unchanged.forEach(row => {
                html += '<tr>';
                html += '<td><span class="change-badge badge-unchanged">⚪ Unchanged</span></td>';
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
