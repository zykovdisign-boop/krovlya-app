/* Настройки приложения. API_URL — адрес веб-приложения Apps Script (bot/Code.gs) после публикации.
   Пока API_URL пустой, приложение работает в демо-режиме: доступ открывается параметром ?paid=1 в адресе. */
window.APP_CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbywNbtEV5uTdpF6OzKLdi_uivf1dcbBP4DPOV2NhiL4jxuPkJHeieuzukP0bbFqf5vaxA/exec",
  // тарифы: рубли — для подписи, звёзды приходят с сервера (свойства PRICE_MONTH / PRICE_YEAR / PRICE_FOREVER)
  PLANS: [
    { k: "month", t: "Месяц", rub: 999, stars: 600, note: "30 дней полного доступа" },
    { k: "year", t: "Год", rub: 2999, stars: 1800, note: "365 дней, выгоднее помесячной в 4 раза" },
    { k: "forever", t: "Навсегда", rub: 5999, stars: 3600, note: "один раз и без продлений" },
  ],
  BOOK_URL: "",          // ссылка на страницу покупки книги
  AUTHOR_CONTACT: "",    // @username автора для вопросов
};
// локальная проверка без Telegram: демо-режим, доступ включается ?paid=1
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") window.APP_CONFIG.API_URL = "";
