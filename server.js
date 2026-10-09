/**
 * Naleti Academy – free multi-device server
 * Deploy on Railway.app or Render.com (free tier)
 * Serves the app + shared API so all phones use the same data.
 */
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data.json");
const SECRET = process.env.SECRET || "naleti-change-me-in-production";

/* ---------- same hash as the HTML client ---------- */
function hh(id, p) {
  const x = "naleti|" + String(id).toLowerCase() + "|" + p;
  let a = 0xdeadbeef, b = 0x41c6ce57, c = 0x9e3779b9, d = 0x7f4a7c15;
  for (let i = 0; i < x.length; i++) {
    const k = x.charCodeAt(i);
    a = Math.imul(a ^ k, 2654435761);
    b = Math.imul(b ^ k, 1597334677);
    c = Math.imul(c ^ k, 2246822519);
    d = Math.imul(d ^ k, 3266489917);
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  c = Math.imul(c ^ (c >>> 16), 2246822507) ^ Math.imul(d ^ (d >>> 13), 3266489909);
  d = Math.imul(d ^ (d >>> 16), 2246822507) ^ Math.imul(c ^ (c >>> 13), 3266489909);
  return [a, b, c, d].map(v => (v >>> 0).toString(16).padStart(8, "0")).join("");
}

function rnd4() {
  return String(1000 + Math.floor(Math.random() * 9000));
}

function emptyDocs() {
  return {
    cfg: {
      school: "Naleti Academy",
      year: "2019 E.C.",
      terms: ["Semester 1", "Semester 2"],
      subj: ["Amharic", "Afaan Oromoo", "English", "English 2", "Maths", "Science", "Social 1", "Social 2", "HPE", "ICT", "PVA", "Handwriting", "Gadaa", "Moral", "Citizen", "CTE"],
      pass: 50,
      feeG: {},
      adminH: hh("admin", "1234"),
      adminDef: true,
      admins: []
    },
    stu: [],
    staff: [],
    att: {},
    tatt: {},
    mk: {},
    rem: {},
    tt: [],
    fee: [],
    lib: [],
    loan: [],
    news: [],
    users: {} // id -> { role, link, h, ok, must }
  };
}

function mrg(a, b) {
  for (const k in b) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    if (b[k] === null) delete a[k];
    else if (typeof b[k] === "object" && !Array.isArray(b[k])) {
      if (typeof a[k] !== "object" || a[k] === null) a[k] = {};
      mrg(a[k], b[k]);
    } else a[k] = b[k];
  }
  return a;
}

/* ---------- persistence ---------- */
let DB = { docs: emptyDocs(), v: {}, tokens: {} };

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const j = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      if (j.docs) DB = j;
      if (!DB.docs.cfg) DB.docs = emptyDocs();
      if (!DB.docs.users) DB.docs.users = {};
      if (!DB.v) DB.v = {};
      if (!DB.tokens) DB.tokens = {};
    }
  } catch (e) {
    console.error("Load error:", e.message);
  }
}

function save() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(DB));
  } catch (e) {
    console.error("Save error:", e.message);
  }
}

load();

/* ---------- auth ---------- */
function makeToken(user) {
  const t = crypto.randomBytes(24).toString("hex");
  DB.tokens[t] = { id: user.id, role: user.role, name: user.name, link: user.link || null, must: !!user.must, exp: Date.now() + 30 * 24 * 3600 * 1000 };
  save();
  return t;
}

function auth(req) {
  const h = req.headers.authorization || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : "";
  const u = DB.tokens[t];
  if (!u || u.exp < Date.now()) return null;
  return u;
}

function requireAuth(req, res) {
  const u = auth(req);
  if (!u) {
    res.status(401).json({ error: "bad" });
    return null;
  }
  return u;
}

function requireAdmin(req, res) {
  const u = requireAuth(req, res);
  if (!u) return null;
  if (u.role !== "admin") {
    res.status(403).json({ error: "blocked" });
    return null;
  }
  return u;
}

/* ---------- app ---------- */
const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Serve the single-file app
const htmlPath = path.join(__dirname, "public", "naleti.html");
app.get("/", (req, res) => {
  if (fs.existsSync(htmlPath)) res.sendFile(htmlPath);
  else res.send("<h1>Naleti Academy</h1><p>Place naleti.html in /public</p>");
});
app.use(express.static(path.join(__dirname, "public")));

/* ---------- API ---------- */
app.get("/api/info", (req, res) => {
  res.json({ school: DB.docs.cfg.school || "Naleti Academy", app: "naleti", mode: "server" });
});

