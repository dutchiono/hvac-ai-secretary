# M. Jacob Company - HVAC Website

Modern, responsive website for M. Jacob Company HVAC services in Pittsburgh, PA.

## Features

- **Modern Dark Theme Design** - Clean aesthetic inspired by modern tech portfolios
- **Fully Responsive** - Mobile-first design with hamburger menu on small screens
- **Booking Modal** - Interactive service request form
- **Standalone Frontend** - Works without backend dependencies
- **Smooth Animations** - Professional transitions and hover effects
- **SEO Optimized** - Semantic HTML with proper meta tags

## Files

- `index.html` - Main website page
- `style.css` - Complete styling with dark theme and responsive design
- `script.js` - JavaScript for modal, navigation, and form handling

## Installation

### Option 1: Static Hosting (No Backend)

1. **Copy files to your web server:**
   ```bash
   # Upload index.html, style.css, and script.js to your web root
   scp index.html style.css script.js user@yourserver:/var/www/html/
   ```

2. **Configure your web server (nginx example):**
   ```nginx
   server {
       listen 80;
       server_name mjacobcompany.com;
       root /var/www/html;
       index index.html;
       
       location / {
           try_files $uri $uri/ =404;
       }
   }
   ```

3. **Restart nginx:**
   ```bash
   sudo systemctl restart nginx
   ```

**How it works without a backend:**
- Form submissions are saved to browser's `localStorage`
- Users get option to send via email (`mailto:` link)
- Manual follow-up by checking stored submissions or via phone/email

### Option 2: With Backend API (Recommended)

The frontend will automatically use your backend API if available at `/api/bookings`.

**Backend Requirements:**
- `POST /api/bookings` endpoint that accepts JSON
- Must return HTTP 200 on success

**Expected JSON format:**
```json
{
  "name": "John Smith",
  "phone": "(412) 555-1234",
  "email": "john@example.com",
  "service": "Service Call",
  "address": "123 Main St, Pittsburgh, PA 15201",
  "date": "2026-02-25",
  "notes": "AC not cooling properly",
  "timestamp": "2026-02-17T18:45:00.000Z"
}
```

**Backend Setup (Node.js + Express + PostgreSQL):**

You already have the backend in the repository at:
- `hvac-backend/server.js` - Express server
- `hvac-backend/routes/bookings.js` - Booking endpoint
- `hvac-backend/db.js` - PostgreSQL connection

To use it:

1. **Install dependencies:**
   ```bash
   cd hvac-backend
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   # Create .env file
   cat > .env << EOF
   PORT=3000
   DATABASE_URL=postgresql://username:password@localhost:5432/hvac_crm
   EOF
   ```

3. **Initialize the database:**
   ```bash
   psql -U postgres -d hvac_crm -f ../hvac-crm-schema.sql
   ```

4. **Start the backend:**
   ```bash
   npm start
   # Or with PM2 for production:
   pm2 start server.js --name hvac-api
   ```

5. **Configure nginx as reverse proxy:**
   ```nginx
   server {
       listen 80;
       server_name mjacobcompany.com;
       
       # Frontend static files
       root /var/www/html;
       index index.html;
       
       # Backend API proxy
       location /api/ {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
       
       # Frontend routes
       location / {
           try_files $uri $uri/ =404;
       }
   }
   ```

## Booking Form Behavior

### Without Backend:
1. Form data saved to browser localStorage
2. Success message shown to user
3. User prompted to optionally send via email (opens mail client)
4. Manual follow-up required by checking localStorage or via direct contact

### With Backend:
1. Form submitted to `POST /api/bookings`
2. Saved to PostgreSQL database
3. Appears in dispatch dashboard (`dispatch.html`)
4. Mark can assign jobs to technicians

## Checking Stored Bookings (No Backend)

If running without a backend, bookings are stored in the browser's localStorage. To retrieve them:

1. Open browser console (F12)
2. Run:
   ```javascript
   JSON.parse(localStorage.getItem('hvac_bookings'))
   ```

3. Or create a simple admin page to view them (admin.html):
   ```html
   <!DOCTYPE html>
   <html>
   <head><title>Bookings</title></head>
   <body>
       <h1>Stored Bookings</h1>
       <div id="bookings"></div>
       <script>
           const bookings = JSON.parse(localStorage.getItem('hvac_bookings') || '[]');
           document.getElementById('bookings').innerHTML = 
               bookings.map(b => `
                   <div style="border:1px solid #ccc; padding:1rem; margin:1rem 0;">
                       <strong>${b.name}</strong> - ${b.phone}<br>
                       Service: ${b.service}<br>
                       Date: ${b.date}<br>
                       Address: ${b.address}<br>
                       Notes: ${b.notes}<br>
                       <small>Submitted: ${b.timestamp}</small>
                   </div>
               `).join('');
       </script>
   </body>
   </html>
   ```

## Mobile Navigation

The navigation automatically converts to a hamburger menu on screens smaller than 768px:
- Click the hamburger icon to open/close menu
- Menu items are full-width and vertically stacked
- Smooth animations for open/close
- Closes automatically when a link is clicked

## Color Scheme

Based on your personal portfolio aesthetic:
- **Background:** `#0a0a0f` (dark blue-black)
- **Elevated surfaces:** `#111118` (slightly lighter)
- **Accent:** `#3b82f6` (professional blue)
- **Text:** `#f5f5f7` (off-white)
- **Borders:** Subtle rgba white at low opacity

## Browser Support

- Chrome/Edge: Full support
- Firefox: Full support  
- Safari: Full support
- Mobile browsers: Full support with responsive design

## Performance

- No external dependencies except Google Fonts (Space Grotesk)
- Minimal CSS (~15KB)
- Minimal JavaScript (~9KB)
- Fast load times
- Smooth 60fps animations

## Support

For questions or issues:
- Email: info@mjacobcompany.com
- Phone: (412) 512-0425

## License

© 2026 M. Jacob Company. All rights reserved.
