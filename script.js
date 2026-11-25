/* ==========================================================
   Weather Dashboard – script.js
   Data: Open-Meteo (free, no API key) – forecast, geocoding, air quality
   ========================================================== */
const $ = id => document.getElementById(id);
const DEFAULT_PLACE = { name: 'New Delhi', admin1: 'Delhi', country: 'India', latitude: 28.6139, longitude: 77.2090 };

const state = { unit: WD.store.get('wd_unit', 'C'), place: null, data: null, aqi: null, busy: false, token: 0 };

/* ---------- WMO weather codes -> text + emoji ---------- */
const WMO = {
  0: ['Clear sky', '☀️', '🌙'], 1: ['Mainly clear', '🌤️', '🌙'], 2: ['Partly cloudy', '⛅', '☁️'], 3: ['Overcast', '☁️', '☁️'],
  45: ['Fog', '🌫️', '🌫️'], 48: ['Freezing fog', '🌫️', '🌫️'],
  51: ['Light drizzle', '🌦️', '🌧️'], 53: ['Drizzle', '🌦️', '🌧️'], 55: ['Heavy drizzle', '🌧️', '🌧️'],
  56: ['Freezing drizzle', '🌧️', '🌧️'], 57: ['Heavy freezing drizzle', '🌧️', '🌧️'],
  61: ['Light rain', '🌦️', '🌧️'], 63: ['Rain', '🌧️', '🌧️'], 65: ['Heavy rain', '🌧️', '🌧️'],
  66: ['Freezing rain', '🌧️', '🌧️'], 67: ['Heavy freezing rain', '🌧️', '🌧️'],
  71: ['Light snow', '🌨️', '🌨️'], 73: ['Snow', '❄️', '❄️'], 75: ['Heavy snow', '❄️', '❄️'], 77: ['Snow grains', '🌨️', '🌨️'],
  80: ['Light rain showers', '🌦️', '🌧️'], 81: ['Rain showers', '🌧️', '🌧️'], 82: ['Violent rain showers', '⛈️', '⛈️'],
  85: ['Light snow showers', '🌨️', '🌨️'], 86: ['Heavy snow showers', '❄️', '❄️'],
  95: ['Thunderstorm', '⛈️', '⛈️'], 96: ['Thunderstorm with hail', '⛈️', '⛈️'], 99: ['Severe thunderstorm with hail', '⛈️', '⛈️']
};
const wmo = (code, isDay = 1) => { const w = WMO[code] || ['Unknown', '🌡️', '🌡️']; return { text: w[0], icon: isDay ? w[1] : w[2] }; };
function skyFor(code, isDay) {
  if (code >= 95) return 'sky-storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'sky-snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'sky-rain';
  if (code === 45 || code === 48) return 'sky-fog';
  if (!isDay) return 'sky-night';
  if (code === 3) return 'sky-cloud';
  return '';
}

