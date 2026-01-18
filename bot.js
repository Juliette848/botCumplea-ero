const express = require("express");
const QRCode = require("qrcode");
const { Client, LocalAuth } = require("whatsapp-web.js");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BOT_SECRET = process.env.BOT_SECRET || "CAMBIA_ESTO";

let lastQr = null;
let isReady = false;

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { args: ["--no-sandbox", "--disable-setuid-sandbox"] }
});

// Espera activa a que WhatsApp esté ready (máx X ms)
async function waitUntilReady(ms = 20000) {
  const start = Date.now();
  while (!isReady && Date.now() - start < ms) {
    await new Promise(r => setTimeout(r, 500));
  }
  return isReady;
}

client.on("qr", (qr) => {
  lastQr = qr;
  isReady = false; // si sale QR, no está ready aún
  console.log("📌 QR listo. Ábrelo en: /qr");
});

client.on("ready", () => {
  isReady = true;
  console.log("✅ WhatsApp conectado");
});

client.on("disconnected", (reason) => {
  isReady = false;
  console.log("⚠️ WhatsApp desconectado:", reason);
});

app.get("/health", (_, res) => {
  res.json({ ok: true, whatsappReady: isReady });
});

// QR como imagen
app.get("/qr", async (_, res) => {
  if (!lastQr) {
    return res
      .status(200)
      .send("QR aún no disponible. Revisa Logs o espera unos segundos.");
  }

  try {
    const dataUrl = await QRCode.toDataURL(lastQr);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(`
      <html>
        <head><title>QR WhatsApp</title></head>
        <body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;">
          <div style="text-align:center;font-family:Arial,sans-serif;">
            <h2>Escanea este QR con WhatsApp</h2>
            <p>WhatsApp → Dispositivos vinculados → Vincular dispositivo</p>
            <img src="${dataUrl}" style="width:340px;height:340px;" />
          </div>
        </body>
      </html>
    `);
  } catch (e) {
    console.error(e);
    return res.status(500).send("Error generando QR");
  }
});

app.post("/send", async (req, res) => {
  try {
    const { secret, groupName, message } = req.body || {};

    if (secret !== BOT_SECRET) return res.status(401).json({ error: "unauthorized" });
    if (!groupName) return res.status(400).json({ error: "faltan datos: groupName" });

    // ✅ Si llega mensaje vacío, NO envía nada (solo log)
    if (!message || !String(message).trim()) {
      console.log("ℹ️ /send llamado sin mensaje. No se enviará nada.");
      return res.json({ ok: true, skipped: true, reason: "empty_message" });
    }

    // Espera a que WhatsApp esté listo
    const ok = await waitUntilReady(20000);
    if (!ok) {
      return res.status(503).json({
        error: "whatsapp_no_listo",
        hint: "WhatsApp aún no está listo. Revisa Logs hasta ver ✅ WhatsApp conectado."
      });
    }

    // Espera extra para que se estabilicen los chats (muy útil en Render)
    await new Promise(r => setTimeout(r, 2000));

    const chats = await client.getChats();
    const groups = chats.filter(c => c.isGroup);

    console.log("Total chats:", chats.length);
    console.log("Total grupos:", groups.length);

    const target = String(groupName).trim().toLowerCase();
    const group = groups.find(g => String(g.name || "").trim().toLowerCase() === target);

    if (!group) {
      console.log("❌ Grupo no encontrado. groupName recibido:", groupName);
      return res.status(404).json({
        error: `grupo no encontrado: ${groupName}`,
        gruposDisponibles: groups.map(g => g.name)
      });
    }

    const chatId = group.id?._serialized;
    if (!chatId) {
      console.log("❌ Grupo encontrado pero sin id serializado:", group.name);
      return res.status(500).json({ error: "grupo_sin_id" });
    }

    // ✅ Enviar SIN sendSeen para evitar el bug markedUnread
    try {
      await client.sendMessage(chatId, message, { sendSeen: false });
      return res.json({ ok: true, enviadoA: group.name });
    } catch (err1) {
      console.error("⚠️ Falló el primer envío. Reintentando en 3s. Error:", err1?.message || err1);
      await new Promise(r => setTimeout(r, 3000));
      await client.sendMessage(chatId, message, { sendSeen: false });
      return res.json({ ok: true, enviadoA: group.name, retried: true });
    }

  } catch (e) {
    console.error("ERROR /send:", e);
    return res.status(500).json({ error: "error enviando", detail: String(e?.message || e) });
  }
});

client.initialize();
app.listen(PORT, () => console.log(`API lista en puerto ${PORT}`));
