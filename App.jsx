import { useState, useEffect, useCallback } from "react";

const ZONE = "파주";
const MGMT_FEE = 700000;       // 기본 관리비 70만원
const CANCEL_UNIT = 30000;     // 취소 1건당 30,000원
const PENALTY_RATE = 0.30;     // 30% 패널티율

function fmt(n) {
  return typeof n === "number" ? n.toLocaleString() : n;
}

function pctColor(v) {
  if (v >= 98) return "#16a34a";
  if (v >= 95) return "#2563eb";
  if (v >= 90) return "#f59e0b";
  return "#dc2626";
}

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/sheets?zone=${encodeURIComponent(ZONE)}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setLastUpdated(new Date());
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // 3분마다 자동 새로고침
    const t = setInterval(load, 3 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  const rt = data?.realtime;
  const daily = data?.daily || [];

  // 최근 14일만
  const recent = daily.slice(-14);

  // 관리비 계산 (이번달 누적 취소 기준)
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthCancel = daily
    .filter(d => d.date.startsWith(thisMonth))
    .reduce((s, d) => s + d.cancel, 0);
  const penalty = monthCancel * CANCEL_UNIT * PENALTY_RATE;
  const expectedFee = Math.max(0, MGMT_FEE - penalty);

  const C = {
    bg: "#f8fafc", card: "#fff", border: "#e2e8f0",
    text: "#0f172a", sub: "#64748b", muted: "#94a3b8",
    primary: "#2563eb", green: "#16a34a", red: "#dc2626", amber: "#f59e0b",
  };

  return (
    <div style={{ fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif", background: C.bg, minHeight: "100vh" }}>
      <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" rel="stylesheet" />

      {/* 헤더 */}
      <div style={{ background: C.primary, color: "#fff", padding: "16px 20px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>🚚 {ZONE}존 실적</div>
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>요기배달 · 바로고</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <button onClick={load} disabled={loading}
              style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.4)", color: "#fff", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {loading ? "갱신중..." : "🔄 새로고침"}
            </button>
            {lastUpdated && (
              <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>
                {lastUpdated.toLocaleTimeString("ko-KR")} 기준
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "16px" }}>
        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 14, color: C.red, fontSize: 13, marginBottom: 12 }}>
            ⚠️ {error}
          </div>
        )}

        {loading && !data && (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ width: 40, height: 40, border: "3px solid #e2e8f0", borderTop: `3px solid ${C.primary}`, borderRadius: "50%", margin: "0 auto 16px", animation: "spin 0.8s linear infinite" }} />
            <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
            <div style={{ fontSize: 14, color: C.primary, fontWeight: 700 }}>실적 불러오는 중...</div>
          </div>
        )}

        {/* ── 예상 관리비 (최상단, 강조) ── */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.sub, marginBottom: 12 }}>💰 이번달 예상 관리비</div>

          {/* 예상 수령액 - 크게 강조 */}
          <div style={{ background: expectedFee < MGMT_FEE * 0.7 ? "#fef2f2" : "#f0fdf4", borderRadius: 12, padding: "18px", textAlign: "center", border: `1px solid ${expectedFee < MGMT_FEE * 0.7 ? "#fecaca" : "#bbf7d0"}`, marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: C.sub, fontWeight: 600, marginBottom: 6 }}>예상 수령 관리비</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: expectedFee < MGMT_FEE * 0.7 ? C.red : C.green }}>{fmt(Math.round(expectedFee))}원</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>기본 관리비 {fmt(MGMT_FEE)}원 대비 {((expectedFee / MGMT_FEE) * 100).toFixed(1)}%</div>
          </div>

          {/* 계산 내역 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 4 }}>기본 관리비</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{fmt(MGMT_FEE)}원</div>
            </div>
            <div style={{ background: "#fef2f2", borderRadius: 10, padding: "12px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 4 }}>이번달 취소</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.red }}>{monthCancel}건</div>
            </div>
            <div style={{ background: "#fef2f2", borderRadius: 10, padding: "12px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 4 }}>예상 패널티</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.red }}>-{fmt(Math.round(penalty))}원</div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{monthCancel}건 × 30,000 × 30%</div>
            </div>
          </div>
        </div>

        {/* ── 실시간 현황 ── */}
        {rt && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.sub, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, background: "#22c55e", borderRadius: "50%", display: "inline-block", boxShadow: "0 0 0 2px #bbf7d0" }} />
              실시간 현황
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
              {[
                { label: "Demand", val: rt.demand, color: C.text },
                { label: "완료", val: rt.complete, color: C.primary },
                { label: "취소", val: rt.cancel, color: C.red },
                { label: "진행중", val: rt.inProgress, color: C.amber },
                { label: "미배차", val: rt.waiting, color: "#7c3aed" },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ background: "#f8fafc", borderRadius: 10, padding: "12px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color }}>{fmt(val)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 일별 FRO ── */}
        {recent.length > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, background: "#f8fafc", fontSize: 13, fontWeight: 700, color: C.text }}>
              📅 일별 FRO 실적 <span style={{ fontSize: 11, color: C.muted, fontWeight: 400 }}>최근 14일</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["날짜", "Demand", "완료", "FRO%", "취소"].map(h => (
                      <th key={h} style={{ padding: "9px 10px", textAlign: h === "날짜" ? "left" : "right", color: C.sub, fontWeight: 700, fontSize: 11, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r, i) => {
                    const dow = ["일","월","화","수","목","금","토"][new Date(r.date).getDay()];
                    const isWeekend = [0,6].includes(new Date(r.date).getDay());
                    const isToday = r.date === new Date().toISOString().slice(0,10);
                    return (
                      <tr key={i} style={{ borderBottom: `1px solid #f1f5f9`, background: isWeekend ? "#fafafa" : "#fff" }}>
                        <td style={{ padding: "9px 10px", fontWeight: isToday ? 800 : 500, color: isToday ? C.primary : isWeekend ? C.muted : C.text, whiteSpace: "nowrap" }}>
                          {r.date.slice(5)} ({dow})
                          {isToday && <span style={{ fontSize: 9, background: "#eff6ff", color: C.primary, borderRadius: 4, padding: "1px 4px", marginLeft: 4 }}>오늘</span>}
                        </td>
                        <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 700 }}>{fmt(r.demand)}</td>
                        <td style={{ padding: "9px 10px", textAlign: "right", color: C.primary, fontWeight: 700 }}>{fmt(r.fro)}</td>
                        <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 700, color: pctColor(r.fro_rate) }}>{r.fro_rate.toFixed(1)}%</td>
                        <td style={{ padding: "9px 10px", textAlign: "right", color: r.cancel > 0 ? C.red : C.muted }}>{r.cancel > 0 ? r.cancel : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ textAlign: "center", fontSize: 11, color: C.muted, marginTop: 16 }}>
          3분마다 자동 갱신 · 요기배달 × 바로고
        </div>
      </div>
    </div>
  );
}
