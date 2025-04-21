
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const usuarios = {};

function obtenerFechaActualISO() {
  const ahoraUTC = new Date();
  const ahoraEspaña = new Date(ahoraUTC.getTime() + 2 * 60 * 60 * 1000);
  return ahoraEspaña.toISOString().split('T')[0];
}

function obtenerHoraLocal() {
  const ahoraUTC = new Date();
  const ahoraEspaña = new Date(ahoraUTC.getTime() + 2 * 60 * 60 * 1000);
  return ahoraEspaña.toISOString().split('T')[1].slice(0, 5);
}

function enviarMensajeWhatsApp(numero, texto) {
  console.log(`📤 Enviando a ${numero}: ${texto}`);
  return axios.post(`https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`, {
    messaging_product: "whatsapp",
    to: numero,
    text: { body: texto }
  }, {
    headers: {
      Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    }
  }).catch(err => {
    console.error("❌ Error al enviar mensaje:", err?.response?.data || err.message);
  });
}

app.get('/webhook', (req, res) => {
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (token === process.env.VERIFY_TOKEN) {
    console.log("✅ Webhook verificado");
    res.send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  const entry = req.body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;
  const mensaje = value?.messages?.[0];

  if (mensaje?.type === 'text') {
    const numero = mensaje.from;
    const texto = mensaje.text.body.trim().toLowerCase();

    if (!usuarios[numero]) usuarios[numero] = { estado: null, medicamentos: [], citas: [], medicamentoTemp: null };
    const usuario = usuarios[numero];

    if (usuario.estado === null && texto === 'medicamento') {
      usuario.estado = 'medicamento_nombre';
      return enviarMensajeWhatsApp(numero, '💊 ¿Cuál es el nombre del medicamento?');
    }

    if (usuario.estado === 'medicamento_nombre') {
      usuario.medicamentoTemp = texto;
      usuario.estado = 'medicamento_hora';
      return enviarMensajeWhatsApp(numero, '🕐 ¿A qué hora quieres tomar ese medicamento? (Ej: 09:00)');
    }

    if (usuario.estado === 'medicamento_hora') {
      usuario.medicamentos.push({ nombre: usuario.medicamentoTemp, hora: texto });
      usuario.estado = null;
      usuario.medicamentoTemp = null;
      return enviarMensajeWhatsApp(numero, `Perfecto. Te recordaré tomar ${texto} cada día.`);
    }

    if (usuario.estado === null && texto === 'cita') {
      usuario.estado = 'cita_info';
      return enviarMensajeWhatsApp(numero, '📅 Escríbeme la cita con fecha y hora. Ej: Médico de cabecera el 25/04 a las 12:00');
    }

    if (usuario.estado === 'cita_info') {
      usuario.citas.push(texto);
      usuario.estado = null;
      return enviarMensajeWhatsApp(numero, `✅ Cita guardada: ${texto}`);
    }

    if (usuario.estado === null && texto === 'ver') {
      let resumen = '📋 Esto es lo que tengo guardado:\n\n💊 Medicamentos:\n';
      usuario.medicamentos.forEach((m, i) => {
        resumen += `${i + 1}. ${m.nombre} a las ${m.hora}\n`;
      });
      if (usuario.medicamentos.length === 0) resumen += 'No hay medicamentos registrados.\n';

      resumen += '\n📅 Citas:\n';
      usuario.citas.forEach((c, i) => {
        resumen += `${i + 1}. ${c}\n`;
      });
      if (usuario.citas.length === 0) resumen += 'No hay citas registradas.';

      return enviarMensajeWhatsApp(numero, resumen);
    }

    if (usuario.estado === null && texto === 'eliminar') {
      usuario.medicamentos = [];
      usuario.citas = [];
      usuario.estado = null;
      return enviarMensajeWhatsApp(numero, '❌ He eliminado todos tus recordatorios.');
    }

    if (usuario.estado === null) {
      return enviarMensajeWhatsApp(numero, 'Puedes decirme "medicamento", "cita", "ver" o "eliminar".');
    }
  }

  res.sendStatus(200);
});

cron.schedule('* * * * *', () => {
  const ahora = obtenerHoraLocal();
  Object.entries(usuarios).forEach(([numero, usuario]) => {
    usuario.medicamentos.forEach(med => {
      if (med.hora === ahora) {
        enviarMensajeWhatsApp(numero, `⏰ ¡Hora de tomar tu medicamento: ${med.nombre}!`);
      }
    });
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Clara (Cloud API) escuchando en el puerto ${PORT}`);
});
