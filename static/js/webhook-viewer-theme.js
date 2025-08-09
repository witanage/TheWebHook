// Theme management functions
function getSystemTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function changeTheme(theme) {
    localStorage.setItem('selectedTheme', theme);
    applyTheme(theme);
}

function applyTheme(theme) {
    let actualTheme = theme;
    if (theme === 'system') {
        actualTheme = getSystemTheme();
    }

    document.documentElement.setAttribute('data-theme', actualTheme);

    // Switch Prism.js theme
    const darkTheme = document.getElementById('prism-dark-theme');
    const lightTheme = document.getElementById('prism-light-theme');

    if (actualTheme === 'light') {
        darkTheme.disabled = true;
        lightTheme.disabled = false;
    } else {
        darkTheme.disabled = false;
        lightTheme.disabled = true;
    }

    // Switch Flatpickr theme
    const darkFlatpickr = document.getElementById('flatpickr-dark-theme');
    const lightFlatpickr = document.getElementById('flatpickr-light-theme');

    if (actualTheme === 'light') {
        darkFlatpickr.disabled = true;
        lightFlatpickr.disabled = false;
    } else {
        darkFlatpickr.disabled = false;
        lightFlatpickr.disabled = true;
    }

    // Re-highlight code if any is displayed
    if (typeof Prism !== 'undefined') {
        Prism.highlightAll();
    }
}

// Initialize theme on page load
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('selectedTheme') || 'system';
    document.getElementById('themeSelect').value = savedTheme;
    applyTheme(savedTheme);
});

// Listen for system theme changes
if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        const currentTheme = localStorage.getItem('selectedTheme') || 'system';
        if (currentTheme === 'system') {
            applyTheme('system');
        }
    });
}