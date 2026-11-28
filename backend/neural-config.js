/*
 * Neural deployment settings.
 * This file is served to every visitor. Only put PUBLIC configuration here.
 * Never put Groq, Hyperbeam, Turnstile secret, Firebase service-account,
 * passphrase, or token-signing secrets in this file.
 */
window.NEURAL_CONFIG = Object.freeze({
  // Cloudflare Worker URLs. Keep the trailing slash.
  aiApiUrl: "https://api.sapktaayush.workers.dev/",
  gatekeeperUrl: "https://gatekeeper.sapktaayush.workers.dev/",
  wispUrl: "wss://proxy-scramjet-8xz5.onrender.com/wisp/",
  scramjetPrefix: "/scramjet/",

  // Public Cloudflare Turnstile site key (not the secret key).
  turnstileSiteKey: "0x4AAAAAAGWlP_bSshAjBaAh",

  // Firebase Web App config. Firebase apiKey is a public project identifier,
  // not a server credential. Protect data with Realtime Database rules.
  firebase: {
    apiKey: "AIzaSyC2-OgUKegzi63XA2LuEzJ7MEtv9hmuhzo",
    authDomain: "ubg1-363a4.firebaseapp.com",
    databaseURL: "https://ubg1-363a4-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "ubg1-363a4",
    storageBucket: "ubg1-363a4.firebasestorage.app",
    messagingSenderId: "151276635335",
    appId: "1:151276635335:web:e4bf6a4a2084fc44da6ae2",
    measurementId: "G-BVD0EJ18T1"
  },

  // Firebase email verification / password-reset redirect destination.
  // Add this hostname to Firebase Authentication > Settings > Authorized domains.
  emailActionUrl: "https://neural.qzz.io/?from=chat-email",

  // Display name and model sent by the browser. The Worker enforces its own model.
  aiName: "Neural AI",
  aiModel: "openai/gpt-oss-20b"
});
