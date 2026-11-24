# TapScript

Touch-first Python session and calculator. Build statements and expressions with the tray and number pad. Step out closes the current group, submits a complete top-level statement, or outdents a blank line. A block runs when you outdent to the top level. Python variables carry across entries and are available in Calculator. Download the session source with **Save .py**. The previous calculator result is available as `ans`.

The prototype uses Pyodide from jsDelivr and needs an internet connection to load Python. Stop restarts the interpreter, clearing Python variables.

## Preview

Run `python3 -m http.server 8000 --directory public` and open http://localhost:8000.

## GitHub Pages

Push the repository to GitHub with `main` as its default branch. Under Settings → Pages, select **GitHub Actions** as the source, then run **Deploy static content to Pages** from Actions. The workflow publishes `public/`.
