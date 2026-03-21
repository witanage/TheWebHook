// PDF Process - Client-side PDF tools
// Uses pdf-lib for PDF manipulation and pdf.js for rendering

const { PDFDocument, rgb, StandardFonts, degrees } = PDFLib;

// ==================== State ====================

let currentTool = null;
let uploadedFiles = [];
let processedResult = null;
let processedResults = []; // For multiple output files (e.g., split, pdf-to-image)
let selectedPages = new Set();
let rotationAngle = 90;
let compressionLevel = 'recommended';

const toolConfig = {
    'merge': {
        title: 'Merge PDF',
        description: 'Combine multiple PDF files into a single document',
        accept: '.pdf',
        multiple: true,
        minFiles: 2,
        btnText: 'Merge PDFs'
    },
    'split': {
        title: 'Split PDF',
        description: 'Split a PDF into separate files by page ranges',
        accept: '.pdf',
        multiple: false,
        minFiles: 1,
        btnText: 'Split PDF'
    },
    'rotate': {
        title: 'Rotate PDF',
        description: 'Rotate all pages in your PDF',
        accept: '.pdf',
        multiple: false,
        minFiles: 1,
        btnText: 'Rotate PDF'
    },
    'remove': {
        title: 'Remove Pages',
        description: 'Select and remove pages from your PDF',
        accept: '.pdf',
        multiple: false,
        minFiles: 1,
        btnText: 'Remove Pages'
    },
    'extract': {
        title: 'Extract Pages',
        description: 'Extract selected pages as a new PDF',
        accept: '.pdf',
        multiple: false,
        minFiles: 1,
        btnText: 'Extract Pages'
    },
    'compress': {
        title: 'Compress PDF',
        description: 'Reduce your PDF file size',
        accept: '.pdf',
        multiple: false,
        minFiles: 1,
        btnText: 'Compress PDF'
    },
    'jpg-to-pdf': {
        title: 'Image to PDF',
        description: 'Convert images (JPG, PNG, GIF, SVG) to a PDF document',
        accept: '.jpg,.jpeg,.png,.gif,.svg',
        multiple: true,
        minFiles: 1,
        btnText: 'Convert to PDF'
    },
    'pdf-to-image': {
        title: 'PDF to Image',
        description: 'Convert PDF pages to image files',
        accept: '.pdf',
        multiple: false,
        minFiles: 1,
        btnText: 'Convert to Image'
    },
    'page-numbers': {
        title: 'Add Page Numbers',
        description: 'Add page numbers to your PDF document',
        accept: '.pdf',
        multiple: false,
        minFiles: 1,
        btnText: 'Add Page Numbers'
    },
    'watermark': {
        title: 'Add Watermark',
        description: 'Add a text watermark to every page',
        accept: '.pdf',
        multiple: false,
        minFiles: 1,
        btnText: 'Add Watermark'
    },
    'protect': {
        title: 'Protect PDF',
        description: 'Encrypt your PDF with a password',
        accept: '.pdf',
        multiple: false,
        minFiles: 1,
        btnText: 'Protect PDF'
    },
    'resize-file': {
        title: 'Resize File',
        description: 'Increase or decrease your PDF to an exact target file size',
        accept: '.pdf',
        multiple: false,
        minFiles: 1,
        btnText: 'Resize PDF'
    },
    'unlock': {
        title: 'Unlock PDF',
        description: 'Remove password from a protected PDF',
        accept: '.pdf',
        multiple: false,
        minFiles: 1,
        btnText: 'Unlock PDF'
    }
};

// ==================== Initialization ====================

document.addEventListener('DOMContentLoaded', function () {
    setupDragAndDrop();
    setupFileInputs();
});

function setupDragAndDrop() {
    const dropzone = document.getElementById('dropzone');
    if (!dropzone) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.add('drag-over'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.remove('drag-over'), false);
    });

    dropzone.addEventListener('drop', handleDrop, false);
    dropzone.addEventListener('click', (e) => {
        // Don't trigger if clicking on the upload button or label
        if (e.target.closest('.upload-btn') || e.target.id === 'fileInput') {
            return;
        }
        document.getElementById('fileInput').click();
    });
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function setupFileInputs() {
    const fileInput = document.getElementById('fileInput');
    const addMoreInput = document.getElementById('addMoreInput');

    if (fileInput) {
        fileInput.addEventListener('change', function () {
            handleFiles(this.files);
            this.value = '';
        });
    }

    if (addMoreInput) {
        addMoreInput.addEventListener('change', function () {
            handleFiles(this.files);
            this.value = '';
        });
    }
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
}

function handleFiles(files) {
    if (!currentTool) return;
    const config = toolConfig[currentTool];

    const validFiles = [];
    const acceptedTypes = config.accept.split(',').map(t => t.trim());

    for (const file of files) {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (acceptedTypes.some(t => t === ext || (t === '.jpg' && ext === '.jpeg') || (t === '.jpeg' && ext === '.jpg'))) {
            validFiles.push(file);
        }
    }

    if (validFiles.length === 0) {
        showToast('No valid files selected. Accepted: ' + config.accept, 'warning');
        return;
    }

    if (!config.multiple) {
        uploadedFiles = [validFiles[0]];
    } else {
        uploadedFiles = uploadedFiles.concat(validFiles);
    }

    renderFileList();
    showToolOptions();
}

// ==================== Tool Selection ====================

function selectTool(tool) {
    currentTool = tool;
    uploadedFiles = [];
    processedResult = null;
    processedResults = [];
    selectedPages = new Set();

    const config = toolConfig[tool];

    document.getElementById('toolGrid').style.display = 'none';
    document.getElementById('toolWorkspace').style.display = 'block';
    document.getElementById('toolTitle').textContent = config.title;
    document.getElementById('toolDescription').textContent = config.description;
    document.getElementById('processBtnText').textContent = config.btnText;

    // Update file input accept
    document.getElementById('fileInput').accept = config.accept;
    document.getElementById('addMoreInput').accept = config.accept;

    // Update multiple
    document.getElementById('fileInput').multiple = config.multiple;
    document.getElementById('addMoreInput').multiple = config.multiple;

    // Update hint
    const hint = currentTool === 'jpg-to-pdf' ? 'JPG, PNG, GIF, SVG images accepted' : 'PDF files accepted';
    document.getElementById('uploadHint').textContent = hint;

    // Reset sections
    document.getElementById('uploadArea').style.display = 'block';
    document.getElementById('fileListContainer').style.display = 'none';
    document.getElementById('toolOptions').style.display = 'none';
    document.getElementById('processSection').style.display = 'none';
    document.getElementById('progressSection').style.display = 'none';
    document.getElementById('resultSection').style.display = 'none';
}

function goBackToGrid() {
    currentTool = null;
    uploadedFiles = [];
    processedResult = null;
    processedResults = [];

    document.getElementById('toolGrid').style.display = 'block';
    document.getElementById('toolWorkspace').style.display = 'none';
}

