import test from 'node:test';
import assert from 'node:assert/strict';
import { WrongPassword, decryptPdf, protectPdf } from './qpdf-run.js';

// A stand-in for the qpdf build: it binds the console when an instance is made, as the build does, and `run` plays qpdf.
function fake(run) {
  const calls = [];
  const factory = async () => {
    const say = console.error.bind(console);
    const files = new Map();
    return {
      FS: { writeFile: (name, data) => files.set(name, data), readFile: (name) => files.get(name) },
      callMain: (args) => {
        calls.push(args);
        return run(args, say, files);
      },
    };
  };
  return { factory, calls };
}

test('a wrong password is told apart from another failure, and what qpdf says stays off the console', async () => {
  const errors = [];
  const original = console.error;
  console.error = (text) => errors.push(text);
  try {
    const refused = fake((args, say) => (say('this.program: /in.pdf: invalid password'), 2));
    await assert.rejects(decryptPdf(new Uint8Array([1]), 'nope', refused.factory), WrongPassword);
    const broken = fake((args, say) => (say('this.program: /in.pdf: not a PDF file'), 2));
    await assert.rejects(decryptPdf(new Uint8Array([1]), '', broken.factory), (error) => !(error instanceof WrongPassword) && /not a PDF/.test(String(error)));
    assert.deepEqual(refused.calls[0].slice(0, 2), ['--password=nope', '--decrypt']);
  } finally {
    console.error = original;
  }
  assert.deepEqual(errors, []);
});

test('a protection asks AES-256 with the permissions and a random owner password', async () => {
  const writes = (args, say, files) => {
    files.set('/out.pdf', new Uint8Array([9]));
    return 0;
  };
  const { factory, calls } = fake(writes);
  await protectPdf(new Uint8Array([1]), 'p@ss --word', { print: true, copy: false }, factory);
  const args = calls[0];
  assert.ok(args.includes('--user-password=p@ss --word') && args.includes('--bits=256') && args.includes('--print=full') && args.includes('--extract=n'));
  assert.match(args.find((arg) => arg.startsWith('--owner-password=')), /^--owner-password=[0-9a-f]{32}$/);
});
