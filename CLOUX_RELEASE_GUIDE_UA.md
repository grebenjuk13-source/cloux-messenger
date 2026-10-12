# Cloux — випуск змін без втрати акаунтів

**PR #18 — ще НЕ випущений на бойовий сайт.** Ця інструкція стосується існуючих React/Vite + FastAPI + PostgreSQL/SQLite. Не зливайте зміни в main до резервного копіювання.

## Звідки береться проблема з даними

У чинному Render застаріла SQLite використовує CLOUX_DATA=/tmp/cloux. Тимчасові файли зникають під час перезапусків і перевстановлень. Новий код підтримує PostgreSQL за DATABASE_URL, залишаючи SQLite для локальних запусків. Файли вкладень досі лежать на диску і потребують постійного тома/object storage.

## Кроки підготовки Render

1. Відкрийте https://dashboard.render.com і виберіть свій Cloux Web Service.
2. До будь-яких змін отримайте за допомогою захищеного способу резервну копію існуючого cloux.db та вкладень. Не кладіть базу в публічний GitHub. Якщо файл уже втрачено на /tmp, його може бути неможливо відновити.
3. New → Postgres: створіть базу в регіоні Frankfurt, де працює сайт. Виберіть тариф із достатнім строком зберігання і резервним копіюванням.
4. На сторінці БД скопіюйте приватний Internal Database URL (Render Web Service і PostgreSQL в одній мережі).
5. У Render → Cloux Web Service → Environment додайте приватні змінні:
    - DATABASE_URL — внутрішній рядок підключення PostgreSQL.
    - OWNER_EMAIL — grebenjuk13@gmail.com.
    - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM — налаштування поштового провайдера для шестизначного коду.
    - CLOUX_TOTP_FERNET_KEY — ключ шифрування опціонального TOTP.
    - TURN_URL, TURN_USERNAME, TURN_PASSWORD — якщо використовуються дзвінки за складного NAT.
6. Згенеруйте Fernet ключ командою: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())". Збережіть у Render, не в коді.
7. Перевірте запуск цієї гілки на окремому тестовому сервісі проти PostgreSQL. /api/health має показати persistent_storage=true.
8. Протестуйте міграцію на копії старої SQLite, і тільки тоді плануйте перемикання на production. Пряме злиття PR без цього кроку ризикує втратити доступ до старих даних.

## Міграція SQLite → PostgreSQL

1. Припиніть записи на старому Cloux, збережіть резервну копію даних.
2. Запустіть новий сервер один раз із DATABASE_URL, щоб він створив схему PostgreSQL.
3. Виконайте: python scripts/migrate_sqlite_to_postgres.py /secure/backup/cloux.db --dry-run
4. Після перевірки: python scripts/migrate_sqlite_to_postgres.py /secure/backup/cloux.db
5. Порівняйте кількість акаунтів, повідомлень, чатів та учасників у двох базах. Проведіть вхід контрольного акаунта.
6. Перенесіть медіафайли окремо. Без постійного диска фотографії, аудіо й вкладення можуть зникнути.
7. Лише після проходження тестів злийте PR #18 в main. Render має налаштоване автоматичне розгортання з main.

## Ручне призначення ролі для наявного підтвердженого акаунта

Якщо електронну адресу вже підтверджено справжнім кодом, у довіреному SQL-клієнті виконайте:

    INSERT INTO roles (user_id, role, granted_at)
    SELECT id, 'owner', CAST(EXTRACT(EPOCH FROM NOW()) AS INTEGER)
    FROM users
    WHERE LOWER(email)=LOWER('grebenjuk13@gmail.com') AND email_verified=1
    ON CONFLICT (user_id)
    DO UPDATE SET role='owner', granted_at=EXCLUDED.granted_at;

За відсутності підтвердження SQL нічого не призначить. Не ставте email_verified=1 без підтвердження; сервер додатково вимагає OWNER_EMAIL, навіть якщо рядок у roles підмінити.

## Запуск локально

Мінімум Python 3.12, Node.js 22. Виконайте встановлення pip install -r requirements.txt httpx pytest та npm install --prefix frontend; збірка npm run --prefix frontend build. Скопіюйте frontend/dist у frontend_dist. Сервер uvicorn main:app --host 127.0.0.1 --port 10000; браузер http://127.0.0.1:10000/v5/ . Backend тести: PYTHONPATH=. pytest -q tests/test_admin.py tests/test_smoke.py tests/test_social.py.

## Фінальний контроль на двох телефонах

1. Зареєструватися, закрити й відкрити — працює автологін через HttpOnly cookie.
2. Вийти вручну й спробувати відкрити захищену сторінку — потрібен новий вхід.
3. Очистити дані сайту: cookie зникне; **існуючому користувачеві потрібно увійти**, а не створювати дубль.
4. Пошта власника: до підтвердження /api/admin/overview повертає 403; після коду з'являється «Адмін-панель».
5. В іншому акаунті не можна відкрити панель через запит API, навіть якщо підробити HTML.
6. Видати/забрати значок, перевірити на другому телефоні. Змінити кольори, перевірити синхронізацію (до 4 секунд).
7. Перевірити, що адмін-панель не показує приватні повідомлення 1-на-1.
8. Перевірити набір кольорів із WCAG AA, нижню safe-area, роботу клавіатури, звукові, відеодзвінки, офлайн-екран.
9. Перевірити Android Chrome, iOS Safari та ПК; перевірити /download і реальні файли .apk/.dmg/.exe на кожній платформі.
10. Зробити пробний rollback і тільки тоді розгортати для всіх.

## Чесні обмеження

Окремого bearer access token, 50+ художніх стікерів, глобальних email/SMS-кодів для всіх, S3 медіасховища, SFU-дзвінків, підписаних нових native installers та всіх жестів Telegram у цьому PR ще немає. Не називайте його повним Telegram чи надійною production версією до виконання відкритих пунктів у CLOUX_REQUIREMENTS_CHECKLIST.md.

Офіційні посилання: https://render.com/docs/web-services ; https://render.com/docs/configure-environment-variables ; https://render.com/docs/custom-domains .
