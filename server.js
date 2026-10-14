// ==========================================
// 1. BENÖTIGTE MODULE IMPORTIEREN
// ==========================================
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();

// ==========================================
// 2. MIDDLEWARE CONFIGURATION
// ==========================================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Statische Dateien (HTML, CSS, JS) aus dem 'public'-Ordner bereitstellen
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 3. MONGODB ATLAS VERBINDUNG
// ==========================================
const mongoURI = process.env.MONGO_URI || '';

if (!mongoURI) {
    console.error("FEHLER: Keine MONGO_URI Umgebungsvariable in Render gefunden!");
} else {
    mongoose.connect(mongoURI, {
        serverSelectionTimeoutMS: 5000
    })
    .then(() => console.log("🟢 Erfolgreich mit MongoDB Atlas verbunden!"))
    .catch(err => console.error("🔴 Verbindungsfehler zu MongoDB Atlas:", err.message));
}

// ==========================================
// 4. DATENBANK-SCHEMA & MODEL DEFINIEREN
// ==========================================
const gipfelEintragSchema = new mongoose.Schema({
    name: { type: String, required: true },
    nachricht: { type: String, default: '' },
    summitCode: { type: Number },
    captchaAnswer: { type: Number },
    freigegeben: { type: Boolean, default: false },
    datum: { type: Date, default: Date.now }
});

const Eintrag = mongoose.model('Eintrag', gipfelEintragSchema, 'eintraege');

// ==========================================
// 5. ROUTES (ENDPUNKTE)
// ==========================================

// EXPLICIT ROUTE: Admin-Seite aufrufen
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// GET: Alle freigegebenen Einträge abrufen (Öffentliches Gipfelbuch)
app.get('/api/eintraege', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(500).json({ error: "Datenbankverbindung nicht bereit." });
        }
        const eintraege = await Eintrag.find({ freigegeben: true }).sort({ datum: -1 });
        res.json(eintraege);
    } catch (err) {
        console.error("Fehler beim Abrufen der Einträge:", err.message);
        res.status(500).json({ error: "Fehler beim Laden der Einträge." });
    }
});

// POST: Neuen Eintrag speichern (Öffentliches Formular)
app.post('/api/eintraege', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(500).json({ success: false, error: "Keine Verbindung zur Datenbank." });
        }

        const { name, nachricht, summitCode, captchaAnswer } = req.body;

        if (!name || name.trim() === "") {
            return res.status(400).json({ success: false, error: "Der Name darf nicht leer sein." });
        }

        const neuerEintrag = new Eintrag({
            name: name.trim(),
            nachricht: nachricht ? nachricht.trim() : '',
            summitCode: summitCode ? Number(summitCode) : undefined,
            captchaAnswer: captchaAnswer ? Number(captchaAnswer) : undefined,
            freigegeben: false
        });

        await neuerEintrag.save();
        console.log("🟢 Neuer Eintrag erfolgreich gespeichert!");

        res.json({ success: true, message: "Eintrag erfolgreich gespeichert." });
    } catch (err) {
        console.error("🔴 Fehler beim Speichern:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ------------------------------------------
// ADMIN-ENDPUNKTE (Passwortprüfung im Body)
// ------------------------------------------

// 1. Alle Einträge für Admin laden
app.post('/api/admin/eintraege', async (req, res) => {
    try {
        const { password } = req.body;
        if (password !== process.env.ADMIN_PASSWORD) {
            return res.status(401).json({ error: "Falsches Passwort." });
        }

        const eintraege = await Eintrag.find({}).sort({ datum: -1 });
        res.json(eintraege);
    } catch (err) {
        console.error("Fehler beim Laden der Admin-Einträge:", err.message);
        res.status(500).json({ error: "Serverfehler." });
    }
});

// 2. Eintrag freischalten
app.post('/api/admin/freischalten', async (req, res) => {
    try {
        const { password, id } = req.body;
        if (password !== process.env.ADMIN_PASSWORD) {
            return res.status(401).json({ error: "Falsches Passwort." });
        }

        await Eintrag.findByIdAndUpdate(id, { freigegeben: true });
        console.log(`🟢 Eintrag ${id} wurde freigegeben.`);
        res.json({ success: true });
    } catch (err) {
        console.error("Fehler beim Freischalten:", err.message);
        res.status(500).json({ error: "Serverfehler." });
    }
});

// 3. Eintrag löschen
app.post('/api/admin/loeschen', async (req, res) => {
    try {
        const { password, id } = req.body;
        if (password !== process.env.ADMIN_PASSWORD) {
            return res.status(401).json({ error: "Falsches Passwort." });
        }

        await Eintrag.findByIdAndDelete(id);
        console.log(`🗑️ Eintrag ${id} wurde gelöscht.`);
        res.json({ success: true });
    } catch (err) {
        console.error("Fehler beim Löschen:", err.message);
        res.status(500).json({ error: "Serverfehler." });
    }
});

// ==========================================
// 6. SERVER STARTEN
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server läuft stabil auf Port ${PORT}`);
});
