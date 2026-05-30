// Check if already logged in
(function() {
    const token = localStorage.getItem('af_token');
    if (token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[0]));
            if (payload.exp > Date.now()) {
                window.location.href = 'index.html';
                return;
            }
        } catch(e) {}
        localStorage.removeItem('af_token');
        localStorage.removeItem('af_user');
    }
})();

const form = document.getElementById('login-form');
const userInput = document.getElementById('login-user');
const passInput = document.getElementById('login-pass');
const errorEl = document.getElementById('login-error');
const btnLogin = document.getElementById('btn-login');
const btnText = document.getElementById('login-btn-text');
const btnLoader = document.getElementById('btn-loader');
const togglePass = document.getElementById('toggle-pass');
const eyeIcon = document.getElementById('eye-icon');

// Toggle password visibility
let passVisible = false;
togglePass.addEventListener('click', () => {
    passVisible = !passVisible;
    passInput.type = passVisible ? 'text' : 'password';
    eyeIcon.setAttribute('data-lucide', passVisible ? 'eye-off' : 'eye');
    lucide.createIcons();
});

// Login form submit
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = userInput.value.trim();
    const password = passInput.value;

    if (!username || !password) {
        showError('Please fill in all fields');
        return;
    }

    setLoading(true);
    errorEl.classList.add('hidden');

    try {
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.success) {
            localStorage.setItem('af_token', data.token);
            localStorage.setItem('af_user', data.user);
            window.location.href = 'index.html';
        } else {
            showError(data.error || 'Invalid credentials');
            passInput.value = '';
            passInput.focus();
        }
    } catch (err) {
        showError('Connection failed. Make sure the server is running.');
    }

    setLoading(false);
});

function showError(msg) {
    errorEl.innerText = msg;
    errorEl.classList.remove('hidden');
}

function setLoading(loading) {
    btnLogin.disabled = loading;
    btnText.style.display = loading ? 'none' : 'inline';
    btnLoader.classList.toggle('hidden', !loading);
}

// Enter key support
passInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') form.dispatchEvent(new Event('submit'));
});
