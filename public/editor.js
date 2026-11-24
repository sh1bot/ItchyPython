(() => {
  const root = document.querySelector('#pocket-preview');
  const get = selector => root.querySelector(selector);
  const editor = get('.editor');
  const rows = get('.rows');
  const draft = get('.draft-code');
  const choices = get('.choices');
  const nameKeys = get('.name-keys');
  const numbers = get('.numeric');
  const [undo, step] = ['back', 'step'].map(name => get('[data-action="' + name + '"]'));
  const lines = [];
  let submitted = 0;
  const templates = {
    'Set variable': {},
    'Expression': {prefix: ''},
    'if': {prefix: 'if ', suffix: ':', header: true},
    'print': {prefix: 'print', group: {open: '(', close: ')', empty: true, comma: true}},
    'pass': {prefix: 'pass', complete: true}
  };
  const operators = ['+', '−', '×', '÷', '//', '%', '**', '==', '!=', '<', '≤', '>', '≥', 'and', 'or'];
  const python = {'−': '-', '×': '*', '÷': '/', '≤': '<=', '≥': '>='};
  let depth = 0;
  let kind = '';
  let state;
  let history = [];
  const reserved = new Set('and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' '));
  let newName = null;
  let showNameDigits = false;

  function chooseVariable(name) {
    state = {source: name + ' = ', variable: name, groups: [], needsValue: true, number: ''};
    newName = null;
    draw('7');
  }

  function drawVariablePicker(variables) {
    if (newName === null) {
      for (const name of variables) addButton(choices, name, () => chooseVariable(name));
      addButton(choices, 'New variable', () => {
        newName = '';
        showNameDigits = false;
        draw('a');
      });
      return;
    }

    addButton(choices, 'Delete character', () => {
      newName = newName.slice(0, -1);
      draw(newName ? 'Delete character' : 'a');
    }, Boolean(newName));
    addButton(choices, showNameDigits ? 'Letters' : 'Digits', () => {
      showNameDigits = !showNameDigits;
      draw(showNameDigits ? '0' : 'a');
    }, Boolean(newName));
    nameKeys.hidden = false;
    for (const character of showNameDigits ? '0123456789_' : 'abcdefghijklmnopqrstuvwxyz_') {
      addButton(nameKeys, character, () => {
        newName += character;
        draw(character);
      }, !/^\d$/.test(character) || Boolean(newName));
    }
  }

  function change(edit, focusLabel) {
    history.push(structuredClone(state));
    edit();
    draw(focusLabel);
  }

  function begin(name) {
    kind = name;
    const template = templates[name];
    if (name !== 'Set variable') state = {source: template.prefix, groups: [], needsValue: !template.complete, number: ''};
    if (template.group) openGroup(template.group);
    draw();
    choices.firstElementChild?.focus();
  }

  function insert(text, needsValue) {
    state.source += text;
    state.number = '';
    state.needsValue = needsValue;
  }

  function openGroup(group) {
    insert(group.open, true);
    state.groups.push({...group, start: state.source.length});
  }

  function digit(value) {
    if (value === '.' && state.number.includes('.')) return;
    change(() => {
      const previous = state.number;
      const next = value === '.' && !previous ? '0.' :
        previous === '0' && value !== '.' ? value : previous + value;
      state.source = state.source.slice(0, state.source.length - previous.length) + next;
      state.number = next;
      state.needsValue = false;
    }, value);
  }

  function addButton(container, label, action, enabled = true) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.disabled = !enabled;
    button.onclick = action;
    container.append(button);
  }

  function sourceFor(items) {
    return items.map(line => '    '.repeat(line.depth) + line.source).join('\n');
  }

  function submitCompleted() {
    if (depth !== 0 || submitted === lines.length) return;
    const detail = {source: sourceFor(lines.slice(submitted)), line: submitted + 1};
    submitted = lines.length;
    editor.dispatchEvent(new CustomEvent('tapscript:submit', {detail}));
  }

  function outdent() {
    depth--;
    submitCompleted();
    draw();
  }

  function canUseName() {
    return Boolean(newName) && !reserved.has(newName);
  }

  function draw(focusLabel) {
    const last = lines.at(-1);
    const canOutdent = depth > 0 && !last?.header;
    const variables = [...new Set(lines.flatMap(line => line.variable ? [line.variable] : []))];
    const pickingVariable = kind === 'Set variable' && !state;
    const group = state?.groups.at(-1);
    const canClose = group && (!state.needsValue || (group.empty && group.start === state.source.length));
    undo.disabled = !kind;
    step.disabled = pickingVariable ? !canUseName() : kind ? (group ? !canClose : state.needsValue) : !canOutdent;
    const exit = depth === 1 ? 'submit block' : 'outdent';
    step.textContent = group ? 'Step out · ' + group.close :
      state ? 'Step out · next line' :
      pickingVariable && newName !== null ? 'Step out · use name' :
      !pickingVariable && canOutdent ? 'Step out · ' + exit : 'Step out';
    get('.depth').textContent = 'Level ' + depth + (last?.header ? ' · required after if' : depth ? ' · inside if' : ' · top level');
    get('.prompt').textContent = !kind ? 'Choose a statement' : pickingVariable ? (newName === null ? 'Choose a variable' : reserved.has(newName) ? 'Python reserves this name' : 'Name the variable') : state.needsValue ? 'Choose a value' : 'Continue the expression';
    editor.dataset.source = sourceFor(lines);
    get('#save').disabled = !lines.length || Boolean(last?.header || kind);
    rows.replaceChildren(...lines.map((line, index) => {
      const row = document.createElement('div');
      const number = document.createElement('span');
      const code = document.createElement('code');
      row.className = 'line';
      number.className = 'number';
      number.textContent = index + 1;
      code.className = 'line-code';
      code.style.setProperty('--depth', Math.min(line.depth, 6));
      code.textContent = line.source;
      row.append(number, code);
      return row;
    }));
    get('.draft .number').textContent = lines.length + 1;
    const caret = document.createElement('span');
    caret.className = 'slot';
    caret.textContent = pickingVariable && !newName ? 'variable' : state?.needsValue ? 'value' : '▏';
    const pending = state ? [...state.groups].reverse().map(item => item.close).join('') + (templates[kind].suffix || '') : '';
    draft.style.setProperty('--depth', Math.min(depth, 6));
    draft.replaceChildren(state?.source ?? newName ?? '', caret, pickingVariable ? ' = …' : pending);

    choices.replaceChildren();
    numbers.replaceChildren();
    nameKeys.replaceChildren();
    nameKeys.hidden = true;
    numbers.hidden = !state || kind === 'pass';
    if (!kind) {
      for (const name of Object.keys(templates)) addButton(choices, name, () => begin(name));
    } else if (pickingVariable) {
      drawVariablePicker(variables);
    } else if (kind !== 'pass') {
      if (state.needsValue) {
        for (const value of [...variables, 'True', 'False', 'None']) addButton(choices, value, () => change(() => insert(value, false), '+'));
        for (const [label, open, close, empty] of [['(', '(', ')', false], ['[', '[', ']', true], ['abs(', 'abs(', ')', false], ['len(', 'len(', ')', false], ['round(', 'round(', ')', false]]) {
          addButton(choices, label, () => change(() => openGroup({open, close, empty, comma: true}), 'score'));
        }
        addButton(choices, '−', () => change(() => insert('-', true), 'score'));
        const allowsNot = state.source === (state.variable ? state.variable + ' = ' : templates[kind].prefix) ||
          group?.start === state.source.length || /(?:and |or |not |, )$/.test(state.source);
        if (allowsNot) addButton(choices, 'not', () => change(() => insert('not ', true), 'score'));
      } else {
        for (const op of operators) addButton(choices, op, () => change(() => insert(' ' + (python[op] || op) + ' ', true), 'score'));
        addButton(choices, '[ index ]', () => change(() => openGroup({open: '[', close: ']'}), 'score'));
        if (group?.comma) addButton(choices, ',', () => change(() => insert(', ', true), 'score'));
      }
      if (!numbers.hidden) for (const value of ['7','8','9','4','5','6','1','2','3','0','.']) {
        addButton(numbers, value, () => digit(value), (state.needsValue || Boolean(state.number)) && (value !== '.' || !state.number.includes('.')));
      }
    }
    if (focusLabel) {
      [...choices.children, ...numbers.children, ...nameKeys.children].find(button => button.textContent === focusLabel && !button.disabled)?.focus();
    }
  }

  step.onclick = () => {
    if (!kind) {
      outdent();
      return;
    }
    if (!state) {
      chooseVariable(newName);
      return;
    }
    if (state.groups.length) {
      change(() => insert(state.groups.pop().close, false));
      return;
    }
    const template = templates[kind];
    lines.push({depth, source: state.source + (template.suffix || ''), header: template.header, variable: state.variable});
    if (template.header) depth++;
    kind = '';
    state = undefined;
    history = [];
    submitCompleted();
    draw();
    choices.firstElementChild.focus();
  };
  undo.onclick = () => {
    if (newName !== null) {
      newName = null;
    } else if (kind === 'Set variable' && state && !history.length) {
      state = undefined;
    } else {
      state = history.pop();
      if (!state) {
        kind = '';
      }
    }
    draw();
  };
  draw();
})();
