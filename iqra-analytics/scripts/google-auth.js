/**
 * Запускается ОДИН РАЗ локально для получения Google refresh_token.
 * 
 * Инструкция:
 * 1. Создайте проект в Google Cloud Console → https://console.cloud.google.com
 * 2. APIs & Services → Enable APIs → включите "Google Ads API"
 * 3. APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
 *    Тип приложения: Desktop App → Скачайте JSON
 * 4. Вставьте CLIENT_ID и CLIENT_SECRET ниже
 * 5. Запустите: node scripts/google-auth.js
 * 6. Откройте ссылку в браузере, дайте разрешения, скопируйте code из URL
 * 7. Вставьте code в консоль → получите refresh_token
 * 8. Добавьте refresh_token в Railway env vars как GOOGLE_REFRESH_TOKEN
 */

const CLIENT_ID     = 'ВСТАВЬТЕ_CLIENT_ID';
const CLIENT_SECRET = 'ВСТАВЬТЕ_CLIENT_SECRET';
const REDIRECT_URI  = 'urn:ietf:wg:oauth:2.0:oob';
const SCOPE         = 'https://www.googleapis.com/auth/adwords';

const authUrl = `https://accounts.google.com/o/oauth2/auth`
  + `?client_id=${CLIENT_ID}`
  + `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
  + `&response_type=code`
  + `&scope=${encodeURIComponent(SCOPE)}`
  + `&access_type=offline`
  + `&prompt=consent`;

console.log('\n📋 Откройте эту ссылку в браузере:\n');
console.log(authUrl);
console.log('\nПосле авторизации скопируйте код из браузера и вставьте сюда:\n');

process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdin.on('data', async (code) => {
  code = code.trim();
  process.stdin.pause();

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri:  REDIRECT_URI,
        grant_type:    'authorization_code',
      }),
    });

    const data = await res.json();

    if (data.refresh_token) {
      console.log('\n✅ Успешно!\n');
      console.log('Добавьте в Railway env vars:');
      console.log(`GOOGLE_CLIENT_ID=${CLIENT_ID}`);
      console.log(`GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}`);
      console.log(`GOOGLE_REFRESH_TOKEN=${data.refresh_token}`);
    } else {
      console.error('\n❌ Ошибка:', JSON.stringify(data, null, 2));
    }
  } catch (e) {
    console.error('❌ Ошибка запроса:', e.message);
  }
});
