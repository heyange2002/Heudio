#!/bin/bash
set -euo pipefail
# Config contains secrets and is fetched privately, never embedded in user data.
REGION=ap-southeast-2
BUCKET=soundisle-deploy-818381394387-ap-southeast-2
dnf install -y nodejs24 nodejs24-npm nginx
id soundisle >/dev/null 2>&1 || useradd --system --home-dir /opt/soundisle --shell /sbin/nologin soundisle
install -d -m 750 -o soundisle -g soundisle /opt/soundisle
aws s3 cp "s3://$BUCKET/releases/current.tar.gz" /tmp/soundisle.tar.gz --region "$REGION"
tar -xzf /tmp/soundisle.tar.gz -C /opt/soundisle
install -d -m 700 /etc/soundisle
aws s3 cp "s3://$BUCKET/private/runtime.json" /etc/soundisle/runtime.json --region "$REGION"
chmod 600 /etc/soundisle/runtime.json
cd /opt/soundisle
# Keep versions and integrity hashes; use the upstream registry from AWS.
node --input-type=module -e "import fs from 'node:fs'; const p='package-lock.json'; fs.writeFileSync(p,fs.readFileSync(p,'utf8').replaceAll('https://registry.npmmirror.com/','https://registry.npmjs.org/'));"
npm ci --no-audit --no-fund --fetch-timeout=60000 --fetch-retries=1
node --input-type=module <<'NODE'
import fs from 'node:fs';
const config=JSON.parse(fs.readFileSync('/etc/soundisle/runtime.json','utf8'));
fs.writeFileSync('/etc/soundisle/app.env',Object.entries({...config.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:'3000',TRUST_LOOPBACK_PROXY:'true'}).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n',{mode:0o600});
fs.writeFileSync('/etc/nginx/conf.d/soundisle.conf',`server {
 listen 8080 default_server;
 server_name _;
 if ($http_x_soundisle_origin != "${config.originToken}") { return 403; }
 client_max_body_size 12m;
 location = /healthz { access_log off; return 200 'ok'; add_header Content-Type text/plain; }
 location / {
   proxy_pass http://127.0.0.1:3000;
   proxy_http_version 1.1;
   proxy_set_header Host $http_host;
   proxy_set_header X-Forwarded-Proto https;
   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   proxy_buffering off;
   proxy_read_timeout 180s;
 }
}
`);
NODE
chown -R soundisle:soundisle /opt/soundisle
cat > /etc/systemd/system/soundisle.service <<'SERVICE'
[Unit]
Description=SoundIsle music companion
After=network-online.target
Wants=network-online.target
[Service]
User=soundisle
Group=soundisle
WorkingDirectory=/opt/soundisle
EnvironmentFile=/etc/soundisle/app.env
ExecStart=/usr/bin/node /opt/soundisle/node_modules/tsx/dist/cli.mjs server.ts
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/soundisle/.data
[Install]
WantedBy=multi-user.target
SERVICE
install -d -m 700 -o soundisle -g soundisle /opt/soundisle/.data
systemctl daemon-reload
systemctl enable --now soundisle
nginx -t
systemctl enable --now nginx
