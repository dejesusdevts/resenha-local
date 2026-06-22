const crypto = require('crypto');
function sha256(...bufs) { const h = crypto.createHash('sha256'); for (const b of bufs) h.update(b); return h.digest(); }
function fakeDh(sk, pk) {
  const sorted = [Buffer.from(sk), Buffer.from(pk)].sort(Buffer.compare);
  return sha256(Buffer.from('dh'), sorted[0], sorted[1]);
}
function compareBytes(a, b) { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }
function fakeHkdf(salt, ikm, info) { return sha256(salt, ikm, info); }

function computeX3dh(selfIdentity, selfEphemeral, peerIdentityPub, peerEphemeralPub) {
  const isInitiator = compareBytes(selfIdentity.publicKey, peerIdentityPub) < 0;
  let dh1, dh2, dh3;
  if (isInitiator) {
    dh1 = fakeDh(selfIdentity.privateKey, peerEphemeralPub);
    dh2 = fakeDh(selfEphemeral.privateKey, peerIdentityPub);
  } else {
    dh1 = fakeDh(selfEphemeral.privateKey, peerIdentityPub);
    dh2 = fakeDh(selfIdentity.privateKey, peerEphemeralPub);
  }
  dh3 = fakeDh(selfEphemeral.privateKey, peerEphemeralPub);
  const ikm = Buffer.concat([dh1, dh2, dh3]);
  return { sharedSecret: fakeHkdf(Buffer.alloc(32), ikm, Buffer.from('resenha-local:x3dh-root')), isInitiator };
}

let failures = 0;
function check(name, cond) { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) failures++; }

let nextId = 1;
function key(byteValue) { const b = Buffer.from([byteValue]); return { publicKey: b, privateKey: b }; }

// Caso A: chave de identidade de "alicePerson" é numericamente MENOR (ela vira "A")
{
  const alicePerson = { identity: key(10), ephemeral: key(20) };
  const bobPerson = { identity: key(50), ephemeral: key(60) };
  const a = computeX3dh(alicePerson.identity, alicePerson.ephemeral, bobPerson.identity.publicKey, bobPerson.ephemeral.publicKey);
  const b = computeX3dh(bobPerson.identity, bobPerson.ephemeral, alicePerson.identity.publicKey, alicePerson.ephemeral.publicKey);
  check('identidade menor -> isInitiator=true', a.isInitiator === true);
  check('identidade maior -> isInitiator=false', b.isInitiator === false);
  check('SK bate quando a pessoa de identidade MENOR é quem chama primeiro', a.sharedSecret.equals(b.sharedSecret));
}

// Caso B: inverso — quem calcula primeiro tem a identidade MAIOR
{
  const bobPerson = { identity: key(90), ephemeral: key(91) };
  const alicePerson = { identity: key(5), ephemeral: key(6) };
  const b = computeX3dh(bobPerson.identity, bobPerson.ephemeral, alicePerson.identity.publicKey, alicePerson.ephemeral.publicKey);
  const a = computeX3dh(alicePerson.identity, alicePerson.ephemeral, bobPerson.identity.publicKey, bobPerson.ephemeral.publicKey);
  check('identidade maior calculando primeiro -> isInitiator=false', b.isInitiator === false);
  check('identidade menor calculando depois -> isInitiator=true', a.isInitiator === true);
  check('SK bate quando a pessoa de identidade MAIOR é quem chama primeiro', a.sharedSecret.equals(b.sharedSecret));
}

console.log(failures === 0 ? '\nTODOS OS TESTES PASSARAM (os dois ramos do isInitiator)' : '\n' + failures + ' TESTE(S) FALHARAM');
process.exit(failures === 0 ? 0 : 1);
