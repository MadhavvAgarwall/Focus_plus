// Enhanced Smart Dashboard Application with MediaPipe Integration
// app.js - Complete Dashboard Module

// Configuration Object
const CONFIG = {
    STORAGE: {
        USER_KEY: 'currentUser',
        TASKS_KEY: 'userTasks',
        REPORTS_KEY: 'sessionReports',
        THEME_KEY: 'appTheme',
        SESSION_COUNTER_KEY: 'sessionCounter'
    },
    TIMER: {
        UPDATE_INTERVAL_MS: 1000,
        DEFAULT_MINUTES: 2
    },
    MESSAGES: {
        LOGOUT_CONFIRM: 'Are you sure you want to logout?',
        TASK_INCOMPLETE: 'Please fill in both task name and date.',
        TASK_CONFIRM_DELETE: 'Are you sure you want to delete this task?',
        TIMER_INVALID: 'Please set a valid timer duration.'
    },
    ASSESSMENT: {
        EXCELLENT: 85,
        GOOD: 70,
        MODERATE: 50,
        BELOW_AVERAGE: 30
    },
    ANALYTICS: {
        REPORT_CATEGORIES: {
            EXCELLENT: { color: '#4CAF50', icon: '🏆' },
            GOOD: { color: '#8BC34A', icon: '✅' },
            MODERATE: { color: '#FFC107', icon: '⚠️' },
            BELOW_AVERAGE: { color: '#FF9800', icon: '📉' },
            POOR: { color: '#F44336', icon: '❌' }
        }
    }
};

// Global Variables
let currentUser = null;
let timerInterval = null;
let timerSeconds = 120; // 2 minutes default
let originalTimerSeconds = 120;
let isTimerRunning = false;
let sessionCounter = 0;
let notepadContent = '';

// Attention Detection Variables
let attentionDetector = null;
let sessionStats = {
    totalFrames: 0,
    focusedFrames: 0,
    distractedFrames: 0,
    noFaceFrames: 0,
    sessionStart: null,
    focusPeriods: [],
    distractionPeriods: [],
    currentState: null,
    stateStartTime: null,
    enhancedMetrics: null
};

// Bot Professor Variables
let uploadedContent = '';
let professorMemory = new Map();

// ========== FIXED AUTHENTICATION FUNCTIONS ==========

function checkAuth() {
    const user = localStorage.getItem(CONFIG.STORAGE.USER_KEY);
    if (user) {
        try {
            currentUser = JSON.parse(user);
            
            // Check session validity
            if (!validateUserSession()) {
                return;
            }
            
            updateProfileCard();
            console.log('User authenticated:', currentUser.name);
        } catch (error) {
            console.error('Error parsing user data:', error);
            localStorage.removeItem(CONFIG.STORAGE.USER_KEY);
            window.location.href = 'index.html';
        }
    } else {
        console.log('No authenticated user found. Redirecting to login...');
        window.location.href = 'index.html';
    }
}

function validateUserSession() {
    if (!currentUser) {
        console.log('No current user - redirecting to login');
        window.location.href = 'index.html';
        return false;
    }

    // Check session expiry if exists
    if (currentUser.sessionExpires && Date.now() > currentUser.sessionExpires) {
        console.log('Session expired - redirecting to login');
        localStorage.removeItem(CONFIG.STORAGE.USER_KEY);
        currentUser = null;
        window.location.href = 'index.html';
        return false;
    }

    const storedUser = localStorage.getItem(CONFIG.STORAGE.USER_KEY);
    if (!storedUser) {
        console.log('User session expired - redirecting to login');
        currentUser = null;
        window.location.href = 'index.html';
        return false;
    }

    return true;
}

function updateProfileCard() {
    const profileCard = document.getElementById('profileCard');
    if (!profileCard || !currentUser) return;

    if (!currentUser.name || !currentUser.id) {
        console.error('Invalid user data detected');
        logout();
        return;
    }

    const initials = currentUser.name.split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);

    profileCard.innerHTML = `
        <div class="profile-avatar">${initials}</div>
        <div class="profile-info">
            <p><strong>${currentUser.name}</strong></p>
            <p>ID: ${currentUser.id}</p>
            <p>Age: ${currentUser.age || 'Not specified'}</p>
        </div>
        <button id="logoutBtn" class="btn-logout">Logout</button> 
    `;

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
}

function logout() {
    if (confirm(CONFIG.MESSAGES.LOGOUT_CONFIRM)) {
        if (isTimerRunning) {
            pauseTimer();
        }

        if (typeof detectionRunning !== 'undefined' && detectionRunning) {
            stopCamera();
        }

        localStorage.removeItem(CONFIG.STORAGE.USER_KEY);
        currentUser = null;
        resetTimer();
        
        console.log('User logged out successfully');
        window.location.href = 'index.html';
    }
}

