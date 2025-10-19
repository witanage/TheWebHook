// Global functions available on all pages

function toggleProfileMenu() {
    const dropdown = document.getElementById('profileDropdown');
    dropdown.classList.toggle('show');
}

function openPasswordModal() {
    document.getElementById('passwordModal').classList.add('show');
    document.getElementById('profileDropdown').classList.remove('show');
}

function closePasswordModal() {
    document.getElementById('passwordModal').classList.remove('show');
    document.getElementById('passwordForm').reset();
    document.querySelectorAll('.error').forEach(el => el.textContent = '');
}

function openAboutModal() {
    document.getElementById('aboutModal').classList.add('show');
    document.getElementById('profileDropdown').classList.remove('show');
}

function closeAboutModal() {
    document.getElementById('aboutModal').classList.remove('show');
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        window.location.href = '/logout';
    }
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
document.addEventListener('DOMContentLoaded', function() {
    const passwordForm = document.getElementById('passwordForm');
    if (passwordForm) {
        passwordForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const oldPassword = document.getElementById('oldPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            // Clear previous errors
            document.querySelectorAll('.error').forEach(el => el.textContent = '');

            if (newPassword !== confirmPassword) {
                document.getElementById('confirmPasswordError').textContent = 'Passwords do not match';
                return;
            }

            if (newPassword.length < 6) {
                document.getElementById('newPasswordError').textContent = 'Password must be at least 6 characters';
                return;
            }

            try {
                const response = await fetch('/change_password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        old_password: oldPassword,
                        new_password: newPassword
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    alert('Password changed successfully!');
                    closePasswordModal();
                } else {
                    if (response.status === 401) {
                        document.getElementById('oldPasswordError').textContent = data.error;
                    } else {
                        alert(data.error || 'Failed to change password');
                    }
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Failed to change password');
            }
        });
    }

    // Close dropdowns when clicking outside
    document.addEventListener('click', (event) => {
        const profileMenu = document.querySelector('.profile-menu');
        const profileDropdown = document.getElementById('profileDropdown');

        if (profileMenu && !profileMenu.contains(event.target)) {
            profileDropdown.classList.remove('show');
        }
    });
});