// Image Process - Client-side image tools using Canvas API

// ==================== State ====================

let currentTool = null;
let uploadedFiles = [];
let processedResults = [];

const toolConfig = {
    'resize': {
        title: 'Resize Image',
        description: 'Change image dimensions while maintaining aspect ratio',
        accept: 'image/*',
        multiple: true,
        btnText: 'Resize Images'
    },
    'crop': {
        title: 'Crop Image',
        description: 'Cut and trim your images to desired size',
        accept: 'image/*',
        multiple: false,
        btnText: 'Crop Image'
    },
    'rotate': {
        title: 'Rotate Image',
        description: 'Rotate images to any angle',
        accept: 'image/*',
        multiple: true,
        btnText: 'Rotate Images'
    },
    'flip': {
        title: 'Flip Image',
        description: 'Flip images horizontally or vertically',
        accept: 'image/*',
        multiple: true,
        btnText: 'Flip Images'
    },
    'compress': {
        title: 'Compress Image',
        description: 'Reduce file size with quality control',
        accept: 'image/jpeg,image/png,image/webp',
        multiple: true,
        btnText: 'Compress Images'
    },
    'optimize': {
        title: 'Optimize Image',
        description: 'Auto optimize images for web use',
        accept: 'image/*',
        multiple: true,
        btnText: 'Optimize Images'
    },
    'convert-format': {
        title: 'Convert Format',
        description: 'Convert between JPG, PNG, WebP, and more',
        accept: 'image/*',
        multiple: true,
        btnText: 'Convert Images'
    },
    'to-base64': {
        title: 'Image to Base64',
        description: 'Convert images to Base64 encoded strings',
        accept: 'image/*',
        multiple: false,
        btnText: 'Convert to Base64'
    },
    'grayscale': {
        title: 'Grayscale Filter',
        description: 'Convert images to black and white',
        accept: 'image/*',
        multiple: true,
        btnText: 'Apply Grayscale'
    },
    'sepia': {
        title: 'Sepia Filter',
        description: 'Apply vintage sepia tone effect',
        accept: 'image/*',
        multiple: true,
        btnText: 'Apply Sepia'
    },
    'blur': {
        title: 'Blur Effect',
        description: 'Add blur effect to images',
        accept: 'image/*',
        multiple: true,
        btnText: 'Apply Blur'
    },
    'brightness': {
        title: 'Adjust Brightness',
        description: 'Change image brightness level',
        accept: 'image/*',
        multiple: true,
        btnText: 'Adjust Brightness'
    },
    'watermark': {
        title: 'Add Watermark',
        description: 'Add text watermark to images',
        accept: 'image/*',
        multiple: true,
        btnText: 'Add Watermark'
    },
    'border': {
        title: 'Add Border',
        description: 'Add colored border or frame to images',
        accept: 'image/*',
        multiple: true,
        btnText: 'Add Border'
    },
    'collage': {
        title: 'Create Collage',
        description: 'Merge multiple images into a grid',
        accept: 'image/*',
        multiple: true,
        btnText: 'Create Collage'
    },
    'stitch': {
        title: 'Stitch Images',
        description: 'Join images horizontally or vertically',
        accept: 'image/*',
        multiple: true,
        btnText: 'Stitch Images'
    }
};

// ==================== Initialization ====================

document.addEventListener('DOMContentLoaded', function() {
    setupFileInput();
    setupDragDrop();
});

// ==================== Tool Selection ====================

function selectTool(tool) {
    currentTool = tool;
    const config = toolConfig[tool];
    
    // Update workspace UI
    document.getElementById('toolGrid').style.display = 'none';
    document.getElementById('toolWorkspace').style.display = 'block';
    document.getElementById('workspaceTitle').textContent = config.title;
    document.getElementById('workspaceDescription').textContent = config.description;
    document.getElementById('processBtnText').textContent = config.btnText;
    
    // Configure file input
    const fileInput = document.getElementById('fileInput');
    fileInput.accept = config.accept;
    fileInput.multiple = config.multiple;
    
    // Update upload instruction
    const instruction = config.multiple ? 
        'Click or drag & drop multiple images' : 
        'Click or drag & drop a single image';
    document.getElementById('uploadInstruction').textContent = instruction;
    
    // Reset state
    uploadedFiles = [];
    processedResults = [];
    updateFileList();
    hidePreview();
    
    // Render tool-specific options
    renderToolOptions(tool);
}

