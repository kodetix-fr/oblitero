import { byId, icon, iconButton, sortable } from './dom.js';

// The list of files: one row for each run of pages that come from the same file. `onMove(ids, targetId, after)` follows
// the drag of a row; the buttons of a row call `onStep(id, step)`, `onToggle(id)`, `onOpen(id)` and `onRemove(id)`.
export function initFiles({ onMove, onStep, onToggle, onOpen, onRemove }) {
  const list = byId('file-list');
  const drag = { source: null, group: new Set() };

  function row(run, index, count) {
    const element = document.createElement('li');
    element.className = 'file';
    element.draggable = true;
    element.dataset.id = String(run.id);
    if (run.hidden) element.dataset.hidden = '';
    const grip = document.createElement('span');
    grip.className = 'grip';
    grip.append(icon('grip'));
    const number = document.createElement('span');
    number.className = 'num';
    number.textContent = String(index + 1);
    const thumb = document.createElement('span');
    thumb.className = 'file-thumb';
    thumb.append(run.thumb());
    const text = document.createElement('span');
    text.className = 'file-text';
    const name = Object.assign(document.createElement('span'), { className: 'name', textContent: run.name, title: run.name });
    const detail = Object.assign(document.createElement('span'), { className: 'pages', textContent: run.detail });
    text.append(name, detail);
    const actions = document.createElement('span');
    actions.className = 'file-actions';
    actions.append(
      iconButton('pages', `${run.name}: Open its pages`, () => onOpen(run.id)),
      iconButton(run.hidden ? 'eye' : 'eye-off', `${run.name}: ${run.hidden ? 'Show' : 'Hide'}`, () => onToggle(run.id)),
      iconButton('up', `${run.name}: Up`, () => onStep(run.id, -1), index === 0),
      iconButton('down', `${run.name}: Down`, () => onStep(run.id, 1), index === count - 1),
      iconButton('x', `${run.name}: Remove`, () => onRemove(run.id)),
    );
    element.append(grip, number, thumb, text, actions);
    return element;
  }

  sortable(list, { entry: '.file', idOf: (element) => Number(element.dataset.id), axis: 'y', state: drag, onMove });
  return { render: (runs) => list.replaceChildren(...runs.map((run, index) => row(run, index, runs.length))) };
}
