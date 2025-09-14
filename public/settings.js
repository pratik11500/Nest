class SettingsManager {
    constructor() {
        this.currentUser = null;
        this.token = localStorage.getItem('nestToken');
        this.init();
    }

    async init() {
        if (!this.token) {
            this.redirectToLogin();
            return;
        }
        await this.loadUser();
        this.bindEvents();
        this.showSection('account');
    }

    async loadUser() {
        try {
            const res = await fetch('/api/me', {
                headers: { Authorization: `Bearer ${this.token}` }
            });
            if (!res.ok) throw new Error('Failed to fetch user');
            this.currentUser = await res.json();
            this.updateProfileForm();
        } catch (e) {
            console.error('Error loading user:', e);
            this.showToast('Failed to load user data', 'error');
            this.redirectToLogin();
        }
    }

    updateProfileForm() {
        const usernameInput = document.getElementById('username');
        const bioInput = document.getElementById('bio');
        const profilePictureInput = document.getElementById('profilePicture');
        const profilePictureImg = document.getElementById('profilePictureImg');
        const profileInitials = document.getElementById('profileInitials');

        if (this.currentUser) {
            usernameInput.value = this.currentUser.username;
            bioInput.value = this.currentUser.bio || '';
            if (this.currentUser.profile_picture) {
                profilePictureImg.src = this.currentUser.profile_picture;
                profilePictureImg.style.display = 'block';
                profileInitials.style.display = 'none';
            } else {
                profileInitials.textContent = this.getInitials(this.currentUser.username);
                profileInitials.style.display = 'flex';
                profilePictureImg.style.display = 'none';
            }

            profilePictureInput.addEventListener('change', () => {
                const file = profilePictureInput.files[0];
                if (file) {
                    if (file.size > 2 * 1024 * 1024) {
                        this.showToast('Image size must be less than 2MB', 'error');
                        profilePictureInput.value = '';
                        return;
                    }
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        profilePictureImg.src = e.target.result;
                        profilePictureImg.style.display = 'block';
                        profileInitials.style.display = 'none';
                    };
                    reader.readAsDataURL(file);
                }
            });
        }
    }

    bindEvents() {
        document.querySelectorAll('.nav-button').forEach(button => {
            button.addEventListener('click', () => {
                const section = button.dataset.section;
                this.showSection(section);
            });
        });

        document.getElementById('backToChat').addEventListener('click', () => {
            window.location.href = '/';
        });

        document.getElementById('changePasswordForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleChangePassword();
        });

        document.getElementById('changeEmailForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleChangeEmail();
        });

        document.getElementById('deleteAccountForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleDeleteAccount();
        });

        document.getElementById('updateProfileForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleUpdateProfile();
        });
    }

    showSection(section) {
        document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
        document.getElementById(`${section}Section`).classList.remove('hidden');
        document.querySelectorAll('.nav-button').forEach(b => b.classList.remove('active'));
        document.querySelector(`.nav-button[data-section="${section}"]`).classList.add('active');
    }

    async handleChangePassword() {
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const button = document.getElementById('changePasswordForm').querySelector('button');

        if (!currentPassword || !newPassword) {
            this.showToast('Please fill in all fields', 'error');
            return;
        }

        if (newPassword.length < 6) {
            this.showToast('New password must be at least 6 characters', 'error');
            return;
        }

        button.classList.add('loading');

        try {
            const res = await fetch('/api/account', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.token}`
                },
                body: JSON.stringify({ currentPassword, newPassword })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to update password');
            this.showToast('Password updated successfully', 'success');
            document.getElementById('changePasswordForm').reset();
        } catch (e) {
            this.showToast(e.message || 'Failed to update password', 'error');
        } finally {
            button.classList.remove('loading');
        }
    }

    async handleChangeEmail() {
        const newEmail = document.getElementById('newEmail').value;
        const emailPassword = document.getElementById('emailPassword').value;
        const button = document.getElementById('changeEmailForm').querySelector('button');

        if (!newEmail || !emailPassword) {
            this.showToast('Please fill in all fields', 'error');
            return;
        }

        button.classList.add('loading');

        try {
            const res = await fetch('/api/account', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.token}`
                },
                body: JSON.stringify({ email: newEmail, currentPassword: emailPassword })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to update email');
            this.showToast('Email updated successfully', 'success');
            document.getElementById('changeEmailForm').reset();
            this.currentUser.email = newEmail;
        } catch (e) {
            this.showToast(e.message || 'Failed to update email', 'error');
        } finally {
            button.classList.remove('loading');
        }
    }

    async handleDeleteAccount() {
        if (!confirm('Are you sure you want to delete your account? This action is permanent.')) return;

        const deletePassword = document.getElementById('deletePassword').value;
        const button = document.getElementById('deleteAccountForm').querySelector('button');

        if (!deletePassword) {
            this.showToast('Please enter your password', 'error');
            return;
        }

        button.classList.add('loading');

        try {
            const res = await fetch('/api/account', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.token}`
                },
                body: JSON.stringify({ currentPassword: deletePassword })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to delete account');
            this.showToast('Account deleted successfully', 'success');
            localStorage.removeItem('nestToken');
            setTimeout(() => this.redirectToLogin(), 1000);
        } catch (e) {
            this.showToast(e.message || 'Failed to delete account', 'error');
        } finally {
            button.classList.remove('loading');
        }
    }

    async handleUpdateProfile() {
        const username = document.getElementById('username').value.trim();
        const bio = document.getElementById('bio').value.trim();
        const profilePicture = document.getElementById('profilePicture').files[0];
        const button = document.getElementById('updateProfileForm').querySelector('button');

        if (!username) {
            this.showToast('Username is required', 'error');
            return;
        }

        if (username.length < 3) {
            this.showToast('Username must be at least 3 characters', 'error');
            return;
        }

        if (bio.length > 160) {
            this.showToast('Bio cannot exceed 160 characters', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('username', username);
        formData.append('bio', bio);
        if (profilePicture) {
            formData.append('profilePicture', profilePicture);
        }

        button.classList.add('loading');

        try {
            const res = await fetch('/api/account', {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${this.token}` },
                body: formData
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to update profile');
            this.currentUser = { ...this.currentUser, username, bio, profile_picture: data.profile_picture };
            this.updateProfileForm();
            this.showToast('Profile updated successfully', 'success');
            document.getElementById('profilePicture').value = '';
        } catch (e) {
            this.showToast(e.message || 'Failed to update profile', 'error');
        } finally {
            button.classList.remove('loading');
        }
    }

    getInitials(name) {
        return name.split(' ').map(word => word.charAt(0)).join('').toUpperCase().slice(0, 2);
    }

    showToast(message, type = 'success', duration = 4000) {
        const container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <div class="toast-icon">
                    ${this.getToastIcon(type)}
                </div>
                <div class="toast-text">
                    <h4>${this.getToastTitle(type)}</h4>
                    <p>${message}</p>
                </div>
            </div>
        `;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (container.contains(toast)) {
                    container.removeChild(toast);
                }
                if (document.body.contains(container)) {
                    document.body.removeChild(container);
                }
            }, 300);
        }, duration);
    }

    getToastIcon(type) {
        const icons = {
            success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
            error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
            warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>',
            info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>'
        };
        return icons[type] || icons.info;
    }

    getToastTitle(type) {
        const titles = {
            success: 'Success',
            error: 'Error',
            warning: 'Warning',
            info: 'Info'
        };
        return titles[type] || 'Info';
    }

    redirectToLogin() {
        window.location.href = '/';
    }
}

const settings = new SettingsManager();