function backToTools() {
    currentTool = null;
    uploadedFiles = [];
    processedResults = [];
    document.getElementById('toolGrid').style.display = 'block';
    document.getElementById('toolWorkspace').style.display = 'none';
    document.getElementById('fileList').style.display = 'none';
    document.getElementById('toolOptions').style.display = 'none';
    document.getElementById('processActions').style.display = 'none';
    hidePreview();
}

// ==================== File Upload ====================

function setupFileInput() {
    const fileInput = document.getElementById('fileInput');
    fileInput.addEventListener('change', handleFileSelect);
}

function setupDragDrop() {
    const uploadBox = document.getElementById('uploadBox');
    
    uploadBox.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadBox.classList.add('drag-over');
    });
    
    uploadBox.addEventListener('dragleave', () => {
        uploadBox.classList.remove('drag-over');
    });
    
    uploadBox.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadBox.classList.remove('drag-over');
        
        const files = Array.from(e.dataTransfer.files).filter(file => 
            file.type.startsWith('image/')
        );
        
        if (files.length > 0) {
            handleFiles(files);
        }
    });
}

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    handleFiles(files);
}

function handleFiles(files) {
    const config = toolConfig[currentTool];
    
    if (!config.multiple && files.length > 1) {
        showToast('This tool only accepts one image at a time', 'error');
        return;
    }
    
    if (!config.multiple) {
        uploadedFiles = [];
    }
    
    files.forEach(file => {
        if (!uploadedFiles.find(f => f.name === file.name && f.size === file.size)) {
            uploadedFiles.push(file);
        }
    });
    
    updateFileList();
    document.getElementById('processActions').style.display = 'block';
}

function updateFileList() {
    const fileList = document.getElementById('fileList');
    const fileItems = document.getElementById('fileItems');
    const fileCount = document.getElementById('fileCount');
    
    if (uploadedFiles.length === 0) {
        fileList.style.display = 'none';
        return;
    }
    
    fileList.style.display = 'block';
    fileCount.textContent = uploadedFiles.length;
    fileItems.innerHTML = '';
    
    uploadedFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'file-item';
        
        const reader = new FileReader();
        reader.onload = (e) => {
            item.innerHTML = `
                <img src="${e.target.result}" class="file-item-preview" alt="${file.name}">
                <div class="file-item-info">
                    <div class="file-item-name" title="${file.name}">${file.name}</div>
                    <div class="file-item-size">${formatFileSize(file.size)}</div>
                </div>
                <button class="file-item-remove" onclick="removeFile(${index})" title="Remove">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            `;
        };
        reader.readAsDataURL(file);
        
        fileItems.appendChild(item);
    });
}

function removeFile(index) {
    uploadedFiles.splice(index, 1);
    updateFileList();
    
    if (uploadedFiles.length === 0) {
        document.getElementById('processActions').style.display = 'none';
        hidePreview();
    }
}

// ==================== Tool Options ====================