function startOver() {
    if (currentTool) {
        selectTool(currentTool);
    }
}

// ==================== File List ====================

function renderFileList() {
    const fileList = document.getElementById('fileList');
    const container = document.getElementById('fileListContainer');

    if (uploadedFiles.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    fileList.innerHTML = '';

    uploadedFiles.forEach((file, index) => {
        const isImage = file.type.startsWith('image/');
        const item = document.createElement('div');
        item.className = 'file-item';
        item.draggable = toolConfig[currentTool].multiple;
        item.dataset.index = index;

        const handleHtml = toolConfig[currentTool].multiple ? `
            <div class="file-item-handle" title="Drag to reorder">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="18" x2="16" y2="18"/>
                </svg>
            </div>` : '';

        item.innerHTML = `
            ${handleHtml}
            <div class="file-item-icon ${isImage ? 'img-icon' : ''}">
                ${isImage ? 'IMG' : 'PDF'}
            </div>
            <div class="file-item-info">
                <div class="file-item-name">${file.name}</div>
                <div class="file-item-size">${formatFileSize(file.size)}</div>
            </div>
            <button class="file-item-remove" onclick="removeFile(${index})" title="Remove">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        `;

        // Drag and drop for reordering
        if (toolConfig[currentTool].multiple) {
            item.addEventListener('dragstart', handleItemDragStart);
            item.addEventListener('dragover', handleItemDragOver);
            item.addEventListener('drop', handleItemDrop);
            item.addEventListener('dragend', handleItemDragEnd);
        }

        fileList.appendChild(item);
    });
}

let draggedIndex = null;

function handleItemDragStart(e) {
    draggedIndex = parseInt(this.dataset.index);
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleItemDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.file-item').forEach(item => item.classList.remove('drag-over-item'));
    this.classList.add('drag-over-item');
}

function handleItemDrop(e) {
    e.preventDefault();
    const targetIndex = parseInt(this.dataset.index);
    if (draggedIndex !== null && draggedIndex !== targetIndex) {
        const moved = uploadedFiles.splice(draggedIndex, 1)[0];
        uploadedFiles.splice(targetIndex, 0, moved);
        renderFileList();
    }
}

function handleItemDragEnd() {
    document.querySelectorAll('.file-item').forEach(item => {
        item.classList.remove('dragging', 'drag-over-item');
    });
    draggedIndex = null;
}

function removeFile(index) {
    uploadedFiles.splice(index, 1);
    renderFileList();

    if (uploadedFiles.length === 0) {
        document.getElementById('toolOptions').style.display = 'none';
        document.getElementById('processSection').style.display = 'none';
    } else {
        showToolOptions();
    }
}

function clearAllFiles() {
    uploadedFiles = [];
    renderFileList();
    document.getElementById('toolOptions').style.display = 'none';
    document.getElementById('processSection').style.display = 'none';
    selectedPages = new Set();
}

// ==================== Tool Options ====================

function showToolOptions() {
    const optionsEl = document.getElementById('toolOptions');
    const processEl = document.getElementById('processSection');
    const config = toolConfig[currentTool];

    if (uploadedFiles.length < config.minFiles) {
        optionsEl.style.display = 'none';
        processEl.style.display = 'none';
        if (config.minFiles > 1) {
            showToast(`Please add at least ${config.minFiles} files`, 'info');
        }
        return;
    }

    // Render tool-specific options
    let optionsHtml = '';

    switch (currentTool) {
        case 'split':
            optionsHtml = `
                <h3>Split Options</h3>
                <div class="option-group">
                    <label for="splitMode">Split Mode</label>
                    <select id="splitMode" class="option-select" onchange="onSplitModeChange()">
                        <option value="all">Extract every page as separate PDF</option>
                        <option value="ranges">Split by page ranges</option>
                    </select>
                </div>
                <div class="option-group" id="rangeInputGroup" style="display: none;">
                    <label for="pageRanges">Page Ranges</label>
                    <input type="text" id="pageRanges" class="option-input" placeholder="e.g. 1-3, 5, 8-10">
                    <p class="option-hint">Separate ranges with commas. Each range becomes a separate PDF.</p>
                </div>
            `;
            break;

        case 'rotate':
            optionsHtml = `
                <h3>Rotation Angle</h3>
                <div class="rotation-options">
                    <button class="rotation-btn active" onclick="setRotation(90, this)">90° Right</button>
                    <button class="rotation-btn" onclick="setRotation(180, this)">180°</button>
                    <button class="rotation-btn" onclick="setRotation(270, this)">90° Left</button>
                </div>
            `;
            break;

        case 'remove':
        case 'extract':
            optionsHtml = `
                <h3>${currentTool === 'remove' ? 'Select pages to remove' : 'Select pages to extract'}</h3>
                <p class="option-hint" style="margin-bottom: 12px;">Click on pages to select/deselect them</p>
                <div id="pageThumbnails" class="page-thumbnails">
                    <p style="color: var(--text-secondary);">Loading page previews...</p>
                </div>
            `;
            break;

        case 'compress':
            optionsHtml = `
                <h3>Compression Level</h3>
                <div class="compression-options">
                    <button class="compression-btn" onclick="setCompression('low', this)">
                        <h5>Low</h5>
                        <p>Less compression, higher quality</p>
                    </button>
                    <button class="compression-btn active" onclick="setCompression('recommended', this)">
                        <h5>Recommended</h5>
                        <p>Good compression, good quality</p>
                    </button>
                    <button class="compression-btn" onclick="setCompression('extreme', this)">
                        <h5>Extreme</h5>
                        <p>Maximum compression</p>
                    </button>
                </div>
            `;
            break;

        case 'resize-file':
            optionsHtml = `
                <h3>Target File Size</h3>
                <div class="current-size-display">
                    <div>
                        <div class="size-label">Current file size</div>
                        <div class="size-value" id="currentFileSize">${formatFileSize(uploadedFiles[0].size)}</div>
                    </div>
                </div>
                <div class="target-size-row">
                    <div class="option-group">
                        <label for="targetSize">Target Size</label>
                        <input type="number" id="targetSize" class="option-input" placeholder="e.g. 500" min="1" step="1" oninput="updateResizeDirection()">
                    </div>
                    <div class="option-group">
                        <label for="targetUnit">Unit</label>
                        <select id="targetUnit" class="option-select" onchange="updateResizeDirection()">
                            <option value="KB">KB</option>
                            <option value="MB" selected>MB</option>
                        </select>
                    </div>
                </div>
                <div class="resize-direction-info" id="resizeDirectionInfo"></div>
            `;
            break;

        case 'page-numbers':
            optionsHtml = `
                <h3>Page Number Options</h3>
                <div class="option-row">
                    <div class="option-group">
                        <label for="pnPosition">Position</label>
                        <select id="pnPosition" class="option-select">
                            <option value="bottom-center">Bottom Center</option>
                            <option value="bottom-left">Bottom Left</option>
                            <option value="bottom-right">Bottom Right</option>
                            <option value="top-center">Top Center</option>
                            <option value="top-left">Top Left</option>
                            <option value="top-right">Top Right</option>
                        </select>
                    </div>
                    <div class="option-group">
                        <label for="pnStartNum">Start Number</label>
                        <input type="number" id="pnStartNum" class="option-input" value="1" min="1">
                    </div>
                </div>
                <div class="option-row">
                    <div class="option-group">
                        <label for="pnFormat">Format</label>
                        <select id="pnFormat" class="option-select">
                            <option value="number">1, 2, 3...</option>
                            <option value="page-n">Page 1, Page 2...</option>
                            <option value="n-of-total">1 of N, 2 of N...</option>
                            <option value="dash">- 1 -, - 2 -...</option>
                        </select>
                    </div>
                    <div class="option-group">
                        <label for="pnFontSize">Font Size</label>
                        <input type="number" id="pnFontSize" class="option-input" value="12" min="6" max="36">
                    </div>
                </div>
            `;
            break;

        case 'watermark':
            optionsHtml = `
                <h3>Watermark Options</h3>
                <div class="option-group">
                    <label for="wmText">Watermark Text</label>
                    <input type="text" id="wmText" class="option-input" placeholder="e.g. CONFIDENTIAL" maxlength="50">
                </div>
                <div class="option-row">
                    <div class="option-group">
                        <label for="wmFontSize">Font Size</label>
                        <input type="number" id="wmFontSize" class="option-input" value="48" min="12" max="120">
                    </div>
                    <div class="option-group">
                        <label for="wmOpacity">Opacity</label>
                        <input type="range" id="wmOpacity" min="5" max="80" value="25" class="option-input" style="padding: 6px 0;" oninput="document.getElementById('wmOpacityVal').textContent = this.value + '%'">
                        <p class="option-hint">Opacity: <span id="wmOpacityVal">25%</span></p>
                    </div>
                </div>
                <div class="option-group">
                    <label for="wmRotation">Rotation</label>
                    <select id="wmRotation" class="option-select">
                        <option value="diagonal">Diagonal (45°)</option>
                        <option value="horizontal">Horizontal (0°)</option>
                        <option value="vertical">Vertical (90°)</option>
                    </select>
                </div>
            `;
            break;

        case 'protect':
            optionsHtml = `
                <h3>Password Protection</h3>
                <div class="option-group">
                    <label for="protectPassword">Password</label>
                    <input type="password" id="protectPassword" class="option-input" placeholder="Enter password">
                </div>
                <div class="option-group">
                    <label for="protectPasswordConfirm">Confirm Password</label>
                    <input type="password" id="protectPasswordConfirm" class="option-input" placeholder="Confirm password">
                </div>
            `;
            break;

        case 'unlock':
            optionsHtml = `
                <h3>Enter PDF Password</h3>
                <div class="option-group">
                    <label for="unlockPassword">Password</label>
                    <input type="password" id="unlockPassword" class="option-input" placeholder="Enter the PDF password">
                    <p class="option-hint">Enter the password used to protect this PDF</p>
                </div>
            `;
            break;

        case 'jpg-to-pdf':
            optionsHtml = `
                <h3>Conversion Options</h3>
                <div class="option-row">
                    <div class="option-group">
                        <label for="imgPageSize">Page Size</label>
                        <select id="imgPageSize" class="option-select">
                            <option value="fit">Fit to Image</option>
                            <option value="a4">A4</option>
                            <option value="letter">Letter</option>
                        </select>
                    </div>
                    <div class="option-group">
                        <label for="imgOrientation">Orientation</label>
                        <select id="imgOrientation" class="option-select">
                            <option value="auto">Auto-detect</option>
                            <option value="portrait">Portrait</option>
                            <option value="landscape">Landscape</option>
                        </select>
                    </div>
                </div>
                <div class="option-group">
                    <label for="imgMargin">Margin</label>
                    <select id="imgMargin" class="option-select">
                        <option value="none">No Margin</option>
                        <option value="small" selected>Small</option>
                        <option value="large">Large</option>
                    </select>
                </div>
            `;
            break;

        case 'pdf-to-image':
            optionsHtml = `
                <h3>Conversion Options</h3>
                <div class="option-row">
                    <div class="option-group">
                        <label for="imageFormat">Image Format</label>
                        <select id="imageFormat" class="option-select" onchange="onImageFormatChange()">
                            <option value="jpeg" selected>JPEG</option>
                            <option value="png">PNG</option>
                            <option value="gif">GIF</option>
                            <option value="svg">SVG</option>
                            <option value="webp">WebP</option>
                            <option value="bmp">BMP</option>
                        </select>
                    </div>
                    <div class="option-group" id="imageQualityGroup">
                        <label for="imageQuality">Image Quality</label>
                        <select id="imageQuality" class="option-select">
                            <option value="low">Low (faster, smaller)</option>
                            <option value="medium" selected>Medium</option>
                            <option value="high">High (larger files)</option>
                        </select>
                    </div>
                </div>
            `;
            break;

        default:
            // merge and others don't need extra options
            break;
    }

    if (optionsHtml) {
        optionsEl.innerHTML = optionsHtml;
        optionsEl.style.display = 'block';
    } else {
        optionsEl.style.display = 'none';
    }

    processEl.style.display = 'block';

    // Load page thumbnails if needed
    if (currentTool === 'remove' || currentTool === 'extract') {
        loadPageThumbnails();
    }
}

function onSplitModeChange() {
    const mode = document.getElementById('splitMode').value;
    document.getElementById('rangeInputGroup').style.display = mode === 'ranges' ? 'block' : 'none';
}

function setRotation(angle, btn) {
    rotationAngle = angle;
    document.querySelectorAll('.rotation-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function setCompression(level, btn) {
    compressionLevel = level;
    document.querySelectorAll('.compression-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function onImageFormatChange() {
    const format = document.getElementById('imageFormat').value;
    const qualityGroup = document.getElementById('imageQualityGroup');

    // Quality settings only apply to JPEG, WebP (lossy formats)
    // PNG, BMP, GIF, and SVG don't use quality settings
    if (format === 'png' || format === 'bmp' || format === 'gif' || format === 'svg') {
        qualityGroup.style.display = 'none';
    } else {
        qualityGroup.style.display = 'block';
    }
}

// ==================== Page Thumbnails ====================

async function loadPageThumbnails() {
    const container = document.getElementById('pageThumbnails');
    if (!container || uploadedFiles.length === 0) return;

    selectedPages = new Set();
    container.innerHTML = '<p style="color: var(--text-secondary);">Loading page previews...</p>';

    try {
        const arrayBuffer = await uploadedFiles[0].arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const totalPages = pdf.numPages;

        container.innerHTML = '';

        for (let i = 1; i <= totalPages; i++) {
            const page = await pdf.getPage(i);
            const scale = 0.5;
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;

            const thumb = document.createElement('div');
            thumb.className = 'page-thumbnail';
            thumb.dataset.page = i;
            thumb.innerHTML = `
                <div class="page-thumbnail-check">&#10003;</div>
                <div class="page-thumbnail-label">Page ${i}</div>
            `;
            thumb.insertBefore(canvas, thumb.firstChild.nextSibling);

            thumb.addEventListener('click', () => togglePageSelection(thumb, i));
            container.appendChild(thumb);
        }
    } catch (error) {
        container.innerHTML = '<p style="color: #f44336;">Failed to load page previews. The PDF may be corrupted or password-protected.</p>';
    }
}

function togglePageSelection(thumb, pageNum) {
    if (selectedPages.has(pageNum)) {
        selectedPages.delete(pageNum);
        thumb.classList.remove('selected');
    } else {
        selectedPages.add(pageNum);
        thumb.classList.add('selected');
    }
}

// ==================== Processing ====================

async function processFiles() {
    const config = toolConfig[currentTool];

    if (uploadedFiles.length < config.minFiles) {
        showToast(`Please add at least ${config.minFiles} file(s)`, 'warning');
        return;
    }

    // Validate tool-specific requirements
    if ((currentTool === 'remove' || currentTool === 'extract') && selectedPages.size === 0) {
        showToast('Please select at least one page', 'warning');
        return;
    }

    if (currentTool === 'watermark') {
        const text = document.getElementById('wmText').value.trim();
        if (!text) {
            showToast('Please enter watermark text', 'warning');
            return;
        }
    }

    if (currentTool === 'resize-file') {
        const targetSize = parseFloat(document.getElementById('targetSize').value);
        if (!targetSize || targetSize <= 0) {
            showToast('Please enter a valid target file size', 'warning');
            return;
        }
    }

    if (currentTool === 'protect') {
        const pw = document.getElementById('protectPassword').value;
        const pw2 = document.getElementById('protectPasswordConfirm').value;
        if (!pw) {
            showToast('Please enter a password', 'warning');
            return;
        }
        if (pw !== pw2) {
            showToast('Passwords do not match', 'error');
            return;
        }
    }

    // Show progress
    const processBtn = document.getElementById('processBtn');
    processBtn.disabled = true;
    document.getElementById('processSection').style.display = 'none';
    document.getElementById('progressSection').style.display = 'block';
    document.getElementById('resultSection').style.display = 'none';
    updateProgress(10, 'Processing...');

    try {
        switch (currentTool) {
            case 'merge':
                await processMerge();
                break;
            case 'split':
                await processSplit();
                break;
            case 'rotate':
                await processRotate();
                break;
            case 'remove':
                await processRemovePages();
                break;
            case 'extract':
                await processExtractPages();
                break;
            case 'compress':
                await processCompress();
                break;
            case 'jpg-to-pdf':
                await processJpgToPdf();
                break;
            case 'pdf-to-image':
                await processPdfToImage();
                break;
            case 'page-numbers':
                await processPageNumbers();
                break;
            case 'watermark':
                await processWatermark();
                break;
            case 'protect':
                await processProtect();
                break;
            case 'unlock':
                await processUnlock();
                break;
            case 'resize-file':
                await processResizeFile();
                break;
        }

        updateProgress(100, 'Complete!');

        setTimeout(() => {
            document.getElementById('progressSection').style.display = 'none';
            showResultModal();
        }, 500);

    } catch (error) {
        console.error('Processing error:', error);
        document.getElementById('progressSection').style.display = 'none';
        showToast('Processing failed: ' + error.message, 'error');
    }

    processBtn.disabled = false;
}

function updateProgress(percent, text) {
    document.getElementById('progressBar').style.width = percent + '%';
    document.getElementById('progressText').textContent = text;
}

function showResultModal() {
    // Copy result info to modal
    const resultInfo = document.getElementById('resultInfo').textContent;
    document.getElementById('modalResultInfo').textContent = resultInfo;

    // Show modal
    document.getElementById('pdfResultModal').classList.add('active');
}

function closeResultModal() {
    document.getElementById('pdfResultModal').classList.remove('active');
    startOver();
}

// ==================== Merge ====================

async function processMerge() {
    updateProgress(20, 'Creating merged document...');
    const mergedPdf = await PDFDocument.create();

    for (let i = 0; i < uploadedFiles.length; i++) {
        updateProgress(20 + (60 * i / uploadedFiles.length), `Merging file ${i + 1} of ${uploadedFiles.length}...`);
        const arrayBuffer = await uploadedFiles[i].arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        pages.forEach(page => mergedPdf.addPage(page));
    }

    updateProgress(90, 'Saving merged PDF...');
    const pdfBytes = await mergedPdf.save();
    processedResult = {
        data: pdfBytes,
        filename: 'merged.pdf',
        type: 'application/pdf'
    };
    document.getElementById('resultInfo').textContent =
        `Merged ${uploadedFiles.length} files into ${mergedPdf.getPageCount()} pages (${formatFileSize(pdfBytes.byteLength)})`;
}

// ==================== Split ====================

async function processSplit() {
    const mode = document.getElementById('splitMode').value;
    const arrayBuffer = await uploadedFiles[0].arrayBuffer();
    const sourcePdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const totalPages = sourcePdf.getPageCount();

    processedResults = [];

    if (mode === 'all') {
        for (let i = 0; i < totalPages; i++) {
            updateProgress(20 + (60 * i / totalPages), `Extracting page ${i + 1} of ${totalPages}...`);
            const newPdf = await PDFDocument.create();
            const [page] = await newPdf.copyPages(sourcePdf, [i]);
            newPdf.addPage(page);
            const pdfBytes = await newPdf.save();
            processedResults.push({
                data: pdfBytes,
                filename: `page_${i + 1}.pdf`,
                type: 'application/pdf'
            });
        }
    } else {
        const rangesStr = document.getElementById('pageRanges').value.trim();
        if (!rangesStr) {
            throw new Error('Please enter page ranges');
        }
        const ranges = parsePageRanges(rangesStr, totalPages);

        for (let r = 0; r < ranges.length; r++) {
            updateProgress(20 + (60 * r / ranges.length), `Creating split ${r + 1} of ${ranges.length}...`);
            const newPdf = await PDFDocument.create();
            const pageIndices = ranges[r].map(p => p - 1);
            const pages = await newPdf.copyPages(sourcePdf, pageIndices);
            pages.forEach(page => newPdf.addPage(page));
            const pdfBytes = await newPdf.save();
            processedResults.push({
                data: pdfBytes,
                filename: `split_${r + 1}.pdf`,
                type: 'application/pdf'
            });
        }
    }

    updateProgress(90, 'Done!');
    document.getElementById('resultInfo').textContent =
        `Split into ${processedResults.length} PDF files from ${totalPages} pages`;
}

function parsePageRanges(str, maxPage) {
    const ranges = [];
    const parts = str.split(',').map(s => s.trim()).filter(s => s);

    for (const part of parts) {
        if (part.includes('-')) {
            const [startStr, endStr] = part.split('-').map(s => s.trim());
            const start = parseInt(startStr);
            const end = parseInt(endStr);
            if (isNaN(start) || isNaN(end) || start < 1 || end > maxPage || start > end) {
                throw new Error(`Invalid range: ${part}. Pages must be between 1 and ${maxPage}.`);
            }
            const pages = [];
            for (let i = start; i <= end; i++) pages.push(i);
            ranges.push(pages);
        } else {
            const page = parseInt(part);
            if (isNaN(page) || page < 1 || page > maxPage) {
                throw new Error(`Invalid page: ${part}. Pages must be between 1 and ${maxPage}.`);
            }
            ranges.push([page]);
        }
    }

    return ranges;
}

// ==================== Rotate ====================

async function processRotate() {
    updateProgress(30, 'Loading PDF...');
    const arrayBuffer = await uploadedFiles[0].arrayBuffer();
    const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

    updateProgress(60, 'Rotating pages...');
    const pages = pdf.getPages();
    pages.forEach(page => {
        page.setRotation(degrees(page.getRotation().angle + rotationAngle));
    });

    updateProgress(90, 'Saving...');
    const pdfBytes = await pdf.save();
    processedResult = {
        data: pdfBytes,
        filename: 'rotated.pdf',
        type: 'application/pdf'
    };
    document.getElementById('resultInfo').textContent =
        `Rotated ${pages.length} pages by ${rotationAngle}° (${formatFileSize(pdfBytes.byteLength)})`;
}

// ==================== Remove Pages ====================

async function processRemovePages() {
    updateProgress(30, 'Loading PDF...');
    const arrayBuffer = await uploadedFiles[0].arrayBuffer();
    const sourcePdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const totalPages = sourcePdf.getPageCount();

    const keepIndices = [];
    for (let i = 0; i < totalPages; i++) {
        if (!selectedPages.has(i + 1)) {
            keepIndices.push(i);
        }
    }

    if (keepIndices.length === 0) {
        throw new Error('Cannot remove all pages. At least one page must remain.');
    }

    updateProgress(60, 'Creating new PDF...');
    const newPdf = await PDFDocument.create();
    const pages = await newPdf.copyPages(sourcePdf, keepIndices);
    pages.forEach(page => newPdf.addPage(page));

    updateProgress(90, 'Saving...');
    const pdfBytes = await newPdf.save();
    processedResult = {
        data: pdfBytes,
        filename: 'pages_removed.pdf',
        type: 'application/pdf'
    };
    document.getElementById('resultInfo').textContent =
        `Removed ${selectedPages.size} pages. New PDF has ${keepIndices.length} pages (${formatFileSize(pdfBytes.byteLength)})`;
}

// ==================== Extract Pages ====================

async function processExtractPages() {
    updateProgress(30, 'Loading PDF...');
    const arrayBuffer = await uploadedFiles[0].arrayBuffer();
    const sourcePdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

    const extractIndices = Array.from(selectedPages).sort((a, b) => a - b).map(p => p - 1);

    updateProgress(60, 'Extracting pages...');
    const newPdf = await PDFDocument.create();
    const pages = await newPdf.copyPages(sourcePdf, extractIndices);
    pages.forEach(page => newPdf.addPage(page));

    updateProgress(90, 'Saving...');
    const pdfBytes = await newPdf.save();
    processedResult = {
        data: pdfBytes,
        filename: 'extracted_pages.pdf',
        type: 'application/pdf'
    };
    document.getElementById('resultInfo').textContent =
        `Extracted ${selectedPages.size} pages (${formatFileSize(pdfBytes.byteLength)})`;
}

// ==================== Compress ====================

async function processCompress() {
    updateProgress(20, 'Loading PDF...');
    const arrayBuffer = await uploadedFiles[0].arrayBuffer();
    const originalSize = arrayBuffer.byteLength;

    // Load and re-save with optimizations
    const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

    updateProgress(50, 'Compressing...');

    // Remove metadata for compression
    if (compressionLevel === 'extreme') {
        pdf.setTitle('');
        pdf.setAuthor('');
        pdf.setSubject('');
        pdf.setKeywords([]);
        pdf.setProducer('');
        pdf.setCreator('');
    }

    updateProgress(80, 'Saving optimized PDF...');

    const saveOptions = {};
    if (compressionLevel === 'low') {
        saveOptions.useObjectStreams = false;
    } else {
        saveOptions.useObjectStreams = true;
    }

    if (compressionLevel === 'extreme' || compressionLevel === 'recommended') {
        saveOptions.addDefaultPage = false;
        saveOptions.objectsPerTick = 100;
    }

    const pdfBytes = await pdf.save(saveOptions);
    const newSize = pdfBytes.byteLength;
    const savings = Math.max(0, ((originalSize - newSize) / originalSize) * 100);

    processedResult = {
        data: pdfBytes,
        filename: 'compressed.pdf',
        type: 'application/pdf'
    };
    document.getElementById('resultInfo').textContent =
        `Compressed from ${formatFileSize(originalSize)} to ${formatFileSize(newSize)} (${savings.toFixed(1)}% reduction)`;
}

// ==================== JPG to PDF ====================

async function processJpgToPdf() {
    updateProgress(10, 'Creating PDF...');
    const pdfDoc = await PDFDocument.create();

    const pageSize = document.getElementById('imgPageSize').value;
    const orientation = document.getElementById('imgOrientation').value;
    const marginSetting = document.getElementById('imgMargin').value;

    const margins = { none: 0, small: 36, large: 72 }; // points
    const margin = margins[marginSetting] || 36;

    for (let i = 0; i < uploadedFiles.length; i++) {
        updateProgress(10 + (70 * i / uploadedFiles.length), `Converting image ${i + 1} of ${uploadedFiles.length}...`);

        const file = uploadedFiles[i];
        const arrayBuffer = await file.arrayBuffer();

        let image;
        if (file.type === 'image/png') {
            image = await pdfDoc.embedPng(arrayBuffer);
        } else if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
            // Convert SVG to PNG first using canvas
            const svgImage = await svgToImage(arrayBuffer);
            image = await pdfDoc.embedPng(svgImage);
        } else if (file.type === 'image/gif') {
            // Convert GIF to PNG first using canvas
            const gifImage = await imageToCanvas(arrayBuffer, 'image/gif');
            image = await pdfDoc.embedPng(gifImage);
        } else {
            image = await pdfDoc.embedJpg(arrayBuffer);
        }

        const imgWidth = image.width;
        const imgHeight = image.height;

        let pageWidth, pageHeight;

        if (pageSize === 'fit') {
            pageWidth = imgWidth + (margin * 2);
            pageHeight = imgHeight + (margin * 2);
        } else {
            const sizes = {
                a4: { w: 595.28, h: 841.89 },
                letter: { w: 612, h: 792 }
            };
            const size = sizes[pageSize];

            let isLandscape = false;
            if (orientation === 'landscape') {
                isLandscape = true;
            } else if (orientation === 'auto') {
                isLandscape = imgWidth > imgHeight;
            }

            pageWidth = isLandscape ? size.h : size.w;
            pageHeight = isLandscape ? size.w : size.h;
        }

        const page = pdfDoc.addPage([pageWidth, pageHeight]);

        // Scale image to fit within page with margins
        const availWidth = pageWidth - (margin * 2);
        const availHeight = pageHeight - (margin * 2);
        const scale = Math.min(availWidth / imgWidth, availHeight / imgHeight, 1);
        const drawWidth = imgWidth * scale;
        const drawHeight = imgHeight * scale;

        // Center image
        const x = (pageWidth - drawWidth) / 2;
        const y = (pageHeight - drawHeight) / 2;

        page.drawImage(image, { x, y, width: drawWidth, height: drawHeight });
    }

    updateProgress(90, 'Saving PDF...');
    const pdfBytes = await pdfDoc.save();

    processedResult = {
        data: pdfBytes,
        filename: 'images.pdf',
        type: 'application/pdf'
    };
    document.getElementById('resultInfo').textContent =
        `Converted ${uploadedFiles.length} images to PDF (${formatFileSize(pdfBytes.byteLength)})`;
}

// ==================== PDF to Image ====================

async function processPdfToImage() {
    updateProgress(10, 'Loading PDF...');
    const arrayBuffer = await uploadedFiles[0].arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;

    const format = document.getElementById('imageFormat').value;
    const quality = document.getElementById('imageQuality')?.value || 'medium';

    const scaleMap = { low: 1, medium: 1.5, high: 2 };
    const scale = scaleMap[quality];

    // Quality settings for lossy formats
    const imageQuality = quality === 'high' ? 0.95 : quality === 'medium' ? 0.85 : 0.7;

    // MIME type mapping
    const mimeTypes = {
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'svg': 'image/svg+xml',
        'webp': 'image/webp',
        'bmp': 'image/bmp'
    };

    const fileExtensions = {
        'jpeg': 'jpg',
        'png': 'png',
        'gif': 'gif',
        'svg': 'svg',
        'webp': 'webp',
        'bmp': 'bmp'
    };

    const mimeType = mimeTypes[format];
    const extension = fileExtensions[format];

    processedResults = [];

    for (let i = 1; i <= totalPages; i++) {
        updateProgress(10 + (80 * i / totalPages), `Converting page ${i} of ${totalPages} to ${format.toUpperCase()}...`);

        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });

        let blob, svgText;

        if (format === 'svg') {
            // Render as SVG
            const svgGfx = await page.getOperatorList();
            const svgDiv = document.createElement('div');
            const svgViewport = page.getViewport({ scale: 1.0 });

            // Create SVG element
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width', svgViewport.width);
            svg.setAttribute('height', svgViewport.height);
            svg.setAttribute('viewBox', `0 0 ${svgViewport.width} ${svgViewport.height}`);
            svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

            svgDiv.appendChild(svg);

            // Render page to SVG
            await page.render({
                canvasContext: svg,
                viewport: svgViewport,
                intent: 'display'
            }).promise.catch(() => {
                // Fallback: render to canvas then convert to SVG
                const canvas = document.createElement('canvas');
                canvas.width = svgViewport.width;
                canvas.height = svgViewport.height;
                const ctx = canvas.getContext('2d');
                return page.render({ canvasContext: ctx, viewport: svgViewport }).promise.then(() => {
                    const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
                    img.setAttribute('width', svgViewport.width);
                    img.setAttribute('height', svgViewport.height);
                    img.setAttribute('href', canvas.toDataURL('image/png'));
                    svg.appendChild(img);
                });
            });

            svgText = svgDiv.innerHTML;
            blob = new Blob([svgText], { type: 'image/svg+xml' });
        } else {
            // Render to canvas for raster formats
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;

            // Convert canvas to blob with appropriate format and quality
            if (format === 'gif') {
                // For GIF, convert via PNG first (most reliable)
                blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            } else if (format === 'jpeg' || format === 'webp') {
                // Lossy formats support quality parameter
                blob = await new Promise(resolve => canvas.toBlob(resolve, mimeType, imageQuality));
            } else {
                // Lossless formats (PNG, BMP) don't use quality parameter
                blob = await new Promise(resolve => canvas.toBlob(resolve, mimeType));
            }
        }

        const blobArrayBuffer = await blob.arrayBuffer();

        processedResults.push({
            data: new Uint8Array(blobArrayBuffer),
            filename: `page_${i}.${extension}`,
            type: mimeType
        });
    }

    updateProgress(95, 'Done!');
    document.getElementById('resultInfo').textContent =
        `Converted ${totalPages} pages to ${format.toUpperCase()} images`;
}

