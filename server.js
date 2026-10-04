const express = require('express');
const Datastore = require('nedb-promises');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Express Middleware für Formular- und JSON-Daten
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Statisches Frontend aus dem Ordner "public" ausliefern
app.use(express.static(path.join(__dirname, 'public')));

// NeDB-Datenbankdatei initialisieren (speichert automatisch in gipfelbuch.db)
const db = Datastore.create({
    filename: path.join(__dirname, 'gipfelbuch.db'),
    autoload: true
});

// Route 1: Alle Einträge abrufen (neueste zuerst)
app.get('/api/eintraege', async (req, res) => {
    try {
        const eintraege = await db.find({}).sort({ datum: -1 });
        res.json(eintraege);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Route 2: Neuen Eintrag erstellen
app.post('/api/eintraege', async (req, res) => {
    const { name, nachricht } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Name ist erforderlich.' });
    }

    try {
        const neuerEintrag = await db.insert({
            name,
            nachricht,
            datum: new Date().toISOString()
        });
        res.json({ message: 'Eintrag erfolgreich gespeichert!', eintrag: neuerEintrag });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fallback für das Frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Server starten
app.listen(PORT, () => {
    console.log(`Gipfelbuch-Server laeuft erfolgreich auf Port ${PORT}`);
});
