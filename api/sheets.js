import { verify, getAccountByUsername, GRADE_PRICES } from "./auth.js";
import { getSlaGrades } from "./sla.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  // ── 토큰 검증 ──────────────────────────────────────────────
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const payload = verify(token);
  if (!payload) return res.status(401).json({ error: "인증이 필요해요" });
  const account = getAccountByUsername(payload.u);
  if (!account) return res.status(401).json({ error: "유효하지 않은 계정" });

  const ZONE = account.zone;
  const SPREADSHEET_ID = "1c_43XVjrufy0cEoOA5eBlx49h6u4RoYjm-g02iOztCQ";

  try {
    // access_token 발급
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
    if (!tokenData.access_token) return res.status(500).json({ error: "토큰 발급 실패" });
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

    // ── 실시간 현황 ───────────────────────────────────────────
    const dashRows = await fetchSheet("바로고 운영 대시보드", "A1:Z300");
    let dashHeaderIdx = -1;
    for (let i = 0; i < Math.min(dashRows.length, 20); i++) {
      const r = dashRows[i] || [];
      const cityCol = r.findIndex(h => h === "도시" || h === "city");
      const zoneCol = r.findIndex(h => h === "존" || h === "zone" || h === "zone_nm");
      if (cityCol >= 0 && zoneCol >= 0) { dashHeaderIdx = i; break; }
    }
    let realtime = null;
    if (dashHeaderIdx >= 0) {
      const headers = dashRows[dashHeaderIdx];
      const cityIdx = headers.findIndex(h => h === "도시" || h === "city");
      const zoneIdx = headers.findIndex(h => h === "존" || h === "zone" || h === "zone_nm");
      const demandIdx = headers.findIndex(h => h === "Demand" || h === "demand");
      const completeIdx = headers.findIndex(h => h === "완료주문" || h === "성공 주문");
      const cancelIdx = headers.findIndex(h => h === "취소주문" || h === "실패 주문");
      const inProgressIdx = headers.findIndex(h => h === "진행중" || h === "진행 주문");
      const waitIdx = headers.findIndex(h => h === "미배차");
      const delayCancelIdx = headers.findIndex(h => h === "배차지연 취소" || h === "배차지연취소");
      const delayCancelRateIdx = headers.findIndex(h => h === "배차지연 취소율" || h === "배차지연취소율");

      for (let i = dashHeaderIdx + 1; i < dashRows.length; i++) {
        const row = dashRows[i];
        if (!row) continue;
        const zone = String(row[zoneIdx] || "").trim();
        if (zone === ZONE) {
          const delayCancelRateStr = String(row[delayCancelRateIdx] || "0%").replace("%", "").trim();
          realtime = {
            city: String(row[cityIdx] || "").trim(),
            zone,
            demand: parseInt(String(row[demandIdx] || "0").replace(/[^0-9]/g, "")) || 0,
            complete: parseInt(String(row[completeIdx] || "0").replace(/[^0-9]/g, "")) || 0,
            cancel: parseInt(String(row[cancelIdx] || "0").replace(/[^0-9]/g, "")) || 0,
            inProgress: parseInt(String(row[inProgressIdx] || "0").replace(/[^0-9]/g, "")) || 0,
            waiting: parseInt(String(row[waitIdx] || "0").replace(/[^0-9]/g, "")) || 0,
            delayCancel: parseInt(String(row[delayCancelIdx] || "0").replace(/[^0-9]/g, "")) || 0,
            delayCancelRate: parseFloat(delayCancelRateStr) || 0,
          };
          break;
        }
      }
    }

    // ── 일별 FRO ────────────────────────────────────────────
    const froRows = await fetchSheet("일별 FRO", "A1:DZ300");
    let colRowIdx = -1;
    for (let i = 0; i < Math.min(froRows.length, 5); i++) {
      const row = froRows[i] || [];
      if (row[0] === "city_nm" && row[1] === "zone_nm") { colRowIdx = i; break; }
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
        if (kMatch) dateISO = `${currentYear}-${kMatch[1].padStart(2,"0")}-${kMatch[2].padStart(2,"0")}`;
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
        if (dateISO) dateGroups.push({ date: dateISO, demandIdx: i, froIdx: i+1, froRateIdx: i+2, delayIdx: i+3, delayRateIdx: i+4 });
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
          const delay = Number(String(row[g.delayIdx] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
          const delayRateStr = String(row[g.delayRateIdx] ?? "0%").replace("%", "").trim();
          const delayRate = parseFloat(delayRateStr) || 0;
          daily.push({ date: g.date, demand, fro, fro_rate: froRate, delay, delay_rate: delayRate });
        }
      }
      daily.sort((a, b) => a.date.localeCompare(b.date));
    }

    const startDate = account.startDate || "2000-01-01";
    const filteredDaily = daily.filter(d => d.date >= startDate);

    // ── 정산 ─────────────────────────────────────────────────
    let billing = null;
    let sla = null;
    let dailyWithGrade = filteredDaily;

    if (account.type === "fixed") {
      // 파주: 고정 관리비
      const totalFro = filteredDaily.reduce((s, d) => s + (d.fro || 0), 0);
      const penalty = totalFro * 30000 * 0.3;
      const expected = account.fee - penalty;
      billing = { type: "fixed", baseFee: account.fee, totalFro, penalty, expected };
    } else if (account.type === "weekly") {
      // 남동 등: 건당 관리비
      sla = await getSlaGrades(ZONE);
      const weeklyGrades = sla?.weekly || null;
      const dailyGrades = sla?.daily || {};

      // 일별에 Daily 등급 매핑
      dailyWithGrade = filteredDaily.map(d => ({ ...d, grade: dailyGrades[d.date] || null }));

      // 이번주 / 지난주 구간 (월~일)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const thisWeekStart = mondayOf(today);
      const thisWeekEnd = sundayOf(today);
      const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);
      const lastWeekEnd = new Date(thisWeekEnd); lastWeekEnd.setDate(lastWeekEnd.getDate() - 7);

      // SLA 시트의 W21/W20/W19에 날짜 매핑 (시트 라벨 + 추정 기간)
      const slaWeekly = weeklyGrades ? [
        { ...weeklyGrades.thisWeek, start: fmtDate(thisWeekStart), end: fmtDate(thisWeekEnd), isCurrent: true },
        { ...weeklyGrades.lastWeek, start: fmtDate(lastWeekStart), end: fmtDate(lastWeekEnd), isCurrent: false },
        (() => {
          const s = new Date(lastWeekStart); s.setDate(s.getDate() - 7);
          const e = new Date(lastWeekEnd); e.setDate(e.getDate() - 7);
          return { ...weeklyGrades.twoWeeksAgo, start: fmtDate(s), end: fmtDate(e), isCurrent: false };
        })(),
      ] : null;

      // 이번주 등급 (=현재 단가 기준)
      const thisGrade = weeklyGrades?.thisWeek?.grade || null;
      const thisUnit = thisGrade ? (GRADE_PRICES[thisGrade] || 0) : 0;

      // 예상 = 지난주(월~일) 완료건수 × 이번주 등급 단가 - 이번주 누적 패널티
      const lastWeekDaily = filteredDaily.filter(d => d.date >= fmtDate(lastWeekStart) && d.date <= fmtDate(lastWeekEnd));
      const lastWeekComplete = sumComplete(lastWeekDaily);
      const thisWeekDaily = filteredDaily.filter(d => d.date >= fmtDate(thisWeekStart) && d.date <= fmtDate(thisWeekEnd));
      const thisWeekFro = thisWeekDaily.reduce((s, d) => s + (d.fro || 0), 0);
      const thisWeekPenalty = thisWeekFro * 30000 * 0.3;

      const estimate = {
        count: lastWeekComplete,
        grade: thisGrade,
        unitPrice: thisUnit,
        management: lastWeekComplete * thisUnit,
        penalty: thisWeekPenalty,
        amount: lastWeekComplete * thisUnit - thisWeekPenalty,
      };

      // 실제 = 이번주 누적 완료건수 × 이번주 등급 단가 - 이번주 누적 패널티
      const thisWeekComplete = sumComplete(thisWeekDaily);
      const actual = {
        count: thisWeekComplete,
        grade: thisGrade,
        unitPrice: thisUnit,
        management: thisWeekComplete * thisUnit,
        penalty: thisWeekPenalty,
        amount: thisWeekComplete * thisUnit - thisWeekPenalty,
      };

      // 주별 상세 (시작일부터)
      const weeks = buildWeeks(account.startDate);
      const todayStr = fmtDate(today);
      const validWeeks = weeks.filter(w => w.start <= todayStr);
      const lastIdx = validWeeks.length - 1;

      const weeksData = validWeeks.map((w, idx) => {
        const inRange = filteredDaily.filter(d => d.date >= w.start && d.date <= w.end);
        const complete = sumComplete(inRange);
        const fro = inRange.reduce((s, d) => s + (d.fro || 0), 0);
        const reverseIdx = lastIdx - idx; // 0=이번주, 1=지난주, 2=2주전
        let grade = null;
        if (reverseIdx === 0) grade = weeklyGrades?.thisWeek?.grade || null;
        else if (reverseIdx === 1) grade = weeklyGrades?.lastWeek?.grade || null;
        else if (reverseIdx === 2) grade = weeklyGrades?.twoWeeksAgo?.grade || null;
        const unitPrice = grade ? (GRADE_PRICES[grade] || 0) : 0;
        const management = complete * unitPrice;
        const penalty = fro * 30000 * 0.3;
        return {
          label: `${idx + 1}주차`,
          start: w.start,
          end: w.end,
          grade,
          unitPrice,
          complete,
          fro,
          management,
          penalty,
          amount: management - penalty,
        };
      });

      billing = {
        type: "weekly",
        estimate,
        actual,
        weeks: weeksData,
        slaWeekly,        // [{ label: "W21", grade: "B", start, end, isCurrent }, ...]
        startDate: account.startDate,
      };
    }

    return res.status(200).json({
      zone: ZONE,
      type: account.type || "fixed",
      realtime,
      daily: dailyWithGrade,
      billing,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// 완료건수 추정: demand - fro - delay (일별 FRO 시트엔 직접 완료 컬럼이 없음)
function sumComplete(arr) {
  return arr.reduce((s, d) => s + Math.max(0, (d.demand || 0) - (d.fro || 0) - (d.delay || 0)), 0);
}

// 시작일부터 주 단위로 나누기 (첫 주만 짧을 수 있고, 둘째 주부터 월~일)
function buildWeeks(startDateStr) {
  const weeks = [];
  const start = new Date(startDateStr + "T00:00:00");
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const firstDay = start.getDay();
  const daysToSunday = firstDay === 0 ? 0 : 7 - firstDay;
  const firstWeekEnd = new Date(start);
  firstWeekEnd.setDate(start.getDate() + daysToSunday);
  weeks.push({ start: fmtDate(start), end: fmtDate(firstWeekEnd) });

  let cursor = new Date(firstWeekEnd);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor <= today) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weeks.push({ start: fmtDate(weekStart), end: fmtDate(weekEnd) });
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks;
}

function mondayOf(d) {
  const dd = new Date(d);
  const day = dd.getDay(); // 0=일, 1=월
  const diff = day === 0 ? -6 : 1 - day;
  dd.setDate(dd.getDate() + diff);
  dd.setHours(0, 0, 0, 0);
  return dd;
}
function sundayOf(d) {
  const m = mondayOf(d);
  m.setDate(m.getDate() + 6);
  return m;
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