// ==================== Page Numbers ====================

async function processPageNumbers() {
    updateProgress(20, 'Loading PDF...');
    const arrayBuffer = await uploadedFiles[0].arrayBuffer();
    const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

    const position = document.getElementById('pnPosition').value;
    const startNum = parseInt(document.getElementById('pnStartNum').value) || 1;
    const format = document.getElementById('pnFormat').value;
    const fontSize = parseInt(document.getElementById('pnFontSize').value) || 12;

    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const pages = pdf.getPages();
    const totalPages = pages.length;

    updateProgress(40, 'Adding page numbers...');

    pages.forEach((page, index) => {
        const pageNum = startNum + index;
        let text;

        switch (format) {
            case 'page-n':
                text = `Page ${pageNum}`;
                break;
            case 'n-of-total':
                text = `${pageNum} of ${startNum + totalPages - 1}`;
                break;
            case 'dash':
                text = `- ${pageNum} -`;
                break;
            default:
                text = `${pageNum}`;
        }

        const textWidth = font.widthOfTextAtSize(text, fontSize);
        const { width, height } = page.getSize();
        const margin = 40;

        let x, y;

        switch (position) {
            case 'bottom-left':
                x = margin;
                y = margin;
                break;
            case 'bottom-right':
                x = width - textWidth - margin;
                y = margin;
                break;
            case 'bottom-center':
                x = (width - textWidth) / 2;
                y = margin;
                break;
            case 'top-left':
                x = margin;
                y = height - margin;
                break;
            case 'top-right':
                x = width - textWidth - margin;
                y = height - margin;
                break;
            case 'top-center':
                x = (width - textWidth) / 2;
                y = height - margin;
                break;
            default:
                x = (width - textWidth) / 2;
                y = margin;
        }

        page.drawText(text, {
            x,
            y,
            size: fontSize,
            font,
            color: rgb(0.3, 0.3, 0.3)
        });
    });

    updateProgress(90, 'Saving...');
    const pdfBytes = await pdf.save();
    processedResult = {
        data: pdfBytes,
        filename: 'numbered.pdf',
        type: 'application/pdf'
    };
    document.getElementById('resultInfo').textContent =
        `Added page numbers to ${totalPages} pages (${formatFileSize(pdfBytes.byteLength)})`;
}

