// auth-theme.js - Theme management for login and register pages

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

    // Update particle colors based on theme
    const particles = document.querySelectorAll('.particle');
    particles.forEach(particle => {
        particle.style.background = getComputedStyle(document.documentElement).getPropertyValue('--particle-color');
        particle.style.boxShadow = `0 0 6px ${getComputedStyle(document.documentElement).getPropertyValue('--particle-color')}`;
    });
}

// Initialize theme on page load
document.addEventListener('DOMContentLoaded', function() {
    const savedTheme = localStorage.getItem('selectedTheme') || 'system';
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
        themeSelect.value = savedTheme;
    }
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

// Create floating particles
function createParticles() {
    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 15 + 's';
        particle.style.animationDuration = (15 + Math.random() * 10) + 's';
        document.body.appendChild(particle);
    }
}

// Initialize particles when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createParticles);
} else {
    createParticles();
}