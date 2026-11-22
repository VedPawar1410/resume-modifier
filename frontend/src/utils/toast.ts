// A tiny toast store: any code can call toast(); the one <Toaster /> in App shows it.
// A module-level list of listeners instead of React context — there's only ever one Toaster.
export interface ToastItem {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

type Listener = (t: ToastItem) => void;
const listeners = new Set<Listener>();
let next = 1;

export function toast(text: string, action?: ToastItem["action"]) {
  const t = { id: next++, text, action };
  listeners.forEach((l) => l(t));
}

export function onToast(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
