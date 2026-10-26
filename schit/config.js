/* Настройки приложения. API_URL — адрес бота на Apps Script после публикации. Пока пусто — демо-режим: полный доступ включается ?paid=1 */
window.APP_CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbxlNzkjiPyJxOBe7N-TBh-qg9vaPysvFqu_Dr53UQpSmZetv466ruqvuRvzrYX7_usC/exec",
  BOT: "",                 // @username бота, когда появится
  PLANS: [
    { k: "month", t: "Месяц", rub: 999, stars: 600, note: "30 дней полного доступа" },
    { k: "year", t: "Год", rub: 2999, stars: 1800, note: "365 дней, выгоднее помесячной в 4 раза" },
    { k: "forever", t: "Навсегда", rub: 5999, stars: 3600, note: "один раз и без продлений" },
  ],
};
// локальная проверка без Telegram: демо-режим, доступ включается ?paid=1
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") window.APP_CONFIG.API_URL = "";
