window.APP_CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbz_lS7OcfQzS2r5dzRSPiLxosvWP2RGew6dgTOYDY8KgyP45fWqJVbiAV6pqZ5DSQCyBw/exec",
  BOT: "@kuxni_help_bot",
  APP_VERSION: 2,
  PLANS: {
    month:   { label: "Месяц",    days: 30,  rub: 999,  stars: 600 },
    year:    { label: "Год",      days: 365, rub: 2999, stars: 1800 },
    forever: { label: "Навсегда", days: 0,   rub: 5999, stars: 3600 },
  },
};
// локальная проверка без Telegram: демо-режим, доступ включается ?paid=1
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") window.APP_CONFIG.API_URL = "";
