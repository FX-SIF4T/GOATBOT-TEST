const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

const GITHUB_RAW = "https://raw.githubusercontent.com/FX-SIF4T/API-STORE/refs/heads/main/FXS_APIS/apis.json";
const TMP_DIR = path.join(__dirname, "cache");

function numberText(val) {
  try {
    const num = parseInt(val);
    return isNaN(num) ? "0" : num.toLocaleString();
  } catch (_) {
    return "0";
  }
}

function timeStamp(t) {
  if (!t || t == 0) return "N/A";
  try {
    const date = new Date(parseInt(t) * 1000);
    return date.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" });
  } catch (_) {
    return "N/A";
  }
}

function rankName(r) {
  const num = parseInt(r) || 0;
  if (num >= 600) return "Grandmaster";
  if (num >= 400) return "Heroic";
  if (num >= 300) return "Master";
  if (num >= 200) return "Diamond";
  if (num >= 100) return "Gold";
  if (num >= 50) return "Silver";
  return "Bronze";
}

function cleanBio(bio) {
  if (!bio) return "None";
  return String(bio).replace(/\[.*?\]/g, "").replace(/\n/g, " ").trim() || "None";
}

function cleanField(val, prefixRegex) {
  if (val === undefined || val === null) return "N/A";
  return String(val).replace(prefixRegex, "").trim() || "N/A";
}

async function fetchItemImage(itemId, ffItemApi) {
  try {
    // URL structured based on API requirement
    const url = ffItemApi.includes("?") 
      ? `${ffItemApi}&id=${itemId}` 
      : `${ffItemApi}/icons?id=${itemId}`;

    const res = await axios.get(url, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
      },
      timeout: 5000
    });

    return await loadImage(Buffer.from(res.data));
  } catch (err) {
    return null;
  }
}

async function makeItemCard(items, uid, ffItemApi) {
  const columns = 4;
  const tileW = 220;
  const tileH = 244;
  const gap = 22;
  const sidePad = 34;
  const topPad = 34;
  const footerH = 82;

  const totalItems = items.length > 0 ? items.length : 1;
  const rows = Math.max(1, Math.ceil(totalItems / columns));
  const width = sidePad * 2 + columns * tileW + (columns - 1) * gap;
  const height = topPad + rows * tileH + (rows - 1) * gap + footerH + 24;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, "#07091b");
  bgGrad.addColorStop(1, "#0f1233");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#121735";
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 28) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  }
  for (let y = 0; y < height; y += 28) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }

  ctx.strokeStyle = "#5369d8";
  ctx.lineWidth = 3;
  ctx.strokeRect(12, 12, width - 24, height - 24);

  ctx.strokeStyle = "#252b68";
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, width - 40, height - 40);

  ctx.strokeStyle = "#24e6ff";
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(52, 52); ctx.lineTo(245, 52); ctx.stroke();

  ctx.strokeStyle = "#ed32dc";
  ctx.beginPath(); ctx.moveTo(width - 245, 52); ctx.lineTo(width - 52, 52); ctx.stroke();

  for (let index = 0; index < items.length; index++) {
    const itemId = items[index];
    const row = Math.floor(index / columns);
    const col = index % columns;

    const x = sidePad + col * (tileW + gap);
    const y = topPad + 28 + row * (tileH + gap);
    const accent = index % 2 === 0 ? "#23ddff" : "#ef36da";

    ctx.fillStyle = "#171332";
    ctx.fillRect(x, y, tileW, tileH);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, tileW, tileH);

    const imageBox = [x + 16, y + 16, tileW - 32, tileH - 32];
    ctx.fillStyle = "#090b20";
    ctx.fillRect(imageBox[0], imageBox[1], imageBox[2], imageBox[3]);
    ctx.strokeStyle = "#252a5b";
    ctx.lineWidth = 2;
    ctx.strokeRect(imageBox[0], imageBox[1], imageBox[2], imageBox[3]);

    const itemImg = await fetchItemImage(itemId, ffItemApi);

    if (itemImg) {
      const maxW = imageBox[2] - 18;
      const maxH = imageBox[3] - 18;
      let drawW = itemImg.width;
      let drawH = itemImg.height;

      const scale = Math.min(maxW / drawW, maxH / drawH);
      drawW *= scale;
      drawH *= scale;

      const px = imageBox[0] + (imageBox[2] - drawW) / 2;
      const py = imageBox[1] + (imageBox[3] - drawH) / 2;

      ctx.drawImage(itemImg, px, py, drawW, drawH);
    } else {
      ctx.strokeStyle = "#34386c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + tileW / 2, y + tileH / 2, 12, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.fillStyle = "#d8e0ff";
  ctx.font = "bold 18px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("FX SIFAT", width / 2, height - 36);

  await fs.ensureDir(TMP_DIR);
  const filePath = path.join(TMP_DIR, `ffcard_${uid}_${Date.now()}.png`);
  const buffer = canvas.toBuffer("image/png");
  await fs.writeFile(filePath, buffer);

  return filePath;
}