/* ---------- Helpers ---------- */
const toUnit = c => state.unit === 'F' ? Math.round(c * 9 / 5 + 32) : Math.round(c);
const deg = () => `°${state.unit}`;
const compass = d => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(d / 22.5) % 16];
const num = v => (v === null || v === undefined || Number.isNaN(v)) ? null : v;
function hm(str) { // "2026-11-23T06:20" -> "6:20 AM" (string maths only, so no timezone surprises)
  if (!str) return '--';
  let [h, m] = str.slice(11, 16).split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`;
}
function hourLabel(str) { const h = +str.slice(11, 13); return `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}`; }
function dayName(dateStr, i) {
  if (i === 0) return 'Today';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
}
const placeLabel = p => [p.name, p.admin1 && p.admin1 !== p.name ? p.admin1 : '', p.country].filter(Boolean).join(', ');
function setStatus(msg, type) { const s = $('status'); s.textContent = msg || ''; s.className = 'status' + (msg ? ' show ' + type : ''); }
async function getJSON(url, ms = 12000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

/* ---------- Load weather for a place ---------- */
async function loadWeather(place, { silent = false } = {}) {
  const my = ++state.token;
  state.busy = true; $('spinner').classList.add('spin');
  if (!silent) document.body.classList.add('loading');
  setStatus('');
  const { latitude: lat, longitude: lon } = place;
  const fUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m` +
    `&hourly=temperature_2m,precipitation_probability,weather_code,is_day,visibility,uv_index` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max,precipitation_sum` +
    `&forecast_days=7&timezone=auto&wind_speed_unit=kmh`;
  const aUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,pm10&timezone=auto`;
  try {
    const [data, aqi] = await Promise.all([getJSON(fUrl), getJSON(aUrl).catch(() => null)]); // air quality is optional
    if (my !== state.token) return;             // a newer search started – ignore this one
    state.place = place; state.data = data; state.aqi = aqi; state.updatedAt = Date.now();
    WD.store.set('wd_last_' + ME.id, place);
    render();
  } catch (err) {
    if (my !== state.token) return;
    console.error(err);
    setStatus(navigator.onLine === false
      ? 'You are offline. Connect to the internet and press Refresh.'
      : 'Could not load live weather right now. Check your connection and press Refresh.', 'error');
  } finally {
    if (my === state.token) { state.busy = false; $('spinner').classList.remove('spin'); document.body.classList.remove('loading'); }
  }
}

