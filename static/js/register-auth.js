// register-auth.js - Register page specific functionality

function togglePassword() {
    const passwordInput = document.getElementById('password');
    passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
}

// Password validation
const passwordInput = document.getElementById('password');
const passwordRequirements = document.getElementById('passwordRequirements');
const requirements = {
    length: { element: document.getElementById('lengthReq'), test: (p) => p.length >= 8 },
    upper: { element: document.getElementById('upperReq'), test: (p) => /[A-Z]/.test(p) },
    lower: { element: document.getElementById('lowerReq'), test: (p) => /[a-z]/.test(p) },
    number: { element: document.getElementById('numberReq'), test: (p) => /[0-9]/.test(p) }
};

passwordInput.addEventListener('focus', () => {
    passwordRequirements.style.display = 'block';
});

passwordInput.addEventListener('blur', () => {
    if (passwordInput.value === '') {
        passwordRequirements.style.display = 'none';
    }
});

passwordInput.addEventListener('input', () => {
    const password = passwordInput.value;
    let allValid = true;

    for (const req in requirements) {
        const isValid = requirements[req].test(password);
        const element = requirements[req].element;

        if (isValid) {
            element.classList.add('valid');
            element.querySelector('.icon').textContent = '✓';
        } else {
            element.classList.remove('valid');
            element.querySelector('.icon').textContent = '○';
            allValid = false;
        }
    }

    // Enable/disable submit button based on password strength
    const submitBtn = document.getElementById('submitBtn');
    const confirmPassword = document.getElementById('confirm_password').value;

    if (allValid && password === confirmPassword && password !== '') {
        submitBtn.disabled = false;
    } else if (confirmPassword !== '' && password !== confirmPassword) {
        submitBtn.disabled = true;
    }
});

// Confirm password validation
document.getElementById('confirm_password').addEventListener('input', (e) => {
    const password = document.getElementById('password').value;
    const confirmPassword = e.target.value;
    const submitBtn = document.getElementById('submitBtn');

    if (password !== confirmPassword && confirmPassword !== '') {
        e.target.style.borderColor = 'var(--danger-color)';
    } else if (confirmPassword !== '') {
        e.target.style.borderColor = 'var(--success-color)';
    }
});

// Form submission animation
document.getElementById('registerForm').addEventListener('submit', function(e) {
    const btn = document.getElementById('submitBtn');
    const btnText = document.getElementById('btnText');
    btnText.innerHTML = '<div class="loading"></div>';
    btn.style.pointerEvents = 'none';
});

// Input focus animations
const inputs = document.querySelectorAll('input[type="text"], input[type="password"]');
inputs.forEach(input => {
    input.addEventListener('focus', function() {
        this.parentElement.style.transform = 'scale(1.02)';
    });
    input.addEventListener('blur', function() {
        this.parentElement.style.transform = 'scale(1)';
    });
});