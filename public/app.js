const get = selector => document.querySelector(selector);
const editor = get('.editor');
const composer = get('.composer');
const calculator = get('#calculator');
const expression = get('.expression');
const keypad = get('.keypad');
const tray = get('.tray');
const save = get('#save');
const status = get('#execution-status');
const run = get('#run');
const stop = get('#stop');
const result = get('#result');
const programTab = get('#program-tab');
const calculatorTab = get('#calculator-tab');

let mode = 'program';
let worker;
let active;
const queue = [];
let pieces = [];
let names = [];
const output = {program: '', calculator: ''};

function showOutput() {
  result.textContent = output[mode];
  result.hidden = !output[mode];
}

function setMode(next) {
  mode = next;
  const calculating = next === 'calculator';
  programTab.setAttribute('aria-pressed', String(!calculating));
  calculatorTab.setAttribute('aria-pressed', String(calculating));
  editor.hidden = composer.hidden = calculating;
  calculator.hidden = !calculating;
  run.hidden = !calculating;
  save.hidden = calculating;
  showOutput();
}

function button(container, label, action) {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.onclick = action;
  container.append(element);
}

function showExpression() {
  expression.textContent = pieces.join('') || '0';
}

function insert(value) {
  pieces.push(value);
  showExpression();
}

for (const key of ['7','8','9','÷','4','5','6','×','1','2','3','−','0','.','(',')','+','**',',','⌫']) {
  const operators = {'÷':' / ', '×':' * ', '−':' - ', '+':' + ', '**':' ** '};
  button(keypad, key, () => {
    if (key === '⌫') {
      pieces.pop();
      showExpression();
    } else {
      insert(operators[key] ?? key);
    }
  });
}
function showTray() {
  tray.replaceChildren();
  button(tray, 'Clear', () => {pieces = []; showExpression();});
  for (const name of [...new Set(['ans','pi','abs','round','sqrt','sin',...names])]) {
    const isFunction = ['abs','round','sqrt','sin','cos','log'].includes(name);
    button(tray, isFunction ? name + '(' : name, () => insert(isFunction ? name + '(' : name));
  }
}
function updateStatus() {
  run.disabled = Boolean(active);
  stop.disabled = !active;
  status.textContent = active ? (queue.length ? 'Running · ' + queue.length + ' queued' : 'Running…') : '';
}

function appendOutput(target, text) {
  output[target] += (output[target] ? '\n' : '') + text;
  showOutput();
}

function resetWorker(message) {
  const target = active.mode;
  worker?.terminate();
  worker = undefined;
  active = undefined;
  queue.length = 0;
  names = [];
  showTray();
  appendOutput(target, message);
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
        if (data.type === 'output' || data.type === 'error') appendOutput(active.mode, data.text);
        if (data.type !== 'done') return;
        names = data.names;
        showTray();
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
  queue.push({mode: 'program', ...detail});
  executeNext();
  updateStatus();
});
run.onclick = () => {
  output.calculator = '';
  showOutput();
  queue.push({mode: 'calculator', source: pieces.join('').trim() || '0'});
  executeNext();
};
stop.onclick = () => resetWorker('Stopped. Python variables and queued entries were cleared. Your source is still available to save.');
save.onclick = () => {
  const url = URL.createObjectURL(new Blob([editor.dataset.source + '\n'], {type: 'text/x-python'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'session.py';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
programTab.onclick = () => setMode('program');
calculatorTab.onclick = () => setMode('calculator');
showTray();
