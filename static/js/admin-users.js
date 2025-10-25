// Admin Users Management JavaScript

// Load stats on page load
document.addEventListener('DOMContentLoaded', function() {
    loadStats();
});

// Load admin statistics
async function loadStats() {
    try {
        const response = await fetch('/api/admin/stats');
        const data = await response.json();

        if (data.success) {
            document.getElementById('totalUsers').textContent = data.stats.total_users;
            document.getElementById('activeUsers').textContent = data.stats.active_users;
            document.getElementById('totalWebhooks').textContent = data.stats.total_webhooks;
            document.getElementById('webhooksToday').textContent = data.stats.webhooks_today;
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Show success modal
function showSuccess(message) {
    document.getElementById('successMessage').textContent = message;
    document.getElementById('successModal').classList.add('active');
}

// Show error modal
function showError(message) {
    document.getElementById('errorMessage').textContent = message;
    document.getElementById('errorModal').classList.add('active');
}

// Close modals
function closeSuccessModal() {
    document.getElementById('successModal').classList.remove('active');
    location.reload();
}

function closeErrorModal() {
    document.getElementById('errorModal').classList.remove('active');
}

// Open create user modal
function openCreateUserModal() {
    document.getElementById('createUserForm').reset();
    document.getElementById('createUserModal').classList.add('active');
}

// Close create user modal
function closeCreateUserModal() {
    document.getElementById('createUserModal').classList.remove('active');
}

// Create new user
async function createUser(event) {
    event.preventDefault();

    const data = {
        username: document.getElementById('newUsername').value,
        password: document.getElementById('newPassword').value,
        status: parseInt(document.getElementById('newUserStatus').value),
        is_admin: parseInt(document.getElementById('newUserAdmin').value)
    };

    try {
        const response = await fetch('/api/admin/users', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            closeCreateUserModal();
            showSuccess(result.message);
        } else {
            showError(result.error);
        }
    } catch (error) {
        console.error('Error:', error);
        showError('Error creating user');
    }
}

// Open edit user modal
function openEditUserModal(userId, username, status, isAdmin) {
    document.getElementById('editUserId').value = userId;
    document.getElementById('editUsername').value = username;
    document.getElementById('editUserStatus').value = status;
    document.getElementById('editUserAdmin').value = isAdmin;
    document.getElementById('editUserModal').classList.add('active');
}

// Close edit user modal
function closeEditUserModal() {
    document.getElementById('editUserModal').classList.remove('active');
}

// Update user
async function updateUser(event) {
    event.preventDefault();

    const userId = document.getElementById('editUserId').value;
    const data = {
        username: document.getElementById('editUsername').value,
        status: parseInt(document.getElementById('editUserStatus').value),
        is_admin: parseInt(document.getElementById('editUserAdmin').value)
    };

    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            closeEditUserModal();
            showSuccess(result.message);
        } else {
            showError(result.error);
        }
    } catch (error) {
        console.error('Error:', error);
        showError('Error updating user');
    }
}

// Toggle user status (active/inactive)
async function toggleUserStatus(userId) {
    try {
        const response = await fetch(`/api/admin/users/${userId}/status`, {
            method: 'PUT'
        });

        const result = await response.json();

        if (result.success) {
            showSuccess(result.message);
        } else {
            showError(result.error);
        }
    } catch (error) {
        console.error('Error:', error);
        showError('Error toggling user status');
    }
}

// Open reset password modal
function openResetPasswordModal(userId, username) {
    document.getElementById('resetUserId').value = userId;
    document.getElementById('resetUsername').textContent = username;
    document.getElementById('resetPasswordForm').reset();
    document.getElementById('resetPasswordModal').classList.add('active');
}

// Close reset password modal
function closeResetPasswordModal() {
    document.getElementById('resetPasswordModal').classList.remove('active');
}

// Reset user password
async function resetPassword(event) {
    event.preventDefault();

    const userId = document.getElementById('resetUserId').value;
    const password = document.getElementById('resetNewPassword').value;

    try {
        const response = await fetch(`/api/admin/users/${userId}/password`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ password: password })
        });

        const result = await response.json();

        if (result.success) {
            closeResetPasswordModal();
            showSuccess(result.message);
        } else {
            showError(result.error);
        }
    } catch (error) {
        console.error('Error:', error);
        showError('Error resetting password');
    }
}

// Delete user
async function deleteUser(userId, username) {
    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            showSuccess(result.message);
        } else {
            showError(result.error);
        }
    } catch (error) {
        console.error('Error:', error);
        showError('Error deleting user');
    }
}

// Close modals on outside click
document.addEventListener('DOMContentLoaded', function() {
    const modals = ['createUserModal', 'resetPasswordModal', 'editUserModal', 'successModal', 'errorModal'];

    modals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.addEventListener('click', function(e) {
                if (e.target === this) {
                    this.classList.remove('active');
                }
            });
        }
    });
});

// Close modals on ESC key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeCreateUserModal();
        closeResetPasswordModal();
        closeEditUserModal();
        closeErrorModal();
    }
});