function renderToolOptions(tool) {
    const optionsContainer = document.getElementById('toolOptions');
    optionsContainer.innerHTML = '';
    optionsContainer.style.display = 'block';
    
    let optionsHTML = '<h4>Options</h4>';
    
    switch(tool) {
        case 'resize':
            optionsHTML += `
                <div class="option-group">
                    <label class="option-label">Width (px)</label>
                    <input type="number" id="resizeWidth" class="option-input" placeholder="Auto" min="1">
                </div>
                <div class="option-group">
                    <label class="option-label">Height (px)</label>
                    <input type="number" id="resizeHeight" class="option-input" placeholder="Auto" min="1">
                </div>
                <div class="option-group">
                    <label class="option-label">
                        <input type="checkbox" id="maintainAspect" checked> Maintain aspect ratio
                    </label>
                </div>
            `;
            break;
            
        case 'crop':
            optionsHTML += `
                <div class="option-group">
                    <label class="option-label">Crop Preset</label>
                    <select id="cropPreset" class="option-select" onchange="handleCropPresetChange()">
                        <option value="custom">Custom</option>
                        <option value="square">Square (1:1)</option>
                        <option value="landscape">Landscape (16:9)</option>
                        <option value="portrait">Portrait (9:16)</option>
                        <option value="instagram">Instagram (4:5)</option>
                    </select>
                </div>
                <div class="option-group">
                    <label class="option-label">X Position (px)</label>
                    <input type="number" id="cropX" class="option-input" value="0" min="0">
                </div>
                <div class="option-group">
                    <label class="option-label">Y Position (px)</label>
                    <input type="number" id="cropY" class="option-input" value="0" min="0">
                </div>
                <div class="option-group">
                    <label class="option-label">Width (px)</label>
                    <input type="number" id="cropWidth" class="option-input" value="500" min="1">
                </div>
                <div class="option-group">
                    <label class="option-label">Height (px)</label>
                    <input type="number" id="cropHeight" class="option-input" value="500" min="1">
                </div>
            `;
            break;
            
        case 'rotate':
            optionsHTML += `
                <div class="option-group">
                    <label class="option-label">Rotation Angle</label>
                    <select id="rotateAngle" class="option-select">
                        <option value="90">90° Clockwise</option>
                        <option value="180">180°</option>
                        <option value="270">270° Clockwise (90° Counter)</option>
                        <option value="custom">Custom Angle</option>
                    </select>
                </div>
                <div class="option-group" id="customAngleGroup" style="display: none;">
                    <label class="option-label">Custom Angle (degrees)</label>
                    <input type="number" id="customAngle" class="option-input" value="0" min="-360" max="360">
                </div>
            `;
            break;
            
        case 'flip':
            optionsHTML += `
                <div class="option-group">
                    <label class="option-label">Flip Direction</label>
                    <div class="option-radio-group">
                        <div class="option-radio">
                            <input type="radio" id="flipHorizontal" name="flipDirection" value="horizontal" checked>
                            <label for="flipHorizontal">Horizontal</label>
                        </div>
                        <div class="option-radio">
                            <input type="radio" id="flipVertical" name="flipDirection" value="vertical">
                            <label for="flipVertical">Vertical</label>
                        </div>
                        <div class="option-radio">
                            <input type="radio" id="flipBoth" name="flipDirection" value="both">
                            <label for="flipBoth">Both</label>
                        </div>
                    </div>
                </div>
            `;
            break;
            
        case 'compress':
            optionsHTML += `
                <div class="option-group">
                    <label class="option-label">Quality <span class="option-value" id="qualityValue">80%</span></label>
                    <input type="range" id="compressQuality" class="option-range" min="1" max="100" value="80" 
                           oninput="document.getElementById('qualityValue').textContent = this.value + '%'">
                </div>
                <div class="option-group">
                    <label class="option-label">Output Format</label>
                    <select id="compressFormat" class="option-select">
                        <option value="same">Same as input</option>
                        <option value="image/jpeg">JPEG</option>
                        <option value="image/webp">WebP</option>
                    </select>
                </div>
            `;
            break;
            
        case 'convert-format':
            optionsHTML += `
                <div class="option-group">
                    <label class="option-label">Output Format</label>
                    <select id="convertFormat" class="option-select">
                        <option value="image/jpeg">JPEG</option>
                        <option value="image/png">PNG</option>
                        <option value="image/webp">WebP</option>
                    </select>
                </div>
                <div class="option-group">
                    <label class="option-label">Quality (for JPEG/WebP) <span class="option-value" id="convertQualityValue">90%</span></label>
                    <input type="range" id="convertQuality" class="option-range" min="1" max="100" value="90"
                           oninput="document.getElementById('convertQualityValue').textContent = this.value + '%'">
                </div>
            `;
            break;
            
        case 'blur':
            optionsHTML += `
                <div class="option-group">
                    <label class="option-label">Blur Amount <span class="option-value" id="blurValue">5px</span></label>
                    <input type="range" id="blurAmount" class="option-range" min="1" max="20" value="5"
                           oninput="document.getElementById('blurValue').textContent = this.value + 'px'">
                </div>
            `;
            break;
            
        case 'brightness':
            optionsHTML += `
                <div class="option-group">
                    <label class="option-label">Brightness <span class="option-value" id="brightnessValue">100%</span></label>
                    <input type="range" id="brightnessAmount" class="option-range" min="0" max="200" value="100"
                           oninput="document.getElementById('brightnessValue').textContent = this.value + '%'">
                </div>
            `;
            break;
            
        case 'watermark':
            optionsHTML += `
                <div class="option-group">
                    <label class="option-label">Watermark Text</label>
                    <input type="text" id="watermarkText" class="option-input" placeholder="Enter text" value="© Watermark">
                </div>
                <div class="option-group">
                    <label class="option-label">Position</label>
                    <select id="watermarkPosition" class="option-select">
                        <option value="bottom-right">Bottom Right</option>
                        <option value="bottom-left">Bottom Left</option>
                        <option value="top-right">Top Right</option>
                        <option value="top-left">Top Left</option>
                        <option value="center">Center</option>
                    </select>
                </div>
                <div class="option-group">
                    <label class="option-label">Font Size <span class="option-value" id="fontSizeValue">30px</span></label>
                    <input type="range" id="watermarkFontSize" class="option-range" min="10" max="100" value="30"
                           oninput="document.getElementById('fontSizeValue').textContent = this.value + 'px'">
                </div>
                <div class="option-group">
                    <label class="option-label">Opacity <span class="option-value" id="watermarkOpacityValue">50%</span></label>
                    <input type="range" id="watermarkOpacity" class="option-range" min="10" max="100" value="50"
                           oninput="document.getElementById('watermarkOpacityValue').textContent = this.value + '%'">
                </div>
            `;
            break;
            
        case 'border':
            optionsHTML += `
                <div class="option-group">
                    <label class="option-label">Border Width <span class="option-value" id="borderWidthValue">20px</span></label>
                    <input type="range" id="borderWidth" class="option-range" min="1" max="100" value="20"
                           oninput="document.getElementById('borderWidthValue').textContent = this.value + 'px'">
                </div>
                <div class="option-group">
                    <label class="option-label">Border Color</label>
                    <input type="color" id="borderColor" class="option-input" value="#ffffff">
                </div>
            `;
            break;
            
        case 'collage':
            optionsHTML += `
                <div class="option-group">
                    <label class="option-label">Grid Layout</label>
                    <select id="collageLayout" class="option-select">
                        <option value="2x2">2x2 Grid</option>
                        <option value="3x3">3x3 Grid</option>
                        <option value="4x4">4x4 Grid</option>
                        <option value="auto">Auto (fit all images)</option>
                    </select>
                </div>
                <div class="option-group">
                    <label class="option-label">Spacing <span class="option-value" id="collageSpacingValue">10px</span></label>
                    <input type="range" id="collageSpacing" class="option-range" min="0" max="50" value="10"
                           oninput="document.getElementById('collageSpacingValue').textContent = this.value + 'px'">
                </div>
            `;
            break;
            
        case 'stitch':
            optionsHTML += `
                <div class="option-group">
                    <label class="option-label">Direction</label>
                    <div class="option-radio-group">
                        <div class="option-radio">
                            <input type="radio" id="stitchHorizontal" name="stitchDirection" value="horizontal" checked>
                            <label for="stitchHorizontal">Horizontal (side by side)</label>
                        </div>
                        <div class="option-radio">
                            <input type="radio" id="stitchVertical" name="stitchDirection" value="vertical">
                            <label for="stitchVertical">Vertical (top to bottom)</label>
                        </div>
                    </div>
                </div>
                <div class="option-group">
                    <label class="option-label">Spacing <span class="option-value" id="stitchSpacingValue">0px</span></label>
                    <input type="range" id="stitchSpacing" class="option-range" min="0" max="50" value="0"
                           oninput="document.getElementById('stitchSpacingValue').textContent = this.value + 'px'">
                </div>
            `;
            break;
            
        default:
            optionsHTML = ''; // No options for basic filters like grayscale, sepia, optimize
            optionsContainer.style.display = 'none';
    }
    
    if (optionsHTML) {
        optionsContainer.innerHTML = optionsHTML;
        
        // Add event listeners for dynamic options
        if (tool === 'rotate') {
            document.getElementById('rotateAngle').addEventListener('change', function() {
                document.getElementById('customAngleGroup').style.display = 
                    this.value === 'custom' ? 'block' : 'none';
            });
        }
    }
}

