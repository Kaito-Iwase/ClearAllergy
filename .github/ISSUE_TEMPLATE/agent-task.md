---
name: Evidence-backed engineering task
about: 安全に選別できる問題・根拠・受け入れ条件を記録する
title: ""
labels: ""
assignees: ""
---

## Problem / Impact

## Evidence

対象base SHA（比較基点のコミット識別子）、ファイル・関数名、観察または再現結果。未確認事項は`UNKNOWN`（未確認）。

## Cause / Candidate solutions / Decision

変更しない案も比較する。製品判断は未決のまま残す。

## Acceptance Criteria

- [ ] 判定可能な結果

## Affected Area / Scope

影響範囲・編集範囲・確認のみの範囲と、対象外の作業（non-goals）。

## Dependencies / Blockers / Ownership

Issueリンク、対象環境、担当者、重複PR・進行中作業。

## Risks / Human approval

安全・意味・認可モデル・DB・契約・課金等の判断が必要か。

## Verification Plan

実在するコマンド、RED/GREEN（修正前の失敗と修正後の成功）、mock（代用品）と実DB・実ブラウザの区別、必要な副作用の許可、rollback（変更を戻す手順）。

Issue作成だけではReady（着手可能）にしない。[自律開発手順](https://github.com/Kaito-Iwase/ClearAllergy/blob/main/docs/agentic-development.md)に従い、GitHubの最新情報でassessment（Issueの評価記録）を作る。
