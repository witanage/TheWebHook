// Code Formatter JavaScript - Unified interface for code formatting and translation

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    const inputEditor = document.getElementById('inputEditor');
    const outputEditor = document.getElementById('outputEditor');

    // Auto-resize function
    function autoResize(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.max(200, textarea.scrollHeight) + 'px';
    }

    // Add auto-resize on input
    if (inputEditor) {
        inputEditor.addEventListener('input', function() {
            autoResize(this);
        });
        // Initial resize
        setTimeout(() => autoResize(inputEditor), 100);
    }

    if (outputEditor) {
        outputEditor.addEventListener('input', function() {
            autoResize(this);
            updateCharCount();
        });
        
        // Update character count on output change
        outputEditor.addEventListener('input', updateCharCount);
        
        // Initial resize
        setTimeout(() => autoResize(outputEditor), 100);
    }

    // Enable keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + B to beautify
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
            e.preventDefault();
            formatStandard();
        }
        // Ctrl/Cmd + T to translate
        if ((e.ctrlKey || e.metaKey) && e.key === 't') {
            e.preventDefault();
            translateText();
        }
    });
});

/**
 * Auto-resize output editor
 */
function autoResizeOutput() {
    const outputEditor = document.getElementById('outputEditor');
    if (outputEditor) {
        outputEditor.style.height = 'auto';
        outputEditor.style.height = Math.max(200, outputEditor.scrollHeight) + 'px';
    }
}

/**
 * Format code with Postman-style beautify (2-space indentation)
 */
function formatStandard() {
    const inputEditor = document.getElementById('inputEditor').value.trim();
    const language = document.getElementById('languageSelect').value;

    if (!inputEditor) {
        showModal('Error', 'Please enter some code to format');
        return;
    }

    try {
        const outputEditor = document.getElementById('outputEditor');
        outputEditor.value = beautifyCode(inputEditor, language);
        autoResizeOutput();
        updateCharCount();
        showToast('Code beautified successfully!', 'success');
    } catch (error) {
        showModal('Error', 'Failed to format code: ' + error.message);
    }
}

/**
 * Convert code to one line
 */
function formatOneLine() {
    const inputEditor = document.getElementById('inputEditor').value.trim();
    const language = document.getElementById('languageSelect').value;

    if (!inputEditor) {
        showModal('Error', 'Please enter some code to format');
        return;
    }

    try {
        const outputEditor = document.getElementById('outputEditor');
        outputEditor.value = minifyToOneLine(inputEditor, language);
        autoResizeOutput();
        updateCharCount();
        showToast('Code converted to one line!', 'success');
    } catch (error) {
        showModal('Error', 'Failed to convert code: ' + error.message);
    }
}

/**
 * Beautify code with 2-space indentation (Postman-style)
 */
