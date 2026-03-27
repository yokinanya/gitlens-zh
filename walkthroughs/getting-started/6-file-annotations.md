## 文件注解

<p align="center">
  <img src="../../images/docs/gutter-toggle.png" alt="切换文件注解" />
</p>

GitLens 可按需为整个文件添加注解，并直接显示在编辑器滚动条和装订线区域，帮助你更深入地理解代码历史。

### 文件归属

<p align="center">
  <img src="../../images/docs/gutter-blame.png" alt="装订线归属" />
</p>

启用后，GitLens 会扩展装订线区域，为文件的每一行显示提交和作者信息，效果类似当前行归属注释。装订线右侧还会显示一个年龄指示器（热力图），让你一眼看出各行最近一次被修改的时间。此外，还会在最左侧边缘和滚动条上高亮与当前行所属提交同时变更的其他行。

💡 在活动文件上，可使用 [GitLens: 切换文件归属](command:gitlens.toggleFileBlame) 命令来开启或关闭该注解。

⚙️ 可在 [文件归属设置](command:gitlens.showSettingsPage?%22blame%22 '跳转到装订线归属设置') 中进一步自定义。

### 文件更改

<p align="center">
  <img src="../../images/docs/gutter-changes.png" alt="装订线更改" />
</p>

启用后，装订线左侧会显示指示标记，用于突出显示本地未发布的更改，或最近一次提交中修改过的行。

💡 在活动文件上，可使用 [GitLens: 切换文件更改](command:gitlens.toggleFileChanges) 命令来开启或关闭该注解。

⚙️ 可在 [文件更改设置](command:gitlens.showSettingsPage?%22changes%22 '跳转到装订线更改设置') 中进一步自定义。

### 热力图

<p align="center">
  <img src="../../images/docs/gutter-heatmap.png" alt="装订线热力图" />
</p>

启用后，装订线左侧会显示一条带颜色的指示线，用于表示某一行相对于文件中其他更改而言有多“新”。颜色会根据最近一次更改的时间从暖橙色逐步过渡到冷蓝色；超过 90 天的更改会被视为较冷。

💡 在活动文件上，可使用 [GitLens: 切换文件热力图](command:gitlens.toggleFileHeatmap) 命令来开启或关闭该注解。

⚙️ 可在 [文件热力图设置](command:gitlens.showSettingsPage?%22heatmap%22 '跳转到装订线热力图设置') 中进一步自定义。
