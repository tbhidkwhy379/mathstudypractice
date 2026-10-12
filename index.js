
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");

initializeApp({
  databaseURL:
    "https://ubg1-363a4-default-rtdb.asia-southeast1.firebasedatabase.app",
});

exports.clearChatEveryNight = onSchedule(
  {
    schedule: "0 0 * * *",
    timeZone: "Australia/Melbourne",
    region: "australia-southeast1",
  },
  async () => {
    await getDatabase()
      .ref("classroomspot-chat/messages")
      .remove();

    console.log("Chat messages cleared at Melbourne midnight.");
  }
);



const form = document.querySelector('form');
const input = document.querySelector('input');

form.addEventListener('submit', async event => {
    event.preventDefault();
    window.navigator.serviceWorker.register('./sw.js', {
        scope: __uv$config.prefix
    }).then(() => {
        let url = input.value.trim();
        if (!isUrl(url)) url = 'https://www.google.com/search?q=' + url;
        else if (!(url.startsWith('https://') || url.startsWith('http://'))) url = 'http://' + url;


        window.location.href = __uv$config.prefix + __uv$config.encodeUrl(url);
    });
});

function isUrl(val = ''){
    if (/^http(s?):\/\//.test(val) || val.includes('.') && val.substr(0, 1) !== ' ') return true;
    return false;
};
