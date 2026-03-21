// Code Formatter JavaScript - All formatting done on frontend

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    const inputCode = document.getElementById('inputCode');
    const outputCode = document.getElementById('outputCode');

    // Update character count on output change
    outputCode.addEventListener('input', updateCharCount);

    // Enable keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + Enter to format
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            formatStandard();
        }
        // Ctrl/Cmd + Shift + C to copy
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
            e.preventDefault();
            copyFormatted();
        }
    });
});

/**
 * Format code with Postman-style beautify (2-space indentation)
 */
function formatStandard() {
    const inputCode = document.getElementById('inputCode').value.trim();
    const language = document.getElementById('languageSelect').value;

    if (!inputCode) {
        showModal('Error', 'Please enter some code to format');
        return;
    }

    try {
        const outputCode = document.getElementById('outputCode');
        outputCode.value = beautifyCode(inputCode, language);
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
    const inputCode = document.getElementById('inputCode').value.trim();
    const language = document.getElementById('languageSelect').value;

    if (!inputCode) {
        showModal('Error', 'Please enter some code to format');
        return;
    }

    try {
        const outputCode = document.getElementById('outputCode');
        outputCode.value = minifyToOneLine(inputCode, language);
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
 * Copy formatted code to clipboard
 */
function copyFormatted() {
    const outputCode = document.getElementById('outputCode');
    const text = outputCode.value;

    if (!text) {
        showModal('Error', 'No formatted code to copy');
        return;
    }

    // Modern clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => {
                showToast('Code copied to clipboard!', 'success');
            })
            .catch(err => {
                // Fallback to old method
                fallbackCopy(text);
            });
    } else {
        // Fallback for older browsers
        fallbackCopy(text);
    }
}

/**
 * Fallback copy method for older browsers
 */
function fallbackCopy(text) {
    const outputCode = document.getElementById('outputCode');
    outputCode.select();
    outputCode.setSelectionRange(0, 99999); // For mobile devices

    try {
        document.execCommand('copy');
        showToast('Code copied to clipboard!', 'success');
    } catch (err) {
        showModal('Error', 'Failed to copy code. Please copy manually.');
    }
}

/**
 * Paste from clipboard into input area
 */
async function pasteFromClipboard() {
    const inputCode = document.getElementById('inputCode');

    try {
        if (navigator.clipboard && navigator.clipboard.readText) {
            const text = await navigator.clipboard.readText();
            inputCode.value = text;
            showToast('Code pasted from clipboard!', 'success');
        } else {
            // Fallback: focus input and let user paste manually
            inputCode.focus();
            showToast('Please paste using Ctrl+V (Cmd+V on Mac)', 'info');
        }
    } catch (err) {
        // Permission denied or other error
        inputCode.focus();
        showToast('Please paste using Ctrl+V (Cmd+V on Mac)', 'info');
    }
}

/**
 * Clear all input and output
 */
function clearAll() {
    document.getElementById('inputCode').value = '';
    document.getElementById('outputCode').value = '';
    updateCharCount();
}

/**
 * Update character count display
 */
function updateCharCount() {
    const outputCode = document.getElementById('outputCode').value;
    const count = outputCode.length;
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
    const inputCode = document.getElementById('inputCode');

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

    inputCode.value = samples[language] || samples.javascript;
    showToast(`Sample ${language} code loaded`, 'success');
}
