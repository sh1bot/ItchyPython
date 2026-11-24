# TapScript

TapScript is a touch-first Python session. Build statements and expressions with the tray and number pad. **Step out** closes the current group, submits a top-level statement, or outdents a block. When an `if` can take an `else`, choose `else` or step out again to submit it.

Tap a line number to insert, replace, or delete a statement. Tap a value or operator to replace it in place. Editing a function body submits the revised definition. **Restart & replay** executes the entire source in a fresh interpreter.

Completed code is remembered in this browser. Use **Save project** and **Open project** to move editable work between devices, or **Save .py** to export ordinary Python. Opening a project leaves execution to you.

The prototype uses Pyodide from jsDelivr and needs an internet connection to load Python. Stop restarts the interpreter, clearing Python variables.

## Preview

Run `python3 -m http.server 8000 --directory public` and open http://localhost:8000.

## GitHub Pages

Push the repository to GitHub with `main` as its default branch. Under Settings → Pages, select **GitHub Actions** as the source, then run **Deploy static content to Pages** from Actions. The workflow publishes `public/`.
