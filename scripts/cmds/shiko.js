"use strict";

const axios   = require("axios");
const fs      = require("fs");
const path    = require("path");
const { execSync } = require("child_process");

const API_BASE = "https://shiko-v1qf.onrender.com";
const TMP_DIR  = path.join(__dirname, "cache", "shiko");
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const REACT = {
  loading : "⏳",
  success : "✅",
  error   : "❌",
  download: "⬇️"
};

const PROGRESS_TICKS = ["⏳", "🔄"];

function react(message, emoji, messageID) {
  try { message.reaction(emoji, messageID); } catch {}
}

function startProgressReactions(message, messageID, intervalMs = 4000) {
  let i = 0;
  const timer = setInterval(() => {
    react(message, PROGRESS_TICKS[i % PROGRESS_TICKS.length], messageID);
    i++;
  }, intervalMs);
  return () => clearInterval(timer);
}

async function apiGet(endpoint, params = {}) {
  const res = await axios.get(`${API_BASE}${endpoint}`, {
    params,
    timeout: 25000,
    headers: { "User-Agent": "GoatBot-SHIKO/3.0" }
  });
  return res.data;
}

function downloadFileStream(url, dest) {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await axios.get(url, {
        responseType: "stream",
        timeout: 45000,
        maxRedirects: 5,
        headers: {
          "Referer": "https://animesalt.ac/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });
      const writer = fs.createWriteStream(dest);
      res.data.pipe(writer);
      writer.on("finish", () => resolve(true));
      writer.on("error", reject);
      res.data.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
}

const QUALITY_TIERS = [
  "best[height<=480][ext=mp4]/best[height<=480]",
  "best[height<=240][ext=mp4]/best[height<=240]",
  "worst[ext=mp4]/worst"
];

function tryYtDlpFormat(url, dest, format, socketTimeout) {
  const cmd = [
    "yt-dlp",
    `-f "${format}"`,
    "--no-playlist",
    "--no-part",
    "--no-check-certificates",
    "--concurrent-fragments 8",
    "--downloader-args \"ffmpeg_i:-threads 4\"",
    `--socket-timeout ${socketTimeout}`,
    "--retries 1",
    "--fragment-retries 1",
    `-o "${dest}"`,
    `"${url}"`
  ].join(" ");
  execSync(cmd, { timeout: 35000, stdio: "pipe" });
  return fs.existsSync(dest) && fs.statSync(dest).size > 0;
}

function tryYtDlp(url, dest) {
  for (let i = 0; i < QUALITY_TIERS.length; i++) {
    try {
      if (tryYtDlpFormat(url, dest, QUALITY_TIERS[i], 15)) return true;
    } catch {}
    if (fs.existsSync(dest)) { try { fs.unlinkSync(dest); } catch {} }
  }
  return false;
}

async function fastestDownload(videoUrl, destPath) {
  const ytdlpPath = destPath;
  const directPath = destPath.replace(/\.mp4$/, "_direct.mp4");

  const attempts = [
    (async () => {
      try {
        if (tryYtDlp(videoUrl, ytdlpPath)) return ytdlpPath;
      } catch {}
      return null;
    })(),
    (async () => {
      try {
        const ok = await downloadFileStream(videoUrl, directPath);
        if (ok && fs.existsSync(directPath) && fs.statSync(directPath).size > 0) return directPath;
      } catch {}
      return null;
    })()
  ];

  const results = await Promise.allSettled(attempts);
  let winner = null;
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) { winner = r.value; break; }
  }

  for (const p of [ytdlpPath, directPath]) {
    if (p !== winner && fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch {}
    }
  }

  return winner;
}

function buildTextCard(anime, episodes) {
  const lines = [];
  lines.push(`🎌 ${anime.title}`);
  lines.push(`📺 Hindi Dubbed  |  ${episodes.length} Episodes`);
  lines.push("─".repeat(30));

  const list = episodes.slice(0, 24);
  list.forEach((ep, i) => {
    const num  = String(i + 1).padStart(2, " ");
    const raw  = ep.episode_title || ep.episode_number || `Episode ${i + 1}`;
    const name = raw.length > 32 ? raw.slice(0, 29) + "…" : raw;
    lines.push(`${num}. ${name}`);
  });

  if (episodes.length > 24)
    lines.push(`… and ${episodes.length - 24} more`);

  lines.push("─".repeat(30));
  lines.push("📩 Reply with the episode number to download");
  return lines.join("\n");
}

async function buildImageCard(anime, episodes) {
  const { createCanvas, loadImage } = require("canvas");

  const COLS   = 3;
  const ROWS   = Math.min(4, Math.ceil(Math.min(episodes.length, 12) / COLS));
  const TW     = 270;
  const TH     = 152;
  const PAD    = 12;
  const HDR    = 86;
  const LBL    = 42;
  const CELLH  = TH + LBL + PAD;
  const CELLW  = TW + PAD;
  const CW     = COLS * CELLW + PAD;
  const CH     = HDR  + ROWS * CELLH + PAD;

  const canvas = createCanvas(CW, CH);
  const ctx    = canvas.getContext("2d");

  ctx.fillStyle = "#0d0d0d";
  ctx.fillRect(0, 0, CW, CH);

  const hg = ctx.createLinearGradient(0, 0, CW, 0);
  hg.addColorStop(0, "#1c0a04");
  hg.addColorStop(1, "#0d0d0d");
  ctx.fillStyle = hg;
  ctx.fillRect(0, 0, CW, HDR);

  ctx.fillStyle = "#e8542a";
  ctx.fillRect(0, HDR - 3, CW, 3);

  ctx.font = "bold 26px 'Arial'";
  ctx.fillStyle = "#e8542a";
  ctx.fillText("SHI", PAD + 2, 40);
  const sw = ctx.measureText("SHI").width;
  ctx.fillStyle = "#ffffff";
  ctx.fillText("KO", PAD + 2 + sw, 40);

  const titleShort = anime.title.length > 52 ? anime.title.slice(0, 49) + "…" : anime.title;
  ctx.font = "bold 14px 'Arial'";
  ctx.fillStyle = "#dddddd";
  ctx.fillText(titleShort, PAD, 62);

  ctx.font = "12px 'Arial'";
  ctx.fillStyle = "#555";
  ctx.fillText(`${episodes.length} Episodes  ·  Hindi Dubbed  ·  Reply number to download`, PAD, 78);

  let poster = null;
  try {
    const imgUrl = `${API_BASE}/api/v1/imgproxy?url=${encodeURIComponent(anime.image)}`;
    poster = await loadImage(imgUrl);
  } catch {}

  const list = episodes.slice(0, 12);
  for (let i = 0; i < list.length; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x   = PAD + col * CELLW;
    const y   = HDR + PAD + row * CELLH;

    ctx.fillStyle = "#1b1b1b";
    ctx.beginPath();
    ctx.roundRect(x, y, TW, TH, 7);
    ctx.fill();

    if (poster) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, TW, TH, 7);
      ctx.clip();
      ctx.drawImage(poster, x, y, TW, TH);
      ctx.restore();
    }

    const og = ctx.createLinearGradient(x, y, x, y + TH);
    og.addColorStop(0.3, "rgba(0,0,0,0.05)");
    og.addColorStop(1,   "rgba(0,0,0,0.82)");
    ctx.fillStyle = og;
    ctx.beginPath();
    ctx.roundRect(x, y, TW, TH, 7);
    ctx.fill();

    const badge = String(i + 1);
    ctx.fillStyle = "#e8542a";
    ctx.beginPath();
    ctx.arc(x + 22, y + 22, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.font      = "bold 13px 'Arial'";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText(badge, x + 22, y + 27);
    ctx.textAlign = "left";

    const epRaw   = list[i].episode_title || list[i].episode_number || `Episode ${i + 1}`;
    const epLabel = epRaw.length > 30 ? epRaw.slice(0, 27) + "…" : epRaw;
    ctx.font      = "13px 'Arial'";
    ctx.fillStyle = "#e0e0e0";
    ctx.fillText(epLabel, x + 6, y + TH + 18);

    ctx.font      = "11px 'Arial'";
    ctx.fillStyle = "#555";
    ctx.fillText(`Ep ${list[i].episode_number || i + 1}`, x + 6, y + TH + 34);
  }

  const buf     = canvas.toBuffer("image/png");
  const outPath = path.join(TMP_DIR, `card_${Date.now()}.png`);
  fs.writeFileSync(outPath, buf);
  return outPath;
}

