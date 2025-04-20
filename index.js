const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const usuarios = {};

const WHATSAPP_API_URL = 'https://graph.facebook.com/v19.0/';
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

// Función para enviar mensajes por WhatsApp Cloud API
async function enviarMensajeWhatsApp(to, texto) {
  try {
    await axios.post(
      `${WHATSAPP_API_URL}${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: texto }
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (error) {
    console.error('Error al enviar mensaje:', error.response?.data || error.message);
  }
}

// Endpoint para recibir mensajes entrantes de WhatsApp (webhook)
app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const messageData = changes?.value?.messages?.[0];

    if (messageData && messageData.from && messageData.text) {
      const numero = messageData.from;
      const mensaje = messageData.text.body.trim().toLowerCase();

      if (!usuarios[numero]) {
        usuarios[numero] = { nombre: null, estado: 'esperando_nombre' };
      }

      const usuario = usuarios[numero];

      if (usuario.estado === 'esperando_nombre') {
        usuario.nombre = mensaje.charAt(0).toUpperCase() + mensaje.slice(1);
        usuario.estado = null;
        await enviarMensajeWhatsApp(numero, `Encantada de ayudarte, ${usuario.nombre} 💙 ¿Quieres que te recuerde un medicamento o una cita?`);
      } else if (mensaje === 'ayuda') {
        await enviarMensajeWhatsApp(numero, `Puedo ayudarte con:
💊 Medicamentos
📅 Citas médicas
👁 Ver lo que tienes
✂️ Eliminar algo
Solo dime la palabra 😊`);
      } else {
        await enviarMensajeWhatsApp(numero, `Hola ${usuario.nombre || 'cariño'} 👋 ¿Qué necesitas hoy? Puedes decirme "medicamento", "cita", "ver", "eliminar" o "ayuda".`);
      }
    }
  }

  res.sendStatus(200);
});

// Verificación del webhook de Meta
app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token && mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verificado con Meta.');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Servidor de Clara con WhatsApp Cloud API activo en el puerto', PORT);
});