function handleCropPresetChange() {
    const preset = document.getElementById('cropPreset').value;
    const widthInput = document.getElementById('cropWidth');
    const heightInput = document.getElementById('cropHeight');
    
    switch(preset) {
        case 'square':
            widthInput.value = 500;
            heightInput.value = 500;
            break;
        case 'landscape':
            widthInput.value = 800;
            heightInput.value = 450;
            break;
        case 'portrait':
            widthInput.value = 450;
            heightInput.value = 800;
            break;
        case 'instagram':
            widthInput.value = 400;
            heightInput.value = 500;
            break;
    }
}

// ==================== Image Processing ====================

async function processImages() {
    if (uploadedFiles.length === 0) {
        showToast('Please upload at least one image', 'error');
        return;
    }
    
    showLoading('Processing images...');
    processedResults = [];
    
    try {
        for (const file of uploadedFiles) {
            const result = await processImageByTool(file, currentTool);
            if (result) {
                processedResults.push(result);
            }
        }
        
        if (processedResults.length > 0) {
            displayResults();
            showToast('Processing complete!', 'success');
        } else {
            showToast('Processing failed', 'error');
        }
    } catch (error) {
        console.error('Processing error:', error);
        showToast('Error: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function processImageByTool(file, tool) {
    const img = await loadImage(file);
    
    switch(tool) {
        case 'resize':
            return await resizeImage(img, file.name);
        case 'crop':
            return await cropImage(img, file.name);
        case 'rotate':
            return await rotateImage(img, file.name);
        case 'flip':
            return await flipImage(img, file.name);
        case 'compress':
            return await compressImage(img, file.name);
        case 'optimize':
            return await optimizeImage(img, file.name);
        case 'convert-format':
            return await convertFormat(img, file.name);
        case 'to-base64':
            return await convertToBase64(img, file);
        case 'grayscale':
            return await applyGrayscale(img, file.name);
        case 'sepia':
            return await applySepia(img, file.name);
        case 'blur':
            return await applyBlur(img, file.name);
        case 'brightness':
            return await applyBrightness(img, file.name);
        case 'watermark':
            return await addWatermark(img, file.name);
        case 'border':
            return await addBorder(img, file.name);
        case 'collage':
            // Collage needs all images at once
            return null;
        case 'stitch':
            // Stitch needs all images at once
            return null;
        default:
            return null;
    }
}

// Special handling for multi-image tools
async function processMultiImageTools() {
    const images = await Promise.all(uploadedFiles.map(file => loadImage(file)));
    
    if (currentTool === 'collage') {
        return await createCollage(images);
    } else if (currentTool === 'stitch') {
        return await stitchImages(images);
    }
}

// ==================== Image Processing Functions ====================

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function resizeImage(img, fileName) {
    const width = parseInt(document.getElementById('resizeWidth').value) || null;
    const height = parseInt(document.getElementById('resizeHeight').value) || null;
    const maintainAspect = document.getElementById('maintainAspect').checked;
    
    if (!width && !height) {
        throw new Error('Please specify at least width or height');
    }
    
    let newWidth = width;
    let newHeight = height;
    
    if (maintainAspect) {
        const aspectRatio = img.width / img.height;
        if (width && !height) {
            newHeight = Math.round(width / aspectRatio);
        } else if (height && !width) {
            newWidth = Math.round(height * aspectRatio);
        }
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = newWidth || width;
    canvas.height = newHeight || height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    
    const blob = await canvasToBlob(canvas);
    return { blob, fileName: `resized_${fileName}`, preview: canvas.toDataURL() };
}

async function cropImage(img, fileName) {
    const x = parseInt(document.getElementById('cropX').value) || 0;
    const y = parseInt(document.getElementById('cropY').value) || 0;
    const width = parseInt(document.getElementById('cropWidth').value);
    const height = parseInt(document.getElementById('cropHeight').value);
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, x, y, width, height, 0, 0, width, height);
    
    const blob = await canvasToBlob(canvas);
    return { blob, fileName: `cropped_${fileName}`, preview: canvas.toDataURL() };
}

async function rotateImage(img, fileName) {
    let angle = document.getElementById('rotateAngle').value;
    if (angle === 'custom') {
        angle = parseInt(document.getElementById('customAngle').value) || 0;
    } else {
        angle = parseInt(angle);
    }
    
    const canvas = document.createElement('canvas');
    const radians = (angle * Math.PI) / 180;
    
    // Adjust canvas size for rotation
    if (angle === 90 || angle === 270) {
        canvas.width = img.height;
        canvas.height = img.width;
    } else {
        canvas.width = img.width;
        canvas.height = img.height;
    }
    
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(radians);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    
    const blob = await canvasToBlob(canvas);
    return { blob, fileName: `rotated_${fileName}`, preview: canvas.toDataURL() };
}

async function flipImage(img, fileName) {
    const direction = document.querySelector('input[name="flipDirection"]:checked').value;
    
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    
    ctx.save();
    
    if (direction === 'horizontal' || direction === 'both') {
        ctx.scale(-1, 1);
        ctx.translate(-canvas.width, 0);
    }
    if (direction === 'vertical' || direction === 'both') {
        ctx.scale(1, -1);
        ctx.translate(0, -canvas.height);
    }
    if (direction === 'both') {
        ctx.scale(-1, -1);
        ctx.translate(-canvas.width, -canvas.height);
    }
    
    ctx.drawImage(img, 0, 0);
    ctx.restore();
    
    const blob = await canvasToBlob(canvas);
    return { blob, fileName: `flipped_${fileName}`, preview: canvas.toDataURL() };
}

async function compressImage(img, fileName) {
    const quality = parseInt(document.getElementById('compressQuality').value) / 100;
    let format = document.getElementById('compressFormat').value;
    
    if (format === 'same') {
        format = fileName.match(/\.(jpg|jpeg)$/i) ? 'image/jpeg' : 
                 fileName.match(/\.webp$/i) ? 'image/webp' : 'image/jpeg';
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    
    const blob = await canvasToBlob(canvas, format, quality);
    const ext = format.split('/')[1];
    return { blob, fileName: `compressed_${fileName.replace(/\.[^.]+$/, '')}.${ext}`, preview: canvas.toDataURL() };
}

async function optimizeImage(img, fileName) {
    // Auto optimize: resize if too large, compress to WebP
    let targetWidth = img.width;
    let targetHeight = img.height;
    
    // Resize if larger than 1920px
    if (img.width > 1920 || img.height > 1920) {
        const aspectRatio = img.width / img.height;
        if (img.width > img.height) {
            targetWidth = 1920;
            targetHeight = Math.round(1920 / aspectRatio);
        } else {
            targetHeight = 1920;
            targetWidth = Math.round(1920 * aspectRatio);
        }
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    
    const blob = await canvasToBlob(canvas, 'image/webp', 0.85);
    return { blob, fileName: `optimized_${fileName.replace(/\.[^.]+$/, '')}.webp`, preview: canvas.toDataURL() };
}

async function convertFormat(img, fileName) {
    const format = document.getElementById('convertFormat').value;
    const quality = parseInt(document.getElementById('convertQuality').value) / 100;
    
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    
    const blob = await canvasToBlob(canvas, format, quality);
    const ext = format.split('/')[1];
    return { blob, fileName: `${fileName.replace(/\.[^.]+$/, '')}.${ext}`, preview: canvas.toDataURL() };
}

async function convertToBase64(img, file) {
    const reader = new FileReader();
    return new Promise((resolve) => {
        reader.onload = (e) => {
            const base64 = e.target.result;
            resolve({ 
                base64, 
                fileName: `${file.name}_base64.txt`,
                isBase64: true
            });
        };
        reader.readAsDataURL(file);
    });
}

async function applyGrayscale(img, fileName) {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        data[i] = avg;
        data[i + 1] = avg;
        data[i + 2] = avg;
    }
    
    ctx.putImageData(imageData, 0, 0);
    const blob = await canvasToBlob(canvas);
    return { blob, fileName: `grayscale_${fileName}`, preview: canvas.toDataURL() };
}

async function applySepia(img, fileName) {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        data[i] = Math.min(255, (r * 0.393) + (g * 0.769) + (b * 0.189));
        data[i + 1] = Math.min(255, (r * 0.349) + (g * 0.686) + (b * 0.168));
        data[i + 2] = Math.min(255, (r * 0.272) + (g * 0.534) + (b * 0.131));
    }
    
    ctx.putImageData(imageData, 0, 0);
    const blob = await canvasToBlob(canvas);
    return { blob, fileName: `sepia_${fileName}`, preview: canvas.toDataURL() };
}

async function applyBlur(img, fileName) {
    const blurAmount = parseInt(document.getElementById('blurAmount').value);
    
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    
    ctx.filter = `blur(${blurAmount}px)`;
    ctx.drawImage(img, 0, 0);
    
    const blob = await canvasToBlob(canvas);
    return { blob, fileName: `blurred_${fileName}`, preview: canvas.toDataURL() };
}

async function applyBrightness(img, fileName) {
    const brightness = parseInt(document.getElementById('brightnessAmount').value);
    
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    
    ctx.filter = `brightness(${brightness}%)`;
    ctx.drawImage(img, 0, 0);
    
    const blob = await canvasToBlob(canvas);
    return { blob, fileName: `brightness_${fileName}`, preview: canvas.toDataURL() };
}

async function addWatermark(img, fileName) {
    const text = document.getElementById('watermarkText').value;
    const position = document.getElementById('watermarkPosition').value;
    const fontSize = parseInt(document.getElementById('watermarkFontSize').value);
    const opacity = parseInt(document.getElementById('watermarkOpacity').value) / 100;
    
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    
    ctx.font = `${fontSize}px Arial`;
    ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.strokeStyle = `rgba(0, 0, 0, ${opacity * 0.5})`;
    ctx.lineWidth = 2;
    
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const textHeight = fontSize;
    
    let x, y;
    const padding = 20;
    
    switch(position) {
        case 'bottom-right':
            x = canvas.width - textWidth - padding;
            y = canvas.height - padding;
            break;
        case 'bottom-left':
            x = padding;
            y = canvas.height - padding;
            break;
        case 'top-right':
            x = canvas.width - textWidth - padding;
            y = textHeight + padding;
            break;
        case 'top-left':
            x = padding;
            y = textHeight + padding;
            break;
        case 'center':
            x = (canvas.width - textWidth) / 2;
            y = (canvas.height + textHeight) / 2;
            break;
    }
    
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
    
    const blob = await canvasToBlob(canvas);
    return { blob, fileName: `watermarked_${fileName}`, preview: canvas.toDataURL() };
}

async function addBorder(img, fileName) {
    const borderWidth = parseInt(document.getElementById('borderWidth').value);
    const borderColor = document.getElementById('borderColor').value;
    
    const canvas = document.createElement('canvas');
    canvas.width = img.width + (borderWidth * 2);
    canvas.height = img.height + (borderWidth * 2);
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = borderColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, borderWidth, borderWidth);
    
    const blob = await canvasToBlob(canvas);
    return { blob, fileName: `bordered_${fileName}`, preview: canvas.toDataURL() };
}

async function createCollage(images) {
    const layout = document.getElementById('collageLayout').value;
    const spacing = parseInt(document.getElementById('collageSpacing').value);
    
    let cols, rows;
    if (layout === 'auto') {
        cols = Math.ceil(Math.sqrt(images.length));
        rows = Math.ceil(images.length / cols);
    } else {
        [rows, cols] = layout.split('x').map(Number);
    }
    
    const cellWidth = 300;
    const cellHeight = 300;
    
    const canvas = document.createElement('canvas');
    canvas.width = (cellWidth * cols) + (spacing * (cols - 1));
    canvas.height = (cellHeight * rows) + (spacing * (rows - 1));
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    for (let i = 0; i < Math.min(images.length, rows * cols); i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = col * (cellWidth + spacing);
        const y = row * (cellHeight + spacing);
        
        ctx.drawImage(images[i], x, y, cellWidth, cellHeight);
    }
    
    const blob = await canvasToBlob(canvas);
    return { blob, fileName: 'collage.png', preview: canvas.toDataURL() };
}

async function stitchImages(images) {
    const direction = document.querySelector('input[name="stitchDirection"]:checked').value;
    const spacing = parseInt(document.getElementById('stitchSpacing').value);
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (direction === 'horizontal') {
        const maxHeight = Math.max(...images.map(img => img.height));
        const totalWidth = images.reduce((sum, img) => sum + img.width, 0) + (spacing * (images.length - 1));
        
        canvas.width = totalWidth;
        canvas.height = maxHeight;
        
        let x = 0;
        for (const img of images) {
            ctx.drawImage(img, x, (maxHeight - img.height) / 2);
            x += img.width + spacing;
        }
    } else {
        const maxWidth = Math.max(...images.map(img => img.width));
        const totalHeight = images.reduce((sum, img) => sum + img.height, 0) + (spacing * (images.length - 1));
        
        canvas.width = maxWidth;
        canvas.height = totalHeight;
        
        let y = 0;
        for (const img of images) {
            ctx.drawImage(img, (maxWidth - img.width) / 2, y);
            y += img.height + spacing;
        }
    }
    
    const blob = await canvasToBlob(canvas);
    return { blob, fileName: 'stitched.png', preview: canvas.toDataURL() };
}

// ==================== Helper Functions ====================

function canvasToBlob(canvas, type = 'image/png', quality = 0.92) {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => {
            resolve(blob);
        }, type, quality);
    });
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// ==================== Display Results ====================

