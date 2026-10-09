/**
 * Naleti Academy – zero-dependency multi-device server (Node built-in only)
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data.json");
const PUBLIC = path.join(__dirname, "public");

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
function rnd4() { return String(1000 + Math.floor(Math.random() * 9000)); }
function emptyDocs() {
  return {
    cfg: {
      school: "Naleti Academy", year: "2019 E.C.",
      terms: ["Semester 1", "Semester 2"],
      subj: ["Amharic","Afaan Oromoo","English","English 2","Maths","Science","Social 1","Social 2","HPE","ICT","PVA","Handwriting","Gadaa","Moral","Citizen","CTE"],
      pass: 50, feeG: {}, adminH: hh("admin","1234"), adminDef: true, admins: []
    },
    stu: [], staff: [], att: {}, tatt: {}, mk: {}, rem: {}, tt: [], fee: [], lib: [], loan: [], news: [], users: {}
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
  } catch (e) { console.error("load", e.message); }
}
function save() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(DB)); } catch (e) { console.error("save", e.message); }
}
load();

function makeToken(user) {
  const t = crypto.randomBytes(24).toString("hex");
  DB.tokens[t] = { id: user.id, role: user.role, name: user.name, link: user.link || null, must: !!user.must, exp: Date.now() + 30 * 24 * 3600 * 1000 };
  save();
  return t;
}
function getUser(req) {
  const h = req.headers.authorization || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : "";
  const u = DB.tokens[t];
  if (!u || u.exp < Date.now()) return null;
  return u;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString();
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS"
  });
  res.end(body);
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = { ".html": "text/html; charset=utf-8", ".csv": "text/csv", ".json": "application/json", ".js": "text/javascript", ".css": "text/css" };
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream", "Access-Control-Allow-Origin": "*" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS"
    });
    return res.end();
  }

  const u = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  const p = u.pathname;

  try {
    // Static
    if (req.method === "GET" && (p === "/" || p === "/index.html")) {
      return serveFile(res, path.join(PUBLIC, "naleti.html"));
    }
    if (req.method === "GET" && p.startsWith("/public/")) {
      return serveFile(res, path.join(PUBLIC, p.slice(8)));
    }
    if (req.method === "GET" && p === "/naleti-timetable.csv") {
      return serveFile(res, path.join(PUBLIC, "naleti-timetable.csv"));
    }

    // API
    if (p === "/api/info" && req.method === "GET") {
      return json(res, 200, { school: DB.docs.cfg.school || "Naleti Academy", app: "naleti", mode: "server" });
    }

    if (p === "/api/login" && req.method === "POST") {
      const body = await readBody(req);
      const id = String(body.id || "").toLowerCase().trim();
      const pw = String(body.pw || "");
      if (!id || !pw) return json(res, 400, { error: "bad" });
      let user = null;
      if (id === "admin" && DB.docs.cfg.adminH === hh("admin", pw)) {
        user = { id: "admin", role: "admin", name: "Admin", must: !!DB.docs.cfg.adminDef };
      }
      if (!user && DB.docs.users[id]) {
        const x = DB.docs.users[id];
        if (!x.ok) return json(res, 403, { error: "blocked" });
        if (x.h === hh(id, pw)) user = { id, role: x.role, name: x.name || id, link: x.link, must: !!x.must };
      }
      if (!user) {
        const tc = (DB.docs.staff || []).find(x => x.id.toLowerCase() === id && x.type === "teacher" && x.ph);
        if (tc && tc.ph === hh(tc.id, pw)) user = { id: tc.id, role: "teacher", name: tc.name, link: tc.id };
      }
      if (!user) {
        const st = (DB.docs.stu || []).find(x => x.id.toLowerCase() === id && x.ph);
        if (st && st.ph === hh(st.id, pw)) user = { id: st.id, role: "parent", name: st.pn || st.name, link: st.id };
      }
      if (!user) return json(res, 401, { error: "bad" });
      return json(res, 200, { token: makeToken(user), user });
    }

    if (p === "/api/logout" && req.method === "POST") {
      const h = req.headers.authorization || "";
      const t = h.startsWith("Bearer ") ? h.slice(7) : "";
      if (t) delete DB.tokens[t];
      save();
      return json(res, 200, { ok: 1 });
    }

    if (p === "/api/state" && req.method === "GET") {
      const user = getUser(req);
      if (!user) return json(res, 401, { error: "bad" });
      const { users, ...docs } = DB.docs;
      return json(res, 200, { docs, v: DB.v, user: { id: user.id, role: user.role, name: user.name, link: user.link, must: user.must } });
    }

    if (p.startsWith("/api/doc/") && req.method === "PUT") {
      const user = getUser(req);
      if (!user) return json(res, 401, { error: "bad" });
      if (user.role !== "admin" && user.role !== "teacher") return json(res, 403, { error: "blocked" });
      const key = p.slice("/api/doc/".length);
      const allowed = ["cfg","stu","staff","att","tatt","mk","rem","tt","fee","lib","loan","news"];
      if (!allowed.includes(key)) return json(res, 400, { error: "bad" });
      const body = await readBody(req);
      if (body.patch) {
        if (!DB.docs[key] || typeof DB.docs[key] !== "object") DB.docs[key] = {};
        if (!Array.isArray(DB.docs[key])) mrg(DB.docs[key], body.patch);
      } else if (body.data !== undefined) {
        DB.docs[key] = body.data;
      }
      DB.v[key] = (DB.v[key] || 0) + 1;
      save();
      return json(res, 200, { v: DB.v[key] });
    }

    if (p === "/api/pw" && req.method === "POST") {
      const user = getUser(req);
      if (!user) return json(res, 401, { error: "bad" });
      const body = await readBody(req);
      const old = String(body.old || "");
      const neu = String(body.new || "");
      if (neu.length < 8 || !/[A-Za-z]/.test(neu) || !/\d/.test(neu)) return json(res, 400, { error: "weak" });
      if (user.id === "admin") {
        if (DB.docs.cfg.adminH !== hh("admin", old)) return json(res, 400, { error: "bad" });
        DB.docs.cfg.adminH = hh("admin", neu);
        DB.docs.cfg.adminDef = false;
      } else if (DB.docs.users[user.id]) {
        if (DB.docs.users[user.id].h !== hh(user.id, old)) return json(res, 400, { error: "bad" });
        DB.docs.users[user.id].h = hh(user.id, neu);
        DB.docs.users[user.id].must = false;
      } else return json(res, 400, { error: "bad" });
      Object.values(DB.tokens).forEach(t => { if (t.id === user.id) t.must = false; });
      save();
      return json(res, 200, { ok: 1 });
    }

    if (p === "/api/users" && req.method === "GET") {
      const user = getUser(req);
      if (!user || user.role !== "admin") return json(res, 403, { error: "blocked" });
      const list = Object.entries(DB.docs.users || {}).map(([id, x]) => ({
        id, name: x.name || id, role: x.role, ok: x.ok !== false, link: x.link
      }));
      list.unshift({ id: "admin", name: "Admin", role: "admin", ok: true });
      return json(res, 200, { users: list });
    }

    if (p === "/api/users" && req.method === "POST") {
      const user = getUser(req);
      if (!user || user.role !== "admin") return json(res, 403, { error: "blocked" });
      const body = await readBody(req);
      const role = body.role === "parent" ? "parent" : "teacher";
      const link = String(body.link || "").trim();
      if (!link) return json(res, 400, { error: "nolink" });
      let name = link;
      if (role === "teacher") {
        const t = (DB.docs.staff || []).find(x => x.id === link);
        if (!t) return json(res, 400, { error: "nolink" });
        name = t.name;
      } else {
        const s = (DB.docs.stu || []).find(x => x.id === link);
        if (!s) return json(res, 400, { error: "nolink" });
        name = s.pn || s.name;
      }
      const id = link.toLowerCase();
      if (DB.docs.users[id] || id === "admin") return json(res, 400, { error: "exists" });
      const tmp = rnd4() + rnd4();
      DB.docs.users[id] = { role, link, name, h: hh(id, tmp), ok: true, must: true };
      save();
      return json(res, 200, { id, tmp });
    }

    const uop = p.match(/^\/api\/users\/([^/]+)\/(toggle|reset|delete)$/);
    if (uop && req.method === "POST") {
      const user = getUser(req);
      if (!user || user.role !== "admin") return json(res, 403, { error: "blocked" });
      const id = decodeURIComponent(uop[1]).toLowerCase();
      const op = uop[2];
      if (id === "admin" || !DB.docs.users[id]) return json(res, 400, { error: "bad" });
      if (op === "toggle") { DB.docs.users[id].ok = !DB.docs.users[id].ok; save(); return json(res, 200, { ok: 1 }); }
      if (op === "reset") {
        const tmp = rnd4() + rnd4();
        DB.docs.users[id].h = hh(id, tmp);
        DB.docs.users[id].must = true;
        save();
        return json(res, 200, { tmp });
      }
      if (op === "delete") { delete DB.docs.users[id]; save(); return json(res, 200, { ok: 1 }); }
    }

    if (p === "/api/backup" && req.method === "GET") {
      const user = getUser(req);
      if (!user || user.role !== "admin") return json(res, 403, { error: "blocked" });
      const { users, ...docs } = DB.docs;
      return json(res, 200, { app: "naleti", v: 1, docs });
    }

    if (p === "/api/restore" && req.method === "POST") {
      const user = getUser(req);
      if (!user || user.role !== "admin") return json(res, 403, { error: "blocked" });
      const body = await readBody(req);
      if (!body.docs || typeof body.docs !== "object") return json(res, 400, { error: "badfile" });
      const keepUsers = DB.docs.users;
      const keepH = DB.docs.cfg && DB.docs.cfg.adminH;
      const keepD = DB.docs.cfg && DB.docs.cfg.adminDef;
      DB.docs = { ...emptyDocs(), ...body.docs, users: keepUsers };
      if (!DB.docs.cfg.adminH) { DB.docs.cfg.adminH = keepH; DB.docs.cfg.adminDef = keepD; }
      save();
      return json(res, 200, { ok: 1 });
    }

    res.writeHead(404); res.end("Not found");
  } catch (e) {
    console.error(e);
    json(res, 500, { error: "error" });
  }
});

server.listen(PORT, () => {
  console.log("Naleti Academy on port " + PORT);
  console.log("Login: admin / 1234");
});
