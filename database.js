const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./qrs.db');

db.serialize(() => {
    // Borramos la tabla anterior para empezar limpio (solo para desarrollo)
    db.run(`DROP TABLE IF EXISTS codigos_qr`);
    
    // Creamos la tabla oficial
    db.run(`CREATE TABLE codigos_qr (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE NOT NULL,
        destino TEXT,
        cliente TEXT,
        estado TEXT DEFAULT 'libre'
    )`);

    // Insertamos 5 QRs base
    const insertar = db.prepare(`INSERT INTO codigos_qr (codigo, destino, cliente, estado) VALUES (?, ?, ?, ?)`);
    insertar.run('re-001', 'https://instagram.com/leomessi', 'Leo Messi', 'asignado');
    insertar.run('re-002', '', '', 'libre');
    insertar.run('re-003', '', '', 'libre');
    insertar.run('re-004', '', '', 'libre');
    insertar.run('re-005', '', '', 'libre');
    insertar.finalize();
    
    console.log('Base de datos reiniciada con 5 QRs listos para usar.');
});

db.close();