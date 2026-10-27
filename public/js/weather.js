// Potsdam, NY weather for the sign-in page: Open-Meteo (no key needed) + National Weather Service alerts.
// Purely informational; if either service is down, the bar just stays hidden.
import { esc } from "./shared.js";

const LAT = 44.6698, LON = -74.9813, CACHE = "pvrsWx", TTL = 15 * 60e3;
const FORECAST = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}`
  + "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day"
  + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset"
  + "&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FNew_York&forecast_days=4";
const ALERTS = `https://api.weather.gov/alerts/active?point=${LAT},${LON}`;

// WMO weather codes → words + icon
const KIND = c => c === 0 ? "clear" : c <= 2 ? "partly" : c === 3 ? "cloudy" : c <= 48 ? "fog" : c <= 67 || (c >= 80 && c <= 82) ? "rain" : c <= 77 || c === 85 || c === 86 ? "snow" : "storm";
const WORDS = { 0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Freezing fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
  56: "Freezing drizzle", 57: "Freezing drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow",
  77: "Snow grains", 80: "Rain showers", 81: "Rain showers", 82: "Heavy showers", 85: "Snow showers", 86: "Heavy snow showers", 95: "Thunderstorms", 96: "Thunderstorms with hail", 99: "Thunderstorms with hail" };
const S = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
const SUN = `<circle cx="12" cy="12" r="4.2" ${S}/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" ${S}/>`;
const MOON = `<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" ${S}/>`;
const CLOUD = `<path d="M7 18.5h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7.1 9.6 4.5 4.5 0 0 0 7 18.5z" ${S}/>`;
function icon(code, day = true){
  const k = KIND(code);
  const g = k === "clear" ? (day ? SUN : MOON)
    : k === "partly" ? `<g transform="translate(-3 -3) scale(.75)">${day ? SUN : MOON}</g><path d="M9 20h8.5a3.5 3.5 0 0 0 .5-6.96A4.8 4.8 0 0 0 9.1 12 3.9 3.9 0 0 0 9 20z" ${S}/>`
    : k === "cloudy" ? CLOUD
    : k === "fog" ? `<path d="M4 9h16M3 13h18M5 17h14" ${S}/>`
    : k === "rain" ? `<path d="M7 15h10a3.8 3.8 0 0 0 .6-7.5A5.2 5.2 0 0 0 7.6 6.6 4.3 4.3 0 0 0 7 15z" ${S}/><path d="M8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5" ${S}/>`
    : k === "snow" ? `<path d="M7 15h10a3.8 3.8 0 0 0 .6-7.5A5.2 5.2 0 0 0 7.6 6.6 4.3 4.3 0 0 0 7 15z" ${S}/><path d="M8.5 19h.01M12 20.5h.01M15.5 19h.01" ${S} stroke-width="2.6"/>`
    : `<path d="M7 14h10a3.8 3.8 0 0 0 .6-7.5A5.2 5.2 0 0 0 7.6 5.6 4.3 4.3 0 0 0 7 14z" ${S}/><path d="M12.5 15.5l-2 3.2h3l-2 3.3" ${S}/>`;
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${g}</svg>`;
}

async function getJSON(url, headers){ const r = await fetch(url, { headers }); if (!r.ok) throw new Error(r.status); return r.json(); }
async function load(){
  try { const c = JSON.parse(sessionStorage.getItem(CACHE) || "null"); if (c && Date.now() - c.at < TTL) return c; } catch {}
  const [fc, al] = await Promise.allSettled([getJSON(FORECAST), getJSON(ALERTS, { Accept: "application/geo+json" })]);
  if (fc.status !== "fulfilled") throw new Error("forecast unavailable");
  const alerts = al.status === "fulfilled" ? (al.value.features || []).map(f => f.properties || {}).filter(p => p.event && (!p.ends || new Date(p.ends) > new Date()))
    .map(p => ({ event: p.event, ends: p.ends || p.expires || "" })).slice(0, 2) : [];
  const out = { at: Date.now(), fc: fc.value, alerts };
  try { sessionStorage.setItem(CACHE, JSON.stringify(out)); } catch {}
  return out;
}

export async function startWeather(el){
  if (!el || el.dataset.started) return; el.dataset.started = "1";
  try {
    const { fc, alerts } = await load(), c = fc.current, d = fc.daily;
    const day = c.is_day !== 0;
    const alert = alerts[0];
    // Slim glass banner — now/primary + facts row that wraps cleanly on phones
    el.innerHTML = `<div class="wx-now">
        <span class="wx-ic">${icon(c.weather_code, day)}</span>
        <span class="wx-temp">${Math.round(c.temperature_2m)}°</span>
        <span class="wx-cond">${esc(WORDS[c.weather_code] || "")}</span>
      </div>
      <div class="wx-meta">
        <span>H ${Math.round(d.temperature_2m_max[0])}° · L ${Math.round(d.temperature_2m_min[0])}°</span>
        <span>Wind ${Math.round(c.wind_speed_10m)} mph</span>
        <span class="wx-place">Potsdam</span>
      </div>
      ${alert ? `<div class="wx-alert" role="note">${esc(alert.event)}</div>` : ""}`;
    el.hidden = false;
  } catch { el.hidden = true; }
}
