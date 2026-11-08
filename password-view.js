import { askDialog, byId } from './dom.js';
import { t } from './i18n.js';

// Asks for the password of the file `name`; `wrong` says the last one did not open it. Resolves with the password, or null
// when the user cancels.
export function askPassword(name, wrong) {
  const dialog = byId('password-dialog');
  const input = /** @type {HTMLInputElement} */ (byId('password-input'));
  byId('password-file').textContent = t('password.file', { name });
  byId('password-error').textContent = wrong ? t('password.wrong') : '';
  input.value = '';
  return askDialog(dialog, 'password-cancel', (finish, signal) => {
    byId('password-form').addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        finish(input.value);
      },
      { signal },
    );
    queueMicrotask(() => input.focus());
  });
}
