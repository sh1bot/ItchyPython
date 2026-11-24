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
  const lines = TapProject.restore();
  let submitted = lines.length;
  let selected = null;
  let edit = null;
  let string = null;
  let uppercase = false;
  const templates = {
    'Set variable': {},
    'def': {header: true},
    'return': {prefix: 'return '},
    'Expression': {prefix: ''},
    'if': {prefix: 'if ', suffix: ':', header: true},
    'else': {prefix: 'else:', header: true, complete: true},
    'for': {suffix: ':', header: true},
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
    if (!edit && depth === 0 && name !== 'else') submitCompleted();
    kind = name;
    const template = templates[name];
    if (name === 'def' || name === 'for') {
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

  const sourceFor = TapProject.source;

  function blockEnd(index) {
    const level = lines[index].depth;
    let end = index + 1;
    while (end < lines.length && lines[end].depth > level) end++;
    return end;
  }

  function canElse() {
    if (edit || submitted === lines.length || lines.at(-1)?.depth <= depth) return false;
    return lines.findLast(line => line.depth <= depth)?.tokens[0] === 'if';
  }

  function clearDraft() {
    kind = '';
    state = undefined;
    newName = null;
    string = null;
    history = [];
  }

  function remember() {
    if (!lines.at(-1)?.header) TapProject.remember(lines);
  }

  function revised(previousFunction) {
    submitted = lines.length;
    selected = edit = null;
    depth = 0;
    clearDraft();
    remember();
    const definition = lines[previousFunction];
    if (previousFunction >= 0 && definition?.definition) {
      editor.dispatchEvent(new CustomEvent('tapscript:submit', {
        detail: {source: sourceFor(lines.slice(previousFunction, blockEnd(previousFunction))), line: previousFunction + 1}
      }));
    } else {
      get('#project-status').textContent = 'Source updated. Restart & replay to run it from the top.';
    }
    draw();
  }

  function containingFunction(index, level) {
    if (!level) return -1;
    const top = lines.findLastIndex((line, i) => i < index && line.depth === 0);
    return lines[top]?.definition ? top : -1;
  }

  function selectLine(index, token = null) {
    if (kind || depth !== 0) return;
    submitCompleted();
    selected = {index, token};
    draw();
    choices.firstElementChild?.focus();
  }

  function startEdit(type) {
    edit = {...selected, type};
    const line = lines[edit.index];
    depth = line.depth;
    if (type === 'value') begin('Expression');
    else draw();
  }

  function removeLine(index) {
    const line = lines[index];
    const owner = containingFunction(index, line.depth);
    let end = blockEnd(index);
    if (line.tokens[0] === 'if' && lines[end]?.tokens[0] === 'else' && lines[end].depth === line.depth) end = blockEnd(end);
    const parent = lines[index - 1];
    const filler = parent?.header && parent.depth + 1 === line.depth && (lines[end]?.depth ?? -1) < line.depth;
    lines.splice(index, end - index, ...(filler ? [{depth: line.depth, tokens: ['pass']}] : []));
    revised(owner);
  }

  function tokenType(line, index) {
    const value = line.tokens[index];
    const previous = line.tokens.slice(0, index).findLast(token => token.trim());
    const next = line.tokens.slice(index + 1).find(token => token.trim());
    if (line.definition || next === '=' || previous === 'for') return null;
    if (operators.some(op => (python[op] || op) === value) && line.tokens[index - 1] === ' ') {
      if (value !== '-' || line.tokens[index + 1] === ' ') return 'operator';
    }
    if (/^(?:\d|")/.test(value) || (value === 'True' || value === 'False' || value === 'None') ||
        (/^[a-z_]\w*$/.test(value) && !reserved.has(value) && next !== '(' && previous !== '.')) return 'value';
    return null;
  }

  function applyToken(tokens) {
    const {index, token} = edit;
    const line = lines[index];
    line.tokens.splice(token, 1, ...tokens);
    revised(containingFunction(index, line.depth));
  }

  function drawRevisionControls() {
    const {index, token} = selected;
    const line = lines[index];
    if (token !== null) {
      const type = tokenType(line, token);
      if (type === 'operator') {
        for (const op of operators) addButton(choices, op, () => {
          edit = {...selected};
          applyToken([python[op] || op]);
        });
      } else if (type) addButton(choices, 'Replace value', () => startEdit(type));
    }
    if (!line.header) addButton(choices, 'Replace line', () => startEdit('replace'));
    if (line.tokens[0] !== 'else') addButton(choices, 'Insert before', () => startEdit('insert'));
    addButton(choices, line.header ? 'Delete block' : 'Delete line', () => {
      if (confirm('Delete ' + (line.header ? 'this block?' : 'this line?'))) removeLine(index);
    });
    addButton(choices, 'Back to new line', () => {selected = null; draw();});
  }

  function cancelEdit() {
    edit = null;
    depth = 0;
    clearDraft();
    draw();
  }

  function submitCompleted() {
    if (depth !== 0 || submitted === lines.length) return;
    const detail = {source: sourceFor(lines.slice(submitted)), line: submitted + 1};
    submitted = lines.length;
    editor.dispatchEvent(new CustomEvent('tapscript:submit', {detail}));
  }

  function outdent() {
    if (depth) depth--;
    else submitCompleted();
    if (!canElse()) submitCompleted();
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
    return lines[containingFunction(edit?.index ?? lines.length, depth)];
  }

  function draw(focusLabel) {
    const last = lines.at(-1);
    const canOutdent = !edit && ((depth > 0 && !last?.header) || (depth === 0 && submitted < lines.length));
    const scope = enclosingFunction();
    const variables = [...new Set([
      ...(scope?.definition.parameters || []),
      ...lines.slice(0, edit?.index ?? lines.length).flatMap((line, index) => {
        const owner = lines[containingFunction(index, line.depth)];
        return owner && owner !== scope ? [] : [line.variable, line.loop].filter(Boolean);
      })
    ])];
    const functions = [...new Set(['abs', 'len', 'round', 'sum', 'min', 'max', 'range', ...lines.flatMap(line => line.definition ? [line.definition.name] : [])])];
    const defining = kind === 'def';
    const definition = state?.definition;
    const naming = newName !== null;
    const pickingVariable = kind === 'Set variable' && !state;
    const group = state?.groups?.at(-1);
    const canClose = group && (!state.needsValue || (group.empty && group.start === state.source.length));
    undo.disabled = !kind && !edit;
    const exit = depth <= 1 ? 'submit block' : 'outdent';
    let stepHint = '';
    if (string !== null) {
      stepHint = '"';
      step.disabled = false;
    } else if (naming) {
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
      stepHint = edit ? 'apply edit' : 'next line';
      step.disabled = state.needsValue;
    } else {
      stepHint = canOutdent ? exit : '';
      step.disabled = Boolean(selected) || !canOutdent;
    }
    step.textContent = 'Step out' + (stepHint ? ' · ' + stepHint : '');
    get('.depth').textContent = 'Level ' + depth + (last?.header ? ' · body required' :
      scope ? ' · inside ' + scope.definition.name : depth ? ' · inside if' : ' · top level');
    let prompt = selected && !edit ? 'Edit line ' + (selected.index + 1) :
      edit ? (edit.type === 'insert' ? 'Insert a statement' : 'Choose a replacement statement') : 'Choose a statement';
    if (string !== null) {
      prompt = 'Enter text';
    } else if (naming) {
      prompt = reserved.has(newName) ? 'Python reserves this name' :
        definition?.parameters.includes(newName) ? 'Parameter already exists' :
        defining ? (definition ? 'Name the parameter' : 'Name the function') : kind === 'for' ? 'Name the loop variable' : 'Name the variable';
    } else if (defining) {
      prompt = definition.closed ? 'Function signature ready' : 'Add parameters or step out';
    } else if (pickingVariable) {
      prompt = 'Choose a variable';
    } else if (state) {
      prompt = state.needsValue ? 'Choose a value' : 'Continue the expression';
    }
    get('.prompt').textContent = prompt;
    editor.dataset.source = sourceFor(lines);
    const canSave = lines.length > 0 && !last?.header && !kind;
    for (const id of ['#save', '#save-project']) get(id).disabled = !canSave;
    get('#replay').disabled = !canSave || depth !== 0;
    editor.dataset.project = canSave ? TapProject.encode(lines) : '';
    get('.draft').hidden = Boolean(selected && !edit);
    rows.replaceChildren(...lines.map((line, index) => {
      const row = document.createElement('div');
      const number = document.createElement('button');
      const code = document.createElement('code');
      row.className = selected?.index === index ? 'line selected' : 'line';
      number.type = 'button';
      number.setAttribute('aria-label', 'Edit line ' + (index + 1));
      number.disabled = Boolean(kind || depth !== 0 || edit);
      number.onclick = () => selectLine(index);
      number.className = 'number';
      number.textContent = index + 1;
      code.className = 'line-code';
      code.onclick = event => {
        if (event.target === code) selectLine(index);
      };
      code.style.setProperty('--depth', Math.min(line.depth, 6));
      line.tokens.forEach((token, tokenIndex) => {
        if (!tokenType(line, tokenIndex) || kind || depth !== 0 || edit) {
          code.append(token);
          return;
        }
        const control = document.createElement('button');
        control.type = 'button';
        control.textContent = token;
        control.setAttribute('aria-label', 'Edit ' + token + ' on line ' + (index + 1));
        control.setAttribute('aria-pressed', String(selected?.index === index && selected.token === tokenIndex));
        control.onclick = () => selectLine(index, tokenIndex);
        code.append(control);
      });
      row.append(number, code);
      return row;
    }));
    get('.draft .number').textContent = (edit?.index ?? lines.length) + 1;
    const caret = document.createElement('span');
    caret.className = 'slot';
    let prefix = state?.source ?? newName ?? '';
    let pending = '';
    if (string !== null) {
      prefix = state.source + JSON.stringify(string).slice(0, -1);
      pending = '"' + (state.groups.length ? [...state.groups].reverse().map(item => item.close).join('') : '') + (templates[kind].suffix || '');
    } else if (kind === 'for' && naming) {
      prefix = 'for ' + newName;
      pending = ' in …:';
    } else if (defining) {
      prefix = state?.source ?? 'def ';
      if (naming) prefix += (definition?.parameters.length ? ', ' : '') + newName;
      pending = definition?.closed ? '' : (definition ? '):' : '():');
    } else if (pickingVariable) {
      pending = ' = …';
    } else if (state) {
      pending = [...state.groups].reverse().map(item => item.close).join('') + (templates[kind].suffix || '');
    }
    caret.textContent = naming && !newName ? (defining ? (definition ? 'parameter' : 'name') : 'variable') :
      pickingVariable && !naming ? 'variable' : string === null && state?.needsValue ? 'value' : '▏';
    draft.style.setProperty('--depth', Math.min(depth, 6));
    draft.replaceChildren(prefix, caret, pending);

    choices.replaceChildren();
    numbers.replaceChildren();
    nameKeys.replaceChildren();
    nameKeys.hidden = true;
    numbers.hidden = !state || defining || string !== null || kind === 'pass' || kind === 'else';
    if (selected && !edit) {
      drawRevisionControls();
    } else if (string !== null) {
      addButton(choices, uppercase ? 'Lowercase' : 'Uppercase', () => {uppercase = !uppercase; draw();});
      addButton(choices, 'Delete character', () => {string = string.slice(0, -1); draw();}, Boolean(string));
      nameKeys.hidden = false;
      for (const key of (uppercase ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' : 'abcdefghijklmnopqrstuvwxyz') + '0123456789.,!?- ') {
        addButton(nameKeys, key === ' ' ? 'Space' : key, () => {
          string += key;
          draw(key === ' ' ? 'Space' : key);
        });
      }
    } else if (!kind) {
      for (const name of Object.keys(templates)) {
        if ((name === 'return' && !scope) || (name === 'def' && depth !== 0) ||
            (name === 'else' && !canElse()) || (edit && templates[name].header)) continue;
        addButton(choices, name, () => begin(name));
      }
    } else if (kind === 'for' && naming) {
      drawNameKeys();
    } else if (defining) {
      if (naming) drawNameKeys();
      else if (!definition.closed) addButton(choices, 'Add parameter', startName);
    } else if (pickingVariable) {
      drawVariablePicker(variables);
    } else if (kind !== 'pass' && kind !== 'else') {
      if (state.needsValue) {
        addButton(choices, 'Text', () => {string = ''; uppercase = false; draw('a');});
        for (const value of [...variables, 'True', 'False', 'None']) addButton(choices, value, () => change(() => insert(value, false), '+'));
        for (const [label, open, close, empty] of [['(', '(', ')', false], ['[', '[', ']', true], ...functions.map(name => [name + '(', name + '(', ')', true])]) {
          addButton(choices, label, () => change(() => openGroup({open, close, empty, comma: true}), 'score'));
        }
        addButton(choices, '−', () => change(() => insert('-', true), 'score'));
        const allowsNot = state.source === (state.variable ? state.variable + ' = ' : state.loop ? 'for ' + state.loop + ' in ' : templates[kind].prefix) ||
          group?.start === state.source.length || /(?:and |or |not |, )$/.test(state.source);
        if (allowsNot) addButton(choices, 'not', () => change(() => insert('not ', true), 'score'));
      } else {
        for (const op of operators) addButton(choices, op, () => change(() => insert(' ' + (python[op] || op) + ' ', true), 'score'));
        addButton(choices, '.append(', () => change(() => openGroup({open: '.append(', close: ')'}), '7'));
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
    if (string !== null) {
      const value = JSON.stringify(string);
      string = null;
      change(() => insert(value, false), '+');
      return;
    }
    if (kind === 'for' && newName !== null) {
      state = {source: 'for ' + newName + ' in ', loop: newName, groups: [], needsValue: true, number: ''};
      newName = null;
      draw('7');
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
    const tokens = TapProject.tokenize(state.source + (template.suffix || ''));
    const line = {depth, tokens, header: template.header, variable: state.variable, definition: state.definition, loop: state.loop};
    if (edit) {
      if (edit.type === 'value') {
        const atomic = tokens.length === 1 && tokenType({tokens}, 0) === 'value';
        applyToken(atomic ? tokens : ['(', ...tokens, ')']);
      } else {
        const {index, type} = edit;
        const owner = containingFunction(index, depth);
        lines.splice(index, type === 'replace' ? 1 : 0, line);
        revised(owner);
      }
      return;
    }
    lines.push(line);
    if (template.header) depth++;
    clearDraft();
    remember();
    if (!canElse()) submitCompleted();
    draw();
    choices.firstElementChild.focus();
  };
  undo.onclick = () => {
    if (string !== null) {
      string = null;
    } else if (edit && !kind) {
      cancelEdit();
      return;
    } else if (newName !== null) {
      newName = null;
      if ((kind === 'def' || kind === 'for') && !state) kind = '';
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
  editor.addEventListener('tapscript:replay', () => {
    submitted = lines.length;
    selected = edit = null;
    draw();
  });
  editor.addEventListener('tapscript:open', ({detail}) => {
    clearDraft();
    lines.splice(0, lines.length, ...detail);
    depth = 0;
    submitted = lines.length;
    selected = edit = null;
    remember();
    draw();
  });
  draw();
})();
