import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, live, newPlayer, player, setup, wait } from './helpers.js';

let t;
before(async () => {
  t = await setup();
});
after(() => t.close());

test('API errors come back in the language the page asks for', async () => {
  const c = client(t.app);
  const login = (lang) =>
    c.request(
      'POST',
      '/api/session',
      { username: 'nobody', password: 'x' },
      { 'accept-language': lang },
    );
  assert.equal((await login('fr')).body.error, "Nom d'utilisateur ou mot de passe incorrect.");
  assert.equal(
    (await login('es-MX,es;q=0.9')).body.error,
    'Nombre de usuario o contraseña incorrectos.',
  );
  assert.equal((await login('de')).body.error, 'Wrong username or password.');

  // Field messages too
  const signup = await c.request('POST', '/api/account', newPlayer({ username: 'x' }), {
    'accept-language': 'fr',
  });
  assert.equal(signup.body.error, 'Vérifie les champs en surbrillance.');
  assert.equal(signup.body.fields.username, "Les noms d'utilisateur font de 3 à 20 caractères.");
});

test('live errors are translated, names included', async () => {
  const [ann, bob] = await Promise.all([player(t.app), player(t.app)]);
  const b = await live(t.app, bob);
  const ws = await t.app.injectWS('/ws?lang=es', { headers: { cookie: ann.cookie } });
  const errors = [];
  ws.on('message', (d) => {
    const msg = JSON.parse(d);
    if (msg.t === 'error') errors.push(msg.message);
  });
  ws.send(JSON.stringify({ t: 'invite', to: bob.user.id }));
  ws.send(JSON.stringify({ t: 'invite', to: bob.user.id }));
  ws.send(JSON.stringify({ t: 'react', match: 'nope', emoji: 'x' }));
  while (errors.length < 2) await wait(20);
  assert.deepEqual(errors.sort(), [
    'Reacción desconocida.',
    `Ya invitaste a ${bob.user.username}.`,
  ]);
  ws.terminate();
  await b.close();
});

test('the confirmation email is in the language of the sign-up', async () => {
  const details = newPlayer();
  await client(t.app).request('POST', '/api/account', details, { 'accept-language': 'es' });
  const [mail] = await t.app.ctx.mailer.outbox(details.email);
  assert.equal(mail.subject, 'Confirma tu correo para Tres en raya a lápiz');
  assert.ok(mail.text.startsWith(`Hola, ${details.username}:`));
});