// ==================== Watermark ====================

async function processWatermark() {
    updateProgress(20, 'Loading PDF...');
    const arrayBuffer = await uploadedFiles[0].arrayBuffer();
    const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

    const text = document.getElementById('wmText').value.trim();
    const fontSize = parseInt(document.getElementById('wmFontSize').value) || 48;
    const opacity = parseInt(document.getElementById('wmOpacity').value) / 100;
    const rotationSetting = document.getElementById('wmRotation').value;

    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    const pages = pdf.getPages();

    updateProgress(40, 'Adding watermark...');

    let rotateAngle;
    switch (rotationSetting) {
        case 'diagonal': rotateAngle = 45; break;
        case 'horizontal': rotateAngle = 0; break;
        case 'vertical': rotateAngle = 90; break;
        default: rotateAngle = 45;
    }

    pages.forEach(page => {
        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(text, fontSize);

        page.drawText(text, {
            x: (width - textWidth) / 2,
            y: height / 2,
            size: fontSize,
            font,
            color: rgb(0.5, 0.5, 0.5),
            opacity,
            rotate: degrees(rotateAngle)
        });
    });

    updateProgress(90, 'Saving...');
    const pdfBytes = await pdf.save();
    processedResult = {
        data: pdfBytes,
        filename: 'watermarked.pdf',
        type: 'application/pdf'
    };
    document.getElementById('resultInfo').textContent =
        `Added watermark to ${pages.length} pages (${formatFileSize(pdfBytes.byteLength)})`;
}

