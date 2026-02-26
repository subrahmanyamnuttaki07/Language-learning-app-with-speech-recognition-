const bcrypt = require('bcryptjs');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

function loadLessons() {
    const rawData = fs.readFileSync('data.json');
    return JSON.parse(rawData);
}

function getTodayStr() {
    return new Date().toISOString().split('T')[0];
}

// SIGNUP
app.post('/api/signup', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
        return res.status(400).json({ success: false, message: 'All fields are required.' });

    // Check if user exists
    const { data: existing } = await supabase
        .from('users')
        .select('email')
        .eq('email', email)
        .single();

    if (existing)
        return res.status(400).json({ success: false, message: 'Email already registered.' });

    const { data, error } = await supabase
        .from('users')
        .insert([{ name, email, password, plan: 'Free', streak: 0, accuracy: 0, completed_lessons: 0, last_active: '' }])
        .select()
        .single();

    if (error)
        return res.status(500).json({ success: false, message: error.message });

    const user = { ...data };
    delete user.password;
    res.json({ success: true, user });
});

// LOGIN
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

    if (error || !data)
        return res.status(401).json({ success: false, message: 'Invalid credentials' });

    // Compare hashed password
    const isMatch = await bcrypt.compare(password, data.password);
    if (!isMatch)
        return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const user = { ...data };
    delete user.password;
    res.json({ success: true, user });
});
// GET USER
app.get('/api/user/:email', async (req, res) => {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', req.params.email)
        .single();

    if (error || !data)
        return res.status(404).json({ success: false, message: 'User not found' });

    const user = { ...data };
    delete user.password;
    res.json({ success: true, user });
});

// LESSONS
app.get('/api/lessons/:language', (req, res) => {
    const db = loadLessons();
    const lang = req.params.language.toLowerCase();
    if (db.lessons[lang]) {
        res.json({ success: true, lessons: db.lessons[lang] });
    } else {
        res.status(404).json({ success: false, message: 'Language not found' });
    }
});

// PROGRESS
app.post('/api/progress', async (req, res) => {
    const { email, accuracy } = req.body;

    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

    if (error || !user)
        return res.status(401).json({ success: false, message: 'User not found' });

    const today = getTodayStr();
    const lastActive = user.last_active || '';
    let newStreak = user.streak || 0;

    if (lastActive !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        newStreak = lastActive === yesterdayStr ? newStreak + 1 : 1;
    }

    const newAccuracy = Math.round((user.accuracy + parseInt(accuracy)) / 2);
    const newLessons = (user.completed_lessons || 0) + 1;

    await supabase
        .from('users')
        .update({ streak: newStreak, accuracy: newAccuracy, completed_lessons: newLessons, last_active: today })
        .eq('email', email);

    res.json({ success: true, newAccuracy, newStreak, newLessons });
});

// TRANSLATE
app.post('/api/translate', (req, res) => {
    const { text } = req.body;
    const mockTranslations = {
        "hello": "Hola (Spanish) / Bonjour (French) / Namaste (Hindi)",
        "thank you": "Gracias (Spanish) / Merci (French) / Dhanyavaad (Hindi)",
        "goodbye": "Adiós (Spanish) / Au revoir (French) / Alvida (Hindi)",
        "yes": "Sí (Spanish) / Oui (French) / Haan (Hindi)",
        "no": "No (Spanish) / Non (French) / Nahi (Hindi)",
        "water": "Agua (Spanish) / Eau (French) / Paani (Hindi)",
        "food": "Comida (Spanish) / Nourriture (French) / Khaana (Hindi)"
    };
    const translation = mockTranslations[text.toLowerCase().trim()];
    res.json({ success: true, translation: translation || `No translation found for "${text}". Try: hello, thank you, goodbye, water, food` });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});