/* UNITED — voice trigger ("ALERT") + GPS capture
   Drop-in helpers. Wire triggerEmergency() into your existing
   confirm-SEND flow. Requires HTTPS + mic/location permission.
   Voice recognition works in Chrome on Android; iOS Safari
   does NOT support it (the tap EMERGENCY button is the fallback). */

const UNITED = {
  keyword: "ALERT",
  recog: null,
  lastFix: null, // {lat, lon, accuracy, time}
  listening: false,
};

/* ---------- 1. VOICE ACTIVATION ---------- */
function startVoiceTrigger(onAlert) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    console.warn("Voice not supported here — use the EMERGENCY button.");
    return false;
  }
  const r = new SR();
  r.continuous = true;        // keep listening
  r.interimResults = true;    // check partial results too (faster trigger)
  r.lang = "en-US";
  r.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const text = e.results[i][0].transcript.toUpperCase();
      if (text.includes(UNITED.keyword)) {
        stopVoiceTrigger();
        onAlert();            // <-- call your confirm-SEND screen here
        return;
      }
    }
  };
  r.onend = () => {           // auto-restart so it never stops listening
    if (UNITED.listening) { try { r.start(); } catch (_) {} }
  };
  r.onerror = (e) => console.warn("voice error:", e.error);
  UNITED.recog = r;
  UNITED.listening = true;
  r.start();
  return true;
}

function stopVoiceTrigger() {
  UNITED.listening = false;
  if (UNITED.recog) { try { UNITED.recog.stop(); } catch (_) {} }
}

/* ---------- 2. GPS COORDINATES ---------- */
function getGPS() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        UNITED.lastFix = {
          lat: pos.coords.latitude.toFixed(6),
          lon: pos.coords.longitude.toFixed(6),
          accuracy: Math.round(pos.coords.accuracy), // meters
          time: new Date(pos.timestamp).toISOString(),
        };
        resolve(UNITED.lastFix);
      },
      (err) => { console.warn("gps error:", err.message); resolve(null); },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

// Optional: keep a live fix warming up so SEND never waits on GPS
function warmupGPS() {
  if (!navigator.geolocation) return;
  navigator.geolocation.watchPosition(
    (pos) => {
      UNITED.lastFix = {
        lat: pos.coords.latitude.toFixed(6),
        lon: pos.coords.longitude.toFixed(6),
        accuracy: Math.round(pos.coords.accuracy),
        time: new Date(pos.timestamp).toISOString(),
      };
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 30000 }
  );
}

/* ---------- 3. 911 MESSAGE FORMAT ---------- */
function build911Message(fix, note) {
  const lines = [
    "EMERGENCY - UNITED app voice alert",
    "Caller said \"ALERT\" and confirmed SEND.",
    fix
      ? `Location: ${fix.lat}, ${fix.lon} (GPS accuracy ~${fix.accuracy}m)`
      : "Location: GPS unavailable - caller location unknown",
    `Time: ${fix ? fix.time : new Date().toISOString()}`,
    "Needs: EMS. Caller may be unable to speak.",
  ];
  if (note) lines.push("Note: " + note);
  return lines.join("\n");
}

// No-token dispatch path: opens SMS to 911 with the message filled in
// (text-to-911 works in most US areas, including Houston/Harris County)
function sendViaSMSTo911(message) {
  window.location.href = "sms:911?body=" + encodeURIComponent(message);
}

/* ---------- 4. WIRING EXAMPLE ---------- */
// On page load:
warmupGPS();
startVoiceTrigger(() => showConfirmScreen());

// Confirm screen: your existing "Confirm SEND to EMS" UI calls this:
async function onConfirmSend() {
  const fix = UNITED.lastFix || (await getGPS());
  const msg = build911Message(fix);
  // TEST mode: show msg on screen instead of sending
  if (document.body.dataset.mode === "TEST") {
    alert("TEST MODE — would send:\n\n" + msg);
    return;
  }
  sendViaSMSTo911(msg);
}

function showConfirmScreen() {
  // hook into your existing confirm UI, e.g.:
  // document.getElementById("confirm-send").style.display = "block";
  console.log("ALERT heard — show confirm screen");
}
