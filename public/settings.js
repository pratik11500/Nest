class SettingsManager {
    constructor() {
        this.token = localStorage.getItem('nestToken');
        this.init();
    }

    init() {
        this.bindEvents();
        this.showSection('account'); // Default to account section
    }

    bindEvents() {
        // Navigation buttons
        document.querySelectorAll('.nav-button').forEach(button => {
            button.addEventListener('click', () => {
                const section = button.dataset.section;
                this.showSection(section);
            });
        });

        // Back to chat
        document.getElementById('backToChat').addEventListener('click', () => {
            window.location.href = '/';
        });

        // Form submissions
        document.getElementById('changePasswordForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.changePassword();
        });

        document.getElementById('changeEmailForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.changeEmail();
        });

        document.getElementById('deleteAccountForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.deleteAccount();
        });
    }

    showSection(section) {
        document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
        document.getElementById(`${section}Section`).classList.remove('hidden');

        document.querySelectorAll('.nav-button').forEach(btn => {
            btn.classList.remove('text-purple-600', 'bg-purple-100');
            btn.classList.add('text-gray-600');
        });
        document.querySelector(`.nav-button[data-section="${section}"]`).classList.add('text-purple-600', 'bg-purple-100');
    }

    async changePassword() {
        const currentPassword = document.getElementById('currentPassword').value.trim();
        const newPassword = document.getElementById('newPassword').value.trim();
        const button = document.getElementById('changePasswordForm').querySelector('button');

        if (!currentPassword || !newPassword) {
            this.showToast('Please fill in all fields', 'error');
            return;
        }
        if (newPassword.length < 6) {
            this.showToast('New password must be at least 6 characters', 'error');
            return;
        }

        button.disabled = true;
        try {
            const res = await fetch('/api/account', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ currentPassword, newPassword })
            });

            const data = await this.handleResponse(res);
            if (!res.ok) throw new Error(data.error || 'Failed to update password');

            this.showToast('Password updated successfully', 'success');
            document.getElementById('changePasswordForm').reset();
        } catch (e) {
            this.showToast(`Failed to update password: ${e.message}`, 'error');
        } finally {
            button.disabled = false;
        }
    }

    async changeEmail() {
        const newEmail = document.getElementById('newEmail').value.trim();
        const emailPassword = document.getElementById('emailPassword').value.trim();
        const button = document.getElementById('changeEmailForm').querySelector('button');

        if (!newEmail || !emailPassword) {
            this.showToast('Please fill in all fields', 'error');
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
            this.showToast('Invalid email format', 'error');
            return;
        }

        button.disabled = true;
        try {
            const res = await fetch('/api/account', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ newEmail, currentPassword: emailPassword })
            });

            const data = await this.handleResponse(res);
            if (!res.ok) throw new Error(data.error || 'Failed to update email');

            this.showToast('Email updated successfully', 'success');
            document.getElementById('changeEmailForm').reset();
        } catch (e) {
            this.showToast(`Failed to update email: ${e.message}`, 'error');
        } finally {
            button.disabled = false;
        }
    }

    async deleteAccount() {
        if (!confirm('Are you sure you want to delete your account? This action is permanent.')) return;

        const deletePassword = document.getElementById('deletePassword').value.trim();
        const button = document.getElementById('deleteAccountForm').querySelector('button');

        if (!deletePassword) {
            this.showToast('Please enter your password', 'error');
            return;
        }

        button.disabled = true;
        try {
            const res = await fetch('/api/account', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ currentPassword: deletePassword })
            });

            const data = await this.handleResponse(res);
            if (!res.ok) throw new Error(data.error || 'Failed to delete account');

            this.showToast('Account deleted successfully', 'success');
            localStorage.removeItem('nestToken');
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
        } catch (e) {
            this.showToast(`Failed to delete account: ${e.message}`, 'error');
        } finally {
            button.disabled = false;
        }
    }

    async handleResponse(res) {
        try {
            return await res.json();
        } catch (e) {
            const text = await res.text();
            console.error('Failed to parse JSON:', e, 'Response:', text);
            throw new Error(`Invalid server response: ${text.slice(0, 100)}...`);
        }
    }

    showToast(message, type = 'success', duration = 4000) {
        const container = document.createElement('div');
        container.className = 'fixed bottom-4 right-4 z-50';
        document.body.appendChild(container);

        const toast = document.createElement('div');
        toast.className = `p-4 rounded shadow-lg transition-all duration-300 ${type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`;
        toast.innerHTML = `<p>${message}</p>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => container.remove(), 300);
        }, duration);
    }
}

const settings = new SettingsManager();