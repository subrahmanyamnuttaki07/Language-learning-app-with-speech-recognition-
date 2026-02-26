// Base URL for Backend API
const API_BASE = 'http://localhost:3000/api';

// --- AUTH & USER LOGIC ---
function checkAuth() {
    const user = localStorage.getItem('GenSpeak_user');
    const authUIRequiredPages = ['dashboard.html'];

    if (user) {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.style.display = 'inline-block';
            logoutBtn.addEventListener('click', () => {
                localStorage.removeItem('GenSpeak_user');
                window.location.href = 'index.html';
            });
        }
    } else {
        if (authUIRequiredPages.some(page => window.location.href.includes(page))) {
            window.location.href = 'login.html';
        }
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');

    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();

        if (data.success) {
            localStorage.setItem('GenSpeak_user', JSON.stringify(data.user));
            window.location.href = 'dashboard.html';
        } else {
            errorDiv.style.display = 'block';
            errorDiv.innerText = data.message;
        }
    } catch (err) {
        errorDiv.style.display = 'block';
        errorDiv.innerText = "Error connecting to server. Is the backend running?";
    }
}

// --- DASHBOARD ---
async function loadDashboard() {
    checkAuth();
    const user = JSON.parse(localStorage.getItem('GenSpeak_user'));
    if (!user) return;

    document.getElementById('userName').innerText = user.name;
    document.getElementById('welcomeName').innerText = user.name.split(' ')[0];
    document.getElementById('userInitial').innerText = user.name.charAt(0);
    document.getElementById('userPlan').innerText = (user.plan || 'Free') + " Plan";

    try {
        const res = await fetch(`${API_BASE}/user/${user.email}`);
        const data = await res.json();
        if (data.success) {
            const updatedUser = { ...user, ...data.user };
            localStorage.setItem('GenSpeak_user', JSON.stringify(updatedUser));

            document.getElementById('streakVal').innerText = data.user.streak;
            document.getElementById('accuracyVal').innerText = data.user.accuracy;
            document.getElementById('lessonsVal').innerText = data.user.completed_lessons || 0;

            const progress = Math.min((data.user.completedLessons / 10) * 100, 100);
            document.getElementById('goalProgress').innerText = data.user.completed_lessons || 0;
            document.getElementById('progressFill').style.width = progress + '%';
        }
    } catch (e) {
        document.getElementById('streakVal').innerText = user.streak || 0;
        document.getElementById('accuracyVal').innerText = user.accuracy || 0;
        document.getElementById('lessonsVal').innerText = user.completedLessons || 0;
        document.getElementById('goalProgress').innerText = user.completedLessons || 0;
        document.getElementById('progressFill').style.width = '0%';
    }
}

// --- LESSONS LOGIC ---
async function fetchLessons() {
    checkAuth();
    const lang = document.getElementById('languageSelect').value;
    const container = document.getElementById('lessonsContainer');

    container.innerHTML = `<div style="text-align:center; padding:50px;"><i class="fa-solid fa-spinner fa-spin fa-2x text-primary"></i></div>`;

    try {
        const response = await fetch(`${API_BASE}/lessons/${lang}`);
        const data = await response.json();

        if (data.success) {
            container.innerHTML = '';
            data.lessons.forEach(lesson => {
                const card = document.createElement('div');
                card.style.cssText = `background:var(--bg-card); padding:25px; border-radius:16px; border:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between; align-items:center; transition:transform 0.2s; cursor:pointer;`;
                card.onmouseover = () => card.style.transform = "scale(1.02)";
                card.onmouseout = () => card.style.transform = "scale(1)";

                const startLesson = () => {
                    // Save words AND the language code for speech recognition
                    localStorage.setItem('GenSpeak_words', JSON.stringify(lesson.words));
                    localStorage.setItem('GenSpeak_lang', lesson.lang || 'es-ES');
                    window.location.href = 'practice.html';
                };

                card.onclick = startLesson;

                card.innerHTML = `
                    <div>
                        <div style="font-size:0.8rem; color:var(--primary-light); text-transform:uppercase; font-weight:700; margin-bottom:5px;">${lesson.level}</div>
                        <h3 style="margin-bottom:10px;">${lesson.title}</h3>
                        <p style="color:var(--text-muted); font-size:0.9rem;">${lesson.words.length} Vocabulary Words • ${lesson.sentences.length} Sentence Practice</p>
                    </div>
                    <button class="btn btn-primary" id="start-${lesson.id}">Start</button>
                `;
                container.appendChild(card);

                // Attach click to button separately to avoid JSON stringify issues
                card.querySelector(`#start-${lesson.id}`).addEventListener('click', (e) => {
                    e.stopPropagation();
                    startLesson();
                });
            });
        } else {
            container.innerHTML = `<p style="color:var(--danger)">${data.message}</p>`;
        }
    } catch (err) {
        container.innerHTML = `<p style="color:var(--danger)">Error connecting to server. Make sure the backend is running on port 3000.</p>`;
    }
}

