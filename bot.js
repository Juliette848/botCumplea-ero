const express = require("express");
const QRCode = require("qrcode"); // ✅ nuevo
const { Client, LocalAuth } = require("whatsapp-web.js");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BOT_SECRET = process.env.BOT_SECRET || "CAMBIA_ESTO";

let lastQr = null; // ✅ guardamos el QR para mostrarlo como imagen

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { args: ["--no-sandbox", "--disable-setuid-sandbox"] }
});

client.on("qr", (qr) => {
  lastQr = qr;
  console.log("📌 QR listo. Ábrelo en: /qr");
});

client.on("ready", () => console.log("✅ WhatsApp conectado"));

app.get("/health", (_, res) => res.json({ ok: true }));

// ✅ Nuevo endpoint para ver el QR como imagen
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
            <img src="${dataUrl}" style="width:320px;height:320px;" />
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
    if (!groupName || !message) return res.status(400).json({ error: "faltan datos" });

    const chats = await client.getChats();
    const group = chats.find(c => c.isGroup && c.name === groupName);
    if (!group) return res.status(404).json({ error: `grupo no encontrado: ${groupName}` });

    await group.sendMessage(message);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "error enviando" });
  }
});

client.initialize();
app.listen(PORT, () => console.log(`API lista en puerto ${PORT}`));
