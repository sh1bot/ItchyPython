const get = selector => document.querySelector(selector);
const editor = get('.editor');
const save = get('#save');
const status = get('#execution-status');
const stop = get('#stop');
const result = get('#result');
const projectStatus = get('#project-status');
const projectFile = get('#project-file');

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

function clearWorker() {
  worker?.terminate();
  worker = undefined;
  active = undefined;
  queue.length = 0;
  updateStatus();
}

function resetWorker(message) {
  clearWorker();
  appendOutput(message);
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
function download(contents, filename, type) {
  const url = URL.createObjectURL(new Blob([contents], {type}));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

save.onclick = () => download(editor.dataset.source + '\n', 'session.py', 'text/x-python');
get('#save-project').onclick = () => download(editor.dataset.project, 'session.tapscript', 'application/json');
get('#open-project').onclick = () => projectFile.click();
projectFile.onchange = async () => {
  const file = projectFile.files[0];
  projectFile.value = '';
  if (!file) return;
  try {
    if (file.size > 2_000_000) throw Error('Project is too large.');
    const lines = TapProject.decode(await file.text());
    if (editor.dataset.source && !confirm('Replace the current project with ' + file.name + '?')) return;
    clearWorker();
    result.textContent = '';
    result.hidden = true;
    editor.dispatchEvent(new CustomEvent('tapscript:open', {detail: lines}));
    projectStatus.textContent = 'Project opened. Restart & replay to initialize Python.';
  } catch (error) {
    projectStatus.textContent = 'Could not open project. ' + error.message;
  }
};

get('#replay').onclick = () => {
  editor.dispatchEvent(new CustomEvent('tapscript:replay'));
  clearWorker();
  result.textContent = '';
  result.hidden = true;
  projectStatus.textContent = '';
  queue.push({source: editor.dataset.source, line: 1, replay: true});
  executeNext();
};

if (editor.dataset.source) projectStatus.textContent = 'Project restored. Restart & replay to initialize Python.';
