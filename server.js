// ==========================================
// 1. BENÖTIGTE MODULE IMPORTIEREN
// ==========================================
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const crypto = require('crypto');

const app = express();

// Render läuft hinter einem Proxy -> echte Besucher-IP für das Rate-Limit verwenden
app.set('trust proxy', 1);

// ==========================================
// 2. MIDDLEWARE KONFIGURATION
// ==========================================
app.use(express.urlencoded({ extended: true, limit: '20kb' }));
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 3. MONGODB ATLAS VERBINDUNG (ULTRA-STABIL & SICHER)
// ==========================================
const mongoURI = process.env.MONGO_URI;

if (!mongoURI) {
    console.error("[FEHLER] MONGO_URI ist nicht in den Umgebungsvariablen definiert!");
    process.exit(1);
}

mongoose.connect(mongoURI, {
    serverSelectionTimeoutMS: 30000, // 30 Sekunden für die Serverwahl
    socketTimeoutMS: 45000,          // 45 Sekunden Socket-Timeout
    family: 4,                       // Erzwingt IPv4 für stabile Cloud-Verbindungen
    bufferCommands: true,            // Erlaubt das Puffer von Befehlen
    bufferTimeoutMS: 45000           // Erhöht den Puffer-Timeout auf 45s (verhindert Timeout-Fehler)
})
.then(() => console.log("[OK] Erfolgreich mit MongoDB Atlas verbunden!"))
.catch(err => console.error("[FEHLER] Verbindungsfehler zu MongoDB Atlas:", err.message));

// Verbindungsüberwachung zur Fehlererkennung in den Logs
mongoose.connection.on('disconnected', () => {
    console.warn("[WARNUNG] Verbindung zu MongoDB Atlas getrennt. Versuche erneut zu verbinden...");
});

mongoose.connection.on('error', (err) => {
    console.error("[FEHLER] MongoDB-Verbindungsfehler:", err);
});

// ==========================================
// 4. DATENBANK-SCHEMA & MODEL DEFINIEREN
// ==========================================
const MAX_NAME = 80;
const MAX_NACHRICHT = 1000;

const gipfelEintragSchema = new mongoose.Schema({
    name: { type: String, required: true, maxlength: MAX_NAME },
    nachricht: { type: String, default: '', maxlength: MAX_NACHRICHT },
    summitCode: { type: Number },
    freigegeben: { type: Boolean, default: false }, // Standard: Nicht freigegeben (wartet auf Admin)
    datum: { type: Date, default: Date.now }
});

const Eintrag = mongoose.model('Eintrag', gipfelEintragSchema, 'eintraege');

// ==========================================
// 5. HILFSFUNKTION FÜR ADMIN-PASSWORT, CAPTCHA & RATE-LIMIT
// ==========================================
// Kompatibel mit bestehendem Render-Setup: nutzt ADMIN_PASSWORD oder Fallback 'geheim123'
const getAdminPassword = () => process.env.ADMIN_PASSWORD || 'geheim123';

function pruefePasswort(eingabe) {
    if (typeof eingabe !== 'string' || eingabe.length === 0) return false;
    const aktiv = getAdminPassword();
    const a = crypto.createHash('sha256').update(eingabe).digest();
    const b = crypto.createHash('sha256').update(aktiv).digest();
    return crypto.timingSafeEqual(a, b);
}

// Einfaches Rate-Limit im Speicher (ohne Zusatzpakete)
function erstelleLimiter(max, fensterMs) {
    const treffer = new Map();
    setInterval(() => {
        const jetzt = Date.now();
        for (const [key, eintrag] of treffer) if (eintrag.reset < jetzt) treffer.delete(key);
    }, fensterMs).unref();

    return {
        istGesperrt(key) {
            const e = treffer.get(key);
            return !!e && e.reset > Date.now() && e.count >= max;
        },
        zaehlen(key) {
            const jetzt = Date.now();
            let e = treffer.get(key);
            if (!e || e.reset < jetzt) {
                e = { count: 0, reset: jetzt + fensterMs };
                treffer.set(key, e);
            }
            e.count++;
        }
    };
}

