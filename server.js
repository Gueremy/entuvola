require('dotenv').config(); // Carga las variables de entorno desde .env
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const CONTENT_FILE_PATH = path.join(__dirname, 'contentList.json');

// El correo del moderador se carga desde la variable de entorno EMAIL_RECIPIENT
const MODERATOR_EMAIL = process.env.EMAIL_RECIPIENT;

// Middleware
app.use(express.json()); // Para parsear JSON en el body de las peticiones
app.use(express.static(__dirname)); // Sirve los archivos estáticos (html, css, etc.)

// --- Verificación de configuración y Nodemailer ---
// Detiene la aplicación si las variables de entorno críticas no están configuradas
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !MODERATOR_EMAIL) {
    console.error("\n\n--- ERROR DE CONFIGURACIÓN ---\n");
    console.error("Faltan variables de entorno críticas (EMAIL_USER, EMAIL_PASS, EMAIL_RECIPIENT).");
    console.error("Por favor, copia el archivo '.env.example' a un nuevo archivo llamado '.env' y completa tus datos.");
    console.error("La aplicación no puede iniciar sin esta configuración.\n");
    process.exit(1); // Detiene la ejecución.
}

// IMPORTANTE: Para Gmail, es recomendable usar una "Contraseña de Aplicación".
const transporter = nodemailer.createTransport({
    service: 'gmail', // o el servicio que uses
    auth: {
        user: process.env.EMAIL_USER, // Tu correo (debe estar en .env)
        pass: process.env.EMAIL_PASS, // Tu contraseña de aplicación (debe estar en .env)
    },
});

