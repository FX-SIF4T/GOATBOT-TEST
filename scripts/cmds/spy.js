"use strict";

const axios = require("axios");
const fs    = require("fs");
const path  = require("path");

let canvasLib = null;
try { canvasLib = require("@napi-rs/canvas"); }
catch { try { canvasLib = require("canvas"); } catch { canvasLib = null; } }

async function loadImg(url, fallback = null) {
  if (!url || !canvasLib) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 14000,
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      });
      if (res.status === 200 && res.data?.byteLength > 500)
        return await canvasLib.loadImage(Buffer.from(res.data));
    } catch { if (attempt === 0) await new Promise(r => setTimeout(r, 800)); }
  }
  if (fallback) return loadImg(fallback, null);
  return null;
}

function rr(ctx, x, y, w, h, r) {
  if (typeof r === "number") r = { tl: r, tr: r, br: r, bl: r };
  ctx.beginPath();
  ctx.moveTo(x + r.tl, y);
  ctx.lineTo(x + w - r.tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r.tr);
  ctx.lineTo(x + w, y + h - r.br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
  ctx.lineTo(x + r.bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r.bl);
  ctx.lineTo(x, y + r.tl);
  ctx.quadraticCurveTo(x, y, x + r.tl, y);
  ctx.closePath();
}

function circ(ctx, cx, cy, r) {
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath();
}

function shadow(ctx, color = "rgba(0,0,0,0.5)", blur = 16, ox = 0, oy = 4) {
  ctx.shadowColor = color; ctx.shadowBlur = blur;
  ctx.shadowOffsetX = ox; ctx.shadowOffsetY = oy;
}

function noShadow(ctx) {
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
}

function trimText(ctx, text, maxW) {
  let t = String(text);
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length && ctx.measureText(t + "...").width > maxW) t = t.slice(0, -1);
  return t + "...";
}

function wrapText(ctx, text, x, y, maxW, lineH, maxLines = 3) {
  if (!text) return y;
  const words = String(text).split(" ");
  let line = "", lines = 0;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      line = w; y += lineH; lines++;
      if (lines >= maxLines) { ctx.fillText(line + "...", x, y); return y + lineH; }
    } else line = test;
  }
  if (line) { ctx.fillText(line, x, y); y += lineH; }
  return y;
}

function formatNum(n) {
  if (!n) return null;
  const num = parseInt(n);
  if (isNaN(num)) return String(n);
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (num >= 1_000)     return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(num);
}

function lightenColor(hex, amt) {
  let c = hex.replace("#", "");
  if (c.length === 3) c = c.split("").map(x => x + x).join("");
  const num = parseInt(c, 16);
  const r = Math.min(255, (num >> 16) + Math.round(amt * 255));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(amt * 255));
  const b = Math.min(255, (num & 0xff) + Math.round(amt * 255));
  return `rgb(${r},${g},${b})`;
}

function darkenColor(hex, amt) {
  let c = hex.replace("#", "");
  if (c.length === 3) c = c.split("").map(x => x + x).join("");
  const num = parseInt(c, 16);
  const r = Math.max(0, (num >> 16) - Math.round(amt * 255));
  const g = Math.max(0, ((num >> 8) & 0xff) - Math.round(amt * 255));
  const b = Math.max(0, (num & 0xff) - Math.round(amt * 255));
  return `rgb(${r},${g},${b})`;
}

function drawBadge(ctx, cx, cy, code, color) {
  const r = 18;
  ctx.save();
  shadow(ctx, color + "55", 14, 0, 0);
  circ(ctx, cx, cy, r);
  const bg = ctx.createRadialGradient(cx - 4, cy - 4, 0, cx, cy, r);
  bg.addColorStop(0, lightenColor(color, 0.25));
  bg.addColorStop(1, darkenColor(color, 0.35));
  ctx.fillStyle = bg;
  ctx.fill();
  noShadow(ctx);
  circ(ctx, cx, cy, r);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.6;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.font = `bold ${code.length > 2 ? "9" : "11"}px Arial`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(code, cx, cy + 0.5);
  ctx.restore();
}