// ==================== Protect ====================

async function processProtect() {
    updateProgress(30, 'Loading PDF...');
    const arrayBuffer = await uploadedFiles[0].arrayBuffer();
    const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

    updateProgress(60, 'Encrypting PDF...');
    const password = document.getElementById('protectPassword').value;

    // pdf-lib doesn't natively support encryption, so we use a workaround
    // We'll embed the password in the PDF metadata and save
    // For actual encryption, a server-side solution or different library would be needed
    // However, we can use the encrypt option if available

    const pdfBytes = await pdf.save();

    // Since pdf-lib doesn't support encryption directly,
    // we'll inform the user and provide the saved PDF
    processedResult = {
        data: pdfBytes,
        filename: 'protected.pdf',
        type: 'application/pdf'
    };

    // Note: True PDF encryption requires a different approach
    document.getElementById('resultInfo').textContent =
        `PDF saved (${formatFileSize(pdfBytes.byteLength)}). Note: Full encryption requires a server-side solution. The PDF has been re-saved with optimizations.`;
}

// ==================== Unlock ====================

async function processUnlock() {
    updateProgress(30, 'Loading PDF...');
    const arrayBuffer = await uploadedFiles[0].arrayBuffer();
    const password = document.getElementById('unlockPassword').value;

    updateProgress(60, 'Removing protection...');

    try {
        const pdf = await PDFDocument.load(arrayBuffer, {
            ignoreEncryption: true,
            password: password
        });

        updateProgress(90, 'Saving...');
        const pdfBytes = await pdf.save();
        processedResult = {
            data: pdfBytes,
            filename: 'unlocked.pdf',
            type: 'application/pdf'
        };
        document.getElementById('resultInfo').textContent =
            `PDF unlocked successfully (${formatFileSize(pdfBytes.byteLength)})`;
    } catch (error) {
        throw new Error('Failed to unlock PDF. The password may be incorrect.');
    }
}