module.exports = {
  config: {
    name: "ffinfo",
    aliases: ["ff", "info", "freefire"],
    version: "3.5.0",
    author: "FX SIFAT",
    role: 0,
    countDown: 5,
    shortDescription: "Get Free Fire player details & dynamic item card",
    longDescription: "Get full Free Fire player info with card generated from API endpoint.",
    category: "game",
    guide: { en: "{pn} <UID>" }
  },

  onStart: async function({ api, event, args, message }) {
    const uid = args[0]?.trim();
    if (!uid || isNaN(uid)) {
      return message.reply("❌ Please provide a valid Free Fire UID!\nUsage: /ffinfo <UID>");
    }

    let cardPath = null;

    try {
      const rawRes = await axios.get(GITHUB_RAW);
      const ffInfoApi = rawRes.data.ffinfo_api;
      const ffItemApi = rawRes.data.ffitem_api;

      if (!ffInfoApi) {
        throw new Error("ffinfo_api not found in raw json!");
      }

      const infoRes = await axios.get(`${ffInfoApi}/player-info?uid=${uid}`);
      const data = infoRes.data;

      const b = data.basicInfo || data.basic_info || {};
      if (!b || !b.nickname) {
        throw new Error("Player not found on live server!");
      }

      const pr = data.profileInfo || {};
      const cl = data.clanBasicInfo || {};
      const pet = data.petInfo || {};
      const soc = data.socialInfo || {};
      const crd = data.creditScoreInfo || {};
      const dia = data.diamondCostRes || {};
      const cap = data.captainBasicInfo || {};

      const nick = b.nickname || "N/A";
      const region = b.region || "N/A";
      const level = b.level || "N/A";
      const exp = b.exp || 0;
      const likes = b.liked || 0;
      const version = b.releaseVersion || "N/A";
      const created = timeStamp(b.createAt);
      const lastLg = timeStamp(b.lastLoginAt);
      const r = b.rank || 0;
      const rPts = b.rankingPoints || 0;
      const maxR = b.maxRank || 0;
      const csR = b.csRank || 0;
      const csMax = b.csMaxRank || 0;

      const isStar = pr.isMarkedStar ? "YES" : "NO";
      const weapon = pr.pvePrimaryWeapon || "N/A";
      const gameBag = b.gameBagShow || "N/A";
      const skillsStr = (pr.equipedSkills || []).join(", ") || "None";

      const clanName = cl.clanName || "No Guild";
      const clanId = cl.clanId || "N/A";
      const clanLvl = cl.clanLevel || "N/A";
      const clanMem = `${cl.memberNum || "?"}/${cl.capacity || "?"}`;
      const capId = cl.captainId || cap.accountId || "N/A";
      const capNick = cap.nickname || "N/A";

      const petId = pet.id || "N/A";
      const petLvl = pet.level || "N/A";
      const petExp = pet.exp || "N/A";
      const petSkin = pet.skinId || "N/A";
      const petSkill = pet.selectedSkillId || "N/A";
      const petSel = pet.isSelected ? "YES" : "NO";

      const sig = cleanBio(soc.signature);
      const lang = cleanField(soc.language, /^LANGUAGE_/i);
      const tActive = cleanField(soc.timeActive, /^TimeActive_/i);
      const rShow = cleanField(soc.rankShow, /^RankShow_/i);
      const credit = crd.creditScore || "N/A";
      const diamonds = dia.diamondCost || "N/A";
      const periodE = timeStamp(crd.periodicSummaryEndTime);

      const itemsList = [];
      if (b.headPic) itemsList.push(b.headPic);
      if (b.bannerId) itemsList.push(b.bannerId);
      if (Array.isArray(pr.clothes)) itemsList.push(...pr.clothes);
      if (Array.isArray(b.weaponSkinShows)) itemsList.push(...b.weaponSkinShows);
      if (pet.id) itemsList.push(pet.id);
      if (pet.skinId) itemsList.push(pet.skinId);

      if (itemsList.length > 0 && ffItemApi) {
        cardPath = await makeItemCard(itemsList, uid, ffItemApi);
      }

      const infoText = 
`◆ 𝗕𝗔𝗦𝗜𝗖 𝗜𝗡𝗙𝗢
┃ 𝗡𝗮𝗺𝗲       » ${nick}
┃ 𝗨𝗜𝗗        » ${uid}
┃ 𝗥𝗲𝗴𝗶𝗼𝗻     » ${region}
┃ 𝗟𝗲𝘃𝗲𝗹      » ${level}  |  EXP ${numberText(exp)}
┃ 𝗟𝗶𝗸𝗲𝘀      » ${likes}
┃ 𝗕𝗮𝗱𝗴𝗲      » ${b.badgeId || "0"}
┃ 𝗧𝗶𝘁𝗹𝗲      » ${b.title || "N/A"}
└ 𝗦𝗲𝗮𝘀𝗼𝗻     » ${b.seasonId || "N/A"}  |  ${version}

◆ 𝗥𝗔𝗡𝗞 𝗜𝗡𝗙𝗢
┃ ◆ 𝗕𝗥 𝗥𝗮𝗻𝗸   » ${rankName(r)} (${r})  |  Pts ${rPts}
┃ ◆ 𝗖𝗦 𝗥𝗮𝗻𝗸   » ${rankName(csR)} (${csR})  |  Pts ${numberText(b.csRankingPoints || 0)}
┃ 𝗠𝗮𝘅 𝗕𝗥     » ${rankName(maxR)} (${maxR})
└ 𝗠𝗮𝘅 𝗖𝗦     » ${rankName(csMax)} (${csMax})

◆ 𝗣𝗥𝗢𝗙𝗜𝗟𝗘
┃ 𝗠𝗮𝗿𝗸𝗲𝗱 𝗦𝘁𝗮𝗿 » ${isStar}
┃ 𝗣𝗩𝗘 𝗪𝗲𝗮𝗽𝗼𝗻 » ${weapon}
┃ 𝗚𝗮𝗺𝗲 𝗕𝗮𝗴    » ${gameBag}
└ 𝗦𝗸𝗶𝗹𝗹𝘀      » ${skillsStr}

◆ 𝗚𝗨𝗜𝗟𝗗
┃ 𝗡𝗮𝗺𝗲       » ${clanName}
┃ 𝗜𝗗         » ${clanId}
┃ 𝗖𝗮𝗽𝘁𝗮𝗶𝗻    » ${capNick} (${capId})
┃ 𝗟𝗲𝘃𝗲𝗹      » ${clanLvl}
└ 𝗠𝗲𝗺𝗯𝗲𝗿𝘀    » ${clanMem}

◆ 𝗣𝗘𝗧
┃ 𝗜𝗗         » ${petId}  |  Level ${petLvl}  |  EXP ${petExp}
┃ 𝗦𝗸𝗶𝗻       » ${petSkin}  |  Skill ${petSkill}
└ 𝗦𝗲𝗹𝗲𝗰𝘁𝗲𝗱   » ${petSel}

◆ 𝗦𝗢𝗖𝗜𝗔𝗟
┃ 𝗕𝗶𝗼        » ${sig}
┃ 𝗟𝗮𝗻𝗴𝘂𝗮𝗴𝗲   » ${lang}
┃ 𝗔𝗰𝘁𝗶𝘃𝗲     » ${tActive}
└ 𝗥𝗮𝗻𝗸 𝗦𝗵𝗼𝘄 » ${rShow}

◆ 𝗦𝗖𝗢𝗥𝗘
┃ 𝗖𝗿𝗲𝗱𝗶𝘁    » ${credit}
┃ 𝗗𝗶𝗮𝗺𝗼𝗻𝗱 𝗖𝗼𝘀𝘁 » ${diamonds}
┃ 𝗦𝘂𝗺𝗺𝗮𝗿𝘆 𝗘𝗻𝗱 » ${periodE}
┃ 𝗖𝗿𝗲𝗮𝘁𝗲𝗱    » ${created}
└ 𝗟𝗮𝘀𝘁 𝗟𝗼𝗴𝗶𝗻 » ${lastLg}`;

      const msgPayload = { body: infoText };

      if (cardPath && fs.existsSync(cardPath)) {
        msgPayload.attachment = fs.createReadStream(cardPath);
      }

      return api.sendMessage(
        msgPayload,
        event.threadID,
        () => {
          if (cardPath && fs.existsSync(cardPath)) {
            try { fs.unlinkSync(cardPath); } catch (_) {}
          }
        },
        event.messageID
      );

    } catch (e) {
      if (cardPath && fs.existsSync(cardPath)) {
        try { fs.unlinkSync(cardPath); } catch (_) {}
      }
      return message.reply(`❌ Failed to fetch info: ${e.message}`);
    }
  }
};
