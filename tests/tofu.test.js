/**
 * Testes de TOFU (Trust On First Use) — executados em Node, sem depender
 * de SQLite ou bindings nativos. A lógica de decisão em trust.ts é
 * testada aqui com um repositório em memória como substituto.
 */
const crypto = require('crypto');

function computeIdentityFingerprint(publicKeyBytes) {
  return crypto.createHash('sha256').update(Buffer.from(publicKeyBytes)).digest('hex');
}

// Repositório em memória (substitui identitiesRepository)
class InMemoryIdentityRepo {
  constructor() { this.byUsername = {}; this.log = []; }

  getIdentityByUsername(username) {
    return this.byUsername[username] || null;
  }

  trustIdentity(identity) {
    this.byUsername[identity.username] = { ...identity };
  }

  replaceTrustedIdentity(oldPk, newIdentity) {
    for (const [username, id] of Object.entries(this.byUsername)) {
      if (id.publicKey === oldPk) {
        delete this.byUsername[username];
        break;
      }
    }
    this.trustIdentity(newIdentity);
  }

  logIdentityChange(entry) {
    this.log.push({ ...entry });
  }

  resolveIdentityChange(id, resolution) {
    const entry = this.log.find(e => e.id === id);
    if (entry) entry.resolution = resolution;
  }

  getLog() { return this.log; }
}

// Reimplementação da lógica de trust.ts usando o repo em memória
function evaluateTrust(repo, username, publicKeyBytes) {
  const publicKey = Buffer.from(publicKeyBytes).toString('base64');
  const fingerprint = computeIdentityFingerprint(publicKeyBytes);
  const known = repo.getIdentityByUsername(username);

  if (!known) {
    repo.trustIdentity({ publicKey, fingerprint, username, trustedSince: Date.now(), lastSeenAt: Date.now() });
    return { outcome: 'trusted_new', fingerprint };
  }

  if (known.publicKey === publicKey) {
    repo.trustIdentity({ ...known, lastSeenAt: Date.now() });
    return { outcome: 'trusted_known', fingerprint };
  }

  const logId = `idchange-${Date.now()}-${username}`;
  repo.logIdentityChange({
    id: logId,
    publicKeyOld: known.publicKey,
    publicKeyNew: publicKey,
    fingerprintOld: known.fingerprint,
    fingerprintNew: fingerprint,
    username,
    detectedAt: Date.now(),
    resolution: 'pending',
  });

  return { outcome: 'identity_changed', oldFingerprint: known.fingerprint, newFingerprint: fingerprint, logId };
}

let failures = 0;
function check(name, cond) {
  console.log(cond ? 'OK  ' : 'FAIL', name);
  if (!cond) failures++;
}

function key(n) { return new Uint8Array([n, n, n, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, n]); }

// --- Teste 1: primeiro contato → trusted_new --------------------------
{
  const repo = new InMemoryIdentityRepo();
  const r = evaluateTrust(repo, 'alice', key(1));
  check('primeiro contato: trusted_new', r.outcome === 'trusted_new');
  check('identidade salva no repo', repo.getIdentityByUsername('alice') !== null);
  check('fingerprint correto', r.fingerprint === computeIdentityFingerprint(key(1)));
}

// --- Teste 2: reconexão com mesma chave → trusted_known ---------------
{
  const repo = new InMemoryIdentityRepo();
  evaluateTrust(repo, 'alice', key(1));
  const r = evaluateTrust(repo, 'alice', key(1));
  check('reconexão mesma chave: trusted_known', r.outcome === 'trusted_known');
  check('sem entrada no log de mudanças', repo.getLog().length === 0);
}

// --- Teste 3: chave mudou → identity_changed --------------------------
{
  const repo = new InMemoryIdentityRepo();
  evaluateTrust(repo, 'alice', key(1));
  const r = evaluateTrust(repo, 'alice', key(2));
  check('chave mudou: identity_changed', r.outcome === 'identity_changed');
  check('old fingerprint correto', r.oldFingerprint === computeIdentityFingerprint(key(1)));
  check('new fingerprint correto', r.newFingerprint === computeIdentityFingerprint(key(2)));
  check('entrada no log com resolution=pending', repo.getLog()[0]?.resolution === 'pending');
  check('identidade antiga AINDA confiada (não substituída automaticamente)',
    repo.getIdentityByUsername('alice')?.publicKey === Buffer.from(key(1)).toString('base64'));
}

// --- Teste 4: aceitar mudança de identidade ---------------------------
{
  const repo = new InMemoryIdentityRepo();
  evaluateTrust(repo, 'alice', key(1));
  const r = evaluateTrust(repo, 'alice', key(2));
  // Simula acceptIdentityChange
  repo.replaceTrustedIdentity(repo.getIdentityByUsername('alice').publicKey, {
    publicKey: Buffer.from(key(2)).toString('base64'),
    fingerprint: computeIdentityFingerprint(key(2)),
    username: 'alice',
    trustedSince: Date.now(),
    lastSeenAt: Date.now(),
  });
  repo.resolveIdentityChange(r.logId, 'accepted');

  check('após aceite: nova chave é a confiada',
    repo.getIdentityByUsername('alice')?.publicKey === Buffer.from(key(2)).toString('base64'));
  check('log preservado com resolution=accepted', repo.getLog()[0]?.resolution === 'accepted');
  check('log não foi apagado', repo.getLog().length === 1);
}

// --- Teste 5: rejeitar mudança de identidade --------------------------
{
  const repo = new InMemoryIdentityRepo();
  evaluateTrust(repo, 'alice', key(1));
  const r = evaluateTrust(repo, 'alice', key(2));
  repo.resolveIdentityChange(r.logId, 'rejected');

  check('após rejeição: chave original permanece confiada',
    repo.getIdentityByUsername('alice')?.publicKey === Buffer.from(key(1)).toString('base64'));
  check('log preservado com resolution=rejected', repo.getLog()[0]?.resolution === 'rejected');
}

// --- Teste 6: múltiplos contatos independentes -------------------------
{
  const repo = new InMemoryIdentityRepo();
  evaluateTrust(repo, 'alice', key(1));
  evaluateTrust(repo, 'bob', key(2));
  evaluateTrust(repo, 'carol', key(3));
  const rA = evaluateTrust(repo, 'alice', key(1));
  const rB = evaluateTrust(repo, 'bob', key(99)); // bob mudou de chave
  const rC = evaluateTrust(repo, 'carol', key(3));
  check('alice: trusted_known', rA.outcome === 'trusted_known');
  check('bob: identity_changed não contamina alice e carol', rB.outcome === 'identity_changed');
  check('carol: trusted_known (não afetada pela mudança de bob)', rC.outcome === 'trusted_known');
  check('apenas 1 entrada no log (só bob)', repo.getLog().length === 1);
}

console.log(failures === 0 ? '\nTODOS OS TESTES PASSARAM' : '\n' + failures + ' TESTE(S) FALHARAM');
process.exit(failures === 0 ? 0 : 1);
