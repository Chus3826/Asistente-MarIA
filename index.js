const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

const recordatorios = {}; // { numero: { medicamentos: [], citas: [] } }
const estadosUsuario = {}; // Para manejar el flujo conversacional por número

// Función para enviar mensaje de WhatsApp
async function enviarMensajeWhatsApp(to, texto) {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
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
    console.error('❌ Error al enviar mensaje:', error.response?.data || error.message);
  }
}

// Webhook para recibir mensajes
app.post('/webhook', async (req, res) => {
  const entry = req.body?.entry?.[0];
  const changes = entry?.changes?.[0];
  const message = changes?.value?.messages?.[0];
  const numero = changes?.value?.contacts?.[0]?.wa_id;

  if (message?.text?.body && numero) {
    const texto = message.text.body.trim().toLowerCase();

    if (!recordatorios[numero]) {
      recordatorios[numero] = { medicamentos: [], citas: [] };
    }

    const estado = estadosUsuario[numero];

    if (estado?.esperando === 'medicamento_nombre') {
      estadosUsuario[numero] = { esperando: 'medicamento_hora', nombre: texto };
      return enviarMensajeWhatsApp(numero, '¿A qué hora quieres tomar ese medicamento? (Ej: 09:00)');
    }

    if (estado?.esperando === 'medicamento_hora') {
      recordatorios[numero].medicamentos.push({ nombre: estado.nombre, hora: texto });
      delete estadosUsuario[numero];
      return enviarMensajeWhatsApp(numero, `Perfecto. Te recordaré tomar ${estado.nombre} cada día a las ${texto}.`);
    }

    if (estado?.esperando === 'cita_info') {
      recordatorios[numero].citas.push(texto);
      delete estadosUsuario[numero];
      return enviarMensajeWhatsApp(numero, `Cita registrada: ${texto}`);
    }

    if (estado?.esperando === 'eliminar') {
      const indice = parseInt(texto) - 1;
      if (!isNaN(indice)) {
        if (estado.tipo === 'medicamento' && recordatorios[numero].medicamentos[indice]) {
          const eliminado = recordatorios[numero].medicamentos.splice(indice, 1);
          delete estadosUsuario[numero];
          return enviarMensajeWhatsApp(numero, `Eliminado: ${eliminado[0].nombre}`);
        }
        if (estado.tipo === 'cita' && recordatorios[numero].citas[indice]) {
          const eliminado = recordatorios[numero].citas.splice(indice, 1);
          delete estadosUsuario[numero];
          return enviarMensajeWhatsApp(numero, `Cita eliminada: ${eliminado[0]}`);
        }
      }
      return enviarMensajeWhatsApp(numero, 'Número no válido. Intenta de nuevo.');
    }

    // Comandos
    switch (texto) {
      case 'medicamento':
        estadosUsuario[numero] = { esperando: 'medicamento_nombre' };
        return enviarMensajeWhatsApp(numero, '¿Cuál es el nombre del medicamento?');
      case 'cita':
        estadosUsuario[numero] = { esperando: 'cita_info' };
        return enviarMensajeWhatsApp(numero, 'Escríbeme la cita con fecha y hora. Ej: Médico de cabecera el 25/04 a las 12:00');
      case 'ver':
        const listaMeds = recordatorios[numero].medicamentos.map((m, i) => `${i + 1}. ${m.nombre} a las ${m.hora}`).join('\n') || 'No hay medicamentos registrados.';
        const listaCitas = recordatorios[numero].citas.map((c, i) => `${i + 1}. ${c}`).join('\n') || 'No hay citas registradas.';
        return enviarMensajeWhatsApp(numero, `📋 Esto es lo que tengo guardado:\n\n💊 Medicamentos:\n${listaMeds}\n\n📅 Citas:\n${listaCitas}`);
      case 'eliminar':
        estadosUsuario[numero] = { esperando: 'eliminar_menu' };
        return enviarMensajeWhatsApp(numero, '¿Qué deseas eliminar? Escribe "medicamento" o "cita"');
      case 'medicamento':
      case 'cita':
        estadosUsuario[numero] = { esperando: 'eliminar', tipo: texto };
        const items = texto === 'medicamento'
          ? recordatorios[numero].medicamentos.map((m, i) => `${i + 1}. ${m.nombre} a las ${m.hora}`).join('\n')
          : recordatorios[numero].citas.map((c, i) => `${i + 1}. ${c}`).join('\n');
        return enviarMensajeWhatsApp(numero, `Escribe el número del ${texto} que quieres eliminar:\n${items}`);
      default:
        return enviarMensajeWhatsApp(numero, 'Puedes decirme "medicamento", "cita", "ver" o "eliminar".');
    }
  }

  res.sendStatus(200);
});

// Verificación del webhook
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('🟢 Webhook verificado correctamente.');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Envío diario de recordatorios de medicación
cron.schedule('* * * * *', () => {
  const ahora = new Date();
  const horaActual = ahora.toTimeString().slice(0, 5);
  Object.entries(recordatorios).forEach(([numero, datos]) => {
    datos.medicamentos.forEach((m) => {
      if (m.hora === horaActual) {
        enviarMensajeWhatsApp(numero, `💊 Recuerda tomar tu medicamento: ${m.nombre}`);
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('🚀 Clara con recordatorios activos en el puerto', PORT);
});
