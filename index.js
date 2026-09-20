const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de Supabase
const SUPABASE_URL = 'https://udbbggckhkuancxcyiow.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-FAg794xWcsH8FfymgNDqg_AVIpS9CA';

// Instancia de Supabase configurada con WebSockets para Node.js v20
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    },
    realtime: {
        transport: WebSocket
    }
});

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Servir el panel de control
app.get('/panel', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Obtener todos los QRs
app.get('/api/qrs', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('codigos_qr')
            .select('*')
            .order('id', { ascending: true });

        if (error) throw error;
        res.json({ data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Guardar, actualizar o crear un nuevo QR (POST)
app.post('/api/qrs', async (req, res) => {
    try {
        if (!req.body || typeof req.body !== 'object' || !req.body.codigo) {
            const { data, error } = await supabase
                .from('codigos_qr')
                .select('codigo');

            if (error) throw error;

            const total = (data ? data.length : 0) + 1;
            const nuevoCodigo = `re-${String(total).padStart(3, '0')}`;

            const { data: insertData, error: insertError } = await supabase
                .from('codigos_qr')
                .insert([{ codigo: nuevoCodigo, estado: 'libre' }])
                .select();

            if (insertError) throw insertError;
            return res.json({ message: 'QR creado', data: insertData });
        }

        let { codigo, cliente, destino, estado } = req.body;

        if (destino && typeof destino === 'string') {
            destino = destino.replace(/^\[\vert{}\]$/g, '').trim();
        }

        const { data, error } = await supabase
            .from('codigos_qr')
            .upsert({ codigo, cliente, destino, estado }, { onConflict: 'codigo' })
            .select();

        if (error) throw error;
        res.json({ message: 'Guardado con éxito', data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Actualizar un QR por código especifico (PUT)
app.put('/api/qrs/:codigo', async (req, res) => {
    const { codigo } = req.params;
    let { cliente, destino, estado } = req.body;

    if (destino && typeof destino === 'string') {
        destino = destino.replace(/^\[\vert{}\]$/g, '').trim();
    }

    try {
        const { data, error } = await supabase
            .from('codigos_qr')
            .upsert({ codigo, cliente, destino, estado }, { onConflict: 'codigo' })
            .select();

        if (error) throw error;
        res.json({ message: 'Guardado con éxito', data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar un QR por código especifico (DELETE)
app.delete('/api/qrs/:codigo', async (req, res) => {
    const { codigo } = req.params;
    try {
        const { data, error } = await supabase
            .from('codigos_qr')
            .delete()
            .eq('codigo', codigo);

        if (error) throw error;
        res.json({ message: 'Código eliminado', data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Crear nuevo QR con secuencia automática
app.post('/api/qrs/nuevo', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('codigos_qr')
            .select('codigo');

        if (error) throw error;

        const total = (data ? data.length : 0) + 1;
        const nuevoCodigo = `re-${String(total).padStart(3, '0')}`;

        const { data: insertData, error: insertError } = await supabase
            .from('codigos_qr')
            .insert([{ codigo: nuevoCodigo, estado: 'libre' }])
            .select();

        if (insertError) throw insertError;
        res.json({ message: 'QR creado', data: insertData });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Motor de redirección dinámica
app.get('/:codigo', async (req, res) => {
    const { codigo } = req.params;
    try {
        const { data, error } = await supabase
            .from('codigos_qr')
            .select('*')
            .eq('codigo', codigo)
            .single();

        if (error || !data) {
            return res.status(404).send('Código QR no encontrado');
        }

        const estadoNormalizado = data.estado ? data.estado.toLowerCase() : '';
        if (estadoNormalizado === 'asignado' && data.destino) {
            let urlDestino = data.destino.trim();
            if (!urlDestino.startsWith('http://') && !urlDestino.startsWith('https://')) {
                urlDestino = `https://${urlDestino}`;
            }
            return res.redirect(urlDestino);
        } else {
            return res.send(`<h1>El código ${codigo} no está asignado a ningún destino.</h1>`);
        }
    } catch (err) {
        res.status(500).send('Error interno del servidor');
    }
});

app.listen(PORT, () => {
    console.log(`✅ Servidor en la nube listo en puerto ${PORT}`);
    console.log(`💻 Panel: http://localhost:${PORT}/panel`);
});