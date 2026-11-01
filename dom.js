export const byId = (id) => /** @type {any} */ (document.getElementById(id));

export function button(label, ariaLabel, onClick, disabled = false) {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.setAttribute('aria-label', ariaLabel);
  element.disabled = disabled;
  element.addEventListener('click', onClick);
  return element;
}
