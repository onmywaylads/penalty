// 존별 계정 관리 (서버 전용, 클라이언트로 노출되지 않음)
// 새 존 추가 시 여기에 한 줄 추가
const ACCOUNTS = {
  "paju": { password: "0515", zone: "파주", fee: 700000 },
  // "namdong": { password: "0521", zone: "남동", type: "weekly", startDate: "2026-05-21" },
};

// 간단한 HMAC 기반 토큰 (외부 라이브러리 없이)
import crypto from "crypto";

const SECRET = process.env.JWT_SECRET || "change-me-in-vercel-env-vars";
const TOKEN_TTL_HOURS = 12;

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verify(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expectedSig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// 다른 API에서 username으로 account 찾을 때 사용
export function getAccountByUsername(username) {
  return ACCOUNTS[username] || null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  const { id, password } = req.body || {};
  const username = id?.toLowerCase();
  const account = ACCOUNTS[username];

  // 실패 응답을 항상 동일하게 (ID 존재 여부 추측 방지)
  if (!account || account.password !== password) {
    return res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않아요" });
  }

  // 토큰 발급 (zone/fee는 응답에 포함하지 않음 - 서버에서만 사용)
  const exp = Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000;
  const token = sign({ u: username, exp });

  return res.status(200).json({
    ok: true,
    token,
  });
}
