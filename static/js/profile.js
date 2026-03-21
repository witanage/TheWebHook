// Profile Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Tab switching
    initTabs();
    
    // API Token management
    initTokenManagement();
    
    // Password change
    initPasswordChange();
    
    // Settings
    initSettings();
});

// Tab Management
function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            
            // Remove active class from all tabs
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked tab
            this.classList.add('active');
            document.getElementById(`${tabName}-tab`).classList.add('active');
        });
    });
}

// API Token Management
function initTokenManagement() {
    loadTokenStatus();
    
    // Toggle visibility
    document.getElementById('toggle-token-visibility').addEventListener('click', toggleTokenVisibility);
    
    // Copy token
    document.getElementById('copy-token').addEventListener('click', copyToken);
    
    // Generate token
    document.getElementById('generate-token').addEventListener('click', generateToken);
    
    // Regenerate token
    document.getElementById('regenerate-token').addEventListener('click', regenerateToken);
    
    // Delete token
    document.getElementById('delete-token').addEventListener('click', deleteToken);
}

async function loadTokenStatus() {
    const loading = document.getElementById('token-loading');
    const tokenDisplay = document.getElementById('token-display');
    const noToken = document.getElementById('no-token');
    const generateBtn = document.getElementById('generate-token');
    const regenerateBtn = document.getElementById('regenerate-token');
    const deleteBtn = document.getElementById('delete-token');
    
    try {
        const response = await fetch('/api/user/token');
        const data = await response.json();
        
        loading.style.display = 'none';
        
        if (data.success && data.api_token) {
            // Has token
            document.getElementById('token-value').value = data.api_token;
            tokenDisplay.style.display = 'block';
            noToken.style.display = 'none';
            generateBtn.style.display = 'none';
            regenerateBtn.style.display = 'inline-block';
            deleteBtn.style.display = 'inline-block';
        } else {
            // No token
            tokenDisplay.style.display = 'none';
            noToken.style.display = 'block';
            generateBtn.style.display = 'inline-block';
            regenerateBtn.style.display = 'none';
            deleteBtn.style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading token:', error);
        loading.textContent = 'Error loading token status';
    }
}

function toggleTokenVisibility() {
    const tokenInput = document.getElementById('token-value');
    const eyeIcon = document.getElementById('eye-icon');
    
    if (tokenInput.type === 'password') {
        tokenInput.type = 'text';
        eyeIcon.textContent = '🙈';
    } else {
        tokenInput.type = 'password';
        eyeIcon.textContent = '👁️';
    }
}

function copyToken() {
    const tokenInput = document.getElementById('token-value');
    tokenInput.select();
    tokenInput.setSelectionRange(0, 99999); // For mobile devices
    
    navigator.clipboard.writeText(tokenInput.value).then(() => {
        showToast('Token copied to clipboard!', 'success');
    }).catch(err => {
        console.error('Failed to copy:', err);
        showToast('Failed to copy token', 'error');
    });
}

async function generateToken() {
    if (!confirm('Generate a new API token?')) return;
    
    try {
        const response = await fetch('/api/user/token', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('API token generated successfully!', 'success');
            loadTokenStatus();
        } else {
            showToast('Error generating token: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Error generating token:', error);
        showToast('Error generating token', 'error');
    }
}

async function regenerateToken() {
    if (!confirm('Regenerate API token? Your old token will stop working immediately.')) return;
    
    try {
        const response = await fetch('/api/user/token', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('API token regenerated successfully!', 'success');
            loadTokenStatus();
        } else {
            showToast('Error regenerating token: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Error regenerating token:', error);
        showToast('Error regenerating token', 'error');
    }
}

async function deleteToken() {
    if (!confirm('Delete your API token? All API requests using this token will stop working.')) return;
    
    try {
        const response = await fetch('/api/user/token', {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('API token deleted successfully', 'success');
            loadTokenStatus();
        } else {
            showToast('Error deleting token: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Error deleting token:', error);
        showToast('Error deleting token', 'error');
    }
}

// Password Change
function initPasswordChange() {
    const form = document.getElementById('change-password-form');
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const oldPassword = document.getElementById('old-password').value;
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;
        
        // Validation
        if (newPassword.length < 6) {
            showToast('New password must be at least 6 characters', 'error');
            return;
        }
        
        if (newPassword !== confirmPassword) {
            showToast('New passwords do not match', 'error');
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
                showToast('Password changed successfully!', 'success');
                form.reset();
            } else {
                showToast('Error: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Error changing password:', error);
            showToast('Error changing password', 'error');
        }
    });
}

// Settings
function initSettings() {
    const form = document.getElementById('settings-form');
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const defaultApp = document.getElementById('default-app-select').value;
        
        try {
            const response = await fetch('/api/set-default-app', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    default_app: defaultApp
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                showToast('Settings saved successfully!', 'success');
            } else {
                showToast('Error: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            showToast('Error saving settings', 'error');
        }
    });
}

// Toast notification function
function showToast(message, type = 'info') {
    // Check if showToast is available from global-functions.js
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
        return;
    }
    
    // Fallback toast implementation
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type === 'success' ? 'success' : 'error'}`;
    alertDiv.textContent = message;
    
    // Insert at top of profile container
    const container = document.querySelector('.profile-container');
    container.insertBefore(alertDiv, container.firstChild);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}