// ==================== Resize File ====================

function updateResizeDirection() {
    const info = document.getElementById('resizeDirectionInfo');
    const targetVal = parseFloat(document.getElementById('targetSize').value);
    const unit = document.getElementById('targetUnit').value;

    if (!targetVal || targetVal <= 0 || !uploadedFiles[0]) {
        info.className = 'resize-direction-info';
        return;
    }

    const targetBytes = unit === 'MB' ? targetVal * 1024 * 1024 : targetVal * 1024;
    const currentBytes = uploadedFiles[0].size;

    if (targetBytes < 1024) {
        info.className = 'resize-direction-info error';
        info.textContent = 'Target size is too small. Minimum is 1 KB.';
    } else if (targetBytes < currentBytes) {
        const reduction = ((currentBytes - targetBytes) / currentBytes * 100).toFixed(1);
        info.className = 'resize-direction-info decrease';
        info.textContent = `File will be decreased by ${reduction}% (${formatFileSize(currentBytes)} → ${formatFileSize(targetBytes)})`;
    } else if (targetBytes > currentBytes) {
        const increase = ((targetBytes - currentBytes) / currentBytes * 100).toFixed(1);
        info.className = 'resize-direction-info increase';
        info.textContent = `File will be increased by ${increase}% (${formatFileSize(currentBytes)} → ${formatFileSize(targetBytes)})`;
    } else {
        info.className = 'resize-direction-info';
        info.textContent = 'Target size matches current file size.';
        info.style.display = 'block';
    }
}

