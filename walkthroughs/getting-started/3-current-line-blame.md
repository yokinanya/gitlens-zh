## 当前行归属 []()

<p align="center">
  <img src="../../images/docs/current-line-blame.png" alt="当前行归属" />
</p>

GitLens 会在当前行末尾添加低干扰的 Git 归属注释，显示当前行最近一次提交的作者、日期和消息。

💡 可使用 [GitLens: 切换行归属](command:gitlens.toggleLineBlame) 命令来开启或关闭该注解。

⚙️ 可在 [当前行注解设置](command:gitlens.showSettingsPage?%22current-line%22 '跳转到当前行归属设置') 中进一步自定义。

## 悬停提示

<p align="center">
  <img src="../../images/docs/hovers-current-line.png" alt="当前行归属悬停提示" />
</p>

将鼠标悬停在这些归属注释上会显示更多详情和可探索的链接。`details` 悬停提示会提供提交详情和相关操作；`changes` 悬停提示则显示当前行与前一个版本之间的 diff 及相关操作。

⚙️ 可在 [悬停提示设置](command:gitlens.showSettingsPage?%22hovers%22 '跳转到悬停提示设置') 中进一步自定义。

## 状态栏归属

<p align="center">
  <img src="../../images/docs/status-bar.png" alt="状态栏归属" />
</p>

GitLens 也会在状态栏中显示当前行的 Git 归属信息。

⚙️ 可在 [状态栏设置](command:gitlens.showSettingsPage?%22status-bar%22 '跳转到状态栏设置') 中进一步自定义。