// Función auxiliar para leer el archivo de contenido
const readContent = async () => {
    try {
        const data = await fs.readFile(CONTENT_FILE_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error leyendo contentList.json:', error);
        // Si el archivo no existe o está corrupto, no se crashea.
        return []; 
    }
};

// --- Endpoints de la API ---

app.get('/api/content', async (req, res) => {
    const content = await readContent();
    res.json(content);
});

app.post('/api/content/vote', async (req, res) => {
    const { url, voteType } = req.body;
    if (!url || !['fire', 'meh', 'poop'].includes(voteType)) {
        return res.status(400).send('URL y un tipo de voto válido son requeridos.');
    }

    const allContent = await readContent();
    const itemIndex = allContent.findIndex(item => item.url === url);

    if (itemIndex === -1) {
        return res.status(404).send('Contenido no encontrado.');
    }

    if (!allContent[itemIndex].votes) {
        allContent[itemIndex].votes = { fire: 0, meh: 0, poop: 0 };
    }

    if (allContent[itemIndex].votes[voteType] !== undefined) {
        allContent[itemIndex].votes[voteType]++;
    }

    try {
        await fs.writeFile(CONTENT_FILE_PATH, JSON.stringify(allContent, null, 4));
        res.json(allContent);
    } catch (error) {
        console.error('Error al escribir en contentList.json:', error);
        res.status(500).send('Error del servidor al guardar el voto.');
    }
});

// Endpoint para sugerencias de index.html
app.post('/api/suggestions', async (req, res) => {
    const { title, url, type } = req.body;

    if (!title || !url || !type) {
        return res.status(400).send('Título, URL y tipo son obligatorios.');
    }

    // Validación simple de URL
    try {
        new URL(url);
    } catch (_) {
        return res.status(400).send('La URL proporcionada no es válida.');
    }

    const allContent = await readContent();
    if (allContent.some(item => item.url.trim() === url.trim())) {
        return res.status(409).send('Esa sugerencia ya existe en la lista. ¡Gracias de todas formas!');
    }

    const mailOptions = {
        from: `"Sugerencias Web" <${process.env.EMAIL_USER}>`,
        to: MODERATOR_EMAIL,
        subject: 'Nueva Sugerencia de Contenido Cósmico',
        html: `
            <h2>¡Hola, Depurador de Contenido!</h2>
            <p>Has recibido una nueva sugerencia para la web:</p>
            <ul>
                <li><strong>Título:</strong> ${title}</li>
                <li><strong>URL:</strong> <a href="${url}">${url}</a></li>
                <li><strong>Tipo:</strong> ${type}</li>
            </ul>
            <p>Revisa el contenido y si te parece bueno, agrégalo manualmente a <code>contentList.json</code>.</p>
        `,
    };

    try {
        await transporter.sendMail(mailOptions);
        res.status(200).json({ message: '¡Gracias! Tu sugerencia fue enviada para revisión. 👽' });
    } catch (error) {
        console.error('Error al enviar el correo:', error);
        res.status(500).send('Error del servidor al procesar la sugerencia.');
    }
});

// Endpoint para sugerencias de viaje.html
app.post('/api/video-suggestions', async (req, res) => {
    const { videoId, title } = req.body;
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    if (!videoId || !title) {
        return res.status(400).send('videoId y title son obligatorios.');
    }

    const allContent = await readContent();
    if (allContent.some(item => item.url.includes(videoId))) {
        return res.status(409).send('Este video ya está en la lista o ha sido sugerido. ¡Gracias!');
    }

    const mailOptions = {
        from: `"Viaje Cósmico" <${process.env.EMAIL_USER}>`,
        to: MODERATOR_EMAIL,
        subject: 'Nueva Sugerencia para el Viaje Cósmico',
        html: `
            <h2>¡Hola, Depurador de Contenido!</h2>
            <p>Has recibido una sugerencia para el <strong>Viaje Cósmico</strong>:</p>
            <ul>
                <li><strong>Título:</strong> ${title}</li>
                <li><strong>URL:</strong> <a href="${url}">${url}</a></li>
                <li><strong>Tipo:</strong> video</li>
            </ul>
            <p>Revisa el contenido y si te parece bueno, agrégalo manualmente a <code>contentList.json</code>.</p>
        `,
    };

    try {
        await transporter.sendMail(mailOptions);
        res.status(200).json({ message: '¡Gracias por tu sugerencia! Será revisada para el próximo viaje cósmico. ✨' });
    } catch (error) {
        console.error('Error al enviar el correo de video:', error);
        res.status(500).send('Error del servidor al procesar la sugerencia.');
    }
});

// Helper para extraer el ID de una URL de YouTube
function getYouTubeID(url) {
    const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

// Endpoint para obtener el código de incrustación para varias plataformas
app.get('/api/embed', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL parameter is required.' });
    }

    try {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname.replace('www.', '');

        // YouTube
        if (hostname === 'youtube.com' || hostname === 'youtu.be') {
            const videoId = getYouTubeID(url);
            if (videoId) {
                const embedHtml = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&showinfo=0" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
                return res.json({ html: embedHtml });
            }
        }

        // TikTok
        if (hostname === 'tiktok.com') {
            const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
            const oembedResponse = await fetch(oembedUrl);
            if (!oembedResponse.ok) throw new Error('TikTok oEmbed failed');
            const data = await oembedResponse.json();
            return res.json({ html: data.html });
        }

        // Twitter / X
        if (hostname === 'twitter.com' || hostname === 'x.com') {
            // Usamos omit_script=true porque cargaremos widgets.js en el <head>
            const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&maxwidth=550&omit_script=true&dnt=true`;
            const oembedResponse = await fetch(oembedUrl);
            if (!oembedResponse.ok) throw new Error('Twitter oEmbed failed');
            const data = await oembedResponse.json();
            return res.json({ html: data.html });
        }

        // Si ninguna plataforma coincide, no se puede incrustar.
        return res.status(404).json({ error: 'Unsupported platform for embedding.' });

    } catch (error) {
        console.error(`Error getting embed code for ${url}:`, error.message);
        // Devolvemos 404 para que el cliente sepa que debe abrir en una nueva pestaña.
        res.status(404).json({ error: 'Failed to get embed code.' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor cósmico escuchando en http://localhost:${PORT}`);
    console.log('Para iniciar localmente, asegúrate de tener tu .env y ejecuta: npm start');
});