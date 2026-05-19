// SLA Tracker 시트에서 zone의 Weekly/Daily 등급 가져오기
// 서버 전용

const SLA_SHEET_ID = "1dGcKoEnVRFmpUqaDIN8DgKkR_TYKLijIJ6BKZy84IBQ";
const SLA_SHEET_NAME = "SLA Tracker";

async function fetchSlaSheet(accessToken) {
  const range = encodeURIComponent(`${SLA_SHEET_NAME}!A1:AZ300`);
  const resp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SLA_SHEET_ID}/values/${range}`,
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

/**
 * Zone의 SLA 등급 가져오기
 * 반환:
 *   weekly: { thisWeek: {label, grade}, lastWeek: {...}, twoWeeksAgo: {...} } | null
 *   daily: { "2026-05-18": "B", ... } | null
 */
export async function getSlaGrades(zone) {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) return { weekly: null, daily: null };

    const rows = await fetchSlaSheet(accessToken);
    if (!rows.length) return { weekly: null, daily: null };

    // 헤더 row 찾기 ("W숫자" 셀 3개 이상 있는 row)
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
      if (wCells.length >= 3) {
        // 주차 숫자 내림차순 → 가장 큰 게 이번주
        wCells.sort((a, b) => b.week - a.week);
        weeklyColIdxs = wCells.slice(0, 3).map(c => ({ idx: c.idx, label: `W${c.week}` }));
        headerIdx = i;
        break;
      }
    }

    if (headerIdx < 0) return { weekly: null, daily: null };

    // Daily 등급 컬럼 찾기 (Q열 이후 "MM/DD" 형식)
    const dailyCols = [];
    const header = rows[headerIdx];
    const currentYear = new Date().getFullYear();
    const startDailyCol = Math.max(...weeklyColIdxs.map(c => c.idx)) + 1;
    for (let c = startDailyCol; c < header.length; c++) {
      const txt = String(header[c] || "").trim();
      const m = txt.match(/(\d{1,2})\/(\d{1,2})/);
      if (m) {
        const month = m[1].padStart(2, "0");
        const day = m[2].padStart(2, "0");
        const dateISO = `${currentYear}-${month}-${day}`;
        dailyCols.push({ idx: c, date: dateISO });
      }
    }

    // Zone row 찾기 (E열 = index 4)
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

    if (!zoneRow) return { weekly: null, daily: null };

    // Weekly 등급
    const weekly = {
      thisWeek: {
        label: weeklyColIdxs[0].label,
        grade: normalizeGrade(zoneRow[weeklyColIdxs[0].idx]),
      },
      lastWeek: {
        label: weeklyColIdxs[1].label,
        grade: normalizeGrade(zoneRow[weeklyColIdxs[1].idx]),
      },
      twoWeeksAgo: {
        label: weeklyColIdxs[2].label,
        grade: normalizeGrade(zoneRow[weeklyColIdxs[2].idx]),
      },
    };

    // Daily 등급
    const daily = {};
    dailyCols.forEach(({ idx, date }) => {
      const g = normalizeGrade(zoneRow[idx]);
      if (g) daily[date] = g;
    });

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
