## Git CodeLens

<p align="center">
  <img src="../../images/docs/code-lens.png" alt="Git CodeLens" />
</p>

GitLens 会在文件顶部和代码块上方添加 Git 作者信息 CodeLens。`最近更改` CodeLens 会显示对应代码块或文件最近一次提交的作者和日期；`作者` CodeLens 会显示对应代码块或文件的作者数量，以及最主要的作者（如果不止一位）。

点击 CodeLens 会执行一个[可自定义](command:gitlens.showSettingsPage?%22code-lens%22 '跳转到 Git CodeLens 设置')的操作。例如，`最近更改` CodeLens 会打开一个快速选择菜单，展示该提交对应文件的详情和操作；而 `作者` CodeLens 则会切换整文件的 Git 归属注释。

💡 可使用 [GitLens: 切换 Git CodeLens](command:gitlens.toggleCodeLens) 命令来开启或关闭 CodeLens。

⚙️ 可在 [Git CodeLens 设置](command:gitlens.showSettingsPage?%22code-lens%22 '跳转到 Git CodeLens 设置') 中进一步自定义。