// ========== BOT PROFESSOR FUNCTIONALITY ==========
(function() {
    function initBotProfessor() {
        console.log('Initializing Bot Professor...');
        
        const fileInput = document.getElementById('professorFileInput');
        const uploadBtn = document.getElementById('uploadFileBtn');
        const askBtn = document.getElementById('askProfessor');
        const resetBtn = document.getElementById('resetProfessor');
        const questionTextarea = document.getElementById('professorQuestion');

        if (!fileInput || !uploadBtn || !askBtn || !resetBtn || !questionTextarea) {
            console.warn('Bot Professor elements not found - feature disabled');
            return;
        }

        uploadBtn.addEventListener('click', () => {
            console.log('Upload button clicked');
            fileInput.click();
        });
        
        fileInput.addEventListener('change', handleFileUpload);
        askBtn.addEventListener('click', handleQuestion);
        questionTextarea.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                handleQuestion();
            }
        });
        resetBtn.addEventListener('click', resetProfessor);

        updateProfessorStatus('Ready to learn! Upload a file or ask me anything.');
        console.log('Bot Professor initialized successfully');
    }

    function handleFileUpload(event) {
        const file = event.target.files[0];
        
        if (!file) return;
        
        if (!file.name.endsWith('.txt')) {
            updateFileStatus('Please upload a .txt file', 'error');
            return;
        }

        if (file.size > 1024 * 1024) { // 1MB limit
            updateFileStatus('File too large. Please upload a file smaller than 1MB', 'error');
            return;
        }

        updateFileStatus('Reading file...', 'loading');
        updateProfessorStatus('Analyzing your document...');

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                uploadedContent = e.target.result;
                console.log('File loaded, content length:', uploadedContent.length);
                generateSummary(uploadedContent);
                updateFileStatus(`Loaded: ${file.name} (${Math.round(file.size / 1024)} KB)`, 'success');
                updateProfessorStatus('File loaded! I\'ve analyzed your content. Ask me anything!');
            } catch (error) {
                console.error('File processing error:', error);
                updateFileStatus('Error processing file', 'error');
                updateProfessorStatus('Error processing your file. Please try again.');
            }
        };

        reader.onerror = function() {
            updateFileStatus('Error reading file', 'error');
            updateProfessorStatus('Could not read the file. Please try again.');
        };

        reader.readAsText(file);
    }

    function generateSummary(content) {
        if (!content || content.trim().length === 0) return;

        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
        const words = content.toLowerCase().match(/\b\w{4,}\b/g) || [];
        
        const wordCount = {};
        words.forEach(word => {
            wordCount[word] = (wordCount[word] || 0) + 1;
        });
        
        const keyTerms = Object.entries(wordCount)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([word]) => word);

        const summary = `
            <strong>📊 Document Analysis:</strong><br>
            • Length: ${content.length} characters, ${sentences.length} sentences<br>
            • Key terms: ${keyTerms.join(', ')}<br>
            • Main topics: ${identifyMainTopics(content)}<br><br>
            <strong>💡 Quick Summary:</strong><br>
            ${generateQuickSummary(sentences)}
        `;

        const summarySection = document.getElementById('contentSummary');
        const summaryText = document.getElementById('summaryText');
        
        if (summarySection && summaryText) {
            summaryText.innerHTML = summary;
            summarySection.style.display = 'block';
        }
    }

    function identifyMainTopics(content) {
        const topics = [];
        const lowerContent = content.toLowerCase();
        
        const topicPatterns = {
            'Science': /\b(experiment|hypothesis|research|study|data|analysis|theory|method)\b/g,
            'Technology': /\b(software|computer|program|algorithm|code|system|digital|internet)\b/g,
            'History': /\b(war|century|historical|ancient|revolution|empire|era|period)\b/g,
            'Education': /\b(learn|teach|student|school|university|education|academic|knowledge)\b/g,
            'Business': /\b(company|market|business|profit|strategy|management|finance|economy)\b/g,
            'Health': /\b(health|medical|patient|treatment|disease|medicine|therapy|wellness)\b/g,
            'Literature': /\b(story|novel|poem|character|author|book|narrative|writing)\b/g
        };

        Object.entries(topicPatterns).forEach(([topic, pattern]) => {
            if ((lowerContent.match(pattern) || []).length >= 3) {
                topics.push(topic);
            }
        });

        return topics.length > 0 ? topics.join(', ') : 'General content';
    }

    function generateQuickSummary(sentences) {
        if (sentences.length === 0) return 'No clear sentences found.';
        
        const importantSentences = sentences
            .filter(s => s.length > 50 && s.length < 200)
            .slice(0, 3);
            
        return importantSentences.length > 0 
            ? importantSentences.join('. ') + '.'
            : 'Content contains primarily short statements or data.';
    }

    function handleQuestion() {
        const questionTextarea = document.getElementById('professorQuestion');
        const question = questionTextarea.value.trim();
        
        if (!question) {
            updateProfessorStatus('Please ask me a question!');
            return;
        }

        updateProfessorStatus('Thinking...');
        showProfessorLoading(true);

        setTimeout(() => {
            const response = generateResponse(question);
            displayResponse(response);
            questionTextarea.value = '';
            updateProfessorStatus('What else would you like to know?');
            showProfessorLoading(false);
        }, 1500);
    }

    function generateResponse(question) {
        const lowerQuestion = question.toLowerCase();
        
        const topicMatch = question.match(/#(\w+)/);
        if (topicMatch) {
            const topic = topicMatch[1];
            return generateTopicLesson(topic);
        }

        if (uploadedContent) {
            return generateContentBasedResponse(question, uploadedContent);
        }

        return generateGeneralResponse(question);
    }

    function generateTopicLesson(topic) {
        const lessons = {
            javascript: {
                content: `
                    <h4>JavaScript Fundamentals</h4>
                    <p><strong>What is JavaScript?</strong></p>
                    <p>JavaScript is a versatile programming language that makes websites interactive!</p>
                    
                    <p><strong>Key Concepts:</strong></p>
                    <ul>
                        <li><strong>Variables:</strong> Store data (let, const, var)</li>
                        <li><strong>Functions:</strong> Reusable code blocks</li>
                        <li><strong>Objects:</strong> Data containers with properties</li>
                        <li><strong>Events:</strong> User interactions (clicks, keyboard)</li>
                    </ul>
                    
                    <p><strong>Example:</strong></p>
                    <p>const greeting = "Hello World!";<br>console.log(greeting);</p>
                    
                    <p><em>JavaScript runs in browsers and servers, making it incredibly powerful for web development!</em></p>
                `
            },
            photosynthesis: {
                content: `
                    <h4>How Plants Make Food</h4>
                    <p><strong>What is Photosynthesis?</strong></p>
                    <p>The amazing process where plants convert sunlight into energy!</p>
                    
                    <p><strong>The Process:</strong></p>
                    <ol>
                        <li><strong>Light Absorption:</strong> Chlorophyll captures sunlight</li>
                        <li><strong>Water Intake:</strong> Roots absorb water from soil</li>
                        <li><strong>CO₂ Collection:</strong> Leaves take in carbon dioxide</li>
                        <li><strong>Glucose Production:</strong> Creates sugar for energy</li>
                        <li><strong>Oxygen Release:</strong> Produces oxygen as byproduct</li>
                    </ol>
                    
                    <p><strong>Formula:</strong> 6CO₂ + 6H₂O + light → C₆H₁₂O₆ + 6O₂</p>
                    
                    <p><em>This process is essential for all life on Earth!</em></p>
                `
            },
            history: {
                content: `
                    <h4>The Study of History</h4>
                    <p><strong>Why Study History?</strong></p>
                    <p>History helps us understand how we got to where we are today!</p>
                    
                    <p><strong>Key Concepts:</strong></p>
                    <ul>
                        <li><strong>Primary Sources:</strong> Original documents, artifacts</li>
                        <li><strong>Secondary Sources:</strong> Analysis and interpretation</li>
                        <li><strong>Chronology:</strong> Order of events in time</li>
                        <li><strong>Cause and Effect:</strong> How events influence each other</li>
                    </ul>
                    
                    <p><em>History isn't just memorizing dates - it's understanding human stories!</em></p>
                `
            }
        };

        const lesson = lessons[topic.toLowerCase()] || {
            content: `
                <h4>${topic.charAt(0).toUpperCase() + topic.slice(1)}</h4>
                <p>I'd love to teach you about ${topic}! While I don't have a specific lesson prepared for this topic, I can help you explore it.</p>
                
                <p><strong>Here's how to learn more:</strong></p>
                <ul>
                    <li>Break the topic into smaller parts</li>
                    <li>Look for key concepts and definitions</li>
                    <li>Find examples and applications</li>
                    <li>Practice with exercises or questions</li>
                    <li>Connect it to what you already know</li>
                </ul>
                
                <p><em>Upload a text file about ${topic} and I can give you more specific insights!</em></p>
            `
        };

        return lesson.content;
    }

    function generateContentBasedResponse(question, content) {
        const lowerQuestion = question.toLowerCase();
        
        if (lowerQuestion.includes('summary') || lowerQuestion.includes('summarize')) {
            const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
            return `<h4>Document Summary</h4><p>${generateQuickSummary(sentences)}</p>`;
        }
        else if (lowerQuestion.includes('main point') || lowerQuestion.includes('key point')) {
            return `<h4>Key Points</h4><p>Based on your document, the main themes appear to be: ${identifyMainTopics(content)}</p>`;
        }
        else if (lowerQuestion.includes('length') || lowerQuestion.includes('how long')) {
            const wordCount = content.split(/\s+/).length;
            const charCount = content.length;
            return `<h4>Document Stats</h4><p>Your document contains ${wordCount} words and ${charCount} characters.</p>`;
        }
        else {
            const sentences = content.split(/[.!?]+/);
            const relevantSentences = sentences.filter(sentence => {
                const words = lowerQuestion.split(/\s+/);
                return words.some(word => word.length > 3 && sentence.toLowerCase().includes(word));
            });
            
            if (relevantSentences.length > 0) {
                return `<h4>From your document</h4><p>${relevantSentences.slice(0, 2).join('. ')}.</p>`;
            } else {
                return `<h4>About your question</h4><p>I understand you're asking about "${question}". While I don't see direct references to this in your uploaded content, I'd be happy to help you explore this topic further!</p>`;
            }
        }
    }

    function generateGeneralResponse(question) {
        const lowerQuestion = question.toLowerCase();
        
        const responses = {
            greetings: {
                patterns: ['hello', 'hi', 'hey', 'good morning', 'good afternoon'],
                response: '<h4>Hello there!</h4><p>Hello! I\'m your friendly Bot Professor. I\'m here to help you learn and explore knowledge. Upload a text file or ask me about any topic!</p>'
            },
            learning: {
                patterns: ['how to learn', 'study tips', 'learning'],
                response: '<h4>Learning Tips</h4><p><strong>Effective Learning Strategies:</strong></p><ul><li>Break complex topics into smaller parts</li><li>Practice active recall and testing</li><li>Use spaced repetition</li><li>Teach others what you learn</li><li>Make connections between concepts</li></ul>'
            },
            help: {
                patterns: ['help', 'what can you do', 'how do you work'],
                response: '<h4>How I Can Help</h4><p>I\'m your learning companion! Here\'s what I can do:</p><ul><li>Analyze uploaded text files</li><li>Generate summaries</li><li>Teach topics (use #topic_name)</li><li>Answer questions about content</li><li>Provide learning guidance</li></ul>'
            }
        };

        for (const [category, data] of Object.entries(responses)) {
            if (data.patterns.some(pattern => lowerQuestion.includes(pattern))) {
                return data.response;
            }
        }

        return `<h4>Interesting Question!</h4><p>You asked: "${question}"</p><p>I'd love to help you explore this! For the best response, try:</p><ul><li>Upload a text file for content-specific questions</li><li>Use #topic_name to learn about specific subjects</li><li>Ask more specific questions about what you want to know</li></ul>`;
    }

    function displayResponse(responseContent) {
        const responseDiv = document.getElementById('professorResponse');
        const contentDiv = document.getElementById('responseContent');
        
        if (responseDiv && contentDiv) {
            contentDiv.innerHTML = responseContent;
            responseDiv.style.display = 'block';
            responseDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    function resetProfessor() {
        uploadedContent = '';
        professorMemory.clear();
        
        const elements = {
            fileInput: document.getElementById('professorFileInput'),
            fileStatus: document.getElementById('fileStatus'),
            summarySection: document.getElementById('contentSummary'),
            questionTextarea: document.getElementById('professorQuestion'),
            responseDiv: document.getElementById('professorResponse')
        };
        
        if (elements.fileInput) elements.fileInput.value = '';
        if (elements.fileStatus) elements.fileStatus.textContent = '';
        if (elements.summarySection) elements.summarySection.style.display = 'none';
        if (elements.questionTextarea) elements.questionTextarea.value = '';
        if (elements.responseDiv) elements.responseDiv.style.display = 'none';
        
        updateProfessorStatus('Reset complete! Ready for a new adventure!');
        
        const robotContainer = document.querySelector('.robot-container');
        if (robotContainer) {
            robotContainer.style.animation = 'none';
            setTimeout(() => {
                robotContainer.style.animation = 'robotHover 2.5s ease-in-out infinite';
            }, 100);
        }
    }

    function updateProfessorStatus(message) {
        const statusElement = document.getElementById('professorStatus');
        if (statusElement) {
            statusElement.textContent = message;
        }
    }

    function updateFileStatus(message, type = '') {
        const statusElement = document.getElementById('fileStatus');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `file-status ${type}`;
        }
    }

    function showProfessorLoading(isLoading) {
        const character = document.querySelector('.professor-character');
        if (character) {
            if (isLoading) {
                character.classList.add('professor-loading');
            } else {
                character.classList.remove('professor-loading');
            }
        }
    }

    window.initBotProfessor = initBotProfessor;
    window.resetProfessor = resetProfessor;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBotProfessor);
    } else {
        initBotProfessor();
    }

    setTimeout(initBotProfessor, 1000);
})();

