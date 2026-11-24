importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js');

const runtime = loadPyodide();
let namespace;

onmessage = async ({data: {source, line}}) => {
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
    python.runPython(
      'exec(compile("\\n" * (line - 1) + source + "\\n", "session.py", "single"), scope)',
      {globals: helpers}
    );
  } catch (error) {
    postMessage({type: 'error', text: String(error)});
  } finally {
    helpers.destroy();
  }
  postMessage({type: 'done'});
};