app.post("/api/login", (req, res) => {
  const id = String(req.body.id || "").toLowerCase().trim();
  const pw = String(req.body.pw || "");
  if (!id || !pw) return res.status(400).json({ error: "bad" });

  let user = null;

  // Admin
  if (id === "admin") {
    if (DB.docs.cfg.adminH === hh("admin", pw)) {
      user = { id: "admin", role: "admin", name: "Admin", must: !!DB.docs.cfg.adminDef };
    }
  }

  // Server users table (created accounts)
  if (!user && DB.docs.users[id]) {
    const u = DB.docs.users[id];
    if (!u.ok) return res.status(403).json({ error: "blocked" });
    if (u.h === hh(id, pw)) {
      user = { id, role: u.role, name: u.name || id, link: u.link, must: !!u.must };
    }
  }

  // Local-style teacher/parent PIN (staff/stu.ph)
  if (!user) {
    const tc = (DB.docs.staff || []).find(x => x.id.toLowerCase() === id && x.type === "teacher" && x.ph);
    if (tc && tc.ph === hh(tc.id, pw)) {
      user = { id: tc.id, role: "teacher", name: tc.name, link: tc.id };
    }
  }
  if (!user) {
    const st = (DB.docs.stu || []).find(x => x.id.toLowerCase() === id && x.ph);
    if (st && st.ph === hh(st.id, pw)) {
      user = { id: st.id, role: "parent", name: st.pn || st.name, link: st.id };
    }
  }

  if (!user) return res.status(401).json({ error: "bad" });
  const token = makeToken(user);
  res.json({ token, user });
});

app.post("/api/logout", (req, res) => {
  const h = req.headers.authorization || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (t) delete DB.tokens[t];
  save();
  res.json({ ok: 1 });
});

app.get("/api/state", (req, res) => {
  const u = requireAuth(req, res);
  if (!u) return;
  const { users, ...docs } = DB.docs;
  res.json({
    docs,
    v: DB.v,
    user: { id: u.id, role: u.role, name: u.name, link: u.link, must: u.must }
  });
});

app.put("/api/doc/:key", (req, res) => {
  const u = requireAuth(req, res);
  if (!u) return;
  if (u.role !== "admin" && u.role !== "teacher") return res.status(403).json({ error: "blocked" });

  const key = req.params.key;
  const allowed = ["cfg", "stu", "staff", "att", "tatt", "mk", "rem", "tt", "fee", "lib", "loan", "news"];
  if (!allowed.includes(key)) return res.status(400).json({ error: "bad" });

  if (req.body.patch) {
    if (!DB.docs[key] || typeof DB.docs[key] !== "object") DB.docs[key] = Array.isArray(DB.docs[key]) ? [] : {};
    if (Array.isArray(DB.docs[key])) {
      // arrays replaced via full data
    } else {
      mrg(DB.docs[key], req.body.patch);
    }
  } else if (req.body.data !== undefined) {
    DB.docs[key] = req.body.data;
  }

  DB.v[key] = (DB.v[key] || 0) + 1;
  save();
  res.json({ v: DB.v[key] });
});

app.post("/api/pw", (req, res) => {
  const u = requireAuth(req, res);
  if (!u) return;
  const old = String(req.body.old || "");
  const neu = String(req.body.new || "");
  if (neu.length < 8 || !/[A-Za-z]/.test(neu) || !/\d/.test(neu)) {
    return res.status(400).json({ error: "weak" });
  }
  if (neu.toLowerCase() === u.id.toLowerCase()) {
    return res.status(400).json({ error: "userpw" });
  }

  if (u.id === "admin") {
    if (DB.docs.cfg.adminH !== hh("admin", old)) return res.status(400).json({ error: "bad" });
    DB.docs.cfg.adminH = hh("admin", neu);
    DB.docs.cfg.adminDef = false;
  } else if (DB.docs.users[u.id]) {
    if (DB.docs.users[u.id].h !== hh(u.id, old)) return res.status(400).json({ error: "bad" });
    DB.docs.users[u.id].h = hh(u.id, neu);
    DB.docs.users[u.id].must = false;
  } else {
    return res.status(400).json({ error: "bad" });
  }

  // update token must flag
  Object.values(DB.tokens).forEach(t => {
    if (t.id === u.id) t.must = false;
  });
  save();
  res.json({ ok: 1 });
});

app.get("/api/users", (req, res) => {
  const u = requireAdmin(req, res);
  if (!u) return;
  const list = Object.entries(DB.docs.users || {}).map(([id, x]) => ({
    id,
    name: x.name || id,
    role: x.role,
    ok: x.ok !== false,
    link: x.link
  }));
  // include admin
  list.unshift({ id: "admin", name: "Admin", role: "admin", ok: true });
  res.json({ users: list });
});

