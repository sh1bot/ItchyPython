const TapProject = (() => {
  const key = 'tapscript.project.v1';
  const tokenPattern = /"(?:\\.|[^"\\])*"|[a-zA-Z_][a-zA-Z_0-9]*|\d+(?:\.\d*)?|\*\*|\/\/|[<>=!]=|\s+|./gu;
  const tokenize = source => source.match(tokenPattern) || [];
  const source = lines => lines.map(line => '    '.repeat(line.depth) + line.tokens.join('')).join('\n');
  const identifier = value => typeof value === 'string' && /^[a-z_][a-z_0-9]*$/.test(value);

  function decode(text) {
    const project = JSON.parse(text);
    if (project.version !== 1 || !Array.isArray(project.lines) || project.lines.length > 3000) throw Error('Unsupported project.');
    const lines = project.lines.map((line, index) => {
      const previous = project.lines[index - 1];
      if (!line || !Array.isArray(line.tokens) || !line.tokens.length ||
          line.tokens.some(token => typeof token !== 'string' || /[\r\n]/.test(token)) ||
          !Number.isInteger(line.depth) || line.depth < 0 || line.depth > 80 ||
          (previous ? (previous.header ? line.depth !== previous.depth + 1 : line.depth > previous.depth) : line.depth !== 0)) {
        throw Error('Invalid statement structure.');
      }
      const {depth, tokens, header, variable, loop, definition} = line;
      if (definition && (!identifier(definition.name) || !Array.isArray(definition.parameters) ||
          !definition.parameters.every(identifier) || !header || depth !== 0)) throw Error('Invalid function signature.');
      if (variable !== undefined && !identifier(variable) || loop !== undefined && !identifier(loop)) throw Error('Invalid name.');
      return {depth, tokens, header: Boolean(header), variable, loop, definition};
    });
    if (lines.at(-1)?.header) throw Error('A block needs a body.');
    return lines;
  }

  function encode(lines) {
    return JSON.stringify({version: 1, lines}, null, 2);
  }

  function restore() {
    try { return decode(localStorage.getItem(key) || '{"version":1,"lines":[]}'); }
    catch { return []; }
  }

  function remember(lines) {
    try { localStorage.setItem(key, encode(lines)); }
    catch { /* Project downloads remain available. */ }
  }

  return {tokenize, source, decode, encode, restore, remember};
})();
