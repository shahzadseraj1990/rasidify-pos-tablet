import { useAlertStore, AlertButton, AlertKind } from '../store/alertStore';

// Drop-in replacement for Alert.alert(title, message?, buttons?) that shows
// the app's own alert dialog. The icon is picked from the content unless
// `kind` is passed: failures → error, successes → success, anything with a
// destructive/confirm choice → warning, otherwise info.
export function appAlert(title: string, message?: string, buttons?: AlertButton[], kind?: AlertKind) {
  const list = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }];
  useAlertStore.getState().show({ title, message, buttons: list, kind: kind ?? guessKind(title, list) });
}

function guessKind(title: string, buttons: AlertButton[]): AlertKind {
  const t = title.toLowerCase();
  if (/fail|error|invalid|not found|not added|could not|unable|denied|short/.test(t)) return 'error';
  if (/success|added|saved|held|complete|printed|done/.test(t)) return 'success';
  if (buttons.some(b => b.style === 'destructive') || buttons.length > 1) return 'warning';
  return 'info';
}
