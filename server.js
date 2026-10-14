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
// Verarbeitet Formulardaten (POST-Requests)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Stellt statische Dateien (z. B. HTML, CSS, Bilder) aus dem 'public'-Ordner bereit
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 3. MONGODB ATLAS VERBINDUNG
// ==========================================
// Holt den Connection String aus den Render-Umgebungsvariablen (MONGO_URI)
const mongoURI = process.env.MONGO_URI;

if (!mongoURI) {
    console.error("FEHLER: Keine MONGO_URI Umgebungsvariable gefunden!");
} else {
    mongoose.connect(mongoURI)
        .then(() => console.log("🟢 Erfolgreich mit MongoDB Atlas verbunden!"))
        .catch(err => console.error("🔴 Fehler bei der Verbindung zu MongoDB Atlas:", err));
}

// ==========================================
// 4. DATENBANK-SCHEMA & MODEL DEFINIEREN
// ==========================================
// Hier legen wir fest, welche Felder ein Gipfelbucheintrag hat
const gipfelEintragSchema = new mongoose.Schema({
    name: { type: String, required: true },
    gipfel: { type: String, required: true },
    nachricht: { type: String, required: true },
    freigegeben: { type: Boolean, default: false }, // Neue Einträge müssen erst freigegeben werden
    datum: { type: Date, default: Date.now }
});

// Erstellt das Model 'Eintrag' basierend auf dem Schema
const Eintrag = mongoose.model('Eintrag', gipfelEintragSchema);

// ==========================================
// 5. ROUTES (ENDPUNKTE)
// ==========================================

// GET: Alle FREIGEGEBENEN Einträge für das Gipfelbuch abrufen
app.get('/api/eintraege', async (req, res) => {
    try {
        // Findet alle Einträge, bei denen 'freigegeben' auf true steht
        const eintraege = await Eintrag.find({ freigegeben: true }).sort({ datum: -1 });
        res.json(eintraege);
    } catch (err) {
        console.error("Fehler beim Abrufen der Einträge:", err);
        res.status(500).json({ error: "Fehler beim Laden der Einträge." });
    }
});

// POST: Einen NEUEN Gipfelbucheintrag erstellen
app.post('/api/eintrag', async (req, res) => {
    try {
        const { name, gipfel, nachricht } = req.body;

        const neuerEintrag = new Eintrag({
            name,
            gipfel,
            nachricht,
            freigegeben: false // Auf false setzen, damit er moderiert werden kann
        });

        // In MongoDB Atlas speichern
        await neuerEintrag.save();
        console.log("Neuer Eintrag gespeichert (wartet auf Freigabe):", neuerEintrag);

        res.status(201).json({ message: "Eintrag erfolgreich gespeichert und wartet auf Freigabe." });
    } catch (err) {
        console.error("Fehler beim Speichern des Eintrags:", err);
        res.status(500).json({ error: "Fehler beim Speichern des Eintrags." });
    }
});

// POST: Einen Eintrag FREIGEBEN (für Admin/Moderation)
app.post('/api/freigeben/:id', async (req, res) => {
    try {
        const eintragId = req.params.id;
        await Eintrag.findByIdAndUpdate(eintragId, { freigegeben: true });
        console.log(`Eintrag ${eintragId} wurde freigegeben.`);
        res.json({ message: "Eintrag erfolgreich freigegeben." });
    } catch (err) {
        console.error("Fehler bei der Freigabe:", err);
        res.status(500).json({ error: "Fehler bei der Freigabe." });
    }
});

// GET: Alle UNFREIGEGEBENEN Einträge abrufen (für deine Admin-Ansicht)
app.get('/api/admin/offene-eintraege', async (req, res) => {
    try {
        const offeneEintraege = await Eintrag.find({ freigegeben: false }).sort({ datum: -1 });
        res.json(offeneEintraege);
    } catch (err) {
        res.status(500).json({ error: "Fehler beim Laden der offenen Einträge." });
    }
});

// ==========================================
// 6. SERVER STARTEN
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server läuft auf Port ${PORT}`);
});
