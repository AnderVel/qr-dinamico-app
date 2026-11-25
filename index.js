const express = require('express');
const path = require('path');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// Conexión y serialización de la base de datos SQLite
const dbPath = path.resolve(__dirname, 'qrs.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Error al conectar con SQLite:', err.message);
    } else {
        console.log('📦 Conectado a SQLite en:', dbPath);
    }
});

// Asegurar creación de la tabla en orden de ejecución
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS codigos_qr (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE NOT NULL,
        destino TEXT,
        cliente TEXT,
        estado TEXT DEFAULT 'libre'
    )`);
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Función auxiliar para obtener el siguiente código correlativo (re-001, re-002, etc.)
function generarSiguienteCodigo(callback) {
    db.all("SELECT codigo FROM codigos_qr WHERE codigo LIKE 're-%'", [], (err, rows) => {
        if (err) return callback(err, null);

        let maxNum = 0;
        if (rows && rows.length > 0) {
            rows.forEach(row => {
                const match = row.codigo.match(/^re-(\d+)$/i);
                if (match) {
                    const num = parseInt(match[1], 10);
                    if (!isNaN(num) && num > maxNum) {
                        maxNum = num;
                    }
                }
            });
        }
        const nuevoCodigo = `re-${String(maxNum + 1).padStart(3, '0')}`;
        callback(null, nuevoCodigo);
    });
}

// Servir el panel de control
app.get('/panel', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Obtener todos los QRs
app.get('/api/qrs', (req, res) => {
    db.all('SELECT * FROM codigos_qr ORDER BY id ASC', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ data: rows || [] });
    });
});

// Crear nuevo QR con secuencia automática (POST /api/qrs/nuevo)
app.post('/api/qrs/nuevo', (req, res) => {
    generarSiguienteCodigo((err, nuevoCodigo) => {
        if (err) return res.status(500).json({ error: err.message });

        db.run(
            'INSERT INTO codigos_qr (codigo, estado) VALUES (?, ?)',
            [nuevoCodigo, 'libre'],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });
                db.get('SELECT * FROM codigos_qr WHERE id = ?', [this.lastID], (err, newRow) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ message: 'QR creado', data: [newRow] });
                });
            }
        );
    });
});

// Guardar, actualizar o crear un nuevo QR (POST)
app.post('/api/qrs', (req, res) => {
    if (!req.body || typeof req.body !== 'object' || !req.body.codigo) {
        generarSiguienteCodigo((err, nuevoCodigo) => {
            if (err) return res.status(500).json({ error: err.message });

            db.run(
                'INSERT INTO codigos_qr (codigo, estado) VALUES (?, ?)',
                [nuevoCodigo, 'libre'],
                function (err) {
                    if (err) return res.status(500).json({ error: err.message });
                    db.get('SELECT * FROM codigos_qr WHERE id = ?', [this.lastID], (err, newRow) => {
                        if (err) return res.status(500).json({ error: err.message });
                        res.json({ message: 'QR creado', data: [newRow] });
                    });
                }
            );
        });
        return;
    }

    let { codigo, cliente, destino, estado } = req.body;
    if (destino && typeof destino === 'string') {
        destino = destino.replace(/^\[\vert{}\]$/g, '').trim();
    }

    db.run(
        `INSERT INTO codigos_qr (codigo, cliente, destino, estado)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(codigo) DO UPDATE SET
            cliente = excluded.cliente,
            destino = excluded.destino,
            estado = excluded.estado`,
        [codigo, cliente || '', destino || '', estado || 'libre'],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            db.get('SELECT * FROM codigos_qr WHERE codigo = ?', [codigo], (err, row) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Guardado con éxito', data: [row] });
            });
        }
    );
});

// Actualizar un QR por código específico (PUT /api/qrs/:codigo)
app.put('/api/qrs/:codigo', (req, res) => {
    const { codigo } = req.params;
    let { cliente, destino, estado } = req.body;

    if (destino && typeof destino === 'string') {
        destino = destino.replace(/^\[\vert{}\]$/g, '').trim();
    }

    db.run(
        `INSERT INTO codigos_qr (codigo, cliente, destino, estado)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(codigo) DO UPDATE SET
            cliente = excluded.cliente,
            destino = excluded.destino,
            estado = excluded.estado`,
        [codigo, cliente || '', destino || '', estado || 'libre'],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            db.get('SELECT * FROM codigos_qr WHERE codigo = ?', [codigo], (err, row) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Guardado con éxito', data: [row] });
            });
        }
    );
});

// Eliminar un QR por código específico (DELETE /api/qrs/:codigo)
app.delete('/api/qrs/:codigo', (req, res) => {
    const { codigo } = req.params;
    db.run('DELETE FROM codigos_qr WHERE codigo = ?', [codigo], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Código eliminado', data: { codigo, changes: this.changes } });
    });
});

// Motor de redirección dinámica
app.get('/:codigo', (req, res) => {
    const { codigo } = req.params;

    if (codigo === 'favicon.ico') {
        return res.status(404).end();
    }

    db.get('SELECT * FROM codigos_qr WHERE codigo = ?', [codigo], (err, row) => {
        if (err) {
            return res.status(500).send('Error interno del servidor');
        }
        if (!row) {
            return res.status(404).send('Código QR no encontrado');
        }

        const estadoNormalizado = row.estado ? row.estado.toLowerCase() : '';
        if (estadoNormalizado === 'asignado' && row.destino) {
            let urlDestino = row.destino.trim();
            if (!urlDestino.startsWith('http://') && !urlDestino.startsWith('https://')) {
                urlDestino = `https://${urlDestino}`;
            }
            return res.redirect(urlDestino);
        } else {
            return res.send(`<h1>El código ${codigo} no está asignado a ningún destino.</h1>`);
        }
    });
});

app.listen(PORT, () => {
    console.log(`✅ Servidor listo en puerto ${PORT}`);
    console.log(`💻 Panel: http://localhost:${PORT}/panel`);
});