/* ---------- Render ---------- */
function render() {
  const { data: d, place } = state, c = d.current, dl = d.daily;
  const hourKey = c.time.slice(0, 13) + ':00';
  let hi = d.hourly.time.findIndex(t => t >= hourKey); if (hi < 0) hi = 0;
  const w = wmo(c.weather_code, c.is_day);
  const todayHi = dl.temperature_2m_max[0], todayLo = dl.temperature_2m_min[0];
  const rainP = num(dl.precipitation_probability_max[0]), rainMm = num(dl.precipitation_sum[0]);
  const uvNow = num(d.hourly.uv_index[hi]), uvMax = num(dl.uv_index_max[0]);
  const visM = num(d.hourly.visibility[hi]);
  const aq = state.aqi && state.aqi.current ? num(state.aqi.current.us_aqi) : null;

  document.body.className = skyFor(c.weather_code, c.is_day);

  $('cityName').textContent = placeLabel(place);
  $('localTime').textContent = new Intl.DateTimeFormat('en-US', { timeZone: d.timezone, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date()) + ' · local time';
  $('icon').textContent = w.icon;
  $('temperature').innerHTML = `${toUnit(c.temperature_2m)}<sup>${deg()}</sup>`;
  $('condition').textContent = w.text;
  $('feels').textContent = `Feels like ${toUnit(c.apparent_temperature)}${deg()} · High ${toUnit(todayHi)}° · Low ${toUnit(todayLo)}°`;
  $('sunrise').textContent = hm(dl.sunrise[0]); $('sunset').textContent = hm(dl.sunset[0]);
  $('obs').textContent = `Observed at ${hm(c.time)} local time`;

  // Details
  $('humidity').textContent = `${Math.round(c.relative_humidity_2m)}%`;
  $('humidityNote').textContent = c.relative_humidity_2m >= 80 ? 'Very humid' : c.relative_humidity_2m >= 60 ? 'Humid' : c.relative_humidity_2m >= 30 ? 'Comfortable' : 'Dry';
  $('wind').textContent = `${Math.round(c.wind_speed_10m)} km/h`;
  $('windNote').textContent = `From ${compass(c.wind_direction_10m)}${c.wind_gusts_10m ? ` · gusts ${Math.round(c.wind_gusts_10m)}` : ''}`;
  $('pressure').textContent = `${Math.round(c.pressure_msl)} hPa`;
  $('pressureNote').textContent = c.pressure_msl < 1000 ? 'Low – unsettled' : c.pressure_msl > 1020 ? 'High – settled' : 'Normal';
  $('visibility').textContent = visM === null ? '--' : `${(visM / 1000).toFixed(1)} km`;
  $('visNote').textContent = visM === null ? '' : visM >= 10000 ? 'Clear view' : visM >= 4000 ? 'Moderate' : visM >= 1000 ? 'Poor' : 'Very poor';
  $('uv').textContent = uvNow === null ? '--' : uvNow.toFixed(1);
  const uvl = uvLabel(uvMax ?? uvNow ?? 0);
  $('uvNote').textContent = `Today's peak ${uvMax === null ? '--' : uvMax.toFixed(1)} · ${uvl}`;
  $('rain').textContent = rainP === null ? '--' : `${rainP}%`;
  $('rainNote').textContent = rainMm === null ? '' : `${rainMm.toFixed(1)} mm expected`;
  $('cloud').textContent = `${Math.round(c.cloud_cover)}%`;
  $('cloudNote').textContent = c.cloud_cover < 20 ? 'Mostly clear' : c.cloud_cover < 60 ? 'Some clouds' : c.cloud_cover < 90 ? 'Mostly cloudy' : 'Overcast';
  if (aq === null) { $('aqi').textContent = 'N/A'; $('aqiNote').textContent = 'Not available here'; }
  else { const a = aqiLabel(aq); $('aqi').innerHTML = `${Math.round(aq)}<span class="pill" style="background:${a.color}">${a.text}</span>`; $('aqiNote').textContent = `PM2.5 ${Math.round(state.aqi.current.pm2_5)} · PM10 ${Math.round(state.aqi.current.pm10)} µg/m³`; }

  // Written report + advice
  const hiTxt = `${toUnit(todayHi)}${deg()}`, loTxt = `${toUnit(todayLo)}${deg()}`;
  let rep = `Right now in ${place.name} it is ${toUnit(c.temperature_2m)}${deg()} and ${w.text.toLowerCase()}. It feels like ${toUnit(c.apparent_temperature)}${deg()}. Today ranges from ${loTxt} to ${hiTxt}.`;
  rep += rainP >= 60 ? ` Rain is likely today (${rainP}% chance).` : rainP >= 30 ? ` There is a ${rainP}% chance of rain today.` : ' Rain is unlikely today.';
  $('report').textContent = rep;

  const tips = [];
  if (c.precipitation > 0 || (c.weather_code >= 51 && c.weather_code <= 67) || (c.weather_code >= 80 && c.weather_code <= 82)) tips.push(['☔', 'It is raining or drizzling now. Take an umbrella.']);
  else if (rainP >= 40) tips.push(['☂️', `Rain is possible later (${rainP}%). Keep an umbrella handy.`]);
  if (c.apparent_temperature >= 40) tips.push(['🥵', 'Extreme heat. Stay indoors at midday and drink plenty of water.']);
  else if (c.apparent_temperature >= 33) tips.push(['💧', 'Hot day. Drink water often and avoid long sun exposure.']);
  else if (c.apparent_temperature <= 5) tips.push(['🧥', 'Very cold. Wear a warm jacket, hat and gloves.']);
  else if (c.apparent_temperature <= 14) tips.push(['🧣', 'Cool weather. A light jacket is a good idea.']);
  if ((uvMax ?? 0) >= 6) tips.push(['🧴', `UV is ${uvl.toLowerCase()} today. Use sunscreen and sunglasses.`]);
  if (aq !== null && aq > 100) tips.push(['😷', 'Air quality is poor. Limit long outdoor activity.']);
  if (c.wind_gusts_10m >= 50) tips.push(['🌬️', 'Strong gusts expected. Secure loose items outdoors.']);
  if (c.weather_code >= 95) tips.push(['⚡', 'Thunderstorm risk. Stay indoors and away from open areas.']);
  if (visM !== null && visM < 1000) tips.push(['🚗', 'Low visibility. Drive slowly with headlights on.']);
  if (!tips.length) tips.push(['😊', 'Conditions look comfortable. Enjoy your day.']);
  $('tips').innerHTML = tips.slice(0, 4).map(t => `<li><span>${t[0]}</span><span>${t[1]}</span></li>`).join('');

  // Hourly
  $('hours').innerHTML = d.hourly.time.slice(hi, hi + 24).map((t, i) => {
    const j = hi + i, ww = wmo(d.hourly.weather_code[j], d.hourly.is_day[j]), p = num(d.hourly.precipitation_probability[j]);
    return `<div class="hour${i === 0 ? ' now-h' : ''}"><div class="t">${i === 0 ? 'Now' : hourLabel(t)}</div><div class="i">${ww.icon}</div><div class="d">${toUnit(d.hourly.temperature_2m[j])}°</div><div class="p">${p ? '💧' + p + '%' : ''}</div></div>`;
  }).join('');

  // 7-day
  const wMin = Math.min(...dl.temperature_2m_min), wMax = Math.max(...dl.temperature_2m_max), span = (wMax - wMin) || 1;
  $('days').innerHTML = dl.time.map((t, i) => {
    const ww = wmo(dl.weather_code[i], 1), lo = dl.temperature_2m_min[i], hi2 = dl.temperature_2m_max[i], p = num(dl.precipitation_probability_max[i]);
    const l = ((lo - wMin) / span) * 100, r = 100 - ((hi2 - wMin) / span) * 100;
    return `<div class="day"><span class="n">${dayName(t, i)}</span><span class="i" title="${ww.text}">${ww.icon}</span><span class="lo">${toUnit(lo)}°</span>
      <div class="range"><i style="left:${l}%;right:${r}%"></i></div><span class="hi">${toUnit(hi2)}°</span><span class="rain">${p ? '💧' + p + '%' : ''}</span></div>`;
  }).join('');
}
const uvLabel = v => v < 3 ? 'Low' : v < 6 ? 'Moderate' : v < 8 ? 'High' : v < 11 ? 'Very high' : 'Extreme';
function aqiLabel(v) {
  if (v <= 50) return { text: 'Good', color: '#14996a' }; if (v <= 100) return { text: 'Moderate', color: '#c58b00' };
  if (v <= 150) return { text: 'Sensitive', color: '#e07b00' }; if (v <= 200) return { text: 'Unhealthy', color: '#e5484d' };
  if (v <= 300) return { text: 'Very unhealthy', color: '#8f3fb8' }; return { text: 'Hazardous', color: '#7a1f2b' };
}

/* ---------- Search + suggestions ---------- */
let sugg = [], active = -1, timer = null, sugToken = 0;
async function geocode(q, count = 6) {
  const j = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=${count}&language=en&format=json`);
  return (j.results || []).map(r => ({ name: r.name, admin1: r.admin1 || '', country: r.country || '', latitude: r.latitude, longitude: r.longitude }));
}
function showSuggest(list, msg) {
  const ul = $('suggest'); sugg = list; active = -1;
  ul.innerHTML = list.length
    ? list.map((p, i) => `<li role="option" data-i="${i}"><span>${WD.esc(p.name)}</span><small>${WD.esc([p.admin1, p.country].filter(Boolean).join(', '))}</small></li>`).join('')
    : `<li class="empty">${WD.esc(msg || 'No matches')}</li>`;
  ul.classList.add('open'); $('city').setAttribute('aria-expanded', 'true');
}
function hideSuggest() { $('suggest').classList.remove('open'); $('city').setAttribute('aria-expanded', 'false'); }
function choose(p) {
  hideSuggest(); $('city').value = '';
  WD.log('search', ME.email, p.name, { city: p.name });
  addRecent(p); loadWeather(p);
}
async function doSearch() {
  const q = $('city').value.trim();
  if (!q) { setStatus('Please enter a city name.', 'info'); $('city').focus(); return; }
  if (sugg.length && !$('suggest').querySelector('.empty')) { choose(sugg[active >= 0 ? active : 0]); return; }
  try {
    setStatus('Searching…', 'info');
    const r = await geocode(q, 1);
    if (!r.length) { setStatus(`No city found for "${q}". Check the spelling or try a nearby larger city.`, 'error'); return; }
    setStatus(''); choose(r[0]);
  } catch (e) { setStatus('Search failed. Check your internet connection and try again.', 'error'); }
}
$('city').addEventListener('input', () => {
  clearTimeout(timer); const q = $('city').value.trim();
  if (q.length < 2) { hideSuggest(); sugg = []; return; }
  timer = setTimeout(async () => {
    const my = ++sugToken;
    try { const r = await geocode(q); if (my === sugToken) showSuggest(r, 'No matches. Try another spelling.'); }
    catch (e) { if (my === sugToken) showSuggest([], 'Could not search. Check your connection.'); }
  }, 250);
});
$('city').addEventListener('keydown', e => {
  const items = [...$('suggest').querySelectorAll('li[data-i]')];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!items.length) return; e.preventDefault();
    active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items.forEach((li, i) => li.classList.toggle('active', i === active));
  } else if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
  else if (e.key === 'Escape') hideSuggest();
});
$('suggest').addEventListener('mousedown', e => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); choose(sugg[+li.dataset.i]); } });
document.addEventListener('click', e => { if (!e.target.closest('.search-box')) hideSuggest(); });
$('searchBtn').addEventListener('click', doSearch);

/* ---------- Recent cities (per user) ---------- */
function recents() { return WD.store.get('wd_recent_' + ME.id, []); }
function addRecent(p) {
  const k = x => `${x.name}|${x.country}|${x.admin1}`;
  const list = [p, ...recents().filter(x => k(x) !== k(p))].slice(0, 5);
  WD.store.set('wd_recent_' + ME.id, list); drawRecent();
}
function drawRecent() {
  const list = recents(); const box = $('recent');
  box.innerHTML = list.length ? 'Recent: ' : '';
  list.forEach(p => { const b = document.createElement('button'); b.textContent = p.name; b.title = placeLabel(p); b.onclick = () => loadWeather(p); box.appendChild(b); });
}

/* ---------- My location ---------- */
$('locBtn').addEventListener('click', () => {
  if (!navigator.geolocation) { setStatus('Your browser does not support location.', 'error'); return; }
  setStatus('Finding your location…', 'info');
  navigator.geolocation.getCurrentPosition(async pos => {
    const { latitude, longitude } = pos.coords; let name = 'My location', admin1 = '', country = '';
    try {
      const g = await getJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`, 8000);
      name = g.city || g.locality || name; admin1 = g.principalSubdivision || ''; country = g.countryName || '';
    } catch (e) { /* keep generic label */ }
    setStatus(''); loadWeather({ name, admin1, country, latitude, longitude });
  }, err => setStatus(err.code === 1 ? 'Location permission was denied. Allow it in your browser, or search for a city.' : 'Could not get your location. Search for a city instead.', 'error'),
  { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
});

