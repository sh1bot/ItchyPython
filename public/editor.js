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
    'def': {header: true},
    'return': {prefix: 'return '},
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
        startName();
      });
      return;
    }

    drawNameKeys();
  }

  function startName() {
    newName = '';
    showNameDigits = false;
    draw('a');
  }

  function drawNameKeys() {
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
    if (name === 'def') {
      startName();
      return;
    }
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
    return Boolean(newName) && !reserved.has(newName) &&
      !state?.definition?.parameters.includes(newName);
  }

  function acceptDefinitionName() {
    const name = newName;
    newName = null;
    if (!state) {
      state = {source: 'def ' + name + '(', definition: {name, parameters: [], closed: false}};
      draw('Add parameter');
      return;
    }
    change(() => {
      const parameters = state.definition.parameters;
      state.source += (parameters.length ? ', ' : '') + name;
      parameters.push(name);
    }, 'Add parameter');
  }

  function enclosingFunction() {
    if (!depth) return undefined;
    const topLevel = lines.findLast(line => line.depth === 0);
    return topLevel?.definition ? topLevel : undefined;
  }

  function draw(focusLabel) {
    const last = lines.at(-1);
    const canOutdent = depth > 0 && !last?.header;
    const scope = enclosingFunction();
    const variables = [...new Set([
      ...(scope?.definition.parameters || []),
      ...lines.flatMap(line => line.variable && (!line.scope || line.scope === scope) ? [line.variable] : [])
    ])];
    const functions = [...new Set(['abs', 'len', 'round', ...lines.flatMap(line => line.definition ? [line.definition.name] : [])])];
    const defining = kind === 'def';
    const definition = state?.definition;
    const naming = newName !== null;
    const pickingVariable = kind === 'Set variable' && !state;
    const group = state?.groups?.at(-1);
    const canClose = group && (!state.needsValue || (group.empty && group.start === state.source.length));
    undo.disabled = !kind;
    const exit = depth === 1 ? 'submit block' : 'outdent';
    let stepHint = '';
    if (naming) {
      stepHint = 'use name';
      step.disabled = !canUseName();
    } else if (defining) {
      stepHint = definition.closed ? 'next line' : ')';
      step.disabled = false;
    } else if (pickingVariable) {
      step.disabled = true;
    } else if (group) {
      stepHint = group.close;
      step.disabled = !canClose;
    } else if (state) {
      stepHint = 'next line';
      step.disabled = state.needsValue;
    } else {
      stepHint = canOutdent ? exit : '';
      step.disabled = !canOutdent;
    }
    step.textContent = 'Step out' + (stepHint ? ' · ' + stepHint : '');
    get('.depth').textContent = 'Level ' + depth + (last?.header ? ' · body required' :
      scope ? ' · inside ' + scope.definition.name : depth ? ' · inside if' : ' · top level');
    let prompt = 'Choose a statement';
    if (naming) {
      prompt = reserved.has(newName) ? 'Python reserves this name' :
        definition?.parameters.includes(newName) ? 'Parameter already exists' :
        defining ? (definition ? 'Name the parameter' : 'Name the function') : 'Name the variable';
    } else if (defining) {
      prompt = definition.closed ? 'Function signature ready' : 'Add parameters or step out';
    } else if (pickingVariable) {
      prompt = 'Choose a variable';
    } else if (state) {
      prompt = state.needsValue ? 'Choose a value' : 'Continue the expression';
    }
    get('.prompt').textContent = prompt;
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
    let prefix = state?.source ?? newName ?? '';
    let pending = '';
    if (defining) {
      prefix = state?.source ?? 'def ';
      if (naming) prefix += (definition?.parameters.length ? ', ' : '') + newName;
      pending = definition?.closed ? '' : (definition ? '):' : '():');
    } else if (pickingVariable) {
      pending = ' = …';
    } else if (state) {
      pending = [...state.groups].reverse().map(item => item.close).join('') + (templates[kind].suffix || '');
    }
    caret.textContent = naming && !newName ? (defining ? (definition ? 'parameter' : 'name') : 'variable') :
      pickingVariable && !naming ? 'variable' : state?.needsValue ? 'value' : '▏';
    draft.style.setProperty('--depth', Math.min(depth, 6));
    draft.replaceChildren(prefix, caret, pending);

    choices.replaceChildren();
    numbers.replaceChildren();
    nameKeys.replaceChildren();
    nameKeys.hidden = true;
    numbers.hidden = !state || defining || kind === 'pass';
    if (!kind) {
      for (const name of Object.keys(templates)) {
        if ((name === 'return' && !scope) || (name === 'def' && depth !== 0)) continue;
        addButton(choices, name, () => begin(name));
      }
    } else if (defining) {
      if (naming) drawNameKeys();
      else if (!definition.closed) addButton(choices, 'Add parameter', startName);
    } else if (pickingVariable) {
      drawVariablePicker(variables);
    } else if (kind !== 'pass') {
      if (state.needsValue) {
        for (const value of [...variables, 'True', 'False', 'None']) addButton(choices, value, () => change(() => insert(value, false), '+'));
        for (const [label, open, close, empty] of [['(', '(', ')', false], ['[', '[', ']', true], ...functions.map(name => [name + '(', name + '(', ')', true])]) {
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
    if (kind === 'def' && newName !== null) {
      acceptDefinitionName();
      return;
    }
    if (!state) {
      chooseVariable(newName);
      return;
    }
    if (state.definition && !state.definition.closed) {
      change(() => {
        state.source += '):';
        state.definition.closed = true;
      });
      return;
    }
    if (state.groups?.length) {
      change(() => insert(state.groups.pop().close, false));
      return;
    }
    const template = templates[kind];
    lines.push({
      depth, source: state.source + (template.suffix || ''), header: template.header,
      variable: state.variable, definition: state.definition,
      scope: state.variable ? enclosingFunction() : undefined
    });
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
      if (kind === 'def' && !state) kind = '';
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
