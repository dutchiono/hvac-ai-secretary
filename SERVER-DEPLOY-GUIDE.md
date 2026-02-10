# Server Deploy Guide for AI Agents

## Server: 198.71.54.203 (Ubuntu 24.04)

This guide is for AI agents building and deploying websites on this server.
You do NOT need SSH access. You push to GitHub, the workflow deploys for you.

---

## How Deployment Works

1. You push code to the `main` branch on GitHub
2. GitHub Actions runs `.github/workflows/deploy.yml`
3. The workflow SSHes into the server, pulls your code, installs deps, restarts the service
4. The website updates automatically

**You never touch the server directly. Just push to `main`.**

---

## Setting Up a New Project

### What you (the agent) need from the human:

1. A **GitHub repo** with your code
2. A **username** on the server (the human creates this)
3. A **password** for that user (the human provides this)
4. A **port number** that isn't already in use
5. A **domain** (e.g., `mysite.bushleague.xyz`)

### What the human sets up on the server (one-time):

1. Creates a Linux user for your project
2. Creates `/var/www/YOUR_PROJECT` owned by that user
3. Creates a systemd service to run your app
4. Creates an nginx config pointing the domain to your port
5. Gets an SSL cert with certbot
6. Sets up GitHub Secrets in your repo

### Ports already in use (DO NOT USE THESE):

- 3000 (bags-web)
- 3001 (in use)
- 3003 (bags-renderer)
- 3042 (bags-builder)
- 3145 (hvac-ai-secretary)
- 3456, 3457 (in use)
- 3847 (forum-api)
- 5432 (postgres)
- 7890 (in use)

Pick a port not on this list. Recommended range: 3100-3899.

---

## Your Project Must Have

### 1. `package.json` with a start script

```json
{
  "scripts": {
    "start": "node server.js"
  }
}
```

### 2. A server entry point (e.g., `server.js`)

Must read the port from the `PORT` environment variable:

```js
const PORT = process.env.PORT || 3000;
```

### 3. A `public/` directory with `index.html`

If you want a webpage served, put static files in `public/` and add this to your Express app:

```js
app.use(express.static('public'));
```

### 4. `.github/workflows/deploy.yml`

Copy this exactly, only change `APP_DIR` and service name:

```yaml
name: Deploy to Server

on:
  push:
    branches:
      - main
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Deploy to server
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          password: ${{ secrets.SERVER_PASSWORD }}
          script: |
            set -e

            APP_DIR="/var/www/YOUR_PROJECT_NAME"
            REPO_URL="https://github.com/dutchiono/YOUR_REPO.git"

            echo "Starting deployment..."

            if [ -d "$APP_DIR/.git" ]; then
              echo "Pulling latest changes..."
              cd $APP_DIR
              git pull origin main
            else
              echo "Initial clone..."
              git clone $REPO_URL $APP_DIR
              cd $APP_DIR
            fi

            echo "Installing dependencies..."
            npm install --omit=dev

            echo "Restarting service..."
            sudo systemctl restart YOUR_SERVICE_NAME

            echo "Deployment complete!"
            sudo systemctl status YOUR_SERVICE_NAME --no-pager
```

### 5. GitHub Secrets (human sets these)

| Secret | Value |
|--------|-------|
| `SERVER_HOST` | `198.71.54.203` |
| `SERVER_USER` | your project's Linux username |
| `SERVER_PASSWORD` | your project's Linux password |

---

## Tolerating Missing Config

Your app MUST start without API keys or database credentials.
The server may not have a `.env` file ready when you first deploy.

- Do NOT initialize API clients (Twilio, Stripe, etc.) at the top level
- Use lazy initialization — only create clients when actually called
- Database connection errors should be logged, not thrown
- The homepage should load even if the backend isn't fully configured

Example of lazy init:

```js
let client = null;
function getClient() {
  if (!client && process.env.API_KEY) {
    client = new SomeSDK(process.env.API_KEY);
  }
  return client;
}
```

---

## Existing Users

| User | Project | Port | Domain | App Dir |
|------|---------|------|--------|---------|
| hvac | hvac-ai-secretary | 3145 | hvac.bushleague.xyz | /var/www/hvac-ai-secretary |
| sshappy | (not deployed yet) | TBD | TBD | /var/www/sshappy |
| lawn | (not deployed yet) | TBD | TBD | /var/www/lawn |

---

## What the Human Does on the Server (for reference)

This is NOT for agents to run. This is what the human does when setting up a new project.

```bash
# 1. Create user
adduser --disabled-password --gecos "Description" USERNAME
PASSWORD=$(openssl rand -base64 18 | tr -d '/+=' | head -c 24)
echo "USERNAME:$PASSWORD" | chpasswd

# 2. Create app directory
mkdir -p /var/www/PROJECT
chown USERNAME:USERNAME /var/www/PROJECT

# 3. Give limited sudo
cat > /etc/sudoers.d/USERNAME << 'EOF'
USERNAME ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart SERVICE_NAME
USERNAME ALL=(ALL) NOPASSWD: /usr/bin/systemctl stop SERVICE_NAME
USERNAME ALL=(ALL) NOPASSWD: /usr/bin/systemctl start SERVICE_NAME
USERNAME ALL=(ALL) NOPASSWD: /usr/bin/systemctl status SERVICE_NAME
USERNAME ALL=(ALL) NOPASSWD: /usr/bin/systemctl reload nginx
EOF
chmod 440 /etc/sudoers.d/USERNAME

# 4. Create systemd service
cat > /etc/systemd/system/SERVICE_NAME.service << 'EOF'
[Unit]
Description=Project Description
After=network.target

[Service]
Type=simple
User=USERNAME
WorkingDirectory=/var/www/PROJECT
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=XXXX

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable SERVICE_NAME

# 5. Create nginx config in /etc/nginx/conf.d/DOMAIN.conf
# (nginx.conf includes both conf.d/*.conf and sites-enabled/*)
cat > /etc/nginx/sites-available/DOMAIN << 'EOF'
server {
    listen 80;
    server_name DOMAIN;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name DOMAIN;

    ssl_certificate /etc/letsencrypt/live/DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/DOMAIN/privkey.pem;

    location / {
        proxy_pass http://localhost:PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF
ln -sf /etc/nginx/sites-available/DOMAIN /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# 6. Get SSL cert
certbot --nginx -d DOMAIN --non-interactive --agree-tos --email dutchiono@gmail.com

# 7. Set GitHub Secrets in repo settings
```
