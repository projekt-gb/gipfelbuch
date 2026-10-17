// ==========================================
// 1. BENÖTIGTE MODULE IMPORTIEREN
// ==========================================
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();

// ==========================================
// 2. MIDDLEWARE KONFIGURATION
// ==========================================
// Verarbeitet Formulardaten und JSON-Bodies aus Frontend-Anfragen (z.B. Fetch/POST)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Statische Dateien (HTML, CSS, JS) aus dem 'public'-Ordner bereitstellen
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 3. MONGODB ATLAS VERBINDUNG
// ==========================================
const mongoURI = process.env.MONGO_URI || '';

if (!mongoURI) {
    console.error("🔴 FEHLER: Keine MONGO_URI Umgebungsvariable in Render gefunden!");
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

// Verknüpfung mit der MongoDB Collection 'eintraege'
const Eintrag = mongoose.model('Eintrag', gipfelEintragSchema, 'eintraege');

// ==========================================
// 5. HILFSFUNKTION FÜR DAS ADMIN-PASSWORT
// ==========================================
// Prüft die Umgebungsvariable ADMIN_PASSWORD; greift sonst auf Fallback 'geheim123' zurück
const getAdminPassword = () => process.env.ADMIN_PASSWORD || 'geheim123';

// ==========================================
// 6. ROUTES (ENDPUNKTE)
// ==========================================

// EXPLICIT ROUTE: Admin-Seite direkt aufrufen
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// GET: Öffentliche (freigegebene) Einträge abrufen
app.get('/api/eintraege', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(500).json({ error: "Datenbankverbindung nicht bereit." });
        }
        const eintraege = await Eintrag.find({ freigegeben: true }).sort({ datum: -1 });
        res.json(eintraege);
    } catch (err) {
        console.error("Fehler beim Abrufen der öffentlichen Einträge:", err.message);
        res.status(500).json({ error: "Fehler beim Laden der Einträge." });
    }
});

// POST: Neuen Gipfelbucheintrag speichern
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
            freigegeben: false // Neue Einträge müssen erst vom Admin freigegeben werden
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
// ADMIN-MODERATIONS-ENDPUNKTE
// ------------------------------------------

// 1. Alle Einträge für den Admin-Bereich laden
app.post('/api/admin/eintraege', async (req, res) => {
    try {
        const { password } = req.body;

        // Passwort-Prüfung
        if (password !== getAdminPassword()) {
            return res.status(401).json({ error: "Falsches Passwort." });
        }

        // Datenbank-Verbindungsprüfung
        if (mongoose.connection.readyState !== 1) {
            console.error("🔴 MongoDB ist nicht verbunden! Status:", mongoose.connection.readyState);
            return res.status(500).json({ error: "Datenbank nicht bereit." });
        }

        // Alle Einträge abrufen (sowohl freigegebene als auch ausstehende)
        const eintraege = await Eintrag.find({}).sort({ datum: -1 });
        res.json(eintraege);
    } catch (err) {
        console.error("🔴 Fehler beim Laden der Admin-Einträge:", err.message);
        res.status(500).json({ error: "Serverfehler: " + err.message });
    }
});

// 2. Einen Eintrag freischalten
app.post('/api/admin/freischalten', async (req, res) => {
    try {
        const { password, id } = req.body;

        if (password !== getAdminPassword()) {
            return res.status(401).json({ error: "Falsches Passwort." });
        }

        await Eintrag.findByIdAndUpdate(id, { freigegeben: true });
        console.log(`🟢 Eintrag ${id} wurde freigegeben.`);
        res.json({ success: true });
    } catch (err) {
        console.error("Fehler beim Freischalten:", err.message);
        res.status(500).json({ error: "Serverfehler beim Freischalten." });
    }
});

// 3. Einen Eintrag löschen
app.post('/api/admin/loeschen', async (req, res) => {
    try {
        const { password, id } = req.body;

        if (password !== getAdminPassword()) {
            return res.status(401).json({ error: "Falsches Passwort." });
        }

        await Eintrag.findByIdAndDelete(id);
        console.log(`🗑️ Eintrag ${id} wurde gelöscht.`);
        res.json({ success: true });
    } catch (err) {
        console.error("Fehler beim Löschen:", err.message);
        res.status(500).json({ error: "Serverfehler beim Löschen." });
    }
});

// ==========================================
// 7. SERVER STARTEN
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server läuft stabil auf Port ${PORT}`);
});