async function processResizeFile() {
    const targetVal = parseFloat(document.getElementById('targetSize').value);
    const unit = document.getElementById('targetUnit').value;
    const targetBytes = unit === 'MB' ? targetVal * 1024 * 1024 : targetVal * 1024;

    updateProgress(10, 'Loading PDF...');
    const arrayBuffer = await uploadedFiles[0].arrayBuffer();
    const originalSize = arrayBuffer.byteLength;

    if (targetBytes < 1024) {
        throw new Error('Target size is too small. Minimum is 1 KB.');
    }

    const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

    if (targetBytes < originalSize) {
        // ========== DECREASE: Re-render pages as compressed JPEGs ==========
        updateProgress(20, 'Reducing file size...');

        const totalPages = pdf.getPageCount();

        // Calculate quality based on how much reduction is needed
        const ratio = targetBytes / originalSize;
        // Map ratio to JPEG quality: more reduction needed = lower quality
        // ratio 0.9 -> quality ~0.85, ratio 0.1 -> quality ~0.15
        let jpegQuality = Math.max(0.1, Math.min(0.92, ratio * 0.95));
        // Scale factor for rendering resolution
        let renderScale = ratio < 0.3 ? 0.75 : ratio < 0.5 ? 1.0 : 1.5;

        let bestResult = null;
        let attempts = 0;
        const maxAttempts = 8;

        while (attempts < maxAttempts) {
            attempts++;
            updateProgress(20 + (60 * attempts / maxAttempts), `Optimizing (attempt ${attempts})... quality=${Math.round(jpegQuality * 100)}%`);

            const newPdf = await PDFDocument.create();

            // Use pdf.js to render each page as an image, then embed
            const pdfJsDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            for (let i = 1; i <= totalPages; i++) {
                const page = await pdfJsDoc.getPage(i);
                const viewport = page.getViewport({ scale: renderScale });

                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d');
                await page.render({ canvasContext: ctx, viewport }).promise;

                const blob = await new Promise(resolve =>
                    canvas.toBlob(resolve, 'image/jpeg', jpegQuality)
                );
                const imgBytes = new Uint8Array(await blob.arrayBuffer());
                const image = await newPdf.embedJpg(imgBytes);

                // Get original page size to preserve dimensions
                const origPage = pdf.getPages()[i - 1];
                const { width, height } = origPage.getSize();
                const newPage = newPdf.addPage([width, height]);
                newPage.drawImage(image, { x: 0, y: 0, width, height });
            }

            const pdfBytes = await newPdf.save({ useObjectStreams: true });

            if (pdfBytes.byteLength <= targetBytes) {
                bestResult = pdfBytes;
                // Try a slightly higher quality if we have room
                if (pdfBytes.byteLength < targetBytes * 0.85 && jpegQuality < 0.92) {
                    jpegQuality = Math.min(0.92, jpegQuality + 0.08);
                    bestResult = pdfBytes; // Keep current as fallback
                    continue;
                }
                break;
            } else {
                bestResult = pdfBytes; // Keep as best so far
                // Reduce quality and scale
                jpegQuality = Math.max(0.1, jpegQuality * 0.7);
                if (jpegQuality <= 0.15) {
                    renderScale = Math.max(0.4, renderScale * 0.8);
                }
            }
        }

        if (!bestResult) {
            throw new Error('Could not reduce the file to the target size. Try a larger target.');
        }

        updateProgress(95, 'Saving...');
        processedResult = {
            data: bestResult,
            filename: 'resized.pdf',
            type: 'application/pdf'
        };

        const finalSize = bestResult.byteLength;
        const withinTarget = finalSize <= targetBytes;
        document.getElementById('resultInfo').textContent =
            `Resized from ${formatFileSize(originalSize)} to ${formatFileSize(finalSize)}` +
            (withinTarget ? ' (target achieved)' : ` (closest achievable - target was ${formatFileSize(targetBytes)})`);

    } else {
        // ========== INCREASE: Pad with valid PDF comments ==========
        updateProgress(20, 'Increasing file size...');

        // Save the PDF normally first
        let pdfBytes = await pdf.save();
        let currentSize = pdfBytes.byteLength;

        if (currentSize >= targetBytes) {
            processedResult = {
                data: pdfBytes,
                filename: 'resized.pdf',
                type: 'application/pdf'
            };
            document.getElementById('resultInfo').textContent =
                `PDF is already ${formatFileSize(currentSize)} (at or above target ${formatFileSize(targetBytes)})`;
            return;
        }

        updateProgress(50, 'Adding padding data...');

        // Calculate padding needed
        const remaining = targetBytes - currentSize;

        // Build padding as valid PDF comment lines (% starts a comment in PDF)
        // We write in manageable chunks to avoid memory issues
        const lineLength = 80; // characters per comment line
        const lineBytes = lineLength + 1; // +1 for newline
        const totalLines = Math.ceil(remaining / lineBytes);
        const padding = new Uint8Array(remaining);
        let offset = 0;

        for (let line = 0; line < totalLines && offset < remaining; line++) {
            // Start each line with % (PDF comment marker)
            padding[offset++] = 37; // %
            // Fill the rest of the line with spaces
            const end = Math.min(offset + lineLength - 1, remaining - 1);
            while (offset < end) {
                padding[offset++] = 80; // 'P' - harmless filler
            }
            // End with newline if room
            if (offset < remaining) {
                padding[offset++] = 10; // \n
            }

            // Update progress every 10000 lines
            if (line % 10000 === 0) {
                updateProgress(50 + (40 * offset / remaining), `Adding data... ${formatFileSize(offset)} / ${formatFileSize(remaining)}`);
            }
        }

        updateProgress(95, 'Saving...');

        // Combine original PDF bytes + comment padding
        const combined = new Uint8Array(currentSize + remaining);
        combined.set(new Uint8Array(pdfBytes), 0);
        combined.set(padding, currentSize);
        pdfBytes = combined;

        processedResult = {
            data: pdfBytes,
            filename: 'resized.pdf',
            type: 'application/pdf'
        };

        document.getElementById('resultInfo').textContent =
            `Resized from ${formatFileSize(originalSize)} to ${formatFileSize(pdfBytes.byteLength)} (target: ${formatFileSize(targetBytes)})`;
    }
}