function beautifyCode(code, language) {
    // Special handling for JSON
    if (language === 'json') {
        try {
            const parsed = JSON.parse(code);
            return JSON.stringify(parsed, null, 2);
        } catch (e) {
            // Fall through to regular formatting if JSON parsing fails
        }
    }

    // First, split code by common delimiters to ensure proper line breaks
    if (['javascript', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'swift', 'kotlin', 'typescript', 'css', 'scss', 'less', 'php'].includes(language)) {
        // Add line breaks after opening braces and before closing braces
        code = code.replace(/\{/g, '{\n');
        code = code.replace(/\}/g, '\n}\n');
        code = code.replace(/;/g, ';\n');
        // Clean up multiple newlines
        code = code.replace(/\n+/g, '\n');
    }

    const lines = code.split('\n');
    const formattedLines = [];
    let indentLevel = 0;
    const indentChar = '  '; // 2 spaces (Postman/Beautify style)

    for (let line of lines) {
        const stripped = line.trim();

        if (!stripped) {
            continue;
        }

        // Decrease indent for closing braces/brackets
        if (['javascript', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'swift', 'kotlin', 'typescript', 'css', 'scss', 'less', 'php', 'json'].includes(language)) {
            if (stripped.startsWith('}') || stripped.startsWith(']')) {
                indentLevel = Math.max(0, indentLevel - 1);
            }
        } else if (language === 'python') {
            // Python indentation based on dedent keywords
            if (stripped.startsWith('elif ') || stripped.startsWith('else:') || stripped.startsWith('except') || stripped.startsWith('finally:')) {
                indentLevel = Math.max(0, indentLevel - 1);
            }
        } else if (['html', 'xml'].includes(language)) {
            if (stripped.startsWith('</')) {
                indentLevel = Math.max(0, indentLevel - 1);
            }
        }

        // Add indented line
        formattedLines.push(indentChar.repeat(indentLevel) + stripped);

        // Increase indent for opening braces/brackets
        if (['javascript', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'swift', 'kotlin', 'typescript', 'css', 'scss', 'less', 'php', 'json'].includes(language)) {
            if (stripped.endsWith('{') || stripped.endsWith('[')) {
                indentLevel++;
            }
            // Handle closing and opening on same line like "}, {"
            if (/\},\s*\{/.test(stripped)) {
                indentLevel = Math.max(0, indentLevel - 1);
            }
        } else if (language === 'python') {
            // Python indentation based on colon
            if (stripped.endsWith(':')) {
                indentLevel++;
            }
        } else if (['html', 'xml'].includes(language)) {
            // HTML/XML opening tags
            if (/^<[^/][^>]*>$/.test(stripped) && !/^<[^>]*\/>$/.test(stripped)) {
                indentLevel++;
            }
        } else if (language === 'sql') {
            // SQL formatting - major keywords on new lines
            const upperStripped = stripped.toUpperCase();
            if (['FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'GROUP BY', 'ORDER BY', 'HAVING'].some(kw => upperStripped.startsWith(kw))) {
                indentLevel = 1;
            }
        }
    }

    let formatted = formattedLines.join('\n');

    // Clean up excessive blank lines
    formatted = formatted.replace(/\n{3,}/g, '\n\n');

    return formatted;
}

/**
 * Minify code to a single line
 */
function minifyToOneLine(code, language) {
    // Remove comments based on language
    if (['javascript', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'swift', 'kotlin', 'typescript'].includes(language)) {
        // Remove single-line comments
        code = code.replace(/\/\/.*?$/gm, '');
        // Remove multi-line comments
        code = code.replace(/\/\*.*?\*\//gs, '');
    } else if (['python', 'ruby', 'bash', 'shell'].includes(language)) {
        // Remove single-line comments
        code = code.replace(/#.*?$/gm, '');
    } else if (language === 'sql') {
        // Remove SQL comments
        code = code.replace(/--.*?$/gm, '');
        code = code.replace(/\/\*.*?\*\//gs, '');
    } else if (['html', 'xml'].includes(language)) {
        // Remove HTML/XML comments
        code = code.replace(/<!--.*?-->/gs, '');
    } else if (['css', 'scss', 'less'].includes(language)) {
        // Remove CSS comments
        code = code.replace(/\/\*.*?\*\//gs, '');
    }

    // Replace multiple spaces with single space
    code = code.replace(/[ \t]+/g, ' ');

    // Remove all newlines and replace with space
    code = code.replace(/\n+/g, ' ');

    // Remove spaces around operators and special characters (language-specific)
    if (['javascript', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'swift', 'kotlin', 'typescript'].includes(language)) {
        code = code.replace(/\s*([{}();,:])\s*/g, '$1');
        code = code.replace(/\s*([=+\-*/<>!&|])\s*/g, '$1');
    } else if (language === 'python') {
        // Python needs spaces around operators
        code = code.replace(/\s*([{}();,:])\s*/g, '$1');
    }

    // Clean up extra spaces
    code = code.replace(/\s+/g, ' ');
    code = code.trim();

    return code;
}

/**
 * Copy output to clipboard
 */
function copyOutput() {
    const outputEditor = document.getElementById('outputEditor');
    const text = outputEditor.value;

    if (!text) {
        showModal('Error', 'No output to copy');
        return;
    }

    copyToClipboard(text, 'Copied to clipboard!');
}

/**
 * Generic copy to clipboard function
 */
function copyToClipboard(text, successMessage) {
    // Modern clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => {
                showToast(successMessage, 'success');
            })
            .catch(err => {
                // Fallback to old method
                fallbackCopy(text, successMessage);
            });
    } else {
        // Fallback for older browsers
        fallbackCopy(text, successMessage);
    }
}

/**
 * Fallback copy method for older browsers
 */
function fallbackCopy(text, successMessage) {
    const tempTextarea = document.createElement('textarea');
    tempTextarea.value = text;
    tempTextarea.style.position = 'fixed';
    tempTextarea.style.opacity = '0';
    document.body.appendChild(tempTextarea);
    tempTextarea.select();
    tempTextarea.setSelectionRange(0, 99999);

    try {
        document.execCommand('copy');
        showToast(successMessage || 'Copied to clipboard!', 'success');
    } catch (err) {
        showModal('Error', 'Failed to copy. Please copy manually.');
    }

    document.body.removeChild(tempTextarea);
}

/**
 * Paste from clipboard into input area
 */
async function pasteFromClipboard() {
    const inputEditor = document.getElementById('inputEditor');

    try {
        if (navigator.clipboard && navigator.clipboard.readText) {
            const text = await navigator.clipboard.readText();
            inputEditor.value = text;
            autoResizeOutput();
            showToast('Pasted from clipboard!', 'success');
        } else {
            // Fallback: focus input and let user paste manually
            inputEditor.focus();
            showToast('Please paste using Ctrl+V (Cmd+V on Mac)', 'info');
        }
    } catch (err) {
        // Permission denied or other error
        inputEditor.focus();
        showToast('Please paste using Ctrl+V (Cmd+V on Mac)', 'info');
    }
}

/**
 * Clear all input and output
 */
function clearAll() {
    const inputEditor = document.getElementById('inputEditor');
    const outputEditor = document.getElementById('outputEditor');
    
    inputEditor.value = '';
    outputEditor.value = '';
    
    // Reset heights
    inputEditor.style.height = '200px';
    outputEditor.style.height = '200px';
    
    updateCharCount();
}

/**
 * Update character count display
 */
function updateCharCount() {
    const outputEditor = document.getElementById('outputEditor').value;
    const count = outputEditor.length;
    const charCountElement = document.getElementById('charCount');

    if (charCountElement) {
        charCountElement.textContent = `${count.toLocaleString()} character${count !== 1 ? 's' : ''}`;
    }
}

/**
 * Load sample code for demonstration
 */
function loadSample() {
    const language = document.getElementById('languageSelect').value;
    const inputEditor = document.getElementById('inputEditor');

    const samples = {
        javascript: `function calculateSum(a, b) {
const result = a + b;
console.log("Sum is: " + result);
return result;
}

const numbers = [1, 2, 3, 4, 5];
const total = numbers.reduce((acc, num) => acc + num, 0);`,

        python: `def calculate_sum(a, b):
result = a + b
print(f"Sum is: {result}")
return result

numbers = [1, 2, 3, 4, 5]
total = sum(numbers)`,

        java: `public class Calculator {
public int calculateSum(int a, int b) {
int result = a + b;
System.out.println("Sum is: " + result);
return result;
}
}`,

        html: `<div class="container">
<h1>Welcome</h1>
<p>This is a sample paragraph.</p>
<ul>
<li>Item 1</li>
<li>Item 2</li>
</ul>
</div>`,

        css: `.container {
margin: 0 auto;
padding: 20px;
background-color: #f5f5f5;
}
.container h1 {
color: #333;
font-size: 24px;
}`,

        json: `{"name":"John","age":30,"city":"New York","hobbies":["reading","gaming"]}`,

        sql: `SELECT users.name, orders.total
FROM users
LEFT JOIN orders ON users.id = orders.user_id
WHERE orders.total > 100
ORDER BY orders.total DESC;`
    };

    inputEditor.value = samples[language] || samples.javascript;
    
    // Auto-resize input
    inputEditor.style.height = 'auto';
    inputEditor.style.height = Math.max(200, inputEditor.scrollHeight) + 'px';
    
    showToast(`Sample ${language} code loaded`, 'success');
}

/**
 * Translate text using Google Translate
 */
async function translateText() {
    const inputText = document.getElementById('inputEditor').value.trim();
    const sourceLang = document.getElementById('sourceLanguageSelect').value;
    const targetLang = document.getElementById('targetLanguageSelect').value;

    if (!inputText) {
        showModal('Error', 'Please enter some text to translate');
        return;
    }

    if (sourceLang === targetLang) {
        showModal('Error', 'Source and target languages must be different');
        return;
    }

    try {
        const response = await fetch('/api/code-formatter/translate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: inputText,
                source_lang: sourceLang,
                target_lang: targetLang
            })
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('outputEditor').value = data.translated_text;
            autoResizeOutput();
            updateCharCount();
            showToast('Translation completed!', 'success');
        } else {
            showModal('Translation Error', data.error || 'Failed to translate text.');
        }
    } catch (error) {
        console.error('Translation error:', error);
        showModal('Error', 'Failed to translate text: ' + error.message);
    }
}

