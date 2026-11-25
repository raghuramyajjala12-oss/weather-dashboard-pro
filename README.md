# 🌤️ Weather Dashboard

Live weather for any city, with login, sign-up and an admin panel.
Plain HTML, CSS and JavaScript. No install, no build, no API key.

## Run it
Double-click **login.html** (or `index.html`). An internet connection is needed for live weather.
Optional: `python3 -m http.server 8000` in this folder, then open http://localhost:8000

## Admin login (the only admin account)
| | |
|---|---|
| Email | `admin@weatherdash.com` |
| Password | `Admin@Weather#2026` |

* Nobody can sign up as admin. Sign-up always creates a normal user, and the admin email is reserved.
* The admin account cannot be blocked or deleted. Change its password in **Admin → Settings**.
* Normal users who open `admin.html` are sent back to the dashboard.

## Pages
| File | What it does |
|---|---|
| `login.html` | Log in (admin and users use the same form) |
| `signup.html` | Create an account, with password strength meter |
| `index.html` + `script.js` | Weather dashboard |
| `admin.html` + `admin.js` | Overview charts, users (search, block, delete, CSV export), activity log, settings |
| `auth.js` | Shared login, sign-up and storage code |
| `style.css` | All styling |

## Weather accuracy
Data comes from Open-Meteo (updated every 15 minutes). The condition text and icon come from the real
weather code, with day and night icons, and the time shown is the city's own local time.
Shows temperature, feels-like, humidity, wind and gusts, pressure, visibility, UV, rain chance, cloud cover,
air quality, sunrise and sunset, next 24 hours and 7 days. Press Refresh any time. It also refreshes itself every 10 minutes.

## Before your demo
Admin → Settings → **Add demo data** fills the charts and user list with sample users. Remove it afterwards with one click.

## Honest note for judges
This is a front-end project: accounts are saved in the browser (localStorage) and passwords are salted and hashed (SHA-256).
That is perfect for a demo, but users on different devices do not share accounts. For a real launch, move
login and the user list to a server (Node, Firebase or Supabase).
