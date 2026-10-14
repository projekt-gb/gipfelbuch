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

// Statische Dateien aus dem 'public'-Ordner bereitstellen
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 3. MONGODB ATLAS VERBINDUNG
// ==========================================
const mongoURI = process.env.MONGO_URI || '';

if (!mongoURI) {
    console.error("FEHLER: Keine MONGO_URI Umgebungsvariable in Render gefunden!");
} else {
    mongoose.connect(mongoURI)
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
    freigegeben: { type: Boolean, default: false }, // Korrigiert: Sauber auf false gesetzt
    datum: { type: Date, default: Date.now }
});

const Eintrag = mongoose.model('Eintrag', gipfelEintragSchema);

// ==========================================
// 5. ROUTES (ENDPUNKTE)
// ==========================================

// GET: Alle freigegebenen Einträge abrufen
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

// POST: Neuen Eintrag speichern
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

// ==========================================
// 6. SERVER STARTEN
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server läuft stabil auf Port ${PORT}`);
});