// ========== MAIN DASHBOARD FUNCTIONALITY ==========

function initDashboard() {
    console.log('Initializing dashboard...');

    checkAuth();
    
    if (!validateUserSession()) {
        return;
    }

    loadTheme();
    setMinDate();
    loadTasks();
    loadAnalyticsReports();
    initializeSessionCounter();
    initializeNotepad();
    updateTimerDisplay();

    if (window.initBotProfessor) {
        console.log('Initializing Bot Professor from dashboard');
        window.initBotProfessor();
    }

    cleanupPastTasks();
    setInterval(saveNotepadContent, 30000);
    setInterval(validateUserSession, 300000); // 5 minutes

    if (!checkMediaPipeAndCamera()) {
        console.warn('MediaPipe or camera not available. Attention detection will be limited.');
    }

    console.log('Dashboard initialized successfully');
}

// ========== CAMERA AND MEDIAPIPE FUNCTIONS ==========

function checkMediaPipeAndCamera() {
    const hasCamera = checkCameraAvailability();
    const hasMediaPipe = checkMediaPipeAvailability();

    if (!hasCamera) {
        console.warn('Camera not available');
    }

    if (!hasMediaPipe) {
        console.warn('MediaPipe libraries not fully loaded');
    }

    return hasCamera && hasMediaPipe;
}

