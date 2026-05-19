"""Track M — 手动 / 导入持仓同步 (holdings_sync).

设计: docs/plans/proposals/holdings-sync-track-m-tech-design.md
执行: docs/plans/active/holdings-sync-track-m-runbook.md / -tasks.md

模块边界: 经 app.features.portfolio.db.reconcile_portfolio 写 user_portfolios，
从不直接 ALTER / 自开 EF 连接（geba 遵守）。Track C (SnapTrade) 不在本模块。
"""
