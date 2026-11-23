importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js');

const runtime = loadPyodide();
let namespace;

onmessage = async ({data: {mode, source}}) => {
  try {
    const python = await runtime;
    python.setStdout({batched: text => postMessage({type: 'output', text})});
    python.setStderr({batched: text => postMessage({type: 'output', text})});
    if (mode === 'program' || !namespace) {
      namespace?.destroy();
      namespace = python.toPy({__name__: '__main__'});
    }
    if (mode === 'calculator') {
      const helpers = python.toPy({expression: source, scope: namespace});
      try {
        const result = python.runPython(
          'from math import sqrt, sin, cos, log, pi\nscope.update({k: v for k, v in globals().copy().items() if k in ("sqrt", "sin", "cos", "log", "pi") and k not in scope})\nscope["ans"] = eval(expression, scope)\nrepr(scope["ans"])',
          {globals: helpers}
        );
        postMessage({type: 'output', text: result});
      } finally {
        helpers.destroy();
      }
    } else {
      await python.runPythonAsync(source, {globals: namespace});
    }
    const keys = python.runPython('list', {globals: namespace});
    const list = keys(namespace);
    try {
      postMessage({type: 'done', names: list.toJs().filter(name => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(name))});
    } finally {
      list.destroy();
      keys.destroy();
    }
  } catch (error) {
    postMessage({type:'error', text: String(error)});
  }
};