function checkCameraAvailability() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function checkMediaPipeAvailability() {
    return typeof FaceDetection !== 'undefined';
}

// ========== SESSION MANAGEMENT ==========

function initializeSessionCounter() {
    const stored = localStorage.getItem(CONFIG.STORAGE.SESSION_COUNTER_KEY);
    sessionCounter = stored ? parseInt(stored, 10) : 0;
}

function initializeNotepad() {
    const savedNotes = localStorage.getItem('notepadContent');
    if (savedNotes) {
        notepadContent = savedNotes;
        const textarea = document.getElementById('notepadTextarea');
        if (textarea) {
            textarea.value = notepadContent;
        }
    }
}

function saveNotepadContent() {
    const textarea = document.getElementById('notepadTextarea');
    if (textarea) {
        notepadContent = textarea.value;
        localStorage.setItem('notepadContent', notepadContent);
    }
}

function exportNotes() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `notes-${timestamp}.txt`;

    const blob = new Blob([notepadContent || 'No notes to export'], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function clearNotes() {
    if (confirm('Are you sure you want to clear all notes? This action cannot be undone.')) {
        notepadContent = '';
        const textarea = document.getElementById('notepadTextarea');
        if (textarea) {
            textarea.value = '';
        }
        localStorage.removeItem('notepadContent');

        const status = document.getElementById('notepadStatus');
        if (status) {
            status.textContent = 'Notes cleared';
            setTimeout(() => {
                status.textContent = 'Ready';
            }, 2000);
        }
    }
}

// ========== TIMER FUNCTIONS ==========

async function startTimer() {
    console.log('Start timer called');

    if (isTimerRunning) {
        console.log('Timer already running');
        return;
    }

    timerSeconds = originalTimerSeconds;
    updateTimerDisplay();

    isTimerRunning = true;
    document.getElementById('startBtn').disabled = true;
    document.getElementById('pauseBtn').disabled = false;
    document.getElementById('resetBtn').disabled = false;

    resetSessionStats();

    let cameraReady = false;

    if (checkMediaPipeAndCamera()) {
        try {
            cameraReady = await initCamera();
            console.log('Camera initialization result:', cameraReady);
        } catch (error) {
            console.error('Camera/MediaPipe initialization failed:', error);
            cameraReady = false;
        }
    }

    if (!cameraReady) {
        const continueWithoutCamera = confirm(
            'Camera initialization failed or MediaPipe libraries not available. ' +
            'Would you like to continue with timer only (without attention detection)?'
        );

        if (!continueWithoutCamera) {
            isTimerRunning = false;
            document.getElementById('startBtn').disabled = false;
            document.getElementById('pauseBtn').disabled = true;
            document.getElementById('resetBtn').disabled = false;
            return;
        }
    }

    timerInterval = setInterval(() => {
        if (timerSeconds > 0) {
            timerSeconds--;
            updateTimerDisplay();
            displaySessionStats();
        } else {
            timerComplete();
        }
    }, CONFIG.TIMER.UPDATE_INTERVAL_MS || 1000);

    console.log('Enhanced timer started with MediaPipe integration');
}

function pauseTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    isTimerRunning = false;

    document.getElementById('startBtn').disabled = false;
    document.getElementById('pauseBtn').disabled = true;
    document.getElementById('resetBtn').disabled = false;

    console.log('Timer paused');
}

function resetTimer() {
    pauseTimer();
    timerSeconds = originalTimerSeconds;
    updateTimerDisplay();

    if (typeof detectionRunning !== 'undefined' && detectionRunning) {
        stopCamera();
    }
    resetSessionStats();

    document.getElementById('startBtn').disabled = false;
    document.getElementById('pauseBtn').disabled = true;
    document.getElementById('resetBtn').disabled = false;

    console.log(`Timer reset to ${Math.floor(originalTimerSeconds / 60)} minutes`);
}

function updateTimerDisplay() {
    const hours = Math.floor(timerSeconds / 3600);
    const minutes = Math.floor((timerSeconds % 3600) / 60);
    const seconds = timerSeconds % 60;

    let display = '';
    if (hours > 0) {
        display += String(hours).padStart(2, '0') + ':';
    }
    display += String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');

    const timerDisplay = document.getElementById('timerDisplay');
    if (timerDisplay) {
        timerDisplay.textContent = display;
    }
}

