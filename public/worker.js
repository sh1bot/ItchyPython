importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js');

const runtime = loadPyodide();
let namespace;

onmessage = async ({data: {mode, source, line}}) => {
  let python;
  try {
    python = await runtime;
  } catch {
    postMessage({type: 'fatal', text: 'Python could not load. Check your connection. Queued entries were cleared.'});
    return;
  }

  python.setStdout({batched: text => postMessage({type: 'output', text})});
  python.setStderr({batched: text => postMessage({type: 'output', text})});
  namespace ??= python.toPy({__name__: '__main__'});
  const helpers = python.toPy({source, scope: namespace, line: line ?? 1});
  try {
    if (mode === 'calculator') {
      const result = python.runPython(
        'from math import sqrt, sin, cos, log, pi\nscope.update({k: v for k, v in globals().copy().items() if k in ("sqrt", "sin", "cos", "log", "pi") and k not in scope})\nscope["ans"] = eval(source, scope)\nrepr(scope["ans"])',
        {globals: helpers}
      );
      postMessage({type: 'output', text: result});
    } else {
      python.runPython(
        'exec(compile("\\n" * (line - 1) + source + "\\n", "session.py", "single"), scope)',
        {globals: helpers}
      );
    }
  } catch (error) {
    postMessage({type: 'error', text: String(error)});
  }

  try {
    const keys = python.runPython('list(scope)', {globals: helpers});
    try {
      postMessage({type: 'done', names: keys.toJs().filter(name => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && !name.startsWith('__'))});
    } finally {
      keys.destroy();
    }
  } finally {
    helpers.destroy();
  }
};