function displayResults() {
    const previewArea = document.getElementById('previewArea');
    const previewContent = document.getElementById('previewContent');
    const previewImages = document.getElementById('previewImages');
    
    previewArea.querySelector('.preview-placeholder').style.display = 'none';
    previewContent.style.display = 'block';
    
    previewImages.innerHTML = '';
    
    // Handle special cases
    if (currentTool === 'to-base64') {
        const result = processedResults[0];
        const textarea = document.createElement('textarea');
        textarea.style.width = '100%';
        textarea.style.height = '200px';
        textarea.style.padding = '12px';
        textarea.style.fontFamily = 'monospace';
        textarea.style.fontSize = '12px';
        textarea.style.background = 'var(--bg-tertiary)';
        textarea.style.color = 'var(--text-primary)';
        textarea.style.border = '1px solid var(--border-color)';
        textarea.style.borderRadius = '6px';
        textarea.value = result.base64;
        textarea.readOnly = true;
        previewImages.appendChild(textarea);
        
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn-download';
        copyBtn.style.marginTop = '12px';
        copyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path></svg> Copy to Clipboard';
        copyBtn.onclick = () => {
            textarea.select();
            document.execCommand('copy');
            showToast('Copied to clipboard!', 'success');
        };
        previewImages.appendChild(copyBtn);
        return;
    }
    
    // Regular image results
    processedResults.forEach((result, index) => {
        const item = document.createElement('div');
        item.className = 'preview-image-item';
        
        const img = document.createElement('img');
        img.src = result.preview;
        img.alt = result.fileName;
        
        const info = document.createElement('div');
        info.className = 'preview-image-info';
        info.textContent = `${result.fileName} (${formatFileSize(result.blob.size)})`;
        
        item.appendChild(img);
        item.appendChild(info);
        previewImages.appendChild(item);
    });
}

