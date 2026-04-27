const http = require('http');

async function testForgotPassword() {
  const email = 'john@test.com';
  console.log(`Triggering forgot password for ${email}...`);
  
  const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/auth/forgot-password',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  };

  const req = http.request(options, (res) => {
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
      try {
        const parsedData = JSON.parse(rawData);
        console.log('Response Status:', res.statusCode);
        console.log('Response Body:', parsedData);
      } catch (e) {
        console.error('Parsing failed:', e.message);
      }
    });
  });

  req.on('error', (e) => {
    console.error('Request failed:', e.message);
  });

  req.write(JSON.stringify({ email }));
  req.end();
}

testForgotPassword();
