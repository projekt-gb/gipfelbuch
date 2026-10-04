const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Formulardaten verarbeiten
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Dateien aus dem Ordner "public" für den Browser bereitstellen
app.use(express.static(path.join(__dirname, 'public')));

// Datenbankdatei "gipfelbuch.db" öffnen oder neu anlegen
const db = new sqlite3.Database('./gipfelbuch.db', (err) => {
    if (err) {
        console.error('Fehler bei Datenbankverbindung:', err.message);
    } else {
        console.log('Mit SQLite-Datenbank verbunden.');
        // Tabelle für Einträge anlegen
        db.run(`CREATE TABLE IF NOT EXISTS eintraege (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            berg TEXT NOT NULL,
            nachricht TEXT,
            datum DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }
});

// Route 1: Einträge für einen spezifischen Berg auslesen
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

// Route 2: Neuen Eintrag abspeichern
app.post('/api/eintraege', (req, res) => {
    const { name, berg, nachricht } = req.body;

    if (!name || !berg) {
        return res.status(400).json({ error: 'Name und Berg sind Pflichtfelder.' });
    }

    const sql = 'INSERT INTO eintraege (name, berg, nachricht) VALUES (?, ?, ?)';
    db.run(sql, [name, berg, nachricht], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: 'Eintrag gespeichert!', id: this.lastID });
    });
});

// Server starten
app.listen(PORT, () => {
    console.log(`Server laeuft auf Port ${PORT}`);
});