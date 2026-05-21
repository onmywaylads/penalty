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

    // 헤더 row 찾기 - "W21" 또는 "W숫자" 패턴이 있는 행
    // 시트 구조: 8행에 "W21", "W20", "W19" + "05/20 (수)" 등 날짜 헤더
    let headerIdx = -1;
    let weeklyColIdxs = []; // [{idx, label}] 최신 3주

    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const row = rows[i] || [];
      const wCells = [];
      row.forEach((cell, idx) => {
        const txt = String(cell || "").trim();
        // "W21 (월~수)" 또는 "W21" 형식 매칭
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

    if (headerIdx < 0) return { weekly: null, daily: null };

    // Daily 등급 컬럼 찾기 - 같은 헤더 row에서 "MM/DD" 형식 찾기
    const dailyCols = [];
    const header = rows[headerIdx];
    const currentYear = new Date().getFullYear();

    // Weekly 컬럼 중 가장 오른쪽 idx 이후부터 날짜 찾기
    const lastWeeklyIdx = Math.max(...weeklyColIdxs.map(c => c.idx));

    for (let c = lastWeeklyIdx + 1; c < header.length; c++) {
      const txt = String(header[c] || "").trim();
      // "05/20 (수)" 또는 "05/20" 형식
      const m = txt.match(/^(\d{1,2})\/(\d{1,2})/);
      if (m) {
        const month = m[1].padStart(2, "0");
        const day = m[2].padStart(2, "0");
        const dateISO = `${currentYear}-${month}-${day}`;
        dailyCols.push({ idx: c, date: dateISO });
      }
    }

    // Zone row 찾기 (E열 = index 4, "구분 3" = Zone 이름)
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
      console.error(`SLA: zone "${zone}" not found in sheet`);
      return { weekly: null, daily: null };
    }

    // Weekly 등급 (W21=이번주, W20=지난주, W19=2주전)
    const weekly = {
      thisWeek: {
        label: weeklyColIdxs[0]?.label || "W-",
        grade: normalizeGrade(zoneRow[weeklyColIdxs[0]?.idx]),
      },
      lastWeek: {
        label: weeklyColIdxs[1]?.label || "W-",
        grade: normalizeGrade(zoneRow[weeklyColIdxs[1]?.idx]),
      },
      twoWeeksAgo: {
        label: weeklyColIdxs[2]?.label || "W-",
        grade: normalizeGrade(zoneRow[weeklyColIdxs[2]?.idx]),
      },
    };

    // Daily 등급
    const daily = {};
    dailyCols.forEach(({ idx, date }) => {
      const g = normalizeGrade(zoneRow[idx]);
      if (g) daily[date] = g;
    });

    console.log(`SLA zones found - weekly: ${JSON.stringify(weekly)}, daily dates: ${Object.keys(daily).join(", ")}`);

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
