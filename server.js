JavaScript
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
// Render stellt automatisch die PORT-Variable bereit
const PORT = process.env.PORT || 3000;

// Middleware für JSON- und Formular-Daten
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Statische Dateien aus dem Ordner "public" bereitstellen
app.use(express.static(path.join(__dirname, 'public')));

// Datenbankdatei initialisieren
const dbPath = path.join(__dirname, 'gipfelbuch.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Fehler beim Öffnen der Datenbank:', err.message);
    } else {
        console.log('Mit SQLite-Datenbank verbunden.');
        db.run(`CREATE TABLE IF NOT EXISTS eintraege (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            berg TEXT NOT NULL,
            nachricht TEXT,
            datum DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }
});

// Route 1: Einträge abrufen
app.get('/api/eintraege', (req, res) => {
    const berg = req.query.berg;
    let sql = 'SELECT * FROM eintraege ORDER BY datum DESC';
    let params = [];

    if (berg) {
        sql = 'SELECT * FROM eintraege WHERE berg = ? ORDER BY datum DESC';
        params = [berg];
    }

    db.all(sql, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Route 2: Neuen Eintrag erstellen
app.post('/api/eintraege', (req, res) => {
    const { name, berg, nachricht } = req.body;

    if (!name || !berg) {
        return res.status(400).json({ error: 'Name und Bergname sind erforderlich.' });
    }

    const sql = 'INSERT INTO eintraege (name, berg, nachricht) VALUES (?, ?, ?)';
    db.run(sql, [name, berg, nachricht], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: 'Eintrag erfolgreich gespeichert!', id: this.lastID });
    });
});

// Hauptseite ausliefern
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Server starten
app.listen(PORT, () => {
    console.log(`Gipfelbuch-Server laeuft auf Port ${PORT}`);
});