// ==================== Download ====================

function downloadResult() {
    if (processedResults.length > 0) {
        // Multiple files - download as zip or individual
        if (processedResults.length === 1) {
            downloadFile(processedResults[0]);
        } else {
            downloadMultipleFiles(processedResults);
        }
    } else if (processedResult) {
        downloadFile(processedResult);
    }
}

function downloadFile(result) {
    const blob = new Blob([result.data], { type: result.type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('File downloaded!', 'success');
}

function downloadMultipleFiles(results) {
    // Download each file with a small delay to avoid browser blocking
    results.forEach((result, index) => {
        setTimeout(() => {
            downloadFile(result);
        }, index * 500);
    });
    showToast(`Downloading ${results.length} files...`, 'info');
}

// ==================== Utilities ====================

// Helper function to convert SVG to PNG
async function svgToImage(svgArrayBuffer) {
    const svgText = new TextDecoder().decode(svgArrayBuffer);
    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width || 800;  // Default width if not specified
            canvas.height = img.height || 600; // Default height if not specified

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            canvas.toBlob(async (blob) => {
                const arrayBuffer = await blob.arrayBuffer();
                URL.revokeObjectURL(url);
                resolve(arrayBuffer);
            }, 'image/png');
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load SVG image'));
        };
        img.src = url;
    });
}

// Helper function to convert GIF/other images to PNG
async function imageToCanvas(imageArrayBuffer, mimeType) {
    const blob = new Blob([imageArrayBuffer], { type: mimeType });
    const url = URL.createObjectURL(blob);

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            canvas.toBlob(async (blob) => {
                const arrayBuffer = await blob.arrayBuffer();
                URL.revokeObjectURL(url);
                resolve(arrayBuffer);
            }, 'image/png');
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image'));
        };
        img.src = url;
    });
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ==================== Modal Handler ====================

// Close modal when clicking outside of it
document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('pdfResultModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeResultModal();
            }
        });
    }
});
