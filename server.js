Sehr gerne! Hier ist die vollständige, optimierte server.js-Datei für dein Gipfelbuch-Projekt. Sie enthält den neuen, besonders stabilen Verbindungsblock (mit erhöhtem Timeout von 30 Sekunden gegen den Admin-Timeout-Fehler), die sichere Einbindung über die Umgebungsvariable sowie sämtliche Routen und Batch-Funktionen:

JavaScript
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
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 3. MONGODB ATLAS VERBINDUNG (ULTRA-STABIL & SICHER)
// ==========================================
const mongoURI = process.env.MONGO_URI;

if (!mongoURI) {
    console.error("🔴 Fehler: MONGO_URI ist nicht in den Umgebungsvariablen definiert!");
    process.exit(1);
}

mongoose.connect(mongoURI, {
    serverSelectionTimeoutMS: 30000, // 30 Sekunden Timeout (schützt vor Cold-Start-Timeouts auf Render)
    socketTimeoutMS: 45000,
    family: 4,                      // Erzwingt IPv4 für stabile Cloud-Verbindungen
    bufferCommands: true            // Puffert Befehle, falls die Verbindung beim Aufwachen kurz braucht
})
.then(() => console.log("🟢 Erfolgreich mit MongoDB Atlas verbunden!"))
.catch(err => console.error("🔴 Verbindungsfehler zu MongoDB Atlas:", err.message));

// Verbindungsüberwachung zur Fehlererkennung in den Logs
mongoose.connection.on('disconnected', () => {
    console.warn("⚠️ Verbindung zu MongoDB Atlas getrennt. Versuche erneut zu verbinden...");
});

mongoose.connection.on('error', (err) => {
    console.error("🔴 MongoDB-Verbindungsfehler:", err);
});

// ==========================================
// 4. DATENBANK-SCHEMA & MODEL DEFINIEREN
// ==========================================
const gipfelEintragSchema = new mongoose.Schema({
    name: { type: String, required: true },
    nachricht: { type: String, default: '' },
    summitCode: { type: Number },
    freigegeben: { type: Boolean, default: false }, // Standard: Nicht freigegeben (wartet auf Admin)
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

// Admin-Bereitstellung unter /admin
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Nur freigegebene Einträge für die öffentliche Ansicht abrufen
app.get('/api/eintraege', async (req, res) => {
    try {
        const eintraege = await Eintrag.find({ freigegeben: true }).sort({ datum: -1 });
        res.json(eintraege);
    } catch (err) {
        console.error("Fehler beim Abrufen der öffentlichen Einträge:", err.message);
        res.status(500).json({ error: "Fehler beim Laden der Einträge." });
    }
});

// Neuen Eintrag speichern (Inkl. doppelter Sicherheitsprüfung: 1961 + Rechenaufgabe)
app.post('/api/eintraege', async (req, res) => {
    try {
        const { name, nachricht, summitCode, captchaAnswer, captchaExpected } = req.body;

        // 1. Name prüfen
        if (!name || String(name).trim() === "") {
            return res.status(400).json({ success: false, error: "Der Name darf nicht leer sein." });
        }

        // 2. Prüfung 1: Gipfel-Code muss exakt das Jahr 1961 sein
        const KORREKTES_JAHR = 1961;
        const eingetragenesJahr = parseInt(summitCode, 10);

        if (isNaN(eingetragenesJahr) || eingetragenesJahr !== KORREKTES_JAHR) {
            return res.status(400).json({ success: false, error: "Bitte die korrekte Antwort eintragen." });
        }

        // 3. Prüfung 2: Dynamische Rechenaufgabe im Formular
        const antw = parseInt(captchaAnswer, 10);
        const erww = parseInt(captchaExpected, 10);

        if (isNaN(antw) || isNaN(erww) || antw !== erww) {
            return res.status(400).json({ success: false, error: "Bitte die korrekte Antwort eintragen." });
        }

        // 4. In MongoDB speichern
        const neuerEintrag = new Eintrag({
            name: String(name).trim(),
            nachricht: nachricht ? String(nachricht).trim() : '',
            summitCode: eingetragenesJahr,
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
// 7. ADMIN-MODERATIONS-ROUTEN (Inkl. Batch-Funktionen)
// ==========================================

// Alle Einträge (auch ausstehende) für das Dashboard laden
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

// Einzelnen Eintrag freischalten
app.post('/api/admin/freischalten', async (req, res) => {
    try {
        const { password, id } = req.body;
        if (password !== getAdminPassword()) return res.status(401).json({ error: "Falsches Passwort." });

        await Eintrag.findByIdAndUpdate(id, { freigegeben: true });
        res.json({ success: true });
    } catch (err) {
        console.error("Fehler beim Freischalten:", err.message);
        res.status(500).json({ error: "Serverfehler beim Freischalten." });
    }
});

// Mehrere ausgewählte Einträge auf einmal freischalten (Batch)
app.post('/api/admin/freischalten-batch', async (req, res) => {
    try {
        const { password, ids } = req.body;
        if (password !== getAdminPassword()) return res.status(401).json({ error: "Falsches Passwort." });

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: "Keine Einträge ausgewählt." });
        }

        await Eintrag.updateMany({ _id: { $in: ids } }, { freigegeben: true });
        res.json({ success: true, count: ids.length });
    } catch (err) {
        console.error("Fehler beim Batch-Freischalten:", err.message);
        res.status(500).json({ error: "Serverfehler beim Mehrfach-Freischalten." });
    }
});

// Einzelnen Eintrag löschen
app.post('/api/admin/loeschen', async (req, res) => {
    try {
        const { password, id } = req.body;
        if (password !== getAdminPassword()) return res.status(401).json({ error: "Falsches Passwort." });

        await Eintrag.findByIdAndDelete(id);
        res.json({ success: true });
    } catch (err) {
        console.error("Fehler beim Löschen:", err.message);
        res.status(500).json({ error: "Serverfehler beim Löschen." });
    }
});

// Mehrere ausgewählte Einträge auf einmal löschen (Batch)
app.post('/api/admin/loeschen-batch', async (req, res) => {
    try {
        const { password, ids } = req.body;
        if (password !== getAdminPassword()) return res.status(401).json({ error: "Falsches Passwort." });

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: "Keine Einträge ausgewählt." });
        }

        await Eintrag.deleteMany({ _id: { $in: ids } });
        res.json({ success: true, count: ids.length });
    } catch (err) {
        console.error("Fehler beim Batch-Löschen:", err.message);
        res.status(500).json({ error: "Serverfehler beim Mehrfach-Löschen." });
    }
});

// ==========================================
// 8. SERVER STARTEN
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server läuft auf Port ${PORT}`);
});
