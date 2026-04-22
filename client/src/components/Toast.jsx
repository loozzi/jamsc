import { useApp } from '../context/AppContext';

const ICONS = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };

export default function ToastContainer() {
  const { state } = useApp();
  return (
    <div id="toast-container">
      {state.toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.type}`}>
          <span className="toast-icon">{ICONS[toast.type] ?? ICONS.info}</span>
          <span className="toast-message">{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
