# TapScript

Touch-first Python session. Build statements and expressions with the tray and number pad. Step out closes the current group, submits a complete top-level statement, or outdents a blank line. A block runs when you outdent to the top level. Python variables carry across entries. Choose **Expression** at the start of a line to evaluate it and show its value. Download the session source with **Save .py**.

The prototype uses Pyodide from jsDelivr and needs an internet connection to load Python. Stop restarts the interpreter, clearing Python variables.

## Preview

Run `python3 -m http.server 8000 --directory public` and open http://localhost:8000.

## GitHub Pages

Push the repository to GitHub with `main` as its default branch. Under Settings → Pages, select **GitHub Actions** as the source, then run **Deploy static content to Pages** from Actions. The workflow publishes `public/`.
