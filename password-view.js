import { askDialog, byId } from './dom.js';
import { t } from './i18n.js';

// Asks for the password of the file `name`; `wrong` says the last one did not open it. Resolves with the password, or null
// when the user cancels.
export function askPassword(name, wrong) {
  const dialog = byId('password-dialog');
  const input = /** @type {HTMLInputElement} */ (byId('password-input'));
  const show = byId('password-show');
  const box = /** @type {HTMLElement} */ (input.parentElement);
  byId('password-file').textContent = t('password.file', { name });
  byId('password-error').textContent = wrong ? t('password.wrong') : '';
  input.value = '';
  const reveal = (on) => {
    input.type = on ? 'text' : 'password';
    show.setAttribute('aria-pressed', String(on));
    show.querySelector('use')?.setAttribute('href', on ? '#i-eye-off' : '#i-eye');
  };
  reveal(false);
  box.classList.remove('shake');
  if (wrong) requestAnimationFrame(() => box.classList.add('shake'));
  return askDialog(dialog, 'password-cancel', (finish, signal) => {
    byId('password-form').addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        finish(input.value);
      },
      { signal },
    );
    show.addEventListener('click', () => reveal(input.type === 'password'), { signal });
    queueMicrotask(() => input.focus());
  });
}
