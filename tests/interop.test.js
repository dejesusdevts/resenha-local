/**
 * Teste de interoperabilidade: simula dois "dispositivos" fazendo
 * handshake X3DH e trocando mensagens via Double Ratchet — incluindo
 * mensagens fora de ordem entre eles.
 */
const crypto = require('crypto');
const { initRatchetAsInitiator, initRatchetAsResponder, ratchetEncrypt, ratchetDecrypt } =
  require('../dist-test/crypto/doubleRatchet.js');

// ---- Primitivas fake comutativas ------------------------------------
function sha256(...b) { const h = crypto.createHash('sha256'); b.forEach(x => h.update(Buffer.from(x))); return h.digest(); }
let id = 0;
function genKeyPair() { const v = Buffer.from([++id]); return { publicKey: v, privateKey: v }; }
function fakeDh(sk, pk) {
  const s = [Buffer.from(sk), Buffer.from(pk)].sort(Buffer.compare);
  return sha256('dh', s[0], s[1]);
}
function fakeHkdf(salt, ikm, info, len) {
  const out = sha256(salt, ikm, info);
  return out.slice(0, Math.min(len, out.length));
}
function fakeHkdfExpand(prk, info, len) { return sha256(prk, info).slice(0, len); }
function enc(mk, pt, ad) {
  const ks = sha256(mk, Buffer.from('ks')).slice(0, pt.length);
  const ct = Buffer.alloc(pt.length);
  for (let i = 0; i < pt.length; i++) ct[i] = pt[i] ^ ks[i];
  const tag = sha256(mk, ad, pt).slice(0, 16);
  return Buffer.concat([ct, tag]);
}
function dec(mk, ct, ad) {
  const body = ct.slice(0, ct.length - 16);
  const tag = ct.slice(ct.length - 16);
  const ks = sha256(mk, Buffer.from('ks')).slice(0, body.length);
  const pt = Buffer.alloc(body.length);
  for (let i = 0; i < body.length; i++) pt[i] = body[i] ^ ks[i];
  const expected = sha256(mk, ad, pt).slice(0, 16);
  if (!expected.equals(tag)) throw new Error('AUTH_FAILED');
  return pt;
}
function toBase64(b) { return Buffer.from(b).toString('base64'); }
const prims = {
  generateDHKeyPair: genKeyPair,
  dh: fakeDh,
  kdfRootKey: (rk, dh) => {
    const o = fakeHkdf(rk, dh, Buffer.from('resenha-local:ratchet-root'), 64);
    return { rootKey: o.slice(0, 32), chainKey: o.slice(32) };
  },
  kdfChainKey: (ck) => ({
    nextChainKey: fakeHkdfExpand(ck, Buffer.from('resenha-local:chain'), 32),
    messageKey: fakeHkdfExpand(ck, Buffer.from('resenha-local:message'), 32),
  }),
  encrypt: enc,
  decrypt: dec,
  toBase64,
};

// ---- Handshake X3DH fake -------------------------------------------
function compareBytes(a, b) { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }
function x3dh(selfId, selfEph, peerIdPub, peerEphPub) {
  const isI = compareBytes(selfId.publicKey, peerIdPub) < 0;
  let d1, d2;
  if (isI) { d1 = fakeDh(selfId.privateKey, peerEphPub); d2 = fakeDh(selfEph.privateKey, peerIdPub); }
  else { d1 = fakeDh(selfEph.privateKey, peerIdPub); d2 = fakeDh(selfId.privateKey, peerEphPub); }
  const d3 = fakeDh(selfEph.privateKey, peerEphPub);
  const ikm = Buffer.concat([d1, d2, d3]);
  return {
    sharedSecret: fakeHkdf(Buffer.alloc(32), ikm, Buffer.from('resenha-local:x3dh-root'), 32),
    isInitiator: isI,
  };
}

let fail = 0;
function check(n, c) { console.log(c ? 'OK  ' : 'FAIL', n); if (!c) fail++; }
function text(s) { return Buffer.from(s, 'utf8'); }
function str(b) { return Buffer.from(b).toString('utf8'); }

// Setup de dois dispositivos
const aliceId = genKeyPair(), aliceEph = genKeyPair();
const bobId = genKeyPair(), bobEph = genKeyPair();

const aRes = x3dh(aliceId, aliceEph, bobId.publicKey, bobEph.publicKey);
const bRes = x3dh(bobId, bobEph, aliceId.publicKey, aliceEph.publicKey);

check('SK idêntico nos dois lados', Buffer.from(aRes.sharedSecret).equals(Buffer.from(bRes.sharedSecret)));
check('papéis opostos', aRes.isInitiator !== bRes.isInitiator);

let alice = aRes.isInitiator
  ? initRatchetAsInitiator(aRes.sharedSecret, aliceEph, bobEph.publicKey, prims)
  : initRatchetAsResponder(aRes.sharedSecret, aliceEph);
let bob = bRes.isInitiator
  ? initRatchetAsInitiator(bRes.sharedSecret, bobEph, aliceEph.publicKey, prims)
  : initRatchetAsResponder(bRes.sharedSecret, bobEph);

// Alice → Bob, em ordem
const m1 = ratchetEncrypt(alice, text('msg 1'), prims);
const m2 = ratchetEncrypt(alice, text('msg 2'), prims);
check('Bob decifra msg 1', str(ratchetDecrypt(bob, m1, prims)) === 'msg 1');
check('Bob decifra msg 2', str(ratchetDecrypt(bob, m2, prims)) === 'msg 2');

// Bob responde
const r1 = ratchetEncrypt(bob, text('resposta 1'), prims);
check('Alice decifra resposta 1', str(ratchetDecrypt(alice, r1, prims)) === 'resposta 1');

// Alice envia 3 mensagens; Bob recebe fora de ordem (3, 1, 2)
const o1 = ratchetEncrypt(alice, text('fora a'), prims);
const o2 = ratchetEncrypt(alice, text('fora b'), prims);
const o3 = ratchetEncrypt(alice, text('fora c'), prims);
check('fora de ordem: Bob recebe c primeiro', str(ratchetDecrypt(bob, o3, prims)) === 'fora c');
check('fora de ordem: Bob recebe a depois', str(ratchetDecrypt(bob, o1, prims)) === 'fora a');
check('fora de ordem: Bob recebe b por último', str(ratchetDecrypt(bob, o2, prims)) === 'fora b');
check('sem chaves puladas residuais', bob.skippedKeys.size === 0);

// Adulteração: ciphertext corrompido
const mAdult = ratchetEncrypt(alice, text('adulterada'), prims);
mAdult.ciphertext[0] ^= 0xff;
let rejected = false;
try { ratchetDecrypt(bob, mAdult, prims); } catch { rejected = true; }
check('adulteração rejeitada', rejected);

// Muitos ciclos de ida e volta (garante que o DH ratchet avança corretamente)
for (let i = 0; i < 10; i++) {
  const fromAlice = ratchetEncrypt(alice, text(`ciclo ${i} alice`), prims);
  check(`ciclo ${i} alice→bob`, str(ratchetDecrypt(bob, fromAlice, prims)) === `ciclo ${i} alice`);
  const fromBob = ratchetEncrypt(bob, text(`ciclo ${i} bob`), prims);
  check(`ciclo ${i} bob→alice`, str(ratchetDecrypt(alice, fromBob, prims)) === `ciclo ${i} bob`);
}

console.log(fail === 0 ? '\nTODOS OS TESTES PASSARAM' : '\n' + fail + ' TESTE(S) FALHARAM');
process.exit(fail === 0 ? 0 : 1);