// --- SPEECH RECOGNITION & PRACTICE LOGIC ---
let practiceWords = [];
let currentIndex = 0;
let recognition;
let lessonCompleted = false;
let wordsSpoken = 0;

function initPracticeMode() {
    checkAuth();

    const saved = localStorage.getItem('GenSpeak_words');
    const savedLang = localStorage.getItem('GenSpeak_lang') || 'es-ES'; // Use saved language

    if (saved) {
        practiceWords = JSON.parse(saved);
        currentIndex = 0;
        lessonCompleted = false;
        wordsSpoken = 0;
        loadWord();
    } else {
        document.getElementById('targetWord').innerText = "Please select a lesson first.";
        document.getElementById('listenBtn').disabled = true;
        document.getElementById('recordBtn').disabled = true;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.lang = savedLang; // ✅ Use the correct language
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onresult = (event) => {
            const spokenText = event.results[0][0].transcript.toLowerCase();
            const target = practiceWords[currentIndex].word.toLowerCase();
            const confidence = event.results[0][0].confidence;
            evaluateSpeech(spokenText, target, confidence);
        };

        recognition.onspeechend = () => {
            recognition.stop();
            document.getElementById('recordBtn').classList.remove('recording');
        };

        recognition.onerror = (e) => {
            console.error("Speech error", e);
            document.getElementById('recordBtn').classList.remove('recording');
            document.getElementById('feedbackBox').innerHTML = `<span style="color:var(--danger)">Speech recognition error: ${e.error}</span>`;
        };
    } else {
        document.getElementById('feedbackBox').innerHTML = `<span style="color:var(--danger)">Web Speech API not supported. Please use Chrome.</span>`;
        document.getElementById('recordBtn').disabled = true;
    }

    document.getElementById('recordBtn')?.addEventListener('click', () => {
        if (!recognition || lessonCompleted) return;
        document.getElementById('feedbackBox').innerHTML = "Listening...";
        document.getElementById('recordBtn').classList.add('recording');
        recognition.start();
    });

    document.getElementById('skipBtn')?.addEventListener('click', () => {
        if (lessonCompleted) return;
        currentIndex++;
        if (currentIndex >= practiceWords.length) {
            if (wordsSpoken >= Math.ceil(practiceWords.length / 2)) {
                showLessonComplete();
            } else {
                document.getElementById('feedbackBox').innerHTML = `
                    <div style="color:var(--warning); font-weight:700;">
                        Please speak at least ${Math.ceil(practiceWords.length / 2)} words to complete the lesson!
                    </div>`;
                currentIndex = 0;
                loadWord();
            }
        } else {
            loadWord();
        }
    });

    document.getElementById('listenBtn')?.addEventListener('click', speakWord);
}

function showLessonComplete() {
    lessonCompleted = true;

    document.getElementById('targetWord').innerText = "🎉 Lesson Complete!";
    document.getElementById('wordMeaning').innerText = "You practiced all words!";
    document.getElementById('wordPronunciation').innerText = "";
    document.getElementById('feedbackBox').innerHTML = `
        <div style="text-align:center;">
            <div style="font-size:1.3rem; font-weight:700; color:var(--success); margin-bottom:15px;">
                Great job! You completed this lesson!
            </div>
            <a href="lessons.html" class="btn btn-primary" style="margin-right:10px;">Back to Lessons</a>
            <a href="dashboard.html" class="btn btn-outline">View Dashboard</a>
        </div>
    `;

    document.getElementById('recordBtn').disabled = true;
    document.getElementById('listenBtn').disabled = true;
    document.getElementById('skipBtn').disabled = true;

    updateProgressScore(100);
}

