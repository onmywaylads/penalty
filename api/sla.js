// SLA Tracker 시트에서 zone의 Weekly/Daily 등급 가져오기
// 서버 전용 - 클라이언트로 단가 등 노출되지 않음

const SLA_SHEET_ID = "1dGcKoEnVRFmpUqaDIN8DgKkR_TYKLijIJ6BKZy84IBQ";
const SLA_SHEET_NAME = "SLA Tracker";

// 시트 fetch (Google Sheets API)
async function fetchSlaSheet(accessToken) {
  const range = encodeURIComponent(`${SLA_SHEET_NAME}!A1:AZ300`);
  const resp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SLA_SHEET_ID}/values/${range}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await resp.json();
  return data.values || [];
}

// access_token 발급
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
 * Zone의 SLA 등급 정보 가져오기
 * @returns {
 *   weekly: { thisWeek: "A", lastWeek: "B", twoWeeksAgo: "C" } | null
 *   daily: { "2026-05-18": "E", "2026-05-17": "F", ... } | null
 * }
 */
export async function getSlaGrades(zone) {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) return { weekly: null, daily: null };

    const rows = await fetchSlaSheet(accessToken);
    if (!rows.length) return { weekly: null, daily: null };

    // 헤더 row 찾기 (보통 row 7 = index 6, "W"로 시작하는 셀 3개 있는 row)
    let headerIdx = -1;
    let weeklyColIdxs = []; // [thisWeek, lastWeek, twoWeeksAgo] 컬럼 인덱스
    let dailyCols = []; // [{idx, date(ISO)}, ...]

    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const row = rows[i] || [];
      // "W21", "W20" 같은 셀 찾기
      const wCells = [];
      row.forEach((cell, idx) => {
        const txt = String(cell || "").trim();
        const m = txt.match(/^W(\d+)/);
        if (m) wCells.push({ idx, week: parseInt(m[1]) });
      });
      if (wCells.length >= 3) {
        // 주차 숫자 내림차순 정렬 → 가장 큰 게 이번주
        wCells.sort((a, b) => b.week - a.week);
        weeklyColIdxs = [wCells[0].idx, wCells[1].idx, wCells[2].idx];
        headerIdx = i;
        break;
      }
    }

    // Daily 등급 컬럼 찾기 (Q열 이후 "MM/DD (요일)" 형식)
    if (headerIdx >= 0) {
      const header = rows[headerIdx] || [];
      const currentYear = new Date().getFullYear();
      // weekly 컬럼 다음부터 검사
      const startDailyCol = Math.max(...weeklyColIdxs) + 1;
      for (let c = startDailyCol; c < header.length; c++) {
        const txt = String(header[c] || "").trim();
        // "05/18 (월)" 형식 매칭
        const m = txt.match(/(\d{1,2})\/(\d{1,2})/);
        if (m) {
          const month = m[1].padStart(2, "0");
          const day = m[2].padStart(2, "0");
          const dateISO = `${currentYear}-${month}-${day}`;
          dailyCols.push({ idx: c, date: dateISO });
        }
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

    // Weekly 등급 추출
    const weekly = weeklyColIdxs.length === 3 ? {
      thisWeek: normalizeGrade(zoneRow[weeklyColIdxs[0]]),
      lastWeek: normalizeGrade(zoneRow[weeklyColIdxs[1]]),
      twoWeeksAgo: normalizeGrade(zoneRow[weeklyColIdxs[2]]),
    } : null;

    // Daily 등급 추출 (date -> grade map)
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
