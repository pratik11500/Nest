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
        this.typingUsers = new Map();
        this.replyingTo = null;
        this.editingMessageId = null;
        this.typingTimeoutDuration = 3000;

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
                console.error('Error loading persisted auth:', e);
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
        console.log('Auth Token:', this.token);
        return { Authorization: `Bearer ${this.token}` };
    }

    bindEvents() {
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

        const messageInput = document.getElementById('messageInput');
        messageInput.addEventListener('input', this.debounce(() => this.sendTypingStatus(true), 500));
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        document.getElementById('sendBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('logoutBtn').addEventListener('click', () => this.logout());
        document.getElementById('settingsBtn').addEventListener('click', () => this.showSettings());
        document.getElementById('cancelReplyBtn').addEventListener('click', () => this.cancelReply());

        const messagesContainer = document.getElementById('messagesContainer');
        messagesContainer.addEventListener('scroll', this.handleScroll.bind(this));
    }

    debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
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
        try {
            const res = await fetch('/api/messages');
            if (!res.ok) throw new Error('Failed to fetch messages');
            const data = await res.json();
            this.messages = data.map(m => ({
                ...m,
                isOwn: m.author === this.currentUser?.username,
                edit_history: m.edit_history || [],
                last_edited_at: m.last_edited_at
            }));
            this.lastMessageId = data.length ? Math.max(...data.map(m => m.id)) : 0;
        } catch (e) {
            console.error('Error fetching messages:', e);
            this.showToast('Failed to load messages', 'error');
        }
    }

    connectSSE() {
        if (this.es) {
            this.es.close();
            this.es = null;
        }

        const url = new URL('/api/sse', location.origin);
        url.searchParams.set('token', this.token);
        url.searchParams.set('since_id', this.lastMessageId.toString());

        this.es = new EventSource(url);

        this.es.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                if (data.type === 'message') {
                    const existingMessageIndex = this.messages.findIndex(m => m.id === data.id);
                    if (existingMessageIndex !== -1) {
                        this.messages[existingMessageIndex] = {
                            ...data,
                            isOwn: data.author === this.currentUser?.username,
                            edit_history: data.edit_history || [],
                            last_edited_at: data.last_edited_at
                        };
                        this.renderMessages();
                    } else {
                        if (data.id <= this.lastMessageId) return;
                        this.lastMessageId = data.id;
                        data.isOwn = data.author === this.currentUser?.username;
                        data.edit_history = data.edit_history || [];
                        data.last_edited_at = data.last_edited_at;
                        this.messages.push(data);
                        this.renderMessage(data);
                        this.scrollToBottom();
                    }
                } else if (data.type === 'typing') {
                    this.handleTypingEvent(data);
                }
            } catch (err) {
                console.error('SSE message parsing error:', err);
            }
        };

        this.es.onerror = (err) => {
            console.error('SSE connection error:', err);
            this.showToast('Lost connection to server. Reconnecting...', 'warning');
        };

        this.es.onopen = () => {
            console.log('SSE connection established');
        };
    }

    async fetchOnlineUsers() {
        try {
            const res = await fetch('/api/users');
            if (!res.ok) throw new Error('Failed to fetch users');
            this.onlineUsers = await res.json();
            this.updateOnlineUsers();
        } catch (e) {
            console.error('Error fetching online users:', e);
            this.showToast('Failed to load online users', 'error');
        }
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

            if (!res.ok) throw new Error(msg.error || 'Failed to send message');

            msg.isOwn = true;
            msg.edit_history = msg.edit_history || [];
            msg.last_edited_at = msg.last_edited_at;
            this.messages.push(msg);
            this.lastMessageId = msg.id;
            this.renderMessage(msg);
            this.scrollToBottom();

            input.value = '';
            this.cancelReply();
            await this.sendTypingStatus(false);
        } catch (e) {
            console.error('Error sending message:', e);
            this.showToast('Failed to send message', 'error');
        }
    }

    async sendTypingStatus(isTyping = true) {
        if (!this.currentUser || !this.token) {
            console.log('Cannot send typing status: No user or token');
            return;
        }

        try {
            const res = await fetch('/api/typing', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.getAuthHeaders()
                },
                body: JSON.stringify({ isTyping })
            });

            if (!res.ok) throw new Error('Failed to send typing status');
            console.log(`Typing status sent: ${isTyping}`);

            if (isTyping) {
                if (this.typingUsers.has(this.currentUser.username)) {
                    clearTimeout(this.typingUsers.get(this.currentUser.username));
                }
                const timeout = setTimeout(() => {
                    this.sendTypingStatus(false);
                }, this.typingTimeoutDuration);
                this.typingUsers.set(this.currentUser.username, timeout);
            } else {
                if (this.typingUsers.has(this.currentUser.username)) {
                    clearTimeout(this.typingUsers.get(this.currentUser.username));
                    this.typingUsers.delete(this.currentUser.username);
                }
            }
        } catch (e) {
            console.error('Error sending typing status:', e);
        }
    }

    handleTypingEvent({ username, isTyping }) {
        if (username === this.currentUser?.username) return;

        if (isTyping) {
            if (this.typingUsers.has(username)) {
                clearTimeout(this.typingUsers.get(username));
            }
            const timeout = setTimeout(() => {
                this.typingUsers.delete(username);
                this.renderTypingIndicators();
            }, this.typingTimeoutDuration);
            this.typingUsers.set(username, timeout);
        } else {
            if (this.typingUsers.has(username)) {
                clearTimeout(this.typingUsers.get(username));
                this.typingUsers.delete(username);
            }
        }

        this.renderTypingIndicators();
    }

    renderTypingIndicators() {
        const container = document.getElementById('typingIndicators');
        container.innerHTML = '';

        const typingUsers = Array.from(this.typingUsers.keys()).filter(
            username => username !== this.currentUser?.username
        );

        if (typingUsers.length === 0) return;

        const text = typingUsers.length > 2
            ? `${typingUsers.slice(0, 2).join(', ')} and ${typingUsers.length - 2} others are typing...`
            : typingUsers.join(' and ') + (typingUsers.length > 1 ? ' are typing...' : ' is typing...');

        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        indicator.innerHTML = `
            <span>${this.escapeHtml(text)}</span>
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
        const replyingToAuthor = document.getElementById('replyingToAuthor');
        const replyingToText = document.getElementById('replyingToText');

        replyingToAuthor.textContent = message.author;
        replyingToText.textContent = message.text;
        replyingIndicator.classList.remove('hidden');

        document.getElementById('messageInput').focus();
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

    editMessage(messageId) {
        if (this.editingMessageId) {
            this.cancelEdit();
        }

        const message = this.messages.find(m => m.id === messageId);
        if (!message || !message.isOwn) {
            console.error('Cannot edit message: Invalid message or not owned', { messageId, isOwn: message?.isOwn });
            return;
        }

        this.editingMessageId = messageId;

        const messageEl = document.querySelector(`.message[data-message-id="${messageId}"] .message-content`);
        if (!messageEl) {
            console.error('Message content element not found for ID:', messageId);
            return;
        }

        const messageText = messageEl.querySelector('.message-text').textContent;

        messageEl.innerHTML = `
            <div class="edit-message-container">
                <textarea class="edit-message-input" rows="3">${this.escapeHtml(messageText)}</textarea>
                <div class="edit-message-buttons">
                    <button class="edit-save-btn">Save</button>
                    <button class="edit-cancel-btn">Cancel</button>
                </div>
            </div>
        `;

        const saveBtn = messageEl.querySelector('.edit-save-btn');
        const cancelBtn = messageEl.querySelector('.edit-cancel-btn');
        const input = messageEl.querySelector('.edit-message-input');

        saveBtn.addEventListener('click', () => this.saveEdit(messageId));
        cancelBtn.addEventListener('click', () => this.cancelEdit());
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.saveEdit(messageId);
            }
        });

        input.focus();
    }

    async saveEdit(messageId) {
        const messageEl = document.querySelector(`.message[data-message-id="${messageId}"] .edit-message-container`);
        if (!messageEl) {
            console.error('Edit container not found for message ID:', messageId);
            this.showToast('Failed to edit message: UI error', 'error');
            return;
        }

        const newText = messageEl.querySelector('.edit-message-input').value.trim();
        if (!newText) {
            this.showToast('Message cannot be empty', 'error');
            return;
        }

        try {
            console.log('Sending PATCH request for message ID:', messageId, 'New text:', newText);
            const res = await fetch(`/api/messages/${messageId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.getAuthHeaders()
                },
                body: JSON.stringify({ text: newText })
            });

            console.log('PATCH response status:', res.status, 'ok:', res.ok);
            let updatedMessage;
            try {
                updatedMessage = await res.json();
                console.log('PATCH response body:', updatedMessage);
            } catch (jsonError) {
                const responseText = await res.text();
                console.error('Failed to parse JSON response:', jsonError, 'Response text:', responseText);
                throw new Error(`Invalid server response: ${responseText.slice(0, 100)}...`);
            }

            if (!res.ok) {
                throw new Error(updatedMessage.error || `Failed to edit message (Status: ${res.status})`);
            }

            if (!updatedMessage.id || !updatedMessage.text) {
                throw new Error('Invalid response format from server');
            }

            const messageIndex = this.messages.findIndex(m => m.id === messageId);
            if (messageIndex !== -1) {
                this.messages[messageIndex] = {
                    ...this.messages[messageIndex],
                    text: updatedMessage.text,
                    edit_history: updatedMessage.edit_history || [],
                    last_edited_at: updatedMessage.last_edited_at
                };
                this.renderMessages();
                this.editingMessageId = null;
                this.showToast('Message updated', 'success');
            } else {
                console.error('Message not found in local state:', messageId);
                this.showToast('Failed to update message locally', 'error');
            }
        } catch (e) {
            console.error('Error editing message:', e.message);
            this.showToast(`Failed to edit message: ${e.message}`, 'error');
        }
    }

    cancelEdit() {
        if (!this.editingMessageId) return;

        const message = this.messages.find(m => m.id === this.editingMessageId);
        if (message) {
            this.renderMessage(message, false);
        }
        this.editingMessageId = null;
    }

    showEditHistory(messageId) {
        const message = this.messages.find(m => m.id === messageId);
        if (!message || !message.edit_history || message.edit_history.length === 0) {
            this.showToast('No edit history available', 'info');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'edit-history-modal';

        let historyItems = message.edit_history.map((entry, index) => `
            <div class="edit-history-item">
                <span>${new Date(entry.edited_at).toLocaleString()}</span>
                <p>${this.escapeHtml(entry.old_text)}</p>
            </div>
        `).join('');

        historyItems = `
            <div class="edit-history-item current">
                <span>Current - ${message.last_edited_at ? new Date(message.last_edited_at).toLocaleString() : new Date(message.created_at).toLocaleString()}</span>
                <p>${this.escapeHtml(message.text)}</p>
            </div>
            ${historyItems}
        `;

        modal.innerHTML = `
            <div class="edit-history-content">
                <div class="edit-history-header">
                    <h3>Edit History for ${this.escapeHtml(message.author)}'s Message</h3>
                    <button class="close-modal-btn" title="Close">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                    </button>
                </div>
                <div class="edit-history-list">
                    ${historyItems}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('.close-modal-btn').addEventListener('click', () => {
            modal.remove();
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    async sendHeartbeat() {
        if (!this.token || !this.currentUser) return;
        try {
            await fetch('/api/heartbeat', {
                method: 'POST',
                headers: this.getAuthHeaders()
            });
        } catch (e) {
            console.error('Heartbeat failed:', e);
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

        if (this.messages.length > 0) {
            if (welcomeMessage) welcomeMessage.style.display = 'none';
        } else {
            if (welcomeMessage) welcomeMessage.style.display = 'block';
        }

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

        const timestamp = new Date(message.last_edited_at || message.created_at).toLocaleTimeString([], {
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

        const isEdited = message.edit_history && message.edit_history.length > 0;
        const editedLabel = isEdited ? '<span class="edited-label">Edited</span>' : '';

        messageEl.innerHTML = `
            <div class="message-avatar">
                ${this.getInitials(message.author)}
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-author">${this.escapeHtml(message.author)}</span>
                    <span class="message-timestamp">${timestamp}${editedLabel}</span>
                </div>
                ${messageContent}
                <button class="reply-btn" title="Reply">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/>
                    </svg>
                </button>
                ${message.isOwn ? `
                    <button class="edit-btn" title="Edit">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                        </svg>
                    </button>
                ` : ''}
            </div>
        `;

        container.appendChild(messageEl);

        messageEl.querySelector('.reply-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleReply(message.id);
        });

        if (message.isOwn) {
            messageEl.querySelector('.edit-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.editMessage(message.id);
            });
        }

        messageEl.querySelector('.message-content').addEventListener('click', () => {
            this.showEditHistory(message.id);
        });

        const quotedMessage = messageEl.querySelector('.quoted-message');
        if (quotedMessage) {
            quotedMessage.addEventListener('click', (e) => {
                e.stopPropagation();
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

            if (this.userPollingInterval) clearInterval(this.userPollingInterval);
            if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

            this.typingUsers.forEach((timeout) => clearTimeout(timeout));
            this.typingUsers.clear();

            this.currentUser = null;
            this.token = null;
            this.messages = [];
            this.onlineUsers = [];
            this.lastMessageId = 0;
            this.editingMessageId = null;
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
}

// Initialize the chat application
const chatApp = new NestChat();