const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// SQLite-Datenbank initialisieren
const dbPath = path.join(__dirname, 'gipfelbuch.db');
const db = new Database(dbPath);

// Tabelle erstellen (falls noch nicht vorhanden)
db.exec(`CREATE TABLE IF NOT EXISTS eintraege (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    nachricht TEXT,
    datum DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Route 1: Alle Einträge abrufen
app.get('/api/eintraege', (req, res) => {
    try {
        const stmt = db.prepare('SELECT * FROM eintraege ORDER BY datum DESC');
        const rows = stmt.all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Route 2: Neuen Eintrag erstellen
app.post('/api/eintraege', (req, res) => {
    const { name, nachricht } = req.body;
    if (!name) return res.status(400).json({ error: 'Name ist erforderlich.' });

    try {
        const stmt = db.prepare('INSERT INTO eintraege (name, nachricht) VALUES (?, ?)');
        const info = stmt.run(name, nachricht);
        res.json({ message: 'Gespeichert', id: info.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Hauptseite ausliefern
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Gipfelbuch-Server laeuft erfolgreich auf Port ${PORT}`);
});
