// Nest Chat Application - Real-time Chat with SSE and Neon DB
class NestChat {
    constructor() {
        this.currentUser = null;
        this.token = null;
        this.messages = [];
        this.onlineUsers = [];
        this.lastMessageId = 0;
        this.es = null;
        this.userPollingInterval = null;
        this.heartbeatInterval = null;
        this.typingUsers = new Set();
        this.typingTimeout = null;
        this.replyingTo = null; // { id, author, text }

        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadPersistedAuth();
        await this.checkAuthentication();
    }

    async loadPersistedAuth() {
        const token = localStorage.getItem('nestToken');
        if (token) {
            this.token = token;
            try {
                const user = await this.fetchUser();
                if (user) {
                    this.currentUser = user;
                } else {
                    localStorage.removeItem('nestToken');
                }
            } catch (e) {
                localStorage.removeItem('nestToken');
            }
        }
    }

    async fetchUser() {
        const res = await fetch('/api/me', { headers: this.getAuthHeaders() });
        if (res.ok) {
            return await res.json();
        }
        return null;
    }

    getAuthHeaders() {
        return { Authorization: `Bearer ${this.token}` };
    }

    bindEvents() {
        // Authentication events
        document.getElementById('showRegister').addEventListener('click', (e) => {
            e.preventDefault();
            this.showRegisterForm();
        });

        document.getElementById('showLogin').addEventListener('click', (e) => {
            e.preventDefault();
            this.showLoginForm();
        });

        document.getElementById('loginBtn').addEventListener('click', () => this.handleLogin());
        document.getElementById('registerBtn').addEventListener('click', () => this.handleRegister());

        // Enter key for forms
        ['loginUsername', 'loginPassword'].forEach(id => {
            document.getElementById(id).addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.handleLogin();
            });
        });

        ['registerUsername', 'registerPassword'].forEach(id => {
            document.getElementById(id).addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.handleRegister();
            });
        });

        // Chat events
        const messageInput = document.getElementById('messageInput');
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        messageInput.addEventListener('input', () => this.sendTypingStatus());

        document.getElementById('sendBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('logoutBtn').addEventListener('click', () => this.logout());
        document.getElementById('settingsBtn').addEventListener('click', () => this.showSettings());
        document.getElementById('cancelReplyBtn').addEventListener('click', () => this.cancelReply());

        // Auto-scroll messages
        const messagesContainer = document.getElementById('messagesContainer');
        messagesContainer.addEventListener('scroll', this.handleScroll.bind(this));
    }

    async checkAuthentication() {
        if (this.currentUser) {
            this.showChatApp();
        } else {
            this.showAuthContainer();
        }
    }

    showAuthContainer() {
        document.getElementById('authContainer').classList.remove('hidden');
        document.getElementById('chatApp').classList.add('hidden');
    }

    async showChatApp() {
        document.getElementById('authContainer').classList.add('hidden');
        document.getElementById('chatApp').classList.remove('hidden');
        await this.initializeChat();
    }

    showRegisterForm() {
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('registerForm').classList.remove('hidden');
    }

    showLoginForm() {
        document.getElementById('registerForm').classList.add('hidden');
        document.getElementById('loginForm').classList.remove('hidden');
    }

    async handleLogin() {
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value.trim();
        const loginBtn = document.getElementById('loginBtn');

        if (!username || !password) {
            this.showToast('Please fill in all fields', 'error');
            return;
        }

        loginBtn.classList.add('loading');

        try {
            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'login', username, password })
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Login failed');

            this.currentUser = data.user;
            this.token = data.token;
            localStorage.setItem('nestToken', this.token);

            this.showToast(`Welcome back, ${username}!`, 'success');
            this.showChatApp();
        } catch (e) {
            this.showToast(e.message || 'Login failed', 'error');
        } finally {
            loginBtn.classList.remove('loading');
        }
    }

    async handleRegister() {
        const username = document.getElementById('registerUsername').value.trim();
        const password = document.getElementById('registerPassword').value.trim();
        const registerBtn = document.getElementById('registerBtn');

        if (!username || !password) {
            this.showToast('Please fill in all fields', 'error');
            return;
        }

        if (username.length < 3) {
            this.showToast('Username must be at least 3 characters', 'error');
            return;
        }

        if (password.length < 6) {
            this.showToast('Password must be at least 6 characters', 'error');
            return;
        }

        registerBtn.classList.add('loading');

        try {
            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'register', username, password })
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Registration failed');

            this.currentUser = data.user;
            this.token = data.token;
            localStorage.setItem('nestToken', this.token);

            this.showToast(`Account created! Welcome to Nest, ${username}!`, 'success');
            this.showChatApp();
        } catch (e) {
            this.showToast(e.message || 'Registration failed', 'error');
        } finally {
            registerBtn.classList.remove('loading');
        }
    }

    async initializeChat() {
        await Promise.all([this.fetchMessages(), this.fetchOnlineUsers()]);
        this.renderMessages();
        this.updateOnlineUsers();
        this.connectSSE();
        this.updateUserProfile();
        this.startRealTimeUpdates();
        this.scrollToBottom();
        document.getElementById('messageInput').focus();
    }

    async fetchMessages() {
        const res = await fetch('/api/messages');
        if (!res.ok) return;
        const data = await res.json();
        this.messages = data.map(m => ({
            ...m,
            isOwn: m.author === this.currentUser?.username
        }));
        this.lastMessageId = data.length ? Math.max(...data.map(m => m.id)) : 0;
    }

    connectSSE() {
        if (this.es) {
            this.es.close();
        }

        const url = new URL('/api/sse', location.origin);
        url.searchParams.set('token', this.token);
        url.searchParams.set('since_id', this.lastMessageId.toString());

        this.es = new EventSource(url);

        this.es.onmessage = (e) => {
            const data = JSON.parse(e.data);
            if (data.type === 'message') {
                if (data.id <= this.lastMessageId) return;
                this.lastMessageId = data.id;
                data.isOwn = false;
                this.messages.push(data);
                this.renderMessage(data);
                this.scrollToBottom();
            } else if (data.type === 'typing') {
                this.handleTypingEvent(data);
            }
        };

        this.es.onerror = (err) => {
            console.error('SSE connection error:', err);
            // EventSource auto-reconnects
        };
    }

    async fetchOnlineUsers() {
        const res = await fetch('/api/users');
        if (!res.ok) return;
        this.onlineUsers = await res.json();
        this.updateOnlineUsers();
    }

    async sendMessage() {
        const input = document.getElementById('messageInput');
        const text = input.value.trim();

        if (!text || !this.currentUser) return;

        try {
            const payload = { text };
            if (this.replyingTo) {
                payload.parent_message_id = this.replyingTo.id;
            }

            const res = await fetch('/api/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.getAuthHeaders()
                },
                body: JSON.stringify(payload)
            });
            const msg = await res.json();

            if (!res.ok) throw new Error();

            msg.isOwn = true;
            this.messages.push(msg);
            this.lastMessageId = msg.id;
            this.renderMessage(msg);
            this.scrollToBottom();

            input.value = '';
            this.cancelReply();
            this.sendTypingStatus(false);

            this.showToast('Message sent!', 'success', 2000);
        } catch (e) {
            this.showToast('Failed to send message', 'error');
        }
    }

    async sendTypingStatus(isTyping = true) {
        if (!this.currentUser || !this.token) return;

        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }

        if (isTyping) {
            try {
                await fetch('/api/typing', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...this.getAuthHeaders()
                    },
                    body: JSON.stringify({ isTyping: true })
                });

                this.typingTimeout = setTimeout(() => {
                    this.sendTypingStatus(false);
                }, 3000);
            } catch (e) {
                console.error('Failed to send typing status:', e);
            }
        } else {
            try {
                await fetch('/api/typing', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...this.getAuthHeaders()
                    },
                    body: JSON.stringify({ isTyping: false })
                });
            } catch (e) {
                console.error('Failed to send typing status:', e);
            }
        }
    }

    handleTypingEvent({ username, isTyping }) {
        if (username === this.currentUser?.username) return;

        if (isTyping) {
            this.typingUsers.add(username);
        } else {
            this.typingUsers.delete(username);
        }

        this.renderTypingIndicators();
    }

    renderTypingIndicators() {
        const container = document.getElementById('typingIndicators');
        container.innerHTML = '';

        if (this.typingUsers.size === 0) return;

        const usernames = Array.from(this.typingUsers);
        const text = usernames.length > 2
            ? `${usernames.slice(0, 2).join(', ')} and ${usernames.length - 2} others are typing`
            : usernames.join(' and ') + (usernames.length > 1 ? ' are typing' : ' is typing');

        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        indicator.innerHTML = `
            <span>${text}</span>
            <div class="typing-dots">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        `;
        container.appendChild(indicator);
    }

    handleReply(messageId) {
        const message = this.messages.find(m => m.id === messageId);
        if (!message) return;

        this.replyingTo = {
            id: message.id,
            author: message.author,
            text: message.text
        };

        const replyingIndicator = document.getElementById('replyingIndicator');
        const replyingTo = document.getElementById('replyingTo');
        replyingTo.textContent = `Replying to ${message.author}: ${message.text.substring(0, 50)}${message.text.length > 50 ? '...' : ''}`;
        replyingIndicator.classList.remove('hidden');

        const input = document.getElementById('messageInput');
        input.value = `> ${message.author}: ${message.text}\n`;
        input.focus();
    }

    cancelReply() {
        this.replyingTo = null;
        document.getElementById('replyingIndicator').classList.add('hidden');
        document.getElementById('messageInput').value = '';
    }

    scrollToMessage(messageId) {
        const messageEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
        if (messageEl) {
            messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            messageEl.classList.add('highlight');
            setTimeout(() => messageEl.classList.remove('highlight'), 2000);
        }
    }

    async sendHeartbeat() {
        if (!this.token || !this.currentUser) return;
        try {
            await fetch('/api/heartbeat', {
                method: 'POST',
                headers: this.getAuthHeaders()
            });
        } catch (e) {
            // Silent fail
        }
    }

    startRealTimeUpdates() {
        this.userPollingInterval = setInterval(() => this.fetchOnlineUsers(), 5000);
        this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), 30000);
    }

    updateUserProfile() {
        const userInitials = document.getElementById('userInitials');
        const currentUsername = document.getElementById('currentUsername');

        if (this.currentUser) {
            userInitials.textContent = this.getInitials(this.currentUser.username);
            currentUsername.textContent = this.currentUser.username;
        }
    }

    getInitials(name) {
        return name.split(' ').map(word => word.charAt(0)).join('').toUpperCase().slice(0, 2);
    }

    renderMessages() {
        const container = document.getElementById('messagesContainer');
        const welcomeMessage = container.querySelector('.welcome-message');

        if (this.messages.length === 0) {
            if (welcomeMessage) welcomeMessage.style.display = 'block';
            return;
        }

        if (welcomeMessage) welcomeMessage.style.display = 'none';

        const existingMessages = container.querySelectorAll('.message');
        existingMessages.forEach(msg => msg.remove());

        this.messages.forEach(message => {
            this.renderMessage(message, false);
        });
    }

    renderMessage(message, animate = true) {
        const container = document.getElementById('messagesContainer');
        const messageEl = document.createElement('div');

        messageEl.className = `message ${message.isOwn ? 'own-message' : ''}`;
        messageEl.dataset.messageId = message.id;
        if (animate) messageEl.style.opacity = '0';

        const timestamp = new Date(message.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });

        let messageContent = `<div class="message-text">${this.escapeHtml(message.text)}</div>`;
        if (message.parent_message_id) {
            const parentMessage = this.messages.find(m => m.id === message.parent_message_id);
            if (parentMessage) {
                messageContent = `
                    <div class="quoted-message" data-message-id="${parentMessage.id}">
                        <div class="quote-author">${this.escapeHtml(parentMessage.author)}</div>
                        <div class="quote-text">${this.escapeHtml(parentMessage.text)}</div>
                    </div>
                    <div class="message-text">${this.escapeHtml(message.text)}</div>
                `;
            }
        }

        messageEl.innerHTML = `
            <div class="message-avatar">
                ${this.getInitials(message.author)}
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-author">${this.escapeHtml(message.author)}</span>
                    <span class="message-timestamp">${timestamp}</span>
                </div>
                ${messageContent}
                <button class="reply-btn" title="Reply">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/>
                    </svg>
                </button>
            </div>
        `;

        container.appendChild(messageEl);

        // Bind reply button
        messageEl.querySelector('.reply-btn').addEventListener('click', () => {
            this.handleReply(message.id);
        });

        // Bind click on quoted message
        const quotedMessage = messageEl.querySelector('.quoted-message');
        if (quotedMessage) {
            quotedMessage.addEventListener('click', () => {
                this.scrollToMessage(quotedMessage.dataset.messageId);
            });
        }

        if (animate) {
            setTimeout(() => {
                messageEl.style.opacity = '1';
            }, 50);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    updateOnlineUsers() {
        const usersList = document.getElementById('usersList');
        const onlineCountEl = document.getElementById('onlineCount');

        if (!usersList || !onlineCountEl) return;

        usersList.innerHTML = '';
        const onlineCount = this.onlineUsers.length;
        onlineCountEl.textContent = `(${onlineCount})`;

        this.onlineUsers.forEach(user => {
            const userEl = document.createElement('div');
            const isCurrent = user.username === this.currentUser?.username;
            userEl.className = `user-item ${isCurrent ? 'current-user' : ''}`;

            const lastActiveTime = new Date(user.last_active);
            const now = new Date();
            const diffMinutes = Math.floor((now - lastActiveTime) / (1000 * 60));

            let statusText = 'Online';
            if (diffMinutes > 0) {
                statusText = diffMinutes < 60 ? `${diffMinutes}m ago` : `${Math.floor(diffMinutes / 60)}h ago`;
            }

            userEl.innerHTML = `
                <div class="user-avatar">
                    ${this.getInitials(user.username)}
                    <div class="status-indicator online"></div>
                </div>
                <div class="user-info">
                    <div class="user-name">${user.username}</div>
                    <div class="user-status">${statusText}</div>
                </div>
            `;

            usersList.appendChild(userEl);
        });
    }

    scrollToBottom() {
        const container = document.getElementById('messagesContainer');
        container.scrollTop = container.scrollHeight;
    }

    handleScroll() {
        // Placeholder for scroll logic
    }

    showSettings() {
        this.showToast('Settings feature coming soon!', 'info');
    }

    logout() {
        if (confirm('Are you sure you want to logout?')) {
            if (this.es) {
                this.es.close();
                this.es = null;
            }
            localStorage.removeItem('nestToken');

            // Clear intervals
            if (this.userPollingInterval) clearInterval(this.userPollingInterval);
            if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

            this.currentUser = null;
            this.token = null;
            this.messages = [];
            this.onlineUsers = [];
            this.lastMessageId = 0;
            this.typingUsers.clear();
            this.cancelReply();

            this.showToast('Successfully logged out', 'success');

            setTimeout(() => {
                this.showAuthContainer();
                this.clearAuthForms();
            }, 1000);
        }
    }

    clearAuthForms() {
        ['loginUsername', 'loginPassword', 'registerUsername', 'registerPassword'].forEach(id => {
            document.getElementById(id).value = '';
        });
        this.showLoginForm();
    }

    showToast(message, type = 'success', duration = 4000) {
        const container = document.getElementById('toastContainer');
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
        return icons[type] || icons.success;
    }

    getToastTitle(type) {
        const titles = {
            success: 'Success',
            error: 'Error',
            warning: 'Warning',
            info: 'Info'
        };
        return titles[type] || 'Notification';
    }
}

// Initialize the chat application
document.addEventListener('DOMContentLoaded', () => {
    new NestChat();
});