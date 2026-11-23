const get = selector => document.querySelector(selector);
const editor = get('.editor');
const composer = get('.composer');
const calculator = get('#calculator');
const expression = get('.expression');
const keypad = get('.keypad');
const tray = get('.tray');
const run = get('#run');
const stop = get('#stop');
const result = get('#result');
const programTab = get('#program-tab');
const calculatorTab = get('#calculator-tab');

let mode = 'program';
let worker;
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
  run.textContent = calculating ? 'Evaluate' : 'Run program';
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
function setBusy(busy) {
  run.disabled = busy;
  stop.disabled = !busy;
}
function evaluate() {
  const requestedMode = mode;
  if (mode === 'program' && editor.dataset.incomplete === 'true') {
    output.program = 'Finish the current line before running.';
    showOutput();
    return;
  }

  output[mode] = 'Running…';
  showOutput();
  setBusy(true);
  worker ??= new Worker('worker.js');
  let received = false;
  worker.onmessage = ({data}) => {
    if (data.type === 'output' || data.type === 'error') {
      output[requestedMode] = (received ? output[requestedMode] + '\n' : '') + data.text;
      received = true;
    }
    if (data.type === 'done') {
      names = data.names;
      showTray();
      if (!received) output[requestedMode] = 'Finished.';
    }
    if (data.type !== 'output') setBusy(false);
    showOutput();
  };
  worker.onerror = () => {
    output[requestedMode] = 'Python could not load. Check your connection and try again.';
    worker.terminate();
    worker = undefined;
    names = [];
    showTray();
    setBusy(false);
    showOutput();
  };
  stop.onclick = () => {
    worker.terminate();
    worker = undefined;
    names = [];
    showTray();
    output[requestedMode] = 'Stopped. Python variables were cleared.';
    setBusy(false);
    showOutput();
  };
  worker.postMessage({mode, source: mode === 'program' ? editor.dataset.source : pieces.join('').trim() || '0'});
}
run.onclick = evaluate;
programTab.onclick = () => setMode('program');
calculatorTab.onclick = () => setMode('calculator');
showTray();