function timerComplete() {
    pauseTimer();

    sessionCounter++;
    localStorage.setItem(CONFIG.STORAGE.SESSION_COUNTER_KEY, sessionCounter.toString());

    const finalReport = generateEnhancedFinalReport();
    saveReportToAnalytics(finalReport);

    if (notepadContent && notepadContent.trim()) {
        exportNotes();
    }

    updateProfileCard();

    setTimeout(() => {
        if (typeof detectionRunning !== 'undefined' && detectionRunning) {
            stopCamera();
        }
    }, 3000);

    showSessionCompleteNotification();
}

// ========== SESSION STATISTICS ==========

function resetSessionStats() {
    sessionStats = {
        totalFrames: 0,
        focusedFrames: 0,
        distractedFrames: 0,
        noFaceFrames: 0,
        sessionStart: null,
        focusPeriods: [],
        distractionPeriods: [],
        currentState: null,
        stateStartTime: null,
        enhancedMetrics: {
            avgConfidence: 0,
            avgRotation: { yaw: 0, pitch: 0 },
            qualityScore: 0,
            stabilityScore: 0,
            trackingAccuracy: 0,
            peakFocusStreak: 0,
            totalDistractions: 0
        }
    };

    const statsContent = document.getElementById('statsContent');
    if (statsContent) {
        statsContent.innerHTML = `
            <div style="text-align: center; opacity: 0.7;">
                <div style="font-size: 2rem; margin-bottom: 10px;">📊</div>
                <div>Start a focus session to see your attention statistics here</div>
            </div>
        `;
    }
}

function updateSessionStats(state) {
    sessionStats.totalFrames++;

    if (state === 'focused') {
        sessionStats.focusedFrames++;
    } else if (state === 'distracted') {
        sessionStats.distractedFrames++;
    } else if (state === 'noFace') {
        sessionStats.noFaceFrames++;
    }

    const currentTime = new Date();
    if (sessionStats.currentState !== state) {
        if (sessionStats.currentState && sessionStats.stateStartTime) {
            const duration = (currentTime - sessionStats.stateStartTime) / 1000;

            if (sessionStats.currentState === 'focused') {
                sessionStats.focusPeriods.push({ duration, timestamp: currentTime });
            } else if (sessionStats.currentState === 'distracted') {
                sessionStats.distractionPeriods.push({ duration, timestamp: currentTime });
            }
        }

        sessionStats.currentState = state;
        sessionStats.stateStartTime = currentTime;
    }

    if (!sessionStats.sessionStart) {
        sessionStats.sessionStart = currentTime;
    }
}

function displaySessionStats() {
    const statsContent = document.getElementById('statsContent');

    if (!statsContent || sessionStats.totalFrames === 0) {
        if (statsContent) {
            statsContent.innerHTML = `
                <div style="text-align: center; opacity: 0.7;">
                    <div style="font-size: 2rem; margin-bottom: 10px;">📊</div>
                    <div>Camera not active or no data yet</div>
                </div>
            `;
        }
        return;
    }

    const focusPercentage = ((sessionStats.focusedFrames / sessionStats.totalFrames) * 100).toFixed(1);
    const distractedPercentage = ((sessionStats.distractedFrames / sessionStats.totalFrames) * 100).toFixed(1);
    const sessionDuration = sessionStats.sessionStart ?
        ((new Date() - sessionStats.sessionStart) / 1000 / 60).toFixed(1) : 0;

    let assessment = 'Gathering data...';
    let assessmentColor = '#666';

    if (sessionStats.totalFrames > 30) {
        const focusNum = parseFloat(focusPercentage);
        if (focusNum >= CONFIG.ASSESSMENT.EXCELLENT) {
            assessment = 'Excellent focus!';
            assessmentColor = '#4CAF50';
        } else if (focusNum >= CONFIG.ASSESSMENT.GOOD) {
            assessment = 'Good focus maintained';
            assessmentColor = '#8BC34A';
        } else if (focusNum >= CONFIG.ASSESSMENT.MODERATE) {
            assessment = 'Moderate focus';
            assessmentColor = '#FFC107';
        } else if (focusNum >= CONFIG.ASSESSMENT.BELOW_AVERAGE) {
            assessment = 'Below average focus';
            assessmentColor = '#FF9800';
        } else {
            assessment = 'Poor focus - adjust position';
            assessmentColor = '#F44336';
        }
    }

    const enhancedInfo = getEnhancedStatsInfo();

    statsContent.innerHTML = `
        <div class="stats-row">
            <div class="stat-box">
                <div class="stat-value" style="font-size: 2.5rem; font-weight: bold; color: #4CAF50;">${focusPercentage}%</div>
                <div class="stat-label" style="font-size: 16px;">Focused</div>
            </div>
            <div class="stat-box">
                <div class="stat-value" style="font-size: 2.5rem; font-weight: bold; color: #FF5722;">${distractedPercentage}%</div>
                <div class="stat-label" style="font-size: 16px;">Distracted</div>
            </div>
        </div>
        <div class="stats-row">
            <div class="stat-box">
                <div class="stat-value" style="font-size: 2.2rem; font-weight: bold;">${sessionDuration}</div>
                <div class="stat-label" style="font-size: 16px;">Minutes</div>
            </div>
            <div class="stat-box">
                <div class="stat-value" style="font-size: 2.2rem; font-weight: bold;">${sessionStats.totalFrames}</div>
                <div class="stat-label" style="font-size: 16px;">Frames</div>
            </div>
        </div>
        <div class="assessment-text" style="font-size: 18px; font-weight: bold; margin-top: 15px; color: ${assessmentColor};">
            ${assessment}
            ${sessionStats.noFaceFrames > sessionStats.totalFrames * 0.2 ?
            '<br><small style="font-size: 14px; color: #FF9800;">Face detection issues detected</small>' : ''}
            ${enhancedInfo ? `<br><small style="font-size: 12px; opacity: 0.8;">${enhancedInfo}</small>` : ''}
        </div>
    `;
}

function getEnhancedStatsInfo() {
    // Placeholder for enhanced stats - implement based on your MediaPipe integration
    return null;
}

// ========== ANALYTICS AND REPORTING ==========

