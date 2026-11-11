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
    freigegeben: { type: Boolean, default: true },
    moderationsGrund: { type: String, default: '' }, // Leer = automatisch freigegeben; sonst Grund für Admin-Prüfung
    datum: { type: Date, default: Date.now }
});

const Eintrag = mongoose.model('Eintrag', gipfelEintragSchema, 'eintraege');

// ==========================================
// 5. AUTOMATISCHE TEXTPRÜFUNG (MODERATION)
// ==========================================
// Normalisiert Text (entfernt Tricks mit Sonderzeichen, Leetspeak wie 0/1/3/4/@, Mehrfachbuchstaben)
function normalisiereText(str) {
    return String(str || '')
        .toLowerCase()
        .replace(/ä/g, 'ae')
        .replace(/ö/g, 'oe')
        .replace(/ü/g, 'ue')
        .replace(/ß/g, 'ss')
        .replace(/@/g, 'a')
        .replace(/0/g, 'o')
        .replace(/1/g, 'i')
        .replace(/3/g, 'e')
        .replace(/4/g, 'a')
        .replace(/5/g, 's')
        .replace(/7/g, 't')
        .replace(/8/g, 'b')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

// 1) Rechtsradikale, nationalsozialistische, rassistische & extremistische Inhalte
const MUSTER_RECHTSRADIKAL = [
    /\bhitler\b/i,
    /\badolf\s*h\b/i,
    /\bsieg\s*heil\b/i,
    /\bheil\s*(hitler|dir|uns|deutschland|oesterreich)\b/i,
    /\bhakenkreuz\b/i,
    /\bswastika\b/i,
    /\bwaffen[\s-]*ss\b/i,
    /\bschutzstaffel\b/i,
    /\bnsdap\b/i,
    /\bdrittes\s*reich\b/i,
    /\b3\.\s*reich\b/i,
    /\bfuehrer\b/i,
    /\breichskristall/i,
    /\bholocaust/i,
    /\bauschwitz\b/i,
    /\bmauthausen\b/i,
    /\bkonzentrationslager\b/i,
    /\bgaskammer/i,
    /\bvergasen\b/i,
    /\bvergast\b/i,
    /\barisch/i,
    /\bherrenrasse\b/i,
    /\buntermensch/i,
    /\bvolkstod\b/i,
    /\bumvolkung\b/i,
    /\brassen?(schande|krieg|rein|hygiene)\b/i,
    /\bblut\s*und\s*ehre\b/i,
    /\bblood\s*and\s*honour\b/i,
    /\bwhite\s*power\b/i,
    /\bwhite\s*pride\b/i,
    /\bwpww\b/i,
    /\bku[\s-]*klux/i,
    /\bneonazi/i,
    /\bscheiss?\s*nazi/i,
    /\bnazi(s|schwein|sau|pack)?\b/i,
    /\bfascho/i,
    /\bfaschist/i,
    /\bauslaender\s*raus\b/i,
    /\bdeutschland\s*den\s*deutschen\b/i,
    /\boesterreich\s*den\s*oesterreichern\b/i,
    /\bkana(k|ck)e/i,
    /\bnigger\b/i,
    /\bnigga\b/i,
    /\bneger\b/i,
    /\bimam|islamist|kalifat\b/i,
    /\bjuden(sau|pack|schwein)\b/i,
    /\bscheiss\s*(juden|auslaender|moslems|muslime|fluechtlinge|asylanten|tuerken|schwarze)\b/i,
    /\bdrecks\s*(juden|auslaender|moslems|muslime|fluechtlinge|asylanten|tuerken|schwarze)\b/i,
    // Typische rechtsextreme Zahlencodes / Szenecodes (als alleinstehende Codes)
    /(?:^|[^\d])(?:1488|8814|18\s*88|14\/88)(?:$|[^\d])/i,
    /\b(?:h\s*h\s*88|88\s*h\s*h|combat\s*18|c18)\b/i,
    /[卐卍]/
];

// 2) Beleidigungen, Fäkalsprache, Obszönitäten, Hassrede & Gewaltandrohungen (inkl. Tiroler/Österreichischer Kraftausdrücke)
const MUSTER_BELEIDIGEND = [
    /\barsch(loch|geige|kriecher|gesicht|ficker|lecker)?\b/i,
    /\boasch(loch|gsicht|warzn|kriecher)?\b/i,
    /\bhuren?(sohn|tochter|kind|bock)\b/i,
    /\bschlampe/i,
    /\bmissgeburt/i,
    /\bmiststueck/i,
    /\bvollidiot/i,
    /\bidiot(en)?\b/i,
    /\bvollpfosten\b/i,
    /\bvollkoffer\b/i,
    /\bvoll(trottel|depp|honk|spast)\b/i,
    /\btrottel/i,
    /\bspast(i|iker)?\b/i,
    /\bmongo\b/i,
    /\bbehindert(er|e|es)?\s*(sau|hund|typ|mensch|pack|verein)?\b/i,
    /\bwichs(er|en|birne)\b/i,
    /\bwix+(er|en)\b/i,
    /\bfick(en|t|er|dich|euch|schnitte|fehler)?\b/i,
    /\bfuck(er|ing|you|off)?\b/i,
    /\bmotherfucker/i,
    /\bbitch(es)?\b/i,
    /\bcunt\b/i,
    /\bfotze/i,
    /\bfut(lapperl)?\b/i,
    /\bschwanzlutscher/i,
    /\bschwuchtel/i,
    /\bdreck(sau|schwein|sack|spatz|pack|stück|stueck)\b/i,
    /\bsau(trottel|depp|prolet|magen|hund|mensch|bande)\b/i,
    /\bscheiss(e|dreck|kerl|verein|haufen|haus|kopf|leben|wetter)?\b/i,
    /\bschass\b/i,
    /\bpiss(er|nelke|kopf|en)\b/i,
    /\bkack(e|bratze|haufen|verein)\b/i,
    /\bverpiss(\s*dich|\s*euch)?\b/i,
    /\bhalt(\s*die|\s*deine)?\s*(fresse|schnauze|goschn|pappn)\b/i,
    /\bgoschn\s*halten\b/i,
    /\b(bring|schech|stech|schiess|schlag).*?(dich|euch|ihn|sie|alle)\s*(um|tot|ab|zamm)\b/i,
    /\bverreck(e|t|en)?\b/i,
    /\bkrepier(e|t|en)?\b/i,
    /\bhuansohn\b/i,
    /\bhurnsohn\b/i,
    /\bopfer\b/i,
    /\blutscher\b/i,
    /\bpenis|vagina|muschi|titten|porno|sex\b/i
];

// 3) Spam / Unerwünschte Links / Manipulation
const MUSTER_SPAM = [
    /https?:\/\//i,
    /\bwww\.[a-z0-9-]+\.[a-z]{2,}/i,
    /\b(casino|bitcoin|crypto|viagra|telegram|whatsapp|forex|loan)\b/i,
    /<script|<iframe|javascript:|onerror=|onload=/i
];

function pruefeInhaltAutomatisch(name, nachricht) {
    const originalGesamt = `${name} ${nachricht}`;
    const normGesamt = normalisiereText(originalGesamt);
    // Auch ohne Leerzeichen/Punkte prüfen (erkennt z. B. "h.i.t.l.e.r" oder "f i c k")
    const kompakt = normGesamt.replace(/[^a-z0-9]+/g, '');

    for (const regex of MUSTER_RECHTSRADIKAL) {
        if (regex.test(originalGesamt) || regex.test(normGesamt)) {
            return {
                unbedenklich: false,
                grund: 'Verdacht auf rechtsradikalen oder extremistischen Inhalt'
            };
        }
    }

    // Kompakttest für eindeutige rechtsextreme Kernbegriffe bei Buchstaben-Trennung (z. B. H-I-T-L-E-R)
    if (/(siegheil|heilhitler|hakenkreuz|auschwitz|untermensch|whitepower|auslaenderraus)/.test(kompakt)) {
        return {
            unbedenklich: false,
            grund: 'Verdacht auf rechtsradikalen oder extremistischen Inhalt'
        };
    }

    // Alleinstehende Szene-Codes "88" oder "18" im Namen oder als einziger Nachrichteninhalt
    if (/^\s*(88|18|1488|444)\s*$/.test(name) || /^\s*(88|18|1488|hh|ss|ns)\s*$/i.test(nachricht)) {
        return {
            unbedenklich: false,
            grund: 'Verdacht auf extremistischen Zahlencode / Kurzcode'
        };
    }

    for (const regex of MUSTER_BELEIDIGEND) {
        if (regex.test(originalGesamt) || regex.test(normGesamt)) {
            return {
                unbedenklich: false,
                grund: 'Verdacht auf Beleidigung oder unangemessene Ausdrucksweise'
            };
        }
    }

    if (/(hurensohn|huansohn|arschloch|oaschloch|missgeburt|wichser|fotze|fickdich)/.test(kompakt)) {
        return {
            unbedenklich: false,
            grund: 'Verdacht auf Beleidigung oder unangemessene Ausdrucksweise'
        };
    }

    for (const regex of MUSTER_SPAM) {
        if (regex.test(originalGesamt) || regex.test(normGesamt)) {
            return {
                unbedenklich: false,
                grund: 'Verdacht auf Werbung, Link oder unerwünschten Code'
            };
        }
    }

    // Unnatürliche Zeichenwiederholungen (z. B. "aaaaaaaaaaaaaaa")
    if (/(.)\1{9,}/i.test(originalGesamt)) {
        return {
            unbedenklich: false,
            grund: 'Auffällige Zeichenwiederholung (Spam-Verdacht)'
        };
    }

    return {
        unbedenklich: true,
        grund: ''
    };
}

// ==========================================
// 6. HILFSFUNKTION FÜR ADMIN-PASSWORT, CAPTCHA & RATE-LIMIT
// ==========================================
const getAdminPassword = () => process.env.ADMIN_PASSWORD || 'geheim123';

function pruefePasswort(eingabe) {
    if (typeof eingabe !== 'string' || eingabe.length === 0) return false;
    const aktiv = getAdminPassword();
    const a = crypto.createHash('sha256').update(eingabe).digest();
    const b = crypto.createHash('sha256').update(aktiv).digest();
    return crypto.timingSafeEqual(a, b);
}

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
// 7. ÖFFENTLICHE API-ROUTEN
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

// Neuen Eintrag speichern (mit automatischer Inhaltsprüfung)
app.post('/api/eintraege', async (req, res) => {
    try {
        const { name, nachricht, summitCode, captchaAnswer, captchaExpected, captchaToken, website } = req.body;

        // 0. Honeypot gegen automatische Bots
        if (website) {
            return res.json({ success: true, direktFreigegeben: true, message: "Eintrag erfolgreich gespeichert." });
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

        // 3. Prüfung 2: Rechenaufgabe
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

        // 4. Automatische Inhaltsprüfung:
        // Unbedenkliche Texte werden sofort veröffentlicht (freigegeben = true).
        // Rechtsradikale, beleidigende oder verdächtige Texte werden zurückgehalten (freigegeben = false)
        // und müssen in der Admin-Konsole bestätigt werden.
        const pruefung = pruefeInhaltAutomatisch(sauberName, sauberNachricht);

        const neuerEintrag = new Eintrag({
            name: sauberName,
            nachricht: sauberNachricht,
            summitCode: eingetragenesJahr,
            freigegeben: pruefung.unbedenklich,
            moderationsGrund: pruefung.grund
        });

        await neuerEintrag.save();
        eintragLimiter.zaehlen(req.ip);

        if (pruefung.unbedenklich) {
            res.json({
                success: true,
                direktFreigegeben: true,
                message: "Vielen Dank! Dein Eintrag wurde direkt im Gipfelbuch veröffentlicht."
            });
        } else {
            console.warn(`[MODERATION] Eintrag zurückgehalten (${pruefung.grund}): Name="${sauberName}"`);
            res.json({
                success: true,
                direktFreigegeben: false,
                message: "Dein Eintrag wurde gespeichert und zur Prüfung an die Moderation weitergeleitet. Sobald er bestätigt wurde, erscheint er im Gipfelbuch."
            });
        }

    } catch (err) {
        console.error("[FEHLER] Fehler beim Speichern:", err.message);
        res.status(500).json({ success: false, error: "Ein unerwarteter Serverfehler ist aufgetreten." });
    }
});

// ==========================================
// 8. ADMIN-MODERATIONS-ROUTEN
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
// 9. SERVER STARTEN
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[START] Server läuft auf Port ${PORT}`);
});
