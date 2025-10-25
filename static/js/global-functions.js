// Global functions available on all pages

function toggleProfileMenu() {
    const dropdown = document.getElementById('profileDropdown');
    dropdown.classList.toggle('show');
}

function openPasswordModal() {
    document.getElementById('passwordModal').classList.add('active');
    document.getElementById('profileDropdown').classList.remove('show');
}

function closePasswordModal() {
    document.getElementById('passwordModal').classList.remove('active');
    document.getElementById('passwordForm').reset();
    document.querySelectorAll('.error').forEach(el => el.textContent = '');
}

function openAboutModal() {
    document.getElementById('aboutModal').classList.add('active');
    document.getElementById('profileDropdown').classList.remove('show');
}

function closeAboutModal() {
    document.getElementById('aboutModal').classList.remove('active');
}

function openLogoutModal() {
    document.getElementById('logoutModal').classList.add('active');
    document.getElementById('profileDropdown').classList.remove('show');
}

function closeLogoutModal() {
    document.getElementById('logoutModal').classList.remove('active');
}

function confirmLogout() {
    window.location.href = '/logout';
}

function changeTheme(theme) {
    localStorage.setItem('selectedTheme', theme);

    let actualTheme = theme;
    if (theme === 'system') {
        actualTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    document.documentElement.setAttribute('data-theme', actualTheme);
}

// Listen for system theme changes
if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        const currentTheme = localStorage.getItem('selectedTheme') || 'system';
        if (currentTheme === 'system') {
            document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        }
    });
}

// Password form submission
function changePassword(event) {
    event.preventDefault();

    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
        showModal('Error', 'Passwords do not match');
        return;
    }

    if (newPassword.length < 6) {
        showModal('Error', 'Password must be at least 6 characters');
        return;
    }

    fetch('/change_password', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            old_password: currentPassword,
            new_password: newPassword
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.message) {
            showModal('Success', data.message, closePasswordModal);
        } else if (data.error) {
            showModal('Error', data.error);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showModal('Error', 'Failed to change password');
    });
}

document.addEventListener('DOMContentLoaded', function() {

    // Close dropdowns when clicking outside
    document.addEventListener('click', (event) => {
        const profileMenu = document.querySelector('.profile-menu');
        const profileDropdown = document.getElementById('profileDropdown');

        if (profileMenu && !profileMenu.contains(event.target)) {
            profileDropdown.classList.remove('show');
        }
    });
});