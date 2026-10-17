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
// Parsing von URL-encoded Formulardaten und JSON-Objekten
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Statische Dateien (HTML, CSS, Frontend-JS) aus dem Ordner 'public' bereitstellen
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 3. MONGODB ATLAS VERBINDUNG
// ==========================================
const mongoURI = process.env.MONGO_URI || '';

if (!mongoURI) {
    console.error("🔴 FEHLER: Keine MONGO_URI Umgebungsvariable in Render gefunden!");
} else {
    mongoose.connect(mongoURI, {
        serverSelectionTimeoutMS: 10000 // Maximale Wartezeit für den Verbindungsaufbau: 10 Sekunden
    })
    .then(() => console.log("🟢 Erfolgreich mit MongoDB Atlas verbunden!"))
    .catch(err => console.error("🔴 Verbindungsfehler zu MongoDB Atlas:", err.message));
}

// ==========================================
// 4. DATENBANK-SCHEMA & MODEL DEFINIEREN
// ==========================================
// Schema definiert die Struktur eines Gipfelbuch-Eintrags
const gipfelEintragSchema = new mongoose.Schema({
    name: { type: String, required: true },
    nachricht: { type: String, default: '' },
    summitCode: { type: Number },
    captchaAnswer: { type: Number },
    freigegeben: { type: Boolean, default: false }, // Neue Einträge müssen erst vom Admin freigeschaltet werden
    datum: { type: Date, default: Date.now }
});

// Verknüpfung des Schemas mit der MongoDB Collection 'eintraege'
const Eintrag = mongoose.model('Eintrag', gipfelEintragSchema, 'eintraege');

// ==========================================
// 5. HILFSFUNKTION FÜR DAS ADMIN-PASSWORT
// ==========================================
// Nutzt die Render-Umgebungsvariable ADMIN_PASSWORD oder standardmäßig 'geheim123'
const getAdminPassword = () => process.env.ADMIN_PASSWORD || 'geheim123';

// ==========================================
// 6. ÖFFENTLICHE API-ROUTEN
// ==========================================

// HTML-Route für die Admin-Oberfläche
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// GET: Lädt alle freigegebenen Einträge für die öffentliche Webseite
app.get('/api/eintraege', async (req, res) => {
    try {
        const eintraege = await Eintrag.find({ freigegeben: true }).sort({ datum: -1 });
        res.json(eintraege);
    } catch (err) {
        console.error("Fehler beim Abrufen der öffentlichen Einträge:", err.message);
        res.status(500).json({ error: "Fehler beim Laden der Einträge." });
    }
});

// POST: Speichert einen neuen Eintrag im Gipfelbuch (wartet auf Freigabe)
app.post('/api/eintraege', async (req, res) => {
    try {
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
        res.json({ success: true, message: "Eintrag erfolgreich gespeichert. Er wird nach Prüfung freigeschaltet." });
    } catch (err) {
        console.error("🔴 Fehler beim Speichern des Eintrags:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// 7. ADMIN-MODERATIONS-ROUTEN
// ==========================================

// POST: Lädt alle Einträge (sowohl freigegebene als auch ausstehende) für das Admin-Dashboard
app.post('/api/admin/eintraege', async (req, res) => {
    try {
        const { password } = req.body;
        
        if (password !== getAdminPassword()) {
            return res.status(401).json({ error: "Falsches Passwort." });
        }

        const eintraege = await Eintrag.find({}).sort({ datum: -1 });
        res.json(eintraege);
    } catch (err) {
        console.error("Fehler beim Laden der Admin-Einträge:", err.message);
        res.status(500).json({ error: "Serverfehler: " + err.message });
    }
});

// POST: Schaltet einen Eintrag anhand seiner ID frei
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

// POST: Löscht einen Eintrag anhand seiner ID
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
// 8. SERVER STARTEN
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server läuft auf Port ${PORT}`);
});