app.post("/api/users", (req, res) => {
  const u = requireAdmin(req, res);
  if (!u) return;
  const role = req.body.role === "parent" ? "parent" : "teacher";
  const link = String(req.body.link || "").trim();
  if (!link) return res.status(400).json({ error: "nolink" });

  let name = link;
  if (role === "teacher") {
    const t = (DB.docs.staff || []).find(x => x.id === link);
    if (!t) return res.status(400).json({ error: "nolink" });
    name = t.name;
  } else {
    const s = (DB.docs.stu || []).find(x => x.id === link);
    if (!s) return res.status(400).json({ error: "nolink" });
    name = s.pn || s.name;
  }

  const id = link.toLowerCase();
  if (DB.docs.users[id] || id === "admin") return res.status(400).json({ error: "exists" });

  const tmp = rnd4() + rnd4(); // 8-digit temp password
  DB.docs.users[id] = { role, link, name, h: hh(id, tmp), ok: true, must: true };
  save();
  res.json({ id, tmp });
});

app.post("/api/users/:id/:op", (req, res) => {
  const u = requireAdmin(req, res);
  if (!u) return;
  const id = decodeURIComponent(req.params.id).toLowerCase();
  const op = req.params.op;
  if (id === "admin") return res.status(400).json({ error: "bad" });
  if (!DB.docs.users[id]) return res.status(404).json({ error: "bad" });

  if (op === "toggle") {
    DB.docs.users[id].ok = !DB.docs.users[id].ok;
    save();
    return res.json({ ok: 1 });
  }
  if (op === "reset") {
    const tmp = rnd4() + rnd4();
    DB.docs.users[id].h = hh(id, tmp);
    DB.docs.users[id].must = true;
    save();
    return res.json({ tmp });
  }
  if (op === "delete") {
    delete DB.docs.users[id];
    save();
    return res.json({ ok: 1 });
  }
  res.status(400).json({ error: "bad" });
});

app.get("/api/backup", (req, res) => {
  const u = requireAdmin(req, res);
  if (!u) return;
  const { users, ...docs } = DB.docs;
  res.json({ app: "naleti", v: 1, docs });
});

app.post("/api/restore", (req, res) => {
  const u = requireAdmin(req, res);
  if (!u) return;
  const docs = req.body.docs;
  if (!docs || typeof docs !== "object") return res.status(400).json({ error: "badfile" });
  const keepUsers = DB.docs.users;
  const keepAdminH = DB.docs.cfg && DB.docs.cfg.adminH;
  const keepAdminDef = DB.docs.cfg && DB.docs.cfg.adminDef;
  DB.docs = { ...emptyDocs(), ...docs, users: keepUsers };
  if (!DB.docs.cfg.adminH) {
    DB.docs.cfg.adminH = keepAdminH;
    DB.docs.cfg.adminDef = keepAdminDef;
  }
  save();
  res.json({ ok: 1 });
});

/* ---------- file uploads (attachments per section) ---------- */
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");
const UP_SECTIONS = ["stu", "staff", "att", "tatt", "mk", "tt", "fee", "lib", "news", "card", "rep"];
const UP_ROLES = ["admin", "teacher", "staff"];
const UP_MAX = 8 * 1024 * 1024;
const upIndex = () => (DB.files || (DB.files = []));

app.get("/api/files", (req, res) => {
  const u = requireAuth(req, res);
  if (!u) return;
  if (!UP_ROLES.includes(u.role)) return res.status(403).json({ error: "blocked" });
  const sec = String(req.query.section || "");
  const files = upIndex()
    .filter(f => !sec || f.section === sec)
    .map(({ id, section, name, size, by, at }) => ({ id, section, name, size, by, at }));
  res.json({ files });
});

app.post("/api/files", (req, res) => {
  const u = requireAuth(req, res);
  if (!u) return;
  if (!UP_ROLES.includes(u.role)) return res.status(403).json({ error: "blocked" });
  const section = String(req.body.section || "");
  if (!UP_SECTIONS.includes(section)) return res.status(400).json({ error: "bad" });
  const name = path.basename(String(req.body.name || "file")).replace(/[^\w.\- ]/g, "_").slice(0, 120) || "file";
  const buf = Buffer.from(String(req.body.data || ""), "base64");
  if (!buf.length || buf.length > UP_MAX) return res.status(400).json({ error: "size" });
  const id = crypto.randomBytes(12).toString("hex");
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, id), buf);
  const rec = { id, section, name, size: buf.length, by: u.name || u.id, at: new Date().toISOString() };
  upIndex().push(rec);
  save();
  res.json({ file: rec });
});

