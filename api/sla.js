const SLA_SHEET_ID = "1dGcKoEnVRFmpUqaDIN8DgKkR_TYKLijIJ6BKZy84IBQ";
const SLA_SHEET_NAME = "SLA Tracker";

async function fetchSlaSheet(accessToken) {
  // unmerged values 가져오기 위해 FORMATTED_VALUE 사용
  const range = encodeURIComponent(`${SLA_SHEET_NAME}!A1:BZ300`);
  const resp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SLA_SHEET_ID}/values/${range}?valueRenderOption=FORMATTED_VALUE`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await resp.json();
  return data.values || [];
}

async function getAccessToken() {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

export async function getSlaGrades(zone) {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) return { weekly: null, daily: null };

    const rows = await fetchSlaSheet(accessToken);
    if (!rows.length) return { weekly: null, daily: null };

    // 헤더 row 찾기 (W숫자 패턴 2개 이상)
    let headerIdx = -1;
    let weeklyColIdxs = [];

    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const row = rows[i] || [];
      const wCells = [];
      row.forEach((cell, idx) => {
        const txt = String(cell || "").trim();
        const m = txt.match(/^W(\d+)/);
        if (m) wCells.push({ idx, week: parseInt(m[1]), text: txt });
      });
      if (wCells.length >= 2) {
        wCells.sort((a, b) => b.week - a.week);
        weeklyColIdxs = wCells.slice(0, 3).map(c => ({ idx: c.idx, label: `W${c.week}` }));
        headerIdx = i;
        break;
      }
    }

    if (headerIdx < 0) {
      console.error("SLA: headerIdx not found");
      return { weekly: null, daily: null };
    }

    // zone row 찾기
    const ZONE_COL = 4;
    let zoneRow = null;
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const z = String(row[ZONE_COL] || "").trim();
      if (z === zone) {
        zoneRow = row;
        break;
      }
    }

    if (!zoneRow) {
      console.error(`SLA: zone "${zone}" not found`);
      return { weekly: null, daily: null };
    }

    // Weekly 등급
    const weekly = {
      thisWeek: { label: weeklyColIdxs[0]?.label || "W-", grade: normalizeGrade(zoneRow[weeklyColIdxs[0]?.idx]) },
      lastWeek: { label: weeklyColIdxs[1]?.label || "W-", grade: normalizeGrade(zoneRow[weeklyColIdxs[1]?.idx]) },
      twoWeeksAgo: { label: weeklyColIdxs[2]?.label || "W-", grade: normalizeGrade(zoneRow[weeklyColIdxs[2]?.idx]) },
    };

    // Daily 등급 - 헤더 파싱 대신 R열(idx 17)부터 오늘 기준 역순으로 날짜 매핑
    // SLA 시트: R열부터 최근 21일치, 최신순(왼쪽이 오늘/최근)
    const daily = {};
    const lastWeeklyIdx = Math.max(...weeklyColIdxs.map(c => c.idx));
    // 서비스퀄리티 컬럼 1개 스킵 후 Daily 시작
    const dailyStartCol = lastWeeklyIdx + 2;

    // 오늘 기준으로 역순 날짜 생성 (최대 21일)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let dayOffset = 0;
    for (let c = dailyStartCol; c < Math.min(dailyStartCol + 21, zoneRow.length); c++) {
      const g = normalizeGrade(zoneRow[c]);
      if (g) {
        const d = new Date(today);
        d.setDate(today.getDate() - dayOffset);
        const dateISO = fmtDate(d);
        daily[dateISO] = g;
      }
      dayOffset++;
    }

    console.log("SLA weekly:", JSON.stringify(weekly));
    console.log("SLA daily:", JSON.stringify(daily));
    console.log("SLA zoneRow[dailyStartCol~+5]:", JSON.stringify(zoneRow.slice(dailyStartCol, dailyStartCol + 5)));

    return { weekly, daily };
  } catch (e) {
    console.error("SLA 시트 조회 실패:", e.message);
    return { weekly: null, daily: null };
  }
}

function normalizeGrade(v) {
  const g = String(v || "").trim().toUpperCase();
  if (["A", "B", "C", "D", "E", "F"].includes(g)) return g;
  return null;
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