module.exports = {
  config: {
    name            : "shiko",
    version         : "3.0",
    author          : "SIFAT",
    countDown       : 10,
    role            : 0,
    shortDescription: { en: "Search & download Hindi dubbed anime episodes" },
    longDescription : {
      en: "Search Hindi dubbed anime via SHIKO API.\n"
        + "Get an episode list card, then reply with a number to download that episode.\n"
        + "Status is shown via reactions on your message (⏳ working, ✅ done, ❌ error)."
    },
    category: "entertainment",
    guide   : {
      en: "  {pn} <anime name>\n"
        + "  Example: {pn} naruto\n"
        + "  Then reply to the card with: 1  (or any episode number)"
    }
  },

  onStart: async function ({ message, args, event }) {
    if (!args.length) {
      return react(message, REACT.error, event.messageID);
    }

    const query = args.join(" ").trim();
    react(message, REACT.loading, event.messageID);

    try {
      const search  = await apiGet("/api/v1/search", { q: query });
      const results = search.results || [];
      if (!results.length) {
        return react(message, REACT.error, event.messageID);
      }
      const anime = results[0];

      const epData   = await apiGet("/api/v1/episodes", { url: anime.url });
      const episodes = epData.episodes || [];
      if (!episodes.length) {
        return react(message, REACT.error, event.messageID);
      }

      let attachment = null;
      let cardPath   = null;
      try {
        cardPath   = await buildImageCard(anime, episodes);
        attachment = [fs.createReadStream(cardPath)];
      } catch {}

      const caption = buildTextCard(anime, episodes);

      message.reply(
        attachment
          ? { body: caption, attachment }
          : { body: caption },
        (err, info) => {
          if (cardPath && fs.existsSync(cardPath)) fs.unlinkSync(cardPath);
          if (err || !info) {
            react(message, REACT.error, event.messageID);
            return;
          }

          react(message, REACT.success, event.messageID);

          global.GoatBot.onReply.set(info.messageID, {
            commandName : "shiko",
            messageID   : info.messageID,
            anime,
            episodes    : episodes.slice(0, 24)
          });

          setTimeout(
            () => global.GoatBot.onReply.delete(info.messageID),
            10 * 60 * 1000
          );
        }
      );

    } catch (err) {
      console.error("[SHIKO]", err.message);
      react(message, REACT.error, event.messageID);
    }
  },

  onReply: async function ({ message, Reply, event }) {
    const { anime, episodes } = Reply;

    const raw = (event.body || "").trim();
    const num = parseInt(raw, 10);

    if (isNaN(num) || num < 1 || num > episodes.length) {
      return react(message, REACT.error, event.messageID);
    }

    const ep      = episodes[num - 1];
    const epLabel = ep.episode_title || ep.episode_number || `Episode ${num}`;

    react(message, REACT.download, event.messageID);

    try {
      const extracted = await apiGet("/api/v1/extract", { url: ep.episode_url });

      if (!extracted.iframe_src) {
        return react(message, REACT.error, event.messageID);
      }

      const videoUrl = extracted.iframe_src;
      const destPath = path.join(TMP_DIR, `ep_${event.threadID}_${num}_${Date.now()}.mp4`);

      const stopProgress = startProgressReactions(message, event.messageID);
      let winnerPath;
      try {
        winnerPath = await fastestDownload(videoUrl, destPath);
      } finally {
        stopProgress();
      }

      if (!winnerPath) {
        return react(message, REACT.error, event.messageID);
      }

      const sizeMB = fs.statSync(winnerPath).size / (1024 * 1024);
      if (sizeMB > 25) {
        fs.unlinkSync(winnerPath);
        return react(message, REACT.error, event.messageID);
      }

      message.reply({
        body      : `✅ ${anime.title}\n📺 Episode ${num}: ${epLabel}`,
        attachment: [fs.createReadStream(winnerPath)]
      }, (err) => {
        if (fs.existsSync(winnerPath)) fs.unlinkSync(winnerPath);
        react(message, err ? REACT.error : REACT.success, event.messageID);
      });

    } catch (err) {
      console.error("[SHIKO download]", err.message);
      react(message, REACT.error, event.messageID);
    }
  }
};