const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

// Función para enviar mensaje de texto al usuario
async function enviarMensajeWhatsApp(to, texto) {
  console.log(`📤 Intentando enviar mensaje a: ${to}`); // nuevo log agregado

  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
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
    console.log(`✅ Mensaje enviado a ${to}: "${texto}"`);
  } catch (error) {
    console.error('❌ Error al enviar mensaje:', error.response?.data || error.message);
  }
}

app.post('/webhook', async (req, res) => {
  const body = req.body;
  console.log("📩 Webhook recibido:", JSON.stringify(body, null, 2));

  if (body.object === 'whatsapp_business_account') {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const messageData = changes?.value?.messages?.[0];
    const contact = changes?.value?.contacts?.[0];

    if (messageData && contact && messageData.text) {
      const numero = contact.wa_id; // número del usuario
      const mensaje = messageData.text.body.trim().toLowerCase();
      await enviarMensajeWhatsApp(numero, `Hola cariño 😊 Has dicho: "${mensaje}"`);
    }
  }

  res.sendStatus(200);
});

app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('🟢 Webhook verificado correctamente con Meta.');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('🚀 Clara (WhatsApp Cloud API) activa en el puerto', PORT);
});