const FIELD_DEFS = {
  username:     { code: "UN",  label: "Username",     color: "#a78bfa" },
  uid:          { code: "ID",  label: "UID",          color: "#60a5fa" },
  gender:       { code: "GD",  label: "Gender",       color: "#f472b6" },
  birthday:     { code: "BD",  label: "Birthday",     color: "#fb923c" },
  liveCity:     { code: "LI",  label: "Lives In",     color: "#34d399" },
  hometown:     { code: "HT",  label: "Hometown",     color: "#4ade80" },
  relationship: { code: "RL",  label: "Relationship", color: "#f87171" },
  religion:     { code: "RG",  label: "Religion",     color: "#c084fc" },
  political:    { code: "PL",  label: "Political",    color: "#94a3b8" },
  education:    { code: "ED",  label: "Education",    color: "#fbbf24" },
  work:         { code: "WK",  label: "Work",         color: "#38bdf8" },
  languages:    { code: "LG",  label: "Languages",    color: "#a3e635" },
  nickName:     { code: "NK",  label: "Nickname",     color: "#fb923c" },
  friend:       { code: "FR",  label: "Friend",       color: "#4ade80" },
  account:      { code: "AC",  label: "Account",      color: "#94a3b8" },
  profile:      { code: "URL", label: "Profile",      color: "#60a5fa" },
};

