window.APP_CONFIG = {
  API_URL: "", // адрес веб-приложения бота (…/exec) — вписать после публикации bot/Code.gs
  BOT: "",
  APP_VERSION: 1,
  PLANS: {
    month:   { label: "Месяц",    days: 30,  rub: 999,  stars: 600 },
    year:    { label: "Год",      days: 365, rub: 2999, stars: 1800 },
    forever: { label: "Навсегда", days: 0,   rub: 5999, stars: 3600 },
  },
};
// локальная проверка без Telegram: демо-режим, доступ включается ?paid=1
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") window.APP_CONFIG.API_URL = "";
