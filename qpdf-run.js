const vendored = (name) => new URL(`vendor/qpdf/${name}`, import.meta.url).href;

/** @typedef {(options: { locateFile: () => string }) => Promise<{ FS: { writeFile: (path: string, data: Uint8Array) => void, readFile: (path: string) => Uint8Array }, callMain: (args: string[]) => number }>} QpdfFactory */

/** @type {Promise<QpdfFactory> | null} */
let loading = null;

// qpdf.js is a classic script that defines the global Module: it is added to the page the first time qpdf is needed.
function loadFactory() {
  loading ??= new Promise((resolve, reject) => {
    const script = Object.assign(document.createElement('script'), { src: vendored('qpdf.js') });
    script.addEventListener('load', () => resolve(/** @type {{ Module: QpdfFactory }} */ (/** @type {unknown} */ (globalThis)).Module));
    script.addEventListener('error', () => reject(new Error('qpdf could not be loaded')));
    document.head.append(script);
  });
  return loading;
}

// Runs qpdf once on `bytes`, in a fresh instance, with `args` before the input and output files. Resolves with the exit code
// (0 done, 3 done with warnings, 2 failed), the output (null when there is none) and what qpdf said.
export async function runQpdf(bytes, args, factory = null) {
  const create = factory ?? (await loadFactory());
  const messages = [];
  // This build ignores the print options and binds console.log and console.error when an instance is made, synchronously:
  // the console is lent to it for that call, so that what qpdf says comes here.
  const { log, error: report } = console;
  console.log = console.error = (...parts) => messages.push(parts.join(' '));
  let made;
  try {
    made = create({ locateFile: () => vendored('qpdf.wasm') });
  } finally {
    Object.assign(console, { log, error: report });
  }
  const qpdf = await made;
  qpdf.FS.writeFile('/in.pdf', bytes);
  let code;
  try {
    code = qpdf.callMain([...args, '/in.pdf', '/out.pdf']);
  } catch (error) {
    code = /** @type {{ status?: number } | null} */ (error)?.status ?? 2;
  }
  let output = null;
  if (code === 0 || code === 3) {
    try {
      output = qpdf.FS.readFile('/out.pdf');
    } catch {
      output = null;
    }
  }
  return { code, output, messages };
}

export class WrongPassword extends Error {}

// A copy of an encrypted PDF without its encryption. Throws WrongPassword when `password` does not open it.
export async function decryptPdf(bytes, password, factory) {
  const { output, messages } = await runQpdf(bytes, [`--password=${password}`, '--decrypt'], factory);
  if (!output) throw messages.some((text) => /invalid password/i.test(text)) ? new WrongPassword() : new Error(messages.at(-1) ?? 'qpdf failed');
  return output;
}

// The PDF encrypted with AES-256: `password` opens it, a random owner password guards the permissions.
export async function protectPdf(bytes, password, { print, copy }, factory) {
  const owner = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const { output, messages } = await runQpdf(bytes, [
    '--encrypt',
    `--user-password=${password}`,
    `--owner-password=${owner}`,
    '--bits=256',
    `--print=${print ? 'full' : 'none'}`,
    `--extract=${copy ? 'y' : 'n'}`,
    '--',
  ], factory);
  if (!output) throw new Error(messages.at(-1) ?? 'qpdf failed');
  return output;
}