async function buildCard(info) {
  const { createCanvas } = canvasLib;

  const W       = 940;
  const PAD     = 44;
  const INNER_W = W - PAD * 2;
  const COVER_H = 310;
  const AV_R    = 80;
  const AV_CX   = W / 2;
  const AV_CY   = COVER_H;

  const graphFallback = `https://graph.facebook.com/${info.id}/picture?width=512&height=512&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;
  const [coverImg, avatarImg] = await Promise.all([
    loadImg(info.coverPhoto),
    loadImg(info.profilePicUrl, graphFallback),
  ]);

  const rows = [];
  if (info.vanity)
    rows.push({ ...FIELD_DEFS.username, value: "@" + info.vanity });
  if (info.id)
    rows.push({ ...FIELD_DEFS.uid, value: info.id });
  if (info.gender)
    rows.push({ ...FIELD_DEFS.gender, value: info.gender === "MALE" ? "Male" : info.gender === "FEMALE" ? "Female" : info.gender });
  if (info.birthday)
    rows.push({ ...FIELD_DEFS.birthday, value: info.birthday });

  const sameLocation = info.live_city && info.hometown && info.live_city === info.hometown;
  if (info.live_city)
    rows.push({ ...FIELD_DEFS.liveCity, value: info.live_city });
  if (info.hometown && !sameLocation)
    rows.push({ ...FIELD_DEFS.hometown, value: info.hometown });

  if (info.relationship)
    rows.push({ ...FIELD_DEFS.relationship, value: info.relationship });
  if (info.religion)
    rows.push({ ...FIELD_DEFS.religion, value: info.religion });
  if (info.political)
    rows.push({ ...FIELD_DEFS.political, value: info.political });
  if (info.education?.length)
    rows.push({ ...FIELD_DEFS.education, value: info.education[0] });
  if (info.workInfo && typeof info.workInfo === "string")
    rows.push({ ...FIELD_DEFS.work, value: info.workInfo });
  if (info.languages?.length)
    rows.push({ ...FIELD_DEFS.languages, value: info.languages.join(", ") });
  if (info.nickName)
    rows.push({ ...FIELD_DEFS.nickName, value: info.nickName });
  if (info.isFriend !== undefined)
    rows.push({
      ...FIELD_DEFS.friend,
      color: info.isFriend ? "#4ade80" : "#f87171",
      value: info.isFriend ? "Yes  (Friend)" : "No  (Not a Friend)",
    });
  if (info.isVerified)
    rows.push({ code: "VF", label: "Verified", color: "#60a5fa", value: "Official Account" });
  if (info.isMemorialized)
    rows.push({ ...FIELD_DEFS.account, value: "Memorialized Account" });

  const shortUrl = info.vanity
    ? `facebook.com/${info.vanity}`
    : `facebook.com/profile.php?id=${info.id}`;
  rows.push({ ...FIELD_DEFS.profile, value: shortUrl });

  const COVER_GAP = AV_R + 20;
  const NAME_H    = 100;
  const BIO_LINES = info.bio ? Math.min(3, Math.ceil(info.bio.length / 50)) : 0;
  const BIO_H     = BIO_LINES > 0 ? BIO_LINES * 24 + 28 : 0;
  const hasStats  = info.followers || info.following || info.friendCount;
  const STATS_H   = hasStats ? 88 : 0;
  const DIV_H     = 28;
  const ROW_H     = 52;

  const CARD_H = COVER_H + COVER_GAP + NAME_H + BIO_H + STATS_H + DIV_H + rows.length * ROW_H + 20;

  const cv  = createCanvas(W, CARD_H);
  const ctx = cv.getContext("2d");

  rr(ctx, 0, 0, W, CARD_H, 28);
  ctx.fillStyle = "#0b0b0f";
  ctx.fill();

  ctx.save();
  rr(ctx, 0, 0, W, CARD_H, 28);
  ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,0.02)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CARD_H); ctx.stroke();
  }
  for (let y = 0; y < CARD_H; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  rr(ctx, 0, 0, W, COVER_H, { tl: 28, tr: 28, bl: 0, br: 0 });
  ctx.clip();

  if (coverImg) {
    const scale = Math.max(W / coverImg.width, COVER_H / coverImg.height);
    const dw = coverImg.width * scale;
    const dh = coverImg.height * scale;
    const dy = Math.min(0, (COVER_H - dh) / 2);
    ctx.drawImage(coverImg, (W - dw) / 2, dy, dw, dh);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, 0, W, COVER_H);
  } else {
    const grd = ctx.createLinearGradient(0, 0, W, COVER_H);
    grd.addColorStop(0,   "#080818");
    grd.addColorStop(0.3, "#0d1535");
    grd.addColorStop(0.6, "#0f1f5c");
    grd.addColorStop(1,   "#080818");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, COVER_H);

    for (let i = -COVER_H; i < W + COVER_H; i += 44) {
      ctx.strokeStyle = "rgba(24,119,242,0.07)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + COVER_H, COVER_H); ctx.stroke();
    }

    const g1 = ctx.createRadialGradient(200, 90, 0, 200, 90, 220);
    g1.addColorStop(0, "rgba(24,119,242,0.28)"); g1.addColorStop(1, "transparent");
    ctx.fillStyle = g1; ctx.fillRect(0, 0, W, COVER_H);

    const g2 = ctx.createRadialGradient(720, 160, 0, 720, 160, 200);
    g2.addColorStop(0, "rgba(139,92,246,0.24)"); g2.addColorStop(1, "transparent");
    ctx.fillStyle = g2; ctx.fillRect(0, 0, W, COVER_H);

    const g3 = ctx.createRadialGradient(460, 50, 0, 460, 50, 130);
    g3.addColorStop(0, "rgba(236,72,153,0.15)"); g3.addColorStop(1, "transparent");
    ctx.fillStyle = g3; ctx.fillRect(0, 0, W, COVER_H);
  }

  const covFade = ctx.createLinearGradient(0, COVER_H - 55, 0, COVER_H);
  covFade.addColorStop(0, "rgba(11,11,15,0)");
  covFade.addColorStop(1, "rgba(11,11,15,1)");
  ctx.fillStyle = covFade; ctx.fillRect(0, COVER_H - 55, W, 55);
  ctx.restore();

  ctx.save();
  const ringGrad = ctx.createLinearGradient(AV_CX - AV_R - 10, AV_CY - AV_R, AV_CX + AV_R + 10, AV_CY + AV_R);
  ringGrad.addColorStop(0,    "#1877f2");
  ringGrad.addColorStop(0.33, "#8b5cf6");
  ringGrad.addColorStop(0.66, "#ec4899");
  ringGrad.addColorStop(1,    "#1877f2");
  shadow(ctx, "rgba(99,102,241,0.8)", 32, 0, 0);
  circ(ctx, AV_CX, AV_CY, AV_R + 8);
  ctx.strokeStyle = ringGrad;
  ctx.lineWidth = 4;
  ctx.stroke();
  noShadow(ctx);
  ctx.restore();

  ctx.save();
  circ(ctx, AV_CX, AV_CY, AV_R + 3);
  ctx.fillStyle = "#0b0b0f";
  ctx.fill();
  ctx.restore();

  ctx.save();
  circ(ctx, AV_CX, AV_CY, AV_R);
  ctx.clip();
  if (avatarImg) {
    ctx.drawImage(avatarImg, AV_CX - AV_R, AV_CY - AV_R, AV_R * 2, AV_R * 2);
  } else {
    const ag = ctx.createLinearGradient(AV_CX - AV_R, AV_CY - AV_R, AV_CX + AV_R, AV_CY + AV_R);
    ag.addColorStop(0, "#1a1a2e"); ag.addColorStop(1, "#16213e");
    ctx.fillStyle = ag; ctx.fillRect(AV_CX - AV_R, AV_CY - AV_R, AV_R * 2, AV_R * 2);
    ctx.font = `bold ${AV_R}px Arial`;
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText((info.name || "?")[0].toUpperCase(), AV_CX, AV_CY);
  }
  ctx.restore();

  if (info.isVerified) {
    const bx = AV_CX + AV_R * 0.7, by = AV_CY + AV_R * 0.7;
    ctx.save();
    shadow(ctx, "rgba(0,0,0,0.7)", 12, 0, 2);
    circ(ctx, bx, by, 16);
    const bg2 = ctx.createRadialGradient(bx - 3, by - 3, 0, bx, by, 16);
    bg2.addColorStop(0, "#60a5fa"); bg2.addColorStop(1, "#1d4ed8");
    ctx.fillStyle = bg2; ctx.fill();
    noShadow(ctx);
    ctx.font = "bold 13px Arial"; ctx.fillStyle = "#fff";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("V", bx, by + 0.5);
    ctx.restore();
  }

  let ty = AV_CY + AV_R + 50;

  ctx.font = "bold 32px Arial";
  ctx.fillStyle = "#f5f5f7";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  shadow(ctx, "rgba(0,0,0,0.7)", 10, 0, 3);
  ctx.fillText(trimText(ctx, info.name || "Facebook User", INNER_W - 80), W / 2, ty);
  noShadow(ctx);
  ty += 10;

  if (info.vanity) {
    ty += 16;
    const uname = "@" + info.vanity;
    ctx.font = "bold 13px Arial";
    const uw  = ctx.measureText(uname).width + 32;
    const ux  = (W - uw) / 2;
    ctx.save();
    rr(ctx, ux, ty - 17, uw, 26, 13);
    const pillG = ctx.createLinearGradient(ux, 0, ux + uw, 0);
    pillG.addColorStop(0, "rgba(24,119,242,0.25)");
    pillG.addColorStop(1, "rgba(139,92,246,0.25)");
    ctx.fillStyle = pillG; ctx.fill();
    ctx.strokeStyle = "rgba(139,92,246,0.5)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "#a78bfa"; ctx.textAlign = "center";
    ctx.fillText(uname, W / 2, ty);
    ctx.restore();
    ty += 18;
  } else {
    ty += 18;
  }

  if (info.bio) {
    ty += 14;
    ctx.save();
    rr(ctx, PAD, ty - 8, INNER_W, BIO_LINES * 24 + 22, 12);
    ctx.fillStyle = "rgba(255,255,255,0.035)"; ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.07)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    ctx.font      = "italic 13px Arial";
    ctx.fillStyle = "#9ca3af";
    ctx.textAlign = "center";
    ty = wrapText(ctx, `"  ${info.bio}  "`, W / 2, ty + 10, INNER_W - 40, 24, 3);
    ty += 8;
  }

  if (hasStats) {
    ty += 18;
    ctx.save();
    rr(ctx, PAD, ty, INNER_W, 72, 16);
    const sG = ctx.createLinearGradient(PAD, ty, PAD + INNER_W, ty + 72);
    sG.addColorStop(0,   "rgba(24,119,242,0.10)");
    sG.addColorStop(0.5, "rgba(139,92,246,0.10)");
    sG.addColorStop(1,   "rgba(236,72,153,0.10)");
    ctx.fillStyle = sG; ctx.fill();
    ctx.strokeStyle = "rgba(99,102,241,0.22)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();

    const statItems = [];
    if (info.followers)   statItems.push({ label: "FOLLOWERS", value: formatNum(info.followers),  color: "#60a5fa" });
    if (info.following)   statItems.push({ label: "FOLLOWING", value: formatNum(info.following),  color: "#a78bfa" });
    if (info.friendCount) statItems.push({ label: "FRIENDS",   value: formatNum(info.friendCount), color: "#34d399" });

    if (statItems.length > 0) {
      const sw = INNER_W / statItems.length;
      statItems.forEach((s, i) => {
        const sx = PAD + sw * i + sw / 2;
        shadow(ctx, "rgba(0,0,0,0.3)", 4, 0, 1);
        ctx.font = "bold 22px Arial";
        ctx.fillStyle = s.color;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(s.value, sx, ty + 40);
        noShadow(ctx);
        ctx.font = "10px Arial";
        ctx.fillStyle = "#6b7280";
        ctx.fillText(s.label, sx, ty + 58);
        if (i < statItems.length - 1) {
          ctx.strokeStyle = "rgba(255,255,255,0.07)"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(PAD + sw * (i + 1), ty + 14); ctx.lineTo(PAD + sw * (i + 1), ty + 58); ctx.stroke();
        }
      });
    }
    ty += 72 + 18;
  }

  ty += 8;
  const mkDiv = (y, opacity = 0.3) => {
    const dG = ctx.createLinearGradient(PAD, 0, W - PAD, 0);
    dG.addColorStop(0, "transparent");
    dG.addColorStop(0.15, `rgba(99,102,241,${opacity})`);
    dG.addColorStop(0.85, `rgba(99,102,241,${opacity})`);
    dG.addColorStop(1, "transparent");
    ctx.strokeStyle = dG; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  };
  mkDiv(ty);
  ty += 20;

  const BADGE_CX  = PAD + 20;
  const LABEL_X   = PAD + 52;
  const VAL_X     = PAD + 200;
  const MAX_VAL_W = W - VAL_X - PAD - 10;

  rows.forEach((row, idx) => {
    const rowY = ty + idx * ROW_H;
    const midY = rowY + ROW_H / 2;

    ctx.save();
    rr(ctx, PAD - 14, rowY + 4, INNER_W + 28, ROW_H - 8, 12);
    ctx.fillStyle = idx % 2 === 0 ? "rgba(255,255,255,0.028)" : "rgba(0,0,0,0)";
    ctx.fill();
    ctx.restore();

    ctx.save();
    const barGrad = ctx.createLinearGradient(0, rowY + 6, 0, rowY + ROW_H - 6);
    barGrad.addColorStop(0,   row.color + "00");
    barGrad.addColorStop(0.5, row.color + "cc");
    barGrad.addColorStop(1,   row.color + "00");
    ctx.fillStyle = barGrad;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(PAD - 14, rowY + 6, 3, ROW_H - 12);
    ctx.globalAlpha = 1;
    ctx.restore();

    drawBadge(ctx, BADGE_CX, midY, row.code, row.color);

    ctx.font      = "bold 10px Arial";
    ctx.fillStyle = "#4b5563";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(row.label.toUpperCase(), LABEL_X, midY - 9);

    ctx.font      = "bold 14px Arial";
    ctx.fillStyle = row.color;
    ctx.textBaseline = "middle";
    ctx.fillText(trimText(ctx, String(row.value), MAX_VAL_W), VAL_X, midY + 7);
  });

  ty += rows.length * ROW_H + 10;

  return cv.toBuffer("image/png");
}

function buildText(info) {
  const L = (label, val) => val ? `${label.padEnd(14)}: ${val}` : null;
  const sameLocation = info.live_city && info.hometown && info.live_city === info.hometown;
  return [
    `+--------------------------+`,
    `|   SPY CARD  -  SIFAT     |`,
    `+--------------------------+`,
    `Name          : ${info.name || "N/A"}`,
    L("UID",          info.id),
    L("Username",     info.vanity ? "@" + info.vanity : null),
    L("Bio",          info.bio),
    L("Gender",       info.gender === "MALE" ? "Male" : info.gender === "FEMALE" ? "Female" : info.gender),
    L("Birthday",     info.birthday),
    L("Lives In",     info.live_city),
    L("Hometown",     !sameLocation ? info.hometown : null),
    L("Relationship", info.relationship),
    L("Education",    info.education?.[0]),
    L("Work",         info.workInfo),
    L("Followers",    formatNum(info.followers)),
    L("Following",    formatNum(info.following)),
    L("Friend",       info.isFriend !== undefined ? (info.isFriend ? "Yes" : "No") : null),
    L("Verified",     info.isVerified ? "Official Account" : null),
    L("Profile",      info.profileUrl || `https://www.facebook.com/profile.php?id=${info.id}`),
    `---------------------------`,
  ].filter(Boolean).join("\n");
}

