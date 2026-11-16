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
