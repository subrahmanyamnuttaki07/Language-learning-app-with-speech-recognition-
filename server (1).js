const express = require('express');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Load sample data
const rawData = fs.readFileSync('data.json');
const db = JSON.parse(rawData);

// Helper: get today's date string (YYYY-MM-DD)
function getTodayStr() {
    return new Date().toISOString().split('T')[0];
}

// Signup Endpoint
app.post('/api/signup', (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    if (db.users[email]) {
        return res.status(400).json({ success: false, message: 'Email already registered.' });
    }

    db.users[email] = {
        password,
        name,
        plan: 'Free',
        streak: 0,
        accuracy: 0,
        completedLessons: 0,
        lastActiveDate: ''
    };

    const user = { ...db.users[email] };
    delete user.password;
    res.json({ success: true, user: { ...user, email } });
});

// Login Endpoint
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    if (db.users[email] && db.users[email].password === password) {
        const user = { ...db.users[email], email };
        delete user.password;
        res.json({ success: true, user });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// Get User Stats
app.get('/api/user/:email', (req, res) => {
    const email = req.params.email;
    if (db.users[email]) {
        const user = { ...db.users[email], email };
        delete user.password;
        res.json({ success: true, user });
    } else {
        res.status(404).json({ success: false, message: 'User not found' });
    }
});

// Get Lessons for a Language
app.get('/api/lessons/:language', (req, res) => {
    const lang = req.params.language.toLowerCase();

    if (db.lessons[lang]) {
        res.json({ success: true, lessons: db.lessons[lang] });
    } else {
        res.status(404).json({ success: false, message: 'Language not found' });
    }
});

// Update Progress — streak increases ONCE per day
app.post('/api/progress', (req, res) => {
    const { email, accuracy } = req.body;

    if (!db.users[email]) {
        return res.status(401).json({ success: false, message: 'User not found' });
    }

    const user = db.users[email];
    const today = getTodayStr();
    const lastActive = user.lastActiveDate || '';

    // Calculate streak: only increase if last active was yesterday or today is first time
    let newStreak = user.streak || 0;

    if (lastActive === today) {
        // Already active today — don't increase streak, just update lessons/accuracy
    } else {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        if (lastActive === yesterdayStr) {
            // Continued streak!
            newStreak = newStreak + 1;
        } else if (lastActive === '') {
            // First time ever
            newStreak = 1;
        } else {
            // Streak broken — reset to 1
            newStreak = 1;
        }

        user.lastActiveDate = today;
    }

    // Update accuracy (rolling average)
    const newAccuracy = Math.round((user.accuracy + parseInt(accuracy)) / 2);
    const newLessons = (user.completedLessons || 0) + 1;

    user.streak = newStreak;
    user.accuracy = newAccuracy;
    user.completedLessons = newLessons;

    res.json({
        success: true,
        message: 'Progress updated',
        newAccuracy,
        newStreak,
        newLessons
    });
});

// Translate (Mock)
app.post('/api/translate', (req, res) => {
    const { text } = req.body;
    const mockTranslations = {
        "hello": "Hola (Spanish) / Bonjour (French) / Namaste (Hindi)",
        "how are you": "¿Cómo estás? (Spanish) / Comment allez-vous? (French)",
        "thank you": "Gracias (Spanish) / Merci (French) / Dhanyavaad (Hindi)",
        "goodbye": "Adiós (Spanish) / Au revoir (French) / Alvida (Hindi)",
        "yes": "Sí (Spanish) / Oui (French) / Haan (Hindi)",
        "no": "No (Spanish) / Non (French) / Nahi (Hindi)",
        "water": "Agua (Spanish) / Eau (French) / Paani (Hindi)",
        "food": "Comida (Spanish) / Nourriture (French) / Khaana (Hindi)"
    };

    const translation = mockTranslations[text.toLowerCase().trim()];

    if (translation) {
        res.json({ success: true, translation });
    } else {
        res.json({ success: true, translation: `No translation found for "${text}". Try: hello, thank you, goodbye, water, food` });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});