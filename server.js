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

// Statische Dateien bereitstellen
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 3. MONGODB ATLAS VERBINDUNG
// ==========================================
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
const gipfelEintragSchema = new mongoose.Schema({
    name: { type: String, required: true },
    nachricht: { type: String, required: true },
    freigegeben: { type: Boolean, default: false },
    datum: { type: Date, default: Date.now }
});

const Eintrag = mongoose.model('Eintrag', gipfelEintragSchema);

// ==========================================
// 5. ROUTES (ENDPUNKTE)
// ==========================================

// GET: Alle freigegebenen Einträge abrufen
app.get('/api/eintraege', async (req, res) => {
    try {
        const eintraege = await Eintrag.find({ freigegeben: true }).sort({ datum: -1 });
        res.json(eintraege);
    } catch (err) {
        console.error("Fehler beim Abrufen der Einträge:", err);
        res.status(500).json({ error: "Fehler beim Laden der Einträge." });
    }
});

// POST: Neuen Eintrag speichern (mit detaillierter Fehlerausgabe für den Test)
app.post('/api/eintraege', async (req, res) => {
    try {
        const { name, nachricht } = req.body;

        // Validierung, ob Felder ausgefüllt sind
        if (!name || !nachricht) {
            return res.status(400).json({ success: false, error: "Name und Nachricht dürfen nicht leer sein." });
        }

        const neuerEintrag = new Eintrag({
            name: name,
            nachricht: nachricht,
            freigegeben: false
        });

        // In MongoDB Atlas speichern
        await neuerEintrag.save();
        console.log("Neuer Eintrag erfolgreich in MongoDB gespeichert:", neuerEintrag);

        res.json({ success: true, message: "Eintrag erfolgreich gespeichert." });
    } catch (err) {
        // Hier geben wir den echten Fehlertext an das Frontend zurück, um die Ursache sofort zu sehen!
        console.error("Detaillierter Fehler beim Speichern:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// 6. SERVER STARTEN
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server läuft auf Port ${PORT}`);
});
