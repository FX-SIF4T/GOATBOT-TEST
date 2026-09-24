const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const GITHUB_RAW = "https://raw.githubusercontent.com/FX-SIF4T/API-STORE/refs/heads/main/FXS_APIS/apis.json";

const TMP = path.join(__dirname, "tmp");
fs.ensureDirSync(TMP);

async function dlFile(url, dest) {
  const res = await axios.get(url, { responseType: "arraybuffer", timeout: 90000 });
  await fs.outputFile(dest, Buffer.from(res.data));
  return dest;
}

module.exports = {
  config: {
    name: "fxsimage",
    aliases: ["fxsimg", "fxsai"],
    version: "1.0",
    author: "SIFAT",
    countDown: 10,
    role: 0,
    shortDescription: { en: "ɢᴇɴᴇʀᴀᴛᴇ ᴀɪ ɪᴍᴀɢᴇꜱ ꜰʀᴏᴍ ᴛᴇxᴛ" },
    longDescription: {
      en: "ɢᴇɴᴇʀᴀᴛᴇ ᴜᴘ ᴛᴏ 4 ᴀɪ ɪᴍᴀɢᴇꜱ ᴠɪᴀ ꜰxꜱ ᴀɪ.\nꜰʟᴀɢꜱ: -v ᴠᴇʀᴛɪᴄᴀʟ · -l ʟᴀɴᴅꜱᴄᴀᴘᴇ · -n <1–4> ᴄᴏᴜɴᴛ",
    },
    category: "ai",
    guide: {
      en:
        "{pn} <ᴘʀᴏᴍᴘᴛ>\n" +
        "{pn} -v <ᴘʀᴏᴍᴘᴛ>  ← ᴠᴇʀᴛɪᴄᴀʟ\n" +
        "{pn} -l <ᴘʀᴏᴍᴘᴛ>  ← ʟᴀɴᴅꜱᴄᴀᴘᴇ\n" +
        "{pn} -n 2 <ᴘʀᴏᴍᴘᴛ> ← 2 ᴠᴀʀɪᴀɴᴛꜱ",
    },
  },

  onStart: async function ({ api, event, args, message }) {
    let orientation = "SQUARE", numImages = 4;
    const clean = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "-v") orientation = "VERTICAL";
      else if (args[i] === "-l") orientation = "LANDSCAPE";
      else if (args[i] === "-n" && args[i + 1]) numImages = Math.min(4, Math.max(1, parseInt(args[++i]) || 4));
      else clean.push(args[i]);
    }
    const prompt = clean.join(" ").trim();

    if (!prompt) return message.reply(
      `🎨 ꜰxꜱ ᴀɪ ɪᴍᴀɢᴇ\n\n` +
      `ᴜꜱᴀɢᴇ:\n` +
      `  fxsimg <ᴘʀᴏᴍᴘᴛ>\n` +
      `  fxsimg -v <ᴘʀᴏᴍᴘᴛ>   ← ᴠᴇʀᴛɪᴄᴀʟ\n` +
      `  fxsimg -l <ᴘʀᴏᴍᴘᴛ>   ← ʟᴀɴᴅꜱᴄᴀᴘᴇ\n` +
      `  fxsimg -n 2 <ᴘʀᴏᴍᴘᴛ> ← 2 ɪᴍᴀɢᴇꜱ\n\n` +
      `ᴇxᴀᴍᴘʟᴇꜱ:\n` +
      `  fxsimg a sunset over Dhaka\n` +
      `  fxsimg -v anime girl in rain`
    );

    const oLabel = { SQUARE: "ꜱQ", VERTICAL: "ᴠᴇʀᴛ", LANDSCAPE: "ʟᴀɴᴅ" };
    const w = await message.reply(`🎨 ɢᴇɴᴇʀᴀᴛɪɴɢ ${numImages}× ${oLabel[orientation]}...`);

    try {
      const rawRes = await axios.get(GITHUB_RAW);
      const apiBase = rawRes.data.fxsai_api;

      const { data } = await axios.post(
        `${apiBase}/image`,
        { prompt, num_images: numImages, orientation },
        { timeout: 120000 }
      );
      const raw = data?.image_urls || data?.images || [];
      if (!raw.length) throw new Error("ɴᴏ ɪᴍᴀɢᴇꜱ ʀᴇᴛᴜʀɴᴇᴅ");
      const urls = raw.map((u) => (typeof u === "string" ? u : u.url));

      const paths = urls.map((_, i) => path.join(TMP, `fxsimg_${Date.now()}_${i}.jpg`));
      await Promise.all(urls.map((u, i) => dlFile(u, paths[i])));

      await api.unsendMessage(w.messageID);
      await api.sendMessage(
        { body: `🖼️ ɢᴇɴᴇʀᴀᴛᴇᴅ: "${prompt}"`, attachment: paths.map((p) => fs.createReadStream(p)) },
        event.threadID,
        () => paths.forEach((p) => { try { fs.unlinkSync(p); } catch (_) {} })
      );
    } catch (err) {
      try { await api.unsendMessage(w.messageID); } catch (_) {}
      const errMsg = err.response?.data?.detail || err.response?.data?.error || err.message;
      return message.reply(`❌ ɪᴍᴀɢᴇ ꜰᴀɪʟᴇᴅ: ${errMsg}`);
    }
  },
};
