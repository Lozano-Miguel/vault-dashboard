import os
import shutil
import tempfile


def make_tree(test, files):
    """Create a temp dir holding {relative_path: content}; removed when `test` ends."""
    root = tempfile.mkdtemp(prefix="vault-test-")
    test.addCleanup(shutil.rmtree, root, ignore_errors=True)
    for rel, content in files.items():
        write(root, rel, content)
    return root


def write(root, rel, content):
    path = os.path.join(root, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
