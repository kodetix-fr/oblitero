// Saves `blob` as a file of the user; `onSaved` is called once it is on its way.
export function download(blob, filename, onSaved) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  onSaved?.();
}