const eintragLimiter = erstelleLimiter(12, 15 * 60 * 1000);   // max. 12 Einträge / 15 Min. pro IP
const loginLimiter = erstelleLimiter(12, 15 * 60 * 1000);     // max. 12 Fehlversuche / 15 Min. pro IP

// Server-seitig geprüfte Rechenaufgabe (signiertes Token)
const CAPTCHA_SECRET = process.env.CAPTCHA_SECRET || crypto.randomBytes(32).toString('hex');
const CAPTCHA_GUELTIG_MS = 2 * 60 * 60 * 1000; // 2 Stunden
const benutzteCaptchas = new Map();

setInterval(() => {
    const jetzt = Date.now();
    for (const [nonce, ablauf] of benutzteCaptchas) if (ablauf < jetzt) benutzteCaptchas.delete(nonce);
}, 10 * 60 * 1000).unref();

function signiere(daten) {
    return crypto.createHmac('sha256', CAPTCHA_SECRET).update(daten).digest('base64url');
}

function pruefeCaptchaToken(token, antwort) {
    if (typeof token !== 'string') return false;
    const teile = token.split('.');
    if (teile.length !== 3) return false;

    const [ablaufText, nonce, signatur] = teile;
    const ablauf = Number(ablaufText);
    if (!Number.isFinite(ablauf) || ablauf < Date.now()) return false;

    const antw = parseInt(antwort, 10);
    if (isNaN(antw)) return false;

    const erwartet = Buffer.from(signiere(`${antw}.${ablauf}.${nonce}`));
    const erhalten = Buffer.from(signatur);
    if (erwartet.length !== erhalten.length || !crypto.timingSafeEqual(erwartet, erhalten)) return false;

    if (benutzteCaptchas.has(nonce)) return false;
    benutzteCaptchas.set(nonce, ablauf);
    return true;
}

// Middleware für alle Admin-Routen
function nurAdmin(req, res, next) {
    if (loginLimiter.istGesperrt(req.ip)) {
        return res.status(429).json({ error: "Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen." });
    }
    if (!pruefePasswort(req.body && req.body.password)) {
        loginLimiter.zaehlen(req.ip);
        return res.status(401).json({ error: "Falsches Admin-Passwort!" });
    }
    next();
}

function gueltigeIds(ids) {
    return Array.isArray(ids) && ids.length > 0 && ids.length <= 500 && ids.every(id => mongoose.isValidObjectId(id));
}

// ==========================================
// 6. ÖFFENTLICHE API-ROUTEN
// ==========================================

