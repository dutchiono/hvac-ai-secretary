// Chat Window State
let chatOpen = false;

// DOM Elements
const chatBubble = document.getElementById('chatBubble');
const chatWindow = document.getElementById('chatWindow');
const chatMessages = document.getElementById('chatMessages');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');

// Toggle Chat Window
function toggleChat() {
    chatOpen = !chatOpen;
    if (chatOpen) {
        chatWindow.classList.add('active');
        userInput.focus();
    } else {
        chatWindow.classList.remove('active');
    }
}

// Scroll to Section
function scrollToSection(sectionId) {
    const element = document.getElementById(sectionId);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Open Chat with Pre-filled Message
function openChat(message) {
    if (!chatOpen) {
        toggleChat();
    }
    if (message) {
        userInput.value = message;
        userInput.focus();
    }
}

// Add Message to Chat
function addMessage(text, isUser) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user' : 'bot'}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = text;
    
    messageDiv.appendChild(contentDiv);
    
    // Insert before quick actions if they exist
    const quickActions = document.getElementById('quickActions');
    if (quickActions && !isUser) {
        chatMessages.insertBefore(messageDiv, quickActions);
    } else {
        chatMessages.appendChild(messageDiv);
    }
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Show Typing Indicator
function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message bot';
    typingDiv.id = 'typingIndicator';
    
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.innerHTML = '<span></span><span></span><span></span>';
    
    typingDiv.appendChild(indicator);
    
    const quickActions = document.getElementById('quickActions');
    if (quickActions) {
        chatMessages.insertBefore(typingDiv, quickActions);
    } else {
        chatMessages.appendChild(typingDiv);
    }
    
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Hide Typing Indicator
function hideTypingIndicator() {
    const typingDiv = document.getElementById('typingIndicator');
    if (typingDiv) {
        typingDiv.remove();
    }
}

// Send Message
async function sendMessage() {
    const message = userInput.value.trim();
    if (!message) return;

    // Add user message
    addMessage(message, true);
    userInput.value = '';
    sendButton.disabled = true;

    // Show typing indicator
    showTypingIndicator();

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });

        const data = await response.json();
        hideTypingIndicator();

        if (response.ok) {
            addMessage(data.reply, false);
        } else {
            addMessage('Sorry, I encountered an error. Please try again or call us at 412-512-0425.', false);
        }
    } catch (error) {
        console.error('Chat error:', error);
        hideTypingIndicator();
        addMessage('Sorry, I encountered a connection error. Please try again or call us at 412-512-0425.', false);
    } finally {
        sendButton.disabled = false;
    }
}

// Submit Contact Form
async function submitContactForm(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    
    // TODO: Send to server
    console.log('Contact form submitted:', {
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        service: formData.get('service'),
        message: formData.get('message')
    });
    
    alert('Thank you for your message! We will get back to you soon.');
    form.reset();
}

// Event Listeners
chatBubble.addEventListener('click', toggleChat);
sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Close Chat Button
document.querySelector('.close-chat')?.addEventListener('click', toggleChat);