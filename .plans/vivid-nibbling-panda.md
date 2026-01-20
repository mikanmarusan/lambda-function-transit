# Plan: Add .plans directory to .gitignore

## Goal
`.plans` ディレクトリを `.gitignore` に追加するための GitHub Issue を作成する。

## Background
- Claude Code が作業用プランファイルを `.plans/` ディレクトリに保存する
- これらは一時的な作業ドキュメントであり、リポジトリにコミットすべきでない
- `.gitkeep` は残して空ディレクトリの追跡は可能にする

## Implementation

### Step 1: `/x-open-issue` スキルを使用して Issue を作成

Issue の内容:
- **Title**: Add .plans directory to .gitignore
- **Body**:
  - `.plans` ディレクトリは Claude Code の一時的な作業用ドキュメントを格納
  - リポジトリにコミットすべきでない
  - 追加する内容:
    ```
    # Plan files (temporary working documents)
    .plans/*
    !.plans/.gitkeep
    ```

## Verification
- Issue が正常に作成されることを確認
- Issue の内容が正しいことを確認
