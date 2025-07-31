// Archivo: server.js
const express = require('express');
const fs = require('fs').promises; // Usamos la versión de promesas para async/await
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const CONTENT_FILE_PATH = path.join(__dirname, 'contentList.json');
const COSMIC_PLAYLIST_PATH = path.join(__dirname, 'cosmicPlaylist.json');
const FORBIDDEN_KEYWORDS = [
    // English
    'gore',
    'porn',
    'death',
    'extreme',
    'sex',
    'nude',
    // Common sites/terms
    'xnxx',
    'xvideos',
    'pornhub'
];

// --- Middleware ---
// Para que el servidor entienda los datos JSON que envía el formulario
app.use(express.json());
// Para servir los archivos estáticos (index.html, css, etc.) desde la carpeta actual
app.use(express.static(__dirname));

// --- Funciones de Ayuda (Helpers) ---

// Lee el contenido del archivo JSON. Si no existe, devuelve una lista vacía.
async function readJsonFile(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // Si el archivo no existe, no es un error, es el estado inicial.
            return []; // Devuelve un array vacío si el archivo no existe
        }
        // Para otros errores, los relanzamos para que los maneje el catch de la ruta.
        throw error;
    }
}

// --- Rutas de la API ---

// RUTA GET: Devuelve todo el contenido de contentList.json
app.get('/api/content', async (req, res) => {
    try {
        const contentList = await readJsonFile(CONTENT_FILE_PATH);
        res.json(contentList);
    } catch (error) {
        console.error('Error al leer el archivo de contenido:', error);
        res.status(500).send('Error interno del servidor al leer el contenido.');
    }
});

// RUTA POST: Recibe una nueva sugerencia y la guarda en contentList.json
app.post('/api/suggestions', async (req, res) => {
    try {
        // Añadimos la estructura de votos al crear una nueva sugerencia
        const newSuggestion = {
            ...req.body,
            votes: { fire: 0, meh: 0, poop: 0 }
        };

        // Validación simple para asegurar que tenemos los datos necesarios
        if (!newSuggestion.title || !newSuggestion.url || !newSuggestion.type) {
            return res.status(400).send('Datos de la sugerencia incompletos.');
        }

        const contentToCheck = `${newSuggestion.title.toLowerCase()} ${newSuggestion.url.toLowerCase()}`;
        const isForbidden = FORBIDDEN_KEYWORDS.some(keyword => contentToCheck.includes(keyword));

        if (isForbidden) {
            // Si se encuentra una palabra prohibida, se rechaza la sugerencia.
            return res.status(400).send('Este contenido puede ser demasiado denso para la volá, intenta con algo más tranqui 😌🌱');
        }

        // 1. Leer el archivo actual
        const contentList = await readJsonFile(CONTENT_FILE_PATH);

        // 2. Verificar si la sugerencia ya existe (usando la URL como identificador único)
        const isDuplicate = contentList.some(item => item.url === newSuggestion.url);
        if (isDuplicate) {
            // Si ya existe, envía un código de error de "Conflicto" (409)
            return res.status(409).send('Esa sugerencia ya existe.');
        }

        // 3. Añadir la nueva sugerencia si no es un duplicado
        contentList.push(newSuggestion);

        // 4. Escribir el archivo actualizado
        await fs.writeFile(CONTENT_FILE_PATH, JSON.stringify(contentList, null, 2), 'utf-8');

        // Responder al cliente que todo salió bien
        res.status(201).json(newSuggestion); // Devolvemos el objeto creado

    } catch (error) {
        console.error('Error al guardar la sugerencia:', error);
        res.status(500).send('Error interno del servidor al guardar la sugerencia.');
    }
});

// RUTA POST: Registra un voto para un contenido específico
app.post('/api/content/vote', async (req, res) => {
    try {
        const { url, voteType } = req.body;

        if (!url || !['fire', 'meh', 'poop'].includes(voteType)) {
            return res.status(400).send('Datos de votación inválidos.');
        }

        const contentList = await readJsonFile(CONTENT_FILE_PATH);
        const contentIndex = contentList.findIndex(item => item.url === url);

        if (contentIndex === -1) {
            return res.status(404).send('Contenido no encontrado.');
        }

        // Incrementar el contador de votos
        contentList[contentIndex].votes[voteType]++;

        // Escribir la lista actualizada en el archivo
        await fs.writeFile(CONTENT_FILE_PATH, JSON.stringify(contentList, null, 2), 'utf-8');

        // Devolver la lista completa y actualizada para que el frontend se sincronice
        res.json(contentList);

    } catch (error) {
        console.error('Error al registrar el voto:', error);
        res.status(500).send('Error interno del servidor al registrar el voto.');
    }
});

// --- Rutas para el Viaje Cósmico ---

// RUTA GET: Devuelve la playlist del viaje cósmico
app.get('/api/cosmic-playlist', async (req, res) => {
    try {
        const playlist = await readJsonFile(COSMIC_PLAYLIST_PATH);
        res.json(playlist);
    } catch (error) {
        console.error('Error al leer la playlist cósmica:', error);
        res.status(500).send('Error interno del servidor al leer la playlist.');
    }
});

// RUTA POST: Recibe una sugerencia de video para el viaje cósmico
app.post('/api/video-suggestions', async (req, res) => {
    try {
        const { videoId, title } = req.body;

        if (!videoId || !title) {
            return res.status(400).send('Faltan datos en la sugerencia del video.');
        }

        // Verificar si ya está en la playlist principal (leída desde el archivo)
        const cosmicPlaylist = await readJsonFile(COSMIC_PLAYLIST_PATH);
        if (cosmicPlaylist.includes(videoId)) {
            return res.status(409).send('¡Ese video ya forma parte del viaje cósmico!');
        }

        // --- Lógica para enviar correo con Nodemailer y Gmail ---
        const userEmail = process.env.EMAIL_USER;
        const appPassword = process.env.EMAIL_PASS; // Aquí va la contraseña de aplicación
        const recipientEmail = process.env.EMAIL_RECIPIENT;

        if (!userEmail || !appPassword || !recipientEmail) {
            console.error("Faltan las variables de entorno para enviar correos con Gmail.");
            // No le decimos al usuario que falló, pero lo registramos en el servidor.
            return res.status(201).json({ success: true, message: 'Sugerencia recibida (modo de desarrollo).' });
        }

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: userEmail,
                pass: appPassword,
            },
        });

        await transporter.sendMail({
            from: `"Sugerencias Cósmicas 👽" <${userEmail}>`,
            to: recipientEmail,
            subject: 'Nueva sugerencia de video para la volá!',
            html: `<p>¡Hola, curador cósmico!</p><p>Alguien ha sugerido un nuevo video para el viaje:</p><ul><li><strong>Título:</strong> ${title}</li><li><strong>URL:</strong> https://www.youtube.com/watch?v=${videoId}</li></ul><p>Si te gusta, añade el ID <strong>${videoId}</strong> a tu archivo <code>cosmicPlaylist.json</code>.</p><p>¡Que siga la volá!</p>`
        });

        res.status(201).json({ success: true, message: 'Sugerencia recibida.' });
    } catch (error) {
        console.error('Error al enviar la sugerencia de video por correo:', error);
        res.status(500).send('Error interno del servidor al procesar la sugerencia.');
    }
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`✨ Servidor cósmico corriendo en http://localhost:${PORT}`);
});
