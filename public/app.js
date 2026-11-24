const get = selector => document.querySelector(selector);
const editor = get('.editor');
const save = get('#save');
const status = get('#execution-status');
const stop = get('#stop');
const result = get('#result');

let worker;
let active;
const queue = [];

function updateStatus() {
  stop.disabled = !active;
  status.textContent = active ? (queue.length ? 'Running · ' + queue.length + ' queued' : 'Running…') : '';
}

function appendOutput(text) {
  result.textContent += (result.textContent ? '\n' : '') + text;
  result.hidden = false;
}

function resetWorker(message) {
  worker?.terminate();
  worker = undefined;
  active = undefined;
  queue.length = 0;
  appendOutput(message);
  updateStatus();
}

function executeNext() {
  if (active || !queue.length) return;
  active = queue.shift();
  updateStatus();
  try {
    if (!worker) {
      worker = new Worker('worker.js');
      worker.onmessage = ({data}) => {
        if (data.type === 'fatal') {
          resetWorker(data.text);
          return;
        }
        if (data.type === 'output' || data.type === 'error') appendOutput(data.text);
        if (data.type !== 'done') return;
        active = undefined;
        updateStatus();
        executeNext();
      };
      worker.onerror = () => resetWorker('Python could not load or stopped unexpectedly. Queued entries were cleared.');
    }
    worker.postMessage(active);
  } catch {
    resetWorker('Python could not start. Queued entries were cleared.');
  }
}

editor.addEventListener('tapscript:submit', ({detail}) => {
  queue.push(detail);
  executeNext();
  updateStatus();
});
stop.onclick = () => resetWorker('Stopped. Python variables and queued entries were cleared. Your source is still available to save.');
save.onclick = () => {
  const url = URL.createObjectURL(new Blob([editor.dataset.source + '\n'], {type: 'text/x-python'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'session.py';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