// Admin-Bereitstellung unter /admin
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Neue Sicherheitsfrage erzeugen (Server-signiert)
app.get('/api/captcha', (req, res) => {
    const a = crypto.randomInt(1, 10);
    const b = crypto.randomInt(1, 10);
    const ablauf = Date.now() + CAPTCHA_GUELTIG_MS;
    const nonce = crypto.randomBytes(9).toString('base64url');

    res.set('Cache-Control', 'no-store');
    res.json({
        frage: `Was ergibt ${a} + ${b}?`,
        token: `${ablauf}.${nonce}.${signiere(`${a + b}.${ablauf}.${nonce}`)}`
    });
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

// Neuen Eintrag speichern (Inkl. robuster Fehlerbehandlung bei Tippfehlern)
app.post('/api/eintraege', async (req, res) => {
    try {
        const { name, nachricht, summitCode, captchaAnswer, captchaExpected, captchaToken, website } = req.body;

        // 0. Honeypot gegen automatische Bots
        if (website) {
            return res.json({ success: true, message: "Eintrag erfolgreich gespeichert." });
        }

        // 0b. Rate-Limit pro IP
        if (eintragLimiter.istGesperrt(req.ip)) {
            return res.status(429).json({ success: false, error: "Zu viele Einträge in kurzer Zeit. Bitte später erneut versuchen." });
        }

        // 1. Name & Nachricht prüfen
        const sauberName = typeof name === 'string' ? name.trim() : '';
        const sauberNachricht = typeof nachricht === 'string' ? nachricht.trim() : '';

        if (sauberName === "") {
            return res.status(400).json({ success: false, feld: 'name', error: "Der Name darf nicht leer sein." });
        }
        if (sauberName.length > MAX_NAME) {
            return res.status(400).json({ success: false, feld: 'name', error: `Der Name darf maximal ${MAX_NAME} Zeichen lang sein.` });
        }
        if (sauberNachricht.length > MAX_NACHRICHT) {
            return res.status(400).json({ success: false, feld: 'nachricht', error: `Die Nachricht darf maximal ${MAX_NACHRICHT} Zeichen lang sein.` });
        }

        // 2. Prüfung 1: Gipfel-Code muss exakt das Jahr 1961 sein
        const KORREKTES_JAHR = 1961;
        const eingetragenesJahr = parseInt(summitCode, 10);

        if (isNaN(eingetragenesJahr) || eingetragenesJahr !== KORREKTES_JAHR) {
            return res.status(400).json({ success: false, feld: 'summitCode', error: "Falscher Gipfel-Code eingetragen." });
        }

        // 3. Prüfung 2: Rechenaufgabe (Server-Token bevorzugt, Fallback auf klassische Prüfung)
        let captchaOk = false;
        if (captchaToken) {
            captchaOk = pruefeCaptchaToken(captchaToken, captchaAnswer);
        } else {
            const antw = parseInt(captchaAnswer, 10);
            const erww = parseInt(captchaExpected, 10);
            captchaOk = !isNaN(antw) && !isNaN(erww) && erww >= 2 && erww <= 18 && antw === erww;
        }

        if (!captchaOk) {
            return res.status(400).json({ success: false, feld: 'captchaInput', error: "Sicherheitsfrage wurde falsch beantwortet." });
        }

        // 4. In MongoDB speichern
        const neuerEintrag = new Eintrag({
            name: sauberName,
            nachricht: sauberNachricht,
            summitCode: eingetragenesJahr,
            freigegeben: false
        });

        await neuerEintrag.save();
        eintragLimiter.zaehlen(req.ip);
        res.json({ success: true, message: "Eintrag erfolgreich gespeichert." });

    } catch (err) {
        console.error("[FEHLER] Fehler beim Speichern:", err.message);
        res.status(500).json({ success: false, error: "Ein unerwarteter Serverfehler ist aufgetreten." });
    }
});

// ==========================================
// 7. ADMIN-MODERATIONS-ROUTEN
// ==========================================

// Alle Einträge (auch ausstehende) für das Dashboard laden
app.post('/api/admin/eintraege', nurAdmin, async (req, res) => {
    try {
        const eintraege = await Eintrag.find({}).sort({ datum: -1 });
        res.json(eintraege);
    } catch (err) {
        console.error("[FEHLER] Fehler beim Laden der Admin-Einträge:", err);
        res.status(500).json({ error: "Serverfehler: " + err.message });
    }
});

// Einzelnen Eintrag freischalten
app.post('/api/admin/freischalten', nurAdmin, async (req, res) => {
    try {
        const { id } = req.body;
        if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Ungültige ID." });

        await Eintrag.findByIdAndUpdate(id, { freigegeben: true });
        res.json({ success: true });
    } catch (err) {
        console.error("Fehler beim Freischalten:", err.message);
        res.status(500).json({ error: "Serverfehler beim Freischalten." });
    }
});

// Mehrere ausgewählte Einträge auf einmal freischalten (Batch)
app.post('/api/admin/freischalten-batch', nurAdmin, async (req, res) => {
    try {
        const { ids } = req.body;
        if (!gueltigeIds(ids)) {
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
app.post('/api/admin/loeschen', nurAdmin, async (req, res) => {
    try {
        const { id } = req.body;
        if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Ungültige ID." });

        await Eintrag.findByIdAndDelete(id);
        res.json({ success: true });
    } catch (err) {
        console.error("Fehler beim Löschen:", err.message);
        res.status(500).json({ error: "Serverfehler beim Löschen." });
    }
});

// Mehrere ausgewählte Einträge auf einmal löschen (Batch)
app.post('/api/admin/loeschen-batch', nurAdmin, async (req, res) => {
    try {
        const { ids } = req.body;
        if (!gueltigeIds(ids)) {
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
    console.log(`[START] Server läuft auf Port ${PORT}`);
});
