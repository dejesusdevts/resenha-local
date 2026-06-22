const crypto = require('crypto');
const {
  initRatchetAsInitiator,
  initRatchetAsResponder,
  ratchetEncrypt,
  ratchetDecrypt,
} = require('../dist-test/crypto/doubleRatchet.js');

// --- Primitivas FALSAS, determinísticas, só para validar o ALGORITMO ---
let keyCounter = 0;
function generateDHKeyPair() {
  const id = Buffer.from([++keyCounter]);
  return { publicKey: id, privateKey: id }; // pk==sk só pra simplificar o fake
}
function sha256(...bufs) {
  const h = crypto.createHash('sha256');
  for (const b of bufs) h.update(b);
  return h.digest();
}
function dh(sk, pk) {
  // comutativo de propósito: dh(skA,pkB) === dh(skB,pkA), simulando X25519 real
  const sorted = [Buffer.from(sk), Buffer.from(pk)].sort(Buffer.compare);
  return sha256(Buffer.from('dh'), sorted[0], sorted[1]);
}
function kdfRootKey(rootKey, dhOutput) {
  const out = sha256(Buffer.from('root'), rootKey, dhOutput);
  const out2 = sha256(Buffer.from('chain'), rootKey, dhOutput);
  return { rootKey: out, chainKey: out2 };
}
function kdfChainKey(chainKey) {
  return {
    nextChainKey: sha256(Buffer.from('next'), chainKey),
    messageKey: sha256(Buffer.from('msg'), chainKey),
  };
}
function keystream(key, length) {
  const out = Buffer.alloc(length);
  let block = 0;
  let offset = 0;
  while (offset < length) {
    const chunk = sha256(key, Buffer.from([block++]));
    const n = Math.min(chunk.length, length - offset);
    chunk.copy(out, offset, 0, n);
    offset += n;
  }
  return out;
}
function encrypt(messageKey, plaintext, ad) {
  const ks = keystream(messageKey, plaintext.length);
  const ct = Buffer.alloc(plaintext.length);
  for (let i = 0; i < plaintext.length; i++) ct[i] = plaintext[i] ^ ks[i];
  const tag = sha256(messageKey, ad, plaintext).slice(0, 16);
  return Buffer.concat([ct, tag]);
}
function decrypt(messageKey, combined, ad) {
  const ct = combined.slice(0, combined.length - 16);
  const tag = combined.slice(combined.length - 16);
  const ks = keystream(messageKey, ct.length);
  const pt = Buffer.alloc(ct.length);
  for (let i = 0; i < ct.length; i++) pt[i] = ct[i] ^ ks[i];
  const expectedTag = sha256(messageKey, ad, pt).slice(0, 16);
  if (!expectedTag.equals(tag)) throw new Error('AUTH_FAILED');
  return pt;
}
function toBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

const primitives = { generateDHKeyPair, dh, kdfRootKey, kdfChainKey, encrypt, decrypt, toBase64 };

let failures = 0;
function check(name, cond) {
  console.log(cond ? 'OK  ' : 'FAIL', name);
  if (!cond) failures++;
}
function text(s) { return Buffer.from(s, 'utf8'); }
function str(b) { return Buffer.from(b).toString('utf8'); }

// --- Setup: handshake simulado (X3DH já teria rodado antes disto) ------
const sharedSecret = sha256(Buffer.from('shared-secret-de-teste'));
const aliceEphemeral = generateDHKeyPair();
const bobEphemeral = generateDHKeyPair();

let alice = initRatchetAsInitiator(sharedSecret, aliceEphemeral, bobEphemeral.publicKey, primitives);
let bob = initRatchetAsResponder(sharedSecret, bobEphemeral);

// --- Teste 1: mensagens em ordem, Alice -> Bob -------------------------
const m1 = ratchetEncrypt(alice, text('oi bob'), primitives);
const m2 = ratchetEncrypt(alice, text('tudo bem?'), primitives);
const m3 = ratchetEncrypt(alice, text('terceira mensagem'), primitives);

check('decifra m1 em ordem', str(ratchetDecrypt(bob, m1, primitives)) === 'oi bob');
check('decifra m2 em ordem', str(ratchetDecrypt(bob, m2, primitives)) === 'tudo bem?');
check('decifra m3 em ordem', str(ratchetDecrypt(bob, m3, primitives)) === 'terceira mensagem');
check('nenhuma chave pulada sobrou (tudo em ordem)', bob.skippedKeys.size === 0);

