# Naleti Academy – Online HTTPS web app

One public https link for all phones. Shared data. Fingerprint works in Chrome on https.

## Login
admin / 1234  (change after first login)

## Deploy on Railway (~10 minutes)

### 1. GitHub
1. https://github.com → New repository: naleti-academy (Public)
2. Upload:
   - server.js
   - package.json
   - README.md
   - public/ folder (index.html, naleti.html, naleti-timetable.csv)

### 2. Railway
1. https://railway.app → Login with GitHub
2. New Project → Deploy from GitHub repo → naleti-academy
3. Wait for Success
4. Service → Settings → Networking → Generate Domain
5. Link example: https://naleti-academy-production-xxxx.up.railway.app

### 3. Use
Open the https link in Chrome → login admin / 1234

## Alternative: Render.com
New Web Service → same repo → start: node server.js

## Local test
npm install && npm start
Open http://localhost:3000

## Telegram message
Naleti Academy online
Open in Chrome: https://YOUR-LINK.up.railway.app
Login: admin / 1234
