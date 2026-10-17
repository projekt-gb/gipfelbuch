// ==========================================
// 1. BENÖTIGTE MODULE IMPORTIEREN
// ==========================================
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const crypto = require('crypto'); // Für sichere Captcha-Tokens

const app = express();

// Secret Key für die Entschlüsselung/Signierung des Captchas
const CAPTCHA_SECRET = process.env.CAPTCHA_SECRET || 'gipfelbuch_geheim_key_2026';

// ==========================================
// 2. MIDDLEWARE KONFIGURATION
// ==========================================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 3. MONGODB ATLAS VERBINDUNG
// ==========================================
const mongoURI = process.env.MONGO_URI || "mongodb+srv://office_db_user:20mussdaswirklichsein26@cluster0.iwrleno.mongodb.net/gipfelbuch?retryWrites=true&w=majority";

mongoose.connect(mongoURI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000
})
.then(() => console.log("🟢 Erfolgreich mit MongoDB Atlas verbunden!"))
.catch(err => console.error("🔴 Verbindungsfehler zu MongoDB Atlas:", err.message));

// ==========================================
// 4. DATENBANK-SCHEMA & MODEL DEFINIEREN
// ==========================================
const gipfelEintragSchema = new mongoose.Schema({
    name: { type: String, required: true },
    nachricht: { type: String, default: '' },
    freigegeben: { type: Boolean, default: false },
    datum: { type: Date, default: Date.now }
});

const Eintrag = mongoose.model('Eintrag', gipfelEintragSchema, 'eintraege');

// ==========================================
// 5. HILFSFUNKTIONEN
// ==========================================
const getAdminPassword = () => process.env.ADMIN_PASSWORD || 'geheim123';

// Erstellt ein signiertes Token aus der korrekten Lösung
function erstelleCaptchaToken(loesung) {
    const payload = `${loesung}:${Date.now()}`;
    const hmac = crypto.createHmac('sha256', CAPTCHA_SECRET).update(payload).digest('hex');
    return Buffer.from(`${payload}:${hmac}`).toString('base64');
}

// Prüft, ob die eingegebene Antwort zum Token passt
function pruefeCaptchaToken(token, eingabe) {
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        const [loesung, timestamp, hmac] = decoded.split(':');

        // Token-Gültigkeit (z. B. max. 10 Minuten alt)
        if (Date.now() - Number(timestamp) > 10 * 60 * 1000) {
            return false;
        }

        const erwarteterHmac = crypto.createHmac('sha256', CAPTCHA_SECRET).update(`${loesung}:${timestamp}`).digest('hex');
        if (hmac !== erwarteterHmac) {
            return false;
        }

        return Number(loesung) === Number(eingabe);
    } catch (e) {
        return false;
    }
}

// ==========================================
// 6. ÖFFENTLICHE API-ROUTEN
// ==========================================

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Neue Route: Generiert wechselnde Rechenaufgaben
app.get('/api/captcha', (req, res) => {
    const num1 = Math.floor(Math.random() * 10) + 1; // Zahl zwischen 1 und 10
    const num2 = Math.floor(Math.random() * 10) + 1;
    const istPlus = Math.random() > 0.5;

    const frage = istPlus ? `Was ist ${num1} + ${num2}?` : `Was ist ${num1 + num2} - ${num2}?`;
    const loesung = istPlus ? (num1 + num2) : num1;

    const token = erstelleCaptchaToken(loesung);
    res.json({ frage, token });
});

// Öffentliche Einträge abrufen
app.get('/api/eintraege', async (req, res) => {
    try {
        const eintraege = await Eintrag.find({ freigegeben: true }).sort({ datum: -1 });
        res.json(eintraege);
    } catch (err) {
        console.error("Fehler beim Abrufen der öffentlichen Einträge:", err.message);
        res.status(500).json({ error: "Fehler beim Laden der Einträge." });
    }
});

// Neuen Eintrag hinzufügen mit dynamischer Captcha-Prüfung
app.post('/api/eintraege', async (req, res) => {
    try {
        const { name, nachricht, captchaAnswer, captchaToken } = req.body;

        if (!name || name.trim() === "") {
            return res.status(400).json({ success: false, error: "Der Name darf nicht leer sein." });
        }

        // Strenge Prüfung des wechselnden Captchas
        if (!captchaToken || !captchaAnswer || !pruefeCaptchaToken(captchaToken, captchaAnswer)) {
            return res.status(400).json({ success: false, error: "Bitte die korrekte Antwort eintragen." });
        }

        const neuerEintrag = new Eintrag({
            name: name.trim(),
            nachricht: nachricht ? nachricht.trim() : '',
            freigegeben: false
        });

        await neuerEintrag.save();
        res.json({ success: true, message: "Eintrag erfolgreich gespeichert." });
    } catch (err) {
        console.error("🔴 Fehler beim Speichern:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// 7. ADMIN-MODERATIONS-ROUTEN
// ==========================================

app.post('/api/admin/eintraege', async (req, res) => {
    try {
        const { password } = req.body;
        if (password !== getAdminPassword()) {
            return res.status(401).json({ error: "Falsches Admin-Passwort!" });
        }
        const eintraege = await Eintrag.find({}).sort({ datum: -1 });
        res.json(eintraege);
    } catch (err) {
        res.status(500).json({ error: "Serverfehler: " + err.message });
    }
});

app.post('/api/admin/freischalten', async (req, res) => {
    try {
        const { password, id } = req.body;
        if (password !== getAdminPassword()) {
            return res.status(401).json({ error: "Falsches Passwort." });
        }
        await Eintrag.findByIdAndUpdate(id, { freigegeben: true });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Serverfehler beim Freischalten." });
    }
});

app.post('/api/admin/loeschen', async (req, res) => {
    try {
        const { password, id } = req.body;
        if (password !== getAdminPassword()) {
            return res.status(401).json({ error: "Falsches Passwort." });
        }
        await Eintrag.findByIdAndDelete(id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Serverfehler beim Löschen." });
    }
});

// ==========================================
// 8. SERVER STARTEN
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server läuft auf Port ${PORT}`);
});
