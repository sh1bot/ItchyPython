# TapScript

Touch-first Python editor and calculator. Program mode starts with a runnable sample. Complete the highlighted line using the tray, and use the indentation arrows to move among available levels. Calculator mode evaluates expressions and can reuse variables from the most recent program run. The previous calculator result is available as `ans`.

The prototype uses Pyodide from jsDelivr and needs an internet connection to load Python. Stop restarts the interpreter, clearing Python variables.

## Preview

Run `python3 -m http.server 8000 --directory public` and open http://localhost:8000.

## GitHub Pages

Push the repository to GitHub with `main` as its default branch. Under Settings → Pages, select **GitHub Actions** as the source, then run **Deploy TapScript** from Actions. The workflow publishes `public/`.
