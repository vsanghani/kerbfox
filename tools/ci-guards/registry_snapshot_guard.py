"""Disabled placeholder for the registry snapshot guard.

Step 1 does not check attribution fields or licence snapshot hashes.
A later step owns that: owner and title rules, edition_label, source_line,
licence_snapshot_paths, and SHA256 of the files named by the licence manifest.
This module does not read the repository.
"""


def main() -> int:
    print("registry snapshot guard: disabled placeholder, not executed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