// --- Teste 2: Bob responde, ida-e-volta várias vezes (passos de DH ratchet) ---
const r1 = ratchetEncrypt(bob, text('oi alice'), primitives);
check('Alice decifra resposta de Bob', str(ratchetDecrypt(alice, r1, primitives)) === 'oi alice');

for (let round = 0; round < 5; round++) {
  const fromAlice = ratchetEncrypt(alice, text('rodada ' + round + ' de alice'), primitives);
  check('Bob decifra rodada ' + round, str(ratchetDecrypt(bob, fromAlice, primitives)) === 'rodada ' + round + ' de alice');
  const fromBob = ratchetEncrypt(bob, text('rodada ' + round + ' de bob'), primitives);
  check('Alice decifra rodada ' + round, str(ratchetDecrypt(alice, fromBob, primitives)) === 'rodada ' + round + ' de bob');
}

// --- Teste 3: mensagens fora de ordem (chaves puladas) ------------------
let alice2 = initRatchetAsInitiator(sharedSecret, generateDHKeyPair(), bobEphemeral.publicKey, primitives);
let bob2 = initRatchetAsResponder(sharedSecret, bobEphemeral);
// recria bob2 do zero pra não conflitar com o estado usado acima
bob2 = initRatchetAsResponder(sharedSecret, { publicKey: bobEphemeral.publicKey, privateKey: bobEphemeral.privateKey });
alice2 = initRatchetAsInitiator(sharedSecret, generateDHKeyPair(), bobEphemeral.publicKey, primitives);

const o1 = ratchetEncrypt(alice2, text('um'), primitives);
const o2 = ratchetEncrypt(alice2, text('dois'), primitives);
const o3 = ratchetEncrypt(alice2, text('tres'), primitives);

// Bob recebe fora de ordem: 3, 1, 2
check('fora de ordem: msg 3 chega primeiro', str(ratchetDecrypt(bob2, o3, primitives)) === 'tres');
check('duas chaves ficaram puladas (msg 1 e 2)', bob2.skippedKeys.size === 2);
check('fora de ordem: msg 1 chega depois', str(ratchetDecrypt(bob2, o1, primitives)) === 'um');
check('uma chave pulada restante (msg 2)', bob2.skippedKeys.size === 1);
check('fora de ordem: msg 2 chega por último', str(ratchetDecrypt(bob2, o2, primitives)) === 'dois');
check('nenhuma chave pulada sobrou no final', bob2.skippedKeys.size === 0);

// --- Teste 4: autenticação rejeita adulteração --------------------------
let aliceT = initRatchetAsInitiator(sharedSecret, generateDHKeyPair(), bobEphemeral.publicKey, primitives);
let bobT = initRatchetAsResponder(sharedSecret, { publicKey: bobEphemeral.publicKey, privateKey: bobEphemeral.privateKey });
const tampered = ratchetEncrypt(aliceT, text('mensagem original'), primitives);
tampered.ciphertext[0] ^= 0xff; // adultera um byte do ciphertext
let authRejected = false;
try {
  ratchetDecrypt(bobT, tampered, primitives);
} catch (e) {
  authRejected = e.message === 'AUTH_FAILED';
}
check('ciphertext adulterado é rejeitado', authRejected);

// --- Teste 5: limite de chaves puladas (eviction) -----------------------
let aliceL = initRatchetAsInitiator(sharedSecret, generateDHKeyPair(), bobEphemeral.publicKey, primitives);
let bobL = initRatchetAsResponder(sharedSecret, { publicKey: bobEphemeral.publicKey, privateKey: bobEphemeral.privateKey });
const messages = [];
for (let i = 0; i < 150; i++) {
  messages.push(ratchetEncrypt(aliceL, text('msg ' + i), primitives));
}
// Bob só recebe a última (150ª) mensagem diretamente -> pula 149 chaves
const lastMsg = messages[messages.length - 1];
str(ratchetDecrypt(bobL, lastMsg, primitives));
check('limite de chaves puladas é respeitado (cap=100)', bobL.skippedKeys.size === 100);

console.log(failures === 0 ? '\nTODOS OS TESTES PASSARAM' : '\n' + failures + ' TESTE(S) FALHARAM');
process.exit(failures === 0 ? 0 : 1);