/* ---------- Units, refresh, user menu ---------- */
function setUnit(u) { state.unit = u; WD.store.set('wd_unit', u); $('uC').classList.toggle('on', u === 'C'); $('uF').classList.toggle('on', u === 'F'); if (state.data) render(); }
$('uC').onclick = () => setUnit('C'); $('uF').onclick = () => setUnit('F');
$('refreshBtn').onclick = () => state.place && loadWeather(state.place, { silent: true });
setInterval(() => { if (state.place && !document.hidden) loadWeather(state.place, { silent: true }); }, 10 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.place && state.data && Date.now() - state.updatedAt > 5 * 60 * 1000) loadWeather(state.place, { silent: true }); });

$('userName').textContent = ME.name.split(' ')[0]; $('avatar').textContent = ME.name.trim()[0].toUpperCase();
$('ddName').textContent = ME.name; $('ddEmail').textContent = ME.email;
if (ME.role === 'admin') $('adminLink').style.display = 'block';
$('userBtn').onclick = e => { e.stopPropagation(); const o = $('userDrop').classList.toggle('open'); $('userBtn').setAttribute('aria-expanded', o); };
document.addEventListener('click', () => $('userDrop').classList.remove('open'));
$('logoutBtn').onclick = () => WD.logout();

/* ---------- Start ---------- */
setUnit(state.unit);
drawRecent();
loadWeather(WD.store.get('wd_last_' + ME.id, DEFAULT_PLACE));
