// Code Formatter JavaScript

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    const inputCode = document.getElementById('inputCode');
    const outputCode = document.getElementById('outputCode');

    // Update character count on output change
    const observer = new MutationObserver(updateCharCount);
    observer.observe(outputCode, { characterData: true, childList: true, subtree: true });

    // Also update on value change
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
 * Format code with IntelliJ-style standards
 */
function formatStandard() {
    const inputCode = document.getElementById('inputCode').value.trim();
    const language = document.getElementById('languageSelect').value;

    if (!inputCode) {
        showModal('Error', 'Please enter some code to format');
        return;
    }

    // Show loading state
    const outputCode = document.getElementById('outputCode');
    outputCode.value = 'Formatting...';

    fetch('/api/code-formatter/format', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            code: inputCode,
            language: language,
            mode: 'standard'
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            outputCode.value = data.formatted_code;
            updateCharCount();
            showToast('Code formatted successfully!', 'success');
        } else {
            outputCode.value = '';
            showModal('Error', data.error || 'Failed to format code');
        }
    })
    .catch(error => {
        outputCode.value = '';
        showModal('Error', 'Network error: ' + error.message);
    });
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

    // Show loading state
    const outputCode = document.getElementById('outputCode');
    outputCode.value = 'Converting to one line...';

    fetch('/api/code-formatter/format', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            code: inputCode,
            language: language,
            mode: 'oneline'
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            outputCode.value = data.formatted_code;
            updateCharCount();
            showToast('Code converted to one line!', 'success');
        } else {
            outputCode.value = '';
            showModal('Error', data.error || 'Failed to convert code');
        }
    })
    .catch(error => {
        outputCode.value = '';
        showModal('Error', 'Network error: ' + error.message);
    });
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
    showToast('Cleared all content', 'info');
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

        sql: `SELECT users.name, orders.total
FROM users
LEFT JOIN orders ON users.id = orders.user_id
WHERE orders.total > 100
ORDER BY orders.total DESC;`
    };

    inputCode.value = samples[language] || samples.javascript;
    showToast(`Sample ${language} code loaded`, 'success');
}
