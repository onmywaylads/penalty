import { useState, useEffect, useCallback } from "react";

// 관리비/패널티 단가는 서버에서 계산 (클라이언트 노출 X)
// 등급 단가는 SLA 카드에 표시용으로만 사용 (실제 계산은 서버)
const GRADE_PRICES_DISPLAY = { A: 500, B: 400, C: 300, D: 200, E: 100, F: 0 };
function GRADE_PRICE_FOR_DISPLAY(g) { return GRADE_PRICES_DISPLAY[g] || 0; }

function SubItem({ label, val, color }) {
  return (
    <div style={{ textAlign: "center", minWidth: 0 }}>
      <div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 600, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 800, color: color || "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{val}</div>
    </div>
  );
}

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
      // 응답엔 token만 있음 (zone/fee는 서버에서 토큰으로 조회)
      const session = { token: data.token, id };
      sessionStorage.setItem("hub_session", JSON.stringify(session));
      onLogin(session);
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
          <div style={{ fontSize: 36, marginBottom: 8 }}>🛵</div>
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
  const { token } = session;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sheets", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.error) {
        // 토큰 만료/무효면 로그아웃
        if (res.status === 401) {
          sessionStorage.removeItem("hub_session");
          onLogout();
          return;
        }
        throw new Error(json.error);
      }
      setData(json);
      setLastUpdated(new Date());
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  // 탭 제목 고정
  useEffect(() => {
    document.title = "B2B 현황 대시보드";
  }, []);

  const rt = data?.realtime;
  const daily = data?.daily || [];
  const recent = daily.slice(-14);
  const zone = data?.zone || "";
  const type = data?.type || "fixed";

  // 서버에서 계산된 관리비 사용 (클라이언트 계산 X)
  const billing = data?.billing;
  // fixed 타입용
  const MGMT_FEE = billing?.baseFee || 0;
  const monthCancel = billing?.totalFro || 0;
  const penalty = billing?.penalty || 0;
  const expectedFee = billing?.expected || 0;
  // weekly 타입용
  const estimate = billing?.estimate || null;
  const actual = billing?.actual || null;
  const weeks = billing?.weeks || [];
  const slaWeekly = billing?.slaWeekly || null;
  const startDateStr = billing?.startDate || null;

  return (
    <div style={{ fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif", background: C.bg, minHeight: "100vh" }}>
      <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" rel="stylesheet" />

      <div style={{ background: C.primary, color: "#fff", padding: "14px 20px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>🛵 {zone}존 실적</div>
            <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>요기배달 · {type === "weekly" ? "바로고" : "모아라인"}</div>
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

        {/* 1. 예상 관리비 (billing 있을 때만) */}
        {billing && billing.type === "fixed" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.sub, marginBottom: 12 }}>💰 이번달 예상 관리비</div>
          <div style={{ background: expectedFee < MGMT_FEE * 0.7 ? "#fef2f2" : "#f0fdf4", borderRadius: 12, padding: "18px", textAlign: "center", border: `1px solid ${expectedFee < MGMT_FEE * 0.7 ? "#fecaca" : "#bbf7d0"}`, marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: C.sub, fontWeight: 600, marginBottom: 6 }}>예상 수령 관리비</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: expectedFee < MGMT_FEE * 0.7 ? C.red : C.green }}>{fmt(Math.round(expectedFee))}원</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>기본 관리비 {fmt(MGMT_FEE)}원 대비 {MGMT_FEE > 0 ? ((expectedFee / MGMT_FEE) * 100).toFixed(1) : 0}%</div>
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
          <div style={{ marginTop: 10, fontSize: 11, color: C.muted, textAlign: "center", lineHeight: 1.6 }}>
            ※ 상품보상액은 실제 오더에 따라 변동될 수 있어 예상 패널티 금액이 달라질 수 있습니다. (현재 평균 30,000원 기준 산정)
          </div>
        </div>
        )}

        {/* 1-2. 예상 관리비 (weekly 타입 - 남동 등) */}
        {billing && billing.type === "weekly" && (
        <>
          {/* SLA 등급 (최근 3주) */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.sub, marginBottom: 12 }}>🏆 SLA 등급 (최근 3주)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {(slaWeekly || [
                { label: "이번주", grade: null, start: "", end: "", isCurrent: true },
                { label: "지난주", grade: null, start: "", end: "", isCurrent: false },
                { label: "2주전", grade: null, start: "", end: "", isCurrent: false },
              ]).map((w, i) => {
                const subLabel = i === 0 ? "이번주" : i === 1 ? "지난주" : "2주전";
                const isBeforeStart = startDateStr && w.end && w.end < startDateStr;
                const noData = !w.grade || isBeforeStart;
                const gradeColor = w.grade === "A" ? "#16a34a" : w.grade === "B" ? "#2563eb" : w.grade === "C" ? "#f59e0b" : w.grade === "D" ? "#f97316" : w.grade === "E" ? "#ef4444" : "#94a3b8";
                const isCurrent = w.isCurrent;
                return (
                  <div key={i} style={{
                    background: isCurrent ? "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)" : noData ? "#f8fafc" : "#fafafa",
                    border: `1px solid ${isCurrent ? "#93c5fd" : C.border}`,
                    borderRadius: 10, padding: "12px 10px", textAlign: "center",
                    opacity: noData && !isCurrent ? 0.55 : 1,
                    boxShadow: isCurrent ? "0 2px 8px rgba(37,99,235,0.1)" : "none",
                  }}>
                    <div style={{ fontSize: 10, color: isCurrent ? C.primary : C.muted, fontWeight: 700, marginBottom: 2 }}>{w.label || ""} · {subLabel}</div>
                    <div style={{ fontSize: 9, color: C.muted, marginBottom: 8 }}>{w.start ? `${w.start.slice(5).replace("-", "/")} ~ ${w.end.slice(5).replace("-", "/")}` : ""}</div>
                    {noData ? (
                      <>
                        <div style={{ fontSize: 14, color: "#cbd5e1", fontWeight: 700, padding: "12px 0" }}>-</div>
                        <div style={{ fontSize: 10, visibility: "hidden" }}>.</div>
                      </>
                    ) : (
                      <>
                        <span style={{ display: "inline-block", fontSize: 22, fontWeight: 900, padding: "4px 14px", borderRadius: 8, border: `2px solid ${gradeColor}`, color: gradeColor, background: "#fff" }}>{w.grade}</span>
                        <div style={{ fontSize: 10, color: gradeColor, marginTop: 6, fontWeight: 700 }}>{fmt(GRADE_PRICE_FOR_DISPLAY(w.grade))}원/건</div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            {startDateStr && (
              <div style={{ marginTop: 10, fontSize: 11, color: C.muted, textAlign: "center" }}>
                시작일({startDateStr.slice(5).replace("-", "/")}) 이전 주차는 데이터가 없습니다
              </div>
            )}
          </div>

          {/* 이번주 관리비 (예상 vs 실제) */}
          {(estimate || actual) && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.sub, marginBottom: 12 }}>💰 이번주 관리비</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }} className="mgmt-grid-responsive">
              {/* 예상 */}
              {estimate && (
              <div style={{ borderRadius: 12, padding: 14, border: "1px solid #fde68a", background: "linear-gradient(135deg, #fefce8 0%, #fff 100%)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, padding: "3px 9px", borderRadius: 4, fontWeight: 700, color: "#fff", background: "#f59e0b" }}>예상</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.sub }}>이번주 예상 수령액</span>
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#f59e0b", marginTop: 8, marginBottom: 12, letterSpacing: "-0.5px" }}>
                  {fmt(Math.round(estimate.amount))}원
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, paddingTop: 10, borderTop: "1px dashed rgba(148,163,184,0.4)" }}>
                  <SubItem label="완료건수" val={`${fmt(estimate.complete)}건`} />
                  <SubItem label="등급" val={estimate.grade ? `${estimate.grade} (${fmt(estimate.unitPrice)}원)` : "-"} color={C.primary} />
                  <SubItem label="패널티" val={`-${fmt(Math.round(estimate.penalty))}`} color={C.red} />
                </div>
              </div>
              )}

              {/* 실제 */}
              {actual && (
              <div style={{ borderRadius: 12, padding: 14, border: "1px solid #bbf7d0", background: "linear-gradient(135deg, #f0fdf4 0%, #fff 100%)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, padding: "3px 9px", borderRadius: 4, fontWeight: 700, color: "#fff", background: "#16a34a" }}>실제</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.sub }}>이번주 누적 수령액</span>
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: actual.amount < 0 ? C.red : C.green, marginTop: 8, marginBottom: 12, letterSpacing: "-0.5px" }}>
                  {fmt(Math.round(actual.amount))}원
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, paddingTop: 10, borderTop: "1px dashed rgba(148,163,184,0.4)" }}>
                  <SubItem label="완료건수" val={`${fmt(actual.complete)}건`} />
                  <SubItem label="등급" val={actual.grade ? `${actual.grade} (${fmt(actual.unitPrice)}원)` : "-"} color={C.primary} />
                  <SubItem label="패널티" val={`-${fmt(Math.round(actual.penalty))}`} color={C.red} />
                </div>
              </div>
              )}
            </div>
            <style>{`@media (max-width: 540px) { .mgmt-grid-responsive { grid-template-columns: 1fr !important; } }`}</style>
            <div style={{ marginTop: 10, fontSize: 11, color: C.muted, textAlign: "center", lineHeight: 1.6 }}>
              ※ 상품보상액은 실제 오더에 따라 변동될 수 있어 예상 패널티 금액이 달라질 수 있습니다. (현재 평균 30,000원 기준 산정)
            </div>
          </div>
          )}
        </>
        )}

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
            <div style={{ marginTop: 10, textAlign: "center", fontSize: 11, color: C.muted }}>
              3분마다 자동 갱신 · 요기배달 × {type === "weekly" ? "바로고" : "모아라인"}
            </div>
          </div>
        )}

        {/* 주별 누적 상세 (weekly 타입만) */}
        {type === "weekly" && weeks.length > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", marginBottom: 14 }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, background: "#f8fafc", fontSize: 13, fontWeight: 700, color: C.text }}>
              📊 주별 누적 상세
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["주차", "기간", "등급", "접수", "보상", "완료", "패널티", "수령액"].map((h, i) => (
                      <th key={h} style={{ padding: "9px 8px", textAlign: i === 0 || i === 1 ? "left" : i === 2 ? "center" : "right", color: C.sub, fontWeight: 700, fontSize: 11, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((w, i) => {
                    const isLast = i === weeks.length - 1;
                    const gradeColor = w.grade === "A" ? "#16a34a" : w.grade === "B" ? "#2563eb" : w.grade === "C" ? "#f59e0b" : w.grade === "D" ? "#f97316" : w.grade === "E" ? "#ef4444" : "#94a3b8";
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid #f1f5f9", background: isLast ? "#eff6ff" : "#fff" }}>
                        <td style={{ padding: "9px 8px", whiteSpace: "nowrap" }}>
                          <span style={{ display: "inline-block", background: isLast ? C.primary : "#64748b", color: "#fff", fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 4 }}>{w.label}</span>
                        </td>
                        <td style={{ padding: "9px 8px", color: C.sub, whiteSpace: "nowrap" }}>{w.start.slice(5).replace("-", "/")} ~ {w.end.slice(5).replace("-", "/")}</td>
                        <td style={{ padding: "9px 8px", textAlign: "center" }}>
                          {w.grade ? (
                            <span style={{ display: "inline-block", fontSize: 11, fontWeight: 900, padding: "1px 8px", borderRadius: 4, border: `1.5px solid ${gradeColor}`, background: "#fff", color: gradeColor }}>{w.grade}</span>
                          ) : <span style={{ color: C.muted }}>-</span>}
                        </td>
                        <td style={{ padding: "9px 8px", textAlign: "right", fontWeight: 700 }}>{fmt(w.demand)}</td>
                        <td style={{ padding: "9px 8px", textAlign: "right", color: w.fro > 0 ? C.red : C.muted, fontWeight: 700 }}>{w.fro > 0 ? fmt(w.fro) : "-"}</td>
                        <td style={{ padding: "9px 8px", textAlign: "right", fontWeight: 700 }}>{fmt(w.complete)}</td>
                        <td style={{ padding: "9px 8px", textAlign: "right", color: C.red, fontWeight: 700 }}>{w.penalty > 0 ? `-${fmt(Math.round(w.penalty))}` : "-"}</td>
                        <td style={{ padding: "9px 8px", textAlign: "right", fontWeight: 900, color: w.amount < 0 ? C.red : C.green, whiteSpace: "nowrap" }}>{fmt(Math.round(w.amount))}원</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
                    {(type === "weekly"
                      ? ["날짜", "등급", "접수", "보상건수", "완료", "보상비율", "배차지연(건)", "배차지연(%)"]
                      : ["날짜", "접수", "보상건수", "보상비율", "배차지연(건)", "배차지연(%)"]
                    ).map(h => (
                      <th key={h} style={{ padding: "9px 10px", textAlign: h === "날짜" ? "left" : "center", color: C.sub, fontWeight: 700, fontSize: 11, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r, i) => {
                    const dow = ["일","월","화","수","목","금","토"][new Date(r.date).getDay()];
                    const isWeekend = [0,6].includes(new Date(r.date).getDay());
                    const isToday = r.date === new Date().toISOString().slice(0,10);
                    const gradeColor = r.grade === "A" ? "#16a34a" : r.grade === "B" ? "#2563eb" : r.grade === "C" ? "#f59e0b" : r.grade === "D" ? "#f97316" : r.grade === "E" ? "#ef4444" : r.grade === "F" ? "#94a3b8" : C.muted;
                    const dailyComplete = Math.max(0, (r.demand || 0) - (r.fro || 0));
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid #f1f5f9", background: isWeekend ? "#fafafa" : "#fff" }}>
                        <td style={{ padding: "9px 10px", fontWeight: isToday ? 800 : 500, color: isToday ? C.primary : isWeekend ? C.muted : C.text, whiteSpace: "nowrap" }}>
                          {r.date.slice(5)} ({dow})
                          {isToday && <span style={{ fontSize: 9, background: "#eff6ff", color: C.primary, borderRadius: 4, padding: "1px 4px", marginLeft: 4 }}>오늘</span>}
                        </td>
                        {type === "weekly" && (
                          <td style={{ padding: "9px 10px", textAlign: "center" }}>
                            {r.grade ? (
                              <span style={{ fontSize: 11, fontWeight: 900, color: gradeColor, background: "#fff", borderRadius: 4, padding: "1px 6px", border: `1px solid ${gradeColor}` }}>{r.grade}</span>
                            ) : (
                              <span style={{ color: C.muted, fontSize: 11 }}>-</span>
                            )}
                          </td>
                        )}
                        <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 700 }}>{fmt(r.demand)}</td>
                        <td style={{ padding: "9px 10px", textAlign: "right", color: C.red, fontWeight: 700 }}>{r.fro > 0 ? fmt(r.fro) : "-"}</td>
                        {type === "weekly" && (
                          <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 700 }}>{fmt(dailyComplete)}</td>
                        )}
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

        <div style={{ paddingBottom: 24 }} />
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