function generateEnhancedFinalReport() {
    const focusPercentage = sessionStats.totalFrames > 0 ?
        ((sessionStats.focusedFrames / sessionStats.totalFrames) * 100).toFixed(1) : 0;

    const duration = sessionStats.sessionStart ?
        ((Date.now() - sessionStats.sessionStart) / 1000 / 60).toFixed(1) :
        ((originalTimerSeconds - timerSeconds) / 60).toFixed(1);

    let assessment = 'Session completed';
    let assessmentCategory = 'MODERATE';

    if (sessionStats.totalFrames > 0) {
        const focus = parseFloat(focusPercentage);
        if (focus >= CONFIG.ASSESSMENT.EXCELLENT) {
            assessment = 'Excellent session';
            assessmentCategory = 'EXCELLENT';
        } else if (focus >= CONFIG.ASSESSMENT.GOOD) {
            assessment = 'Good session';
            assessmentCategory = 'GOOD';
        } else if (focus >= CONFIG.ASSESSMENT.MODERATE) {
            assessment = 'Moderate session';
            assessmentCategory = 'MODERATE';
        } else if (focus >= CONFIG.ASSESSMENT.BELOW_AVERAGE) {
            assessment = 'Below average session';
            assessmentCategory = 'BELOW_AVERAGE';
        } else {
            assessment = 'Poor session';
            assessmentCategory = 'POOR';
        }
    }

    const detectorMetrics = attentionDetector ? attentionDetector.getPerformanceMetrics() : null;

    return {
        sessionId: sessionCounter,
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        duration: parseFloat(duration),
        completed: timerSeconds <= 0,
        focusPercentage: sessionStats.totalFrames > 0 ? parseFloat(focusPercentage) : null,
        totalFrames: sessionStats.totalFrames,
        focusedFrames: sessionStats.focusedFrames,
        distractedFrames: sessionStats.distractedFrames,
        noFaceFrames: sessionStats.noFaceFrames,
        assessment,
        assessmentCategory,
        detectorMetrics: detectorMetrics ? {
            avgProcessingTime: detectorMetrics.averageProcessingTime.toFixed(2),
            maxFocusStreak: detectorMetrics.maxFocusStreak,
            detectionRate: detectorMetrics.detectionRate.toFixed(1),
            sessionQuality: (detectorMetrics.sessionQualityScore * 100).toFixed(1),
            mediaPipeActive: detectorMetrics.mediaPipeActive || false,
            currentYaw: detectorMetrics.currentYaw || 0,
            currentPitch: detectorMetrics.currentPitch || 0
        } : null
    };
}

function saveReportToAnalytics(report) {
    try {
        let savedReports = JSON.parse(localStorage.getItem(CONFIG.STORAGE.REPORTS_KEY) || '[]');
        savedReports.unshift(report);
        if (savedReports.length > 50) { // Limit to 50 reports
            savedReports = savedReports.slice(0, 50);
        }
        localStorage.setItem(CONFIG.STORAGE.REPORTS_KEY, JSON.stringify(savedReports));
        loadAnalyticsReports();
        console.log(`Report saved: Session ${report.sessionId}`);
    } catch (error) {
        console.error('Failed to save report:', error);
    }
}

function loadAnalyticsReports() {
    const analyticsContent = document.getElementById('analyticsContent');
    const clearBtn = document.querySelector('.analytics-clear-btn');
    const emptyState = document.querySelector('.analytics-empty');
    const savedReports = document.getElementById('savedReports');

    if (!analyticsContent) return;

    try {
        const reports = JSON.parse(localStorage.getItem(CONFIG.STORAGE.REPORTS_KEY) || '[]');

        if (reports.length === 0) {
            if (emptyState) emptyState.style.display = 'block';
            if (savedReports) savedReports.style.display = 'none';
            if (clearBtn) clearBtn.style.display = 'none';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';
        if (savedReports) savedReports.style.display = 'block';
        if (clearBtn) clearBtn.style.display = 'block';

        if (savedReports) {
            savedReports.innerHTML = '';

            reports.forEach((report) => {
                const reportElement = createReportElement(report);
                savedReports.appendChild(reportElement);
            });
        }
    } catch (error) {
        console.error('Failed to load analytics:', error);
    }
}

function createReportElement(report) {
    const reportDiv = document.createElement('div');
    reportDiv.className = 'analytics-report';
    reportDiv.onclick = () => showReportDetails(report);

    const category = CONFIG.ANALYTICS.REPORT_CATEGORIES[report.assessmentCategory] ||
        { color: '#666', icon: '📊' };

    const focusDisplay = report.focusPercentage !== null ? `${report.focusPercentage}%` : 'N/A';
    const dateDisplay = new Date(report.timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    reportDiv.style.borderLeftColor = category.color;
    reportDiv.style.borderLeftWidth = '4px';

    reportDiv.innerHTML = `
        <div class="report-header">
            <div class="report-title" style="color: ${category.color};">
                ${category.icon} Session ${report.sessionId}
            </div>
            <div class="report-focus-score" style="color: ${category.color};">
                ${focusDisplay}
            </div>
        </div>
        <div class="report-details">
            <div class="report-date">${dateDisplay}</div>
            <div class="report-duration">${report.duration}min</div>
        </div>
    `;

    return reportDiv;
}

function showReportDetails(report) {
    const modal = document.getElementById('reportModal');
    const title = document.getElementById('reportTitle');
    const details = document.getElementById('reportDetails');

    if (!modal || !title || !details) return;

    const category = CONFIG.ANALYTICS.REPORT_CATEGORIES[report.assessmentCategory] ||
        { color: '#666', icon: '📊' };

    title.innerHTML = `${category.icon} Session ${report.sessionId} Details`;

    const focusDisplay = report.focusPercentage !== null ? `${report.focusPercentage}%` : 'No data';

    let mediaPipeInfo = '';
    if (report.detectorMetrics && report.detectorMetrics.mediaPipeActive) {
        mediaPipeInfo = `
            <div>
                <h4 style="color: ${category.color};">MediaPipe Metrics</h4>
                <p><strong>Head Yaw:</strong> ${report.detectorMetrics.currentYaw ? report.detectorMetrics.currentYaw.toFixed(1) + '°' : 'N/A'}</p>
                <p><strong>Head Pitch:</strong> ${report.detectorMetrics.currentPitch ? report.detectorMetrics.currentPitch.toFixed(1) + '°' : 'N/A'}</p>
                <p><strong>Processing Time:</strong> ${report.detectorMetrics.avgProcessingTime}ms</p>
            </div>
        `;
    }

    details.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
            <div>
                <h4 style="color: ${category.color};">Overview</h4>
                <p><strong>Date:</strong> ${new Date(report.timestamp).toLocaleString()}</p>
                <p><strong>Duration:</strong> ${report.duration} minutes</p>
                <p><strong>Status:</strong> ${report.completed ? 'Completed' : 'Incomplete'}</p>
                <p><strong>Assessment:</strong> ${report.assessment}</p>
            </div>
            <div>
                <h4 style="color: ${category.color};">Metrics</h4>
                <p><strong>Focus Score:</strong> ${focusDisplay}</p>
                <p><strong>Total Frames:</strong> ${report.totalFrames || 'N/A'}</p>
                <p><strong>Focused Frames:</strong> ${report.focusedFrames || 0}</p>
                <p><strong>Detection Rate:</strong> ${report.detectorMetrics ? report.detectorMetrics.detectionRate + '%' : 'N/A'}</p>
            </div>
        </div>
        ${mediaPipeInfo}
    `;

    modal.style.display = 'flex';
}

function clearAnalytics() {
    if (confirm('Clear all reports?')) {
        localStorage.removeItem(CONFIG.STORAGE.REPORTS_KEY);
        loadAnalyticsReports();
    }
}

function showSessionCompleteNotification() {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #4CAF50, #45a049);
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 1000;
        transform: translateX(100%);
        transition: transform 0.3s ease;
        font-weight: bold;
    `;

    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 20px;">🎉</span>
            <div>
                <div>Session Complete!</div>
                <div style="font-size: 12px; opacity: 0.9;">Report saved to Analytics</div>
            </div>
        </div>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);

    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 4000);
}