module.exports = {
  config: {
    name:             "spy",
    version:          "3.1.0",
    author:           "SIFAT",
    countDown:        10,
    role:             0,
    shortDescription: { en: "Facebook profile spy card" },
    longDescription:  { en: "Generates a beautiful profile card with avatar, cover, bio, location, education, work, followers and more." },
    category:         "utility",
    guide:            { en: "{pn} <uid>\n{pn} @tag\n{pn} (reply to msg)\n{pn} (your own profile)" },
  },

  onStart: async function ({ api, event, args, message }) {
    const { threadID, messageID, mentions, senderID } = event;

    let targetID = args[0]?.replace(/\D/g, "") || null;

    if (!targetID && mentions && Object.keys(mentions).length > 0)
      targetID = Object.keys(mentions)[0];

    if (!targetID && event.messageReply?.senderID)
      targetID = event.messageReply.senderID;

    if (!targetID) targetID = senderID;

    targetID = String(targetID).trim();

    if (!/^\d{5,20}$/.test(targetID))
      return message.reply("Invalid ID. Use: .spy <uid> | @tag | reply to msg");

    await message.reply("Fetching profile...");

    try {
      const infoMap = await api.getUserInfo(targetID);
      const info    = infoMap?.[targetID];

      if (!info || !info.id)
        return message.reply("User not found.");

      if (!canvasLib) return message.reply(buildText(info));

      const buffer  = await buildCard(info);
      const tmpPath = path.join(
        global.tmpDir || process.cwd(),
        `spy_${targetID}_${Date.now()}.png`
      );

      fs.writeFileSync(tmpPath, buffer);

      await api.sendMessage(
        { body: "", attachment: fs.createReadStream(tmpPath) },
        threadID,
        () => { try { fs.unlinkSync(tmpPath); } catch {} },
        messageID
      );

    } catch (err) {
      console.error("[spy]", err);
      message.reply("Error: " + (err.message || String(err)));
    }
  },
};
