const express = require("express");
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BOT_SECRET = process.env.BOT_SECRET || "CAMBIA_ESTO";

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { args: ["--no-sandbox", "--disable-setuid-sandbox"] }
});

client.on("qr", (qr) => {
  console.log("Escanea este QR (WhatsApp > Dispositivos vinculados):");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => console.log("✅ WhatsApp conectado"));

app.get("/health", (_, res) => res.json({ ok: true }));

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