// ========== TIMER SETTINGS ==========

function openTimerSettings() {
    const hours = Math.floor(originalTimerSeconds / 3600);
    const minutes = Math.floor((originalTimerSeconds % 3600) / 60);

    document.getElementById('timerHours').value = hours;
    document.getElementById('timerMinutes').value = minutes;
    document.getElementById('timerModal').style.display = 'flex';
}

function setCustomTimer() {
    const hours = parseInt(document.getElementById('timerHours').value) || 0;
    const minutes = parseInt(document.getElementById('timerMinutes').value) || 0;

    const totalSeconds = (hours * 3600) + (minutes * 60);

    if (totalSeconds <= 0) {
        alert(CONFIG.MESSAGES.TIMER_INVALID);
        return;
    }

    if (totalSeconds > 86400) {
        alert("Maximum timer duration is 24 hours.");
        return;
    }

    originalTimerSeconds = totalSeconds;
    timerSeconds = totalSeconds;
    updateTimerDisplay();
    closeModal('timerModal');

    console.log(`Timer set to ${hours}:${String(minutes).padStart(2, '0')}`);
}

// ========== THEME MANAGEMENT ==========

function changeTheme(element) {
    document.querySelectorAll('.theme-option').forEach(opt => opt.classList.remove('active'));
    element.classList.add('active');

    const theme = element.dataset.theme;
    document.body.className = theme;
    localStorage.setItem(CONFIG.STORAGE.THEME_KEY, theme);

    console.log(`Theme changed to: ${theme}`);
}

function loadTheme() {
    const savedTheme = localStorage.getItem(CONFIG.STORAGE.THEME_KEY) || 'theme-default';
    const option = document.querySelector(`[data-theme="${savedTheme}"]`);
    if (option) {
        changeTheme(option);
    }
}

// ========== TASK MANAGEMENT ==========

function setMinDate() {
    const today = new Date().toISOString().split('T')[0];
    const taskDateInput = document.getElementById('taskDate');
    if (taskDateInput) {
        taskDateInput.setAttribute('min', today);
    }
}

function openTaskModal() {
    const modal = document.getElementById('taskModal');
    if (modal) {
        modal.style.display = 'flex';
        const taskNameInput = document.getElementById('taskName');
        if (taskNameInput) {
            taskNameInput.focus();
        }
    }
}

function addTask() {
    const taskName = document.getElementById('taskName').value.trim();
    const taskDate = document.getElementById('taskDate').value;

    if (!taskName || !taskDate) {
        alert(CONFIG.MESSAGES.TASK_INCOMPLETE);
        return;
    }

    const task = {
        name: taskName,
        date: taskDate,
        id: 'TASK' + Math.random().toString(36).substr(2, 6).toUpperCase(),
        userId: currentUser.id,
        createdAt: new Date().toISOString(),
        priority: 'normal'
    };

    let tasks = JSON.parse(localStorage.getItem(CONFIG.STORAGE.TASKS_KEY) || '[]');
    tasks.push(task);
    tasks.sort((a, b) => new Date(a.date) - new Date(b.date));
    localStorage.setItem(CONFIG.STORAGE.TASKS_KEY, JSON.stringify(tasks));

    document.getElementById('taskName').value = '';
    document.getElementById('taskDate').value = '';
    closeModal('taskModal');
    loadTasks();

    console.log('Task added:', task.name);
}

function loadTasks() {
    const taskList = document.getElementById('task-list');
    if (!taskList) return;

    taskList.innerHTML = '';

    let tasks = JSON.parse(localStorage.getItem(CONFIG.STORAGE.TASKS_KEY) || '[]');
    const userTasks = tasks.filter(task => task.userId === currentUser.id);
    userTasks.sort((a, b) => new Date(a.date) - new Date(b.date));

    userTasks.forEach(task => {
        const li = document.createElement('li');
        const isOverdue = new Date(task.date) < new Date();

        li.innerHTML = `
            <div class="task-info" style="${isOverdue ? 'opacity: 0.7;' : ''}">
                <div class="task-name" style="${isOverdue ? 'text-decoration: line-through;' : ''}">${task.name}</div>
                <div class="task-date" style="color: ${isOverdue ? '#ff6b6b' : 'inherit'};">${formatDate(task.date)}</div>
            </div>
            <button class="btn-remove" onclick="removeTask('${task.id}')" title="Remove Task">✖</button>
        `;
        taskList.appendChild(li);
    });

    if (userTasks.length === 0) {
        taskList.innerHTML = '<li style="text-align: center; opacity: 0.7; padding: 20px;">No tasks yet. Add your first task!</li>';
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
        return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
        return 'Tomorrow';
    } else {
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
    }
}

