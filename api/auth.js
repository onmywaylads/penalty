// 존별 계정 관리
// 새 존 추가 시 여기에 한 줄 추가
const ACCOUNTS = {
  "paju": { password: "0515", zone: "파주", fee: 700000 },
  // "ilsan": { password: "xxxx", zone: "일산", fee: 800000 },
  // "gangnam": { password: "xxxx", zone: "강남", fee: 750000 },
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  const { id, password } = req.body;
  const account = ACCOUNTS[id?.toLowerCase()];

  if (!account || account.password !== password) {
    return res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않아요" });
  }

  return res.status(200).json({
    ok: true,
    zone: account.zone,
    fee: account.fee,
    id,
  });
}
