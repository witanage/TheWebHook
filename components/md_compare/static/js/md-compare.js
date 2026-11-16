let currentComparisonId = null;
let currentComparisonName = null;

// Markdown comparison: line-level LCS diff with word-level highlighting for changed lines.

const CONTEXT_LINES = 3;

function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

function normalize(line, ignoreWs, ignoreCase) {
    if (ignoreWs) line = line.replace(/\s+/g, ' ').trim();
    if (ignoreCase) line = line.toLowerCase();
    return line;
}

// Generic LCS diff over arrays of comparable keys. Returns ops: {type:'eq'|'del'|'add', i, j}
function diffSeq(a, b) {
    const n = a.length, m = b.length;
    const w = m + 1;
    const dp = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i * w + j] = a[i] === b[j]
                ? dp[(i + 1) * w + j + 1] + 1
                : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
        }
    }
    const ops = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) { ops.push({ type: 'eq', i, j }); i++; j++; }
        else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) { ops.push({ type: 'del', i }); i++; }
        else { ops.push({ type: 'add', j }); j++; }
    }
    while (i < n) ops.push({ type: 'del', i: i++ });
    while (j < m) ops.push({ type: 'add', j: j++ });
    return ops;
}

// Word-level diff of two strings -> [leftHtml, rightHtml]
function wordDiff(l, r) {
    const tok = s => s.match(/\s+|[^\s]+/g) || [];
    const a = tok(l), b = tok(r);
    if (a.length * b.length > 250000) return [escapeHtml(l), escapeHtml(r)];
    let left = '', right = '';
    for (const op of diffSeq(a, b)) {
        if (op.type === 'eq') { left += escapeHtml(a[op.i]); right += escapeHtml(b[op.j]); }
        else if (op.type === 'del') left += `<mark class="w-del">${escapeHtml(a[op.i])}</mark>`;
        else right += `<mark class="w-add">${escapeHtml(b[op.j])}</mark>`;
    }
    return [left, right];
}

function buildRows(lines1, lines2, ignoreWs, ignoreCase) {
    const k1 = lines1.map(l => normalize(l, ignoreWs, ignoreCase));
    const k2 = lines2.map(l => normalize(l, ignoreWs, ignoreCase));
    const ops = diffSeq(k1, k2);
    const rows = [];
    let p = 0;
    while (p < ops.length) {
        if (ops[p].type === 'eq') {
            rows.push({ kind: 'eq', l: ops[p].i, r: ops[p].j });
            p++;
            continue;
        }
        // Collect a run of del/add and pair them up as "changed"
        const dels = [], adds = [];
        while (p < ops.length && ops[p].type !== 'eq') {
            (ops[p].type === 'del' ? dels : adds).push(ops[p]);
            p++;
        }
        const pairs = Math.min(dels.length, adds.length);
        for (let q = 0; q < pairs; q++) rows.push({ kind: 'chg', l: dels[q].i, r: adds[q].j });
        for (let q = pairs; q < dels.length; q++) rows.push({ kind: 'del', l: dels[q].i });
        for (let q = pairs; q < adds.length; q++) rows.push({ kind: 'add', r: adds[q].j });
    }
    return rows;
}

function renderRow(row, lines1, lines2) {
    const num = v => v === undefined ? '' : v + 1;
    let lc = '', rc = '', lcls = '', rcls = '';
    if (row.kind === 'eq') {
        lc = escapeHtml(lines1[row.l]); rc = escapeHtml(lines2[row.r]);
    } else if (row.kind === 'del') {
        lc = escapeHtml(lines1[row.l]); lcls = 'cell-removed'; rcls = 'cell-empty';
    } else if (row.kind === 'add') {
        rc = escapeHtml(lines2[row.r]); rcls = 'cell-added'; lcls = 'cell-empty';
    } else {
        [lc, rc] = wordDiff(lines1[row.l], lines2[row.r]);
        lcls = 'cell-changed-l'; rcls = 'cell-changed-r';
    }
    return `<div class="diff-row"><div class="ln">${num(row.l)}</div><div class="${lcls}">${lc}</div>` +
           `<div class="ln">${num(row.r)}</div><div class="${rcls}">${rc}</div></div>`;
}