app.get("/api/files/:id", (req, res) => {
  const u = requireAuth(req, res);
  if (!u) return;
  if (!UP_ROLES.includes(u.role)) return res.status(403).json({ error: "blocked" });
  const f = upIndex().find(x => x.id === req.params.id);
  if (!f) return res.status(404).json({ error: "bad" });
  res.download(path.join(UPLOAD_DIR, f.id), f.name);
});

app.delete("/api/files/:id", (req, res) => {
  const u = requireAdmin(req, res);
  if (!u) return;
  const i = upIndex().findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: "bad" });
  try { fs.unlinkSync(path.join(UPLOAD_DIR, upIndex()[i].id)); } catch (e) {}
  upIndex().splice(i, 1);
  save();
  res.json({ ok: 1 });
});


/* ---------- CSV import (admin): students and staff ---------- */
function parseCsvText(txt) {
  const lines = String(txt).replace(/^\uFEFF/, "").split(/\r?\n/).filter(l => l.trim());
  const cells = l => {
    const out = []; let cur = "", q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true;
      else if (c === ",") { out.push(cur.trim()); cur = ""; }
      else cur += c;
    }
    out.push(cur.trim());
    return out;
  };
  const rows = lines.map(cells);
  const head = rows.shift().map(h => h.toLowerCase());
  return rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] || ""])));
}

const IMPORT_SPEC = {
  stu: { cols: "id,name,grade,prog,parent_name,phone,sex", key: r => r.id, make: r => ({ id: r.id, name: r.name, grade: isNaN(Number(r.grade)) ? r.grade : Number(r.grade), prog: r.prog || "", pn: r.parent_name || "", phone: r.phone || "", sex: r.sex || "" }) },
  staff: { cols: "id,name,type,phone", key: r => r.id, make: r => ({ id: r.id, name: r.name, type: r.type === "teacher" ? "teacher" : "staff", phone: r.phone || "" }) },
  fee: { cols: "student_id,amount,date,note", key: () => null, make: (r, list) => {
    const n = list.length + 1;
    return { id: Date.now().toString(36) + n, no: "R-" + String(n).padStart(4, "0"), sid: r.student_id, date: r.date || new Date().toISOString().slice(0, 10), amt: Number(r.amount), note: r.note || "" };
  }, valid: r => r.student_id && Number(r.amount) > 0 },
  lib: { cols: "id,title,author,copies", key: r => r.id, make: r => ({ id: r.id, title: r.title, author: r.author || "", copies: Number(r.copies) || 1 }) },
  news: { cols: "title,date", key: () => null, make: (r, list) => ({ id: Date.now().toString(36) + list.length, t: r.title, d: r.date || new Date().toISOString().slice(0, 10) }), valid: r => r.title },
  tt: { cols: "grade,program,day,period,subject,teacher_id", key: () => null, make: r => ({ g: r.grade, p: r.program, d: r.day, s: r.period, subj: r.subject, tid: r.teacher_id }), valid: r => r.grade && r.day && r.period }
};

app.post("/api/import/:section", (req, res) => {
  const u = requireAdmin(req, res);
  if (!u) return;
  const sec = req.params.section;
  const spec = IMPORT_SPEC[sec];
  if (!spec) return res.status(400).json({ error: "bad" });
  const rows = parseCsvText(req.body.text || "");
  if (!rows.length || rows.length > 2000) return res.status(400).json({ error: "badfile" });
  const list = DB.docs[sec] || (DB.docs[sec] = []);
  const seen = new Set(spec.key ? list.map(x => String(spec.key(x) || "").toLowerCase()) : []);
  let added = 0, skipped = 0;
  for (const r of rows) {
    const valid = spec.valid ? spec.valid(r) : (r.id && r.name);
    if (!valid) { skipped++; continue; }
    const k = spec.key ? String(spec.key(r) || "").toLowerCase() : null;
    if (k !== null && seen.has(k)) { skipped++; continue; }
    list.push(spec.make(r, list));
    if (k !== null) seen.add(k);
    added++;
  }
  DB.v[sec] = (DB.v[sec] || 0) + 1;
  save();
  res.json({ added, skipped, v: DB.v[sec] });
});

app.get("/health", (req, res) => res.status(200).send("ok"));
app.get("/api/health", (req, res) => res.json({ ok: 1, app: "naleti" }));

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log("Naleti Academy running on 0.0.0.0:" + PORT);
  console.log("Login: admin / 1234");
});
