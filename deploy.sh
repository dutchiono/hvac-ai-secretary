#!/bin/bash
# Safe deployment script for multi-site server
# This ONLY sets up hvac.bushleague.xyz without touching existing sites

set -e  # Exit on any error

echo "========================================="
echo "HVAC AI Secretary - Safe Deployment"
echo "Domain: hvac.bushleague.xyz"
echo "========================================="

# Configuration
DOMAIN="hvac.bushleague.xyz"
APP_DIR="/var/www/hvac-ai-secretary"
APP_PORT=3001
DB_NAME="hvac_crm"
DB_USER="hvac_user"
DB_PASS=$(openssl rand -base64 32)

echo "Step 1: Installing dependencies (if not present)..."
# Check what's already installed
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt install -y nodejs
else
    echo "Node.js already installed: $(node --version)"
fi

if ! command -v psql &> /dev/null; then
    echo "Installing PostgreSQL..."
    sudo apt install -y postgresql postgresql-contrib
else
    echo "PostgreSQL already installed"
fi

if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    sudo npm install -g pm2
else
    echo "PM2 already installed"
fi

if ! command -v certbot &> /dev/null; then
    echo "Installing Certbot for SSL..."
    sudo apt install -y certbot python3-certbot-nginx
else
    echo "Certbot already installed"
fi

echo ""
echo "Step 2: Creating application directory..."
sudo mkdir -p $APP_DIR
sudo chown -R $USER:$USER $APP_DIR

echo ""
echo "Step 3: Cloning repository..."
cd $APP_DIR
if [ -d ".git" ]; then
    echo "Repository exists, pulling latest..."
    git pull
else
    git clone https://github.com/dutchiono/hvac-ai-secretary.git .
fi

echo ""
echo "Step 4: Installing npm packages..."
npm install

echo ""
echo "Step 5: Setting up PostgreSQL database..."
sudo -u postgres psql <<EOF
-- Create database and user (will skip if exists)
SELECT 'CREATE DATABASE $DB_NAME' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\gexec
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_user WHERE usename = '$DB_USER') THEN
    CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';
  END IF;
END
\$\$;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOF

echo ""
echo "Step 6: Running database schema..."
sudo -u postgres psql -d $DB_NAME -f hvac-crm-schema.sql || echo "Schema already exists or error (continuing...)"

echo ""
echo "Step 7: Creating .env file..."
cat > .env <<EOF
# Server Configuration
PORT=$APP_PORT
NODE_ENV=production
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME

# Twilio (you'll need to add these)
TWILIO_ACCOUNT_SID=your_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=your_twilio_phone_here

# OpenAI (you'll need to add this)
OPENAI_API_KEY=your_openai_key_here

# Business Settings
BUSINESS_NAME=Your HVAC Company
BUSINESS_PHONE=+1234567890
BUSINESS_ADDRESS=123 Main St, City, ST 12345
EOF

echo ""
echo "Step 8: Creating Nginx site config (SAFE - only adds new site)..."
sudo tee /etc/nginx/sites-available/hvac.bushleague.xyz > /dev/null <<'EOF'
server {
    listen 80;
    server_name hvac.bushleague.xyz;

    # API proxy
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static files (chat widget, etc)
    location / {
        root /var/www/hvac-ai-secretary/public;
        try_files $uri $uri/ @backend;
    }

    # Fallback to Node.js for non-static routes
    location @backend {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

echo ""
echo "Step 9: Enabling site and testing Nginx config..."
sudo ln -sf /etc/nginx/sites-available/hvac.bushleague.xyz /etc/nginx/sites-enabled/
sudo nginx -t

if [ $? -eq 0 ]; then
    echo "Nginx config is valid!"
    sudo systemctl reload nginx
else
    echo "ERROR: Nginx config test failed. Not reloading."
    exit 1
fi

echo ""
echo "Step 10: Creating public directory for static files..."
mkdir -p $APP_DIR/public
cp chat-widget.html $APP_DIR/public/index.html

echo ""
echo "Step 11: Starting application with PM2..."
pm2 delete hvac-ai-secretary 2>/dev/null || true
pm2 start server.js --name hvac-ai-secretary
pm2 save
pm2 startup | tail -n 1 | sudo bash

echo ""
echo "========================================="
echo "✓ Deployment Complete!"
echo "========================================="
echo ""
echo "IMPORTANT - Next Steps:"
echo ""
echo "1. DNS: Point hvac.bushleague.xyz to this server's IP"
echo "   A record: hvac.bushleague.xyz -> YOUR_SERVER_IP"
echo ""
echo "2. SSL Certificate (run after DNS propagates):"
echo "   sudo certbot --nginx -d hvac.bushleague.xyz"
echo ""
echo "3. Edit .env file with your API keys:"
echo "   nano $APP_DIR/.env"
echo "   Then restart: pm2 restart hvac-ai-secretary"
echo ""
echo "4. Database password (save this):"
echo "   $DB_PASS"
echo ""
echo "App running on: http://localhost:$APP_PORT"
echo "Public URL (after DNS): http://hvac.bushleague.xyz"
echo ""
echo "Useful commands:"
echo "  pm2 logs hvac-ai-secretary    # View logs"
echo "  pm2 restart hvac-ai-secretary # Restart app"
echo "  pm2 status                    # Check status"
echo "========================================="
