# Acceptance Criteria Patterns

The issue-opening skill reads this file before it writes acceptance criteria, so a criterion shape recorded here is applied to every issue authored afterwards.

- Trigger: a criterion demanding that a repository-wide text search return zero matches, with the files that may legitimately still match named as a frozen exclusion list -> Rule: scope the search to the paths the change is allowed to edit instead of enumerating exclusions, because records added between issue creation and the fix can introduce matches that the list cannot anticipate and that the fix is forbidden to touch, leaving a criterion no correct implementation can satisfy.
