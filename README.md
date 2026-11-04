# DALA Telegram Mini App

Мини-приложение кафе и фастфуда на Next.js 14 с двуязычным меню (русский / қазақша), ценами в тенге и демонстрационной корзиной.

## Запуск

```bash
npm install
npm run dev
```

Для ответов ИИ скопируйте `.env.example` в `.env.local` и задайте `GROQ_API_KEY`. По умолчанию используется модель `openai/gpt-oss-120b`; при необходимости модель можно изменить через `GROQ_MODEL`. Ключ используется только серверным API-маршрутом и не попадает в браузер.

Откройте http://localhost:3000. Голосовой ввод использует Web Speech API и требует разрешения на микрофон; поддержка русского и казахского языков зависит от браузера. Для размещения вне localhost нужен HTTPS. Для Telegram Mini App разместите приложение на HTTPS-хостинге, подключите URL через BotFather и при необходимости интегрируйте Telegram WebApp SDK, backend для заказов и оплату.

## Заказы и Supabase

Создайте проект Supabase, заполните `NEXT_PUBLIC_SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` в `.env.local`, затем выполните содержимое `supabase/schema.sql` в SQL Editor проекта. Ключ `SUPABASE_SERVICE_ROLE_KEY` используется только на сервере и не должен иметь префикс `NEXT_PUBLIC_` или попадать в клиентский код.

Для защиты заказов создайте виджет Cloudflare Turnstile с разрешённым доменом приложения. Укажите его Site Key в `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, а Secret Key — в `TURNSTILE_SECRET_KEY`. Добавьте обе переменные в Vercel и задеплойте приложение заново. Без обеих настроек оформление заказа закрыто; токен проверяется сервером через Cloudflare перед сохранением заказа.