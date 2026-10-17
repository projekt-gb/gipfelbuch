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
// Erlaubt das Verarbeiten von Formulardaten und JSON-Anfragen im Request-Body
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Stellt statische Dateien (wie index.html und admin.html) aus dem Ordner 'public' bereit
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 3. MONGODB ATLAS VERBINDUNG
// ==========================================
// Verwendet die Umgebungsvariable MONGO_URI oder die direkte Verbindungs-URL als Fallback
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
// Schema für einen Gipfelbucheintrag
const gipfelEintragSchema = new mongoose.Schema({
    name: { type: String, required: true },
    nachricht: { type: String, default: '' },
    summitCode: { type: Number },
    freigegeben: { type: Boolean, default: false }, // Standardmäßig auf unbestätigt/false
    datum: { type: Date, default: Date.now }
});

const Eintrag = mongoose.model('Eintrag', gipfelEintragSchema, 'eintraege');

// ==========================================
// 5. HILFSFUNKTION FÜR DAS ADMIN-PASSWORT
// ==========================================
const getAdminPassword = () => process.env.ADMIN_PASSWORD || 'geheim123';

// ==========================================
// 6. ÖFFENTLICHE API-ROUTEN
// ==========================================

// Bietet die Admin-Oberfläche unter /admin an
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Ruft alle freigegebenen Einträge für die öffentliche Ansicht ab
app.get('/api/eintraege', async (req, res) => {
    try {
        const eintraege = await Eintrag.find({ freigegeben: true }).sort({ datum: -1 });
        res.json(eintraege);
    } catch (err) {
        console.error("Fehler beim Abrufen der öffentlichen Einträge:", err.message);
        res.status(500).json({ error: "Fehler beim Laden der Einträge." });
    }
});

// Speichert einen neuen Eintrag mit doppelter Sicherheitsprüfung
app.post('/api/eintraege', async (req, res) => {
    try {
        const { name, nachricht, summitCode, captchaAnswer, captchaExpected } = req.body;

        // 1. Namen-Prüfung
        if (!name || String(name).trim() === "") {
            return res.status(400).json({ success: false, error: "Der Name darf nicht leer sein." });
        }

        // 2. Prüfung 1: Gipfel-Code (Muss exakt das Jahr 1961 sein)
        const KORREKTES_JAHR = 1961;
        const eingetragenesJahr = parseInt(summitCode, 10);

        if (isNaN(eingetragenesJahr) || eingetragenesJahr !== KORREKTES_JAHR) {
            return res.status(400).json({ success: false, error: "Bitte die korrekte Antwort eintragen." });
        }

        // 3. Prüfung 2: Dynamische Rechenaufgabe (Math-Captcha)
        const antw = parseInt(captchaAnswer, 10);
        const erww = parseInt(captchaExpected, 10);

        if (isNaN(antw) || isNaN(erww) || antw !== erww) {
            return res.status(400).json({ success: false, error: "Bitte die korrekte Antwort eintragen." });
        }

        // 4. Eintrag vorbereiten und in Datenbank speichern
        const neuerEintrag = new Eintrag({
            name: String(name).trim(),
            nachricht: nachricht ? String(nachricht).trim() : '',
            summitCode: eingetragenesJahr,
            freigegeben: false // Startet als unbestätigt
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

// Alle Einträge (auch unbestätigte) für das Admin-Dashboard laden
app.post('/api/admin/eintraege', async (req, res) => {
    try {
        const { password } = req.body;
        
        if (password !== getAdminPassword()) {
            return res.status(401).json({ error: "Falsches Admin-Passwort!" });
        }

        const eintraege = await Eintrag.find({}).sort({ datum: -1 });
        res.json(eintraege);
    } catch (err) {
        console.error("Fehler beim Laden der Admin-Einträge:", err.message);
        res.status(500).json({ error: "Serverfehler: " + err.message });
    }
});

// Eintrag freischalten
app.post('/api/admin/freischalten', async (req, res) => {
    try {
        const { password, id } = req.body;
        if (password !== getAdminPassword()) {
            return res.status(401).json({ error: "Falsches Passwort." });
        }

        await Eintrag.findByIdAndUpdate(id, { freigegeben: true });
        res.json({ success: true });
    } catch (err) {
        console.error("Fehler beim Freischalten:", err.message);
        res.status(500).json({ error: "Serverfehler beim Freischalten." });
    }
});

// Eintrag löschen
app.post('/api/admin/loeschen', async (req, res) => {
    try {
        const { password, id } = req.body;
        if (password !== getAdminPassword()) {
            return res.status(401).json({ error: "Falsches Passwort." });
        }

        await Eintrag.findByIdAndDelete(id);
        res.json({ success: true });
    } catch (err) {
        console.error("Fehler beim Löschen:", err.message);
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
