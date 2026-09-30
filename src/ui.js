// Gerenciador de UI amigável para mobile (Substitui alerts e prompts nativos)

class UIManager {
  constructor() {
    this.modalContainer = null;
    this.toastContainer = null;
    this.initContainers();
  }

  initContainers() {
    if (!document.getElementById('app-modal-root')) {
      this.modalContainer = document.createElement('div');
      this.modalContainer.id = 'app-modal-root';
      document.body.appendChild(this.modalContainer);
    } else {
      this.modalContainer = document.getElementById('app-modal-root');
    }

    if (!document.getElementById('app-toast-root')) {
      this.toastContainer = document.createElement('div');
      this.toastContainer.id = 'app-toast-root';
      this.toastContainer.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-11/12 max-w-sm pointer-events-none';
      document.body.appendChild(this.toastContainer);
    } else {
      this.toastContainer = document.getElementById('app-toast-root');
    }
  }

  toast(message, type = 'info') {
    const toast = document.createElement('div');
    const colors = {
      success: 'bg-emerald-600 text-white',
      error: 'bg-rose-600 text-white',
      warning: 'bg-amber-500 text-white',
      info: 'bg-gray-800 text-white'
    };

    toast.className = `${colors[type] || colors.info} px-4 py-3 rounded-xl shadow-lg text-xs font-semibold flex items-center justify-between pointer-events-auto animate-fade-in transition-all`;
    toast.innerHTML = `<span>${message}</span><span class="opacity-70 text-xs ml-2">✕</span>`;

    toast.onclick = () => toast.remove();
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('opacity-0', 'scale-95');
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }

  prompt({ title, message, placeholder = '', defaultValue = '', inputType = 'text', options = null }) {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in';

      const sheet = document.createElement('div');
      sheet.className = 'bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl animate-slide-up space-y-4';

      let inputHtml = '';
      if (options && Array.isArray(options)) {
        inputHtml = `
          <select id="modal-prompt-input" class="w-full p-3 border border-gray-300 rounded-xl text-sm font-medium bg-gray-50 focus:bg-white focus:ring-2 focus:ring-green-600 outline-none">
            ${options.map(o => `<option value="${o.value}" ${o.value === defaultValue ? 'selected' : ''}>${o.label}</option>`).join('')}
          </select>
        `;
      } else {
        inputHtml = `
          <input id="modal-prompt-input" type="${inputType}" placeholder="${placeholder}" value="${defaultValue}" class="w-full p-3 border border-gray-300 rounded-xl text-sm font-medium bg-gray-50 focus:bg-white focus:ring-2 focus:ring-green-600 outline-none">
        `;
      }

      sheet.innerHTML = `
        <div class="space-y-1">
          <h3 class="font-bold text-gray-900 text-base">${title}</h3>
          ${message ? `<p class="text-xs text-gray-500">${message}</p>` : ''}
        </div>
        ${inputHtml}
        <div class="flex gap-2 pt-2">
          <button id="modal-prompt-cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-xs active:bg-gray-100 transition">Cancelar</button>
          <button id="modal-prompt-confirm" class="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-xs shadow-md transition">Confirmar</button>
        </div>
      `;

      backdrop.appendChild(sheet);
      this.modalContainer.appendChild(backdrop);

      const input = sheet.querySelector('#modal-prompt-input');
      if (input && input.focus) input.focus();

      const close = (val) => {
        backdrop.remove();
        resolve(val);
      };

      sheet.querySelector('#modal-prompt-cancel').onclick = () => close(null);
      sheet.querySelector('#modal-prompt-confirm').onclick = () => {
        close(input.value);
      };

      backdrop.onclick = (e) => {
        if (e.target === backdrop) close(null);
      };
    });
  }

  confirm({ title, message, confirmText = 'Confirmar', cancelText = 'Cancelar', destructive = false }) {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in';

      const sheet = document.createElement('div');
      sheet.className = 'bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl animate-slide-up space-y-4';

      sheet.innerHTML = `
        <div class="space-y-1">
          <h3 class="font-bold text-gray-900 text-base">${title}</h3>
          <p class="text-xs text-gray-600 leading-relaxed">${message}</p>
        </div>
        <div class="flex gap-2 pt-2">
          <button id="modal-confirm-cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-xs active:bg-gray-100 transition">${cancelText}</button>
          <button id="modal-confirm-ok" class="flex-1 py-2.5 rounded-xl ${destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} text-white font-bold text-xs shadow-md transition">${confirmText}</button>
        </div>
      `;

      backdrop.appendChild(sheet);
      this.modalContainer.appendChild(backdrop);

      const close = (val) => {
        backdrop.remove();
        resolve(val);
      };

      sheet.querySelector('#modal-confirm-cancel').onclick = () => close(false);
      sheet.querySelector('#modal-confirm-ok').onclick = () => close(true);
      backdrop.onclick = (e) => {
        if (e.target === backdrop) close(false);
      };
    });
  }
}

export const ui = new UIManager();
