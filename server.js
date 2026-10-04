const express = require('express');
const Datastore = require('nedb-promises');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Ein einfaches Admin-Passwort zur Freigabe (hier nach Wunsch anpassen!)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "geheim123";

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = Datastore.create({
    filename: path.join(__dirname, 'gipfelbuch.db'),
    autoload: true
});

// Öffentliche Route: NUR freigegebene Einträge abrufen
app.get('/api/eintraege', async (req, res) => {
    try {
        const eintraege = await db.find({ freigegeben: true }).sort({ datum: -1 });
        res.json(eintraege);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Öffentlich: Neuen Eintrag als "unfeigegeben" (false) anlegen
app.post('/api/eintraege', async (req, res) => {
    const { name, nachricht } = req.body;
    if (!name) return res.status(400).json({ error: 'Name ist erforderlich.' });

    try {
        const neuerEintrag = await db.insert({
            name,
            nachricht,
            datum: new Date().toISOString(),
            freigegeben: false // Muss erst vom Admin freigeschaltet werden!
        });
        res.json({ message: 'Eintrag zur Prüfung eingereicht!', eintrag: neuerEintrag });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ADMIN: Alle unvollständigen/ungeprüften Einträge laden
app.post('/api/admin/eintraege', async (req, res) => {
    const { password } = req.body;
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Falsches Passwort' });
    }
    try {
        const eintraege = await db.find({}).sort({ datum: -1 });
        res.json(eintraege);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ADMIN: Eintrag freischalten
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

// ADMIN: Eintrag löschen
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