function compareMD() {
    const t1 = document.getElementById('md1').value;
    const t2 = document.getElementById('md2').value;
    if (!t1 && !t2) {
        showToast('Both fields are empty', 'error');
        return;
    }
    const ignoreWs = document.getElementById('optIgnoreWs').checked;
    const ignoreCase = document.getElementById('optIgnoreCase').checked;
    const onlyDiff = document.getElementById('optOnlyDiff').checked;

    const lines1 = t1 === '' ? [] : t1.split(/\r?\n/);
    const lines2 = t2 === '' ? [] : t2.split(/\r?\n/);
    if (lines1.length * lines2.length > 25000000) {
        showToast('Files are too large to compare in the browser', 'error');
        return;
    }

    const rows = buildRows(lines1, lines2, ignoreWs, ignoreCase);
    const count = k => rows.filter(r => r.kind === k).length;
    const added = count('add'), removed = count('del'), changed = count('chg');
    document.getElementById('addedCount').textContent = added;
    document.getElementById('removedCount').textContent = removed;
    document.getElementById('changedCount').textContent = changed;

    // Decide which rows are visible
    const visible = rows.map(() => !onlyDiff);
    if (onlyDiff) {
        rows.forEach((r, idx) => {
            if (r.kind === 'eq') return;
            for (let d = -CONTEXT_LINES; d <= CONTEXT_LINES; d++) {
                if (visible[idx + d] === false) visible[idx + d] = true;
            }
        });
    }

    let html = '';
    let hidden = 0;
    const flushGap = () => {
        if (hidden) html += `<div class="diff-gap">… ${hidden} unchanged line${hidden > 1 ? 's' : ''} hidden …</div>`;
        hidden = 0;
    };
    rows.forEach((row, idx) => {
        if (visible[idx]) { flushGap(); html += renderRow(row, lines1, lines2); }
        else hidden++;
    });
    flushGap();

    const identical = added + removed + changed === 0;
    document.getElementById('identicalMsg').style.display = identical ? 'block' : 'none';
    document.getElementById('diffContainer').innerHTML = identical ? '' : html;
    document.getElementById('results').style.display = 'block';
    document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
}

function loadFile(event, targetId) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { document.getElementById(targetId).value = reader.result; };
    reader.onerror = () => showToast('Failed to read file', 'error');
    reader.readAsText(file);
    event.target.value = '';
}

function swapSides() {
    const a = document.getElementById('md1'), b = document.getElementById('md2');
    [a.value, b.value] = [b.value, a.value];
    if (document.getElementById('results').style.display !== 'none') compareMD();
}

function clearAll() {
    clearCurrentComparison();
    document.getElementById('md1').value = '';
    document.getElementById('md2').value = '';
    document.getElementById('results').style.display = 'none';
}

function loadSample() {
    document.getElementById('md1').value =
`# Project Title

A short description of the project.

## Installation

1. Clone the repo
2. Run \`npm install\`

## Usage

Run the app with \`npm start\`.
`;
    document.getElementById('md2').value =
`# Project Title

A short description of the project and its goals.

## Installation

1. Clone the repository
2. Run \`npm install\`
3. Copy \`.env.example\` to \`.env\`

## Usage

Run the app with \`npm start\`.

## License

MIT
`;
    compareMD();
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
    const md1 = document.getElementById('md1').value;
    const md2 = document.getElementById('md2').value;

    if (!md1 && !md2) {
        showModal('Error', 'Nothing to save - both Markdown fields are empty.');
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

    const md1 = document.getElementById('md1').value;
    const md2 = document.getElementById('md2').value;

    const payload = {
        comparison_name: comparisonName,
        md1: md1,
        md2: md2
    };

    if (currentComparisonId) {
        payload.comparison_id = currentComparisonId;
    }

    fetch('/api/md-compare/save', {
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

    fetch('/api/md-compare/list')
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
    fetch('/api/md-compare/load?comparison_id=' + comparisonId)
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const comp = data.data;
            document.getElementById('md1').value = comp.md1 || '';
            document.getElementById('md2').value = comp.md2 || '';

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
            fetch('/api/md-compare/delete/' + comparisonId, {
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

