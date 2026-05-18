import { useState, useEffect, useCallback } from "react";

const CANCEL_UNIT = 30000;
const PENALTY_RATE = 0.30;

function fmt(n) {
  return typeof n === "number" ? n.toLocaleString() : n;
}

function pctColor(v) {
  if (v >= 98) return "#16a34a";
  if (v >= 95) return "#2563eb";
  if (v >= 90) return "#f59e0b";
  return "#dc2626";
}

const C = {
  bg: "#f8fafc", card: "#fff", border: "#e2e8f0",
  text: "#0f172a", sub: "#64748b", muted: "#94a3b8",
  primary: "#2563eb", green: "#16a34a", red: "#dc2626", amber: "#f59e0b",
};

function LoginView({ onLogin }) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!id || !pw) return setError("아이디와 비밀번호를 입력해주세요");
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, password: pw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "로그인 실패");
      sessionStorage.setItem("hub_session", JSON.stringify(data));
      onLogin(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif", background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" rel="stylesheet" />
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "32px 28px", width: "100%", maxWidth: 360, boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🚚</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>B2B 현황 대시보드</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>로그인 후 이용할 수 있어요</div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.sub, marginBottom: 6 }}>아이디</div>
          <input type="text" value={id} onChange={e => setId(e.target.value)}
            placeholder="아이디 입력" onKeyDown={e => e.key === "Enter" && handleLogin()}
            style={{ width: "100%", padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.sub, marginBottom: 6 }}>비밀번호</div>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)}
            placeholder="비밀번호 입력" onKeyDown={e => e.key === "Enter" && handleLogin()}
            style={{ width: "100%", padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box" }} />
        </div>
        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 12px", color: C.red, fontSize: 13, marginBottom: 14 }}>
            ⚠️ {error}
          </div>
        )}
        <button onClick={handleLogin} disabled={loading} style={{
          width: "100%", padding: "12px", background: loading ? "#93c5fd" : C.primary,
          color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700,
          cursor: loading ? "default" : "pointer",
        }}>
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </div>
    </div>
  );
}

