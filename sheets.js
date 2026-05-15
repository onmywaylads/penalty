export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const SPREADSHEET_ID = "1c_43XVjrufy0cEoOA5eBlx49h6u4RoYjm-g02iOztCQ";
  const ZONE = req.query.zone || "파주"; // 기본값 파주

  try {
    // 1. access_token 발급
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
    if (!tokenData.access_token) {
      return res.status(500).json({ error: "토큰 발급 실패" });
    }
    const accessToken = tokenData.access_token;

    const fetchSheet = async (sheetName, range) => {
      const r = encodeURIComponent(`${sheetName}!${range}`);
      const resp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${r}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data = await resp.json();
      return data.values || [];
    };

    // ── 시트1: 바로고 운영 대시보드 ──────────────────────────────
    const dashRows = await fetchSheet("바로고 운영 대시보드", "A1:Z300");

    // 헤더 row 찾기 (도시/존 컬럼)
    let dashHeaderIdx = -1;
    for (let i = 0; i < Math.min(dashRows.length, 20); i++) {
      const r = dashRows[i] || [];
      if ((r[0] === "도시" || r[0] === "city") && (r[1] === "존" || r[1] === "zone" || r[1] === "zone_nm")) {
        dashHeaderIdx = i;
        break;
      }
    }

    let realtime = null;
    if (dashHeaderIdx >= 0) {
      const headers = dashRows[dashHeaderIdx];
      // 컬럼 인덱스 찾기
      const cityIdx = headers.findIndex(h => h === "도시" || h === "city");
      const zoneIdx = headers.findIndex(h => h === "존" || h === "zone" || h === "zone_nm");
      const demandIdx = headers.findIndex(h => h === "Demand" || h === "demand");
      const completeIdx = headers.findIndex(h => h === "완료주문" || h === "성공 주문");
      const cancelIdx = headers.findIndex(h => h === "취소주문" || h === "실패 주문");
      const inProgressIdx = headers.findIndex(h => h === "진행중" || h === "진행 주문");
      const waitIdx = headers.findIndex(h => h === "미배차");
      const riderIdx = headers.findIndex(h => h === "실간 라이더" || h === "실시간 라이더");

      for (let i = dashHeaderIdx + 1; i < dashRows.length; i++) {
        const row = dashRows[i];
        if (!row) continue;
        const zone = String(row[zoneIdx] || "").trim();
        if (zone === ZONE) {
          realtime = {
            city: String(row[cityIdx] || "").trim(),
            zone,
            demand: parseInt(String(row[demandIdx] || "0").replace(/[^0-9]/g, "")) || 0,
            complete: parseInt(String(row[completeIdx] || "0").replace(/[^0-9]/g, "")) || 0,
            cancel: parseInt(String(row[cancelIdx] || "0").replace(/[^0-9]/g, "")) || 0,
            inProgress: parseInt(String(row[inProgressIdx] || "0").replace(/[^0-9]/g, "")) || 0,
            waiting: parseInt(String(row[waitIdx] || "0").replace(/[^0-9]/g, "")) || 0,
            riders: parseInt(String(row[riderIdx] || "0").replace(/[^0-9]/g, "")) || 0,
          };
          break;
        }
      }
    }

    // ── 시트2: 일별 FRO ──────────────────────────────────────────
    const froRows = await fetchSheet("일별 FRO", "A1:DZ300");

    let colRowIdx = -1;
    for (let i = 0; i < Math.min(froRows.length, 5); i++) {
      const row = froRows[i] || [];
      if (row[0] === "city_nm" && row[1] === "zone_nm") {
        colRowIdx = i;
        break;
      }
    }

    let daily = [];
    if (colRowIdx >= 0) {
      const dateRow = froRows[colRowIdx - 1] || [];
      const currentYear = new Date().getFullYear();
      const dateGroups = [];

      for (let i = 3; i < dateRow.length; i += 5) {
        const rawDate = String(dateRow[i] ?? "").trim();
        if (!rawDate) continue;
        let dateISO = null;
        const kMatch = rawDate.match(/(\d{1,2})월\s*(\d{1,2})일/);
        if (kMatch) {
          dateISO = `${currentYear}-${kMatch[1].padStart(2,"0")}-${kMatch[2].padStart(2,"0")}`;
        }
        if (!dateISO) {
          const sMatch = rawDate.match(/^(\d{5})/);
          if (sMatch) {
            const serial = parseInt(sMatch[1]);
            if (serial > 40000 && serial < 60000) {
              const ms = (serial - 25569) * 86400 * 1000;
              const d = new Date(ms);
              dateISO = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
            }
          }
        }
        if (!dateISO) {
          const iMatch = rawDate.match(/(\d{4})-(\d{2})-(\d{2})/);
          if (iMatch) dateISO = `${iMatch[1]}-${iMatch[2]}-${iMatch[3]}`;
        }
        if (dateISO) dateGroups.push({ date: dateISO, demandIdx: i, froIdx: i+1, froRateIdx: i+2, cancelIdx: i+3 });
      }

      for (let r = colRowIdx + 1; r < froRows.length; r++) {
        const row = froRows[r];
        if (!row) continue;
        const zoneNm = String(row[1] ?? "").trim();
        if (zoneNm !== ZONE) continue;
        if (zoneNm === "합계") continue;

        for (const g of dateGroups) {
          const demand = Number(String(row[g.demandIdx] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
          const fro = Number(String(row[g.froIdx] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
          const froRateStr = String(row[g.froRateIdx] ?? "0%").replace("%", "").trim();
          const froRate = parseFloat(froRateStr) || 0;
          const cancel = Number(String(row[g.cancelIdx] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
          daily.push({ date: g.date, demand, fro, fro_rate: froRate, cancel });
        }
      }
      // 날짜 오름차순 정렬
      daily.sort((a, b) => a.date.localeCompare(b.date));
    }

    return res.status(200).json({ zone: ZONE, realtime, daily });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
