const express = require('express');
const Datastore = require('nedb-promises');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "geheim123";

// WICHTIG: Erlaubt das Einlesen von JSON und normalen Formulardaten
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Datenbankdatei im Projektverzeichnis
const db = Datastore.create({
    filename: path.join(__dirname, 'gipfelbuch.db'),
    autoload: true
});

// 1. Öffentliche Route: Freigegebene Einträge abrufen
app.get('/api/eintraege', async (req, res) => {
    try {
        const eintraege = await db.find({ freigegeben: true }).sort({ datum: -1 });
        res.json(eintraege);
    } catch (err) {
        console.error("Fehler beim Laden:", err);
        res.status(500).json({ error: "Fehler beim Laden der Einträge." });
    }
});

// 2. Öffentliche Route: Neuen Eintrag speichern
app.post('/api/eintraege', async (req, res) => {
    try {
        const { name, nachricht, captchaAnswer, captchaExpected } = req.body;

        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Bitte gib einen Namen ein.' });
        }

        // Werte explizit in Zahlen umwandeln
        const eingabe = parseInt(captchaAnswer, 10);
        const sollWert = parseInt(captchaExpected, 10);

        if (isNaN(eingabe) || eingabe !== sollWert) {
            return res.status(400).json({ error: 'Sicherheitsfrage nicht korrekt gelöst.' });
        }

        const neuerEintrag = await db.insert({
            name: name.trim(),
            nachricht: nachricht ? nachricht.trim() : '',
            datum: new Date().toISOString(),
            freigegeben: false // Muss vom WSV freigeschaltet werden
        });

        res.json({ success: true, message: 'Eintrag erfolgreich eingereicht!' });

    } catch (err) {
        console.error("Datenbankfehler:", err);
        res.status(500).json({ error: 'Serverfehler: ' + err.message });
    }
});

// 3. ADMIN-Routen
app.post('/api/admin/eintraege', async (req, res) => {
    const { password } = req.body;
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Falsches Passwort' });
    try {
        const eintraege = await db.find({}).sort({ datum: -1 });
        res.json(eintraege);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/freischalten', async (req, res) => {
    const { password, id } = req.body;
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Falsches Passwort' });
    try {
        await db.update({ _id: id }, { $set: { freigegeben: true } });
        res.json({ message: 'Eintrag freigeschaltet' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/loeschen', async (req, res) => {
    const { password, id } = req.body;
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Falsches Passwort' });
    try {
        await db.remove({ _id: id }, {});
        res.json({ message: 'Eintrag gelöscht' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Gipfelbuch-Server läuft auf Port ${PORT}`);
});