function Dashboard({ session, onLogout }) {
  const { zone, fee: MGMT_FEE } = session;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/sheets?zone=${encodeURIComponent(zone)}`);
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
  }, [zone]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  const rt = data?.realtime;
  const daily = data?.daily || [];
  const recent = daily.slice(-14);

  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthCancel = daily.reduce((s, d) => s + d.fro, 0); // 전체 기간 보상건수 합산
  const penalty = monthCancel * CANCEL_UNIT * PENALTY_RATE;
  const expectedFee = Math.max(0, MGMT_FEE - penalty);

  return (
    <div style={{ fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif", background: C.bg, minHeight: "100vh" }}>
      <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" rel="stylesheet" />

      <div style={{ background: C.primary, color: "#fff", padding: "14px 20px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>🚚 {zone}존 실적</div>
            <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>요기배달 · 모아라인</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button onClick={load} disabled={loading}
                style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.4)", color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                {loading ? "갱신중..." : "🔄 새로고침"}
              </button>
              <button onClick={onLogout}
                style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
                로그아웃
              </button>
            </div>
            {lastUpdated && <div style={{ fontSize: 10, opacity: 0.7 }}>{lastUpdated.toLocaleTimeString("ko-KR")} 기준</div>}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "16px" }}>
        {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 14, color: C.red, fontSize: 13, marginBottom: 12 }}>⚠️ {error}</div>}

        {loading && !data && (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ width: 40, height: 40, border: "3px solid #e2e8f0", borderTop: `3px solid ${C.primary}`, borderRadius: "50%", margin: "0 auto 16px", animation: "spin 0.8s linear infinite" }} />
            <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
            <div style={{ fontSize: 14, color: C.primary, fontWeight: 700 }}>실적 불러오는 중...</div>
          </div>
        )}

        {/* 1. 예상 관리비 */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.sub, marginBottom: 12 }}>💰 이번달 예상 관리비</div>
          <div style={{ background: expectedFee < MGMT_FEE * 0.7 ? "#fef2f2" : "#f0fdf4", borderRadius: 12, padding: "18px", textAlign: "center", border: `1px solid ${expectedFee < MGMT_FEE * 0.7 ? "#fecaca" : "#bbf7d0"}`, marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: C.sub, fontWeight: 600, marginBottom: 6 }}>예상 수령 관리비</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: expectedFee < MGMT_FEE * 0.7 ? C.red : C.green }}>{fmt(Math.round(expectedFee))}원</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>기본 관리비 {fmt(MGMT_FEE)}원 대비 {((expectedFee / MGMT_FEE) * 100).toFixed(1)}%</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {[
              { label: "기본 관리비", val: `${fmt(MGMT_FEE)}원`, bg: "#f8fafc", color: C.text, sub: null },
              { label: "이번달 취소", val: `${monthCancel}건`, bg: "#fef2f2", color: C.red, sub: null },
              { label: "예상 패널티", val: `-${fmt(Math.round(penalty))}원`, bg: "#fef2f2", color: C.red, sub: `${monthCancel}건 × 30,000 × 30%` },
            ].map(({ label, val, bg, color, sub }) => (
              <div key={label} style={{ background: bg, borderRadius: 10, padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color }}>{val}</div>
                {sub && <div style={{ fontSize: 9, color: C.muted, marginTop: 3 }}>{sub}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* 2. 실시간 현황 */}
        {rt && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.sub, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, background: "#22c55e", borderRadius: "50%", display: "inline-block", boxShadow: "0 0 0 2px #bbf7d0" }} />
              실시간 현황
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
              {[
                { label: "접수", val: rt.demand, color: C.text },
                { label: "완료주문", val: rt.complete, color: C.primary },
                { label: "취소주문", val: rt.cancel, color: C.red },
                { label: "진행중", val: rt.inProgress, color: C.amber },
                { label: "미배차", val: rt.waiting, color: "#7c3aed" },
                { label: "배차지연취소", val: rt.delayCancel, color: C.red },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ background: "#f8fafc", borderRadius: 10, padding: "12px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color }}>{fmt(val)}</div>
                </div>
              ))}
            </div>
            {/* 배차지연취소율 */}
            <div style={{ marginTop: 10, background: "#fef2f2", borderRadius: 10, padding: "12px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 4 }}>배차지연취소율</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: rt.delayCancelRate > 1 ? C.red : C.green }}>{rt.delayCancelRate.toFixed(2)}%</div>
            </div>
          </div>
        )}

        {/* 3. 일별 FRO */}
        {recent.length > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", marginBottom: 14 }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, background: "#f8fafc", fontSize: 13, fontWeight: 700, color: C.text }}>
              📅 일별 요기배달 실적 <span style={{ fontSize: 11, color: C.muted, fontWeight: 400 }}>계약일 기준</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["날짜", "접수", "보상건수", "보상비율", "배차지연(건)", "배차지연(%)"].map(h => (
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
                      <tr key={i} style={{ borderBottom: "1px solid #f1f5f9", background: isWeekend ? "#fafafa" : "#fff" }}>
                        <td style={{ padding: "9px 10px", fontWeight: isToday ? 800 : 500, color: isToday ? C.primary : isWeekend ? C.muted : C.text, whiteSpace: "nowrap" }}>
                          {r.date.slice(5)} ({dow})
                          {isToday && <span style={{ fontSize: 9, background: "#eff6ff", color: C.primary, borderRadius: 4, padding: "1px 4px", marginLeft: 4 }}>오늘</span>}
                        </td>
                        <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 700 }}>{fmt(r.demand)}</td>
                        <td style={{ padding: "9px 10px", textAlign: "right", color: C.red, fontWeight: 700 }}>{r.fro > 0 ? fmt(r.fro) : "-"}</td>
                        <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 700, color: r.fro_rate > 0 ? C.red : C.muted }}>{r.fro_rate > 0 ? r.fro_rate.toFixed(2)+"%" : "-"}</td>
                        <td style={{ padding: "9px 10px", textAlign: "right", color: r.delay > 0 ? C.amber : C.muted }}>{r.delay > 0 ? fmt(r.delay) : "-"}</td>
                        <td style={{ padding: "9px 10px", textAlign: "right", color: r.delay_rate > 0 ? C.amber : C.muted }}>{r.delay_rate > 0 ? r.delay_rate.toFixed(2)+"%" : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ textAlign: "center", fontSize: 11, color: C.muted, paddingBottom: 24 }}>
          3분마다 자동 갱신 · 요기배달 × 모아라인
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(() => {
    try {
      const s = sessionStorage.getItem("hub_session");
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  });

  const handleLogout = () => {
    sessionStorage.removeItem("hub_session");
    setSession(null);
  };

  if (!session) return <LoginView onLogin={setSession} />;
  return <Dashboard session={session} onLogout={handleLogout} />;
}