function loadWord() {
    if (!practiceWords.length) return;
    const data = practiceWords[currentIndex];

    const wElem = document.getElementById('targetWord');
    wElem.style.opacity = 0;
    setTimeout(() => {
        wElem.innerText = data.word;
        document.getElementById('wordMeaning').innerText = data.meaning;
        document.getElementById('wordPronunciation').innerText = "/" + data.pronunciation + "/";
        document.getElementById('feedbackBox').innerHTML = `Word ${currentIndex + 1} of ${practiceWords.length} — Click the microphone to start.`;
        wElem.style.opacity = 1;
    }, 200);
}

function speakWord() {
    if (!practiceWords.length || lessonCompleted) return;
    const savedLang = localStorage.getItem('GenSpeak_lang') || 'es-ES';
    const utterance = new SpeechSynthesisUtterance(practiceWords[currentIndex].word);
    utterance.lang = savedLang; // ✅ Speak in the correct language
    window.speechSynthesis.speak(utterance);
}

function evaluateSpeech(spoken, target, confidence) {
    const feedbackBox = document.getElementById('feedbackBox');

    const spokenClean = spoken.trim().toLowerCase().replace(/[.,!?]/g, '');
    const targetClean = target.trim().toLowerCase().replace(/[.,!?]/g, '');

    let accuracy = 0;
    if (spokenClean === targetClean) {
        accuracy = 100;
    } else if (spokenClean.includes(targetClean.substring(0, targetClean.length - 1))) {
        accuracy = 85;
    } else {
        accuracy = Math.round(confidence * 100);
    }

    let color = 'var(--danger)';
    let msg = 'Try again!';
    if (accuracy >= 90) { color = 'var(--success)'; msg = 'Perfect pronunciation!'; }
    else if (accuracy > 60) { color = 'var(--warning)'; msg = 'Good, but needs improvement.'; }

    feedbackBox.style.borderLeft = `4px solid ${color}`;
    feedbackBox.innerHTML = `
        <div style="font-size: 1.2rem; font-weight:700; color:${color}">${accuracy}% Accuracy - ${msg}</div>
        <div style="font-size: 0.9rem; color:var(--text-muted); margin-top:5px;">You said: "${spoken}"</div>
    `;

    if (accuracy >= 60) {
        wordsSpoken++;
        setTimeout(() => {
            currentIndex++;
            if (currentIndex >= practiceWords.length) {
                showLessonComplete();
            } else {
                loadWord();
            }
        }, 2000);
    }
}

async function updateProgressScore(acc) {
    const user = JSON.parse(localStorage.getItem('GenSpeak_user'));
    if (!user) return;
    try {
        const res = await fetch(`${API_BASE}/progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user.email, accuracy: acc })
        });
        const data = await res.json();
        if (data.success) {
            user.accuracy = data.newAccuracy;
            user.streak = data.newStreak;
            user.completedLessons = data.newLessons;
            localStorage.setItem('GenSpeak_user', JSON.stringify(user));
        }
    } catch (e) {
        console.error("Could not update progress");
    }
}

// Translator
function initTranslator() {
    const btn = document.getElementById('translateBtn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        const text = document.getElementById('translateInput').value;
        const resultDiv = document.getElementById('translateResult');
        resultDiv.innerText = "Translating...";
        try {
            const res = await fetch(`${API_BASE}/translate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, targetLanguage: 'Spanish' })
            });
            const data = await res.json();
            if (data.success) {
                resultDiv.innerHTML = `<span style="font-size:1.2rem;">${data.translation}</span>`;
            } else {
                resultDiv.innerText = "Error translating text.";
            }
        } catch (e) {
            resultDiv.innerText = "Error communicating with backend.";
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    if (!window.location.href.includes('login') &&
        !window.location.href.includes('index') &&
        !window.location.href.includes('signup') &&
        !window.location.href.endsWith('/') &&
        !window.location.href.endsWith('language-learning')) {
        checkAuth();
    }

    const heroBtn = document.getElementById('heroMicBtn');
    if (heroBtn) {
        heroBtn.addEventListener('click', () => {
            heroBtn.classList.add('recording');
            document.getElementById('heroSpeechResult').innerText = "Listening...";
            setTimeout(() => {
                heroBtn.classList.remove('recording');
                document.getElementById('heroSpeechResult').innerHTML = "Awesome! Looks like you're ready to learn. <a href='login.html' style='color:var(--primary-light)'>Start here</a>";
            }, 3000);
        });
    }
});