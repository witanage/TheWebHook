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

function openLogoutModal() {
    document.getElementById('logoutModal').classList.add('show');
    document.getElementById('profileDropdown').classList.remove('show');
}

function closeLogoutModal() {
    document.getElementById('logoutModal').classList.remove('show');
}

function confirmLogout() {
    // Close modal first
    closeLogoutModal();

    // Use a small delay to ensure modal closes gracefully
    setTimeout(() => {
        window.location.href = '/logout';
    }, 100);
}

// Backwards compatibility - if any page still calls logout() directly
function logout() {
    openLogoutModal();
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
                    // Show success message in a nice way
                    showToast('Password changed successfully!', 'success');
                    closePasswordModal();
                } else {
                    if (response.status === 401) {
                        document.getElementById('oldPasswordError').textContent = data.error;
                    } else {
                        showToast(data.error || 'Failed to change password', 'error');
                    }
                }
            } catch (error) {
                console.error('Error:', error);
                showToast('Failed to change password', 'error');
            }
        });
    }

    // Close dropdowns when clicking outside
    document.addEventListener('click', (event) => {
        const profileMenu = document.querySelector('.profile-menu');
        const profileDropdown = document.getElementById('profileDropdown');

        if (profileMenu && profileDropdown && !profileMenu.contains(event.target)) {
            profileDropdown.classList.remove('show');
        }
    });

    // Close modals when clicking on overlay
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                // Close the modal by removing 'show' class
                overlay.classList.remove('show');
            }
        });
    });

    // Escape key to close modals
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            // Close all modals
            document.querySelectorAll('.modal-overlay.show').forEach(modal => {
                modal.classList.remove('show');
            });
        }
    });
});

// Toast notification function
function showToast(message, type = 'info') {
    // Remove existing toast if any
    const existingToast = document.getElementById('globalToast');
    if (existingToast) {
        existingToast.remove();
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.id = 'globalToast';
    toast.className = `global-toast global-toast-${type}`;

    // Add icon based on type
    let icon = '';
    switch(type) {
        case 'success':
            icon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            break;
        case 'error':
            icon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
            break;
        case 'warning':
            icon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
            break;
        default:
            icon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    toast.innerHTML = `
        <div class="global-toast-icon">${icon}</div>
        <div class="global-toast-message">${message}</div>
    `;

    document.body.appendChild(toast);

    // Trigger animation
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    // Auto remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}