function hidePreview() {
    const previewArea = document.getElementById('previewArea');
    const previewContent = document.getElementById('previewContent');
    
    previewArea.querySelector('.preview-placeholder').style.display = 'block';
    previewContent.style.display = 'none';
}

// ==================== Download ====================

function downloadResult() {
    if (currentTool === 'to-base64') {
        const result = processedResults[0];
        const blob = new Blob([result.base64], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.fileName;
        a.click();
        URL.revokeObjectURL(url);
        return;
    }
    
    if (processedResults.length === 1) {
        const result = processedResults[0];
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.fileName;
        a.click();
        URL.revokeObjectURL(url);
    } else {
        // Download multiple files (browser will handle one by one)
        processedResults.forEach((result, index) => {
            setTimeout(() => {
                const url = URL.createObjectURL(result.blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = result.fileName;
                a.click();
                URL.revokeObjectURL(url);
            }, index * 200);
        });
    }
}

// ==================== Multi-image Processing Override ====================

// Override processImages for collage and stitch tools
const originalProcessImages = processImages;
processImages = async function() {
    if (currentTool === 'collage' || currentTool === 'stitch') {
        if (uploadedFiles.length < 2) {
            showToast('Please upload at least 2 images', 'error');
            return;
        }
        
        showLoading('Processing images...');
        
        try {
            const images = await Promise.all(uploadedFiles.map(file => loadImage(file)));
            let result;
            
            if (currentTool === 'collage') {
                result = await createCollage(images);
            } else {
                result = await stitchImages(images);
            }
            
            processedResults = [result];
            displayResults();
            showToast('Processing complete!', 'success');
        } catch (error) {
            console.error('Processing error:', error);
            showToast('Error: ' + error.message, 'error');
        } finally {
            hideLoading();
        }
    } else {
        await originalProcessImages();
    }
};

// ==================== Loading Overlay ====================

function showLoading(text = 'Processing...') {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}