function removeTask(taskId) {
    if (confirm(CONFIG.MESSAGES.TASK_CONFIRM_DELETE)) {
        let tasks = JSON.parse(localStorage.getItem(CONFIG.STORAGE.TASKS_KEY) || '[]');
        tasks = tasks.filter(t => t.id !== taskId);
        localStorage.setItem(CONFIG.STORAGE.TASKS_KEY, JSON.stringify(tasks));
        loadTasks();
        console.log('Task removed:', taskId);
    }
}

function cleanupPastTasks() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let tasks = JSON.parse(localStorage.getItem(CONFIG.STORAGE.TASKS_KEY) || '[]');
    const originalCount = tasks.length;

    const cutoffDate = new Date(today);
    cutoffDate.setDate(cutoffDate.getDate() - 7);

    tasks = tasks.filter(task => {
        const taskDate = new Date(task.date);
        taskDate.setHours(0, 0, 0, 0);
        return taskDate >= cutoffDate;
    });

    if (tasks.length !== originalCount) {
        localStorage.setItem(CONFIG.STORAGE.TASKS_KEY, JSON.stringify(tasks));
        console.log(`Cleaned up ${originalCount - tasks.length} old tasks`);
        if (document.getElementById('task-list')) {
            loadTasks();
        }
    }
}

// ========== UTILITY FUNCTIONS ==========

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

function showWelcome() {
    const message = `Welcome to your Enhanced Smart Dashboard!\n\n` +
        `New Features:\n` +
        `• Advanced MediaPipe Face Detection with Head Rotation Tracking\n` +
        `• Real-time Attention Quality Monitoring\n` +
        `• Comprehensive Session Analytics\n` +
        `• Saved Reports in Analytics Section\n` +
        `• Enhanced Performance Optimization\n` +
        `• Bot Professor for Learning Assistance\n\n` +
        `Your focus sessions are now automatically saved to the Analytics section. ` +
        `Start the timer to begin tracking with enhanced MediaPipe accuracy!`;

    alert(message);
}

function getApplicationState() {
    return {
        user: currentUser,
        timer: {
            isRunning: isTimerRunning,
            currentSeconds: timerSeconds,
            originalSeconds: originalTimerSeconds
        },
        session: {
            counter: sessionCounter,
            stats: sessionStats,
            hasActiveCamera: typeof detectionRunning !== 'undefined' ? detectionRunning : false,
            mediaPipeActive: attentionDetector ? attentionDetector.isInitialized() : false
        },
        storage: {
            tasks: localStorage.getItem(CONFIG.STORAGE.TASKS_KEY) ? 'available' : 'empty',
            reports: localStorage.getItem(CONFIG.STORAGE.REPORTS_KEY) ? 'available' : 'empty',
            theme: localStorage.getItem(CONFIG.STORAGE.THEME_KEY) || 'default'
        },
        botProfessor: {
            hasUploadedContent: uploadedContent.length > 0,
            memorySize: professorMemory.size
        }
    };
}

function exportSessionData() {
    const data = {
        user: currentUser,
        sessionCounter: sessionCounter,
        savedReports: JSON.parse(localStorage.getItem(CONFIG.STORAGE.REPORTS_KEY) || '[]'),
        tasks: JSON.parse(localStorage.getItem(CONFIG.STORAGE.TASKS_KEY) || '[]'),
        exportDate: new Date().toISOString(),
        mediaPipeVersion: 'Integrated',
        applicationVersion: '2.1.0',
        botProfessorData: {
            hasContent: uploadedContent.length > 0,
            contentLength: uploadedContent.length
        }
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `smart-dashboard-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('Session data exported with MediaPipe metrics and Bot Professor data');
}

// ========== EVENT LISTENERS ==========

document.addEventListener('keydown', function(event) {
    if (isTimerRunning && (event.key === 'r' || event.key === 'R')) {
        return;
    }

    if (event.code === 'Space' && event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA') {
        event.preventDefault();
        if (!isTimerRunning) {
            startTimer();
        } else {
            pauseTimer();
        }
    }

    if ((event.key === 'r' || event.key === 'R') && !isTimerRunning && event.target.tagName !== 'INPUT') {
        resetTimer();
    }

    if (event.key === 'Escape') {
        closeModal('taskModal');
        closeModal('timerModal');
        closeModal('reportModal');
    }

    if ((event.key === 'a' || event.key === 'A') && event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA') {
        const analyticsSection = document.getElementById('analyticsContent');
        if (analyticsSection) {
            analyticsSection.scrollIntoView({ behavior: 'smooth' });
        }
    }
});

document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
        validateUserSession();
        
        if (isTimerRunning) {
            console.log('Tab visible - timer still running');
            if (typeof detectionRunning !== 'undefined' && !detectionRunning && attentionDetector) {
                console.log('Attempting to restart camera after tab became visible');
                setTimeout(() => {
                    initCamera().catch(err => console.warn('Failed to restart camera:', err));
                }, 1000);
            }
        }
    }
});

window.addEventListener('error', function(event) {
    console.error('Application error:', event.error);

    if (event.error && event.error.message) {
        if (event.error.message.includes('camera') || event.error.message.includes('getUserMedia')) {
            console.warn('Camera-related error detected. Attention detection may not work properly.');
        } else if (event.error.message.includes('MediaPipe') || event.error.message.includes('FaceDetection')) {
            console.warn('MediaPipe error detected. Face detection may not work properly.');
        } else if (event.error.message.includes('localStorage') || event.error.message.includes('storage')) {
            console.warn('Storage error detected. Data saving may be affected.');
            alert('Warning: Data storage issue detected. Your session data may not be saved properly.');
        }
    }
});

// ========== INITIALIZATION ==========

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
} else {
    initDashboard();
}

// Global access for debugging and external use
if (typeof window !== 'undefined') {
    window.sessionStats = sessionStats;
    window.uploadedContent = uploadedContent;
    window.professorMemory = professorMemory;
    window.getApplicationState = getApplicationState;
    window.exportSessionData = exportSessionData;
}