/**
 * Swap source and target languages
 */
function swapLanguages() {
    const sourceSelect = document.getElementById('sourceLanguageSelect');
    const targetSelect = document.getElementById('targetLanguageSelect');
    
    const tempValue = sourceSelect.value;
    sourceSelect.value = targetSelect.value;
    targetSelect.value = tempValue;
    
    // Also swap input/output text
    const inputEditor = document.getElementById('inputEditor');
    const outputEditor = document.getElementById('outputEditor');
    
    const tempText = inputEditor.value;
    inputEditor.value = outputEditor.value;
    outputEditor.value = tempText;
    
    // Auto-resize both
    inputEditor.style.height = 'auto';
    inputEditor.style.height = Math.max(200, inputEditor.scrollHeight) + 'px';
    outputEditor.style.height = 'auto';
    outputEditor.style.height = Math.max(200, outputEditor.scrollHeight) + 'px';
    
    updateCharCount();
    showToast('Languages swapped!', 'info');
}

/**
 * Check installed translation language packages
 */
async function checkInstalledLanguages() {
    try {
        const response = await fetch('/api/code-formatter/installed-languages');
        const data = await response.json();

        if (data.success) {
            const languages = data.languages;
            
            const langList = languages.map(l => `✅ ${l.name} (${l.code})`).join('\n');
            showModal('✅ Supported Languages', 
                `Translation supports ${languages.length} languages:\n\n${langList}\n\n` +
                '🌐 Powered by Google Translate\n' +
                '⚠️ Note: Translations are sent to Google servers for processing'
            );
        } else {
            showModal('Error', 'Failed to check installed languages: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error checking languages:', error);
        showModal('Error', 'Failed to check installed languages: ' + error.message);
    }
}
